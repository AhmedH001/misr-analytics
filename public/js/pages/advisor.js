// Price Advisor Page
class PageAdvisor {
  static init(stats, model) {
    this.stats = stats;
    this.model = model;
    this.setupForm();
    this.updateModelBadge();
  }

  static setupForm() {
    const form = document.getElementById('advisorForm');
    const button = document.getElementById('advisorSubmitBtn');
    if (button) {
      button.addEventListener('click', (e) => this.handleSubmit(e));
    }
    if (form) {
      form.addEventListener('submit', (e) => this.handleSubmit(e));
    }
  }

  static updateModelBadge() {
    const badge = document.getElementById('modelMetaTxt');
    if (this.model && badge) {
      const m = this.model.metrics;
      badge.innerHTML = `
        <div style="font-family:'JetBrains Mono';line-height:1.4">
          <span style="color:var(--gold)">R²: ${(m.test_r2 || 0).toFixed(3)}</span><br/>
          <span>RMSE: ${Math.round(m.test_rmse || 0).toLocaleString()}</span><br/>
          <span style="opacity:0.6;font-size:8.5px">${m.nSamples?.toLocaleString()} samples (v4)</span>
        </div>
      `;
    }
  }

  static async handleSubmit(e) {
    e.preventDefault();
    const btn = document.getElementById('advisorSubmitBtn') || e.target.querySelector('button');
    if (btn) {
      btn.disabled = true;
      btn.textContent = 'Predicting…';
    }

    try {
      const resultPanel = document.getElementById('resultPanel');
      resultPanel.innerHTML = `
        <div class="card result-loading" style="padding:24px; border-color: transparent">
           <div class="skeleton" style="height: 120px; margin-bottom: 24px; border-radius: var(--r)"></div>
           <div class="skeleton" style="height: 10px; width: 50%; margin-bottom: 30px"></div>
           <div class="skeleton" style="height: 24px; margin-bottom: 12px"></div>
           <div class="skeleton" style="height: 24px; margin-bottom: 12px"></div>
           <div class="skeleton" style="height: 24px;"></div>
        </div>
      `;

      await new Promise(resolve => setTimeout(resolve, 600));

      const input = {
        area_m2: parseFloat(document.getElementById('f_area').value),
        bedrooms: parseInt(document.getElementById('f_beds').value, 10),
        bathrooms: parseInt(document.getElementById('f_baths').value, 10),
        property_type: document.getElementById('f_type').value,
        city: document.getElementById('f_city').value,
        distance_to_center: parseFloat(document.getElementById('f_dist').value),
        luxury_score: parseFloat(document.getElementById('f_luxury').value) / 100,
        usd_to_egp_rate: parseFloat(document.getElementById('f_usd').value),
        iron: parseFloat(document.getElementById('f_iron').value),
        cement: parseFloat(document.getElementById('f_cement').value),
        month: parseInt(document.getElementById('f_month').value, 10),
        delivery_months: parseInt(document.getElementById('f_delivery').value, 10),
        finishing: document.getElementById('f_finishing').value,
        entered_price: parseFloat(document.getElementById('f_price').value),
      };

      const result = await APIService.predict(input);
      this.displayResult(result);
    } catch (err) {
      const resultPanel = document.getElementById('resultPanel');
      resultPanel.innerHTML = `<div class="alert ae"><span>✕</span><span>${err.message}</span></div>`;
    } finally {
      if (btn) {
        btn.disabled = false;
        btn.textContent = 'Assess Price';
      }
    }
  }

