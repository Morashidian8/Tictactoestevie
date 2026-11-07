/* ---------- parsing ---------- */
const FA_DIGITS = "۰۱۲۳۴۵۶۷۸۹", AR_DIGITS = "٠١٢٣٤٥٦٧٨٩";
function latin(s){ return String(s).replace(/[۰-۹]/g, d => FA_DIGITS.indexOf(d)).replace(/[٠-٩]/g, d => AR_DIGITS.indexOf(d)); }
function num(v){
  if (v == null || v === "") return null;
  if (typeof v === "number") return v;
  let s = latin(String(v).trim()).replace(/[,٬\s]/g, "");
  const pct = /[%٪]$/.test(s); s = s.replace(/[%٪]$/, "");
  const n = parseFloat(s);
  return isNaN(n) ? null : (pct ? n / 100 : n);
}
const str = v => v == null ? "" : String(v).trim();
const norm = s => str(s).replace(/‌/g, "").replace(/ي/g, "ی").replace(/ك/g, "ک").replace(/\s+/g, " ");

function findSheet(sheets, prefix, words){
  const names = Object.keys(sheets);
  return names.find(n => n.startsWith(prefix)) || names.find(n => words.some(w => norm(n).includes(w)));
}
// Header row is found by its first cell, so shifted rows don't break anything.
function table(rows, first){
  if (!rows) return null;
  const hi = rows.findIndex(r => r && norm(r[0]).toLowerCase() === first.toLowerCase());
  if (hi < 0) return null;
  const out = [];
  for (let i = hi + 1; i < rows.length; i++){
    const r = rows[i] || [];
    if (!str(r[0])) { if (out.length) break; else continue; }
    out.push(r);
  }
  return { header: rows[hi].map(norm), rows: out };
}
function col(t, names, fallback){
  for (const n of names){ const i = t.header.indexOf(norm(n)); if (i >= 0) return i; }
  return fallback;
}

