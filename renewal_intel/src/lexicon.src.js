/* ================= Persian OCR correction =================
   Most OCR mistakes in Persian are in the dots (ب/پ/ت/ث/ن/ی، ج/چ/ح/خ، د/ذ، ر/ز/ژ، س/ش، ص/ض، ط/ظ، ع/غ، ف/ق، ک/گ).
   A word is reduced to its dotless skeleton; if the skeleton (or one letter off it) matches a word of the
   insurance vocabulary, that word is used and the change is recorded so the screen can show it. */
const LEX_WORDS = (`بیمه بیمه‌نامه بیمه‌گذار بیمه‌گر بیمه‌شده بیمه‌شدگان شدگان شده الحاقیه قرارداد مناقصه استعلام تکمیلی درمان درمانی تعهدات تعهد سقف سقف‌ها سالانه سالیانه
حداکثر حداقل فرانشیز حق‌بیمه حق نفر نفرات خانواده اصلی فرعی تحت تکفل کارکنان کارمندان شرکت سازمان موسسه دانشگاه مجتمع اداره بانک صنایع فولاد گیلان
جبران هزینه هزینه‌های های بستری جراحی جراحی‌های عمومی تخصصی فوق اعمال مجاز سرپایی زایمان طبیعی سزارین کورتاژ نازایی ناباروری
پاراکلینیک پاراکلینیکی رادیوگرافی رادیولوژی سونوگرافی ماموگرافی اسکن آنژیوگرافی آندوسکوپی کولونوسکوپی تصویربرداری آزمایش آزمایش‌های آزمایشگاهی تشخیصی تشخیص پاتولوژی ژنتیک
شیمی رادیوتراپی سرطان پیوند کلیه قلب مغز اعصاب نخاع ستون فقرات دیسک گامانایف آنژیوپلاستی عروق کرونر
آمبولانس فوریت فوریت‌های پزشکی پزشک پزشکان مشروط داخل خارج شهر شهری مراکز مرکز بیمارستان بیمارستانی
دندانپزشکی دندان عینک لنز طبی انکساری عیوب چشم لیزیک سمعک فیزیوتراپی گفتار کاردرمانی توانبخشی ویزیت دارو داروها دارویی اورژانس
اعضای اعضا طبیعی بدن پروتز اروتز لوازم بیماران بیماری خاص صعب‌العلاج غربالگری جنین شکستگی گچ‌گیری ختنه بخیه
مبلغ ریال تومان میلیون میلیارد ماهانه ماهیانه سالانه نقره‌ای طلایی برنزی طرح ردیف شرح عنوان کد شماره تاریخ صدور شروع خاتمه پایان مدت اعتبار روز
نشانی تلفن اقتصادی ملی واحد معرف نمایندگی کارگزاری کارگزار رسمی مستقیم شعبه حساب پرداخت اقساط قسط سررسید مالیات ارزش افزوده عوارض
آسیا ایران البرز دانا پارسیان ملت سامان معلم رازی کوثر سینا نوین تعاون آرمان حافظ میهن سرمد پاسارگاد کارآفرین
مطابق مجموعا تعداد افزایش کاهش برگشتی اضافی ابطال سایر شرایط مقررات قانون عمومی خصوصی مندرج متن پیوست صادر گردیده است می‌باشد باشد
گروه سنین کلیه کلیهٔ برای هر نوع انواع شامل همچنین بدون استثنا مربوط مربوطه تایید تأیید دستور معالج معتمد حدود نفرات`).split(/\s+/).filter(Boolean);