  // ── ROI ENGINE ────────────────────────────────────────────────────
  static computeROI(enteredPrice, predictedTotal) {
    var statsData = this.stats || {};
    var monthly = statsData.monthly || {};
    var usdByMonth = statsData.usdByMonth || {};

    function parseKey(k) {
      var parts = k.split('-');
      return parseInt(parts[0], 10) + (parseInt(parts[1], 10) - 1) / 12;
    }

    var annualGrowthRate = 0.18;
    var mKeys = Object.keys(monthly).sort();
    var dataPoints = mKeys.map(function (k) { return { label: k, value: monthly[k] }; });

    if (mKeys.length >= 6) {
      var headLen = Math.min(3, mKeys.length);
      var tailLen = Math.min(3, mKeys.length);
      var headKeys = mKeys.slice(0, headLen);
      var tailKeys = mKeys.slice(-tailLen);
      var avgHead = headKeys.reduce(function (s, k) { return s + monthly[k]; }, 0) / headKeys.length;
      var avgTail = tailKeys.reduce(function (s, k) { return s + monthly[k]; }, 0) / tailKeys.length;
      var tHead = parseKey(headKeys[Math.floor(headKeys.length / 2)]);
      var tTail = parseKey(tailKeys[Math.floor(tailKeys.length / 2)]);
      var years = tTail - tHead;
      if (years > 0.3 && avgHead > 0) {
        var calc = Math.pow(avgTail / avgHead, 1 / years) - 1;
        annualGrowthRate = Math.max(0.05, Math.min(0.60, calc));
      }
    }

    var usdGrowthRate = 0;
    var uKeys = Object.keys(usdByMonth).sort();
    if (uKeys.length >= 4) {
      var uHead = (usdByMonth[uKeys[0]] + usdByMonth[uKeys[1]]) / 2;
      var uTail = (usdByMonth[uKeys[uKeys.length - 2]] + usdByMonth[uKeys[uKeys.length - 1]]) / 2;
      var uYears = parseKey(uKeys[uKeys.length - 1]) - parseKey(uKeys[0]);
      if (uYears > 0.3 && uHead > 0) {
        var uCalc = Math.pow(uTail / uHead, 1 / uYears) - 1;
        usdGrowthRate = Math.max(0, Math.min(0.50, uCalc));
      }
    }

    var horizons = [1, 3, 5, 10];
    var projections = horizons.map(function (yr) {
      var futureValue = enteredPrice * Math.pow(1 + annualGrowthRate, yr);
      var gain = futureValue - enteredPrice;
      var roiPct = (gain / enteredPrice) * 100;
      var realRoi = (Math.pow(1 + annualGrowthRate, yr) / Math.pow(1 + usdGrowthRate, yr) - 1) * 100;
      return {
        yr: yr,
        futureValue: Math.round(futureValue),
        gain: Math.round(gain),
        roiPct: Math.round(roiPct * 10) / 10,
        realRoi: Math.round(realRoi * 10) / 10,
      };
    });

    var entryDiscount = predictedTotal > 0 ? (predictedTotal - enteredPrice) / predictedTotal : 0;
    var entryBonus = Math.round(entryDiscount * 1000) / 10;
    var doubleYears = annualGrowthRate > 0
      ? Math.round((Math.log(2) / Math.log(1 + annualGrowthRate)) * 10) / 10
      : null;

    return {
      annualGrowthRate: annualGrowthRate,
      usdGrowthRate: usdGrowthRate,
      projections: projections,
      entryDiscount: entryDiscount,
      entryBonus: entryBonus,
      doubleYears: doubleYears,
      dataPoints: dataPoints,
    };
  }

