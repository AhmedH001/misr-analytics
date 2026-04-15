// ─── Rental Advisor & ROR Calculator ───────────────────────────────────────
class PageRental {

  static init(stats, model) {
    this.stats = stats;
    this.model = model;
    this.setupForm();
    this.setupMortgageToggle();
    this.setupTypeChange();
  }

  // ── Setup ─────────────────────────────────────────────────────────────────

  static setupForm() {
    document.getElementById('rentalSubmitBtn')
      ?.addEventListener('click', () => this.handleSubmit());
  }

  static setupMortgageToggle() {
    const chk = document.getElementById('r_use_mortgage');
    const box = document.getElementById('mortgageBox');
    if (chk && box)
      chk.addEventListener('change', () => {
        box.style.display = chk.checked ? 'block' : 'none';
      });
  }

  static setupTypeChange() {
    document.getElementById('r_type')
      ?.addEventListener('change', e => this.onTypeChange(e.target.value));
  }

  static onTypeChange(type) {
    const commercial = ['Office', 'Shop', 'Retail', 'Clinic', 'Showroom', 'Warehouse'];
    const isComm = commercial.includes(type);
    const row = document.getElementById('r_bedsbaths_row');
    if (row) row.style.display = isComm ? 'none' : 'grid';
  }

  // ── Main submit handler ───────────────────────────────────────────────────

  static async handleSubmit() {
    const btn = document.getElementById('rentalSubmitBtn');
    btn.disabled = true;
    btn.innerHTML = '<span class="spin"></span>Analysing…';

    try {
      const panel = document.getElementById('rentalResultPanel');
      panel.innerHTML = `
        <div class="card result-loading" style="padding:24px;border-color:transparent">
          <div class="skeleton" style="height:150px;width:150px;border-radius:50%;margin:0 auto 24px"></div>
          <div class="skeleton" style="height:18px;width:40%;margin:0 auto 30px"></div>
          <div class="skeleton" style="height:80px;margin-bottom:12px;border-radius:var(--r)"></div>
          <div class="skeleton" style="height:140px;border-radius:var(--r)"></div>
        </div>`;

      await new Promise(r => setTimeout(r, 350));

      const input = this.collectInput();
      const settings = AppSettings.get();

      if (settings.modelMode === 'llm' && settings.groqApiKey) {
        await this.handleLLM(input, settings);
      } else {
        await this.handleRF(input);
      }
    } catch (err) {
      document.getElementById('rentalResultPanel').innerHTML =
        `<div class="alert ae"><span>✕</span><span>${err.message}</span></div>`;
    } finally {
      btn.disabled = false;
      btn.innerHTML = '◈ &nbsp;Calculate ROR';
    }
  }

  // ── Collect all form values ───────────────────────────────────────────────

  static collectInput() {
    const useMortgage = document.getElementById('r_use_mortgage')?.checked;
    const amenities = [...document.querySelectorAll('.r_amenity:checked')].map(c => c.value);

    return {
      // Core
      area_m2: parseFloat(document.getElementById('r_area').value) || 0,
      purchase_price: parseFloat(document.getElementById('r_purchase').value) || 0,
      monthly_rent: parseFloat(document.getElementById('r_rent').value) || 0,
      // Property identity
      property_type: document.getElementById('r_type').value,
      city: document.getElementById('r_city').value,
      district: document.getElementById('r_district')?.value?.trim() || '',
      bedrooms: parseInt(document.getElementById('r_beds')?.value) || 0,
      bathrooms: parseInt(document.getElementById('r_baths_r')?.value) || 0,
      floor: document.getElementById('r_floor')?.value || 'N/A',
      building_age: document.getElementById('r_building_age')?.value || 'Unknown',
      condition: document.getElementById('r_condition')?.value || 'Good',
      furnished: document.getElementById('r_furnished').value,
      view: document.getElementById('r_view')?.value || 'Street',
      parking: document.getElementById('r_parking')?.value || 'No',
      amenities,
      // Operating costs
      management_fees_pct: parseFloat(document.getElementById('r_mgmt').value) || 10,
      maintenance_pct: parseFloat(document.getElementById('r_maint').value) || 1,
      vacancy_pct: parseFloat(document.getElementById('r_vacancy').value) || 8,
      // Mortgage
      down_payment_pct: useMortgage ? parseFloat(document.getElementById('r_dp').value) || 30 : 100,
      mortgage_rate_pct: useMortgage ? parseFloat(document.getElementById('r_mrate').value) || 0 : 0,
      loan_term_years: useMortgage ? parseFloat(document.getElementById('r_term').value) || 20 : 0,
    };
  }

  // ── RF mode: delegate to backend ─────────────────────────────────────────

  static async handleRF(input) {
    const result = await APIService.rentalPredict(input);
    this.displayResult(result, input, false);
  }

  // ── LLM mode: smart routing based on available data ───────────────────────
  //
  //  Case A — No purchase price:  pure AI rent estimation (no yield maths)
  //  Case B — Purchase price + no rent: AI estimates rent → full analysis
  //  Case C — Both provided:  full financial analysis + AI intelligence

