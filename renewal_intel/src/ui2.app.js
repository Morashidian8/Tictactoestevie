/* ================= UI (DESIGN_PROMPT_1) ================= */
const $ = id => document.getElementById(id);
const esc = s => String(s ?? "").replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const DLABEL = { increase: "افزایش سقف", minor: "افزایش جزئی", keep: "بدون تغییر", reduce: "کاهش سقف", remove: "کاندید حذف", protect: "حفظ پوشش حمایتی" };
const DTAG = { increase: "t-inc", minor: "t-minor", keep: "t-keep", reduce: "t-reduce", remove: "t-remove", protect: "t-protect" };
const DCOLOR = { increase: "var(--inc)", minor: "var(--minor)", keep: "var(--keep)", reduce: "var(--red)", remove: "var(--rem)", protect: "var(--prot)" };
const ORDER = { increase: 0, minor: 1, reduce: 2, remove: 3, protect: 4, keep: 5 };
const LVL = { low: ["t-bad", "پایین"], mid: ["t-mid", "متوسط"], high: ["t-good", "بالا"] };
const SCN = [
  ["economy", "اقتصادی", "فقط پوشش‌های پرفشار بالا؛ کم‌مصرف‌ها کم یا حذف"],
  ["balanced", "متعادل", "همهٔ پیشنهادهای بخش پوشش‌ها"],
  ["premium", "ممتاز", "افزایش‌ها ۲۰٪ بیشتر، بقیه هم‌پای تعرفه؛ بدون کاهش"],
];
const TLABEL = { increase: "سقف بالاتر = امتیاز", growth: "رشد سریع", reduce: "کاهش سقف", remove: "کاندید حذف", protect: "حفظ پوشش حمایتی", keep: "عادی" };
const TTAG = { increase: "t-inc", growth: "t-reduce", reduce: "t-reduce", remove: "t-remove", protect: "t-protect", keep: "t-keep" };
const lrStat = lr => lr == null ? null : lr >= 0.85 ? ["t-bad", "زیان‌ده", "var(--bad)"] : lr >= 0.75 ? ["t-mid", "مرزی", "var(--mid)"] : ["t-good", "سالم", "var(--good)"];
const RISK = { low: ["z-low", "کم", "var(--good)", "t-good"], mid: ["z-mid", "متوسط", "var(--mid)", "t-mid"], high: ["z-high", "زیاد", "var(--bad)", "t-bad"] };
const SEVTAG = { crit: ["t-bad", "بحرانی"], warn: ["t-mid", "هشدار"], info: ["t-protect", "اطلاع"] };
const inFrame = (() => { try { return window.self !== window.top; } catch (e) { return true; } })();
const reduced = () => matchMedia("(prefers-reduced-motion: reduce)").matches;

const state = { docs: [], contracts: [], claims: [], cl: {}, cmpOrg: null, page: "home", idx: null, mode: "renewal", groups: [], tenders: [], settings: Object.assign({}, DEFAULTS), protectNames: new Set(),
  sort: "renewal", q: "", errors: [], hist: [], pushed: 0, more: {}, mcat: "urgent", chat: {}, tab: null };

/* ---------- data ---------- */
function sampleGroups(){
  const foolad = { sample: true, own: true, file: "Renewal_Intelligence_Takmili_Darman_v1.xlsx", data: parseWorkbook(JSON.parse($("sample").textContent)) };
  return [foolad].concat(makeSamples());
}
function addProtect(list){ list.forEach(g => g.data.coverages.forEach(c => { if (PROTECT_RE.test(c.name)) state.protectNames.add(c.name); })); }
function setGroups(list){ state.groups = list.map(g => Object.assign({ budget: null }, g)); addProtect(state.groups); }
const isSample = () => state.groups.length > 0 && state.groups.every(g => g.sample);
const tenderSample = () => state.tenders.length > 0 && state.tenders.every(t => t.sample);
function compute(g){ const A = analyze(g.data, state.settings, state.protectNames); return { A, S: scenarios(A, g.budget) }; }
function computeTender(t){ return tenderAnalyze(t.data, state.settings, state.protectNames, { margin: t.margin }); }
const short = n => String(n || "").replace(/^نمونه: /, "");
const match = n => !state.q || norm(n).includes(norm(state.q));

function buildTodo(all){
  const todo = [];
  all.forEach(x => {
    const { A, S } = x, name = A.group.name;
    if (A.renewal && A.renewal.days >= 0 && A.renewal.days <= 60) todo.push({ sev: A.renewal.days <= 30 ? "crit" : "warn", w: 100 - A.renewal.days, i: x.i, name, text: `تمدید ${fmtInt(A.renewal.days)} روز دیگر؛ پیشنهاد سقف‌ها و سناریوها را برای جلسه آماده کنید.` });
    if (A.renewal && A.renewal.days < 0) todo.push({ sev: "crit", w: 120, i: x.i, name, text: `قرارداد ${fmtInt(-A.renewal.days)} روز پیش تمام شده است.` });
    if (A.lr != null && A.lr >= 0.85) todo.push({ sev: "crit", w: 90, i: x.i, name, text: `زیان‌ده: Loss Ratio ${fmtPct(A.lr)}؛ حتی با سقف‌های فعلی حق‌بیمه باید ${fmtSignedPct(S.current.premiumChange)} تغییر کند.` });
    if (!S.budget.fits) todo.push({ sev: "warn", w: 70, i: x.i, name, text: `بودجهٔ کارفرما (${fmtSignedPct(S.budgetPct)}) حتی برای حفظ وضع فعلی کافی نیست${S.current.premiumChange != null ? `؛ لازم: ${fmtSignedPct(S.current.premiumChange)}` : ""}.` });
    if (!A.complete) todo.push({ sev: "warn", w: 50, i: x.i, name, text: "فهرست خسارت ناقص است؛ پیش از مذاکره دادهٔ کامل بگیرید." });
    const bal = S.balanced, cur = S.current;
    if (bal.premiumChange != null && bal.premiumChange <= 0.02 && A.rows.some(r => r.d === "increase" || r.d === "minor"))
      todo.push({ sev: "ok", w: 60, i: x.i, name, text: `مزایای بهتر با حق‌بیمهٔ ${fmtPct(Math.abs(bal.premiumChange))} ${bal.premiumChange < 0 ? "کمتر" : "بیشتر"}؛ سهم کارکنان ${fmtPct(1 - cur.cover)} ← ${fmtPct(1 - bal.cover)}.` });
    const rm = A.rows.filter(r => r.d === "remove" || r.d === "reduce");
    if (rm.length) todo.push({ sev: "ok", w: 30, i: x.i, name, text: `صرفه‌جویی: ${rm.map(r => r.cv.name).join("، ")} کم‌مصرف یا بی‌مصرف.` });
    if (S.budget.fits && S.budget.picked.length && S.budget.skipped.length)
      todo.push({ sev: "info", w: 35, i: x.i, name, text: `با بودجهٔ ${fmtSignedPct(S.budgetPct)}: ${S.budget.picked.join("، ")} جا می‌شود، ${S.budget.skipped.join("، ")} نه.` });
    A.rows.filter(r => r.why.some(w => w.includes("استثنایی")) && r.pressure * 100 >= state.settings.pressureHigh).forEach(r =>
      todo.push({ sev: "info", w: 33, i: x.i, name, text: `مورد استثنایی در ${r.cv.name}؛ سقف همه بالا نرفت، کمک موردی ارزان‌تر است.` }));
  });
  return todo;
}
const CATS = [["urgent", "فوری"], ["opp", "فرصت‌ها"], ["warn", "هشدار"], ["note", "نکته‌ها"]];
const catOf = t => t.sev === "crit" ? "urgent" : t.sev === "warn" ? "warn" : t.sev === "ok" ? "opp" : "note";

/* ---------- small builders ---------- */
function kpi(label, value, sub, opts){
  const o = opts || {};
  return `<div class="card kpi${o.accent ? " accent" : ""}"><span class="kl">${label}</span><div class="row"><span class="kv">${value}</span>${o.tag || ""}</div>${sub ? `<span class="ks"${o.subColor ? ` style="color:${o.subColor}"` : ""}>${sub}</span>` : ""}${o.lr != null ? miniLR(o.lr) : ""}</div>`;
}
function miniLR(lr, w){
  const st = lrStat(lr), t = state.settings.targetLR / 100;
  return `<div class="mini" aria-hidden="true"${w ? ` style="width:${w}px"` : ""}><i style="width:${Math.min(100, lr / 1.2 * 100).toFixed(1)}%;background:${st[2]}"></i><b style="inset-inline-start:${(t / 1.2 * 100).toFixed(1)}%"></b><b style="inset-inline-start:${(0.85 / 1.2 * 100).toFixed(1)}%"></b></div>`;
}
const lrTag = lr => { const s = lrStat(lr); return s ? `<span class="tag ${s[0]}">${s[1]}</span>` : ""; };
const ptabs = items => `<nav class="ptabs" aria-label="بخش‌های این صفحه">${items.map(([id, label, n], k) => `<button type="button" data-jump="${id}"${k === 0 ? ' aria-current="true"' : ""}>${label}${n ? `<span class="n">${fmtInt(n)}</span>` : ""}</button>`).join("")}</nav>`;
function stepper(id, value, step){ return `<span class="stepper"><button type="button" data-step="${id}" data-d="${step}" aria-label="افزایش">＋</button><input id="${id}" type="number" value="${value}" inputmode="decimal"><button type="button" data-step="${id}" data-d="${-step}" aria-label="کاهش">−</button></span>`; }
function dqList(iss){
  const o = { crit: 0, warn: 1, info: 2 };
  return iss.length ? `<ul class="dq">${iss.slice().sort((a, b) => o[a.sev] - o[b.sev]).map(x => `<li><span class="sev tag ${SEVTAG[x.sev][0]}">${SEVTAG[x.sev][1]}</span><span>${esc(x.text)}</span></li>`).join("")}</ul>` : '<p class="muted">مشکلی پیدا نشد.</p>';
}
const todayFa = () => {
  const d = new Date(), [y, m, dd] = g2j(d.getFullYear(), d.getMonth() + 1, d.getDate());
  const M = ["فروردین","اردیبهشت","خرداد","تیر","مرداد","شهریور","مهر","آبان","آذر","دی","بهمن","اسفند"], W = ["یکشنبه","دوشنبه","سه‌شنبه","چهارشنبه","پنجشنبه","جمعه","شنبه"];
  const fa = n => String(n).replace(/\d/g, c => "۰۱۲۳۴۵۶۷۸۹"[c]);
  return `${W[d.getDay()]} ${fa(dd)} ${M[m - 1]} ${fa(y)}`;
};
const nowFa = () => { try { return new Intl.DateTimeFormat("fa-IR", { hour: "2-digit", minute: "2-digit" }).format(new Date()); } catch (e) { return ""; } };

const crumb = (...xs) => `<div class="crumb"><button type="button" data-go="home">خانه</button>${xs.map(([k, l]) => `<span>/</span>${k ? `<button type="button" data-go="${k}">${l}</button>` : `<span>${l}</span>`}`).join("")}</div>`;
const ICON = {
  renewal: '<path d="M21 12a9 9 0 1 1-3-6.7"/><path d="M21 4v5h-5"/>',
  action: '<path d="M13 2 3 14h9l-1 8 10-12h-9z"/>',
  tender: '<path d="M4 21V8l8-5 8 5v13"/><path d="M9 21v-6h6v6"/>',
  cal: '<rect x="3" y="4" width="18" height="17" rx="3"/><path d="M8 2v4M16 2v4M3 10h18"/>',
  ai: '<path d="M12 3l1.8 4.7 4.7 1.8-4.7 1.8L12 16l-1.8-4.7-4.7-1.8 4.7-1.8z"/><path d="M19 15l.8 2.2 2.2.8-2.2.8L19 21l-.8-2.2L16 18l2.2-.8z"/>',
  claims: '<path d="M6 2h12v20l-3-2-3 2-3-2-3 2z"/><path d="M9 7h6M9 11h6M9 15h4"/>',
  docs: '<path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"/><path d="M14 3v6h6M8 13h8M8 17h5"/>',
  settings: '<path d="M4 6h10M18 6h2M4 12h4M12 12h8M4 18h12M20 18h0"/><circle cx="16" cy="6" r="2"/><circle cx="10" cy="12" r="2"/><circle cx="18" cy="18" r="2"/>',
  users: '<circle cx="9" cy="8" r="4"/><path d="M2 21a7 7 0 0 1 14 0M17 4a4 4 0 0 1 0 8M22 21a7 7 0 0 0-4-6.3"/>',
  market: '<path d="M3 3v18h18"/><path d="m7 15 4-4 3 3 5-6"/>',
  link: '<path d="M9 7H6a5 5 0 0 0 0 10h3M15 7h3a5 5 0 0 1 0 10h-3M8 12h8"/>',
  map: '<path d="M4 6h10M4 12h16M4 18h7"/><path d="m17 3 3 3-3 3"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  upload: '<path d="M12 16V4M7 9l5-5 5 5"/><path d="M4 16v3a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-3"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/><path d="M8.5 11h5M11 8.5v5"/>',
  moon: '<path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/>',
  portfolio: '<rect x="3" y="7" width="18" height="13" rx="2"/><path d="M8 7V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M3 13h18"/>',
  urgent: '<path d="M12 3 2 20h20z"/><path d="M12 10v4M12 17.5v.5"/>',
};
const ic = k => `<span class="ic ic-${k}"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${ICON[k]}</svg></span>`;
const islHead = (k, title, sub, go) => `<div class="isl-h">${ic(k)}<div><h3>${title}</h3><p>${sub}</p></div>${go ? `<span class="go" aria-hidden="true">←</span>` : ""}</div>`;

