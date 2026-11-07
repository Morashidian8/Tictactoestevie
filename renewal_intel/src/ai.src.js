/* ================= Offline assistant =================
   Understands Persian questions with keyword intents plus entities (coverage, number, scenario,
   decision) and answers only from the app's own calculations, always naming the source. Three
   contexts: one renewal group, one tender, and the whole portfolio. No network, no model. */

const qn = q => norm(q).toLowerCase()
  .replace(/[۰-۹]/g, d => "۰۱۲۳۴۵۶۷۸۹".indexOf(d)).replace(/[٠-٩]/g, d => "٠١٢٣٤٥٦٧٨٩".indexOf(d))
  .replace(/٫/g, ".").replace(/[ۀة]/g, "ه").replace(/[أإآ]/g, "ا").replace(/ؤ/g, "و").replace(/ئ/g, "ی").replace(/[ًٌٍَُِّْٔ]/g, "")
  .replace(/[؟?!،,:;«»"'()\[\]]/g, " ").replace(/\s+/g, " ").trim();
const compact = s => s.replace(/\s+/g, "");
// Q wraps a question: has() matches keywords ignoring spaces and half-spaces; short words must match a whole token.
function Q(raw){
  const n = qn(raw), c = compact(n), toks = n.split(" ");
  const one = k => { const kn = qn(k); return kn.length <= 3 && !/\s/.test(kn) ? toks.some(t => t === kn || t === kn + "ها" || t === kn + "ی") : c.includes(compact(kn)); };
  const nums = (n.match(/\d+(?:\.\d+)?/g) || []).map(Number);
  const mult = /سه ?برابر/.test(n) ? 3 : /دو ?برابر|دوبل/.test(n) ? 2 : /نصف|(^| )نیم( |$)/.test(n) ? 0.5 : null;
  return { raw, n, toks, has: (...ks) => ks.some(one), all: (...gs) => gs.every(g => g.some(one)), nums, mult };
}

/* ---------- vocabulary ---------- */
const ALIAS = [
  [/دندان|دندون|ارتودنسی|ایمپلنت|عصب ?کشی|جرم ?گیری|کامپوزیت/, /دندان/], [/عینک|لنز|چشم ?پزشکی/, /عینک/], [/زایمان|سزارین|بارداری|طبیعی/, /زایمان/],
  [/بستری|بیمارستان/, /بستری/], [/جراحی|عمل جراحی/, /جراحی/], [/آزمایش|سونو|رادیولوژی|ام ?آر ?ای|mri|سی ?تی|تصویربرداری|پاراکلینیک|نوار قلب/, /پاراکلینیک|تشخیص/],
  [/ویزیت|دکتر|دارو|سرپایی|مطب/, /ویزیت|دارو|سرپایی/], [/فیزیوتراپی|فیزیو/, /فیزیو/], [/روانشناس|روانپزشک|مشاوره|روان/, /روان|مشاوره/],
  [/لیزیک|لیزر|انکسار/, /لیزیک|انکسار/], [/آمبولانس|اورژانس/, /آمبولانس|اورژانس/], [/سمعک|شنوایی/, /سمعک|شنوایی/],
  [/نازایی|ناباروری|ای ?وی ?اف|ivf/, /نازایی|ناباروری/], [/شیمی|سرطان|کموتراپی/, /سرطان|شیمی/], [/دیالیز/, /دیالیز/], [/پیوند/, /پیوند/],
];
function findCovs(q, rows, nameOf){
  // Exact name first, then a word of the name, then everyday aliases (e.g. «سونوگرافی» → پاراکلینیک).
  const qc = compact(q.n), info = rows.map(r => { const nm = qn(nameOf(r)); return { r, nm, words: nm.split(" ").filter(w => w.length >= 3 && !/^(هزینه|خدمات|پوشش)$/.test(w)) }; });
  const exact = info.filter(x => qc.includes(compact(x.nm)));
  if (exact.length) return exact.map(x => x.r);
  const word = info.filter(x => x.words.some(w => q.toks.some(t => t.length >= 3 && (t === w || t.startsWith(w) || (w.startsWith(t) && t.length >= 4)))));
  if (word.length) return word.map(x => x.r);
  return info.filter(x => ALIAS.some(([a, b]) => a.test(q.n) && b.test(x.nm))).map(x => x.r);
}
const DEC_WORDS = {
  increase: ["افزایش", "بالا ببر", "بالا بره", "بالا برود", "بیشتر کنیم", "زیاد کنیم", "بالاتر"],
  reduce: ["کاهش", "پایین", "کمتر کنیم", "کم کنیم", "کم بشه"],
  remove: ["حذف", "برداریم", "بی مصرف", "بیمصرف", "استفاده نشده", "بدون مصرف", "بدون خسارت"],
  protect: ["حمایتی", "حفظ"],
  keep: ["بدون تغییر", "ثابت", "دست نخورده", "تغییر نمی"],
  outlier: ["استثنا", "چشم پوشی", "چشمپوشی", "اغماض", "موردی"],
};
const decOf = q => Object.keys(DEC_WORDS).find(k => q.has(...DEC_WORDS[k]));
const ASKWORD = ["کدام", "کدوم", "چه پوشش", "چه آیتم", "لیست", "فهرست", "چندتا", "چند تا", "چند پوشش", "کجا", "کیا", "کدومش", "کدامش", "ها کدام", "هایی"];
const WHATIF = ["اگر", "اگه", "چی میشه", "چه میشود", "چه می شود", "چقدر میشه", "فرض کن", "بذاریم", "بگذاریم", "کنیم", "برسونیم", "برسانیم", "بشه", "شود"];
const WHY = ["چرا", "دلیل", "علت", "به چه دلیل", "چطور", "چگونه", "توضیح"];

const GLOSS = [
  [["loss ratio", "لاس", "ضریب خسارت", "نسبت خسارت", "lr"], "Loss Ratio یعنی چند درصد حق‌بیمه صرف خسارت شده: خسارت پرداختی ÷ حق‌بیمه. زیر ۷۵٪ برای بیمه‌گر سالم است، ۷۵ تا ۸۵٪ مرزی، و بالای ۸۵٪ زیان‌ده؛ بیمه‌گر در تمدید یا نرخ را بالا می‌برد یا سقف‌ها را پایین می‌آورد."],
  [["فشار سقف"], "فشار سقف یعنی چه سهمی از مبلغ تأییدشدهٔ یک پوشش فقط به خاطر رسیدن به سقف پرداخت نشده. یعنی کارکنان هزینه داشته‌اند و بیمه به خاطر سقف کم نداده. از ۵٪ به بالا پیشنهاد «افزایش سقف» می‌گیرد."],
  [["سقف سالانه"], "سقف سالانه حداکثر مبلغی است که بیمه در یک سال برای یک نفر در آن پوشش می‌پردازد، جمع همهٔ دفعات."],
  [["سقف هر مورد", "هر مورد"], "سقف هر مورد حداکثر پرداخت برای یک بار خدمت است؛ مثلاً هر بار زایمان یا هر عینک. ممکن است فرد به سقف سالانه نرسیده باشد ولی یک خدمت گران از سقف هر مورد بیشتر شود."],
  [["حمایتی"], "پوشش حمایتی برای رویدادهای نادر و پرهزینه است، مثل بستری، جراحی، زایمان و سرطان. اپ این‌ها را هیچ‌وقت کاندید حذف یا کاهش نمی‌کند، چون یک سال بدون خسارت یعنی شانس، نه بی‌نیازی."],
  [["کاندید حذف", "حذف"], "کاندید حذف پوشش روزمره‌ای است که در کل دوره هیچ خسارتی نداشته. حذفش حق‌بیمه را کمی پایین می‌آورد، یا می‌شود بودجه‌اش را به پوشش‌های پرفشار داد."],
  [["استثنا", "چشم پوشی", "چشمپوشی"], "مورد استثنایی یعنی فقط یک نفر به سقف خورده و بقیه فاصلهٔ زیادی تا سقف دارند. بالا بردن سقف همه برای یک نفر گران است؛ بهتر است کارفرما کمک موردی بدهد یا یک پوشش مازاد جدا بخرد."],
  [["اقتصادی"], "سناریوی اقتصادی: فقط پوشش‌های پرفشار سقف بالاتر می‌گیرند، کم‌مصرف‌ها کاهش و بی‌مصرف‌ها حذف می‌شوند. کمترین افزایش حق‌بیمه."],
  [["متعادل"], "سناریوی متعادل همهٔ پیشنهادهای اپ را با هم اجرا می‌کند: افزایش‌ها، کاهش‌ها و حذف‌ها. پیشنهاد اصلی برای جلسه است."],
  [["ممتاز"], "سناریوی ممتاز: افزایش‌ها ۲۰٪ بیشتر و بقیهٔ سقف‌ها هم‌پای تورم تعرفه بالا می‌روند؛ بدون کاهش و حذف. بیشترین رضایت کارکنان، بیشترین هزینه."],
  [["سناریو"], "اپ سه سناریو می‌سازد: اقتصادی، متعادل و ممتاز. در هر کدام خسارت سال گذشته با تورم تعرفه زیر سقف‌های جدید دوباره حساب می‌شود تا معلوم شود چه حق‌بیمه‌ای لازم است."],
  [["بودجه"], "بودجهٔ کارفرما یعنی حداکثر درصدی که کارفرما حاضر است حق‌بیمه را بالا ببرد. اپ آن را به سقف خسارت مجاز تبدیل می‌کند: حق‌بیمه × (۱ + بودجه) × Loss Ratio هدف."],
  [["سرانه"], "سرانه یعنی مبلغ به ازای هر نفر: حق‌بیمه یا خسارت تقسیم بر تعداد بیمه‌شدگان."],
  [["تورم", "تعرفه", "روند"], "روند تعرفه یعنی میانگین رشد تعرفهٔ خدمات در سال بعد. اپ خسارت امسال را با همین نرخ بالا می‌برد تا هزینهٔ سال قرارداد را برآورد کند."],
  [["سهم کارکنان", "پوشش نیاز", "نیاز کارکنان", "از جیب"], "پوشش نیاز کارکنان یعنی چند درصد از هزینهٔ درمانی که کارکنان داشته‌اند را بیمه داده. بقیه را خودشان از جیب پرداخته‌اند."],
  [["کف قیمت", "کف"], "کف قیمت کمترین قیمتی است که Loss Ratio برآوردی را دقیقاً روی هدف (۷۵٪) نگه می‌دارد: خسارت برآوردی ÷ ۷۵٪. زیر کف، ریسک ضرر بالا می‌رود."],
  [["حاشیه"], "حاشیهٔ اطمینان درصدی است که روی کف قیمت گذاشته می‌شود تا نوسان خسارت را بپوشاند. به‌طور خودکار از نوسان سال‌های سابقه، تعداد سال‌ها و حجم داده حساب می‌شود."],
  [["اطمینان", "کیفیت داده"], "سطح اطمینان داده از تعداد خسارت‌ها و طول دورهٔ داده می‌آید: بالای ۳۰۰ خسارت و ۲۴ ماه = بالا. با دادهٔ کم، پیشنهادهای حذف و کاهش را با احتیاط بگویید."],
];
const DEF_Q = ["چیست", "چیه", "یعنی چه", "یعنی چی", "منظور از", "تعریف", "مفهوم", "معنی"];
function glossary(q){
  if (!q.has(...DEF_Q)) return null;
  const g = GLOSS.find(([ks]) => q.has(...ks));
  return g ? { h: `<div>${g[1]}</div>`, src: ["قاعده: تعریف‌های اپ"] } : null;
}

/* ---------- answer rendering ---------- */
function aiCard(a, file){
  if (typeof a === "string") a = { h: a };
  const src = (a.src || []).map(s => s.replace("{file}", file || "فایل اکسل"));
  return `${a.h}${src.length ? `<div class="ai-src">${src.map(x => `<span>${esc(x)}</span>`).join("")}</div>` : ""}${a.next && a.next.length ? `<div class="ai-next">${a.next.map(x => `<button type="button" data-ask="${esc(x)}">${esc(x)}</button>`).join("")}</div>` : ""}`;
}
const ul = items => `<ul class="ai-ul">${items.map(x => `<li>${x}</li>`).join("")}</ul>`;
const capStr = r => r.d === "remove" ? "حذف" : r.newAnnual !== r.cv.annualCap ? `${fmtNum(r.cv.annualCap)} ← <b>${fmtNum(r.newAnnual)}</b>` : r.newPerCase !== r.cv.perCase ? `هر مورد ${fmtNum(r.cv.perCase)} ← <b>${fmtNum(r.newPerCase)}</b>` : `${fmtNum(r.cv.annualCap)} (بدون تغییر)`;
const isOutlier = r => r.why.some(w => w.includes("استثنایی"));
const RULE = () => ({ increase: `قاعده: فشار سقف ≥ ${fmtInt(state.settings.pressureHigh)}٪ ← افزایش سقف`, minor: `قاعده: فشار سقف ${fmtInt(state.settings.pressureMinor)} تا ${fmtInt(state.settings.pressureHigh)}٪ ← افزایش جزئی`,
  reduce: `قاعده: استفادهٔ کمتر از ${fmtInt(state.settings.lowUtil)}٪ افراد، پوشش روزمره ← کاهش`, remove: "قاعده: صفر خسارت و پوشش روزمره ← کاندید حذف",
  protect: "قاعده: پوشش حمایتی حذف یا کم نمی‌شود", keep: "قاعده: بدون فشار سقف و مصرف عادی ← بدون تغییر" });

/* ---------- group (renewal) brain ---------- */
function aiSuggest(A, S){
  const by = d => A.rows.find(r => r.d === d);
  const out = [];
  const inc = by("increase") || by("minor"); if (inc) out.push(`چرا ${inc.cv.name} باید بالا برود؟`);
  if (A.rows.some(r => r.d === "remove")) out.push("کدام پوشش‌ها را می‌شود حذف کرد؟");
  out.push("کدام پوشش‌ها بیشترین استفاده را داشته‌اند؟");
  if (inc && inc.cv.annualCap) out.push(`اگر سقف ${inc.cv.name} را دو برابر کنیم چه می‌شود؟`);
  out.push(`با بودجهٔ ${fmtInt(Math.round(S.budgetPct * 100) + 10)}٪ چه چیزی جا می‌شود؟`, "کدام سناریو را پیشنهاد می‌کنی؟", "برای جلسه با کارفرما چه بگویم؟");
  return out.slice(0, 6);
}
function aiAnswer(raw, A, S, g){
  const a = groupBrain(Q(raw), A, S, g) || fallback(A, S);
  return aiCard(a, g.file || (g.sample ? "دادهٔ نمونه" : "فایل اکسل"));
}
function fallback(A, S){
  return { h: `<div>این را دقیق نفهمیدم. می‌توانم دربارهٔ این‌ها جواب بدهم: هر پوشش (چرا، چقدر، اگر سقفش را عوض کنیم)، پرمصرف‌ها و کم‌مصرف‌ها، حذف و کاهش، فشار سقف و علت پرداخت‌نشده‌ها، بودجه (با هر درصد)، سناریوها، Loss Ratio، حق‌بیمهٔ لازم، تاریخ تمدید، کیفیت داده، و نکته‌های جلسه با کارفرما.</div>`,
    next: aiSuggest(A, S).slice(0, 3) };
}
function groupBrain(q, A, S, g){
  if (!q.n) return null;
  const rows = A.rows, name = r => r.cv.name, B = S.budget;
  if (q.has("سلام", "درود", "کمک", "راهنما", "چی بپرسم", "چه بپرسم", "چه سوال", "چکار میکنی", "چه کار می کنی", "چه کاری"))
    return { h: `<div>سلام. هرچه دربارهٔ تمدید <b>${esc(A.group.name)}</b> بپرسید، از روی همین فایل و قواعد اپ جواب می‌دهم و منبعش را می‌گویم. همه‌چیز روی همین دستگاه و بدون اینترنت حساب می‌شود.</div>`, next: aiSuggest(A, S).slice(0, 4) };
  const gl = glossary(q); if (gl && !findCovs(q, rows, name).length) return gl;

  // budget what-if: "با بودجهٔ ۳۰٪"
  const pctNum = q.nums.find(x => x > 0 && x <= 200);
  const covs = findCovs(q, rows, name);
  if (pctNum != null && q.has("بودجه") && !covs.length){
    const S2 = scenarios(A, pctNum / 100), B2 = S2.budget;
    return { h: `<div>با بودجهٔ <b>${fmtPct(pctNum / 100)}</b>، سقف خسارت مجاز <b>${fmtNum(B2.allowed)}</b> می‌شود. ${B2.fits ? (B2.picked.length ? `جا می‌شود: <b>${esc(B2.picked.join("، "))}</b>` : "هیچ افزایشی جا نمی‌شود") + (B2.skipped.length ? `؛ جا نمی‌شود: ${esc(B2.skipped.join("، "))}` : "") + "." : `حتی سقف‌های فعلی جا نمی‌شوند؛ کسری <b>${fmtNum(B2.paid - B2.allowed)}</b>.`}</div>
      <div class="small muted">برای مقایسه، بودجهٔ فعلی ${fmtPct(S.budgetPct)} است${B.picked.length ? ` و با آن ${esc(B.picked.join("، "))} جا می‌شود` : ""}. سناریوی متعادل ${S2.balanced.premiumChange != null ? `${fmtSignedPct(S2.balanced.premiumChange)} حق‌بیمه لازم دارد` : "با دادهٔ ناقص قابل تبدیل به حق‌بیمه نیست"}.</div>`,
      src: ["منبع: {file} · ۰۵_حق_بیمه و ۰۳_خسارت", `قاعده: حق‌بیمه × (۱ + بودجه) × ${fmtPct(A.targetLR)}؛ افزایش‌ها به ترتیب فشار سقف`], next: [`با بودجهٔ ${fmtInt(pctNum + 10)}٪ چه؟`, "کدام سناریو را پیشنهاد می‌کنی؟"] };
  }

  if (covs.length){
    const r = covs[0];
    // remove what-if
    if (q.has("حذف", "برداریم", "بردار") && (q.has(...WHATIF) || q.has("صرفه", "چقدر", "کم میشه", "کم می شود", "میشه"))){
      const now = r.costOf(r.cv.annualCap, r.cv.perCase, false).paid;
      const prem = A.complete && A.premiumNow ? now / A.targetLR : null;
      return { h: `<div>با حذف <b>${esc(name(r))}</b>، خسارت برآوردی سال بعد حدود <b>${fmtNum(now)}</b> کم می‌شود${prem != null ? `؛ یعنی حدود <b>${fmtNum(prem)}</b> حق‌بیمه (${fmtPct(prem / A.premiumNow)})` : ""}.</div>
        <div class="small muted">${r.protect ? "⚠️ این پوشش حمایتی است؛ اپ حذفش را پیشنهاد نمی‌کند. " : ""}${r.n ? `${fmtInt(r.users)} نفر از آن استفاده کرده‌اند (${fmtInt(r.n)} خسارت)؛ حذفش برای آن‌ها هزینه می‌سازد.` : "در این دوره خسارتی نداشته؛ صرفه‌جویی واقعی را بیمه‌گر از نرخ این پوشش تعیین می‌کند."}</div>`,
        src: ["منبع: {file} · ۰۳_خسارت", `قاعده: خسارت امسال × رشد تعرفه (${fmtPct(A.trend)})`], next: [`چرا ${name(r)} ${VERB[r.d]}؟`] };
    }
    // cap what-if
    const capNum = q.nums.find(x => x > 0);
    if ((capNum != null || q.mult) && q.has("سقف", ...WHATIF) && r.cv.annualCap != null){
      const target = q.mult ? r.cv.annualCap * q.mult : capNum;
      const per = r.cv.perCase != null && r.cv.perCase === r.cv.annualCap ? target : r.cv.perCase;
      const now = r.costOf(r.cv.annualCap, r.cv.perCase, false), nx = r.costOf(target, per, false);
      const d = nx.paid - now.paid, prem = A.complete && A.premiumNow ? d / A.targetLR : null;
      const range = r.cv.max != null && target > r.cv.max ? `<div class="small" style="color:var(--mid-ink)">بیشتر از حداکثر مجاز در فایل (${fmtNum(r.cv.max)}) است.</div>` : r.cv.min != null && target < r.cv.min ? `<div class="small" style="color:var(--mid-ink)">کمتر از حداقل مجاز در فایل (${fmtNum(r.cv.min)}) است.</div>` : "";
      return { h: `<div>اگر سقف سالانهٔ <b>${esc(name(r))}</b> از ${fmtNum(r.cv.annualCap)} به <b>${fmtNum(target)}</b> برسد، خسارت برآوردی این پوشش <b>${fmtNum(now.paid)} ← ${fmtNum(nx.paid)}</b> (${d >= 0 ? "+" : ""}${fmtNum(d)}) می‌شود${prem != null ? `؛ حدود <b>${fmtSignedPct(prem / A.premiumNow)}</b> روی حق‌بیمه` : ""}.</div>
        <div class="small muted">پوشش نیاز کارکنان در این پوشش: ${fmtPct(now.need ? now.paid / now.need : null)} ← ${fmtPct(nx.need ? nx.paid / nx.need : null)}. پیشنهاد اپ: ${capStr(r)}.</div>${range}`,
        src: ["منبع: {file} · ۰۳_خسارت (خسارت‌های امسال با سقف جدید دوباره حساب شد)", `قاعده: × رشد تعرفه ${fmtPct(A.trend)} · حق‌بیمه = خسارت ÷ ${fmtPct(A.targetLR)}`], next: [`اگر ${name(r)} را حذف کنیم چه می‌شود؟`] };
    }
    // compare two coverages
    if (covs.length >= 2 && q.has("مقایسه", "فرق", "تفاوت", "یا", "کدام", "کدوم")){
      return { h: `<table class="ai-t"><tr><th></th>${covs.slice(0, 3).map(x => `<th>${esc(name(x))}</th>`).join("")}</tr>
        <tr><td>خسارت / نفر</td>${covs.slice(0, 3).map(x => `<td>${fmtInt(x.n)} / ${fmtInt(x.users)}</td>`).join("")}</tr>
        <tr><td>پرداختی</td>${covs.slice(0, 3).map(x => `<td>${fmtNum(x.paid)}</td>`).join("")}</tr>
        <tr><td>فشار سقف</td>${covs.slice(0, 3).map(x => `<td>${x.capUnpaid ? fmtPct(x.pressure) : "—"}</td>`).join("")}</tr>
        <tr><td>پیشنهاد</td>${covs.slice(0, 3).map(x => `<td><span class="tag ${DTAG[x.d]}">${DLABEL[x.d]}</span></td>`).join("")}</tr></table>`, src: ["منبع: {file} · ۰۲_تعهدات و ۰۳_خسارت"] };
    }
    // explain one coverage
    return { h: `<div><b>${esc(name(r))}</b>: <span class="tag ${DTAG[r.d]}">${DLABEL[r.d]}</span> ${esc(r.why[0] || "")}</div>
      ${ul([`سقف: ${capStr(r)}${r.cv.perCase != null && r.cv.perCase !== r.cv.annualCap ? ` · هر مورد ${fmtNum(r.cv.perCase)}${r.newPerCase !== r.cv.perCase ? ` ← <b>${fmtNum(r.newPerCase)}</b>` : ""}` : ""}`,
        `${fmtInt(r.n)} خسارت از ${fmtInt(r.users)} نفر${r.util != null && A.complete ? ` (${fmtPct(r.util)} بیمه‌شدگان)` : ""} · پرداختی ${fmtNum(r.paid)} · ${fmtPct(r.paidShare)} کل خسارت`,
        r.capUnpaid ? `به خاطر سقف پرداخت نشده: <b>${fmtNum(r.capUnpaid)}</b> (فشار ${fmtPct(r.pressure)})` : "به خاطر سقف چیزی کم نشده",
        r.peakMember ? `بیشترین مصرف یک نفر: ${fmtNum(r.peakMember)}${r.cv.annualCap ? ` (${fmtPct(r.peakMember / r.cv.annualCap)} سقف)` : ""}` : null].concat(r.why.slice(1), r.notes).filter(Boolean).map(x => x.startsWith("<") || x.includes("<b>") ? x : esc(x)))}`,
      src: ["منبع: {file} · ۰۳_خسارت · ستون پرداختی و علت عدم پرداخت", RULE()[r.d]],
      next: [r.cv.annualCap ? `اگر سقف ${name(r)} را دو برابر کنیم؟` : null, r.d !== "protect" ? `اگر ${name(r)} را حذف کنیم؟` : null].filter(Boolean) };
  }

  // lists by decision
  const dec = decOf(q);
  if (dec && (q.has(...ASKWORD) || q.has("چه چیزی", "چیا", "موارد", "آیتم", "پوشش"))){
    const list = dec === "outlier" ? rows.filter(isOutlier) : rows.filter(r => r.d === dec || (dec === "increase" && r.d === "minor"));
    const title = { increase: "افزایش سقف", reduce: "کاهش سقف", remove: "کاندید حذف", protect: "حمایتی (حفظ می‌شوند)", keep: "بدون تغییر", outlier: "مورد استثنایی (چشم‌پوشی از افزایش)" }[dec];
    if (!list.length) return { h: `<div>در این گروه هیچ پوششی «${title}» نیست.</div>`, src: [RULE()[dec] || "قاعده: یک نفر به سقف خورده ← استثنایی"] };
    return { h: `<div><b>${fmtInt(list.length)} پوشش ${title}:</b></div>${ul(list.map(r => `<b>${esc(name(r))}</b>: ${capStr(r)} · <span class="muted">${esc(r.why[0] || "")}</span>`))}`,
      src: ["منبع: {file} · ۰۲_تعهدات و ۰۳_خسارت", dec === "outlier" ? "قاعده: فقط یک نفر به سقف خورده و ≥ ۱۰ استفاده‌کننده" : RULE()[dec]], next: list.slice(0, 2).map(r => `چرا ${name(r)} ${VERB[r.d]}؟`) };
  }

  // usage ranking
  const low = q.has("کمترین", "کم مصرف", "کممصرف", "کمتر استفاده", "استفاده نشده", "کم استفاده", "استفاده نکرده");
  if (low || q.has("بیشترین", "پرمصرف", "پر مصرف", "بیشتر استفاده", "زیاد استفاده", "پرهزینه", "پر هزینه", "گران ترین", "بیشترین خسارت", "بیشترین هزینه")){
    if (!q.has("نفر", "فرد", "عضو", "کارمند", "شخص") || q.has("پوشش", "آیتم")){
      const by = q.has("نفر", "تعداد") && !q.has("مبلغ", "هزینه") ? "users" : "paid";
      const sorted = rows.slice().sort((a, b) => low ? a[by] - b[by] || a.n - b.n : b[by] - a[by]).slice(0, low ? 4 : 3);
      return { h: `<div>${low ? "کم‌مصرف‌ترین" : "پرمصرف‌ترین"} پوشش‌ها (بر اساس ${by === "paid" ? "مبلغ پرداختی" : "تعداد استفاده‌کننده"}):</div>${ul(sorted.map(r => `<b>${esc(name(r))}</b>: ${fmtNum(r.paid)} پرداختی · ${fmtInt(r.users)} نفر · ${fmtPct(r.paidShare)} کل · <span class="tag ${DTAG[r.d]}">${DLABEL[r.d]}</span>`))}`,
        src: ["منبع: {file} · ۰۳_خسارت · جمع پرداختی هر پوشش"], next: [low ? "کدام پوشش‌ها را می‌شود حذف کرد؟" : "فشار سقف کجا بیشتر است؟"] };
    }
  }
  // people
  if (q.has("نفر", "فرد", "عضو", "کارمند", "شخص", "افراد") && q.has("بیشترین", "پرهزینه", "پر هزینه", "بیشتر", "کدام", "کدوم", "کی")){
    const m = new Map(); g.data.claims.forEach(c => { const k = c.member || c.id; m.set(k, (m.get(k) || 0) + c.approved); });
    const top = [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5), tot = sum([...m.values()]);
    return { h: `<div>پنج نفر با بیشترین مبلغ تأییدشده (با شناسهٔ عضو، بدون نام):</div>${ul(top.map(([k, v]) => `<span class="ltr">${esc(k)}</span>: ${fmtNum(v)} (${fmtPct(v / tot)} کل)`))}<div class="small muted">این ${fmtInt(top.length)} نفر ${fmtPct(sum(top, x => x[1]) / tot)} کل خسارت را ساخته‌اند.</div>`,
      src: ["منبع: {file} · ۰۳_خسارت · ستون Member_ID و مبلغ تأییدشده"] };
  }
  // cap pressure
  if (q.has("فشار", "به سقف", "سقف کم", "کم آورد", "کمبود سقف", "سقفش کمه", "سقف کافی")){
    const list = rows.filter(r => r.capUnpaid > 0).sort((a, b) => b.capUnpaid - a.capUnpaid);
    if (!list.length) return { h: "<div>در هیچ پوششی به خاطر سقف چیزی کم پرداخت نشده.</div>", src: ["منبع: {file} · ۰۳_خسارت · علت عدم پرداخت"] };
    return { h: `<div>جاهایی که سقف کم آمده (مبلغ پرداخت‌نشده به خاطر سقف):</div>${ul(list.slice(0, 5).map(r => `<b>${esc(name(r))}</b>: ${fmtNum(r.capUnpaid)} · فشار ${fmtPct(r.pressure)} · ${capStr(r)}`))}<div class="small muted">جمع: ${fmtNum(sum(list, r => r.capUnpaid))}؛ این مبلغ را کارکنان از جیب داده‌اند.</div>`,
      src: ["منبع: {file} · ۰۳_خسارت · علت عدم پرداخت «سقف»", RULE().increase] };
  }
  // unpaid reasons
  if (q.has("پرداخت نشده", "پرداختنشده", "عدم پرداخت", "غیرقابل پرداخت", "غیر قابل پرداخت", "رد شده", "پرداخت نکرده", "کسر")){
    const m = new Map(); g.data.claims.filter(c => c.unpaid > 0).forEach(c => { const k = c.reason || "بدون علت"; m.set(k, (m.get(k) || 0) + c.unpaid); });
    const list = [...m.entries()].sort((a, b) => b[1] - a[1]), tot = sum(list, x => x[1]);
    if (!list.length) return { h: "<div>همهٔ خسارت‌های تأییدشده کامل پرداخت شده‌اند.</div>", src: ["منبع: {file} · ۰۳_خسارت"] };
    return { h: `<div>جمع پرداخت‌نشده: <b>${fmtNum(tot)}</b>. به تفکیک علت:</div>${ul(list.slice(0, 6).map(([k, v]) => `${esc(k)}: <b>${fmtNum(v)}</b> (${fmtPct(v / tot)})`))}<div class="small muted">فقط بخش «سقف» با تغییر قرارداد حل می‌شود؛ بقیه (مدارک، خارج از تعهد، …) را باید با بیمه‌گر یا کارکنان پیگیری کرد.</div>`,
      src: ["منبع: {file} · ۰۳_خسارت · ستون علت عدم پرداخت"] };
  }
  // scenarios
  const scnKey = q.has("اقتصادی") ? "economy" : q.has("متعادل") ? "balanced" : q.has("ممتاز") ? "premium" : null;
  const scnRow = k => { const s = S[k], fits = s.paid <= B.allowed + 1e-9; return `<b>${SCN.find(x => x[0] === k)[1]}</b>: خسارت ${fmtNum(s.paid)} (${fmtSignedPct(s.change)}) · حق‌بیمه ${s.premiumChange != null ? fmtSignedPct(s.premiumChange) : "—"} · پوشش نیاز ${fmtPct(s.cover)} · ${fits ? "در بودجه" : "بیش از بودجه"}`; };
  if (scnKey && !q.has("یعنی", "چیست", "چیه")){
    const s = S[scnKey];
    const ch = rows.map((r, i) => ({ r, c: s.caps[i] })).filter(({ r, c }) => c.removed || c.annual !== r.cv.annualCap);
    return { h: `<div>${scnRow(scnKey)}.</div>${ch.length ? ul(ch.map(({ r, c }) => `${esc(name(r))}: ${c.removed ? "حذف" : `${fmtNum(r.cv.annualCap)} ← ${fmtNum(c.annual)}`}`)) : ""}`,
      src: ["منبع: {file} · ۰۳_خسارت و ۰۶_تعرفه", `قاعده: خسارت امسال × رشد تعرفه (${fmtPct(A.trend)}) زیر سقف‌های سناریو`], next: ["کدام سناریو را پیشنهاد می‌کنی؟"] };
  }
  if (q.has("سناریو", "کدام گزینه", "بهترین", "پیشنهادت", "پیشنهاد میکنی", "پیشنهاد می کنی", "توصیه")){
    const fit = ["balanced", "economy", "premium"].filter(k => S[k].paid <= B.allowed + 1e-9);
    const pick = fit.includes("balanced") ? "balanced" : fit[0] || "economy";
    return { h: `${ul(["economy", "balanced", "premium"].map(scnRow))}<div>پیشنهاد: <b>${SCN.find(x => x[0] === pick)[1]}</b>. ${pick === "balanced" ? "همهٔ مشکلات سقف حل می‌شود و در بودجه هم جا می‌شود." : fit.length ? "سناریوی متعادل از بودجه بیرون می‌زند؛ این گزینه در بودجه می‌ماند." : "هیچ سناریویی در بودجهٔ فعلی جا نمی‌شود؛ یا بودجه باید بالا برود یا بخشی از افزایش‌ها حذف شود."}</div>`,
      src: [`منبع: بودجهٔ کارفرما ${fmtPct(S.budgetPct)} · سقف خسارت مجاز ${fmtNum(B.allowed)}`, "قاعده: اولویت با متعادل اگر در بودجه باشد"], next: ["برای جلسه با کارفرما چه بگویم؟"] };
  }
  // budget (no number)
  if (q.has("بودجه")){
    return { h: `<div>بودجهٔ کارفرما <b>${fmtPct(S.budgetPct)}</b> است؛ یعنی سقف خسارت مجاز <b>${fmtNum(B.allowed)}</b>. ${B.fits ? (B.picked.length ? `جا می‌شود: <b>${esc(B.picked.join("، "))}</b>.` : "هیچ افزایشی جا نمی‌شود.") + (B.skipped.length ? ` جا نمی‌شود: ${esc(B.skipped.join("، "))}.` : "") : `حتی سقف‌های فعلی جا نمی‌شوند؛ کسری <b>${fmtNum(B.paid - B.allowed)}</b>.`}</div>`,
      src: ["منبع: {file} · ۰۱_جمعیت · بودجه افزایش حق‌بیمه", `قاعده: حق‌بیمه × (۱ + بودجه) × ${fmtPct(A.targetLR)}`], next: [`با بودجهٔ ${fmtInt(Math.round(S.budgetPct * 100) + 10)}٪ چه؟`] };
  }
  // premium needed
  if (q.has("حق بیمه", "حقبیمه", "نرخ", "قیمت تمدید", "چقدر گران", "چقدر افزایش")){
    const c = S.current, b = S.balanced;
    if (c.premiumChange == null) return { h: `<div>دادهٔ خسارت امسال ناقص است، پس حق‌بیمهٔ لازم قابل محاسبهٔ دقیق نیست. خسارت با سقف‌های فعلی ${fmtSignedPct(c.change)} و با سناریوی متعادل ${fmtSignedPct(b.change)} تغییر می‌کند.</div>`, src: ["منبع: {file} · ۰۳_خسارت"] };
    return { h: `<div>برای ماندن روی Loss Ratio ${fmtPct(A.targetLR)}:</div>${ul([`با سقف‌های فعلی: <b>${fmtNum(c.premiumNeeded)}</b> (${fmtSignedPct(c.premiumChange)})`, `با سناریوی متعادل: <b>${fmtNum(b.premiumNeeded)}</b> (${fmtSignedPct(b.premiumChange)})`, `حق‌بیمهٔ فعلی: ${fmtNum(A.premiumNow)} · سرانه ${fmtNum(A.premiumNow / A.insured)}`])}`,
      src: ["منبع: {file} · ۰۵_حق_بیمه", `قاعده: حق‌بیمهٔ لازم = خسارت برآوردی ÷ ${fmtPct(A.targetLR)}`] };
  }
  // loss ratio
  if (q.has("loss", "لاس", "ضریب خسارت", "نسبت خسارت", "ratio", "زیان", "ضرر", "سود")){
    const lr = A.lr ?? A.priorLr, st = lrStat(lr);
    return { h: `<div>Loss Ratio = خسارت پرداختی ÷ حق‌بیمه = <b>${fmtNum(A.totalPaid)} ÷ ${fmtNum(A.premiumNow)} = ${fmtPct(lr)}</b>${A.lr == null ? ` (دادهٔ امسال ناقص است؛ عدد ${A.prior ? A.prior.label : "سال قبل"})` : ""}. ${st ? `وضعیت: <b>${st[1]}</b>.` : ""}</div>${A.priorLr != null && A.lr != null ? `<div class="small muted">${A.prior.label}: ${fmtPct(A.priorLr)}.</div>` : ""}`,
      src: ["منبع: {file} · ۰۳_خسارت · ستون پرداختی", "منبع: {file} · ۰۵_حق_بیمه", `قاعده: زیر ${fmtPct(A.targetLR)} سالم · بالای ۸۵٪ زیان‌ده`] };
  }
  if (q.has("سهم کارکنان", "از جیب", "پوشش نیاز", "رضایت")){
    return { h: `<div>الان بیمه <b>${fmtPct(S.current.cover)}</b> هزینهٔ درمانی کارکنان را پرداخته؛ یعنی <b>${fmtPct(1 - S.current.cover)}</b> از جیب خودشان. با سناریوی متعادل: ${fmtPct(S.balanced.cover)} و با ممتاز: ${fmtPct(S.premium.cover)}.</div>`, src: ["منبع: {file} · ۰۳_خسارت · تأییدشده و پرداختی"] };
  }
  if (q.has("تمدید", "سررسید", "پایان قرارداد", "تموم", "تمام می", "مانده", "چند روز")){
    const r = A.renewal;
    return { h: r ? `<div>قرارداد <b>${esc(r.end)}</b> تمام می‌شود؛ ${r.days < 0 ? `<b>${fmtInt(-r.days)} روز گذشته</b>` : `<b>${fmtInt(r.days)} روز</b> مانده`}. ${r.days >= 0 && r.days <= 30 ? "پیشنهاد را همین هفته برای کارفرما بفرستید." : ""}</div>` : "<div>تاریخ پایان قرارداد در فایل نیست.</div>", src: ["منبع: {file} · ۰۱_جمعیت · دورهٔ قرارداد"] };
  }
  if (q.has("کیفیت", "مشکل", "خطا", "ناقص", "اطمینان", "معتبر", "درسته", "درست است", "ایراد")){
    const iss = A.issues;
    return { h: `<div>سطح اطمینان داده: <b>${LVL[A.level][1]}</b> (${fmtInt(A.claimsCount)} خسارت در ${fmtInt(A.span)} ماه).</div>${iss.length ? ul(iss.slice(0, 5).map(x => `<span class="tag ${SEVTAG[x.sev][0]}">${SEVTAG[x.sev][1]}</span> ${esc(x.text)}`)) : "<div>مشکلی پیدا نشد.</div>"}`, src: ["قاعده: بررسی‌های کیفیت دادهٔ اپ"] };
  }
  if (q.has("تورم", "تعرفه", "روند")) return { h: `<div>روند تعرفهٔ سال بعد: <b>${fmtPct(A.trend)}</b>. همهٔ برآوردها خسارت امسال را با این نرخ بالا برده‌اند.</div>`, src: ["منبع: {file} · ۰۶_تعرفه"] };
  if (q.has("سرانه")) return { h: `<div>سرانهٔ حق‌بیمه: <b>${fmtNum(A.premiumNow && A.insured ? A.premiumNow / A.insured : null)}</b> · سرانهٔ خسارت: <b>${fmtNum(A.insured ? A.totalPaid / A.insured : null)}</b> (برای ${fmtInt(A.insured)} نفر).</div>`, src: ["منبع: {file} · ۰۱_جمعیت و ۰۵_حق_بیمه"] };
  if (q.has("چند نفر", "جمعیت", "بیمه شده", "نفرات", "تعداد افراد", "کارکنان")) return { h: `<div><b>${fmtInt(A.insured)}</b> بیمه‌شده${A.group.female != null ? ` · ${fmtPct(A.group.female)} زن` : ""}.</div>`, src: ["منبع: {file} · ۰۱_جمعیت"] };
  if (q.has("چند خسارت", "تعداد خسارت", "جمع خسارت", "کل خسارت")) return { h: `<div>${fmtInt(A.claimsCount)} خسارت؛ تأییدشده ${fmtNum(A.totalApproved)}، پرداختی <b>${fmtNum(A.totalPaid)}</b>، پرداخت‌نشده ${fmtNum(A.totalUnpaid)}.</div>`, src: ["منبع: {file} · ۰۳_خسارت"] };
  if (q.has("نامه")) return { h: `<div>نامهٔ پیشنهاد تمدید از روی همین تحلیل آماده است.</div><button class="btn" type="button" onclick="document.getElementById('letterBtn').click()">باز کردن نامه</button>` };
  // summary / meeting
  if (q.has("خلاصه", "وضعیت", "گزارش", "چه کنم", "چکار کنم", "چی کار کنم", "جلسه", "مذاکره", "کارفرما", "بگم", "بگویم", "استدلال", "نتیجه")){
    const cnt = d => rows.filter(r => r.d === d), lr = A.lr ?? A.priorLr;
    const pts = [
      lr != null ? `Loss Ratio ${fmtPct(lr)} (${lrStat(lr)[1]})؛ ${S.current.premiumChange != null ? `حتی بدون تغییر سقف‌ها حق‌بیمه باید ${fmtSignedPct(S.current.premiumChange)} تغییر کند.` : ""}` : null,
      cnt("increase").concat(cnt("minor")).length ? `کارکنان در ${esc(cnt("increase").concat(cnt("minor")).map(name).join("، "))} به سقف خورده‌اند؛ جمعاً ${fmtNum(sum(rows, r => r.capUnpaid))} از جیب داده‌اند.` : null,
      cnt("remove").length || cnt("reduce").length ? `صرفه‌جویی: ${esc(cnt("remove").map(name).concat(cnt("reduce").map(name)).join("، "))} کم‌مصرف یا بی‌مصرف‌اند.` : null,
      rows.some(isOutlier) ? `${esc(rows.filter(isOutlier).map(name).join("، "))}: فقط یک مورد استثنایی؛ افزایش سقف همه لازم نیست.` : null,
      `پیشنهاد: سناریوی متعادل ${S.balanced.premiumChange != null ? `با ${fmtSignedPct(S.balanced.premiumChange)} حق‌بیمه` : ""}؛ پوشش نیاز کارکنان ${fmtPct(S.current.cover)} ← ${fmtPct(S.balanced.cover)}.`,
      `بودجهٔ ${fmtPct(S.budgetPct)} ${B.fits ? (B.picked.length ? `برای ${esc(B.picked.join("، "))} کافی است.` : "فقط کاهش‌ها را می‌پوشاند.") : "حتی برای حفظ وضع فعلی کافی نیست."}`,
    ].filter(Boolean);
    return { h: `<div>نکته‌های کلیدی برای جلسه با کارفرمای <b>${esc(A.group.name)}</b>:</div>${ul(pts)}`, src: ["منبع: کل تحلیل همین فایل"], next: ["نامهٔ پیشنهاد تمدید", "کدام سناریو را پیشنهاد می‌کنی؟"] };
  }
  if (dec) { // a decision word without a list word: "حذف" alone
    return groupBrain(Q(raw2(q) + " کدام پوشش‌ها"), A, S, g);
  }
  return gl;
}
const raw2 = q => q.raw;

/* ---------- tender brain ---------- */
function tenderSuggest(R){
  const inc = R.rows.find(r => r.d === "increase"), gr = R.rows.find(r => r.d === "growth");
  return ["این قیمت چطور ساخته شد؟", `اگر ${fmtInt(Math.round(R.floor * 0.95 / 100) * 100)} پیشنهاد بدهیم ریسکش چیست؟`, R.priorScaled ? "بیمه‌گر قبلی چه وضعی داشت؟" : null,
    gr ? `چرا ${gr.cv.name} گران شده؟` : "کدام پوشش‌ها گران‌تر شده‌اند؟", inc ? `چرا ${inc.cv.name} امتیاز است؟` : null, "حاشیهٔ اطمینان از کجا آمده؟"].filter(Boolean).slice(0, 5);
}
function tenderAnswer(raw, R, t){
  const q = Q(raw), file = t.file || (t.sample ? "دادهٔ نمونه" : "فایل اکسل");
  return aiCard(tenderBrain(q, R, t) || { h: "<div>این را دقیق نفهمیدم. دربارهٔ قیمت پیشنهادی، کف قیمت، ریسک یک قیمت مشخص، حاشیهٔ اطمینان، بیمه‌گر قبلی، رشد پوشش‌ها، سابقه و کیفیت داده بپرسید.</div>", next: tenderSuggest(R).slice(0, 3) }, file);
}
function tenderBrain(q, R, t){
  if (!q.n) return null;
  const gl = glossary(q); if (gl) return gl;
  const last = R.hist[R.hist.length - 1];
  const big = q.nums.filter(x => x >= 1000);
  if (big.length){
    const v = big[0], z = RISK[R.risk(v)[0]];
    return { h: `<div>با قیمت <b>${fmtNum(v)}</b>: Loss Ratio مورد انتظار <b>${fmtPct(R.expected / v)}</b> · ریسک <span class="tag ${z[3]}">${z[1]}</span></div>${ul([`کف قیمت (LR ${fmtPct(R.LR)}): ${fmtNum(R.floor)} · ${v >= R.floor ? `${fmtNum(v - R.floor)} بالاتر` : `${fmtNum(R.floor - v)} پایین‌تر`}`, `قیمت پیشنهادی اپ: ${fmtNum(R.price)}`, R.priorScaled ? `بیمه‌گر قبلی: ${fmtNum(R.priorScaled)} · ${v < R.priorScaled ? `${fmtPct(1 - v / R.priorScaled)} ارزان‌تر` : `${fmtPct(v / R.priorScaled - 1)} گران‌تر`}` : null, `سرانه: ${fmtNum(v / R.insuredNext)}`].filter(Boolean))}`,
      src: ["منبع: {file} · سابقهٔ خسارت", `قاعده: LR = ${fmtNum(R.expected)} ÷ قیمت`] };
  }
  if (q.has("حاشیه", "اطمینان", "مارجین", "margin")){
    const parts = [`پایه ۳٪`, `نصف نوسان سال‌ها (${fmtPct(R.vol)}) = ${fmtPct(R.vol / 2)}`, R.n === 1 ? "+۵٪ چون فقط یک سال سابقه هست" : null, R.claimsLast < 300 ? "+۵٪ چون دادهٔ خسارت کم است" : null].filter(Boolean);
    return { h: `<div>حاشیهٔ ${t.margin == null ? "خودکار" : "دستی"}: <b>${fmtPct(R.margin)}</b>${t.margin != null ? ` (خودکار بود ${fmtPct(R.autoMargin)})` : ""}.</div>${t.margin == null ? ul(parts) + '<div class="small muted">بین ۳٪ تا ۲۵٪ محدود می‌شود.</div>' : ""}`, src: ["قاعده: حاشیهٔ خودکار اپ"] };
  }
  if (q.has("چطور", "چگونه", "محاسبه", "ساخته", "از کجا", "فرمول", "چرا این قیمت", "قیمت پیشنهادی")){
    return { h: `<div>قیمت در چهار قدم:</div>${ul([`سرانهٔ خسارت هر سال: ${R.hist.map(h => fmtNum(h.pc)).join(" · ")}`, `با تورم ${fmtPct(R.trend)} به سال قرارداد و میانگین وزنی (سال آخر وزن بیشتر)`, `× ${fmtInt(R.insuredNext)} نفر = خسارت برآوردی <b>${fmtNum(R.expected)}</b>`, `÷ ${fmtPct(R.LR)} = کف <b>${fmtNum(R.floor)}</b>؛ + حاشیه ${fmtPct(R.margin)} = <b>${fmtNum(R.price)}</b>`])}`,
      src: ["منبع: {file} · سابقهٔ خسارت و جمعیت", "قاعده: وزن سال‌ها ۴۰/۶۰ یا ۲۰/۳۰/۵۰"] };
  }
  if (q.has("قبلی", "بیمه گر قبل", "بیمهگر قبل", "رقیب", "قبلا", "سال قبل")){
    if (!R.priorScaled) return { h: "<div>حق‌بیمهٔ بیمه‌گر قبلی در فایل نیست.</div>" };
    return { h: `<div>بیمه‌گر قبلی (برای ${fmtInt(R.insuredNext)} نفر): <b>${fmtNum(R.priorScaled)}</b>؛ Loss Ratio سال آخرش <b>${fmtPct(last.lr)}</b> (${lrStat(last.lr)[1]}).</div><div>${R.priorScaled < R.floor ? `قیمت او زیر کف است؛ اگر تکرارش کنید LR شما ${fmtPct(R.expected / R.priorScaled)} می‌شود.` : `می‌توانید تا ${fmtPct(1 - R.floor / R.priorScaled)} ارزان‌تر از او بدهید و هنوز روی هدف بمانید.`}</div>`,
      src: ["منبع: {file} · حق‌بیمه و خسارت سال‌های سابقه"] };
  }
  if (q.has("ریسک", "خطر")){
    return { h: `${ul([`<span class="tag t-good">کم</span> بالای ${fmtNum(R.floor)} (LR ≤ ${fmtPct(R.LR)})`, `<span class="tag t-mid">متوسط</span> ${fmtNum(R.floor85)} تا ${fmtNum(R.floor)} (LR تا ۸۵٪)`, `<span class="tag t-bad">زیاد</span> زیر ${fmtNum(R.floor85)}`])}`, src: [`قاعده: LR = ${fmtNum(R.expected)} ÷ قیمت`] };
  }
  const covs = findCovs(q, R.rows, r => r.cv.name);
  if (covs.length){
    const r = covs[0];
    return { h: `<div><b>${esc(r.cv.name)}</b>: <span class="tag ${TTAG[r.d]}">${TLABEL[r.d]}</span> ${esc(r.why)}</div>${ul([`سرانه در سال‌ها: ${r.per.map(p => fmtNum(p.pc)).join(" · ")}`, `سرانهٔ برآوردی: <b>${fmtNum(r.projPc)}</b>${r.growth != null ? ` · رشد ${fmtSignedPct(r.growth)}` : ""}`, `سقف قبلی ${fmtNum(r.oldCap)} ← جدید ${fmtNum(r.cv.annualCap)}`, r.capCost ? `هزینهٔ بالا بردن سقف: حدود ${fmtNum(r.capCost)} حق‌بیمه` : null].filter(Boolean))}`, src: ["منبع: {file} · سابقهٔ خسارت به تفکیک پوشش"] };
  }
  if (q.has("گران", "رشد", "سریع", "افزایش", "بیشترین")){
    const list = R.rows.filter(r => r.growth != null).sort((a, b) => b.growth - a.growth).slice(0, 4);
    return { h: `<div>بیشترین رشد سرانه (تورم تعرفه ${fmtPct(R.trend)}):</div>${ul(list.map(r => `<b>${esc(r.cv.name)}</b>: ${fmtSignedPct(r.growth)} · سرانه ${fmtNum(r.projPc)}`))}`, src: ["منبع: {file} · سابقهٔ خسارت"] };
  }
  if (q.has("سابقه", "سال", "تاریخچه")) return { h: ul(R.hist.map(h => `${fmtInt(h.year).replace(/٬/g, "")}: ${fmtInt(h.insured)} نفر · خسارت ${fmtNum(h.paid)} · حق‌بیمه ${fmtNum(h.premium)} · LR ${fmtPct(h.lr)}`)), src: ["منبع: {file} · سابقه"] };
  if (q.has("کیفیت", "مشکل", "خطا", "ناقص")) return { h: R.issues.length ? ul(R.issues.map(x => `<span class="tag ${SEVTAG[x.sev][0]}">${SEVTAG[x.sev][1]}</span> ${esc(x.text)}`)) : "<div>مشکلی پیدا نشد.</div>" };
  if (q.has("کف")) return { h: `<div>کف قیمت: <b>${fmtNum(R.floor)}</b> = خسارت برآوردی ${fmtNum(R.expected)} ÷ ${fmtPct(R.LR)}.</div>` };
  if (q.has("سرانه")) return { h: `<div>سرانهٔ پیشنهادی: <b>${fmtNum(R.price / R.insuredNext)}</b> · سرانهٔ خسارت برآوردی: ${fmtNum(R.expected / R.insuredNext)}.</div>` };
  return null;
}

/* ---------- portfolio brain (home) ---------- */
function portfolioSuggest(){
  return ["کدام گروه‌ها زیان‌ده‌اند؟", "تمدیدهای نزدیک کدام‌اند؟", "کدام گروه‌ها بودجه‌شان کافی نیست؟", "دندانپزشکی در همهٔ گروه‌ها چه وضعی دارد؟", "خلاصهٔ پرتفوی"];
}
function portfolioAnswer(raw){
  const all = state.groups.map((g, i) => Object.assign({ i, g }, compute(g)));
  const q = Q(raw);
  return aiCard(portfolioBrain(q, all) || { h: "<div>این را دقیق نفهمیدم. دربارهٔ گروه‌های زیان‌ده، تمدیدهای نزدیک، بودجه‌های ناکافی، یک پوشش در همهٔ گروه‌ها، یا نام یک گروه بپرسید.</div>", next: portfolioSuggest().slice(0, 3) }, "همهٔ فایل‌ها");
}
function portfolioBrain(q, all){
  if (!q.n) return null;
  const nm = x => esc(short(x.A.group.name)), open = x => `<button class="ai-link" type="button" data-open="${x.i}">${nm(x)}</button>`;
  const gl = glossary(q); if (gl) return gl;
  // a group by name
  const named = all.filter(x => { const w = qn(short(x.A.group.name)).split(" ").filter(s => s.length >= 3 && !/^(شرکت|گروه|نمونه)$/.test(s)); return w.some(s => q.toks.some(t => t.length >= 3 && (t.startsWith(s.slice(0, 4)) || s.startsWith(t)))); });
  // a coverage across groups
  const covHits = all.map(x => ({ x, r: findCovs(q, x.A.rows, r => r.cv.name)[0] })).filter(y => y.r);
  if (covHits.length && (!named.length || q.has("همه", "گروه ها", "گروهها", "تمام", "کل"))){
    return { h: `<div><b>${esc(covHits[0].r.cv.name)}</b> در ${fmtInt(covHits.length)} گروه:</div>${ul(covHits.map(({ x, r }) => `${open(x)}: <span class="tag ${DTAG[r.d]}">${DLABEL[r.d]}</span> ${capStr(r)}${r.capUnpaid ? ` · فشار ${fmtPct(r.pressure)}` : ""}`))}`, src: ["منبع: فایل هر گروه · ۰۳_خسارت"] };
  }
  if (named.length === 1){
    const x = named[0], A = x.A, S = x.S, st = lrStat(A.lr ?? A.priorLr);
    const c = d => A.rows.filter(r => r.d === d).length;
    return { h: `<div>${open(x)}: ${fmtInt(A.insured)} نفر · Loss Ratio ${fmtPct(A.lr ?? A.priorLr)}${st ? ` (${st[1]})` : ""} · ${A.renewal ? (A.renewal.days < 0 ? `${fmtInt(-A.renewal.days)} روز از تمدید گذشته` : `تمدید ${fmtInt(A.renewal.days)} روز دیگر`) : ""}</div>${ul([`${fmtInt(c("increase") + c("minor"))} افزایش · ${fmtInt(c("reduce"))} کاهش · ${fmtInt(c("remove"))} حذف`, `سناریوی متعادل: ${S.balanced.premiumChange != null ? fmtSignedPct(S.balanced.premiumChange) : "—"} حق‌بیمه · بودجه ${fmtPct(S.budgetPct)} ${S.budget.fits ? "کافی" : "ناکافی"}`])}<div class="small muted">برای جزئیات، روی نام گروه بزنید.</div>`, src: [`منبع: ${x.g.file || "دادهٔ نمونه"}`] };
  }
  if (q.has("مناقصه")){
    const ts = state.tenders.map((t, i) => ({ i, R: computeTender(t) }));
    return { h: ul(ts.map(({ i, R }) => `<button class="ai-link" type="button" data-tender="${i}">${esc(short(R.group.name))}</button>: قیمت پیشنهادی ${fmtNum(R.price)}${R.priorScaled ? ` · بیمه‌گر قبلی ${fmtNum(R.priorScaled)} (ریسک ${RISK[R.risk(R.priorScaled)[0]][1]})` : ""}`)), src: ["منبع: سابقهٔ هر مناقصه"] };
  }
  if (q.has("زیان", "ضرر", "loss", "لاس", "بحرانی", "بد", "خطرناک", "مرزی")){
    const list = all.filter(x => (x.A.lr ?? x.A.priorLr) != null).sort((a, b) => (b.A.lr ?? b.A.priorLr) - (a.A.lr ?? a.A.priorLr));
    const bad = list.filter(x => (x.A.lr ?? x.A.priorLr) >= 0.75);
    return { h: bad.length ? `<div>${fmtInt(bad.length)} گروه بالای ۷۵٪:</div>${ul(bad.map(x => `${open(x)}: <b style="color:${lrStat(x.A.lr ?? x.A.priorLr)[2]}">${fmtPct(x.A.lr ?? x.A.priorLr)}</b> ${lrStat(x.A.lr ?? x.A.priorLr)[1]}`))}` : "<div>هیچ گروهی بالای ۷۵٪ نیست.</div>", src: ["قاعده: زیر ۷۵٪ سالم · ۷۵ تا ۸۵٪ مرزی · بالای ۸۵٪ زیان‌ده"] };
  }
  if (q.has("تمدید", "نزدیک", "سررسید", "مانده", "فوری")){
    const list = all.filter(x => x.A.renewal).sort((a, b) => a.A.renewal.days - b.A.renewal.days).slice(0, 5);
    return { h: ul(list.map(x => `${open(x)}: ${x.A.renewal.days < 0 ? `<b style="color:var(--bad)">${fmtInt(-x.A.renewal.days)} روز گذشته</b>` : `${fmtInt(x.A.renewal.days)} روز`} (${esc(x.A.renewal.end)})`)), src: ["منبع: دورهٔ قرارداد هر گروه"] };
  }
  if (q.has("بودجه")){
    const bad = all.filter(x => !x.S.budget.fits);
    return { h: bad.length ? `<div>${fmtInt(bad.length)} گروه با بودجهٔ ناکافی:</div>${ul(bad.map(x => `${open(x)}: بودجه ${fmtPct(x.S.budgetPct)}، لازم ${x.S.current.premiumChange != null ? fmtSignedPct(x.S.current.premiumChange) : "—"}`))}` : "<div>بودجهٔ همهٔ گروه‌ها دست‌کم برای حفظ وضع فعلی کافی است.</div>", src: ["قاعده: حق‌بیمه × (۱ + بودجه) × Loss Ratio هدف"] };
  }
  if (q.has("حق بیمه", "حقبیمه", "افزایش لازم", "گران")){
    const list = all.filter(x => x.S.balanced.premiumChange != null).sort((a, b) => b.S.balanced.premiumChange - a.S.balanced.premiumChange).slice(0, 5);
    return { h: `<div>بیشترین افزایش حق‌بیمهٔ لازم (سناریوی متعادل):</div>${ul(list.map(x => `${open(x)}: <b>${fmtSignedPct(x.S.balanced.premiumChange)}</b>`))}`, src: ["قاعده: خسارت برآوردی ÷ Loss Ratio هدف"] };
  }
  const dec = decOf(q);
  if (dec && dec !== "outlier"){
    const list = all.map(x => ({ x, rs: x.A.rows.filter(r => r.d === dec || (dec === "increase" && r.d === "minor")) })).filter(y => y.rs.length);
    return { h: list.length ? ul(list.map(({ x, rs }) => `${open(x)}: ${esc(rs.map(r => r.cv.name).join("، "))}`)) : "<div>موردی نیست.</div>", src: [RULE()[dec]] };
  }
  if (q.has("کیفیت", "ناقص", "مشکل", "خطا")){
    const list = all.filter(x => x.A.issues.some(i => i.sev === "crit"));
    return { h: list.length ? ul(list.map(x => `${open(x)}: ${esc(x.A.issues.find(i => i.sev === "crit").text)}`)) : "<div>هیچ گروهی مشکل بحرانی داده ندارد.</div>", src: ["قاعده: بررسی‌های کیفیت دادهٔ اپ"] };
  }
  if (q.has("بزرگ", "بیشترین نفر", "پرجمعیت")){
    const list = all.slice().sort((a, b) => (b.A.insured || 0) - (a.A.insured || 0)).slice(0, 5);
    return { h: ul(list.map(x => `${open(x)}: ${fmtInt(x.A.insured)} نفر · حق‌بیمه ${fmtNum(x.A.premiumNow)}`)) };
  }
  if (q.has("خلاصه", "وضعیت", "پرتفوی", "کل", "همه", "گزارش", "چند گروه")){
    const comp = all.filter(x => x.A.complete && x.A.premiumNow), plr = sum(comp, x => x.A.premiumNow) ? sum(comp, x => x.A.totalPaid) / sum(comp, x => x.A.premiumNow) : null;
    const todo = buildTodo(all);
    return { h: ul([`${fmtInt(all.length)} گروه · ${fmtInt(sum(all, x => x.A.insured || 0))} نفر · حق‌بیمه ${fmtNum(sum(all, x => x.A.premiumNow || 0))}`, `Loss Ratio پرتفوی ${fmtPct(plr)}${lrStat(plr) ? ` (${lrStat(plr)[1]})` : ""}`, `${fmtInt(all.filter(x => (x.A.lr ?? 0) >= 0.85).length)} گروه زیان‌ده · ${fmtInt(all.filter(x => !x.S.budget.fits).length)} بودجهٔ ناکافی`, `${fmtInt(todo.filter(t => t.sev === "crit").length)} کار فوری · ${fmtInt(todo.filter(t => t.sev === "ok").length)} فرصت`]), next: ["کدام گروه‌ها زیان‌ده‌اند؟", "تمدیدهای نزدیک کدام‌اند؟"] };
  }
  return null;
}

/* ---------- panel ---------- */
function assistant(key, A, S, g){
  return chatPanel(key, "g-ai", aiSuggest(A, S), q => aiAnswer(q, A, S, g), "مثلاً: اگر سقف دندان را ۴۰ کنیم؟");
}
function chatPanel(key, id, sugs, answer, ph){
  const msgs = state.chat[key] || [];
  return `<aside class="panel ai anchor" id="${id}" aria-label="دستیار">
    <div class="panel-h"><h2>دستیار</h2><span class="tag t-line">آفلاین · از قواعد اپ</span></div>
    <div class="ai-body" id="aiBody">${msgs.length ? msgs.map(m => `<div class="ai-q">${esc(m.q)}</div><div class="ai-a">${answer(m.q)}</div>`).join("") : '<p class="small muted">هر عدد را با منبعش توضیح می‌دهم؛ «اگر …» هم بپرسید تا دوباره حساب کنم. همه‌چیز روی همین دستگاه و بدون اینترنت است.</p>'}</div>
    <div class="ai-sug">${sugs.map(q => `<button type="button" data-ask="${esc(q)}">${esc(q)}</button>`).join("")}</div>
    <form class="ai-in" id="aiForm"><input id="aiQ" placeholder="${esc(ph)}" autocomplete="off"><button class="btn primary" type="submit">ارسال</button></form>
  </aside>`;
}
function ask(q){
  const key = state.page === "home" ? "p" : (state.page === "tenderp" ? "t" : "g") + state.idx;
  (state.chat[key] = state.chat[key] || []).push({ q });
  render();
  const b = state.page === "home" ? $("homeChat") : $("aiBody"); if (b) b.scrollTop = b.scrollHeight;
  if (state.page === "home"){ const f = $("homeAiQ"); if (f) f.focus(); }
}
