/* ================= Claims (خسارت) =================
   A claims report from the insurer's system (one row per service: disease group, service, files, people, amount)
   gives the real cost of every coverage. Joined to the policy's caps it shows where the money went, which caps
   were binding, and what next year should cost — from real numbers instead of assumed shares. */

// Claims groups → coverage keys of the contract (first match wins; the claims wording differs from policy wording).
const CLM_MAP = [
  [/دندان/, "dental"], [/جراحی\s*(های)?\s*مهم|شیمی\s*درمانی|رادیوترا/, "special"], [/بستری/, "hosp"],
  [/زایمان|سزارین/, "delivery"], [/نازایی|ناباروری/, "infert"], [/عیوب\s*انکسار|لیزیک|لازک/, "refractive"],
  [/عینک|لنز/, "glasses"], [/فیزیوتراپی|گفتار\s*درمانی|کار\s*درمانی/, "rehab"], [/جنین|غربالگری/, "fetal"],
  [/اورژانس/, "emergency"], [/ویزیت/, "visit"], [/دارو/, "drug"], [/آزمایش/, "lab"],
  [/سرپایی|گروه\s*سوم/, "outsurg"], [/سایر\s*پاراکلینیک/, "otherpara"], [/گروه\s*دوم/, "diag"], [/پاراکلینیک|گروه\s*اول/, "para"],
  [/سمعک/, "hearing"], [/آمبولانس/, "amb"], [/کارشناسی|نامشخص/, "admin"],
];
const CLM_NAME = Object.assign({}, CCAT_NAME, { otherpara: "سایر پاراکلینیکی (تزریقات، سرم…)", admin: "هزینهٔ کارشناسی و نامشخص", other: "سایر",
  visit: "ویزیت", drug: "دارو", emergency: "اورژانس", para: "تصویربرداری (پاراکلینیک ۱)", diag: "تست‌های تشخیصی (پاراکلینیک ۲)" });
const CLM_HOSP = new Set(["hosp", "special", "delivery", "infert", "refractive"]);
const clmCat = name => { const t = norm(name).replace(/ئ/g, "ی"); const m = CLM_MAP.find(([re]) => re.test(t)); return m ? m[1] : "other"; };
// Caps that may sit under a combined row in the policy
const CAP_FALLBACK = { visit: ["visitdrug"], drug: ["visitdrug"], emergency: ["emergency"], amb: ["ambIn", "amb"] };
const capOf = (c, k) => { if (!c || !c.caps) return null; for (const x of [k, ...(CAP_FALLBACK[k] || [])]) if (c.caps[x] != null) return c.caps[x]; return null; };

function claimsHeader(rows){
  for (let i = 0; i < Math.min(rows.length, 15); i++){
    const h = (rows[i] || []).map(c => norm(c).replace(/[:：]/g, "").trim());
    const f = re => h.findIndex(c => re.test(c));
    const gi = f(/گروه\s*بیماری|گروه\s*خدمت/), ai = f(/مبلغ\s*(خسارت|پرداختی|پرداخت\s*شده)/);
    if (gi >= 0 && ai >= 0) return { i, gi, ai, ni: f(/نام\s*بیماری|نام\s*خدمت|شرح\s*خدمت/), fi: f(/^تعداد\s*پرونده\s*(ها)?$/), ui: f(/مصرف\s*کننده|تعداد\s*افراد/),
      ci: f(/مورد\s*خسارت/), oi: f(/بیمه\s*گذار/), toman: /تومان/.test(h[ai]) };
  }
  return null;
}
const isClaimsBook = sheets => Object.values(sheets).some(r => claimsHeader(r));
function parseClaims(sheets, file){
  const out = { file, org: null, rows: 0, cats: {} };
  Object.values(sheets).forEach(rows => {
    const H = claimsHeader(rows); if (!H) return;
    rows.slice(H.i + 1).forEach(r => {
      const amt = clmNum(r[H.ai]); if (!r[H.gi] || amt == null || !isFinite(amt)) return;
      const g = norm(r[H.gi]).trim(); if (/^جمع|^کل$/.test(g)) return;
      const k = clmCat(g), svc = norm(H.ni >= 0 ? r[H.ni] : g).trim() || g;
      const C = out.cats[k] = out.cats[k] || { k, groups: new Set(), amt: 0, files: 0, cases: 0, svc: {} };
      C.groups.add(g); C.amt += amt; C.files += clmNum(r[H.fi]) || 0; C.cases += clmNum(r[H.ci]) || 0;
      // the same service appears once per entry channel with the same head count → keep the largest, not the sum
      const S = C.svc[svc] = C.svc[svc] || { amt: 0, users: 0, files: 0 }; S.amt += amt; S.files += clmNum(r[H.fi]) || 0; S.users = Math.max(S.users, clmNum(r[H.ui]) || 0);
      if (H.oi >= 0 && !out.org && r[H.oi] && !/نامعتبر/.test(r[H.oi])) out.org = norm(r[H.oi]).replace(/\s*کد\s*\d+\s*$/, "").trim();
      out.rows++;
    });
    out.rial = !H.toman;
  });
  if (!out.rows) throw new Error("ردیف خسارتی پیدا نشد");
  const div = out.rial ? 1e7 : 1e6; // → میلیون تومان
  Object.values(out.cats).forEach(C => { C.amt /= div; Object.values(C.svc).forEach(s => { s.amt /= div; }); C.users = Math.max(0, ...Object.values(C.svc).map(s => s.users)); });
  return out;
}
const clmNum = v => { if (v == null || v === "") return null; if (typeof v === "number") return v; const s = drNorm(String(v)).replace(/[,٬\s]/g, ""); const n = parseFloat(s); return isNaN(n) ? null : n; };

function readClaimsFile(f){
  return new Promise(resolve => {
    if (!/\.(xlsx|xls|csv)$/i.test(f.name) || typeof XLSX === "undefined") return resolve(null);
    const rd = new FileReader();
    rd.onload = () => { try {
      const wb = XLSX.read(new Uint8Array(rd.result), { type: "array" }), sheets = {};
      wb.SheetNames.forEach(n => { sheets[n] = XLSX.utils.sheet_to_json(wb.Sheets[n], { header: 1, raw: true, defval: null }); });
      if (!isClaimsBook(sheets)) return resolve(null);
      resolve(parseClaims(sheets, f.name));
    } catch (e){ resolve({ error: `«${f.name}» خوانده نشد: ${e.message}` }); } };
    rd.onerror = () => resolve(null); rd.readAsArrayBuffer(f);
  });
}
async function takeClaims(files){
  const res = await Promise.all(files.map(readClaimsFile)), rest = files.filter((f, i) => !res[i]);
  const got = res.filter(r => r && !r.error);
  res.filter(r => r && r.error).forEach(r => state.errors.push(r.error));
  got.forEach(c => { const i = state.claims.findIndex(x => x.file === c.file); if (i >= 0) state.claims[i] = c; else state.claims.push(c); });
  return { got, rest };
}

