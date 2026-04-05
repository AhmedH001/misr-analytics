'use strict';
// ═══════════════════════════════════════════════════════════════════
//  MISR Analytics — Egypt Real Estate Intelligence Server
//  Endpoints:  GET  /api/health   GET  /api/stats
//              POST /api/upload   POST /api/predict
// ═══════════════════════════════════════════════════════════════════

const express = require('express');
const multer  = require('multer');
const path    = require('path');

const app    = express();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 60 * 1024 * 1024 } });

app.use(express.json({ limit: '10mb' }));
app.use(express.static(path.join(__dirname, '../public')));

// ───────────────────────────────────────────────────────────────────
// GLOBAL STATE
// ───────────────────────────────────────────────────────────────────
const STATE = {
  rows:   [],
  colMap: {},
  model:  null,   // { w, means, stds, r2, rmse, resSd, nSamples }
  stats:  null,   // { avgPpm, byCity, byType, byCompound, monthly, ... }
  ready:  false,
  source: 'demo',
};

// ───────────────────────────────────────────────────────────────────
// MATRIX MATH  (Normal-equation OLS — no dependencies needed)
// ───────────────────────────────────────────────────────────────────
const Mat = {
  // Transpose: m×n → n×m
  T(A) {
    if (!A.length) return [];
    return A[0].map((_, j) => A.map(row => row[j]));
  },
  // Matrix × Matrix
  mul(A, B) {
    const m = A.length, k = B.length, n = B[0].length;
    return Array.from({ length: m }, (_, i) =>
      Array.from({ length: n }, (_, j) =>
        A[i].reduce((s, _, l) => s + A[i][l] * B[l][j], 0)));
  },
  // Matrix × Vector
  mulV(A, v) {
    return A.map(row => row.reduce((s, a, j) => s + a * v[j], 0));
  },
  // Gauss-Jordan inversion with partial pivoting
  inv(A) {
    const n = A.length;
    const M = A.map((row, i) =>
      [...row, ...Array.from({ length: n }, (_, j) => (i === j ? 1 : 0))]);
    for (let c = 0; c < n; c++) {
      let pivR = c;
      for (let r = c + 1; r < n; r++)
        if (Math.abs(M[r][c]) > Math.abs(M[pivR][c])) pivR = r;
      [M[c], M[pivR]] = [M[pivR], M[c]];
      const piv = M[c][c];
      if (Math.abs(piv) < 1e-12) { M[c][c] += 1e-8; continue; }
      for (let j = 0; j < 2 * n; j++) M[c][j] /= piv;
      for (let r = 0; r < n; r++) {
        if (r === c) continue;
        const f = M[r][c];
        for (let j = 0; j < 2 * n; j++) M[r][j] -= f * M[c][j];
      }
    }
    return M.map(row => row.slice(n));
  },
};

// ───────────────────────────────────────────────────────────────────
// UTILITIES
// ───────────────────────────────────────────────────────────────────
const toNum  = v  => { const n = parseFloat(v); return isNaN(n) ? null : n; };
const mean   = arr => { const a = arr.filter(v => v != null && isFinite(v)); return a.length ? a.reduce((s, v) => s + v, 0) / a.length : 0; };
const pctile = (arr, p) => { const s = [...arr].sort((a, b) => a - b); return s[Math.max(0, Math.floor(p / 100 * s.length) - 1)] ?? 0; };

// ───────────────────────────────────────────────────────────────────
// CSV PARSER  (auto-detects delimiter & column names)
// ───────────────────────────────────────────────────────────────────
function detectDelim(line) {
  const c = { ',': 0, ';': 0, '\t': 0 };
  for (const ch of line) if (c[ch] !== undefined) c[ch]++;
  return Object.entries(c).sort((a, b) => b[1] - a[1])[0][0];
}

