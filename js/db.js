const DB = {
  data: { items: [], workLogs: [] },

  async init() {
    await Storage.init();
    const loaded = await Storage.read();
    if (loaded) this.data = loaded;
  },

  async _persist() {
    await Storage.write(this.data);
    document.dispatchEvent(new CustomEvent('db-sync', { detail: { store: 'items' } }));
  },

  async getAll(store) {
    return [...(this.data[store] || [])];
  },

  get(store, id) {
    const item = (this.data[store] || []).find(i => i.id === id);
    return item || null;
  },

  async put(store, item) {
    const arr = this.data[store] || [];
    const idx = arr.findIndex(i => i.id === item.id);
    if (idx >= 0) arr[idx] = item;
    else arr.push(item);
    this.data[store] = arr;
    await this._persist();
  },

  async del(store, id) {
    this.data[store] = (this.data[store] || []).filter(i => i.id !== id);
    await this._persist();
  },

  async clearStore(store) {
    this.data[store] = [];
    await this._persist();
  },

  async importAll(data) {
    this.data = {
      items: data.items || [],
      workLogs: data.workLogs || []
    };
    await this._persist();
  },

  async exportAll() {
    return {
      items: [...(this.data.items || [])],
      workLogs: [...(this.data.workLogs || [])],
      exportedAt: new Date().toISOString()
    };
  },

  // Convenience helpers for items
  getCalendarItems() {
    return (this.data.items || []).filter(i => i.start);
  },
  getTodoItems() {
    return (this.data.items || []).filter(i => i.quadrant != null);
  },
  getItemsForDate(dateStr) {
    return (this.data.items || []).filter(i => {
      if (i.start && i.start.slice(0, 10) === dateStr) return true;
      if (i.dueDate === dateStr) return true;
      if (i.created === dateStr) return true;
      return false;
    });
  },

  async getSetting(key, def = null) {
    try {
      const val = localStorage.getItem('sched_' + key);
      return val !== null ? JSON.parse(val) : def;
    } catch { return def; }
  },
  async setSetting(key, value) {
    localStorage.setItem('sched_' + key, JSON.stringify(value));
  }
};