/* ---------- model ---------- */
function mergeClaims(list){
  const cats = {};
  list.forEach(c => Object.values(c.cats).forEach(C => {
    const M = cats[C.k] = cats[C.k] || { k: C.k, amt: 0, files: 0, cases: 0, users: 0, svc: {} };
    M.amt += C.amt; M.files += C.files; M.cases += C.cases; M.users = Math.max(M.users, C.users);
    Object.entries(C.svc).forEach(([n, s]) => { const t = M.svc[n] = M.svc[n] || { amt: 0, users: 0, files: 0 }; t.amt += s.amt; t.files += s.files; t.users = Math.max(t.users, s.users); });
  }));
  return Object.values(cats).sort((a, b) => b.amt - a.amt);
}
// A cap is "binding" when the average user already spends near it; raising it lets that hidden demand through.
function capUplift(avg, c0, c1){
  if (!avg || c0 == null || c1 == null || !isFinite(c0) || !c0) return 0;
  if (!isFinite(c1)) return 0.6 * Math.min(1, avg / c0);
  if (c1 > c0) return Math.min(c1 / c0 - 1, 1) * 0.6 * Math.min(1, avg / c0);
  if (c1 < c0 && avg > c1) return -0.6 * Math.min(1, (avg - c1) / avg);
  return 0;
}
function claimsModel(list, o){
  const N = o.insured || null, cats = mergeClaims(list), total = cats.reduce((s, c) => s + c.amt, 0), L = 1 + o.ibnr;
  const G = cats.map(c => {
    const c0 = capOf(o.old, c.k), c1 = capOf(o.nw, c.k), avg = c.users ? c.amt / c.users : null;
    const up = o.upOverride && o.upOverride[c.k] != null ? o.upOverride[c.k] : capUplift(avg, c0, c1);
    return Object.assign({}, c, { share: c.amt / total, avg, use: N && c.users ? c.users / N : null, c0, c1, press: avg && c0 && isFinite(c0) ? avg / c0 : null, up,
      proj: c.amt * L * (1 + o.infl) * (1 + up), top: Object.entries(c.svc).sort((a, b) => b[1].amt - a[1].amt).slice(0, 3) });
  });
  const projTotal = G.reduce((s, g) => s + g.proj, 0), upW = total ? projTotal / (total * L * (1 + o.infl)) - 1 : 0;
  const pc0 = N ? total * L / N : null, pc1 = N ? projTotal / N : null;
  const hospShare = G.filter(g => CLM_HOSP.has(g.k)).reduce((s, g) => s + g.share, 0);
  const sc = [["اقتصادی", Math.max(0, o.infl - 0.05), 0.85], ["متعادل", o.infl, o.tlr], ["محافظه‌کار", o.infl + 0.1, 0.70]]
    .map(([n, i, lr]) => ({ n, i, lr, pc: pc0 != null ? pc0 * (1 + i) * (1 + upW) : null })).map(s => Object.assign(s, { prem: s.pc != null ? s.pc / s.lr : null }));
  return { G, total, projTotal, upW, pc0, pc1, N, L, lr0: pc0 != null && o.p0 ? pc0 / o.p0 : null, lr1: pc1 != null && o.p1 ? pc1 / o.p1 : null,
    fair: pc1 != null ? pc1 / o.tlr : null, hospShare, sc, o };
}
function claimsAdvice(M, K){
  const o = M.o, A = [], y1 = K && K.year ? fmtYear(K.year) : o.nw ? fmtYear(o.nw.year) : "سال بعد";
  if (K){ const ref = K.P.find(p => p.id === "ins") || K.P.find(p => p.id === K.rec); M = Object.assign({}, M, { fair: ref.fair }); }
  if (M.lr0 != null){
    if (M.lr0 >= 0.85) A.push(["warn", "سال خسارت زیان‌ده بوده", `Loss Ratio ${fmtPct(M.lr0)} (با خسارت دیررس). بیمه‌گر برای کم کردن نرخ انعطاف کمی دارد و افزایش نرخ منطقی است.`]);
    else if (M.lr0 < 0.75) A.push(["ok", "سال خسارت سودده بوده", `Loss Ratio ${fmtPct(M.lr0)}. اهرم مذاکره برای نرخ پایین‌تر یا سقف بیشتر دارید.`]);
    else A.push(["note", "سال خسارت در محدودهٔ تعادل", `Loss Ratio ${fmtPct(M.lr0)}.`]);
  }
  if (M.fair != null && o.p1){
    const gap = o.p1 / M.fair - 1;
    if (gap > 0.1) A.push(["warn", `نرخ ${y1} گران است`, `${fmtNum(o.p1)} در برابر نرخ منصفانهٔ ${fmtNum(M.fair)} (${fmtSignedPct(gap)}). تا حدود ${fmtNum(M.fair)} مذاکره کنید${M.N ? `؛ صرفه‌جویی کل حدود ${fmtNum((o.p1 - M.fair) * M.N / 1000)} میلیارد تومان` : ""}.`]);
    else if (gap < -0.1) A.push(["ok", `نرخ ${y1} به نفع کارفرماست`, `${fmtNum(o.p1)} در برابر نرخ منصفانهٔ ${fmtNum(M.fair)} (${fmtSignedPct(gap)}). برای کم کردن نرخ فشار نیاورید؛ روی شرایط (پوشش والدین، دورهٔ انتظار، تعرفه) مذاکره کنید و برای افزایش سال بعد آماده باشید.`]);
    else A.push(["note", `نرخ ${y1} منصفانه است`, `${fmtNum(o.p1)} در برابر ${fmtNum(M.fair)}. جای مذاکره روی نرخ کم است؛ روی شرایط و سقف‌های پرمصرف مذاکره کنید.`]);
  }
  const bind = M.G.filter(g => g.press != null && g.press >= 0.8);
  if (bind.length) A.push(["warn", "این سقف‌ها کم بوده‌اند", bind.map(g => `${CLM_NAME[g.k] || g.k}: میانگین هر نفر ${fmtNum(g.avg)} با سقف ${MT(g.c0)}`).join("؛ ") + (o.nw ? "؛ با سقف جدید هزینه‌شان بالا می‌رود." : "؛ کارکنان بخشی از هزینه را خودشان داده‌اند.")]);
  const busy = M.G.filter(g => g.use != null && g.use >= 0.4).sort((a, b) => b.use - a.use);
  if (busy.length) A.push(["info", "پرمصرف‌ترین پوشش‌ها", busy.slice(0, 4).map(g => `${CLM_NAME[g.k] || g.k} ${fmtPct(g.use)} افراد`).join("، ") + ". کم کردن این‌ها بیشترین نارضایتی را می‌سازد."]);
  const big = M.G[0]; if (big) A.push(["info", "بیشترین هزینه", `${CLM_NAME[big.k] || big.k}: ${fmtPct(big.share)} کل خسارت (${fmtNum(big.amt)} میلیون تومان)` + (big.k === "dental" ? ". اگر نرخ باید پایین بیاید، محدود کردن روکش و ایمپلنت اهرم اصلی است." : ".")]);
  const over = M.G.filter(g => ["hosp", "special"].includes(g.k) && g.avg && g.c1 && isFinite(g.c1) && g.avg * 3 < g.c1);
  if (over.length) A.push(["note", "سقف جدید کافی است", over.map(g => `${CLM_NAME[g.k]} (میانگین ${fmtNum(g.avg)}، سقف ${MT(g.c1)})`).join("، ") + "؛ بالا بردن بیشتر فقط گران‌تر می‌کند."]);
  if (M.hospShare < 0.25) A.push(["note", "سهم بیمارستانی کم است", `فقط ${fmtPct(M.hospShare)} خسارت. اگر خسارت‌های بستری هنوز کامل ثبت نشده، «خسارت دیررس» را بالاتر بگذارید.`]);
  const maxU = Math.max(0, ...M.G.map(g => g.users || 0));
  if (M.N && maxU > M.N) A.push(["warn", "تعداد نفرات را چک کنید", `${fmtInt(maxU)} نفر از یک پوشش استفاده کرده‌اند ولی بیمه‌شدگان ${fmtInt(M.N)} نفرند (شاید والدین یا تحت تکفل حساب نشده‌اند).`]);
  return A;
}
const fmtYear = y => y ? fmtInt(y).replace(/٬/g, "") : "";

/* ---------- next-year packages ----------
   Each package is a full set of next-year caps; its premium comes from the real claims: every coverage's cost
   grows with medical inflation, and with the cap's growth beyond inflation where users were limited by it. */
const PKG_ORDER = ["hosp", "special", "delivery", "infert", "para", "diag", "lab", "fetal", "outsurg", "rehab", "visitdrug", "visit", "drug", "emergency", "dental", "refractive", "glasses", "hearing", "ambIn", "ambOut", "amb", "organs", "prosthesis", "orthosis", "supplies", "specialDis", "combo", "total"];
const roundUp1 = v => Math.ceil(v * 10 - 1e-9) / 10;
// Expected claims cost of a set of next-year caps: a removed coverage (cap 0) costs nothing; otherwise each coverage
// grows with inflation, plus or minus what its cap (in real terms) lets through compared with this year.
function costOf(M, caps){
  const g = 1 + M.o.infl;
  return M.G.reduce((s, x) => { const c1 = capOf({ caps }, x.k); if (c1 === 0) return s;
    const up = x.c0 != null && c1 != null ? capUplift(x.avg, x.c0, isFinite(c1) ? c1 / g : c1) : 0; return s + x.amt * M.L * g * (1 + up); }, 0);
}
const priceOf = (M, caps) => roundUp1(costOf(M, caps) / M.N / M.o.tlr);
function claimsPackages(M){
  const o = M.o, old = o.old; if (!old || !old.caps || !M.N) return null;
  const g = 1 + o.infl, by = Object.fromEntries(M.G.map(x => [x.k, x]));
  const HOSP = new Set(["hosp", "special", "combo", "total", "delivery", "infert", "specialDis"]);
  const binding = k => (k === "visitdrug" ? [by.visit, by.drug] : [by[k]]).some(x => x && x.press != null && x.press >= 0.8);
  const P = [
    { id: "keep", n: "حفظ وضع", d: "بستری و جراحی هم‌پای تورم؛ بقیهٔ سقف‌ها ثابت", cap: (k, v) => HOSP.has(k) ? v * g : v },
    { id: "bal", n: "متعادل", d: "همهٔ سقف‌ها هم‌پای تورم؛ سقف‌هایی که پر شده بودند ۵۰٪ بیشتر", cap: (k, v) => v * g * (binding(k) ? 1.5 : 1) },
    { id: "full", n: "رضایت بالا", d: "همه ۳۰٪ بیشتر از تورم؛ سقف‌هایی که پر شده بودند ۲ برابر", cap: (k, v) => v * g * (binding(k) ? 2 : 1.3) },
  ];
  // «بیشترین سقف با این بودجه»: the way insurers bid. Start from last year's caps unchanged in rials (frequent items lose
  // value to inflation, which funds the rest), then raise caps step by step where a rial of premium buys the most cap —
  // rare, large covers (hospital, special surgery, combined caps) first; frequent, expensive ones (dental, visit) last.
  P.forEach(p => { p.secondary = true; });
  // «تحلیل واقعی»: every cap set from last year's real use — unused or rarely used, cheap items go; rarely used ones get
  // a smaller cap; items people use and fill get more; hospital and special surgery keep at least their real value.
  const grp = k => k === "visitdrug" ? ["visit", "drug"].map(q => by[q]).filter(Boolean) : [by[k]].filter(Boolean);
  const real = {};
  Object.entries(old.caps).forEach(([k, v]) => {
    if (v == null || !isFinite(v) || k === "combo" || k === "total"){ real[k] = v; return; }
    const xs = grp(k);
    if (!xs.length){ real[k] = CATA.has(k) ? nice(v * g) : 0; return; }
    const use = Math.max(...xs.map(x => x.use || 0)), users = Math.max(...xs.map(x => x.users || 0)), avg = users ? xs.reduce((t, x) => t + x.amt, 0) / users : 0, press = avg / v;
    if (!CATA.has(k) && use < 0.01 && avg * g < 15) real[k] = 0;
    else if (CATA.has(k)) real[k] = nice(Math.max(v * g, avg * g * 1.5));
    else if ((press >= 0.6 && use >= 0.03) || (use >= 0.2 && press >= 0.4)) real[k] = nice(Math.max(v * g, avg * g * 2));
    else if (use < 0.03) real[k] = nice(Math.min(v * g, Math.max(avg * g * 2.5, v * 0.5)));
    else real[k] = nice(v * g);
  });
  if (old.caps.combo != null) real.combo = nice(Math.max(old.caps.combo * g, real.special || 0, real.hosp || 0));
  if (old.caps.total != null) real.total = nice(old.caps.total * g);
  const realPrice = priceOf(M, real);
  P.unshift({ id: "real", n: "تحلیل واقعی", d: "از خسارت پارسال: بندهای بی‌استفاده حذف، کم‌استفاده‌ها سقف کمتر، پرمتقاضی‌ها و پرشده‌ها سقف بیشتر؛ بستری و جراحی خاص با ارزش واقعی", caps: real });
  const budget = state.cl.budget || realPrice;
  if (budget){
    // an insurer charges for a higher cap even when few reach it: 4% of the coverage's cost for every doubling
    const amtOf = k => (k === "visitdrug" ? ["visit", "drug"] : [k]).reduce((t, q) => t + (by[q] ? by[q].amt : 0), 0) * M.L * g / M.N;
    const load = c => Object.keys(c).reduce((t, k) => t + (old.caps[k] && isFinite(c[k]) && c[k] > old.caps[k] ? amtOf(k) * 0.04 * Math.log2(c[k] / old.caps[k]) : 0), 0);
    const caps = Object.assign({}, old.caps), price = c => (costOf(M, c) / M.N + load(c)) / o.tlr;
    // frequently used items (a fifth of the group or more) grow at most with inflation; rare ones up to ×3.2
    const useOf = k => Math.max(0, ...(k === "visitdrug" ? ["visit", "drug"] : [k]).map(q => by[q] && by[q].use || 0));
    const maxOf = k => useOf(k) >= 0.2 ? g : 3.2;
    const keys = Object.keys(caps).filter(k => caps[k] != null && isFinite(caps[k]) && caps[k] > 0 && k !== "total");
    let cur = price(caps); const short = cur > budget;
    for (let it = 0; it < 400 && cur < budget; it++){
      let best = null;
      keys.forEach(k => { const to = nice(caps[k] * 1.25); if (to <= caps[k] || to > old.caps[k] * maxOf(k) * 1.001) return;
        const t = Object.assign({}, caps, { [k]: to }), d = price(t) - cur, gain = Math.log(to / caps[k]) * (k === "combo" ? 0.5 : 1);
        const score = gain / Math.max(d, 1e-4); if (cur + d <= budget && (!best || score > best.score)) best = { k, to, d, score }; });
      if (!best) break; caps[best.k] = best.to; cur += best.d;
    }
    // combined caps never below the rows they combine; the annual total grows with the largest cap
    if (caps.combo != null && caps.special) caps.combo = Math.max(caps.combo, caps.special);
    if (old.caps.total) caps.total = nice(Math.max(caps.total, old.caps.total * Math.max(...keys.map(k => caps[k] / old.caps[k]))));
    P.splice(1, 0, { id: "opt", n: "به نفع بیمه‌گر", caps, short, budget: short ? null : budget,
      d: short ? `بودجهٔ ${fmtNum(budget)} حتی برای سقف‌های سال قبل (بدون افزایش) کافی نیست` : `همان نرخ ${fmtNum(budget)}: بندهای پرمتقاضی (ویزیت، دارو، دندان…) حداکثر هم‌پای تورم، سقف‌های بزرگ و کم‌تکرار بالا؛ روی کاغذ بزرگ‌تر، پرداخت واقعی کمتر، سود بیمه‌گر بیشتر` });

    // «به نفع کارکنان»: the same budget spent where people actually claim. Rare, non-critical items stay at last year's
    // rials; hospital and special surgery keep their real value; then the most used and most constrained items rise first.
    const KEEPV = new Set(["hosp", "special", "delivery", "specialDis", "organs", "ambIn", "ambOut", "amb", "combo", "total"]);
    const avgOf = k => { const qs = (k === "visitdrug" ? ["visit", "drug"] : [k]).filter(q => by[q]); if (!qs.length) return 0; const u = Math.max(...qs.map(q => by[q].users || 0)); return u ? qs.reduce((t, q) => t + by[q].amt, 0) / u : 0; };
    const ec = {}, eprice = c => costOf(M, c) / M.N / o.tlr;
    Object.entries(old.caps).forEach(([k, v]) => { ec[k] = v == null || !isFinite(v) ? v : KEEPV.has(k) || useOf(k) >= 0.2 || (by[k] && by[k].press >= 0.8) ? nice(v * g) : v; });
    let ecur = eprice(ec); const eshort = ecur > budget;
    const want = Object.keys(ec).filter(k => ec[k] && isFinite(ec[k]) && !["combo", "total"].includes(k) && useOf(k) >= 0.03);
    for (let it = 0; it < 300 && ecur < budget; it++){
      let best = null;
      want.forEach(k => { const to = nice(ec[k] * 1.2); if (to <= ec[k] || to > old.caps[k] * 3.5) return;
        const pressure = Math.min(1.5, avgOf(k) * g / ec[k]); if (pressure < 0.35) return; // nobody is held back by this cap any more
        const t = Object.assign({}, ec, { [k]: to }), d = eprice(t) - ecur; if (ecur + d > budget) return;
        const score = useOf(k) * pressure; if (!best || score > best.score) best = { k, to, d, score }; });
      if (!best) break; ec[best.k] = best.to; ecur += best.d;
    }
    if (ec.combo != null && ec.special) ec.combo = Math.max(ec.combo, nice(old.caps.combo * g), ec.special);
    if (old.caps.total) ec.total = nice(old.caps.total * g);
    P.push({ id: "emp", n: "به نفع کارکنان", secondary: true, caps: ec, short: eshort, budget: eshort ? null : budget,
      d: eshort ? `بودجهٔ ${fmtNum(budget)} برای حفظ ارزش بندهای پرمتقاضی کافی نیست` : `با همین ${fmtNum(budget)}: بندهای کم‌متقاضی ثابت، پولش به بندهای پرمتقاضی و پرشده (دندان، ویزیت، دارو، عینک، آزمایش)` });
  }
  // the broker's own package: the recommended one with the changes ticked under «تغییر پوشش‌ها»
  const tw = state.cl.tweaks || {};
  if (Object.keys(tw).length) P.splice(2, 0, { id: "custom", n: "سفارشی شما", d: `بستهٔ «تحلیل واقعی» با ${fmtInt(Object.keys(tw).length)} تغییر شما`, caps: Object.assign({}, real, tw) });
  if (o.nw && o.nw.caps) P.push({ id: "ins", n: "پیشنهاد بیمه‌گر", d: `سقف‌های بیمه‌نامهٔ ${fmtYear(o.nw.year)}`, caps: o.nw.caps, prem: o.p1 || null });
  const Mup = Object.assign({}, M, { G: M.G.map(x => (x.use || 0) >= 0.2 ? Object.assign({}, x, { amt: x.amt * 1.2, avg: (x.avg || 0) * 1.2 }) : x) });
  P.forEach(p => {
    if (!p.caps) p.caps = Object.fromEntries(Object.entries(old.caps).map(([k, v]) => [k, v != null && isFinite(v) ? nice(p.cap(k, v)) : v]));
    // in real terms next year's cap is c1 / (1 + inflation); compare that with this year's cap
    p.cost = costOf(M, p.caps);
    p.pc = p.cost / M.N; p.fair = roundUp1(p.pc / o.tlr);
    if (p.prem == null) p.prem = p.budget || p.fair;
    p.total = p.prem * M.N; p.lr = p.pc / p.prem; p.ch = o.p0 ? p.prem / o.p0 - 1 : null;
    // what if the items most people use are used 20% more (higher caps invite more use)?
    p.lrUp = costOf(Mup, p.caps) / M.N / p.prem;
  });
  return { P, rec: "real", year: o.nw ? o.nw.year : old.year ? old.year + 1 : null };
}