function autoMap(headers) {
  const lh = headers.map(h => h.toLowerCase().replace(/[\s\-\/]/g, '_'));
  const find = (...alts) => {
    for (const a of alts) {
      const i = lh.findIndex(h => h === a || h.includes(a));
      if (i >= 0) return headers[i];
    }
    return null;
  };
  return {
    price_per_m2:          find('price_per_m2','price_m2','ppm2','price/m2'),
    price:                 find('total_price','price','list_price','sale_price'),
    area_m2:               find('area_m2','area','size','sqm','m2','unit_size'),
    bedrooms:              find('bedrooms','beds','bedroom_count','bed'),
    bathrooms:             find('bathrooms','baths','bathroom_count'),
    city:                  find('city','location','governorate'),
    district:              find('district','area_name','sub_area','zone','neighborhood'),
    compound:              find('compound','project','development','complex'),
    property_type:         find('property_type','type','unit_type','prop_type'),
    year:                  find('year','listing_year','yr'),
    month:                 find('month','listing_month','mo'),
    usd_to_egp_rate:       find('usd_to_egp_rate','usd_rate','exchange_rate','fx_rate','usd_egp'),
    luxury_score:          find('luxury_score','luxury','quality_score','premium_score'),
    distance_to_center:    find('distance_to_center','distance','dist_center','dist_km'),
    material_costs_iron:   find('material_costs_iron','iron_price','iron_cost','iron'),
    material_costs_cement: find('material_costs_cement','cement_price','cement_cost','cement'),
  };
}

function parseCSV(buffer) {
  const text  = buffer.toString('utf8');
  const lines = text.trim().split(/\r?\n/).filter(l => l.trim());
  if (lines.length < 5) throw new Error('CSV needs at least 5 data rows');
  const delim   = detectDelim(lines[0]);
  const headers = lines[0].split(delim).map(h => h.trim().replace(/^"|"$/g, ''));
  const colMap  = autoMap(headers);
  const rows    = lines.slice(1).map(line => {
    const vals = line.split(delim).map(v => v.trim().replace(/^"|"$/g, ''));
    const obj  = {};
    headers.forEach((h, i) => { obj[h] = vals[i] ?? ''; });
    return obj;
  });
  return { rows, colMap, headers };
}

// ───────────────────────────────────────────────────────────────────
// STATISTICS  (aggregates used by dashboard & pricing context)
// ───────────────────────────────────────────────────────────────────
function buildStats(rows, cm) {
  const g  = (r, k) => { const c = cm[k]; return c ? toNum(r[c]) : null; };
  const gs = (r, k) => { const c = cm[k]; return c ? (r[c] || '').trim() : ''; };

  const ppms = [], areas = [], prices = [], usds = [];
  const monthly = {}, usdM = {}, byCity = {}, byType = {}, byCompound = {}, byBeds = {};

  for (const row of rows) {
    const ppm = g(row, 'price_per_m2');
    if (!ppm || ppm < 500 || ppm > 500000) continue;
    ppms.push(ppm);

    const area = g(row, 'area_m2'); if (area && area > 5) areas.push(area);
    const px   = g(row, 'price');   if (px   && px > 0)  prices.push(px);
    const usd  = g(row, 'usd_to_egp_rate'); if (usd && usd > 1) usds.push(usd);

    const yr = g(row, 'year'), mo = g(row, 'month');
    if (yr && mo) {
      const k = `${yr}-${String(parseInt(mo)).padStart(2,'0')}`;
      (monthly[k] = monthly[k] || []).push(ppm);
      if (usd) (usdM[k] = usdM[k] || []).push(usd);
    }

    const city = gs(row,'city');          if (city) (byCity[city]     = byCity[city]     || []).push(ppm);
    const type = gs(row,'property_type'); if (type) (byType[type]     = byType[type]     || []).push(ppm);
    const cmpd = gs(row,'compound');      if (cmpd) (byCompound[cmpd] = byCompound[cmpd] || []).push(ppm);
    const beds = g(row,'bedrooms');
    if (beds) { const bk = `${parseInt(beds)} Bed`; (byBeds[bk] = byBeds[bk] || []).push(ppm); }
  }

  const toAvg  = obj => Object.fromEntries(Object.entries(obj).sort().map(([k,v]) => [k, Math.round(mean(v))]));
  const toRank = (obj, limit=10) =>
    Object.fromEntries(
      Object.entries(obj).sort((a,b) => mean(b[1]) - mean(a[1])).slice(0, limit)
        .map(([k,v]) => [k, { avg: Math.round(mean(v)), count: v.length }])
    );

  return {
    totalRows: rows.length, validRows: ppms.length,
    avgPpm:   Math.round(mean(ppms)),
    avgPrice: Math.round(mean(prices)),
    avgArea:  Math.round(mean(areas)),
    avgUsd:   Math.round(mean(usds) * 100) / 100,
    monthly:     toAvg(monthly),
    usdByMonth:  toAvg(usdM),
    byCity:      toAvg(byCity),
    byType:      toAvg(byType),
    byCompound:  toRank(byCompound),
    byBeds:      toAvg(byBeds),
    distribution: {
      p10: pctile(ppms,10), p25: pctile(ppms,25), p50: pctile(ppms,50),
      p75: pctile(ppms,75), p90: pctile(ppms,90),
    },
    allPpms: ppms,   // used for percentile ranking in predict
  };
}

