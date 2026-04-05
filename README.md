# MISR Analytics — Egypt Real Estate Intelligence Platform

A Node.js + Express application with a server-side OLS regression model for real estate price prediction.

## Quick Start

```bash
# 1. Install dependencies
npm install

# 2. Start server
npm start

# 3. Open browser
http://localhost:3000
```

For development with auto-reload (Node ≥18):
```bash
npm run dev
```

---

## Architecture

```
misr-analytics/
├── package.json
├── README.md
├── server/
│   ├── server.js              ← Main Express app & API endpoints
│   └── services/
│       ├── csv.js             ← CSV parsing, validation, data cleaning
│       ├── model.js           ← OLS training & prediction logic
│       ├── stats.js           ← Market statistics & aggregation
│       ├── matrix.js          ← Gauss-Jordan matrix inversion
│       └── data.js            ← Dataset loading & demo generation
└── public/
    ├── index.html             ← Clean HTML shell (Chart.js, responsive)
    └── js/
        ├── app.js             ← Main controller & routing
        ├── services/
        │   └── api.js         ← Centralized HTTP client layer
        └── pages/
            ├── advisor.js     ← Price Advisor page
            ├── dashboard.js   ← Market Dashboard page
            ├── upload.js      ← Data Upload page + download button
            └── market.js      ← Market Analysis page
```

### Server Services

**`server/services/csv.js`**
- Parses CSV files with auto-delimiter detection (`,`, `;`, `\t`)
- Fuzzy-matches 16 standard real estate column names
- Handles quoted fields and embedded delimiters
- Sanitizes and validates rows (price range, area, luxury score)

**`server/services/model.js`**
- Trains OLS regression with proper train/test validation (80/20 split)
- Computes train & test R², RMSE, MAE, and bias metrics
- Generates dynamic category features (top 6 cities, property types, compounds)
- Applies delivery and finishing adjustments server-side

**`server/services/stats.js`**
- Aggregates statistics by city, property type, bedrooms, compound
- Calculates monthly trends and USD/EGP rate correlation
- Computes price distribution percentiles (p10, p25, p50, p75, p90)

**`server/services/matrix.js`**
- Matrix operations (transpose, multiply, invert) for OLS normal equations
- Gauss-Jordan elimination with partial pivoting for numerical stability

**`server/services/data.js`**
- Loads real dataset from `egypt_real_estate_ml_dataset.csv` on startup
- Falls back to synthetic demo data if file not found
- Returns parsed rows and column mappings

### Frontend Pages

Each page is self-contained and handles its own initialization & DOM updates:
- **Price Advisor** — Form input, call `/api/predict`, display verdict & comparables
- **Dashboard** — Market KPIs, monthly price trends, charts (Chart.js)
- **Upload** — Drag-drop CSV, download sample data, retraining status
- **Market Analysis** — Variable sensitivity, USD correlation, cost drivers

### API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/health` | Server status + model R² & RMSE |
| `GET` | `/api/stats` | Market statistics (KPIs, trends, aggregates) |
| `GET` | `/api/model` | Model info (features, categories, adjustments, metrics) |
| `GET` | `/api/download-data` | Download the dataset as CSV |
| `POST` | `/api/upload` | Upload CSV → parse, validate, retrain model |
| `POST` | `/api/predict` | Predict price for a unit with confidence interval |

### Prediction Input (`POST /api/predict`)

Request body (JSON):
```json
{
  "area_m2": 180,
  "bedrooms": 3,
  "bathrooms": 2,
  "property_type": "Apartment",
  "city": "Cairo",
  "district": "New Cairo",
  "compound": "Palm Hills",
  "distance_to_center": 25,
  "luxury_score": 0.65,
  "usd_to_egp_rate": 51.9,
  "iron": 37500,
  "cement": 3600,
  "month": 4,
  "delivery_months": 12,
  "finishing": "semi",
  "entered_price": 4500000,
  "project_avg_price": 0,
  "num_listings_in_project": 0
}
```

**Validation:**
- `area_m2` ≥ 10 m²
- `bedrooms`, `bathrooms` ≥ 0
- `luxury_score` 0–1
- `usd_to_egp_rate` > 0
- `entered_price` ≥ 1,000 EGP
- `city` required
- Bad inputs return 400 with detailed error messages

### Prediction Output

Response includes:
- **predicted** — base PPM, total price, confidence interval (±90%)
- **verdict** — Significantly Underpriced / Underpriced / Fair / Overpriced / Significantly Overpriced
- **gap** — EGP and percentage difference from fair price
- **market** — overall avg, city/type avg, percentile rank, comparables count
- **model_metrics** — Train R², Test R², RMSE, MAE, bias, sample counts
- **adjustments** — delivery & finishing factors applied

---

## ML Model Details

**Algorithm:** Ordinary Least Squares with Ridge regularisation (λ=0.001)

**Features (Dynamic):**
- Base: area_m2, bedrooms, bathrooms, distance_to_center, luxury_score, usd_to_egp_rate
- Scaled: iron/1000, cement/1000
- Cyclical: month_sin, month_cos (sine/cosine encoding for seasonality)
- Categorical: Top 6 cities + Top 6 property types + Top 10 compounds (one-hot)

