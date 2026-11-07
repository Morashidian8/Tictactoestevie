/* ================= Contract understanding =================
   Turns what the reader found (text + tables) into a contract: who, which insurer, which year,
   premium, head count and the cap of every coverage per plan. Every value keeps the image of the
   row it came from, so the broker can check it against the paper before it is used. */

const CCAT = [ // order matters: the first rule that matches wins
  ["combo", "سقف مشترک چند بند", /(?!.*(نازایی|ناباروری|سال(ی)?انه))(?:حداکثر\s*(?:\S+\s*)?تعه[دذ]ات?\s*(ردیف|بند)|جمع\s*تعهدات|حداکثر\s*سقف\s*تعهدات)/],
  ["total", "حداکثر تعهد سالانه", /حداکثر\s*تعهدات\s*سال(ی)?انه|سقف\s*کل/],
  ["visitdrug", "ویزیت، دارو و اورژانس", /ویزیت.*دارو|دارو.*ویزیت|ویزیت\s*و\s*دارو/],
  ["dental", "دندانپزشکی", /دندا|دندن/],
  ["special", "جراحی‌های خاص و تخصصی", /جراحی.{0,4}(های)?\s*تخصصی|سرطان|شیمی\s*در|رادیوترا|پیوند|گامانایف|تخصصی\s*و\s*فوق/],
  ["delivery", "زایمان", /زایمان|سزارین/],
  ["infert", "نازایی و ناباروری", /نازایی|ناباروری/],
  ["lab", "آزمایش‌ها (پاراکلینیک ۳)", /پاراکلینیک\S*\s*[3۳]|آزمایشگاه|آزمایش\s*های\s*تشخیصی|پاتولوژی/],
  ["diag", "تست‌های تشخیصی (پاراکلینیک ۲)", /پاراکلینیک\S*\s*[2۲]|تست\s*ورزش|آندوسکوپی|نوار\s*(قلب|مغز|عصب)|الکترو|مانیتورینگ|هولتر/],
  ["fetal", "غربالگری جنین", /غربالگری|جنین/],
  ["para", "تصویربرداری (پاراکلینیک ۱)", /پاراکلینیک|رادیولوژی|رادیوگرافی|سونوگرافی|تصویربرداری|اسکن|ام\s*آر\s*آی|ماموگرافی/],
  ["outsurg", "اعمال جراحی مجاز سرپایی", /سرپایی|شکستگی|گچ\s*گیری|بخیه/],
  ["ambOut", "آمبولانس خارج شهر", /آم.?ولانس.*(خارج|بین)\s*شهر|خارج\s*شهر|بین\s*شهری/],
  ["ambIn", "آمبولانس داخل شهر", /آم.?ولانس.*(داخل\s*شهر|(?<!بین\s?)شهری)|داخل\s*شهر/],
  ["amb", "آمبولانس", /آم.?ولانس|امبولانس/],
  ["refractive", "رفع عیوب انکساری چشم", /ان[کگ]سار|لیزیک|عیوب\s*چشم/],
  ["glasses", "عینک و لنز", /عین[کگ]|لنز/],
  ["hearing", "سمعک", /سمع[کگ]/],
  ["organs", "اعضای طبیعی بدن", /اعضا\S*\s*طبیعی/],
  ["orthosis", "اروتز", /اروتز/],
  ["prosthesis", "پروتز", /پروتز/],
  ["supplies", "لوازم پزشکی", /لوازم\s*(طبی|پزشکی)|دستگاه\s*تست\s*قند/],
  ["specialDis", "بیماران خاص و صعب‌العلاج", /بیماران\s*خاص|صعب\s*العلاج|داروها?ی?\s*خاص/],
  ["rehab", "فیزیوتراپی و توانبخشی", /فیزیوتراپی|گفتار\s*درمانی|کار\s*درمانی|توان\s*\S?\s*بخش|توان,/],
  ["emergency", "اورژانس", /اورژانس/],
  ["visit", "ویزیت", /ویزیت/],
  ["drug", "دارو", /دارو/],
  ["hosp", "بستری و جراحی عمومی", /بستری|جراحی|day\s*care/i],
];
const CCAT_NAME = Object.fromEntries(CCAT.map(([k, n]) => [k, n]));
const INSURERS = /بیمه\s*(آسیا|ایران|البرز|دانا|پارسیان|ملت|سامان|معلم|رازی|کوثر|ما|سینا|نوین|تعاون|دی|آرمان|حافظ|میهن|سرمد|تجارت\s*نو|کارآفرین|پاسارگاد|ایران\s*معین|امید|آسماری|زندگی\s*خاورمیانه|حکمت)(?![آ-ی])/;
const enDigits = s => drNorm(s);
const toMT = rial => rial == null ? null : rial === Infinity ? Infinity : rial / 1e7; // ریال → میلیون تومان