function parseWorkbook(sheets){
  const warn = [];
  const S = {
    pop: sheets[findSheet(sheets, "01", ["جمعیت"])],
    cov: sheets[findSheet(sheets, "02", ["تعهدات"])],
    clm: sheets[findSheet(sheets, "03", ["خسارت"])],
    unp: sheets[findSheet(sheets, "04", ["غیرقابل"])],
    prm: sheets[findSheet(sheets, "05", ["حق"])],
    trf: sheets[findSheet(sheets, "06", ["تعرفه"])],
  };
  const tc = table(S.cov, "Coverage_ID"), tl = table(S.clm, "Claim_ID");
  if (!tc) throw new Error("جدول تعهدات پیدا نشد. شیتی با سرستون Coverage_ID لازم است.");
  if (!tl) throw new Error("جدول خسارت‌ها پیدا نشد. شیتی با سرستون Claim_ID لازم است.");

  let group = { name: "گروه بدون نام", total: null };
  const tp = table(S.pop, "Group_ID");
  if (tp && tp.rows[0]){
    const r = tp.rows[0], g = (n, f) => { const i = col(tp, [n], -1); return r[i >= 0 ? i : f]; };
    const parts = ["اصلی","همسر","فرزند","سایر وابسته"].map((n, k) => num(g(n, 6 + k)) || 0);
    group = { id: str(r[0]), name: str(g("نام بیمه‌گذار", 1)) || "گروه بدون نام", industry: str(g("صنعت", 2)), province: str(g("استان", 3)),
      period: str(g("دوره قرارداد", 4)), employees: num(g("تعداد کارکنان", 5)), parts,
      total: num(g("کل نفرات", 10)) || parts.reduce((a, b) => a + b, 0) || null,
      avgAge: num(g("میانگین سن", 11)), female: num(g("درصد زن", 13)), male: num(g("درصد مرد", 14)),
      budget: num(g("بودجه افزایش حق‌بیمه", 19)) };
  } else warn.push({ sev: "warn", text: "اطلاعات جمعیت گروه پیدا نشد؛ نرخ استفاده نسبت به کل بیمه‌شدگان محاسبه نمی‌شود." });

  const ci = (n, f) => { const i = col(tc, [n], -1); return i >= 0 ? i : f; };
  const coverages = tc.rows.map(r => ({
    id: str(r[0]), name: str(r[ci("پوشش", 1)]),
    annualCap: num(r[ci("سقف سالانه فعلی", 2)]), perCase: num(r[ci("سقف هر مورد", 3)]),
    min: num(r[ci("حداقل پیشنهادی", 8)]), max: num(r[ci("حداکثر پیشنهادی", 9)]),
  }));

  const li = (n, f) => col(tl, [n], f);
  const L = { member: li("Member_ID", 1), date: li("Claim_Date", 2), cov: li("Coverage_ID", 3), covName: li("پوشش", 4), service: li("نوع خدمت", 5),
    approved: li("مبلغ تاییدشده", 9), paid: li("پرداختی", 10), unpaid: li("غیرقابل پرداخت", 11), reason: li("علت عدم پرداخت", 12) };
  const claims = tl.rows.map(r => {
    const approved = num(r[L.approved]) || 0, paid = num(r[L.paid]) || 0;
    let unpaid = num(r[L.unpaid]); if (unpaid == null) unpaid = Math.max(0, approved - paid);
    return { id: str(r[0]), member: str(r[L.member]), date: str(r[L.date]), cov: str(r[L.cov]), covName: str(r[L.covName]),
      service: str(r[L.service]), approved, paid, unpaid, reason: norm(r[L.reason]) };
  });

  const tu = table(S.unp, "Claim_ID");
  const unpaidList = tu ? tu.rows.map(r => ({ id: str(r[0]), cov: str(r[col(tu, ["Coverage_ID"], 1)]), amount: num(r[col(tu, ["مبلغ غیرقابل پرداخت"], 3)]) || 0,
    reason: norm(r[col(tu, ["علت استاندارد"], 4)]), fixable: norm(r[col(tu, ["قابل اصلاح با تغییر قرارداد؟"], 6)]) })) : [];

  const premiums = [];
  (S.prm || []).forEach(r => {
    if (!r || !/^(سال|\d{4})/.test(latin(norm(r[0])))) return;
    premiums.push({ label: norm(r[0]), persons: num(r[1]), premium: num(r[2]), paid: num(r[3]), approved: num(r[4]), personMonths: num(r[8]) });
  });

  const tt = table(S.trf, "Service_ID");
  const tariffs = tt ? tt.rows.map(r => ({ name: str(r[1]), old: num(r[2]), next: num(r[3]), pt: num(r[4]) }))
    .filter(t => t.old > 0 && t.next != null) : [];

  return { group, coverages, claims, unpaidList, premiums, tariffs, warn };
}

/* ---------- dates ---------- */
function g2j(gy, gm, gd){
  const gdm = [0,31,59,90,120,151,181,212,243,273,304,334];
  let jy = gy <= 1600 ? 0 : 979; gy -= gy <= 1600 ? 621 : 1600;
  const gy2 = gm > 2 ? gy + 1 : gy;
  let days = 365 * gy + Math.floor((gy2 + 3) / 4) - Math.floor((gy2 + 99) / 100) + Math.floor((gy2 + 399) / 400) - 80 + gd + gdm[gm - 1];
  jy += 33 * Math.floor(days / 12053); days %= 12053;
  jy += 4 * Math.floor(days / 1461); days %= 1461;
  if (days > 365){ jy += Math.floor((days - 1) / 365); days = (days - 1) % 365; }
  const jm = days < 186 ? 1 + Math.floor(days / 31) : 7 + Math.floor((days - 186) / 30);
  const jd = 1 + (days < 186 ? days % 31 : (days - 186) % 30);
  return [jy, jm, jd];
}
const jDayNo = (y, m, d) => y * 365 + Math.floor(y / 4) + (m <= 7 ? (m - 1) * 31 : 186 + (m - 7) * 30) + d;
function parseJ(s){ const m = latin(norm(s)).match(/(\d{4})[\/\-.](\d{1,2})[\/\-.](\d{1,2})/); return m ? [+m[1], +m[2], +m[3]] : null; }
function renewalInfo(period, today){
  const all = latin(norm(period)).match(/\d{4}[\/\-.]\d{1,2}[\/\-.]\d{1,2}/g);
  if (!all || !all.length) return null;
  const end = parseJ(all[all.length - 1]);
  const t = today || (d => g2j(d.getFullYear(), d.getMonth() + 1, d.getDate()))(new Date());
  return { end: all[all.length - 1], days: jDayNo(...end) - jDayNo(...t) + 1 };
}
function monthIndex(d){ const j = parseJ(d); return j ? j[0] * 12 + j[1] : null; }

