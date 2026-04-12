// Main App Controller — routing and global state
class AppController {
  static init() {
    this.currentPage = 'advisor';
    this.model = null;
    this.stats = null;
    this.setupGlobalAesthetics();
    this.setupNavigation();
    this.loadInitialData();
    this.updateClock();
    setInterval(() => this.updateClock(), 1000);
  }

  static setupGlobalAesthetics() {
    if (window.Chart) {
      Chart.defaults.font.family = 'JetBrains Mono';
      Chart.defaults.scale.grid.borderDash = [3, 4];
      Chart.defaults.elements.line.tension = 0.4;
      Chart.defaults.elements.line.borderWidth = 3;
      Chart.defaults.elements.point.radius = 0;
      Chart.defaults.elements.point.hoverRadius = 6;
      Chart.defaults.elements.point.hitRadius = 24;
      Chart.defaults.plugins.tooltip.backgroundColor = 'rgba(25, 28, 36, 0.85)';
      Chart.defaults.plugins.tooltip.titleColor = '#F0CE7A';
      Chart.defaults.plugins.tooltip.bodyFont = { family: 'Syne', size: 13 };
      Chart.defaults.plugins.tooltip.padding = 14;
      Chart.defaults.plugins.tooltip.cornerRadius = 10;
      Chart.defaults.plugins.tooltip.displayColors = false;
      Chart.defaults.plugins.tooltip.backdropFilter = 'blur(6px)'; // Supported in some browsers or custom html tooltip
      Chart.defaults.hover.mode = 'index';
    }
  }

  static setupNavigation() {
    window.nav = (page, element) => {
      document.querySelectorAll('.pg').forEach(p => p.classList.remove('on'));
      document.querySelectorAll('.nb').forEach(n => n.classList.remove('on'));
      document.getElementById(`pg-${page}`).classList.add('on');
      if (element) {
        element.classList.add('on');
        const glider = document.getElementById('sbGlider');
        if (glider) {
          glider.style.opacity = '1';
          glider.style.transform = `translateY(${element.offsetTop}px)`;
        }
      }
      this.currentPage = page;
      // Notify page that it's active
      if (window[`page${page.charAt(0).toUpperCase() + page.slice(1)}`]) {
        window[`page${page.charAt(0).toUpperCase() + page.slice(1)}`].onActive?.();
      }
    };

    // Set initial glider position
    setTimeout(() => {
      const active = document.querySelector('.nb.on');
      if (active) window.nav(this.currentPage, active);
    }, 50);
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