/* ---------- which coverage to cut, cap, raise or keep ----------
   Starting from the recommended package, every coverage is judged on last year's real use: rarely used and cheap
   per person → can go; users stopped by the cap → raise; a large optional item → hold its growth; rare but
   catastrophic (hospital, special surgery, delivery) → always keep. Each change shows its effect on the premium. */
const CATA = new Set(["hosp", "special", "delivery", "specialDis", "organs", "combo", "total", "ambIn", "ambOut", "amb"]);
const OPTIONAL = new Set(["dental", "glasses", "rehab", "refractive", "hearing", "visit", "drug", "visitdrug", "otherpara"]);
function coverageAdvice(M, K){
  if (!K) return [];
  const bal = K.P.find(p => p.id === "real") || K.P.find(p => p.id === "bal"), per = caps => costOf(M, caps) / M.N / M.o.tlr, base = per(bal.caps), old = M.o.old, g = 1 + M.o.infl, out = [];
  const by = Object.fromEntries(M.G.map(x => [x.k, x]));
  const effect = (k, v) => Math.round((per(Object.assign({}, bal.caps, { [k]: v })) - base) * 100) / 100;
  Object.keys(bal.caps).filter(k => !["combo", "total"].includes(k) && bal.caps[k] != null && isFinite(bal.caps[k]) && bal.caps[k] > 0).forEach(k => {
    if (k === "visitdrug" && (by.visit || by.drug)) return; // its claims are judged under ویزیت and دارو
    const x = by[k], c0 = old.caps[k], c1 = bal.caps[k], name = CCAT_NAME[k] || k;
    if (!x){ // in the policy, no claims at all last year
      if (!CATA.has(k)) out.push({ k, act: "remove", name, to: 0, why: "سال قبل هیچ خسارتی نداشت", eff: effect(k, 0), use: 0 });
      return;
    }
    const use = x.use || 0, avg = x.avg || 0;
    if (x.press != null && x.press >= 0.8 && use >= 0.03){
      const to = nice(Math.max(c1, avg * g * 1.6)); if (to > c1) out.push({ k, act: "raise", name, to, from: c1, why: `${fmtPct(use)} افراد استفاده کردند و میانگین ${fmtNum(avg)} به سقف ${MT(c0)} رسید`, eff: effect(k, to), use });
      if (OPTIONAL.has(k) && x.share >= 0.08){ const hold = nice(c0 * g); if (hold < c1) out.push({ k, act: "hold", name, to: hold, from: c1, why: `${fmtPct(x.share)} کل خسارت؛ اگر نرخ مهم‌تر است، سقف فقط هم‌پای تورم بالا برود`, eff: effect(k, hold), use }); }
      return;
    }
    if (!CATA.has(k) && use < 0.01 && avg * g < 15){
      out.push({ k, act: "remove", name, to: 0, why: `فقط ${fmtInt(x.users)} نفر (${fmtPct(use)}) استفاده کردند`, eff: effect(k, 0), use }); return;
    }
    if (OPTIONAL.has(k) && x.share >= 0.08 && c1 > c0 * g * 1.01){ const hold = nice(c0 * g); out.push({ k, act: "hold", name, to: hold, from: c1, why: `${fmtPct(x.share)} کل خسارت`, eff: effect(k, hold), use }); return; }
    if (!CATA.has(k) && avg && c1 > avg * g * 6 && x.share < 0.05){ const to = nice(avg * g * 3); if (to < c1) out.push({ k, act: "cut", name, to, from: c1, why: `میانگین مصرف ${fmtNum(avg)} است و سقف ${MT(c1)} خیلی بیشتر از نیاز`, eff: effect(k, to), use }); return; }
    if (CATA.has(k)) out.push({ k, act: "keep", name, why: `${fmtInt(x.users)} نفر استفاده کردند ولی هر مورد پرهزینه است (میانگین ${fmtNum(avg)})؛ حذف یا کاهش، ریسک بزرگی روی کارکنان می‌گذارد`, eff: 0, use });
  });
  const order = { raise: 0, hold: 1, remove: 2, cut: 3, keep: 4 };
  return out.sort((a, b) => order[a.act] - order[b.act] || Math.abs(b.eff) - Math.abs(a.eff));
}
function adviceHTML(M, K){
  const A = coverageAdvice(M, K); if (!A.length) return "";
  const tw = state.cl.tweaks || {}, L = { raise: ["افزایش سقف", "t-good"], hold: ["محدود کردن رشد", "t-mid"], remove: ["حذف", "t-bad"], cut: ["کاهش سقف", "t-mid"], keep: ["حفظ", "t-protect"] };
  const save = A.filter(a => a.eff < 0).reduce((s, a) => s + a.eff, 0), y = fmtYear(K.year);
  return `<section class="panel" id="tweaks"><div class="panel-h"><h2>تغییر پوشش‌ها: کدام را حذف، کم یا زیاد کنیم</h2><span class="small muted">از خسارت واقعی؛ اثر هر تغییر روی حق‌بیمهٔ هر نفر نسبت به بستهٔ «تحلیل واقعی»</span></div>
    <div class="panel-b" style="display:flex;flex-direction:column;gap:12px">
    <div class="tw"><table class="clmt" style="min-width:720px"><thead><tr><th style="width:34px"></th><th>پوشش</th><th>پیشنهاد</th><th>چرا</th><th>اثر بر حق‌بیمهٔ هر نفر</th></tr></thead><tbody>
    ${A.map(a => `<tr${a.act === "keep" ? ' class="muted"' : ""}><td>${a.act === "keep" ? "" : `<input type="checkbox" data-tw="${a.k}" data-to="${a.to}" ${tw[a.k] === a.to ? "checked" : ""} aria-label="اعمال">`}</td>
      <td><b>${esc(a.name)}</b></td><td class="nw"><span class="tag ${L[a.act][1]}">${L[a.act][0]}</span>${a.act !== "remove" && a.act !== "keep" ? ` <span class="num small">${MT(a.from)} ← ${MT(a.to)}</span>` : ""}</td>
      <td class="small">${esc(a.why)}</td><td class="num nw" style="font-weight:800;color:${a.eff < 0 ? "var(--good)" : a.eff > 0 ? "var(--mid-ink)" : "var(--ink2)"}">${Math.abs(a.eff) >= 0.05 ? fmtNum(Math.abs(a.eff)) + " میلیون " + (a.eff > 0 ? "بیشتر" : "کمتر") : a.act === "keep" ? "—" : "ناچیز (کمتر از ۰٫۱)"}</td></tr>`).join("")}
    </tbody></table></div>
    <p class="small muted" style="margin:0;line-height:1.9">${save < 0 ? `همهٔ حذف‌ها و محدودسازی‌ها با هم حدود <b class="num">${fmtNum(-save)}</b> میلیون تومان از حق‌بیمهٔ هر نفر ${y} کم می‌کند. ` : ""}پوشش‌های کم‌استفاده معمولاً سهم کمی از هزینه دارند؛ اهرم اصلی نرخ، پوشش‌های پرهزینه است. تیک بزنید تا «بستهٔ سفارشی شما» بالا ساخته شود و بتوانید پیش‌نویسش را صادر کنید.</p>
    </div></section>`;
}
const pkgCaps = (p, old) => PKG_ORDER.filter(k => p.caps[k] != null || (old && old.caps[k] != null)).map(k => [k, old ? old.caps[k] : null, p.caps[k]]);
function packagesHTML(M, K){
  if (!K) return `<section class="panel"><div class="panel-b small" style="color:var(--mid-ink);line-height:2">${!M.o.old ? "برای پیشنهاد سال بعد، بیمه‌نامهٔ سال خسارت (سقف تعهدات) را هم بدهید تا سقف‌ها معلوم شود." : "برای پیشنهاد سال بعد، تعداد بیمه‌شدگان را وارد کنید."}</div></section>`;
  const y = fmtYear(K.year), sel = state.cl.pkg || K.rec, old = M.o.old, main = K.P.filter(p => !p.secondary), more = K.P.filter(p => p.secondary);
  const key = ["hosp", "dental", "visit", "drug", "para", "glasses"].filter(k => old.caps[k] != null).slice(0, 4);
  return `<section class="panel proj" id="pkgs"><div class="panel-h"><h2>پیشنهاد سال ${y}</h2><span class="small muted">بر پایهٔ خسارت واقعی · Loss Ratio هدف ${fmtPct(M.o.tlr)} · تورم ${fmtPct(M.o.infl)}</span></div>
    <div class="panel-b" style="display:flex;flex-direction:column;gap:16px">${[main, more].map((L, li) => !L.length ? "" : `${li ? `<details${more.some(p => p.id === sel) ? " open" : ""}><summary class="small" style="cursor:pointer;font-weight:700;color:var(--brand)">بسته‌های دیگر (${fmtInt(more.length)})</summary><div style="height:12px"></div>` : ""}<div class="scn${L.length > 3 ? " scn4" : ""}${L.length > 4 ? " scn5" : ""}">${L.map(p => `<div class="sc pkg ${p.id === K.rec ? "rec" : ""} ${p.id === sel ? "on" : ""}" data-pkg="${p.id}" role="button" tabindex="0" aria-pressed="${p.id === sel}">${p.id === K.rec ? '<span class="badge">پیشنهاد اپ</span>' : ""}<span class="tag ${p.id === "ins" ? "t-mid" : "t-protect"}" style="align-self:flex-start">${p.n}</span>
      <div class="pr"><b class="num">${fmtNum(p.prem)}</b> <span class="small muted">میلیون تومان / نفر</span></div>
      <div class="small" style="font-weight:800">کل: <span class="num">${fmtNum(p.total / 1000)}</span> میلیارد تومان${p.ch != null ? ` · <span style="color:var(--mid-ink)">${fmtSignedPct(p.ch)}</span> نسبت به ${fmtYear(old.year)}` : ""}</div>
      <span class="small ${p.short ? "" : "muted"}"${p.short ? ' style="color:var(--bad);font-weight:700"' : ""}>${p.d}</span>
      <ul>${key.map(k => `<li><span class="muted">${CCAT_NAME[k]}</span><b class="num">${MT(old.caps[k])} ← ${MT(p.caps[k])}</b></li>`).join("")}${!p.secondary || p.id === "emp" ? `<li><span class="muted">پرداخت واقعی به هر نفر</span><b class="num">${fmtNum(p.pc)} میلیون</b></li><li><span class="muted">سهم بیمه‌گر (هزینه و سود)</span><b class="num">${fmtPct(1 - p.lr)}</b></li>` : ""}<li><span class="muted">Loss Ratio مورد انتظار</span><b style="color:${p.lr < 0.75 ? "var(--good)" : p.lr <= 0.85 ? "var(--mid-ink)" : "var(--bad)"}">${fmtPct(p.lr)}</b></li><li><span class="muted">اگر مصرف بندهای پرمتقاضی ۲۰٪ بیشتر شود</span><b style="color:${p.lrUp < 0.75 ? "var(--good)" : p.lrUp <= 0.85 ? "var(--mid-ink)" : "var(--bad)"}">${fmtPct(p.lrUp)}</b></li>${p.id === "ins" && p.fair !== p.prem ? `<li><span class="muted">نرخ منصفانهٔ همین سقف‌ها</span><b class="num">${fmtNum(p.fair)}</b></li>` : ""}</ul>
      <button class="btn ${p.id === sel ? "primary" : ""}" type="button" data-issue="${p.id}">صدور پیش‌نویس بیمه‌نامه</button></div>`).join("")}</div>${li ? "</details>" : ""}`).join("")}
      <details><summary class="small" style="cursor:pointer;font-weight:700;color:var(--brand)">سقف همهٔ پوشش‌ها در هر بسته</summary><div class="tw" style="margin-top:10px"><table style="min-width:620px"><thead><tr><th>پوشش</th><th>سقف ${fmtYear(old.year)}</th>${K.P.map(p => `<th>${p.n}</th>`).join("")}</tr></thead><tbody>
      ${pkgCaps(K.P[0], old).map(([k, a]) => `<tr><td>${CCAT_NAME[k] || k}</td><td class="nw">${a != null ? MT(a) : "—"}</td>${K.P.map(p => `<td class="nw"${p.caps[k] !== a ? ' style="font-weight:800;color:var(--brand)"' : ""}>${p.caps[k] != null ? MT(p.caps[k]) : "—"}</td>`).join("")}</tr>`).join("")}</tbody></table></div></details>
    </div></section>`;
}

