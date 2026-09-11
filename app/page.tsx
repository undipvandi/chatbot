import Script from "next/script";

export default function Home() {
  return (
    <>
        <div id="layout">
      {/* Sidebar History */}
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
      {/* Header */}
      <header>
        <div style={{display: "flex", alignItems: "center", gap: "10px"}}>
          <button id="menu-btn" title="Menu">☰</button>
          <h1><span className="emoji">🤖</span>Playground Chat</h1>
        </div>
        <div className="header-actions">
          <button className="btn-icon" id="new-chat-btn" title="Obrolan Baru">➕<span>Chat baru</span></button>
          <button className="btn-icon" id="theme-btn" title="Ganti ke Mode Terang">☀️<span>Terang</span></button>
          <button className="btn-icon" id="settings-btn" title="Pengaturan">⚙️<span>Pengaturan</span></button>
        </div>
      </header>

      {/* Status Bar */}
      <div id="status-bar">
        <div className="status-dot" id="status-dot"></div>
        <span id="status-text">Not configured</span>
      </div>
      {/* Context Bar (Auto Compaction) */}
      <div id="context-bar">
        <span id="context-bar-label">🧠 Context</span>
        <div id="context-bar-track"><div id="context-bar-fill"></div></div>
        <span id="context-bar-text">0 / 32k (0%)</span>
        <span id="context-compacted-badge">🗜️ Compacted</span>
        <button id="context-manual-btn" title="Compact sekarang" style={{background: "var(--bg-tertiary)", border: "1px solid var(--border-color)", color: "var(--text-secondary)", padding: "2px 8px", borderRadius: "6px", fontSize: "0.65rem", cursor: "pointer", whiteSpace: "nowrap"}}>🗜️ Compact</button>
      </div>

      {/* Chat */}
      <div id="chat-container">
        <div id="welcome">
          <div className="emoji">💬</div>
          <h2>Bagaimana saya dapat membantu Anda hari ini?</h2>
          <p>Konfigurasikan API Key Anda di Pengaturan terlebih dahulu, lalu mulai mengobrol.</p>
          <div className="quick-prompts">
            <button className="quick-prompt" data-prompt="Explain quantum computing in simple terms">Quantum Computing</button>
            <button className="quick-prompt" data-prompt="Write a Python function to sort a list">Python Sort</button>
            <button className="quick-prompt" data-prompt="Explain the equation $E = mc^2$">E=mc²</button>
            <button className="quick-prompt" data-prompt="What is the integral of $x^2$?">Calculus</button>
          </div>
        </div>
      </div>

      {/* Input */}
      <div id="input-area">
        <div id="image-preview-bar"></div>
        <div className="input-wrapper">
          <button id="doc-btn" type="button" title="Tambah dokumen (.docx, .txt, .md)">📎</button>
          <input
            type="file"
            id="doc-input"
            accept=".txt,.md,.markdown,.docx,text/plain,text/markdown,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
            multiple
            hidden
          />
          <button id="attach-btn" type="button" title="Tambah gambar">+</button>
          <input type="file" id="image-input" accept="image/png,image/jpeg,image/jpg,image/webp,image/gif" multiple hidden />
          <textarea id="user-input" rows={1} placeholder="Tanyakan apa saja"></textarea>
          <button id="stop-btn" title="Hentikan Respon">■</button>
          <button id="send-btn" title="Kirim">➤</button>
        </div>
        <div className="input-hint">Enter kirim · Shift+Enter baris baru · 📎 lampirkan .docx/.txt/.md · + gambar · tarik &amp; lepas untuk lampiran</div>
      </div>
        </div>
        </div>

        {/* Settings Modal */}
        <div className="modal-overlay" id="settings-modal">
      <div className="modal">
        <h2>⚙️ Pengaturan API</h2>

        <div className="form-group">
          <label>API Host (Chat Completions API)</label>
          <input type="text" id="cfg-base-url" placeholder="https://tokenhub-intl.tencentcloudmaas.com/v1" />
          <div className="hint">Jalur <code>/chat/completions</code> akan ditambahkan secara otomatis</div>
        </div>

        <div className="form-group">
          <label>API Key</label>
          <input type="password" id="cfg-api-key" placeholder="API key Anda…" />
          <div className="hint">Bearer token untuk Authorization header. Kosongkan bila key sudah dikonfigurasi di server (env <code>LLM_API_KEY</code>).</div>
        </div>

        <div className="toggle-row">
          <label>Server Proxy (hindari CORS)</label>
          <label className="toggle">
            <input type="checkbox" id="cfg-proxy-toggle" />
            <span className="toggle-slider"></span>
          </label>
        </div>
        <div className="form-group">
          <div className="hint">Beberapa model/provider tidak mengizinkan permintaan langsung dari browser (respons tanpa header <code>Access-Control-Allow-Origin</code> → diblokir CORS). Jika aktif, request dikirim ke <code>/api/chat</code> di server Next.js lalu diteruskan ke API host. Matikan hanya jika provider Anda mendukung CORS.</div>
        </div>

        <div className="form-group">
          <label>Model</label>
          <input type="text" id="cfg-model" placeholder="glm-5.3" />
        </div>

        <div className="form-group">
          <label>Temperature</label>
          <input type="number" id="cfg-temperature" min="0" max="2" step="0.1" placeholder="default" />
        </div>

        <div className="form-group">
          <label>Top P</label>
          <input type="number" id="cfg-top-p" min="0" max="1" step="0.01" placeholder="default" />
        </div>

        <div className="form-group">
          <label>Max Tokens</label>
          <input type="number" id="cfg-max-tokens" min="1" max="128000" step="1" placeholder="4096" />
        </div>

        <div className="form-group">
          <label>Reasoning Effort</label>
          <select id="cfg-reasoning-effort">
            <option value="">Default</option>
            <option value="none">none</option>
            <option value="off">off</option>
            <option value="minimal">minimal</option>
            <option value="low">low</option>
            <option value="medium">medium</option>
            <option value="high">high</option>
            <option value="xhigh">xhigh</option>
            <option value="max">max</option>
            <option value="ultra">ultra</option>
          </select>
        </div>

        <div className="toggle-row">
          <label>Enable System Prompt</label>
          <label className="toggle">
            <input type="checkbox" id="cfg-system-toggle" />
            <span className="toggle-slider"></span>
          </label>
        </div>

        <div className="form-group" id="system-prompt-group" style={{display: "none"}}>
          <label>System Prompt</label>
          <textarea id="cfg-system-prompt" rows={3} placeholder="You are a helpful assistant."></textarea>
        </div>

        <div className="form-group">
          <label>Stream Response</label>
          <select id="cfg-stream">
            <option value="true">Yes (direkomendasikan)</option>
            <option value="false">No</option>
          </select>
        </div>

        <div className="toggle-row">
          <label>Memory (ingat riwayat obrolan)</label>
          <label className="toggle">
            <input type="checkbox" id="cfg-memory-toggle" />
            <span className="toggle-slider"></span>
          </label>
        </div>
        <div className="form-group">
          <div className="hint">Jika diaktifkan, percakapan akan disimpan dalam penyimpanan browser dan dipulihkan saat halaman dimuat ulang. AI akan tetap mempertahankan konteks dari pesan-pesan sebelumnya. Nonaktifkan untuk melupakan semuanya.</div>
        </div>

        <div className="context-group">
          <div className="context-group-title">🧠 Context Management — Auto Compaction</div>

          <div className="form-group" style={{marginBottom: "10px"}}>
            <label>Context Window</label>
            <select id="cfg-context-window" defaultValue="32768">
              <option value="8192">8k</option>
              <option value="16384">16k</option>
              <option value="32768">32k</option>
              <option value="65536">64k</option>
              <option value="128000">128k</option>
              <option value="256000">256k</option>
              <option value="1000000">1M (1.000.000)</option>
              <option value="custom">Custom…</option>
            </select>
            <div className="hint">Kapasitas context window model-mu. Menentukan 100% pada bar.</div>
          </div>
          <div className="form-group" id="context-custom-group" style={{display: "none"}}>
            <label>Custom Context Window</label>
            <input type="number" id="cfg-context-window-custom" min="1024" max="1000000" step="1024" placeholder="mis. 48000" />
          </div>

          <div className="toggle-row">
            <label>Auto Compaction (otomatis ringkas saat penuh)</label>
            <label className="toggle">
              <input type="checkbox" id="cfg-compaction-toggle" />
              <span className="toggle-slider"></span>
            </label>
          </div>

          <div className="form-group" style={{marginBottom: "8px"}}>
            <label>Compaction Threshold — <span id="cfg-threshold-label">80%</span></label>
            <div className="range-row">
              <input type="range" id="cfg-compaction-threshold" min="50" max="95" step="5" defaultValue={80} />
              <span className="range-val" id="cfg-threshold-val">80%</span>
            </div>
          </div>

          <div className="form-group" style={{marginBottom: "8px"}}>
            <label>Strategi Compaction</label>
            <select id="cfg-compaction-strategy" defaultValue="summarize">
              <option value="summarize">🧠 Summarize (tanya AI untuk ringkas — paling akurat)</option>
              <option value="truncate">✂️ Truncate (potong pesan tertua — instan & offline)</option>
              <option value="hybrid">⚡ Hybrid (summarize jika online, fallback truncate jika gagal)</option>
            </select>
            <div className="hint"><b>Summarize:</b> kirim pesan lama ke model untuk diringkas. <b>Truncate:</b> buang pesan tertua, simpan N pesan terbaru. <b>Hybrid:</b> coba summarize dulu.</div>
          </div>

          <div className="form-group" style={{marginBottom: "0"}}>
            <label>Keep Recent (pesan terbaru yang selalu dipertahankan)</label>
            <select id="cfg-compaction-keep" defaultValue="10">
              <option value="4">4 pesan</option>
              <option value="6">6 pesan</option>
              <option value="10">10 pesan</option>
              <option value="16">16 pesan</option>
              <option value="20">20 pesan</option>
            </select>
            <div className="hint">Pesan terbaru ini tidak pernah diringkas/dipotong.</div>
          </div>

          <div className="context-estimate" id="context-estimate-box">Menghitung…</div>
        </div>

        <div className="test-result" id="test-result"></div>

        <div className="modal-actions">
          <button className="btn btn-secondary" id="settings-cancel">Batal</button>
          <button className="btn btn-test" id="settings-test">🧪 Uji</button>
          <button className="btn btn-primary" id="settings-save">💾 Simpan</button>
        </div>
      </div>
        </div>

      {/* Logika aplikasi: dimuat setelah hydration agar seluruh elemen DOM di atas sudah tersedia */}
      <Script src="/chatbot.js" />
    </>
  );
}
