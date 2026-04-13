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

    const animateValue = (id, end, duration, formatStr = '') => {
      const el = document.getElementById(id);
      if (!el || typeof end !== 'number') return;
      let startTimestamp = null;
      const step = (timestamp) => {
        if (!startTimestamp) startTimestamp = timestamp;
        const progress = Math.min((timestamp - startTimestamp) / duration, 1);
        const current = progress * end;
        el.textContent = Math.floor(current).toLocaleString() + formatStr;
        if (progress < 1) {
          window.requestAnimationFrame(step);
        } else {
          el.textContent = end.toLocaleString() + formatStr;
        }
      };
      window.requestAnimationFrame(step);
    };

    if (stats.totalRows) animateValue('dk1', stats.totalRows, 1500);
    if (stats.avgPpm) animateValue('dk2', stats.avgPpm, 1500);
    if (stats.avgUsd) animateValue('dk3', stats.avgUsd, 1500);
    if (stats.avgArea) animateValue('dk4', stats.avgArea, 1500);

    const dashSub = document.getElementById('dashSub');
    if (dashSub) dashSub.textContent = `Dataset source: ${stats.source || 'demo'} · ${stats.validRows?.toLocaleString() || 0} valid samples`;

    const modelStats = document.getElementById('modelStats');
    if (modelStats) {
      modelStats.innerHTML = `
        <div style="font-size:10px;color:var(--slate3);margin-bottom:6px">RANDOM FOREST REGRESSION</div>
        <div style="font-size:11px;color:var(--txt)">Train R² ${model.metrics?.r2?.toFixed(3) ?? 'N/A'}</div>
        <div style="font-size:11px;color:var(--txt)">Test R² ${model.metrics?.test_r2?.toFixed(3) ?? 'N/A'}</div>
        <div style="font-size:10px;color:var(--slate2);margin-top:6px">RMSE: ${model.metrics?.test_rmse?.toLocaleString() ?? 'N/A'} EGP/m²</div>
      `;
    }

    const compBody = document.getElementById('compBody');
    if (compBody) {
      const compRows = stats.byCompound ? Object.entries(stats.byCompound).slice(0, 6) : [];
      if (compRows.length) {
        const maxAvg = Math.max(...compRows.map(r => r[1].avg));
        compBody.innerHTML = compRows.map(([compound, info]) => {
          const isAbove = info.avg >= stats.avgPpm;
          const diff = info.avg - stats.avgPpm;
          const diffColor = isAbove ? 'var(--gold)' : 'var(--slate)';
          const diffSign = isAbove ? '+' : '';
          const barPct = Math.round((info.avg / maxAvg) * 100);
          
          return `
          <tr>
            <td style="font-weight:600">${compound}</td>
            <td class="mono">${info.avg.toLocaleString()}</td>
            <td>${info.count}</td>
            <td class="mono" style="color:${diffColor}; font-size:10px">${diffSign}${Math.round(diff).toLocaleString()}</td>
            <td style="width:120px; vertical-align:middle">
              <div class="prog" style="background:var(--bg3); height:4px">
                 <div class="prog-f" style="width:${barPct}%; background:${diffColor}"></div>
              </div>
            </td>
          </tr>
        `}).join('');
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
        },
        animation: {
          duration: 2000,
          easing: 'easeOutQuart'
        }
      }
    });

    const importance = model.metrics?.featureImportance || [];
    this.createChart('cDrivers', {
      type: 'bar',
      data: {
        labels: importance.map(f => f.name.replace('is_city_','City: ').replace('is_type_','Type: ').replace('is_compound_','').replace(/_/g,' ')),
        datasets: [{
          label: 'Relative Impact',
          data: importance.map(f => f.score),
          backgroundColor: importance.map((_,i) => `rgba(212, 174, 82, ${0.8 - i*0.065})`),
          borderRadius: 4,
          indexAxis: 'y',
        }]
      },
      options: {
        indexAxis: 'y',
        maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: {
          x: { display: false },
          y: { grid: { display: false }, ticks: { font: { size: 9 }, color: 'rgba(133,141,168,.8)' } }
        },
        animation: { duration: 1500, easing: 'easeOutExpo' }
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
      options: { 
        maintainAspectRatio: false, 
        plugins: { legend: { display: false } },
        animation: {
          duration: 1500,
          easing: 'easeOutBack'
        }
      }
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
      options: { 
        maintainAspectRatio: false, 
        plugins: { legend: { display: false } }, 
        scales: { x: { ticks: { maxRotation: 45, minRotation: 0 } } },
        animation: {
          duration: 1800,
          easing: 'easeOutCirc',
          delay: (context) => context.dataIndex * 100
        }
      }
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
      options: { 
        maintainAspectRatio: false, 
        plugins: { legend: { display: false } },
        animation: {
          duration: 2500,
          easing: 'easeOutQuint'
        }
      }
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
      options: { 
        maintainAspectRatio: false, 
        plugins: { legend: { display: false } },
        animation: {
          duration: 1200,
          easing: 'easeOutSine'
        }
      }
    });
  }

  static onActive() {
    // Called when page becomes active
  }
}