/* ---------- home: islands ---------- */
const greet = () => { const h = new Date().getHours(); return h < 11 ? "سلام، صبح بخیر" : h < 16 ? "سلام، روز بخیر" : "سلام، عصر بخیر"; };
// Loss Ratio gauge: half circle from 0 to 120%; green up to the target, amber to 85%, red beyond.
function gaugeSVG(v, target){
  const cx = 125, cy = 128, r = 100, M = 1.2, pt = x => { const a = Math.PI * (1 - Math.min(M, Math.max(0, x)) / M); return [cx + r * Math.cos(a), cy - r * Math.sin(a)]; };
  const arc = (a, b, c, cap) => { const [x0, y0] = pt(a), [x1, y1] = pt(b); return `<path d="M${x0.toFixed(1)} ${y0.toFixed(1)} A${r} ${r} 0 0 1 ${x1.toFixed(1)} ${y1.toFixed(1)}" stroke="${c}" stroke-width="18" fill="none"${cap ? ' stroke-linecap="round"' : ""}/>`; };
  const nv = v == null ? 0 : v, a = Math.PI * (1 - Math.min(M, nv) / M), nx = cx + 70 * Math.cos(a), ny = cy - 70 * Math.sin(a);
  return `<svg width="250" height="140" viewBox="0 0 250 140" role="img" aria-label="Loss Ratio ${fmtPct(v)}">${arc(0, target - 0.01, "#4ADE80", true)}${arc(target + 0.01, 0.84, "#FBBF24")}${arc(0.86, M, "#FB7185", true)}
    ${v == null ? "" : `<line x1="${cx}" y1="${cy}" x2="${nx.toFixed(1)}" y2="${ny.toFixed(1)}" stroke="#fff" stroke-width="5" stroke-linecap="round"/><circle cx="${cx}" cy="${cy}" r="9" fill="#fff"/>`}</svg>`;
}
const DONUT_C = { urgent: "#E11D48", opp: "#16A34A", warn: "#F59E0B", note: "#6366F1" };
function donutSVG(parts, total){
  const C = 2 * Math.PI * 15.9; let off = 25 / 100 * C;
  const segs = parts.filter(([n]) => n > 0).map(([n, c]) => { const len = n / Math.max(1, total) * C, el = `<circle cx="21" cy="21" r="15.9" fill="none" stroke="${c}" stroke-width="6.5" stroke-dasharray="${(len - 0.6).toFixed(2)} ${(C - len + 0.6).toFixed(2)}" stroke-dashoffset="${off.toFixed(2)}"/>`; off -= len; return el; }).join("");
  return `<svg class="donut" viewBox="0 0 42 42" role="img" aria-label="${fmtInt(total)} پیشنهاد"><circle cx="21" cy="21" r="15.9" fill="none" stroke="var(--line2)" stroke-width="6.5"/>${segs}<text x="21" y="24" text-anchor="middle" font-size="9" font-weight="900" fill="currentColor" font-family="Vazirmatn">${fmtInt(total)}</text></svg>`;
}
// Renewals on a 90-day line: position by days left, colour by urgency.
function timelineHTML(list){
  if (!list.length) return '<span class="small muted">تا ۹۰ روز آینده تمدیدی نیست.</span>';
  const col = d => d <= 30 ? "#E11D48" : d <= 60 ? "#F59E0B" : "#A5B4FC";
  return `<div class="tline"><span class="tk" style="right:0">امروز</span><span class="tk" style="right:50%">۴۵ روز</span><span class="tk" style="right:100%">۹۰</span><div class="ln"></div>
    ${list.map((x, k) => { const d = x.A.renewal.days, p = Math.max(0, Math.min(100, d / 90 * 100)); return `<button type="button" class="pt" data-open="${x.i}" style="right:${p}%;background:${col(d)}" title="${esc(x.A.group.name)}: ${d < 0 ? fmtInt(-d) + " روز گذشته" : fmtInt(d) + " روز"}"></button>${k < 3 ? `<span class="lb" style="right:${p}%;top:${50 + k * 15}px;color:${col(d) === "#A5B4FC" ? "var(--ink2)" : col(d)}">${esc(short(x.A.group.name).split(" ").slice(-2).join(" "))} · ${d < 0 ? "گذشته" : fmtInt(d) + " روز"}</span>` : ""}`; }).join("")}</div>`;
}
function renderHome(){
  const all = state.groups.map((g, i) => Object.assign({ i, g }, compute(g)));
  const comp = all.filter(x => x.A.complete && x.A.premiumNow);
  const plr = sum(comp, x => x.A.premiumNow) ? sum(comp, x => x.A.totalPaid) / sum(comp, x => x.A.premiumNow) : null;
  const todo = buildTodo(all), st = lrStat(plr);
  const nCat = k => todo.filter(x => catOf(x) === k).length;
  const soon = all.filter(x => x.A.renewal).sort((a, b) => a.A.renewal.days - b.A.renewal.days);
  const soon90 = soon.filter(x => x.A.renewal.days >= 0 && x.A.renewal.days <= 90).length;
  const tenders = state.tenders.map((t, i) => ({ i, t, R: computeTender(t) }));
  const bars = all.filter(x => x.A.lr != null).sort((a, b) => a.A.lr - b.A.lr);
  const t = state.settings.targetLR / 100, top = Math.max(1.2, ...bars.map(x => x.A.lr)) * 1.05;
  const L = window.RI_LICENSE;
  const dayTag = d => d < 0 ? ["t-bad", `${fmtInt(-d)} روز گذشته`] : d <= 30 ? ["t-bad", `${fmtInt(d)} روز`] : d <= 60 ? ["t-mid", `${fmtInt(d)} روز`] : ["t-protect", `${fmtInt(d)} روز`];
  const aiPick = state.homeAi ?? "p";
  const ORD = { urgent: 0, warn: 1, opp: 2, note: 3 }, top3 = todo.slice().sort((a, b) => ORD[catOf(a)] - ORD[catOf(b)] || b.w - a.w).slice(0, 3);
  const pChat = state.chat.p || [];
  setHead("Renewal Intelligence", todayFa());
  $("view").innerHTML = `
  <section class="hh2">
    <div class="hh2-g"><p class="small" style="opacity:.85">${todayFa()}</p><h1>${greet()}</h1>
      <p style="opacity:.9">${top3.length ? `${fmtInt(nCat("urgent"))} کار فوری و ${fmtInt(soon90)} تمدید در ۹۰ روز آینده` : "کار فوری‌ای نیست"}</p>
      <div class="todo">${top3.map(x => `<button type="button" data-open="${x.i}"><span class="dot" style="background:${{ urgent: "#FDA4AF", warn: "#FDE68A", opp: "#A7F3D0", note: "#C7D2FE" }[catOf(x)]}"></span><span>${esc(short(x.name))}: ${esc(x.text.split(/[؛.]/)[0])}</span><b class="${catOf(x)}">${{ urgent: "فوری", warn: "هشدار", opp: "فرصت", note: "نکته" }[catOf(x)]}</b></button>`).join("")}</div>
      ${L ? `<span class="lic">مجوز: ${esc(L.name)}${L.days != null ? ` · ${fmtInt(L.days)} روز مانده` : ""}</span>` : ""}</div>
    <div class="hh2-gauge">${gaugeSVG(plr, t)}<div class="gv">${fmtPct(plr)}</div><div class="small" style="opacity:.9">Loss Ratio پرتفوی${st ? ` · <b>${st[1]}</b>` : ""}</div></div>
    <div class="hh2-st">
      <div><span>گروه‌ها</span><b>${fmtInt(all.length)}</b><small>${fmtInt(soon90)} تمدید در ۹۰ روز</small></div>
      <div><span>بیمه‌شدگان</span><b>${fmtInt(sum(all, x => x.A.insured || 0))}</b><small>جمع همهٔ گروه‌ها</small></div>
      <div><span>حق‌بیمهٔ جاری</span><b>${fmtNum(sum(all, x => x.A.premiumNow || 0) / 1000)}</b><small>میلیارد تومان</small></div>
      <div><span>مناقصه‌های باز</span><b>${fmtInt(tenders.length)}</b><small>${fmtInt(tenders.filter(x => x.R.priorScaled && x.R.risk(x.R.priorScaled)[0] === "high").length)} با قیمت قبلی پرریسک</small></div>
    </div>
  </section>
  <div class="sec-t"><h2>دو کار اصلی</h2><span class="small muted">فایل بدهید یا نام سازمان را بزنید؛ بقیه را اپ انجام می‌دهد.</span></div>
  <div class="missions">
    <section class="mis">
      <div class="mis-h"><span class="blob b1"><svg viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12a9 9 0 1 1-3-6.7"/><path d="M21 4v5h-5"/></svg></span><div><h2>تحلیل تمدید قرارداد</h2><p>فایل اکسل قرارداد فعلی را بدهید؛ برای تک‌تک پوشش‌ها می‌گوییم چه کنید و حق‌بیمهٔ لازم چقدر است.</p></div></div>
      <label class="drop" id="dropR" for="file"><span class="di"><svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 16V4M7 9l5-5 5 5"/><path d="M4 16v3a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-3"/></svg></span><b>فایل را اینجا بکشید یا بزنید</b><span>اکسل خسارت برای تحلیل کامل · PDF، عکس یا Word بیمه‌نامه برای مقایسهٔ قرارداد</span></label>
      <div class="does"><span class="t-inc">پرمصرف و زیر فشار سقف ← افزایش</span><span class="t-reduce">کم‌مصرف ← کاهش</span><span class="t-remove">بدون مصرف ← حذف</span><span class="t-protect">حمایتی ← حفظ</span><span class="t-keep">مورد استثنایی ← چشم‌پوشی</span></div>
      <button class="link" type="button" data-go="renewal" style="align-self:flex-start">یا تحلیل ${fmtInt(all.length)} گروه نمونه را ببینید ←</button>
    </section>
    <section class="mis">
      <div class="mis-h"><span class="blob b2"><svg viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M3.5 12.2V4.5a1 1 0 0 1 1-1h7.7l8.3 8.3-8.7 8.7z"/><circle cx="8.3" cy="8.3" r="1.5"/></svg></span><div><h2>برآورد قیمت مناقصه</h2><p>نام سازمان را بزنید؛ سابقهٔ خسارتش را می‌گیریم، تحلیل می‌کنیم و قیمتی می‌دهیم که Loss Ratio زیر ${fmtPct(t)} بماند.</p></div></div>
      <form class="qbox" id="tenderQ"><input id="tq" placeholder="نام سازمان یا شرکت، مثلاً شرکت گاز" autocomplete="off" aria-label="نام سازمان یا شرکت"><button class="btn primary" type="submit">دریافت سابقه و برآورد</button></form>
      <div class="qsug">امتحان کنید: ${tenders.map(x => `<button type="button" data-tq="${esc(short(x.R.group.name).replace(/^مناقصهٔ\s*/, ""))}">${esc(short(x.R.group.name).replace(/^مناقصهٔ\s*/, ""))}</button>`).join("")}</div>
      <div class="conn"><i></i><span>داده‌پردازان: اتصال مستقیم در فاز آخر پروژه. تا آن موقع سابقه از دادهٔ نمونه یا فایل اکسل خروجی داده‌پردازان خوانده می‌شود.</span></div>
    </section>
  </div>
  <div class="sec-t"><h2>میز کار</h2><span class="small muted">هر جزیره یک بخش از برنامه است؛ روی آن بزنید تا باز شود.</span></div>
  <div class="bento">
    <div class="isl w2 h2 click" data-go="renewal" role="link" tabindex="0">
      ${islHead("renewal", "تمدید قراردادها", "تحلیل پوشش‌ها، سناریو و بودجه", true)}
      <div class="krow"><span class="bigk">${fmtInt(all.length)}</span><span class="small muted">گروه فعال<br>${fmtInt(soon90)} تمدید در ۹۰ روز آینده</span></div>
      <div class="hleg"><span><i style="background:var(--good)"></i>زیر ${fmtPct(t)}: سالم</span><span><i style="background:var(--mid)"></i>${fmtPct(t)} تا ۸۵٪: مرزی</span><span><i style="background:var(--bad)"></i>بالای ۸۵٪: زیان‌ده</span></div>
      <div class="hbars2">
        <div class="ln" style="bottom:${(t / top * 100).toFixed(1)}%;border-color:var(--mid)"><span style="color:var(--mid-ink);top:3px">${fmtPct(t)}</span></div>
        <div class="ln" style="bottom:${(0.85 / top * 100).toFixed(1)}%;border-color:var(--bad)"><span style="color:var(--bad)">۸۵٪</span></div>
        ${bars.map(x => { const s = lrStat(x.A.lr); return `<button class="bar" type="button" data-open="${x.i}" title="${esc(x.A.group.name)}: ${fmtPct(x.A.lr)}" aria-label="${esc(x.A.group.name)}: ${fmtPct(x.A.lr)} ${s[1]}"><i style="height:${(x.A.lr / top * 100).toFixed(1)}%;background:${s[2]}"></i></button>`; }).join("")}
      </div>
    </div>
    <div class="isl w2">
      ${islHead("action", "مرکز اقدام", `${fmtInt(todo.length)} پیشنهاد از روی داده‌ها`, false)}
      <div class="donut-row">${donutSVG(CATS.map(([k]) => [nCat(k), DONUT_C[k]]), todo.length)}<div class="dleg">${CATS.map(([k, l]) => `<button type="button" data-cat="${k}"><i style="background:${DONUT_C[k]}"></i>${l}<b>${fmtInt(nCat(k))}</b></button>`).join("")}</div></div>
    </div>
    <div class="isl lst click" data-go="tender" role="link" tabindex="0">
      ${islHead("tender", "مناقصه", "قیمت قرارداد جدید", false)}
      <div class="ilist">${tenders.slice(0, 3).map(x => { const z = RISK[x.R.risk(x.R.priorScaled)[0]]; return `<button class="ili" type="button" data-tender="${x.i}"><span>${esc(short(x.R.group.name))}</span><em class="tag ${z[3]}" title="ریسک قیمت بیمه‌گر قبلی">قبلی: ${z[1]}</em></button>`; }).join("") || '<span class="small muted">مناقصه‌ای نیست.</span>'}</div>
    </div>
    <div class="isl lst click" data-go="reminders" role="link" tabindex="0">
      ${islHead("cal", "تمدیدهای پیش رو", "۹۰ روز آینده", false)}
      ${timelineHTML(soon.filter(x => x.A.renewal.days <= 90))}
    </div>
    <div class="isl w2 ai-i">
      ${islHead("ai", "دستیار هوشمند", "از دادهٔ هر گروه بپرسید؛ جواب با منبع", false)}
      ${pChat.length ? `<div class="hchat" id="homeChat">${pChat.slice(-3).map(m => `<div class="ai-q">${esc(m.q)}</div><div class="ai-a">${portfolioAnswer(m.q)}</div>`).join("")}</div>` : ""}
      <div class="sugs">${(aiPick === "p" ? portfolioSuggest() : all.find(x => x.i === aiPick) ? aiSuggest(all.find(x => x.i === aiPick).A, all.find(x => x.i === aiPick).S) : []).slice(0, 3).map(q => `<button type="button" data-hask="${esc(q)}">${esc(q)}</button>`).join("")}</div>
      <form class="hask" id="homeAsk"><select id="homeAiG" aria-label="دربارهٔ"><option value="p"${aiPick === "p" ? " selected" : ""}>همهٔ گروه‌ها</option>${all.map(x => `<option value="${x.i}"${x.i === aiPick ? " selected" : ""}>${esc(short(x.A.group.name))}</option>`).join("")}</select><input id="homeAiQ" placeholder="مثلاً: بودجه چقدر است؟" aria-label="سؤال"><button type="submit" aria-label="پرسیدن">↑</button></form>
    </div>
    <button class="isl" type="button" data-go="docs">${islHead("docs", "مدارک و قراردادها", "خواندن PDF و عکس بیمه‌نامه", false)}<span class="foot2">${state.contracts.filter(c => !c.sample).length ? `${fmtInt(state.contracts.filter(c => !c.sample).length)} قرارداد خوانده‌شده ←` : "مقایسهٔ دو سال قرارداد ←"}</span></button>
    <button class="isl" type="button" data-go="claims">${islHead("claims", "تحلیل خسارت", "خسارت واقعی ← نرخ و سقف سال بعد", false)}<span class="foot2">${state.claims.length ? `${fmtInt(state.claims.length)} فایل خسارت ←` : "فایل خسارت را بدهید ←"}</span></button>
    <button class="isl" type="button" data-go="settings">${islHead("settings", "قواعد و تنظیمات", "آستانه‌ها و پوشش‌های حمایتی", false)}<span class="foot2">Loss Ratio هدف: ${fmtPct(t)} ←</span></button>
  </div>
  <div class="sec-t"><h2>مدیریت و نقشهٔ راه</h2><span class="small muted">بخش‌هایی که با نسخهٔ آنلاین فعال می‌شوند</span></div>
  <div class="road">
    <button class="isl dim" type="button" data-go="admin"><span class="badge2">پیش‌نمایش</span>${islHead("users", "کاربران و اشتراک‌ها", "فروش اشتراک به کارگزارها", false)}</button>
    <button class="isl dim" type="button" data-go="mapping"><span class="badge2">به‌زودی</span>${islHead("map", "ورود داده و نگاشت", "خواندن هر قالب اکسل", false)}</button>
    <button class="isl dim" type="button" data-go="dadeh"><span class="badge2">به‌زودی</span>${islHead("link", "اتصال داده‌پردازان", "دریافت خودکار داده", false)}</button>
    <button class="isl dim" type="button" data-go="market"><span class="badge2">به‌زودی</span>${islHead("market", "مقایسه با بازار", "در برابر گروه‌های مشابه", false)}</button>
    <button class="isl dim" type="button" data-go="history"><span class="badge2">به‌زودی</span>${islHead("clock", "تاریخچهٔ قراردادها", "سال‌به‌سال هر گروه", false)}</button>
  </div>`;
  $("homeAiG").onchange = e => { state.homeAi = e.target.value === "p" ? "p" : +e.target.value; render(); };
  const dz = $("dropR");
  dz.ondragover = e => { e.preventDefault(); dz.classList.add("over"); };
  dz.ondragleave = () => dz.classList.remove("over");
  dz.ondrop = e => { e.preventDefault(); dz.classList.remove("over"); state.mode = "renewal"; handleFiles([...e.dataTransfer.files]); };
}

/* ---------- chrome ---------- */
const SOON = {
  market: ["مقایسه با بازار", "سرانه و Loss Ratio هر گروه در برابر میانگین ناشناس گروه‌های مشابه همان صنعت. وقتی چند کارگزار به نسخهٔ آنلاین وصل شوند فعال می‌شود."],
  ai: ["دستیار هوشمند", "در این نسخه، دستیار داخل صفحهٔ هر گروه است و از قواعد اپ با ذکر منبع جواب می‌دهد. گفت‌وگوی آزاد با هوش مصنوعی در نسخهٔ آنلاین می‌آید."],
  history: ["تاریخچهٔ قراردادها", "ذخیرهٔ قراردادها و مقایسهٔ سال‌به‌سال هر گروه؛ نیاز به ذخیره‌سازی نسخهٔ آنلاین دارد."],
  mapping: ["ورود داده و نگاشت", "جادوی تطبیق ستون‌های هر فایل اکسل با فیلدهای اپ، تا فایل هر بیمه‌گر بدون تغییر خوانده شود."],
  dadeh: ["اتصال داده‌پردازان", "دریافت مستقیم دادهٔ خسارت از نرم‌افزار داده‌پردازان، با وضعیت اتصال و آخرین همگام‌سازی. آخرین فاز پروژه است."],
};
function renderSidebar(){
  const urgent = state.groups.length ? buildTodo(state.groups.map((g, i) => Object.assign({ i, g }, compute(g)))).filter(t => t.sev === "crit").length : 0;
  const L = window.RI_LICENSE;
  if (L && L.broker) $("brandSub").textContent = L.broker;
  $("bellDot").hidden = $("bellDotM").hidden = !urgent;
  $("bellBtn").setAttribute("aria-label", `${fmtInt(urgent)} کار فوری`);
  $("footLic").textContent = L ? `مجوز: ${L.name}${L.until ? ` · معتبر تا ${L.until} · ${fmtInt(L.days)} روز مانده` : ""}` : "";
}

/* ---------- renewal portfolio ---------- */
function renderRenewal(){
  const all = state.groups.map((g, i) => Object.assign({ i, g }, compute(g)));
  const comp = all.filter(x => x.A.complete && x.A.premiumNow);
  const paidC = sum(comp, x => x.A.totalPaid), premC = sum(comp, x => x.A.premiumNow), plr = premC ? paidC / premC : null;
  const todo = buildTodo(all);
  const SEVW = { crit: 0, ok: 1, warn: 2, info: 3 };
  todo.sort((a, b) => SEVW[a.sev] - SEVW[b.sev] || b.w - a.w);
  const soon90 = all.filter(x => x.A.renewal && x.A.renewal.days >= 0 && x.A.renewal.days <= 90).length;
  const insured = sum(all, x => x.A.insured || 0), prem = sum(all, x => x.A.premiumNow || 0);
  const shown = all.filter(x => match(x.A.group.name));
  const sorters = {
    renewal: (a, b) => (a.A.renewal ? a.A.renewal.days : 1e9) - (b.A.renewal ? b.A.renewal.days : 1e9),
    lr: (a, b) => (b.A.lr ?? -1) - (a.A.lr ?? -1),
    need: (a, b) => (b.S.balanced.premiumChange ?? -1) - (a.S.balanced.premiumChange ?? -1),
    size: (a, b) => (b.A.insured || 0) - (a.A.insured || 0),
  };
  const list = shown.slice().sort((a, b) => (b.g.own ? 1 : 0) - (a.g.own ? 1 : 0) || sorters[state.sort](a, b));
  const counts = A => { const c = {}; A.rows.forEach(r => { c[r.d] = (c[r.d] || 0) + 1; });
    return ["increase", "minor", "reduce", "remove", "protect"].filter(k => c[k]).map(k => `<span class="tag ${DTAG[k]}">${DLABEL[k]} ${fmtInt(c[k])}</span>`).join(" "); };
  const st = lrStat(plr);
  const chartRows = shown.filter(x => x.A.lr != null).sort((a, b) => b.A.lr - a.A.lr);
  const t = state.settings.targetLR / 100, top = 1.2;
  setHead("پرتفوی تمدید", `${fmtInt(all.length)} گروه · ${fmtInt(insured)} نفر`);

  $("view").innerHTML = `
  ${crumb([null, "پرتفوی تمدید"])}
  <div class="ph"><div><span class="date">${todayFa()}</span><h1>پرتفوی تمدید</h1><span class="sub">مبالغ به میلیون تومان · آخرین به‌روزرسانی ${nowFa()}</span></div></div>
  <div class="hero mobile-only"><span class="small" style="color:rgba(255,255,255,.8)">Loss Ratio پرتفوی</span><div style="display:flex;gap:10px;align-items:center"><span class="big">${fmtPct(plr)}</span>${st ? `<span class="tag ${st[0]}">${st[1]}</span>` : ""}</div>
    <div class="hs"><div><span>گروه‌ها</span><b>${fmtInt(all.length)}</b></div><div><span>بیمه‌شدگان</span><b>${fmtInt(insured)}</b></div><div><span>تمدید ۹۰ روز</span><b>${fmtInt(soon90)}</b></div></div></div>
  <div class="kpis desk-only">
    ${kpi("گروه‌ها", fmtInt(all.length), `${fmtInt(soon90)} تمدید در ۹۰ روز آینده`)}
    ${kpi("بیمه‌شدگان", fmtInt(insured), "جمع همهٔ گروه‌ها")}
    ${kpi("حق‌بیمهٔ دورهٔ جاری", fmtNum(prem), "میلیون تومان")}
    ${kpi("Loss Ratio پرتفوی", fmtPct(plr), `از ${fmtInt(comp.length)} گروه با دادهٔ کامل`, { tag: lrTag(plr), lr: plr })}
  </div>
  <section class="panel desk-only anchor" id="ac">
    <div class="panel-h"><h2>مرکز اقدام</h2><span class="small muted">${fmtInt(todo.length)} مورد</span></div>
    <div class="ac">${CATS.map(([k, label]) => { const items = todo.filter(x => catOf(x) === k); const open = state.more[k]; const sh = open ? items : items.slice(0, 2);
      return `<div class="ac-col c-${k}"><div class="ac-h"><span class="d"></span>${label}<span class="n">${fmtInt(items.length)}</span></div>
        ${sh.map(x => `<button class="ac-item" type="button" data-open="${x.i}"><b>${esc(short(x.name))}</b>${esc(x.text)}</button>`).join("") || '<span class="small muted">موردی نیست.</span>'}
        ${items.length > sh.length ? `<button class="ac-more" type="button" data-more="${k}">${fmtInt(items.length - sh.length)} مورد دیگر ←</button>` : ""}</div>`; }).join("")}</div>
  </section>
  <section class="mobile-only" style="display:flex;flex-direction:column;gap:10px" id="acm">
    <div class="fchips" role="group" aria-label="دستهٔ اقدام">${CATS.map(([k, label]) => `<button type="button" data-mcat="${k}" aria-pressed="${state.mcat === k}">${label} ${fmtInt(todo.filter(x => catOf(x) === k).length)}</button>`).join("")}</div>
    <div class="mlist">${todo.filter(x => catOf(x) === state.mcat).slice(0, 6).map(x => `<button class="ac-item c-${state.mcat}" type="button" data-open="${x.i}" style="background:var(--surface)"><b style="color:inherit">${esc(short(x.name))}</b>${esc(x.text)}</button>`).join("") || '<p class="muted">موردی نیست.</p>'}</div>
  </section>
  <section class="panel">
    <div class="panel-h"><h2>Loss Ratio گروه‌ها</h2><span class="small muted">خط‌چین: ${fmtPct(t)} هدف · ۸۵٪ زیان‌ده · روی میله بزنید</span></div>
    <div class="panel-b tw"><div style="min-width:${Math.max(560, chartRows.length * 64)}px">
      <div class="cchart">
        <div class="ref" style="bottom:${(t / top * 100).toFixed(1)}%;border-color:var(--mid)"><span style="color:var(--mid-ink)">${fmtPct(t)}</span></div>
        <div class="ref" style="bottom:${(0.85 / top * 100).toFixed(1)}%;border-color:var(--bad)"><span style="color:var(--bad)">۸۵٪</span></div>
        ${chartRows.map(x => { const s = lrStat(x.A.lr); return `<button class="col" type="button" data-open="${x.i}" aria-label="${esc(x.A.group.name)}: ${fmtPct(x.A.lr)} ${s[1]}"><span class="v" style="color:${s[2]}">${fmtPct(x.A.lr)}</span><span class="b" style="height:${Math.min(100, x.A.lr / top * 100).toFixed(1)}%;background:${s[2]}"></span></button>`; }).join("")}
      </div>
      <div class="cnames">${chartRows.map(x => `<span title="${esc(x.A.group.name)}">${esc(short(x.A.group.name))}</span>`).join("")}</div>
    </div></div>
  </section>
  <section class="panel anchor" id="groups">
    <div class="panel-h"><h2>گروه‌ها</h2><div class="sortseg" role="group" aria-label="مرتب‌سازی">${[["renewal", "نزدیک‌ترین تمدید"], ["lr", "بیشترین Loss Ratio"], ["need", "بیشترین افزایش لازم"], ["size", "بزرگ‌ترین گروه"]].map(([k, l]) => `<button type="button" data-sort="${k}" aria-pressed="${state.sort === k}">${l}</button>`).join("")}</div></div>
    <div class="tw desk-only"><table><thead><tr><th>گروه</th><th>بیمه‌شده</th><th>حق‌بیمه</th><th>Loss Ratio</th><th>تمدید</th><th>خلاصهٔ پیشنهادها</th><th>حق‌بیمهٔ لازم</th><th>بودجهٔ کارفرما</th><th>اطمینان</th></tr></thead><tbody>
      ${list.map(x => { const { A, S } = x, d = A.renewal ? A.renewal.days : null, s = lrStat(A.lr);
        return `<tr class="click" tabindex="0" data-open="${x.i}">
          <td class="nm"><b>${esc(A.group.name)} ${x.g.own ? '<span class="tag t-protect">فایل اکسل شما</span>' : ""}</b><span>${esc([A.group.industry, A.group.province].filter(Boolean).join(" · "))}</span></td>
          <td class="nw">${fmtInt(A.insured)}</td>
          <td class="nw">${fmtNum(A.premiumNow)}<div class="small muted">سرانه ${fmtNum(A.premiumNow && A.insured ? A.premiumNow / A.insured : null)}</div></td>
          <td class="lrcell nw">${s ? `<b style="color:${s[2]}">${fmtPct(A.lr)}</b> · <span class="small" style="color:${s[2]}">${s[1]}</span>${miniLR(A.lr)}` : '<span class="small muted">داده ناقص</span>'}</td>
          <td class="nw" style="${d != null && d <= 30 ? "color:var(--bad);font-weight:700" : d != null && d <= 60 ? "color:var(--mid-ink);font-weight:700" : ""}">${d == null ? "—" : d < 0 ? `${fmtInt(-d)} روز گذشته` : `${fmtInt(d)} روز`}</td>
          <td>${counts(A) || '<span class="small muted">بدون تغییر</span>'}</td>
          <td class="nw">${S.balanced.premiumChange != null ? fmtSignedPct(S.balanced.premiumChange) : `<span class="small muted">خسارت ${fmtSignedPct(S.balanced.change)}</span>`}</td>
          <td class="nw">${fmtSignedPct(S.budgetPct)} ${S.budget.fits ? "" : '<span class="tag t-bad">ناکافی</span>'}</td>
          <td><span class="tag ${LVL[A.level][0]}">${LVL[A.level][1]}</span></td></tr>`; }).join("") || '<tr><td colspan="9" class="muted">گروهی با این نام پیدا نشد.</td></tr>'}
    </tbody></table></div>
    <div class="mlist mobile-only panel-b">${list.map(x => { const { A } = x, s = lrStat(A.lr), d = A.renewal ? A.renewal.days : null;
      return `<button class="mrow" type="button" data-open="${x.i}"><span class="tx"><b>${esc(short(A.group.name))}</b><span>${fmtInt(A.insured)} نفر · ${d == null ? "—" : d < 0 ? `${fmtInt(-d)} روز گذشته` : `${fmtInt(d)} روز`}</span></span><span class="lr" style="color:${s ? s[2] : "var(--ink3)"}">${s ? fmtPct(A.lr) : "—"}<div class="small">${s ? s[1] : "ناقص"}</div></span></button>`; }).join("")}</div>
  </section>`;
}

/* ---------- group page ---------- */
function renderGroup(i){
  const g = state.groups[i]; if (!g){ state.page = "renewal"; return render(); }
  const { A, S } = compute(g), G = A.group, key = "g" + i;
  const st = lrStat(A.lr ?? A.priorLr), d = A.renewal ? A.renewal.days : null;
  const B = S.budget, nIss = A.issues.filter(x => x.sev !== "info").length;
  setHead(short(G.name), "صفحهٔ گروه");
  const rows = A.rows.slice().sort((a, b) => ORDER[a.d] - ORDER[b.d] || b.paid - a.paid);
  const scnRows = SCN.map(([k, label, desc]) => { const s = S[k], fits = s.paid <= B.allowed + 1e-9;
    return `<tr class="${k === "balanced" ? "hl" : ""}"><td class="nm wrapsub"><b>${label} ${k === "balanced" ? '<span class="tag t-good">پیشنهاد اصلی</span>' : ""}</b><span>${desc}</span></td>
      <td class="nw">${fmtNum(s.paid)}</td><td class="nw"><b>${fmtSignedPct(s.change)}</b></td>
      <td><div style="display:flex;gap:8px;align-items:center"><div class="prog" style="flex:1"><i style="width:${(s.cover * 100).toFixed(1)}%"></i></div><span class="nw small">${fmtPct(s.cover)}</span></div></td>
      <td class="nw">${s.premiumNeeded != null ? fmtNum(s.premiumNeeded) : "—"}</td><td class="nw"><b>${s.premiumChange != null ? fmtSignedPct(s.premiumChange) : "—"}</b></td>
      <td><span class="tag ${fits ? "t-good" : "t-bad"}">${fits ? "در بودجه" : "بیش از بودجه"}</span></td></tr>`; }).join("");
  const budgetText = !B.fits ? `با بودجهٔ ${fmtSignedPct(S.budgetPct)} حتی سقف‌های فعلی پوشش داده نمی‌شوند؛ کسری حدود ${fmtNum(B.paid - B.allowed)}.`
    : B.picked.length ? `با این بودجه ${B.picked.join(" و ")} جا می‌شوند${B.skipped.length ? `؛ ${B.skipped.join(" و ")} نه` : ""}.` : "با این بودجه هیچ افزایشی جا نمی‌شود.";
  const capRows = A.rows.map((r, ri) => `<tr><td><b>${esc(r.cv.name)}</b></td>${["current", "economy", "balanced", "premium"].map(k => { const c = S[k].caps[ri];
    if (c.removed) return '<td><span class="tag t-remove">حذف</span></td>';
    const ch = k !== "current" && (c.annual !== r.cv.annualCap || c.perCase !== r.cv.perCase);
    return `<td class="nw"${ch ? ' style="font-weight:800;color:var(--brand)"' : ""}>${fmtNum(c.annual)}${c.perCase != null && c.perCase !== c.annual ? `<div class="small muted">هر مورد ${fmtNum(c.perCase)}</div>` : ""}</td>`; }).join("")}</tr>`).join("");
  const covCards = rows.map(r => { const cv = r.cv, col = DCOLOR[r.d];
    const capLine = (label, o, n) => o == null ? "" : `<span>${label}: ${n !== o && r.d !== "remove" ? `<s>${fmtNum(o)}</s> ← <span class="new" style="color:${col}">${fmtNum(n)}</span>` : `<b>${fmtNum(o)}</b>`}</span>`;
    return `<div class="card cov"><div class="cov-h"><div><b>${esc(cv.name)}</b><div class="meta"><span class="ltr">${esc(cv.id)}</span> · ${r.protect ? "حمایتی" : "روزمره"}</div></div><span class="tag ${DTAG[r.d]}">${DLABEL[r.d]}</span></div>
      <div class="stats"><div><span>خسارت / نفر</span><b>${fmtInt(r.n)} / ${fmtInt(r.users)}</b></div><div><span>پرداختی</span><b>${fmtNum(r.paid)}</b></div><div><span>فشار سقف</span><b style="color:${col}">${r.capUnpaid ? fmtPct(r.pressure) : "—"}</b></div></div>
      <div class="share"><div class="prog"><i style="width:${Math.max(1, r.paidShare * 100).toFixed(1)}%;background:${col}"></i></div><span>سهم از کل خسارت ${fmtPct(r.paidShare)}${r.util != null && A.complete ? ` · استفاده ${fmtPct(r.util)} از افراد` : ""}</span></div>
      <div class="capbox">${r.d === "remove" ? `<span class="new" style="color:var(--rem)">حذف از بیمه‌نامه</span>` : ""}${capLine("سالانه", cv.annualCap, r.newAnnual)}${capLine("هر مورد", cv.perCase, r.newPerCase)}${cv.min != null || cv.max != null ? `<span class="small muted">بازهٔ مجاز ${fmtNum(cv.min)} تا ${fmtNum(cv.max)}</span>` : ""}</div>
      <div class="why"><b>${esc(r.why[0] || "")}</b>${r.why.slice(1).concat(r.notes).map(w => `<span>${esc(w)}</span>`).join("")}</div></div>`; }).join("");

  $("view").innerHTML = `
  ${crumb(["renewal", "پرتفوی تمدید"], [null, esc(short(G.name))])}
  <div class="ph"><div style="display:flex;flex-direction:column;gap:6px">
      <div class="hchips"><h1>${esc(G.name)}</h1>${d != null ? `<span class="tag ${d < 0 || d <= 30 ? "t-bad" : d <= 60 ? "t-mid" : "t-line"}">${d < 0 ? `${fmtInt(-d)} روز از پایان قرارداد گذشته` : `تمدید ${fmtInt(d)} روز دیگر`}</span>` : ""}<span class="tag ${LVL[A.level][0]}">اطمینان داده: ${LVL[A.level][1]}</span>${g.own ? '<span class="tag t-protect">فایل اکسل شما</span>' : ""}</div>
      <div class="infoline">${[G.industry, G.province, G.period && `دوره ${G.period}`, G.id && `کد ${G.id}`, g.file].filter(Boolean).map(x => `<span>${esc(x)}</span>`).join("")}</div></div>
    <div class="actions"><button class="btn danger" type="button" id="removeBtn">حذف این گروه</button><button class="btn" type="button" id="letterBtn">نامهٔ پیشنهاد تمدید</button>${inFrame ? "" : '<button class="btn primary" type="button" id="pdfBtn">گزارش PDF</button>'}</div></div>
  ${ptabs([["g-sum", "خلاصه"], ["g-scn", "سناریوها"], ["g-caps", "جدول سقف‌ها"], ["g-cov", "پوشش‌ها"], ["g-dq", "کیفیت داده", nIss], ["g-ai", "دستیار"]])}
  <div class="with-ai"><div class="colmain">
    <div class="kpis anchor" id="g-sum">
      ${kpi("بیمه‌شدگان", fmtInt(A.insured), G.parts ? `اصلی ${fmtInt(G.parts[0])} · وابسته ${fmtInt(G.parts[1] + G.parts[2] + G.parts[3])}` : "")}
      ${kpi("حق‌بیمهٔ دورهٔ جاری", fmtNum(A.premiumNow), `سرانه ${fmtNum(A.premiumNow && A.insured ? A.premiumNow / A.insured : null)}`)}
      ${kpi("خسارت پرداختی", fmtNum(A.totalPaid), `${fmtInt(A.claimsCount)} خسارت · پرداخت‌نشده ${fmtNum(A.totalUnpaid)}`)}
      ${kpi("Loss Ratio", fmtPct(A.lr ?? A.priorLr), A.lr != null ? (A.priorLr != null ? `${A.prior.label}: ${fmtPct(A.priorLr)} · روند تعرفه ${fmtPct(A.trend)}` : "") : `از ${A.prior ? A.prior.label : "—"}؛ دادهٔ امسال ناقص`, { tag: st ? `<span class="tag ${st[0]}">${st[1]}</span>` : "", lr: A.lr ?? A.priorLr, subColor: A.lr == null ? "var(--mid-ink)" : null })}
    </div>
    <section class="panel anchor" id="g-scn">
      <div class="panel-h"><h2>سناریوهای تمدید</h2><div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap"><span class="small nw">بودجهٔ کارفرما (٪)</span>${stepper("budgetIn", Math.round(S.budgetPct * 100), 5)}<span class="small muted">${A.complete ? `سقف خسارت مجاز با Loss Ratio هدف ${fmtPct(A.targetLR)}: <b>${fmtNum(B.allowed)}</b>` : `دادهٔ ناقص؛ سقف رشد خسارت: <b>${fmtNum(B.allowed)}</b>`}</span></div></div>
      <div class="tw"><table style="min-width:700px"><thead><tr><th>سناریو</th><th>خسارت برآوردی</th><th>تغییر نسبت به امسال</th><th>پوشش نیاز کارکنان</th><th>حق‌بیمهٔ لازم</th><th>تغییر حق‌بیمه</th><th>بودجه</th></tr></thead><tbody>${scnRows}</tbody></table></div>
      <div class="panel-b" style="display:flex;flex-direction:column;gap:8px"><p class="small muted">مبنای مقایسه: اگر سقف‌ها همین بمانند، خسارت برآوردی ${fmtNum(S.current.paid)} و تغییر حق‌بیمهٔ لازم ${S.current.premiumChange != null ? fmtSignedPct(S.current.premiumChange) : "—"} است.</p><p class="sumline">${esc(budgetText)}</p></div>
    </section>
    <section class="panel anchor" id="g-caps">
      <div class="panel-h"><h2>جدول سقف‌ها <span class="small muted">برگهٔ مذاکره</span></h2><span class="small muted">سقف سالانه در هر سناریو؛ تغییرها پررنگ</span></div>
      <div class="tw"><table style="min-width:620px"><thead><tr><th>پوشش</th><th>فعلی (امسال)</th><th>اقتصادی</th><th>متعادل</th><th>ممتاز</th></tr></thead><tbody>${capRows}</tbody></table></div>
    </section>
    <section class="anchor" id="g-cov" style="display:flex;flex-direction:column;gap:12px">
      <div class="ph"><h2>پوشش‌ها</h2><div class="hchips">${Object.keys(DLABEL).map(k => `<span class="tag ${DTAG[k]}">${DLABEL[k]}</span>`).join("")}</div></div>
      <div class="covs">${covCards}</div>
    </section>
    <section class="panel anchor" id="g-dq"><div class="panel-h"><h2>کیفیت داده</h2><span class="small muted">${fmtInt(A.issues.length)} مورد</span></div><div class="panel-b">${dqList(A.issues)}</div></section>
  </div>
  ${assistant(key, A, S, g)}
  </div>`;
  bindStepper("budgetIn", v => { g.budget = Math.max(0, v) / 100; render(); });
  $("removeBtn").onclick = () => { state.groups.splice(i, 1); if (!state.groups.length) setGroups(sampleGroups()); go("renewal"); };
  $("letterBtn").onclick = () => openLetter(A, S, g);
  if ($("pdfBtn")) $("pdfBtn").onclick = () => window.print();
}

/* ---------- assistant (rule-based, with sources) ---------- */
const VERB = { increase: "باید سقفش بالا برود", minor: "افزایش جزئی می‌گیرد", reduce: "کاهش سقف می‌گیرد", remove: "کاندید حذف است", protect: "حذف نمی‌شود", keep: "تغییر نمی‌کند" };
/* ---------- letter ---------- */
function openLetter(A, S, g){
  const G = A.group, b = S.balanced, B = S.budget;
  const ch = A.rows.filter(r => r.d !== "keep" && r.d !== "protect").map(r => r.d === "remove" ? `- ${r.cv.name}: حذف از بیمه‌نامه (${r.why[0]})`
    : `- ${r.cv.name}: سقف سالانه از ${fmtNum(r.cv.annualCap)} به ${fmtNum(r.newAnnual)}${r.newPerCase !== r.cv.perCase ? ` و سقف هر مورد از ${fmtNum(r.cv.perCase)} به ${fmtNum(r.newPerCase)}` : ""} (${r.why[0]})`);
  const kept = A.rows.filter(r => r.d === "protect").map(r => r.cv.name);
  const txt = `به نام خدا

مدیر محترم منابع انسانی ${short(G.name)}
موضوع: پیشنهاد تمدید قرارداد بیمهٔ درمان تکمیلی

با سلام و احترام،
بر اساس تحلیل ${fmtInt(A.claimsCount)} خسارت ثبت‌شده در دورهٔ جاری${A.lr != null ? ` (Loss Ratio ${fmtPct(A.lr)})` : ""} و پیش‌بینی ${fmtPct(A.trend)} رشد تعرفهٔ درمان در سال آینده، پیشنهاد ما برای قرارداد جدید به شرح زیر است:

${ch.join("\n") || "- سقف‌های فعلی کافی است و تغییری پیشنهاد نمی‌شود."}
${kept.length ? `\nپوشش‌های حمایتی (${kept.join("، ")}) با وجود مصرف کم حفظ می‌شوند.\n` : ""}
با اجرای این پیشنهاد (سناریوی متعادل)، سهم کارکنان از هزینهٔ درمان از ${fmtPct(1 - S.current.cover)} به ${fmtPct(1 - b.cover)} کاهش می‌یابد و تغییر حق‌بیمهٔ برآوردی ${b.premiumChange != null ? fmtSignedPct(b.premiumChange) : "—"} است.
${B.fits ? (B.picked.length ? `در صورت محدود بودن بودجه به ${fmtPct(S.budgetPct)}، اولویت با ${B.picked.join(" و ")} است${B.skipped.length ? ` و ${B.skipped.join(" و ")} به سال بعد موکول می‌شود` : ""}.` : "") : `توجه: بودجهٔ ${fmtPct(S.budgetPct)} حتی برای حفظ شرایط فعلی کافی نیست و افزایش حدود ${fmtSignedPct(S.current.premiumChange)} لازم است.`}

ارقام بالا برآورد تحلیلی است و نرخ نهایی پس از استعلام از بیمه‌گر اعلام می‌شود.

با تشکر،
[نام کارگزاری]
[نام و امضا]`;
  $("modal").innerHTML = `<div class="box" role="dialog" aria-modal="true" aria-labelledby="mt"><div class="panel-h"><h2 id="mt">نامهٔ پیشنهاد تمدید</h2><button class="btn" type="button" data-close>بستن</button></div>
    <div class="panel-b" style="display:flex;flex-direction:column;gap:10px;overflow:auto"><textarea id="letterTxt" readonly>${esc(txt)}</textarea>
    <div class="actions"><button class="btn primary" type="button" id="copyLetter">کپی متن</button><span class="small muted" id="copyMsg"></span></div></div></div>`;
  $("modal").hidden = false;
  $("copyLetter").onclick = () => { const t = $("letterTxt");
    navigator.clipboard && navigator.clipboard.writeText(t.value).then(() => { $("copyMsg").textContent = "کپی شد."; }, () => { t.select(); $("copyMsg").textContent = "متن انتخاب شد؛ کپی کنید."; })
    || (t.select(), $("copyMsg").textContent = "متن انتخاب شد؛ کپی کنید."); };
}

/* ---------- tenders ---------- */
function renderTenderList(){
  const all = state.tenders.map((t, i) => ({ i, t, R: computeTender(t) })), shown = all.filter(x => match(x.R.group.name));
  setHead("مناقصه و قرارداد جدید", `${fmtInt(all.length)} مناقصه`);
  $("view").innerHTML = `
  ${crumb([null, "مناقصه‌ها"])}
  <div class="ph"><div><span class="date">${todayFa()}</span><h1>مناقصه و قرارداد جدید</h1><span class="sub">قیمت‌گذاری با Loss Ratio هدف ${fmtPct(state.settings.targetLR / 100)} · مبالغ به میلیون تومان</span></div></div>
  <div class="kpis">
    ${kpi("مناقصه‌ها", fmtInt(all.length), "سابقهٔ ۱ تا ۲ ساله")}
    ${kpi("بیمه‌شدگان", fmtInt(sum(all, x => x.R.insuredNext)), "قراردادهای جدید")}
    ${kpi("خسارت برآوردی", fmtNum(sum(all, x => x.R.expected)), "سال قرارداد")}
    ${kpi("قیمت پیشنهادی", fmtNum(sum(all, x => x.R.price)), "جمع همهٔ مناقصه‌ها", { accent: true })}
  </div>
  <section class="panel"><div class="panel-h"><h2>قیمت چطور ساخته می‌شود</h2></div><div class="panel-b steps">
    ${[["هزینهٔ سرانهٔ هر پوشش در هر سال سابقه، با بیمه‌گرهای قبلی", ""], ["آوردن هر سال به قیمت سال قرارداد با تورم تعرفه؛ سال جدیدتر وزن بیشتر", ""], ["ضرب در نفرات قرارداد جدید = خسارت برآوردی", ""], [`÷ ${fmtPct(state.settings.targetLR / 100)} = کف قیمت؛ + حاشیهٔ اطمینان = قیمت پیشنهادی`, ""]].map(([t], k) => `<div class="step"><span class="sn">${fmtInt(k + 1)}</span><span>${t}</span><span></span></div>`).join("")}
  </div></section>
  <section class="panel"><div class="panel-h"><h2>مناقصه‌ها</h2></div>
    <div class="tw"><table style="min-width:900px"><thead><tr><th>مناقصه</th><th>نفرات</th><th>سابقه</th><th>Loss Ratio بیمه‌گر قبلی</th><th>خسارت برآوردی</th><th>قیمت پیشنهادی</th><th>سرانه</th><th>در برابر قیمت قبلی</th><th>اطمینان</th></tr></thead><tbody>
    ${shown.map(({ i, R }) => { const h = R.hist[R.hist.length - 1], vs = R.priorScaled ? R.price / R.priorScaled - 1 : null, s = lrStat(h.lr);
      return `<tr class="click" tabindex="0" data-open="${i}"><td class="nm"><b>${esc(R.group.name)}</b><span>${esc([R.group.industry, R.group.province].filter(Boolean).join(" · "))}</span></td>
        <td class="nw">${fmtInt(R.insuredNext)}</td><td class="nw">${R.hist.map(x => fmtInt(x.year).replace(/٬/g, "")).join("، ")}</td>
        <td class="lrcell nw">${s ? `<b style="color:${s[2]}">${fmtPct(h.lr)}</b> · <span class="small" style="color:${s[2]}">${s[1]}</span>${miniLR(h.lr)}` : "—"}</td>
        <td class="nw">${fmtNum(R.expected)}</td><td class="nw"><b>${fmtNum(R.price)}</b></td><td class="nw">${fmtNum(R.price / R.insuredNext)}</td>
        <td class="nw" style="color:${vs == null ? "inherit" : vs > 0 ? "var(--mid-ink)" : "var(--good)"};font-weight:700">${vs == null ? "—" : fmtSignedPct(vs)}</td>
        <td><span class="tag ${LVL[R.level][0]}">${LVL[R.level][1]}</span></td></tr>`; }).join("")}
    </tbody></table></div></section>`;
}

function renderTender(i){
  const t = state.tenders[i]; if (!t){ state.page = "tender"; return render(); }
  const R = computeTender(t), G = R.group, n = R.n, last = R.hist[R.hist.length - 1];
  const bid = t.bid != null ? t.bid : Math.ceil(R.price / 10) * 10;
  setHead(short(G.name), "قیمت مناقصه");
  const pcTr = R.years.map((Y, k) => sum(R.rows, r => r.per[k].pcTrended));
  const w = n === 1 ? [1] : n === 2 ? [0.4, 0.6] : [0.2, 0.3, 0.5];
  const step = Math.pow(10, Math.floor(Math.log10(R.price))) / 2;
  const lo = Math.floor(Math.min(R.priorScaled || Infinity, R.floor85 * 0.85) / step) * step, hi = Math.ceil(Math.max(R.price * 1.12, R.priorScaled || 0) / step) * step;
  const pos = v => ((v - lo) / (hi - lo) * 100).toFixed(2);
  const p85 = pos(R.floor85), p75 = pos(R.floor);
  const zg = `linear-gradient(to left, var(--bad) 0%, var(--bad) ${p85}%, var(--mid) ${p85}%, var(--mid) ${p75}%, var(--good) ${p75}%, var(--good) 100%)`;
  const marks = [[R.priorScaled, "بیمه‌گر قبلی"], [R.floor, "کف"], [R.price, "پیشنهادی"]].filter(([v]) => v && v >= lo && v <= hi);
  const refs = [["کف قیمت", R.floor], ["قیمت پیشنهادی", R.price], R.priorScaled ? ["قیمت بیمه‌گر قبلی", R.priorScaled] : null, R.priorScaled ? ["قیمت قبلی + ۵٪", R.priorScaled * 1.05] : null].filter(Boolean);
  const rows = R.rows.slice().sort((a, b) => b.projPc - a.projPc), totalPc = sum(rows, r => r.projPc) || 1;
  const nIss = R.issues.filter(x => x.sev !== "info").length;
  const M = Math.max(...pcTr, R.expected / R.insuredNext, bid / R.insuredNext) * 1.1;
  const hb = (label, v, color) => `<div class="hbar"><span>${label}</span><span class="t"><i style="width:${(v / M * 100).toFixed(1)}%;background:${color}"></i></span><b class="nw">${fmtNum(v)}</b></div>`;
  const msgs = () => { const out = [];
    if (R.priorScaled && R.priorScaled < R.floor) out.push(`<p class="msg-bad">بیمه‌گر قبلی با این قیمت ضرر کرده (Loss Ratio ${fmtPct(last.lr)}). اگر قیمت او را تکرار کنید، Loss Ratio شما ${fmtPct(R.expected / R.priorScaled)} می‌شود.</p>`);
    if (R.priorScaled && R.price < R.priorScaled) out.push(`<p class="msg-good">می‌توانید ${fmtPct(1 - R.price / R.priorScaled)} ارزان‌تر از بیمه‌گر قبلی پیشنهاد بدهید و هنوز زیر ${fmtPct(R.LR)} بمانید.</p>`);
    else out.push(`<p class="msg-good">با قیمت پیشنهادی ${fmtNum(R.price)}، Loss Ratio مورد انتظار ${fmtPct(R.expected / R.price)} است؛ ${fmtPct(R.margin)} حاشیه برای نوسان خسارت.</p>`);
    return out.join(""); };

  $("view").innerHTML = `
  ${crumb(["tender", "مناقصه‌ها"], [null, esc(short(G.name))])}
  <div class="ph"><div style="display:flex;flex-direction:column;gap:6px"><div class="hchips"><h1>${esc(G.name)}</h1><span class="tag t-line">${fmtInt(n)} سال سابقه</span><span class="tag ${LVL[R.level][0]}">اطمینان داده: ${LVL[R.level][1]}</span></div>
    <div class="infoline">${[G.industry, G.province, `سابقه: ${R.hist.map(h => fmtInt(h.year).replace(/٬/g, "")).join(" و ")}`, `نفرات قرارداد جدید: ${fmtInt(R.insuredNext)}`].filter(Boolean).map(x => `<span>${esc(x)}</span>`).join("")}</div></div>
    <div class="actions"><button class="btn danger" type="button" id="removeBtn">حذف این مناقصه</button></div></div>
  ${ptabs([["t-sum", "خلاصه"], ["t-bid", "قیمت شما"], ["t-hist", "سابقه"], ["t-cov", "پوشش‌ها"], ["t-dq", "کیفیت داده", nIss], ["t-ai", "دستیار"]])}
  <div class="kpis anchor" id="t-sum">
    ${kpi("خسارت برآوردی سال قرارداد", fmtNum(R.expected), `سرانه ${fmtNum(R.expected / R.insuredNext)}`)}
    ${kpi("کف قیمت", fmtNum(R.floor), `زیر این، Loss Ratio بالای ${fmtPct(R.LR)}`)}
    ${kpi("قیمت پیشنهادی", fmtNum(R.price), `سرانه ${fmtNum(R.price / R.insuredNext)} · حاشیه ${fmtPct(R.margin)}`, { accent: true })}
    ${kpi("بیمه‌گر قبلی", R.priorScaled ? fmtNum(R.priorScaled) : "—", last.lr != null ? `Loss Ratio سال آخر ${fmtPct(last.lr)}` : "حق‌بیمه وارد نشده", { tag: lrTag(last.lr), subColor: last.lr != null ? lrStat(last.lr)[2] : null })}
  </div>
  <section class="panel anchor" id="t-bid">
    <div class="panel-h"><h2>قیمت شما در مناقصه</h2><span class="small muted">عدد یا نوار را تغییر دهید؛ ریسک زنده حساب می‌شود</span></div>
    <div class="panel-b" style="display:flex;flex-direction:column;gap:16px">
      <div class="bidrow">
        <label class="bidin" for="bidIn"><span class="small muted">قیمت پیشنهادی شما (کل، میلیون تومان)</span><input id="bidIn" type="number" step="10" min="0" value="${bid}" inputmode="numeric"></label>
        <div class="live" id="liveLR"><span>Loss Ratio مورد انتظار</span><b></b></div>
        <div class="live" id="liveRisk"><span>ریسک قیمت</span><b></b></div>
      </div>
      <div class="zone" style="--zg:${zg}">
        ${marks.map(([v, l]) => `<span class="mk" style="inset-inline-start:${pos(v)}%"><span>${l}</span></span>`).join("")}
        <input type="range" id="bidRange" min="${lo}" max="${hi}" step="10" value="${Math.min(hi, Math.max(lo, bid))}" aria-label="قیمت پیشنهادی">
        <div class="ax"><span>${fmtNum(lo)}</span><span>${fmtNum(hi)}</span></div>
      </div>
      <div class="zlegend"><span><i style="background:var(--bad)"></i>ریسک زیاد: زیر ${fmtNum(R.floor85)}</span><span><i style="background:var(--mid)"></i>متوسط: ${fmtNum(R.floor85)} تا ${fmtNum(R.floor)}</span><span><i style="background:var(--good)"></i>کم: بالای ${fmtNum(R.floor)}</span><span class="plain">LR = ${fmtNum(R.expected)} ÷ قیمت</span></div>
      <div class="tw"><table><thead><tr><th>قیمت مرجع</th><th>مبلغ</th><th class="desk-only">سرانه</th><th>LR</th><th>ریسک</th></tr></thead><tbody>
        ${refs.map(([k, v]) => { const z = RISK[R.risk(v)[0]]; return `<tr><td>${k}</td><td class="nw">${fmtNum(v)}</td><td class="nw desk-only">${fmtNum(v / R.insuredNext)}</td><td class="nw">${fmtPct(R.expected / v)}</td><td><span class="tag ${z[3]}">ریسک ${z[1]}</span></td></tr>`; }).join("")}
      </tbody></table></div>
      ${msgs()}
      <div style="display:flex;flex-wrap:wrap;gap:10px;align-items:center"><span class="nw">حاشیهٔ اطمینان</span><span class="tag ${t.margin == null ? "t-good" : "t-line"}">${t.margin == null ? "خودکار" : "دستی"}</span>${stepper("marginIn", Math.round(R.margin * 100), 1)}<span class="small muted">${t.margin == null ? `بر اساس نوسان سابقه ${fmtPct(R.vol)}${n === 1 ? "، فقط یک سال سابقه" : ""}${R.claimsLast < 300 ? "، دادهٔ کم" : ""}` : ""}</span></div>
    </div>
  </section>
  <section class="panel"><div class="panel-h"><h2>قیمت چطور ساخته می‌شود</h2></div><div class="panel-b steps">
    <div class="step"><span class="sn">۱</span><span>هزینهٔ سرانه در سال‌های سابقه</span><span class="sv plain">${R.hist.map(h => fmtNum(h.pc)).join(" · ")}</span></div>
    <div class="step"><span class="sn">۲</span><span>به قیمت سال قرارداد (تورم ${fmtPct(R.trend)}) و میانگین وزنی (${w.map(x => fmtPct(x)).join(" / ")})</span><span class="sv plain">${pcTr.map(v => fmtNum(v)).join(" · ")} ← ${fmtNum(R.expected / R.insuredNext)}</span></div>
    <div class="step"><span class="sn">۳</span><span>× ${fmtInt(R.insuredNext)} نفر = خسارت برآوردی</span><span class="sv plain">${fmtNum(R.expected)}</span></div>
    <div class="step"><span class="sn">۴</span><span>÷ ${fmtPct(R.LR)} = کف قیمت؛ × (۱ + ${fmtPct(R.margin)}) = قیمت پیشنهادی</span><span class="sv plain">${fmtNum(R.floor)} ← ${fmtNum(R.price)}</span></div>
  </div></section>
  <section class="panel anchor" id="t-hist"><div class="panel-h"><h2>سابقه با بیمه‌گرهای قبلی</h2><span class="small muted">هزینهٔ سرانه به قیمت سال قرارداد</span></div>
    <div class="panel-b hbars">${R.hist.map((h, k) => hb(`هزینهٔ سرانهٔ ${fmtInt(h.year).replace(/٬/g, "")}`, pcTr[k], "var(--keep)")).join("")}${hb("هزینهٔ سرانهٔ سال قرارداد", R.expected / R.insuredNext, "var(--brand)")}${hb("حق‌بیمهٔ سرانهٔ پیشنهادی شما", bid / R.insuredNext, "var(--good)")}</div>
    <div class="tw"><table style="min-width:760px"><thead><tr><th>سال</th><th>نفرات</th><th>خسارت پرداختی</th><th>سرانه</th><th>سرانه به قیمت سال قرارداد</th><th>وزن</th><th>حق‌بیمهٔ بیمه‌گر قبلی</th><th>Loss Ratio</th></tr></thead><tbody>
      ${R.hist.map((h, k) => { const s = lrStat(h.lr); return `<tr><td><b>${fmtInt(h.year).replace(/٬/g, "")}</b></td><td class="nw">${fmtInt(h.insured)}</td><td class="nw">${fmtNum(h.paid)}</td><td class="nw">${fmtNum(h.pc)}</td><td class="nw">${fmtNum(pcTr[k])}</td><td class="nw">${fmtPct(w[k])}</td><td class="nw">${fmtNum(h.premium)}</td><td class="nw">${s ? `<b style="color:${s[2]}">${fmtPct(h.lr)}</b> · <span class="small" style="color:${s[2]}">${s[1]}</span>` : "—"}</td></tr>`; }).join("")}
      <tr class="hl"><td><b>سال قرارداد</b></td><td class="nw">${fmtInt(R.insuredNext)}</td><td class="nw"><b>${fmtNum(R.expected)}</b></td><td colspan="2" class="nw"><b>${fmtNum(R.expected / R.insuredNext)}</b> (میانگین وزنی)</td><td></td><td class="nw"><b>${fmtNum(R.price)}</b></td><td class="nw">${fmtPct(R.expected / R.price)}</td></tr>
    </tbody></table></div></section>
  <section class="panel anchor" id="t-cov"><div class="panel-h"><h2>هر پوشش: مصرف و پیشنهاد</h2><div class="hchips">${Object.keys(TLABEL).map(k => `<span class="tag ${TTAG[k]}">${TLABEL[k]}</span>`).join("")}</div></div>
    <div class="tw"><table style="min-width:900px"><thead><tr><th>پوشش</th>${R.years.map(Y => `<th>سرانه ${fmtInt(Y.year).replace(/٬/g, "")}</th>`).join("")}<th>رشد</th><th>سرانهٔ برآوردی</th><th>سهم</th><th>سقف قبلی ← جدید</th><th>یافته</th></tr></thead><tbody>
    ${rows.map(r => `<tr><td class="nm"><b>${esc(r.cv.name)}</b><span>${r.protect ? "حمایتی" : "روزمره"}</span></td>${r.per.map(p => `<td class="nw">${fmtNum(p.pc)}</td>`).join("")}
      <td class="nw"${r.growth != null && r.growth > R.trend + 0.15 ? ' style="color:var(--mid-ink);font-weight:700"' : ""}>${r.growth != null ? fmtSignedPct(r.growth) : "—"}</td><td class="nw"><b>${fmtNum(r.projPc)}</b></td><td class="nw">${fmtPct(r.projPc / totalPc)}</td>
      <td class="nw">${fmtNum(r.oldCap)} ← <b>${fmtNum(r.cv.annualCap)}</b></td>
      <td style="min-width:260px"><span class="tag ${TTAG[r.d]}">${TLABEL[r.d]}</span><div class="small muted" style="margin-top:4px;line-height:1.7">${esc(r.why)}${r.capCost ? ` هزینهٔ تقریبی: ${fmtNum(r.capCost)} حق‌بیمه.` : ""}</div></td></tr>`).join("")}
    </tbody></table></div></section>
  <section class="panel anchor" id="t-dq"><div class="panel-h"><h2>کیفیت داده</h2></div><div class="panel-b">${dqList(R.issues)}</div></section>
  ${chatPanel("t" + i, "t-ai", tenderSuggest(R), q => tenderAnswer(q, R, t), "مثلاً: اگر ۴۵۰۰۰ پیشنهاد بدهیم؟")}
  <div class="mbar"><button class="btn primary" type="button" id="saveBid">ثبت این قیمت</button></div>`;

  const setLive = v => {
    const z = RISK[R.risk(v)[0]];
    $("liveLR").className = "live " + z[0]; $("liveLR").querySelector("b").textContent = v > 0 ? fmtPct(R.expected / v) : "—";
    $("liveRisk").className = "live " + z[0]; $("liveRisk").querySelector("b").textContent = z[1];
    $("bidRange").style.setProperty("--zc", z[2]);
  };
  setLive(bid);
  $("bidIn").oninput = e => { const v = parseFloat(e.target.value); if (v > 0){ setLive(v); $("bidRange").value = Math.min(hi, Math.max(lo, v)); } };
  $("bidIn").onchange = e => { const v = parseFloat(e.target.value); if (v > 0){ t.bid = v; render(); } };
  $("bidRange").oninput = e => { const v = +e.target.value; $("bidIn").value = v; setLive(v); };
  $("bidRange").onchange = e => { t.bid = +e.target.value; render(); };
  bindStepper("marginIn", v => { t.margin = Math.max(0, v) / 100; t.bid = null; render(); });
  $("removeBtn").onclick = () => { state.tenders.splice(i, 1); if (!state.tenders.length) state.tenders = makeTenders(); go("tender"); };
  $("saveBid").onclick = () => { t.bid = parseFloat($("bidIn").value) || bid; $("saveBid").textContent = "قیمت ثبت شد ✓"; };
}

/* ---------- other pages ---------- */
function renderSettings(){
  setHead("قواعد تحلیل", "تنظیمات");
  const names = [...new Set(state.groups.concat(state.tenders).flatMap(g => g.data.coverages.map(c => c.name)))];
  const F = [["sPressure", "pressureHigh", "فشار سقف برای «افزایش سقف» (٪)"], ["sMinor", "pressureMinor", "فشار سقف برای «افزایش جزئی» (٪)"], ["sLowUtil", "lowUtil", "مصرف کم: استفاده‌کنندگان کمتر از (٪ افراد)"],
    ["sLowClaim", "lowClaim", "دادهٔ ناقص: سهم تعداد خسارت کمتر از (٪)"], ["sLowPaid", "lowPaid", "دادهٔ ناقص: سهم مبلغ خسارت کمتر از (٪)"], ["sTarget", "targetLR", "Loss Ratio هدف (٪)"]];
  $("view").innerHTML = `${crumb([null, "قواعد تحلیل"])}<div class="ph"><div><h1>قواعد تحلیل</h1><span class="sub">هر تغییر همان لحظه روی همهٔ گروه‌ها و مناقصه‌ها اعمال می‌شود.</span></div></div>
  <section class="panel"><div class="panel-h"><h2>آستانه‌ها</h2></div><div class="panel-b form">${F.map(([id, k, l]) => `<label class="field" for="${id}">${l}<input type="number" id="${id}" data-k="${k}" value="${state.settings[k]}" step="0.5"></label>`).join("")}</div></section>
  <section class="panel"><div class="panel-h"><h2>پوشش‌های حمایتی</h2><span class="small muted">هرگز پیشنهاد حذف یا کاهش نمی‌گیرند</span></div><div class="panel-b checks">${names.map((n, k) => `<label for="p${k}"><input type="checkbox" id="p${k}" data-name="${esc(n)}" ${state.protectNames.has(n) ? "checked" : ""}>${esc(n)}</label>`).join("")}</div></section>`;
  $("view").querySelectorAll("input[data-k]").forEach(el => el.onchange = () => { const v = parseFloat(el.value); if (!isNaN(v)){ state.settings[el.dataset.k] = v; renderSidebar(); } });
  $("view").querySelectorAll("input[data-name]").forEach(el => el.onchange = () => { el.checked ? state.protectNames.add(el.dataset.name) : state.protectNames.delete(el.dataset.name); });
}
function renderReminders(){
  setHead("یادآور تمدید", "تمدیدهای پیش رو");
  const list = state.groups.map((g, i) => ({ i, g, r: renewalInfo(g.data.group.period) })).filter(x => x.r).sort((a, b) => a.r.days - b.r.days);
  $("view").innerHTML = `${crumb([null, "یادآور تمدید"])}<div class="ph"><div><h1>یادآور تمدید</h1><span class="sub">ترتیب بر اساس روزهای مانده. ارسال خودکار پیامک و ایمیل ۹۰، ۶۰ و ۳۰ روز قبل در نسخهٔ آنلاین می‌آید.</span></div></div>
  <section class="panel"><div class="tw"><table><thead><tr><th>گروه</th><th>پایان قرارداد</th><th>روز مانده</th><th>یادآور</th></tr></thead><tbody>
  ${list.map(x => { const d = x.r.days, tag = d < 0 ? ["t-bad", "گذشته"] : d <= 30 ? ["t-bad", "۳۰ روز"] : d <= 60 ? ["t-mid", "۶۰ روز"] : d <= 90 ? ["t-protect", "۹۰ روز"] : ["t-line", "بعداً"];
    return `<tr class="click" tabindex="0" data-open="${x.i}"><td class="nm"><b>${esc(x.g.data.group.name)}</b><span>${esc(x.g.data.group.industry || "")}</span></td><td class="nw">${esc(x.r.end)}</td><td class="nw"><b>${d < 0 ? `${fmtInt(-d)} روز گذشته` : fmtInt(d)}</b></td><td><span class="tag ${tag[0]}">${tag[1]}</span></td></tr>`; }).join("")}
  </tbody></table></div></section>`;
}
function renderSoon(k){
  const [title, desc] = SOON[k] || ["به‌زودی", ""];
  setHead(title, "به‌زودی");
  $("view").innerHTML = `${crumb([null, title])}<div class="panel soon"><span class="ic"><svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M5.6 18.4l2.1-2.1M16.3 7.7l2.1-2.1"/></svg></span>
    <h1>${title}</h1><span class="tag t-mid">در نقشهٔ راه</span><p class="muted">${desc}</p>
    <div class="actions" style="justify-content:center"><button class="btn primary" type="button" data-go="home">برگشت به خانه</button></div></div>`;
}
function renderAdmin(){
  setHead("کاربران و نقش‌ها", "پیش‌نمایش");
  const B = [["کارگزاری نمونهٔ الف", "alef.broker", "سالانه", 214, "۴ از ۵", 38, true], ["کارگزاری نمونهٔ ب", "b.insure", "سالانه", 22, "۲ از ۳", 12, true], ["کارگزاری نمونهٔ پ", "pe.agency", "ماهانه", 9, "۱ از ۱", 4, true], ["کارگزاری نمونهٔ ت", "te.co", "سالانه", -6, "۳ از ۵", 21, false], ["کارگزاری نمونهٔ ث", "se.partners", "سالانه", 301, "۵ از ۱۰", 57, true]];
  $("view").innerHTML = `${crumb([null, "کاربران و اشتراک‌ها"])}<p class="preview-banner">پیش‌نمایش طراحی نسخهٔ آنلاین: داده‌ها ساختگی‌اند و دکمه‌ها هنوز کار نمی‌کنند. این پنل با راه‌اندازی سرور فعال می‌شود.</p>
  <div class="ph"><div><h1>کاربران و اشتراک‌ها</h1><span class="sub">مدیریت کارگزاران مشترک، نام کاربری و تاریخ انقضا</span></div><div class="actions"><button class="btn" type="button" data-go="login">پیش‌نمایش صفحهٔ ورود</button><button class="btn primary" type="button" disabled>＋ کارگزار جدید</button></div></div>
  <div class="kpis">${kpi("مشترک فعال", "۱۲", "۴ اشتراک ماهانه")}<div class="card kpi" style="background:var(--mid-bg);border-color:transparent"><span class="kl">رو به انقضا</span><span class="kv" style="color:var(--mid-ink)">۳</span><span class="ks">کمتر از ۳۰ روز</span></div>${kpi("کاربران", "۴۸", "در همهٔ کارگزاری‌ها")}${kpi("قراردادهای تحلیل‌شده", "۳۱۲", "از ابتدای سال")}</div>
  <section class="panel"><div class="panel-h"><h2>کارگزاران</h2></div><div class="tw"><table style="min-width:820px"><thead><tr><th>کارگزاری</th><th>نوع اشتراک</th><th>انقضا</th><th>کاربر</th><th>قرارداد</th><th>وضعیت</th><th>اقدام</th></tr></thead><tbody>
  ${B.map(([n, u, type, d, users, c, act]) => `<tr><td class="nm"><b>${n}</b><span class="ltr">${u}</span></td><td>${type}</td><td class="nw" style="${d < 0 ? "color:var(--bad);font-weight:700" : d < 30 ? "color:var(--mid-ink);font-weight:700" : ""}">${d < 0 ? `${fmtInt(-d)} روز گذشته` : `${fmtInt(d)} روز مانده`}</td><td class="nw">${users}</td><td class="nw">${fmtInt(c)}</td><td><span class="tag ${act ? "t-good" : "t-bad"}">${act ? "فعال" : "تعلیق"}</span></td><td class="nw"><button class="btn" type="button" disabled>تمدید</button> <button class="btn ${act ? "danger" : ""}" type="button" disabled>${act ? "تعلیق" : "فعال‌سازی"}</button></td></tr>`).join("")}
  </tbody></table></div></section>`;
}
function renderLogin(){
  setHead("ورود", "پیش‌نمایش");
  $("view").innerHTML = `${crumb(["admin", "کاربران و اشتراک‌ها"], [null, "ورود"])}<p class="preview-banner">پیش‌نمایش صفحهٔ ورود نسخهٔ آنلاین؛ هنوز فعال نیست.</p>
  <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(300px,1fr));gap:20px;max-width:820px">
    <div class="panel panel-b" style="display:flex;flex-direction:column;gap:12px"><span class="logo">RI</span><h1>ورود به Renewal Intelligence</h1>
      <label class="field" for="lu">نام کاربری یا ایمیل<input id="lu" type="text" class="ltr" disabled></label>
      <label class="field" for="lp">رمز عبور<input id="lp" type="password" disabled></label>
      <div style="display:flex;justify-content:space-between"><button class="link" type="button" disabled>نمایش رمز</button><button class="link" type="button" disabled>فراموشی رمز</button></div>
      <button class="btn primary" type="button" disabled>ورود</button></div>
    <div class="panel panel-b" style="display:flex;flex-direction:column;gap:12px;align-items:center;text-align:center"><h2>ورود دومرحله‌ای</h2><p class="muted small">کد ۶ رقمی ارسال‌شده به تلفن همراه را وارد کنید.</p>
      <div class="otp">${"123456".split("").map((_, k) => `<input aria-label="رقم ${k + 1}" maxlength="1" disabled>`).join("")}</div>
      <span class="small muted">ارسال دوباره تا <span class="ltr">0:42</span></span><button class="btn primary" type="button" disabled style="width:100%">تأیید</button></div>
  </div>`;
}

/* ---------- shell ---------- */
function setHead(title, sub){ $("mTitle").textContent = title; $("mSub").textContent = sub; }
function render(){
  const sm = state.mode === "tender" ? tenderSample() : isSample();
  $("sampleChip").hidden = !sm; $("resetBtn").hidden = false; $("resetBtn").textContent = sm ? "بارگذاری دوبارهٔ نمونه‌ها" : "بازگشت به نمونه‌ها";
  if (state.errors.length){ $("error").innerHTML = state.errors.map(e => `<p>${esc(e)}</p>`).join(""); $("error").hidden = false; } else $("error").hidden = true;
  const p = state.page;
  if (p === "home") renderHome();
  else if (p === "renewal") renderRenewal(); else if (p === "group") renderGroup(state.idx);
  else if (p === "tender") renderTenderList(); else if (p === "tenderp") renderTender(state.idx);
  else if (p === "settings") renderSettings(); else if (p === "reminders") renderReminders();
  else if (p === "claims") renderClaims();
  else if (p === "proposal") renderProposal(state.idx);
  else if (p === "docs") renderDocs(); else if (p === "doc") renderDoc(state.idx);
  else if (p === "admin") renderAdmin(); else if (p === "login") renderLogin();
  else if (p.startsWith("soon:")) renderSoon(p.slice(5));
  renderSidebar();
  document.querySelectorAll("[data-back]").forEach(b => { b.hidden = p === "home"; });
  document.querySelector(".mtop .tb-brand").hidden = p !== "home";
  const bn = { home: ["home"], renewal: ["renewal", "group"], tender: ["tender", "tenderp"], reminders: ["reminders"] };
  const due = state.groups.filter(g => { const r = renewalInfo(g.data.group.period); return r && r.days <= 30; }).length;
  $("bnBadge").hidden = !due; $("bnBadge").textContent = fmtInt(due);
  document.querySelectorAll(".bottomnav button").forEach(b => b.setAttribute("aria-current", String((bn[b.dataset.bn] || []).includes(p))));
}
function go(page, idx, back){
  if (page === "tender" || page === "tenderp") state.mode = "tender"; else if (page === "home" || page === "renewal" || page === "group") state.mode = "renewal";
  if (SOON[page]) page = "soon:" + page;
  if (!back && (page !== state.page || (idx ?? null) !== state.idx)){
    state.hist.push([state.page, state.idx]);
    // Mirror each step in the browser history so the phone's back gesture works too.
    try { history.pushState({ ri: state.hist.length }, ""); state.pushed++; } catch (e) {}
  }
  state.page = page; state.idx = idx ?? null; render(); window.scrollTo(0, 0);
}
const PARENT = { group: "renewal", tenderp: "tender", login: "admin", proposal: "claims" };
function goBack(){
  const p = state.hist.pop();
  if (p) go(p[0], p[1], true); else go(PARENT[state.page] || "home", null, true);
}
addEventListener("popstate", () => { state.pushed = Math.max(0, state.pushed - 1); $("modal").hidden = true; closeMenu(); goBack(); });
function bindStepper(id, fn){ const el = $(id); if (el) el.onchange = () => { const v = parseFloat(el.value); if (!isNaN(v)) fn(v); }; }
/* Theme: follows the system until the user picks; the choice is remembered on this device. */
function applyTheme(t){ if (t) document.documentElement.dataset.theme = t; else delete document.documentElement.dataset.theme; }
try { applyTheme(localStorage.getItem("ri-theme")); } catch (e) {}
function toggleTheme(){
  const dark = document.documentElement.dataset.theme ? document.documentElement.dataset.theme === "dark" : matchMedia("(prefers-color-scheme: dark)").matches;
  const t = dark ? "light" : "dark"; applyTheme(t); try { localStorage.setItem("ri-theme", t); } catch (e) {}
}
function jump(id){ const el = $(id); if (el) el.scrollIntoView({ behavior: reduced() ? "auto" : "smooth", block: "start" });
  document.querySelectorAll(".ptabs button").forEach(b => b.setAttribute("aria-current", String(b.dataset.jump === id))); }

document.addEventListener("click", e => {
  const t = e.target;
  if (t.closest("[data-menu]")){ $("sheet").hidden ? openMenu() : closeMenu(); return; }
  if (t.closest("[data-sheet-close]")){ closeMenu(); return; }
  if (t.closest("#sheet .mi")) closeMenu();
  const act = t.closest("[data-act]");
  if (act){ const k = act.dataset.act;
    if (k === "upload"){ state.mode = "renewal"; $("file").click(); }
    else if (k === "tsearch"){ go("home"); setTimeout(() => { $("tq").scrollIntoView({ block: "center" }); $("tq").focus(); }, 0); }
    else if (k === "ai"){ if (state.page === "group") jump("g-ai"); else if (state.page === "tenderp") jump("t-ai"); else { go("home"); setTimeout(() => { $("homeAsk").scrollIntoView({ block: "center" }); $("homeAiQ").focus(); }, 0); } }
    return; }
  if (t.closest("[data-theme-toggle]")){ toggleTheme(); return; }
  if (t.closest("[data-back]")){ if (state.pushed > 0) history.back(); else goBack(); return; }
  const tq = t.closest("[data-tq]"); if (tq){ $("tq").value = tq.dataset.tq; tenderSearch(tq.dataset.tq); return; }
  if (t.closest("[data-tupload]")){ $("modal").hidden = true; state.mode = "tender"; $("file").click(); return; }
  const tn = t.closest("[data-tender]"); if (tn){ go("tenderp", +tn.dataset.tender); return; }
  const op0 = t.closest("[data-open]"); if (op0 && state.page === "home"){ go("group", +op0.dataset.open); return; }
  const cat = t.closest("[data-cat]"); if (cat){ state.mcat = cat.dataset.cat; state.more[cat.dataset.cat] = true; go("renewal"); setTimeout(() => { const el = $(innerWidth <= 860 ? "acm" : "ac"); if (el) el.scrollIntoView({ block: "start" }); }, 0); return; }
  const ha = t.closest("[data-hask]"); if (ha){ homeAsk(ha.dataset.hask); return; }
  const goEl = t.closest("[data-go]"); if (goEl){ go(goEl.dataset.go); return; }
  const j = t.closest("[data-jump]"); if (j){ jump(j.dataset.jump); return; }
  const m = t.closest("[data-more]"); if (m){ state.more[m.dataset.more] = true; render(); return; }
  const mc = t.closest("[data-mcat]"); if (mc){ state.mcat = mc.dataset.mcat; render(); return; }
  const so = t.closest("[data-sort]"); if (so){ state.sort = so.dataset.sort; render(); return; }
  const st = t.closest("[data-step]"); if (st){ const el = $(st.dataset.step); el.value = (parseFloat(el.value) || 0) + parseFloat(st.dataset.d); el.dispatchEvent(new Event("change")); return; }
  const a = t.closest("[data-ask]"); if (a){ ask(a.dataset.ask); return; }
  if (t.closest("[data-close]") || t.id === "modal"){ $("modal").hidden = true; return; }
  const dc = t.closest("[data-doc]"); if (dc){ go("doc", +dc.dataset.doc); return; }
  const og = t.closest("[data-org]"); if (og){ state.cmpOrg = og.dataset.org; render(); return; }
  const o = t.closest("[data-open]"); if (o && $("view").contains(o)){ go(state.mode === "tender" ? "tenderp" : "group", +o.dataset.open); return; }
});
document.addEventListener("keydown", e => {
  if (e.key === "Escape"){ $("modal").hidden = true; closeMenu(); }
  const lk = e.target.closest && e.target.closest(".isl[data-go][role=link]");
  if (lk && e.target === lk && (e.key === "Enter" || e.key === " ")){ e.preventDefault(); go(lk.dataset.go); }
  const r = e.target.closest && e.target.closest("tr[data-open]");
  if (r && (e.key === "Enter" || e.key === " ")){ e.preventDefault(); go(state.mode === "tender" ? "tenderp" : "group", +r.dataset.open); }
});
document.addEventListener("submit", e => {
  if (e.target.id === "aiForm"){ e.preventDefault(); const q = $("aiQ").value.trim(); if (q) ask(q); }
  if (e.target.id === "tenderQ"){ e.preventDefault(); tenderSearch($("tq").value); }
  if (e.target.id === "homeAsk"){ e.preventDefault(); const q = $("homeAiQ").value.trim(); if (q) homeAsk(q); }
});
$("q").addEventListener("input", e => { state.q = e.target.value; if (state.page !== "renewal" && state.page !== "tender") go(state.mode === "tender" ? "tender" : "renewal"); else render(); $("q").focus(); });
const toUrgent = () => { go("renewal"); setTimeout(() => { const el = $(innerWidth <= 860 ? "acm" : "ac"); if (el) el.scrollIntoView({ block: "start" }); state.mcat = "urgent"; }, 0); };
$("bellBtn").onclick = toUrgent; $("bellBtnM").onclick = toUrgent;
$("resetBtn").onclick = () => { if (state.mode === "tender"){ state.tenders = makeTenders(); addProtect(state.tenders); go("tender"); } else { setGroups(sampleGroups()); go(state.page === "home" ? "home" : "renewal"); } state.errors = []; render(); };
$("uploadBtn").addEventListener("keydown", e => { if (e.key === "Enter" || e.key === " "){ e.preventDefault(); $("file").click(); } });
document.querySelectorAll(".bottomnav button[data-bn]").forEach(b => b.addEventListener("click", () => go(b.dataset.bn)));

/* ---------- all-features menu ---------- */
function openMenu(){
  const due = state.groups.filter(g => { const r = renewalInfo(g.data.group.period); return r && r.days <= 30; }).length;
  const urgent = buildTodo(state.groups.map((g, i) => Object.assign({ i, g }, compute(g)))).filter(t => t.sev === "crit").length;
  const mi = (k, label, attrs, extra) => `<button class="mi" type="button" ${attrs}>${ic(k)}<span>${label}</span>${extra || ""}</button>`;
  const soon = '<span class="mb">به‌زودی</span>';
  $("sheet").innerHTML = `<div class="sheet-bg" data-sheet-close></div><div class="sheet-box" role="dialog" aria-modal="true" aria-label="همهٔ قابلیت‌ها">
    <div class="sheet-grip"></div>
    <div class="sheet-h"><h2>همهٔ قابلیت‌ها</h2><button class="iconbtn" type="button" data-sheet-close aria-label="بستن">✕</button></div>
    <div class="sheet-sec">دو کار اصلی</div>
    <div class="mgrid two">
      <button class="mi main" type="button" data-act="upload" style="--h:#6366F1">${ic("upload")}<span>تحلیل تمدید<small>فایل اکسل قرارداد را بدهید</small></span></button>
      <button class="mi main" type="button" data-act="tsearch" style="--h:#0D9488">${ic("search")}<span>برآورد قیمت مناقصه<small>نام سازمان را بزنید</small></span></button>
    </div>
    <div class="sheet-sec">تحلیل</div>
    <div class="mgrid">
      ${mi("portfolio", "پرتفوی تمدید", 'data-go="renewal"')}${mi("tender", "مناقصه‌ها", 'data-go="tender"')}
      ${mi("urgent", "کارهای فوری", 'data-cat="urgent"', urgent ? `<span class="mn">${fmtInt(urgent)}</span>` : "")}${mi("cal", "یادآور تمدید", 'data-go="reminders"', due ? `<span class="mn">${fmtInt(due)}</span>` : "")}
    </div>
    <div class="sheet-sec">ابزار</div>
    <div class="mgrid">
      ${mi("claims", "تحلیل خسارت", 'data-go="claims"')}${mi("ai", "دستیار هوشمند", 'data-act="ai"')}${mi("docs", "مدارک و قراردادها", 'data-go="docs"')}${mi("settings", "قواعد تحلیل", 'data-go="settings"')}${mi("moon", "حالت روشن / تیره", "data-theme-toggle")}
    </div>
    <div class="sheet-sec">مدیریت و نقشهٔ راه</div>
    <div class="mgrid">
      ${mi("users", "کاربران و اشتراک‌ها", 'data-go="admin"', '<span class="mb">پیش‌نمایش</span>')}${mi("link", "اتصال داده‌پردازان", 'data-go="dadeh"', soon)}${mi("map", "ورود داده و نگاشت", 'data-go="mapping"', soon)}${mi("market", "مقایسه با بازار", 'data-go="market"', soon)}${mi("clock", "تاریخچهٔ قراردادها", 'data-go="history"', soon)}
    </div></div>`;
  $("sheet").hidden = false;
  document.querySelectorAll("[data-menu]").forEach(b => b.setAttribute("aria-expanded", "true"));
}
function closeMenu(){ $("sheet").hidden = true; document.querySelectorAll("[data-menu]").forEach(b => b.setAttribute("aria-expanded", "false")); }

function homeAsk(q){ const v = $("homeAiG").value; if (v === "p") ask(q); else { go("group", +v); ask(q); } }

/* ---------- smart flows ---------- */
const wait = ms => new Promise(r => setTimeout(r, reduced() ? 0 : ms));
async function runFlow(title, sub, steps){
  $("modal").innerHTML = `<div class="box" role="dialog" aria-modal="true" aria-label="${esc(title)}"><div class="panel-h"><h2>${esc(title)}</h2><button class="iconbtn" type="button" data-close aria-label="بستن">✕</button></div>
    <div class="panel-b"><p class="small muted">${sub}</p><div class="flow">${steps.map((x, k) => `<div class="fs" id="fs${k}"><span class="fi">${fmtInt(k + 1)}</span><div><b>${esc(x.t)}</b><span></span></div></div>`).join("")}</div><div id="flowEnd"></div></div></div>`;
  $("modal").hidden = false;
  for (let k = 0; k < steps.length; k++){
    const el = $("fs" + k); el.className = "fs on"; await wait(420);
    const r = steps[k].run();
    if (r && r.stop){ el.className = "fs bad"; el.querySelector(".fi").textContent = "!"; el.querySelector(":scope > div > span").textContent = r.text; $("flowEnd").innerHTML = r.html || ""; return false; }
    el.className = "fs ok"; el.querySelector(".fi").textContent = "✓"; el.querySelector(":scope > div > span").textContent = r || "";
  }
  await wait(500); $("modal").hidden = true; return true;
}
const issueText = iss => { const c = iss.filter(x => x.sev === "crit").length, w = iss.filter(x => x.sev === "warn").length; return c + w ? `${c ? `${fmtInt(c)} مورد بحرانی، ` : ""}${fmtInt(w)} هشدار؛ جزئیات در «کیفیت داده»` : "مشکلی پیدا نشد"; };
function renewalFlow(list){
  const an = list.map(g => compute(Object.assign({ budget: null }, g)));
  const cnt = {}; an.forEach(({ A }) => A.rows.forEach(r => { cnt[r.d] = (cnt[r.d] || 0) + 1; }));
  return runFlow("تحلیل تمدید", list.length > 1 ? `${fmtInt(list.length)} فایل` : esc(list[0].file), [
    { t: "خواندن فایل", run: () => list.map(g => g.data.group.name).join("، ") },
    { t: "شناسایی پوشش‌ها، سقف‌ها و خسارت‌ها", run: () => `${fmtInt(sum(list, g => g.data.coverages.length))} پوشش · ${fmtInt(sum(list, g => g.data.claims.length))} خسارت` },
    { t: "کنترل کیفیت داده", run: () => issueText(an.flatMap(x => x.A.issues)) },
    { t: "تحلیل مصرف هر پوشش", run: () => ["increase", "minor", "reduce", "remove", "protect"].filter(k => cnt[k]).map(k => `${fmtInt(cnt[k])} ${DLABEL[k]}`).join("، ") || "همه بدون تغییر" },
    { t: "ساخت ۳ سناریو و مقایسه با بودجه", run: () => list.length === 1 && an[0].S.balanced.premiumChange != null ? `سناریوی متعادل: تغییر حق‌بیمه ${fmtSignedPct(an[0].S.balanced.premiumChange)}` : "آماده" },
  ]);
}
function tenderSteps(R){
  return [
    { t: "دریافت سابقهٔ خسارت", run: () => `${fmtInt(R.hist.length)} سال سابقه · ${R.hist.map(h => fmtInt(h.year).replace(/٬/g, "")).join(" و ")}` },
    { t: "کنترل کیفیت داده", run: () => issueText(R.issues) },
    { t: "برآورد هزینهٔ سال قرارداد", run: () => `${fmtInt(R.insuredNext)} نفر · خسارت برآوردی ${fmtNum(R.expected)} (تورم ${fmtPct(R.trend)})` },
    { t: "قیمت پیشنهادی و ریسک", run: () => `${fmtNum(R.price)} میلیون تومان · Loss Ratio ${fmtPct(R.expected / R.price)}` },
  ];
}
const STOP = new Set(["شرکت", "سازمان", "مناقصه", "مناقصهٔ", "مناقصه‌ی", "اداره", "کل", "گروه", "و", "بیمه", "متقاضی"]);
async function tenderSearch(q){
  state.tq = q.trim(); if (!state.tq) return;
  const words = norm(state.tq).split(/\s+/).filter(w => w.length > 1 && !STOP.has(w));
  const i = state.tenders.findIndex(t => words.length && words.some(w => norm(t.data.group.name).includes(w)));
  const R = i >= 0 ? computeTender(state.tenders[i]) : null;
  const ok = await runFlow(`برآورد قیمت مناقصه: ${state.tq}`, "اتصال مستقیم به داده‌پردازان در فاز آخر فعال می‌شود؛ در این نسخه سابقه از دادهٔ نمونهٔ اپ یا فایل اکسل خوانده می‌شود.", [
    { t: "جست‌وجو در داده‌پردازان", run: () => R ? `پیدا شد در دادهٔ نمونه: ${short(R.group.name)}` : { stop: true, text: `«${state.tq}» در دادهٔ نمونه نیست و اتصال مستقیم هنوز برقرار نیست.`,
      html: `<div style="display:flex;flex-direction:column;gap:10px;margin-top:8px"><p class="small">خروجی اکسل سابقهٔ خسارت این سازمان را از داده‌پردازان بگیرید و اینجا بدهید؛ بقیهٔ مراحل خودکار انجام می‌شود.</p><button class="btn primary" type="button" data-tupload>بارگذاری فایل سابقهٔ «${esc(state.tq)}»</button></div>` } },
  ].concat(R ? tenderSteps(R) : []));
  if (ok) go("tenderp", i);
}

function readFile(f){
  return new Promise(resolve => {
    const rd = new FileReader();
    rd.onload = () => {
      try {
        const wb = XLSX.read(new Uint8Array(rd.result), { type: "array" });
        const sheets = {};
        wb.SheetNames.forEach(n => { sheets[n] = XLSX.utils.sheet_to_json(wb.Sheets[n], { header: 1, raw: true, defval: null }); });
        const data = state.mode === "tender" ? parseTender(sheets) : parseWorkbook(sheets);
        if (/بدون نام$/.test(data.group.name)) data.group.name = f.name.replace(/\.[^.]+$/, "");
        resolve({ ok: true, g: { sample: false, data, file: f.name } });
      } catch (err){ resolve({ ok: false, msg: `«${f.name}» خوانده نشد: ${err.message}` }); }
    };
    rd.onerror = () => resolve({ ok: false, msg: `«${f.name}» باز نشد.` });
    rd.readAsArrayBuffer(f);
  });
}
async function handleFiles(files){
  if (!files.length) return;
  const docs = files.filter(isDocFile); files = files.filter(f => !isDocFile(f));
  // Claims reports (گروه بیماری + مبلغ خسارت) go to the claims page, whatever page the upload came from.
  if (files.length && typeof XLSX !== "undefined"){ state.errors = []; const c = await takeClaims(files); files = c.rest;
    // claims + policy given together: read and confirm the policy, then land on the analysis
    if (c.got.length){ state.cl = { picked: false }; const pol = docs.concat(files.filter(f => /\.xlsx?$/i.test(f.name)));
      return pol.length ? handleDocs(pol, { claims: true }) : go("claims"); } }
  if (docs.length && !files.length) return handleDocs(docs);
  if (docs.length) setTimeout(() => handleDocs(docs), 0);
  if (typeof XLSX === "undefined"){ state.errors = ["کتابخانهٔ خواندن اکسل بارگذاری نشد؛ اتصال اینترنت را بررسی کنید و صفحه را دوباره باز کنید."]; return render(); }
  const res = await Promise.all(files.map(readFile));
  const ok = res.filter(r => r.ok).map(r => r.g);
  state.errors = res.filter(r => !r.ok).map(r => r.msg);
  // a sheet of coverage caps (not a renewal workbook): read it as a policy
  const capsF = files.filter((f, i) => !res[i].ok && /\.xlsx?$/i.test(f.name));
  if (capsF.length){ state.errors = res.filter((r, i) => !r.ok && !capsF.includes(files[i])).map(r => r.msg);
    if (!ok.length) return handleDocs(capsF, state.claims.length ? { claims: true } : undefined); setTimeout(() => handleDocs(capsF), 0); }
  if (!ok.length) return render();
  const tender = state.mode === "tender";
  if (tender && state.tq && ok.length === 1 && ok[0].data.group.name === ok[0].file.replace(/\.[^.]+$/, "")) ok[0].data.group.name = state.tq;
  // The first real upload replaces the samples; later uploads add (same id or name replaces).
  const list = (tender ? tenderSample() : isSample()) ? [] : (tender ? state.tenders : state.groups).slice();
  ok.forEach(g => { const k = list.findIndex(x => (g.data.group.id && x.data.group.id === g.data.group.id) || x.data.group.name === g.data.group.name); if (k >= 0) list[k] = g; else list.push(g); });
  if (tender){
    addProtect(ok);
    let R; try { R = computeTender(ok[0]); } catch (err){ state.errors.push(`«${ok[0].file}» تحلیل نشد: ${err.message}`); return render(); }
    state.tenders = list;
    await runFlow(`برآورد قیمت مناقصه: ${ok[0].data.group.name}`, esc(ok[0].file), tenderSteps(R));
    return go(ok.length === 1 ? "tenderp" : "tender", ok.length === 1 ? list.indexOf(ok[0]) : null);
  }
  addProtect(ok);
  await renewalFlow(ok);
  setGroups(list);
  return ok.length === 1 ? go("group", list.findIndex(x => x.file === ok[0].file && x.data === ok[0].data)) : go("renewal");
}
$("file").addEventListener("change", e => { const files = [...e.target.files]; e.target.value = ""; handleFiles(files); });

setGroups(sampleGroups());
state.contracts = sampleContracts();
state.tenders = makeTenders(); addProtect(state.tenders);
render();
