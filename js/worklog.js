const WorkLog = {
  logs: [],

  async init() {
    this.logs = await DB.getAll('workLogs');
    this.render();
    document.getElementById('addWorklogBtn').addEventListener('click', () => this.create());
    document.getElementById('worklogSearch').addEventListener('input', () => this.render());
  },

  render() {
    const query = document.getElementById('worklogSearch').value.trim().toLowerCase();
    const filtered = query ? this.logs.filter(l =>
      (l.description || '').toLowerCase().includes(query) ||
      (l.project || '').toLowerCase().includes(query) ||
      (l.tags || []).some(t => t.toLowerCase().includes(query)) ||
      (l.notes || '').toLowerCase().includes(query)
    ) : this.logs;

    // Sort by date desc
    filtered.sort((a, b) => b.date.localeCompare(a.date));

    const list = document.getElementById('worklogList');
    if (filtered.length === 0) {
      list.innerHTML = '<div class="text-center py-12 text-gray-400">暂无记录</div>';
      return;
    }

    let html = '';
    let currentDate = '';
    for (const w of filtered) {
      if (w.date !== currentDate) {
        currentDate = w.date;
        html += `<div class="text-sm font-semibold text-gray-500 mt-4 mb-2">${currentDate}</div>`;
      }
      html += `
        <div class="worklog-item bg-white dark:bg-gray-800 rounded-lg p-4 border border-gray-200 dark:border-gray-700 cursor-pointer hover:shadow-sm transition" data-id="${w.id}">
          <div class="flex items-start justify-between gap-2">
            <div class="flex-1">
              <div class="flex items-center gap-2 mb-1 flex-wrap">
                ${w.project ? `<span class="text-xs font-medium px-2 py-0.5 bg-indigo-100 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400 rounded">${w.project}</span>` : ''}
                ${(w.tags || []).map(t => `<span class="text-xs px-2 py-0.5 bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400 rounded">${t}</span>`).join('')}
              </div>
              <div class="text-sm">${w.description || '无描述'}</div>
              ${w.notes ? `<div class="text-xs text-gray-400 mt-1 line-clamp-2">${w.notes}</div>` : ''}
            </div>
            <div class="text-xs text-gray-400 whitespace-nowrap">${w.duration || ''}</div>
          </div>
        </div>
      `;
    }
    list.innerHTML = html;

    list.querySelectorAll('.worklog-item').forEach(el => {
      el.addEventListener('click', () => this.edit(el.dataset.id));
    });
  },

  create() {
    Calendar.showModal(`
      <h3 class="text-lg font-bold mb-4">写工作记录</h3>
      <div class="space-y-3">
        <div><label class="block text-sm font-medium mb-1">日期</label><input type="date" id="wlDate" value="${new Date().toISOString().slice(0, 10)}"></div>
        <div><label class="block text-sm font-medium mb-1">项目/分类</label><input id="wlProject" placeholder="项目名称"></div>
        <div><label class="block text-sm font-medium mb-1">标签（逗号分隔）</label><input id="wlTags" placeholder="e.g. 前端, bug修复"></div>
        <div><label class="block text-sm font-medium mb-1">内容描述</label><textarea id="wlDesc" rows="2" placeholder="做了什么"></textarea></div>
        <div><label class="block text-sm font-medium mb-1">备注（自由文本）</label><textarea id="wlNotes" rows="3" placeholder="详细备注..."></textarea></div>
        <div><label class="block text-sm font-medium mb-1">耗时</label><input id="wlDuration" placeholder="e.g. 2小时30分"></div>
      </div>
      <div class="flex gap-2 mt-4">
        <button id="wlSave" class="flex-1 px-4 py-2 bg-indigo-500 text-white rounded-lg text-sm font-medium hover:bg-indigo-600">保存</button>
        <button id="wlCancel" class="px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm hover:bg-gray-50 dark:hover:bg-gray-700">取消</button>
      </div>
    `);
    document.getElementById('wlSave').onclick = async () => {
      const desc = document.getElementById('wlDesc').value.trim();
      if (!desc) return alert('请输入内容描述');
      const log = {
        id: 'wl_' + Date.now(),
        date: document.getElementById('wlDate').value,
        project: document.getElementById('wlProject').value.trim(),
        tags: document.getElementById('wlTags').value.trim().split(/[,，]/).map(s => s.trim()).filter(Boolean),
        description: desc,
        notes: document.getElementById('wlNotes').value.trim(),
        duration: document.getElementById('wlDuration').value.trim()
      };
      await DB.put('workLogs', log);
      this.logs.push(log);
      this.logs.sort((a, b) => b.date.localeCompare(a.date));
      document.getElementById('modalOverlay').classList.add('hidden');
      this.render();
    };
    document.getElementById('wlCancel').onclick = () => document.getElementById('modalOverlay').classList.add('hidden');
  },

  edit(id) {
    const w = this.logs.find(l => l.id === id);
    if (!w) return;
    Calendar.showModal(`
      <h3 class="text-lg font-bold mb-4">编辑工作记录</h3>
      <div class="space-y-3">
        <div><label class="block text-sm font-medium mb-1">日期</label><input type="date" id="wlDate" value="${w.date}"></div>
        <div><label class="block text-sm font-medium mb-1">项目/分类</label><input id="wlProject" value="${w.project || ''}"></div>
        <div><label class="block text-sm font-medium mb-1">标签（逗号分隔）</label><input id="wlTags" value="${(w.tags || []).join(', ')}"></div>
        <div><label class="block text-sm font-medium mb-1">内容描述</label><textarea id="wlDesc" rows="2">${w.description || ''}</textarea></div>
        <div><label class="block text-sm font-medium mb-1">备注（自由文本）</label><textarea id="wlNotes" rows="3">${w.notes || ''}</textarea></div>
        <div><label class="block text-sm font-medium mb-1">耗时</label><input id="wlDuration" value="${w.duration || ''}"></div>
      </div>
      <div class="flex gap-2 mt-4">
        <button id="wlSave" class="flex-1 px-4 py-2 bg-indigo-500 text-white rounded-lg text-sm font-medium hover:bg-indigo-600">保存</button>
        <button id="wlDelete" class="px-4 py-2 bg-red-500 text-white rounded-lg text-sm font-medium hover:bg-red-600">删除</button>
        <button id="wlCancel" class="px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm hover:bg-gray-50 dark:hover:bg-gray-700">取消</button>
      </div>
    `);
    document.getElementById('wlSave').onclick = async () => {
      const desc = document.getElementById('wlDesc').value.trim();
      if (!desc) return alert('请输入内容描述');
      w.date = document.getElementById('wlDate').value;
      w.project = document.getElementById('wlProject').value.trim();
      w.tags = document.getElementById('wlTags').value.trim().split(/[,，]/).map(s => s.trim()).filter(Boolean);
      w.description = desc;
      w.notes = document.getElementById('wlNotes').value.trim();
      w.duration = document.getElementById('wlDuration').value.trim();
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
  }
};
