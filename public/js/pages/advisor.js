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
      
      // Simulate network latency for the premium UX
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
      btn.disabled = false;
      btn.textContent = 'Assess Price';
    }
  }

  static displayResult(result) {
    const panel = document.getElementById('resultPanel');
    const v = result.verdict;
    const pred = result.predicted;
    const entered = result.entered;
    const market = result.market;

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
    `;
  }

  static onActive() {
    // Called when page becomes active
  }
}
