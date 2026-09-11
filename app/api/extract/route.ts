import type { NextRequest } from "next/server";
import { inflateRawSync } from "node:zlib";

/**
 * Ekstraksi teks dokumen (.docx / .txt / .md) untuk fitur lampiran chat.
 *
 * DOCX adalah arsip ZIP yang berisi word/document.xml. Route ini membaca ZIP
 * secara mandiri (tanpa dependensi eksternal) memakai node:zlib, lalu mengubah
 * XML Word menjadi teks terstruktur (heading markdown, list, tabel) agar
 * struktur dokumen tetap terbaca oleh model LLM.
 *
 * Output: { ok, name, ext, bytes, chars, lines, title, headings, text }
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_BYTES = 120 * 1024 * 1024; // 120 MB
const MAX_HEADINGS = 1000;
const DOCX_MIME =
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

type ExtractedHeading = { level: number; text: string; offset: number };

// ─────────────────────────────────────────────────────────────
// Pembaca ZIP minimal (central directory + raw inflate)
// ─────────────────────────────────────────────────────────────

function findEocd(b: Buffer): number {
  const min = Math.max(0, b.length - 65557);
  for (let i = b.length - 22; i >= min; i--) {
    if (b.readUInt32LE(i) === 0x06054b50) return i;
  }
  return -1;
}

function readZipEntry(b: Buffer, wanted: string): Buffer | null {
  const eocd = findEocd(b);
  if (eocd < 0) {
    throw new Error("Bukan file DOCX/ZIP yang valid (end of central directory tidak ditemukan).");
  }
  const count = b.readUInt16LE(eocd + 10);
  let off = b.readUInt32LE(eocd + 16);
  for (let i = 0; i < count; i++) {
    if (off + 46 > b.length || b.readUInt32LE(off) !== 0x02014b50) break;
    const method = b.readUInt16LE(off + 10);
    const compSize = b.readUInt32LE(off + 20);
    const nameLen = b.readUInt16LE(off + 28);
    const extraLen = b.readUInt16LE(off + 30);
    const commentLen = b.readUInt16LE(off + 32);
    const localOff = b.readUInt32LE(off + 42);
    const name = b.toString("utf8", off + 46, off + 46 + nameLen);
    if (name === wanted) {
      if (compSize === 0xffffffff || localOff === 0xffffffff) {
        throw new Error("File DOCX memakai ZIP64 yang belum didukung.");
      }
      if (localOff + 30 > b.length || b.readUInt32LE(localOff) !== 0x04034b50) {
        throw new Error("File DOCX rusak (local file header tidak valid).");
      }
      const lNameLen = b.readUInt16LE(localOff + 26);
      const lExtraLen = b.readUInt16LE(localOff + 28);
      const dataStart = localOff + 30 + lNameLen + lExtraLen;
      const dataEnd = dataStart + compSize;
      if (dataEnd > b.length) {
        throw new Error("File DOCX rusak (data ZIP terpotong).");
      }
      const raw = b.subarray(dataStart, dataEnd);
      if (method === 0) return Buffer.from(raw);
      if (method === 8) return inflateRawSync(raw);
      throw new Error(`Metode kompresi ZIP tidak didukung (${method}).`);
    }
    off += 46 + nameLen + extraLen + commentLen;
  }
  return null;
}

// ─────────────────────────────────────────────────────────────
// DOCX XML → teks terstruktur
// ─────────────────────────────────────────────────────────────

function decodeXmlEntities(input: string): string {
  if (input.indexOf("&") === -1) return input;
  return input.replace(/&(#x[0-9a-fA-F]+|#[0-9]+|[a-zA-Z]+);/g, (whole, ent: string) => {
    if (ent.charAt(0) === "#") {
      const code =
        ent.charAt(1) === "x" || ent.charAt(1) === "X"
          ? parseInt(ent.slice(2), 16)
          : parseInt(ent.slice(1), 10);
      if (!Number.isFinite(code) || code < 0 || code > 0x10ffff) return whole;
      try {
        return String.fromCodePoint(code);
      } catch {
        return whole;
      }
    }
    switch (ent) {
      case "amp":
        return "&";
      case "lt":
        return "<";
      case "gt":
        return ">";
      case "quot":
        return '"';
      case "apos":
        return "'";
      case "nbsp":
        return " ";
      default:
        return whole;
    }
  });
}

function attr(tag: string, name: string): string | null {
  const re = new RegExp(`(?:^|\\s)(?:[\\w.-]+:)?${name}\\s*=\\s*"([^"]*)"`, "i");
  const m = re.exec(tag);
  return m ? m[1] : null;
}

function headingLevelFromStyle(style: string | null): number {
  if (!style) return 0;
  const s = style.trim();
  if (/^title$/i.test(s)) return 1;
  if (/^subtitle$/i.test(s)) return 2;
  const m = /heading\s*([1-6])/i.exec(s);
  return m ? parseInt(m[1], 10) : 0;
}

function docxXmlToText(xml: string): { text: string; headings: ExtractedHeading[] } {
  const out: string[] = [];
  const headings: ExtractedHeading[] = [];
  let offset = 0;
  let lastBlank = true;

  // state paragraf
  let para = "";
  let paraStyle: string | null = null;
  let paraOutline = -1;
  let paraNum = false;
  let paraIlvl = 0;
  let inParagraph = false;

  // state teks inline
  let inText = false;
  let inInstr = false;
  let inDel = false;

  // state tabel
  let tableOpen = false;
  let rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let inCell = false;

  const closingTag = (t: string) => t.charCodeAt(1) === 47;
  const selfClosing = (t: string) => /\/\s*>$/.test(t);

  const append = (s: string) => {
    if (inCell) cell += s;
    else if (inParagraph) para += s;
  };

  const flushParagraph = () => {
    const text = para.replace(/\u00a0/g, " ").replace(/[ \t]+$/gm, "").trim();
    if (inCell) {
      if (text) cell += (cell && !cell.endsWith("\n") ? "\n" : "") + text;
    } else if (text) {
      let level = 0;
      if (paraOutline >= 0 && paraOutline <= 5) level = paraOutline + 1;
      const styleLevel = headingLevelFromStyle(paraStyle);
      if (!level && styleLevel) level = styleLevel;
      let prefix = "";
      if (level) {
        level = Math.max(1, Math.min(6, level));
        prefix = "#".repeat(level) + " ";
      } else if (paraNum) {
        prefix = "  ".repeat(Math.max(0, Math.min(6, paraIlvl))) + "- ";
      }
      const body = text.replace(/\n/g, "\n" + " ".repeat(prefix.length));
      const line = prefix + body;
      if (!lastBlank && out.length) out.push("");
      out.push(line);
      if (level) {
        headings.push({
          level,
          text: text.replace(/\n/g, " ").slice(0, 300),
          offset,
        });
      }
      offset += line.length + 1;
      lastBlank = false;
    }
    para = "";
    paraStyle = null;
    paraOutline = -1;
    paraNum = false;
    paraIlvl = 0;
  };

  const flushTable = () => {
    const cleanRows = rows.filter((r) => r.some((c) => c && c.trim()));
    if (cleanRows.length) {
      if (!lastBlank && out.length) out.push("");
      const esc = (c: string) => c.replace(/\|/g, "\\|").replace(/\n+/g, "<br>").trim();
      const width = Math.max(...cleanRows.map((r) => r.length));
      const norm = cleanRows.map((r) => {
        const rr = r.slice();
        while (rr.length < width) rr.push("");
        return rr;
      });
      const header = norm[0];
      const lines = [
        `| ${header.map(esc).join(" | ")} |`,
        `| ${header.map(() => "---").join(" | ")} |`,
      ];
      for (let i = 1; i < norm.length; i++) {
        lines.push(`| ${norm[i].map(esc).join(" | ")} |`);
      }
      for (const l of lines) out.push(l);
      offset += lines.reduce((a, l) => a + l.length + 1, 0);
      lastBlank = false;
    }
    rows = [];
    row = [];
    cell = "";
    inCell = false;
    tableOpen = false;
  };

  const tagRe = /<[^>]+>|[^<]+/g;
  let tok: RegExpExecArray | null;
  while ((tok = tagRe.exec(xml)) !== null) {
    const t = tok[0];
    if (t.charCodeAt(0) !== 60 /* < */) {
      if (inText && !inDel && !inInstr) append(decodeXmlEntities(t));
      continue;
    }
    const nameMatch = /^<\/?\s*([A-Za-z_][\w:.-]*)/.exec(t);
    if (!nameMatch) continue;
    const qname = nameMatch[1];
    const local = qname.includes(":") ? qname.slice(qname.indexOf(":") + 1) : qname;
    const closing = closingTag(t);

    switch (local) {
      case "p":
        if (closing) {
          flushParagraph();
          inParagraph = false;
        } else if (!selfClosing(t)) {
          inParagraph = true;
          para = "";
          paraStyle = attr(t, "pStyle");
          const ov = attr(t, "outlineLvl");
          const on = ov == null ? NaN : parseInt(ov, 10);
          paraOutline = Number.isFinite(on) ? on : -1;
          paraNum = false;
          paraIlvl = 0;
        }
        break;
      case "pStyle": {
        const v = attr(t, "val");
        if (v && !closing) paraStyle = v;
        break;
      }
      case "outlineLvl": {
        const v = attr(t, "val");
        if (v && !closing) {
          const n = parseInt(v, 10);
          if (Number.isFinite(n)) paraOutline = n;
        }
        break;
      }
      case "numPr":
        if (!closing) paraNum = true;
        break;
      case "ilvl": {
        const v = attr(t, "val");
        if (v && !closing) {
          const n = parseInt(v, 10);
          if (Number.isFinite(n)) paraIlvl = n;
        }
        break;
      }
      case "t":
        if (selfClosing(t)) break;
        inText = !closing;
        break;
      case "instrText":
        if (selfClosing(t)) break;
        inInstr = !closing;
        break;
      case "delText":
        if (selfClosing(t)) break;
        inDel = !closing;
        break;
      case "tab":
        if (!closing) append("\t");
        break;
      case "noBreakHyphen":
      case "softHyphen":
        if (!closing) append("-");
        break;
      case "br":
      case "cr":
        if (!closing) append("\n");
        break;
      case "drawing":
      case "pict":
        if (!closing) append(" [gambar] ");
        break;
      case "tbl":
        if (closing) flushTable();
        else {
          tableOpen = true;
          rows = [];
          row = [];
          cell = "";
        }
        break;
      case "tr":
        if (closing) {
          if (row.some((c) => c && c.trim())) rows.push(row);
          row = [];
        } else {
          row = [];
        }
        break;
      case "tc":
        if (closing) {
          row.push(cell.trim());
          cell = "";
          inCell = false;
        } else {
          cell = "";
          inCell = true;
        }
        break;
      default:
        break;
    }
  }
  flushParagraph();
  if (tableOpen) flushTable();

  let text = out.join("\n");
  text = text.replace(/(?:\s*\[gambar\]\s*){2,}/g, " [gambar] ");
  text = text.replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n");
  return { text: text.trim(), headings };
}

