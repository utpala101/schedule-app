const WorkLog = {
  logs: [],
  _projects: [],
  _tags: [],

  async init() {
    this.logs = await DB.getAll('workLogs');
    this._extractHistory();
    this.render();
    document.getElementById('addWorklogBtn').addEventListener('click', () => this.create());
    document.getElementById('worklogSearch').addEventListener('input', () => this.render());
  },

  _extractHistory() {
    const ps = new Set(), ts = new Set();
    for (const w of this.logs) {
      if (w.project) ps.add(w.project);
      (w.tags || []).forEach(t => ts.add(t));
    }
    this._projects = [...ps].sort();
    this._tags = [...ts].sort();
  },

  _formHTML(w, title) {
    const date = w ? w.date : new Date().toISOString().slice(0,10);
    const project = w ? (w.project||'') : '';
    const tags = w ? (w.tags||[]).join(', ') : '';
    const desc = w ? (w.description||'') : '';
    const notes = w ? (w.notes||'') : '';
    const dur = w ? (w.duration||'') : '';
    return `<div style="max-width:640px">
      <h3 class="text-lg font-bold mb-4">${title}</h3>
      <div class="grid grid-cols-2 gap-3 mb-3">
        <div><label class="block text-sm font-medium mb-1">日期</label><input type="date" id="wlDate" value="${date}"></div>
        <div><label class="block text-sm font-medium mb-1">耗时</label><input id="wlDuration" value="${dur}" placeholder="2小时30分"></div>
      </div>
      <div class="mb-3">
        <label class="block text-sm font-medium mb-1">项目</label>
        <input id="wlProject" value="${project}" placeholder="项目名称" list="wlProjList">
        <datalist id="wlProjList">${this._projects.map(p => `<option value="${Calendar._e(p)}">`).join('')}</datalist>
      </div>
      <div class="mb-3">
        <label class="block text-sm font-medium mb-1">标签</label>
        <input id="wlTags" value="${tags}" placeholder="逗号分隔" list="wlTagList">
        <datalist id="wlTagList">${this._tags.map(t => `<option value="${Calendar._e(t)}">`).join('')}</datalist>
        <div id="wlTagChips" class="flex flex-wrap gap-1 mt-1.5">${this._tags.map(t =>
          `<span class="wl-tag-chip" data-tag="${Calendar._e(t)}">${Calendar._e(t)}</span>`
        ).join('')}</div>
      </div>
      <div class="mb-3">
        <label class="block text-sm font-medium mb-1">内容描述</label>
        <textarea id="wlDesc" class="wl-grow" placeholder="做了什么" style="min-height:110px">${desc}</textarea>
        <span id="wlDescErr" class="hidden text-xs text-red-500 mt-1">请输入内容描述</span>
      </div>
      <div class="mb-3">
        <label class="block text-sm font-medium mb-1">备注</label>
        <textarea id="wlNotes" class="wl-grow" placeholder="详细备注..." style="min-height:80px">${notes}</textarea>
      </div>
    </div>`;
  },

  _initAutoGrow() {
    document.querySelectorAll('.wl-grow').forEach(el => {
      const grow = () => { el.style.height = 'auto'; el.style.height = el.scrollHeight + 'px'; };
      el.addEventListener('input', grow);
      grow();
    });
  },

  _initTagChips() {
    const chips = document.getElementById('wlTagChips');
    if (!chips) return;
    chips.onclick = (e) => {
      const chip = e.target.closest('.wl-tag-chip');
      if (!chip) return;
      const inp = document.getElementById('wlTags');
      const tag = chip.dataset.tag;
      const existing = inp.value.split(/[,，]/).map(s => s.trim()).filter(Boolean);
      if (!existing.includes(tag)) {
        inp.value = (existing.length ? existing.join(', ') + ', ' : '') + tag;
      }
    };
  },

  _readForm() {
    const desc = document.getElementById('wlDesc').value.trim();
    if (!desc) {
      const err = document.getElementById('wlDescErr');
      if (err) err.classList.remove('hidden');
      document.getElementById('wlDesc')?.focus();
      return;
    }
    const err = document.getElementById('wlDescErr');
    if (err) err.classList.add('hidden');
    const project = document.getElementById('wlProject').value.trim();
    const tags = document.getElementById('wlTags').value.trim().split(/[,，]/).map(s=>s.trim()).filter(Boolean);
    // Update history
    if (project && !this._projects.includes(project)) { this._projects.push(project); this._projects.sort(); }
    tags.forEach(t => { if (!this._tags.includes(t)) { this._tags.push(t); this._tags.sort(); } });
    return {
      date: document.getElementById('wlDate').value,
      project,
      tags,
      description: desc,
      notes: document.getElementById('wlNotes').value.trim(),
      duration: document.getElementById('wlDuration').value.trim()
    };
  },

  create() {
    Calendar.showModal(this._formHTML(null, '写工作记录') + `
      <div class="flex gap-2 mt-4" style="max-width:640px">
        <button id="wlSave" class="flex-1 px-4 py-2 bg-indigo-500 text-white rounded-lg text-sm font-medium hover:bg-indigo-600">保存</button>
        <button id="wlCancel" class="px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm hover:bg-gray-50 dark:hover:bg-gray-700">取消</button>
      </div>`);
    this._initAutoGrow();
    this._initTagChips();
    document.getElementById('wlSave').onclick = async () => {
      const data = this._readForm();
      if (!data) return;
      const log = { id: 'wl_'+Date.now(), ...data };
      await DB.put('workLogs', log);
      this.logs.push(log);
      document.getElementById('modalOverlay').classList.add('hidden');
      this.render();
    };
    document.getElementById('wlCancel').onclick = () => document.getElementById('modalOverlay').classList.add('hidden');
  },

  edit(id) {
    const w = this.logs.find(l => l.id === id);
    if (!w) return;
    Calendar.showModal(this._formHTML(w, '编辑工作记录') + `
      <div class="flex gap-2 mt-4" style="max-width:640px">
        <button id="wlSave" class="flex-1 px-4 py-2 bg-indigo-500 text-white rounded-lg text-sm font-medium hover:bg-indigo-600">保存</button>
        <button id="wlDelete" class="px-4 py-2 bg-red-500 text-white rounded-lg text-sm font-medium hover:bg-red-600">删除</button>
        <button id="wlCancel" class="px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm hover:bg-gray-50 dark:hover:bg-gray-700">取消</button>
      </div>`);
    this._initAutoGrow();
    this._initTagChips();
    document.getElementById('wlSave').onclick = async () => {
      const data = this._readForm();
      if (!data) return;
      Object.assign(w, data);
      await DB.put('workLogs', w);
      document.getElementById('modalOverlay').classList.add('hidden');
      this.render();
    };
    document.getElementById('wlDelete').onclick = async () => {
      if (!(await Calendar.showConfirm('确定要删除此记录？'))) return;
      await DB.del('workLogs', id);
      this.logs = this.logs.filter(l => l.id !== id);
      document.getElementById('modalOverlay').classList.add('hidden');
      this.render();
    };
    document.getElementById('wlCancel').onclick = () => document.getElementById('modalOverlay').classList.add('hidden');
  },

  render() {
    const query = document.getElementById('worklogSearch').value.trim().toLowerCase();
    const filtered = query ? this.logs.filter(l =>
      (l.description||'').toLowerCase().includes(query) ||
      (l.project||'').toLowerCase().includes(query) ||
      (l.tags||[]).some(t => t.toLowerCase().includes(query)) ||
      (l.notes||'').toLowerCase().includes(query)
    ) : this.logs;
    filtered.sort((a, b) => b.date.localeCompare(a.date));
    const list = document.getElementById('worklogList');
    if (filtered.length === 0) {
      list.innerHTML = '<div class="text-center py-12 text-gray-400">暂无记录</div>';
      return;
    }
    let html = '', curDate = '';
    for (const w of filtered) {
      if (w.date !== curDate) { curDate = w.date; html += `<div class="text-sm font-semibold text-gray-500 mt-4 mb-2">${curDate}</div>`; }
      html += `<div class="worklog-item bg-white dark:bg-gray-800 rounded-lg p-4 border border-gray-200 dark:border-gray-700 cursor-pointer hover:shadow-sm transition" data-id="${w.id}">
        <div class="flex items-start justify-between gap-2">
          <div class="flex-1">
            <div class="flex items-center gap-2 mb-1 flex-wrap">
              ${w.project ? `<span class="text-xs font-medium px-2 py-0.5 bg-indigo-100 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400 rounded">${Calendar._e(w.project)}</span>` : ''}
              ${(w.tags||[]).map(t => `<span class="text-xs px-2 py-0.5 bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400 rounded">${Calendar._e(t)}</span>`).join('')}
            </div>
            <div class="text-sm">${Calendar._e(w.description||'无描述')}</div>
            ${w.notes ? `<div class="text-xs text-gray-400 mt-1 line-clamp-2">${Calendar._e(w.notes)}</div>` : ''}
          </div>
          <div class="text-xs text-gray-400 whitespace-nowrap">${Calendar._e(w.duration||'')}</div>
        </div>
      </div>`;
    }
    list.innerHTML = html;
    list.querySelectorAll('.worklog-item').forEach(el => {
      el.addEventListener('click', () => this.edit(el.dataset.id));
    });
  }
};
