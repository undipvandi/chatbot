// ── IndexedDB-backed Storage (migrasi dari localStorage) ──
    // API sinkron (getItem/setItem/removeItem) dengan cache di memori,
    // tulis async (write-through + antrean) ke IndexedDB. storage.ready = promise saat data selesai dimuat.
    const storage = (() => {
      const DB_NAME = 'chatx_db';
      const STORE_NAME = 'kv';
      const MIGRATED_FLAG = 'chatx_idb_migrated_v1';
      const MAX_QUEUE = 500;
      const cache = new Map();
      let db = null;
      let dbReady = false;
      let quotaWarned = false;
      const writeQueue = [];
      // Key yang ditulis setelah init dimulai — loadAll tidak boleh menimpanya dengan data lama dari IDB.
      const dirtyKeys = new Set();
      let initDone = false;
      let clearedDuringInit = false;

      function openDB(){
        return new Promise((resolve, reject) => {
          if(!('indexedDB' in window)) return reject(new Error('IndexedDB tidak didukung'));
          let req;
          try { req = indexedDB.open(DB_NAME, 1); }
          catch(e){ return reject(e); }
          req.onupgradeneeded = () => {
            try{
              const d = req.result;
              if(!d.objectStoreNames.contains(STORE_NAME)) d.createObjectStore(STORE_NAME);
            }catch(e){ /* abaikan, ditangani onerror */ }
          };
          req.onsuccess = () => {
            const d = req.result;
            try{
              d.onversionchange = () => { try{ d.close(); }catch(e){} };
              d.onerror = (ev) => { console.warn('[storage] db error', ev && ev.target && ev.target.error); };
            }catch(e){}
            resolve(d);
          };
          req.onerror = () => reject(req.error || new Error('Gagal buka IndexedDB'));
          req.onblocked = () => console.warn('[storage] open blocked — tutup tab lain yang memakai DB ini');
        });
      }

      function handleWriteError(op, err){
        const name = (err && err.name) || '';
        if(name === 'QuotaExceededError' || (err && err.code === 22)){
          if(!quotaWarned){
            quotaWarned = true;
            console.warn('[storage] kuota penyimpanan penuh — data hanya di memori, hapus riwayat lama');
            try{ showMathToast('⚠️ Penyimpanan penuh — hapus riwayat lama agar data tersimpan'); }catch(e){}
          }
          return;
        }
        console.warn('[storage] tulis gagal', op && op.type, err);
      }

      function applyOp(op){
        if(!db) return;
        let tx;
        try { tx = db.transaction(STORE_NAME, 'readwrite'); }
        catch(e){ handleWriteError(op, e); return; }
        let st;
        try { st = tx.objectStore(STORE_NAME); }
        catch(e){ handleWriteError(op, e); return; }
        try{
          let req = null;
          if(op.type === 'put') req = st.put(op.v, op.k);
          else if(op.type === 'del') req = st.delete(op.k);
          else if(op.type === 'clear') req = st.clear();
          if(req) req.onerror = (ev) => { ev && ev.preventDefault && ev.preventDefault(); handleWriteError(op, req.error); };
          tx.onerror = (ev) => { ev && ev.preventDefault && ev.preventDefault(); handleWriteError(op, tx.error); };
          tx.onabort = () => { if(tx.error) handleWriteError(op, tx.error); };
        }catch(e){ handleWriteError(op, e); }
      }

      function flushQueue(){
        if(!db || !dbReady) return;
        const ops = writeQueue.splice(0, writeQueue.length);
        for(const op of ops) applyOp(op);
      }

      function enqueue(op){
        if(dbReady && db){ applyOp(op); return; }
        if(writeQueue.length >= MAX_QUEUE) writeQueue.shift();
        writeQueue.push(op);
      }

      // Migrasi satu-kali: jika flag belum ada, salin key milik app dari localStorage lalu hapus key itu saja
      function migrateFromLocalStorage(d){
        return new Promise((resolve) => {
          let done = false;
          const finish = () => { if(!done){ done = true; resolve(); } };
          try{
            if(d === null){ finish(); return; }
            // 1) Cek flag langsung di IndexedDB (cache masih kosong saat tahap ini)
            let checkTx;
            try { checkTx = d.transaction(STORE_NAME, 'readonly'); }
            catch(e){ finish(); return; }
            let flagReq;
            try { flagReq = checkTx.objectStore(STORE_NAME).get(MIGRATED_FLAG); }
            catch(e){ finish(); return; }
            flagReq.onsuccess = () => {
              let already = false;
              try{ already = flagReq.result === '1'; }catch(e){}
              if(already){ finish(); return; }
              startMigrateOnce();
            };
            let _migrateStarted = false;
            function startMigrateOnce(){ if(_migrateStarted) return; _migrateStarted = true; doMigrate(); }
            flagReq.onerror = () => startMigrateOnce();
            checkTx.onerror = () => startMigrateOnce();
            checkTx.onabort = () => startMigrateOnce();

            function doMigrate(){
              try{
                let keys = [];
                try{
                  for(let i = 0; i < localStorage.length; i++){
                    const k = localStorage.key(i);
                    if(k !== null && k !== undefined) keys.push(k);
                  }
                }catch(e){ finish(); return; }
                keys = keys.filter(k => k === MIGRATED_FLAG || k.indexOf('chatbot_') === 0 || k.indexOf('chatx_') === 0 || k.indexOf('math_copy_') === 0);
                let wtx;
                try { wtx = d.transaction(STORE_NAME, 'readwrite'); }
                catch(e){ finish(); return; }
                const wst = wtx.objectStore(STORE_NAME);
                wtx.oncomplete = () => {
                  try{ cache.set(MIGRATED_FLAG, '1'); }catch(e){}
                  try{ for(const k of keys){ try{ localStorage.removeItem(k); }catch(e){} } }catch(e){}
                  finish();
                };
                wtx.onerror = () => finish();
                wtx.onabort = () => finish();
                if(keys.length === 0){
                  try{ wst.put('1', MIGRATED_FLAG); }catch(e){}
                  return;
                }
                // Hanya isi key yang belum ada di IDB (jangan timpa data IDB yang lebih baru)
                try{
                  const pending = [];
                  for(const k of keys){
                    try{ pending.push({ k, req: wst.get(k) }); }catch(e){}
                  }
                  // tulis setelah hasil get diketahui — pakai oncomplete transaksi kedua agar aman
                  wtx.oncomplete = () => {
                    try{
                      const missing = [];
                      for(const g of pending){
                        let v = undefined;
                        try{ v = g.req.result; }catch(e){}
                        if(v === undefined) missing.push(g.k);
                      }
                      if(missing.length === 0 && keys.length === pending.length){
                        // tidak ada yang perlu disalin — cukup tulis flag + bersihkan LS
                        let ftx;
                        try { ftx = d.transaction(STORE_NAME, 'readwrite'); }
                        catch(e){ finish(); return; }
                        try{ ftx.objectStore(STORE_NAME).put('1', MIGRATED_FLAG); }catch(e){}
                        ftx.oncomplete = () => {
                          try{ cache.set(MIGRATED_FLAG, '1'); }catch(e){}
                          try{ for(const k of keys){ try{ localStorage.removeItem(k); }catch(e){} } }catch(e){}
                          finish();
                        };
                        ftx.onerror = () => finish();
                        ftx.onabort = () => finish();
                        return;
                      }
                      let mtx;
                      try { mtx = d.transaction(STORE_NAME, 'readwrite'); }
                      catch(e){ finish(); return; }
                      const mst = mtx.objectStore(STORE_NAME);
                      for(const k of missing){ try{ mst.put(localStorage.getItem(k), k); }catch(e){} }
                      try{ mst.put('1', MIGRATED_FLAG); }catch(e){}
                      mtx.oncomplete = () => {
                        try{ cache.set(MIGRATED_FLAG, '1'); }catch(e){}
                        try{ for(const k of missing){ try{ localStorage.removeItem(k); }catch(e){} } }catch(e){}
                        try{ for(const k of keys){ if(missing.indexOf(k) === -1){ try{ localStorage.removeItem(k); }catch(e){} } } }catch(e){}
                        finish();
                      };
                      mtx.onerror = () => finish();
                      mtx.onabort = () => finish();
                    }catch(e){ finish(); }
                  };
                }catch(e){ finish(); }
              }catch(e){ finish(); }
            }
          }catch(e){ finish(); }
          // pengaman: jangan gantung selamanya
          setTimeout(finish, 5000);
        });
      }

      function loadAll(d){
        return new Promise((resolve) => {
          try{
            const tx = d.transaction(STORE_NAME, 'readonly');
            const st = tx.objectStore(STORE_NAME);
            // Satu cursor = satu snapshot konsisten (lebih aman dari getAllKeys+getAll ganda)
            const out = new Map();
            let cursorReq;
            try { cursorReq = st.openCursor(); }
            catch(e){ resolve(); return; }
            cursorReq.onsuccess = (ev) => {
              let cur = null;
              try{ cur = ev.target.result; }catch(e){ cur = cursorReq.result; }
              if(cur){
                try{ out.set(String(cur.key), cur.value); }catch(e){}
                try{ cur.continue(); }catch(e){ finish(); }
              } else finish();
            };
            cursorReq.onerror = () => finish();
            function finish(){
              try{
                for(const [k, v] of out){
                  // Jangan timpa data yang ditulis/dihapus setelah init dimulai (cache lebih baru).
                  if(dirtyKeys.has(k)) continue;
                  if(clearedDuringInit) continue;
                  if(!cache.has(k)) cache.set(k, v);
                }
              }catch(e){}
              resolve();
            }
            tx.onerror = () => finish();
            tx.onabort = () => finish();
            tx.oncomplete = () => finish();
          }catch(e){ resolve(); }
        });
      }

      const ready = openDB()
        .then(d => { db = d; dbReady = true; return migrateFromLocalStorage(d); })
        .then(() => { flushQueue(); }) // tulis antrean dulu agar loadAll membaca state terbaru
        .then(() => loadAll(db))
        .then(() => { flushQueue(); initDone = true; dirtyKeys.clear(); })
        .catch(err => {
          console.warn('[storage] IndexedDB gagal init, pakai memori saja:', err);
          dbReady = false;
          initDone = true;
          dirtyKeys.clear();
        });

      // Minta persistent storage agar tidak di-evict browser (best-effort)
      try{
        if(navigator && navigator.storage && navigator.storage.persist){
          ready.then(() => { try{ navigator.storage.persist(); }catch(e){} });
        }
      }catch(e){}

      function idbPut(k, v){ enqueue({ type: 'put', k, v }); }
      function idbDel(k){ enqueue({ type: 'del', k }); }

      return {
        ready,
        getItem(k){ const v = cache.get(String(k)); return v === undefined ? null : v; },
        setItem(k, v){ v = String(v); k = String(k); cache.set(k, v); if(!initDone) dirtyKeys.add(k); idbPut(k, v); },
        removeItem(k){ k = String(k); cache.delete(k); if(!initDone) dirtyKeys.add(k); idbDel(k); },
        clear(){ cache.clear(); if(!initDone) clearedDuringInit = true; enqueue({ type: 'clear' }); },
        key(i){ return Array.from(cache.keys())[i] ?? null; },
        get length(){ return cache.size; }
      };
    })();

    // ── Default Config (YOUR API) ──────────────
    const DEFAULT_CONFIG = {
      baseUrl: 'https://tokenhub-intl.tencentcloudmaas.com/v1',
      apiKey: '',
      // useProxy: request LLM lewat route handler /api/chat di server Next.js
      // (menghindari CORS pada provider/model yang tidak mengizinkan akses browser langsung)
      useProxy: true,
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
    // ── Dokumen (TXT / DOCX) — lampiran teks penuh + chunking sadar-konteks ──
    const MAX_DOCS_PER_MESSAGE = 5;
    const DOC_MAX_FILE_BYTES = 60 * 1024 * 1024;
    const DOC_CHUNK_MAX_TOKENS = 48000;
    const DOC_OVERLAP_CHARS = 700;
    const DEFAULT_DOC_QUESTION = 'Baca dan analisis dokumen ini secara menyeluruh, lalu jelaskan isinya.';
    let pendingDocs = [];
    const docs = new Map(); // id -> { id, name, ext, size, chars, tokens, headings, title, text, createdAt }
    const docsExpansionCache = new WeakMap();
    const DOCS_KEY = 'chatx_docs';
    let _docsSaveTimer = null;
    let _docsDirty = false;
    function genDocId(){ return 'doc_'+Date.now().toString(36)+Math.random().toString(36).slice(2,7); }
    function getDocById(id){ try{ return docs.get(id) || null; }catch(e){ return null; } }
    function formatTokenCount(n){ n = Number(n)||0; return n>=1000000 ? (n/1000000).toFixed(2)+'M' : n>=1000 ? (n/1000).toFixed(1)+'k' : String(n); }
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
          if(approxBytes > MAX_IMAGE_BYTES){ showMathToast(`❌ ${file.name} hasil compress masih terlalu besar (maks ${formatBytes(MAX_IMAGE_BYTES)})`); continue; }
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
      const docBtn=document.getElementById('doc-btn');
      if(!bar) return;
      bar.innerHTML='';
      const nImages = Array.isArray(pendingImages)? pendingImages.length : 0;
      const nDocs = Array.isArray(pendingDocs)? pendingDocs.length : 0;
      if(nImages===0 && nDocs===0){
        bar.classList.remove('visible');
        if(btn){ btn.classList.remove('has-images'); btn.title='Tambah gambar (multimodal)'; }
        if(docBtn){ docBtn.classList.remove('has-docs'); docBtn.title='Tambah dokumen (.docx, .txt, .md)'; }
        return;
      }
      bar.classList.add('visible');
      if(btn){
        btn.classList.toggle('has-images', nImages>0);
        btn.title = nImages>0 ? `${nImages} gambar terpilih — klik untuk tambah/hapus` : 'Tambah gambar (multimodal)';
      }
      if(docBtn){
        docBtn.classList.toggle('has-docs', nDocs>0);
        docBtn.title = nDocs>0 ? `${nDocs} dokumen terpilih — klik untuk tambah/hapus` : 'Tambah dokumen (.docx, .txt, .md)';
      }
      pendingDocs.forEach(doc=>{
        const icon = doc.ext==='docx' ? '📄' : (doc.ext==='md'||doc.ext==='markdown') ? '📝' : '📃';
        const wrap=document.createElement('div');
        wrap.className='preview-item doc';
        wrap.style.cursor='pointer';
        wrap.title='Klik untuk melihat isi dokumen';
        const ic=document.createElement('div'); ic.className='doc-icon'; ic.textContent=icon;
        const tx=document.createElement('div'); tx.className='doc-text';
        const nm=document.createElement('div'); nm.className='doc-name'; nm.textContent=doc.name; nm.title=doc.name;
        const mt=document.createElement('div'); mt.className='doc-meta';
        mt.textContent=`~${formatTokenCount(doc.tokens)} token • ${Number(doc.chars||0).toLocaleString('id-ID')} karakter`;
        tx.appendChild(nm); tx.appendChild(mt);
        const rem=document.createElement('button');
        rem.className='preview-remove';
        rem.type='button';
        rem.textContent='✕';
        rem.title='Hapus dokumen';
        rem.onclick=(e)=>{ if(e && e.stopPropagation) e.stopPropagation(); removePendingDoc(doc.id); };
        wrap.appendChild(ic); wrap.appendChild(tx); wrap.appendChild(rem);
        wrap.addEventListener('click', ()=> openDocViewer(doc.id, doc));
        bar.appendChild(wrap);
      });
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
      hint.textContent= `${nImages}/${MAX_IMAGES_PER_MESSAGE} gambar • ${nDocs}/${MAX_DOCS_PER_MESSAGE} dokumen`;
      bar.appendChild(hint);
    }
    function removePendingImage(id){
      pendingImages = pendingImages.filter(p=>p.id!==id);
      renderPendingPreview();
    }
    function removePendingDoc(id){
      pendingDocs = pendingDocs.filter(p=>p.id!==id);
      renderPendingPreview();
    }
    function clearPendingImages(){
      pendingImages=[];
      renderPendingPreview();
      const inp=document.getElementById('image-input');
      if(inp) inp.value='';
    }
    function clearPendingDocs(){
      pendingDocs=[];
      renderPendingPreview();
      const inp=document.getElementById('doc-input');
      if(inp) inp.value='';
    }
    function clearPendingAttachments(){
      clearPendingImages();
      clearPendingDocs();
    }
    function hasPendingAttachments(){
      return (Array.isArray(pendingImages) && pendingImages.length>0) || (Array.isArray(pendingDocs) && pendingDocs.length>0);
    }
    // ── Dokumen: registry (teks penuh disimpan terpisah dari riwayat chat) ──
    function loadDocsRegistry(){
      try{
        const raw = storage.getItem(DOCS_KEY);
        if(!raw) return;
        const parsed = JSON.parse(raw);
        const arr = Array.isArray(parsed) ? parsed : (parsed && Array.isArray(parsed.docs) ? parsed.docs : []);
        for(const d of arr){ if(d && d.id && typeof d.text==='string') docs.set(d.id, d); }
      }catch(e){ console.warn('[Docs] gagal memuat registry', e); }
    }
    function flushDocsRegistry(){
      try{
        if(_docsSaveTimer){ clearTimeout(_docsSaveTimer); _docsSaveTimer=null; }
        if(_docsDirty && storage){
          storage.setItem(DOCS_KEY, JSON.stringify(Array.from(docs.values())));
          _docsDirty = false;
        }
      }catch(e){ console.warn('[Docs] gagal menyimpan registry', e); }
    }
    function saveDocsRegistry(){
      _docsDirty = true;
      try{
        if(_docsSaveTimer) clearTimeout(_docsSaveTimer);
        _docsSaveTimer = setTimeout(()=>{ _docsSaveTimer=null; flushDocsRegistry(); }, 600);
      }catch(e){ flushDocsRegistry(); }
    }
    function pruneDocsRegistry(){
      try{
        const used = new Set();
        for(const s of (sessions||[])){
          for(const m of (s.messages||[])){
            if(m && Array.isArray(m.attachments)) for(const a of m.attachments){ if(a && a.id) used.add(a.id); }
          }
        }
        let changed=false;
        for(const id of Array.from(docs.keys())){ if(!used.has(id)){ docs.delete(id); changed=true; } }
        if(changed) saveDocsRegistry();
      }catch(e){}
    }
    // ── Dokumen: ekstraksi (DOCX di server, TXT/MD lokal) ──
    function classifyDocFile(file){
      const name = (file && file.name) || '';
      const ext = (name.split('.').pop()||'').toLowerCase();
      if(file && file.type && file.type.startsWith('image/')) return 'image';
      if(ext==='docx' || ext==='txt' || ext==='md' || ext==='markdown') return 'doc';
      if(file && file.type==='text/plain') return 'doc';
      return 'unknown';
    }
    async function decodeTextBuffer(buf){
      const u8 = new Uint8Array(buf);
      if(u8.length>=3 && u8[0]===0xef && u8[1]===0xbb && u8[2]===0xbf) return new TextDecoder('utf-8').decode(u8.subarray(3));
      if(u8.length>=2 && u8[0]===0xff && u8[1]===0xfe) return new TextDecoder('utf-16le').decode(u8.subarray(2));
      if(u8.length>=2 && u8[0]===0xfe && u8[1]===0xff){
        const rest = u8.subarray(2, u8.length - ((u8.length-2)%2));
        const swapped = new Uint8Array(rest.length);
        for(let i=0;i<rest.length;i+=2){ swapped[i]=rest[i+1]; swapped[i+1]=rest[i]; }
        return new TextDecoder('utf-16le').decode(swapped);
      }
      return new TextDecoder('utf-8').decode(u8);
    }
    function parseMarkdownHeadings(text){
      const headings=[];
      const re=/^(#{1,6})\s+(.+?)\s*$/gm;
      let m;
      while((m=re.exec(text))!==null && headings.length<1000){ headings.push({ level:m[1].length, text:m[2].slice(0,300), offset:m.index }); }
      return headings;
    }
    async function extractDocxOnServer(file){
      const fd = new FormData();
      fd.append('file', file, file.name || 'dokumen.docx');
      const res = await fetch('/api/extract', { method:'POST', body: fd });
      let data = null;
      try{ data = await res.json(); }catch(e){}
      if(!res.ok || !data || data.ok !== true){
        throw new Error((data && data.error) || `HTTP ${res.status}`);
      }
      return data;
    }
    async function readTextDocument(file){
      const buf = await file.arrayBuffer();
      const text = (await decodeTextBuffer(buf)).replace(/\uFEFF/g,'');
      return { text, headings: parseMarkdownHeadings(text), title: '' };
    }
    async function addPendingDocs(fileList){
      const files = Array.from(fileList||[]).filter(f=> classifyDocFile(f)==='doc');
      if(files.length===0){ showMathToast('❌ Hanya file .docx, .txt, dan .md yang didukung'); return; }
      const remain = MAX_DOCS_PER_MESSAGE - pendingDocs.length;
      if(remain<=0){ showMathToast(`⚠️ Maksimal ${MAX_DOCS_PER_MESSAGE} dokumen per pesan`); return; }
      const toAdd = files.slice(0, remain);
      if(files.length > remain) showMathToast(`⚠️ Hanya ${remain} dokumen ditambahkan (maks ${MAX_DOCS_PER_MESSAGE})`);
      for(const file of toAdd){
        if(file.size > DOC_MAX_FILE_BYTES){ showMathToast(`❌ ${file.name} terlalu besar (>${formatBytes(DOC_MAX_FILE_BYTES)})`); continue; }
        try{
          showMathToast(`⏳ Mengekstrak ${file.name}…`);
          const ext = (file.name.split('.').pop()||'').toLowerCase();
          const parsed = ext==='docx' ? await extractDocxOnServer(file) : await readTextDocument(file);
          const text = String(parsed.text||'').replace(/\r\n?/g,'\n').trim();
          if(!text){ showMathToast(`❌ ${file.name} tidak berisi teks yang bisa dibaca`); continue; }
          const id = genDocId();
          const rec = {
            id, name:file.name, ext, size:file.size,
            chars:text.length, tokens: estimateTokens(text),
            headings: Array.isArray(parsed.headings)? parsed.headings : [],
            title: parsed.title || '',
            text, createdAt: Date.now(),
          };
          docs.set(id, rec);
          pendingDocs.push({ id, name:rec.name, ext, size:rec.size, chars:rec.chars, tokens:rec.tokens });
          saveDocsRegistry();
          showMathToast(`✅ <b>${rec.name}</b> — ${rec.chars.toLocaleString('id-ID')} karakter (~${rec.tokens.toLocaleString('id-ID')} token)`);
        }catch(e){
          console.warn('[Docs] ekstraksi gagal', e);
          showMathToast(`❌ Gagal mengekstrak ${file.name}: ${e && e.message ? e.message : e}`);
        }
      }
      renderPendingPreview();
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
    // ── Dokumen: chunking sadar-konteks ─────────
    // Tujuan: dokumen yang muat dikirim UTUH. Jika harus dipecah, setiap bagian
    // membawa manifest + posisinya, dan ada overlap antar-bagian sehingga tidak
    // ada konteks yang hilang di batas chunk.
    function splitDocParagraphs(text){
      return String(text||'').replace(/\r\n?/g,'\n').split('\n').map(l=>l.replace(/\s+$/,'')).filter(l=>l.trim().length>0);
    }
    function hardSplitText(str, maxLen){
      const out=[]; let s=String(str||'');
      const max = Math.max(200, maxLen|0);
      while(s.length > max){
        let cut = s.lastIndexOf('\n', max);
        if(cut < max*0.5) cut = s.lastIndexOf('. ', max);
        if(cut < max*0.5) cut = s.lastIndexOf('; ', max);
        if(cut < max*0.5) cut = s.lastIndexOf(' ', max);
        if(cut <= 0) cut = max - 1;
        out.push(s.slice(0, cut+1).trimEnd());
        s = s.slice(cut+1);
      }
      if(s.trim()) out.push(s.trim());
      return out.length ? out : [String(str||'')];
    }
    function packDocChunks(text, budgetChars, overlapChars){
      const budget = Math.max(1500, budgetChars|0);
      const overlap = Math.max(0, Math.min(overlapChars|0, Math.floor(budget/3)));
      const paras = splitDocParagraphs(text);
      const chunks = [];
      let cur = '';
      const pushCur = ()=>{ const t=cur.trim(); if(t) chunks.push(t); cur=''; };
      const tailOf = (s)=> overlap>0 ? s.slice(-overlap) : '';
      for(const para of paras){
        const segments = para.length > budget ? hardSplitText(para, Math.max(800, budget - overlap)) : [para];
        for(const seg of segments){
          if(!cur){ cur = seg; continue; }
          if(cur.length + seg.length + 1 <= budget){ cur += '\n' + seg; continue; }
          const tail = tailOf(cur);
          pushCur();
          cur = tail ? tail + '\n' + seg : seg;
        }
      }
      pushCur();
      return chunks.length ? chunks : [String(text||'').trim()];
    }
    function buildDocManifest(doc, totalParts){
      const lines = [];
      lines.push(`Judul: ${doc.title || doc.name}`);
      lines.push(`Total: ${totalParts} bagian • ${Number(doc.chars||0).toLocaleString('id-ID')} karakter • ~${Number(doc.tokens||0).toLocaleString('id-ID')} token`);
      const hs = Array.isArray(doc.headings) ? doc.headings : [];
      if(hs.length){
        lines.push('Daftar isi (perkiraan posisi bagian):');
        for(const h of hs.slice(0, 80)){
          const frac = doc.chars ? Math.max(0, Math.min(0.999, (Number(h.offset)||0)/doc.chars)) : 0;
          const part = Math.min(totalParts, Math.floor(frac*totalParts)+1);
          lines.push(`  ${'#'.repeat(Math.max(1,Math.min(6,Number(h.level)||1)))} ${String(h.text||'').slice(0,160)} → bagian ${part}`);
        }
        if(hs.length>80) lines.push(`  … (${hs.length-80} judul lainnya tidak ditampilkan)`);
      }
      return lines.join('\n');
    }
    function planAttachments(docsMeta, questionText){
      const metas = Array.isArray(docsMeta) ? docsMeta.filter(Boolean) : [];
      const win = getEffectiveContextWindow();
      const reserve = Math.max(1024, Math.min(parseInt(config.maxTokens)||4096, Math.floor(win*0.5)));
      const safety = Math.max(512, Math.floor(win*0.05));
      const ownTokens = metas.reduce((s,d)=> s + (Number(d.tokens)||0), 0);
      let base = 0;
      try{ base = estimateBaseTokens() - ownTokens + estimateTokens(questionText||'') + 4; }catch(e){ base = 0; }
      let remaining = Math.max(2048, Math.floor((win - reserve - safety - base) * 0.95));
      const perChunkTokens = Math.max(2048, Math.min(DOC_CHUNK_MAX_TOKENS, Math.floor(Math.max(4096, remaining) * 0.5)));
      const budgetChars = Math.max(4000, Math.floor(perChunkTokens * 4));
      const plans = [];
      for(const d of metas){
        const doc = getDocById(d.id);
        const text = doc ? String(doc.text||'') : '';
        const chunks = text ? packDocChunks(text, budgetChars, DOC_OVERLAP_CHARS) : [];
        const totalParts = Math.max(1, chunks.length);
        let sentParts = 0, sentTokens = 0;
        for(const c of chunks){
          const t = estimateTokens(c) + 80;
          if(sentTokens + t > remaining) break;
          sentParts++; sentTokens += t;
        }
        if(chunks.length===0) sentParts = 0;
        remaining = Math.max(0, remaining - sentTokens);
        plans.push({
          id:d.id, name:d.name,
          tokens:Number(d.tokens)||estimateTokens(text),
          chars:Number(d.chars)||text.length,
          totalParts, sentParts, chunkChars:budgetChars,
          truncated: sentParts < totalParts,
        });
      }
      return plans;
    }
    function isAttachmentMessage(m){
      try{ return !!(m && (m._protected || (Array.isArray(m.attachments) && m.attachments.length>0))); }catch(e){ return false; }
    }
    function sanitizeApiMessages(list){
      if(!Array.isArray(list)) return list;
      return list.map(m=>{
        if(!m || typeof m!=='object') return m;
        const out = {};
        for(const k of Object.keys(m)){
          if(k.charAt(0)==='_' || k==='attachments' || k==='reasoningTime') continue;
          out[k]=m[k];
        }
        return out;
      });
    }
    function expandAttachmentMessage(m){
      if(!m || !Array.isArray(m.attachments) || m.attachments.length===0) return [m];
      const cached = docsExpansionCache.get(m);
      if(cached) return cached;
      const question = getMessageText(m).trim();
      const images = getMessageImages(m);
      const needsPlan = m.attachments.some(a=> !a || a.totalParts==null || a.chunkChars==null || a.sentParts==null);
      const fallbackPlans = needsPlan ? planAttachments(m.attachments, question) : null;
      const out = [];
      m.attachments.forEach((att, idx)=>{
        const plan = fallbackPlans ? fallbackPlans[idx] : null;
        const doc = getDocById(att.id);
        const isLastAttachment = idx === m.attachments.length-1;
        if(!doc || !doc.text){
          out.push({ role:'user', content:`📄 [LAMPIRAN: ${att.name}]\nIsi dokumen tidak tersedia lagi di penyimpanan browser ini. Minta pengguna melampirkan ulang file tersebut bila diperlukan.`, _protected:true });
          return;
        }
        const chunkChars = Number(att.chunkChars) || (plan ? plan.chunkChars : 160000);
        const chunks = packDocChunks(doc.text, chunkChars, DOC_OVERLAP_CHARS);
        const totalParts = Math.max(1, (plan && plan.totalParts) || chunks.length);
        const frozenSent = Number(att.sentParts);
        const sentParts = Math.max(0, Math.min(chunks.length, Number.isFinite(frozenSent) ? frozenSent : (plan ? plan.sentParts : chunks.length)));
        if(sentParts===0){
          out.push({ role:'user', content:`📄 [LAMPIRAN: ${att.name}]\nDokumen terlalu besar untuk context window saat ini sehingga belum dapat dimuat. Perbesar Context Window di Pengaturan lalu kirim ulang lampiran ini.`, _protected:true });
          return;
        }
        for(let i=0;i<sentParts;i++){
          const partNo = i+1;
          let header;
          if(chunks.length===1){
            header = `📄 [LAMPIRAN: ${att.name} — DOKUMEN LENGKAP]\n${Number(doc.chars||0).toLocaleString('id-ID')} karakter • ~${Number(att.tokens||doc.tokens||0).toLocaleString('id-ID')} token`;
          } else {
            header = `📄 [LAMPIRAN: ${att.name} — BAGIAN ${partNo} DARI ${totalParts}]`;
            if(i===0){
              header += `\nDokumen ini dikirim utuh dan berurutan; bagian selanjutnya menyusul pada pesan-pesan setelah ini dalam permintaan yang sama. Baca seluruh bagian sebelum menarik kesimpulan.\n\n${buildDocManifest(doc, totalParts)}`;
            } else {
              header += `\n(Lanjutan berurutan dari bagian sebelumnya. Ada overlap teks di awal bagian ini agar konteks antarbagian tetap nyambung.)`;
            }
            if(i===sentParts-1 && sentParts < chunks.length){
              header += `\n\n⚠️ Catatan: bagian ${sentParts+1}–${chunks.length} TIDAK dikirim karena melebihi budget context window.`;
            }
          }
          let body = `${header}\n--- MULAI BAGIAN ${partNo}/${totalParts} ---\n${chunks[i]}\n--- SELESAI BAGIAN ${partNo}/${totalParts} ---`;
          const isVeryLast = isLastAttachment && i===sentParts-1;
          if(isVeryLast){
            body += `\n\n=== PERTANYAAN / INSTRUKSI PENGGUNA ===\n${question || DEFAULT_DOC_QUESTION}`;
            if(images.length){
              out.push({ role:'user', content:[{ type:'text', text:body }, ...images.map(u=>({ type:'image_url', image_url:{ url:u } }))], _protected:true });
              continue;
            }
          }
          out.push({ role:'user', content:body, _protected:true });
        }
      });
      if(out.length===0) out.push({ role:'user', content: question || DEFAULT_DOC_QUESTION });
      docsExpansionCache.set(m, out);
      return out;
    }
    // ── Dokumen: penampil isi lampiran ──────────
    function openDocViewer(docId, meta){
      const doc = getDocById(docId);
      let overlay = document.getElementById('doc-viewer');
      if(!overlay){
        overlay = document.createElement('div');
        overlay.className='modal-overlay';
        overlay.id='doc-viewer';
        const modal = document.createElement('div');
        modal.className='modal doc-modal';
        const h = document.createElement('h2'); h.id='doc-viewer-title';
        const m = document.createElement('div'); m.className='doc-viewer-meta'; m.id='doc-viewer-meta';
        const body = document.createElement('div'); body.className='doc-viewer-body'; body.id='doc-viewer-body';
        const actions = document.createElement('div'); actions.className='modal-actions';
        const close = document.createElement('button'); close.className='btn btn-primary'; close.type='button'; close.textContent='Tutup';
        close.addEventListener('click', ()=> overlay.classList.remove('active'));
        actions.appendChild(close);
        modal.appendChild(h); modal.appendChild(m); modal.appendChild(body); modal.appendChild(actions);
        overlay.appendChild(modal);
        overlay.addEventListener('click', (e)=>{ if(e.target===overlay) overlay.classList.remove('active'); });
        document.body.appendChild(overlay);
      }
      const name = (meta && meta.name) || (doc && doc.name) || 'dokumen';
      document.getElementById('doc-viewer-title').textContent = `📄 ${name}`;
      const info = doc
        ? `${Number(doc.chars||0).toLocaleString('id-ID')} karakter • ~${Number(doc.tokens||0).toLocaleString('id-ID')} token${doc.headings && doc.headings.length ? ' • '+doc.headings.length+' heading' : ''}`
        : 'Isi dokumen tidak tersedia lagi di penyimpanan browser (metadata tetap ada).';
      const partInfo = (meta && Number(meta.totalParts)>1) ? ` • dikirim ${Number(meta.sentParts)||0}/${meta.totalParts} bagian` : '';
      document.getElementById('doc-viewer-meta').textContent = info + partInfo;
      const bodyEl = document.getElementById('doc-viewer-body');
      if(doc && typeof doc.text==='string'){
        const MAX_VIEW = 300000;
        bodyEl.textContent = doc.text.length > MAX_VIEW
          ? doc.text.slice(0, MAX_VIEW) + `\n\n… [ditampilkan ${MAX_VIEW.toLocaleString('id-ID')} karakter pertama dari ${doc.text.length.toLocaleString('id-ID')}; teks lengkap tetap dikirim ke model]`
          : doc.text;
      } else {
        bodyEl.textContent = 'Teks dokumen tidak tersimpan. Lampirkan ulang file untuk melihat isinya.';
      }
      overlay.classList.add('active');
    }
    // ── Load / Save Config ─────────────────────
    function loadConfig() {
      try {
        const saved = storage.getItem('chatbot_config');
        if (saved) config = { ...DEFAULT_CONFIG, ...JSON.parse(saved) };
        // ── Migrasi legacy: contextWindow angka custom (mis. 48000) → 'custom' + contextWindowCustom
        try {
          const presetVals = ['8192','16384','32768','65536','128000','200000','256000','1000000'];
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
      storage.setItem('chatbot_config', JSON.stringify(config));
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
        // Lampiran dokumen yang belum diekspansi: hitung token teks lengkapnya.
        if(Array.isArray(m.attachments) && m.attachments.length){
          for(const a of m.attachments){
            if(!a) continue;
            const t = Number(a.tokens) > 0 ? Number(a.tokens) : Math.ceil((Number(a.chars)||0)/4);
            total += t + 8;
          }
        }
      }
      return total;
    }
    function estimateBaseTokens(){
      const result = [];
      try{
        if(config.systemPromptEnabled && typeof config.systemPrompt==='string' && config.systemPrompt.trim()){
          result.push({ role:'system', content: config.systemPrompt.trim() });
        }
      }catch(e){}
      if(Array.isArray(messages)) result.push(...messages);
      return estimateTokensForMessages(result);
    }
    function buildRawMessagesSync(){
      const result = [];
      try{
        if(config.systemPromptEnabled && typeof config.systemPrompt==='string' && config.systemPrompt.trim()){
          result.push({ role:'system', content: config.systemPrompt.trim() });
        }
      }catch(e){}
      if(Array.isArray(messages)){
        for(const m of messages){
          try{
            if(m && Array.isArray(m.attachments) && m.attachments.length){
              result.push(...expandAttachmentMessage(m));
            } else {
              result.push(m);
            }
          }catch(e){
            console.warn('[Docs] gagal ekspansi lampiran', e);
            result.push({ role:(m && m.role)||'user', content:getMessageText(m), _protected:true });
          }
        }
      }
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
      // Lampiran dokumen TIDAK boleh diringkas/dipotong — teks file harus tetap utuh
      // agar model tidak kehilangan konteks dokumen di tengah percakapan.
      const protectedMsgs = [];
      const normal = [];
      for(const m of rest){ if(isAttachmentMessage(m)) protectedMsgs.push(m); else normal.push(m); }
      if(normal.length <= k) return { sys, older: [], recent: rest, keep:k };
      const older = normal.slice(0, normal.length - k);
      const recentNormal = normal.slice(-k);
      const recentSet = new Set([...protectedMsgs, ...recentNormal]);
      const recent = rest.filter(m=> recentSet.has(m));
      return { sys, older, recent, keep:k };
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
          headers: getApiHeaders(),
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
    function saveSessionsNow(){
      if(!config.memoryEnabled) return;
      try{
        const toSave = sessions.map(s=>{
          // Kompres gambar untuk storage: simpan versi terkompresi kecil (sudah 1280px) tapi batasi total
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
        storage.setItem(SESSIONS_KEY, JSON.stringify(toSave));
        if(currentSessionId) storage.setItem(ACTIVE_SESSION_KEY, currentSessionId);
      }catch(e){
        // fallback: coba tanpa gambar
        try{
          const fallback = sessions.map(s=> ({ ...s, messages: (s.messages||[]).map(m=> Array.isArray(m.content) ? { role:m.role, content: getMessageText(m)||'[gambar]' } : m) }));
          storage.setItem(SESSIONS_KEY, JSON.stringify(fallback));
        }catch(e2){ console.warn('saveSessions fallback fail', e2); }
      }
    }
    // Debounce: persistCurrentSession dipanggil tiap token/pesan — tunda tulis IDB 400ms,
    // flush paksa saat tab ditutup agar tidak ada data hilang.
    let _saveSessionsTimer = null;
    function saveSessions(){
      try{
        if(_saveSessionsTimer) clearTimeout(_saveSessionsTimer);
        _saveSessionsTimer = setTimeout(() => { _saveSessionsTimer = null; saveSessionsNow(); }, 400);
      }catch(e){ saveSessionsNow(); }
    }
    function flushSessions(){
      try{ if(_saveSessionsTimer){ clearTimeout(_saveSessionsTimer); _saveSessionsTimer = null; } }catch(e){}
      saveSessionsNow();
      try{ flushDocsRegistry(); }catch(e){}
    }
    try{
      document.addEventListener('visibilitychange', () => { if(document.visibilityState === 'hidden') flushSessions(); });
      window.addEventListener('pagehide', flushSessions);
    }catch(e){}
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
          headers: getApiHeaders(),
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
            try{ if(config.memoryEnabled) storage.setItem(SESSIONS_KEY, JSON.stringify(sessions)); }catch(e){}
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
      try{ storage.removeItem(HISTORY_KEY);}catch(e){}
      try{ storage.removeItem(SESSIONS_KEY); storage.removeItem(ACTIVE_SESSION_KEY);}catch(e){}
      try{ docs.clear(); _docsDirty=false; storage.removeItem(DOCS_KEY); }catch(e){}
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
          const attachments = (m && Array.isArray(m.attachments) && m.attachments.length) ? m.attachments : null;
          const opts = (reasoning || attachments)
            ? { ...(reasoning ? { reasoning, reasoningDuration: m.reasoningTime } : {}), ...(attachments ? { attachments } : {}) }
            : null;
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
      try{ storage.setItem(ACTIVE_SESSION_KEY, currentSessionId);}catch(e){}
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
      try{ pruneDocsRegistry(); }catch(e){}
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
        const raw=storage.getItem(SESSIONS_KEY);
        const act=storage.getItem(ACTIVE_SESSION_KEY);
        if(raw){
          const parsed=JSON.parse(raw);
          if(Array.isArray(parsed)) sessions=parsed;
        }
        // migrate legacy single history if no sessions yet
        if(sessions.length===0){
          const legacy=storage.getItem(HISTORY_KEY);
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
                  storage.removeItem(HISTORY_KEY);
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
        if(!storage.getItem('math_copy_hint_shown')){
          storage.setItem('math_copy_hint_shown','1');
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
      if(typeof ms !== 'number' || !isFinite(ms) || ms < 0) ms = 0;
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
        const atts = (opts && Array.isArray(opts.attachments)) ? opts.attachments : [];
        if(atts.length){
          const filesWrap = document.createElement('div');
          filesWrap.className = 'bubble-files';
          atts.forEach(a=>{
            const chip = document.createElement('button');
            chip.type = 'button';
            chip.className = 'file-chip';
            chip.title = `Lihat lampiran: ${a.name || 'dokumen'}`;
            const icon = document.createElement('span');
            icon.className = 'file-chip-icon';
            icon.textContent = (a.ext==='docx') ? '📄' : (a.ext==='md'||a.ext==='markdown') ? '📝' : '📃';
            const nm = document.createElement('span');
            nm.className = 'file-chip-name';
            nm.textContent = a.name || 'dokumen';
            const meta = document.createElement('span');
            meta.className = 'file-chip-meta';
            const partInfo = (Number(a.totalParts)>1) ? ` • ${Number(a.sentParts)||0}/${a.totalParts} bagian` : '';
            meta.textContent = `~${formatTokenCount(a.tokens)} token${partInfo}`;
            chip.appendChild(icon); chip.appendChild(nm); chip.appendChild(meta);
            if(Number(a.totalParts)>1 && Number(a.sentParts)<Number(a.totalParts)){
              const warn = document.createElement('span');
              warn.className = 'file-chip-truncated';
              warn.textContent = '⚠️';
              warn.title = `Hanya ${Number(a.sentParts)||0} dari ${a.totalParts} bagian dikirim (context window)`;
              chip.appendChild(warn);
            }
            chip.addEventListener('click', ()=> openDocViewer(a.id, a));
            filesWrap.appendChild(chip);
          });
          bubble.appendChild(filesWrap);
        }
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
    // Mode proxy: browser memanggil route handler same-origin /api/chat (bebas CORS),
    // server yang meneruskan ke upstream via header x-upstream.
    const PROXY_ENDPOINT = '/api/chat';
    function isProxyMode() { return !!config.useProxy; }
    function getApiUrl() {
      if (isProxyMode()) return PROXY_ENDPOINT;
      let base = config.baseUrl.replace(/\/+$/, '');
      if (base.endsWith('/chat/completions')) {
        return base;
      }
      return base + '/chat/completions';
    }
    // Header standar untuk request chat. Saat proxy, sertakan upstream +
    // gunakan key dari form cfg jika ada (untuk test connection sebelum save).
    function getApiHeaders(cfg) {
      const c = cfg || config;
      const h = { 'Content-Type': 'application/json' };
      const key = String(c.apiKey || '').trim();
      if (key) h['Authorization'] = `Bearer ${key}`;
      if (c.useProxy) h['x-upstream'] = c.baseUrl;
      return h;
    }
    // Deteksi error CORS/jaringan (fetch gagal total) → sarankan proxy.
    function describeFetchError(err) {
      const m = err && err.message ? String(err.message) : '';
      const looksCors = err instanceof TypeError || /failed to fetch|networkerror|network request failed|load failed/i.test(m);
      if (looksCors && !isProxyMode()) {
        return m + '\n\n💡 Ini kemungkinan masalah CORS — provider/model ini tidak mengizinkan akses langsung dari browser. Aktifkan "Server Proxy" di Pengaturan agar request diteruskan lewat server.';
      }
      return m;
    }
    // ── Send Message ───────────────────────────
    async function sendMessage(content) {
      const hasImages = Array.isArray(pendingImages) && pendingImages.length>0;
      const hasDocs = Array.isArray(pendingDocs) && pendingDocs.length>0;
      const textTrim = (typeof content==='string' ? content.trim() : '');
      if (isGenerating || (!textTrim && !hasImages && !hasDocs)) return;
      if (!config.apiKey.trim()) {
        alert('⚠️ Mohon masukkan API key di Pengaturan.');
        openSettings();
        return;
      }
      const _imagesToSend = pendingImages.slice();
      const _docsToSend = pendingDocs.slice();
      const _hasImgs = _imagesToSend.length>0;
      const _hasDocs = _docsToSend.length>0;
      let _userContent;
      let _displayImages = [];
      if(_hasImgs){
        _displayImages = _imagesToSend.map(x=>x.dataUrl);
        const textPart = textTrim || 'Jelaskan gambar ini secara detail.';
        const parts = [{ type:'text', text: textPart }];
        _imagesToSend.forEach(x=> parts.push({ type:'image_url', image_url: { url: x.dataUrl } }));
        _userContent = parts;
      } else if(_hasDocs){
        _userContent = textTrim || `Tolong baca dan analisis dokumen berikut secara menyeluruh: ${_docsToSend.map(d=>d.name).join(', ')}.`;
      } else {
        _userContent = textTrim;
      }
      // Rencana chunk dibekukan di metadata lampiran agar konteks dokumen
      // deterministik — tidak berubah walau context window diubah kemudian.
      let _attMetas = [];
      let _attPlans = [];
      if(_hasDocs){
        try{
          _attPlans = planAttachments(_docsToSend, typeof _userContent==='string' ? _userContent : '');
          _attMetas = _docsToSend.map((d,i)=>{
            const p = _attPlans[i] || {};
            return {
              id:d.id, name:d.name, ext:d.ext, size:d.size, chars:d.chars, tokens:d.tokens,
              totalParts:p.totalParts||1,
              sentParts:(p.sentParts!=null?p.sentParts:1),
              chunkChars:p.chunkChars||160000,
            };
          });
        }catch(e){
          console.warn('[Docs] gagal menyusun rencana lampiran', e);
          _attPlans = [];
          _attMetas = _docsToSend.map(d=>({ id:d.id, name:d.name, ext:d.ext, size:d.size, chars:d.chars, tokens:d.tokens }));
        }
      }
      ensureSession();
      isGenerating = true;
      sendBtn.style.display = 'none';
      stopBtn.style.display = 'flex';
      const _userMsg = { role: 'user', content: _userContent };
      if(_attMetas.length) _userMsg.attachments = _attMetas;
      messages.push(_userMsg);
      persistCurrentSession();
      addMessage('user', _userContent, _attMetas.length ? { attachments: _attMetas } : undefined);
      userInput.value = '';
      clearPendingAttachments();
      // Beri tahu pengguna bila dokumen dipecah / terpotong.
      if(_attPlans.length){
        try{
          const truncated = _attPlans.filter(p=> p && p.truncated);
          const chunked = _attPlans.filter(p=> p && p.totalParts>1 && !p.truncated);
          if(truncated.length){
            addContextNotice(`⚠️ Lampiran melebihi context window — ${truncated.map(p=>`${p.name}: ${p.sentParts}/${p.totalParts} bagian dikirim`).join('; ')}. Perbesar Context Window atau gunakan file lebih kecil.`);
          } else if(chunked.length){
            addContextNotice(`📄 ${chunked.map(p=>`${p.name}: ${p.totalParts} bagian (semua dikirim berurutan, dengan overlap konteks)`).join('; ')}`);
          }
        }catch(e){}
      }
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
          messages: sanitizeApiMessages(apiMessages),
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
        const headers = getApiHeaders();
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
          let thinkingElapsed = null;
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
            if (thinkingDone) return thinkingElapsed;
            thinkingDone = true;
            if (elapsedTimer) { clearInterval(elapsedTimer); elapsedTimer = null; }
            const elapsed = Date.now() - thinkingStart;
            thinkingElapsed = elapsed;
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
              if (typeof elapsed === 'number') tb.timer.textContent = formatElapsed(elapsed);
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
          // Save with reasoning — pakai durasi thinking yang sudah difinalisasi
          // (bukan Date.now()-thinkingStart yang ikut menghitung waktu jawabannya)
          const reasoningTime = thinkingShown ? (thinkingElapsed ?? (Date.now() - thinkingStart)) : undefined;
          messages.push({ role: 'assistant', content: finalContent, ...(finalReasoning ? { reasoning_content: finalReasoning } : {}), ...(typeof reasoningTime === 'number' ? { reasoningTime } : {}) });
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
                messages: sanitizeApiMessages(retryMsgs),
                max_tokens: config.maxTokens,
                stream: useStream2,
                ...(config.temperature!==null&&config.temperature!==undefined ? {temperature: config.temperature}:{}),
                ...(config.topP!==null&&config.topP!==undefined ? {top_p: config.topP}:{}),
                ...(config.reasoningEffort ? {reasoning_effort: config.reasoningEffort}:{})
              };
              const resp2 = await fetch(apiUrl2, { method:'POST', headers: getApiHeaders(), body: JSON.stringify(body2), signal: abortController.signal });
              if(resp2.ok){
                lastCompaction = { ...needRetry, ts: Date.now() };
                updateContextBar();
                const thinkingStartTs2 = Date.now();
                if(useStream2){
                  addTypingIndicator(); const bubble2 = addStreamingMessage(); removeTypingIndicator();
                  const tb2=bubble2._thinking, ans2=bubble2._answerDiv;
                  let full2='', rs2='', rt2=null, rrt2=null, et2=null, shown2=false, done2=false, hasR2=false, elapsed2=null;
                  let tStart2=Date.now();
                  const show2=()=>{ if(shown2) return; shown2=true; tb2.block.style.display='block'; tb2.content.innerHTML='<div class="thinking-placeholder">Menganalisis…</div>'; tb2.title.textContent='Sedang berpikir…'; tb2.spinner.style.display='block'; tb2.timer.textContent='0.0s'; if(et2) clearInterval(et2); et2=setInterval(()=>{ if(done2) return; tb2.timer.textContent=formatElapsed(Date.now()-tStart2); },100); };
                  const fin2=()=>{ if(done2) return elapsed2; done2=true; if(et2){clearInterval(et2); et2=null;} const el=Date.now()-tStart2; elapsed2=el; if(shown2){tb2.block.classList.add('done'); tb2.spinner.style.display='none'; tb2.title.textContent='Selesai berpikir'; tb2.timer.textContent=formatElapsed(el);} return el; };
                  const thrAns2=()=>{ if(rt2) return; rt2=setTimeout(()=>{ renderContent(full2, ans2); scrollToBottom(); rt2=null; },60); };
                  const thrRs2=()=>{ if(rrt2) return; rrt2=setTimeout(()=>{ renderThinkingMarkdown(rs2, tb2.content); tb2.content.scrollTop=tb2.content.scrollHeight; scrollToBottom(); rrt2=null; },60); };
                  if(config.reasoningEffort) show2();
                  const rdr2=resp2.body.getReader(); const dec2=new TextDecoder(); let buf2='';
                  while(true){ const {done,value}=await rdr2.read(); if(done) break; buf2+=dec2.decode(value,{stream:true}); const lines=buf2.split('\n'); buf2=lines.pop(); for(const line of lines){ const tr=line.trim(); if(!tr||!tr.startsWith('data:')) continue; const d=tr.slice(5).trim(); if(d==='[DONE]') continue; try{ const p=JSON.parse(d); const ch=p.choices?.[0]||{}; const dl=ch.delta||{}; let rd=getDeltaReasoning(dl,p)||getDeltaReasoning(ch,p)||null; if(!rd){ if(typeof dl.reasoning_content==='string') rd=dl.reasoning_content; else if(typeof dl.reasoning==='string') rd=dl.reasoning; else if(typeof p.reasoning_content==='string') rd=p.reasoning_content; } if(rd){ hasR2=true; show2(); rs2+=rd; thrRs2(); } const c2=dl.content??dl.text??ch.text??''; if(c2){ if(shown2&&!done2) fin2(); full2+=c2; thrAns2(); } }catch(e){} } }
                  if(rt2) clearTimeout(rt2); if(rrt2) clearTimeout(rrt2);
                  let fr2=rs2.trim(), fc2=full2;
                  if(!fr2 && fc2){ const ex=extractThinkTag(fc2); if(ex){ fr2=ex.reasoning; fc2=ex.content; hasR2=!!fr2; if(fr2&&!shown2) show2(); if(fr2) renderThinkingMarkdown(fr2, tb2.content); } }
                  if(shown2){ const el=fin2(); if(fr2){ renderThinkingMarkdown(fr2, tb2.content); if(typeof el === 'number') tb2.timer.textContent=formatElapsed(el); } else { if(!hasR2&&!config.reasoningEffort) tb2.block.style.display='none'; else tb2.content.innerHTML='<div class="thinking-placeholder">Penalaran selesai</div>'; } }
                  renderContent(fc2, ans2); scrollToBottom();
                  const rt2t = shown2 ? (elapsed2 ?? (Date.now()-tStart2)) : undefined;
                  messages.push({ role:'assistant', content: fc2, ...(fr2?{reasoning_content:fr2}:{}), ...(typeof rt2t === 'number' ? {reasoningTime:rt2t}:{}) });
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
          addMessage('assistant', `**Error:**\n\n${describeFetchError(err)}`);
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
        if (content || hasPendingAttachments()) sendMessage(content);
      }
    });

    sendBtn.addEventListener('click', () => {
      const content = userInput.value.trim();
      if (content || hasPendingAttachments()) sendMessage(content);
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
      const docBtn=document.getElementById('doc-btn');
      const docInput=document.getElementById('doc-input');
      if(docBtn && docInput){
        docBtn.addEventListener('click', ()=> docInput.click());
        docInput.addEventListener('change', ()=>{
          if(docInput.files && docInput.files.length) addPendingDocs(docInput.files);
          docInput.value='';
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
        const all = dt.files ? Array.from(dt.files) : [];
        if(!all.length) return;
        const imgs = all.filter(f=> f && f.type && f.type.startsWith('image/'));
        const docFiles = all.filter(f=> classifyDocFile(f)==='doc');
        if(imgs.length) addPendingImages(imgs);
        if(docFiles.length) addPendingDocs(docFiles);
        if(!imgs.length && !docFiles.length) showMathToast('❌ Format tidak didukung — hanya gambar, .docx, .txt, .md');
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
      storage.removeItem(SESSIONS_KEY);
      storage.removeItem(ACTIVE_SESSION_KEY);
      storage.removeItem(HISTORY_KEY);
      try{ docs.clear(); _docsDirty=false; storage.removeItem(DOCS_KEY); }catch(e){}
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
      const proxyToggle = document.getElementById('cfg-proxy-toggle');
      if (proxyToggle) proxyToggle.checked = !!config.useProxy;

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
        useProxy: document.getElementById('cfg-proxy-toggle') ? document.getElementById('cfg-proxy-toggle').checked : true,
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
        let base;
        if (testCfg.useProxy) {
          // lewat server proxy — header x-upstream diisi dari form (belum tentu tersimpan)
          base = PROXY_ENDPOINT;
        } else {
          base = testCfg.baseUrl.replace(/\/+$/, '');
          if (base.endsWith('/chat/completions')) {
            // already full URL
          } else {
            base += '/chat/completions';
          }
        }

        const response = await fetch(base, {
          method: 'POST',
          headers: getApiHeaders(testCfg),
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
        testResult.textContent = `❌ Koneksi gagal: ${describeFetchError(err)}`;
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
      storage.setItem(THEME_KEY, theme);
      updateThemeBtn(theme);
      try{ rerenderAllMermaidsForTheme(); }catch(e){ console.warn('mermaid theme rerender',e); }
    }
    document.getElementById('theme-btn')?.addEventListener('click', ()=>{
      const cur = document.documentElement.getAttribute('data-theme') || 'dark';
      applyTheme(cur === 'dark' ? 'light' : 'dark');
    });

    // ── Init ───────────────────────────────────
    // Jalankan setelah data IndexedDB selesai dimuat ke cache storage
    storage.ready.then(() => {
      (function initTheme(){
        const saved = storage.getItem(THEME_KEY);
        if(saved === 'light' || saved === 'dark'){
          applyTheme(saved);
        } else if(window.matchMedia && window.matchMedia('(prefers-color-scheme: light)').matches){
          applyTheme('light');
        } else {
          applyTheme('dark');
        }
      })();

      loadConfig();
      loadDocsRegistry();
      loadSessions();
      pruneDocsRegistry();
      renderSidebar();
      renderChat();
      updateStatusFromConfig();
      try{ updateContextBar(); updateContextEstimateBox(); }catch(e){}

      // Show settings on first visit if no API key
      if (!config.apiKey) {
        setTimeout(openSettings, 600);
      }
    });
