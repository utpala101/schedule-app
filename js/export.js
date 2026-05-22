const Export = {
  init() {
    document.getElementById('exportBtn').addEventListener('click', () => Export.showExportDialog());
    document.getElementById('importBtn').addEventListener('click', () => document.getElementById('importFileInput').click());
    document.getElementById('importFileInput').addEventListener('change', (e) => Export.doImport(e));
  },

  showExportDialog() {
    const modal = document.getElementById('modalOverlay');
    const content = document.getElementById('modalContent');
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10);
    const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().slice(0, 10);
    content.innerHTML = `
      <h3 class="text-lg font-bold mb-4">导出数据</h3>
      <div class="space-y-4">
        <div>
          <label class="block text-sm font-medium mb-1">开始日期</label>
          <input type="date" id="exportStart" value="${startOfMonth}">
        </div>
        <div>
          <label class="block text-sm font-medium mb-1">结束日期</label>
          <input type="date" id="exportEnd" value="${endOfMonth}">
        </div>
        <div class="flex gap-2">
          <button id="exportJsonBtn" class="flex-1 px-4 py-2 bg-indigo-500 text-white rounded-lg text-sm font-medium hover:bg-indigo-600">导出 JSON</button>
          <button id="exportPdfBtn" class="flex-1 px-4 py-2 bg-gray-500 text-white rounded-lg text-sm font-medium hover:bg-gray-600">打印 PDF</button>
        </div>
        <button id="exportAllBtn" class="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm hover:bg-gray-50 dark:hover:bg-gray-700">导出全部数据（含设置）</button>
      </div>
    `;
    modal.classList.remove('hidden');

    document.getElementById('exportJsonBtn').onclick = () => Export.doExport('json');
    document.getElementById('exportPdfBtn').onclick = () => Export.doExport('pdf');
    document.getElementById('exportAllBtn').onclick = () => Export.exportAll();

    document.getElementById('modalOverlay').onclick = (e) => {
      if (e.target === modal) modal.classList.add('hidden');
    };
  },

  async doExport(type) {
    const start = document.getElementById('exportStart').value;
    const end = document.getElementById('exportEnd').value;
    const allItems = await DB.getAll('items');
    const workLogs = await DB.getAll('workLogs');

    const filterByDate = (arr, dateField) =>
      arr.filter(i => i[dateField] >= start && i[dateField] <= end + 'T23:59:59');

    const filtered = {
      items: filterByDate(allItems, 'created'),
      workLogs: filterByDate(workLogs, 'date'),
      exportedAt: new Date().toISOString()
    };

    if (type === 'json') {
      const blob = new Blob([JSON.stringify(filtered, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `scheduler-items-${start}-to-${end}.json`;
      a.click();
      URL.revokeObjectURL(url);
    } else {
      this.printPdf(filtered);
    }

    document.getElementById('modalOverlay').classList.add('hidden');
  },

  async exportAll() {
    const data = await DB.exportAll();
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `scheduler-full-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    document.getElementById('modalOverlay').classList.add('hidden');
  },

  printPdf(data) {
    const w = window.open('', '_blank');
    let html = `
      <!DOCTYPE html><html><head><meta charset="UTF-8">
      <title>工作报表</title>
      <style>
        body { font-family: sans-serif; padding: 20px; color: #333; }
        h1 { font-size: 20px; margin-bottom: 4px; }
        .sub { color: #666; font-size: 13px; margin-bottom: 16px; }
        h2 { font-size: 16px; margin: 16px 0 8px; border-bottom: 1px solid #ddd; padding-bottom: 4px; }
        table { width: 100%; border-collapse: collapse; margin-bottom: 12px; font-size: 13px; }
        th, td { text-align: left; padding: 6px 8px; border-bottom: 1px solid #eee; }
        th { background: #f5f5f5; font-weight: 600; }
        .page-break { page-break-before: always; }
        @media print { body { padding: 0; } }
      </style></head><body>
      <h1>工作报表</h1>
      <div class="sub">导出时间: ${new Date().toLocaleString('zh-CN')}</div>
    `;

    if (data.workLogs?.length) {
      html += `<h2>工作记录 (${data.workLogs.length}条)</h2><table><tr><th>日期</th><th>内容</th><th>项目</th><th>耗时</th></tr>`;
      for (const w of data.workLogs) {
        html += `<tr><td>${w.date}</td><td>${w.description || ''}</td><td>${w.project || '-'}</td><td>${w.duration || '-'}</td></tr>`;
      }
      html += '</table>';
    }

    if (data.items?.length) {
      const incomplete = data.items.filter(t => !t.completed);
      const withTime = data.items.filter(i => i.start);
      html += `<h2>事项 (未完成: ${incomplete.length}/${data.items.length})</h2><table><tr><th>标题</th><th>象限</th><th>时间</th><th>截止</th><th>状态</th></tr>`;
      for (const t of data.items) {
        const ql = QUAD_LABELS[t.quadrant] || '-';
        html += `<tr><td>${t.title}</td><td>${ql}</td><td>${t.start ? t.start.slice(11,16) : '-'}</td><td>${t.dueDate || '-'}</td><td>${t.completed ? '✅ 完成' : '⬜ 未完成'}</td></tr>`;
      }
      html += '</table>';
    }

    html += '</body></html>';
    w.document.write(html);
    w.document.close();
    setTimeout(() => { w.print(); }, 300);
  },

  async doImport(e) {
    const file = e.target.files[0];
    if (!file) return;
    try {
      const text = await file.text();
      const data = JSON.parse(text);
      await DB.importAll(data);
      alert('导入成功！页面将刷新。');
      location.reload();
    } catch (err) {
      alert('导入失败：文件格式错误');
    }
    e.target.value = '';
  }
};