**Training & Validation:**
- ✅ Train/test split (80/20) for proper generalization metrics
- ✅ Computes Train R², Test R², RMSE, MAE, bias on test set
- ✅ Feature normalization (zero-mean, unit-variance) on continuous features
- ✅ Ridge regularization prevents overfitting

**Adjustments (Post-Model):**
- **Delivery discount**: Off-plan properties trade at 0–48 month bands
  - Ready (0mo) = 1.00× | 6mo = 0.97× | ... | 48mo = 0.78×
- **Finishing discount**: Quality tier affects final price
  - Finished = 1.00× | Semi = 0.83× | Core = 0.68×

**Verdict Thresholds:**
- `gap < -20%` → Significantly Underpriced (buy signal)
- `-20% ≤ gap < -7%` → Underpriced
- `-7% ≤ gap ≤ +7%` → Fair Price
- `+7% < gap ≤ +20%` → Overpriced
- `gap > +20%` → Significantly Overpriced (sell signal)

---

## CSV Format & Data Upload

**Supported columns** (auto-detected, case-insensitive):
```
price_per_m2, area_m2, bedrooms, bathrooms, city, district, compound,
property_type, year, month, usd_to_egp_rate, luxury_score,
distance_to_center, material_costs_iron, material_costs_cement, latitude, longitude
```

**Upload workflow:**
1. Drag-drop or click to upload a CSV file
2. Server parses, validates, and cleans data
3. Builds dynamic categories (top cities/types/compounds)
4. Trains OLS model with train/test validation
5. Computes model metrics and displays results
6. Model is live and ready for predictions

**Download sample data:**
- Click **"Download Sample Data (CSV)"** button in Upload page
- Get the current dataset (either uploaded or demo) for inspection
- Useful for understanding required columns and data format

**Minimum requirements:**
- At least 20 valid rows with price_per_m2 > 500 and < 500,000 EGP/m²
- `price_per_m2` column (or any alias: ppm2, price/m2, etc.)
- Area ≥ 10 m²
- Luxury score 0–1 (if present)

---

## Development & Deployment

**Tech Stack:**
- Backend: Node.js 18+ with Express.js
- Frontend: HTML5, CSS3 (custom design), Chart.js for visualization
- No databases — all data in memory (suitable for MVP/demo)
- No dependencies for ML — pure JavaScript OLS implementation

**File Organization:**
- `server/services/` — Modular backend (CSV, model, stats, matrix, data)
- `public/js/services/` — Centralized API layer
- `public/js/pages/` — Self-contained frontend pages (advisor, dashboard, upload, market)
- `public/index.html` — Clean HTML shell with CSS variables for theming

**To extend the model:**
1. Add features in `server/services/model.js` → `featureVec()`
2. Update feature names in `featureNameList()`
3. Retrain by uploading a CSV or restarting the server
4. New weights are computed automatically via Gauss-Jordan inversion

**Production deployment considerations:**
- ✅ Input validation and error handling on all endpoints
- ✅ Train/test validation prevents overfitting
- ✅ Confidence intervals quantify prediction uncertainty
- ⚠️ Currently loads entire dataset in memory (fine for <100K rows)
- ⚠️ No API authentication (add before exposing publicly)
- ⚠️ No request rate limiting (add reverse proxy if needed)

---

## Performance & Model Quality

**Current metrics** (on real Egypt dataset, 15K rows):
- Train R²: 0.50+ (varies with data)
- Test R²: Typically 0.48–0.52 (generalization check)
- RMSE: 8,000–10,000 EGP/m² (confidence interval width)
- Features: 18–30+ (depends on unique cities/types/compounds)

**What drives predictions:**
1. **USD/EGP rate** (highest impact) — 68% devaluation in 2024 affects all prices
2. **Luxury score** — Strong premium for amenities
3. **Distance to center** — Moderate negative correlation
4. **Property type** (villa/chalet premium vs apartment)
5. **City** — Cairo/Giza >  North Coast > Alexandria
6. **Delivery months** — Off-plan discounts apply

---

## Example Usage

### Via cURL

```bash
# Get market stats
curl http://localhost:3000/api/stats

# Predict price for a 180m² apartment in Cairo
curl -X POST http://localhost:3000/api/predict \
  -H "Content-Type: application/json" \
  -d '{
    "area_m2": 180,
    "bedrooms": 3,
    "bathrooms": 2,
    "property_type": "Apartment",
    "city": "Cairo",
    "distance_to_center": 25,
    "luxury_score": 0.65,
    "usd_to_egp_rate": 51.9,
    "iron": 37500,
    "cement": 3600,
    "month": 4,
    "delivery_months": 0,
    "finishing": "finished",
    "entered_price": 5000000
  }'
```

### Via Browser

1. Open http://localhost:3000
2. **Price Advisor tab** — Fill form, click "Assess Price"
3. **Dashboard tab** — See market trends and KPIs
4. **Upload tab** — Upload your own dataset or download sample
5. **Market tab** — Analyze variable sensitivity and cost drivers
