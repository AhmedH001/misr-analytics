// Rental Advisor & ROR Calculator Page
class PageRental {
  static init(stats) {
    this.stats = stats;
    this.setupForm();
    this.setupMortgageToggle();
  }

  static setupForm() {
    const btn = document.getElementById('rentalSubmitBtn');
    if (btn) btn.addEventListener('click', () => this.handleSubmit());
  }

  static setupMortgageToggle() {
    const chk = document.getElementById('r_use_mortgage');
    const box = document.getElementById('mortgageBox');
    if (chk && box) {
      chk.addEventListener('change', () => {
        box.style.display = chk.checked ? 'block' : 'none';
      });
    }
  }

  static async handleSubmit() {
    const btn = document.getElementById('rentalSubmitBtn');
    btn.disabled = true;
    btn.innerHTML = '<span class="spin"></span>Calculating…';

    try {
      const mortgageChk = document.getElementById('r_use_mortgage');
      const useMortgage = mortgageChk && mortgageChk.checked;

      const input = {
        area_m2:           parseFloat(document.getElementById('r_area').value),
        purchase_price:    parseFloat(document.getElementById('r_purchase').value),
        monthly_rent:      parseFloat(document.getElementById('r_rent').value),
        city:              document.getElementById('r_city').value,
        property_type:     document.getElementById('r_type').value,
        furnished:         document.getElementById('r_furnished').value,
        management_fees_pct: parseFloat(document.getElementById('r_mgmt').value) || 10,
        maintenance_pct:   parseFloat(document.getElementById('r_maint').value) || 1,
        vacancy_pct:       parseFloat(document.getElementById('r_vacancy').value) || 8,
        down_payment_pct:  useMortgage ? parseFloat(document.getElementById('r_dp').value) || 30 : 100,
        mortgage_rate_pct: useMortgage ? parseFloat(document.getElementById('r_mrate').value) || 0 : 0,
        loan_term_years:   useMortgage ? parseFloat(document.getElementById('r_term').value) || 20 : 0,
      };

      const result = await APIService.rentalPredict(input);
      this.displayResult(result, input);
    } catch (err) {
      document.getElementById('rentalResultPanel').innerHTML =
        `<div class="alert ae"><span>✕</span><span>${err.message}</span></div>`;
    } finally {
      btn.disabled = false;
      btn.innerHTML = '◈ &nbsp;Calculate ROR';
    }
  }

