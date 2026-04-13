const { mean } = require('./stats');
const { RandomForestRegression } = require('ml-random-forest');
function buildStats() {} // Dummy to avoid error if called somewhere else, though stats service is better
const { canonicalCity, canonicalType, normalizeStr } = require('./csv');

const DELIVERY_FACTOR = { 0:1.00, 6:0.97, 12:0.93, 18:0.90, 24:0.87, 36:0.82, 48:0.78 };
const FINISH_FACTOR = { finished:1.00, semi:0.83, core:0.68 };
const DELIVERY_MONTHS = [0, 6, 12, 18, 24, 36, 48];

function topCategories(values, limit = 6) {
  const counts = {};
  for (const value of values) {
    if (!value) continue;
    counts[value] = (counts[value] || 0) + 1;
  }
  return Object.entries(counts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([value]) => value);
}

function buildFeatureCategories(rows) {
  return {
    cities: topCategories(rows.map(r => r.city), 15),
    property_types: topCategories(rows.map(r => r.property_type), 10),
    compounds: topCategories(rows.map(r => r.compound).filter(Boolean), 40),
  };
}

function featureNameList(categories) {
  const names = [
    'bias', 'area_m2', 'bedrooms', 'bathrooms', 'distance_to_center',
    'luxury_score', 'usd_to_egp_rate', 'iron_k', 'cement_k',
    'month_sin', 'month_cos',
  ];
  for (const city of categories.cities) names.push(`is_city_${normalizeStr(city).replace(/\s+/g,'_')}`);
  for (const type of categories.property_types) names.push(`is_type_${normalizeStr(type).replace(/\s+/g,'_')}`);
  for (const compound of categories.compounds) names.push(`is_compound_${normalizeStr(compound).replace(/\s+/g,'_')}`);
  return names;
}

function splitRows(rows, ratio = 0.8) {
  const copy = [...rows];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  const splitAt = Math.floor(copy.length * ratio);
  return { train: copy.slice(0, splitAt), test: copy.slice(splitAt) };
}

function evaluatePredictions(model, X, y) {
  const preds = model.predict(X);
  const n = y.length;
  const yBar = mean(y);
  let ssRes = 0, ssTot = 0, mae = 0, bias = 0;
  for (let i = 0; i < n; i++) {
    const err = preds[i] - y[i];
    ssRes += err * err;
    ssTot += (y[i] - yBar) ** 2;
    mae += Math.abs(err);
    bias += err;
  }
  const rmse = Math.sqrt(ssRes / n);
  const r2 = Math.max(0, 1 - ssRes / ssTot);
  return { r2, rmse, mae: mae / n, bias: bias / n };
}

function featureVec(inp, categories = { cities: [], property_types: [], compounds: [] }) {
  const {
    area_m2=150, bedrooms=3, bathrooms=2, distance_to_center=30,
    luxury_score=0.5, usd_to_egp_rate=49, iron=37500, cement=3600,
    month=6, property_type='', city: rawCity='', compound='',
  } = inp;

  const city = canonicalCity(rawCity);
  const type = canonicalType(property_type);
  const base = [
    1,
    area_m2,
    bedrooms,
    bathrooms,
    distance_to_center,
    luxury_score,
    usd_to_egp_rate,
    iron / 1000,
    cement / 1000,
    Math.sin((month % 12) * 2 * Math.PI / 12),
    Math.cos((month % 12) * 2 * Math.PI / 12),
  ];

  const categoryFlags = [];
  categories.cities.forEach(name => categoryFlags.push(city === canonicalCity(name) ? 1 : 0));
  categories.property_types.forEach(name => categoryFlags.push(type === canonicalType(name) ? 1 : 0));
  categories.compounds.forEach(name => categoryFlags.push(normalizeStr(compound) === normalizeStr(name) ? 1 : 0));

  return [...base, ...categoryFlags];
}

function normalize(raw, means, stds) {
  return raw.map((v, i) =>
    (i >= 1 && i <= 9 && stds[i] > 1e-9) ? (v - means[i]) / stds[i] : v);
}

