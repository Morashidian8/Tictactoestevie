/* ---------- tender / new contract pricing ----------
   Input: 1–3 years of a group's history with its previous insurers (per coverage per year),
   the coverages and caps proposed for the new contract, and next year's tariffs.
   Output: expected claims for the contract year, the premium that keeps the loss ratio under
   target with a safety margin, the break-even floor, and per-coverage findings. */

function parseTender(sheets){
  const warn = [];
  const S = {
    pop: sheets[findSheet(sheets, "01", ["جمعیت"])],
    cov: sheets[findSheet(sheets, "02", ["تعهدات"])],
    clm: sheets[findSheet(sheets, "03", ["خسارت"])],
    prm: sheets[findSheet(sheets, "05", ["حق"])],
    trf: sheets[findSheet(sheets, "06", ["تعرفه"])],
    his: sheets[Object.keys(sheets).find(n => norm(n).includes("سابقه"))],
  };
  const base = { group: { name: "مناقصهٔ بدون نام", total: null } };
  const tp = table(S.pop, "Group_ID");
  if (tp && tp.rows[0]){
    const r = tp.rows[0], g = (n, f) => { const i = col(tp, [n], -1); return r[i >= 0 ? i : f]; };
    const parts = ["اصلی","همسر","فرزند","سایر وابسته"].map((n, k) => num(g(n, 6 + k)) || 0);
    base.group = { id: str(r[0]), name: str(g("نام بیمه‌گذار", 1)) || "مناقصهٔ بدون نام", industry: str(g("صنعت", 2)), province: str(g("استان", 3)),
      period: str(g("دوره قرارداد", 4)), parts, total: num(g("کل نفرات", 10)) || parts.reduce((a, b) => a + b, 0) || null };
  } else warn.push({ sev: "warn", text: "تعداد بیمه‌شدگان قرارداد جدید پیدا نشد؛ تعداد نفرات آخرین سال سابقه به کار رفت." });

  const tc = table(S.cov, "Coverage_ID");
  if (!tc) throw new Error("جدول تعهدات قرارداد جدید پیدا نشد. شیتی با سرستون Coverage_ID لازم است.");
  const ci = (n, f) => { const i = col(tc, [n], -1); return i >= 0 ? i : f; };
  const coverages = tc.rows.map(r => ({ id: str(r[0]), name: str(r[ci("پوشش", 1)]), annualCap: num(r[ci("سقف سالانه فعلی", 2)]), perCase: num(r[ci("سقف هر مورد", 3)]),
    min: num(r[ci("حداقل پیشنهادی", 8)]), max: num(r[ci("حداکثر پیشنهادی", 9)]) }));

  const premiums = {};
  (S.prm || []).forEach(r => { if (!r) return; const y = latin(norm(r[0])).match(/(\d{4})/); if (y && num(r[2])) premiums[+y[1]] = { premium: num(r[2]), insured: num(r[1]) }; });

  const years = {};
  const yearOf = y => years[y] || (years[y] = { year: y, insured: null, premium: null, cov: {} });
  const covOf = (Y, id, name) => Y.cov[id] || (Y.cov[id] = { id, name, claims: 0, users: 0, approved: 0, paid: 0, capUnpaid: 0, oldCap: null });

  const th = table(S.his, "سال");
  if (th){
    // Aggregated history, the usual form in tender documents: one row per year and coverage.
    const h = (n, f) => col(th, [n], f);
    const H = { cid: h("Coverage_ID", 1), name: h("پوشش", 2), insured: h("تعداد بیمه‌شده", 3), claims: h("تعداد خسارت", 4), users: h("تعداد استفاده‌کننده", 5),
      approved: h("مبلغ تاییدشده", 6), paid: h("پرداختی", 7), capUnpaid: h("پرداخت‌نشده به خاطر سقف", 8), cap: h("سقف سالانه", 9) };
    th.rows.forEach(r => {
      const y = latin(norm(r[0])).match(/(\d{4})/); if (!y) return;
      const Y = yearOf(+y[1]);
      if (num(r[H.insured])) Y.insured = num(r[H.insured]);
      const c = covOf(Y, str(r[H.cid]), str(r[H.name]));
      c.claims += num(r[H.claims]) || 0; c.users += num(r[H.users]) || 0;
      c.paid += num(r[H.paid]) || 0; c.approved += num(r[H.approved]) || num(r[H.paid]) || 0;
      c.capUnpaid += num(r[H.capUnpaid]) || 0; if (num(r[H.cap])) c.oldCap = num(r[H.cap]);
    });
  } else {
    // Claim-level history: bucket claims by the Jalali year of their date.
    const tl = table(S.clm, "Claim_ID");
    if (!tl) throw new Error("سابقهٔ خسارت پیدا نشد. یا شیت «سابقه» (هر سال و پوشش یک ردیف) یا شیت خسارت با تاریخ لازم است.");
    const li = (n, f) => col(tl, [n], f);
    const L = { member: li("Member_ID", 1), date: li("Claim_Date", 2), cov: li("Coverage_ID", 3), covName: li("پوشش", 4), approved: li("مبلغ تاییدشده", 9), paid: li("پرداختی", 10), unpaid: li("غیرقابل پرداخت", 11), reason: li("علت عدم پرداخت", 12) };
    const members = {};
    tl.rows.forEach(r => {
      const j = parseJ(r[L.date]); if (!j) return;
      const Y = yearOf(j[0]), c = covOf(Y, str(r[L.cov]), str(r[L.covName]));
      const approved = num(r[L.approved]) || 0, paid = num(r[L.paid]) || 0, unpaid = num(r[L.unpaid]) ?? Math.max(0, approved - paid);
      c.claims++; c.approved += approved; c.paid += paid; if (/سقف/.test(norm(r[L.reason]))) c.capUnpaid += unpaid;
      const k = Y.year + "|" + c.id; (members[k] = members[k] || new Set()).add(str(r[L.member]) || str(r[0]));
    });
    Object.entries(members).forEach(([k, s]) => { const [y, id] = k.split("|"); years[y].cov[id].users = s.size; });
  }
  Object.values(years).forEach(Y => { const p = premiums[Y.year]; if (p){ Y.premium = p.premium; if (!Y.insured) Y.insured = p.insured; } });

  const tt = table(S.trf, "Service_ID");
  const tariffs = tt ? tt.rows.map(r => ({ name: str(r[1]), old: num(r[2]), next: num(r[3]), pt: num(r[4]) })).filter(t => t.old > 0 && t.next != null) : [];
  return { group: base.group, coverages, years: Object.values(years).sort((a, b) => a.year - b.year), tariffs, warn };
}