/* ---------- policy draft from the chosen package ----------
   Laid out like the policy it renews: the same boxes, the same commitments table and row order, the same
   wording. No insurer logo, QR or stamp: it is the broker's draft, the insurer issues the real policy. */
const STD_ROW = {
  orthosis: "هزینه تهیه اروتز که بلافاصله بعد از عمل جراحی به تشخیص پزشک معالج و تأیید پزشک معتمد بیمه‌گر مورد نیاز باشد",
  hosp: "۱- جبران هزینه‌های بستری، جراحی، آنژیوگرافی قلب، گامانایف و انواع سنگ‌شکن در بیمارستان و مراکز جراحی محدود و DAY CARE",
  refractive: "۲- هزینه رفع عیوب انکساری دو چشم در مواردی که به تشخیص پزشک معتمد بیمه‌گر درجه نزدیک‌بینی، دوربینی، آستیگمات یا مجموع قدر مطلق نقص بینایی هر چشم ۳ دیوپتر یا بیشتر باشد",
  ambIn: "۳- هزینه آمبولانس و سایر فوریت‌های پزشکی مشروط به بستری شدن بیمه‌شده در مراکز درمانی در داخل شهر",
  ambOut: "۴- هزینه آمبولانس و سایر فوریت‌های پزشکی مشروط به بستری شدن بیمه‌شده در مراکز درمانی بین شهری",
  delivery: "۵- هزینه‌های زایمان طبیعی و سزارین",
  special: "۶- جبران هزینه‌های شیمی‌درمانی، رادیوتراپی، اعمال جراحی مربوط به سرطان، مغز و اعصاب مرکزی و نخاع، دیسک ستون فقرات، گامانایف، قلب، پیوند ریه، پیوند کبد، پیوند کلیه، پیوند مغز استخوان، آنژیوپلاستی عروق کرونر و عروق داخل مغز",
  para: "۷- جبران هزینه انواع رادیوگرافی، آنژیوگرافی عروق محیطی، آنژیوگرافی چشم، سونوگرافی، ماموگرافی و انواع اسکن، ام آر آی، پزشکی هسته‌ای (شامل اسکن هسته‌ای و درمان رادیوایزوتوپ)، دانسیتومتری",
  diag: "۸- جبران هزینه انواع آندوسکوپی، خدمات تشخیصی قلبی و عروقی شامل انواع الکتروکاردیوگرافی، انواع اکوکاردیوگرافی، انواع هولتر مانیتورینگ، تست ورزش، آنالیز پیس میکر، EECP، تیلت تست، خدمات تشخیصی تنفسی شامل (اسپیرومتری و PFT)، خدمات تشخیصی الکترومیوگرافی و هدایت عصبی (EMG NCV)، الکتروانسفالوگرافی (EEG)، خدمات تشخیصی یورودینامیک (نوار مثانه)، خدمات تشخیصی و پرتوپزشکی چشم مانند اپتومتری، پریمتری، بیومتری و پنتاکم، شنوایی‌سنجی (انواع ادیومتری)",
  outsurg: "۹- جبران هزینه اعمال مجاز سرپایی مانند شکستگی و دررفتگی، گچ‌گیری، ختنه، بخیه، کرایوتراپی، اکسیزیون لیپوم، بیوپسی، تخلیه کیست و لیزر درمانی",
  fetal: "۱۰- جبران هزینه تست‌های غربالگری جنین شامل مارکرهای جنینی و آزمایش‌های ژنتیک جنین",
  lab: "۱۱- جبران هزینه انواع خدمات آزمایش‌های تشخیصی پزشکی شامل پاتولوژی و ژنتیک پزشکی، تست‌های آلرژیک",
  rehab: "۱۲- جبران هزینه فیزیوتراپی (PT)، گفتار درمانی (ST)، کار درمانی (OT)",
  glasses: "۱۳- جبران هزینه مربوط به خرید عینک طبی یا لنز تماسی طبی با تجویز چشم‌پزشک و یا اپتومتریست",
  dental: "جبران هزینه‌های خدمات دندانپزشکی", visit: "جبران هزینه‌های ویزیت",
  drug: "جبران هزینه‌های دارو (براساس فهرست داروهای مجاز کشور صرفاً مازاد بر سهم بیمه‌گر اول)", emergency: "جبران هزینه خدمات اورژانس",
  infert: "حداکثر سقف تعهدات جبران هزینه‌های نازایی و ناباروری",
  visitdrug: "جبران هزینه‌های ویزیت، دارو (براساس فهرست داروهای مجاز کشور صرفاً مازاد بر سهم بیمه‌گر اول)",
  total: "حداکثر تعهدات سالیانه بیمه‌گر",
};
// second appearance of a coverage in a policy is its combined-group cap
const STD_GROUP = { para: "سقف حداکثر تعهدات گروه ترکیبی پاراکلینیکی اول، پاراکلینیکی دوم، پاراکلینیکی سوم و فیزیوتراپی و خدمات اورژانس",
  delivery: "گروه ترکیبی زایمان طبیعی/ سزارین و درمان نازایی و ناباروری", infert: "گروه ترکیبی زایمان طبیعی/ سزارین و درمان نازایی و ناباروری" };