/* ---------- analysis ---------- */
const PROTECT_RE = /بستری|جراحی|زایمان|آمبولانس|سرطان|پیوند|دیالیز|اورژانس|شیمی/;
const DEFAULTS = { pressureHigh: 5, pressureMinor: 1, lowUtil: 2, lowClaim: 8, lowPaid: 2, targetLR: 75 };

function niceUp(x){
  const step = x < 10 ? 1 : x < 50 ? 5 : x < 200 ? 10 : x < 1000 ? 50 : 100;
  return Math.ceil(x / step - 1e-9) * step;
}
const sum = (a, f) => a.reduce((s, x) => s + (f ? f(x) : x), 0);

// Replays last year's approved claims, grown by the tariff trend, under a given set of caps.
function project(cl, annualCap, perCase, trend){
  const byM = new Map(); let need = 0;
  for (const c of cl){
    const a = c.approved * (1 + trend); need += a;
    const v = perCase != null ? Math.min(a, perCase) : a;
    const k = c.member || c.id; byM.set(k, (byM.get(k) || 0) + v);
  }
  let paid = 0; for (const v of byM.values()) paid += annualCap != null ? Math.min(v, annualCap) : v;
  return { paid, need };
}

function analyze(data, settings, protectNames){
  const st = Object.assign({}, DEFAULTS, settings || {});
  const { group, coverages, claims, unpaidList, premiums, tariffs } = data;
  const issues = data.warn.slice();

  const trend = tariffs.length ? sum(tariffs, t => (t.next / t.old - 1) * (t.pt == null ? 1 : t.pt)) / tariffs.length : 0;
  const totalPaid = sum(claims, c => c.paid), totalApproved = sum(claims, c => c.approved), totalUnpaid = sum(claims, c => c.unpaid);
  const insured = group.total;
  const current = premiums.length ? premiums[premiums.length - 1] : null;
  const prior = premiums.filter(p => p.premium && p.paid).slice(-1)[0] || null;
  const premiumNow = current && current.premium;
  const complete = premiumNow ? totalPaid / premiumNow >= 0.1 : true;

  const months = claims.map(c => monthIndex(c.date)).filter(m => m != null);
  const span = months.length ? Math.max(...months) - Math.min(...months) + 1 : 0;
  const level = claims.length >= 300 && span >= 24 ? "high" : claims.length >= 100 && span >= 12 ? "mid" : "low";

  const covIds = new Set(coverages.map(c => c.id));
  const rows = coverages.map(cv => {
    const cl = claims.filter(c => c.cov === cv.id || (!c.cov && c.covName === cv.name));
    const byMember = new Map();
    cl.forEach(c => { const k = c.member || c.id; const m = byMember.get(k) || { approved: 0, paid: 0 }; m.approved += c.approved; m.paid += c.paid; byMember.set(k, m); });
    const n = cl.length, users = byMember.size;
    const paid = sum(cl, c => c.paid), approved = sum(cl, c => c.approved);
    const capClaims = cl.filter(c => /سقف/.test(c.reason) && c.unpaid > 0);
    const capUnpaid = sum(capClaims, c => c.unpaid);
    const otherUnpaid = sum(cl, c => c.unpaid) - capUnpaid;
    const memberNeeds = [...byMember.values()].map(m => m.approved).sort((a, b) => a - b);
    const peakMember = memberNeeds.length ? memberNeeds[memberNeeds.length - 1] : 0;
    // Cap targets follow the 90th-percentile member, so one outlier doesn't set the cap for everyone.
    const pick = arr => arr.length >= 10 ? arr[Math.min(arr.length - 1, Math.ceil(arr.length * 0.9) - 1)] : (arr.length ? arr[arr.length - 1] : 0);
    const capNeedAnnual = pick(memberNeeds.filter(v => cv.annualCap != null && v > cv.annualCap));
    // Which cap caused each cap-related shortfall: the member's yearly total over the annual cap, else the single claim over the per-case cap.
    const memberKey = c => c.member || c.id;
    const annualHit = c => cv.annualCap != null && byMember.get(memberKey(c)).approved > cv.annualCap + 1e-9;
    const annualBinding = capClaims.some(annualHit);
    const perCaseBinding = capClaims.some(c => !annualHit(c) && cv.perCase != null && c.approved > cv.perCase + 1e-9);
    const caseNeed = pick(capClaims.filter(c => !annualHit(c)).map(c => c.approved).sort((a, b) => a - b));
    // A per-case cap that last year's payments ignored is not used in the cost projection.
    const perCaseEnforced = cv.perCase != null && !cl.some(c => c.paid > cv.perCase + 1e-9);
    const pressure = approved ? capUnpaid / approved : 0;
    const util = insured ? users / insured : null;
    const claimShare = claims.length ? n / claims.length : 0, paidShare = totalPaid ? paid / totalPaid : 0;
    const lowUse = complete && util != null ? util * 100 < st.lowUtil : (claimShare * 100 < st.lowClaim && paidShare * 100 < st.lowPaid);
    const protect = protectNames ? protectNames.has(cv.name) : PROTECT_RE.test(cv.name);
    const g = x => (1 + trend) * x;

    let d, newAnnual = cv.annualCap, newPerCase = cv.perCase;
    const why = [], notes = [];
    const fmt = x => fmtNum(x), pct = x => fmtPct(x);
    if (n === 0){
      if (protect){ d = "protect"; why.push("در این دوره استفاده‌ای نداشته، ولی پوشش حمایتی است: برای رویدادهای نادر و پرهزینه. نبودِ خسارت در یک سال یعنی شانس، نه بی‌نیازی."); }
      else { d = "remove"; why.push("در کل دوره هیچ خسارتی ثبت نشده است."); notes.push("صرفه‌جویی واقعی حذف را بیمه‌گر از نرخ این پوشش تعیین می‌کند؛ معمولاً کم است. می‌شود بودجه‌اش را به پوشش‌های پرفشار منتقل کرد."); }
    } else if (capUnpaid > 0 && pressure * 100 >= st.pressureMinor && new Set(capClaims.map(memberKey)).size === 1 && users >= 10){
      // One person caused all the cap shortfall: raising everyone's cap for a single case is poor value.
      d = "keep";
      const one = capClaims.reduce((a, c) => c.approved > a.approved ? c : a);
      why.push(`فقط یک نفر به سقف خورده: یک مورد استثنایی${one.service && one.service !== cv.name ? ` (${one.service})` : ""} با ${fmt(byMember.get(memberKey(one)).approved)} در برابر سقف ${fmt(cv.annualCap)}. بالا بردن سقف همهٔ ${fmtInt(users)} استفاده‌کننده برای یک مورد منطقی نیست.`);
      notes.push("برای چنین موردی، کمک موردی کارفرما یا یک پوشش مازاد جداگانه ارزان‌تر از افزایش سقف همه است.");
    } else if (capUnpaid > 0 && pressure * 100 >= st.pressureHigh){
      d = "increase";
      why.push(`${pct(pressure)} از مبلغ تأییدشده به خاطر سقف پرداخت نشده (${fmt(capUnpaid)} در ${fmtInt(capClaims.length)} مورد).`);
    } else if (capUnpaid > 0 && pressure * 100 >= st.pressureMinor){
      d = "minor";
      why.push(`به سقف خورده، ولی مبلغ پرداخت‌نشده کم است: ${fmt(capUnpaid)} (${pct(pressure)}).`);
    } else if (capUnpaid > 0){
      d = "keep";
      why.push(`فقط به‌ندرت به سقف خورده (${pct(pressure)} از مبلغ تأییدشده)؛ تغییر لازم نیست.`);
    } else if (lowUse && !protect){
      d = "reduce";
      why.push(complete && util != null ? `فقط ${pct(util)} از بیمه‌شدگان استفاده کرده‌اند.` : `فقط ${pct(claimShare)} از تعداد خسارت‌ها و ${pct(paidShare)} از مبلغ خسارت سهم این پوشش بوده است.`);
    } else {
      d = "keep";
      if (cv.annualCap) why.push(`بیشترین مصرف یک نفر ${pct(peakMember / cv.annualCap)} سقف سالانه بوده؛ سقف فعلی کافی است.`);
      else why.push("به سقف نخورده است.");
      if (lowUse && protect) notes.push("مصرف کم است، ولی چون پوشش حمایتی است کاهش پیشنهاد نمی‌شود.");
    }

    if (d === "increase" || d === "minor"){
      const bump = d === "increase" ? 0.2 : 0.1;
      if (perCaseBinding){
        newPerCase = niceUp(Math.min(cv.perCase * 2, Math.max(cv.perCase * (1 + bump), g(caseNeed))));
        why.push(`سقف هر مورد محدودکننده بوده: خسارت‌های تا ${fmt(caseNeed)} در برابر سقف ${fmt(cv.perCase)}.`);
      }
      if (annualBinding || !perCaseBinding){
        const want = Math.max(cv.annualCap * (1 + bump), annualBinding ? g(capNeedAnnual) : 0);
        newAnnual = niceUp(Math.min(cv.annualCap * 2, want));
        if (annualBinding) why.push(`سقف سالانه محدودکننده بوده: مصرف تا ${fmt(capNeedAnnual)} برای هر نفر در برابر سقف ${fmt(cv.annualCap)}.`);
        if (want > cv.annualCap * 2 + 1e-9) notes.push("افزایش به حداکثر دو برابر در یک تمدید محدود شد.");
      }
      // Single-event covers (per-case cap equal to the annual cap, e.g. maternity) keep both caps together.
      if (cv.perCase != null && cv.annualCap != null && cv.perCase >= cv.annualCap) newPerCase = Math.max(newPerCase, newAnnual);
      if (newPerCase != null && newAnnual != null && newPerCase > newAnnual) newAnnual = niceUp(newPerCase);
      if (cv.max != null && newAnnual > cv.max){ notes.push(`نیاز برآوردی (${fmt(newAnnual)}) از حداکثر مجاز پیشنهادی (${fmt(cv.max)}) بیشتر است؛ به حداکثر محدود شد.`); newAnnual = cv.max; }
      if (newPerCase != null && newAnnual != null && newPerCase > newAnnual) newPerCase = newAnnual;
      if (trend) notes.push(`سقف پیشنهادی با روند تعرفهٔ سال بعد (${pct(trend)}) تعدیل شده است.`);
    }
    if (d === "reduce"){
      const target = niceUp(Math.max(cv.min || 0, g(peakMember) * 1.5));
      if (cv.annualCap != null && target < cv.annualCap){
        newAnnual = target;
        if (newPerCase != null && newPerCase > newAnnual) newPerCase = newAnnual;
        notes.push(`سقف جدید هنوز ۱٫۵ برابر بیشترین مصرف یک نفر (${fmt(peakMember)}) جا دارد.`);
      } else { d = "keep"; why.length = 0; why.push(cv.min != null && target <= cv.min ? "مصرف کم است، ولی سقف فعلی در حداقل مجاز است؛ کاهش بیشتر ممکن نیست." : `مصرف کم است، ولی بیشترین مصرف یک نفر (${fmt(peakMember)}) به سقف فعلی نزدیک است؛ کاهش منطقی نیست.`); }
    }
    if (otherUnpaid > 0) notes.push(`${fmt(otherUnpaid)} به دلایل غیر از سقف پرداخت نشده؛ با تغییر سقف حل نمی‌شود.`);
    if (n > 0 && n < 30) notes.push(`فقط ${fmtInt(n)} خسارت؛ برای تصمیم قطعی کم است.`);

    const costOf = (annual, perCase, removed) => removed ? { paid: 0, need: project(cl, null, null, trend).need } : project(cl, annual, perCaseEnforced ? perCase : null, trend);
    return { cv, cl, n, users, paid, approved, capUnpaid, pressure, util, claimShare, paidShare, peakMember,
      protect, lowUse, d, newAnnual, newPerCase, why, notes, perCaseEnforced, costOf };
  });

  // data quality
  const claimIds = new Set(claims.map(c => c.id));
  const missing = unpaidList.filter(u => !claimIds.has(u.id)).map(u => u.id);
  if (missing.length) issues.push({ sev: "warn", text: `در شیت غیرقابل‌پرداخت به خسارت‌هایی اشاره شده که در شیت خسارت نیستند: ${missing.join("، ")}.` });
  const capLabels = [...new Set(claims.map(c => c.reason).concat(unpaidList.map(u => u.reason)).filter(r => /سقف/.test(r)))];
  if (capLabels.length > 1) issues.push({ sev: "warn", text: `علت «سقف» با چند عبارت مختلف نوشته شده (${capLabels.map(x => "«" + x + "»").join("، ")}). یکدست کنید تا تحلیل دقیق بماند.` });
  const unknownCov = [...new Set(claims.filter(c => c.cov && !covIds.has(c.cov)).map(c => c.cov))];
  if (unknownCov.length) issues.push({ sev: "crit", text: `خسارت با کد پوششی که در جدول تعهدات نیست: ${unknownCov.join("، ")}. این خسارت‌ها در تحلیل پوشش‌ها نیامده‌اند.` });
  const overCase = claims.filter(c => { const cv = coverages.find(x => x.id === c.cov); return cv && cv.perCase != null && c.paid > cv.perCase + 1e-9; });
  if (overCase.length) issues.push({ sev: "warn", text: `پرداختی بیشتر از سقف هر مورد: ${overCase.slice(0, 8).map(c => c.id).join("، ")}${overCase.length > 8 ? " و …" : ""}. یا سقف هر مورد اشتباه وارد شده یا پرداخت؛ این سقف در برآورد هزینه لحاظ نشد.` });
  const mism = claims.filter(c => Math.abs(c.approved - c.paid - c.unpaid) > 0.01);
  if (mism.length) issues.push({ sev: "warn", text: `در ${fmtInt(mism.length)} خسارت، تأییدشده منهای پرداختی با غیرقابل‌پرداخت نمی‌خواند: ${mism.slice(0, 6).map(c => c.id).join("، ")}.` });
  if (!complete) issues.push({ sev: "crit", text: `جمع خسارت‌های ثبت‌شده (${fmtNum(totalPaid)}) فقط ${fmtPct(totalPaid / premiumNow)} حق‌بیمهٔ ${current.label} است. فهرست خسارت ناقص به نظر می‌رسد؛ Loss Ratio این سال معتبر نیست و «مصرف کم» به‌جای نرخ استفاده با سهم نسبی سنجیده شد.` });
  if (current && current.persons && insured && Math.abs(current.persons - insured) / insured > 0.1)
    issues.push({ sev: "warn", text: `تعداد نفر در شیت حق‌بیمه (${fmtInt(current.persons)}) با کل بیمه‌شدگان (${fmtInt(insured)}) فرق دارد؛ احتمالاً فقط افراد اصلی شمرده شده‌اند و سرانه‌ها اشتباه می‌شود.` });
  if (group.female != null && group.male != null && Math.abs(group.female + group.male - 1) > 0.01)
    issues.push({ sev: "warn", text: "جمع درصد زن و مرد ۱۰۰٪ نمی‌شود." });
  if (span && span < 24) issues.push({ sev: "info", text: `دادهٔ خسارت ${fmtInt(span)} ماه را پوشش می‌دهد. برای پیشنهاد حذف یا کاهش، ۲۴ تا ۳۶ ماه داده بهتر است.` });
  if (!tariffs.length) issues.push({ sev: "info", text: "تعرفهٔ سال بعد وارد نشده؛ روند هزینه صفر فرض شد." });

  const lr = complete && premiumNow ? totalPaid / premiumNow : null;
  const priorLr = prior ? prior.paid / prior.premium : null;
  return { group, rows, trend, totalPaid, totalApproved, totalUnpaid, insured, current, prior, premiumNow, complete, lr, priorLr,
    span, level, claimsCount: claims.length, issues, targetLR: st.targetLR / 100, renewal: renewalInfo(group.period) };
}