function extractDocx(buf: Buffer): {
  text: string;
  headings: ExtractedHeading[];
  title: string;
} {
  const docXmlBuf = readZipEntry(buf, "word/document.xml");
  if (!docXmlBuf) {
    throw new Error("word/document.xml tidak ditemukan — file bukan DOCX yang valid.");
  }
  const { text, headings } = docxXmlToText(docXmlBuf.toString("utf8"));
  let title = "";
  try {
    const core = readZipEntry(buf, "docProps/core.xml");
    if (core) {
      const m = /<dc:title[^>]*>([\s\S]*?)<\/dc:title>/i.exec(core.toString("utf8"));
      if (m) title = decodeXmlEntities(m[1].replace(/<[^>]*>/g, "")).trim();
    }
  } catch {
    /* properti opsional — abaikan */
  }
  return { text, headings: headings.slice(0, MAX_HEADINGS), title };
}

// ─────────────────────────────────────────────────────────────
// TXT / MD
// ─────────────────────────────────────────────────────────────

function decodeTextFile(buf: Buffer): string {
  if (buf.length >= 3 && buf[0] === 0xef && buf[1] === 0xbb && buf[2] === 0xbf) {
    return buf.subarray(3).toString("utf8");
  }
  if (buf.length >= 2 && buf[0] === 0xff && buf[1] === 0xfe) {
    return buf.subarray(2).toString("utf16le");
  }
  if (buf.length >= 2 && buf[0] === 0xfe && buf[1] === 0xff) {
    const rest = buf.subarray(2, buf.length - ((buf.length - 2) % 2));
    const swapped = Buffer.from(rest);
    swapped.swap16();
    return swapped.toString("utf16le");
  }
  return buf.toString("utf8");
}

