const QUAD_COLORS = ['#6366f1', '#ef4444', '#3b82f6', '#f59e0b', '#6b7280'];
const QUAD_LABELS = ['', '重要紧急', '重要不紧急', '紧急不重要', '不紧急不重要'];

const Calendar = {
  view: 'week',
  currentDate: new Date(),
  items: [],
  _expanded: false,
  _workStart: 6,
  _workEnd: 22,
  _timeInterval: null,
  _dragInitDone: false,
  _projects: [],
  _tags: [],

  async init() {
    this._workStart = parseInt(localStorage.getItem('cal_workStart')) || 6;
    this._workEnd = parseInt(localStorage.getItem('cal_workEnd')) || 22;
    await this.loadItems();
    this._extractFilterHistory();
    this._populateFilters();
    this._initFilters();
    this.render();

    document.getElementById('calTitle').onclick = (e) => {
      if (e.target.closest('button')) return;
      this._showDatePicker();
    };
    document.getElementById('calSettings').onclick = () => this.showSettings();
    this.initDragDrop(); // document-level listeners, added once
    document.getElementById('calPrev').onclick = () => this.navigate(-1);
    document.getElementById('calNext').onclick = () => this.navigate(1);
    document.getElementById('calToday').onclick = () => {
      this.currentDate = new Date(); this.render();
    };
    document.querySelectorAll('.cal-view-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        this.view = btn.dataset.calView;
        document.querySelectorAll('.cal-view-btn').forEach(b => {
          b.classList.remove('bg-white', 'dark:bg-gray-700', 'shadow-sm', 'font-medium');
        });
        btn.classList.add('bg-white', 'dark:bg-gray-700', 'shadow-sm', 'font-medium');
        this.render();
      });
    });
  },

  async loadItems() {
    this.items = (await DB.getAll('items')).filter(i => i.start);
  },

  navigate(dir) {
    const d = new Date(this.currentDate);
    if (this.view === 'month') d.setMonth(d.getMonth() + dir);
    else if (this.view === 'week') d.setDate(d.getDate() + dir * 7);
    else d.setDate(d.getDate() + dir);
    this.currentDate = d; this.render();
  },

  render() {
    this._extractFilterHistory();
    this._populateFilters();
    const {start,end}=this.getViewStartEnd();
    this._recurClones=this._expandRecurring(this.items.filter(i=>i.recur?.type),Calendar._locDate(start),Calendar._locDate(end));
    this._startTimeIndicator();
    if (this.view === 'month') this.renderMonth();
    else if (this.view === 'week') this.renderWeek();
    else this.renderDay();
    this._applyOpacity();
  },
  _applyOpacity() {
    const op = localStorage.getItem('cal_eventOpacity');
    if (!op || op === '1') return;
    document.querySelectorAll('.cal-event:not(.cal-event-done)').forEach(el => el.style.opacity = op);
    let s = document.getElementById('cal-opacity-style');
    if (!s) { s = document.createElement('style'); s.id = 'cal-opacity-style'; document.head.appendChild(s); }
    s.textContent = '.cal-event:not(.cal-event-done){opacity:'+op+'!important}';
  },
  _allItems() { return [...this.items.filter(i=>!i.recur?.type),...(this._recurClones||[])].filter(i => this._matchesFilter(i)); },
  _matchesFilter(item) {
    const search = (document.getElementById('calSearch')?.value||'').trim().toLowerCase();
    const project = document.getElementById('calProjectFilter')?.value||'';
    const tag = document.getElementById('calTagFilter')?.value||'';
    if (search && !(item.title||'').toLowerCase().includes(search) && !(item.notes||'').toLowerCase().includes(search)) return false;
    if (project && (item.project||'') !== project) return false;
    if (tag && !(item.tags||[]).includes(tag)) return false;
    return true;
  },
  _extractFilterHistory() {
    const ps = new Set(), ts = new Set();
    for (const i of this.items) {
      if (i.project) ps.add(i.project);
      (i.tags||[]).forEach(t => ts.add(t));
    }
    this._projects = [...ps].sort();
    this._tags = [...ts].sort();
  },
  _populateFilters() {
    const projEl = document.getElementById('calProjectFilter');
    const tagEl = document.getElementById('calTagFilter');
    if (!projEl || !tagEl) return;
    projEl.innerHTML = '<option value="">所有项目</option>'+this._projects.map(p => '<option value="'+Calendar._e(p)+'">'+Calendar._e(p)+'</option>').join('');
    tagEl.innerHTML = '<option value="">所有标签</option>'+this._tags.map(t => '<option value="'+Calendar._e(t)+'">'+Calendar._e(t)+'</option>').join('');
  },
  _initFilters() {
    const clearBtn = document.getElementById('calClearFilter');
    const refresh = () => {
      const active = !!(document.getElementById('calSearch')?.value||document.getElementById('calProjectFilter')?.value||document.getElementById('calTagFilter')?.value);
      if (clearBtn) clearBtn.classList.toggle('hidden', !active);
      this.render();
    };
    document.getElementById('calSearch')?.addEventListener('input', refresh);
    document.getElementById('calProjectFilter')?.addEventListener('change', refresh);
    document.getElementById('calTagFilter')?.addEventListener('change', refresh);
    if (clearBtn) clearBtn.addEventListener('click', () => {
      document.getElementById('calSearch').value='';
      document.getElementById('calProjectFilter').value='';
      document.getElementById('calTagFilter').value='';
      clearBtn.classList.add('hidden');
      this.render();
    });
  },

  getViewStartEnd() {
    const d = new Date(this.currentDate);
    let start, end;
    if (this.view === 'month') {
      start = new Date(d.getFullYear(), d.getMonth(), 1);
      start.setDate(start.getDate() - start.getDay());
      end = new Date(d.getFullYear(), d.getMonth() + 1, 0);
      if (end.getDay() < 6) end.setDate(end.getDate() + (6 - end.getDay()));
    } else if (this.view === 'week') {
      start = new Date(d); start.setDate(start.getDate() - start.getDay());
      end = new Date(start); end.setDate(end.getDate() + 6);
    } else {
      start = new Date(d); start.setHours(0,0,0,0);
      end = new Date(d); end.setHours(23,59,59,999);
    }
    return { start, end };
  },

  monthLabel() { return `${this.currentDate.getFullYear()}年${this.currentDate.getMonth()+1}月`; },
  weekLabel() { const {start,end}=this.getViewStartEnd(); return `${start.getMonth()+1}/${start.getDate()} - ${end.getMonth()+1}/${end.getDate()}`; },
  dayLabel() { const d=['日','一','二','三','四','五','六']; return `${this.currentDate.getFullYear()}年${this.currentDate.getMonth()+1}月${this.currentDate.getDate()}日 周${d[this.currentDate.getDay()]}`; },

  // ──────── Month View ────────
  renderMonth() {
    this._stopTimeIndicator();
    document.getElementById('calTitle').textContent = this.monthLabel();
    const { start, end } = this.getViewStartEnd();
    const today = new Date().toDateString();
    const wd = ['日','一','二','三','四','五','六'];
    let html = '<div id="calendarGrid">';
    for (const d of wd) html += `<div class="cal-weekday-header">${d}</div>`;
    const cur = new Date(start);
    while (cur <= end) {
      const ds = Calendar._locDate(cur);
      const its = cur.toDateString()===today;
      const io = cur.getMonth()!==this.currentDate.getMonth();
      const de = this._allItems().filter(e=>e.start&&e.start.slice(0,10)===ds);
      html += `<div class="cal-day-cell ${io?'other-month':''} ${its?'today':''}" data-date="${ds}"><div class="cal-day-num">${cur.getDate()}</div><div class="px-1">`;
      for (const ev of de.slice(0,3)) {
        const qc = QUAD_COLORS[ev.quadrant||0];
        html += `<div class="cal-event ${ev.completed?'cal-event-done':''}${ev._isRecurrence?' cal-event-recur':''}" style="position:static;margin-bottom:1px;border-left-color:${qc}" data-id="${ev.id}">${ev.completed?'✓ ':''}${ev.title}</div>`;
      }
      if (de.length>3) html += `<div class="text-xs text-gray-400 px-1">+${de.length-3}更多</div>`;
      html += `</div></div>`;
      cur.setDate(cur.getDate()+1);
    }
    html += '</div>';
    document.getElementById('calendarBody').innerHTML = html;
    this.bindEventClicks(); this.bindCellClicks();
  },

  renderWeek() { this._renderWeekDay(false); },
  renderDay() { this._renderWeekDay(true); },

  _renderWeekDay(isDay) {
    const titleEl = document.getElementById('calTitle');
    titleEl.innerHTML = (isDay?this.dayLabel():this.weekLabel())
      + ` <button onclick="Calendar._toggleExpand()" class="text-xs font-normal text-indigo-500 hover:text-indigo-700 ml-2 align-middle">${this._expanded?'折叠':'展开全部'}</button>`;
    const { start } = this.getViewStartEnd();
    const today = new Date().toDateString();
    const wd = ['日','一','二','三','四','五','六'];
    const ws=this._workStart, we=this._workEnd;
    const slotH=40, fh=26;
    const ec = isDay ? this._countInRange(this.currentDate,0,ws) : this._countRange(start,0,7,ws);
    const lc = isDay ? this._countInRange(this.currentDate,we,24) : this._countRange(start,we,7,24);
    const ch = this._expanded ? (24*slotH+20) : ((we-ws)*slotH+(ec>=0?fh:0)+(lc>=0?fh:0)+20);
    document.documentElement.style.setProperty('--cal-slot-height', slotH+'px');

    let html = '<div class="flex"><div class="w-14 flex-shrink-0"></div>';
    for (let i=0; i<(isDay?1:7); i++) {
      const d = new Date(start); if(isDay) d.setTime(this.currentDate.getTime()); else d.setDate(d.getDate()+i);
      html += `<div class="week-header-cell ${d.toDateString()===today?'today':''}">${isDay?'':wd[i]+' '}${d.getDate()}</div>`;
    }
    html += '</div><div class="flex" style="height:'+ch+'px;overflow-y:auto;position:relative;">';

    // Gutter
    html += '<div class="w-14 flex-shrink-0 relative">';
    if (this._expanded) {
      for(let h=0;h<24;h++) html+=`<div class="cal-time-slot text-xs text-gray-400 pr-1 text-right" style="padding-top:0;">${h.toString().padStart(2,'0')}:00</div>`;
    } else {
      html+=`<div class="cal-fold-bar" style="cursor:default;min-height:${fh}px;font-size:10px;padding:2px 4px;border-bottom:1px solid var(--color-border);">${ec>0?ec+'个':''}</div>`;
      for(let h=ws;h<we;h++) html+=`<div class="cal-time-slot text-xs text-gray-400 pr-1 text-right" style="padding-top:0;">${h.toString().padStart(2,'0')}:00</div>`;
      html+=`<div class="cal-fold-bar" style="cursor:default;min-height:${fh}px;font-size:10px;padding:2px 4px;">${lc>0?lc+'个':''}</div>`;
    }
    html += '</div>';

    const cc = isDay ? 1 : 7;
    for (let i=0; i<cc; i++) {
      const d = new Date(start); if(isDay) d.setTime(this.currentDate.getTime()); else d.setDate(d.getDate()+i);
      const ds = Calendar._locDate(d);
      const its = d.toDateString()===today;
      html += `<div class="flex-1 relative ${its?'bg-indigo-50/30 dark:bg-indigo-900/10':''}" style="border-left:1px solid var(--color-border);">`;

      if (this._expanded) {
        for(let h=0;h<24;h++) html+=`<div class="cal-time-slot" data-date="${ds}" data-hour="${h}"></div>`;
        const de = this._allItems().filter(e=>e.start&&e.start.slice(0,10)===ds);
        for (const ev of de) {
          const tp = this._topPx(ev,24,0,true);
          const hp = this._hPx(ev,24,0,true);
          html += Calendar._eventHTML(ev, tp, hp);
        }
        if(its) html+=this._timeHTML(24,0,true);
      } else {
        html+=`<div class="cal-fold-bar ${ec>0?'has-items':''}" onclick="Calendar._toggleExpand()" style="min-height:${fh}px;"><span class="fold-line"></span><span>${ec>0?'前 '+ec+' 项':'0:00-5:59'}</span><span class="fold-line"></span></div>`;
        for(let h=ws;h<we;h++) html+=`<div class="cal-time-slot" data-date="${ds}" data-hour="${h}"></div>`;
        const de = this._allItems().filter(e=>e.start&&e.start.slice(0,10)===ds);
        for (const ev of de) {
          const eh = parseInt(ev.start.slice(11,13));
          if (eh>=ws && eh<we) {
            const tp = this._topPx(ev,we-ws,ws,false);
            const hp = this._hPx(ev,we-ws,ws,false);
            html += Calendar._eventHTML(ev, tp, hp);
          }
        }
        html+=`<div class="cal-fold-bar ${lc>0?'has-items':''}" onclick="Calendar._toggleExpand()" style="min-height:${fh}px;"><span class="fold-line"></span><span>${lc>0?'后 '+lc+' 项':'22:00-23:59'}</span><span class="fold-line"></span></div>`;
        if(its) html+=this._timeHTML(we-ws,ws,false);
      }
      html += '</div>';
    }
    html += '</div>';
    document.getElementById('calendarBody').innerHTML = html;
    this.bindEventClicks(); this.bindCellClicks();
  },

  _topPx(ev,th,oh,abs) {
    const hr=parseInt(ev.start.slice(11,13)||'0'), mn=parseInt(ev.start.slice(14,16)||'0');
    const sh=40, foldH=26;
    if(abs) return (hr*60+mn)/(24*60)*(24*sh);
    if(hr<oh||hr>=oh+th) return 0;
    return ((hr-oh)*60+mn)/(th*60)*(th*sh) + foldH;
  },
  _hPx(ev,th,oh,abs) {
    if (!ev.end) return 20;
    const sh=40;
    const sm=parseInt(ev.start.slice(11,13))*60+parseInt(ev.start.slice(14,16));
    const em=parseInt(ev.end.slice(11,13))*60+parseInt(ev.end.slice(14,16));
    const dur=Math.max(em-sm,0);
    if (dur<=0) return 20;
    if (abs) return Math.max(dur/(24*60)*(24*sh),18);
    const ws=oh*60, we=(oh+th)*60;
    const vs=Math.max(sm,ws), ve=Math.min(em,we);
    return Math.max(Math.max(ve-vs,0)/(th*60)*(th*sh),18);
  },
  _countInRange(d,sh,eh) {
    const ds=Calendar._locDate(d);
    return this._allItems().filter(e=>e.start&&e.start.slice(0,10)===ds).filter(e=>{const h=parseInt(e.start.slice(11,13)); return h>=sh&&h<eh;}).length;
  },
  _countRange(sd,sh,nd,eh) { let t=0; for(let i=0;i<nd;i++){const d=new Date(sd);d.setDate(d.getDate()+i);t+=this._countInRange(d,sh,eh);} return t; },

  _timeHTML(th,oh,abs) {
    const n=new Date(); const hr=n.getHours(), mn=n.getMinutes();
    if(hr<oh||hr>=oh+th) return '';
    const sh=40, foldH=26;
    const tp=abs?(hr*60+mn)/(24*60)*(24*sh):((hr-oh)*60+mn)/(th*60)*(th*sh)+foldH;
    return `<div class="cal-time-indicator" style="top:${tp}px"><div class="ti-dot"></div><div class="ti-line"></div></div>`;
  },
  _startTimeIndicator() {
    this._stopTimeIndicator();
    this._timeInterval=setInterval(()=>{
      if (this.view==='month') return;
      const ind = document.querySelector('.cal-time-indicator');
      if (!ind) { this.render(); return; }
      const now=new Date(), hr=now.getHours(), mn=now.getMinutes();
      const ws=this._workStart, we=this._workEnd, sh=40, fh=26;
      if (this._expanded) {
        ind.style.top=((hr*60+mn)/(24*60)*(24*sh))+'px';
      } else {
        if (hr<ws||hr>=we) { ind.style.display='none'; return; }
        ind.style.display='';
        ind.style.top=(((hr-ws)*60+mn)/((we-ws)*60)*((we-ws)*sh)+fh)+'px';
      }
    },60000);
  },
  _stopTimeIndicator() { if(this._timeInterval){clearInterval(this._timeInterval);this._timeInterval=null;} },
  _toggleExpand() { this._expanded=!this._expanded; this.render(); },

  // ──────── Date Picker ────────
  _showDatePicker() {
    let p = document.getElementById('calDatePicker');
    if (!p) {
      p = document.createElement('input'); p.id='calDatePicker';
      p.style.cssText='position:fixed;opacity:0;pointer-events:none;width:0;height:0;z-index:-1';
      document.body.appendChild(p);
    }
    Calendar._pickerCB = (v)=>{
      if(!v) return;
      if(Calendar.view==='month'){const[y,m]=v.split('-').map(Number);Calendar.currentDate=new Date(y,m-1,1);}
      else if(Calendar.view==='week'){const d=new Date(v+'T00:00:00');d.setDate(d.getDate()-d.getDay());Calendar.currentDate=d;}
      else Calendar.currentDate=new Date(v+'T00:00:00');
      Calendar.render();
    };
    p.onchange=null;
    p.onchange=function(){const cb=Calendar._pickerCB;Calendar._pickerCB=null;if(cb)cb(this.value);};
    if(this.view==='month'){p.type='month';p.value=`${this.currentDate.getFullYear()}-${(this.currentDate.getMonth()+1).toString().padStart(2,'0')}`;}
    else if(this.view==='week'){p.type='date';const s=new Date(this.currentDate);s.setDate(s.getDate()-s.getDay());p.value=Calendar._locDate(s);}
    else{p.type='date';p.value=Calendar._locDate(this.currentDate);}
    try{if(p.showPicker)p.showPicker();else p.click();}catch(e){p.click();}
  },

  // ──────── Helpers ────────
  _eventHTML(ev, tp, hp) {
    const done = ev.completed ? 'cal-event-done' : '';
    const recur = ev._isRecurrence ? ' cal-event-recur' : '';
    const check = ev.completed ? '✓ ' : '';
    return `<div class="cal-event ${done}${recur}" data-id="${ev.id}" style="top:${tp}px;height:${hp}px;border-left-color:${QUAD_COLORS[ev.quadrant||0]}">
      <span class="cal-ev-acts"><span class="cal-ev-act cal-ev-done" data-act="done">${ev.completed?'↺':'✓'}</span><span class="cal-ev-act cal-ev-del" data-act="del">✕</span></span>
      <span class="cal-ev-title">${check}${Calendar._e(ev.title)}</span>
      <span class="cal-ev-resize cal-ev-resize-top" data-resize="start"></span>
      <span class="cal-ev-resize cal-ev-resize-bot" data-resize="end"></span>
    </div>`;
  },
  _e(s) { return (s||'').replace(/["<>&]/g,c=>({'&':'&amp;','"':'&quot;','<':'&lt;','>':'&gt;'}[c])); },

  async _quickToggleDone(id) {
    const item = this.items.find(i => i.id === id);
    if (!item) return;
    item.completed = !item.completed;
    if (item.subtasks?.length) item.subtasks.forEach(s => s.completed = item.completed);
    await DB.put('items', item);
    this.items = (await DB.getAll('items')).filter(i=>i.start);
    this.render();
  },

  async _quickDelete(id) {
    const ri = this._isRecurInstance(id);
    const item = ri ? ri.master : this.items.find(i=>i.id===id);
    if (!item) return;
    if (ri) { this._deleteRecurring(item, ri.date); return; }
    if (!(await this.showConfirm('确定要删除此项？'))) return;
    await DB.del('items', item.id);
    this.items = this.items.filter(i=>i.id!==item.id);
    this.render();
  },
  _addSubtask() {
    const t = document.getElementById('newSubtaskTitle');
    const v = t?.value.trim();
    if (!v) return;
    const row = document.createElement('div');
    row.className = 'subtask-row flex items-center gap-1';
    const cb = document.createElement('input');
    cb.type = 'checkbox'; cb.className = 'subtask-cb w-4 h-4 shrink-0';
    const inp = document.createElement('input');
    inp.type = 'text'; inp.value = v;
    inp.className = 'subtask-input flex-1 text-sm px-2 py-1 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-800';
    const del = document.createElement('span');
    del.className = 'subtask-del cursor-pointer text-gray-400 hover:text-red-500 text-sm shrink-0 px-0.5';
    del.textContent = '✕';
    del.onclick = () => row.remove();
    row.append(cb, inp, del);
    document.getElementById('subtaskList').appendChild(row);
    const fmDone = document.getElementById('fmDone');
    if (fmDone) fmDone.checked = false;
    t.value = '';
    t.focus();
  },

  // ──────── Unified Item Form ────────
  _itemFormHTML(item, titleText) {
    const q = item ? (item.quadrant||'') : '';
    const st = item ? item.start : '';
    const en = item ? (item.end||'') : '';
    const dd = item ? (item.dueDate||'') : '';
    const tg = item ? (item.tags||[]).join(', ') : '';
    const sb = item ? item.subtasks||[] : [];
    const nt = item ? (item.notes||'') : '';
    const done = item ? item.completed : false;
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
        <div><label class="block text-sm font-medium mb-1">标题</label><input id="fmTitle" value="${item?item.title:''}" placeholder="事件标题" oninput="document.getElementById('fmTitleError')?.classList.add('hidden')"><span id="fmTitleError" class="hidden text-xs text-red-500 mt-1 block">请输入标题</span></div>
        <div><label class="block text-sm font-medium mb-1">项目</label><input id="fmProject" value="${item?Calendar._e(item.project||''):''}" placeholder="项目名称" list="projList"><datalist id="projList">${this._projects.map(p => `<option value="${Calendar._e(p)}">`).join('')}</datalist></div>
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
        ${item ? `<div class="flex items-center gap-2 pt-1"><input type="checkbox" id="fmDone" ${done?'checked':''} class="w-4 h-4"><label for="fmDone" class="text-sm">标记为已完成</label></div>` : ''}
      </div></div>`;
  },

  _readItemForm() {
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
    const subtasks = Array.from(subtaskRows).map(row => ({
      title: row.querySelector('.subtask-input').value.trim(),
      completed: row.querySelector('.subtask-cb').checked
    })).filter(s => s.title);
    let done = false;
    const fmDoneEl = document.getElementById('fmDone');
    if (fmDoneEl) {
      done = fmDoneEl.checked;
      subtasks.forEach(s => s.completed = done);
    } else {
      done = subtasks.length > 0 && subtasks.every(s => s.completed);
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
      project: document.getElementById('fmProject').value.trim(),
      start,
      end,
      quadrant: document.getElementById('fmQuadrant').value ? parseInt(document.getElementById('fmQuadrant').value) : null,
      dueDate: document.getElementById('fmDue').value || '',
      tags, subtasks,
      notes: document.getElementById('fmNotes').value.trim(),
      recur: this._recurFromForm(),
      completed: done
    };
  },
  _locStr(d) { const p=n=>String(n).padStart(2,'0'); return d.getFullYear()+'-'+p(d.getMonth()+1)+'-'+p(d.getDate())+'T'+p(d.getHours())+':'+p(d.getMinutes()); },
  _locDate(d) { return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0'); },
  _durEndToDur() {
    const s=document.getElementById('fmStart')?.value, e=document.getElementById('fmEnd')?.value;
    if (s&&e) { const d=new Date(e)-new Date(s);
      if(d>0){document.getElementById('fmDurH').value=Math.floor(d/3600000);document.getElementById('fmDurM').value=Math.round((d%3600000)/60000);} }
  },
  _durDurToEnd() {
    const s=document.getElementById('fmStart')?.value;
    const h=parseInt(document.getElementById('fmDurH')?.value)||0, m=parseInt(document.getElementById('fmDurM')?.value)||0;
    if (s&&(h||m)) { const d=new Date(s); d.setHours(d.getHours()+h,d.getMinutes()+m); document.getElementById('fmEnd').value=Calendar._locStr(d); }
  },

  // ──────── Recurrence ────────
  _toggleRecurFields() {
    const t=document.getElementById('fmRecurType')?.value;
    document.getElementById('recurWeeklyFields')?.classList.toggle('hidden',t!=='weekly');
    document.getElementById('recurMonthlyFields')?.classList.toggle('hidden',t!=='monthly');
    document.getElementById('recurIntervalSection')?.classList.toggle('hidden',!t);
    document.getElementById('recurIntervalLabel').textContent = t==='monthly'?'月':'周';
  },
  _recurFromForm() {
    const type = document.getElementById('fmRecurType')?.value;
    if (!type) return null;
    const interval = parseInt(document.getElementById('fmRecurInterval')?.value)||1;
    const exceptions = [];
    if (type === 'weekly') {
      const days = [];
      document.querySelectorAll('#recurWeeklyFields input[type=checkbox]').forEach(cb => { if(cb.checked) days.push(parseInt(cb.dataset.day)); });
      if (!days.length) return null;
      return { type, interval, daysOfWeek: days, exceptions };
    }
    if (type === 'monthly') {
      const day = parseInt(document.getElementById('fmRecurDay')?.value)||1;
      return { type, interval, dayOfMonth: Math.min(day,28), exceptions };
    }
    return null;
  },
  _isRecurInstance(id) {
    const i=id.lastIndexOf('_'); if(i<=0) return null;
    const ds=id.slice(i+1); if(!/^\d{4}-\d{2}-\d{2}$/.test(ds)) return null;
    const m=this.items.find(x=>x.id===id.slice(0,i));
    return m&&m.recur?.type?{master:m,date:ds}:null;
  },
  _matchRecur(r, date, startDate) {
    if (r.type==='weekly') {
      if (!r.daysOfWeek?.includes(date.getDay())) return false;
      if ((r.interval||1)>1) return Math.floor(Math.round((date-startDate)/86400000)/7)%r.interval===0;
      return true;
    }
    if (r.type==='monthly') {
      if (date.getDate()!==(r.dayOfMonth||1)) return false;
      if ((r.interval||1)>1) return ((date.getFullYear()-startDate.getFullYear())*12+date.getMonth()-startDate.getMonth())%r.interval===0;
      return true;
    }
    return false;
  },
  _expandRecurring(items, startStr, endStr) {
    const clones=[]; const s=new Date(startStr+'T00:00:00'); const e=new Date(endStr+'T23:59:59');
    for (const item of items) {
      const r=item.recur; if(!r||!r.type) continue;
      const is=new Date(item.start.slice(0,10)+'T00:00:00');
      const ie=r.endDate?new Date(r.endDate+'T23:59:59'):null;
      const ex=r.exceptions||[];
      const rs=new Date(Math.max(s,is)); const re=ie?new Date(Math.min(e,ie)):e;
      let cur=new Date(rs);
      while(cur<=re){
        const ds=Calendar._locDate(cur);
        if(!ex.includes(ds)&&this._matchRecur(r,cur,is)){
          clones.push({...item,id:item.id+'_'+ds,_masterId:item.id,_instanceDate:ds,_isRecurrence:true,
            start:ds+'T'+item.start.slice(11),
            end:item.end?ds+'T'+item.end.slice(11):''});
        }
        cur.setDate(cur.getDate()+1);
      }
    }
    return clones;
  },

  createEvent(date, hour) {
    const timeStr = `${date}T${hour.toString().padStart(2,'0')}:00`;
    const html = this._itemFormHTML(null, '新建') + `<div class="flex gap-2 mt-4">
      <button id="fmSave" class="flex-1 px-4 py-2 bg-indigo-500 text-white rounded-lg text-sm font-medium hover:bg-indigo-600">保存</button>
      <button id="fmCancel" class="px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm hover:bg-gray-50 dark:hover:bg-gray-700">取消</button>
    </div>`;
    this.showModal(html);
    document.getElementById('fmStart').value = timeStr;
    document.getElementById('fmSave').onclick = async () => {
      const data = this._readItemForm();
      if (!data) return;
      const item = { ...data, id: 'ev_'+Date.now(), created: Calendar._locDate(new Date()) };
      await DB.put('items', item);
      this.items.push(item);
      document.getElementById('modalOverlay').classList.add('hidden');
      // Refresh items from DB to pick up todo side changes
      this.items = (await DB.getAll('items')).filter(i=>i.start);
      this.render();
    };
    document.getElementById('fmCancel').onclick = () => document.getElementById('modalOverlay').classList.add('hidden');
  },

  editEvent(id) {
    // Check if this is a recurring instance
    const ri = this._isRecurInstance(id);
    const item = ri ? ri.master : this.items.find(i=>i.id===id);
    if (!item) return;
    const html = this._itemFormHTML(item, '编辑') + `<div class="flex gap-2 mt-4">
      <button id="fmSave" class="flex-1 px-4 py-2 bg-indigo-500 text-white rounded-lg text-sm font-medium hover:bg-indigo-600">保存</button>
      <button id="fmDelete" class="px-4 py-2 bg-red-500 text-white rounded-lg text-sm font-medium hover:bg-red-600">删除</button>
      <button id="fmCancel" class="px-4 py-2 border border-gray-200 dark:border-gray-600 rounded-lg text-sm hover:bg-gray-50 dark:hover:bg-gray-700">取消</button>
    </div>`;
    this.showModal(html);
    document.getElementById('fmSave').onclick = async () => {
      const data = this._readItemForm();
      if (!data) return;
      Object.assign(item, data);
      await DB.put('items', item);
      this.items = (await DB.getAll('items')).filter(i=>i.start);
      document.getElementById('modalOverlay').classList.add('hidden'); this.render();
    };
    document.getElementById('fmDelete').onclick = async () => {
      if (ri) { this._deleteRecurring(item, ri.date); return; }
      if (!(await Calendar.showConfirm('确定要删除此项？'))) return;
      await DB.del('items', item.id);
      this.items = this.items.filter(i=>i.id!==item.id);
      document.getElementById('modalOverlay').classList.add('hidden'); this.render();
    };
    document.getElementById('fmCancel').onclick = () => document.getElementById('modalOverlay').classList.add('hidden');
  },

  _deleteRecurring(item, instanceDate) {
    this.showModal(`
      <h3 class="text-lg font-bold mb-3">删除重复日程</h3>
      <p class="text-sm text-gray-500 mb-3">${instanceDate} 的"${item.title}"</p>
      <div class="space-y-2">
        <button id="delThis" class="w-full px-4 py-2 bg-red-500 text-white rounded-lg text-sm font-medium hover:bg-red-600 text-left">仅删除本次</button>
        <p class="text-xs text-gray-400 -mt-1">仅移除 ${instanceDate} 的日程，后续重复保留</p>
        <button id="delFuture" class="w-full px-4 py-2 bg-orange-500 text-white rounded-lg text-sm font-medium hover:bg-orange-600 text-left">删除本次及之后</button>
        <p class="text-xs text-gray-400 -mt-1">删除 ${instanceDate} 及之后所有重复</p>
        <button id="delAll" class="w-full px-4 py-2 border border-red-300 dark:border-red-700 text-red-600 dark:text-red-400 rounded-lg text-sm font-medium hover:bg-red-50 dark:hover:bg-red-900/20 text-left">删除全部</button>
        <p class="text-xs text-gray-400 -mt-1">删除此重复日程的所有实例</p>
        <button id="delCancel" class="w-full px-4 py-2 border border-gray-200 dark:border-gray-600 rounded-lg text-sm hover:bg-gray-50 dark:hover:bg-gray-700">取消</button>
      </div>`);
    document.getElementById('delThis').onclick = async () => {
      item.recur.exceptions = [...(item.recur.exceptions||[]), instanceDate];
      await DB.put('items', item);
      this.items = (await DB.getAll('items')).filter(i=>i.start);
      document.getElementById('modalOverlay').classList.add('hidden'); this.render();
    };
    document.getElementById('delFuture').onclick = async () => {
      // Split at this date: keep original events before, end series here
      const d = new Date(instanceDate+'T00:00:00');
      d.setDate(d.getDate()-1);
      item.recur.endDate = Calendar._locDate(d);
      // Also add this instance to exceptions
      item.recur.exceptions = [...(item.recur.exceptions||[]), instanceDate];
      await DB.put('items', item);
      this.items = (await DB.getAll('items')).filter(i=>i.start);
      document.getElementById('modalOverlay').classList.add('hidden'); this.render();
    };
    document.getElementById('delAll').onclick = async () => {
      await DB.del('items', item.id);
      this.items = this.items.filter(i=>i.id!==item.id);
      document.getElementById('modalOverlay').classList.add('hidden'); this.render();
    };
    document.getElementById('delCancel').onclick = () => document.getElementById('modalOverlay').classList.add('hidden');
  },

  // ──────── Shared ────────
  bindEventClicks() {
    // Use one delegated listener — safe to call every render
    const body = document.getElementById('calendarBody');
    if (!body) return;
    // Remove old listener to prevent duplicates
    const handler = Calendar._clickHandler;
    if (handler) body.removeEventListener('click', handler);
    Calendar._clickHandler = (e) => {
      if (Calendar._preventEventClick) { Calendar._preventEventClick = false; return; }
      const act = e.target.closest('.cal-ev-act');
      if (act) {
        const evEl = act.closest('.cal-event');
        if (!evEl) return;
        e.stopPropagation();
        const id = evEl.dataset.id;
        if (act.dataset.act === 'done') Calendar._quickToggleDone(id);
        else if (act.dataset.act === 'del') Calendar._quickDelete(id);
        return;
      }
      const ev = e.target.closest('.cal-event');
      if (ev) { e.stopPropagation(); Calendar.editEvent(ev.dataset.id); }
    };
    body.addEventListener('click', Calendar._clickHandler);
  },
  bindCellClicks() {
    document.querySelectorAll('.cal-day-cell').forEach(el => {
      el.addEventListener('click', (e) => {
        if (Calendar._preventSlotClick) { Calendar._preventSlotClick = false; return; }
        if (e.target.closest('.cal-event')) return;
        this.createEvent(el.dataset.date||Calendar._locDate(this.currentDate), '12');
      });
    });
  },

  initDragDrop() {
    if (this._dragInitDone) return;
    this._dragInitDone = true;
    let dragEl = null, currentSlot = null;
    let dragStartX = 0, dragStartY = 0, dragMoved = false, dragIsMonth = false;
    let drawStart = null, drawEndHour = null, drawMoved = false;
    let resizeEdge = null, resizeItem = null, resizeMoved = false, resizeHour = undefined;

    const getSlotAtPoint = (x, y) => {
      const grid = document.getElementById('calendarBody');
      if (!grid) return null;
      const cols = Array.from(grid.querySelectorAll('.flex-1.relative'));
      const col = cols.find(c => { const r=c.getBoundingClientRect(); return x>=r.left && x<r.right; });
      if (!col) return null;
      const slots = col.querySelectorAll('.cal-time-slot');
      if (!slots.length) return null;
      const sr = slots[0].getBoundingClientRect();
      const sh = sr.height || 40;
      const idx = Math.max(0, Math.min(Math.round((y - sr.top) / sh), slots.length - 1));
      return slots[idx];
    };

    const clearDrawHighlight = () => {
      if (drawStart && drawStart.col) {
        drawStart.col.querySelectorAll('.cal-slot-selected').forEach(s => s.classList.remove('cal-slot-selected'));
      }
    };
    const updateDrawHighlight = () => {
      if (!drawStart || !drawStart.col) return;
      const minH = Math.min(drawStart.hour, drawEndHour);
      const maxH = Math.max(drawStart.hour, drawEndHour);
      drawStart.col.querySelectorAll('.cal-time-slot').forEach(s => {
        const h = parseInt(s.dataset.hour);
        s.classList.toggle('cal-slot-selected', !isNaN(h) && h >= minH && h <= maxH);
      });
    };

    const onStart = (e) => {
      // Resize edge drag (week/day events only)
      const resize = e.target.closest('.cal-ev-resize');
      if (resize) {
        const evEl = resize.closest('.cal-event');
        if (!evEl || evEl.closest('.cal-day-cell')) return;
        e.preventDefault();
        const item = Calendar.items.find(i => i.id === evEl.dataset.id);
        if (!item) return;
        resizeEdge = resize.dataset.resize;
        resizeItem = item;
        resizeMoved = false;
        resizeHour = undefined;
        dragEl = evEl;
        return;
      }
      // Slot draw mode: mousedown on empty time slot
      const slot = e.target.closest('.cal-time-slot');
      if (slot && !e.target.closest('.cal-event')) {
        drawStart = {
          date: slot.dataset.date,
          hour: parseInt(slot.dataset.hour),
          col: slot.closest('.flex-1.relative')
        };
        drawEndHour = drawStart.hour;
        drawMoved = false;
        return;
      }
      // Event drag mode
      const ev = e.target.closest('.cal-event');
      if (!ev) return;
      e.preventDefault();
      dragStartX = e.clientX;
      dragStartY = e.clientY;
      dragMoved = false;
      dragEl = ev;
      dragIsMonth = !!ev.closest('.cal-day-cell');
    };

    const onMove = (e) => {
      if (drawStart) {
        e.preventDefault();
        const slots = drawStart.col?.querySelectorAll('.cal-time-slot');
        if (!slots?.length) return;
        const sr = slots[0].getBoundingClientRect();
        if (!sr) return;
        const sh = sr.height || 40;
        const idx = Math.max(0, Math.min(Math.round((e.clientY - sr.top) / sh), slots.length - 1));
        const newHour = parseInt(slots[idx].dataset.hour);
        if (isNaN(newHour)) return;
        if (newHour !== drawStart.hour) drawMoved = true;
        if (newHour !== drawEndHour) {
          drawEndHour = newHour;
          updateDrawHighlight();
        }
        return;
      }

      if (resizeEdge) {
        e.preventDefault();
        const col = dragEl.closest('.flex-1.relative');
        if (!col) return;
        const slots = col.querySelectorAll('.cal-time-slot');
        if (!slots.length) return;
        const sr = slots[0].getBoundingClientRect();
        const sh = sr.height || 40;
        const idx = Math.max(0, Math.min(Math.round((e.clientY - sr.top) / sh), slots.length - 1));
        const targetSlot = slots[idx];
        if (!targetSlot) return;
        const hr = parseInt(targetSlot.dataset.hour);
        if (isNaN(hr)) return;
        const colRect = col.getBoundingClientRect();
        const slotRect = targetSlot.getBoundingClientRect();
        if (resizeEdge === 'start') {
          const newTop = slotRect.top - colRect.top;
          const curBot = parseFloat(dragEl.style.top) + parseFloat(dragEl.style.height);
          dragEl.style.top = newTop + 'px';
          dragEl.style.height = Math.max(curBot - newTop, 18) + 'px';
        } else {
          dragEl.style.height = Math.max(slotRect.bottom - colRect.top - parseFloat(dragEl.style.top), 18) + 'px';
        }
        resizeMoved = true;
        resizeHour = hr;
        return;
      }
      if (!dragEl) return;
      if (!dragMoved) {
        if (Math.abs(e.clientX - dragStartX) < 2 && Math.abs(e.clientY - dragStartY) < 2) return;
        dragMoved = true;
        dragEl.classList.add('dragging');
        e.preventDefault();
      }
      if (dragIsMonth) {
        const target = document.elementsFromPoint(e.clientX, e.clientY)
          .find(el => el.classList.contains('cal-day-cell'));
        if (target && target !== currentSlot) {
          if (currentSlot) currentSlot.classList.remove('drop-target');
          target.classList.add('drop-target');
          currentSlot = target;
        }
      } else {
        const slot = getSlotAtPoint(e.clientX, e.clientY);
        if (slot && slot !== currentSlot) {
          if (currentSlot) currentSlot.classList.remove('drop-target');
          slot.classList.add('drop-target');
          currentSlot = slot;
        }
      }
    };

    const onDrop = (e) => {
      if (drawStart) {
        if (drawMoved && drawEndHour !== null) {
          const startH = Math.min(drawStart.hour, drawEndHour);
          const endH = Math.max(drawStart.hour, drawEndHour) + 1;
          Calendar._createEventWithRange(drawStart.date, startH, endH);
        } else if (drawStart.hour !== undefined) {
          this.createEvent(drawStart.date, drawStart.hour);
        }
        clearDrawHighlight();
        drawStart = null; drawEndHour = null; drawMoved = false;
        return;
      }

      if (resizeEdge && resizeItem) {
        if (resizeMoved && resizeHour !== undefined) {
          const slot = getSlotAtPoint(e.clientX, e.clientY);
          if (slot && slot.dataset.hour !== undefined) {
            const hr = parseInt(slot.dataset.hour);
            const date = slot.dataset.date || resizeItem.start.slice(0,10);
            if (resizeEdge === 'start') {
              const ns = `${date}T${hr.toString().padStart(2,'0')}:00`;
              const ne = resizeItem.end || Calendar._locStr(new Date(new Date(resizeItem.start).getTime()+3600000));
              if (new Date(ns) < new Date(ne)) {
                resizeItem.start = ns;
                resizeItem.end = Calendar._locStr(new Date(new Date(ns).getTime() + (new Date(ne)-new Date(ns))));
              }
            } else {
              const ne = `${date}T${(hr+1).toString().padStart(2,'0')}:00`;
              if (new Date(ne) > new Date(resizeItem.start)) {
                resizeItem.end = ne;
              }
            }
            DB.put('items', resizeItem).then(() => Calendar.loadItems().then(()=>Calendar.render()));
          }
        }
        if (resizeMoved) {
          Calendar._preventEventClick = true;
          setTimeout(() => Calendar._preventEventClick = false, 200);
        }
        resizeEdge = null; resizeItem = null; resizeMoved = false; resizeHour = undefined;
        onEnd();
        return;
      }

      if (!dragEl || !dragMoved) { onEnd(); return; }

      if (dragIsMonth) {
        Calendar._preventEventClick = true;
        setTimeout(() => Calendar._preventEventClick = false, 200);
        const targetCell = document.elementsFromPoint(e.clientX, e.clientY)
          .find(el => el.classList.contains('cal-day-cell')) || currentSlot;
        if (targetCell && targetCell.dataset.date) {
          const id = dragEl.dataset.id;
          const ev = Calendar.items.find(i => i.id === id);
          if (ev) {
            const nd = targetCell.dataset.date;
            if (nd !== ev.start.slice(0,10)) {
              ev.start = nd + ev.start.slice(10);
              if (ev.end) ev.end = nd + ev.end.slice(10);
              DB.put('items', ev).then(() => Calendar.loadItems().then(()=>Calendar.render()));
            }
          }
        }
        onEnd();
        return;
      }

      const slot = getSlotAtPoint(e.clientX, e.clientY) || currentSlot;
      if (!slot || !slot.dataset) { onEnd(); return; }
      const id = dragEl.dataset.id, date = slot.dataset.date, hour = slot.dataset.hour;
      if (date && hour !== undefined) {
        const ev = this.items.find(i => i.id === id);
        if (ev) {
          const oldStart = ev.start;
          const oldHr = parseInt(oldStart.slice(11,13));
          const newHr = parseInt(hour);
          if (date !== oldStart.slice(0,10) || newHr !== oldHr) {
            ev.start = `${date}T${newHr.toString().padStart(2,'0')}:${oldStart.slice(14,16)}`;
            if (ev.end) {
              const dur = new Date(ev.end) - new Date(oldStart);
              if (dur > 0) ev.end = Calendar._locStr(new Date(new Date(ev.start).getTime() + dur));
            }
          }
          DB.put('items', ev).then(() => this.loadItems().then(()=>this.render()));
        }
      }
      onEnd();
    };

    const onEnd = () => {
      if (drawStart) {
        clearDrawHighlight();
        drawStart = null; drawEndHour = null; drawMoved = false;
        return;
      }
      if (dragEl) dragEl.classList.remove('dragging');
      if (currentSlot) currentSlot.classList.remove('drop-target');
      dragEl = null; currentSlot = null; dragMoved = false; dragIsMonth = false;
      resizeEdge = null; resizeItem = null; resizeMoved = false; resizeHour = undefined;
    };

    document.addEventListener('mousedown', onStart);
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onDrop);
    document.addEventListener('mouseleave', onEnd);
  },

  _createEventWithRange(date, startHour, endHour) {
    const startStr = `${date}T${startHour.toString().padStart(2,'0')}:00`;
    const endStr = `${date}T${endHour.toString().padStart(2,'0')}:00`;
    const html = this._itemFormHTML(null, '新建') + `<div class="flex gap-2 mt-4">
      <button id="fmSave" class="flex-1 px-4 py-2 bg-indigo-500 text-white rounded-lg text-sm font-medium hover:bg-indigo-600">保存</button>
      <button id="fmCancel" class="px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm hover:bg-gray-50 dark:hover:bg-gray-700">取消</button>
    </div>`;
    this.showModal(html);
    document.getElementById('fmStart').value = startStr;
    document.getElementById('fmEnd').value = endStr;
    const durH = endHour - startHour;
    const fmDH = document.getElementById('fmDurH');
    const fmDM = document.getElementById('fmDurM');
    if (fmDH) fmDH.value = durH;
    if (fmDM) fmDM.value = 0;
    document.getElementById('fmSave').onclick = async () => {
      const data = this._readItemForm();
      if (!data) return;
      const item = { ...data, id: 'ev_'+Date.now(), created: Calendar._locDate(new Date()) };
      await DB.put('items', item);
      this.items.push(item);
      document.getElementById('modalOverlay').classList.add('hidden');
      this.items = (await DB.getAll('items')).filter(i=>i.start);
      this.render();
    };
    document.getElementById('fmCancel').onclick = () => document.getElementById('modalOverlay').classList.add('hidden');
  },

  showModal(html) {
    const modal = document.getElementById('modalOverlay');
    document.getElementById('modalContent').innerHTML = html;
    modal.classList.remove('hidden');
    modal.onmousedown = (e) => { modal._clickOnOverlay = (e.target === modal); };
    modal.onclick = (e) => { if(e.target===modal && modal._clickOnOverlay) modal.classList.add('hidden'); };
    // Subtask auto-toggle: all checked -> main done checked
    const subList = document.getElementById('subtaskList');
    if (subList) {
      subList.onchange = (e) => {
        if (e.target.classList.contains('subtask-cb')) {
          const allDone = Array.from(subList.querySelectorAll('.subtask-row')).every(r => r.querySelector('.subtask-cb').checked);
          const fmDone = document.getElementById('fmDone');
          if (fmDone) fmDone.checked = allDone;
        }
      };
    }
    // Main done toggles all subtask checkboxes
    const fmDone = document.getElementById('fmDone');
    if (fmDone) {
      fmDone.onchange = () => {
        const checked = fmDone.checked;
        document.querySelectorAll('#subtaskList .subtask-cb').forEach(cb => cb.checked = checked);
      };
    }
  },

  showConfirm(msg) {
    return new Promise(resolve => {
      this.showModal(`
        <div class="text-center py-2">
          <div class="w-12 h-12 mx-auto mb-3 rounded-full bg-red-50 dark:bg-red-900/20 flex items-center justify-center">
            <svg class="w-6 h-6 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z"/></svg>
          </div>
          <p class="text-sm text-gray-600 dark:text-gray-300 mb-4">${msg}</p>
          <div class="flex gap-2 justify-center">
            <button id="confirmYes" class="px-5 py-2 bg-red-500 text-white rounded-lg text-sm font-medium hover:bg-red-600">确认删除</button>
            <button id="confirmNo" class="px-5 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm hover:bg-gray-50 dark:hover:bg-gray-700">取消</button>
          </div>
        </div>`);
      document.getElementById('confirmYes').onclick = () => { document.getElementById('modalOverlay').classList.add('hidden'); resolve(true); };
      document.getElementById('confirmNo').onclick = () => { document.getElementById('modalOverlay').classList.add('hidden'); resolve(false); };
    });
  },

  _setEventOpacity(val) {
    localStorage.setItem('cal_eventOpacity', val);
    // Direct inline style (highest specificity)
    document.querySelectorAll('.cal-event:not(.cal-event-done)').forEach(el => el.style.opacity = val);
    // Also inject style as belt-and-suspenders
    let s = document.getElementById('cal-opacity-style');
    if (!s) { s = document.createElement('style'); s.id = 'cal-opacity-style'; document.head.appendChild(s); }
    s.textContent = '.cal-event:not(.cal-event-done){opacity:'+val+'!important}';
  },

  showSettings() {
    const curOp = localStorage.getItem('cal_eventOpacity') || '1';
    this.showModal(`
      <h3 class="text-lg font-bold mb-4">日历设置</h3>
      <div class="space-y-4">
        <div>
          <label class="block text-sm font-medium mb-1">工作时段</label>
          <p class="text-xs text-gray-400 mb-2">折叠时段外的所有小时，一键展开即可查看全部。</p>
          <div class="grid grid-cols-2 gap-2">
            <div><label class="text-xs text-gray-400">开始</label>
              <select id="setWorkStart">${[0,1,2,3,4,5,6,7,8,9,10].map(h=>`<option value="${h}" ${h===this._workStart?'selected':''}>${h.toString().padStart(2,'0')}:00</option>`).join('')}</select></div>
            <div><label class="text-xs text-gray-400">结束</label>
              <select id="setWorkEnd">${[14,15,16,17,18,19,20,21,22,23].map(h=>`<option value="${h}" ${h===this._workEnd?'selected':''}>${h.toString().padStart(2,'0')}:00</option>`).join('')}</select></div>
          </div>
        </div>
        <div>
          <label class="block text-sm font-medium mb-1">日程块不透明度</label>
          <div class="flex items-center gap-3">
            <input type="range" id="setOpacity" min="0.2" max="1" step="0.05" value="${curOp}" class="flex-1">
            <span id="opacityVal" class="text-sm text-gray-500 w-8 text-right">${Math.round(parseFloat(curOp)*100)}%</span>
          </div>
        </div>
      </div>
      <div class="flex gap-2 mt-4">
        <button id="setSave" class="flex-1 px-4 py-2 bg-indigo-500 text-white rounded-lg text-sm font-medium hover:bg-indigo-600">保存</button>
        <button id="setCancel" class="px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm hover:bg-gray-50 dark:hover:bg-gray-700">取消</button>
      </div>
    `);
    const applyOpa = () => {
      const v = document.getElementById('setOpacity').value;
      document.getElementById('opacityVal').textContent = Math.round(parseFloat(v)*100)+'%';
      Calendar._setEventOpacity(v);
    };
    document.getElementById('setOpacity').oninput = applyOpa;
    document.getElementById('setOpacity').onchange = applyOpa;
    document.getElementById('setSave').onclick = () => {
      this._workStart=parseInt(document.getElementById('setWorkStart').value); this._workEnd=parseInt(document.getElementById('setWorkEnd').value);
      localStorage.setItem('cal_workStart',this._workStart); localStorage.setItem('cal_workEnd',this._workEnd);
      applyOpa();
      document.getElementById('modalOverlay').classList.add('hidden');
    };
    document.getElementById('setCancel').onclick = () => document.getElementById('modalOverlay').classList.add('hidden');
  },

  async addFromTodo(id, title, startDate) {
    const item = {
      id: 'ev_'+Date.now(), title, start: startDate+'T09:00', end: startDate+'T10:00',
      quadrant: null, dueDate: '', tags: [], subtasks: [], notes: '', completed: false, created: startDate
    };
    await DB.put('items', item);
    this.items.push(item);
    this.render();
  }
};