  // ── ROI CARD ──────────────────────────────────────────────────────
  static renderROICard(roi) {
    var growthPct = (roi.annualGrowthRate * 100).toFixed(1);
    var usdPct = (roi.usdGrowthRate * 100).toFixed(1);

    function fmtNum(v) { return Math.round(v).toLocaleString(); }
    function fmtPct(v) { return (v > 0 ? '+' : '') + v.toFixed(1) + '%'; }
    function rowColour(pct) {
      return pct >= 100 ? '#22d16a' : pct >= 40 ? '#26bff8' : pct >= 15 ? '#f5a623' : '#9ba3c4';
    }

    var entryBadge, entryColour;
    if (roi.entryDiscount > 0.07) { entryBadge = '🎯 Great Entry'; entryColour = '#22d16a'; }
    else if (roi.entryDiscount > 0) { entryBadge = '✅ Fair Entry'; entryColour = '#26bff8'; }
    else if (roi.entryDiscount > -0.07) { entryBadge = '⚖️ Slight Premium'; entryColour = '#f5a623'; }
    else { entryBadge = '⚠️ Expensive Entry'; entryColour = '#ff4f4f'; }

    var tableRows = roi.projections.map(function (p) {
      var col = rowColour(p.roiPct);
      var realCol = p.realRoi > 0 ? '#22d16a' : '#ff4f4f';
      return '<tr>'
        + '<td style="font-family:\'JetBrains Mono\';font-weight:600;color:var(--txt2);padding:8px 6px">' + p.yr + ' yr' + (p.yr > 1 ? 's' : '') + '</td>'
        + '<td style="font-family:\'JetBrains Mono\';color:var(--txt);padding:8px 6px">' + fmtNum(p.futureValue) + ' EGP</td>'
        + '<td style="font-family:\'JetBrains Mono\';color:' + col + ';font-weight:700;padding:8px 6px">' + fmtPct(p.roiPct) + '</td>'
        + '<td style="font-family:\'JetBrains Mono\';color:' + col + ';padding:8px 6px">' + fmtNum(p.gain) + ' EGP</td>'
        + '<td style="font-family:\'JetBrains Mono\';font-size:10px;color:' + realCol + ';padding:8px 6px">' + fmtPct(p.realRoi) + ' USD</td>'
        + '</tr>';
    }).join('');

    var sparkSVG = '';
    var pts = roi.dataPoints.slice(-24);
    if (pts.length >= 2) {
      var vals = pts.map(function (p) { return p.value; });
      var mn = Math.min.apply(null, vals);
      var mx = Math.max.apply(null, vals);
      var range = mx - mn || 1;
      var W = 260, H = 44, pad = 4;
      var coords = pts.map(function (p, i) {
        var x = pad + (i / (pts.length - 1)) * (W - pad * 2);
        var y = H - pad - ((p.value - mn) / range) * (H - pad * 2);
        return x.toFixed(1) + ',' + y.toFixed(1);
      });
      var areaBase = pad + ',' + (H - pad) + ' ' + coords.join(' ') + ' ' + (W - pad) + ',' + (H - pad);
      var lastCoord = coords[coords.length - 1].split(',');
      sparkSVG = '<div style="margin-bottom:10px">'
        + '<div style="font-size:9px;color:var(--slate3);text-transform:uppercase;letter-spacing:1.2px;margin-bottom:2px">EGP/m² Dataset Trend</div>'
        + '<svg viewBox="0 0 ' + W + ' ' + H + '" xmlns="http://www.w3.org/2000/svg" style="width:100%;height:44px">'
        + '<defs><linearGradient id="spG" x1="0" y1="0" x2="0" y2="1">'
        + '<stop offset="0%" stop-color="#2650fa" stop-opacity="0.3"/>'
        + '<stop offset="100%" stop-color="#2650fa" stop-opacity="0.02"/>'
        + '</linearGradient></defs>'
        + '<polygon points="' + areaBase + '" fill="url(#spG)"/>'
        + '<polyline points="' + coords.join(' ') + '" fill="none" stroke="#26bff8" stroke-width="1.8" stroke-linejoin="round" stroke-linecap="round"/>'
        + '<circle cx="' + lastCoord[0] + '" cy="' + lastCoord[1] + '" r="3" fill="#26bff8"/>'
        + '</svg></div>';
    }

    var entryBgColour = roi.entryDiscount >= 0 ? '34,209,106' : '255,79,79';
    var fiveYrRealRoi = roi.projections[2].realRoi;
    var fiveYrCol = fiveYrRealRoi > 0 ? '#22d16a' : '#ff4f4f';
    var entryBonusCol = roi.entryBonus >= 0 ? '#22d16a' : '#ff4f4f';
    var entryBonusLabel = roi.entryBonus >= 0 ? 'Discount vs fair value' : 'Premium over fair value';
    var entryBonusStr = (roi.entryBonus >= 0 ? '+' : '') + roi.entryBonus.toFixed(1) + '%';

    var doubleBlock = '';
    if (roi.doubleYears) {
      doubleBlock = '<div style="flex:1;min-width:100px;background:var(--bg3);border-radius:8px;padding:10px 12px">'
        + '<div style="font-size:9px;color:var(--slate);text-transform:uppercase;letter-spacing:1px;margin-bottom:4px">Value Doubles</div>'
        + '<div style="font-size:20px;font-weight:800;color:var(--cyan);font-family:\'JetBrains Mono\'">' + roi.doubleYears + ' yrs</div>'
        + '<div style="font-size:9px;color:var(--slate3)">at ' + growthPct + '% CAGR</div>'
        + '</div>';
    }

    return '<div class="card" style="margin-top:0;border-color:rgba(38,80,250,.25);background:linear-gradient(135deg,rgba(38,80,250,.05) 0%,rgba(38,191,248,.03) 100%)">'

      // Header
      + '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:14px;gap:10px;flex-wrap:wrap">'
      + '<div style="display:flex;align-items:center;gap:10px">'
      + '<div style="width:32px;height:32px;border-radius:8px;background:rgba(38,80,250,.15);display:flex;align-items:center;justify-content:center;font-size:16px">📈</div>'
      + '<div>'
      + '<div style="font-size:12px;font-weight:700;color:var(--txt);letter-spacing:.3px">ROI Projection</div>'
      + '<div style="font-size:9px;color:var(--slate);margin-top:1px">Based on ' + roi.dataPoints.length + ' monthly data points from your dataset</div>'
      + '</div></div>'
      + '<div style="display:flex;gap:7px;flex-wrap:wrap">'
      + '<div style="background:rgba(38,80,250,.1);border:1px solid rgba(38,80,250,.25);border-radius:6px;padding:4px 10px;text-align:center">'
      + '<div style="font-size:8px;color:var(--slate);font-family:\'JetBrains Mono\'">CAGR</div>'
      + '<div style="font-size:13px;font-weight:700;color:var(--cyan);font-family:\'JetBrains Mono\'">' + growthPct + '%/yr</div>'
      + '</div>'
      + '<div style="background:rgba(255,79,79,.07);border:1px solid rgba(255,79,79,.2);border-radius:6px;padding:4px 10px;text-align:center">'
      + '<div style="font-size:8px;color:var(--slate);font-family:\'JetBrains Mono\'">EGP DEVAL</div>'
      + '<div style="font-size:13px;font-weight:700;color:#ff7b7b;font-family:\'JetBrains Mono\'">' + usdPct + '%/yr</div>'
      + '</div>'
      + '<div style="background:rgba(' + entryBgColour + ',.07);border:1px solid rgba(' + entryBgColour + ',.25);border-radius:6px;padding:4px 10px;display:flex;align-items:center">'
      + '<div style="font-size:10px;color:' + entryColour + ';font-weight:600">' + entryBadge + '</div>'
      + '</div></div></div>'

      // Sparkline
      + sparkSVG

      // Table
      + '<div style="overflow-x:auto">'
      + '<table style="width:100%;border-collapse:collapse;font-size:11px">'
      + '<thead><tr style="border-bottom:1px solid var(--br)">'
      + '<th style="text-align:left;padding:6px 8px;color:var(--slate3);font-size:9px;font-weight:600;letter-spacing:1px;text-transform:uppercase">Horizon</th>'
      + '<th style="text-align:left;padding:6px 8px;color:var(--slate3);font-size:9px;font-weight:600;letter-spacing:1px;text-transform:uppercase">Est. Value</th>'
      + '<th style="text-align:left;padding:6px 8px;color:var(--slate3);font-size:9px;font-weight:600;letter-spacing:1px;text-transform:uppercase">Nominal ROI</th>'
      + '<th style="text-align:left;padding:6px 8px;color:var(--slate3);font-size:9px;font-weight:600;letter-spacing:1px;text-transform:uppercase">Gain (EGP)</th>'
      + '<th style="text-align:left;padding:6px 8px;color:var(--slate3);font-size:9px;font-weight:600;letter-spacing:1px;text-transform:uppercase">Real ROI</th>'
      + '</tr></thead>'
      + '<tbody>' + tableRows + '</tbody>'
      + '</table></div>'

      // Summary tiles
      + '<div style="display:flex;gap:10px;flex-wrap:wrap;margin-top:14px;padding-top:12px;border-top:1px solid var(--br)">'
      + doubleBlock
      + '<div style="flex:1;min-width:100px;background:var(--bg3);border-radius:8px;padding:10px 12px">'
      + '<div style="font-size:9px;color:var(--slate);text-transform:uppercase;letter-spacing:1px;margin-bottom:4px">5-yr Real Gain</div>'
      + '<div style="font-size:20px;font-weight:800;font-family:\'JetBrains Mono\';color:' + fiveYrCol + '">' + fmtPct(fiveYrRealRoi) + '</div>'
      + '<div style="font-size:9px;color:var(--slate3)">vs USD purchasing power</div>'
      + '</div>'
      + '<div style="flex:1;min-width:100px;background:var(--bg3);border-radius:8px;padding:10px 12px">'
      + '<div style="font-size:9px;color:var(--slate);text-transform:uppercase;letter-spacing:1px;margin-bottom:4px">Entry Edge</div>'
      + '<div style="font-size:20px;font-weight:800;font-family:\'JetBrains Mono\';color:' + entryBonusCol + '">' + entryBonusStr + '</div>'
      + '<div style="font-size:9px;color:var(--slate3)">' + entryBonusLabel + '</div>'
      + '</div></div>'

      // Disclaimer
      + '<div style="margin-top:12px;padding:8px 10px;background:rgba(245,166,35,.06);border:1px solid rgba(245,166,35,.18);border-radius:6px;font-size:9px;color:var(--slate);line-height:1.6">'
      + '⚠ Projections use CAGR derived from your uploaded dataset\'s historical price trend. Past performance does not guarantee future results.'
      + '</div></div>';
  }

