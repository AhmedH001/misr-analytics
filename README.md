# DART AI Real Estate — Egypt Real Estate Intelligence Platform

An advanced real estate analytics and forecasting platform using server-side Random Forest Regression and AI-driven market intelligence.

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
│       ├── model.js           ← Random Forest training & feature importance
│       ├── stats.js           ← Market statistics & aggregation
│       ├── matrix.js          ← Linear algebra utilities
│       └── data.js            ← Dataset loading & fallback management
└── public/
    ├── index.html             ← Modern SPA shell (Bootstrap 5 grid, Lucide icons)
    └── js/
        ├── app.js             ← Main controller, routing, theme management
        ├── services/
        │   └── api.js         ← Centralized HTTP client (Price & Rental API)
        └── pages/
            ├── advisor.js     ← Price Advisor (Pricing & ROI)
            ├── rental.js      ← Rental Advisor (ROR & AI Intelligence)
            ├── dashboard.js   ← Market Dashboard (KPIs & Trends)
            ├── upload.js      ← Data Management & retraining
            └── market.js      ← Market Analysis page
```

### Server Services

**`server/services/csv.js`**
- Parses CSV files with auto-delimiter detection (`,`, `;`, `\t`)
- Fuzzy-matches 16 standard real estate column names
- Handles quoted fields and embedded delimiters
- Sanitizes and validates rows (price range, area, luxury score)

**`server/services/model.js`**
- Trains **Random Forest Regression** with proper train/test validation (80/20 split)
- Computes Feature Importance to identify primary price drivers
- Generates dynamic category features (top 15 cities, 10 property types, 40 compounds)
- Applies delivery and finishing adjustments based on market-standard factors

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
- **Price Advisor** — Dual-scenario unit valuer:
  - **Assess a Price (Buyer/Investor)**: Analyzes if an asking price is fair while factoring in forward-looking economic conditions and due diligence.
  - **List a Unit (Seller)**: Streamlined form delivering immediate pricing based on the current market state, removing the need for macroeconomic forecasting.
- **Rental Advisor** — Dual-scenario rental intelligence (powered by math & Groq AI):
  - **Assess Rent (Tenant)**: Evaluates if an asked monthly rent is fair based on localized district context, bypassing irrelevant yield indicators.
  - **Calculate Yield (Landlord)**: Full investment calculator tracking Purchase Price, Operating Costs, and Mortgage Leverage to compute net yields, Cash-on-Cash, and overall Return on Rent (ROR).
- **Dashboard** — Market KPIs, monthly price trends, interactive charts (Chart.js)
- **Upload** — Live CSV management, dataset downloads, model retraining status
- **Market Analysis** — Variable sensitivity, USD correlation, material cost drivers

### API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/health` | Server status + model R² & RMSE |
| `GET` | `/api/stats` | Market statistics (KPIs, trends, aggregates) |
| `GET` | `/api/model` | Model info (features, categories, adjustments, metrics) |
| `GET` | `/api/download-data` | Download the active dataset as CSV |
| `POST` | `/api/upload` | Upload CSV → parse, validate, retrain Random Forest |
| `POST` | `/api/predict` | Predict unit price with confidence interval & ROI |
| `POST` | `/api/rental-predict` | Calculate Yield, ROR, and financial break-even |

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

### Rental Advisor Input (`POST /api/rental-predict`)

Request body (JSON):
```json
{
  "area_m2": 150,
  "purchase_price": 5000000,
  "monthly_rent": 25000,
  "city": "Cairo",
  "property_type": "Apartment",
  "furnished": "furnished",
  "management_fees_pct": 10,
  "maintenance_pct": 1,
  "vacancy_pct": 8,
  "down_payment_pct": 30,
  "mortgage_rate_pct": 12.5,
  "loan_term_years": 10
}
```

### Rental Advisor Output

