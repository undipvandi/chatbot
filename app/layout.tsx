import type { Metadata } from "next";
import Script from "next/script";
import "./globals.css";

export const metadata: Metadata = {
  title: "Chatbot UI Simple",
  description: "Playground Chat - Chatbot UI Simple",
};

/**
 * Library pihak ketiga (KaTeX, marked, Mermaid, DOMPurify, highlight.js) dimuat
 * sebagai classic script dengan strategi "beforeInteractive" sehingga tersedia
 * sebagai global window.* sebelum /chatbot.js dieksekusi.
 * Urutan penempatan dipertahankan sama seperti pada index.html asli.
 */
export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en">
      <body>
        {/* KaTeX for LaTeX */}
        <link
          rel="stylesheet"
          href="https://cdn.jsdelivr.net/npm/katex@0.16.9/dist/katex.min.css"
        />
        {/* Highlight.js for code blocks */}
        <link
          rel="stylesheet"
          href="https://cdn.jsdelivr.net/gh/highlightjs/cdn-release@11.9.0/build/styles/github-dark.min.css"
        />

        <Script
          src="https://cdn.jsdelivr.net/npm/katex@0.16.9/dist/katex.min.js"
          strategy="beforeInteractive"
        />
        <Script
          src="https://cdn.jsdelivr.net/npm/katex@0.16.9/dist/contrib/auto-render.min.js"
          strategy="beforeInteractive"
        />
        {/* Marked for Markdown */}
        <Script
          src="https://cdn.jsdelivr.net/npm/marked@12.0.0/marked.min.js"
          strategy="beforeInteractive"
        />
        {/* Mermaid for Diagrams & Charts */}
        <Script
          src="https://cdn.jsdelivr.net/npm/mermaid@10.9.3/dist/mermaid.min.js"
          strategy="beforeInteractive"
        />
        {/* DOMPurify for XSS protection */}
        <Script
          src="https://cdn.jsdelivr.net/npm/dompurify@3.2.4/dist/purify.min.js"
          strategy="beforeInteractive"
        />
        {/* Highlight.js for code blocks */}
        <Script
          src="https://cdn.jsdelivr.net/gh/highlightjs/cdn-release@11.9.0/build/highlight.min.js"
          strategy="beforeInteractive"
        />

        {children}
      </body>
    </html>
  );
}