module.exports = {
  trainModel(parsed) {
    if (parsed.length < 20)
      throw new Error('Need ≥20 valid rows to train the model');

    const categories = buildFeatureCategories(parsed);
    const featureNames = featureNameList(categories);

    const { train, test } = splitRows(parsed, 0.8);
    const trainSet = train.length ? train : parsed.slice(0, Math.floor(parsed.length * 0.8));
    const testSet = test.length ? test : parsed.slice(Math.floor(parsed.length * 0.8));

    const rawX = trainSet.map(r => featureVec(r, categories));
    const yTrain = trainSet.map(r => r.price_per_m2);
    const nF = rawX[0].length;

    const means = Array(nF).fill(0);
    const stds  = Array(nF).fill(1);
    for (let i = 1; i <= Math.min(9, nF - 1); i++) {
      const vals = rawX.map(x => x[i]);
      means[i] = mean(vals);
      const variance = mean(vals.map(v => (v - means[i]) ** 2));
      stds[i]  = Math.sqrt(variance) || 1;
    }

    const Xtrain = rawX.map(x => normalize(x, means, stds));
    
    // Train Random Forest
    console.log(`🌲 Training Random Forest with ${trainSet.length} samples...`);
    const options = {
      seed: 42,
      maxFeatures: 0.8,
      replacement: true,
      nEstimators: 40, // Reduced for speed in Node.js
      noOOB: true,     // Faster startup
      treeOptions: {
        maxDepth: 10,  // Shallower trees reach faster convergence
        minSamplesLeaf: 5
      }
    };
    const modelInstance = new RandomForestRegression(options);
    const XtrainLimited = Xtrain.slice(0, 1000); // Temporary limit for debugging
    const yTrainLimited = yTrain.slice(0, 1000);
    modelInstance.train(XtrainLimited, yTrainLimited);

    // Get Feature Importance
    const importanceRaw = modelInstance.featureImportance();
    const featureImportance = featureNames.map((name, i) => ({
      name,
      score: importanceRaw[i] || 0
    })).sort((a, b) => b.score - a.score).slice(0, 10);

    const trainMetrics = evaluatePredictions(modelInstance, Xtrain, yTrain);

    const Xtest = testSet.map(r => normalize(featureVec(r, categories), means, stds));
    const yTest = testSet.map(r => r.price_per_m2);
    const testMetrics = evaluatePredictions(modelInstance, Xtest, yTest);

    const resSd = Math.sqrt(trainMetrics.rmse ** 2 * trainSet.length / Math.max(trainSet.length - nF, 1));

    console.log(`✓ RF Model  Train R²=${trainMetrics.r2.toFixed(3)}  RMSE=${Math.round(trainMetrics.rmse)} EGP/m²`);

    return {
      rf: modelInstance,
      means, stds, categories, featureNames, featureImportance,
      r2: trainMetrics.r2,
      rmse: trainMetrics.rmse,
      mae: trainMetrics.mae,
      test_r2: testMetrics.r2,
      test_rmse: testMetrics.rmse,
      test_mae: testMetrics.mae,
      test_bias: testMetrics.bias,
      resSd,
      nSamples: parsed.length,
      nTrain: trainSet.length,
      nTest: testSet.length,
      adjustments: {
        delivery: DELIVERY_FACTOR,
        finishing: FINISH_FACTOR,
      },
    };
  },

  predict(input, model, stats, rows, colMap) {
    if (!model || !stats) throw new Error('Model not ready');

    const {
      area_m2, bedrooms, bathrooms, property_type, city,
      distance_to_center, luxury_score, usd_to_egp_rate,
      iron, cement, month, delivery_months, finishing, entered_price,
    } = input;

    const raw  = featureVec({
      area_m2, bedrooms, bathrooms, distance_to_center,
      luxury_score, usd_to_egp_rate, iron, cement, month, property_type, city,
      compound: input.compound, project_avg_price: input.project_avg_price,
      num_listings_in_project: input.num_listings_in_project,
    }, model.categories);

    const norm = normalize(raw, model.means, model.stds);
    const predsArray = model.rf.predict([norm]);
    let basePpm = predsArray[0];
    basePpm = Math.max(5000, Math.min(250000, basePpm));

    const keys = DELIVERY_MONTHS.slice();
    const nearDel = keys.reduce((p, k) =>
      Math.abs(k - delivery_months) < Math.abs(p - delivery_months) ? k : p, keys[0]);
    const dFactor = DELIVERY_FACTOR[nearDel] ?? 1.0;

    const fFactor = FINISH_FACTOR[finishing] ?? 1.0;

    const predictedPpm   = Math.round(basePpm * dFactor * fFactor);
    const predictedTotal = Math.round(predictedPpm * area_m2);

    const sigma  = model.resSd * (1 + delivery_months/120);
    const ciLow  = Math.round(Math.max(0, predictedPpm - 1.5*sigma));
    const ciHigh = Math.round(predictedPpm + 1.5*sigma);

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

    const allPpms = stats.allPpms || [];
    const below = allPpms.filter(p => p <= enteredPpm).length;
    const percentileRank = allPpms.length ? Math.round(below/allPpms.length*100) : 50;

    const cityL = city.toLowerCase(), typeL = property_type.toLowerCase();
    const comparable = rows.filter(r => {
      const rc = (r[colMap.city]||'').toLowerCase();
      const rt = (r[colMap.property_type]||'').toLowerCase();
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
        r2:         Math.round(model.r2 * 1000) / 1000,
        rmse:       Math.round(model.rmse),
        mae:        Math.round(model.mae),
        test_r2:    Math.round(model.test_r2 * 1000) / 1000,
        test_rmse:  Math.round(model.test_rmse),
        test_mae:   Math.round(model.test_mae),
        test_bias:  Math.round(model.test_bias * 100) / 100,
        n_samples:  model.nSamples,
        n_train:    model.nTrain,
        n_test:     model.nTest,
      },
    };
  },

  DELIVERY_FACTOR,
  FINISH_FACTOR,
};
