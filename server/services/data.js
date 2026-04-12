const fs = require('fs');
const path = require('path');
const csv = require('./csv');

const DEFAULT_DATA_FILE = path.join(__dirname, '../../egypt_real_estate_ml_dataset_v3.csv');

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

function loadCsvDataset(filePath) {
  if (!fs.existsSync(filePath)) return null;
  try {
    const buffer = fs.readFileSync(filePath);
    return csv.parseCSV(buffer);
  } catch (err) {
    console.warn(`Failed to load dataset ${filePath}:`, err.message);
    return null;
  }
}

module.exports = {
  loadDataset() {
    console.log('⏳ Loading dataset…');
    const fileData = loadCsvDataset(DEFAULT_DATA_FILE);
    if (fileData) {
      return {
        rows: fileData.rows,
        colMap: fileData.colMap,
        source: path.basename(DEFAULT_DATA_FILE),
      };
    }
    console.log('⚠ No usable dataset found, falling back to synthetic demo data');
    const rows = buildDemoRows();
    const keys = ['price_per_m2','price','area_m2','bedrooms','bathrooms','city','district',
                  'compound','property_type','year','month','usd_to_egp_rate','luxury_score',
                  'distance_to_center','material_costs_iron','material_costs_cement'];
    const colMap = Object.fromEntries(keys.map(k => [k, k]));
    return {
      rows,
      colMap,
      source: 'demo',
    };
  },

  getDefaultDataFile() {
    return DEFAULT_DATA_FILE;
  },
};