// ───────────────────────────────────────────────────────────────────
// FEATURE VECTOR  (18 dimensions — bias + 17 features)
//
//  idx  feature
//   0   bias (1)
//   1   area_m2           (normalized)
//   2   bedrooms          (normalized)
//   3   bathrooms         (normalized)
//   4   distance_to_center(normalized)
//   5   luxury_score      (normalized)
//   6   usd_to_egp_rate   (normalized)
//   7   iron_price_k      (normalized)
//   8   cement_price_k    (normalized)
//   9   month_sin         (cyclical encoding)
//  10   month_cos         (cyclical encoding)
//  11   is_villa          (one-hot)
//  12   is_chalet
//  13   is_apartment
//  14   is_cairo
//  15   is_giza
//  16   is_alexandria
//  17   is_north_coast
// ───────────────────────────────────────────────────────────────────
function featureVec(inp) {
  const { area_m2=150, bedrooms=3, bathrooms=2, distance_to_center=30,
    luxury_score=0.5, usd_to_egp_rate=49, iron=37500, cement=3600,
    month=6, property_type='', city='' } = inp;
  const t = (property_type||'').toLowerCase();
  const c = (city||'').toLowerCase();
  return [
    1,
    area_m2, bedrooms, bathrooms, distance_to_center,
    luxury_score, usd_to_egp_rate, iron/1000, cement/1000,
    Math.sin(month * 2 * Math.PI / 12),
    Math.cos(month * 2 * Math.PI / 12),
    t.includes('villa')     ? 1 : 0,
    t.includes('chalet')    ? 1 : 0,
    t.includes('apt') || t.includes('apartment') ? 1 : 0,
    c.includes('cairo')     ? 1 : 0,
    c.includes('giza')      ? 1 : 0,
    c.includes('alex')      ? 1 : 0,
    c.includes('north') || c.includes('coast') ? 1 : 0,
  ];
}

function normalize(raw, means, stds) {
  return raw.map((v, i) =>
    (i >= 1 && i <= 9 && stds[i] > 1e-9) ? (v - means[i]) / stds[i] : v);
}

