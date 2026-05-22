const Storage = {
  mode: 'memory',
  handle: null,
  statusEl: null,

  async init() {
    // Try server API mode first
    if (location.protocol !== 'file:') {
      try {
        const ctrl = new AbortController();
        const tid = setTimeout(() => ctrl.abort(), 800);
        const res = await fetch('/api/data', { signal: ctrl.signal });
        clearTimeout(tid);
        if (res.ok) {
          this.mode = 'server';
          this._updateStatus();
          document.getElementById('syncSection')?.classList.remove('hidden');
          document.getElementById('syncPushBtn')?.addEventListener('click', () => this.syncPush());
          document.getElementById('syncPullBtn')?.addEventListener('click', () => this.syncPull());
          // Auto-migrate existing IndexedDB data to server on first connect
          try { const d = await this._readIDB();
            if (d && (d.items?.length || d.workLogs?.length || d.events?.length || d.todos?.length)) {
              const migrated = this._migrateItems(d);
              const sd = await this._readServer();
              if (!sd || (!sd.items.length && !sd.workLogs.length)) {
                await this._writeServer(migrated);
              }
            }
          } catch (e) { /* migration best-effort */ }
          return;
        }
      } catch (e) { /* not in server mode */ }
    }
    if (location.protocol === 'file:') {
      this.mode = 'indexeddb'; this._updateStatus(); return;
    }
    if (!('showSaveFilePicker' in window)) {
      this.mode = 'indexeddb'; this._updateStatus(); return;
    }
    try {
      const db = await this._openHandleDB();
      const tx = db.transaction('handles', 'readonly');
      const req = tx.objectStore('handles').get('dataHandle');
      const result = await new Promise((res, rej) => {
        req.onsuccess = () => res(req.result || null);
        req.onerror = () => rej(req.error);
      });
      if (result && result.handle) {
        this.handle = result.handle;
        const opts = { mode: 'readwrite' };
        let perm = await this.handle.queryPermission(opts);
        if (perm !== 'granted') perm = await this.handle.requestPermission(opts);
        if (perm === 'granted') {
          const data = await this._readFile();
          if (data) { this.mode = 'file'; this._updateStatus(result.name); return; }
        }
      }
    } catch (e) { console.log('Handle restore:', e.message); }
    this.mode = 'needFile'; this._updateStatus();
  },

  async setupFilePicker() {
    try {
      this.handle = await window.showSaveFilePicker({
        suggestedName: 'scheduler-data.json',
        types: [{ description: 'JSON 数据文件', accept: { 'application/json': ['.json'] } }]
      });
      this.mode = 'file';
      await this._saveHandle(this.handle, this.handle.name);
      await this._writeFile(DB.data || { items: [], workLogs: [] });
      this._updateStatus(this.handle.name);
      return true;
    } catch (e) {
      if (e.name !== 'AbortError') console.error(e);
      this.mode = 'indexeddb'; this._updateStatus(); return false;
    }
  },

  _updateStatus(name) {
    if (!this.statusEl) {
      this.statusEl = document.getElementById('storageStatus');
      if (!this.statusEl) return;
    }
    const icon = this.statusEl.querySelector('.s-icon');
    const text = this.statusEl.querySelector('.s-text');
    const btn = this.statusEl.querySelector('.s-btn');
    if (this.mode === 'server') {
      icon.textContent = '🔄'; text.textContent = '服务端 (Git 同步)';
      if (btn) btn.classList.add('hidden'); return;
    }
    if (this.mode === 'file') {
      icon.textContent = '💾'; text.textContent = '文件: ' + (name || 'data.json');
      if (btn) btn.classList.add('hidden');
    } else if (this.mode === 'indexeddb') {
      icon.textContent = '🗄️'; text.textContent = 'IndexedDB (本地缓存)';
      if (btn) btn.classList.add('hidden');
    } else {
      icon.textContent = '⚠️'; text.textContent = '点击选择数据文件';
      if (btn) btn.classList.remove('hidden');
    }
  },

  async _openHandleDB() {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open('SchedulerHandles', 1);
      req.onupgradeneeded = (e) => {
        const db = e.target.result;
        if (!db.objectStoreNames.contains('handles')) db.createObjectStore('handles');
      };
      req.onsuccess = (e) => resolve(e.target.result);
      req.onerror = (e) => reject(e.target.error);
    });
  },

  async _saveHandle(handle, name) {
    const db = await this._openHandleDB();
    const tx = db.transaction('handles', 'readwrite');
    tx.objectStore('handles').put({ handle, name }, 'dataHandle');
    await new Promise((resolve, reject) => { tx.oncomplete = resolve; tx.onerror = () => reject(tx.error); });
  },

  // ──────── Migrate old {events,todos} → new {items} ────────
  _migrateItems(data) {
    if (!data || data.items) return data; // already new format
    const items = [];
    for (const e of (data.events || [])) {
      items.push({
        id: e.id, title: e.title, start: e.start || '', end: e.end || '',
        quadrant: null, dueDate: '', tags: [], subtasks: [], notes: '', completed: false,
        created: (e.start || '').slice(0, 10)
      });
    }
    for (const t of (data.todos || [])) {
      if (!items.find(i => i.id === t.id)) {
        items.push({
          id: t.id, title: t.title, start: '', end: '',
          quadrant: t.quadrant || null, dueDate: t.dueDate || '', tags: t.tags || [],
          subtasks: t.subtasks || [], notes: t.notes || '', completed: t.completed || false,
          created: t.created || ''
        });
      }
    }
    return { items, workLogs: data.workLogs || [] };
  },

  async read() {
    if (this.mode === 'server') return this._readServer();
    let data = null;
    if (this.mode === 'file') data = await this._readFile();
    else if (this.mode === 'indexeddb') data = await this._readIDB();
    if (!data) return null;
    const migrated = this._migrateItems(data);
    if (migrated !== data) await this.write(migrated); // persist migration
    return migrated;
  },

  async write(data) {
    if (this.mode === 'server') return this._writeServer(data);
    if (this.mode === 'file') return this._writeFile(data);
    if (this.mode === 'indexeddb') return this._writeIDB(data);
  },

  async _readFile() {
    try {
      const file = await this.handle.getFile();
      const text = await file.text();
      return text ? JSON.parse(text) : null;
    } catch (e) { return null; }
  },

  async _writeFile(data) {
    try {
      const writable = await this.handle.createWritable();
      await writable.write(JSON.stringify(data, null, 2));
      await writable.close(); return true;
    } catch (e) {
      if (e.name === 'NotAllowedError') {
        const perm = await this.handle.requestPermission({ mode: 'readwrite' });
        if (perm === 'granted') return this._writeFile(data);
        this.mode = 'indexeddb'; this._updateStatus(); return this._writeIDB(data);
      }
      return false;
    }
  },

  async _openDataDB() {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open('WorkScheduler', 2);
      req.onupgradeneeded = (e) => {
        const db = e.target.result;
        if (!db.objectStoreNames.contains('items')) db.createObjectStore('items', { keyPath: 'id' });
        if (!db.objectStoreNames.contains('workLogs')) db.createObjectStore('workLogs', { keyPath: 'id' });
        // Keep old stores for backward compat — they'll be read+migrated in _readIDB
      };
      req.onsuccess = (e) => resolve(e.target.result);
      req.onerror = (e) => reject(e.target.error);
    });
  },

  async _readIDB() {
    const db = await this._openDataDB();
    // Read from both new and old stores
    const stores = db.objectStoreNames;
    const result = { items: null, workLogs: [], events: [], todos: [] };

    if (stores.contains('items')) {
      result.items = await new Promise((res, rej) => { const r = db.transaction('items', 'readonly').objectStore('items').getAll(); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
    }
    if (stores.contains('workLogs')) {
      result.workLogs = await new Promise((res, rej) => { const r = db.transaction('workLogs', 'readonly').objectStore('workLogs').getAll(); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
    }
    if (stores.contains('events')) {
      result.events = await new Promise((res, rej) => { const r = db.transaction('events', 'readonly').objectStore('events').getAll(); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
    }
    if (stores.contains('todos')) {
      result.todos = await new Promise((res, rej) => { const r = db.transaction('todos', 'readonly').objectStore('todos').getAll(); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
    }

    // If we have items already, return as-is. Otherwise migrate old data.
    if (result.items && result.items.length > 0) {
      return { items: result.items, workLogs: result.workLogs };
    }
    if (result.events.length > 0 || result.todos.length > 0) {
      return { events: result.events, todos: result.todos, workLogs: result.workLogs };
    }
    return { items: result.items || [], workLogs: result.workLogs };
  },

  async _writeIDB(data) {
    const db = await this._openDataDB();
    const tx = db.transaction(['items', 'workLogs'], 'readwrite');
    tx.objectStore('items').clear();
    tx.objectStore('workLogs').clear();
    for (const i of (data.items || [])) tx.objectStore('items').put(i);
    for (const w of (data.workLogs || [])) tx.objectStore('workLogs').put(w);
    return new Promise((resolve, reject) => { tx.oncomplete = () => resolve(true); tx.onerror = () => reject(tx.error); });
  },

  async _readServer() {
    try {
      const res = await fetch('/api/data');
      if (!res.ok) return null;
      const data = await res.json();
      return this._migrateItems(data);
    } catch (e) { return null; }
  },

  async _writeServer(data) {
    try {
      const res = await fetch('/api/data', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
      });
      return res.ok;
    } catch (e) { return false; }
  },

  async syncPush() {
    const el = document.getElementById('syncStatus');
    if (el) el.textContent = '同步中...';
    try {
      const res = await fetch('/api/sync-push', { method: 'POST' });
      const data = await res.json();
      if (el) el.textContent = data.message || (data.ok ? '✓ 推送成功' : '✗ 失败');
      if (!data.ok && el) el.textContent = '✗ ' + (data.error || '推送失败');
    } catch (e) {
      if (el) el.textContent = '✗ 连接服务器失败';
    }
  },

  async syncPull() {
    const el = document.getElementById('syncStatus');
    if (el) el.textContent = '同步中...';
    try {
      const res = await fetch('/api/sync-pull', { method: 'POST' });
      const data = await res.json();
      if (data.ok && data.data) {
        DB.data = data.data;
        document.dispatchEvent(new CustomEvent('db-sync', { detail: { store: 'items' } }));
        if (el) el.textContent = data.message;
      } else if (data.ok && !data.data) {
        // pull succeeded but no data change, re-read anyway
        const reread = await this._readServer();
        if (reread) { DB.data = reread; document.dispatchEvent(new CustomEvent('db-sync', { detail: { store: 'items' } })); }
        if (el) el.textContent = data.message;
      } else {
        if (el) el.textContent = '✗ ' + (data.error || '拉取失败');
      }
    } catch (e) {
      if (el) el.textContent = '✗ 连接服务器失败';
    }
  }
};
