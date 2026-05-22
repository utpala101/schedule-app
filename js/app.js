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
    currentView = view;
    localStorage.setItem('lastView', view);

    if (view === 'stats') Stats.refresh();
    if (view === 'calendar') Calendar.loadItems().then(() => Calendar.render());
    if (view === 'todo') {
      Todo.currentDate = new Date(); // reset to today
      DB.getAll('items').then(items => { Todo.items = items; Todo.render(); });
    }
  }

  document.querySelectorAll('.nav-btn').forEach(btn => {
    btn.addEventListener('click', () => switchView(btn.dataset.view));
  });

  await DB.init();
  await Promise.all([
    Calendar.init(),
    Todo.init(),
    WorkLog.init(),
    Stats.init()
  ]);

  Export.init();

  // Cross-view sync: any db write refreshes data + visible view
  document.addEventListener('db-sync', async () => {
    const all = await DB.getAll('items');
    Calendar.items = all.filter(i => i.start);
    Todo.items = all;
    Stats.items = all;
    if (currentView === 'todo' || currentView === 'worklog') return; // these refresh on switch
    if (currentView === 'calendar' && Calendar.view !== 'month') Calendar.render();
    else if (currentView === 'stats') Stats.refresh();
  });

  switchView(currentView);
  console.log('日程工作台 ready, view:', currentView);
})();
