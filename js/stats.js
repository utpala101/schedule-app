const Stats = {
  charts: {},

  async init() {
    const [items, workLogs] = await Promise.all([DB.getAll('items'), DB.getAll('workLogs')]);
    this.items = items;
    this.workLogs = workLogs;
    this.renderAll();
  },

  renderAll() {
    this.renderDailyTodos();
    this.renderHoursByProject();
    this.renderQuadrantDist();
    this.renderCompletionRate();
    this.renderHeatmap();
  },

  // 1. Daily todo completion (last 30 days)
  renderDailyTodos() {
    const ctx = document.getElementById('chartTodoDaily');
    if (!ctx) return;
    if (this.charts.todoDaily) this.charts.todoDaily.destroy();

    const days = 30;
    const labels = [];
    const data = [];
    for (let i = days - 1; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const dateStr = d.toISOString().slice(0, 10);
      labels.push((d.getMonth() + 1) + '/' + d.getDate());
      data.push(this.items.filter(t => t.created === dateStr && t.completed).length);
    }

    this.charts.todoDaily = new Chart(ctx, {
      type: 'line',
      data: {
        labels,
        datasets: [{
          label: '完成待办',
          data,
          borderColor: '#6366f1',
          backgroundColor: 'rgba(99,102,241,0.1)',
          fill: true,
          tension: 0.3,
          pointRadius: 3
        }]
      },
      options: {
        responsive: true,
        plugins: { legend: { display: false } },
        scales: {
          x: { ticks: { maxTicksLimit: 10, color: '#9ca3af' }, grid: { display: false } },
          y: { beginAtZero: true, ticks: { stepSize: 1, color: '#9ca3af' }, grid: { color: 'rgba(0,0,0,0.05)' } }
        }
      }
    });
  },

  // 2. Hours by project (if duration recorded)
  renderHoursByProject() {
    const ctx = document.getElementById('chartHoursByProject');
    if (!ctx) return;
    if (this.charts.hoursProject) this.charts.hoursProject.destroy();

    const projectHours = {};
    for (const w of this.workLogs) {
      if (!w.project || !w.duration) continue;
      const hours = this.parseDuration(w.duration);
      if (hours > 0) projectHours[w.project] = (projectHours[w.project] || 0) + hours;
    }

    const labels = Object.keys(projectHours);
    const data = Object.values(projectHours);

    this.charts.hoursProject = new Chart(ctx, {
      type: 'doughnut',
      data: {
        labels,
        datasets: [{
          data: data.length ? data : [1],
          backgroundColor: ['#6366f1', '#f59e0b', '#ef4444', '#10b981', '#3b82f6', '#8b5cf6'],
          borderWidth: 0
        }]
      },
      options: {
        responsive: true,
        plugins: {
          legend: { position: 'bottom', labels: { padding: 12, color: '#9ca3af' } }
        }
      }
    });
  },

  // 3. Quadrant distribution
  renderQuadrantDist() {
    const ctx = document.getElementById('chartQuadrant');
    if (!ctx) return;
    if (this.charts.quadrant) this.charts.quadrant.destroy();

    const qLabels = ['重要且紧急', '重要不紧急', '紧急不重要', '不紧急不重要'];
    const counts = [1, 2, 3, 4].map(q => this.items.filter(t => (t.quadrant || 4) === q).length);

    this.charts.quadrant = new Chart(ctx, {
      type: 'bar',
      data: {
        labels: qLabels,
        datasets: [{
          label: '待办数量',
          data: counts,
          backgroundColor: ['#ef4444', '#3b82f6', '#f59e0b', '#6b7280'],
          borderRadius: 4
        }]
      },
      options: {
        responsive: true,
        plugins: { legend: { display: false } },
        scales: {
          x: { ticks: { color: '#9ca3af' }, grid: { display: false } },
          y: { beginAtZero: true, ticks: { stepSize: 1, color: '#9ca3af' }, grid: { color: 'rgba(0,0,0,0.05)' } }
        }
      }
    });
  },

  // 4. Completion rate trend (last 12 weeks)
  renderCompletionRate() {
    const ctx = document.getElementById('chartCompletionRate');
    if (!ctx) return;
    if (this.charts.completionRate) this.charts.completionRate.destroy();

    const weeks = 12;
    const labels = [];
    const rates = [];
    for (let i = weeks - 1; i >= 0; i--) {
      const end = new Date();
      end.setDate(end.getDate() - i * 7);
      const start = new Date(end);
      start.setDate(start.getDate() - 6);
      const weekTodos = this.items.filter(t => {
        return t.created >= start.toISOString().slice(0, 10) && t.created <= end.toISOString().slice(0, 10);
      });
      const total = weekTodos.length;
      const done = weekTodos.filter(t => t.completed).length;
      rates.push(total > 0 ? Math.round(done / total * 100) : 0);
      labels.push(`${start.getMonth()+1}/${start.getDate()}`);
    }

    this.charts.completionRate = new Chart(ctx, {
      type: 'line',
      data: {
        labels,
        datasets: [{
          label: '完成率 %',
          data: rates,
          borderColor: '#10b981',
          backgroundColor: 'rgba(16,185,129,0.1)',
          fill: true,
          tension: 0.3,
          pointRadius: 3
        }]
      },
      options: {
        responsive: true,
        plugins: { legend: { display: false } },
        scales: {
          x: { ticks: { color: '#9ca3af' }, grid: { display: false } },
          y: { beginAtZero: true, max: 100, ticks: { color: '#9ca3af', callback: v => v + '%' }, grid: { color: 'rgba(0,0,0,0.05)' } }
        }
      }
    });
  },

  // 5. Calendar heatmap (GitHub-style, last 12 weeks)
  renderHeatmap() {
    const container = document.querySelector('#chartHeatmap').parentElement;
    const canvas = document.getElementById('chartHeatmap');
    canvas.style.display = 'none';

    let heatmapEl = container.querySelector('.heatmap-grid');
    if (!heatmapEl) {
      heatmapEl = document.createElement('div');
      heatmapEl.className = 'heatmap-grid';
      container.appendChild(heatmapEl);
    }

    // Build date->count map for last 84 days
    const countMap = {};
    const now = new Date();
    for (let i = 83; i >= 0; i--) {
      const d = new Date(now);
      d.setDate(d.getDate() - i);
      const dateStr = d.toISOString().slice(0, 10);
      const completed = this.items.filter(t => t.created === dateStr && t.completed).length;
      const logged = this.workLogs.filter(w => w.date === dateStr).length;
      countMap[dateStr] = completed + logged;
    }

    // Find max for coloring
    const maxVal = Math.max(...Object.values(countMap), 1);
    const levels = [0, 0.25, 0.5, 0.75, 1];

    // Render grid: 7 rows (days), 12 columns (weeks)
    const weekdays = ['一', '二', '三', '四', '五', '六', '日'];
    let html = '<div class="flex">';
    html += '<div class="flex flex-col gap-[2px] mr-1">';
    for (let d = 0; d < 7; d++) {
      html += `<div class="text-xs text-gray-400 h-3.5 leading-3.5" style="height:14px;font-size:10px;">${weekdays[d]}</div>`;
    }
    html += '</div><div class="flex gap-[2px]">';

    for (let w = 0; w < 12; w++) {
      html += '<div class="flex flex-col gap-[2px]">';
      for (let d = 0; d < 7; d++) {
        const dayOffset = (11 - w) * 7 + d;
        // Map to actual date: align to nearest Monday previous
        const dayDate = new Date(now);
        dayDate.setDate(dayDate.getDate() - dayOffset);
        const dateStr = dayDate.toISOString().slice(0, 10);
        const val = countMap[dateStr] || 0;
        const intensity = val / maxVal;
        let color;
        if (val === 0) color = 'bg-gray-100 dark:bg-gray-800';
        else if (intensity <= 0.25) color = 'bg-indigo-200 dark:bg-indigo-900/40';
        else if (intensity <= 0.5) color = 'bg-indigo-300 dark:bg-indigo-700/60';
        else if (intensity <= 0.75) color = 'bg-indigo-400 dark:bg-indigo-600/80';
        else color = 'bg-indigo-500 dark:bg-indigo-400';
        html += `<div class="heatmap-cell ${color}" title="${dateStr}: ${val}"></div>`;
      }
      html += '</div>';
    }
    html += '</div></div>';

    // Add legend
    html += '<div class="flex items-center gap-1 mt-2 justify-end text-xs text-gray-400">';
    html += '<span>少</span>';
    for (const lvl of levels) {
      let color;
      if (lvl === 0) color = 'bg-gray-100 dark:bg-gray-800';
      else if (lvl <= 0.25) color = 'bg-indigo-200 dark:bg-indigo-900/40';
      else if (lvl <= 0.5) color = 'bg-indigo-300 dark:bg-indigo-700/60';
      else if (lvl <= 0.75) color = 'bg-indigo-400 dark:bg-indigo-600/80';
      else color = 'bg-indigo-500 dark:bg-indigo-400';
      html += `<div class="heatmap-cell ${color}"></div>`;
    }
    html += '<span>多</span></div>';

    heatmapEl.innerHTML = html;
  },

  parseDuration(str) {
    if (!str) return 0;
    let hours = 0;
    const hMatch = str.match(/(\d+)\s*小[时時]/);
    if (hMatch) hours += parseFloat(hMatch[1]);
    const mMatch = str.match(/(\d+)\s*分[钟鍾]/);
    if (mMatch) hours += parseFloat(mMatch[1]) / 60;
    return hours;
  },

  // Refresh when data changes
  async refresh() {
    [this.items, this.workLogs] = await Promise.all([DB.getAll('items'), DB.getAll('workLogs')]);
    this.renderAll();
  }
};