  // ── DISPLAY RESULT ────────────────────────────────────────────────
  static displayResult(result) {
    var panel = document.getElementById('resultPanel');
    var v = result.verdict;
    var pred = result.predicted;
    var entered = result.entered;
    var market = result.market;

    var roiHTML = '';
    try {
      var roi = this.computeROI(entered.total, pred.total);
      roiHTML = this.renderROICard(roi);
    } catch (err) {
      console.warn('ROI render error:', err);
    }

    panel.innerHTML = `
      <div class="vc ${v}" id="verdictCard">
        <div class="vc-top">
          <div>
            <div class="vc-label">Market Assessment</div>
            <div class="vc-verdict">${result.verdictEmoji}</div>
          </div>
          <div class="vc-right">
            <div class="vc-meta">Your Price</div>
            <div class="vc-val">${entered.ppm.toLocaleString()} EGP/m²</div>
            <div class="vc-meta" style="margin-top:8px;">Fair Price</div>
            <div class="vc-val">${pred.ppm.toLocaleString()} EGP/m²</div>
          </div>
        </div>
        <div style="border-bottom:1px solid rgba(255,255,255,.1);padding-bottom:14px">
          <div style="font-size:18px;margin-bottom:6px">${result.verdictLabel}</div>
          <div style="color:var(--slate);font-size:11px">Difference: <strong>${result.gap.ppm_egp > 0 ? '+' : ''}${result.gap.ppm_egp.toLocaleString()} EGP/m²</strong> (${result.gap.pct > 0 ? '+' : ''}${result.gap.pct.toFixed(1)}%)</div>
        </div>
        <div class="vc-metrics">
          <div class="vc-m">
            <div class="vc-mk">Predicted Total</div>
            <div class="vc-mv">${pred.total.toLocaleString()} EGP</div>
          </div>
          <div class="vc-m">
            <div class="vc-mk">CI (±90%)</div>
            <div class="vc-mv">${pred.ci_low.toLocaleString()} – ${pred.ci_high.toLocaleString()}</div>
          </div>
          <div class="vc-m">
            <div class="vc-mk">Market Percentile</div>
            <div class="vc-mv">${market.percentile}%</div>
          </div>
          <div class="vc-m">
            <div class="vc-mk">Comparables</div>
            <div class="vc-mv">${market.comparable_count?.toLocaleString() || 'N/A'}</div>
          </div>
        </div>
      </div>
      <div class="card">
        <div class="ch">
          <span class="ct">Market Context</span>
        </div>
        <div class="adj-row">
          <div class="adj-label">Overall Market Avg</div>
          <div class="adj-val">${market.overall_avg?.toLocaleString()} EGP/m²</div>
        </div>
        <div class="adj-row">
          <div class="adj-label">City Avg (${document.getElementById('f_city').value})</div>
          <div class="adj-val">${market.city_avg?.toLocaleString()} EGP/m²</div>
        </div>
        <div class="adj-row">
          <div class="adj-label">Type Avg (${document.getElementById('f_type').value})</div>
          <div class="adj-val">${market.type_avg?.toLocaleString()} EGP/m²</div>
        </div>
      </div>
    ` + roiHTML;
  }

  static onActive() {
    // Called when page becomes active
  }
}
