// ─── Price Advisor Page — Two-tab layout ─────────────────────────────────────
//  Tab 1: Assess a Price  — user enters asking price, model verdicts it
//  Tab 2: List a Unit     — user wants to sell, model recommends cash + instalment price
//  Both tabs show future price projections (RF uses dataset CAGR, LLM uses Groq)
// ─────────────────────────────────────────────────────────────────────────────

class PageAdvisor {

  static init(stats, model) {
    this.stats = stats;
    this.model = model;
    this.activeTab = 'assess';
    this._setupButtons();
    this.updateModelBadge();
    this._updateExtraFeaturesVisibility();
  }

  // ── Wire submit buttons ───────────────────────────────────────────────────
  static _setupButtons() {
    document.getElementById('advisorSubmitBtn')
      ?.addEventListener('click', () => this._submit('assess'));
    document.getElementById('listSubmitBtn')
      ?.addEventListener('click', () => this._submit('list'));
  }

  // ── Tab switching ─────────────────────────────────────────────────────────
  static switchTab(tab) {
    this.activeTab = tab;
    ['assess', 'list'].forEach(t => {
      document.getElementById(`tab-${t}`)?.classList.toggle('on', t === tab);
      document.getElementById(`adv-${t}`)?.classList.toggle('on', t === tab);
    });
    const sub = document.getElementById('advisorSubtitle');
    if (sub) {
      sub.textContent = tab === 'assess'
        ? 'Check if an asking price is fair, over, or underpriced — with future value projections'
        : 'Get a recommended cash & instalment price for your unit — with future value projections';
    }
    this.updateModelBadge();
  }