// ───────────────────────────────────────────────────────────────────
// TRAIN OLS REGRESSION  β = (XᵀX + λI)⁻¹ Xᵀy
// ───────────────────────────────────────────────────────────────────
function trainModel(rows, cm) {
  const g  = (r, k) => { const c = cm[k]; return c ? toNum(r[c]) : null; };
  const gs = (r, k) => { const c = cm[k]; return c ? (r[c]||'').trim() : ''; };

  const valid = rows.filter(r => {
    const p = g(r, 'price_per_m2');
    return p && p > 500 && p < 500000;
  });
  if (valid.length < 20)
    throw new Error('Need ≥20 rows with a price_per_m2 column to train the model');

  // --- raw features ---
  const rawX = valid.map(r => featureVec({
    area_m2:           g(r,'area_m2')              ?? 150,
    bedrooms:          g(r,'bedrooms')             ?? 3,
    bathrooms:         g(r,'bathrooms')            ?? 2,
    distance_to_center:g(r,'distance_to_center')   ?? 30,
    luxury_score:      g(r,'luxury_score')         ?? 0.5,
    usd_to_egp_rate:   g(r,'usd_to_egp_rate')      ?? 49,
    iron:              g(r,'material_costs_iron')  ?? 37500,
    cement:            g(r,'material_costs_cement')?? 3600,
    month:             g(r,'month')                ?? 6,
    property_type:     gs(r,'property_type'),
    city:              gs(r,'city'),
  }));

  const nF = rawX[0].length;

  // --- per-feature mean & std (continuous cols 1-9) ---
  const means = Array(nF).fill(0);
  const stds  = Array(nF).fill(1);
  for (let i = 1; i <= 9; i++) {
    const vals = rawX.map(x => x[i]);
    means[i] = mean(vals);
    const variance = mean(vals.map(v => (v - means[i]) ** 2));
    stds[i]  = Math.sqrt(variance) || 1;
  }

  const X = rawX.map(x => normalize(x, means, stds));
  const y = valid.map(r => g(r, 'price_per_m2'));
  const yBar = mean(y);

  // β = (XᵀX + λI)⁻¹ Xᵀy   (ridge λ=0.001 for stability)
  const Xt   = Mat.T(X);
  const XtX  = Mat.mul(Xt, X);
  for (let i = 0; i < nF; i++) XtX[i][i] += 0.001;
  const XtXi = Mat.inv(XtX);
  const Xty  = Mat.mulV(Xt, y);
  const w    = Mat.mulV(XtXi, Xty);

  // --- metrics on training set ---
  const preds = X.map(x => x.reduce((s,v,i) => s + v*w[i], 0));
  const ssRes = y.reduce((s,v,i) => s + (v-preds[i])**2, 0);
  const ssTot = y.reduce((s,v)   => s + (v-yBar)**2, 0);
  const r2    = Math.max(0, 1 - ssRes/ssTot);
  const rmse  = Math.sqrt(ssRes/y.length);
  const resSd = Math.sqrt(ssRes / Math.max(y.length - nF, 1));

  console.log(`✓ Model  R²=${r2.toFixed(3)}  RMSE=${Math.round(rmse)} EGP/m²  n=${valid.length}`);
  return { w, means, stds, r2, rmse, resSd, nSamples: valid.length };
}

// ───────────────────────────────────────────────────────────────────
// PREDICT & ASSESS PRICE
// ───────────────────────────────────────────────────────────────────
// Delivery discount: Egyptian RE — off-plan trades at a discount
const DELIVERY_FACTOR = { 0:1.00, 6:0.97, 12:0.93, 18:0.90, 24:0.87, 36:0.82, 48:0.78 };
// Finishing level
const FINISH_FACTOR   = { finished:1.00, semi:0.83, core:0.68 };

