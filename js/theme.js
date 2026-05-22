const Theme = {
  _initDone: false,
  init() {
    if (this._initDone) return;
    this._initDone = true;
    const saved = localStorage.getItem('theme') || 'light';
    this.set(saved);
    document.getElementById('themeToggle').addEventListener('click', () => {
      const next = document.documentElement.classList.contains('dark') ? 'light' : 'dark';
      this.set(next);
    });
  },

  set(theme) {
    document.documentElement.classList.toggle('dark', theme === 'dark');
    localStorage.setItem('theme', theme);
    const btn = document.getElementById('themeToggle');
    if (theme === 'dark') {
      btn.querySelector('.sun-icon').classList.add('hidden');
      btn.querySelector('.moon-icon').classList.remove('hidden');
      btn.querySelector('.theme-text').textContent = '亮色模式';
    } else {
      btn.querySelector('.sun-icon').classList.remove('hidden');
      btn.querySelector('.moon-icon').classList.add('hidden');
      btn.querySelector('.theme-text').textContent = '暗色模式';
    }
  }
};

if (typeof module !== 'undefined' && module.exports) module.exports = Theme;
