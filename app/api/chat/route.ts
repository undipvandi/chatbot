import type { NextRequest } from "next/server";

/**
 * Proxy Chat Completions.
 *
 * Mengatasi CORS: beberapa provider/model LLM tidak mengizinkan akses langsung
 * dari browser (tidak mengirim header Access-Control-Allow-Origin). Browser lalu
 * memanggil endpoint same-origin ini (/api/chat) — tanpa CORS — dan server
 * meneruskan request ke upstream apa adanya (termasuk streaming SSE).
 *
 * Client mengirim:
 *  - header `x-upstream`: base URL provider, mis. https://host/v1
 *  - header `authorization`: Bearer token (opsional; fallback ke env LLM_API_KEY)
 *  - body: payload chat/completions standar
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const UPSTREAM_HEADER = "x-upstream";

function buildTarget(baseUrl: string): string {
  let base = (baseUrl || "").trim().replace(/\/+$/, "");
  if (!base) throw new Error("Upstream base URL kosong.");
  // Terima baik host root (https://x) maupun yang sudah mengandung /v1 atau /chat/completions
  if (!/^https?:\/\//i.test(base)) base = "https://" + base;
  const suffix = "/chat/completions";
  return base.endsWith(suffix) ? base : base + suffix;
}

export async function POST(req: NextRequest) {
  let target: string;
  try {
    const upstream = req.headers.get(UPSTREAM_HEADER) || process.env.LLM_BASE_URL || "";
    if (!upstream) {
      return Response.json(
        { error: { message: "Tidak ada upstream. Kirim header 'x-upstream' atau set env LLM_BASE_URL." } },
        { status: 400 },
      );
    }
    target = buildTarget(upstream);
  } catch (e) {
    return Response.json(
      { error: { message: e instanceof Error ? e.message : "URL upstream tidak valid." } },
      { status: 400 },
    );
  }

  const auth = req.headers.get("authorization") || "";
  const contentType = req.headers.get("content-type") || "application/json";
  const apiKeyFallback = process.env.LLM_API_KEY;
  const hasAuth = auth || apiKeyFallback;
  if (!hasAuth) {
    return Response.json(
      { error: { message: "Tidak ada API key (Authorization header / env LLM_API_KEY)." } },
      { status: 401 },
    );
  }

  // Batalkan request upstream jika klien membatalkan (AbortController di browser).
  const controller = new AbortController();
  try {
    req.signal.addEventListener("abort", () => controller.abort());
  } catch {
    /* beberapa env tidak mendukung addEventListener pada signal */
  }

  let upstreamRes: Response;
  try {
    const body = await req.arrayBuffer();
    upstreamRes = await fetch(target, {
      method: "POST",
      headers: {
        "Content-Type": contentType,
        Authorization: auth || `Bearer ${apiKeyFallback}`,
      },
      body,
      signal: controller.signal,
      cache: "no-store",
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unknown error";
    // Bedakan pembatalan klien (504) vs kegagalan upstream (502)
    const status = e instanceof Error && e.name === "AbortError" ? 504 : 502;
    return Response.json(
      { error: { message: `Gagal menghubungi upstream (${status}): ${message}` } },
      { status },
    );
  }

  // Teruskan respons apa adanya (termasuk SSE streaming).
  const headers: Record<string, string> = {
    "Content-Type":
      upstreamRes.headers.get("content-type") || "application/json",
    "Cache-Control": "no-cache, no-transform",
  };
  const reqId = upstreamRes.headers.get("x-request-id");
  if (reqId) headers["x-request-id"] = reqId;

  return new Response(upstreamRes.body, {
    status: upstreamRes.status,
    statusText: upstreamRes.statusText,
    headers,
  });
}