// The keyword that appears first decides: «بستری، جراحی، آنژیوگرافی قلب، گامانایف…» is a hospital row
// even though it also names a special surgery further on.
// Short title cells: a distinctive word wins wherever it sits («پاراکلینیکی ۲ (خدمات آزمایشگاهی)» is lab).
const STRONG = [["lab", /آزمایشگاه/], ["outsurg", /سرپایی/], ["specialDis", /بیماران\s*خاص|صعب|داروها?ی?\s*خاص/], ["dental", /دندا|دندن/], ["delivery", /زایمان/], ["infert", /نازایی|ناباروری/],
  ["organs", /اعضا\S*\s*طبیعی/], ["prosthesis", /پروتز/], ["orthosis", /اروتز/], ["hearing", /سمع[کگ]/], ["glasses", /عین[کگ]/], ["refractive", /ان[کگ]سار/], ["rehab", /توان|فیزیو|گفتار/], ["fetal", /غربالگری/], ["supplies", /لوازم/]];
function catOfRow(text, title){
  const t = norm(text); let best = null;
  if (title){ const s = STRONG.find(([, re]) => re.test(t)); if (s && !/حداکثر/.test(t)) return s[0]; }
  CCAT.forEach(([k, , re], order) => { const m = t.match(re); if (m && (!best || m.index < best.i || (m.index === best.i && order < best.o))) best = { k, i: m.index, o: order }; });
  return best ? best.k : null;
}
function planOfHeader(t){
  t = norm(t);
  if (/نقره/.test(t)) return "نقره‌ای"; if (/طلا/.test(t)) return "طلایی"; if (/برنز/.test(t)) return "برنزی";
  const m = t.match(/طرح\s*(یک|دو|سه|الف|ب|ج|[1-3۱-۳])/); if (m) return "طرح " + ({ "یک": "۱", "دو": "۲", "سه": "۳", "1": "۱", "2": "۲", "3": "۳" }[m[1]] || m[1]);
  if (/خانواده/.test(t)) return "#family"; if (/فرانشیز/.test(t)) return "#franchise";
  if (/نفر|سقف|تعهد|ریال|مبلغ/.test(t)) return "اصلی";
  return null;
}

