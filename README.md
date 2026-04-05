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
│   └── server.js      ← Express server + ML model (OLS regression)
└── public/
    └── index.html     ← Full SPA frontend (Chart.js)
```

### Server (`server/server.js`)
- **No external ML libraries** — OLS regression implemented from scratch using Gauss-Jordan matrix inversion
- **Auto-detects CSV columns** — fuzzy-matches 16 standard field names across commas, semicolons, and tabs
- **Trains on startup** with synthetic demo data (15,000 rows matching real Egypt market statistics)
- **Retrains instantly** when a new CSV is uploaded via `/api/upload`

### API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/health` | Server status + model R² |
| `GET` | `/api/stats` | Market statistics for dashboard |
| `POST` | `/api/upload` | Upload CSV → retrain model |
| `POST` | `/api/predict` | Price assessment for a unit |

### Prediction Input (`POST /api/predict`)

```json
{
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
  "delivery_months": 12,
  "finishing": "semi",
  "entered_price": 4500000
}
```

Finishing values: `"finished"` | `"semi"` | `"core"`  
Delivery values: `0` | `6` | `12` | `18` | `24` | `36` | `48`

---

## ML Model Details

**Algorithm:** Ordinary Least Squares with Ridge regularisation (λ=0.001)  
**Features (18):** area, bedrooms, bathrooms, distance, luxury score, USD rate, iron/1000, cement/1000, month_sin, month_cos, is_villa, is_chalet, is_apartment, is_cairo, is_giza, is_alexandria, is_north_coast, bias  
**Target:** price_per_m² (EGP)

**Post-model adjustments:**
- Delivery discount (off-plan): Ready=×1.00 → 48mo=×0.78
- Finishing discount: Finished=×1.00, Semi=×0.83, Core=×0.68

**Verdict thresholds:**
- `< -20%` → Significantly Underpriced
- `-20% to -7%` → Underpriced  
- `-7% to +7%` → Fair Price
- `+7% to +20%` → Overpriced
- `> +20%` → Significantly Overpriced

---

## CSV Format

Any CSV with `price_per_m2` (or aliases like `ppm2`, `price/m2`) will work. The server auto-maps column names. Minimum required: **price_per_m2** column with ≥20 valid rows.

Example columns recognised:
```
price_per_m2, area_m2, bedrooms, bathrooms, city, district, compound,
property_type, year, month, usd_to_egp_rate, luxury_score,
distance_to_center, material_costs_iron, material_costs_cement
```