function predict(input) {
  const { model, stats } = STATE;
  if (!model || !stats) throw new Error('Model not ready');

  const {
    area_m2, bedrooms, bathrooms, property_type, city,
    distance_to_center, luxury_score, usd_to_egp_rate,
    iron, cement, month, delivery_months, finishing, entered_price,
  } = input;

  // --- base model prediction ---
  const raw  = featureVec({ area_m2, bedrooms, bathrooms, distance_to_center,
    luxury_score, usd_to_egp_rate, iron, cement, month, property_type, city });
  const norm = normalize(raw, model.means, model.stds);
  let basePpm = norm.reduce((s,v,i) => s + v*model.w[i], 0);
  basePpm = Math.max(5000, Math.min(200000, basePpm));

  // --- delivery adjustment ---
  const keys = Object.keys(DELIVERY_FACTOR).map(Number).sort((a,b)=>a-b);
  const nearDel = keys.reduce((p,k) =>
    Math.abs(k-delivery_months)<Math.abs(p-delivery_months)?k:p, 0);
  const dFactor = DELIVERY_FACTOR[nearDel];

  // --- finishing adjustment ---
  const fFactor = FINISH_FACTOR[finishing] ?? 1.0;

  const predictedPpm   = Math.round(basePpm * dFactor * fFactor);
  const predictedTotal = Math.round(predictedPpm * area_m2);

  // --- confidence interval (~90%) ---
  const sigma  = model.resSd * (1 + delivery_months/120);
  const ciLow  = Math.round(Math.max(0, predictedPpm - 1.5*sigma));
  const ciHigh = Math.round(predictedPpm + 1.5*sigma);

  // --- compare entered price ---
  const enteredPpm = Math.round(entered_price / area_m2);
  const gapEgp     = entered_price - predictedTotal;
  const gapPct     = (gapEgp / predictedTotal) * 100;
  const gapPpmEgp  = enteredPpm - predictedPpm;

  let verdict, verdictLabel, verdictColor, verdictEmoji;
  if      (gapPct < -20) { verdict='significantly_underpriced'; verdictLabel='Significantly Underpriced'; verdictColor='#52B07A'; verdictEmoji='↓↓'; }
  else if (gapPct <  -7) { verdict='underpriced';               verdictLabel='Underpriced';               verdictColor='#7AD4A0'; verdictEmoji='↓'; }
  else if (gapPct <=  7) { verdict='fair';                      verdictLabel='Fair Price';                verdictColor='#D4AE52'; verdictEmoji='✓'; }
  else if (gapPct <= 20) { verdict='overpriced';                verdictLabel='Overpriced';                verdictColor='#D4834A'; verdictEmoji='↑'; }
  else                   { verdict='significantly_overpriced';  verdictLabel='Significantly Overpriced'; verdictColor='#C05A4A'; verdictEmoji='↑↑'; }

  // --- market percentile ---
  const allPpms = stats.allPpms || [];
  const below = allPpms.filter(p => p <= enteredPpm).length;
  const percentileRank = allPpms.length ? Math.round(below/allPpms.length*100) : 50;

  // --- comparable count (same city & type) ---
  const cityL = city.toLowerCase(), typeL = property_type.toLowerCase();
  const comparable = STATE.rows.filter(r => {
    const rc = (r[STATE.colMap.city]||'').toLowerCase();
    const rt = (r[STATE.colMap.property_type]||'').toLowerCase();
    return rc.includes(cityL.split(' ')[0]) || rt.includes(typeL.split(' ')[0]);
  }).length;

  return {
    predicted: { ppm: predictedPpm, total: predictedTotal, ci_low: ciLow, ci_high: ciHigh },
    entered:   { ppm: enteredPpm, total: entered_price },
    adjustments: {
      base_ppm:        Math.round(basePpm),
      delivery_factor: dFactor,
      finish_factor:   fFactor,
      delivery_months,
      finishing,
    },
    verdict, verdictLabel, verdictColor, verdictEmoji,
    gap: {
      egp:     Math.round(gapEgp),
      pct:     Math.round(gapPct * 10) / 10,
      ppm_egp: gapPpmEgp,
    },
    market: {
      overall_avg:   stats.avgPpm,
      city_avg:      stats.byCity[city]          || stats.avgPpm,
      type_avg:      stats.byType[property_type]  || stats.avgPpm,
      percentile:    percentileRank,
      distribution:  stats.distribution,
      comparable_count: comparable,
    },
    model_metrics: {
      r2:        Math.round(model.r2 * 1000) / 1000,
      rmse:      Math.round(model.rmse),
      n_samples: model.nSamples,
    },
  };
}

