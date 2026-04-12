const toNum = v => { const n = parseFloat(v); return isNaN(n) ? null : n; };
const mean = arr => {
  const a = arr.filter(v => v != null && isFinite(v));
  return a.length ? a.reduce((s, v) => s + v, 0) / a.length : 0;
};
const pctile = (arr, p) => {
  const s = [...arr].sort((a, b) => a - b);
  return s[Math.max(0, Math.floor(p / 100 * s.length) - 1)] ?? 0;
};

module.exports = {
  buildStats(parsedRows) {
    const ppms = [], areas = [], prices = [], usds = [];
    const monthly = {}, usdM = {}, byCity = {}, byType = {}, byCompound = {}, byBeds = {};

    for (const row of parsedRows) {
      const ppm = row.price_per_m2;
      // Skip invalid or extreme outliers
      if (!ppm || ppm < 500 || ppm > 500000) continue;
      ppms.push(ppm);

      const area = row.area_m2; if (area && area > 5) areas.push(area);
      const px   = row.price;   if (px   && px > 0)  prices.push(px);
      const usd  = row.usd_to_egp_rate; if (usd && usd > 1) usds.push(usd);

      const yr = row.year, mo = row.month;
      if (yr && mo) {
        const k = `${yr}-${String(parseInt(mo)).padStart(2,'0')}`;
        (monthly[k] = monthly[k] || []).push(ppm);
        if (usd) (usdM[k] = usdM[k] || []).push(usd);
      }

      const city = row.city;                if (city) (byCity[city]     = byCity[city]     || []).push(ppm);
      const type = row.property_type;       if (type) (byType[type]     = byType[type]     || []).push(ppm);
      const cmpd = row.compound;            if (cmpd) (byCompound[cmpd] = byCompound[cmpd] || []).push(ppm);
      const beds = row.bedrooms;
      if (beds) { const bk = `${parseInt(beds)} Bed`; (byBeds[bk] = byBeds[bk] || []).push(ppm); }
    }

    const toAvg  = obj => Object.fromEntries(Object.entries(obj).sort().map(([k,v]) => [k, Math.round(mean(v))]));
    const toRank = (obj, limit=10) =>
      Object.fromEntries(
        Object.entries(obj).sort((a,b) => mean(b[1]) - mean(a[1])).slice(0, limit)
          .map(([k,v]) => [k, { avg: Math.round(mean(v)), count: v.length }])
      );

    return {
      totalRows: parsedRows.length, validRows: ppms.length,
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
      allPpms: ppms,
    };
  },

  mean,
  pctile,
};
