'use strict';
const express = require('express');
const fs      = require('fs');
const multer  = require('multer');
const path    = require('path');

const csvService  = require('./services/csv');
const modelService = require('./services/model');
const statsService = require('./services/stats');
const dataService  = require('./services/data');

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
  model:  null,
  stats:  null,
  ready:  false,
  source: 'demo',
};

// ───────────────────────────────────────────────────────────────────
// STARTUP
// ───────────────────────────────────────────────────────────────────
function bootstrap() {
  const data = dataService.loadDataset();
  const parsed = csvService.sanitizeAndValidate(data.rows, data.colMap);

  STATE.rows   = data.rows;
  STATE.colMap = data.colMap;
  STATE.stats  = statsService.buildStats(data.rows, data.colMap);
  STATE.model  = modelService.trainModel(parsed);
  STATE.ready  = true;
  STATE.source = data.source;

  console.log(`✓ Dataset ready — ${data.rows.length.toLocaleString()} rows | avg ${STATE.stats.avgPpm.toLocaleString()} EGP/m² | source=${data.source}`);
}

// ───────────────────────────────────────────────────────────────────
// REST API
// ───────────────────────────────────────────────────────────────────

app.get('/api/health', (_, res) => res.json({
  ok:     true,
  ready:  STATE.ready,
  source: STATE.source,
  rows:   STATE.stats?.totalRows ?? 0,
  model:  STATE.model ? { r2: STATE.model.r2, rmse: STATE.model.rmse } : null,
}));

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
    model: {
      r2: STATE.model.r2,
      rmse: STATE.model.rmse,
      mae: STATE.model.mae,
      test_r2: STATE.model.test_r2,
      test_rmse: STATE.model.test_rmse,
      test_mae: STATE.model.test_mae,
      nSamples: STATE.model.nSamples,
      nTrain: STATE.model.nTrain,
      nTest: STATE.model.nTest,
    },
    source: STATE.source,
  });
});

app.get('/api/model', (_, res) => {
  if (!STATE.ready) return res.status(503).json({ error: 'Server initializing…' });
  const model = STATE.model;
  res.json({
    ok: true,
    source: STATE.source,
    featureNames: model.featureNames,
    categories: model.categories,
    adjustments: model.adjustments,
    metrics: {
      r2: model.r2,
      rmse: model.rmse,
      mae: model.mae,
      test_r2: model.test_r2,
      test_rmse: model.test_rmse,
      test_mae: model.test_mae,
      test_bias: model.test_bias,
      nSamples: model.nSamples,
      nTrain: model.nTrain,
      nTest: model.nTest,
    },
  });
});

app.get('/api/download-data', (_, res) => {
  const filePath = dataService.getDefaultDataFile();
  if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'Dataset not available' });
  res.download(filePath);
});

app.post('/api/upload', upload.single('file'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file attached (field name: "file")' });
  try {
    const { rows, colMap } = csvService.parseCSV(req.file.buffer);
    const parsed = csvService.sanitizeAndValidate(rows, colMap);
    STATE.rows   = rows;
    STATE.colMap = colMap;
    STATE.stats  = statsService.buildStats(rows, colMap);
    STATE.model  = modelService.trainModel(parsed);
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

app.post('/api/predict', (req, res) => {
  if (!STATE.ready) return res.status(503).json({ error: 'Model not ready' });
  try {
    const b = req.body;
    const input = {
      area_m2:             parseFloat(b.area_m2),
      bedrooms:            parseInt  (b.bedrooms, 10),
      bathrooms:           parseInt  (b.bathrooms, 10),
      property_type:       String    (b.property_type || ''),
      city:                String    (b.city || ''),
      compound:            String    (b.compound || ''),
      distance_to_center:  parseFloat(b.distance_to_center),
      luxury_score:        parseFloat(b.luxury_score),
      usd_to_egp_rate:     parseFloat(b.usd_to_egp_rate),
      iron:                parseFloat(b.iron),
      cement:              parseFloat(b.cement),
      month:               parseInt  (b.month, 10),
      delivery_months:     parseInt  (b.delivery_months, 10),
      finishing:           String    (b.finishing || 'finished'),
      entered_price:       parseFloat(b.entered_price),
      project_avg_price:   parseFloat(b.project_avg_price) || 0,
      num_listings_in_project: parseFloat(b.num_listings_in_project) || 0,
    };

    const errors = [];
    if (!input.area_m2 || input.area_m2 < 10) errors.push('area_m2 must be at least 10');
    if (!Number.isFinite(input.bedrooms) || input.bedrooms < 0) errors.push('bedrooms is required');
    if (!Number.isFinite(input.bathrooms) || input.bathrooms < 0) errors.push('bathrooms is required');
    if (!input.city) errors.push('city is required');
    if (!Number.isFinite(input.distance_to_center) || input.distance_to_center < 0) errors.push('distance_to_center is required');
    if (!Number.isFinite(input.luxury_score) || input.luxury_score < 0 || input.luxury_score > 1) errors.push('luxury_score must be between 0 and 1');
    if (!Number.isFinite(input.usd_to_egp_rate) || input.usd_to_egp_rate <= 0) errors.push('usd_to_egp_rate is required');
    if (!Number.isFinite(input.iron) || input.iron <= 0) input.iron = csvService.DEFAULT_MATERIAL_COSTS.iron;
    if (!Number.isFinite(input.cement) || input.cement <= 0) input.cement = csvService.DEFAULT_MATERIAL_COSTS.cement;
    if (!Number.isFinite(input.month) || input.month < 1 || input.month > 12) input.month = new Date().getMonth() + 1;
    if (!Number.isFinite(input.delivery_months)) input.delivery_months = 0;
    if (!input.finishing || !Object.keys(modelService.FINISH_FACTOR).includes(input.finishing)) input.finishing = 'finished';
    if (!Number.isFinite(input.entered_price) || input.entered_price < 1000) errors.push('entered_price is required and must be at least 1,000 EGP');
    if (errors.length) return res.status(400).json({ error: errors.join('; ') });

    const prediction = modelService.predict(input, STATE.model, STATE.stats, STATE.rows, STATE.colMap);
    res.json({ ok: true, ...prediction });
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