Response includes:
- **gross_yield** / **net_yield** / **cash_on_cash** (Percentages)
- **ror_score** — Total investment score (0-100)
- **annual** — Detailed breakdown (Gross Rent, Vacancy, Mortgage, Net Cashflow)
- **market** — Market rent benchmarks and estimates
- **payback_years** / **break_even_rent**

---

## ML Model Details

**Algorithm:** Random Forest Regression (via `ml-random-forest`)

**Key Configuration:**
- 20 Estimators (Trees) for responsive training performance
- Max Depth: 8 (to ensure generalization and avoid overfitting)
- 80/20 Train/Test Split with random shuffling

**Features (Dynamic):**
- Base: area_m2, bedrooms, bathrooms, distance_to_center, luxury_score, usd_to_egp_rate
- Materials: Iron (1000s EGP), Cement (1000s EGP)
- Cyclical: month_sin, month_cos (Sine/Cosine encoding for seasonality)
- Categorical: Top 15 Cities + Top 10 Types + Top 40 Compounds (One-Hot Encoded)

**Feature Importance & Metrics:**
- ✅ Automated Feature Importance ranking (Visible in Market Analysis)
- ✅ Computes R², RMSE, MAE, and Bias on both sets
- ✅ Confidence Intervals (±1.5σ) adjusted for project-specific data density

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

## Rental Advisor & Yield Engine

The **Rental Advisor** provides deep financial analysis for buy-to-let investments.

**Financial Indicators:**
- **Gross Yield**: Total annual rent as % of purchase price.
- **Net Yield**: Annual rent minus operating costs (management, maintenance).
- **Cash-on-Cash (CoC)**: Leveraged return based on down payment and mortgage.
- **Break-even Rent**: Minimum monthly rent required to cover all costs.
- **Payback Period**: Est. years to recover the purchase price.

**AI Market Intelligence (Optional):**
- **Engine**: Integrated with **Groq (Llama 3.3)** for real-time rental estimates.
- **Context**: Localised data on Cairo's premium vs. budget districts.
- **Insights**: Demand levels, tenant profiles, and liquidity ratings.

**Financial Variables:**
- **Management Fees**: Typical range 5–15% of annual rent.
- **Maintenance**: Typically 0.5–2% of property value annually.
- **Vacancy Rates**: Adjusted for regional demand (e.g., 8–12% for North Coast).
- **Mortgage**: Full support for down payment, amortised interest, and loan terms.

---

## CSV Format & Data Upload

**Supported columns** (auto-detected, case-insensitive):
```
price_per_m2, area_m2, bedrooms, bathrooms, city, district, compound,
property_type, year, month, usd_to_egp_rate, luxury_score,
distance_to_center, material_costs_iron, material_costs_cement, latitude, longitude
```

**Upload workflow:**
1. Drag-drop or click to upload a CSV file (e.g., `v4_dataset`).
2. Server parses, validates, and cleans the records.
3. Automatically identifies top 15 cities and 40 compounds for one-hot encoding.
4. Trains **Random Forest** model with train/test validation.
5. Computes Feature Importance scores for all variables.
6. Model is hot-swapped and ready for immediate inference.

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
- **Backend**: Node.js 18+ with Express.js
- **Frontend**: Modern ES6+, Bootstrap 5 (Grid), Lucide Icons
- **ML Engine**: `ml-random-forest` (Random Forest Regression)
- **AI Intelligence**: **Groq Cloud API** (Llama 3.3 70B)
- **Visualization**: Chart.js 4.x (Monthly Trends, Statistics)
- **Design**: Modern Dark/Light theme with CSS Variables (Glassmorphism & Skeletons)

**File Organization:**
- `server/services/` — Modular backend (CSV, Random Forest Model, Stats, Matrix)
- `public/js/services/` — API layer (Predict, Rental, Upload)
- `public/js/pages/` — Component-based pages (Rental Advisor, Price Advisor, etc.)
- `public/index.html` — Modern shell with dynamic theme management

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