const DEFAULT_ORDER = ["orthosis", "hosp", "refractive", "ambIn", "ambOut", "delivery", "special", "para", "diag", "outsurg", "fetal", "lab", "rehab", "combo", "glasses", "dental", "visit", "drug", "emergency", "infert", "visitdrug", "hearing", "organs", "prosthesis", "supplies", "specialDis", "total"];
const addYear = d => d ? d.replace(/^(1[34]\d{2})/, y => String(+y + 1)) : null;
const faDate = d => d ? drNorm(d).replace(/\d/g, x => "۰۱۲۳۴۵۶۷۸۹"[x]) : "…………";
function draftRows(p, old){
  const src = state.docs.find(d => d.id === old.src), ratio = k => { const a = old.caps[k], b = p.caps[k]; return a && b && isFinite(a) && isFinite(b) ? b / a : 1; };
  const base = src ? src.u.rows.filter(r => Object.values(r.vals).some(v => v && v.rial)).map(r => ({ cat: r.cat, v: Object.values(r.vals).find(v => v && v.rial).rial / 1e7 }))
    : DEFAULT_ORDER.filter(k => old.caps[k] != null).map(k => ({ cat: k, v: old.caps[k] }));
  const seen = {};
  const res = base.filter(r => r.cat && p.caps[r.cat] !== 0).map(r => {
    let label, k = r.cat, key = null;
    if (k === "combo"){ // which rows a combined cap covers: read from its value
      const L6 = "حداکثر تعهدات ردیف‌های ۱، ۳، ۴ و ۶", L4 = "حداکثر تعهدات ردیف‌های ۱، ۳ و ۴", L7 = "حداکثر تعهدات ردیف‌های ۷، ۸، ۹، ۱۰، ۱۱ و ۱۲", h = old.caps.hosp;
      const m = [["special", L6], ["hosp", L4], ["para", L7]].find(([c]) => old.caps[c] && Math.abs(old.caps[c] - r.v) < 1e-6)
        || (h && r.v > h * 1.2 ? [old.caps.special ? "special" : "hosp", L6] : null); // the rows 1, 3, 4, 6 cap is the one above the hospital cap
      label = m ? m[1] : "سقف مشترک چند بند"; k = m ? m[0] : null; key = !m ? "cx" : m[1] === L6 ? "c6" : m[1] === L4 ? "c4" : "g7";
    } else if (seen[k] && STD_GROUP[k]){ label = k === "para" ? "حداکثر تعهدات ردیف‌های ۷، ۸، ۹، ۱۰، ۱۱ و ۱۲" : STD_GROUP[k]; key = k === "para" ? "g7" : "gd"; }
    else label = STD_ROW[k] || CCAT_NAME[k] || "سایر تعهدات";
    seen[r.cat] = true;
    const v = !isFinite(r.v) ? r.v : k ? nice(r.v * ratio(k)) : r.v;
    return { label, v, bold: r.cat === "total", cat: r.cat, key: key || r.cat };
  }).filter((r, i, a) => a.findIndex(x => x.key === r.key) === i); // one row per commitment
  // row 6 not read from the scan: keep its place so the numbering and the «۱، ۳، ۴ و ۶» row make sense
  const out = base === null ? [] : res;
  if (!out.some(r => r.cat === "special")) out.push({ label: STD_ROW.special, v: null, cat: "special", key: "special" });
  // the order of the insurer's policy: rows 1–12, their combined caps, then the outpatient items, the annual total last
  const ORD = ["hosp", "refractive", "ambIn", "ambOut", "delivery", "special", "para", "diag", "outsurg", "fetal", "lab", "rehab", "c6", "c4", "g7", "cx", "dental", "glasses", "visit", "drug", "emergency", "infert", "gd", "visitdrug", "orthosis", "prosthesis", "hearing", "organs", "supplies", "specialDis", "total"];
  const ix = r => { const i = ORD.indexOf(r.key); return i < 0 ? ORD.length - 1.5 : i; };
  return out.sort((a, b) => ix(a) - ix(b));
}
function draftConditions(old){
  const src = state.docs.find(d => d.id === old.src); if (!src) return [];
  const t = drNorm(src.doc.text || "").replace(/\r/g, ""), i = t.search(/شرایط\s*خصوصی\s*قرارداد/); if (i < 0) return [];
  const out = [];
  for (const line of t.slice(i).split("\n").slice(1)){
    if (/بیمه\s*گذار|واحد\s*صدور|کد\s*اقتصادی|شرکت\s*سهامی|صفحه\s*\d|نشانی|تلفن/.test(line)) break; // page footer
    const s = lexText(line.replace(/^\s*[\d۰-۹]+\s*[-–.]\s*/, "").replace(/\s*»\s*/g, "، ")).text.trim(); if (s.length > 6) out.push(s); if (out.length >= 10) break;
  }
  return out;
}
function proposalDoc(M, K, p){
  const o = M.o, old = o.old, src = state.docs.find(d => d.id === old.src), u = src ? src.u : {};
  const rial = v => v == null ? "…………" : v === Infinity ? "بدون سقف" : fmtInt(Math.round(v * 1e7)), fr = old.franchise ?? 10;
  const start = addYear(u.start), end = addYear(u.end), rows = draftRows(p, old), conds = draftConditions(old);
  const box = (side, body) => `<tr><th class="pd-side"><span>${side}</span></th><td class="pd-body">${body}</td></tr>`;
  const f = (l, v) => `<div class="pd-f"><span>${l}:</span> <b>${v}</b></div>`;
  const col = (...xs) => `<div class="pd-col">${xs.join("")}</div>`, two = (r, l) => `<div class="pd-2c">${col(...r)}${col(...l)}</div>`;
  const dots = "…………", inst = Math.round(p.total * 1e7 / 12), months = [];
  for (let i = 0; i < 12; i++){ const [y, m] = (start || `${K.year}/01/01`).split("/").map(Number), mm = (m - 1 + i) % 12 + 1, yy = y + Math.floor((m - 1 + i) / 12); months.push(`${yy}/${String(mm).padStart(2, "0")}/01`); }
  return `<article class="pdoc pdoc2" dir="rtl">
    <div class="pd-wm">پیش‌نویس</div>
    <p class="pd-top">این بیمه نامه بر اساس قانون و مقررات بیمه در ایران و شرایط عمومی و خصوصی مندرج در متن و پیوست آن صادر گردیده است .</p>
    <table class="pd-box">
      ${box("مشخصات بیمه نامه", two([f("شماره بیمه نامه", dots), f("کد رایانه بیمه نامه", dots), f("شماره پیشنهاد", dots), f("تاریخ قرارداد", dots)], [f("واحد صدور", dots), f("واحد معرف", dots), f("تاریخ صدور", dots)]))}
      ${box("مشخصات بیمه گذار", two([f("بیمه گذار", esc(old.org || dots)), f("نشانی", dots), f("ایمیل سازمانی", dots)], [f("کد ملی/ کد اقتصادی", dots), f("شماره اقتصادی بیمه گذار", dots), f("تلفن", dots), f("کد پستی", dots)]))}
      ${box("مدت", `<div class="pd-1"><div class="pd-f"><span>مدت اعتبار بیمه نامه</span> <b>۳۶۵</b> <span>روز می باشد که از روز</span> <b>${faDate(start)}</b> <span>شروع و در روز</span> <b>${faDate(end)}</b> <span>خاتمه می یابد .</span></div></div>`)}
      ${box("حق بیمه", `<div class="pd-1">${f("تعداد بیمه شدگان", fmtInt(M.N) + " نفر")}${f("حق بیمه هر بیمه شده در طول مدت بیمه نامه", rial(p.prem) + " ریال")}
        ${two([f("حق بیمه علی الحساب سالیانه", rial(p.total) + " ریال")], [f("مالیات بر ارزش افزوده", "۰ ریال عوارض : ۰ ریال .")])}
        ${f("روش پرداخت حق بیمه", "طبق مفاد قرار داد و اعلامیه بدهکار")}
        <div class="pd-f"><span>بیمه شدگان بین ۶۱ تا ۶۹ سال تحت تکفل با ۰ درصد حق بیمه اضافی _ بیمه شدگان بین ۷۰ تا ۱۲۰ سال تحت تکفل با ۰ درصد حق بیمه اضافی</span></div></div>`)}
      ${box("تعهدات بیمه گر", `<div class="tw"><table class="pd-t2"><thead><tr><th rowspan="2">شرح تعهدات بیمه گر</th><th colspan="2">حداکثر تعهدات سالیانه</th><th rowspan="2">درصد فرانشیز</th><th rowspan="2">حداکثر فرانشیز</th></tr><tr><th>نفر</th><th>خانواده</th></tr></thead><tbody>
        ${rows.map(r => `<tr${r.bold ? ' class="b"' : ""}><td>${esc(r.label)}</td><td class="num">${rial(r.v)}</td><td class="num">۰</td><td class="num">${r.bold ? "" : fmtInt(fr)}</td><td class="num">${r.bold ? "" : "۰"}</td></tr>`).join("")}
      </tbody></table></div>`)}
    </table>
    <div class="pd-foot"><div><b>بیمه گذار</b><span>${esc(old.org || "")}</span></div><div><b>واحد صدور</b><span>${dots}</span></div><div><b>${esc(old.insurer ? "شرکت " + old.insurer : "بیمه گر")}</b><span></span></div></div>
    <div class="pd-page">
      <p><b>توضیحات اضافی :</b> این بیمه نامه با مشخصات فوق الذکر و شرایط عمومی و شرایط خصوصی پیوست در سه نسخه صادر و هریک از نسخ دارای ارزش یکسان می باشد.</p>
      <p><b>شرایط خصوصی قرارداد:</b></p>
      <ol>${(conds.length ? conds : [dots]).map(c => `<li>${esc(c)}</li>`).join("")}</ol>
      ${conds.length ? '<p class="pd-hint noprint">شرایط خصوصی از بیمه‌نامهٔ سال قبل خوانده شده؛ پیش از ارسال بازبینی کنید.</p>' : ""}
    </div>
    <div class="pd-page">
      <p>مدیریت محترم ${esc(old.org || "")}</p><p>با سلام و احترام</p>
      <p>بدین وسیله به استحضار می رساند با توجه به صدور بیمه نامه درمان تکمیلی، صورتحساب حق بیمه به شرح ذیل می باشد. خواهشمند است پس از بررسی نسبت به پرداخت مطابق با تاریخ های سر رسید اعلامی و پس از واریز نسبت به ارسال فیش در اسرع وقت اقدامات لازم مبذول فرمایید.</p>
      <table class="pd-t2 pd-inst"><thead><tr><th>ردیف</th><th>مبلغ قسط (ریال)</th><th>تاریخ سر رسید</th></tr></thead><tbody>
        ${months.map((d, i) => `<tr><td>${fmtInt(i + 1)}</td><td class="num">${fmtInt(i < 11 ? inst : Math.round(p.total * 1e7) - inst * 11)}</td><td class="num">${faDate(d)}</td></tr>`).join("")}
        <tr class="b"><td>جمع کل:</td><td class="num">${rial(p.total)}</td><td></td></tr></tbody></table>
    </div>
    ${state.cl.annex ? `<div class="pd-page pd-annex">
      <p><b>پیوست کارگزار (جزو متن بیمه‌نامه نیست) — مبنای حق‌بیمه، بستهٔ «${esc(p.n)}»:</b></p>
      <ul>
        <li>خسارت پرداختی ${fmtYear(old.year)}: ${fmtNum(M.total)} میلیون تومان؛ با ${fmtPct(o.ibnr)} خسارت دیررس، سرانهٔ ${fmtNum(M.pc0)} میلیون تومان${M.lr0 != null ? ` (Loss Ratio ${fmtPct(M.lr0)} با حق‌بیمهٔ ${fmtNum(o.p0)})` : ""}.</li>
        <li>خسارت سرانهٔ مورد انتظار ${fmtYear(K.year)} با این سقف‌ها: ${fmtNum(p.pc)} میلیون تومان (تورم درمان ${fmtPct(o.infl)} و اثر سقف‌های جدید)؛ Loss Ratio هدف ${fmtPct(o.tlr)}، مورد انتظار ${fmtPct(p.lr)}.</li>
        <li>این سند پیش‌نویس کارگزار برای استعلام و مذاکره است؛ بیمه‌نامهٔ رسمی فقط با صدور و امضای بیمه‌گر معتبر است.</li>
      </ul>
    </div>` : ""}
  </article>`;
}
// Print only the document: a frame with the app's styles and nothing else (works for several pages).
function printDoc(html){
  const page = `<!doctype html><html dir="rtl" lang="fa" data-theme="light"><head><meta charset="utf-8"><title>پیش‌نویس بیمه‌نامه</title>${[...document.querySelectorAll("style")].map(x => x.outerHTML).join("")}
    <style>@page{size:A4;margin:12mm}html,body{background:#fff !important;margin:0}body *{visibility:visible !important}.pdoc{position:static !important;padding:0 !important;color:#000}</style></head><body>${html}</body></html>`;
  window.__printHTML = page;
  const f = document.createElement("iframe"); f.setAttribute("aria-hidden", "true"); f.style.cssText = "position:fixed;left:0;bottom:0;width:0;height:0;border:0";
  document.body.appendChild(f); const d = f.contentDocument; d.open(); d.write(page); d.close();
  setTimeout(() => { try { f.contentWindow.focus(); f.contentWindow.print(); } catch (e){ const w = window.open("", "_blank"); if (w){ w.document.write(page); w.document.close(); w.print(); } } setTimeout(() => f.remove(), 60000); }, 500);
}
function renderProposal(id){
  const ctx = state.lastClaims; if (!ctx) return go("claims");
  const { M, K } = ctx, p = K.P.find(x => x.id === id) || K.P.find(x => x.id === K.rec);
  setHead("پیش‌نویس بیمه‌نامه", `سال ${fmtYear(K.year)} · ${p.n}`);
  $("view").innerHTML = `${crumb(["claims", "تحلیل خسارت"], [null, "پیش‌نویس بیمه‌نامه"])}
    <div class="ph noprint"><div><h1>پیش‌نویس بیمه‌نامهٔ سال ${fmtYear(K.year)}</h1><span class="sub">از بستهٔ «${esc(p.n)}»؛ برای ارسال به بیمه‌گرها یا کارفرما</span></div>
      <div class="actions"><button class="btn primary" type="button" id="pdPrint">چاپ / ذخیرهٔ PDF</button><button class="btn" type="button" id="pdWord">دانلود Word</button><label class="btn" style="display:inline-flex;gap:6px;align-items:center"><input type="checkbox" id="pdAnnex"${state.cl.annex ? " checked" : ""}> پیوست مبنای محاسبه</label><button class="btn" type="button" id="pdSave">${state.contracts.some(c => c.id === "draft-" + p.id + "-" + K.year) ? "✓ ثبت شد در قراردادها" : "ثبت به‌عنوان قرارداد " + fmtYear(K.year)}</button></div></div>
    <div class="fchips noprint" role="group" aria-label="بسته">${K.P.map(x => `<button type="button" data-pdp="${x.id}" aria-pressed="${x.id === p.id}">${x.n} · ${fmtNum(x.prem)}</button>`).join("")}</div>
    <div class="panel pdoc-wrap">${proposalDoc(M, K, p)}</div>`;
  document.querySelectorAll("[data-pdp]").forEach(b => b.onclick = () => { state.cl.pkg = b.dataset.pdp; go("proposal", b.dataset.pdp, true); });
  $("pdAnnex").onchange = e => { state.cl.annex = e.target.checked; render(); };
  $("pdPrint").onclick = () => printDoc(proposalDoc(M, K, p));
  $("pdWord").onclick = () => {
    const css = "body{font-family:Tahoma,Arial;direction:rtl;font-size:10pt}table{border-collapse:collapse;width:100%}td,th{border:1px solid #444;padding:3pt 5pt;font-size:9.5pt;vertical-align:top}.pd-side{width:22pt;background:#eee}.pd-f{margin:2pt 0}.pd-top{font-weight:bold}.pd-wm{display:none}.pd-t2 tr.b td{font-weight:bold}.pd-hint{color:#666;font-size:8.5pt}";
    const html = `<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word"><head><meta charset="utf-8"><style>${css}</style></head><body dir="rtl">${proposalDoc(M, K, p).replace(/<div class="pd-foot">([\s\S]*?)<\/div>\s*<div class="pd-page">/, (m, x) => '<table style="margin-top:14pt"><tr>' + x.replace(/<div><b>(.*?)<\/b><span>(.*?)<\/span><\/div>/g, '<td style="border:0;text-align:center"><b>$1</b><br>$2</td>') + '</tr></table><div class="pd-page">')}</body></html>`;
    const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob(["﻿" + html], { type: "application/msword" }));
    a.download = `پیش‌نویس-بیمه‌نامه-${(M.o.old.org || "").replace(/\s+/g, "-")}-${K.year}.doc`; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  };
  $("pdSave").onclick = () => {
    const id2 = "draft-" + p.id + "-" + K.year; state.contracts = state.contracts.filter(c => c.id !== id2);
    state.contracts.push({ id: id2, src: "draft", org: M.o.old.org, insurer: M.o.old.insurer, year: K.year, plan: "", premium: p.prem, insured: M.N, franchise: M.o.old.franchise, caps: Object.assign({}, p.caps), draft: true });
    render();
  };
}