  static async handleLLM(input, settings) {
    const hasPurchasePrice = input.purchase_price > 0;
    const hasMonthlyRent = input.monthly_rent > 0;

    if (!hasPurchasePrice) {
      // ── Case A: estimate fair rent only ──────────────────────────────────
      const ai = await this.callGroq(input, null, settings, 'estimate_rent');
      this.displayRentEstimate(ai, input, settings);
      return;
    }

    if (!hasMonthlyRent) {
      // ── Case B: derive rent from AI, then compute financials ──────────────
      const aiPre = await this.callGroq(input, null, settings, 'estimate_rent');
      // Inject AI-estimated rent into input for financial calculations
      input.monthly_rent = aiPre.market_rent_estimate || 0;
      if (input.monthly_rent === 0) {
        this.displayRentEstimate(aiPre, input, settings);
        return;
      }
    }

    // ── Case C: full analysis ────────────────────────────────────────────
    const fin = this.calcFinancials(input);
    const ai = await this.callGroq(input, fin, settings, 'full');
    const result = {
      ...fin,
      market: {
        market_rent_estimate: ai.market_rent_estimate || Math.round(input.monthly_rent * 1.05),
        rent_vs_market_pct: ai.rent_vs_market_pct || 95,
      },
      ai,
      isLLM: true,
    };
    this.displayResult(result, input, true);
  }

  // ── Pure-math financial calculations ─────────────────────────────────────

  static calcFinancials(inp) {
    const purchase = inp.purchase_price || 0;
    const gross_rent = inp.monthly_rent * 12;
    const vacLoss = gross_rent * (inp.vacancy_pct / 100);
    const effective_rent = gross_rent - vacLoss;
    const management_fees = effective_rent * (inp.management_fees_pct / 100);
    const maintenance = purchase * (inp.maintenance_pct / 100);

    let mortgage = 0;
    let equity = purchase;
    if (inp.down_payment_pct < 100 && inp.mortgage_rate_pct > 0 && purchase > 0) {
      equity = purchase * (inp.down_payment_pct / 100);
      const loan = purchase - equity;
      const r = (inp.mortgage_rate_pct / 100) / 12;
      const n = inp.loan_term_years * 12;
      const pmt = loan * (r * Math.pow(1 + r, n)) / (Math.pow(1 + r, n) - 1);
      mortgage = pmt * 12;
    }

    const net_rent = effective_rent - management_fees - maintenance - mortgage;
    const gross_yield = purchase > 0 ? (gross_rent / purchase) * 100 : 0;
    const net_yield = purchase > 0 ? (net_rent / purchase) * 100 : 0;
    const coc = equity > 0 ? (net_rent / equity) * 100 : 0;
    const payback = (net_rent > 0 && purchase > 0) ? Math.round(purchase / net_rent) : null;

    const beMonthly = management_fees + maintenance + mortgage;
    const break_even_rent = Math.round(
      beMonthly / (12 * (1 - inp.vacancy_pct / 100 - inp.management_fees_pct / 100) || 1)
    );

    // ── Score (0–100)
    let score = 0;
    score += gross_yield >= 10 ? 28 : gross_yield >= 7 ? 20 : gross_yield >= 5 ? 12 : 4;
    score += net_yield >= 7 ? 28 : net_yield >= 5 ? 20 : net_yield >= 3 ? 12 : 4;
    score += coc >= 10 ? 24 : coc >= 7 ? 17 : coc >= 5 ? 10 : 3;
    score += !payback ? 0 : payback <= 10 ? 20 : payback <= 15 ? 13 : payback <= 20 ? 7 : 2;
    score = Math.min(100, Math.round(score));

    let ror_label, ror_emoji;
    if (score >= 75) { ror_label = 'Excellent Investment'; ror_emoji = '🏆'; }
    else if (score >= 55) { ror_label = 'Good Investment'; ror_emoji = '💰'; }
    else if (score >= 35) { ror_label = 'Average Return'; ror_emoji = '📊'; }
    else { ror_label = 'Low Return'; ror_emoji = '⚠️'; }

    return {
      gross_yield, net_yield, cash_on_cash: coc,
      payback_years: payback, break_even_rent, ror_score: score, ror_label, ror_emoji,
      annual: {
        gross_rent: Math.round(gross_rent),
        effective_rent: Math.round(effective_rent),
        management_fees: Math.round(management_fees),
        maintenance: Math.round(maintenance),
        mortgage: Math.round(mortgage),
        net_rent: Math.round(net_rent),
      },
      market: {
        market_rent_estimate: Math.round(inp.monthly_rent * 1.05),
        rent_vs_market_pct: 95,
      },
    };
  }

  // ── Groq API call ─────────────────────────────────────────────────────────
  //  mode: 'estimate_rent' | 'full'

