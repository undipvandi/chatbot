<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Chatbot UI Simple</title>

  <!-- KaTeX for LaTeX -->
  <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/katex@0.16.9/dist/katex.min.css" />
  <script src="https://cdn.jsdelivr.net/npm/katex@0.16.9/dist/katex.min.js"></script>
  <script src="https://cdn.jsdelivr.net/npm/katex@0.16.9/dist/contrib/auto-render.min.js"></script>

  <!-- Marked for Markdown -->
  <script src="https://cdn.jsdelivr.net/npm/marked@12.0.0/marked.min.js"></script>

  <!-- Mermaid for Diagrams & Charts -->
  <script src="https://cdn.jsdelivr.net/npm/mermaid@10.9.3/dist/mermaid.min.js"></script>

  <!-- DOMPurify for XSS protection -->
  <script src="https://cdn.jsdelivr.net/npm/dompurify@3.2.4/dist/purify.min.js"></script>

  <!-- Highlight.js for code blocks -->
  <link rel="stylesheet" href="https://cdn.jsdelivr.net/gh/highlightjs/cdn-release@11.9.0/build/styles/github-dark.min.css" />
  <script src="https://cdn.jsdelivr.net/gh/highlightjs/cdn-release@11.9.0/build/highlight.min.js"></script>

  <style>
    :root {
      --bg-primary: #0f0f0f;
      --bg-secondary: #1a1a1a;
      --bg-tertiary: #2a2a2a;
      --bg-input: #1e1e1e;
      --text-primary: #e0e0e0;
      --text-secondary: #a0a0a0;
      --accent: #6c63ff;
      --accent-hover: #5a52e0;
      --user-bubble: #6c63ff;
      --assistant-bubble: #2a2a2a;
      --border-color: #333;
      --scrollbar-thumb: #444;
      --scrollbar-track: transparent;
      --code-bg: #1e1e1e;
      --code-block-bg: #0d0d14;
      --code-block-header: #1a1a2e;
      --code-block-border: #2e2e4a;
      --danger: #e74c3c;
      --success: #27ae60;
    }

    [data-theme="light"] {
      --bg-primary: #ffffff;
      --bg-secondary: #f8f9fa;
      --bg-tertiary: #e9ecef;
      --bg-input: #ffffff;
      --text-primary: #1a1a1e;
      --text-secondary: #6c757d;
      --accent: #6c63ff;
      --accent-hover: #5a52e0;
      --user-bubble: #6c63ff;
      --assistant-bubble: #f1f3f5;
      --border-color: #dee2e6;
      --scrollbar-thumb: #ced4da;
      --scrollbar-track: transparent;
      --code-bg: #f1f3f5;
      --danger: #e74c3c;
      --success: #27ae60;
    }

    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }

    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
      background: var(--bg-primary);
      color: var(--text-primary);
      height: 100vh;
      overflow: hidden;
      transition: background 0.25s ease, color 0.25s ease;
    }

    ::-webkit-scrollbar { width: 6px; }
    ::-webkit-scrollbar-track { background: var(--scrollbar-track); }
    ::-webkit-scrollbar-thumb { background: var(--scrollbar-thumb); border-radius: 3px; }
    ::-webkit-scrollbar-thumb:hover { background: #555; }

    #layout {
      display: flex;
      height: 100vh;
      overflow: hidden;
    }

    #app {
      flex: 1;
      display: flex;
      flex-direction: column;
      height: 100vh;
      min-width: 0;
      max-width: none;
      margin: 0;
    }

    /* ── Sidebar ─────────────────────────────── */
    #sidebar {
      width: 280px;
      min-width: 280px;
      background: var(--bg-secondary);
      border-right: 1px solid var(--border-color);
      display: flex;
      flex-direction: column;
      flex-shrink: 0;
      overflow: hidden;
      transition: transform 0.3s ease;
    }

    #sidebar-header {
      padding: 14px 14px;
      border-bottom: 1px solid var(--border-color);
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 8px;
      flex-shrink: 0;
    }

    #sidebar-header h2 {
      font-size: 0.9rem;
      font-weight: 700;
      display: flex;
      align-items: center;
      gap: 6px;
      white-space: nowrap;
    }

    #history-list {
      flex: 1;
      overflow-y: auto;
      padding: 10px 8px;
      display: flex;
      flex-direction: column;
      gap: 6px;
    }

    .history-empty {
      text-align: center;
      color: var(--text-secondary);
      font-size: 0.8rem;
      padding: 20px 10px;
      line-height: 1.5;
    }

    .history-item {
      padding: 10px 12px;
      border-radius: 10px;
      cursor: pointer;
      border: 1px solid transparent;
      transition: all 0.2s;
      position: relative;
      background: transparent;
      text-align: left;
      width: 100%;
    }

    .history-item:hover {
      background: var(--bg-tertiary);
      border-color: var(--border-color);
    }

    .history-item.active {
      background: var(--accent);
      border-color: var(--accent);
      color: #fff;
    }

    .history-item-title {
      font-size: 0.82rem;
      font-weight: 600;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      padding-right: 22px;
    }

    .history-item.active .history-item-title { color: #fff; }

    .history-preview {
      font-size: 0.7rem;
      color: var(--text-secondary);
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      margin-top: 3px;
      padding-right: 4px;
    }

    .history-item.active .history-preview,
    .history-item.active .history-date { color: rgba(255,255,255,0.75); }

    .history-date {
      font-size: 0.65rem;
      color: var(--text-secondary);
      margin-top: 4px;
    }

    .history-delete {
      position: absolute;
      top: 8px;
      right: 8px;
      width: 22px;
      height: 22px;
      border-radius: 6px;
      border: none;
      background: rgba(0,0,0,0.08);
      color: var(--text-secondary);
      cursor: pointer;
      font-size: 0.7rem;
      display: none;
      align-items: center;
      justify-content: center;
      transition: 0.2s;
    }

    .history-item:hover .history-delete { display: flex; }
    .history-delete:hover { background: var(--danger); color: #fff; }
    .history-item.active .history-delete { background: rgba(0,0,0,0.2); color: #fff; }
    .history-item.active .history-delete:hover { background: var(--danger); }

    #sidebar-footer {
      padding: 10px;
      border-top: 1px solid var(--border-color);
      flex-shrink: 0;
    }

    #clear-all-btn {
      width: 100%;
      background: transparent;
      border: 1px solid var(--border-color);
      color: var(--text-secondary);
      padding: 7px;
      border-radius: 8px;
      font-size: 0.75rem;
      cursor: pointer;
      transition: 0.2s;
    }

    #clear-all-btn:hover { background: var(--danger); color: #fff; border-color: var(--danger); }

    #sidebar-backdrop {
      display: none;
      position: fixed;
      inset: 0;
      background: rgba(0,0,0,0.5);
      z-index: 40;
    }

    #menu-btn {
      display: none;
      background: var(--bg-tertiary);
      border: 1px solid var(--border-color);
      color: var(--text-primary);
      width: 36px;
      height: 36px;
      border-radius: 8px;
      cursor: pointer;
      font-size: 1.1rem;
      align-items: center;
      justify-content: center;
    }

    /* ── Header ──────────────────────────────── */
    header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 12px 20px;
      border-bottom: 1px solid var(--border-color);
      background: var(--bg-secondary);
      flex-shrink: 0;
    }

    header h1 {
      font-size: 1.1rem;
      font-weight: 600;
      display: flex;
      align-items: center;
      gap: 8px;
    }

    .header-actions {
      display: flex;
      gap: 8px;
    }

    .btn-icon {
      background: var(--bg-tertiary);
      border: 1px solid var(--border-color);
      color: var(--text-secondary);
      padding: 6px 10px;
      border-radius: 8px;
      cursor: pointer;
      font-size: 0.85rem;
      transition: all 0.2s;
      display: flex;
      align-items: center;
      gap: 4px;
    }

    .btn-icon:hover {
      background: var(--accent);
      color: #fff;
      border-color: var(--accent);
    }

    .btn-icon.danger:hover {
      background: var(--danger);
      border-color: var(--danger);
    }

    /* ── Status Bar ──────────────────────────── */
    #status-bar {
      display: flex;
      align-items: center;
      gap: 6px;
      padding: 4px 20px;
      font-size: 0.72rem;
      color: var(--text-secondary);
      background: var(--bg-secondary);
      border-bottom: 1px solid var(--border-color);
      flex-shrink: 0;
    }

    .status-dot {
      width: 6px;
      height: 6px;
      border-radius: 50%;
      background: var(--text-secondary);
    }

    .status-dot.connected { background: var(--success); }
    .status-dot.error { background: var(--danger); }

    /* ── Chat Area ───────────────────────────── */
    #chat-container {
      flex: 1;
      overflow-y: auto;
      padding: 10px 6px;
      display: flex;
      flex-direction: column;
      gap: 12px;
      width: 100%;
      max-width: 100%;
      box-sizing: border-box;
    }

    /* ── Welcome ─────────────────────────────── */
    #welcome {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      flex: 1;
      text-align: center;
      gap: 16px;
      opacity: 0.7;
    }

    #welcome .emoji { font-size: 3rem; }
    #welcome h2 { font-size: 1.4rem; font-weight: 600; }
    #welcome p { font-size: 0.9rem; color: var(--text-secondary); max-width: 420px; line-height: 1.5; }

    .quick-prompts {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
      justify-content: center;
      margin-top: 8px;
    }

    .quick-prompt {
      background: var(--bg-tertiary);
      border: 1px solid var(--border-color);
      color: var(--text-secondary);
      padding: 8px 16px;
      border-radius: 20px;
      cursor: pointer;
      font-size: 0.8rem;
      transition: all 0.2s;
    }

    .quick-prompt:hover {
      background: var(--accent);
      color: #fff;
      border-color: var(--accent);
    }

    /* ── Messages ────────────────────────────── */
    .message {
      display: flex;
      gap: 8px;
      max-width: 100%;
      width: 100%;
      animation: fadeIn 0.3s ease;
    }

    @keyframes fadeIn {
      from { opacity: 0; transform: translateY(8px); }
      to { opacity: 1; transform: translateY(0); }
    }

    .message.user { flex-direction: row-reverse; }

    .avatar {
      width: 34px;
      height: 34px;
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 1rem;
      flex-shrink: 0;
    }

    .message.assistant .avatar { background: var(--accent); }
    .message.user .avatar { background: #e74c3c; }

    /* PAS LAYAR: bubble pas layar — tidak kecil 80% lagi */
    .bubble {
      padding: 14px 16px;
      border-radius: 16px;
      line-height: 1.7;
      font-size: 0.94rem;
      min-width: 0;
      word-wrap: break-word;
      overflow-wrap: break-word;
      overflow-wrap: anywhere;
    }
    /* Assistant: WAJIB pas layar — isi panjang jadi 92%+ layar */
    .message.assistant .bubble {
      flex: 1 1 auto;
      width: auto;
      max-width: calc(100% - 42px);
    }
    /* User: proporsional di kanan, tapi boleh sampai 92% juga kalau panjang */
    .message.user .bubble {
      max-width: calc(100% - 42px);
      width: fit-content;
      flex: 0 1 auto;
      margin-left: auto;
    }

    .message.user .bubble {
      background: var(--user-bubble);
      color: #fff;
      border-bottom-right-radius: 4px;
    }

    .message.assistant .bubble {
      background: var(--assistant-bubble);
      border: 1px solid var(--border-color);
      border-bottom-left-radius: 4px;
    }

    /* ── Markdown Inside Bubbles ─────────────── */
    .bubble p { margin: 0 0 8px 0; }
    .bubble p:last-child { margin-bottom: 0; }
    .bubble ul, .bubble ol { margin: 4px 0 8px 20px; }
    .bubble li { margin-bottom: 2px; }
    .bubble h1, .bubble h2, .bubble h3, .bubble h4 { margin: 12px 0 6px 0; font-weight: 600; }
    .bubble h1 { font-size: 1.3rem; }
    .bubble h2 { font-size: 1.15rem; }
    .bubble h3 { font-size: 1.05rem; }
    .bubble blockquote { border-left: 3px solid var(--accent); padding-left: 12px; margin: 8px 0; color: var(--text-secondary); }
    .bubble table { border-collapse: collapse; margin: 8px 0; width: 100%; font-size: 0.85rem; }
    .bubble th, .bubble td { border: 1px solid var(--border-color); padding: 6px 10px; text-align: left; }
    .bubble th { background: var(--bg-tertiary); font-weight: 600; }
    .bubble a { color: var(--accent); text-decoration: underline; }
    .bubble hr { border: none; border-top: 1px solid var(--border-color); margin: 12px 0; }

    .bubble code:not(pre code) {
      background: var(--code-bg);
      padding: 2px 6px;
      border-radius: 4px;
      font-size: 0.85em;
      font-family: 'Fira Code', 'Consolas', 'Monaco', monospace;
      display: inline;
      white-space: break-spaces;
      word-break: break-word;
      vertical-align: baseline;
    }

    /* ── Code Blocks ─────────────────────────── */
    .code-block-wrapper {
      position: relative;
      margin: 10px 0;
      border-radius: 10px;
      overflow: hidden;
      border: 1px solid var(--code-block-border);
      background: var(--code-block-bg);
      box-shadow: 0 2px 10px rgba(0,0,0,0.35), inset 0 1px 0 rgba(255,255,255,0.04);
    }

    .code-block-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 7px 12px;
      background: var(--code-block-header);
      border-bottom: 1px solid var(--code-block-border);
      font-size: 0.72rem;
      font-weight: 600;
      color: #a5a6d6;
      letter-spacing: 0.02em;
    }
    .code-block-header span {
      display: flex;
      align-items: center;
      gap: 6px;
    }
    .code-block-header span::before {
      content: "";
      width: 8px;
      height: 8px;
      border-radius: 50%;
      background: var(--accent);
      opacity: 0.9;
      box-shadow: 0 0 6px rgba(108,99,255,0.6);
    }

    .copy-btn {
      background: rgba(255,255,255,0.07);
      border: 1px solid rgba(255,255,255,0.08);
      color: #c5c6e0;
      cursor: pointer;
      font-size: 0.72rem;
      padding: 4px 10px;
      border-radius: 6px;
      transition: all 0.2s;
    }

    .copy-btn:hover { background: var(--accent); color: #fff; border-color: var(--accent); }

    .code-block-wrapper pre {
      margin: 0 !important;
      padding: 14px 16px !important;
      overflow-x: auto;
      font-size: 0.85rem;
      line-height: 1.6;
      background: var(--code-block-bg) !important;
    }

    .code-block-wrapper pre code {
      font-family: 'Fira Code', 'Consolas', 'Monaco', monospace;
      background: transparent !important;
      padding: 0 !important;
      color: #e6e6f0;
    }
    /* override highlight.js bg agar tetap pakai var kita */
    .code-block-wrapper pre code.hljs {
      background: transparent !important;
    }

    .katex-display { margin: 0 !important; display: inline-block !important; overflow-x: visible; vertical-align: middle; padding: 0 1px; }

    /* ── Math — klik rumus untuk menyalin (tanpa tombol, tetap inline) ───── */
    .math-wrapper {
      position: relative;
      display: inline-flex;
      align-items: center;
      gap: 4px;
      vertical-align: middle;
      max-width: 100%;
      flex-wrap: wrap;
      cursor: pointer;
      border-radius: 6px;
      padding: 1px 4px;
      margin: 0 1px;
      transition: background 0.15s, box-shadow 0.15s, transform 0.12s;
      -webkit-user-select: none;
      user-select: none;
    }
    .math-wrapper:hover {
      background: rgba(108,99,255,0.10);
      box-shadow: 0 0 0 1px rgba(108,99,255,0.22);
    }
    .math-wrapper:active {
      background: rgba(108,99,255,0.16);
      transform: scale(0.97);
    }
    .math-wrapper:focus-visible {
      outline: 2px solid var(--accent);
      outline-offset: 1px;
    }
    .math-wrapper.copied {
      background: rgba(39,174,96,0.14);
      box-shadow: 0 0 0 1px rgba(39,174,96,0.35);
    }
    .math-wrapper.display {
      display: inline-flex;
      justify-content: center;
      align-items: center;
      margin: 0 2px;
      width: auto;
      vertical-align: middle;
    }
    .math-wrapper .math-render { display: inline-flex; align-items: center; max-width: 100%; pointer-events: none; }
    .math-wrapper.display .math-render { display: inline-flex; }
    .math-wrapper.display .katex-display { margin: 0 !important; display: inline-block !important; }
    .math-copy-toast {
      position: fixed;
      bottom: 24px;
      left: 50%;
      transform: translateX(-50%);
      background: #1a1a2e;
      color: #fff;
      padding: 12px 18px;
      border-radius: 10px;
      font-size: 0.85rem;
      z-index: 9999;
      box-shadow: 0 8px 24px rgba(0,0,0,0.4);
      border: 1px solid rgba(255,255,255,0.1);
      max-width: 90%;
      text-align: center;
      line-height: 1.5;
      animation: fadeIn 0.3s ease;
    }
    [data-theme="light"] .math-copy-toast { background: #1e1e32; }
    [data-theme="light"] .math-wrapper:hover { background: rgba(108,99,255,0.08); }

    /* ── Typing Indicator ────────────────────── */
    .typing-indicator {
      display: flex;
      gap: 4px;
      padding: 4px 0;
    }

    .typing-indicator span {
      width: 7px;
      height: 7px;
      background: var(--text-secondary);
      border-radius: 50%;
      animation: bounce 1.4s infinite;
    }

    .typing-indicator span:nth-child(2) { animation-delay: 0.2s; }
    .typing-indicator span:nth-child(3) { animation-delay: 0.4s; }

    @keyframes bounce {
      0%, 60%, 100% { transform: translateY(0); opacity: 0.4; }
      30% { transform: translateY(-8px); opacity: 1; }
    }

    /* ── Thinking / Reasoning ──────────────── */
    .thinking-block {
      border: 1px solid var(--border-color);
      border-radius: 12px;
      overflow: hidden;
      margin-bottom: 12px;
      background: #171722;
    }

    .thinking-header {
      width: 100%;
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 8px;
      padding: 9px 12px;
      background: #1f1f2e;
      border: none;
      border-bottom: 1px solid var(--border-color);
      color: var(--text-secondary);
      font-size: 0.76rem;
      font-weight: 600;
      cursor: pointer;
      font-family: inherit;
      transition: background 0.2s;
    }

    .thinking-header:hover { background: #25253a; }

    .thinking-block.done .thinking-header {
      background: rgba(108,99,255,0.12);
      color: var(--text-primary);
      border-bottom-color: rgba(108,99,255,0.25);
    }

    .thinking-header-left {
      display: flex;
      align-items: center;
      gap: 8px;
      min-width: 0;
    }

    .thinking-spinner {
      width: 13px;
      height: 13px;
      border: 2px solid rgba(255,255,255,0.18);
      border-top-color: var(--accent);
      border-radius: 50%;
      animation: spin 0.7s linear infinite;
      flex-shrink: 0;
    }

    @keyframes spin { to { transform: rotate(360deg); } }

    .thinking-title { white-space: nowrap; }

    .thinking-timer {
      font-size: 0.68rem;
      font-weight: 500;
      color: var(--text-secondary);
      background: rgba(255,255,255,0.07);
      padding: 2px 6px;
      border-radius: 20px;
      margin-left: 2px;
    }

    .thinking-block.done .thinking-timer {
      background: rgba(108,99,255,0.18);
      color: var(--accent);
    }

    .thinking-chevron {
      font-size: 0.65rem;
      opacity: 0.7;
      transition: transform 0.2s;
      flex-shrink: 0;
    }

    .thinking-content {
      padding: 12px;
      font-size: 0.8rem;
      line-height: 1.6;
      color: #b8b8c8;
      max-height: 260px;
      overflow-y: auto;
      white-space: pre-wrap;
      word-break: break-word;
      background: #15151f;
    }

    .thinking-content p { margin: 0 0 8px 0; }
    .thinking-content p:last-child { margin-bottom: 0; }
    .thinking-content code:not(pre code) {
      background: rgba(255,255,255,0.08);
      padding: 1px 5px;
      border-radius: 4px;
      font-size: 0.85em;
    }

    .thinking-content pre {
      background: #0f0f17;
      border: 1px solid #2a2a3a;
      border-radius: 8px;
      padding: 10px;
      overflow-x: auto;
      margin: 8px 0;
    }

    .thinking-placeholder {
      opacity: 0.6;
      font-style: italic;
      font-size: 0.78rem;
    }

    .answer-content { min-height: 1em; }

    /* ── Input Area ──────────────────────────── */
    #input-area {
      padding: 16px 20px;
      border-top: 1px solid var(--border-color);
      background: var(--bg-secondary);
      flex-shrink: 0;
    }

    .input-wrapper {
      display: flex;
      gap: 10px;
      align-items: flex-end;
    }

    #attach-btn {
      background: var(--bg-tertiary);
      border: 1px solid var(--border-color);
      color: var(--text-secondary);
      width: 44px;
      height: 44px;
      border-radius: 12px;
      cursor: pointer;
      font-size: 1.25rem;
      display: flex;
      align-items: center;
      justify-content: center;
      transition: all 0.2s;
      flex-shrink: 0;
    }

    #attach-btn:hover { background: var(--accent); color:#fff; border-color: var(--accent); }
    #attach-btn.has-images { background: var(--accent); color:#fff; border-color: var(--accent); }
    #image-preview-bar {
      display: none;
      gap: 10px;
      padding: 0 0 12px 0;
      flex-wrap: wrap;
      align-items: center;
    }

    #image-preview-bar.visible { display: flex; }
    .preview-item {
      position: relative;
      width: 84px;
      height: 84px;
      border-radius: 12px;
      overflow: hidden;
      border: 1px solid var(--border-color);
      background: var(--bg-tertiary);
      flex-shrink: 0;
    }

    .preview-item img {
      width: 100%;
      height: 100%;
      object-fit: cover;
      display: block;
    }

    .preview-remove {
      position: absolute;
      top: 4px;
      right: 4px;
      width: 22px;
      height: 22px;
      border-radius: 50%;
      border: none;
      background: rgba(0,0,0,0.65);
      color: #fff;
      cursor: pointer;
      font-size: 0.75rem;
      display: flex;
      align-items: center;
      justify-content: center;
      backdrop-filter: blur(4px);
    }

    .preview-remove:hover { background: var(--danger); }
    .preview-info {
      position: absolute;
      bottom: 0;
      left: 0;
      right: 0;
      background: linear-gradient(transparent, rgba(0,0,0,0.65));
      color: #fff;
      font-size: 0.6rem;
      padding: 12px 4px 4px;
      text-align: center;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .bubble-images {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
      margin-bottom: 8px;
    }

    .bubble-images img {
      max-width: 240px;
      max-height: 220px;
      border-radius: 10px;
      border: 1px solid var(--border-color);
      object-fit: cover;
      cursor: zoom-in;
      transition: transform 0.15s;
      background: var(--bg-tertiary);
    }

    .bubble-images img:hover { transform: scale(1.02); }
    .message.user .bubble-images img { border-color: rgba(255,255,255,0.25); }

    #img-lightbox {
      display: none;
      position: fixed;
      inset: 0;
      background: rgba(0,0,0,0.85);
      z-index: 200;
      align-items: center;
      justify-content: center;
      cursor: zoom-out;
      padding: 20px;
    }

    #img-lightbox.open { display: flex; }
    #img-lightbox img {
      max-width: 92vw;
      max-height: 92vh;
      border-radius: 12px;
      box-shadow: 0 8px 32px rgba(0,0,0,0.6);
      object-fit: contain;
    }

    .drag-over { outline: 2px dashed var(--accent); outline-offset: -2px; background: rgba(108,99,255,0.06); }

    #user-input {
      flex: 1;
      background: var(--bg-input);
      border: 1px solid var(--border-color);
      color: var(--text-primary);
      padding: 12px 16px;
      border-radius: 14px;
      font-size: 0.92rem;
      resize: none;
      outline: none;
      font-family: inherit;
      max-height: 40vh;
      height: auto;
      line-height: 1.5;
      transition: border-color 0.2s;
      overflow: hidden;
    }

    #user-input:focus { border-color: var(--accent); }
    #user-input::placeholder { color: var(--text-secondary); }

    #send-btn {
      background: var(--accent);
      border: none;
      color: #fff;
      width: 44px;
      height: 44px;
      border-radius: 12px;
      cursor: pointer;
      font-size: 1.2rem;
      display: flex;
      align-items: center;
      justify-content: center;
      transition: all 0.2s;
      flex-shrink: 0;
    }

    #send-btn:hover { background: var(--accent-hover); transform: scale(1.05); }
    #send-btn:disabled { opacity: 0.4; cursor: not-allowed; transform: none; }

    #stop-btn {
      background: var(--danger);
      border: none;
      color: #fff;
      width: 44px;
      height: 44px;
      border-radius: 12px;
      cursor: pointer;
      font-size: 1rem;
      display: none;
      align-items: center;
      justify-content: center;
      transition: all 0.2s;
      flex-shrink: 0;
    }

    #stop-btn:hover { opacity: 0.8; }

    .input-hint {
      font-size: 0.7rem;
      color: var(--text-secondary);
      margin-top: 6px;
      text-align: center;
    }

    /* ── Modal ───────────────────────────────── */
    .modal-overlay {
      display: none;
      position: fixed;
      top: 0; left: 0; right: 0; bottom: 0;
      background: rgba(0,0,0,0.6);
      z-index: 100;
      align-items: center;
      justify-content: center;
    }

    .modal-overlay.active { display: flex; }

    .modal {
      background: var(--bg-secondary);
      border: 1px solid var(--border-color);
      border-radius: 16px;
      padding: 24px;
      width: 90%;
      max-width: 520px;
      max-height: 85vh;
      overflow-y: auto;
    }

    .modal h2 {
      font-size: 1.1rem;
      margin-bottom: 16px;
      display: flex;
      align-items: center;
      gap: 8px;
    }

    .form-group { margin-bottom: 14px; }

    .form-group label {
      display: block;
      font-size: 0.8rem;
      color: var(--text-secondary);
      margin-bottom: 4px;
      font-weight: 500;
    }

    .form-group input,
    .form-group select,
    .form-group textarea {
      width: 100%;
      background: var(--bg-input);
      border: 1px solid var(--border-color);
      color: var(--text-primary);
      padding: 10px 12px;
      border-radius: 8px;
      font-size: 0.88rem;
      outline: none;
      font-family: inherit;
    }

    .form-group input:focus,
    .form-group select:focus,
    .form-group textarea:focus {
      border-color: var(--accent);
    }

    .form-group .hint {
      font-size: 0.72rem;
      color: var(--text-secondary);
      margin-top: 2px;
    }

    .modal-actions {
      display: flex;
      gap: 8px;
      justify-content: flex-end;
      margin-top: 16px;
    }

    .btn {
      padding: 8px 18px;
      border-radius: 8px;
      font-size: 0.88rem;
      cursor: pointer;
      border: 1px solid var(--border-color);
      transition: all 0.2s;
      font-weight: 500;
    }

    .btn-primary {
      background: var(--accent);
      color: #fff;
      border-color: var(--accent);
    }

    .btn-primary:hover { background: var(--accent-hover); }

    .btn-secondary {
      background: var(--bg-tertiary);
      color: var(--text-primary);
    }

    .btn-secondary:hover { background: var(--border-color); }

    .btn-test {
      background: var(--success);
      color: #fff;
      border-color: var(--success);
    }

    .btn-test:hover { opacity: 0.85; }

    .toggle-row {
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin-bottom: 8px;
    }

    .toggle-row label { margin-bottom: 0; }

    .toggle {
      position: relative;
      width: 40px;
      height: 22px;
    }

    .toggle input { opacity: 0; width: 0; height: 0; }

    .toggle-slider {
      position: absolute;
      cursor: pointer;
      top: 0; left: 0; right: 0; bottom: 0;
      background: var(--bg-tertiary);
      border-radius: 22px;
      transition: 0.3s;
    }

    .toggle-slider:before {
      content: "";
      position: absolute;
      height: 16px; width: 16px;
      left: 3px; bottom: 3px;
      background: #fff;
      border-radius: 50%;
      transition: 0.3s;
    }

    .toggle input:checked + .toggle-slider { background: var(--accent); }
    .toggle input:checked + .toggle-slider:before { transform: translateX(18px); }

    .test-result {
      margin-top: 8px;
      padding: 8px 12px;
      border-radius: 8px;
      font-size: 0.8rem;
      display: none;
    }

    .test-result.success {
      display: block;
      background: rgba(39, 174, 96, 0.15);
      border: 1px solid var(--success);
      color: var(--success);
    }

    .test-result.error {
      display: block;
      background: rgba(231, 76, 60, 0.15);
      border: 1px solid var(--danger);
      color: var(--danger);
    }

    /* ── Context Management ──────────────────── */
    #context-bar {
      display: none;
      align-items: center;
      gap: 10px;
      padding: 6px 20px;
      background: var(--bg-secondary);
      border-bottom: 1px solid var(--border-color);
      font-size: 0.70rem;
      color: var(--text-secondary);
      flex-shrink: 0;
    }
    #context-bar.visible { display: flex; }
    #context-bar-label { white-space: nowrap; font-weight: 600; display:flex; align-items:center; gap:6px; }
    #context-bar-track {
      flex: 1;
      height: 6px;
      background: var(--bg-tertiary);
      border-radius: 99px;
      overflow: hidden;
      position: relative;
      border: 1px solid var(--border-color);
    }
    #context-bar-fill {
      height: 100%;
      width: 0%;
      background: var(--accent);
      border-radius: 99px;
      transition: width 0.4s ease, background 0.3s ease;
    }
    #context-bar-fill.warn { background: #f39c12; }
    #context-bar-fill.danger { background: var(--danger); }
    #context-bar-text { white-space: nowrap; font-variant-numeric: tabular-nums; min-width: 110px; text-align: right; }
    #context-compacted-badge {
      display: none;
      font-size: 0.65rem;
      background: rgba(108,99,255,0.15);
      border: 1px solid rgba(108,99,255,0.35);
      color: var(--accent);
      padding: 2px 7px;
      border-radius: 20px;
      font-weight: 600;
      white-space: nowrap;
    }
    #context-compacted-badge.on { display: inline-flex; align-items: center; gap: 4px; }
    .context-notice {
      background: rgba(108,99,255,0.18);
      border: 1px solid rgba(108,99,255,0.45);
      color: #e8e7ff;
      font-size: 0.78rem;
      font-weight: 500;
      padding: 10px 14px;
      border-radius: 10px;
      text-align: center;
      margin: 6px 0;
      animation: fadeIn 0.3s ease;
      line-height: 1.5;
      box-shadow: 0 1px 8px rgba(108,99,255,0.15);
    }
    .context-group {
      background: var(--bg-tertiary);
      border: 1px solid var(--border-color);
      border-radius: 10px;
      padding: 14px;
      margin-bottom: 14px;
    }
    .context-group-title {
      font-size: 0.85rem;
      font-weight: 700;
      margin-bottom: 10px;
      display: flex;
      align-items: center;
      gap: 6px;
    }
    .range-row { display:flex; align-items:center; gap:10px; }
    .range-row input[type="range"] { flex:1; accent-color: var(--accent); }
    .range-val {
      min-width: 44px;
      text-align: center;
      background: var(--bg-input);
      border: 1px solid var(--border-color);
      padding: 4px 6px;
      border-radius: 8px;
      font-size: 0.78rem;
      font-weight: 600;
    }
    .context-estimate {
      margin-top: 8px;
      padding: 8px 10px;
      background: var(--bg-input);
      border: 1px solid var(--border-color);
      border-radius: 8px;
      font-size: 0.72rem;
      line-height: 1.5;
      color: var(--text-secondary);
    }
    .context-estimate strong { color: var(--text-primary); }

    /* ── Responsive ──────────────────────────── */
    @media (max-width: 860px) {
      #sidebar {
        position: fixed;
        left: 0; top: 0; bottom: 0;
        z-index: 50;
        transform: translateX(-100%);
        box-shadow: 4px 0 24px rgba(0,0,0,0.4);
      }
      #sidebar.open { transform: translateX(0); }
      #sidebar-backdrop.open { display: block; }
      #menu-btn { display: flex; }
    }
    @media (max-width: 600px) {
      header h1 { font-size: 0.95rem; }
      #chat-container { padding: 12px 10px; gap: 12px; }
      #input-area { padding: 10px 12px; }
    }

    /* ── Light Theme Overrides ───────────────── */
    [data-theme="light"] .code-block-wrapper { background: #0f0f1e; border-color: #2d2d4a; box-shadow: 0 2px 12px rgba(0,0,0,0.15); }
    [data-theme="light"] .code-block-wrapper pre { background: #0f0f1e !important; }
    [data-theme="light"] .code-block-header { background: #1e1e32; color: #c5c6e0; border-bottom-color: #2d2d4a; }
    [data-theme="light"] .thinking-block { background: #f8f9fa; border-color: var(--border-color); }
    [data-theme="light"] .thinking-header { background: #e9ecef; border-bottom-color: var(--border-color); color: var(--text-secondary); }
    [data-theme="light"] .thinking-header:hover { background: #dee2e6; }
    [data-theme="light"] .thinking-content { background: #ffffff; color: #495057; border-top: 1px solid var(--border-color); }
    [data-theme="light"] .thinking-content pre { background: #f1f3f5; border-color: #dee2e6; }
    [data-theme="light"] .bubble code:not(pre code) { background: #e9ecef; }
    [data-theme="light"] #sidebar { box-shadow: 2px 0 12px rgba(0,0,0,0.06); }
    [data-theme="light"] header, [data-theme="light"] #status-bar, [data-theme="light"] #input-area, [data-theme="light"] #context-bar { background: var(--bg-secondary); }
    [data-theme="light"] .context-notice {
      background: rgba(108,99,255,0.14);
      border-color: rgba(108,99,255,0.35);
      color: #3b36a0;
      box-shadow: 0 1px 6px rgba(108,99,255,0.12);
    }

    /* ── Mermaid Diagrams ─────────────────────── */
    .mermaid-wrapper {
      margin: 12px 0;
      border: 1px solid var(--code-block-border);
      border-radius: 10px;
      overflow: hidden;
      background: var(--code-block-bg);
      box-shadow: 0 2px 10px rgba(0,0,0,0.25);
    }
    .mermaid-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 6px 12px;
      background: var(--code-block-header);
      border-bottom: 1px solid var(--code-block-border);
      font-size: 0.7rem;
      font-weight: 600;
      color: #a5a6d6;
      letter-spacing: 0.02em;
    }
    .mermaid-header span { display:flex; align-items:center; gap:6px; }
    .mermaid-header span::before {
      content: ""; width: 8px; height: 8px; border-radius:50%;
      background: var(--accent); opacity:0.9; box-shadow:0 0 6px rgba(108,99,255,0.6);
    }
    .mermaid-actions { display:flex; align-items:center; gap:6px; }
    .mermaid-copy-btn, .mermaid-dl-btn { font-size:0.7rem; padding:3px 8px; }
    .mermaid-dl-btn { background: var(--accent); color:#fff; border-color: var(--accent); }
    .mermaid-dl-btn:hover { background: var(--accent-hover); border-color: var(--accent-hover); filter: brightness(1.05); }
    .mermaid-dl-btn:disabled { opacity:0.6; cursor: not-allowed; }
    .mermaid-wrapper .mermaid {
      display:flex; justify-content:center; align-items:center;
      padding: 18px 14px;
      overflow-x: auto;
      background: #ffffff;
      min-height: 60px;
    }
    [data-theme="dark"] .mermaid-wrapper .mermaid,
    :root:not([data-theme="light"]) .mermaid-wrapper .mermaid {
      background: #1a1a2e;
    }
    .mermaid-wrapper .mermaid svg { max-width:100%; height:auto; }
    .mermaid-error {
      padding: 10px 12px;
      font-size: 0.8rem;
      color: var(--danger);
      background: rgba(231,76,60,0.08);
      border-radius: 8px;
      white-space: pre-wrap;
      word-break: break-word;
      line-height:1.5;
    }
    [data-theme="dark"] .mermaid-wrapper { border-color:#2d2d4a; }
  </style>
</head>
<body>
  <div id="sidebar-backdrop"></div>
  <div id="layout">
    <!-- Sidebar History -->
    <aside id="sidebar">
      <div id="sidebar-header">
        <h2>💬 Riwayat</h2>
      </div>
      <div id="history-list"></div>
      <div id="sidebar-footer">
        <button id="clear-all-btn">🗑️ Hapus semua riwayat</button>
      </div>
    </aside>

    <div id="app">
    <!-- Header -->
    <header>
      <div style="display:flex;align-items:center;gap:10px">
        <button id="menu-btn" title="Menu">☰</button>
        <h1><span>🤖</span>Playground Chat</h1>
      </div>
      <div class="header-actions">
        <button class="btn-icon" id="new-chat-btn" title="Obrolan Baru">➕ Chat baru</button>
        <button class="btn-icon" id="theme-btn" title="Ganti ke Mode Terang">☀️ Terang</button>
        <button class="btn-icon" id="settings-btn" title="Pengaturan">⚙️ Pengaturan</button>
      </div>
    </header>

    <!-- Status Bar -->
    <div id="status-bar">
      <div class="status-dot" id="status-dot"></div>
      <span id="status-text">Not configured</span>
    </div>
    <!-- Context Bar (Auto Compaction) -->
    <div id="context-bar">
      <span id="context-bar-label">🧠 Context</span>
      <div id="context-bar-track"><div id="context-bar-fill"></div></div>
      <span id="context-bar-text">0 / 32k (0%)</span>
      <span id="context-compacted-badge">🗜️ Compacted</span>
      <button id="context-manual-btn" title="Compact sekarang" style="background:var(--bg-tertiary);border:1px solid var(--border-color);color:var(--text-secondary);padding:2px 8px;border-radius:6px;font-size:0.65rem;cursor:pointer;white-space:nowrap;">🗜️ Compact</button>
    </div>

    <!-- Chat -->
    <div id="chat-container">
      <div id="welcome">
        <div class="emoji">💬</div>
        <h2>Bagaimana saya dapat membantu Anda hari ini?</h2>
        <p>Konfigurasikan API Key Anda di Pengaturan terlebih dahulu, lalu mulai mengobrol.</p>
        <div class="quick-prompts">
          <button class="quick-prompt" data-prompt="Explain quantum computing in simple terms">Quantum Computing</button>
          <button class="quick-prompt" data-prompt="Write a Python function to sort a list">Python Sort</button>
          <button class="quick-prompt" data-prompt="Explain the equation $E = mc^2$">E=mc²</button>
          <button class="quick-prompt" data-prompt="What is the integral of $x^2$?">Calculus</button>
        </div>
      </div>
    </div>

    <!-- Input -->
    <div id="input-area">
      <div id="image-preview-bar"></div>
      <div class="input-wrapper">
        <button id="attach-btn" type="button" title="Tambah gambar">+</button>
        <input type="file" id="image-input" accept="image/png,image/jpeg,image/jpg,image/webp,image/gif" multiple hidden />
        <textarea id="user-input" rows="1" placeholder="Tanyakan apa saja"></textarea>
        <button id="stop-btn" title="Hentikan Respon">■</button>
        <button id="send-btn" title="Kirim">➤</button>
      </div>
      <div class="input-hint">Tekan Enter untuk mengirim · Shift+Enter untuk baris baru · Tarik &amp; lepas / tempel untuk tambah gambar</div>
    </div>
  </div>
  </div>

  <!-- Settings Modal -->
  <div class="modal-overlay" id="settings-modal">
    <div class="modal">
      <h2>⚙️ Pengaturan API</h2>

      <div class="form-group">
        <label>API Host (Chat Completions API)</label>
        <input type="text" id="cfg-base-url" placeholder="https://tokenhub-intl.tencentcloudmaas.com/v1" />
        <div class="hint">Jalur <code>/chat/completions</code> akan ditambahkan secara otomatis</div>
      </div>

      <div class="form-group">
        <label>API Key</label>
        <input type="password" id="cfg-api-key" placeholder="API key Anda…" />
        <div class="hint">Bearer token untuk Authorization header</div>
      </div>

      <div class="form-group">
        <label>Model</label>
        <input type="text" id="cfg-model" placeholder="glm-5.3" />
      </div>

      <div class="form-group">
        <label>Temperature</label>
        <input type="number" id="cfg-temperature" min="0" max="2" step="0.1" placeholder="default" />
      </div>

      <div class="form-group">
        <label>Top P</label>
        <input type="number" id="cfg-top-p" min="0" max="1" step="0.01" placeholder="default" />
      </div>

      <div class="form-group">
        <label>Max Tokens</label>
        <input type="number" id="cfg-max-tokens" min="1" max="128000" step="1" placeholder="4096" />
      </div>

      <div class="form-group">
        <label>Reasoning Effort</label>
        <select id="cfg-reasoning-effort">
          <option value="">Default</option>
          <option value="none">none</option>
          <option value="minimal">minimal</option>
          <option value="low">low</option>
          <option value="medium">medium</option>
          <option value="high">high</option>
          <option value="xhigh">xhigh</option>
          <option value="max">max</option>
        </select>
      </div>

      <div class="toggle-row">
        <label>Enable System Prompt</label>
        <label class="toggle">
          <input type="checkbox" id="cfg-system-toggle" />
          <span class="toggle-slider"></span>
        </label>
      </div>

      <div class="form-group" id="system-prompt-group" style="display:none;">
        <label>System Prompt</label>
        <textarea id="cfg-system-prompt" rows="3" placeholder="You are a helpful assistant."></textarea>
      </div>

      <div class="form-group">
        <label>Stream Response</label>
        <select id="cfg-stream">
          <option value="true">Yes (direkomendasikan)</option>
          <option value="false">No</option>
        </select>
      </div>

      <div class="toggle-row">
        <label>Memory (ingat riwayat obrolan)</label>
        <label class="toggle">
          <input type="checkbox" id="cfg-memory-toggle" />
          <span class="toggle-slider"></span>
        </label>
      </div>
      <div class="form-group">
        <div class="hint">Jika diaktifkan, percakapan akan disimpan dalam penyimpanan browser dan dipulihkan saat halaman dimuat ulang. AI akan tetap mempertahankan konteks dari pesan-pesan sebelumnya. Nonaktifkan untuk melupakan semuanya.</div>
      </div>

      <div class="context-group">
        <div class="context-group-title">🧠 Context Management — Auto Compaction</div>

        <div class="form-group" style="margin-bottom:10px;">
          <label>Context Window</label>
          <select id="cfg-context-window">
            <option value="8192">8k</option>
            <option value="16384">16k</option>
            <option value="32768" selected>32k</option>
            <option value="65536">64k</option>
            <option value="128000">128k</option>
            <option value="256000">256k</option>
            <option value="custom">Custom…</option>
          </select>
          <div class="hint">Kapasitas context window model-mu. Menentukan 100% pada bar.</div>
        </div>
        <div class="form-group" id="context-custom-group" style="display:none;">
          <label>Custom Context Window</label>
          <input type="number" id="cfg-context-window-custom" min="1024" max="1000000" step="1024" placeholder="mis. 48000" />
        </div>

        <div class="toggle-row">
          <label>Auto Compaction (otomatis ringkas saat penuh)</label>
          <label class="toggle">
            <input type="checkbox" id="cfg-compaction-toggle" />
            <span class="toggle-slider"></span>
          </label>
        </div>

        <div class="form-group" style="margin-bottom:8px;">
          <label>Compaction Threshold — <span id="cfg-threshold-label">80%</span></label>
          <div class="range-row">
            <input type="range" id="cfg-compaction-threshold" min="50" max="95" step="5" value="80" />
            <span class="range-val" id="cfg-threshold-val">80%</span>
          </div>
        </div>

        <div class="form-group" style="margin-bottom:8px;">
          <label>Strategi Compaction</label>
          <select id="cfg-compaction-strategy">
            <option value="summarize" selected>🧠 Summarize (tanya AI untuk ringkas — paling akurat)</option>
            <option value="truncate">✂️ Truncate (potong pesan tertua — instan & offline)</option>
            <option value="hybrid">⚡ Hybrid (summarize jika online, fallback truncate jika gagal)</option>
          </select>
          <div class="hint"><b>Summarize:</b> kirim pesan lama ke model untuk diringkas. <b>Truncate:</b> buang pesan tertua, simpan N pesan terbaru. <b>Hybrid:</b> coba summarize dulu.</div>
        </div>

        <div class="form-group" style="margin-bottom:0;">
          <label>Keep Recent (pesan terbaru yang selalu dipertahankan)</label>
          <select id="cfg-compaction-keep">
            <option value="4">4 pesan</option>
            <option value="6">6 pesan</option>
            <option value="10" selected>10 pesan</option>
            <option value="16">16 pesan</option>
            <option value="20">20 pesan</option>
          </select>
          <div class="hint">Pesan terbaru ini tidak pernah diringkas/dipotong.</div>
        </div>

        <div class="context-estimate" id="context-estimate-box">Menghitung…</div>
      </div>

      <div class="test-result" id="test-result"></div>

      <div class="modal-actions">
        <button class="btn btn-secondary" id="settings-cancel">Batal</button>
        <button class="btn btn-test" id="settings-test">🧪 Uji</button>
        <button class="btn btn-primary" id="settings-save">💾 Simpan</button>
      </div>
    </div>
  </div>

  <script>
    // ── Default Config (YOUR API) ──────────────
    const DEFAULT_CONFIG = {
      baseUrl: 'https://tokenhub-intl.tencentcloudmaas.com/v1',
      apiKey: '',
      model: 'glm-5.3',
      temperature: null, // null = use API default, not sent in request
      topP: null, // null = use API default, not sent in request
      maxTokens: 4096,
      reasoningEffort: '',
      systemPromptEnabled: true,
      systemPrompt: 'You are a helpful assistant.',
      stream: true,
      memoryEnabled: true,
      // ── Context Management ──────────────────
      contextWindow: 32768,
      contextWindowCustom: '',
      compactionEnabled: true,
      compactionThreshold: 80, // %
      compactionStrategy: 'summarize', // truncate | summarize | hybrid
      compactionKeep: 10,
    };
    let config = { ...DEFAULT_CONFIG };
    let messages = [];
    let isGenerating = false;
    let abortController = null;
    // ── Multimodal (Vision) ────────────────────
    const MAX_IMAGES_PER_MESSAGE = 6;
    const MAX_IMAGE_BYTES = 6 * 1024 * 1024;
    const IMAGE_COMPRESS_MAX_DIM = 1280;
    const IMAGE_COMPRESS_QUALITY = 0.82;
    let pendingImages = [];
    function genImageId(){ return 'img_'+Date.now().toString(36)+Math.random().toString(36).slice(2,6); }
    function formatBytes(b){
      if(b<1024) return b+' B';
      if(b<1024*1024) return (b/1024).toFixed(1)+' KB';
      return (b/1024/1024).toFixed(2)+' MB';
    }
    async function compressImageFile(file, maxDim, quality){
      const mime = file.type || 'image/jpeg';
      // GIF: jangan kompres pakai canvas (animasi hilang) — pakai file asli
      if(mime==='image/gif'){
        return new Promise((res, rej)=>{
          const r=new FileReader();
          r.onload=()=> res({ dataUrl: r.result, mimeType: mime });
          r.onerror=()=> rej(new Error('Gagal baca file'));
          r.readAsDataURL(file);
        });
      }
      if(file.size < 900*1024) {
        return new Promise((res, rej)=>{
          const r=new FileReader();
          r.onload=()=> res({ dataUrl: r.result, mimeType: mime });
          r.onerror=()=> rej(new Error('Gagal baca file'));
          r.readAsDataURL(file);
        });
      }
      return new Promise((res, rej)=>{
        const url = URL.createObjectURL(file);
        const img = new Image();
        img.onload=()=>{
          try{
            let w=img.naturalWidth, h=img.naturalHeight;
            let nw=w, nh=h;
            if(Math.max(w,h) > maxDim){
              if(w>h){ nw=maxDim; nh=Math.round(h*maxDim/w); }
              else { nh=maxDim; nw=Math.round(w*maxDim/h); }
            }
            const canvas=document.createElement('canvas');
            canvas.width=nw; canvas.height=nh;
            const ctx=canvas.getContext('2d');
            ctx.drawImage(img,0,0,nw,nh);
            URL.revokeObjectURL(url);
            let outMime = (mime==='image/png') ? mime : 'image/jpeg';
            if(mime==='image/webp') outMime='image/jpeg';
            let dataUrl;
            try{ dataUrl=canvas.toDataURL(outMime, quality); }catch(e){ dataUrl=canvas.toDataURL('image/jpeg', quality); outMime='image/jpeg'; }
            res({ dataUrl, mimeType: outMime });
          }catch(e){ URL.revokeObjectURL(url); rej(e); }
        };
        img.onerror=()=>{ URL.revokeObjectURL(url); rej(new Error('Gagal load gambar')); };
        img.src=url;
      });
    }
    async function addPendingImages(fileList){
      const files = Array.from(fileList||[]).filter(f=> f && f.type && f.type.startsWith('image/'));
      if(files.length===0){ showMathToast('❌ File bukan gambar'); return; }
      const remain = MAX_IMAGES_PER_MESSAGE - pendingImages.length;
      if(remain <= 0){ showMathToast(`⚠️ Maksimal ${MAX_IMAGES_PER_MESSAGE} gambar per pesan`); return; }
      const toAdd = files.slice(0, remain);
      if(files.length > remain) showMathToast(`⚠️ Hanya ${remain} gambar ditambahkan (maks ${MAX_IMAGES_PER_MESSAGE})`);
      for(const file of toAdd){
        if(file.size > 20*1024*1024){ showMathToast(`❌ ${file.name} terlalu besar (>20MB)`); continue; }
        try{
          showMathToast(`⏳ Memproses ${file.name}…`);
          const { dataUrl, mimeType } = await compressImageFile(file, IMAGE_COMPRESS_MAX_DIM, IMAGE_COMPRESS_QUALITY);
          const approxBytes = Math.ceil((dataUrl.length - 'data:image/jpeg;base64,'.length) * 3/4);
          if(approxBytes > 8*1024*1024){ showMathToast(`❌ ${file.name} hasil compress masih terlalu besar`); continue; }
          pendingImages.push({ id: genImageId(), name: file.name, dataUrl, mimeType, size: approxBytes });
        }catch(e){
          console.warn('compress fail', e);
          showMathToast(`❌ Gagal proses ${file.name}`);
        }
      }
      renderPendingPreview();
    }
    function renderPendingPreview(){
      const bar=document.getElementById('image-preview-bar');
      const btn=document.getElementById('attach-btn');
      if(!bar||!btn) return;
      bar.innerHTML='';
      if(pendingImages.length===0){ bar.classList.remove('visible'); btn.classList.remove('has-images'); btn.title='Tambah gambar (multimodal)'; return; }
      bar.classList.add('visible');
      btn.classList.add('has-images');
      btn.title=`${pendingImages.length} gambar terpilih — klik untuk tambah/hapus`;
      pendingImages.forEach(img=>{
        const wrap=document.createElement('div');
        wrap.className='preview-item';
        const im=document.createElement('img');
        im.src=img.dataUrl;
        im.alt=img.name;
        const info=document.createElement('div');
        info.className='preview-info';
        info.textContent=formatBytes(img.size);
        const rem=document.createElement('button');
        rem.className='preview-remove';
        rem.type='button';
        rem.textContent='✕';
        rem.title='Hapus gambar';
        rem.onclick=()=> removePendingImage(img.id);
        wrap.appendChild(im);
        wrap.appendChild(info);
        wrap.appendChild(rem);
        bar.appendChild(wrap);
      });
      const hint=document.createElement('div');
      hint.style.cssText='font-size:0.68rem;color:var(--text-secondary);align-self:center;margin-left:4px;';
      hint.textContent= pendingImages.length + '/' + MAX_IMAGES_PER_MESSAGE;
      bar.appendChild(hint);
    }
    function removePendingImage(id){
      pendingImages = pendingImages.filter(p=>p.id!==id);
      renderPendingPreview();
    }
    function clearPendingImages(){
      pendingImages=[];
      renderPendingPreview();
      const inp=document.getElementById('image-input');
      if(inp) inp.value='';
    }
    function openImageLightbox(src){
      let lb=document.getElementById('img-lightbox');
      if(!lb){
        lb=document.createElement('div');
        lb.id='img-lightbox';
        const im=document.createElement('img');
        im.alt='preview';
        lb.appendChild(im);
        lb.addEventListener('click',()=> lb.classList.remove('open'));
        document.body.appendChild(lb);
      }
      const im=lb.querySelector('img');
      im.src=src;
      lb.classList.add('open');
    }
    // ── Load / Save Config ─────────────────────
    function loadConfig() {
      try {
        const saved = localStorage.getItem('chatbot_config');
        if (saved) config = { ...DEFAULT_CONFIG, ...JSON.parse(saved) };
        // ── Migrasi legacy: contextWindow angka custom (mis. 48000) → 'custom' + contextWindowCustom
        try {
          const presetVals = ['8192','16384','32768','65536','128000','200000'];
          if (config.contextWindow !== 'custom' && !presetVals.includes(String(config.contextWindow))) {
            const n = parseInt(config.contextWindow);
            if (!isNaN(n) && n >= 1024) {
              config.contextWindowCustom = String(n);
              config.contextWindow = 'custom';
            }
          }
        } catch(e){}
      } catch (e) {}
    }
    function saveConfig() {
      localStorage.setItem('chatbot_config', JSON.stringify(config));
    }

    // ── Context Management — Helpers ───────────
    function getEffectiveContextWindow(){
      try{
        const v = config.contextWindow;
        if(v === 'custom'){
          const c = parseInt(config.contextWindowCustom);
          if(!isNaN(c) && c >= 1024) return c;
          return 32768;
        }
        const n = parseInt(v);
        if(!isNaN(n) && n >= 1024) return n;
        // fallback: jika v tidak valid tapi custom tersimpan
        const c2 = parseInt(config.contextWindowCustom);
        if(!isNaN(c2) && c2 >= 1024) return c2;
        return 32768;
      }catch(e){ return 32768; }
    }
    function estimateTokens(text){
      if(typeof text !== 'string' || !text) return 0;
      // ~4 chars per token + overhead; clamp min 1
      return Math.max(1, Math.ceil(text.length / 4));
    }
    function getMessageText(msg){
      try{
        if(!msg) return '';
        const c = msg.content;
        if(typeof c === 'string') return c;
        if(Array.isArray(c)) return c.filter(p=>p && p.type==='text' && typeof p.text==='string').map(p=>p.text).join('\n');
        return '';
      }catch(e){ return ''; }
    }
    function getMessageImages(msg){
      try{
        if(!msg) return [];
        const c = msg.content;
        if(Array.isArray(c)) return c.filter(p=>p && p.type==='image_url' && p.image_url && p.image_url.url).map(p=>p.image_url.url);
        if(msg.images && Array.isArray(msg.images)) return msg.images;
        return [];
      }catch(e){ return []; }
    }
    function estimateTokensForMessages(list){
      if(!Array.isArray(list) || list.length===0) return 0;
      let total = 0;
      for(const m of list){
        if(!m) continue;
        const text = getMessageText(m);
        const imgs = getMessageImages(m);
        if(text) total += estimateTokens(text) + 4;
        else if(imgs.length) total += 4;
        else if(typeof m.content === 'string') total += estimateTokens(m.content) + 4;
        if(imgs.length) total += imgs.length * 1000;
        if(m.reasoning_content) total += estimateTokens(m.reasoning_content);
        if(m.reasoning) total += estimateTokens(m.reasoning);
      }
      return total;
    }
    function buildRawMessagesSync(){
      const result = [];
      try{
        if(config.systemPromptEnabled && typeof config.systemPrompt==='string' && config.systemPrompt.trim()){
          result.push({ role:'system', content: config.systemPrompt.trim() });
        }
      }catch(e){}
      if(Array.isArray(messages)) result.push(...messages);
      return result;
    }
    function splitForCompaction(raw, keep){
      if(!Array.isArray(raw)) raw=[];
      let sys = null;
      let rest = raw;
      if(raw.length>0 && raw[0] && raw[0].role==='system'){
        sys = raw[0];
        rest = raw.slice(1);
      }
      const k = Math.max(2, parseInt(keep)||10);
      if(rest.length <= k) return { sys, older: [], recent: rest, keep:k };
      return { sys, older: rest.slice(0, rest.length - k), recent: rest.slice(-k), keep:k };
    }
    function truncateCompaction(raw, keep){
      const { sys, older, recent } = splitForCompaction(raw, keep);
      if(!older || older.length===0) return { messages: raw, wasCompacted:false, olderCount:0, strategy:'truncate', savedTokens:0 };
      const saved = estimateTokensForMessages(older);
      const notice = `[Context auto-compacted — ${older.length} pesan lama dihapus untuk hemat ~${saved} tokens. Menampilkan ${recent.length} pesan terbaru. Threshold ${config.compactionThreshold}% dari ${getEffectiveContextWindow()} tokens]`;
      const marker = { role:'system', content: notice };
      const out = [];
      if(sys) out.push(sys);
      out.push(marker);
      out.push(...recent);
      return { messages: out, wasCompacted:true, olderCount: older.length, strategy:'truncate', savedTokens: saved, notice };
    }
    async function summarizeCompaction(raw, keep){
      const { sys, older, recent } = splitForCompaction(raw, keep);
      if(!older || older.length===0) return { messages: raw, wasCompacted:false, olderCount:0, strategy:'summarize', savedTokens:0 };
      if(!config.apiKey || !config.apiKey.trim()){
        // fallback truncate jika tidak ada apiKey
        return truncateCompaction(raw, keep);
      }
      const olderText = older.map(m=>{
        const role = m.role==='user' ? 'User' : m.role==='assistant' ? 'Assistant' : m.role;
        const txt = getMessageText(m).slice(0, 4000);
        const imgs = getMessageImages(m);
        const imgNote = imgs.length ? ` [${imgs.length} gambar]` : '';
        return `${role}${imgNote}: ${txt}`;
      }).join('\n\n---\n\n');
      const prompt = `Ringkas percakapan berikut secara sangat padat dalam Bahasa Indonesia. Pertahankan: fakta penting, nama/entitas, keputusan, preferensi user, konteks yang dibutuhkan untuk melanjutkan percakapan. Jangan tambahkan informasi baru/halu. Maksimal 350 token. Format ringkas bullet points.\n\nPERCAKAPAN LAMA (${older.length} pesan):\n${olderText}`;
      const url = getApiUrl();
      const controller = new AbortController();
      const timeoutId = setTimeout(()=> controller.abort(), 15000);
      try{
        const resp = await fetch(url, {
          method:'POST',
          headers:{ 'Content-Type':'application/json', 'Authorization': `Bearer ${config.apiKey.trim()}` },
          body: JSON.stringify({
            model: config.model,
            messages: [
              { role:'system', content:'You are a concise conversation summarizer. Summarize accurately without hallucination.' },
              { role:'user', content: prompt }
            ],
            max_tokens: 512,
            temperature: 0.2,
            stream: false
          }),
          signal: controller.signal
        });
        clearTimeout(timeoutId);
        if(!resp.ok){
          let t=''; try{ t=await resp.text(); }catch(e){}
          throw new Error('Summarize failed HTTP '+resp.status+' '+t);
        }
        const data = await resp.json();
        let summary = (data.choices && data.choices[0] && (data.choices[0].message?.content || data.choices[0].text)) || '';
        summary = (typeof summary==='string' ? summary.trim() : '');
        if(!summary) throw new Error('Empty summary');
        const saved = Math.max(0, estimateTokensForMessages(older) - estimateTokens(summary));
        const header = `[Ringkasan ${older.length} pesan terdahulu — ${new Date().toLocaleString('id-ID')}]`;
        const marker = { role:'system', content: `${header}\n${summary}` };
        const out = [];
        if(sys) out.push(sys);
        out.push(marker);
        out.push(...recent);
        return { messages: out, wasCompacted:true, olderCount: older.length, strategy:'summarize', savedTokens: saved, summary, notice: header };
      }catch(e){
        clearTimeout(timeoutId);
        // bubble up untuk hybrid fallback
        throw e;
      }
    }
    async function hybridCompaction(raw, keep){
      try{
        return await summarizeCompaction(raw, keep);
      }catch(e){
        console.warn('[Compaction] summarize failed, fallback truncate:', e && e.message);
        return truncateCompaction(raw, keep);
      }
    }
    let lastCompaction = null; // {wasCompacted, olderCount, strategy, savedTokens, ts}
    async function compactIfNeeded(raw){
      try{
        if(!raw || !Array.isArray(raw)) return { messages: raw||[], wasCompacted:false };
        const win = getEffectiveContextWindow();
        const thresholdTokens = Math.floor(win * ( (parseInt(config.compactionThreshold)||80 ) / 100 ));
        const total = estimateTokensForMessages(raw);
        const need = total >= thresholdTokens;
        const enabled = !!config.compactionEnabled;
        const keep = parseInt(config.compactionKeep)||10;
        // selalu update bar bahkan jika tidak compact
        if(!enabled || !need){
          if(!need) lastCompaction = null;
          return { messages: raw, wasCompacted:false, total, win, thresholdTokens, need, enabled };
        }
        let result;
        const strat = (config.compactionStrategy||'truncate');
        if(strat==='summarize') result = await summarizeCompaction(raw, keep);
        else if(strat==='hybrid') result = await hybridCompaction(raw, keep);
        else result = truncateCompaction(raw, keep);
        // safety: jika hasil masih >= threshold, coba truncate lagi dengan keep lebih kecil? lakukan loop truncate sederhana
        let compactedTotal = estimateTokensForMessages(result.messages);
        let attempts = 0;
        while(compactedTotal >= thresholdTokens && attempts < 2 && result.wasCompacted){
          // kurangi keep by 2 dan truncate lagi dari raw original
          const newKeep = Math.max(4, keep - (attempts+1)*2);
          const fallback = truncateCompaction(raw, newKeep);
          if(estimateTokensForMessages(fallback.messages) < compactedTotal){
            result = fallback;
            compactedTotal = estimateTokensForMessages(result.messages);
          }
          attempts++;
        }
        result.total = total;
        result.compactedTotal = compactedTotal;
        result.win = win;
        result.thresholdTokens = thresholdTokens;
        lastCompaction = result.wasCompacted ? { ...result, ts: Date.now() } : null;
        return result;
      }catch(e){
        console.warn('[Compaction] compactIfNeeded error:', e);
        return { messages: raw, wasCompacted:false, error: e && e.message };
      }
    }
    function maybeCompactSyncPreview(raw){
      // preview sinkron untuk UI (hanya truncate, tanpa API)
      try{
        const win = getEffectiveContextWindow();
        const thresholdTokens = Math.floor(win * ( (parseInt(config.compactionThreshold)||80 ) / 100 ));
        const total = estimateTokensForMessages(raw);
        if(total < thresholdTokens || !config.compactionEnabled) return { willCompact:false, total, win, thresholdTokens };
        const keep = parseInt(config.compactionKeep)||10;
        const tr = truncateCompaction(raw, keep);
        return { willCompact:true, total, compactedTotal: estimateTokensForMessages(tr.messages), win, thresholdTokens, saved: tr.savedTokens, older: tr.olderCount };
      }catch(e){ return { willCompact:false }; }
    }
    function updateContextBar(){
      try{
        const bar = document.getElementById('context-bar');
        const fill = document.getElementById('context-bar-fill');
        const text = document.getElementById('context-bar-text');
        const badge = document.getElementById('context-compacted-badge');
        if(!bar||!fill||!text) return;
        const raw = buildRawMessagesSync();
        const win = getEffectiveContextWindow();
        const thresholdTokens = Math.floor(win * ( (parseInt(config.compactionThreshold)||80)/100 ));
        const total = estimateTokensForMessages(raw);
        const pct = win>0 ? Math.min(100, Math.round(total/win*100)) : 0;
        const thresholdPct = parseInt(config.compactionThreshold)||80;
        // show bar when ada pesan atau compaction enabled
        if(raw.length===0){
          bar.classList.remove('visible');
          return;
        }
        bar.classList.add('visible');
        fill.style.width = pct + '%';
        fill.classList.remove('warn','danger');
        if(pct >= thresholdPct) fill.classList.add('danger');
        else if(pct >= Math.max(30, thresholdPct - 20)) fill.classList.add('warn');
        text.textContent = `${total.toLocaleString('id-ID')} / ${win.toLocaleString('id-ID')} (${pct}%)`;
        bar.title = `Context: ${total} tokens / ${win} (threshold ${thresholdPct}% = ${thresholdTokens.toLocaleString('id-ID')}). Strategi: ${config.compactionStrategy} • Keep ${config.compactionKeep}`;
        if(badge){
          if(lastCompaction && lastCompaction.wasCompacted){
            badge.classList.add('on');
            const stratLabel = lastCompaction.strategy==='summarize' ? 'summarized' : lastCompaction.strategy==='hybrid' ? 'hybrid' : 'truncated';
            badge.textContent = `🗜️ Compacted • ${lastCompaction.olderCount} msgs ${stratLabel} • hemat ~${(lastCompaction.savedTokens||0).toLocaleString('id-ID')} tokens`;
            badge.title = `Terakhir compact ${new Date(lastCompaction.ts).toLocaleString('id-ID')} — Strategi: ${lastCompaction.strategy}`;
          } else {
            const preview = maybeCompactSyncPreview(raw);
            if(preview.willCompact){
              badge.classList.add('on');
              badge.style.opacity='0.7';
              badge.textContent = `⚠️ Akan compact saat kirim (hemat ~${(preview.saved||0).toLocaleString('id-ID')} tokens)`;
              badge.title = 'Akan otomatis compact pada pengiriman berikutnya karena melebihi threshold';
            } else {
              badge.classList.remove('on');
            }
          }
        }
      }catch(e){ console.warn('updateContextBar',e); }
    }
    function updateContextEstimateBox(){
      try{
        const box = document.getElementById('context-estimate-box');
        if(!box) return;
        const winSel = document.getElementById('cfg-context-window');
        const winCustom = document.getElementById('cfg-context-window-custom');
        let win = 32768;
        if(winSel){
          if(winSel.value==='custom'){
            const c = parseInt(winCustom && winCustom.value);
            win = (!isNaN(c) && c>=1024) ? c : 32768;
          } else {
            const n = parseInt(winSel.value);
            if(!isNaN(n)) win = n;
          }
        }
        const thrEl = document.getElementById('cfg-compaction-threshold');
        const thr = thrEl ? parseInt(thrEl.value) : (parseInt(config.compactionThreshold)||80);
        const keepEl = document.getElementById('cfg-compaction-keep');
        const keep = keepEl ? parseInt(keepEl.value) : (parseInt(config.compactionKeep)||10);
        const stratEl = document.getElementById('cfg-compaction-strategy');
        const strat = stratEl ? stratEl.value : config.compactionStrategy;
        const toggleEl = document.getElementById('cfg-compaction-toggle');
        const enabled = toggleEl ? toggleEl.checked : !!config.compactionEnabled;
        const raw = buildRawMessagesSync();
        const total = estimateTokensForMessages(raw);
        const thrTokens = Math.floor(win * thr/100);
        const pct = win ? Math.round(total/win*100) : 0;
        const remaining = Math.max(0, win - total);
        const will = enabled && total >= thrTokens;
        let willHtml = '';
        if(will){
          const preview = maybeCompactSyncPreview(raw);
          // preview pakai win lama vs baru? pakai yang di form
          // hitung ulang preview dengan win baru untuk estimasi
          const simRaw = raw;
          const simTrunc = truncateCompaction(simRaw, keep);
          const saved = simTrunc.savedTokens||0;
          const after = total - saved;
          const afterPct = win ? Math.round(after/win*100) : 0;
          willHtml = `<br>⚡ <b>Akan compact</b> saat kirim berikutnya: <b>${strat}</b> • simpan ${keep} terbaru • hemat ~${saved.toLocaleString('id-ID')} tokens → <b>${after.toLocaleString('id-ID')} (${afterPct}%)</b>`;
        }
        box.innerHTML = `<strong>Estimasi context:</strong> ${total.toLocaleString('id-ID')} / ${win.toLocaleString('id-ID')} (${pct}%) • Threshold ${thr}% = ${thrTokens.toLocaleString('id-ID')} tokens • Sisa ${remaining.toLocaleString('id-ID')} tokens • <b>${enabled ? 'Auto ON' : 'Auto OFF'}</b>${willHtml}<br><span style="opacity:0.8">Estimasi pakai ~4 chars/token + 4 per pesan. Ringkas tidak hapus history asli — hanya yang dikirim ke AI yang dipadatkan.</span>`;
      }catch(e){ console.warn('estimateBox',e); }
    }
    function addContextNotice(text){
      try{
        if(!text) return;
        const el = document.createElement('div');
        el.className = 'context-notice';
        el.textContent = text;
        chatContainer.appendChild(el);
        scrollToBottom();
        setTimeout(()=>{ try{ el.style.opacity='0.85'; }catch(e){} }, 2000);
      }catch(e){}
    }

    // ── Chat Sessions (Sidebar History) ────────
    const HISTORY_KEY = 'chatbot_history'; // legacy single-chat
    const SESSIONS_KEY = 'chatbot_sessions';
    const ACTIVE_SESSION_KEY = 'chatbot_active_id';
    let sessions = [];
    let currentSessionId = null;
    function genId(){ return Date.now().toString(36)+Math.random().toString(36).slice(2,7); }
    function fmtDate(ts){ try{ return new Date(ts).toLocaleString('id-ID',{day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit'});}catch(e){ return ''; } }
    function saveSessions(){
      if(!config.memoryEnabled) return;
      try{
        const toSave = sessions.map(s=>{
          // Kompres gambar untuk localStorage: simpan versi terkompresi kecil (sudah 1280px) tapi batasi total
          let msgs = s.messages || [];
          // Hitung size stringify, jika >3.5MB, buang dataUrl besar pada pesan lama (keep only last 2 vision messages)
          try{
            const preview = JSON.stringify(msgs);
            if(preview.length > 3600000){
              let kept=0;
              msgs = msgs.map(m=>{
                if(Array.isArray(m.content) && m.content.some(p=>p.type==='image_url')){
                  if(kept < 2){ kept++; return m; }
                  // strip images -> keep text only
                  const txt=getMessageText(m);
                  return { role:m.role, content: txt || '[gambar dihapus untuk hemat penyimpanan]' };
                }
                return m;
              });
            }
          }catch(e){}
          return { ...s, messages: msgs };
        });
        localStorage.setItem(SESSIONS_KEY, JSON.stringify(toSave));
        if(currentSessionId) localStorage.setItem(ACTIVE_SESSION_KEY, currentSessionId);
      }catch(e){
        // fallback: coba tanpa gambar
        try{
          const fallback = sessions.map(s=> ({ ...s, messages: (s.messages||[]).map(m=> Array.isArray(m.content) ? { role:m.role, content: getMessageText(m)||'[gambar]' } : m) }));
          localStorage.setItem(SESSIONS_KEY, JSON.stringify(fallback));
        }catch(e2){ console.warn('saveSessions fallback fail', e2); }
      }
    }
    function getCurrentSession(){ return sessions.find(s=>s.id===currentSessionId)||null; }
    // ── Auto-Generate Chat Titles ─────────────
    function isPlaceholderTitle(t){
      if(!t || typeof t!=='string') return true;
      const v=t.trim();
      return v==='' || v==='Chat baru' || v==='New Chat' || v==='Percakapan baru' || v==='Percakapan kosong' || v==='—' || v==='Chat tanpa judul';
    }
    function generateLocalTitle(text){
      if(!text || typeof text!=='string') return 'Chat baru';
      let t=text.trim().replace(/\s+/g,' ');
      // hapus fence code & inline code biar judul bersih
      t=t.replace(/```[\s\S]*?```/g,' ').replace(/`[^`]*`/g,' ').replace(/\s+/g,' ').trim();
      if(!t) return 'Chat baru';
      // ambil kalimat pertama yang bermakna
      const m=t.match(/^[^.!?]{8,70}[.!?]/);
      if(m) t=m[0].replace(/[.!?]$/,'').trim();
      // potong max 52 char
      if(t.length>52) t=t.slice(0,52).trim();
      // hilangkan trailing punctuation aneh
      t=t.replace(/[:\-—]+$/,'').trim();
      if(t.length>52) t=t.slice(0,52).trim() + '…';
      else if(t.length>0 && text.trim().length>52) t+='…';
      if(t.length>0) t=t.charAt(0).toUpperCase()+t.slice(1);
      // jika masih terlalu pendek (<2 huruf bermakna) fallback ke preview awal
      if(t.length<2) return 'Chat baru';
      return t || 'Chat baru';
    }
    let _titleGenInProgress=new Set();
    async function autoGenerateTitleForSession(sessionId){
      if(_titleGenInProgress.has(sessionId)) return;
      // butuh apiKey untuk AI title — kalau tidak ada, cukup pakai local (sudah terpasang)
      if(!config.apiKey || !String(config.apiKey).trim()) return;
      const sess=sessions.find(s=>s.id===sessionId);
      if(!sess || !Array.isArray(sess.messages) || sess.messages.length===0) return;
      if(sess._titleSource==='ai') return;
      _titleGenInProgress.add(sessionId);
      try{
        const recent=sess.messages.slice(0,6).map(m=>`${m.role==='user'?'User':'Assistant'}: ${getMessageText(m).slice(0,300)}${getMessageImages(m).length?' [gambar]':''}`).join('\n');
        const prompt=`Buatkan judul chat 3-5 kata yang sangat ringkas, relevan, menarik untuk percakapan ini. Jawab HANYA judulnya tanpa tanda kutip, tanpa awalan "Judul:".\n\n${recent}`;
        const url=getApiUrl();
        const resp=await fetch(url,{
          method:'POST',
          headers:{'Content-Type':'application/json','Authorization':`Bearer ${String(config.apiKey).trim()}`},
          body: JSON.stringify({
            model: config.model,
            messages:[{role:'system',content:'Kamu adalah pembuat judul chat. Balas hanya judul 3-5 kata tanpa kutip.'},{role:'user',content: prompt}],
            max_tokens: 20,
            temperature: 0.7,
            ...(config.topP!==null&&config.topP!==undefined?{top_p:config.topP}:{}),
            stream:false
          })
        });
        if(!resp.ok) throw new Error('title gen failed '+resp.status);
        const data=await resp.json();
        let title=(data.choices?.[0]?.message?.content || data.choices?.[0]?.text || '').trim();
        title=title.replace(/^["'“”`]+|["'“”`]+$/g,'').replace(/^Judul\s*:\s*/i,'').trim();
        title=title.split('\n')[0].trim().slice(0,60).replace(/\s+/g,' ');
        if(title && title.length>=3 && title.length<=60 && !isPlaceholderTitle(title)){
          if(title.toLowerCase()!=='chat baru' && title.toLowerCase()!=='new chat'){
            sess.title=title;
            sess._titleSource='ai';
            // simpan & render — pakai saveSessions yang menghormati memoryEnabled
            try{ if(config.memoryEnabled) localStorage.setItem(SESSIONS_KEY, JSON.stringify(sessions)); }catch(e){}
            renderSidebar();
          }
        }
      }catch(e){ /* silent fallback — local title tetap */ console.warn('[Title] AI gen fallback', e&&e.message); }
      finally{ _titleGenInProgress.delete(sessionId); }
    }
    function scheduleTitleGeneration(sessionId){
      if(!sessionId) return;
      // jadwalkan AI title tanpa blokir — local sudah tampil duluan
      setTimeout(()=>autoGenerateTitleForSession(sessionId), 700);
    }
    function updateCurrentSessionMeta(){
      const s=getCurrentSession(); if(!s) return;
      // sinkronkan array messages ke session
      s.messages = messages;
      s.updatedAt = Date.now();
      if(s.messages.length>0){
        // === PREVIEW: selalu update dari pesan terakhir yang punya isi ===
        let lastWithContent=null;
        for(let i=s.messages.length-1;i>=0;i--){ const t=getMessageText(s.messages[i]).trim(); const imgs=getMessageImages(s.messages[i]); if(t||imgs.length){ lastWithContent=s.messages[i]; break; } }
        if(lastWithContent){
          const raw=getMessageText(lastWithContent).trim();
          const hasImg=getMessageImages(lastWithContent).length>0;
          const prefix = hasImg ? '🖼️ ' : '';
          let p= (prefix + raw).trim().slice(0,60).replace(/\n/g,' ');
          if(raw.length>58) p+='…';
          if(!p) p= hasImg ? '🖼️ Gambar' : '—';
          s.preview=p||'—';
        } else {
          s.preview='—';
        }
        // === TITLE: jika masih placeholder, langsung pakai pesan user pertama ===
        if(isPlaceholderTitle(s.title)){
          const firstUser=s.messages.find(m=>m.role==='user' && (getMessageText(m).trim().length>0 || getMessageImages(m).length>0));
          if(firstUser){
            const txt=getMessageText(firstUser).trim();
            const src = txt || (getMessageImages(firstUser).length ? 'Analisis gambar' : '');
            const local=generateLocalTitle(src);
            if(local && !isPlaceholderTitle(local)){
              s.title=local;
              s._titleSource='local';
              // AI upgrade dijalankan berbarengan, tidak menghalangi tampilnya local
              scheduleTitleGeneration(s.id);
            }
          }
        } else if(s._titleSource==='local' && s.messages.length>=2){
          // sudah ada local, coba upgrade ke AI setelah ada balasan
          scheduleTitleGeneration(s.id);
        }
      } else {
        s.preview='—';
        // jangan reset judul yang sudah terisi manual? biarkan placeholder
      }
    }
    function persistCurrentSession(){
      // FIX: selalu update meta & sidebar untuk UI, walau memory dimatikan
      // (sebelumnya early-return membuat judul/preview tidak pernah ter-update)
      try{ updateCurrentSessionMeta(); }catch(e){ console.warn('updateCurrentSessionMeta',e); }
      if(!config.memoryEnabled){
        // tetap render sidebar agar preview/judul terlihat di sesi aktif walau tidak disimpan permanen
        try{ if(typeof renderSidebar==='function') renderSidebar(); }catch(e){}
        try{ if(typeof updateContextBar==='function') updateContextBar(); }catch(e){}
        return;
      }
      saveSessions();
      if(typeof renderSidebar==='function') renderSidebar();
      try{ if(typeof updateContextBar==='function') updateContextBar(); }catch(e){}
      try{ if(typeof updateContextEstimateBox==='function' && document.getElementById('settings-modal')?.classList.contains('active')) updateContextEstimateBox(); }catch(e){}
    }
    // wrappers legacy agar panggilan lama tidak error
    function saveHistory(){ persistCurrentSession(); }
    function clearHistory(){
      try{ localStorage.removeItem(HISTORY_KEY);}catch(e){}
      try{ localStorage.removeItem(SESSIONS_KEY); localStorage.removeItem(ACTIVE_SESSION_KEY);}catch(e){}
    }
    function restoreHistory(){ /* digantikan restoreSessions() */ }
    // ── DOM Refs ───────────────────────────────
    const chatContainer = document.getElementById('chat-container');
    const welcome = document.getElementById('welcome');
    const userInput = document.getElementById('user-input');
    const sendBtn = document.getElementById('send-btn');
    const stopBtn = document.getElementById('stop-btn');
    const settingsModal = document.getElementById('settings-modal');
    const statusDot = document.getElementById('status-dot');
    const statusText = document.getElementById('status-text');
    const sidebar = document.getElementById('sidebar');
    const historyList = document.getElementById('history-list');
    const sidebarBackdrop = document.getElementById('sidebar-backdrop');

    // ── Sidebar Helpers ────────────────────────
    function openSidebar(){ if(sidebar) sidebar.classList.add('open'); if(sidebarBackdrop) sidebarBackdrop.classList.add('open'); }
    function closeSidebar(){ if(sidebar) sidebar.classList.remove('open'); if(sidebarBackdrop) sidebarBackdrop.classList.remove('open'); }
    function ensureSession(){
      if(!config.memoryEnabled){
        if(!currentSessionId){ currentSessionId = genId(); }
        if(sessions.length===0) sessions=[{id:currentSessionId,title:'Chat baru',preview:'—',updatedAt:Date.now(),messages:messages}];
        return;
      }
      if(sessions.length===0 || !currentSessionId || !getCurrentSession()){
        currentSessionId = genId();
        const s={id:currentSessionId,title:'Chat baru',preview:'—',updatedAt:Date.now(),messages:[]};
        sessions.unshift(s);
        messages = s.messages;
        saveSessions();
      }
    }
    function renderChat(){
      chatContainer.innerHTML='';
      if(messages.length===0){
        chatContainer.appendChild(welcome);
        welcome.style.display='flex';
      } else {
        welcome.style.display='none';
        messages.forEach(m=> {
          const reasoning = getMessageReasoning(m);
          const opts = reasoning ? { reasoning, reasoningDuration: m.reasoningTime } : null;
          addMessage(m.role, m.content, opts);
        });
      }
      scrollToBottom();
    }
    function switchSession(id){
      if(isGenerating && abortController) abortController.abort();
      // save current
      persistCurrentSession();
      const target=sessions.find(s=>s.id===id);
      if(!target) return;
      currentSessionId=id;
      messages = target.messages ? [...target.messages] : [];
      // keep reference synced so pushes affect session
      target.messages = messages;
      try{ localStorage.setItem(ACTIVE_SESSION_KEY, currentSessionId);}catch(e){}
      renderChat();
      renderSidebar();
      closeSidebar();
      updateStatusFromConfig();
      lastCompaction=null;
      try{ updateContextBar(); updateContextEstimateBox(); }catch(e){}
      isGenerating=false;
      sendBtn.style.display='flex';
      stopBtn.style.display='none';
    }
    function createNewSession(){
      if(isGenerating && abortController) abortController.abort();
      // Jangan spam chat kosong: kalau chat aktif masih kosong, pakai saja tanpa buat baru
      const cur=getCurrentSession();
      if(cur && (!cur.messages || cur.messages.length===0) && isPlaceholderTitle(cur.title) && messages.length===0){
        renderSidebar(); renderChat(); closeSidebar(); return;
      }
      persistCurrentSession();
      const id=genId();
      const s={id,title:'Chat baru',preview:'—',updatedAt:Date.now(),messages:[]};
      sessions.unshift(s);
      currentSessionId=id;
      messages = s.messages;
      saveSessions();
      renderChat();
      renderSidebar();
      closeSidebar();
      updateStatusFromConfig();
      lastCompaction=null;
      try{ updateContextBar(); updateContextEstimateBox(); }catch(e){}
      isGenerating=false;
      sendBtn.style.display='flex';
      stopBtn.style.display='none';
    }
    function deleteSession(id, e){
      if(e) e.stopPropagation();
      if(!confirm('Hapus chat ini?')) return;
      const idx=sessions.findIndex(s=>s.id===id);
      if(idx===-1) return;
      sessions.splice(idx,1);
      if(currentSessionId===id){
        if(sessions.length>0){
          currentSessionId=sessions[0].id;
          messages = sessions[0].messages ? [...sessions[0].messages] : [];
          sessions[0].messages = messages;
        } else {
          currentSessionId=genId();
          const ns={id:currentSessionId,title:'Chat baru',preview:'—',updatedAt:Date.now(),messages:[]};
          sessions=[ns];
          messages=ns.messages;
        }
        renderChat();
      }
      saveSessions();
      renderSidebar();
    }
    function renderSidebar(){
      if(!historyList) return;
      // Jangan tampilkan sesi kosong (belum ada pesan) agar tidak terlihat "Chat baru —"
      const visible = sessions.filter(s=> Array.isArray(s.messages) && s.messages.length>0);
      if(visible.length===0){
        historyList.innerHTML='<div class="history-empty">Belum ada riwayat.<br>Klik <b>➕ Chat baru</b> untuk mulai.</div>';
        return;
      }
      historyList.innerHTML='';
      visible.forEach(s=>{
        const btn=document.createElement('button');
        btn.className='history-item'+(s.id===currentSessionId?' active':'');
        btn.onclick=()=> switchSession(s.id);
        const title=document.createElement('div');
        title.className='history-item-title';
        title.textContent=s.title || 'Chat tanpa judul';
        const prev=document.createElement('div');
        prev.className='history-preview';
        prev.textContent=s.preview || '—';
        const date=document.createElement('div');
        date.className='history-date';
        date.textContent=fmtDate(s.updatedAt);
        const del=document.createElement('button');
        del.className='history-delete';
        del.textContent='✕';
        del.title='Hapus';
        del.onclick=(ev)=> deleteSession(s.id, ev);
        btn.appendChild(title);
        btn.appendChild(prev);
        btn.appendChild(date);
        btn.appendChild(del);
        historyList.appendChild(btn);
      });
    }
    function loadSessions(){
      if(!config.memoryEnabled){
        // memory off: single ephemeral session
        sessions=[];
        currentSessionId=null;
        messages=[];
        return;
      }
      try{
        const raw=localStorage.getItem(SESSIONS_KEY);
        const act=localStorage.getItem(ACTIVE_SESSION_KEY);
        if(raw){
          const parsed=JSON.parse(raw);
          if(Array.isArray(parsed)) sessions=parsed;
        }
        // migrate legacy single history if no sessions yet
        if(sessions.length===0){
          const legacy=localStorage.getItem(HISTORY_KEY);
          if(legacy){
            try{
              const arr=JSON.parse(legacy);
              if(Array.isArray(arr) && arr.length>0){
                const msgs=arr.filter(m=> (m.role==='user'||m.role==='assistant') && typeof m.content==='string');
                if(msgs.length>0){
                  const id=genId();
                  const first=msgs.find(m=>m.role==='user');
                  const title= first ? first.content.trim().slice(0,40)+(first.content.trim().length>40?'…':'') : 'Chat lama';
                  sessions=[{id,title,preview:msgs[msgs.length-1].content.trim().slice(0,60),updatedAt:Date.now(),messages:msgs}];
                  currentSessionId=id;
                  saveSessions();
                  localStorage.removeItem(HISTORY_KEY);
                }
              }
            }catch(e){}
          }
        }
        if(act && sessions.find(s=>s.id===act)) currentSessionId=act;
        if(!currentSessionId && sessions.length>0) currentSessionId=sessions[0].id;
        // ── Auto-migrasi: perbaiki riwayat lama yang masih "Chat baru" / "—" padahal sudah ada pesan ──
        try{
          let migrated=false;
          sessions.forEach(s=>{
            if(!Array.isArray(s.messages)) s.messages=[];
            if(s.messages.length>0){
              let lastWithContent=null;
              for(let i=s.messages.length-1;i>=0;i--){ const t=getMessageText(s.messages[i]).trim(); const im=getMessageImages(s.messages[i]); if(t||im.length){ lastWithContent=s.messages[i]; break; } }
              const rawTxt = lastWithContent ? getMessageText(lastWithContent).trim() : '';
              const hasImgLast = lastWithContent ? getMessageImages(lastWithContent).length>0 : false;
              const prefix = hasImgLast ? '🖼️ ' : '';
              const expected = lastWithContent ? ((prefix + rawTxt).trim().slice(0,60).replace(/\n/g,' ') + (rawTxt.length>58?'…':'')) : '—';
              const expFallback = expected || (hasImgLast ? '🖼️ Gambar' : '—');
              if(!s.preview || s.preview==='Percakapan kosong' || s.preview==='—' || s.preview.trim()===''){
                s.preview=expFallback; migrated=true;
              }
              if(isPlaceholderTitle(s.title)){
                const firstUser=s.messages.find(m=>m.role==='user' && (getMessageText(m).trim().length>0 || getMessageImages(m).length>0));
                if(firstUser){
                  const t2=getMessageText(firstUser).trim() || (getMessageImages(firstUser).length?'Analisis gambar':'');
                  const local=generateLocalTitle(t2);
                  if(local && !isPlaceholderTitle(local)){ s.title=local; s._titleSource=s._titleSource||'local'; migrated=true; if(config.apiKey) scheduleTitleGeneration(s.id); }
                }
              }
            } else {
              if(s.preview==='Percakapan kosong') { s.preview='—'; migrated=true; }
            }
          });
          // hapus duplikat sesi kosong (simpan hanya yang aktif)
          const emptyDups = sessions.filter(s=> s.messages.length===0 && isPlaceholderTitle(s.title));
          if(emptyDups.length>1){
            const keepId=currentSessionId;
            const before=sessions.length;
            sessions=sessions.filter(s=> !(s.messages.length===0 && isPlaceholderTitle(s.title) && s.id!==keepId));
            if(sessions.length!==before) migrated=true;
          }
          if(migrated) saveSessions();
        }catch(e){ console.warn('migrate titles',e); }
        if(sessions.length>0 && currentSessionId){
          const cur=getCurrentSession();
          if(cur) messages = cur.messages ? [...cur.messages] : [];
          if(cur) cur.messages = messages;
        }
        if(sessions.length===0){
          currentSessionId=genId();
          const ns={id:currentSessionId,title:'Chat baru',preview:'—',updatedAt:Date.now(),messages:[]};
          sessions=[ns];
          messages=ns.messages;
          saveSessions();
        }
      }catch(e){
        sessions=[];
      }
    }
    // ── Update Status ──────────────────────────
    function updateStatus(connected, text) {
      statusDot.className = 'status-dot' + (connected ? ' connected' : '');
      statusText.textContent = text;
    }
    function updateStatusFromConfig() {
      if (config.apiKey) {
        let host = '';
        try { host = new URL(config.baseUrl).hostname; } catch(e) {
          // fallback: tampilkan baseUrl mentah jika tidak valid
          host = (config.baseUrl || '').replace(/^https?:\/\//,'').split('/')[0] || config.baseUrl;
        }
        updateStatus(true, `Terhubung — ${config.model} @ ${host}`);
      } else {
        updateStatus(false, 'Tidak ada API key — tekan ⚙️ Pengaturan');
      }
    }
    // ── Mermaid Helpers ────────────────────────
    let mermaidReady = false;
    let mermaidIdCounter = 0;
    function getMermaidTheme(){
      try { const t=document.documentElement.getAttribute('data-theme'); return t==='light' ? 'default' : 'dark'; } catch(e){ return 'dark'; }
    }
    function initMermaid(){
      try{
        if(typeof mermaid === 'undefined') return false;
        const theme = getMermaidTheme();
        mermaid.initialize({
          startOnLoad: false,
          theme: theme,
          securityLevel: 'strict',
          fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, Segoe UI, Roboto, sans-serif',
          flowchart: { htmlLabels: true, curve: 'linear', useMaxWidth: true },
          sequence: { useMaxWidth: true },
          gantt: { useMaxWidth: true },
          themeVariables: theme==='dark' ? {
            primaryColor: '#6c63ff',
            primaryTextColor: '#e0e0e0',
            primaryBorderColor: '#6c63ff',
            lineColor: '#a0a0a0',
            secondaryColor: '#2a2a3a',
            tertiaryColor: '#1e1e32',
            background: '#1a1a2e',
            mainBkg: '#2a2a3a',
            textColor: '#e0e0e0',
            darkMode: true
          } : {}
        });
        mermaidReady = true;
        return true;
      }catch(e){ console.warn('mermaid init',e); return false; }
    }
    async function renderMermaids(root){
      try{
        if(typeof mermaid === 'undefined') return;
        if(!mermaidReady) initMermaid();
        initMermaid(); // refresh theme
        const scope = root || document;
        const nodes = scope.querySelectorAll ? scope.querySelectorAll('.mermaid[data-mermaid-source]') : [];
        if(nodes.length===0){
          // also support legacy .mermaid without data attribute (fallback textContent)
          const legacy = scope.querySelectorAll ? scope.querySelectorAll('.mermaid:not([data-mermaid-source])') : [];
          if(legacy.length===0) return;
          for(const el of legacy){
            if(el.dataset.rendered==='true') continue;
            const raw = el.textContent || '';
            if(!raw.trim()) continue;
            el.setAttribute('data-mermaid-source', encodeURIComponent(raw));
          }
        }
        const all = scope.querySelectorAll('.mermaid[data-mermaid-source]');
        for(const el of all){
          if(el.dataset.rendered==='true') continue;
          let raw = '';
          try{ raw = decodeURIComponent(el.getAttribute('data-mermaid-source')||''); }catch(e){ raw = el.textContent||''; }
          if(!raw || !raw.trim()) raw = el.textContent||'';
          raw = raw.trim();
          if(!raw) continue;
          const id = 'mmd-'+(++mermaidIdCounter)+'-'+Date.now()+'-'+Math.random().toString(36).slice(2,5);
          try{
            const { svg } = await mermaid.render(id, raw);
            el.innerHTML = svg;
            el.dataset.rendered='true';
            el.style.background='';
          }catch(e){
            console.warn('mermaid render fail',e);
            const escRaw = raw.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
            el.innerHTML = `<div class="mermaid-error">⚠️ Gagal render Mermaid: ${(e&&e.message||e).toString().slice(0,300)}</div><pre style="white-space:pre-wrap;font-size:0.75rem;opacity:0.75;margin-top:8px;padding:8px;background:var(--bg-tertiary);border-radius:6px;overflow:auto;">${escRaw}</pre>`;
            el.dataset.rendered='true';
          }
        }
      }catch(e){ console.warn('renderMermaids',e); }
    }
    function rerenderAllMermaidsForTheme(){
      try{
        const wrappers = document.querySelectorAll('.mermaid-wrapper');
        wrappers.forEach(w=>{
          const el=w.querySelector('.mermaid');
          if(!el) return;
          const src=w.dataset.mermaidRaw || el.getAttribute('data-mermaid-source') || '';
          let raw='';
          if(src){ try{ raw=decodeURIComponent(src);}catch(e){ raw=src; } }
          else if(el.textContent) raw=el.textContent;
          if(!raw) return;
          // reset to raw text for re-render
          el.removeAttribute('data-rendered');
          el.textContent = raw;
          // ensure source attr exists
          try{ el.setAttribute('data-mermaid-source', encodeURIComponent(raw)); }catch(e){}
          w.dataset.mermaidRaw = raw;
        });
        mermaidReady=false;
        renderMermaids(document);
      }catch(e){ console.warn('rerender theme mermaid',e); }
    }

    // ── Marked Config ──────────────────────────
    const renderer = new marked.Renderer();
    renderer.code = function(codeOrToken, infoString, escaped) {
      let text, lang;
      // Support both marked v12+ (token object {text,lang,escaped}) dan versi lama (string, infoString, escaped)
      if (codeOrToken != null && typeof codeOrToken === 'object' && 'text' in codeOrToken) {
        text = codeOrToken.text;
        lang = codeOrToken.lang;
        escaped = codeOrToken.escaped;
      } else {
        text = codeOrToken;
        lang = (infoString || '').trim().split(/\s+/)[0] || '';
      }
      if (typeof text !== 'string') text = String(text ?? '');
      const language = (lang || 'text').trim() || 'text';
      const lowLang = language.toLowerCase();
      // ── Mermaid: render as diagram, not code ──
      if (lowLang === 'mermaid' || lowLang === 'mm' || lowLang === 'mermaidjs') {
        const raw = text.trimEnd();
        if (!raw.trim()) {
          return `<div class="mermaid-wrapper"><div class="mermaid-error">⚠️ Blok mermaid kosong</div></div>`;
        }
        const enc = encodeURIComponent(raw);
        const escText = raw.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
        return `<div class="mermaid-wrapper" data-mermaid-raw="${enc}">
          <div class="mermaid-header">
            <span>mermaid</span>
            <div class="mermaid-actions">
              <button class="copy-btn mermaid-copy-btn" type="button" data-mermaid-copy="${enc}" title="Salin kode Mermaid">📋 Copy</button>
              <button class="copy-btn mermaid-dl-btn" type="button" title="Download diagram sebagai PNG">⬇️ PNG</button>
            </div>
          </div>
          <div class="mermaid" data-mermaid-source="${enc}">${escText}</div>
        </div>`;
      }
      let highlighted;
      try {
        if (language !== 'text' && typeof hljs !== 'undefined' && hljs.getLanguage(language)) {
          highlighted = hljs.highlight(text, { language }).value;
        } else if (typeof hljs !== 'undefined') {
          highlighted = hljs.highlightAuto(text).value;
        } else {
          throw new Error('hljs missing');
        }
      } catch (e) {
        highlighted = text.replace(/&/g,'&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
      }
      const escLang = language.replace(/"/g,'&quot;');
      return `<div class="code-block-wrapper">
        <div class="code-block-header">
          <span>${escLang}</span>
          <button class="copy-btn" type="button">📋 Copy</button>
        </div>
        <pre><code class="hljs language-${escLang}">${highlighted}</code></pre>
      </div>`;
    };
    marked.setOptions({
      renderer,
      breaks: true,
      gfm: true,
    });
    // ── Copy Code (plain text saja) ─────────────
    function copyTextFallback(text) {
      try {
        const ta = document.createElement('textarea');
        ta.value = text;
        ta.style.position = 'fixed';
        ta.style.left = '-9999px';
        ta.style.top = '0';
        document.body.appendChild(ta);
        ta.focus();
        ta.select();
        const ok = document.execCommand('copy');
        ta.remove();
        return ok;
      } catch(e) { return false; }
    }
    async function copyCode(btn) {
      if (!btn) return;
      const codeEl = btn.closest('.code-block-wrapper')?.querySelector('code');
      const code = codeEl ? codeEl.textContent : '';
      const original = btn.textContent;
      let success = false;
      try {
        if (navigator.clipboard && navigator.clipboard.writeText) {
          await navigator.clipboard.writeText(code);
          success = true;
        } else {
          success = copyTextFallback(code);
        }
      } catch(e) {
        success = copyTextFallback(code);
      }
      if (success) {
        btn.textContent = '✅ Copied!';
        setTimeout(() => { btn.textContent = '📋 Copy'; }, 2000);
      } else {
        btn.textContent = '❌ Gagal';
        setTimeout(() => { btn.textContent = original; }, 2000);
      }
    }
    try { window.copyCode = copyCode; } catch(e) {}
    async function copyMermaid(btn){
      if(!btn) return;
      let raw='';
      try{ raw=decodeURIComponent(btn.getAttribute('data-mermaid-copy')||''); }catch(e){ raw=''; }
      if(!raw){
        const wrap=btn.closest('.mermaid-wrapper');
        if(wrap && wrap.dataset.mermaidRaw){
          try{ raw=decodeURIComponent(wrap.dataset.mermaidRaw); }catch(e){ raw=wrap.dataset.mermaidRaw; }
        } else if(wrap){
          const el=wrap.querySelector('.mermaid');
          if(el) raw=el.getAttribute('data-mermaid-source')?decodeURIComponent(el.getAttribute('data-mermaid-source')):(el.textContent||'');
        }
      }
      raw=(raw||'').trim();
      if(!raw) return;
      const original=btn.textContent;
      let success=false;
      try{
        if(navigator.clipboard && navigator.clipboard.writeText){ await navigator.clipboard.writeText(raw); success=true; }
        else success=copyTextFallback(raw);
      }catch(e){ success=copyTextFallback(raw); }
      if(success){ btn.textContent='✅ Copied!'; setTimeout(()=>{ btn.textContent='📋 Copy'; },2000); }
      else { btn.textContent='❌ Gagal'; setTimeout(()=>{ btn.textContent=original; },2000); }
    }
    try{ window.copyMermaid=copyMermaid; }catch(e){}
    // ── Download Mermaid as PNG ──────────────
    function triggerBlobDownload(blob, filename){
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      setTimeout(()=>{ URL.revokeObjectURL(url); a.remove(); }, 1200);
    }
    async function downloadMermaidPNG(btn){
      if(!btn) return;
      const wrapper = btn.closest('.mermaid-wrapper');
      if(!wrapper) return;
      const container = wrapper.querySelector('.mermaid');
      if(!container){ showMathToast('❌ Container diagram tidak ditemukan'); return; }
      const svg = container.querySelector('svg');
      if(!svg){
        const isErr = container.querySelector('.mermaid-error');
        if(isErr) showMathToast('❌ Diagram gagal render — perbaiki syntax dulu');
        else showMathToast('⏳ Diagram masih dirender, coba lagi 1 detik');
        return;
      }
      if(container.querySelector('.mermaid-error')){
        showMathToast('❌ Diagram error — tidak bisa didownload');
        return;
      }
      const origText = btn.textContent;
      btn.textContent = '⏳ Rendering…';
      btn.disabled = true;
      try{
        // Clone & ensure attrs
        const clone = svg.cloneNode(true);
        if(!clone.getAttribute('xmlns')) clone.setAttribute('xmlns','http://www.w3.org/2000/svg');
        if(!clone.getAttribute('xmlns:xlink')) clone.setAttribute('xmlns:xlink','http://www.w3.org/1999/xlink');
        // Detect background
        let bg = '#ffffff';
        try{
          const cs = getComputedStyle(container);
          const cbg = cs.backgroundColor;
          if(cbg && cbg !== 'rgba(0, 0, 0, 0)' && cbg !== 'transparent') bg = cbg;
          else bg = (getMermaidTheme()==='dark' ? '#1a1a2e' : '#ffffff');
        }catch(e){ bg = (getMermaidTheme()==='dark' ? '#1a1a2e' : '#ffffff'); }
        // Dimensions - use bounding rect with fallback to viewBox
        let w=0,h=0;
        try{
          const rect = svg.getBoundingClientRect();
          w = Math.ceil(rect.width);
          h = Math.ceil(rect.height);
        }catch(e){}
        if(!w || !h || w < 10 || h < 10){
          const vb = clone.viewBox && clone.viewBox.baseVal;
          if(vb && vb.width && vb.height){ w=Math.ceil(vb.width); h=Math.ceil(vb.height); }
          else{
            w = parseInt(clone.getAttribute('width')) || parseInt(svg.getAttribute('width')) || 800;
            h = parseInt(clone.getAttribute('height')) || parseInt(svg.getAttribute('height')) || 600;
            if(isNaN(w)||w<10) w=800;
            if(isNaN(h)||h<10) h=600;
          }
        }
        const pad = 16;
        w += pad*2; h += pad*2;
        const scale = Math.min(3, Math.max(2, (window.devicePixelRatio||1)*1.5));
        // Ensure clone has explicit size & viewBox
        clone.setAttribute('width', String(w));
        clone.setAttribute('height', String(h));
        if(!clone.getAttribute('viewBox')){
          // Try to keep original viewBox if exists
          const origVB = svg.getAttribute('viewBox');
          if(origVB) clone.setAttribute('viewBox', origVB);
          else clone.setAttribute('viewBox', `0 0 ${w} ${h}`);
        }
        // Add background rect as first child to ensure PNG has bg (instead of transparent)
        try{
          const bgRect = document.createElementNS('http://www.w3.org/2000/svg','rect');
          bgRect.setAttribute('x','0'); bgRect.setAttribute('y','0');
          bgRect.setAttribute('width','100%'); bgRect.setAttribute('height','100%');
          bgRect.setAttribute('fill', bg);
          clone.insertBefore(bgRect, clone.firstChild);
        }catch(e){}
        // Fix foreignObject HTML not styled when exported: inline critical styles
        // Note: mermaid's CSS is inside <style> in SVG so it's preserved
        const serializer = new XMLSerializer();
        let svgStr = serializer.serializeToString(clone);
        if(!svgStr.startsWith('<?xml')) svgStr = '<?xml version="1.0" encoding="UTF-8"?>\n' + svgStr;
        const svgBlob = new Blob([svgStr], {type:'image/svg+xml;charset=utf-8'});
        const url = URL.createObjectURL(svgBlob);
        // Detect foreignObject for warning
        const hasForeign = !!svg.querySelector('foreignObject');
        await new Promise((resolve, reject)=>{
          const img = new Image();
          img.onload = ()=>{
            try{
              const canvas = document.createElement('canvas');
              canvas.width = Math.ceil(w * scale);
              canvas.height = Math.ceil(h * scale);
              const ctx = canvas.getContext('2d');
              if(!ctx) throw new Error('Canvas 2D tidak tersedia');
              // High quality
              ctx.imageSmoothingEnabled = true;
              ctx.imageSmoothingQuality = 'high';
              // Scale context so we can draw at logical size
              ctx.scale(scale, scale);
              // Fill bg (sudah ada rect, tapi fill lagi untuk jaga)
              ctx.fillStyle = bg;
              ctx.fillRect(0,0,w,h);
              // Draw image - img size is w x h
              ctx.drawImage(img, 0, 0, w, h);
              URL.revokeObjectURL(url);
              // Check if canvas is blank (foreignObject blocked)?
              // Simple heuristic: getImageData may throw if tainted
              try{
                ctx.getImageData(0,0,1,1);
              }catch(e){
                throw new Error('Canvas tainted — browser memblokir foreignObject. Coba download SVG lalu convert manual.');
              }
              canvas.toBlob((blob)=>{
                if(!blob){ reject(new Error('Gagal membuat PNG blob')); return; }
                // If hasForeign and blob is suspiciously small, warn but still download
                const ts = new Date().toISOString().slice(0,19).replace(/[:T]/g,'-');
                triggerBlobDownload(blob, `mermaid-${ts}.png`);
                resolve();
              }, 'image/png', 1.0);
            }catch(err){
              URL.revokeObjectURL(url);
              reject(err);
            }
          };
          img.onerror = ()=>{
            URL.revokeObjectURL(url);
            reject(new Error('Gagal load SVG sebagai image — kemungkinan foreignObject diblokir. Coba gunakan Download SVG.'));
          };
          // Important: no crossOrigin for blob URL
          img.src = url;
          // Timeout guard
          setTimeout(()=>{ if(!img.complete) reject(new Error('Timeout load SVG')); }, 8000);
        });
        if(hasForeign){
          showMathToast('✅ PNG didownload! <span style="opacity:0.85;font-size:0.78rem;display:block;margin-top:4px">Catatan: diagram pakai HTML labels — jika teks hilang, klik kanan diagram → Copy SVG lalu export di https://mermaid.live</span>');
        } else {
          showMathToast('✅ <b>PNG berhasil didownload</b> — cek folder Download');
        }
        btn.textContent = '✅ Saved!';
        setTimeout(()=>{ btn.textContent = origText; btn.disabled=false; }, 2000);
      }catch(err){
        console.warn('[Mermaid PNG]', err);
        btn.textContent = '❌ Gagal';
        btn.disabled = false;
        showMathToast(`❌ Gagal export PNG: ${(err&&err.message||err).toString().slice(0,180)}<br><span style="opacity:0.85;font-size:0.75rem">Fallback: klik kanan diagram → Save sebagai SVG, atau coba lagi setelah ganti ke Light mode.</span>`);
        setTimeout(()=>{ btn.textContent = origText; }, 2500);
        // Fallback: offer SVG download
        try{
          const svgEl = wrapper.querySelector('.mermaid svg');
          if(svgEl){
            const ser = new XMLSerializer();
            const s = ser.serializeToString(svgEl);
            const b = new Blob([s], {type:'image/svg+xml'});
            // Auto trigger SVG download as fallback after 600ms
            setTimeout(()=>{
              if(confirm('PNG gagal — download sebagai SVG (.svg) sebagai fallback?')) triggerBlobDownload(b, `mermaid-${Date.now()}.svg`);
            }, 400);
          }
        }catch(e){}
      }
    }
    try{ window.downloadMermaidPNG=downloadMermaidPNG; }catch(e){}
    // ── Copy Math ke Word ── klik langsung pada rumus (tanpa tombol) ────
    function showMathToast(html){
      const toast = document.createElement('div');
      toast.className = 'math-copy-toast';
      toast.innerHTML = html;
      document.body.appendChild(toast);
      setTimeout(()=> { toast.style.opacity='0'; toast.style.transition='opacity 0.4s'; setTimeout(()=> toast.remove(), 400); }, 2600);
    }
    async function copyMathToWord(wrapper){
      if(!wrapper || !wrapper.classList.contains('math-wrapper')) return;
      const latex = decodeURIComponent(wrapper.dataset.latex || '');
      if(!latex) return;
      const isDisplay = wrapper.dataset.display === 'true';
      let mathml = '';
      try{
        if(typeof katex !== 'undefined'){
          mathml = katex.renderToString(latex, { displayMode: isDisplay, output: 'mathml', throwOnError: false });
        }
      }catch(e){ mathml = ''; }
      const htmlForWord = mathml || wrapper.querySelector('.math-render')?.innerHTML || latex;
      let success = false;
      try{
        if(navigator.clipboard && window.ClipboardItem){
          const htmlBlob = new Blob([htmlForWord], { type: 'text/html' });
          const textBlob = new Blob([latex], { type: 'text/plain' });
          await navigator.clipboard.write([new ClipboardItem({ 'text/html': htmlBlob, 'text/plain': textBlob })]);
          success = true;
        } else if(navigator.clipboard && navigator.clipboard.writeText){
          await navigator.clipboard.writeText(latex);
          success = true;
        } else {
          success = copyTextFallback(latex);
        }
      }catch(e){
        try{ await navigator.clipboard.writeText(latex); success = true; }catch(e2){ success = copyTextFallback(latex); }
      }
      // feedback visual pada rumus
      wrapper.classList.add('copied');
      setTimeout(()=> wrapper.classList.remove('copied'), 900);
      if(success){
        showMathToast('✅ <b>Rumus tersalin</b>');
        if(!localStorage.getItem('math_copy_hint_shown')){
          localStorage.setItem('math_copy_hint_shown','1');
          setTimeout(()=> showMathToast('💡 <b>Tips Word:</b> jika menempel sebagai teks, pakai <b>Paste Special → HTML</b> atau paste di dalam Equation (<b>Alt+=</b>)'), 1800);
        }
      } else {
        showMathToast('❌ Gagal menyalin rumus');
      }
    }
    // ── Math wrapper helper ──
    function wrapMathHtml(katexHtml, latex, isDisplay){
      const enc = encodeURIComponent(latex || '');
      const cls = isDisplay ? 'math-wrapper display' : 'math-wrapper';
      return `<span class="${cls}" role="button" tabindex="0" data-latex="${enc}" data-display="${isDisplay ? 'true' : 'false'}" title="Klik untuk menyalin rumus ke Word" aria-label="Klik untuk menyalin rumus"><span class="math-render">${katexHtml}</span></span>`;
    }
    function wrapMathFallback(latex, isDisplay, delimiters){
      const enc = encodeURIComponent(latex || '');
      const cls = isDisplay ? 'math-wrapper display' : 'math-wrapper';
      const safe = (delimiters[0] + latex + delimiters[1]).replace(/</g,'&lt;').replace(/>/g,'&gt;');
      return `<span class="${cls}" role="button" tabindex="0" data-latex="${enc}" data-display="${isDisplay ? 'true' : 'false'}" title="Klik untuk menyalin rumus ke Word" aria-label="Klik untuk menyalin rumus"><span class="math-render">${safe}</span></span>`;
    }
    // Delegated click — klik rumus langsung menyalin (tanpa tombol)
    document.addEventListener('click', (e) => {
      const mathEl = e.target.closest?.('.math-wrapper');
      if(mathEl){
        // Jangan ganggu seleksi teks di bubble chat
        try { if(window.getSelection && String(window.getSelection().toString()).trim()) return; } catch(_){}
        e.preventDefault();
        copyMathToWord(mathEl);
        return;
      }
      const dlBtn = e.target.closest?.('.mermaid-dl-btn');
      if(dlBtn){
        e.preventDefault();
        downloadMermaidPNG(dlBtn);
        return;
      }
      const mermaidBtn = e.target.closest?.('.mermaid-copy-btn');
      if(mermaidBtn){
        e.preventDefault();
        copyMermaid(mermaidBtn);
        return;
      }
      const btn = e.target.closest?.('.copy-btn');
      if (!btn) return;
      if (!btn.closest('.code-block-wrapper')) return;
      e.preventDefault();
      copyCode(btn);
    });
    // Aksesibilitas: Enter / Space pada rumus juga menyalin
    document.addEventListener('keydown', (e) => {
      if(e.key !== 'Enter' && e.key !== ' ') return;
      const mathEl = e.target.closest?.('.math-wrapper');
      if(!mathEl) return;
      e.preventDefault();
      copyMathToWord(mathEl);
    });
    // ── Render Markdown + LaTeX ────────────────
    function renderContent(text, targetEl) {
      // 🔥 FIX: guard jika text undefined/null, atau targetEl tidak ada
      if (typeof text !== 'string' || !targetEl) {
        if (targetEl) targetEl.innerHTML = '';
        return;
      }
      // Fallback jika library CDN gagal load
      if (typeof marked === 'undefined') {
        targetEl.textContent = text;
        return;
      }
      // ── FIX placeholder bug: lindungi blok kode dulu agar math di dalamnya tidak jadi placeholder ──
      const codeBlocks = [];
      let processed = text;
      // 1. Simpan fenced code blocks ```...``` dan ~~~...~~~
      processed = processed.replace(/```[\s\S]*?```/g, (m) => {
        codeBlocks.push(m);
        return `%%CODEBLOCK_${codeBlocks.length - 1}%%`;
      });
      processed = processed.replace(/~~~[\s\S]*?~~~/g, (m) => {
        codeBlocks.push(m);
        return `%%CODEBLOCK_${codeBlocks.length - 1}%%`;
      });
      // 2. Simpan inline code `...` / ``...`` / ```...``` (sisa) — harus setelah fenced
      processed = processed.replace(/(`+)([^\n]*?)\1/g, (m) => {
        codeBlocks.push(m);
        return `%%CODEBLOCK_${codeBlocks.length - 1}%%`;
      });

      // Protect display math $$...$$ from markdown (sekarang aman, kode sudah dilindungi)
      const displayMath = [];
      processed = processed.replace(/\$\$([\s\S]*?)\$\$/g, (match, p1) => {
        displayMath.push(p1);
        return `%%DISPLAYMATH_${displayMath.length - 1}%%`;
      });
      // Protect inline math $...$ — poin 6: hindari salah render harga seperti $5 atau "$5 dan $10"
      const inlineMath = [];
      processed = processed.replace(/(?<!\\)\$(?!\s)([^\$\n]+?)(?<!\s)(?<!\\)\$/g, (match, p1, offset, full) => {
        const trimmed = (p1 || '').trim();
        if (!trimmed) return match;
        // Skip jika isi hanya angka/harga: "5", "10", "5.000", "5,000"
        if (/^[\d\s.,]+$/.test(trimmed)) return match;
        // Skip pola harga "5 dan 10" / "5 and 10" tanpa simbol math
        if (/^[\d.,]+\s+(dan|and)\s+[\d.,]+$/i.test(trimmed)) return match;
        // Buka $ yang diikuti digit (mis. $5) — anggap harga kecuali mengandung simbol math eksplisit
        const startsWithDigit = /^\d/.test(trimmed);
        const hasMathSymbol = /[\\=^_{}\[\]]/.test(p1);
        if (startsWithDigit && !hasMathSymbol) return match;
        // Pastikan tidak diawali/diakhiri spasi sudah dicek via lookaround, simpan
        inlineMath.push(p1);
        return `%%INLINEMATH_${inlineMath.length - 1}%%`;
      });
      // 🔥 FIX: Regex untuk \(...\) — hanya match escaped version, bukan (...) biasa
      const inlineMath2 = [];
      processed = processed.replace(/\\\(([\s\S]*?)\\\)/g, (match, p1) => {
        inlineMath2.push(p1);
        return `%%INLINEMATH2_${inlineMath2.length - 1}%%`;
      });
      // 🔥 FIX: Regex untuk \[...\] — hanya match escaped version, bukan [...] biasa
      const displayMath2 = [];
      processed = processed.replace(/\\\[([\s\S]*?)\\\]/g, (match, p1) => {
        displayMath2.push(p1);
        return `%%DISPLAYMATH2_${displayMath2.length - 1}%%`;
      });
      // Parse markdown — amankan jika processed bukan string
      let html = '';
      try {
        html = marked.parse(processed);
      } catch (e) {
        console.warn('[Chatbot] marked.parse error:', e);
        html = processed.replace(/</g, '&lt;').replace(/>/g, '&gt;');
      }
      // Restore LaTeX — guard jika KaTeX gagal load (pakai split/join agar global)
      const doReplace = (placeholder, rendered) => {
        const pWrap = `<p>${placeholder}</p>`;
        if (html.includes(pWrap)) html = html.split(pWrap).join(rendered);
        if (html.includes(placeholder)) html = html.split(placeholder).join(rendered);
      };
      // Semua rumus dirender inline agar tidak memotong kalimat (tidak pakai blok)
      displayMath.forEach((m, i) => {
        const ph = `%%DISPLAYMATH_${i}%%`;
        try {
          if (typeof katex === 'undefined') throw new Error('katex missing');
          const rendered = katex.renderToString(m, { displayMode: false, throwOnError: false });
          doReplace(ph, wrapMathHtml(rendered, m, false));
        } catch (e) {
          doReplace(ph, wrapMathFallback(m, false, ['$$','$$']));
        }
      });
      inlineMath.forEach((m, i) => {
        const ph = `%%INLINEMATH_${i}%%`;
        try {
          if (typeof katex === 'undefined') throw new Error('katex missing');
          const rendered = katex.renderToString(m, { displayMode: false, throwOnError: false });
          doReplace(ph, wrapMathHtml(rendered, m, false));
        } catch (e) {
          doReplace(ph, wrapMathFallback(m, false, ['$', '$']));
        }
      });
      inlineMath2.forEach((m, i) => {
        const ph = `%%INLINEMATH2_${i}%%`;
        try {
          if (typeof katex === 'undefined') throw new Error('katex missing');
          const rendered = katex.renderToString(m, { displayMode: false, throwOnError: false });
          doReplace(ph, wrapMathHtml(rendered, m, false));
        } catch (e) {
          doReplace(ph, wrapMathFallback(m, false, ['\\(','\\)']));
        }
      });
      displayMath2.forEach((m, i) => {
        const ph = `%%DISPLAYMATH2_${i}%%`;
        try {
          if (typeof katex === 'undefined') throw new Error('katex missing');
          const rendered = katex.renderToString(m, { displayMode: false, throwOnError: false });
          doReplace(ph, wrapMathHtml(rendered, m, false));
        } catch (e) {
          doReplace(ph, wrapMathFallback(m, false, ['\\[','\\]']));
        }
      });
      // Restore code blocks — render ulang via marked agar tetap dapat highlight & wrapper
      codeBlocks.forEach((code, i) => {
        const ph = `%%CODEBLOCK_${i}%%`;
        let renderedCode = '';
        try {
          renderedCode = marked.parse(code);
        } catch (e) {
          renderedCode = `<pre><code>${code.replace(/</g,'&lt;').replace(/>/g,'&gt;')}</code></pre>`;
        }
        const isFenced = /^\s*(```|~~~)/.test(code);
        // Inline code: buang wrapper <p> agar tetap inline di dalam kalimat (fix baris baru)
        if (!isFenced) {
          const m = renderedCode.trim().match(/^<p>([\s\S]*?)<\/p>\s*$/);
          if (m) renderedCode = m[1].trim();
        }
        const pWrap = `<p>${ph}</p>`;
        if (html.includes(pWrap)) {
          html = html.split(pWrap).join(renderedCode);
        } else if (html.includes(ph)) {
          html = html.split(ph).join(renderedCode);
        }
      });
      // Hapus <br> yang mengapit inline <code> agar `Hello World` tidak loncat baris sendiri
      // Kasus: "teks<br><code>...</code><br>teks" -> "teks <code>...</code> teks"
      // Jaga tanda baca: " <code>a</code>, lalu" -> "<code>a</code>, lalu" (tanpa spasi sebelum koma)
      html = html.replace(/<br>\s*(<code[^>]*>)/g, ' $1');
      html = html.replace(/(<\/code>)\s*<br>\s*/g, '$1 ');
      html = html.replace(/(<\/code>)\s+([,.;:!?)\]])/g, '$1$2');
      html = html.replace(/(<\/code>)\s{2,}/g, '$1 ');
      // Kompatibilitas: bersihkan sisa placeholder lama jika ada (mis. dari cache atau streaming terpotong)
      // Jika masih ada placeholder lama tanpa underscore, kembalikan jadi teks asli agar tidak tampil %%...%%
      html = html.replace(/%%DISPLAYMATH(\d+)%%/g, (m, n) => {
        const idx = parseInt(n, 10);
        return displayMath[idx] !== undefined ? `$$${displayMath[idx]}$$` : m;
      });
      html = html.replace(/%%INLINEMATH(\d+)%%/g, (m, n) => {
        const idx = parseInt(n, 10);
        return inlineMath[idx] !== undefined ? `$${inlineMath[idx]}$` : m;
      });
      html = html.replace(/%%DISPLAYMATH2(\d+)%%/g, (m, n) => {
        const idx = parseInt(n, 10);
        return displayMath2[idx] !== undefined ? `\\[${displayMath2[idx]}\\]` : m;
      });
      html = html.replace(/%%INLINEMATH2(\d+)%%/g, (m, n) => {
        const idx = parseInt(n, 10);
        return inlineMath2[idx] !== undefined ? `\\(${inlineMath2[idx]}\\)` : m;
      });
      // 🔥 FIX: Bersihkan sisa placeholder varian baru (dengan underscore)
      // yang tidak berhasil diganti karena streaming terpotong atau parsing error.
      // Ini menjamin tidak ada teks mentah seperti %%INLINEMATH_0%% tersisa di DOM.
      // Gunakan safeRenderMath yang sudah ada (try/catch di dalam wrapMathHtml/wrapMathFallback).
      const safeRenderMath = (latexStr, isDisplay, delims) => {
        try {
          if (typeof katex !== 'undefined') {
            const rendered = katex.renderToString(latexStr, { displayMode: false, throwOnError: false });
            return wrapMathHtml(rendered, latexStr, isDisplay);
          }
        } catch (e) {
          // fallthrough to fallback
        }
        return wrapMathFallback(latexStr, isDisplay, delims);
      };
      html = html.replace(/%%DISPLAYMATH_(\d+)%%/g, (m, n) => {
        const idx = parseInt(n, 10);
        return displayMath[idx] !== undefined ? safeRenderMath(displayMath[idx], true, ['$$','$$']) : m;
      });
      html = html.replace(/%%INLINEMATH_(\d+)%%/g, (m, n) => {
        const idx = parseInt(n, 10);
        return inlineMath[idx] !== undefined ? safeRenderMath(inlineMath[idx], false, ['$','$']) : m;
      });
      html = html.replace(/%%DISPLAYMATH2_(\d+)%%/g, (m, n) => {
        const idx = parseInt(n, 10);
        return displayMath2[idx] !== undefined ? safeRenderMath(displayMath2[idx], true, ['\\[','\\]']) : m;
      });
      html = html.replace(/%%INLINEMATH2_(\d+)%%/g, (m, n) => {
        const idx = parseInt(n, 10);
        return inlineMath2[idx] !== undefined ? safeRenderMath(inlineMath2[idx], false, ['\\(','\\)']) : m;
      });
      // ── Poin 4: XSS sanitization ──
      // Bersihkan HTML hasil markdown + KaTeX + Mermaid sebelum dimasukkan ke DOM
      // Izinkan wrapper rumus Word (span role=button + data-latex) & Mermaid wrapper
      try {
        if (typeof DOMPurify !== 'undefined') {
          html = DOMPurify.sanitize(html, {
            USE_PROFILES: { html: true, svg: true, mathMl: true },
            ADD_TAGS: ['span','button','div','pre','code','math','semantics','mrow','mi','mo','mn','msup','msub','msubsup','mfrac','msqrt','mroot','mtext','mtable','mtr','mtd','annotation','svg','g','path','rect','circle','ellipse','polygon','polyline','line','text','tspan','foreignObject','defs','marker','style'],
            ADD_ATTR: ['class', 'aria-hidden', 'style', 'data-latex', 'data-display', 'title', 'type', 'encoding', 'xmlns', 'role', 'tabindex', 'data-mermaid-source', 'data-mermaid-copy', 'data-mermaid-raw', 'data-rendered', 'viewBox', 'preserveAspectRatio', 'd', 'points', 'cx', 'cy', 'r', 'rx', 'ry', 'width', 'height', 'x', 'y', 'transform', 'fill', 'stroke', 'stroke-width', 'marker-end', 'marker-start']
          });
        }
      } catch(e) { console.warn('DOMPurify sanitize failed', e); }
      targetEl.innerHTML = html;
      // ── Mermaid: render diagrams setelah markdown masuk DOM ──
      try { renderMermaids(targetEl); } catch(e){ console.warn('mermaid post-render',e); }
    }
    // ── Thinking helpers ───────────────────────
    function formatElapsed(ms){
      if(ms < 1000) return (ms/1000).toFixed(1)+'s';
      if(ms < 60000) return (ms/1000).toFixed(1)+'s';
      const s=Math.floor(ms/1000);
      const m=Math.floor(s/60);
      const r=s%60;
      return m+'m '+r+'s';
    }
    function extractThinkTag(text){
      if(typeof text!=='string') return null;
      let m=text.match(/<think>([\s\S]*?)<\/think>/i);
      if(m) return {reasoning:m[1].trim(), content:text.replace(m[0],'').trim()};
      let m2=text.match(/<thinking>([\s\S]*?)<\/thinking>/i);
      if(m2) return {reasoning:m2[1].trim(), content:text.replace(m2[0],'').trim()};
      return null;
    }
    function getDeltaReasoning(delta, parsedRoot){
      if(delta){
        if(typeof delta.reasoning_content==='string' && delta.reasoning_content) return delta.reasoning_content;
        if(typeof delta.reasoning==='string' && delta.reasoning) return delta.reasoning;
        if(typeof delta.thinking==='string' && delta.thinking) return delta.thinking;
        if(delta.reasoning_details && Array.isArray(delta.reasoning_details) && delta.reasoning_details[0]?.text) return delta.reasoning_details[0].text;
        if(delta.reasoning_content && typeof delta.reasoning_content==='object' && delta.reasoning_content.text) return delta.reasoning_content.text;
      }
      if(parsedRoot){
        if(typeof parsedRoot.reasoning_content==='string' && parsedRoot.reasoning_content) return parsedRoot.reasoning_content;
        if(typeof parsedRoot.reasoning==='string' && parsedRoot.reasoning) return parsedRoot.reasoning;
        if(typeof parsedRoot.thinking==='string' && parsedRoot.thinking) return parsedRoot.thinking;
      }
      return null;
    }
    function getMessageReasoning(msg){
      if(!msg) return null;
      if(typeof msg.reasoning_content==='string' && msg.reasoning_content) return msg.reasoning_content;
      if(typeof msg.reasoning==='string' && msg.reasoning) return msg.reasoning;
      if(typeof msg.thinking==='string' && msg.thinking) return msg.thinking;
      if(typeof msg.reasoningTime==='number') return null;
      return null;
    }
    function createThinkingBlock(){
      const block=document.createElement('div');
      block.className='thinking-block';
      block.style.display='none';
      const header=document.createElement('button');
      header.className='thinking-header';
      header.type='button';
      const left=document.createElement('div');
      left.className='thinking-header-left';
      const spinner=document.createElement('div');
      spinner.className='thinking-spinner';
      const title=document.createElement('span');
      title.className='thinking-title';
      title.textContent='Sedang berpikir…';
      const timer=document.createElement('span');
      timer.className='thinking-timer';
      timer.textContent='0.0s';
      left.appendChild(spinner);
      left.appendChild(title);
      left.appendChild(timer);
      const chev=document.createElement('span');
      chev.className='thinking-chevron';
      chev.textContent='▼';
      header.appendChild(left);
      header.appendChild(chev);
      const content=document.createElement('div');
      content.className='thinking-content';
      content.style.display='block';
      const placeholder=document.createElement('div');
      placeholder.className='thinking-placeholder';
      placeholder.textContent='Menganalisis pertanyaan dan menyusun penalaran…';
      content.appendChild(placeholder);
      block.appendChild(header);
      block.appendChild(content);
      let collapsed=false;
      header.addEventListener('click',()=>{
        collapsed=!collapsed;
        content.style.display=collapsed?'none':'block';
        chev.style.transform=collapsed?'rotate(-90deg)':'rotate(0deg)';
      });
      return {
        block, header, spinner, title, timer, content, chev, placeholder,
        setCollapsed(v){ collapsed=v; content.style.display=v?'none':'block'; chev.style.transform=v?'rotate(-90deg)':'rotate(0deg)'; },
        isCollapsed(){ return collapsed; }
      };
    }
    function renderThinkingMarkdown(text, targetEl){
      if(typeof text!=='string' || !targetEl) return;
      if(!text.trim()){
        targetEl.innerHTML='<div class="thinking-placeholder">Menganalisis pertanyaan dan menyusun penalaran…</div>';
        return;
      }
      if (typeof marked === 'undefined') { targetEl.textContent = text; return; }
      try{
        let html = marked.parse(text);
        try {
          if (typeof DOMPurify !== 'undefined') {
            html = DOMPurify.sanitize(html, {
              USE_PROFILES: { html: true, svg: true, mathMl: true },
              ADD_TAGS: ['span'],
              ADD_ATTR: ['class', 'aria-hidden', 'style']
            });
          }
        } catch(e) {}
        targetEl.innerHTML = html;
      }
      catch(e){ targetEl.textContent = text; }
    }
    // ── Messages ───────────────────────────────
    function addMessage(role, content, opts) {
      if (welcome) welcome.style.display = 'none';
      const msgEl = document.createElement('div');
      msgEl.classList.add('message', role);
      const avatar = document.createElement('div');
      avatar.classList.add('avatar');
      avatar.textContent = role === 'user' ? '👤' : '🤖';
      const bubble = document.createElement('div');
      bubble.classList.add('bubble');
      if (role === 'assistant') {
        let reasoning = null;
        let reasoningDuration = null;
        let collapsed = false;
        if(opts && typeof opts==='object' && !Array.isArray(opts)){
          reasoning = opts.reasoning || opts.reasoning_content || null;
          reasoningDuration = opts.reasoningDuration || opts.duration || opts.reasoningTime || null;
          if(typeof opts.collapsed==='boolean') collapsed = opts.collapsed;
        }
        let txtForAssist = '';
        if(Array.isArray(content)) txtForAssist = content.filter(p=>p&&p.type==='text').map(p=>p.text).join('\n');
        else if(typeof content==='string') txtForAssist = content;
        if(!reasoning && typeof txtForAssist==='string'){
          const ex = extractThinkTag(txtForAssist);
          if(ex){ reasoning = ex.reasoning; txtForAssist = ex.content; }
        }
        if(reasoning){
          const tb=createThinkingBlock();
          tb.block.style.display='block';
          tb.block.classList.add('done');
          tb.spinner.style.display='none';
          tb.title.textContent='Selesai berpikir';
          if(reasoningDuration!=null) tb.timer.textContent = typeof reasoningDuration==='string' ? reasoningDuration : formatElapsed(reasoningDuration);
          else tb.timer.textContent='selesai';
          renderThinkingMarkdown(reasoning, tb.content);
          if(collapsed) tb.setCollapsed(true);
          bubble.appendChild(tb.block);
        }
        const answerDiv=document.createElement('div');
        answerDiv.className='answer-content';
        bubble.appendChild(answerDiv);
        renderContent(txtForAssist, answerDiv);
      } else {
        let text = '';
        let imgs = [];
        if(Array.isArray(content)){
          text = content.filter(p=>p&&p.type==='text'&&typeof p.text==='string').map(p=>p.text).join('\n');
          imgs = content.filter(p=>p&&p.type==='image_url'&&p.image_url&&p.image_url.url).map(p=>p.image_url.url);
          if(opts && Array.isArray(opts.images)) imgs = imgs.concat(opts.images);
        } else if(typeof content==='string'){
          text = content;
          if(opts && Array.isArray(opts.images)) imgs = opts.images;
          else if(opts && opts.imageUrls) imgs = opts.imageUrls;
        } else if(content && typeof content==='object' && opts==null){
          text = '';
        }
        // Fallback legacy: message.images field
        if(!imgs.length && opts && Array.isArray(opts._legacyImages)) imgs = opts._legacyImages;
        if(imgs.length){
          const wrap=document.createElement('div');
          wrap.className='bubble-images';
          imgs.forEach(src=>{
            const im=document.createElement('img');
            im.src=src;
            im.alt='gambar';
            im.loading='lazy';
            im.addEventListener('click',()=> openImageLightbox(src));
            wrap.appendChild(im);
          });
          bubble.appendChild(wrap);
        }
        if(text){
          const t=document.createElement('div');
          t.style.whiteSpace='pre-wrap';
          t.style.wordBreak='break-word';
          t.textContent=text;
          bubble.appendChild(t);
        } else if(!imgs.length){
          bubble.textContent='';
        }
        if(!text && imgs.length){
          // ensure bubble not empty for styling
        }
      }
      msgEl.appendChild(avatar);
      msgEl.appendChild(bubble);
      chatContainer.appendChild(msgEl);
      scrollToBottom();
      return bubble;
    }
    function addTypingIndicator() {
      if (welcome) welcome.style.display = 'none';
      const msgEl = document.createElement('div');
      msgEl.classList.add('message', 'assistant');
      msgEl.id = 'typing-msg';
      const avatar = document.createElement('div');
      avatar.classList.add('avatar');
      avatar.textContent = '🤖';
      const bubble = document.createElement('div');
      bubble.classList.add('bubble');
      bubble.innerHTML = '<div class="typing-indicator"><span></span><span></span><span></span></div>';
      msgEl.appendChild(avatar);
      msgEl.appendChild(bubble);
      chatContainer.appendChild(msgEl);
      scrollToBottom();
    }
    function removeTypingIndicator() {
      const el = document.getElementById('typing-msg');
      if (el) el.remove();
    }
    function addStreamingMessage() {
      if (welcome) welcome.style.display = 'none';
      const msgEl = document.createElement('div');
      msgEl.classList.add('message', 'assistant');
      msgEl.id = 'streaming-msg';
      const avatar = document.createElement('div');
      avatar.classList.add('avatar');
      avatar.textContent = '🤖';
      const bubble = document.createElement('div');
      bubble.classList.add('bubble');
      const tb = createThinkingBlock();
      bubble.appendChild(tb.block);
      const answerDiv = document.createElement('div');
      answerDiv.className = 'answer-content';
      bubble.appendChild(answerDiv);
      msgEl.appendChild(avatar);
      msgEl.appendChild(bubble);
      chatContainer.appendChild(msgEl);
      scrollToBottom();
      bubble._thinking = tb;
      bubble._answerDiv = answerDiv;
      bubble._msgEl = msgEl;
      return bubble;
    }
    function scrollToBottom() {
      chatContainer.scrollTop = chatContainer.scrollHeight;
    }
    // ── Build API Messages (with Context Management) ─
    function buildMessages() {
      // legacy sync — tanpa compaction, untuk fallback / test. Prefer getCompactedMessages()
      return buildRawMessagesSync();
    }
    async function getCompactedMessages(){
      const raw = buildRawMessagesSync();
      const res = await compactIfNeeded(raw);
      return res;
    }
    // ── Build Full URL ─────────────────────────
    function getApiUrl() {
      let base = config.baseUrl.replace(/\/+$/, '');
      if (base.endsWith('/chat/completions')) {
        return base;
      }
      return base + '/chat/completions';
    }
    // ── Send Message ───────────────────────────
    async function sendMessage(content) {
      const hasImages = Array.isArray(pendingImages) && pendingImages.length>0;
      const textTrim = (typeof content==='string' ? content.trim() : '');
      if (isGenerating || (!textTrim && !hasImages)) return;
      if (!config.apiKey.trim()) {
        alert('⚠️ Mohon masukkan API key di Pengaturan.');
        openSettings();
        return;
      }
      const _imagesToSend = pendingImages.slice();
      const _hasImgs = _imagesToSend.length>0;
      let _userContent;
      let _displayImages = [];
      if(_hasImgs){
        _displayImages = _imagesToSend.map(x=>x.dataUrl);
        const textPart = textTrim || 'Jelaskan gambar ini secara detail.';
        const parts = [{ type:'text', text: textPart }];
        _imagesToSend.forEach(x=> parts.push({ type:'image_url', image_url: { url: x.dataUrl } }));
        _userContent = parts;
      } else {
        _userContent = textTrim;
      }
      ensureSession();
      isGenerating = true;
      sendBtn.style.display = 'none';
      stopBtn.style.display = 'flex';
      messages.push({ role: 'user', content: _userContent });
      persistCurrentSession();
      addMessage('user', _userContent);
      userInput.value = '';
      clearPendingImages();
      autoResize();
      updateContextBar();
      abortController = new AbortController();
      // ── Context Management: compact before send ─
      let compactInfo = null;
      try {
        const rawForCompact = buildRawMessagesSync();
        const c = await compactIfNeeded(rawForCompact);
        compactInfo = c;
        if(c && c.wasCompacted){
          const stratName = c.strategy==='summarize' ? 'diringkas AI' : c.strategy==='hybrid' ? 'hybrid (ringkas→potong)' : 'dipotong';
          addContextNotice(`🗜️ Context penuh (${c.total?.toLocaleString('id-ID')} tokens / ${c.win?.toLocaleString('id-ID')}) — ${c.olderCount} pesan lama ${stratName}, hemat ~${(c.savedTokens||0).toLocaleString('id-ID')} tokens → ${c.compactedTotal?.toLocaleString('id-ID')} (${Math.round(c.compactedTotal/c.win*100)}%)`);
          updateContextBar();
        }
      } catch(e){ console.warn('[Compaction] pre-send', e); }
      try {
        const apiMessages = (compactInfo && compactInfo.messages) ? compactInfo.messages : buildMessages();
        const useStream = config.stream;
        const apiUrl = getApiUrl();
        console.log('[Chatbot] POST', apiUrl, { model: config.model, stream: useStream, messages: apiMessages.length });
        const requestBody = {
          model: config.model,
          messages: apiMessages,
          max_tokens: config.maxTokens,
          stream: useStream,
        };
        // Only include temperature when the user set it manually
        if (config.temperature !== null && config.temperature !== undefined) {
          requestBody.temperature = config.temperature;
        }
        // Only include top_p when the user set it manually (0-1)
        if (config.topP !== null && config.topP !== undefined) {
          requestBody.top_p = config.topP;
        }
        // Only include reasoning_effort when it has a value
        if (config.reasoningEffort) {
          requestBody.reasoning_effort = config.reasoningEffort;
        }
        const headers = {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${config.apiKey}`,
        };
        const response = await fetch(apiUrl, {
          method: 'POST',
          headers,
          body: JSON.stringify(requestBody),
          signal: abortController.signal,
        });
        if (!response.ok) {
          let errBody = '';
          try { errBody = await response.text(); } catch (e) {}
          console.error('[Chatbot] API Error', response.status, errBody);
          let errMsg = `API Error ${response.status}`;
          if (response.status === 401) errMsg = '❌ Unauthorized — periksa kembali API key Anda';
          else if (response.status === 404) errMsg = '❌ 404 Not Found — periksa API Host';
          else if (response.status === 429) errMsg = '⚠️ Rate limited — terlalu banyak permintaan';
          else if (response.status === 500) errMsg = '❌ Server error (500) — coba lagi nanti';
          else if (response.status === 403) errMsg = '❌ Forbidden — periksa izin API key Anda';
          try {
            const errJson = JSON.parse(errBody);
            if (errJson.error?.message) errMsg += `\n\n${errJson.error.message}`;
          } catch (e) {}
          const err = new Error(errMsg);
          err.status = response.status;
          err.body = errBody;
          throw err;
        }
        const thinkingStartTs = Date.now();
        if (useStream) {
          // ── Streaming with Thinking ───────────
          addTypingIndicator();
          const bubble = addStreamingMessage();
          removeTypingIndicator();
          const tb = bubble._thinking;
          const answerDiv = bubble._answerDiv;
          let fullContent = '';
          let reasoningText = '';
          let renderTimer = null;
          let reasoningRenderTimer = null;
          let elapsedTimer = null;
          let thinkingShown = false;
          let thinkingDone = false;
          let hasReasoning = false;
          let thinkingStart = Date.now();

          const showThinking = () => {
            if (thinkingShown) return;
            thinkingShown = true;
            tb.block.style.display = 'block';
            tb.content.innerHTML = '<div class="thinking-placeholder">Menganalisis pertanyaan dan menyusun penalaran…</div>';
            tb.title.textContent = 'Sedang berpikir…';
            tb.spinner.style.display = 'block';
            tb.timer.textContent = '0.0s';
            if (elapsedTimer) clearInterval(elapsedTimer);
            elapsedTimer = setInterval(() => {
              if (thinkingDone) return;
              tb.timer.textContent = formatElapsed(Date.now() - thinkingStart);
            }, 100);
          };
          const finalizeThinking = () => {
            if (thinkingDone) return;
            thinkingDone = true;
            if (elapsedTimer) { clearInterval(elapsedTimer); elapsedTimer = null; }
            const elapsed = Date.now() - thinkingStart;
            if (thinkingShown) {
              tb.block.classList.add('done');
              tb.spinner.style.display = 'none';
              tb.title.textContent = 'Selesai berpikir';
              tb.timer.textContent = formatElapsed(elapsed);
            }
            return elapsed;
          };
          // Helper: cek apakah semua math delimiter seimbang agar regex tidak
          // memotong rumus di tengah. Jika tidak seimbang, lewati render math
          // sementara dan biarkan teks mentah sampai final render.
          const mathDelimitersBalanced = (text) => {
            if (typeof text !== 'string') return true;
            const displayCount = (text.match(/\$\$/g) || []).length;
            const openParen = (text.match(/\\\(/g) || []).length;
            const closeParen = (text.match(/\\\)/g) || []).length;
            const openBracket = (text.match(/\\\[/g) || []).length;
            const closeBracket = (text.match(/\\\]/g) || []).length;
            // Inline $...$ sulit dicek secara presisi, tapi $ seimbang = genap
            return displayCount % 2 === 0 && openParen === closeParen && openBracket === closeBracket;
          };
          const throttledRenderAnswer = () => {
            if (renderTimer) return;
            renderTimer = setTimeout(() => {
              // Hanya render math jika delimiter sudah seimbang
              if (mathDelimitersBalanced(fullContent)) {
                renderContent(fullContent, answerDiv);
              } else {
                // Fallback: tetap tampilkan teks agar chat tidak terhenti,
                // tapi jangan proses math agar tidak menyisakan placeholder rusak
                answerDiv.innerHTML = marked.parse(fullContent).replace(/<(?:[^>]+)?>[^<]*<\/[^>]+>/g, m => {
                  // Simpan code blocks & math sementara
                  return m;
                });
              }
              scrollToBottom();
              renderTimer = null;
            }, 60);
          };
          const throttledRenderReasoning = () => {
            if (reasoningRenderTimer) return;
            reasoningRenderTimer = setTimeout(() => {
              renderThinkingMarkdown(reasoningText, tb.content);
              // auto-scroll thinking content to bottom while streaming
              tb.content.scrollTop = tb.content.scrollHeight;
              scrollToBottom();
              reasoningRenderTimer = null;
            }, 60);
          };

          // Pre-show thinking if reasoning effort is enabled
          if (config.reasoningEffort) {
            showThinking();
          }

          const reader = response.body.getReader();
          const decoder = new TextDecoder();
          let buffer = '';
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split('\n');
            buffer = lines.pop();
            for (const line of lines) {
              const trimmed = line.trim();
              if (!trimmed || !trimmed.startsWith('data:')) continue;
              const data = trimmed.slice(5).trim();
              if (data === '[DONE]') continue;
              try {
                const parsed = JSON.parse(data);
                const choice = parsed.choices?.[0] || {};
                const delta = choice.delta || {};
                const reasoningDelta = getDeltaReasoning(delta, parsed) || getDeltaReasoning(choice, parsed) || (choice.delta && getDeltaReasoning(null, choice));
                // Also try direct fields
                let rd = reasoningDelta;
                if (!rd) {
                  if (typeof delta.reasoning_content === 'string') rd = delta.reasoning_content;
                  else if (typeof delta.reasoning === 'string') rd = delta.reasoning;
                  else if (typeof parsed.reasoning_content === 'string') rd = parsed.reasoning_content;
                }
                if (rd) {
                  hasReasoning = true;
                  showThinking();
                  reasoningText += rd;
                  throttledRenderReasoning();
                }
                const contentDelta = delta.content ?? delta.text ?? choice.text ?? '';
                if (contentDelta) {
                  // First content token means reasoning is done (model finished thinking)
                  if (thinkingShown && !thinkingDone) {
                    finalizeThinking();
                  }
                  fullContent += contentDelta;
                  throttledRenderAnswer();
                }
              } catch (e) {
                // skip malformed chunks
              }
            }
          }
          // Final render
          if (renderTimer) clearTimeout(renderTimer);
          if (reasoningRenderTimer) clearTimeout(reasoningRenderTimer);
          // Fallback: reasoning inside <think> tags in content
          let finalReasoning = reasoningText.trim();
          let finalContent = fullContent;
          if (!finalReasoning && finalContent) {
            const ex = extractThinkTag(finalContent);
            if (ex) {
              finalReasoning = ex.reasoning;
              finalContent = ex.content;
              hasReasoning = !!finalReasoning;
              if (finalReasoning && !thinkingShown) {
                showThinking();
              }
              if (finalReasoning) {
                renderThinkingMarkdown(finalReasoning, tb.content);
              }
            }
          }
          if (thinkingShown) {
            const elapsed = finalizeThinking();
            if (finalReasoning) {
              renderThinkingMarkdown(finalReasoning, tb.content);
              tb.timer.textContent = formatElapsed(elapsed);
            } else {
              // No reasoning content after all — hide block if empty and no config?
              if (!hasReasoning && !config.reasoningEffort) {
                tb.block.style.display = 'none';
              } else {
                // Show done state even if empty (e.g., reasoningEffort but no content)
                tb.content.innerHTML = '<div class="thinking-placeholder">Penalaran selesai</div>';
              }
            }
          }
          renderContent(finalContent, answerDiv);
          scrollToBottom();
          // Save with reasoning
          const reasoningTime = thinkingShown ? (Date.now() - thinkingStart) : undefined;
          messages.push({ role: 'assistant', content: finalContent, ...(finalReasoning ? { reasoning_content: finalReasoning } : {}), ...(reasoningTime ? { reasoningTime } : {}) });
          persistCurrentSession();
          // Clean timer
          if (elapsedTimer) { clearInterval(elapsedTimer); }
        } else {
          // ── Non-Streaming with Thinking ────────
          addTypingIndicator();
          const data = await response.json();
          removeTypingIndicator();
          const msg = data.choices?.[0]?.message || {};
          let reply = msg.content ?? data.choices?.[0]?.text ?? '⚠️ No response received from API.';
          let reasoning = getMessageReasoning(msg) || getMessageReasoning(data.choices?.[0]) || data.reasoning_content || data.reasoning || null;
          if (!reasoning && typeof reply === 'string') {
            const ex = extractThinkTag(reply);
            if (ex) { reasoning = ex.reasoning; reply = ex.content; }
          }
          const elapsed = Date.now() - thinkingStartTs;
          const opts = reasoning ? { reasoning, reasoningDuration: elapsed } : null;
          messages.push({ role: 'assistant', content: reply, ...(reasoning ? { reasoning_content: reasoning, reasoningTime: elapsed } : {}) });
          persistCurrentSession();
          addMessage('assistant', reply, opts);
        }
        updateStatus(true, `Terhubung — ${config.model}`);
      } catch (err) {
        removeTypingIndicator();
        // Auto-retry: jika error context_length / token overflow dan belum compact, coba compact lalu retry sekali
        const msgLower = (err && err.message ? err.message.toLowerCase() : '');
        const isContextOverflow = msgLower.includes('context') || msgLower.includes('token') || msgLower.includes('maximum context') || msgLower.includes('too many') || msgLower.includes('exceeded');
        const hasOverflowStatus = err && (err.status===400 || /400/.test(err.message||''));
        if(isContextOverflow && hasOverflowStatus && compactInfo && !compactInfo.wasCompacted){
          try{
            console.warn('[Compaction] Attempting auto-recovery for overflow…');
            const rawRetry = buildRawMessagesSync();
            const needRetry = truncateCompaction(rawRetry, Math.max(4, (parseInt(config.compactionKeep)||10)-2));
            if(needRetry.wasCompacted){
              addContextNotice(`🔄 Retry: context overflow — memadatkan ulang & mengirim ulang (${needRetry.olderCount} pesan lama dipotong)…`);
              // retry request sekali dengan pesan ter-compact
              const retryMsgs = needRetry.messages;
              const apiUrl2 = getApiUrl();
              const useStream2 = config.stream;
              const body2 = {
                model: config.model,
                messages: retryMsgs,
                max_tokens: config.maxTokens,
                stream: useStream2,
                ...(config.temperature!==null&&config.temperature!==undefined ? {temperature: config.temperature}:{}),
                ...(config.topP!==null&&config.topP!==undefined ? {top_p: config.topP}:{}),
                ...(config.reasoningEffort ? {reasoning_effort: config.reasoningEffort}:{})
              };
              const resp2 = await fetch(apiUrl2, { method:'POST', headers:{'Content-Type':'application/json','Authorization':`Bearer ${config.apiKey}`}, body: JSON.stringify(body2), signal: abortController.signal });
              if(resp2.ok){
                lastCompaction = { ...needRetry, ts: Date.now() };
                updateContextBar();
                const thinkingStartTs2 = Date.now();
                if(useStream2){
                  addTypingIndicator(); const bubble2 = addStreamingMessage(); removeTypingIndicator();
                  const tb2=bubble2._thinking, ans2=bubble2._answerDiv;
                  let full2='', rs2='', rt2=null, rrt2=null, et2=null, shown2=false, done2=false, hasR2=false;
                  let tStart2=Date.now();
                  const show2=()=>{ if(shown2) return; shown2=true; tb2.block.style.display='block'; tb2.content.innerHTML='<div class="thinking-placeholder">Menganalisis…</div>'; tb2.title.textContent='Sedang berpikir…'; tb2.spinner.style.display='block'; tb2.timer.textContent='0.0s'; if(et2) clearInterval(et2); et2=setInterval(()=>{ if(done2) return; tb2.timer.textContent=formatElapsed(Date.now()-tStart2); },100); };
                  const fin2=()=>{ if(done2) return; done2=true; if(et2){clearInterval(et2); et2=null;} const el=Date.now()-tStart2; if(shown2){tb2.block.classList.add('done'); tb2.spinner.style.display='none'; tb2.title.textContent='Selesai berpikir'; tb2.timer.textContent=formatElapsed(el);} return el; };
                  const thrAns2=()=>{ if(rt2) return; rt2=setTimeout(()=>{ renderContent(full2, ans2); scrollToBottom(); rt2=null; },60); };
                  const thrRs2=()=>{ if(rrt2) return; rrt2=setTimeout(()=>{ renderThinkingMarkdown(rs2, tb2.content); tb2.content.scrollTop=tb2.content.scrollHeight; scrollToBottom(); rrt2=null; },60); };
                  if(config.reasoningEffort) show2();
                  const rdr2=resp2.body.getReader(); const dec2=new TextDecoder(); let buf2='';
                  while(true){ const {done,value}=await rdr2.read(); if(done) break; buf2+=dec2.decode(value,{stream:true}); const lines=buf2.split('\n'); buf2=lines.pop(); for(const line of lines){ const tr=line.trim(); if(!tr||!tr.startsWith('data:')) continue; const d=tr.slice(5).trim(); if(d==='[DONE]') continue; try{ const p=JSON.parse(d); const ch=p.choices?.[0]||{}; const dl=ch.delta||{}; let rd=getDeltaReasoning(dl,p)||getDeltaReasoning(ch,p)||null; if(!rd){ if(typeof dl.reasoning_content==='string') rd=dl.reasoning_content; else if(typeof dl.reasoning==='string') rd=dl.reasoning; else if(typeof p.reasoning_content==='string') rd=p.reasoning_content; } if(rd){ hasR2=true; show2(); rs2+=rd; thrRs2(); } const c2=dl.content??dl.text??ch.text??''; if(c2){ if(shown2&&!done2) fin2(); full2+=c2; thrAns2(); } }catch(e){} } }
                  if(rt2) clearTimeout(rt2); if(rrt2) clearTimeout(rrt2);
                  let fr2=rs2.trim(), fc2=full2;
                  if(!fr2 && fc2){ const ex=extractThinkTag(fc2); if(ex){ fr2=ex.reasoning; fc2=ex.content; hasR2=!!fr2; if(fr2&&!shown2) show2(); if(fr2) renderThinkingMarkdown(fr2, tb2.content); } }
                  if(shown2){ const el=fin2(); if(fr2){ renderThinkingMarkdown(fr2, tb2.content); tb2.timer.textContent=formatElapsed(el); } else { if(!hasR2&&!config.reasoningEffort) tb2.block.style.display='none'; else tb2.content.innerHTML='<div class="thinking-placeholder">Penalaran selesai</div>'; } }
                  renderContent(fc2, ans2); scrollToBottom();
                  const rt2t = shown2 ? (Date.now()-tStart2) : undefined;
                  messages.push({ role:'assistant', content: fc2, ...(fr2?{reasoning_content:fr2}:{}), ...(rt2t?{reasoningTime:rt2t}:{}) });
                  persistCurrentSession(); if(et2) clearInterval(et2);
                } else {
                  addTypingIndicator(); const data2=await resp2.json(); removeTypingIndicator();
                  const mm2=data2.choices?.[0]?.message||{}; let rep2=mm2.content??data2.choices?.[0]?.text??'⚠️ No response'; let rs2b=getMessageReasoning(mm2)||getMessageReasoning(data2.choices?.[0])||data2.reasoning_content||data2.reasoning||null; if(!rs2b && typeof rep2==='string'){ const ex=extractThinkTag(rep2); if(ex){ rs2b=ex.reasoning; rep2=ex.content; } } const el2=Date.now()-thinkingStartTs2; const opts2=rs2b?{reasoning:rs2b, reasoningDuration:el2}:null; messages.push({role:'assistant', content:rep2, ...(rs2b?{reasoning_content:rs2b, reasoningTime:el2}:{})}); persistCurrentSession(); addMessage('assistant', rep2, opts2);
                }
                updateStatus(true, `Terhubung — ${config.model}`); updateContextBar();
                // sukses retry → jangan tampilkan error
                isGenerating=false; sendBtn.style.display='flex'; stopBtn.style.display='none'; abortController=null; const s2=document.getElementById('streaming-msg'); if(s2) s2.removeAttribute('id'); return;
              }
            }
          }catch(retryErr){ console.warn('[Compaction] retry failed', retryErr); }
        }
        // also clean up streaming thinking timer
        try{
          const streamingEl=document.getElementById('streaming-msg');
          if(streamingEl){
            const b=streamingEl.querySelector('.bubble');
            if(b && b._thinking && b._thinking.timer){
              const elapsed = formatElapsed(Date.now() - thinkingStartTs);
              if(b._thinking.block.style.display!=='none' && !b._thinking.block.classList.contains('done')){
                b._thinking.block.classList.add('done');
                b._thinking.spinner.style.display='none';
                b._thinking.title.textContent='Dihentikan';
                b._thinking.timer.textContent=elapsed;
              }
            }
          }
        }catch(e){}
        if (err.name === 'AbortError') {
          const streaming = document.getElementById('streaming-msg');
          if (streaming) {
            const bubble = streaming.querySelector('.bubble');
            if (bubble) {
              let textToSave='';
              if(bubble._answerDiv) textToSave=bubble._answerDiv.textContent || '';
              if(!textToSave && bubble.textContent) textToSave=bubble.textContent;
              // gather reasoning for abort case if any
              let reasoningToSave='';
              let reasoningTime=undefined;
              if(bubble._thinking && bubble._thinking.block.style.display!=='none'){
                const tb=bubble._thinking;
                reasoningToSave=tb.content.textContent || '';
                // try extract timer
                reasoningTime=Date.now()-thinkingStartTs;
                tb.block.classList.add('done');
                tb.spinner.style.display='none';
                tb.title.textContent='Dihentikan';
                tb.timer.textContent=formatElapsed(reasoningTime);
              }
              const finalText=(textToSave||'') + '\n\n⚠️ *Generation stopped.*';
              messages.push({ role: 'assistant', content: finalText, ...(reasoningToSave?{reasoning_content:reasoningToSave, reasoningTime}:{}) });
              persistCurrentSession();
              if(bubble._answerDiv){
                renderContent(finalText, bubble._answerDiv);
              } else {
                renderContent(finalText, bubble);
              }
            }
            streaming.removeAttribute('id');
          }
        } else {
          addMessage('assistant', `**Error:**\n\n${err.message}`);
          updateStatus(false, `Error — ${err.message}`);
        }
      } finally {
        isGenerating = false;
        sendBtn.style.display = 'flex';
        stopBtn.style.display = 'none';
        abortController = null;
        const streaming = document.getElementById('streaming-msg');
        if (streaming) streaming.removeAttribute('id');
      }
    }

    // ── Stop Generation ────────────────────────
    stopBtn.addEventListener('click', () => {
      if (abortController) {
        abortController.abort();
      }
    });

    // ── Auto-Resize Textarea (dinamis, tanpa scroll) ───────────────────
    function autoResize() {
      userInput.style.height = 'auto';
      // Batasi tinggi maksimal agar tidak menindih layout, tapi tetap fleksibel
      const maxHeight = Math.min(userInput.scrollHeight, Math.floor(window.innerHeight * 0.4));
      userInput.style.height = maxHeight + 'px';
    }

    userInput.addEventListener('input', autoResize);

    // ── Input Handlers ─────────────────────────
    userInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        const content = userInput.value.trim();
        if (content || (Array.isArray(pendingImages) && pendingImages.length>0)) sendMessage(content);
      }
    });

    sendBtn.addEventListener('click', () => {
      const content = userInput.value.trim();
      if (content || (Array.isArray(pendingImages) && pendingImages.length>0)) sendMessage(content);
    });

    // ── Multimodal wiring (paste / drag-drop / file picker) ──────────
    (function(){
      const attachBtn=document.getElementById('attach-btn');
      const imgInput=document.getElementById('image-input');
      const inputArea=document.getElementById('input-area');
      const chatCont=document.getElementById('chat-container');
      if(attachBtn && imgInput){
        attachBtn.addEventListener('click', ()=> imgInput.click());
        imgInput.addEventListener('change', ()=>{
          if(imgInput.files && imgInput.files.length) {
            addPendingImages(imgInput.files).then(()=>{ imgInput.value=''; });
          } else {
            imgInput.value='';
          }
        });
      }
      // paste gambar (Ctrl+V screenshot)
      document.addEventListener('paste', (e)=>{
        try{
          const items = e.clipboardData && e.clipboardData.items;
          if(!items) return;
          const imgs=[];
          for(const it of items){ if(it.kind==='file' && it.type.startsWith('image/')){ const f=it.getAsFile(); if(f) imgs.push(f); } }
          if(imgs.length){ e.preventDefault(); addPendingImages(imgs); }
        }catch(err){}
      });
      function onDragOver(e){ e.preventDefault(); if(inputArea) inputArea.classList.add('drag-over'); }
      function onDragLeave(e){ if(inputArea) inputArea.classList.remove('drag-over'); }
      function onDrop(e){
        e.preventDefault();
        if(inputArea) inputArea.classList.remove('drag-over');
        const dt=e.dataTransfer;
        if(!dt) return;
        const files = dt.files ? Array.from(dt.files).filter(f=>f.type.startsWith('image/')) : [];
        if(files.length) addPendingImages(files);
      }
      [inputArea, chatCont].forEach(el=>{
        if(!el) return;
        el.addEventListener('dragover', onDragOver);
        el.addEventListener('dragenter', onDragOver);
        el.addEventListener('dragleave', onDragLeave);
        el.addEventListener('drop', onDrop);
      });
      // ESC tutup lightbox & clear pending jika kosong text
      document.addEventListener('keydown', (e)=>{
        if(e.key==='Escape'){
          const lb=document.getElementById('img-lightbox');
          if(lb && lb.classList.contains('open')){ lb.classList.remove('open'); return; }
          if(pendingImages.length && !userInput.value.trim() && !isGenerating){
            // optional: ESC clears pending when no text
          }
        }
      });
      // Tutup lightbox via ESC global handled above, also click handled in openImageLightbox
    })();

    document.querySelectorAll('.quick-prompt').forEach((btn) => {
      btn.addEventListener('click', () => {
        const prompt = btn.dataset.prompt;
        if (prompt) sendMessage(prompt);
      });
    });

    // ── New Chat ───────────────────────────────
    document.getElementById('new-chat-btn')?.addEventListener('click', createNewSession);

    // sidebar mobile: backdrop & menu
    if(sidebarBackdrop) sidebarBackdrop.addEventListener('click', closeSidebar);
    const menuBtn=document.getElementById('menu-btn');
    if(menuBtn) menuBtn.addEventListener('click', ()=>{
      if(sidebar.classList.contains('open')) closeSidebar(); else openSidebar();
    });
    // hapus semua history
    const clearAllBtn=document.getElementById('clear-all-btn');
    if(clearAllBtn) clearAllBtn.addEventListener('click', ()=>{
      if(!confirm('Hapus SEMUA riwayat chat?')) return;
      if(isGenerating && abortController) abortController.abort();
      sessions=[];
      localStorage.removeItem(SESSIONS_KEY);
      localStorage.removeItem(ACTIVE_SESSION_KEY);
      localStorage.removeItem(HISTORY_KEY);
      currentSessionId=genId();
      const ns={id:currentSessionId,title:'Chat baru',preview:'—',updatedAt:Date.now(),messages:[]};
      sessions=[ns];
      messages=ns.messages;
      saveSessions();
      renderChat();
      renderSidebar();
    });

    // ── Settings Modal ─────────────────────────
    function openSettings() {
      document.getElementById('cfg-base-url').value = config.baseUrl;
      document.getElementById('cfg-api-key').value = config.apiKey;
      document.getElementById('cfg-model').value = config.model;
      document.getElementById('cfg-temperature').value =
        config.temperature === null || config.temperature === undefined ? '' : config.temperature;
      const _topPEl = document.getElementById('cfg-top-p');
      if (_topPEl) _topPEl.value = config.topP === null || config.topP === undefined ? '' : config.topP;
      document.getElementById('cfg-max-tokens').value = config.maxTokens;

      // Reasoning effort: preset only (custom removed)
      const effortSelect = document.getElementById('cfg-reasoning-effort');
      const allowedEfforts = Array.from(effortSelect.options).map((o) => o.value);
      effortSelect.value = allowedEfforts.includes(config.reasoningEffort) ? config.reasoningEffort : '';

      document.getElementById('cfg-system-toggle').checked = config.systemPromptEnabled;
      document.getElementById('cfg-system-prompt').value = config.systemPrompt;
      document.getElementById('cfg-stream').value = String(config.stream);
      document.getElementById('cfg-memory-toggle').checked = config.memoryEnabled;

      document.getElementById('system-prompt-group').style.display =
        config.systemPromptEnabled ? 'block' : 'none';

      // Context Management
      const cwSel = document.getElementById('cfg-context-window');
      const cwCustomGroup = document.getElementById('context-custom-group');
      const cwCustom = document.getElementById('cfg-context-window-custom');
      if(cwSel){
        if(config.contextWindow === 'custom'){
          cwSel.value = 'custom';
          if(cwCustomGroup) cwCustomGroup.style.display='block';
          if(cwCustom) cwCustom.value = config.contextWindowCustom || '';
        } else {
          const pVals = Array.from(cwSel.options).map(o=>o.value);
          if(pVals.includes(String(config.contextWindow))) {
            cwSel.value = String(config.contextWindow);
            if(cwCustomGroup) cwCustomGroup.style.display='none';
          } else {
            // fallback: value legacy angka preset tidak ada di options
            cwSel.value = String(config.contextWindow);
            if(cwCustomGroup) cwCustomGroup.style.display='none';
          }
        }
        if(cwSel.value==='custom' && cwCustom){
          if(!cwCustom.value) cwCustom.value = config.contextWindowCustom || '32768';
          if(cwCustomGroup) cwCustomGroup.style.display='block';
        }
      }
      const cmpToggle = document.getElementById('cfg-compaction-toggle');
      if(cmpToggle) cmpToggle.checked = !!config.compactionEnabled;
      const thr = document.getElementById('cfg-compaction-threshold');
      const thrV = document.getElementById('cfg-threshold-val');
      const thrL = document.getElementById('cfg-threshold-label');
      if(thr){
        thr.value = String(config.compactionThreshold||80);
        if(thrV) thrV.textContent = thr.value+'%';
        if(thrL) thrL.textContent = thr.value+'%';
      }
      const strat = document.getElementById('cfg-compaction-strategy');
      if(strat) strat.value = config.compactionStrategy||'truncate';
      const keep = document.getElementById('cfg-compaction-keep');
      if(keep) keep.value = String(config.compactionKeep||10);
      // update estimate live
      try{ if(typeof updateContextEstimateBox==='function') updateContextEstimateBox(); if(typeof updateContextBar==='function') updateContextBar(); }catch(e){}

      const testResult = document.getElementById('test-result');
      testResult.className = 'test-result';
      testResult.style.display = 'none';

      settingsModal.classList.add('active');
    }

    function closeSettings() {
      settingsModal.classList.remove('active');
    }

    document.getElementById('settings-btn').addEventListener('click', openSettings);
    document.getElementById('settings-cancel').addEventListener('click', closeSettings);

    settingsModal.addEventListener('click', (e) => {
      if (e.target === settingsModal) closeSettings();
    });

    document.getElementById('cfg-system-toggle').addEventListener('change', (e) => {
      document.getElementById('system-prompt-group').style.display =
        e.target.checked ? 'block' : 'none';
    });

    // ── Context Management live wiring ─────────
    (function(){
      const cwSel = document.getElementById('cfg-context-window');
      const cwCustomGroup = document.getElementById('context-custom-group');
      const cwCustom = document.getElementById('cfg-context-window-custom');
      const thr = document.getElementById('cfg-compaction-threshold');
      const thrV = document.getElementById('cfg-threshold-val');
      const thrL = document.getElementById('cfg-threshold-label');
      const tog = document.getElementById('cfg-compaction-toggle');
      const strat = document.getElementById('cfg-compaction-strategy');
      const keep = document.getElementById('cfg-compaction-keep');
      if(cwSel){
        cwSel.addEventListener('change', ()=>{
          if(cwSel.value==='custom'){ if(cwCustomGroup) cwCustomGroup.style.display='block'; }
          else { if(cwCustomGroup) cwCustomGroup.style.display='none'; }
          try{ updateContextEstimateBox(); updateContextBar(); }catch(e){}
        });
      }
      if(cwCustom){
        cwCustom.addEventListener('input', ()=>{ try{ updateContextEstimateBox(); updateContextBar(); }catch(e){} });
      }
      if(thr){
        thr.addEventListener('input', ()=>{
          const v=thr.value;
          if(thrV) thrV.textContent=v+'%';
          if(thrL) thrL.textContent=v+'%';
          try{ updateContextEstimateBox(); updateContextBar(); }catch(e){}
        });
      }
      if(tog) tog.addEventListener('change', ()=>{ try{ updateContextEstimateBox(); updateContextBar(); }catch(e){} });
      if(strat) strat.addEventListener('change', ()=>{ try{ updateContextEstimateBox(); updateContextBar(); }catch(e){} });
      if(keep) keep.addEventListener('change', ()=>{ try{ updateContextEstimateBox(); updateContextBar(); }catch(e){} });
      const manualBtn = document.getElementById('context-manual-btn');
      if(manualBtn){
        manualBtn.addEventListener('click', async ()=>{
          if(isGenerating){ alert('Tunggu respon selesai dulu.'); return; }
          if(!Array.isArray(messages) || messages.length===0){ alert('Belum ada chat untuk di-compact.'); return; }
          manualBtn.textContent='⏳ Compact…'; manualBtn.disabled=true;
          try{
            const raw = buildRawMessagesSync();
            const keepV = parseInt(document.getElementById('cfg-compaction-keep')?.value) || parseInt(config.compactionKeep)||10;
            const selStrat = document.getElementById('cfg-compaction-strategy')?.value || config.compactionStrategy || 'truncate';
            let res;
            if(selStrat==='summarize'){ try{ res=await summarizeCompaction(raw, keepV); }catch(e){ res=truncateCompaction(raw, keepV); } }
            else if(selStrat==='hybrid') res=await hybridCompaction(raw, keepV);
            else res=truncateCompaction(raw, keepV);
            if(!res.wasCompacted){
              addContextNotice('ℹ️ Tidak ada pesan lama untuk di-compact — chat masih pendek.');
            } else {
              lastCompaction = { ...res, ts: Date.now() };
              const nm = res.strategy==='summarize' ? 'ringkas AI' : res.strategy==='hybrid' ? 'hybrid' : 'potong';
              addContextNotice(`🗜️ Manual compact: ${res.olderCount} pesan lama ${nm}, hemat ~${(res.savedTokens||0).toLocaleString('id-ID')} tokens. Kirim pesan berikutnya untuk memakai hasil compact.`);
            }
            try{ updateContextBar(); updateContextEstimateBox(); }catch(e){}
          }catch(e){ alert('Compact gagal: '+(e&&e.message||e)); }
          finally{ manualBtn.textContent='🗜️ Compact'; manualBtn.disabled=false; }
        });
      }
    })();

    // ── Read Form Values ──────────────────────
    function readFormConfig() {
      const reasoningEffort = document.getElementById('cfg-reasoning-effort').value;
      const cwSelVal = document.getElementById('cfg-context-window') ? document.getElementById('cfg-context-window').value : '32768';
      let ctxWin = 32768;
      let ctxWinCustom = '';
      if(cwSelVal==='custom'){
        const c = document.getElementById('cfg-context-window-custom');
        const rawVal = c ? (c.value || '').trim() : '';
        const n = rawVal ? parseInt(rawVal) : NaN;
        if(!isNaN(n) && n>=1024){
          ctxWin = 'custom';
          ctxWinCustom = String(n);
        } else if(rawVal){
          // user typed invalid number — keep flag custom but mark invalid for validation
          ctxWin = 'custom';
          ctxWinCustom = rawVal;
        } else {
          // empty custom field — fallback to previous custom or default window
          const prevCustom = parseInt(config.contextWindowCustom);
          if(!isNaN(prevCustom) && prevCustom>=1024){
            ctxWin = 'custom';
            ctxWinCustom = String(prevCustom);
          } else if(config.contextWindow === 'custom'){
            ctxWin = 'custom';
            ctxWinCustom = String(getEffectiveContextWindow());
          } else {
            ctxWin = parseInt(config.contextWindow) || 32768;
            ctxWinCustom = '';
            if(String(ctxWin)==='NaN' || ctxWin < 1024) ctxWin = 32768;
          }
        }
      } else {
        const n2 = parseInt(cwSelVal);
        ctxWin = (!isNaN(n2) && n2>=1024) ? n2 : 32768;
        ctxWinCustom = '';
      }

      return {
        baseUrl: document.getElementById('cfg-base-url').value.trim() || DEFAULT_CONFIG.baseUrl,
        apiKey: document.getElementById('cfg-api-key').value.trim(),
        model: document.getElementById('cfg-model').value.trim() || DEFAULT_CONFIG.model,
        // ── Poin 7: validasi ketat range ──
        temperature: (() => {
          const el = document.getElementById('cfg-temperature');
          const v = el ? el.value.trim() : '';
          if (v === '') return null;
          const n = parseFloat(v);
          if (isNaN(n)) return null;
          return Math.min(2, Math.max(0, n));
        })(),
        topP: (() => {
          const el = document.getElementById('cfg-top-p');
          const v = el ? el.value.trim() : '';
          if (v === '') return null;
          const n = parseFloat(v);
          if (isNaN(n)) return null;
          return Math.min(1, Math.max(0, n));
        })(),
        maxTokens: (() => {
          const v = document.getElementById('cfg-max-tokens').value.trim();
          if (v === '') return DEFAULT_CONFIG.maxTokens;
          const n = parseInt(v);
          if (isNaN(n) || n < 1) return DEFAULT_CONFIG.maxTokens;
          return Math.min(128000, n);
        })(),
        reasoningEffort,
        systemPromptEnabled: document.getElementById('cfg-system-toggle').checked,
        systemPrompt: document.getElementById('cfg-system-prompt').value.trim() || DEFAULT_CONFIG.systemPrompt,
        stream: document.getElementById('cfg-stream').value === 'true',
        memoryEnabled: document.getElementById('cfg-memory-toggle').checked,
        contextWindow: ctxWin,
        contextWindowCustom: ctxWinCustom,
        compactionEnabled: document.getElementById('cfg-compaction-toggle') ? document.getElementById('cfg-compaction-toggle').checked : true,
        compactionThreshold: document.getElementById('cfg-compaction-threshold') ? parseInt(document.getElementById('cfg-compaction-threshold').value)||80 : 80,
        compactionStrategy: document.getElementById('cfg-compaction-strategy') ? document.getElementById('cfg-compaction-strategy').value : 'truncate',
        compactionKeep: document.getElementById('cfg-compaction-keep') ? parseInt(document.getElementById('cfg-compaction-keep').value)||10 : 10,
      };
    }

    // ── Test Connection ────────────────────────
    document.getElementById('settings-test').addEventListener('click', async () => {
      const testCfg = readFormConfig();
      const testResult = document.getElementById('test-result');

      if (!testCfg.apiKey) {
        testResult.className = 'test-result error';
        testResult.style.display = 'block';
        testResult.textContent = '❌ API Key diminta';
        return;
      }

      testResult.className = 'test-result';
      testResult.style.display = 'block';
      testResult.textContent = '🔄 Tunggu…';

      try {
        let base = testCfg.baseUrl.replace(/\/+$/, '');
        if (base.endsWith('/chat/completions')) {
          // already full URL
        } else {
          base += '/chat/completions';
        }

        const response = await fetch(base, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${testCfg.apiKey}`,
          },
          body: JSON.stringify({
            model: testCfg.model,
            messages: [{ role: 'user', content: 'Hi' }],
            max_tokens: 10,
            stream: false,
            ...(testCfg.topP!==null&&testCfg.topP!==undefined ? { top_p: testCfg.topP } : {}),
            ...(testCfg.temperature!==null&&testCfg.temperature!==undefined ? { temperature: testCfg.temperature } : {}),
            ...(testCfg.reasoningEffort ? { reasoning_effort: testCfg.reasoningEffort } : {}),
          }),
        });

        if (response.ok) {
          const data = await response.json();
          const model = data.model || testCfg.model;
          testResult.className = 'test-result success';
          testResult.textContent = `✅ Terhubung! Model: ${model}`;
        } else {
          const errText = await response.text();
          let detail = '';
          try {
            const errJson = JSON.parse(errText);
            detail = errJson.error?.message || '';
          } catch (e) {}
          testResult.className = 'test-result error';
          testResult.textContent = `❌ HTTP ${response.status}${detail ? ': ' + detail : ''}`;
        }
      } catch (err) {
        testResult.className = 'test-result error';
        testResult.textContent = `❌ Koneksi gagal: ${err.message}`;
      }
    });

    // ── Save Settings ──────────────────────────
    document.getElementById('settings-save').addEventListener('click', () => {
      const newConfig = readFormConfig();
      // ── Poin 7: validasi sebelum save ──
      const errors = [];
      try { new URL(newConfig.baseUrl); } catch(e) { errors.push('API Endpoint URL tidak valid'); }
      if (!newConfig.model) errors.push('Model tidak boleh kosong');
      if (newConfig.contextWindow === 'custom') {
        const n = parseInt(newConfig.contextWindowCustom);
        if (isNaN(n) || n < 1024 || n > 1000000) errors.push('Custom Context Window harus 1024–1.000.000');
      }
      if (errors.length) {
        const tr = document.getElementById('test-result');
        tr.className = 'test-result error';
        tr.style.display = 'block';
        tr.textContent = '❌ ' + errors.join(' · ');
        return;
      }
      // clamp feedback ke input agar terlihat terkoreksi
      document.getElementById('cfg-temperature').value = newConfig.temperature === null ? '' : String(newConfig.temperature);
      const _topPInput = document.getElementById('cfg-top-p');
      if (_topPInput) _topPInput.value = newConfig.topP === null ? '' : String(newConfig.topP);
      document.getElementById('cfg-max-tokens').value = String(newConfig.maxTokens);
      const wasEnabled = config.memoryEnabled;
      // If memory was turned off, forget the saved history
      if (wasEnabled && !newConfig.memoryEnabled) {
        clearHistory();
        sessions=[];
        currentSessionId=null;
        messages=[];
        renderChat();
        renderSidebar();
      }
      config = newConfig;
      saveConfig();
      if(config.memoryEnabled){
        if(sessions.length===0){
          ensureSession();
          renderSidebar();
          renderChat();
        } else {
          persistCurrentSession();
        }
      }
      closeSettings();
      updateStatusFromConfig();
      try{ updateContextBar(); updateContextEstimateBox(); }catch(e){}
    });

    // ── Theme Dark/Light ───────────────────────
    const THEME_KEY = 'chatx_theme';
    function updateThemeBtn(theme){
      const btn = document.getElementById('theme-btn');
      if(!btn) return;
      if(theme === 'light'){
        btn.textContent = '🌙 Gelap';
        btn.title = 'Ganti ke Mode Gelap';
      } else {
        btn.textContent = '☀️ Terang';
        btn.title = 'Ganti ke Mode Terang';
      }
    }
    function applyTheme(theme){
      document.documentElement.setAttribute('data-theme', theme);
      localStorage.setItem(THEME_KEY, theme);
      updateThemeBtn(theme);
      try{ rerenderAllMermaidsForTheme(); }catch(e){ console.warn('mermaid theme rerender',e); }
    }
    (function initTheme(){
      const saved = localStorage.getItem(THEME_KEY);
      if(saved === 'light' || saved === 'dark'){
        applyTheme(saved);
      } else if(window.matchMedia && window.matchMedia('(prefers-color-scheme: light)').matches){
        applyTheme('light');
      } else {
        applyTheme('dark');
      }
    })();
    document.getElementById('theme-btn')?.addEventListener('click', ()=>{
      const cur = document.documentElement.getAttribute('data-theme') || 'dark';
      applyTheme(cur === 'dark' ? 'light' : 'dark');
    });

    // ── Init ───────────────────────────────────
    loadConfig();
    loadSessions();
    renderSidebar();
    renderChat();
    updateStatusFromConfig();
    try{ updateContextBar(); updateContextEstimateBox(); }catch(e){}

    // Show settings on first visit if no API key
    if (!config.apiKey) {
      setTimeout(openSettings, 600);
    }
  </script>
</body>
</html>
