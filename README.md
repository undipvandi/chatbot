# Chatbot UI Simple — Next.js

Aplikasi chatbot (Playground Chat) yang diporting dari `index.html` tunggal menjadi proyek
[Next.js](https://nextjs.org) App Router. Tidak ada perubahan logika: seluruh perilaku aplikasi
tetap sama seperti versi HTML aslinya.

## Menjalankan

```bash
npm run dev      # mode development (Turbopack) → http://localhost:3000
```

Untuk mode produksi:

```bash
npm run build    # kompilasi + type-check + prerender
npm start        # jalankan hasil build
```

Semua dependensi sudah tersedia di `node_modules`, jadi tidak perlu `npm install` ulang.

## Struktur hasil konversi

| Sumber di `index.html`           | Tujuan di Next.js                                  | Keterangan                                                                 |
| -------------------------------- | -------------------------------------------------- | -------------------------------------------------------------------------- |
| `<title>` + CDN `<link>`/`<script>` | [app/layout.tsx](./app/layout.tsx)               | Meta title, 2 stylesheet CDN, 6 library CDN via `next/script`               |
| `<body>` markup                  | [app/page.tsx](./app/page.tsx)                     | Diubah ke JSX + memuat `/chatbot.js`                                        |
| `<style>`                        | [app/globals.css](./app/globals.css)               | Diimpor oleh root layout                                                    |
| `<script>` (logika aplikasi)     | [public/chatbot.js](./public/chatbot.js)           | Disajikan sebagai aset statis di `/chatbot.js`                              |

### Strategi pemuatan script

Logika aplikasi bergantung pada global `marked`, `katex`, `mermaid`, `DOMPurify`, dan `hljs`
dari CDN, serta langsung memanggil `document.getElementById(...)` saat dieksekusi. Karena itu:

- **Library CDN** dimuat di `app/layout.tsx` dengan `strategy="beforeInteractive"`, sehingga
  disuntikkan ke HTML awal dan dieksekusi berurutan sebelum kode Next.js maupun hidrasi.
- **`/chatbot.js`** dimuat di `app/page.tsx` dengan strategi default `afterInteractive`,
  sehingga berjalan setelah hidrasi ketika seluruh elemen DOM di markup sudah tersedia.

`next/script` merender *classic script* (bukan ES module), jadi akses ke global `window.*`
tetap berfungsi seperti pada `index.html` asli.

### Catatan JSX

Beberapa penyesuaian dilakukan agar markup valid di JSX tanpa mengubah perilaku:

- `class` → `className`, komentar HTML → `{/* ... */}`, atribut `style` string → objek.
- `<option selected>` → `defaultValue` pada `<select>` induknya, dan `value` pada input range
  → `defaultValue`. Ini menghindari komponen terkontrol React yang akan mengunci nilai
  sebelum `loadConfig()` sempat memuat konfigurasi dari IndexedDB.
- `<meta charset>` dan `<meta name="viewport">` tidak ditulis manual — Next.js selalu
  menghasilkannya secara otomatis.
- Tema (`data-theme`) diatur secara imperatif oleh `chatbot.js` pada `<html>`; karena atribut
  itu tidak dideklarasikan di JSX, hidrasi React tidak akan menimpanya.

## Dependensi runtime pihak ketiga (via CDN)

KaTeX `0.16.9` · marked `12.0.0` · Mermaid `10.9.3` · DOMPurify `3.2.4` · highlight.js `11.9.0`

Versi-versi ini dipertahankan sama persis dengan `index.html` asli. Koneksi internet diperlukan
saat halaman dimuat.

## Lampiran Dokumen (.docx / .txt / .md)

Tombol 📎 di area input menerima file `.docx`, `.txt`, dan `.md` (maks 5 dokumen per
pesan, 60 MB per file). Alur pemrosesannya:

1. **Ekstraksi**
   - `.txt` / `.md` dibaca di browser dengan deteksi BOM (UTF-8, UTF-16 LE/BE).
   - `.docx` dikirim ke route handler `POST /api/extract` lalu di-unzip memakai
     `node:zlib` tanpa dependensi eksternal. `word/document.xml` diubah menjadi teks
     terstruktur: heading (`#`), list berjenjang, tabel markdown, `[gambar]`, dan
     karakter khusus; teks terhapus (`w:delText`) diabaikan. Judul dokumen diambil
     dari `docProps/core.xml`.
2. **Penyimpanan** — teks penuh disimpan di IndexedDB pada key `chatx_docs`,
   terpisah dari riwayat chat. Riwayat hanya menyimpan metadata lampiran (nama,
   token, jumlah bagian) sehingga penyimpanan riwayat tetap ringan.
3. **Pengiriman ke model — tidak ada konteks yang hilang**
   - Jika dokumen muat di context window, dokumen dikirim **utuh dalam satu blok**
     dengan penanda `--- MULAI/SELESAI DOKUMEN ---`.
   - Jika harus dipecah, seluruh bagian tetap dikirim **berurutan dalam satu
     permintaan yang sama**, masing-masing dengan manifest (judul, daftar isi,
     posisi bagian) dan **overlap ~700 karakter** di awal bagian berikutnya agar
     konteks di batas chunk tetap nyambung.
   - Rencana chunk dibekukan di metadata lampiran saat kirim, jadi konteks dokumen
     tidak berubah walau Context Window diubah di tengah percakapan.
   - Bila dokumen melebihi context window, jumlah bagian yang dikirim dan sisanya
     dilaporkan secara eksplisit di chat — tidak ada pemotongan diam-diam.
4. **Proteksi compaction** — pesan yang mengandung lampiran tidak pernah diringkas
   atau dipotong oleh Auto Compaction; hanya pesan biasa yang dipadatkan. Dengan
   begini teks dokumen tetap utuh di konteks selama percakapan berlangsung.

Ada preset **1M (1.000.000)** pada pilihan Context Window untuk model berjendela
konteks besar. Klik chip lampiran di pesan untuk melihat isi hasil ekstraksi
(ditampilkan maks 300.000 karakter pertama; teks lengkap tetap dikirim ke model).

## Penyimpanan

Riwayat obrolan dan konfigurasi disimpan di IndexedDB (database `chatx_db`) melalui shim
`storage` di awal `public/chatbot.js`, menggantikan `localStorage` pada versi sebelumnya.

## Tailwind CSS

Paket `@tailwindcss/postcss` dan `tailwindcss` masih ada di `devDependencies` dari scaffold
`create-next-app`, tetapi `app/globals.css` tidak lagi mengimpor Tailwind — aplikasi ini
memakai stylesheet aslinya sendiri. Tidak ada kode yang bergantung pada Tailwind.
