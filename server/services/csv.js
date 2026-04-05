const DEFAULT_MATERIAL_COSTS = { iron: 37500, cement: 3600 };

const toNum = v => { const n = parseFloat(v); return isNaN(n) ? null : n; };
const normalizeStr = value => String(value || '').trim().toLowerCase().replace(/[^a-z0-9]+/g, ' ').replace(/\s+/g, ' ').trim();

const canonicalCity = city => {
  const normalized = normalizeStr(city);
  if (!normalized) return '';
  if (normalized.includes('north coast') || normalized.includes('northcoast') || normalized.includes('marassi')) return 'north coast';
  if (normalized.includes('alex')) return 'alexandria';
  if (normalized.includes('giza')) return 'giza';
  if (normalized.includes('cairo')) return 'cairo';
  return normalized;
};

const canonicalType = type => {
  const normalized = normalizeStr(type);
  if (!normalized) return '';
  if (normalized.includes('villa')) return 'villa';
  if (normalized.includes('chalet')) return 'chalet';
  if (normalized.includes('apt')) return 'apartment';
  return normalized;
};

function splitCSVLine(line, delim) {
  const cells = [];
  let cell = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        cell += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (!inQuotes && ch === delim) {
      cells.push(cell);
      cell = '';
    } else {
      cell += ch;
    }
  }
  cells.push(cell);
  return cells;
}

function parseCSVLine(line, delim) {
  return splitCSVLine(line, delim).map(v => v.trim().replace(/^"|"$/g, ''));
}

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
    latitude:              find('latitude','lat'),
    longitude:             find('longitude','lon','lng'),
    project_avg_price:     find('project_avg_price','avg_price','project_price'),
    num_listings_in_project: find('num_listings_in_project','listings_in_project','num_listings'),
  };
}

function buildRowObject(rawRow, headers) {
  const row = {};
  headers.forEach((h, i) => { row[h] = rawRow[i] ?? ''; });
  return row;
}

function resolveValue(row, cm, key) {
  const col = cm[key];
  return col ? row[col] : '';
}

function sanitizeRow(row, cm) {
  const getRaw = key => String(resolveValue(row, cm, key) || '').trim();
  const getNum = key => toNum(resolveValue(row, cm, key));
  const city = canonicalCity(getRaw('city'));
  const type = canonicalType(getRaw('property_type'));
  const pricePerM2 = toNum(getRaw('price_per_m2')) || toNum(getRaw('price_m2')) || toNum(getRaw('ppm2')) || 0;
  const area = getNum('area_m2') || getNum('area') || getNum('sqm') || 0;
  const price = getNum('price');
  const finalPpm = pricePerM2 || (price && area ? price / area : null);

  return {
    price_per_m2: finalPpm,
    price,
    area_m2: area,
    bedrooms: getNum('bedrooms') || getNum('beds') || 0,
    bathrooms: getNum('bathrooms') || getNum('baths') || 0,
    distance_to_center: getNum('distance_to_center') || getNum('distance') || 0,
    luxury_score: getNum('luxury_score') || getNum('luxury') || 0,
    usd_to_egp_rate: getNum('usd_to_egp_rate') || getNum('usd_rate') || getNum('exchange_rate') || 0,
    iron: getNum('material_costs_iron') || getNum('iron_price') || getNum('iron_cost') || DEFAULT_MATERIAL_COSTS.iron,
    cement: getNum('material_costs_cement') || getNum('cement_price') || getNum('cement_cost') || DEFAULT_MATERIAL_COSTS.cement,
    month: getNum('month') || 6,
    year: getNum('year') || new Date().getFullYear(),
    property_type: type,
    city,
    district: getRaw('district'),
    compound: getRaw('compound'),
    latitude: getNum('latitude'),
    longitude: getNum('longitude'),
    project_avg_price: getNum('project_avg_price') || 0,
    num_listings_in_project: getNum('num_listings_in_project') || 0,
  };
}

function isRowEligible(row) {
  return row.price_per_m2 && row.price_per_m2 > 500 && row.price_per_m2 < 500000
    && row.area_m2 >= 10 && row.bedrooms >= 0 && row.bathrooms >= 0
    && row.distance_to_center >= 0 && row.luxury_score >= 0 && row.luxury_score <= 1;
}

module.exports = {
  parseCSV(buffer) {
    const text = buffer.toString('utf8');
    const lines = text.trim().split(/\r?\n/).filter(l => l.trim());
    if (lines.length < 5) throw new Error('CSV needs at least 5 data rows');
    const delim = detectDelim(lines[0]);
    const headers = parseCSVLine(lines[0], delim).map(h => h.trim());
    const colMap = autoMap(headers);
    const rows = lines.slice(1).map(line => buildRowObject(parseCSVLine(line, delim), headers));
    return { rows, colMap, headers };
  },

  sanitizeAndValidate(rows, cm) {
    return rows.map(r => sanitizeRow(r, cm)).filter(isRowEligible);
  },

  canonicalCity,
  canonicalType,
  normalizeStr,
  DEFAULT_MATERIAL_COSTS,
};