// ───────────────────────────────────────────────────────────────────
// DEMO DATA BOOTSTRAP  (runs on startup if no CSV is uploaded)
// ───────────────────────────────────────────────────────────────────
function buildDemoRows() {
  const cities  = ['Cairo','Giza','Alexandria','North Coast'];
  const types   = ['Villa','Chalet','Apartment'];
  const cmpds   = ['Rehab','Beverly Hills','Mountain View','Marassi','Madinaty','Palm Hills',''];
  const dists   = ['New Cairo','Sheikh Zayed','Heliopolis','Maadi','6th October','Nasr City'];
  const usdRates = {
    '2024-01':30.89,'2024-02':30.90,'2024-03':44.53,'2024-04':47.82,
    '2024-05':47.29,'2024-06':47.72,'2024-07':48.17,'2024-08':48.92,
    '2024-09':48.47,'2024-10':48.57,'2024-11':49.39,'2024-12':50.57,
    '2025-01':50.47,'2025-02':50.49,'2025-03':50.61,'2025-04':50.99,
    '2025-05':50.24,'2025-06':49.96,'2025-07':49.29,'2025-08':48.49,
    '2025-09':49.10,'2025-10':49.80,'2025-11':50.20,'2025-12':50.90,
  };

  // Deterministic RNG (reproducible)
  let seed = 2024;
  const rng = () => {
    seed ^= seed << 13; seed ^= seed >> 17; seed ^= seed << 5;
    return ((seed >>> 0) / 0xFFFFFFFF);
  };

  const rows = [];
  for (let yr = 2024; yr <= 2025; yr++) {
    for (let mo = 1; mo <= 12; mo++) {
      const key = `${yr}-${String(mo).padStart(2,'0')}`;
      const usd = usdRates[key] ?? 49;
      for (let i = 0; i < 625; i++) {
        const city = cities[i%4], type = types[i%3];
        const area = 70 + Math.round(rng()*330);
        const beds = 1  + Math.floor(rng()*5);
        const bths = 1  + Math.floor(rng()*3);
        const lux  = Math.round(rng()*100)/100;
        const dist = Math.round(rng()*120*10)/10;
        // Price model matching real dataset statistics
        let ppm = 23984
          + (lux - 0.5)  * 4200
          - dist         * 7
          + (usd - 48)   * 18
          + (type==='Chalet'    ? 100 : type==='Villa' ? 60 : -80)
          + (city==='Cairo'     ? 180 : city==='Giza'  ? 90 : 0)
          + (rng()-0.5)  * 4500;
        ppm = Math.max(7000, Math.round(ppm));
        rows.push({
          listing_id:rows.length+1, area_m2:area, bedrooms:beds, bathrooms:bths,
          property_type:type, city, district:dists[i%6], compound:cmpds[i%7],
          month:mo, year:yr, price_per_m2:ppm, price:ppm*area,
          distance_to_center:dist, luxury_score:lux,
          usd_to_egp_rate:usd, material_costs_iron:37500, material_costs_cement:3600,
        });
      }
    }
  }
  return rows;
}

function bootstrap() {
  console.log('⏳ Bootstrapping demo dataset…');
  const rows   = buildDemoRows();
  // Identity column map for demo data (keys === column names)
  const keys   = ['price_per_m2','price','area_m2','bedrooms','bathrooms','city','district',
                  'compound','property_type','year','month','usd_to_egp_rate','luxury_score',
                  'distance_to_center','material_costs_iron','material_costs_cement'];
  const colMap = Object.fromEntries(keys.map(k => [k, k]));
  STATE.rows   = rows;
  STATE.colMap = colMap;
  STATE.stats  = buildStats(rows, colMap);
  STATE.model  = trainModel(rows, colMap);
  STATE.ready  = true;
  STATE.source = 'demo';
  console.log(`✓ Demo ready — ${rows.length.toLocaleString()} rows | avg ${STATE.stats.avgPpm.toLocaleString()} EGP/m²`);
}

// ───────────────────────────────────────────────────────────────────
// REST API
// ───────────────────────────────────────────────────────────────────

/* GET /api/health */
app.get('/api/health', (_, res) => res.json({
  ok:     true,
  ready:  STATE.ready,
  source: STATE.source,
  rows:   STATE.stats?.totalRows ?? 0,
  model:  STATE.model ? { r2: STATE.model.r2, rmse: STATE.model.rmse } : null,
}));

