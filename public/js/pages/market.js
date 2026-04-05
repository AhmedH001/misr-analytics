// Market Analysis Page — market trends and analysis
class PageMarket {
  static init(stats) {
    this.stats = stats;
    this.render();
  }

  static createChart(canvasId, config) {
    const ctx = document.getElementById(canvasId);
    if (!(ctx instanceof HTMLCanvasElement)) return;
    if (CHARTS[canvasId]) {
      CHARTS[canvasId].destroy();
    }
    CHARTS[canvasId] = new Chart(ctx, config);
  }

  static render() {
    const stats = this.stats || {};
    const corrLabels = Object.keys(stats.monthly || {}).sort();
    const corrPrices = corrLabels.map(k => stats.monthly[k]);
    const corrUsd = corrLabels.map(k => stats.usdByMonth?.[k] || 0);

    this.createChart('mCorr', {
      type: 'line',
      data: {
        labels: corrLabels,
        datasets: [
          {
            label: 'Avg EGP/m²',
            data: corrPrices,
            borderColor: 'rgba(82,176,122,0.9)',
            backgroundColor: 'rgba(82,176,122,0.2)',
            fill: true,
            tension: 0.25,
          },
          {
            label: 'USD / EGP Rate',
            data: corrUsd,
            borderColor: 'rgba(192,90,74,0.9)',
            backgroundColor: 'rgba(192,90,74,0.2)',
            fill: true,
            tension: 0.25,
          }
        ]
      },
      options: {
        maintainAspectRatio: false,
        scales: { y: { beginAtZero: false } }
      }
    });

    const matLabels = ['USD / EGP', 'Iron', 'Cement', 'Luxury'];
    const matValues = [
      stats.avgUsd || 0,
      parseFloat(document.getElementById('f_iron')?.value) || 37500,
      parseFloat(document.getElementById('f_cement')?.value) || 3600,
      parseFloat(document.getElementById('f_luxury')?.value) / 100 || 0.5,
    ];

    this.createChart('mMat', {
      type: 'bar',
      data: {
        labels: matLabels,
        datasets: [{
          label: 'Market driver',
          data: matValues,
          backgroundColor: ['rgba(90,143,212,0.75)', 'rgba(212,174,82,0.75)', 'rgba(82,176,122,0.75)', 'rgba(192,90,74,0.75)']
        }]
      },
      options: {
        maintainAspectRatio: false,
        plugins: { legend: { display: false } }
      }
    });
  }

  static onActive() {
    this.render();
  }
}