/* ---------- scenarios ---------- */
// Each scenario picks caps per coverage; cost is last year's claims replayed under those caps.
function scenarios(A, budgetPct){
  const keep = r => ({ annual: r.cv.annualCap, perCase: r.cv.perCase, removed: false, changed: false });
  const rec = r => ({ annual: r.newAnnual, perCase: r.newPerCase, removed: r.d === "remove", changed: r.d !== "keep" && r.d !== "protect" });
  const up = r => r.d === "increase" || r.d === "minor", down = r => r.d === "reduce" || r.d === "remove";
  const index = r => {
    const a = r.cv.annualCap != null ? niceUp(r.cv.annualCap * (1 + A.trend)) : null;
    const p = r.cv.perCase != null ? Math.min(niceUp(r.cv.perCase * (1 + A.trend)), a ?? Infinity) : null;
    return { annual: a, perCase: p, removed: false, changed: A.trend > 0 };
  };
  const premiumPlus = r => {
    const x = rec(r), a = x.annual != null ? niceUp(x.annual * 1.2) : null;
    return { annual: a, perCase: x.perCase != null && x.perCase === x.annual ? a : x.perCase, removed: false, changed: true };
  };
  const plans = {
    economy: A.rows.map(r => r.d === "increase" || down(r) ? rec(r) : keep(r)),
    balanced: A.rows.map(rec),
    premium: A.rows.map(r => up(r) ? premiumPlus(r) : index(r)),
    current: A.rows.map(keep),
  };

  const evalPlan = caps => {
    let paid = 0, need = 0;
    const per = A.rows.map((r, i) => { const c = r.costOf(caps[i].annual, caps[i].perCase, caps[i].removed); paid += c.paid; need += c.need; return c.paid; });
    return { caps, paid, need, per };
  };

  // Budget: the employer's premium-increase ceiling. With complete data it converts to a claims ceiling at the
  // target loss ratio; with incomplete data it is applied to the growth of the recorded claims instead.
  const budget = budgetPct != null ? budgetPct : (A.group.budget != null ? A.group.budget : 0.25);
  const allowed = A.complete && A.premiumNow ? A.premiumNow * (1 + budget) * A.targetLR : A.totalPaid * (1 + budget);
  const start = A.rows.map(r => down(r) ? rec(r) : keep(r));
  let caps = start.slice(), cur = evalPlan(caps);
  const picked = [], skipped = [];
  A.rows.map((r, i) => ({ r, i })).filter(x => up(x.r)).sort((a, b) => b.r.pressure - a.r.pressure).forEach(({ r, i }) => {
    const trial = caps.slice(); trial[i] = rec(r);
    const t = evalPlan(trial);
    if (t.paid <= allowed + 1e-9){ caps = trial; cur = t; picked.push(r.cv.name); } else skipped.push(r.cv.name);
  });

  const out = {};
  for (const k of Object.keys(plans)) out[k] = evalPlan(plans[k]);
  out.budget = Object.assign(cur, { picked, skipped, allowed, fits: cur.paid <= allowed + 1e-9 });
  for (const k of Object.keys(out)){
    const s = out[k];
    s.change = A.totalPaid ? s.paid / A.totalPaid - 1 : null;
    s.cover = s.need ? s.paid / s.need : null;
    s.premiumNeeded = A.complete && A.premiumNow ? s.paid / A.targetLR : null;
    s.premiumChange = s.premiumNeeded != null ? s.premiumNeeded / A.premiumNow - 1 : null;
  }
  out.budgetPct = budget;
  return out;
}

/* ---------- formatting ---------- */
const nf1 = new Intl.NumberFormat("fa-IR", { maximumFractionDigits: 1 });
const nf0 = new Intl.NumberFormat("fa-IR", { maximumFractionDigits: 0 });
function fmtNum(x){ return x == null || isNaN(x) ? "—" : (Math.abs(x) >= 100 ? nf0 : nf1).format(x); }
function fmtInt(x){ return x == null || isNaN(x) ? "—" : nf0.format(x); }
function fmtPct(x){ if (x == null || isNaN(x)) return "—"; const v = x * 100; return new Intl.NumberFormat("fa-IR", { maximumFractionDigits: Math.abs(v) < 1 ? 2 : 1 }).format(v) + "٪"; }
function fmtSignedPct(x){ return x == null || isNaN(x) ? "—" : (x > 0 ? "+" : "") + fmtPct(x); }
if (typeof module !== "undefined") module.exports = { parseWorkbook, analyze, scenarios, niceUp, g2j, renewalInfo, project };
