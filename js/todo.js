const Todo = {
  items: [],
  currentDate: new Date(),
  _dragId: null,

  async init() {
    await this.loadItems();
    this.render();
    document.getElementById('addTodoBtn').addEventListener('click', () => this.create());
  },

  async loadItems() {
    this.items = await DB.getAll('items');
  },

  _itemsForDate(date) {
    const ds = Calendar._locDate(date);
    return this.items.filter(i => {
      if (i.quadrant == null) return false;
      if (i.start && i.start.slice(0,10) === ds) return true;
      if (i.dueDate === ds) return true;
      if (i.created === ds && !i.start && !i.dueDate) return true;
      return false;
    });
  },

  _uncategorizedForDate(date) {
    const ds = Calendar._locDate(date);
    return this.items.filter(i => {
      if (i.quadrant != null) return false;
      if (!i.start) return false;
      return i.start.slice(0,10) === ds;
    });
  },

  render() {
    const container = document.getElementById('todoContainer');
    const ds = Calendar._locDate(this.currentDate);
    const today = Calendar._locDate(new Date());
    const days = ['日','一','二','三','四','五','六'];
    const dayItems = this._itemsForDate(this.currentDate);
    const uncatItems = this._uncategorizedForDate(this.currentDate);

    // Date nav
    let html = `<div class="flex items-center justify-between mb-3 flex-wrap gap-2">
      <div class="flex items-center gap-2">
        <button onclick="Todo._nav(-1)" class="p-1.5 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-700">&larr;</button>
        <button onclick="Todo._showDatePicker()" class="text-base font-semibold cursor-pointer hover:opacity-70">${this.currentDate.getFullYear()}年${this.currentDate.getMonth()+1}月${this.currentDate.getDate()}日 周${days[this.currentDate.getDay()]}</button>
        <button onclick="Todo._nav(1)" class="p-1.5 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-700">&rarr;</button>
        ${ds !== today ? `<button onclick="Todo._gotoToday()" class="px-2 py-1 text-xs rounded border border-gray-300 dark:border-gray-600 hover:bg-gray-100 dark:hover:bg-gray-700">今天</button>` : ''}
      </div>
      <div class="text-xs text-gray-400">${dayItems.length + uncatItems.length} 项</div>
    </div>`;

    // Quadrant grid
    const quads = [
      { id: 1, label: '重要且紧急', cls: 'quadrant-q1' },
      { id: 2, label: '重要不紧急', cls: 'quadrant-q2' },
      { id: 3, label: '紧急不重要', cls: 'quadrant-q3' },
      { id: 4, label: '不紧急不重要', cls: 'quadrant-q4' },
    ];
    const sortByTime = (a, b) => {
      if (a.start && b.start) return a.start.localeCompare(b.start);
      if (a.start) return -1; if (b.start) return 1;
      if (a.dueDate && b.dueDate) return a.dueDate.localeCompare(b.dueDate);
      return (a.created||'').localeCompare(b.created||'');
    };
    html += '<div class="quadrant-grid">';
    for (const q of quads) {
      const items = dayItems.filter(i => (i.quadrant) === q.id).sort(sortByTime);
      html += `<div class="quadrant ${q.cls}" data-quadrant="${q.id}">
        <div class="text-sm font-semibold mb-2 flex items-center justify-between"><span>${q.label}</span><span class="text-xs text-gray-400">${items.length}</span></div>
        <div class="space-y-1">`;
      for (const item of items) html += this._renderItem(item);
      html += `</div></div>`;
    }
    html += '</div>';

    // Uncategorized items (has time but no quadrant)
    if (uncatItems.length > 0) {
      html += `<div class="mt-4"><div class="text-xs font-medium text-gray-400 mb-2 flex items-center gap-2"><span class="w-8 h-px bg-gray-200 dark:bg-gray-700"></span>未分类日程<span class="flex-1 h-px bg-gray-200 dark:bg-gray-700"></span></div>`;
      html += '<div class="uncat-drop-zone space-y-1">';
      for (const item of uncatItems.sort((a,b)=>a.start.localeCompare(b.start))) html += this._renderItem(item, true);
      html += '</div></div>';
    }

    container.innerHTML = html;
    this._bindEvents(container);
    this._initDragDrop(container);
  },

  _renderItem(item, noQuadrant) {
    const subHtml = (item.subtasks||[]).map((s,i) => `
      <div class="subtask-item">
        <input type="checkbox" class="subtask-checkbox" data-id="${item.id}" data-idx="${i}" ${s.completed?'checked':''}>
        <span class="${s.completed?'line-through opacity-50':''}">${s.title}</span>
      </div>`).join('');
    const tagHtml = (item.tags||[]).map(t => `<span class="tag-badge">${t}</span>`).join(' ');
    const overdue = item.dueDate && !item.completed && item.dueDate < Calendar._locDate(new Date());
    const qColor = QUAD_COLORS[item.quadrant||0];
    const borderStyle = noQuadrant ? 'border-left-color:#8c7e6e;border-left-width:2px' : `border-left-color:${qColor};border-left-width:3px`;
    return `
      <div class="todo-item ${item.completed?'completed':''}" data-id="${item.id}" style="${borderStyle}">
        <div class="flex items-start gap-1">
          <span class="todo-drag cursor-grab active:cursor-grabbing text-gray-300 hover:text-gray-500 dark:text-gray-600 dark:hover:text-gray-400 select-none mt-0.5" draggable="true" data-id="${item.id}">⠿</span>
          <input type="checkbox" class="todo-toggle mt-0.5 flex-shrink-0" data-id="${item.id}" ${item.completed?'checked':''}>
          <div class="flex-1 min-w-0">
            <div class="todo-title font-medium text-sm ${item.completed?'line-through':''}">${item.title}</div>
            <div class="flex flex-wrap items-center gap-1 mt-1">
              ${tagHtml}
              ${item.dueDate ? `<span class="text-xs ${overdue?'text-red-500 font-semibold':'text-gray-400'}">截止 ${item.dueDate}</span>` : ''}
              ${item.start ? `<span class="text-xs text-indigo-400">${item.start.slice(11,16)}</span>` : ''}
              ${item.completed ? '<span class="text-xs text-green-500">✓ 完成</span>' : ''}
            </div>
            ${item.notes ? `<div class="text-xs text-gray-400 mt-0.5 line-clamp-1">${item.notes}</div>` : ''}
            ${subHtml ? `<div class="mt-1 pl-1">${subHtml}</div>` : ''}
          </div>
        </div>
      </div>`;
  },

  _bindEvents(container) {
    container.querySelectorAll('.todo-toggle').forEach(el => {
      el.addEventListener('change', async (e) => {
        const id = e.target.dataset.id;
        const item = this.items.find(i => i.id === id);
        if (!item) return;
        item.completed = e.target.checked;
        if (item.subtasks) item.subtasks.forEach(s => s.completed = e.target.checked);
        await DB.put('items', item);
        await this.loadItems();
        this.render();
      });
    });
    container.querySelectorAll('.todo-item').forEach(el => {
      el.addEventListener('click', (e) => {
        if (e.target.closest('.todo-toggle') || e.target.closest('.subtask-checkbox') || e.target.closest('.todo-drag') || e.target.tagName === 'INPUT') return;
        this.edit(el.dataset.id);
      });
    });
    container.querySelectorAll('.subtask-checkbox').forEach(el => {
      el.addEventListener('change', async (e) => {
        const id = e.target.dataset.id;
        const idx = parseInt(e.target.dataset.idx);
        const item = this.items.find(i => i.id === id);
        if (!item || !item.subtasks || !item.subtasks[idx]) return;
        item.subtasks[idx].completed = e.target.checked;
        if (!e.target.checked) item.completed = false;
        else item.completed = item.subtasks.every(s => s.completed);
        await DB.put('items', item);
        await this.loadItems();
        this.render();
      });
    });
  },

  _initDragDrop(container) {
    let dragId = null;

    container.querySelectorAll('.todo-drag').forEach(el => {
      el.addEventListener('dragstart', (e) => {
        dragId = e.target.dataset.id;
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', dragId);
        e.target.closest('.todo-item').classList.add('dragging');
      });
      el.addEventListener('dragend', (e) => {
        e.target.closest('.todo-item')?.classList.remove('dragging');
        container.querySelectorAll('.quadrant').forEach(q => q.classList.remove('drag-over'));
        dragId = null;
      });
    });

    container.querySelectorAll('.quadrant').forEach(quad => {
      quad.addEventListener('dragover', (e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        quad.classList.add('drag-over');
      });
      quad.addEventListener('dragleave', () => {
        quad.classList.remove('drag-over');
      });
      quad.addEventListener('drop', async (e) => {
        e.preventDefault();
        quad.classList.remove('drag-over');
        const id = e.dataTransfer.getData('text/plain') || dragId;
        if (!id) return;
        const newQuadrant = parseInt(quad.dataset.quadrant);
        const item = this.items.find(i => i.id === id);
        if (!item || item.quadrant === newQuadrant) return;
        item.quadrant = newQuadrant;
        await DB.put('items', item);
        await this.loadItems();
        this.render();
      });
    });

    // Also allow dropping on the uncategorized section to clear quadrant
    const uncatSection = container.querySelector('.uncat-drop-zone');
    if (uncatSection) {
      uncatSection.addEventListener('dragover', (e) => e.preventDefault());
      uncatSection.addEventListener('drop', async (e) => {
        e.preventDefault();
        const id = e.dataTransfer.getData('text/plain') || dragId;
        if (!id) return;
        const item = this.items.find(i => i.id === id);
        if (!item || item.quadrant == null) return;
        item.quadrant = null;
        await DB.put('items', item);
        await this.loadItems();
        this.render();
      });
    }
  },

  _nav(dir) {
    this.currentDate.setDate(this.currentDate.getDate() + dir);
    this.render();
  },
  _gotoToday() {
    this.currentDate = new Date();
    this.render();
  },

  _showDatePicker() {
    let p = document.getElementById('tdDatePicker');
    if (!p) {
      p = document.createElement('input'); p.id='tdDatePicker'; p.type='date';
      p.style.cssText='position:fixed;opacity:0;pointer-events:none;width:0;height:0;z-index:-1';
      document.body.appendChild(p);
      p.onchange = function() {
        if (!this.value) return;
        Todo.currentDate = new Date(this.value + 'T00:00:00');
        Todo.render();
      };
    }
    p.value = Calendar._locDate(this.currentDate);
    try { if(p.showPicker) p.showPicker(); else p.click(); } catch(e){ p.click(); }
  },

  // ──────── Unified Item Form ────────
  _formHTML(item, titleText) {
    const q = item ? (item.quadrant||'') : '';
    const st = item ? (item.start||'') : '';
    const en = item ? (item.end||'') : '';
    const dd = item ? (item.dueDate||'') : '';
    const tg = item ? (item.tags||[]).join(', ') : '';
    const sb = item ? item.subtasks||[] : [];
    const nt = item ? (item.notes||'') : '';
    let durH=0, durM=0;
    if (item && item.start && item.end) {
      const diff = new Date(item.end) - new Date(item.start);
      if (diff > 0) { durH = Math.floor(diff/3600000); durM = Math.round((diff%3600000)/60000); }
    }
    const rec = item?.recur||{}; const rt=rec.type||'';
    return `
      <div class="modal-body">
      <h3 class="text-lg font-bold mb-4">${titleText}</h3>
      <div class="space-y-3">
        <div><label class="block text-sm font-medium mb-1">标题</label><input id="fmTitle" value="${item?item.title:''}" placeholder="待办内容" oninput="document.getElementById('fmTitleError')?.classList.add('hidden')"><span id="fmTitleError" class="hidden text-xs text-red-500 mt-1 block">请输入标题</span></div>
        <div class="grid grid-cols-2 gap-2">
          <div><label class="block text-sm font-medium mb-1">开始</label><input type="datetime-local" id="fmStart" value="${st}" onchange="Calendar._durDurToEnd()"></div>
          <div><label class="block text-sm font-medium mb-1">结束</label><input type="datetime-local" id="fmEnd" value="${en}" onchange="Calendar._durEndToDur()"></div>
        </div>
        <div class="grid grid-cols-2 gap-2">
          <div><label class="block text-sm font-medium mb-1">持续时间</label>
            <div class="flex items-center gap-1">
              <input type="number" id="fmDurH" min="0" max="24" value="${durH}" placeholder="时" class="w-full" oninput="Calendar._durDurToEnd()">
              <span class="text-xs text-gray-400">时</span>
              <input type="number" id="fmDurM" min="0" max="59" step="15" value="${durM}" placeholder="分" class="w-full" oninput="Calendar._durDurToEnd()">
              <span class="text-xs text-gray-400">分</span>
            </div>
          </div>
          <div></div>
        </div>
        <div class="grid grid-cols-2 gap-2">
          <div><label class="block text-sm font-medium mb-1">四象限</label>
            <select id="fmQuadrant">
              <option value="">无</option>
              <option value="1" ${q==1?'selected':''}>${QUAD_LABELS[1]}</option>
              <option value="2" ${q==2?'selected':''}>${QUAD_LABELS[2]}</option>
              <option value="3" ${q==3?'selected':''}>${QUAD_LABELS[3]}</option>
              <option value="4" ${q==4?'selected':''}>${QUAD_LABELS[4]}</option>
            </select>
          </div>
          <div><label class="block text-sm font-medium mb-1">截止日期</label><input type="date" id="fmDue" value="${dd}"></div>
        </div>
        <div><label class="block text-sm font-medium mb-1">标签（逗号分隔）</label><input id="fmTags" value="${tg}" placeholder="工作, 学习"></div>
        <div><label class="block text-sm font-medium mb-1">子任务</label>
          <div id="subtaskList" class="space-y-1 mb-2">
            ${sb.map(s => `<div class="subtask-row flex items-center gap-1">
              <input type="checkbox" ${s.completed?'checked':''} class="subtask-cb w-4 h-4 shrink-0">
              <input type="text" value="${Calendar._e(s.title)}" class="subtask-input flex-1 text-sm px-2 py-1 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-800">
              <span class="subtask-del cursor-pointer text-gray-400 hover:text-red-500 text-sm shrink-0 px-0.5" onclick="this.closest('.subtask-row').remove()">✕</span>
            </div>`).join('')}
          </div>
          <div class="flex gap-1">
            <input id="newSubtaskTitle" placeholder="添加子任务" class="flex-1 text-sm px-2 py-1 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-800" onkeydown="if(event.key==='Enter')Calendar._addSubtask()">
            <button type="button" class="px-3 py-1 bg-indigo-100 dark:bg-indigo-900 text-indigo-600 dark:text-indigo-300 rounded text-sm hover:bg-indigo-200 dark:hover:bg-indigo-800 shrink-0" onclick="Calendar._addSubtask()">+</button>
          </div>
        </div>
        <div><label class="block text-sm font-medium mb-1">备注</label><textarea id="fmNotes" rows="2" placeholder="自由文本备注...">${nt}</textarea></div>
        <div class="border-t border-gray-200 dark:border-gray-700 pt-2 mt-1">
          <div class="flex items-center gap-2 mb-1">
            <select id="fmRecurType" onchange="Calendar._toggleRecurFields()" class="text-xs py-1">
              <option value="">不重复</option>
              <option value="weekly" ${rt==='weekly'?'selected':''}>每周重复</option>
              <option value="monthly" ${rt==='monthly'?'selected':''}>每月重复</option>
            </select>
          </div>
          <div id="recurWeeklyFields" class="${rt==='weekly'?'':'hidden'} flex flex-wrap gap-x-2 gap-y-1 text-xs mb-1">
            ${['日','一','二','三','四','五','六'].map((d,i)=>'<label class="flex items-center gap-0.5"><input type="checkbox" data-day="'+i+'" '+(rec.daysOfWeek?.includes(i)?'checked':'')+'>'+d+'</label>').join('')}
          </div>
          <div id="recurMonthlyFields" class="${rt==='monthly'?'':'hidden'} text-xs mb-1">
            <label>每月第 <input type="number" id="fmRecurDay" min="1" max="28" value="${rec.dayOfMonth||1}" class="w-10"> 天</label>
          </div>
          <div id="recurIntervalSection" class="${rt?'':'hidden'} flex items-center gap-1 text-xs">
            <label>每</label>
            <input type="number" id="fmRecurInterval" min="1" max="12" value="${rec.interval||1}" class="w-10">
            <span id="recurIntervalLabel">${rt==='monthly'?'月':'周'}</span>
          </div>
        </div>
        ${item ? `<div class="flex items-center gap-2 pt-1"><input type="checkbox" id="fmDone" ${item.completed?'checked':''} class="w-4 h-4"><label for="fmDone" class="text-sm">标记为已完成</label></div>` : ''}
      </div></div>`;
  },

  _readForm() {
    const title = document.getElementById('fmTitle').value.trim();
    if (!title) {
      const err = document.getElementById('fmTitleError');
      if (err) err.classList.remove('hidden');
      document.getElementById('fmTitle')?.focus();
      return;
    }
    const err = document.getElementById('fmTitleError');
    if (err) err.classList.add('hidden');
    const subtaskRows = document.querySelectorAll('#subtaskList .subtask-row');
    const subs = Array.from(subtaskRows).map(row => ({
      title: row.querySelector('.subtask-input').value.trim(),
      completed: row.querySelector('.subtask-cb').checked
    })).filter(s => s.title);
    let done = false;
    const fmDoneEl = document.getElementById('fmDone');
    if (fmDoneEl) {
      done = fmDoneEl.checked;
      subs.forEach(s => s.completed = done);
    } else {
      done = subs.length > 0 && subs.every(s => s.completed);
    }
    const tags = document.getElementById('fmTags').value.trim().split(/[,，]/).map(s=>s.trim()).filter(Boolean);
    let end = document.getElementById('fmEnd').value || '';
    const start = document.getElementById('fmStart').value;
    if (!end && start) {
      const dh = parseInt(document.getElementById('fmDurH')?.value)||0;
      const dm = parseInt(document.getElementById('fmDurM')?.value)||0;
      if (dh||dm) { const d=new Date(start); d.setHours(d.getHours()+dh,d.getMinutes()+dm); end=Calendar._locStr(d); }
    }
    return {
      title,
      start,
      end,
      quadrant: document.getElementById('fmQuadrant').value ? parseInt(document.getElementById('fmQuadrant').value) : null,
      dueDate: document.getElementById('fmDue').value || '',
      tags, subtasks: subs,
      notes: document.getElementById('fmNotes').value.trim(),
      recur: Calendar._recurFromForm(),
      completed: done
    };
  },

  create() {
    const defDate = Calendar._locDate(this.currentDate);
    Calendar.showModal(this._formHTML(null, '新建待办') +
      `<div class="flex gap-2 mt-4">
        <button id="fmSave" class="flex-1 px-4 py-2 bg-indigo-500 text-white rounded-lg text-sm font-medium hover:bg-indigo-600">保存</button>
        <button id="fmCancel" class="px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm hover:bg-gray-50 dark:hover:bg-gray-700">取消</button>
      </div>`);
    document.getElementById('fmStart').value = defDate + 'T09:00';
    document.getElementById('fmSave').onclick = async () => {
      const data = this._readForm();
      if (!data) return;
      const item = { ...data, id: 'td_'+Date.now(), created: Calendar._locDate(new Date()) };
      await DB.put('items', item);
      this.items.push(item);
      document.getElementById('modalOverlay').classList.add('hidden');
      await this.loadItems();
      this.render();
    };
    document.getElementById('fmCancel').onclick = () => document.getElementById('modalOverlay').classList.add('hidden');
  },

  edit(id) {
    const item = this.items.find(i => i.id === id);
    if (!item) return;
    Calendar.showModal(this._formHTML(item, '编辑待办') +
      `<div class="flex gap-2 mt-4">
        <button id="fmSave" class="flex-1 px-4 py-2 bg-indigo-500 text-white rounded-lg text-sm font-medium hover:bg-indigo-600">保存</button>
        <button id="fmDelete" class="px-4 py-2 bg-red-500 text-white rounded-lg text-sm font-medium hover:bg-red-600">删除</button>
        <button id="fmCancel" class="px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm hover:bg-gray-50 dark:hover:bg-gray-700">取消</button>
      </div>`);
    document.getElementById('fmSave').onclick = async () => {
      const data = this._readForm();
      if (!data) return;
      Object.assign(item, data);
      await DB.put('items', item);
      await this.loadItems();
      document.getElementById('modalOverlay').classList.add('hidden'); this.render();
    };
    document.getElementById('fmDelete').onclick = async () => {
      if (!(await Calendar.showConfirm('确定要删除此待办？'))) return;
      await DB.del('items', id);
      this.items = this.items.filter(i => i.id !== id);
      document.getElementById('modalOverlay').classList.add('hidden'); this.render();
    };
    document.getElementById('fmCancel').onclick = () => document.getElementById('modalOverlay').classList.add('hidden');
  }
};
