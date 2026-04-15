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
    if (!badge) return;
    const s = AppSettings.get();
    if (s.modelMode === 'llm' && s.groqApiKey) {
      badge.innerHTML = `
        <div style="font-family:'JetBrains Mono';line-height:1.4">
          <span style="color:var(--blue)">⚡ Groq AI Mode</span><br/>
          <span style="opacity:0.6;font-size:8.5px">${(s.groqModel || '').split('-').slice(0, 3).join(' ')}</span>
        </div>`;
    } else if (s.modelMode === 'llm') {
      badge.innerHTML = `<div style="font-family:'JetBrains Mono';line-height:1.4"><span style="color:var(--amb)">⚠ Set API Key</span></div>`;
    } else if (this.model) {
      const m = this.model.metrics;
      badge.innerHTML = `
        <div style="font-family:'JetBrains Mono';line-height:1.4">
          <span style="color:var(--gold)">R²: ${(m.test_r2 || 0).toFixed(3)}</span><br/>
          <span>RMSE: ${Math.round(m.test_rmse || 0).toLocaleString()}</span><br/>
          <span style="opacity:0.6;font-size:8.5px">${m.nSamples?.toLocaleString()} samples (v4)</span>
        </div>`;
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
        </div>`;

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
        entered_price: parseFloat(document.getElementById('f_price').value) || 0,
      };

      const settings = AppSettings.get();
      if (settings.modelMode === 'llm' && settings.groqApiKey) {
        await this.handleLLM(input, settings);
      } else {
        const result = await APIService.predict(input);
        this.displayResult(result);
      }
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

  // ── LLM mode entry point ─────────────────────────────────────────────────
  static async handleLLM(input, settings) {
    // Scenario A: user entered a price → assess fairness
    // Scenario B: no price entered → listing recommendation
    const scenario = (input.entered_price > 0) ? 'assess' : 'list';
    const ai = await this.callGroq(input, scenario, settings);
    this.displayLLMResult(ai, input, scenario, settings);
  }

  // ── Groq API call ────────────────────────────────────────────────────────
  static async callGroq(input, scenario, settings) {
    const deliveryLabel = input.delivery_months === 0
      ? 'Immediate delivery / Ready to move in'
      : `${input.delivery_months} months from now (off-plan / future delivery)`;

    const finishingMap = {
      finished: 'Fully Finished (turnkey)',
      semi: 'Semi-Finished (walls & floors done, no kitchen/fixtures)',
      core: 'Core & Shell (raw concrete, unfinished)',
    };
    const finishingLabel = finishingMap[input.finishing] || input.finishing;
    const luxuryPct = Math.round(input.luxury_score * 100);

    const commonDetails = `PROPERTY DETAILS:
- Type: ${input.property_type}
- Location: ${input.city}
- Area: ${input.area_m2} m²
- Bedrooms: ${input.bedrooms} | Bathrooms: ${input.bathrooms}
- Finishing Level: ${finishingLabel}
- Delivery Status: ${deliveryLabel}
- Luxury / Spec Score: ${luxuryPct}/100
- Distance to City Centre: ${input.distance_to_center} km
- Current USD/EGP Rate: ${input.usd_to_egp_rate}
- Iron price: ${input.iron.toLocaleString()} EGP/ton | Cement: ${input.cement.toLocaleString()} EGP/ton`;

    let taskBlock, jsonSchema;

    if (scenario === 'assess') {
      const enteredPpm = Math.round(input.entered_price / input.area_m2);
      taskBlock = `TASK — PRICE ASSESSMENT:
The seller is asking ${input.entered_price.toLocaleString()} EGP total (${enteredPpm.toLocaleString()} EGP/m²).
Assess whether this asking price is fair, overpriced, or underpriced for this exact property and location in the current Egyptian market.`;

      jsonSchema = `{
  "verdict": "<fair|underpriced|overpriced|significantly_underpriced|significantly_overpriced>",
  "verdict_label": "<Fair Price|Underpriced|Overpriced|Significantly Underpriced|Significantly Overpriced>",
  "verdict_emoji": "<↓↓|↓|✓|↑|↑↑>",
  "fair_price_low": <integer EGP, lower bound of fair range>,
  "fair_price_high": <integer EGP, upper bound of fair range>,
  "fair_price_mid": <integer EGP, your best single estimate of fair value>,
  "fair_ppm": <integer, fair price per m² in EGP>,
  "gap_pct": <number, e.g. +15.5 means 15.5% overpriced, -8.2 means 8.2% underpriced>,
  "location_analysis": "<2-3 sentences about typical price levels in this specific area, comparing to nearby comparable areas>",
  "assessment_summary": "<3-4 sentences explaining your verdict with concrete market reasoning>",
  "key_price_drivers": ["<positive or negative factor 1>", "<factor 2>", "<factor 3>"],
  "negotiation_tip": "<1-2 sentences of practical negotiation advice for the buyer or seller based on verdict>",
  "market_outlook": "<1-2 sentences short-term price direction for this area and type>",
  "comparable_areas": "<mention 1-2 comparable neighbourhoods and their typical price range for context>"
}`;
    } else {
      // listing scenario
      taskBlock = `TASK — LISTING PRICE RECOMMENDATION:
The owner wants to SELL this unit and needs a recommended listing price.
Provide BOTH a cash price (immediate payment) and an instalment price (if delivery is ${input.delivery_months} months away).
A cash buyer pays upfront now; an instalment buyer pays in stages over the delivery period — price the instalment option accordingly (typically 10-20% premium depending on delivery horizon).
Also factor the finishing level: a core/shell unit is worth significantly less than fully finished.`;

      const installNote = input.delivery_months === 0
        ? 'Note: Immediate delivery — instalment price should be minimal premium (~5%) over cash since there is no wait.'
        : `Note: ${input.delivery_months}-month delivery — instalment premium should reflect the wait and financing cost.`;

      taskBlock += `\n${installNote}`;

      jsonSchema = `{
  "cash_price_low": <integer EGP, minimum recommended cash sale price>,
  "cash_price_high": <integer EGP, maximum recommended cash sale price>,
  "cash_price_mid": <integer EGP, ideal cash listing price>,
  "cash_ppm": <integer, cash price per m²>,
  "installment_price_low": <integer EGP, minimum instalment price>,
  "installment_price_high": <integer EGP, maximum instalment price>,
  "installment_price_mid": <integer EGP, ideal instalment listing price>,
  "installment_ppm": <integer, instalment price per m²>,
  "installment_premium_pct": <number, % premium of instalment over cash, e.g. 15 means 15% more>,
  "cash_discount_note": "<what typical cash discount sellers offer in this market and why>",
  "finishing_impact": "<how this finishing level affects pricing, what finishing upgrade would add, and typical buyer expectations>",
  "location_analysis": "<2-3 sentences about demand and price levels in ${input.city}, with context vs nearby areas>",
  "listing_strategy": "<3-4 sentences: how to position, market, and negotiate for this specific unit>",
  "key_price_drivers": ["<the most impactful positive or negative factor>", "<factor 2>", "<factor 3>"],
  "best_buyer_profile": "<who is the ideal buyer — investor, end-user, expat, etc. and why>",
  "market_outlook": "<1-2 sentences: expected price direction for this area in next 12 months>",
  "time_to_sell_estimate": "<estimated typical time to close at this price in this area>"
}`;
    }

    const prompt = `You are a senior Egyptian real estate valuation expert with encyclopaedic knowledge of every Cairo district and price differential — you know that Maadi commands higher rents and prices than Helwan, that Zamalek and Garden City are among Cairo's premium locations, that New Cairo (5th Settlement, Rehab, Madinaty) has surged, that areas like Shorouk, Obour, and October City have different buyer demographics, that Heliopolis is established premium whereas Ain Sokhna is a second-home market, and so on. You also deeply understand how construction cost indices (iron, cement), USD/EGP rate, delivery timeline, and finishing level impact Egyptian property values in 2024-2025.

${commonDetails}

${taskBlock}

Respond ONLY with a valid JSON object — no markdown, no backticks, no extra text, just the JSON:
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
        max_tokens: 1800,
        temperature: 0.15,
      }),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err?.error?.message || `Groq API error ${res.status}`);
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

  // ── Display LLM result ────────────────────────────────────────────────────
  static displayLLMResult(ai, input, scenario, settings) {
    const panel = document.getElementById('resultPanel');
    const modelShort = (settings.groqModel || '').split('-').slice(0, 3).join(' ') || 'Groq AI';

    const llmTag = `<span style="font-size:8px;padding:2px 9px;border-radius:20px;background:rgba(38,80,250,.12);border:1px solid rgba(38,80,250,.3);color:var(--blue);font-weight:600;letter-spacing:.5px">⚡ ${modelShort}</span>`;

    const fmt = v => Math.round(v).toLocaleString();

    if (scenario === 'assess') {
      // ── Verdict colours
      const verdictColors = {
        significantly_underpriced: '#52B07A',
        underpriced: '#7AD4A0',
        fair: '#D4AE52',
        overpriced: '#D4834A',
        significantly_overpriced: '#C05A4A',
      };
      const vColor = verdictColors[ai.verdict] || 'var(--gold)';
      const gapSign = ai.gap_pct > 0 ? '+' : '';
      const gapColor = ai.gap_pct > 7 ? 'var(--red)' : ai.gap_pct < -7 ? 'var(--grn)' : 'var(--amb)';
      const enteredPpm = Math.round(input.entered_price / input.area_m2);

      panel.innerHTML = `
        <!-- AI Verdict Card -->
        <div class="card" style="margin-bottom:13px;border-color:${vColor}40;background:linear-gradient(135deg,${vColor}0a 0%,${vColor}04 100%)">
          <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:16px;flex-wrap:wrap;gap:8px">
            <div style="display:flex;align-items:center;gap:10px">
              <div style="width:36px;height:36px;border-radius:10px;background:${vColor}22;display:flex;align-items:center;justify-content:center;font-size:18px">${ai.verdict_emoji}</div>
              <div>
                <div style="font-size:9px;letter-spacing:2px;text-transform:uppercase;color:var(--slate3)">AI Market Assessment</div>
                <div style="font-size:18px;font-weight:700;color:${vColor};margin-top:2px">${ai.verdict_label}</div>
              </div>
            </div>
            ${llmTag}
          </div>

          <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:10px;margin-bottom:16px">
            <div style="background:var(--bg3);border-radius:8px;padding:10px 12px;text-align:center">
              <div style="font-size:8px;letter-spacing:1.5px;text-transform:uppercase;color:var(--slate3);margin-bottom:4px">Your Price / m²</div>
              <div style="font-size:16px;font-weight:700;color:var(--txt);font-family:'JetBrains Mono'">${fmt(enteredPpm)}</div>
              <div style="font-size:8px;color:var(--slate3)">EGP/m²</div>
            </div>
            <div style="background:var(--bg3);border-radius:8px;padding:10px 12px;text-align:center">
              <div style="font-size:8px;letter-spacing:1.5px;text-transform:uppercase;color:var(--slate3);margin-bottom:4px">Fair Price / m²</div>
              <div style="font-size:16px;font-weight:700;color:var(--gold);font-family:'JetBrains Mono'">${fmt(ai.fair_ppm)}</div>
              <div style="font-size:8px;color:var(--slate3)">EGP/m²</div>
            </div>
            <div style="background:var(--bg3);border-radius:8px;padding:10px 12px;text-align:center">
              <div style="font-size:8px;letter-spacing:1.5px;text-transform:uppercase;color:var(--slate3);margin-bottom:4px">Gap</div>
              <div style="font-size:16px;font-weight:700;color:${gapColor};font-family:'JetBrains Mono'">${gapSign}${ai.gap_pct?.toFixed(1)}%</div>
              <div style="font-size:8px;color:var(--slate3)">vs fair value</div>
            </div>
          </div>

          <div style="background:var(--bg3);border-radius:8px;padding:12px;margin-bottom:12px">
            <div style="font-size:8px;letter-spacing:1.5px;text-transform:uppercase;color:var(--slate3);margin-bottom:6px">Fair Value Range</div>
            <div style="display:flex;align-items:center;gap:12px;flex-wrap:wrap">
              <div style="font-family:'JetBrains Mono';font-size:13px;color:var(--txt2)">${fmt(ai.fair_price_low)} EGP</div>
              <div style="flex:1;height:4px;background:var(--br);border-radius:2px;position:relative;min-width:60px">
                <div style="position:absolute;left:0;right:0;top:0;height:100%;background:linear-gradient(90deg,var(--grn),var(--amb),var(--red));border-radius:2px;opacity:.4"></div>
                <div style="position:absolute;top:-4px;width:12px;height:12px;border-radius:50%;background:var(--gold);border:2px solid var(--bg);transform:translateX(-6px);left:50%"></div>
              </div>
              <div style="font-family:'JetBrains Mono';font-size:13px;color:var(--txt2)">${fmt(ai.fair_price_high)} EGP</div>
            </div>
            <div style="text-align:center;margin-top:6px;font-size:11px;color:var(--gold);font-weight:600">Mid: ${fmt(ai.fair_price_mid)} EGP</div>
          </div>

          <div style="font-size:11px;color:var(--txt2);line-height:1.65;padding:12px;background:var(--bg3);border-radius:8px;margin-bottom:10px">${ai.assessment_summary}</div>
        </div>

        <!-- Location & Drivers -->
        <div class="card" style="margin-bottom:13px">
          <div class="ch"><div class="ct">Location Analysis</div></div>
          <div style="font-size:11px;color:var(--txt2);line-height:1.65;margin-bottom:12px">${ai.location_analysis}</div>
          ${ai.comparable_areas ? `<div style="font-size:10px;color:var(--slate);line-height:1.5;padding:8px 10px;background:var(--bg3);border-radius:6px;margin-bottom:12px">📍 ${ai.comparable_areas}</div>` : ''}
          <div style="font-size:8px;letter-spacing:1.5px;text-transform:uppercase;color:var(--slate3);margin-bottom:8px;font-weight:600">Key Price Drivers</div>
          ${(ai.key_price_drivers || []).map(d =>
        `<div style="font-size:10.5px;color:var(--txt2);padding:6px 0;border-bottom:1px solid var(--br);display:flex;gap:7px;line-height:1.45"><span style="color:var(--gold);flex-shrink:0">→</span>${d}</div>`
      ).join('')}
        </div>

        <!-- Negotiation & Outlook -->
        <div class="card">
          <div class="ch"><div class="ct">Advice &amp; Outlook</div></div>
          ${ai.negotiation_tip ? `
          <div style="padding:12px;background:rgba(38,80,250,.06);border-radius:8px;border-left:2px solid var(--blue);margin-bottom:10px">
            <div style="font-size:8px;letter-spacing:1px;text-transform:uppercase;color:var(--blue);margin-bottom:4px;font-weight:600">💡 Negotiation Tip</div>
            <div style="font-size:11px;color:var(--txt2);line-height:1.55">${ai.negotiation_tip}</div>
          </div>` : ''}
          ${ai.market_outlook ? `
          <div style="padding:12px;background:var(--bg3);border-radius:8px">
            <div style="font-size:8px;letter-spacing:1px;text-transform:uppercase;color:var(--slate3);margin-bottom:4px;font-weight:600">Market Outlook</div>
            <div style="font-size:11px;color:var(--txt2);line-height:1.55">${ai.market_outlook}</div>
          </div>` : ''}
        </div>`;

    } else {
      // ── Listing recommendation scenario
      const hasInstalment = input.delivery_months > 0;
      const premiumLabel = hasInstalment
        ? `+${ai.installment_premium_pct?.toFixed(1) || '—'}% instalment premium`
        : 'Immediate delivery (~5% instalment premium)';

      panel.innerHTML = `
        <!-- Listing Price Recommendation -->
        <div class="card" style="margin-bottom:13px;border-color:rgba(38,80,250,.25);background:linear-gradient(135deg,rgba(38,80,250,.05) 0%,rgba(38,191,248,.03) 100%)">
          <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:16px;flex-wrap:wrap;gap:8px">
            <div style="display:flex;align-items:center;gap:10px">
              <div style="width:36px;height:36px;border-radius:10px;background:rgba(38,80,250,.15);display:flex;align-items:center;justify-content:center;font-size:18px">🏷️</div>
              <div>
                <div style="font-size:9px;letter-spacing:2px;text-transform:uppercase;color:var(--slate3)">AI Listing Recommendation</div>
                <div style="font-size:15px;font-weight:700;color:var(--txt);margin-top:2px">${input.city} · ${input.area_m2} m²</div>
              </div>
            </div>
            ${llmTag}
          </div>

          <!-- Cash Price -->
          <div style="background:rgba(82,176,122,.08);border:1px solid rgba(82,176,122,.25);border-radius:10px;padding:14px;margin-bottom:10px">
            <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px">
              <div style="font-size:9px;letter-spacing:2px;text-transform:uppercase;color:#52B07A;font-weight:700">💵 Cash Price (Immediate Payment)</div>
              <div style="font-size:8px;color:var(--slate3);font-family:'JetBrains Mono'">${fmt(ai.cash_ppm)} EGP/m²</div>
            </div>
            <div style="display:flex;align-items:baseline;gap:8px;flex-wrap:wrap">
              <div style="font-size:11px;color:var(--slate3);font-family:'JetBrains Mono'">${fmt(ai.cash_price_low)} –</div>
              <div style="font-size:26px;font-weight:800;color:#52B07A;font-family:'JetBrains Mono'">${fmt(ai.cash_price_mid)}</div>
              <div style="font-size:11px;color:var(--slate3);font-family:'JetBrains Mono'">– ${fmt(ai.cash_price_high)} EGP</div>
            </div>
            ${ai.cash_discount_note ? `<div style="font-size:10px;color:var(--slate);margin-top:6px;line-height:1.4">${ai.cash_discount_note}</div>` : ''}
          </div>

          <!-- Instalment Price -->
          <div style="background:rgba(38,80,250,.06);border:1px solid rgba(38,80,250,.2);border-radius:10px;padding:14px;margin-bottom:12px">
            <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px">
              <div style="font-size:9px;letter-spacing:2px;text-transform:uppercase;color:var(--blue);font-weight:700">📅 Instalment Price (${input.delivery_months === 0 ? 'Ready' : input.delivery_months + ' mo delivery'})</div>
              <div style="font-size:8px;color:var(--slate3);font-family:'JetBrains Mono'">${fmt(ai.installment_ppm)} EGP/m²</div>
            </div>
            <div style="display:flex;align-items:baseline;gap:8px;flex-wrap:wrap">
              <div style="font-size:11px;color:var(--slate3);font-family:'JetBrains Mono'">${fmt(ai.installment_price_low)} –</div>
              <div style="font-size:26px;font-weight:800;color:var(--blue);font-family:'JetBrains Mono'">${fmt(ai.installment_price_mid)}</div>
              <div style="font-size:11px;color:var(--slate3);font-family:'JetBrains Mono'">– ${fmt(ai.installment_price_high)} EGP</div>
            </div>
            <div style="font-size:10px;color:var(--slate);margin-top:6px">${premiumLabel}</div>
          </div>

          <!-- Finishing impact -->
          ${ai.finishing_impact ? `
          <div style="padding:10px 12px;background:rgba(245,166,35,.06);border:1px solid rgba(245,166,35,.18);border-radius:8px;margin-bottom:12px">
            <div style="font-size:8px;letter-spacing:1px;text-transform:uppercase;color:var(--amb);margin-bottom:4px;font-weight:600">🏗️ Finishing Level Impact</div>
            <div style="font-size:10.5px;color:var(--txt2);line-height:1.5">${ai.finishing_impact}</div>
          </div>` : ''}
        </div>

        <!-- Location & Strategy -->
        <div class="card" style="margin-bottom:13px">
          <div class="ch"><div class="ct">Location &amp; Market Analysis</div></div>
          <div style="font-size:11px;color:var(--txt2);line-height:1.65;margin-bottom:12px">${ai.location_analysis}</div>
          <div style="font-size:8px;letter-spacing:1.5px;text-transform:uppercase;color:var(--slate3);margin-bottom:8px;font-weight:600">Key Price Drivers</div>
          ${(ai.key_price_drivers || []).map(d =>
        `<div style="font-size:10.5px;color:var(--txt2);padding:6px 0;border-bottom:1px solid var(--br);display:flex;gap:7px;line-height:1.45"><span style="color:var(--gold);flex-shrink:0">→</span>${d}</div>`
      ).join('')}
        </div>

        <!-- Listing Strategy & Buyer Profile -->
        <div class="card">
          <div class="ch"><div class="ct">Listing Strategy</div></div>
          <div style="font-size:11px;color:var(--txt2);line-height:1.65;margin-bottom:12px">${ai.listing_strategy}</div>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
            ${ai.best_buyer_profile ? `
            <div style="background:var(--bg3);border-radius:8px;padding:10px 12px">
              <div style="font-size:8px;letter-spacing:1px;text-transform:uppercase;color:var(--slate3);margin-bottom:4px">Ideal Buyer</div>
              <div style="font-size:10.5px;color:var(--txt2);line-height:1.45">${ai.best_buyer_profile}</div>
            </div>` : ''}
            ${ai.time_to_sell_estimate ? `
            <div style="background:var(--bg3);border-radius:8px;padding:10px 12px">
              <div style="font-size:8px;letter-spacing:1px;text-transform:uppercase;color:var(--slate3);margin-bottom:4px">Estimated Time to Sell</div>
              <div style="font-size:10.5px;color:var(--txt2);line-height:1.45">${ai.time_to_sell_estimate}</div>
            </div>` : ''}
          </div>
          ${ai.market_outlook ? `
          <div style="margin-top:10px;padding:10px 12px;background:rgba(38,191,248,.06);border-radius:8px;border-left:2px solid var(--cyan)">
            <div style="font-size:8px;letter-spacing:1px;text-transform:uppercase;color:var(--cyan);margin-bottom:3px;font-weight:600">Market Outlook</div>
            <div style="font-size:10.5px;color:var(--txt2);line-height:1.5">${ai.market_outlook}</div>
          </div>` : ''}
        </div>`;
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

  // ── DISPLAY RESULT (RF mode) ──────────────────────────────────────────────
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
    this.updateModelBadge();
  }
}
