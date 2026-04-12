// Main App Controller — routing and global state
class AppController {
  static init() {
    this.currentPage = 'advisor';
    this.model = null;
    this.stats = null;
    this.setupNavigation();
    this.loadInitialData();
    this.updateClock();
    setInterval(() => this.updateClock(), 1000);
  }

  static setupNavigation() {
    window.nav = (page, element) => {
      document.querySelectorAll('.pg').forEach(p => p.classList.remove('on'));
      document.querySelectorAll('.nb').forEach(n => n.classList.remove('on'));
      document.getElementById(`pg-${page}`).classList.add('on');
      if (element) element.classList.add('on');
      this.currentPage = page;
      // Notify page that it's active
      if (window[`page${page.charAt(0).toUpperCase() + page.slice(1)}`]) {
        window[`page${page.charAt(0).toUpperCase() + page.slice(1)}`].onActive?.();
      }
    };
  }

  static async loadInitialData() {
    try {
      const [health, stats, model] = await Promise.all([
        APIService.health(),
        APIService.stats(),
        APIService.model(),
      ]);
      this.updateHealthStatus(health);
      this.stats = stats;
      this.model = model;
      PageAdvisor.init(stats, model);
      PageDashboard.init(stats, model);
      PageUpload.init();
      PageMarket.init(stats);
      PageRental.init(stats);
    } catch (err) {
      console.error('Failed to load initial data:', err);
      this.setHealthStatus(false, 'Failed to connect');
    }
  }

  static updateHealthStatus(health) {
    const ds = document.getElementById('ds');
    const dsTxt = document.getElementById('dsTxt');
    if (health.ok && health.ready) {
      ds.classList.add('ok');
      dsTxt.textContent = `Live · ${health.rows?.toLocaleString()} rows`;
    } else {
      ds.classList.remove('ok');
      dsTxt.textContent = 'Initializing…';
    }
  }

  static setHealthStatus(ok, text) {
    const ds = document.getElementById('ds');
    const dsTxt = document.getElementById('dsTxt');
    if (ok) {
      ds.classList.add('ok');
    } else {
      ds.classList.remove('ok');
    }
    dsTxt.textContent = text;
  }

  static updateClock() {
    const clock = document.getElementById('clock');
    const now = new Date();
    const time = now.toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit' });
    const date = now.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    clock.textContent = `${date}  ${time}`;
  }
}

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', () => AppController.init());
