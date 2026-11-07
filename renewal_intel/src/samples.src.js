/* ---------- sample portfolio (synthetic, clearly labelled as sample) ----------
   Each group tells one story, so a demo shows a different part of the app per click:
   S-01 renewal in days + an unused cover to drop + all within budget
   S-02 healthy group: better benefits for about the same premium; unused ambulance is kept
   S-03 loss-making group, budget not enough, one huge surgery that must not set everyone's cap
   S-04 young workforce: budget fits one increase but not the other
   S-05 older staff: per-case cap on drugs, an underused cover to shrink, data-quality warnings */
function makeSamples(today){
  let seed = 1405;
  const rnd = () => { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
  const logn = (mean, sigma) => { const z = Math.sqrt(-2 * Math.log(1 - rnd())) * Math.cos(2 * Math.PI * rnd()); return mean * Math.exp(sigma * z - sigma * sigma / 2); };
  const r1 = x => Math.round(x * 10) / 10;
  const jOf = d => g2j(d.getFullYear(), d.getMonth() + 1, d.getDate());
  const now = new Date();
  const t = today || jOf(now);
  const pad = n => String(n).padStart(2, "0");
  const dateBack = k => { let y = t[0], m = t[1] - k; while (m < 1){ m += 12; y--; } return `${y}/${pad(m)}/${pad(1 + Math.floor(rnd() * 28))}`; };
  // Contract periods are set relative to today, so "days to renewal" stays the same on every demo day.
  const period = days => { const e = today ? [t[0], t[1], t[2]] : jOf(new Date(now.getTime() + days * 86400000));
    if (today){ let y = e[0], m = e[1], d = e[2] + days; while (d > 30){ d -= 30; m++; if (m > 12){ m = 1; y++; } } e[0] = y; e[1] = m; e[2] = d; }
    return `${e[0] - 1}/${pad(e[1])}/${pad(e[2])}-${e[0]}/${pad(e[1])}/${pad(e[2])}`; };

  // name, users per person-year, claims per user, mean approved per claim (million toman)
  const BASE = [
    ["C01", "بستری", 0.035, 1.2, 55], ["C02", "جراحی", 0.025, 1.1, 140], ["C03", "پاراکلینیک", 0.22, 2, 4],
    ["C04", "دارو", 0.28, 3, 2.4], ["C05", "دندانپزشکی", 0.11, 1.5, 8], ["C06", "عینک", 0.05, 1, 4],
    ["C07", "زایمان", 0.012, 1, 55], ["C08", "آمبولانس", 0.002, 1, 3],
    // Elective covers: every group shows some that are unused (drop) or barely used (shrink).
    ["C09", "فیزیوتراپی", 0.03, 2, 1.5], ["C10", "مشاوره روانشناسی", 0.012, 2, 1.2], ["C11", "لیزیک", 0, 1, 28],
  ];
  // Default caps are roomy, so a group only shows cap pressure where its story puts it.
  const CAPS = { C01: [600, 600], C02: [900, 900], C03: [60, 25], C04: [40, 15], C05: [40, 40], C06: [12, 12], C07: [120, 120], C08: [10, 10], C09: [20, 5], C10: [30, 30], C11: [40, 40] };
  const RANGE = { C01: [400, 2000], C02: [500, 2500], C03: [30, 150], C04: [15, 100], C05: [10, 60], C06: [3, 20], C07: [50, 250], C08: [5, 30], C09: [5, 40], C10: [5, 40], C11: [20, 80] };
  const TARIFFS = [["ویزیت", 0.8, 1, 0.75], ["MRI", 5.5, 7, 0.9], ["CT", 4, 5, 0.9], ["آزمایش", 2.5, 3.2, 0.85], ["جراحی", 100, 130, 0.8], ["دارو", 1, 1.25, 0.95], ["دندان", 2, 2.6, 0.9]];

  const groups = [
    { id: "S-01", name: "نمونه: پخش دارو البرز", industry: "توزیع", province: "البرز", days: 18, parts: [140, 95, 80, 0], age: 36, female: 0.42, budget: 0.15, lr: 0.62, priorLr: 0.6,
      freq: { C06: 0, C05: 0.16 }, sev: { C07: 0.6 }, caps: { C05: [10, 10], C07: [200, 200] } },
    { id: "S-02", name: "نمونه: بانک شهر", industry: "مالی", province: "تهران", days: 45, parts: [1300, 980, 870, 50], age: 44, female: 0.47, budget: 0.1, lr: 0.55, priorLr: 0.58,
      freq: { C08: 0, C07: 0.014, C09: 0 }, sev: { C07: 1.6 }, caps: { C07: [70, 70] } },
    { id: "S-03", name: "نمونه: پتروشیمی بندر", industry: "صنعتی", province: "بوشهر", days: 75, parts: [620, 450, 310, 20], age: 41, female: 0.18, budget: 0.2, lr: 1.04, priorLr: 0.92,
      sev: { C01: 1.3 }, caps: { C01: [90, 90], C02: [1300, 1300] }, outliers: [{ cov: "C02", approved: 2400, service: "جراحی قلب باز" }] },
    { id: "S-04", name: "نمونه: شرکت نرم‌افزاری آوا", industry: "فناوری", province: "تهران", days: 140, parts: [260, 110, 50, 0], age: 31, female: 0.44, budget: 0.3, lr: 0.74, priorLr: 0.7,
      freq: { C07: 0.05, C05: 0.2 }, sev: { C07: 1.3 }, caps: { C07: [50, 50], C05: [12, 12] } },
    { id: "S-05", name: "نمونه: دانشگاه علوم پایه", industry: "آموزشی", province: "اصفهان", days: 260, parts: [900, 640, 520, 40], age: 47, female: 0.39, budget: 0.35, lr: 0.74, priorLr: 0.71,
      freq: { C04: 0.42, C06: 0.004 }, sev: { C04: 2.6 }, caps: { C04: [60, 5], C06: [30, 30], C07: [200, 200] }, capLabelMix: 0.4, docGaps: 0.06 },
    // Added groups widen the range: loss ratio 45%–95%, cost growth ~15%–33%, 60 to 6,000 people, renewal overdue to 200 days, budget 0%–25%.
    { id: "S-06", name: "نمونه: معدن مس کرمان", industry: "معدن", province: "کرمان", days: 7, parts: [700, 180, 60, 0], age: 39, female: 0.05, budget: 0.25, lr: 0.88, priorLr: 0.8,
      trendK: 1.4, freq: { C08: 0.03, C07: 0.004 }, sev: { C08: 3 }, caps: { C08: [10, 10] } },
    { id: "S-07", name: "نمونه: هلدینگ خودروسازی", industry: "خودروسازی", province: "تهران", days: 120, parts: [2600, 1900, 1450, 50], age: 42, female: 0.12, budget: 0.3, lr: 0.79, priorLr: 0.76,
      caps: { C03: [40, 12], C07: [70, 70] } },
    { id: "S-08", name: "نمونه: کلینیک دندانپزشکی لبخند", industry: "خدمات درمانی", province: "شیراز", days: 200, parts: [38, 14, 8, 0], age: 33, female: 0.62, budget: 0.1, lr: 0.45, priorLr: 0.5,
      trendK: 0.65, freq: { C05: 0.25, C10: 0.017 }, caps: { C05: [8, 8] } },
    { id: "S-09", name: "نمونه: پیمانکاری ساختمانی آرمان", industry: "ساختمان", province: "قم", days: -5, parts: [480, 210, 150, 0], age: 38, female: 0.04, budget: 0, lr: 0.95, priorLr: 0.9,
      freq: { C06: 0, C05: 0.012 }, caps: { C05: [60, 60], C03: [60, 6] } },
    { id: "S-10", name: "نمونه: بیمارستان خصوصی مهر", industry: "بیمارستانی", province: "مشهد", days: 28, parts: [700, 260, 180, 0], age: 35, female: 0.7, budget: 0.2, lr: 0.69, priorLr: 0.66,
      trendK: 1.15, freq: { C07: 0.03, C03: 0.35 }, caps: { C07: [80, 80], C03: [40, 10] } },
  ];

  return groups.map(G => {
    const total = G.parts.reduce((a, b) => a + b, 0);
    const coverages = BASE.map(([id, name]) => { const c = (G.caps && G.caps[id]) || CAPS[id]; return { id, name, annualCap: c[0], perCase: c[1], min: RANGE[id][0], max: RANGE[id][1] }; });
    const claims = []; let n = 0;
    const capLabel = () => G.capLabelMix && rnd() < G.capLabelMix ? "سقف تعهد" : "اتمام سقف";
    const add = (cv, member, approved, service, yearPaid) => {
      let paid = Math.min(approved, cv.perCase ?? Infinity, Math.max(0, cv.annualCap - yearPaid));
      let reason = paid < approved ? capLabel() : "";
      if (!reason && rnd() < (G.docGaps || 0.02)){ paid = approved * 0.8; reason = "نقص مدارک"; }
      paid = r1(paid);
      claims.push({ id: `${G.id}-${String(++n).padStart(5, "0")}`, member, date: dateBack(Math.floor(rnd() * 12)), cov: cv.id, covName: cv.name, service,
        approved, paid, unpaid: r1(approved - paid), reason });
      return paid;
    };
    BASE.forEach(([id, name, f0, perUser, sev0]) => {
      const cv = coverages.find(c => c.id === id);
      const f = G.freq && G.freq[id] != null ? G.freq[id] : f0, sev = sev0 * ((G.sev && G.sev[id]) || 1);
      const users = Math.round(total * f * (0.85 + 0.3 * rnd()));
      const used = new Set();
      for (let u = 0; u < users; u++){
        let m; do { m = 1 + Math.floor(rnd() * total); } while (used.has(m)); used.add(m);
        const member = "M" + String(m).padStart(5, "0");
        const k = 1 + Math.floor(rnd() * (perUser - 1) * 2 + rnd() * 0.5);
        let yearPaid = 0;
        for (let j = 0; j < k; j++) yearPaid += add(cv, member, r1(Math.max(0.3, logn(sev, 0.6))), name, yearPaid);
      }
    });
    (G.outliers || []).forEach(o => add(coverages.find(c => c.id === o.cov), "M" + String(total + 1).padStart(5, "0"), o.approved, o.service, 0));
    const paid = claims.reduce((s, c) => s + c.paid, 0);
    const premium = Math.round(paid / G.lr / 10) * 10, priorPremium = Math.round(premium / 1.3 / 10) * 10;
    return {
      sample: true,
      data: {
        group: { id: G.id, name: G.name, industry: G.industry, province: G.province, period: period(G.days), employees: G.parts[0], parts: G.parts, total,
          avgAge: G.age, female: G.female, male: 1 - G.female, budget: G.budget },
        coverages, claims, unpaidList: [],
        premiums: [{ label: "سال قبل", persons: total, premium: priorPremium, paid: Math.round(priorPremium * G.priorLr) }, { label: "سال جاری", persons: total, premium }],
        // trendK scales next year's tariff increase: remote or hospital-heavy groups face steeper cost growth.
        tariffs: TARIFFS.map(([name, old, next, pt]) => ({ name, old, next: old * (1 + (next / old - 1) * (G.trendK || 1)), pt })),
        warn: [],
      },
    };
  });
}
if (typeof module !== "undefined") module.exports.makeSamples = makeSamples;