function tenderAnalyze(T, settings, protectNames, opts){
  const st = Object.assign({}, DEFAULTS, settings || {}), o = opts || {};
  const LR = st.targetLR / 100;
  const issues = T.warn.slice();
  const trend = T.tariffs.length ? sum(T.tariffs, t => (t.next / t.old - 1) * (t.pt == null ? 1 : t.pt)) / T.tariffs.length : 0;
  const years = T.years.slice(-3).filter(Y => Y.insured > 0);
  if (!years.length) throw new Error("سابقه‌ای با تعداد بیمه‌شده پیدا نشد.");
  const n = years.length, last = years[n - 1], prev = n > 1 ? years[n - 2] : null;
  const insuredNext = T.group.total || last.insured;
  const weights = n === 1 ? [1] : n === 2 ? [0.4, 0.6] : [0.2, 0.3, 0.5];
  // Older years are brought forward by one tariff step per year to the contract year.
  const grow = i => Math.pow(1 + trend, n - i);

  const rows = T.coverages.map(cv => {
    const per = years.map((Y, i) => {
      const c = Y.cov[cv.id] || Object.values(Y.cov).find(x => x.name === cv.name) || { claims: 0, users: 0, approved: 0, paid: 0, capUnpaid: 0, oldCap: null };
      // If the new cap is higher than the one in force, part of what went unpaid will be paid next year.
      const uplift = c.oldCap && cv.annualCap && cv.annualCap > c.oldCap ? Math.min(1, cv.annualCap / c.oldCap - 1) : 0;
      const cost = c.paid + c.capUnpaid * uplift;
      return { c, pc: cost / Y.insured, pcTrended: cost / Y.insured * grow(i) };
    });
    const projPc = per.reduce((s, p, i) => s + p.pcTrended * weights[i], 0);
    const L = per[n - 1], P = n > 1 ? per[n - 2] : null;
    const growth = P && P.pc > 0 ? L.pc / P.pc - 1 : null;
    const pressure = L.c.approved ? L.c.capUnpaid / L.c.approved : 0;
    const util = L.c.users / last.insured;
    const totalClaims = sum(per, p => p.c.claims);
    const protect = protectNames ? protectNames.has(cv.name) : PROTECT_RE.test(cv.name);
    let d, why;
    if (totalClaims === 0){
      d = protect ? "protect" : "remove";
      why = protect ? `در ${fmtInt(n)} سال سابقه استفاده نشده، ولی پوشش حمایتی است؛ در پیشنهاد بماند.` : `در ${fmtInt(n)} سال سابقه هیچ استفاده‌ای نداشته؛ می‌شود از پیشنهاد حذفش کرد یا با هزینهٔ ناچیز به‌عنوان امتیاز نگه داشت.`;
    } else if (pressure * 100 >= st.pressureHigh){
      d = "increase";
      why = `سال آخر ${fmtPct(pressure)} هزینه به خاطر سقف بیمه‌گر قبلی (${fmtNum(L.c.oldCap)}) پرداخت نشده. سقف بالاتر در پیشنهاد شما یک امتیاز رقابتی است.`;
    } else if (growth != null && growth > trend + 0.15 && L.c.claims >= 30){
      d = "growth";
      why = `سرانهٔ این پوشش در یک سال ${fmtPct(growth)} رشد کرده؛ بیشتر از تورم تعرفه. در قیمت لحاظ شده، ولی ریسک ادامهٔ رشد هست.`;
    } else if (!protect && util * 100 < st.lowUtil){
      d = "reduce";
      why = `فقط ${fmtPct(util)} افراد استفاده کرده‌اند؛ سقف کمتر یا فرانشیز بیشتر قیمت را پایین می‌آورد.`;
    } else {
      d = "keep";
      why = growth != null ? `رشد سرانه ${fmtPct(growth)}؛ در محدودهٔ عادی.` : "مصرف عادی.";
    }
    // Premium needed to raise the cap so last year's cap shortfall would be paid.
    const capCost = d === "increase" ? L.c.capUnpaid * (1 + trend) / last.insured * insuredNext / LR : 0;
    return { cv, per, projPc, growth, pressure, util, protect, d, why, capCost, oldCap: L.c.oldCap };
  });

  const expected = sum(rows, r => r.projPc) * insuredNext;
  const pcYears = years.map((Y, i) => sum(rows, r => r.per[i].pcTrended));
  const mean = sum(pcYears) / n;
  const vol = n > 1 ? (Math.max(...pcYears) - Math.min(...pcYears)) / mean : 0.15;
  const claimsLast = sum(rows, r => r.per[n - 1].c.claims);
  const autoMargin = Math.min(0.25, Math.max(0.03, 0.03 + vol / 2 + (n === 1 ? 0.05 : 0) + (claimsLast < 300 ? 0.05 : 0)));
  const margin = o.margin != null ? o.margin : autoMargin;
  const floor = expected / LR, price = expected * (1 + margin) / LR;
  const priorScaled = last.premium ? last.premium * insuredNext / last.insured : null;
  const hist = years.map(Y => { const paid = sum(Object.values(Y.cov), c => c.paid); return { year: Y.year, insured: Y.insured, paid, premium: Y.premium, lr: Y.premium ? paid / Y.premium : null, pc: paid / Y.insured }; });
  const level = n >= 2 && claimsLast >= 1000 ? "high" : (n >= 2 && claimsLast >= 300) || (n === 1 && claimsLast >= 1000) ? "mid" : "low";
  // Risk follows the expected loss ratio of a bid: at or under target = low, up to 85% = medium, above = high.
  const floor85 = expected / 0.85;
  const risk = bid => bid >= floor - 1e-9 ? ["low", "کم"] : bid >= floor85 - 1e-9 ? ["mid", "متوسط"] : ["high", "زیاد"];

  if (n === 1) issues.push({ sev: "warn", text: "فقط یک سال سابقه هست؛ روند قابل تشخیص نیست و حاشیهٔ اطمینان بیشتری گذاشته شد. سابقهٔ دو ساله بگیرید." });
  if (!last.premium) issues.push({ sev: "info", text: "حق‌بیمهٔ بیمه‌گر قبلی وارد نشده؛ مقایسه با قیمت قبلی ممکن نیست." });
  if (prev && Math.abs(last.insured / prev.insured - 1) > 0.2) issues.push({ sev: "warn", text: `تعداد بیمه‌شدگان بین دو سال ${fmtPct(last.insured / prev.insured - 1)} تغییر کرده؛ سرانه‌ها را با احتیاط مقایسه کنید.` });
  if (Math.abs(insuredNext / last.insured - 1) > 0.15) issues.push({ sev: "info", text: `تعداد نفرات قرارداد جدید (${fmtInt(insuredNext)}) با سال آخر (${fmtInt(last.insured)}) فرق دارد؛ برآورد بر اساس سرانه به تعداد جدید منتقل شد.` });
  if (vol > 0.25) issues.push({ sev: "warn", text: `هزینهٔ سرانه بین سال‌ها ${fmtPct(vol)} نوسان داشته؛ حاشیهٔ اطمینان بالاتری لازم است.` });
  const unknown = years.flatMap(Y => Object.values(Y.cov)).filter(c => !T.coverages.some(cv => cv.id === c.id || cv.name === c.name));
  if (unknown.length) issues.push({ sev: "crit", text: `در سابقه پوشش‌هایی هست که در تعهدات قرارداد جدید نیست: ${[...new Set(unknown.map(c => c.name || c.id))].join("، ")}. هزینهٔ آن‌ها در قیمت نیامده.` });

  return { group: T.group, years, hist, rows, trend, insuredNext, expected, margin, autoMargin, vol, floor, floor85, price, priorScaled, LR, level, risk, issues, n, claimsLast };
}
if (typeof module !== "undefined") Object.assign(module.exports, { parseTender, tenderAnalyze });