/* GET /api/stats */
app.get('/api/stats', (_, res) => {
  if (!STATE.ready) return res.status(503).json({ error: 'Server initializing…' });
  const s = STATE.stats;
  res.json({
    totalRows: s.totalRows, validRows: s.validRows,
    avgPpm: s.avgPpm, avgPrice: s.avgPrice, avgArea: s.avgArea, avgUsd: s.avgUsd,
    monthly:    s.monthly,
    usdByMonth: s.usdByMonth,
    byCity:     s.byCity,
    byType:     s.byType,
    byBeds:     s.byBeds,
    byCompound: s.byCompound,
    distribution: s.distribution,
    model: { r2: STATE.model.r2, rmse: STATE.model.rmse, nSamples: STATE.model.nSamples },
    source: STATE.source,
  });
});

/* POST /api/upload  multipart field: "file" */
app.post('/api/upload', upload.single('file'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file attached (field name: "file")' });
  try {
    const { rows, colMap } = parseCSV(req.file.buffer);
    STATE.rows   = rows;
    STATE.colMap = colMap;
    STATE.stats  = buildStats(rows, colMap);
    STATE.model  = trainModel(rows, colMap);
    STATE.ready  = true;
    STATE.source = req.file.originalname;
    console.log(`✓ Uploaded "${req.file.originalname}" — ${rows.length} rows`);
    res.json({
      ok:      true,
      rows:    rows.length,
      filename:req.file.originalname,
      colMap:  Object.fromEntries(Object.entries(colMap).map(([k,v])=>[k, v ?? '⚠ not found'])),
      stats:   { avgPpm: STATE.stats.avgPpm, byCity: STATE.stats.byCity, byType: STATE.stats.byType },
      model:   { r2: STATE.model.r2, rmse: STATE.model.rmse, nSamples: STATE.model.nSamples },
    });
  } catch (err) {
    console.error('Upload error:', err.message);
    res.status(400).json({ error: err.message });
  }
});

/* POST /api/predict
   Body (JSON):
   {
     area_m2, bedrooms, bathrooms,
     property_type, city, distance_to_center,
     luxury_score (0-1), usd_to_egp_rate,
     iron (EGP/ton), cement (EGP/ton), month (1-12),
     delivery_months (0|6|12|18|24|36|48),
     finishing ("finished"|"semi"|"core"),
     entered_price (EGP total)
   }
*/
app.post('/api/predict', (req, res) => {
  if (!STATE.ready) return res.status(503).json({ error: 'Model not ready' });
  try {
    const b = req.body;
    const input = {
      area_m2:             parseFloat(b.area_m2)            || 150,
      bedrooms:            parseInt  (b.bedrooms)           || 3,
      bathrooms:           parseInt  (b.bathrooms)          || 2,
      property_type:       String    (b.property_type       || ''),
      city:                String    (b.city                || ''),
      distance_to_center:  parseFloat(b.distance_to_center) || 25,
      luxury_score:        parseFloat(b.luxury_score)       || 0.5,
      usd_to_egp_rate:     parseFloat(b.usd_to_egp_rate)    || 51.9,
      iron:                parseFloat(b.iron)               || 37500,
      cement:              parseFloat(b.cement)             || 3600,
      month:               parseInt  (b.month)              || new Date().getMonth()+1,
      delivery_months:     parseInt  (b.delivery_months)    || 0,
      finishing:           String    (b.finishing           || 'finished'),
      entered_price:       parseFloat(b.entered_price),
    };
    if (!input.entered_price || input.entered_price < 100)
      return res.status(400).json({ error: 'entered_price is required' });
    res.json({ ok: true, ...predict(input) });
  } catch (err) {
    console.error('Predict error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ───────────────────────────────────────────────────────────────────
// START
// ───────────────────────────────────────────────────────────────────
const PORT = process.env.PORT || 3000;
bootstrap();
app.listen(PORT, () => {
  console.log(`\n🏛  MISR Analytics  →  http://localhost:${PORT}\n`);
});
