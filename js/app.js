(async function() {
  Theme.init();

  const views = {
    calendar: document.getElementById('view-calendar'),
    todo: document.getElementById('view-todo'),
    worklog: document.getElementById('view-worklog'),
    stats: document.getElementById('view-stats')
  };

  const savedView = localStorage.getItem('lastView') || 'calendar';
  let currentView = savedView;

  function switchView(view) {
    Object.keys(views).forEach(key => views[key].classList.toggle('hidden', key !== view));
    document.querySelectorAll('.nav-btn').forEach(btn => {
      const a = btn.dataset.view === view;
      btn.classList.toggle('bg-indigo-50', a);
      btn.classList.toggle('dark:bg-indigo-900/30', a);
      btn.classList.toggle('text-indigo-600', a);
      btn.classList.toggle('dark:text-indigo-400', a);
      btn.classList.toggle('text-gray-600', !a);
      btn.classList.toggle('dark:text-gray-400', !a);
    });
    // Bottom nav sync
    document.querySelectorAll('.mobile-nav-btn[data-view]').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.view === view);
    });
    currentView = view;
    localStorage.setItem('lastView', view);

    if (view === 'stats') Stats.refresh();
    if (view === 'calendar') Calendar.loadItems().then(() => Calendar.render());
    if (view === 'todo') {
      Todo.currentDate = new Date();
      DB.getAll('items').then(items => { Todo.items = items; Todo.render(); });
    }
  }

  // Desktop nav
  document.querySelectorAll('.nav-btn').forEach(btn => {
    btn.addEventListener('click', () => switchView(btn.dataset.view));
  });
  // Mobile bottom nav
  document.querySelectorAll('.mobile-nav-btn[data-view]').forEach(btn => {
    btn.addEventListener('click', () => {
      closeMobileSheet();
      switchView(btn.dataset.view);
    });
  });

  // Mobile More sheet
  const sheetOverlay = document.getElementById('mobileSheetOverlay');
  function openMobileSheet() { sheetOverlay.classList.remove('hidden'); }
  window.closeMobileSheet = function() { sheetOverlay.classList.add('hidden'); };
  document.getElementById('mobileMoreBtn').addEventListener('click', openMobileSheet);
  sheetOverlay.addEventListener('click', window.closeMobileSheet);

  // Sheet actions
  const themeText = document.querySelector('.mobile-sheet-theme-text');
  document.getElementById('mobileThemeBtn').addEventListener('click', () => {
    Theme.toggle();
    themeText.textContent = document.documentElement.classList.contains('dark') ? '亮色模式' : '暗色模式';
    closeMobileSheet();
  });
  document.getElementById('mobileExportBtn').addEventListener('click', () => {
    closeMobileSheet();
    Export.showExportDialog();
  });
  document.getElementById('mobileImportBtn').addEventListener('click', () => {
    closeMobileSheet();
    document.getElementById('importFileInput').click();
  });

  await DB.init();
  await Promise.all([
    Calendar.init(),
    Todo.init(),
    WorkLog.init(),
    Stats.init()
  ]);

  Export.init();

  document.addEventListener('db-sync', async () => {
    const all = await DB.getAll('items');
    Calendar.items = all.filter(i => i.start);
    Todo.items = all;
    Stats.items = all;
    if (currentView === 'todo' || currentView === 'worklog') return;
    if (currentView === 'calendar' && Calendar.view !== 'month') Calendar.render();
    else if (currentView === 'stats') Stats.refresh();
  });

  switchView(currentView);
  console.log('日程工作台 ready, view:', currentView);
})();