// Common general words: never "corrected" into a vocabulary word that merely looks similar.
const LEX_COMMON = `این آن که را با از به در بر تا یا اگر هم نیز چه چون پس بعد قبل بین زیر روی پیش همه هیچ برخی دیگر خود ما شما آنها ایشان او
است هست بود شد شود کرد کند کنند دارد دارند داشت گردد گرفت گیرد داد دهد دهند باید نباید می‌شود می‌باشد نمی‌باشد گردیده
تهیه تحقیقات اصلاح نهال بذر سهامی کشاورزی جهاد وزارت آموزش ترویج رئیس نامه موضوع پیوست احترام سلام خواهشمند دستور فرمایید اقدام لازم مبذول
تجمیع آتش‌سوزی مسئولیت مدنی حرفه‌ای ثالث بدنه خودروهای اداری شخصی همکاران سن سال سالگی کمتر بیشتر بالای زیر حدود تقریبا کل جمع
اول دوم سوم یک دو سه چهار پنج شش هفت هشت نه ده صد هزار نوبت مرحله برنده مبنای تصمیم معرفی قیمت مبلغ ارقام
استان تهران خیابان بلوار پلاک طبقه کدپستی ایمیل تلفن نمابر فکس همراه واریز شناسه شبا کارت بانکی
اضافه دوره انتظار والدین مدیریت محترم صورتحساب شرح ذیل بررسی نسبت پرداخت مطابق تاریخ‌های اعلامی فیش اسرع وقت`.split(/\s+/).filter(Boolean);
const LEX_KEEP = new Set(LEX_COMMON.map(w => w.replace(/‌/g, "")));
const SKEL = { "ب": "ٮ", "پ": "ٮ", "ت": "ٮ", "ث": "ٮ", "ن": "ٮ", "ی": "ٮ", "ي": "ٮ", "ئ": "ٮ", "ج": "ح", "چ": "ح", "خ": "ح", "ذ": "د", "ز": "ر", "ژ": "ر", "ش": "س", "ض": "ص", "ظ": "ط", "غ": "ع", "ق": "ف", "گ": "ک", "ك": "ک", "ة": "ه", "ۀ": "ه", "أ": "ا", "إ": "ا", "آ": "ا" };
const skel = w => [...w.replace(/[‌\s]/g, "")].map(c => SKEL[c] || c).join("");
const LEX = (() => { const m = new Map(); LEX_WORDS.forEach(w => { const k = skel(w); if (!m.has(k)) m.set(k, w.replace(/‌/g, "")); }); return m; })();
const LEX_SET = new Set(LEX_WORDS.map(w => w.replace(/‌/g, "")));
function lexEdit1(a, b){ // true when b is a with at most one letter inserted, deleted or changed
  if (Math.abs(a.length - b.length) > 1) return false;
  let i = 0, j = 0, e = 0;
  while (i < a.length && j < b.length){ if (a[i] === b[j]){ i++; j++; continue; } if (++e > 1) return false; if (a.length > b.length) i++; else if (a.length < b.length) j++; else { i++; j++; } }
  return e + (a.length - i) + (b.length - j) <= 1;
}
// Correct one word; returns the word and whether it changed.
function lexOne(plain){
  if (LEX_SET.has(plain)) return plain;
  const k = skel(plain); let hit = LEX.get(k);
  if (!hit && plain.length >= 5) for (const [lk, lw] of LEX) if (lk.length >= 5 && lexEdit1(k, lk)){ hit = lw; break; }
  return hit || null;
}
function lexFix(w){
  const core = w.replace(/^[^آ-ی]+|[^آ-ی]+$/g, ""), plain = core.replace(/‌/g, "");
  if (plain.length < 3 || LEX_SET.has(plain) || LEX_KEEP.has(plain)) return { w, fixed: false };
  let hit = lexOne(plain);
  // «وبستری» → «و بستری»: the conjunction glued to the next word
  if (plain[0] === "و" && plain.length > 3){ const r = lexOne(plain.slice(1)); if (r && (!hit || r === hit)) hit = "و " + r; }
  // «طبیعیبدن» → «طبیعی بدن»: two words glued together
  if (!hit && plain.length >= 6) for (let i = 3; i <= plain.length - 3 && !hit; i++){ const x = lexOne(plain.slice(0, i)), y = lexOne(plain.slice(i)); if (x && y) hit = x + " " + y; }
  if (!hit || hit === plain) return { w, fixed: false };
  return { w: w.replace(core, hit), fixed: true, from: core };
}
function lexText(text){
  const fixes = [];
  const out = String(text || "").replace(/[آ-ی‌]{3,}/g, m => { const r = lexFix(m); if (r.fixed) fixes.push([r.from, r.w]); return r.w; });
  return { text: out, fixes };
}

// Text for the screen: corrected words are highlighted and keep what was read in a tooltip.
function lexHtml(text){
  return String(text || "").split(/([آ-ی‌]{3,})/).map((part, i) => {
    if (i % 2 === 0) return esc(part);
    const r = lexFix(part); return r.fixed ? `<mark class="lexfix" title="خوانده‌شده: ${esc(r.from)}">${esc(r.w)}</mark>` : esc(part);
  }).join("");
}