  // ── Extra Features textarea — shown only in LLM mode ─────────────────────
  static _updateExtraFeaturesVisibility() {
    const s = AppSettings.get();
    const isLLM = s.modelMode === 'llm' && !!s.groqApiKey;
    ['f_extra_features_wrap', 'fl_extra_features_wrap'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.style.display = isLLM ? 'block' : 'none';
    });
  }

  // ── Model badge ───────────────────────────────────────────────────────────
  static updateModelBadge() {
    const badge = document.getElementById('modelBadge');
    const meta = document.getElementById('modelMetaTxt');
    if (!badge || !meta) return;
    const s = AppSettings.get();
    if (s.modelMode === 'llm' && s.groqApiKey) {
      badge.innerHTML = `<div class="pill" style="background:rgba(38,80,250,.12);border:1px solid rgba(38,80,250,.3);color:var(--blue)">⚡ Groq AI Mode</div>`;
      meta.textContent = (s.groqModel || '').split('-').slice(0, 3).join(' ') || 'LLM active';
    } else if (s.modelMode === 'llm') {
      badge.innerHTML = `<div class="pill" style="background:rgba(245,166,35,.08);border:1px solid rgba(245,166,35,.3);color:var(--amb)">⚠ API Key Required</div>`;
      meta.textContent = 'Configure in Settings';
    } else if (this.model) {
      badge.innerHTML = `<div class="pill">🌲 Random Forest Engine</div>`;
      const m = this.model.metrics || {};
      meta.innerHTML = `R² ${(m.test_r2 || 0).toFixed(3)} · RMSE ${Math.round(m.test_rmse || 0).toLocaleString()} · ${(m.nSamples || 0).toLocaleString()} rows`;
    }
    this._updateExtraFeaturesVisibility();
  }

  // ── Form data collectors ──────────────────────────────────────────────────
  static collectAssessInput() {
    return {
      area_m2: parseFloat(document.getElementById('f_area').value) || 150,
      bedrooms: parseInt(document.getElementById('f_beds').value, 10) || 3,
      bathrooms: parseInt(document.getElementById('f_baths').value, 10) || 2,
      property_type: document.getElementById('f_type').value,
      city: document.getElementById('f_city').value,
      district: document.getElementById('f_district')?.value?.trim() || '',
      compound: document.getElementById('f_compound')?.value?.trim() || '',
      distance_to_center: parseFloat(document.getElementById('f_dist').value) || 25,
      luxury_score: parseFloat(document.getElementById('f_luxury').value) / 100,
      usd_to_egp_rate: parseFloat(document.getElementById('f_usd').value) || 51.9,
      iron: parseFloat(document.getElementById('f_iron').value) || 37500,
      cement: parseFloat(document.getElementById('f_cement').value) || 3600,
      month: parseInt(document.getElementById('f_month').value, 10) || 6,
      delivery_months: parseInt(document.getElementById('f_delivery').value, 10) || 0,
      finishing: document.getElementById('f_finishing').value,
      entered_price: parseFloat(document.getElementById('f_price').value) || 0,
      extra_features: document.getElementById('f_extra_features')?.value?.trim() || '',
    };
  }

  static collectListInput() {
    const defaultMonth = new Date().getMonth() + 1;
    return {
      area_m2: parseFloat(document.getElementById('fl_area').value) || 150,
      bedrooms: parseInt(document.getElementById('fl_beds').value, 10) || 3,
      bathrooms: parseInt(document.getElementById('fl_baths').value, 10) || 2,
      property_type: document.getElementById('fl_type').value,
      city: document.getElementById('fl_city').value,
      district: document.getElementById('fl_district')?.value?.trim() || '',
      compound: document.getElementById('fl_compound')?.value?.trim() || '',
      distance_to_center: parseFloat(document.getElementById('fl_dist').value) || 25,
      luxury_score: parseFloat(document.getElementById('fl_luxury').value) / 100,
      usd_to_egp_rate: 51.9, // Auto-populated default
      iron: 37500,           // Auto-populated default
      cement: 3600,          // Auto-populated default
      month: defaultMonth,   // Current month
      delivery_months: parseInt(document.getElementById('fl_delivery').value, 10) || 0,
      finishing: document.getElementById('fl_finishing').value,
      entered_price: 0,
      extra_features: document.getElementById('fl_extra_features')?.value?.trim() || '',
    };
  }

  // ── Main submit handler ───────────────────────────────────────────────────
  static async _submit(scenario) {
    const btnId = scenario === 'assess' ? 'advisorSubmitBtn' : 'listSubmitBtn';
    const panelId = scenario === 'assess' ? 'resultPanel' : 'listResultPanel';
    const btnLabel = scenario === 'assess' ? '🔍 &nbsp;Assess This Price' : '🏷️ &nbsp;Price My Unit';
    const btn = document.getElementById(btnId);
    const panel = document.getElementById(panelId);

    if (btn) { btn.disabled = true; btn.innerHTML = '<span class="spin"></span>Analysing…'; }
    panel.innerHTML = `
      <div class="card result-loading" style="padding:24px;border-color:transparent">
        <div class="skeleton" style="height:120px;margin-bottom:20px;border-radius:var(--r)"></div>
        <div class="skeleton" style="height:10px;width:55%;margin-bottom:28px"></div>
        <div class="skeleton" style="height:22px;margin-bottom:10px"></div>
        <div class="skeleton" style="height:22px;margin-bottom:10px"></div>
        <div class="skeleton" style="height:80px"></div>
      </div>`;
    await new Promise(r => setTimeout(r, 500));

    try {
      const input = scenario === 'assess' ? this.collectAssessInput() : this.collectListInput();
      const settings = AppSettings.get();
      if (settings.modelMode === 'llm' && settings.groqApiKey) {
        await this._handleLLM(input, scenario, settings, panel);
      } else {
        await this._handleRF(input, scenario, panel);
      }
    } catch (err) {
      panel.innerHTML = `<div class="alert ae"><span>✕</span><span>${err.message}</span></div>`;
    } finally {
      if (btn) { btn.disabled = false; btn.innerHTML = btnLabel; }
    }
  }

  // ═══════════════════════════════════════════════════════════════
  //  RANDOM FOREST PATH
  // ═══════════════════════════════════════════════════════════════

  static async _handleRF(input, scenario, panel) {
    if (scenario === 'assess') {
      if (!input.entered_price) {
        panel.innerHTML = `<div class="alert ae"><span>✕</span><span>Please enter the asking price to assess.</span></div>`;
        return;
      }
      const result = await APIService.predict(input);
      const futureHTML = this._rfFutureBlock(input.entered_price, result.predicted.total);
      this._renderAssessRF(result, panel, futureHTML);
    } else {
      // For listing: call predict with a dummy entered_price, use predicted value as cash price
      const dummyPrice = (input.area_m2 || 150) * 25000;
      const result = await APIService.predict({ ...input, entered_price: dummyPrice });
      const cashPpm = result.predicted.ppm;
      const cashTotal = result.predicted.total;
      const delivM = input.delivery_months;
      const instPct = delivM === 0 ? 5 : delivM <= 12 ? 10 : delivM <= 24 ? 15 : delivM <= 36 ? 22 : 28;
      const instPpm = Math.round(cashPpm * (1 + instPct / 100));
      const instTotal = Math.round(instPpm * input.area_m2);
      const futureHTML = this._rfFutureBlock(cashTotal, result.predicted.total);
      this._renderListRF({ pred: result.predicted, cashPpm, cashTotal, instPpm, instTotal, instPct, input }, panel, futureHTML);
    }
  }

  static _rfFutureBlock(enteredPrice, predictedTotal) {
    try { return this.renderFutureCard(this.computeROI(enteredPrice, predictedTotal)); }
    catch (e) { console.warn('Future block error:', e); return ''; }
  }

  static _renderAssessRF(result, panel, futureHTML) {
    const v = result.verdict, pred = result.predicted, entered = result.entered, market = result.market;
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
            <div class="vc-meta" style="margin-top:8px">Fair Price</div>
            <div class="vc-val">${pred.ppm.toLocaleString()} EGP/m²</div>
          </div>
        </div>
        <div style="border-bottom:1px solid rgba(255,255,255,.1);padding-bottom:14px">
          <div style="font-size:18px;margin-bottom:6px">${result.verdictLabel}</div>
          <div style="color:var(--slate);font-size:11px">Difference: <strong>${result.gap.ppm_egp > 0 ? '+' : ''}${result.gap.ppm_egp.toLocaleString()} EGP/m²</strong> (${result.gap.pct > 0 ? '+' : ''}${result.gap.pct.toFixed(1)}%)</div>
        </div>
        <div class="vc-metrics">
          <div class="vc-m"><div class="vc-mk">Predicted Total</div><div class="vc-mv">${pred.total.toLocaleString()} EGP</div></div>
          <div class="vc-m"><div class="vc-mk">CI (±90%)</div><div class="vc-mv">${pred.ci_low.toLocaleString()} – ${pred.ci_high.toLocaleString()}</div></div>
          <div class="vc-m"><div class="vc-mk">Market Percentile</div><div class="vc-mv">${market.percentile}%</div></div>
          <div class="vc-m"><div class="vc-mk">Comparables</div><div class="vc-mv">${market.comparable_count?.toLocaleString() || 'N/A'}</div></div>
        </div>
      </div>
      <div class="card">
        <div class="ch"><span class="ct">Market Context</span></div>
        <div class="adj-row"><div class="adj-label">Overall Market Avg</div><div class="adj-val">${market.overall_avg?.toLocaleString()} EGP/m²</div></div>
        <div class="adj-row"><div class="adj-label">City Average</div><div class="adj-val">${market.city_avg?.toLocaleString()} EGP/m²</div></div>
        <div class="adj-row"><div class="adj-label">Type Average</div><div class="adj-val">${market.type_avg?.toLocaleString()} EGP/m²</div></div>
      </div>
      ${futureHTML}`;
  }

  static _renderListRF({ pred, cashPpm, cashTotal, instPpm, instTotal, instPct, input }, panel, futureHTML) {
    const fmt = v => Math.round(v).toLocaleString();
    const finLabel = { finished: 'Fully Finished', semi: 'Semi-Finished', core: 'Core & Shell' };
    panel.innerHTML = `
      <div class="card" style="margin-bottom:13px;border-color:rgba(34,209,106,.25);background:linear-gradient(135deg,rgba(34,209,106,.05),rgba(38,80,250,.03))">
        <div class="ch"><div class="ct">Recommended Listing Price</div><span class="badge">🌲 Random Forest</span></div>

        <div style="background:rgba(34,209,106,.08);border:1px solid rgba(34,209,106,.22);border-radius:10px;padding:14px;margin-bottom:10px">
          <div style="font-size:9px;letter-spacing:1.5px;text-transform:uppercase;color:#22d16a;font-weight:700;margin-bottom:6px">💵 Cash Price — Full Payment Now</div>
          <div style="display:flex;align-items:baseline;gap:8px;flex-wrap:wrap">
            <div style="font-size:30px;font-weight:800;color:#22d16a;font-family:'JetBrains Mono'">${fmt(cashTotal)}</div>
            <div style="font-size:12px;color:var(--slate3)">EGP total · ${fmt(cashPpm)}/m²</div>
          </div>
        </div>

        <div style="background:rgba(38,80,250,.06);border:1px solid rgba(38,80,250,.2);border-radius:10px;padding:14px;margin-bottom:12px">
          <div style="font-size:9px;letter-spacing:1.5px;text-transform:uppercase;color:var(--blue);font-weight:700;margin-bottom:6px">📅 Instalment Price — ${input.delivery_months === 0 ? 'Ready Now' : input.delivery_months + ' mo Delivery'}</div>
          <div style="display:flex;align-items:baseline;gap:8px;flex-wrap:wrap">
            <div style="font-size:30px;font-weight:800;color:var(--blue);font-family:'JetBrains Mono'">${fmt(instTotal)}</div>
            <div style="font-size:12px;color:var(--slate3)">EGP total · ${fmt(instPpm)}/m²</div>
          </div>
          <div style="font-size:10px;color:var(--slate);margin-top:4px">+${instPct}% instalment premium over cash</div>
        </div>

        <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:10px">
          <div style="background:var(--bg3);border-radius:8px;padding:10px;text-align:center">
            <div style="font-size:8px;letter-spacing:1px;text-transform:uppercase;color:var(--slate3);margin-bottom:3px">Delivery</div>
            <div style="font-size:14px;font-weight:700;color:var(--txt)">${input.delivery_months === 0 ? 'Ready' : input.delivery_months + ' mo'}</div>
          </div>
          <div style="background:var(--bg3);border-radius:8px;padding:10px;text-align:center">
            <div style="font-size:8px;letter-spacing:1px;text-transform:uppercase;color:var(--slate3);margin-bottom:3px">Finishing</div>
            <div style="font-size:14px;font-weight:700;color:var(--txt)">${finLabel[input.finishing] || input.finishing}</div>
          </div>
          <div style="background:var(--bg3);border-radius:8px;padding:10px;text-align:center">
            <div style="font-size:8px;letter-spacing:1px;text-transform:uppercase;color:var(--slate3);margin-bottom:3px">Inst. Premium</div>
            <div style="font-size:14px;font-weight:700;color:var(--cyan)">+${instPct}%</div>
          </div>
        </div>
      </div>
      ${futureHTML}`;
  }

  // ═══════════════════════════════════════════════════════════════
  //  LLM (GROQ) PATH
  // ═══════════════════════════════════════════════════════════════

  static async _handleLLM(input, scenario, settings, panel) {
    const ai = await this._callGroq(input, scenario, settings);
    if (scenario === 'assess') {
      this._renderAssessLLM(ai, input, settings, panel);
    } else {
      this._renderListLLM(ai, input, settings, panel);
    }
  }

  static async _callGroq(input, scenario, settings) {
    const deliveryLabel = input.delivery_months === 0 ? 'Ready Now — immediate handover' : `${input.delivery_months} months away (off-plan)`;
    const finishingMap = { finished: 'Fully Finished', semi: 'Semi-Finished', core: 'Core & Shell (Raw)' };
    const finishingLabel = finishingMap[input.finishing] || input.finishing;
    const luxuryPct = Math.round(input.luxury_score * 100);
    const locationLine = [input.district, input.city].filter(Boolean).join(', ');

    const cairoContext = `CAIRO PRICE INTELLIGENCE:
Premium (EGP/m²): Zamalek 80k–180k · Garden City 80k–150k · Maadi Sarayat/Degla 55k–100k · Katameya Heights 60k–110k
High: New Cairo 5th Settlement 45k–90k · Rehab/Madinaty 35k–65k · Heliopolis 45k–75k · Mohandessin 40k–65k
Mid: Nasr City 25k–45k · Ain Shams 20k–35k · October City 20k–40k · Shorouk 20k–38k
Budget: Helwan 10k–22k · Obour 12k–25k · El-Basatin 8k–18k
Construction: Iron=${input.iron.toLocaleString()} EGP/ton · Cement=${input.cement.toLocaleString()} EGP/ton · USD/EGP=${input.usd_to_egp_rate}`;

    const propertyBlock = `PROPERTY:
- Type: ${input.property_type} | Location: ${locationLine || input.city} | Compound: ${input.compound || 'N/A'}
- Area: ${input.area_m2} m² | Beds: ${input.bedrooms} | Baths: ${input.bathrooms}
- Finishing: ${finishingLabel} | Delivery: ${deliveryLabel}
- Luxury score: ${luxuryPct}/100 | Distance to centre: ${input.distance_to_center} km${input.extra_features ? `\n- Additional context: ${input.extra_features}` : ''}`;

    const futureSchema = `"future_projection": {
    "yr1_price": <integer EGP — estimated unit value in 1 year>,
    "yr3_price": <integer EGP>,
    "yr5_price": <integer EGP>,
    "yr10_price": <integer EGP>,
    "annual_cagr_pct": <number, estimated annual price growth for this specific area>,
    "growth_drivers": ["<key growth driver 1>", "<driver 2>", "<driver 3>"],
    "growth_narrative": "<2-3 sentences on price direction for this area in next 5 years>"
  }`;

    let taskBlock, schema;

    if (scenario === 'assess') {
      const ePpm = Math.round(input.entered_price / input.area_m2);
      taskBlock = `TASK — ASSESS THIS ASKING PRICE:
The seller asks ${input.entered_price.toLocaleString()} EGP total (${ePpm.toLocaleString()} EGP/m²).
Verdict: is it fair, over, or underpriced? Then project future value at 1, 3, 5, 10 years.`;

      schema = `{
  "verdict": "<fair|underpriced|overpriced|significantly_underpriced|significantly_overpriced>",
  "verdict_label": "<Fair Price|Underpriced|Overpriced|Significantly Underpriced|Significantly Overpriced>",
  "verdict_emoji": "<↓↓|↓|✓|↑|↑↑>",
  "fair_price_low": <integer EGP>, "fair_price_high": <integer EGP>, "fair_price_mid": <integer EGP>,
  "fair_ppm": <integer EGP/m²>,
  "gap_pct": <number, positive=overpriced, negative=underpriced>,
  "location_analysis": "<2-3 sentences on price levels in this exact district vs nearby areas>",
  "assessment_summary": "<3-4 sentences explaining verdict with market reasoning>",
  "key_price_drivers": ["<driver 1>", "<driver 2>", "<driver 3>"],
  "negotiation_tip": "<1-2 sentences of practical negotiation advice>",
  "market_outlook": "<1-2 sentences: short-term price direction for this area>",
  "comparable_areas": "<1-2 comparable neighbourhoods with typical price range>",
  ${futureSchema}
}`;
    } else {
      const installNote = input.delivery_months === 0
        ? 'Ready now — instalment premium ~5% over cash.'
        : `${input.delivery_months}-month delivery — instalment premium should be ${input.delivery_months <= 12 ? '~10%' : input.delivery_months <= 24 ? '~15%' : input.delivery_months <= 36 ? '~22%' : '~28%'} over cash.`;

      taskBlock = `TASK — LISTING PRICE RECOMMENDATION:
Owner wants to SELL. Provide: (1) cash price (buyer pays upfront now), (2) instalment price (buyer pays in stages).
${installNote}
Also project future value at 1, 3, 5, 10 years (from today at cash price).`;

      schema = `{
  "cash_price_low": <integer EGP>, "cash_price_high": <integer EGP>, "cash_price_mid": <integer EGP>,
  "cash_ppm": <integer EGP/m²>,
  "installment_price_low": <integer EGP>, "installment_price_high": <integer EGP>, "installment_price_mid": <integer EGP>,
  "installment_ppm": <integer EGP/m²>,
  "installment_premium_pct": <number>,
  "cash_discount_note": "<what cash discount sellers typically offer in this market>",
  "finishing_impact": "<how this finishing level affects pricing>",
  "location_analysis": "<2-3 sentences on demand and prices in this location>",
  "listing_strategy": "<3-4 sentences on how to position and sell this unit>",
  "key_price_drivers": ["<driver 1>", "<driver 2>", "<driver 3>"],
  "best_buyer_profile": "<who is the ideal buyer and why>",
  "time_to_sell_estimate": "<typical time to close at this price>",
  "market_outlook": "<1-2 sentences: price direction in next 12 months>",
  ${futureSchema}
}`;
    }

    const prompt = `You are a senior Egyptian real estate valuation expert with deep knowledge of Cairo district pricing, construction costs, delivery premiums, and 2024-2025 market dynamics.

${cairoContext}

${propertyBlock}

${taskBlock}

Respond ONLY with a valid JSON object — no markdown, no backticks, no extra text:
${schema}`;

    const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${settings.groqApiKey}` },
      body: JSON.stringify({ model: settings.groqModel || 'llama-3.3-70b-versatile', messages: [{ role: 'user', content: prompt }], max_tokens: 2000, temperature: 0.15 }),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err?.error?.message || `Groq API error ${res.status}`);
    }
    const data = await res.json();
    const clean = (data.choices?.[0]?.message?.content || '').replace(/```json|```/g, '').trim();
    try { return JSON.parse(clean); }
    catch { throw new Error('AI returned an unreadable response — please try again.'); }
  }

  // ── Render LLM Assess ─────────────────────────────────────────────────────
  static _renderAssessLLM(ai, input, settings, panel) {
    const modelShort = (settings.groqModel || '').split('-').slice(0, 3).join(' ') || 'Groq AI';
    const fmt = v => Math.round(v).toLocaleString();
    const llmTag = `<span style="font-size:8px;padding:2px 9px;border-radius:20px;background:rgba(38,80,250,.12);border:1px solid rgba(38,80,250,.3);color:var(--blue);font-weight:600">⚡ ${modelShort}</span>`;
    const vColors = { significantly_underpriced: '#52B07A', underpriced: '#7AD4A0', fair: '#D4AE52', overpriced: '#D4834A', significantly_overpriced: '#C05A4A' };
    const vColor = vColors[ai.verdict] || 'var(--gold)';
    const gapSign = ai.gap_pct > 0 ? '+' : '';
    const gapColor = ai.gap_pct > 7 ? 'var(--red)' : ai.gap_pct < -7 ? 'var(--grn)' : 'var(--amb)';
    const ePpm = Math.round(input.entered_price / input.area_m2);
    const futureHTML = ai.future_projection ? this.renderFutureCardLLM(ai.future_projection, input.entered_price) : '';

    panel.innerHTML = `
      <div class="card" style="margin-bottom:13px;border-color:${vColor}40;background:linear-gradient(135deg,${vColor}0a,${vColor}04)">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:16px;flex-wrap:wrap;gap:8px">
          <div style="display:flex;align-items:center;gap:10px">
            <div style="width:38px;height:38px;border-radius:10px;background:${vColor}22;display:flex;align-items:center;justify-content:center;font-size:20px">${ai.verdict_emoji}</div>
            <div>
              <div style="font-size:9px;letter-spacing:2px;text-transform:uppercase;color:var(--slate3)">AI Price Assessment</div>
              <div style="font-size:19px;font-weight:700;color:${vColor};margin-top:2px">${ai.verdict_label}</div>
            </div>
          </div>
          ${llmTag}
        </div>
        <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:10px;margin-bottom:14px">
          <div style="background:var(--bg3);border-radius:8px;padding:10px 12px;text-align:center">
            <div style="font-size:8px;letter-spacing:1px;text-transform:uppercase;color:var(--slate3);margin-bottom:3px">Your Price/m²</div>
            <div style="font-size:16px;font-weight:700;color:var(--txt);font-family:'JetBrains Mono'">${fmt(ePpm)}</div>
            <div style="font-size:8px;color:var(--slate3)">EGP/m²</div>
          </div>
          <div style="background:var(--bg3);border-radius:8px;padding:10px 12px;text-align:center">
            <div style="font-size:8px;letter-spacing:1px;text-transform:uppercase;color:var(--slate3);margin-bottom:3px">Fair Price/m²</div>
            <div style="font-size:16px;font-weight:700;color:var(--gold);font-family:'JetBrains Mono'">${fmt(ai.fair_ppm)}</div>
            <div style="font-size:8px;color:var(--slate3)">EGP/m²</div>
          </div>
          <div style="background:var(--bg3);border-radius:8px;padding:10px 12px;text-align:center">
            <div style="font-size:8px;letter-spacing:1px;text-transform:uppercase;color:var(--slate3);margin-bottom:3px">Gap</div>
            <div style="font-size:16px;font-weight:700;color:${gapColor};font-family:'JetBrains Mono'">${gapSign}${ai.gap_pct?.toFixed(1)}%</div>
            <div style="font-size:8px;color:var(--slate3)">vs fair value</div>
          </div>
        </div>
        <div style="background:var(--bg3);border-radius:8px;padding:12px;margin-bottom:12px">
          <div style="font-size:8px;letter-spacing:1px;text-transform:uppercase;color:var(--slate3);margin-bottom:5px">Fair Value Range</div>
          <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">
            <span style="font-family:'JetBrains Mono';font-size:11px;color:var(--txt2)">${fmt(ai.fair_price_low)}</span>
            <div style="flex:1;height:4px;background:var(--br);border-radius:2px;min-width:30px;position:relative"><div style="position:absolute;inset:0;background:linear-gradient(90deg,var(--grn),var(--amb),var(--red));border-radius:2px;opacity:.35"></div><div style="position:absolute;top:-4px;left:50%;width:12px;height:12px;border-radius:50%;background:var(--gold);border:2px solid var(--bg);transform:translateX(-50%)"></div></div>
            <span style="font-family:'JetBrains Mono';font-size:11px;color:var(--txt2)">${fmt(ai.fair_price_high)}</span>
          </div>
          <div style="text-align:center;margin-top:5px;font-size:12px;color:var(--gold);font-weight:600">Mid: ${fmt(ai.fair_price_mid)} EGP</div>
        </div>
        <div style="font-size:11px;color:var(--txt2);line-height:1.65;padding:12px;background:var(--bg3);border-radius:8px">${ai.assessment_summary}</div>
      </div>
      <div class="card" style="margin-bottom:13px">
        <div class="ch"><div class="ct">Location Analysis</div></div>
        <div style="font-size:11px;color:var(--txt2);line-height:1.65;margin-bottom:10px">${ai.location_analysis}</div>
        ${ai.comparable_areas ? `<div style="font-size:10px;color:var(--slate);padding:8px 10px;background:var(--bg3);border-radius:6px;margin-bottom:10px">📍 ${ai.comparable_areas}</div>` : ''}
        <div style="font-size:8px;letter-spacing:1.5px;text-transform:uppercase;color:var(--slate3);margin-bottom:7px;font-weight:600">Key Price Drivers</div>
        ${(ai.key_price_drivers || []).map(d => `<div style="font-size:10.5px;color:var(--txt2);padding:6px 0;border-bottom:1px solid var(--br);display:flex;gap:7px;line-height:1.45"><span style="color:var(--gold);flex-shrink:0">→</span>${d}</div>`).join('')}
      </div>
      <div class="card" style="margin-bottom:0">
        <div class="ch"><div class="ct">Advice &amp; Outlook</div></div>
        ${ai.negotiation_tip ? `<div style="padding:11px;background:rgba(38,80,250,.06);border-radius:8px;border-left:2px solid var(--blue);margin-bottom:10px"><div style="font-size:8px;letter-spacing:1px;text-transform:uppercase;color:var(--blue);margin-bottom:3px;font-weight:600">💡 Negotiation Tip</div><div style="font-size:11px;color:var(--txt2);line-height:1.5">${ai.negotiation_tip}</div></div>` : ''}
        ${ai.market_outlook ? `<div style="padding:11px;background:var(--bg3);border-radius:8px"><div style="font-size:8px;letter-spacing:1px;text-transform:uppercase;color:var(--slate3);margin-bottom:3px;font-weight:600">📈 Market Outlook</div><div style="font-size:11px;color:var(--txt2);line-height:1.5">${ai.market_outlook}</div></div>` : ''}
      </div>
      ${futureHTML}`;
  }

  // ── Render LLM List ───────────────────────────────────────────────────────
  static _renderListLLM(ai, input, settings, panel) {
    const modelShort = (settings.groqModel || '').split('-').slice(0, 3).join(' ') || 'Groq AI';
    const fmt = v => Math.round(v).toLocaleString();
    const llmTag = `<span style="font-size:8px;padding:2px 9px;border-radius:20px;background:rgba(38,80,250,.12);border:1px solid rgba(38,80,250,.3);color:var(--blue);font-weight:600">⚡ ${modelShort}</span>`;
    const futureHTML = ai.future_projection ? this.renderFutureCardLLM(ai.future_projection, ai.cash_price_mid) : '';

    panel.innerHTML = `
      <div class="card" style="margin-bottom:13px;border-color:rgba(34,209,106,.25);background:linear-gradient(135deg,rgba(34,209,106,.05),rgba(38,80,250,.03))">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:16px;flex-wrap:wrap;gap:8px">
          <div style="display:flex;align-items:center;gap:10px">
            <div style="width:38px;height:38px;border-radius:10px;background:rgba(34,209,106,.15);display:flex;align-items:center;justify-content:center;font-size:20px">🏷️</div>
            <div>
              <div style="font-size:9px;letter-spacing:2px;text-transform:uppercase;color:var(--slate3)">AI Listing Recommendation</div>
              <div style="font-size:14px;font-weight:700;color:var(--txt);margin-top:2px">${[input.district, input.city].filter(Boolean).join(', ')} · ${input.area_m2} m²</div>
            </div>
          </div>
          ${llmTag}
        </div>

        <div style="background:rgba(34,209,106,.08);border:1px solid rgba(34,209,106,.25);border-radius:10px;padding:14px;margin-bottom:10px">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;flex-wrap:wrap;gap:4px">
            <div style="font-size:9px;letter-spacing:1.5px;text-transform:uppercase;color:#22d16a;font-weight:700">💵 Cash Price — Full Payment Now</div>
            <div style="font-size:10px;color:var(--slate3);font-family:'JetBrains Mono'">${fmt(ai.cash_ppm)} EGP/m²</div>
          </div>
          <div style="display:flex;align-items:baseline;gap:8px;flex-wrap:wrap;margin-bottom:4px">
            <div style="font-size:11px;color:var(--slate3);font-family:'JetBrains Mono'">${fmt(ai.cash_price_low)} –</div>
            <div style="font-size:28px;font-weight:800;color:#22d16a;font-family:'JetBrains Mono'">${fmt(ai.cash_price_mid)}</div>
            <div style="font-size:11px;color:var(--slate3);font-family:'JetBrains Mono'">– ${fmt(ai.cash_price_high)} EGP</div>
          </div>
          ${ai.cash_discount_note ? `<div style="font-size:10px;color:var(--slate);line-height:1.4;margin-top:5px">${ai.cash_discount_note}</div>` : ''}
        </div>

        <div style="background:rgba(38,80,250,.06);border:1px solid rgba(38,80,250,.2);border-radius:10px;padding:14px;margin-bottom:12px">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;flex-wrap:wrap;gap:4px">
            <div style="font-size:9px;letter-spacing:1.5px;text-transform:uppercase;color:var(--blue);font-weight:700">📅 Instalment Price — ${input.delivery_months === 0 ? 'Ready Now' : input.delivery_months + ' mo Delivery'}</div>
            <div style="font-size:10px;color:var(--slate3);font-family:'JetBrains Mono'">${fmt(ai.installment_ppm)} EGP/m²</div>
          </div>
          <div style="display:flex;align-items:baseline;gap:8px;flex-wrap:wrap;margin-bottom:4px">
            <div style="font-size:11px;color:var(--slate3);font-family:'JetBrains Mono'">${fmt(ai.installment_price_low)} –</div>
            <div style="font-size:28px;font-weight:800;color:var(--blue);font-family:'JetBrains Mono'">${fmt(ai.installment_price_mid)}</div>
            <div style="font-size:11px;color:var(--slate3);font-family:'JetBrains Mono'">– ${fmt(ai.installment_price_high)} EGP</div>
          </div>
          <div style="font-size:10px;color:var(--slate);margin-top:4px">+${ai.installment_premium_pct?.toFixed(1) || '—'}% instalment premium over cash</div>
        </div>

        ${ai.finishing_impact ? `<div style="padding:10px 12px;background:rgba(245,166,35,.06);border:1px solid rgba(245,166,35,.18);border-radius:8px;margin-bottom:12px"><div style="font-size:8px;letter-spacing:1px;text-transform:uppercase;color:var(--amb);margin-bottom:3px;font-weight:600">🏗️ Finishing Impact</div><div style="font-size:10.5px;color:var(--txt2);line-height:1.5">${ai.finishing_impact}</div></div>` : ''}
      </div>

      <div class="card" style="margin-bottom:13px">
        <div class="ch"><div class="ct">Location &amp; Market Analysis</div></div>
        <div style="font-size:11px;color:var(--txt2);line-height:1.65;margin-bottom:12px">${ai.location_analysis}</div>
        <div style="font-size:8px;letter-spacing:1.5px;text-transform:uppercase;color:var(--slate3);margin-bottom:7px;font-weight:600">Key Price Drivers</div>
        ${(ai.key_price_drivers || []).map(d => `<div style="font-size:10.5px;color:var(--txt2);padding:6px 0;border-bottom:1px solid var(--br);display:flex;gap:7px;line-height:1.45"><span style="color:var(--gold);flex-shrink:0">→</span>${d}</div>`).join('')}
      </div>

      <div class="card" style="margin-bottom:0">
        <div class="ch"><div class="ct">Listing Strategy</div></div>
        <div style="font-size:11px;color:var(--txt2);line-height:1.65;margin-bottom:12px">${ai.listing_strategy}</div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
          ${ai.best_buyer_profile ? `<div style="background:var(--bg3);border-radius:8px;padding:10px 12px"><div style="font-size:8px;letter-spacing:1px;text-transform:uppercase;color:var(--slate3);margin-bottom:3px">Ideal Buyer</div><div style="font-size:10.5px;color:var(--txt2);line-height:1.45">${ai.best_buyer_profile}</div></div>` : ''}
          ${ai.time_to_sell_estimate ? `<div style="background:var(--bg3);border-radius:8px;padding:10px 12px"><div style="font-size:8px;letter-spacing:1px;text-transform:uppercase;color:var(--slate3);margin-bottom:3px">Time to Sell</div><div style="font-size:10.5px;color:var(--txt2);line-height:1.45">${ai.time_to_sell_estimate}</div></div>` : ''}
        </div>
        ${ai.market_outlook ? `<div style="margin-top:10px;padding:10px 12px;background:rgba(38,191,248,.06);border-radius:8px;border-left:2px solid var(--cyan)"><div style="font-size:8px;letter-spacing:1px;text-transform:uppercase;color:var(--cyan);margin-bottom:2px;font-weight:600">📈 Market Outlook</div><div style="font-size:10.5px;color:var(--txt2);line-height:1.5">${ai.market_outlook}</div></div>` : ''}
      </div>
      ${futureHTML}`;
  }

  // ═══════════════════════════════════════════════════════════════
  //  FUTURE PRICE PROJECTION CARDS
  // ═══════════════════════════════════════════════════════════════

  // RF mode — dataset-derived CAGR
  static renderFutureCard(roi) {
    const fmt = v => Math.round(v).toLocaleString();
    const fmtPct = v => (v > 0 ? '+' : '') + v.toFixed(1) + '%';
    const growPct = (roi.annualGrowthRate * 100).toFixed(1);
    const usdPct = (roi.usdGrowthRate * 100).toFixed(1);

    const rows = roi.projections.map(p => {
      const col = p.roiPct >= 100 ? '#22d16a' : p.roiPct >= 40 ? '#26bff8' : p.roiPct >= 15 ? '#f5a623' : '#9ba3c4';
      const rCol = p.realRoi > 0 ? '#22d16a' : '#ff4f4f';
      return `<tr>
        <td style="font-family:'JetBrains Mono';font-weight:600;color:var(--txt2);padding:7px 6px;white-space:nowrap">${p.yr} yr${p.yr > 1 ? 's' : ''}</td>
        <td style="font-family:'JetBrains Mono';color:var(--txt);padding:7px 6px">${fmt(p.futureValue)} EGP</td>
        <td style="font-family:'JetBrains Mono';color:${col};font-weight:700;padding:7px 6px">${fmtPct(p.roiPct)}</td>
        <td style="font-family:'JetBrains Mono';color:${col};padding:7px 6px">${fmt(p.gain)} EGP</td>
        <td style="font-family:'JetBrains Mono';font-size:10px;color:${rCol};padding:7px 6px">${fmtPct(p.realRoi)} USD</td>
      </tr>`;
    }).join('');

    let sparkSVG = '';
    const pts = (roi.dataPoints || []).slice(-24);
    if (pts.length >= 2) {
      const vals = pts.map(p => p.value);
      const mn = Math.min(...vals), mx = Math.max(...vals), range = mx - mn || 1;
      const W = 260, H = 44, pad = 4;
      const coords = pts.map((p, i) => {
        const x = pad + (i / (pts.length - 1)) * (W - pad * 2);
        const y = H - pad - ((p.value - mn) / range) * (H - pad * 2);
        return `${x.toFixed(1)},${y.toFixed(1)}`;
      });
      const last = coords[coords.length - 1].split(',');
      sparkSVG = `<div style="margin-bottom:10px"><div style="font-size:9px;color:var(--slate3);text-transform:uppercase;letter-spacing:1.2px;margin-bottom:2px">EGP/m² Dataset Trend</div>
        <svg viewBox="0 0 ${W} ${H}" style="width:100%;height:44px">
          <defs><linearGradient id="fpG" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#2650fa" stop-opacity="0.3"/><stop offset="100%" stop-color="#2650fa" stop-opacity="0.02"/></linearGradient></defs>
          <polygon points="${pad},${H - pad} ${coords.join(' ')} ${W - pad},${H - pad}" fill="url(#fpG)"/>
          <polyline points="${coords.join(' ')}" fill="none" stroke="#26bff8" stroke-width="1.8" stroke-linejoin="round" stroke-linecap="round"/>
          <circle cx="${last[0]}" cy="${last[1]}" r="3" fill="#26bff8"/>
        </svg></div>`;
    }

    const doubleYrs = roi.doubleYears
      ? `<div style="flex:1;min-width:90px;background:var(--bg3);border-radius:8px;padding:10px 12px"><div style="font-size:8px;color:var(--slate);text-transform:uppercase;letter-spacing:1px;margin-bottom:3px">Value Doubles</div><div style="font-size:19px;font-weight:800;color:var(--cyan);font-family:'JetBrains Mono'">${roi.doubleYears} yrs</div><div style="font-size:9px;color:var(--slate3)">at ${growPct}% CAGR</div></div>` : '';

    return `<div class="future-pred-card">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:14px;gap:10px;flex-wrap:wrap">
        <div style="display:flex;align-items:center;gap:10px">
          <div style="width:32px;height:32px;border-radius:8px;background:rgba(38,80,250,.15);display:flex;align-items:center;justify-content:center;font-size:16px">📈</div>
          <div>
            <div style="font-size:12px;font-weight:700;color:var(--txt)">Future Value Projections</div>
            <div style="font-size:9px;color:var(--slate)">Dataset-derived CAGR · ${(roi.dataPoints || []).length} data points · 🌲 RF</div>
          </div>
        </div>
        <div style="display:flex;gap:6px;flex-wrap:wrap">
          <div style="background:rgba(38,80,250,.1);border:1px solid rgba(38,80,250,.25);border-radius:6px;padding:3px 9px;text-align:center"><div style="font-size:8px;color:var(--slate);font-family:'JetBrains Mono'">CAGR</div><div style="font-size:12px;font-weight:700;color:var(--cyan);font-family:'JetBrains Mono'">${growPct}%/yr</div></div>
          <div style="background:rgba(255,79,79,.07);border:1px solid rgba(255,79,79,.2);border-radius:6px;padding:3px 9px;text-align:center"><div style="font-size:8px;color:var(--slate);font-family:'JetBrains Mono'">EGP DEVAL</div><div style="font-size:12px;font-weight:700;color:#ff7b7b;font-family:'JetBrains Mono'">${usdPct}%/yr</div></div>
        </div>
      </div>
      ${sparkSVG}
      <div style="overflow-x:auto"><table style="width:100%;border-collapse:collapse;font-size:11px">
        <thead><tr style="border-bottom:1px solid var(--br)">
          <th style="text-align:left;padding:6px;color:var(--slate3);font-size:9px;font-weight:600;letter-spacing:1px;text-transform:uppercase">Horizon</th>
          <th style="text-align:left;padding:6px;color:var(--slate3);font-size:9px;font-weight:600;letter-spacing:1px;text-transform:uppercase">Est. Value</th>
          <th style="text-align:left;padding:6px;color:var(--slate3);font-size:9px;font-weight:600;letter-spacing:1px;text-transform:uppercase">Nominal ROI</th>
          <th style="text-align:left;padding:6px;color:var(--slate3);font-size:9px;font-weight:600;letter-spacing:1px;text-transform:uppercase">Gain (EGP)</th>
          <th style="text-align:left;padding:6px;color:var(--slate3);font-size:9px;font-weight:600;letter-spacing:1px;text-transform:uppercase">Real ROI</th>
        </tr></thead>
        <tbody>${rows}</tbody>
      </table></div>
      <div style="display:flex;gap:10px;flex-wrap:wrap;margin-top:12px;padding-top:10px;border-top:1px solid var(--br)">
        ${doubleYrs}
        <div style="flex:1;min-width:90px;background:var(--bg3);border-radius:8px;padding:10px 12px"><div style="font-size:8px;color:var(--slate);text-transform:uppercase;letter-spacing:1px;margin-bottom:3px">5-yr Real Gain</div><div style="font-size:19px;font-weight:800;font-family:'JetBrains Mono';color:${roi.projections[2].realRoi > 0 ? '#22d16a' : '#ff4f4f'}">${fmtPct(roi.projections[2].realRoi)}</div><div style="font-size:9px;color:var(--slate3)">vs USD purchasing power</div></div>
        <div style="flex:1;min-width:90px;background:var(--bg3);border-radius:8px;padding:10px 12px"><div style="font-size:8px;color:var(--slate);text-transform:uppercase;letter-spacing:1px;margin-bottom:3px">10-yr Value</div><div style="font-size:19px;font-weight:800;font-family:'JetBrains Mono';color:var(--cyan)">${fmt(roi.projections[3].futureValue)}</div><div style="font-size:9px;color:var(--slate3)">EGP estimated</div></div>
      </div>
      <div style="margin-top:10px;padding:7px 10px;background:rgba(245,166,35,.06);border:1px solid rgba(245,166,35,.18);border-radius:6px;font-size:9px;color:var(--slate);line-height:1.6">⚠ Projections use CAGR derived from your uploaded dataset. Past performance does not guarantee future results.</div>
    </div>`;
  }

  // LLM mode — Groq-provided projections
  static renderFutureCardLLM(fp, basePrice) {
    const fmt = v => Math.round(v).toLocaleString();
    const base = basePrice || fp.yr1_price || 1;
    const horizons = [
      { yr: 1, val: fp.yr1_price }, { yr: 3, val: fp.yr3_price },
      { yr: 5, val: fp.yr5_price }, { yr: 10, val: fp.yr10_price },
    ].filter(h => h.val);
    const maxVal = Math.max(...horizons.map(h => h.val));

    const bars = horizons.map(h => {
      const pct = maxVal ? Math.round((h.val / maxVal) * 100) : 0;
      const roi = ((h.val - base) / base * 100);
      const col = roi >= 100 ? '#22d16a' : roi >= 40 ? '#26bff8' : roi >= 15 ? '#f5a623' : '#9ba3c4';
      const sign = roi >= 0 ? '+' : '';
      return `<div style="margin-bottom:10px">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px;font-size:10px">
          <span style="font-weight:600;color:var(--txt2)">Year ${h.yr}</span>
          <div style="display:flex;gap:10px;align-items:center">
            <span style="font-family:'JetBrains Mono';color:var(--txt)">${fmt(h.val)} EGP</span>
            <span style="font-family:'JetBrains Mono';color:${col};font-weight:700;font-size:9px">${sign}${roi.toFixed(1)}%</span>
          </div>
        </div>
        <div style="height:6px;background:var(--bg3);border-radius:3px;overflow:hidden">
          <div style="height:100%;width:${pct}%;background:linear-gradient(90deg,var(--blue),${col});border-radius:3px"></div>
        </div>
      </div>`;
    }).join('');

    return `<div class="future-pred-card">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:14px;flex-wrap:wrap;gap:8px">
        <div style="display:flex;align-items:center;gap:10px">
          <div style="width:32px;height:32px;border-radius:8px;background:rgba(38,80,250,.15);display:flex;align-items:center;justify-content:center;font-size:16px">📈</div>
          <div>
            <div style="font-size:12px;font-weight:700;color:var(--txt)">Future Value Projections</div>
            <div style="font-size:9px;color:var(--slate)">AI-powered forecast · ⚡ Groq</div>
          </div>
        </div>
        <div style="background:rgba(38,80,250,.1);border:1px solid rgba(38,80,250,.25);border-radius:6px;padding:3px 9px;text-align:center">
          <div style="font-size:8px;color:var(--slate);font-family:'JetBrains Mono'">Est. CAGR</div>
          <div style="font-size:12px;font-weight:700;color:var(--cyan);font-family:'JetBrains Mono'">${fp.annual_cagr_pct?.toFixed(1) || '—'}%/yr</div>
        </div>
      </div>
      ${bars}
      ${fp.growth_narrative ? `<div style="font-size:10.5px;color:var(--txt2);line-height:1.6;padding:10px 12px;background:var(--bg3);border-radius:8px;margin-top:10px">${fp.growth_narrative}</div>` : ''}
      ${(fp.growth_drivers || []).length ? `<div style="margin-top:10px"><div style="font-size:8px;letter-spacing:1px;text-transform:uppercase;color:var(--slate3);margin-bottom:5px;font-weight:600">Growth Drivers</div>${fp.growth_drivers.map(d => `<div style="font-size:10px;color:var(--txt2);padding:5px 0;border-bottom:1px solid var(--br);display:flex;gap:7px;line-height:1.4"><span style="color:var(--cyan);flex-shrink:0">↑</span>${d}</div>`).join('')}</div>` : ''}
      <div style="margin-top:10px;padding:7px 10px;background:rgba(245,166,35,.06);border:1px solid rgba(245,166,35,.18);border-radius:6px;font-size:9px;color:var(--slate);line-height:1.6">⚠ AI projections are market-based estimates, not financial advice. Actual values may vary significantly.</div>
    </div>`;
  }

  // ═══════════════════════════════════════════════════════════════
  //  ROI ENGINE — used by RF future predictions
  // ═══════════════════════════════════════════════════════════════

  static computeROI(enteredPrice, predictedTotal) {
    const monthly = (this.stats || {}).monthly || {};
    const usdByMonth = (this.stats || {}).usdByMonth || {};
    function parseKey(k) { const p = k.split('-'); return parseInt(p[0], 10) + (parseInt(p[1], 10) - 1) / 12; }

    let growthRate = 0.18;
    const mKeys = Object.keys(monthly).sort();
    const dataPoints = mKeys.map(k => ({ label: k, value: monthly[k] }));
    if (mKeys.length >= 6) {
      const h = mKeys.slice(0, 3), t = mKeys.slice(-3);
      const avgH = h.reduce((s, k) => s + monthly[k], 0) / h.length;
      const avgT = t.reduce((s, k) => s + monthly[k], 0) / t.length;
      const yrs = parseKey(t[1]) - parseKey(h[1]);
      if (yrs > 0.3 && avgH > 0) growthRate = Math.max(0.05, Math.min(0.60, Math.pow(avgT / avgH, 1 / yrs) - 1));
    }

    let usdRate = 0;
    const uKeys = Object.keys(usdByMonth).sort();
    if (uKeys.length >= 4) {
      const uH = (usdByMonth[uKeys[0]] + usdByMonth[uKeys[1]]) / 2;
      const uT = (usdByMonth[uKeys[uKeys.length - 2]] + usdByMonth[uKeys[uKeys.length - 1]]) / 2;
      const uY = parseKey(uKeys[uKeys.length - 1]) - parseKey(uKeys[0]);
      if (uY > 0.3 && uH > 0) usdRate = Math.max(0, Math.min(0.50, Math.pow(uT / uH, 1 / uY) - 1));
    }

    const projections = [1, 3, 5, 10].map(yr => {
      const fv = enteredPrice * Math.pow(1 + growthRate, yr);
      const gain = fv - enteredPrice;
      return { yr, futureValue: Math.round(fv), gain: Math.round(gain), roiPct: Math.round((gain / enteredPrice * 100) * 10) / 10, realRoi: Math.round(((Math.pow(1 + growthRate, yr) / Math.pow(1 + usdRate, yr)) - 1) * 1000) / 10 };
    });

    return {
      annualGrowthRate: growthRate, usdGrowthRate: usdRate, projections, dataPoints,
      entryDiscount: predictedTotal > 0 ? (predictedTotal - enteredPrice) / predictedTotal : 0,
      entryBonus: predictedTotal > 0 ? Math.round(((predictedTotal - enteredPrice) / predictedTotal) * 1000) / 10 : 0,
      doubleYears: growthRate > 0 ? Math.round((Math.log(2) / Math.log(1 + growthRate)) * 10) / 10 : null,
    };
  }

  static onActive() {
    this.updateModelBadge();
    this._updateExtraFeaturesVisibility();
  }
}