// Pull the contract out of one document.
function understand(doc){
  const LX = lexText(doc.text), T = norm(enDigits(LX.text)).replace(/[ـ]/g, ""), issues = [];
  const out = { fixes: LX.fixes.length, file: doc.file, kind: "سند", org: null, insurer: null, year: null, start: null, end: null, insured: null, premium: null, premiumPer: null, franchise: null, plans: {}, rows: [], issues };
  // kind
  if (/شماره\s*بیمه\s*نامه|شرح\s*تعهدات\s*بیمه\s*گر/.test(T)) out.kind = "بیمه‌نامه";
  else if (/الحاقیه/.test(T)) out.kind = "الحاقیه";
  else if (/استعلام/.test(T)) out.kind = "استعلام قیمت";
  else if (/مناقصه/.test(T)) out.kind = "مناقصه";
  else if (/قسط|اقساط|سررسید/.test(T)) out.kind = "اقساط";
  // who
  const org = T.match(/بیمه\s*گذار\s*:?\s*([^\n:]{3,40}?)\s*(?:کد|\n|نشانی|شماره)/) || T.match(/تکمیلی\s*(?:کار\s*کنان\s*)?((?:دانشگاه|شرکت|موسسه|سازمان|اداره|بانک|مجتمع|بیمارستان)[^\n(]{2,60}?)\s*(?:\(|سال|\d{4}|\n)/) || T.match(/((?:دانشگاه|شرکت|موسسه|سازمان|مجتمع|بانک)\s+[^\n]{2,40}?)\s*(?:\n|کد)/);
  if (org) out.org = org[1].replace(/\s+/g, " ").replace(/^محترم\s+/, "").trim();
  const ins = T.match(INSURERS); if (ins) out.insurer = ins[0].replace(/\s+/g, " ");
  // when
  const dates = [...T.matchAll(/(1[34]\d{2})\/(\d{1,2})\/(\d{1,2})/g)].map(m => m[0]);
  const range = T.match(/(?:سال\s*)?(14\d{2})\s*[-–]\s*(14\d{2})/);
  const start = T.match(/(?:از\s*روز|شروع)[^\d]{0,20}(1[34]\d{2}\/\d{1,2}\/\d{1,2})/), end = T.match(/(?:خاتمه|پایان)[^\d]{0,20}(1[34]\d{2}\/\d{1,2}\/\d{1,2})|(1[34]\d{2}\/\d{1,2}\/\d{1,2})\s*خاتمه/);
  if (start) out.start = start[1]; if (end) out.end = end[1] || end[2];
  if (out.start) out.year = +out.start.slice(0, 4);
  else if (range) out.year = Math.min(+range[1], +range[2]);
  else if (dates.length) out.year = Math.min(...dates.map(d => +d.slice(0, 4)));
  // how many people
  // the largest head count wins: a policy issued for 50 is often raised to thousands by an addendum
  const heads = [...T.matchAll(/(?:تعداد\s*بیمه\s*شدگا\s*ن|مجموعا|تعداد\s*نفرات)[^\d\n]{0,14}([\d,]{2,7})\s*:?\s*نفر/g)].map(m => +m[1].replace(/,/g, "")).filter(v => v > 1);
  if (heads.length) out.insured = Math.max(...heads);
  // premium per person
  const pr = T.match(/حق\s*بیمه\s*هر\s*بیمه\s*شده[^\d]{0,40}([\d,\/]{6,})/);
  if (pr){ out.premium = drParseAmount(pr[1]); out.premiumPer = "year"; }
  // premium from an addendum: extra premium ÷ people added
  const add = T.match(/تعداد\s*([\d,]{2,7})\s*نفر\s*مطابق\s*الحاقیه/), extra = T.match(/حق\s*بیمه\s*اضافی[^\d]{0,30}([\d,]{9,})/);
  if (!out.premium && add && extra){ const n = +add[1].replace(/,/g, ""), v = drParseAmount(extra[1]); if (n && v){ out.premium = v / n; out.premiumPer = "year"; out.premiumNote = `از الحاقیه: حق‌بیمهٔ اضافی ÷ ${fmtInt(n)} نفر`; } }
  // premium from the instalment total when the per-person figure is unreadable
  const tot = T.match(/جمع\s*(?:کل)?\s*:?\s*([\d,]{11,})/);
  if (!out.premium && tot && out.insured){ out.premium = drParseAmount(tot[1]) / out.insured; out.premiumPer = "year"; out.premiumNote = "از جمع اقساط ÷ تعداد نفرات"; }
  const fr = T.match(/فرانشیز[^\d\n]{0,40}(\d{1,2})\s*(?:درصد|٪|%)/); if (fr) out.franchise = +fr[1];
  // premium read from the header box by the amount reader; checked against the annual figure when both are there
  const F = doc.fields || {}, n0 = out.insured;
  if (F.premium && F.premium.value >= 1e6 && F.premium.value <= 5e10 && (!out.premium || (F.annual && n0 && Math.abs(F.premium.value * n0 - F.annual.value) < F.annual.value * 0.01))){
    out.premium = F.premium.value; out.premiumPer = "year"; out.premiumNote = "از کادر حق بیمه";
  } else if (!out.premium && F.annual && n0 && F.annual.value / n0 >= 1e6){ out.premium = F.annual.value / n0; out.premiumPer = "year"; out.premiumNote = "از حق بیمهٔ سالیانه ÷ تعداد نفرات"; }
  // franchise: the «درصد فرانشیز» column of the commitments table — the value most rows carry
  if (out.franchise == null){
    const seen = {};
    doc.tables.forEach(t => { let col = null; t.rows.forEach(cells => {
      const h = cells.find(c => /درصد\s*فرانشیز|فرانشیز\s*\(?\s*درصد/.test(norm(c.text || ""))) || (!col && cells.find(c => /^\s*فرانشیز\s*$/.test(norm(c.text || ""))));
      if (h){ col = { x0: h.x0, x1: h.x1 }; return; }
      if (!col) return;
      const c = cells.find(k => { const m = (k.x0 + k.x1) / 2; return m > col.x0 - 5 && m < col.x1 + 5; }); if (!c) return;
      const v = c.value != null ? c.value : +(drNorm(c.text || "").match(/^\s*(\d{1,2})\s*[٪%]?\s*$/) || [])[1];
      if (v > 0 && v <= 50) seen[v] = (seen[v] || 0) + 1;
    }); });
    const best = Object.entries(seen).sort((a, b) => b[1] - a[1])[0]; if (best) out.franchise = +best[0];
  }

  // tables → coverage rows
  let cols = null; // [{x0,x1,plan}] — header columns carry over to the next pages of the same table
  doc.tables.forEach(t => {
    t.rows.forEach(cells => {
      const plans = cells.map(c => planOfHeader(c.text || ""));
      const numeric = cells.filter(c => c.value != null).length;
      const headerLike = cells.every(c => (c.text || "").length < 40) && plans.filter(p => p && !p.startsWith("#")).length && (cols === null || plans.some(p => p && p !== "اصلی"));
      if (!numeric && headerLike){ cols = cells.map((c, i) => ({ x0: c.x0, x1: c.x1, plan: plans[i] })).filter(c => c.plan); return; }
      if (!numeric) return;
      cells.forEach(c => { if (c.text && c.raw == null){ c.raw = c.text; c.text = lexText(c.text).text; } });
      const textCells = cells.filter(c => c.value == null && (c.text || "").length > 1);
      const label = textCells.map(c => c.text).join(" — ");
      // the short title cell decides first; the long description only when the title says nothing
      const byLen = textCells.slice().sort((a, b) => a.text.length - b.text.length);
      const cat = byLen.map(c => catOfRow(c.text, c.text.length < 45)).find(Boolean) || null;
      const vals = {};
      cells.forEach(c => {
        if (c.value == null) return;
        let plan = "اصلی";
        if (cols){ const mid = (c.x0 + c.x1) / 2, col = cols.find(k => mid > k.x0 - 5 && mid < k.x1 + 5); if (col) plan = col.plan; }
        if (plan === "#franchise"){ if (c.value <= 100) out.franchise = out.franchise || c.value; return; }
        if (plan === "#family" || c.value < 1e5) return; // family caps and stray small numbers
        if (c.value !== Infinity && c.value > 1e13){ issues.push(`یک مبلغ ناخوانا (${c.text}) کنار گذاشته شد؛ اگر لازم است دستی وارد کنید.`); return; }
        if (vals[plan] == null) vals[plan] = { rial: c.value, conf: Math.round(c.vconf || c.conf || 0) };
      });
      if (!Object.keys(vals).length) return;
      if (!cat && /قسط|اقساط|سررسید|سر\s*رسید/.test(label + " " + cells.map(c => c.text || "").join(" "))) return; // instalment schedule, not a commitment
      Object.keys(vals).forEach(p => { out.plans[p] = true; });
      const box = cells.reduce((b, c) => ({ x0: Math.min(b.x0, c.x0), x1: Math.max(b.x1, c.x1), y0: Math.min(b.y0, c.y0), y1: Math.max(b.y1, c.y1) }), { x0: 1e9, x1: 0, y0: 1e9, y1: 0 });
      const uni = list => list.length ? list.reduce((b, c) => ({ x0: Math.min(b.x0, c.x0), x1: Math.max(b.x1, c.x1), y0: Math.min(b.y0, c.y0), y1: Math.max(b.y1, c.y1) }), { x0: 1e9, x1: 0, y0: 1e9, y1: 0 }) : null;
      out.rows.push({ cat, label: label.slice(0, 140), vals, page: t.page, box, vbox: uni(cells.filter(c => c.value != null && c.value >= 1e5)), lbox: uni(textCells) });
    });
  });
  out.plans = Object.keys(out.plans);
  // checks
  if (!out.org) issues.push("نام بیمه‌گذار پیدا نشد؛ وارد کنید.");
  if (!out.year) issues.push("سال قرارداد پیدا نشد؛ وارد کنید.");
  if (out.kind !== "استعلام قیمت" && !out.premium) issues.push("حق‌بیمه پیدا نشد (اگر دست‌نویس است، وارد کنید).");
  if (!out.rows.length && doc.tables.length) issues.push("جدول پیدا شد ولی مبلغی در آن خوانده نشد.");
  out.rows.forEach(r => { if (!r.cat) issues.push(`ردیف «${r.label.slice(0, 40)}…» به هیچ پوششی نخورد؛ نوعش را انتخاب کنید.`); });
  const low = out.rows.filter(r => Object.values(r.vals).some(v => v.conf < 70)).length;
  if (low) issues.push(`${fmtInt(low)} مبلغ با اطمینان کم خوانده شد؛ با تصویر کنارش مقایسه کنید.`);
  return out;
}
