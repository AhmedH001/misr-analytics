// Dashboard Page — market statistics and trends
class PageDashboard {
  static init(stats, model) {
    this.stats = stats;
    this.model = model;
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
    const model = this.model || {};

    const updateText = (id, value) => {
      const el = document.getElementById(id);
      if (el) el.textContent = value ?? '—';
    };

    updateText('dk1', stats.totalRows?.toLocaleString());
    updateText('dk2', stats.avgPpm?.toLocaleString());
    updateText('dk3', stats.avgUsd?.toLocaleString());
    updateText('dk4', stats.avgArea?.toLocaleString());

    const dashSub = document.getElementById('dashSub');
    if (dashSub) dashSub.textContent = `Dataset source: ${stats.source || 'demo'} · ${stats.validRows?.toLocaleString() || 0} valid samples`;

    const modelStats = document.getElementById('modelStats');
    if (modelStats) {
      modelStats.innerHTML = `
        <div style="font-size:11px;color:var(--slate)">Train R² ${model.metrics?.r2?.toFixed(3) ?? 'N/A'} · RMSE ${model.metrics?.rmse?.toLocaleString() ?? 'N/A'}</div>
        <div style="font-size:11px;color:var(--slate)">Test R² ${model.metrics?.test_r2?.toFixed(3) ?? 'N/A'} · Test RMSE ${model.metrics?.test_rmse?.toLocaleString() ?? 'N/A'}</div>
      `;
    }

    const compBody = document.getElementById('compBody');
    if (compBody) {
      const compRows = stats.byCompound ? Object.entries(stats.byCompound).slice(0, 6) : [];
      if (compRows.length) {
        compBody.innerHTML = compRows.map(([compound, info]) => `
          <tr>
            <td>${compound}</td>
            <td>${info.avg.toLocaleString()}</td>
            <td>${info.count}</td>
            <td>${Math.round(info.avg - stats.avgPpm)} EGP/m²</td>
            <td>${info.avg > stats.avgPpm ? 'Above market' : 'Below market'}</td>
          </tr>
        `).join('');
      } else {
        compBody.innerHTML = '<tr><td colspan="5" style="color:var(--slate3)">Upload data or use the demo dataset to populate market insights.</td></tr>';
      }
    }

    const monthlyKeys = Object.keys(stats.monthly || {}).sort();
    const monthlyData = monthlyKeys.map(k => stats.monthly[k]);
    this.createChart('cTrend', {
      type: 'line',
      data: {
        labels: monthlyKeys,
        datasets: [{
          label: 'Avg EGP / m²',
          data: monthlyData,
          borderColor: 'rgba(212,174,82,0.9)',
          backgroundColor: 'rgba(212,174,82,0.25)',
          fill: true,
          tension: 0.25,
          pointRadius: 3,
        }]
      },
      options: {
        maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: {
          x: { grid: { display: false } },
          y: { beginAtZero: false }
        }
      }
    });

    const typeEntries = Object.entries(stats.byType || {}).sort((a,b)=>b[1]-a[1]);
    this.createChart('cType', {
      type: 'bar',
      data: {
        labels: typeEntries.map(([k]) => k),
        datasets: [{
          label: 'Avg EGP/m²',
          data: typeEntries.map(([,v]) => v),
          backgroundColor: 'rgba(90,143,212,0.75)'
        }]
      },
      options: { maintainAspectRatio: false, plugins: { legend: { display: false } } }
    });

    const cityEntries = Object.entries(stats.byCity || {}).sort((a,b)=>b[1]-a[1]).slice(0, 8);
    this.createChart('cCity', {
      type: 'bar',
      data: {
        labels: cityEntries.map(([k]) => k),
        datasets: [{
          label: 'Avg EGP/m²',
          data: cityEntries.map(([,v]) => v),
          backgroundColor: 'rgba(82,176,122,0.75)'
        }]
      },
      options: { maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { x: { ticks: { maxRotation: 45, minRotation: 0 } } } }
    });

    const usdKeys = Object.keys(stats.usdByMonth || {}).sort();
    const usdData = usdKeys.map(k => stats.usdByMonth[k]);
    this.createChart('cUsd', {
      type: 'line',
      data: {
        labels: usdKeys,
        datasets: [{
          label: 'USD / EGP Rate',
          data: usdData,
          borderColor: 'rgba(192,90,74,0.9)',
          backgroundColor: 'rgba(192,90,74,0.22)',
          fill: true,
          tension: 0.25,
          pointRadius: 3,
        }]
      },
      options: { maintainAspectRatio: false, plugins: { legend: { display: false } } }
    });

    const bedsEntries = Object.entries(stats.byBeds || {}).sort((a,b)=>parseInt(a[0]) - parseInt(b[0]));
    this.createChart('cBeds', {
      type: 'bar',
      data: {
        labels: bedsEntries.map(([k]) => k),
        datasets: [{
          label: 'Avg EGP/m²',
          data: bedsEntries.map(([,v]) => v),
          backgroundColor: 'rgba(212,174,82,0.8)'
        }]
      },
      options: { maintainAspectRatio: false, plugins: { legend: { display: false } } }
    });
  }

  static onActive() {
    // Called when page becomes active
  }
}