function textToHeadings(text: string): ExtractedHeading[] {
  const headings: ExtractedHeading[] = [];
  const re = /^(#{1,6})\s+(.+?)\s*$/gm;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null && headings.length < MAX_HEADINGS) {
    headings.push({
      level: m[1].length,
      text: m[2].slice(0, 300),
      offset: m.index,
    });
  }
  return headings;
}

// ─────────────────────────────────────────────────────────────
// Route Handler
// ─────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  const declared = Number(req.headers.get("content-length") || 0);
  if (declared && declared > MAX_BYTES + 2 * 1024 * 1024) {
    return Response.json(
      { ok: false, error: `File terlalu besar (maks ${Math.round(MAX_BYTES / 1024 / 1024)} MB).` },
      { status: 413 },
    );
  }

  let file: File | null = null;
  try {
    const form = await req.formData();
    const value = form.get("file");
    if (value instanceof File) file = value;
  } catch {
    return Response.json(
      { ok: false, error: "Body harus multipart/form-data dengan field 'file'." },
      { status: 400 },
    );
  }

  if (!file) {
    return Response.json(
      { ok: false, error: "Field 'file' tidak ditemukan pada form-data." },
      { status: 400 },
    );
  }
  if (file.size > MAX_BYTES) {
    return Response.json(
      { ok: false, error: `File terlalu besar (maks ${Math.round(MAX_BYTES / 1024 / 1024)} MB).` },
      { status: 413 },
    );
  }

  const name = file.name || "dokumen";
  const ext = (name.split(".").pop() || "").toLowerCase();
  const bytes = file.size;
  const buf = Buffer.from(await file.arrayBuffer());

  try {
    let text = "";
    let headings: ExtractedHeading[] = [];
    let title = "";

    if (ext === "docx" || file.type === DOCX_MIME) {
      const res = extractDocx(buf);
      text = res.text;
      headings = res.headings;
      title = res.title;
    } else if (ext === "txt" || ext === "md" || ext === "markdown" || ext === "text") {
      text = decodeTextFile(buf).replace(/^\uFEFF/, "");
      headings = ext === "txt" ? [] : textToHeadings(text);
    } else {
      return Response.json(
        { ok: false, error: `Format .${ext || "?"} tidak didukung. Gunakan .docx, .txt, atau .md.` },
        { status: 415 },
      );
    }

    text = text.replace(/\r\n?/g, "\n").trim();

    return Response.json({
      ok: true,
      name,
      ext,
      bytes,
      chars: text.length,
      lines: text ? text.split("\n").length : 0,
      title,
      headings,
      text,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Gagal mengekstrak dokumen.";
    return Response.json({ ok: false, error: message }, { status: 422 });
  }
}