/* ---------- page ---------- */
function claimsDefaults(){
  const real = state.contracts.filter(c => !c.sample && !c.draft).sort((a, b) => a.year - b.year), cl = state.cl;
  if (!cl.picked){ delete cl.oldId; delete cl.newId; }
  const org = state.claims.map(c => c.org).find(Boolean);
  const pool = org ? real.filter(c => orgKey(c.org) === orgKey(org)) : real;
  const lastOrg = (pool.length ? pool : real).slice(-1)[0], same = lastOrg ? real.filter(c => orgKey(c.org) === orgKey(lastOrg.org)) : [];
  if (cl.oldId === undefined || !state.contracts.some(c => c.id === cl.oldId)) cl.oldId = same.length > 1 ? same[same.length - 2].id : same[0] ? same[0].id : "";
  if (cl.newId === undefined || (cl.newId && !state.contracts.some(c => c.id === cl.newId))) cl.newId = same.length > 1 ? same[same.length - 1].id : "";
}
function renderClaims(){
  setHead("تحلیل خسارت", "خسارت واقعی ← قرارداد سال بعد");
  const cl = state.cl; claimsDefaults();
  const byId = id => state.contracts.find(c => c.id === id) || null, old = byId(cl.oldId), nw = byId(cl.newId);
  // The head count on a policy is often only the first batch (the rest come by addenda): if more people used one
  // coverage than the policy says are insured, that number is not the group size — ask for it instead.
  const maxU = Math.max(0, ...mergeClaims(state.claims).map(g => g.users || 0));
  const docN = [nw && nw.insured, old && old.insured].filter(Boolean).sort((a, b) => b - a)[0] || null, nBad = docN && maxU > docN * 1.05 ? docN : null;
  const o = { old, nw, insured: cl.insured ?? (nBad ? null : docN), p0: cl.p0 ?? (old && old.premium) ?? null,
    p1: cl.p1 ?? (nw && nw.premium) ?? null, ibnr: cl.ibnr ?? 0.1, infl: state.infl ?? 0.4, tlr: cl.tlr ?? ((state.settings.targetLR || 75) / 100) };
  const opt = sel => `<option value="">— ندارم —</option>` + state.contracts.map(c => `<option value="${esc(c.id)}"${c.id === sel ? " selected" : ""}>${esc(short(c.org) || "بی‌نام")} · ${fmtYear(c.year) || "سال؟"}${c.plan ? " · " + esc(c.plan) : ""}${c.sample ? " (نمونه)" : c.draft ? " (پیش‌نویس)" : ""}</option>`).join("");
  const drop = `<label class="drop" for="clmIn" id="clmDrop"><span class="di"><svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"/><path d="M14 3v6h6M12 18v-6M9 15l3-3 3 3"/></svg></span><b>فایل سقف تعهدات و فایل خسارت را با هم بدهید</b><span>سقف تعهدات: بیمه‌نامه به‌صورت PDF، اسکن، عکس، Word یا اکسل · خسارت: اکسل سامانهٔ بیمه‌گر (سرپایی و بیمارستانی) · ترتیب مهم نیست؛ اپ خودش تشخیص می‌دهد</span></label><input type="file" id="clmIn" accept=".xlsx,.xls,.csv,.pdf,.jpg,.jpeg,.png,.webp,.docx" multiple hidden>`;
  if (!state.claims.length){
    $("view").innerHTML = `${crumb([null, "تحلیل خسارت"])}<div class="ph"><div><h1>تحلیل خسارت و پیشنهاد سال بعد</h1><span class="sub">فایل خسارت پرداختی را بدهید؛ با بیمه‌نامه‌های خوانده‌شده جفت می‌شود و Loss Ratio واقعی، سقف‌های کم و حق‌بیمهٔ منصفانهٔ سال بعد را می‌دهد.</span></div></div>${drop}
      <section class="panel"><div class="panel-b small muted" style="line-height:2">۱. فایل سقف تعهدات (بیمه‌نامهٔ سال خسارت) و فایل‌های خسارت را با هم بالا بدهید. بیمه‌نامهٔ سال بعد را هم اگر دارید، اضافه کنید.<br>۲. سقف‌ها و نرخ خوانده‌شده را یک بار تأیید کنید؛ اپ خودش به این صفحه برمی‌گردد.<br>۳. هر گروه خسارت به سقفش وصل می‌شود و اپ سه بستهٔ سال بعد (سقف‌ها، حق‌بیمهٔ هر نفر و کل) پیشنهاد می‌دهد؛ هر کدام را بخواهید، پیش‌نویس بیمه‌نامه‌اش صادر می‌شود. همه‌چیز روی همین دستگاه می‌ماند.</div></section>`;
    return bindClaims();
  }
  const M = claimsModel(state.claims, o), K = claimsPackages(M), adv = claimsAdvice(M, K), y0 = old ? fmtYear(old.year) : "سال خسارت", y1 = K && K.year ? fmtYear(K.year) : nw ? fmtYear(nw.year) : "سال بعد";
  state.lastClaims = { M, K }; const rp = K && K.P.find(p => p.id === (state.cl.pkg || K.rec));
  const lrCol = v => v == null ? "" : v < 0.75 ? "var(--good)" : v <= 0.85 ? "var(--mid-ink)" : "var(--bad)";
  const kp = (l, v, sub, color, lead) => `<div class="panel kp2${lead ? " lead" : ""}"><span class="l">${l}</span><b class="big num" style="${color ? `color:${color}` : ""}">${v}</b><span class="small muted">${sub}</span></div>`;
  const inp = (id, l, v, step, suf) => `<label class="cin"><span>${l}</span><span class="row"><input type="number" id="${id}" value="${v ?? ""}" step="${step}" inputmode="decimal" placeholder="وارد کنید"><em>${suf}</em></span></label>`;
  const maxA = M.G[0] ? M.G[0].amt : 1;
  $("view").innerHTML = `${crumb([null, "تحلیل خسارت"])}
  <div class="ph"><div><h1>تحلیل خسارت ${y0}${M.o.old ? " · " + esc(short(old.org)) : ""}</h1><span class="sub">${state.claims.map(c => esc(c.file)).join(" · ")} · مبالغ به میلیون تومان</span></div>
    <div class="actions"><button class="btn primary" type="button" id="clmX">⇩ فایل محاسبه (اکسل)</button><button class="btn" type="button" id="clmClear">پاک کردن خسارت‌ها</button></div></div>
  <section class="panel"><div class="panel-h"><h2>ورودی‌ها</h2><span class="small muted">از بیمه‌نامه‌های خوانده‌شده پر می‌شود؛ قابل تغییر است</span></div>
    <div class="panel-b cins">
      <label class="cin"><span>بیمه‌نامهٔ سال خسارت (سقف‌ها)</span><select id="clmOld">${opt(cl.oldId)}</select></label>
      <label class="cin"><span>بیمه‌نامهٔ سال بعد (اختیاری)</span><select id="clmNew">${opt(cl.newId)}</select></label>
      ${inp("clmN", "تعداد بیمه‌شدگان", o.insured, 1, "نفر")}${nBad && cl.insured == null ? `<p class="small cwarn">بیمه‌نامه ${fmtInt(nBad)} نفر نوشته، ولی ${fmtInt(maxU)} نفر فقط از یک پوشش استفاده کرده‌اند؛ احتمالاً بقیه با الحاقیه اضافه شده‌اند. تعداد کل را وارد کنید.</p>` : ""}${inp("clmP0", `حق‌بیمهٔ هر نفر ${y0}`, o.p0, 0.01, "میلیون")}${inp("clmP1", `نرخ اعلامی بیمه‌گر برای ${y1} (اگر دارید)`, o.p1, 0.01, "میلیون")}${inp("clmB", "نرخ هر نفر برای «به نفع بیمه‌گر» (پیش‌فرض: نرخ تحلیل واقعی)", cl.budget, 0.1, "میلیون")}
      ${inp("clmI", "خسارت دیررس (IBNR)", Math.round(o.ibnr * 100), 1, "٪")}${inp("clmT", "Loss Ratio هدف", Math.round(o.tlr * 100), 1, "٪")}
      <div class="slider cin" style="grid-column:span 2"><label for="clmInfl" class="small nw">تورم درمان</label><input type="range" id="clmInfl" min="0" max="80" step="5" value="${Math.round(o.infl * 100)}" style="--p:${Math.round(o.infl * 100 / 80 * 100)}%"><b class="num" id="clmInflV">${fmtInt(Math.round(o.infl * 100))}٪</b></div>
    </div>${old && old.sample ? '<p class="small" style="color:var(--mid-ink);padding:0 18px 14px">بیمه‌نامهٔ انتخاب‌شده نمونه است؛ برای نتیجهٔ واقعی بیمه‌نامهٔ خود را در «مدارک و قراردادها» بدهید.</p>' : ""}</section>
  <div class="kp2s">
    ${kp("کل خسارت پرداختی", fmtNum(M.total), `${fmtPct(1 - M.hospShare)} سرپایی · ${fmtPct(M.hospShare)} بیمارستانی`, "", true)}
    ${kp(`Loss Ratio ${y0}`, M.lr0 != null ? fmtPct(M.lr0) : "—", M.lr0 != null ? `سرانه ${fmtNum(M.pc0)} در برابر ${fmtNum(o.p0)}` : "تعداد نفرات و حق‌بیمه را وارد کنید", lrCol(M.lr0))}
    ${kp(`خسارت سرانهٔ ${y1}`, M.pc1 != null ? fmtNum(M.pc1) : "—", `تورم ${fmtPct(o.infl)} · اثر سقف‌ها ${fmtSignedPct(M.upW)}`)}
    ${rp ? `<a class="panel kp2 accent" href="#pkgs"><span class="l">پیشنهاد ${y1} · ${esc(rp.n)}</span><b class="big num" style="color:var(--brand)">${fmtNum(rp.prem)}</b><span class="small muted">میلیون / نفر · کل ${fmtNum(rp.total / 1000)} میلیارد تومان</span></a>` : kp(`پیشنهاد ${y1}`, "—", !old ? "بیمه‌نامهٔ سال خسارت را بدهید" : "تعداد بیمه‌شدگان را وارد کنید", "var(--brand)")}
  </div>
  ${packagesHTML(M, K)}
  ${adviceHTML(M, K)}
  <div class="ins">${adv.map(([k, t, s]) => `<div class="panel in in-${k}"><span class="ic">${{ warn: "!", ok: "✓", note: "i", info: "→" }[k]}</span><div><b>${esc(t)}</b><span>${esc(s)}</span></div></div>`).join("")}</div>
  <section class="panel"><div class="panel-h"><h2>هزینه به تفکیک پوشش</h2><span class="small muted">مصرف‌کننده = حداقل تعداد افراد</span></div>
    <div class="tw"><table class="clmt" style="min-width:860px"><thead><tr><th>پوشش</th><th>خسارت</th><th style="width:160px">سهم</th><th>مصرف‌کننده</th><th>میانگین هر نفر</th><th>سقف ${y0}</th><th>سقف ${y1}</th><th>اثر سقف</th><th>پیش‌بینی ${y1}</th></tr></thead><tbody>
    ${M.G.map(g => `<tr><td><b>${esc(CLM_NAME[g.k] || g.k)}</b><div class="small muted">${g.top.map(([n, s]) => `${esc(n)} ${fmtNum(s.amt)}`).join(" · ")}</div></td><td class="num nw">${fmtNum(g.amt)}</td>
      <td><div class="track" style="height:12px"><span class="bar" style="height:8px;top:2px;width:${Math.max(1.5, g.amt / maxA * 100).toFixed(1)}%;background:linear-gradient(to left,#6366F1,#A78BFA)"></span></div><span class="small muted">${fmtPct(g.share)}</span></td>
      <td class="nw">${g.users ? fmtInt(g.users) : "—"}${g.use != null ? ` <span class="small muted">${fmtPct(g.use)}</span>` : ""}</td><td class="num nw">${g.avg ? fmtNum(g.avg) : "—"}</td>
      <td class="nw">${g.c0 != null ? MT(g.c0) : "—"}${g.press != null && g.press >= 0.8 ? ' <span class="tag t-bad">به سقف خورده</span>' : ""}</td><td class="nw">${g.c1 != null ? MT(g.c1) : "—"}</td>
      <td class="nw">${g.up ? fmtSignedPct(g.up) : "—"}</td><td class="num nw"><b>${fmtNum(g.proj)}</b></td></tr>`).join("")}
    <tr><td><b>جمع</b></td><td class="num nw"><b>${fmtNum(M.total)}</b></td><td></td><td></td><td></td><td></td><td></td><td class="nw">${fmtSignedPct(M.upW)}</td><td class="num nw"><b>${fmtNum(M.projTotal)}</b></td></tr></tbody></table></div></section>
  ${drop}`;
  bindClaims(M);
}
function bindClaims(M){
  const cl = state.cl, set = (k, v) => { cl[k] = v; render(); };
  $("clmIn").onchange = async e => { const f = [...e.target.files]; e.target.value = ""; if (f.length) await claimsUpload(f); };
  const dz = $("clmDrop"); dz.ondragover = e => { e.preventDefault(); dz.classList.add("over"); }; dz.ondragleave = () => dz.classList.remove("over");
  dz.ondrop = e => { e.preventDefault(); dz.classList.remove("over"); claimsUpload([...e.dataTransfer.files]); };
  if (!M) return;
  $("clmOld").onchange = e => { cl.oldId = e.target.value; cl.newId = $("clmNew").value; cl.picked = true; delete cl.p0; render(); };
  $("clmNew").onchange = e => { cl.newId = e.target.value; cl.oldId = $("clmOld").value; cl.picked = true; delete cl.p1; delete cl.insured; render(); };
  const numIn = (id, k, f = v => v) => { $(id).onchange = e => { const v = parseFloat(drNorm(e.target.value)); if (e.target.value === "") { delete cl[k]; render(); } else if (!isNaN(v)) set(k, f(v)); }; };
  numIn("clmN", "insured"); numIn("clmP0", "p0"); numIn("clmP1", "p1"); numIn("clmB", "budget"); numIn("clmI", "ibnr", v => v / 100); numIn("clmT", "tlr", v => v / 100);
  const ir = $("clmInfl"); ir.oninput = () => { $("clmInflV").textContent = fmtInt(+ir.value) + "٪"; ir.style.setProperty("--p", (+ir.value / 80 * 100) + "%"); };
  ir.onchange = () => { state.infl = +ir.value / 100; render(); };
  $("clmClear").onclick = () => { state.claims = []; render(); };
  document.querySelectorAll("[data-pkg]").forEach(el => el.onclick = e => { if (e.target.closest("[data-issue]")) return; state.cl.pkg = el.dataset.pkg; render(); setTimeout(() => { const x = $("pkgs"); if (x) x.scrollIntoView({ block: "start" }); }, 0); });
  document.querySelectorAll("[data-tw]").forEach(cb => cb.onchange = () => { const t = state.cl.tweaks = state.cl.tweaks || {}; if (cb.checked) t[cb.dataset.tw] = +cb.dataset.to; else delete t[cb.dataset.tw];
    if (Object.keys(t).length) state.cl.pkg = "custom"; else if (state.cl.pkg === "custom") delete state.cl.pkg; render(); setTimeout(() => { const x = $("tweaks"); if (x) x.scrollIntoView({ block: "start" }); }, 0); });
  document.querySelectorAll("[data-issue]").forEach(b => b.onclick = () => { state.cl.pkg = b.dataset.issue; go("proposal", b.dataset.issue); });
  $("clmX").onclick = () => { try { claimsXlsx(M); } catch (e){ alert("ساخت فایل ممکن نشد: " + e.message); } };
}
async function claimsUpload(files){
  state.errors = [];
  const { got, rest } = await takeClaims(files);
  if (got.length) state.cl = {}; // new claims → pair the contracts again
  // whatever is not a claims report is the policy / caps file: read it, confirm it, come back here
  const pol = rest.filter(f => isDocFile(f) || /\.xlsx?$/i.test(f.name)), bad = rest.filter(f => !pol.includes(f));
  if (bad.length) state.errors.push(`${bad.map(f => "«" + f.name + "»").join("، ")} نه فایل خسارت است نه بیمه‌نامه.`);
  if (pol.length){ state.cl.picked = false; return handleDocs(pol, { claims: true }); }
  go("claims");
}

