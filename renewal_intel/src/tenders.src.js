/* ---------- sample tenders (synthetic, labelled as samples) ----------
   T-01 large gas company whose previous insurer lost money: the right price is above the old one.
   T-02 distribution company with low claims: you can undercut the previous insurer and stay under 75%.
   T-03 small engineering firm with one year of history: low confidence, wider safety margin. */
function makeTenders(today){
  let seed = 1403;
  const rnd = () => { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
  const logn = (mean, sigma) => { const z = Math.sqrt(-2 * Math.log(1 - rnd())) * Math.cos(2 * Math.PI * rnd()); return mean * Math.exp(sigma * z - sigma * sigma / 2); };
  const t = today || (d => g2j(d.getFullYear(), d.getMonth() + 1, d.getDate()))(new Date());
  const BASE = [
    ["C01", "بستری", 0.035, 1.2, 55], ["C02", "جراحی", 0.025, 1.1, 140], ["C03", "پاراکلینیک", 0.22, 2, 4],
    ["C04", "دارو", 0.28, 3, 2.4], ["C05", "دندانپزشکی", 0.11, 1.5, 8], ["C06", "عینک", 0.05, 1, 4],
    ["C07", "زایمان", 0.012, 1, 55], ["C08", "آمبولانس", 0.004, 1, 3],
    ["C09", "فیزیوتراپی", 0.03, 2, 1.5], ["C10", "مشاوره روانشناسی", 0.012, 2, 1.2], ["C11", "لیزیک", 0, 1, 28],
  ];
  const OLD = { C01: [600, 600], C02: [900, 900], C03: [60, 25], C04: [40, 15], C05: [40, 40], C06: [12, 12], C07: [120, 120], C08: [10, 10], C09: [20, 5], C10: [30, 30], C11: [40, 40] };
  const RANGE = { C01: [400, 2000], C02: [500, 2500], C03: [30, 150], C04: [15, 100], C05: [10, 60], C06: [3, 20], C07: [50, 250], C08: [5, 30], C09: [5, 40], C10: [5, 40], C11: [20, 80] };
  const TARIFFS = [["ویزیت", 0.8, 1, 0.75], ["MRI", 5.5, 7, 0.9], ["CT", 4, 5, 0.9], ["آزمایش", 2.5, 3.2, 0.85], ["جراحی", 100, 130, 0.8], ["دارو", 1, 1.25, 0.95], ["دندان", 2, 2.6, 0.9]];

  const tenders = [
    { id: "T-01", name: "نمونه: مناقصهٔ شرکت گاز", industry: "انرژی", province: "خوزستان", insured: [2450, 2520], next: 2600, lrs: [0.92, 1.01],
      freq: { C05: 0.12 }, growth: { C05: 1.35, C04: 1.1 }, old: { C07: [60, 60] }, newCaps: { C07: [120, 120] } },
    { id: "T-02", name: "نمونه: مناقصهٔ پخش سراسری", industry: "توزیع", province: "تهران", insured: [880, 900], next: 920, lrs: [0.5, 0.45],
      freq: { C09: 0 }, growth: {}, old: { C05: [15, 15] }, newCaps: { C05: [20, 20] } },
    { id: "T-03", name: "نمونه: مناقصهٔ مهندسی نوین", industry: "مهندسی", province: "اصفهان", insured: [150], next: 160, lrs: [0.81],
      freq: { C07: 0.03 }, growth: {}, old: { C06: [8, 8] }, newCaps: {} },
  ];

  return tenders.map(G => {
    const yearsN = G.insured.length;
    const years = G.insured.map((insured, k) => {
      const yr = t[0] - (yearsN - k);
      const inflation = Math.pow(1.22, k - (yearsN - 1)); // older years were cheaper
      const cov = {};
      let paidAll = 0;
      BASE.forEach(([id, name, f0, perUser, sev0]) => {
        const cap = (G.old[id] || OLD[id])[0];
        const f = (G.freq[id] != null ? G.freq[id] : f0) * (k === yearsN - 1 ? (G.growth[id] || 1) : 1);
        const users = Math.round(insured * f * (0.9 + 0.2 * rnd()));
        const c = { id, name, claims: 0, users, approved: 0, paid: 0, capUnpaid: 0, oldCap: cap };
        for (let u = 0; u < users; u++){
          const kk = 1 + Math.floor(rnd() * (perUser - 1) * 2 + rnd() * 0.5);
          let yearApproved = 0;
          for (let j = 0; j < kk; j++) yearApproved += Math.max(0.3, logn(sev0 * inflation, 0.6));
          const paid = Math.min(yearApproved, cap);
          c.claims += kk; c.approved += yearApproved; c.paid += paid; c.capUnpaid += yearApproved - paid;
        }
        paidAll += c.paid; cov[id] = c;
      });
      return { year: yr, insured, premium: Math.round(paidAll / G.lrs[k] / 10) * 10, cov };
    });
    const coverages = BASE.map(([id, name]) => { const c = G.newCaps[id] || G.old[id] || OLD[id]; return { id, name, annualCap: c[0], perCase: c[1], min: RANGE[id][0], max: RANGE[id][1] }; });
    return { sample: true, data: { group: { id: G.id, name: G.name, industry: G.industry, province: G.province, total: G.next }, coverages, years,
      tariffs: TARIFFS.map(([name, old, next, pt]) => ({ name, old, next, pt })), warn: [] } };
  });
}
if (typeof module !== "undefined") module.exports.makeTenders = makeTenders;