  static async callGroq(inp, fin, settings, mode) {
    const isCommercial = ['Office', 'Shop', 'Retail', 'Clinic', 'Showroom', 'Warehouse']
      .includes(inp.property_type);

    const locationLine = [inp.district, inp.city].filter(Boolean).join(', ');
    const bedsLine = isCommercial ? '' : `- Bedrooms / Bathrooms: ${inp.bedrooms} bed / ${inp.bathrooms} bath`;
    const amenitiesLine = inp.amenities.length ? inp.amenities.join(', ') : 'None specified';

    // ── Cairo district rent-level context injected into every prompt ─────
    const cairoContext = `IMPORTANT CAIRO RENT GEOGRAPHY (use this for your estimates):
Districts by rental tier (rough monthly EGP ranges for a 100 m² 2-bed apartment, 2025 rates):
• Ultra-premium (80k–200k+/mo): Zamalek, Garden City, Maadi Sarayat/Degla, Katameya Heights
• Premium (50k–90k/mo): Maadi (all), Heliopolis/Korba, New Cairo (5th Settlement prime), Rehab City, Madinaty
• Upper-middle (30k–55k/mo): Nasr City, Dokki, Mohandessin, Agouza, Shorouk, October City (upscale compounds)
• Middle (18k–35k/mo): Ain Shams, Abbasiya, Hadayek el-Kobba, El-Tagammu el-Khames (outskirts), New October
• Budget (8k–18k/mo): Helwan, El-Basatin, Mostorod, Salam City, Obour City (standard), El-Marg
• Very budget (<8k/mo): Shoubra, Imbaba (non-compound), Ezbet el-Haggana, peripheral areas
Scale ALL estimates for the actual area size, bedroom count, condition, and furnished status.
Furnished adds typically 30-60% premium over unfurnished.`;

    const propertyBlock = `PROPERTY:
- Type: ${inp.property_type}
- Location: ${locationLine}
- Area: ${inp.area_m2} m²
${bedsLine}
- Floor: ${inp.floor}
- Building Age: ${inp.building_age}
- Condition: ${inp.condition}
- Furnished: ${inp.furnished}
- View: ${inp.view}
- Parking: ${inp.parking}
- Amenities: ${amenitiesLine}`;

    let financialsBlock = '';
    if (inp.purchase_price > 0) {
      financialsBlock = `\nFINANCIALS:
- Purchase Price: ${inp.purchase_price.toLocaleString()} EGP
- Monthly Rent Asked: ${inp.monthly_rent > 0 ? inp.monthly_rent.toLocaleString() + ' EGP' : 'Not specified — estimate fair rent'}`;
      if (fin) {
        financialsBlock += `
- Gross Yield: ${fin.gross_yield.toFixed(2)}%
- Net Yield: ${fin.net_yield.toFixed(2)}%
- ROR Score: ${fin.ror_score}/100`;
      }
    }

    let jsonSchema;

    if (mode === 'estimate_rent') {
      jsonSchema = `{
  "market_rent_estimate": <integer, fair monthly rent in EGP — be precise for this exact location, size, and furnished status>,
  "market_rent_low": <integer, lower bound EGP/month>,
  "market_rent_high": <integer, upper bound EGP/month>,
  "rent_vs_market_pct": ${inp.monthly_rent > 0 ? '<integer, user rent as % of your estimate, e.g. 92>' : '100'},
  "demand_level": "<High|Medium|Low>",
  "demand_explanation": "<2-3 sentences about current rental demand for this property type in this specific location>",
  "location_tier": "<Ultra-premium|Premium|Upper-middle|Middle|Budget|Very budget>",
  "location_analysis": "<2-3 sentences explaining rent levels in this district vs comparable areas>",
  "furnished_impact": "<how furnishing status specifically affects rent for this property and location>",
  "investment_narrative": "<3-4 sentences holistic rental market summary for this area>",
  "key_rent_drivers": ["<main factor driving rent up or down>", "<factor 2>", "<factor 3>"],
  "key_opportunities": ["<opportunity 1>", "<opportunity 2>"],
  "key_risks": ["<risk 1>", "<risk 2>"],
  "recommendations": ["<actionable tip 1>", "<actionable tip 2>"],
  "liquidity_rating": "<High|Medium|Low>",
  "best_tenant_profile": "<1-2 sentences describing ideal tenant for this property>",
  "expected_appreciation": "<Low|Moderate|High> — <one sentence reason>"
}`;
    } else {
      // full mode
      jsonSchema = `{
  "market_rent_estimate": <integer, fair monthly rent in EGP>,
  "market_rent_low": <integer, lower bound EGP/month>,
  "market_rent_high": <integer, upper bound EGP/month>,
  "rent_vs_market_pct": <integer, user rent as % of your estimate>,
  "demand_level": "<High|Medium|Low>",
  "demand_explanation": "<2-3 sentences about rental demand in this specific location>",
  "location_analysis": "<3-4 sentences macro/local market context for this city/district>",
  "investment_narrative": "<4-5 sentences holistic investment summary and outlook>",
  "key_opportunities": ["<opportunity 1>", "<opportunity 2>", "<opportunity 3>"],
  "key_risks": ["<risk 1>", "<risk 2>", "<risk 3>"],
  "recommendations": ["<actionable tip 1>", "<actionable tip 2>", "<actionable tip 3>"],
  "liquidity_rating": "<High|Medium|Low>",
  "best_tenant_profile": "<1-2 sentences describing ideal tenant>",
  "expected_appreciation": "<Low|Moderate|High> — <one sentence reason>"
}`;
    }

    const prompt = `You are a senior Egyptian real estate investment analyst specialising in the local rental market. You have deep expertise in Cairo's district-level rent differentials — you know that Helwan rents for a fraction of Maadi, that furnished flats in Zamalek command a major premium, that New Cairo compounds attract a very different tenant profile from Ain Shams, and so on. Use the geography table below to ground your estimates.

${cairoContext}

${propertyBlock}
${financialsBlock}

${mode === 'estimate_rent'
        ? 'TASK: Estimate the fair monthly market rent for this property. Be specific to this exact district, condition, size, and furnishing status. Do NOT give a generic citywide average.'
        : 'TASK: Analyse the investment potential of this rental property.'}

Respond ONLY with a valid JSON object — no markdown, no backticks, no extra text:
${jsonSchema}`;

    const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${settings.groqApiKey}`,
      },
      body: JSON.stringify({
        model: settings.groqModel || 'llama-3.3-70b-versatile',
        messages: [{ role: 'user', content: prompt }],
        max_tokens: 1600,
        temperature: 0.15,
      }),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err?.error?.message || `Groq error ${res.status}`);
    }

    const data = await res.json();
    const text = data.choices?.[0]?.message?.content || '';
    const clean = text.replace(/```json|```/g, '').trim();
    try {
      return JSON.parse(clean);
    } catch {
      throw new Error('AI returned an unreadable response — please try again.');
    }
  }

  // ── Display: rent-estimate-only (no purchase price) ───────────────────────

  static displayRentEstimate(ai, input, settings) {
    const panel = document.getElementById('rentalResultPanel');
    const modelShort = (settings.groqModel || '').split('-').slice(0, 3).join(' ') || 'Groq AI';
    const fmt = v => Math.round(v).toLocaleString();

    const demColor = ai.demand_level === 'High' ? 'var(--grn)' : ai.demand_level === 'Low' ? 'var(--red)' : 'var(--amb)';
    const liqColor = ai.liquidity_rating === 'High' ? 'var(--grn)' : ai.liquidity_rating === 'Low' ? 'var(--red)' : 'var(--amb)';

    const tierBgMap = {
      'Ultra-premium': 'rgba(212,174,82,.1)',
      'Premium': 'rgba(38,191,248,.08)',
      'Upper-middle': 'rgba(38,80,250,.08)',
      'Middle': 'rgba(155,163,196,.08)',
      'Budget': 'rgba(245,166,35,.08)',
      'Very budget': 'rgba(192,90,74,.08)',
    };
    const tierColorMap = {
      'Ultra-premium': 'var(--gold)',
      'Premium': 'var(--cyan)',
      'Upper-middle': 'var(--blue)',
      'Middle': 'var(--slate)',
      'Budget': 'var(--amb)',
      'Very budget': 'var(--red)',
    };
    const tierBg = tierBgMap[ai.location_tier] || 'var(--bg3)';
    const tierColor = tierColorMap[ai.location_tier] || 'var(--txt)';

    // rent vs market indicator
    let rentVsLabel = '', rentVsColor = 'var(--gold)';
    if (input.monthly_rent > 0) {
      const pct = ai.rent_vs_market_pct || 100;
      if (pct < 80) { rentVsLabel = 'Below Market'; rentVsColor = 'var(--grn)'; }
      else if (pct < 95) { rentVsLabel = 'Slightly Low'; rentVsColor = 'var(--cyan)'; }
      else if (pct <= 110) { rentVsLabel = 'Market Rate'; rentVsColor = 'var(--gold)'; }
      else if (pct <= 130) { rentVsLabel = 'Above Market'; rentVsColor = 'var(--amb)'; }
      else { rentVsLabel = 'Overpriced'; rentVsColor = 'var(--red)'; }
    }

    panel.innerHTML = `
      <!-- Fair Rent Card -->
      <div class="card" style="margin-bottom:13px;border-color:rgba(38,191,248,.25);background:linear-gradient(135deg,rgba(38,191,248,.05) 0%,rgba(38,80,250,.03) 100%)">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:16px;flex-wrap:wrap;gap:8px">
          <div style="display:flex;align-items:center;gap:10px">
            <div style="width:36px;height:36px;border-radius:10px;background:rgba(38,191,248,.15);display:flex;align-items:center;justify-content:center;font-size:18px">🏠</div>
            <div>
              <div style="font-size:9px;letter-spacing:2px;text-transform:uppercase;color:var(--slate3)">AI Fair Rent Estimate</div>
              <div style="font-size:14px;font-weight:700;color:var(--txt);margin-top:2px">${[input.district, input.city].filter(Boolean).join(', ')} · ${input.area_m2} m²</div>
            </div>
          </div>
          <span style="font-size:8px;padding:2px 9px;border-radius:20px;background:rgba(38,80,250,.12);border:1px solid rgba(38,80,250,.3);color:var(--blue);font-weight:600">⚡ ${modelShort}</span>
        </div>

        <!-- Central rent estimate -->
        <div style="text-align:center;padding:20px;background:var(--bg3);border-radius:10px;margin-bottom:12px">
          <div style="font-size:9px;letter-spacing:2px;text-transform:uppercase;color:var(--slate3);margin-bottom:6px">Fair Monthly Rent</div>
          <div style="font-size:38px;font-weight:800;color:var(--cyan);font-family:'JetBrains Mono';line-height:1">${fmt(ai.market_rent_estimate)}</div>
          <div style="font-size:13px;color:var(--slate3);margin-top:4px">EGP / month</div>
          <div style="font-size:11px;color:var(--slate);margin-top:8px;font-family:'JetBrains Mono'">${fmt(ai.market_rent_low)} – ${fmt(ai.market_rent_high)} EGP range</div>
          ${ai.location_tier ? `<div style="display:inline-block;margin-top:10px;padding:3px 12px;border-radius:20px;font-size:9px;font-weight:600;background:${tierBg};color:${tierColor}">${ai.location_tier} District</div>` : ''}
        </div>

        <!-- User rent vs market -->
        ${input.monthly_rent > 0 ? `
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:12px">
          <div style="background:var(--bg3);border-radius:8px;padding:10px 12px;text-align:center">
            <div style="font-size:8px;letter-spacing:1.5px;text-transform:uppercase;color:var(--slate3);margin-bottom:4px">Your Rent</div>
            <div style="font-size:18px;font-weight:700;color:var(--txt);font-family:'JetBrains Mono'">${fmt(input.monthly_rent)}</div>
            <div style="font-size:8px;color:var(--slate3)">EGP/month</div>
          </div>
          <div style="background:var(--bg3);border-radius:8px;padding:10px 12px;text-align:center">
            <div style="font-size:8px;letter-spacing:1.5px;text-transform:uppercase;color:var(--slate3);margin-bottom:4px">vs Market</div>
            <div style="font-size:18px;font-weight:700;color:${rentVsColor};font-family:'JetBrains Mono'">${ai.rent_vs_market_pct}%</div>
            <div style="font-size:8px;color:${rentVsColor}">${rentVsLabel}</div>
          </div>
        </div>` : ''}

        <!-- Furnished impact -->
        ${ai.furnished_impact ? `
        <div style="padding:10px 12px;background:rgba(245,166,35,.06);border:1px solid rgba(245,166,35,.18);border-radius:8px;margin-bottom:12px">
          <div style="font-size:8px;letter-spacing:1px;text-transform:uppercase;color:var(--amb);margin-bottom:4px;font-weight:600">🛋️ Furnishing Impact</div>
          <div style="font-size:10.5px;color:var(--txt2);line-height:1.5">${ai.furnished_impact}</div>
        </div>` : ''}
      </div>

      <!-- AI Market Intelligence -->
      <div class="card" style="margin-bottom:13px;border-color:rgba(38,80,250,.22);background:linear-gradient(135deg,rgba(38,80,250,.04),rgba(38,191,248,.02))">
        <div class="ch">
          <div class="ct">⚡ AI Market Intelligence</div>
          <span style="font-size:8px;padding:2px 9px;border-radius:20px;background:rgba(38,80,250,.12);border:1px solid rgba(38,80,250,.3);color:var(--blue);font-weight:600">${modelShort}</span>
        </div>

        <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:13px">
          <div style="background:var(--bg3);border-radius:var(--r2);padding:12px">
            <div style="font-size:8px;letter-spacing:1.5px;text-transform:uppercase;color:var(--slate3);margin-bottom:4px">Rental Demand</div>
            <div style="font-size:17px;font-weight:700;color:${demColor};margin-bottom:5px">${ai.demand_level || '—'}</div>
            <div style="font-size:10px;color:var(--txt2);line-height:1.5">${ai.demand_explanation || ''}</div>
          </div>
          <div style="background:var(--bg3);border-radius:var(--r2);padding:12px">
            <div style="font-size:8px;letter-spacing:1.5px;text-transform:uppercase;color:var(--slate3);margin-bottom:4px">Liquidity</div>
            <div style="font-size:17px;font-weight:700;color:${liqColor};margin-bottom:5px">${ai.liquidity_rating || '—'}</div>
            <div style="font-size:10px;color:var(--txt2);line-height:1.5">${ai.best_tenant_profile || ''}</div>
          </div>
        </div>

        <div style="font-size:11px;color:var(--txt2);line-height:1.65;padding:12px;background:var(--bg3);border-radius:var(--r2);margin-bottom:10px">
          ${ai.investment_narrative || ''}
        </div>

        <div style="font-size:10.5px;color:var(--slate);line-height:1.6;margin-bottom:10px">
          ${ai.location_analysis || ''}
        </div>

        ${(ai.key_rent_drivers || []).length ? `
        <div style="font-size:8px;letter-spacing:1.5px;text-transform:uppercase;color:var(--slate3);margin-bottom:8px;font-weight:600">Key Rent Drivers</div>
        ${(ai.key_rent_drivers || []).map(d =>
      `<div style="font-size:10.5px;color:var(--txt2);padding:6px 0;border-bottom:1px solid var(--br);display:flex;gap:7px;line-height:1.45"><span style="color:var(--gold);flex-shrink:0">→</span>${d}</div>`
    ).join('')}` : ''}

        <div style="font-size:9px;color:var(--slate3);margin-top:10px">Capital Appreciation Outlook:
          <span style="color:var(--txt2);font-weight:600">${ai.expected_appreciation || '—'}</span>
        </div>
      </div>

      <!-- Opportunities, Risks & Recommendations -->
      <div class="card">
        <div class="ch"><div class="ct">Opportunities &amp; Risks</div></div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:14px;margin-bottom:${(ai.recommendations?.length) ? '14px' : '0'}">
          <div>
            <div style="font-size:8px;letter-spacing:1.5px;text-transform:uppercase;color:var(--grn);margin-bottom:8px;font-weight:600">✓ Opportunities</div>
            ${(ai.key_opportunities || []).map(o =>
      `<div style="font-size:10.5px;color:var(--txt2);padding:6px 0;border-bottom:1px solid var(--br);display:flex;gap:7px;line-height:1.45"><span style="color:var(--grn);flex-shrink:0">+</span>${o}</div>`
    ).join('')}
          </div>
          <div>
            <div style="font-size:8px;letter-spacing:1.5px;text-transform:uppercase;color:var(--red);margin-bottom:8px;font-weight:600">⚠ Risks</div>
            ${(ai.key_risks || []).map(r =>
      `<div style="font-size:10.5px;color:var(--txt2);padding:6px 0;border-bottom:1px solid var(--br);display:flex;gap:7px;line-height:1.45"><span style="color:var(--red);flex-shrink:0">−</span>${r}</div>`
    ).join('')}
          </div>
        </div>
        ${(ai.recommendations?.length) ? `
        <div>
          <div style="font-size:8px;letter-spacing:1.5px;text-transform:uppercase;color:var(--blue);margin-bottom:8px;font-weight:600">💡 Recommendations</div>
          ${ai.recommendations.map((rec, i) =>
      `<div style="font-size:10.5px;color:var(--txt2);padding:7px 10px;margin-bottom:5px;background:rgba(38,80,250,.06);border-radius:var(--r3);border-left:2px solid var(--blue);line-height:1.45">${i + 1}. ${rec}</div>`
    ).join('')}
        </div>` : ''}
      </div>`;
  }

  // ── Display result (full financial analysis) ──────────────────────────────

  static displayResult(r, input, isLLM) {
    const panel = document.getElementById('rentalResultPanel');
    const rorColor = r.ror_score >= 75 ? 'var(--grn)'
      : r.ror_score >= 55 ? 'var(--gold)'
        : r.ror_score >= 35 ? 'var(--amb)' : 'var(--red)';
    const settings = AppSettings.get();
    const modelShort = (settings.groqModel || '').split('-').slice(0, 3).join(' ') || 'LLM';

    // ── LLM badge (top of gauge)
    const llmBadge = isLLM
      ? `<span style="font-size:8px;padding:2px 9px;border-radius:20px;background:rgba(38,80,250,.12);border:1px solid rgba(38,80,250,.3);color:var(--blue);font-weight:600;letter-spacing:.5px">⚡ Groq AI</span>`
      : '';

    // ── AI Intelligence section
    let aiSection = '';
    if (isLLM && r.ai) {
      const ai = r.ai;
      const demColor = ai.demand_level === 'High' ? 'var(--grn)' : ai.demand_level === 'Low' ? 'var(--red)' : 'var(--amb)';
      const liqColor = ai.liquidity_rating === 'High' ? 'var(--grn)' : ai.liquidity_rating === 'Low' ? 'var(--red)' : 'var(--amb)';

      aiSection = `
        <!-- AI Market Intelligence -->
        <div class="card" style="margin-bottom:13px;border-color:rgba(38,80,250,.22);background:linear-gradient(135deg,rgba(38,80,250,.04),rgba(38,191,248,.02))">
          <div class="ch">
            <div class="ct">⚡ AI Market Intelligence</div>
            <span style="font-size:8px;padding:2px 9px;border-radius:20px;background:rgba(38,80,250,.12);border:1px solid rgba(38,80,250,.3);color:var(--blue);font-weight:600">${modelShort}</span>
          </div>

          <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:13px">
            <div style="background:var(--bg3);border-radius:var(--r2);padding:12px">
              <div style="font-size:8px;letter-spacing:1.5px;text-transform:uppercase;color:var(--slate3);margin-bottom:4px">Rental Demand</div>
              <div style="font-size:17px;font-weight:700;color:${demColor};margin-bottom:5px">${ai.demand_level || '—'}</div>
              <div style="font-size:10px;color:var(--txt2);line-height:1.5">${ai.demand_explanation || ''}</div>
            </div>
            <div style="background:var(--bg3);border-radius:var(--r2);padding:12px">
              <div style="font-size:8px;letter-spacing:1.5px;text-transform:uppercase;color:var(--slate3);margin-bottom:4px">Liquidity</div>
              <div style="font-size:17px;font-weight:700;color:${liqColor};margin-bottom:5px">${ai.liquidity_rating || '—'}</div>
              <div style="font-size:10px;color:var(--txt2);line-height:1.5">${ai.best_tenant_profile || ''}</div>
            </div>
          </div>

          <div style="font-size:11px;color:var(--txt2);line-height:1.65;padding:12px;background:var(--bg3);border-radius:var(--r2);margin-bottom:10px">
            ${ai.investment_narrative || ''}
          </div>

          <div style="font-size:10.5px;color:var(--slate);line-height:1.6;margin-bottom:10px">
            ${ai.market_analysis || ai.location_analysis || ''}
          </div>

          <div style="font-size:9px;color:var(--slate3)">Capital Appreciation Outlook:
            <span style="color:var(--txt2);font-weight:600">${ai.expected_appreciation || '—'}</span>
          </div>
        </div>

        <!-- Opportunities & Risks -->
        <div class="card" style="margin-bottom:13px">
          <div class="ch"><div class="ct">Opportunities &amp; Risks</div></div>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:14px;margin-bottom:${(ai.recommendations?.length) ? '14px' : '0'}">
            <div>
              <div style="font-size:8px;letter-spacing:1.5px;text-transform:uppercase;color:var(--grn);margin-bottom:8px;font-weight:600">✓ Opportunities</div>
              ${(ai.key_opportunities || []).map(o =>
        `<div style="font-size:10.5px;color:var(--txt2);padding:6px 0;border-bottom:1px solid var(--br);display:flex;gap:7px;line-height:1.45"><span style="color:var(--grn);flex-shrink:0">+</span>${o}</div>`
      ).join('')}
            </div>
            <div>
              <div style="font-size:8px;letter-spacing:1.5px;text-transform:uppercase;color:var(--red);margin-bottom:8px;font-weight:600">⚠ Risks</div>
              ${(ai.key_risks || []).map(r =>
        `<div style="font-size:10.5px;color:var(--txt2);padding:6px 0;border-bottom:1px solid var(--br);display:flex;gap:7px;line-height:1.45"><span style="color:var(--red);flex-shrink:0">−</span>${r}</div>`
      ).join('')}
            </div>
          </div>
          ${(ai.recommendations?.length) ? `
          <div>
            <div style="font-size:8px;letter-spacing:1.5px;text-transform:uppercase;color:var(--blue);margin-bottom:8px;font-weight:600">💡 Recommendations</div>
            ${ai.recommendations.map((rec, i) =>
        `<div style="font-size:10.5px;color:var(--txt2);padding:7px 10px;margin-bottom:5px;background:rgba(38,80,250,.06);border-radius:var(--r3);border-left:2px solid var(--blue);line-height:1.45">${i + 1}. ${rec}</div>`
      ).join('')}
          </div>` : ''}
        </div>`;
    }

    panel.innerHTML = `
      <!-- ROR Score Card -->
      <div class="card" style="background:var(--bg2);border-color:var(--br);margin-bottom:13px">
        <div style="text-align:center;padding:18px 0 8px">
          <div style="display:flex;align-items:center;justify-content:center;gap:8px;margin-bottom:10px;flex-wrap:wrap">
            <div style="font-size:9px;letter-spacing:2.5px;text-transform:uppercase;color:var(--slate3)">Return on Rent Score</div>
            ${llmBadge}
          </div>
          <div style="position:relative;display:inline-block;width:130px;height:130px;margin-bottom:10px">
            <svg viewBox="0 0 36 36" style="width:130px;height:130px;transform:rotate(-90deg)">
              <circle cx="18" cy="18" r="15.9" fill="none" stroke="var(--br)" stroke-width="2.5"/>
              <circle cx="18" cy="18" r="15.9" fill="none" stroke="${rorColor}" stroke-width="2.5"
                stroke-dasharray="${r.ror_score.toFixed(1)} 100" stroke-linecap="round"
                style="transition:stroke-dasharray .8s ease"/>
            </svg>
            <div style="position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center">
              <div style="font-size:11px;color:var(--slate3)">Score</div>
              <div style="font-size:36px;color:${rorColor};line-height:1;font-weight:800">${r.ror_score}</div>
              <div style="font-size:9px;color:var(--slate3)">/100</div>
            </div>
          </div>
          <div style="font-size:22px;margin-bottom:4px">${r.ror_emoji}</div>
          <div style="font-size:16px;font-weight:600;color:var(--txt)">${r.ror_label}</div>
        </div>

        <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:10px;padding-top:14px;border-top:1px solid var(--br)">
          <div style="text-align:center">
            <div style="font-size:8px;letter-spacing:1.5px;text-transform:uppercase;color:var(--slate3);margin-bottom:4px">Gross Yield</div>
            <div style="font-size:22px;font-weight:700;color:var(--gold)">${r.gross_yield.toFixed(2)}%</div>
          </div>
          <div style="text-align:center;border-left:1px solid var(--br);border-right:1px solid var(--br)">
            <div style="font-size:8px;letter-spacing:1.5px;text-transform:uppercase;color:var(--slate3);margin-bottom:4px">Net Yield</div>
            <div style="font-size:22px;font-weight:700;color:var(--grn)">${r.net_yield.toFixed(2)}%</div>
          </div>
          <div style="text-align:center">
            <div style="font-size:8px;letter-spacing:1.5px;text-transform:uppercase;color:var(--slate3);margin-bottom:4px">Cash-on-Cash</div>
            <div style="font-size:22px;font-weight:700;color:var(--blue)">${r.cash_on_cash.toFixed(2)}%</div>
          </div>
        </div>
      </div>

      ${aiSection}

      <!-- Cashflow Breakdown -->
      <div class="card" style="margin-bottom:13px">
        <div class="ch"><div class="ct">Annual Cashflow Breakdown</div></div>
        ${this.waterfall(r.annual)}
      </div>

      <!-- Market & Key Metrics -->
      <div class="card">
        <div class="ch"><div class="ct">Market Context &amp; Key Metrics</div></div>
        <div class="adj-row">
          <div class="adj-label">Market Rent Estimate</div>
          <div class="adj-val tg">${r.market.market_rent_estimate.toLocaleString()} EGP/mo</div>
        </div>
        <div class="adj-row">
          <div class="adj-label">Your Rent vs Market</div>
          <div class="adj-val" style="color:${r.market.rent_vs_market_pct >= 100 ? 'var(--grn)' : 'var(--amb)'}">
            ${r.market.rent_vs_market_pct}%
          </div>
        </div>
        <div class="adj-row">
          <div class="adj-label">Break-even Monthly Rent</div>
          <div class="adj-val mono">${r.break_even_rent.toLocaleString()} EGP</div>
        </div>
        <div class="adj-row" style="border-bottom:none">
          <div class="adj-label">Payback Period</div>
          <div class="adj-val">${r.payback_years ? r.payback_years + ' yrs' : 'N/A'}</div>
        </div>
      </div>
    `;
  }

  // ── Waterfall bar chart ───────────────────────────────────────────────────

  static waterfall(ann) {
    const items = [
      { label: 'Gross Annual Rent', val: ann.gross_rent, color: 'var(--grn)', sign: '+' },
      { label: 'Vacancy Deduction', val: -(ann.gross_rent - ann.effective_rent), color: 'var(--red)', sign: '-' },
      { label: 'Management Fees', val: -ann.management_fees, color: 'var(--red)', sign: '-' },
      { label: 'Maintenance Cost', val: -ann.maintenance, color: 'var(--red)', sign: '-' },
      { label: 'Mortgage Payments', val: -ann.mortgage, skip: !ann.mortgage, color: 'var(--red)', sign: '-' },
      { label: 'Net Annual Income', val: ann.net_rent, color: 'var(--gold)', sign: '=' },
    ].filter(i => !i.skip);

    const max = Math.max(...items.map(i => Math.abs(i.val)));
    return items.map(i => {
      const pct = max ? Math.round(Math.abs(i.val) / max * 100) : 0;
      return `<div class="cmp-bar-wrap">
        <div class="cmp-label">
          <span style="color:var(--txt2)">${i.label}</span>
          <span style="font-family:'JetBrains Mono';font-size:10.5px;color:${i.color}">${i.sign === '-' ? '−' : ''}${Math.abs(i.val).toLocaleString()} EGP</span>
        </div>
        <div class="cmp-bar">
          <div class="cmp-fill" style="width:${pct}%;background:${i.color};opacity:.85;color:#000;font-size:9px;padding:0 6px;display:flex;align-items:center">
            ${pct > 22 ? Math.abs(i.val).toLocaleString() : ''}
          </div>
        </div>
      </div>`;
    }).join('');
  }

  // ── Called when page becomes active ──────────────────────────────────────

  static onActive() {
    const s = AppSettings.get();
    const badge = document.getElementById('rentalModelBadge');
    if (!badge) return;
    if (s.modelMode === 'llm' && s.groqApiKey) {
      badge.innerHTML = `<span class="pill" style="background:rgba(38,80,250,.12);border-color:rgba(38,80,250,.3);color:var(--blue)">⚡ Groq AI Mode</span>`;
    } else if (s.modelMode === 'llm') {
      badge.innerHTML = `<span class="pill" style="background:rgba(245,166,35,.08);border-color:rgba(245,166,35,.35);color:var(--amb)">⚠ Set API Key in Settings</span>`;
    } else {
      badge.innerHTML = `<span class="pill">Yield &amp; ROR Engine</span>`;
    }
  }
}