/* ---------- Excel with live formulas ---------- */
function claimsXlsx(M){
  const o = M.o, y0 = o.old ? o.old.year : "", y1 = o.nw ? o.nw.year : "سال بعد", S = "'خلاصه'!", n = M.G.length, tot = n + 2;
  const f = x => ({ t: "n", f: x });
  const sum = [["تحلیل خسارت " + y0 + " و پیشنهاد " + y1 + (o.old ? " — " + o.old.org : "") + " — میلیون تومان"], ["سلول‌های ستون B (ردیف ۴ تا ۱۰) ورودی‌اند؛ تغییرشان همه‌چیز را دوباره حساب می‌کند."], ["ورودی", "مقدار"],
    ["تعداد بیمه‌شدگان", M.N || 0], ["حق‌بیمهٔ هر نفر " + y0, o.p0 || 0], ["حق‌بیمهٔ پیشنهادی هر نفر " + y1, o.p1 || 0], ["خسارت دیررس (IBNR)", o.ibnr], ["تورم درمان", o.infl], ["Loss Ratio هدف", o.tlr],
    ["اثر سقف‌ها (میانگین وزنی)", f(`IFERROR('پوشش‌ها'!K${tot}/('پوشش‌ها'!B${tot}*(1+B7)*(1+B8))-1,0)`)], [], ["خروجی", "مقدار"],
    ["کل خسارت پرداختی", f(`'پوشش‌ها'!B${tot}`)], ["خسارت سرانه (با خسارت دیررس)", f("B13*(1+B7)/B4")], ["کل حق‌بیمه " + y0, f("B5*B4")], ["Loss Ratio " + y0, f("IFERROR(B13*(1+B7)/B15,\"\")")],
    ["خسارت سرانهٔ مورد انتظار " + y1, f("B14*(1+B8)*(1+B10)")], ["Loss Ratio " + y1 + " با نرخ پیشنهادی", f("IFERROR(B17/B6,\"\")")], ["حق‌بیمهٔ منصفانهٔ هر نفر " + y1, f("B17/B9")],
    ["نرخ پیشنهادی نسبت به منصفانه", f("IFERROR(B6/B19-1,\"\")")], ["کل حق‌بیمه با نرخ منصفانه", f("B19*B4")]];
  const ws1 = XLSX.utils.aoa_to_sheet(sum);
  ["B7", "B8", "B9", "B10", "B16", "B18", "B20"].forEach(a => { if (ws1[a]) ws1[a].z = "0%"; });
  ["B13", "B14", "B15", "B17", "B19", "B21"].forEach(a => { if (ws1[a]) ws1[a].z = "#,##0.00"; });
  ws1["!cols"] = [{ wch: 38 }, { wch: 16 }];
  const g = [["پوشش", "خسارت", "سهم", "پرونده", "مصرف‌کننده (حداقل)", "نرخ استفاده", "میانگین هر نفر", "سقف " + y0, "سقف " + y1, "اثر سقف (قابل تغییر)", "پیش‌بینی " + y1, "پرهزینه‌ترین خدمات"]];
  M.G.forEach((x, i) => { const r = i + 2; g.push([CLM_NAME[x.k] || x.k, +x.amt.toFixed(2), f(`B${r}/B$${tot}`), x.files, x.users || "", f(`IF(E${r}="","",E${r}/${S}$B$4)`), f(`IF(E${r}="","",B${r}/E${r})`),
    x.c0 != null && isFinite(x.c0) ? x.c0 : "", x.c1 != null && isFinite(x.c1) ? x.c1 : "", +x.up.toFixed(3), f(`B${r}*(1+${S}$B$7)*(1+${S}$B$8)*(1+J${r})`), x.top.map(([nm, s]) => nm + " " + s.amt.toFixed(0)).join("؛ ")]); });
  g.push(["جمع", f(`SUM(B2:B${tot - 1})`), "", "", "", "", "", "", "", "", f(`SUM(K2:K${tot - 1})`)]);
  const ws2 = XLSX.utils.aoa_to_sheet(g);
  for (let r = 2; r <= tot; r++){ ["C", "F", "J"].forEach(c => { if (ws2[c + r]) ws2[c + r].z = "0%"; }); ["B", "G", "K"].forEach(c => { if (ws2[c + r]) ws2[c + r].z = "#,##0.0"; }); }
  ws2["!cols"] = [{ wch: 30 }, { wch: 11 }, { wch: 8 }, { wch: 8 }, { wch: 12 }, { wch: 10 }, { wch: 12 }, { wch: 10 }, { wch: 10 }, { wch: 12 }, { wch: 13 }, { wch: 60 }];
  const K = state.lastClaims && state.lastClaims.M === M ? state.lastClaims.K : claimsPackages(M);
  const pk = K ? [["بسته", ...K.P.map(p => p.n)], ["حق‌بیمهٔ هر نفر (میلیون تومان)", ...K.P.map(p => +p.prem.toFixed(2))], ["کل حق‌بیمه (میلیون تومان)", ...K.P.map(p => Math.round(p.total))],
    ["خسارت سرانهٔ مورد انتظار", ...K.P.map(p => +p.pc.toFixed(2))], ["Loss Ratio مورد انتظار", ...K.P.map(p => +p.lr.toFixed(3))], [], ["سقف هر نفر (میلیون تومان)", ...K.P.map(p => p.n), "سقف " + y0],
    ...pkgCaps(K.P[0], o.old).map(([k, a]) => [CCAT_NAME[k] || k, ...K.P.map(p => p.caps[k] == null ? "" : isFinite(p.caps[k]) ? p.caps[k] : "بدون سقف"), a == null ? "" : isFinite(a) ? a : "بدون سقف"])] : [["برای بسته‌های سال بعد، بیمه‌نامهٔ سال خسارت و تعداد بیمه‌شدگان لازم است."]];
  const ws3 = XLSX.utils.aoa_to_sheet(pk); if (K) K.P.forEach((p, i) => { const c = XLSX.utils.encode_col(i + 1); if (ws3[c + "5"]) ws3[c + "5"].z = "0%"; });
  ws3["!cols"] = [{ wch: 30 }, ...(K ? K.P : []).map(() => ({ wch: 16 })), { wch: 12 }];
  const wb = XLSX.utils.book_new(); wb.Workbook = { Views: [{ RTL: true }] };
  [ws1, ws2, ws3].forEach(w => { w["!views"] = [{ RTL: true }]; });
  XLSX.utils.book_append_sheet(wb, ws1, "خلاصه"); XLSX.utils.book_append_sheet(wb, ws2, "پوشش‌ها"); XLSX.utils.book_append_sheet(wb, ws3, "بسته‌های سال بعد");
  XLSX.writeFile(wb, `تحلیل-خسارت-${(o.old && o.old.org || "قرارداد").replace(/\s+/g, "-")}-${y1}.xlsx`);
}