  static displayResult(r, input) {
    const panel = document.getElementById('rentalResultPanel');
    const rorColor = r.ror_score >= 75 ? 'var(--grn)' : r.ror_score >= 55 ? 'var(--gold)' : r.ror_score >= 35 ? 'var(--amb)' : 'var(--red)';

    // Gauge arc %
    const gaugePct = r.ror_score;

    panel.innerHTML = `
      <!-- ROR Score Card -->
      <div class="card" style="background:var(--bg2);border-color:var(--br);margin-bottom:13px">
        <div style="text-align:center;padding:18px 0 8px">
          <div style="font-size:9px;letter-spacing:2.5px;text-transform:uppercase;color:var(--slate3);margin-bottom:10px">Return on Rent Score</div>
          <!-- Circular gauge -->
          <div style="position:relative;display:inline-block;width:130px;height:130px;margin-bottom:10px">
            <svg viewBox="0 0 36 36" style="width:130px;height:130px;transform:rotate(-90deg)">
              <circle cx="18" cy="18" r="15.9" fill="none" stroke="var(--br)" stroke-width="2.5"/>
              <circle cx="18" cy="18" r="15.9" fill="none" stroke="${rorColor}" stroke-width="2.5"
                stroke-dasharray="${(gaugePct * 100 / 100).toFixed(1)} 100"
                stroke-linecap="round"
                style="transition:stroke-dasharray .8s ease"/>
            </svg>
            <div style="position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;transform:rotate(0)">
              <div style="font-size:11px;color:var(--slate3)">Score</div>
              <div style="font-family:'Cormorant Garamond';font-size:36px;color:${rorColor};line-height:1;font-weight:700">${gaugePct}</div>
              <div style="font-size:9px;color:var(--slate3)">/100</div>
            </div>
          </div>
          <div style="font-size:22px;margin-bottom:4px">${r.ror_emoji}</div>
          <div style="font-family:'Cormorant Garamond';font-size:20px;color:var(--txt)">${r.ror_label}</div>
        </div>

        <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:10px;padding-top:14px;border-top:1px solid var(--br)">
          <div style="text-align:center">
            <div style="font-size:8px;letter-spacing:1.5px;text-transform:uppercase;color:var(--slate3);margin-bottom:4px">Gross Yield</div>
            <div style="font-family:'Cormorant Garamond';font-size:22px;color:var(--gold)">${r.gross_yield.toFixed(2)}%</div>
          </div>
          <div style="text-align:center;border-left:1px solid var(--br);border-right:1px solid var(--br)">
            <div style="font-size:8px;letter-spacing:1.5px;text-transform:uppercase;color:var(--slate3);margin-bottom:4px">Net Yield</div>
            <div style="font-family:'Cormorant Garamond';font-size:22px;color:var(--grn)">${r.net_yield.toFixed(2)}%</div>
          </div>
          <div style="text-align:center">
            <div style="font-size:8px;letter-spacing:1.5px;text-transform:uppercase;color:var(--slate3);margin-bottom:4px">Cash-on-Cash</div>
            <div style="font-family:'Cormorant Garamond';font-size:22px;color:var(--blu)">${r.cash_on_cash.toFixed(2)}%</div>
          </div>
        </div>
      </div>

      <!-- Cashflow Breakdown -->
      <div class="card" style="margin-bottom:13px">
        <div class="ch"><div class="ct">Annual Cashflow Breakdown</div></div>
        ${this.waterfall(r.annual)}
      </div>

      <!-- Market & Payback -->
      <div class="card">
        <div class="ch"><div class="ct">Market Context & Key Metrics</div></div>
        <div class="adj-row">
          <div class="adj-label">Market Rent Estimate</div>
          <div class="adj-val tg">${r.market.market_rent_estimate.toLocaleString()} EGP/mo</div>
        </div>
        <div class="adj-row">
          <div class="adj-label">Your Rent vs Market</div>
          <div class="adj-val" style="color:${r.market.rent_vs_market_pct >= 100 ? 'var(--grn)' : 'var(--amb)'}">${r.market.rent_vs_market_pct}%</div>
        </div>
        <div class="adj-row">
          <div class="adj-label">Break-even Monthly Rent</div>
          <div class="adj-val mono">${r.break_even_rent.toLocaleString()} EGP</div>
        </div>
        <div class="adj-row" style="border-bottom:none">
          <div class="adj-label">Payback Period</div>
          <div class="adj-val" style="color:var(--txt)">${r.payback_years ? r.payback_years + ' years' : 'N/A'}</div>
        </div>
      </div>
    `;
  }

  static waterfall(ann) {
    const items = [
      { label: 'Gross Annual Rent',    val: ann.gross_rent,      color: 'var(--grn)',  sign: '+' },
      { label: 'Vacancy Deduction',    val: -( ann.gross_rent - ann.effective_rent), color: 'var(--red)', sign: '-' },
      { label: 'Management Fees',      val: -ann.management_fees, color: 'var(--red)', sign: '-' },
      { label: 'Maintenance Cost',     val: -ann.maintenance,     color: 'var(--red)', sign: '-' },
      { label: 'Mortgage Payments',    val: -ann.mortgage,        color: 'var(--red)', sign: '-', skip: !ann.mortgage },
      { label: 'Net Annual Rent',      val: ann.net_rent,         color: 'var(--gold)', sign: '=' },
    ].filter(i => !i.skip);

    const max = Math.max(...items.map(i => Math.abs(i.val)));
    return items.map(i => {
      const pct = max ? Math.round(Math.abs(i.val) / max * 100) : 0;
      return `<div class="cmp-bar-wrap">
        <div class="cmp-label">
          <span style="color:var(--txt2)">${i.label}</span>
          <span style="font-family:'JetBrains Mono';font-size:10.5px;color:${i.color}">${i.sign === '+' || i.sign === '=' ? '' : '-'}${Math.abs(i.val).toLocaleString()} EGP</span>
        </div>
        <div class="cmp-bar">
          <div class="cmp-fill" style="width:${pct}%;background:${i.color};opacity:.85;color:#000">${pct > 25 ? Math.abs(i.val).toLocaleString() : ''}</div>
        </div>
      </div>`;
    }).join('');
  }

  static onActive() {}
}
