'use strict';

const DAY_MINUTES = 24 * 60;
let DATA = null;

const $ = (id) => document.getElementById(id);

const RECENT_DAYS = 30;  // a max change within this many days = "just broke"

// Whole days between a "YYYY-MM-DD" date and today (>=0 for past dates).
function daysSince(s) {
  if (!s) return Infinity;
  const [y, mo, da] = s.split('-').map(Number);
  const then = Date.UTC(y, mo - 1, da);
  return Math.floor((Date.now() - then) / 86400000);
}

function fmtTime(min) {
  const h = Math.floor(min / 60), m = min % 60;
  return String(h).padStart(2, '0') + ':' + String(m).padStart(2, '0');
}

// Greedy non-overlapping pick: skip a window whose span (winMinutes) overlaps
// an already-chosen one (circular distance so 23:35 and 00:35 don't overlap).
function pick(list, n, noOverlap, winMinutes) {
  const chosen = [];
  for (const item of list) {
    if (noOverlap) {
      let clash = false;
      for (const c of chosen) {
        let d = Math.abs(item.start - c.start);
        d = Math.min(d, DAY_MINUTES - d);
        if (d < winMinutes) { clash = true; break; }
      }
      if (clash) continue;
    }
    chosen.push(item);
    if (chosen.length >= n) break;
  }
  return chosen;
}

function histBars(hist) {
  const max = Math.max(...hist.map((p) => p[1]), 1);
  const wrap = document.createElement('div');
  wrap.className = 'hist';
  for (const [v, c] of hist) {
    const bar = document.createElement('div');
    bar.className = 'bar';
    bar.innerHTML =
      `<span class="k">${v}</span>` +
      `<span class="b" style="width:${Math.round((c / max) * 120) + 2}px"></span>` +
      `<span class="c">${c}</span>`;
    wrap.appendChild(bar);
  }
  return wrap;
}

function winLabel(min) {
  if (min === 90) return '۱.۵ ساعت';
  const h = min / 60;
  return Number.isInteger(h) ? `${h.toLocaleString('fa')} ساعت` : `${min} دقیقه`;
}

// How often a window's alternation reached the user's tolerance threshold or
// above — computed straight from the window's value distribution (w.hist).
// This is what actually matters: not the once-a-year peak, but how frequently
// it crosses the line you can't tolerate.
function exceedInfo(w, tol) {
  let c = 0;
  for (const [v, cnt] of (w.hist || [])) if (v >= tol) c += cnt;
  return { c, pct: w.n ? Math.round((100 * c) / w.n) : 0 };
}

// The window-length options are static in the HTML; here we just disable the
// ones this dataset doesn't have (e.g. 30m/1h on the 1-hour timeframe) and move
// the selection to a valid one if needed.
function syncWinlen(ds) {
  const sel = $('winlen');
  for (const o of sel.options) o.disabled = !(o.value in ds.rolling);
  if (!(sel.value in ds.rolling)) {
    const avail = Array.from(sel.options).find((o) => o.value in ds.rolling);
    if (avail) sel.value = avail.value;
  }
}

// Weekdays currently in scope: all, or just the one picked in the day selector.
function selectedDays() {
  const v = $('weekday').value;
  return v === 'all' ? DATA.order : [parseInt(v, 10)];
}

// Historical rate at which a window set a NEW all-time high = an estimate of the
// chance the next occurrence beats its current max. recn/n over the year.
function newHighPct(w) {
  return (w.recn && w.n) ? Math.round((100 * w.recn) / w.n) : 0;
}

// One window's full stat card — shared by the day cards and the custom-hour
// lookup so both show exactly the same information. `full` is the window's
// sibling list (that weekday's windows) used to compute its rank.
function buildWinCard(w, wd, full, tol, index, showHist) {
  const total = full.length;
  const rankMx = full.slice().sort((a, b) => a.mx - b.mx || a.avg - b.avg || a.start - b.start)
    .findIndex((x) => x.start === w.start) + 1;
  const rankAvg = full.slice().sort((a, b) => a.avg - b.avg || a.mx - b.mx || a.start - b.start)
    .findIndex((x) => x.start === w.start) + 1;
  const div = document.createElement('div');
  div.className = 'win';
  const badge = index != null ? `<span class="badge">${index + 1}</span>` : '';
  const star = index === 0 ? ' <span class="star">★</span>' : '';
  const recentRec = w.rec && daysSince(w.rec.w) <= RECENT_DAYS;
  const recMark = recentRec ? ' <span class="recbadge">🔺</span>' : '';
  const recRow = w.recn
    ? `<div class="row"><span>تغییرِ بیشینه (سال)</span><b${recentRec ? ' class="recbadge"' : ''}>${w.recn} بار • تا ${w.rec.t} • آخرین ${w.rec.w}</b></div>`
    : '';
  const ex = exceedInfo(w, tol);
  // Current consecutive weeks this window has held a top-10 priority (by
  // lowest running max or average). A short streak = a fresh, still-unproven
  // entrant — exactly the "lucky calm" trap; a long streak = evidence the
  // calm is real. Only present for windows currently in the top 10.
  const twRow = w.tw
    ? `<div class="row"><span>سابقهٔ حضور در تاپ-۱۰</span><b${w.tw <= 4 ? ' class="recbadge"' : ''}>${w.tw} هفتهٔ پیاپی${w.tw <= 4 ? ' ⚠️ تازه‌وارد' : (w.tw >= 13 ? ' ✅ باسابقه' : '')}</b></div>`
    : '';
  div.innerHTML = badge +
    `<div class="t">${w.label}${star}${recMark}</div>` +
    `<div class="row"><span>تعداد نمونه</span><b>${w.n} بار</b></div>` +
    `<div class="row"><span>میانگین تناوب</span><b>${w.avg.toFixed(2)}</b></div>` +
    `<div class="row"><span>احتمال تناوب بالای میانگین</span><b>${w.ap}%</b></div>` +
    `<div class="row"><span>بیشینه</span><b>${w.mx} (${w.mxc} بار)</b></div>` +
    `<div class="row"><span>احتمال عبور از آستانهٔ ${tol}</span><b>${ex.pct}% (${ex.c} بار)</b></div>` +
    `<div class="row"><span>احتمالِ بیشینهٔ جدید</span><b>${newHighPct(w)}%</b></div>` +
    `<div class="row"><span>رتبهٔ کم‌ترین بیشینه</span><b>${rankMx || '—'} از ${total}</b></div>` +
    `<div class="row"><span>رتبهٔ کم‌ترین میانگین</span><b>${rankAvg || '—'} از ${total}</b></div>` +
    twRow +
    recRow;
  if (showHist && w.hist) div.appendChild(histBars(w.hist));
  if (w.rc && w.rc.length) div.appendChild(recentToggle(w, wd));
  return div;
}

function render() {
  if (!DATA) return;
  const coin = $('coin').value || 'btc';
  const key = coin + '_' + $('exchange').value + '_' + $('tf').value;
  const ds = DATA.datasets[key];
  const out = $('out');
  const coins = DATA.meta.coins || [['btc', 'بیت‌کوین']];
  const coinName = (coins.find((c) => c[0] === coin) || [, ''])[1];
  $('title').textContent = `📊 تناوب کندل ${coinName}`;
  if (!ds) {
    $('meta').textContent = 'برای این ترکیب صرافی/تایم‌فریم داده‌ای موجود نیست.';
    out.innerHTML = '';
    return;
  }
  const mode = $('window').value;
  const wdSel = $('weekday').value;
  const topn = Math.max(1, parseInt($('topn').value || '2', 10));
  const noOverlap = $('nooverlap').checked;
  const showHist = $('hist').checked;
  // order = "<metric>_<dir>": metric avg|max|exceed, dir low|high.
  const order = $('order').value;
  const byMax = order.startsWith('max');
  const byExceed = order.startsWith('exceed');
  const high = order.endsWith('high');
  const tol = Math.max(1, parseInt($('tol').value || '6', 10));

  // Window length: options come from the dataset's available rolling lengths.
  syncWinlen(ds);
  const winLen = mode === 'rolling' ? parseInt($('winlen').value, 10) : 60;
  $('winlen').disabled = mode !== 'rolling';

  renderLowRisk(ds, winLen);
  renderRecords(ds, winLen);
  renderBurns(ds, winLen);
  renderExtreme(ds, winLen);
  renderHours(ds, winLen);
  renderCustom(ds, winLen, tol);

  const m = ds.meta;
  $('meta').innerHTML =
    `${m.exchange} • تایم‌فریم ${m.timeframe} • بازه ${winLabel(winLen)} • ` +
    `${m.candles.toLocaleString('en')} کندل • ${m.oldest} تا ${m.newest} • ${DATA.meta.tz}`;

  out.innerHTML = '';
  // Clock mode is unavailable on the 1-hour timeframe (one candle per hour).
  if (mode === 'clock' && Object.keys(ds.clock).length === 0) {
    out.innerHTML = '<div class="day"><div class="win">حالت «راس‌ساعت» برای تایم‌فریم ۱ ساعته معنی ندارد؛ از حالت «لغزان» استفاده کن.</div></div>';
    renderGap();
    return;
  }

  const days = wdSel === 'all' ? DATA.order : [parseInt(wdSel, 10)];

  for (const wd of days) {
    const source = mode === 'rolling'
      ? (ds.rolling[String(winLen)] || {})[String(wd)]
      : ds.clock[String(wd)];
    const full = source || [];
    let list = full.slice();
    if (!list.length) continue;
    const keyf = byExceed ? (x) => exceedInfo(x, tol).pct
      : byMax ? (x) => x.mx : (x) => x.avg;               // primary metric
    const tief = byExceed ? (x) => x.avg
      : byMax ? (x) => x.avg : (x) => x.mx;               // tie-breaker
    list.sort((a, b) =>
      (high ? keyf(b) - keyf(a) : keyf(a) - keyf(b)) ||
      (high ? tief(b) - tief(a) : tief(a) - tief(b)) ||
      a.start - b.start);
    const chosen = pick(list, topn, noOverlap, winLen);

    const card = document.createElement('div');
    card.className = 'day';
    card.innerHTML = `<h2>${DATA.names[String(wd)]}</h2>`;
    chosen.forEach((w, i) => card.appendChild(buildWinCard(w, wd, full, tol, i, showHist)));
    out.appendChild(card);
  }
  renderGap();
}

// "YYYY-MM-DD" plus/minus a number of days.
function addDays(s, delta) {
  const [y, mo, da] = s.split('-').map(Number);
  const dt = new Date(Date.UTC(y, mo - 1, da));
  dt.setUTCDate(dt.getUTCDate() + delta);
  const p = (n) => String(n).padStart(2, '0');
  return `${dt.getUTCFullYear()}-${p(dt.getUTCMonth() + 1)}-${p(dt.getUTCDate())}`;
}

// A collapsible "recent occurrences" panel for one window (last ~6 weeks).
function recentToggle(w, wd) {
  const dayName = DATA.names[String(wd)];
  const btn = document.createElement('button');
  btn.className = 'recentbtn';
  btn.textContent = '🔎 رخدادهای اخیر این بازه';
  const panel = document.createElement('div');
  panel.className = 'recent';
  panel.style.display = 'none';
  btn.addEventListener('click', () => {
    if (panel.dataset.built !== '1') {
      const mx = Math.max(...w.rc);
      const head = document.createElement('div');
      head.className = 'rhead';
      head.innerHTML =
        `آخرین بار (${dayName} ${w.rd}): <b>${w.rc[0]}</b> تناوب` +
        ` • بیشترین در ${w.rc.length} هفته‌ی اخیر: <b>${mx}</b>`;
      panel.appendChild(head);
      w.rc.forEach((v, i) => {
        const row = document.createElement('div');
        row.className = 'row';
        row.innerHTML = `<span>${dayName} ${addDays(w.rd, -7 * i)}</span><b>${v} تناوب</b>`;
        panel.appendChild(row);
      });
      panel.dataset.built = '1';
    }
    panel.style.display = panel.style.display === 'none' ? 'block' : 'none';
  });
  const box = document.createElement('div');
  box.appendChild(btn);
  box.appendChild(panel);
  return box;
}

function distBars(hist, unit) {
  const max = Math.max(...hist.map((p) => p[1]), 1);
  const wrap = document.createElement('div');
  wrap.className = 'hist';
  for (const [v, c] of hist) {
    const bar = document.createElement('div');
    bar.className = 'bar';
    const label = v >= 21 ? '۲۱+' : String(v);
    bar.innerHTML =
      `<span class="k">${label}</span>` +
      `<span class="b" style="width:${Math.round((c / max) * 120) + 2}px"></span>` +
      `<span class="c">${c}${unit ? ' ' + unit : ''}</span>`;
    wrap.appendChild(bar);
  }
  return wrap;
}

// A small labelled <select> built from [[value, label], ...] pairs.
function buildSelect(opts, current, onChange) {
  const sel = document.createElement('select');
  for (const [v, label] of opts) {
    const o = document.createElement('option');
    o.value = String(v);
    o.textContent = label;
    if (String(v) === String(current)) o.selected = true;
    sel.appendChild(o);
  }
  sel.addEventListener('change', () => onChange(sel.value));
  return sel;
}
function labelWrap(text, el) {
  const w = document.createElement('label');
  w.className = 'recsel';
  w.appendChild(document.createTextNode(text + ' '));
  w.appendChild(el);
  return w;
}

// --- 🎯 هستهٔ کم‌ریسک ---------------------------------------------------------
// Low-risk core: for each weekday, the rolling windows that are SIMULTANEOUSLY
// in the top-N by lowest max AND lowest average, have held a top-10 priority for
// at least `lrTenure` consecutive weeks (w.tw), and — optionally — never burned
// while ranked top-10. This is the "trade these" shortlist the user asked for.
let lrTenure = 10;        // minimum consecutive weeks in the top-10 (w.tw)
let lrTop = 10;           // "top-N" required in BOTH lowest-max and lowest-avg
let lrExcludeBurned = true;
// The "wait then martingale" safety model the user asked for: enter only AFTER
// lrWait consecutive alternations have already elapsed, then run a martingale
// that can survive lrCapacity more. Total tolerated run = lrWait + lrCapacity;
// a window is "safe for me" when its all-time max alternation stays within that.
let lrCapacity = 6;       // martingale steps the user can afford
let lrWait = 2;           // alternations to let pass before entering
let lrOnlySafe = false;   // show only windows where mx <= lrWait + lrCapacity

function renderLowRisk(ds, winLen) {
  const box = $('lowrisk');
  box.innerHTML = '';
  box.style.display = 'none';
  const per = ds.rolling && ds.rolling[String(winLen)];
  if (!per) return;
  const burnsPer = (ds.burns && ds.burns[String(winLen)]) || {};
  const noOverlap = $('nooverlap').checked;

  const perDay = [];
  let totalQ = 0;
  for (const wd of selectedDays()) {
    const list = (per[String(wd)] || []).slice();
    if (!list.length) continue;
    // Same rank definitions the day cards / records panel use.
    const byMx = list.slice().sort((a, b) => a.mx - b.mx || a.avg - b.avg || a.start - b.start);
    const byAvg = list.slice().sort((a, b) => a.avg - b.avg || a.mx - b.mx || a.start - b.start);
    const rMx = new Map(byMx.map((w, i) => [w.start, i + 1]));
    const rAvg = new Map(byAvg.map((w, i) => [w.start, i + 1]));
    // Any start-minute that has ever burned while ranked top-10 on this weekday.
    const burnedStarts = new Set((burnsPer[String(wd)] || []).map((e) => e.s));
    let q = list.filter((w) =>
      rMx.get(w.start) <= lrTop &&
      rAvg.get(w.start) <= lrTop &&
      (w.tw || 0) >= lrTenure &&
      (!lrExcludeBurned || !burnedStarts.has(w.start)) &&
      (!lrOnlySafe || w.mx <= lrWait + lrCapacity));
    // Best first: lowest worst-rank, then longest tenure, then calmest average.
    q.sort((a, b) =>
      Math.max(rMx.get(a.start), rAvg.get(a.start)) - Math.max(rMx.get(b.start), rAvg.get(b.start)) ||
      (b.tw || 0) - (a.tw || 0) || a.avg - b.avg);
    if (noOverlap) {
      const chosen = [];
      for (const w of q) {
        let clash = false;
        for (const c of chosen) {
          let d = Math.abs(w.start - c.start);
          d = Math.min(d, DAY_MINUTES - d);
          if (d < winLen) { clash = true; break; }
        }
        if (!clash) chosen.push(w);
      }
      q = chosen;
    }
    if (q.length) { perDay.push({ wd, q, rMx, rAvg, burnedStarts, total: list.length }); totalQ += q.length; }
  }

  const scope = $('weekday').value === 'all' ? '' : ' — ' + DATA.names[$('weekday').value];
  const head = document.createElement('h2');
  head.textContent = `🎯 هستهٔ کم‌ریسک${scope} (${totalQ.toLocaleString('fa')} بازه)`;
  box.appendChild(head);

  const ctrls = document.createElement('div');
  ctrls.className = 'recctrls';
  ctrls.appendChild(labelWrap('حداقل ثبات:', buildSelect(
    [[5, '۵ هفته'], [8, '۸ هفته'], [10, '۱۰ هفته'], [13, '۱۳ هفته'], [15, '۱۵ هفته']],
    lrTenure, (v) => { lrTenure = parseInt(v, 10); renderLowRisk(ds, winLen); })));
  ctrls.appendChild(labelWrap('تاپ در هر دو:', buildSelect(
    [[5, 'تاپ ۵'], [10, 'تاپ ۱۰']], lrTop,
    (v) => { lrTop = parseInt(v, 10); renderLowRisk(ds, winLen); })));
  ctrls.appendChild(checkboxWrap('فقط بازه‌های نسوخته', lrExcludeBurned,
    (v) => { lrExcludeBurned = v; renderLowRisk(ds, winLen); }));
  ctrls.appendChild(labelWrap('پله‌های من:', buildSelect(
    [[3, '۳ پله'], [4, '۴ پله'], [5, '۵ پله'], [6, '۶ پله'], [7, '۷ پله'],
      [8, '۸ پله'], [9, '۹ پله'], [10, '۱۰ پله']],
    lrCapacity, (v) => { lrCapacity = parseInt(v, 10); renderLowRisk(ds, winLen); })));
  ctrls.appendChild(labelWrap('صبر قبل از ورود:', buildSelect(
    [[0, '۰ تناوب'], [1, '۱ تناوب'], [2, '۲ تناوب'], [3, '۳ تناوب'], [4, '۴ تناوب']],
    lrWait, (v) => { lrWait = parseInt(v, 10); renderLowRisk(ds, winLen); })));
  ctrls.appendChild(checkboxWrap('فقط بازه‌های امنِ من', lrOnlySafe,
    (v) => { lrOnlySafe = v; renderLowRisk(ds, winLen); }));
  box.appendChild(ctrls);

  const help = document.createElement('div');
  help.className = 'rhelp';
  help.textContent =
    `بازه‌هایی که هم‌زمان جزو تاپ-${lrTop} کم‌ترین بیشینه و کم‌ترین میانگینِ همان روزند، ` +
    `دستِ‌کم ${lrTenure} هفتهٔ پیاپی در تاپ-۱۰ مانده‌اند` +
    (lrExcludeBurned ? '، و هرگز موقعِ تاپ-۱۰ بودن نسوخته‌اند' : '') +
    `. طول بازه: ${winLabel(winLen)} (فقط بازهٔ لغزان). این «هستهٔ معاملاتی» است.`;
  box.appendChild(help);

  const help2 = document.createElement('div');
  help2.className = 'rhelp';
  help2.innerHTML =
    `🛡️ <b>پوششِ من = صبر (${lrWait}) + پله (${lrCapacity}) = ${lrWait + lrCapacity} تناوب.</b> ` +
    `اگر بگذاری ${lrWait} تناوب بگذرد و بعد وارد شوی، ${lrWait} پله از بدترین رشته قبلِ پولت مصرف شده؛ ` +
    `پس تا وقتی بیشینهٔ بازه از ${lrWait + lrCapacity} بالاتر نرود صفر نمی‌شوی. «حاشیهٔ امنیت» = ` +
    `پوششِ من منهای بیشینه (هرچه بیشتر، امن‌تر). ⚠️ بیشینه سقفِ قطعی نیست — به «احتمالِ بیشینهٔ جدید» هم نگاه کن.`;
  box.appendChild(help2);

  if (!totalQ) {
    const none = document.createElement('div');
    none.className = 'rhelp';
    none.textContent =
      'با این سخت‌گیری هیچ بازه‌ای واجدِ شرایط نشد — «حداقل ثبات» را کم کن، «تاپ ۱۰» را انتخاب کن، یا تیکِ «فقط نسوخته» را بردار.';
    box.appendChild(none);
    box.style.display = '';
    return;
  }

  // Per-weekday breakdown of the shortlist size.
  const co = document.createElement('div');
  co.className = 'rhelp';
  co.innerHTML = 'به تفکیکِ روز: ' + perDay
    .map(({ wd, q }) => `<b>${DATA.names[String(wd)]}:</b> ${q.length}`)
    .join(' • ');
  box.appendChild(co);

  const list = document.createElement('div');
  list.className = 'reclist';
  for (const { wd, q, rMx, rAvg, burnedStarts, total } of perDay) {
    for (const w of q) {
      const nh = (w.recn && w.n) ? Math.round((100 * w.recn) / w.n) : 0;
      const burned = burnedStarts.has(w.start);
      const cover = lrWait + lrCapacity;
      const margin = cover - w.mx;
      const verdict = margin >= 2 ? `✅ امن (حاشیه ${margin})`
        : margin >= 0 ? `⚠️ مرزی (حاشیه ${margin})`
          : `❌ ناکافی (${-margin} پله کم می‌آری)`;
      const mCls = margin >= 2 ? 'ok' : margin >= 0 ? '' : 'hot';
      const card = document.createElement('div');
      card.className = 'reccard';
      card.innerHTML =
        `<div class="rt">🎯 ${DATA.names[String(wd)]} ${w.label}</div>` +
        `<div class="row"><span>رتبه (بیشینه / میانگین)</span><b>#${rMx.get(w.start)} / #${rAvg.get(w.start)} از ${total}</b></div>` +
        `<div class="row"><span>ثبات در تاپ-۱۰</span><b class="ok">${w.tw} هفتهٔ پیاپی${w.tw >= 13 ? ' ✅ باسابقه' : ''}</b></div>` +
        `<div class="row"><span>میانگین / بیشینه</span><b>${w.avg.toFixed(2)} / ${w.mx} (${w.mxc} بار)</b></div>` +
        `<div class="row"><span>پوششِ من (صبر ${lrWait} + پله ${lrCapacity})</span><b>${cover} تناوب</b></div>` +
        `<div class="row"><span>حاشیهٔ امنیت تا بیشینه</span><b class="${mCls}">${verdict}</b></div>` +
        `<div class="row"><span>احتمالِ بیشینهٔ جدید</span><b${nh >= 5 ? ' class="hot"' : ''}>${nh}%</b></div>` +
        `<div class="row"><span>تعداد نمونه</span><b>${w.n} بار</b></div>` +
        `<div class="row"><span>سابقهٔ سوختن</span><b class="${burned ? 'hot' : 'ok'}">${burned ? '⚠️ سوخته' : '✅ نسوخته'}</b></div>`;
      list.appendChild(card);
    }
  }
  box.appendChild(list);
  box.style.display = '';
}

// Records panel state: overlap collapse, how far back to look, and sort order.
let recNoOverlap = false;
let recWindowDays = 30;   // default: last month; user can widen to a full year
let recSort = 'new';      // 'new' = latest change first; 'unstable' = most changes

// List every window (for the current coin/exchange/timeframe + this rolling
// window length) whose all-time maximum was beaten recently — the silent upward
// corrections, surfaced with full context so they are never missed and can be
// judged at a glance.
function renderRecords(ds, winLen) {
  const box = $('records');
  box.innerHTML = '';
  box.style.display = 'none';
  const per = ds.rolling && ds.rolling[String(winLen)];
  if (!per) return;
  const all = [];
  for (const wd of selectedDays()) {
    for (const w of (per[String(wd)] || [])) {
      if (w.rec) all.push({ wd, w });
    }
  }
  if (!all.length) { box.style.display = 'none'; return; }
  // Full-year history is kept; show only changes within the chosen look-back.
  const recs = all.filter((r) => daysSince(r.w.rec.w) <= recWindowDays);

  // Per-weekday rankings so we can tell WHERE this window sits among that day's
  // windows: rank 1 by "lowest max" = the calmest by peak, rank 1 by "lowest
  // average" = the calmest on average. Computed once per weekday, reused.
  const rankCache = {};
  function ranksFor(wd) {
    if (rankCache[wd]) return rankCache[wd];
    const list = (per[String(wd)] || []).slice();
    const byMx = list.slice().sort((a, b) => a.mx - b.mx || a.avg - b.avg || a.start - b.start);
    const byAvg = list.slice().sort((a, b) => a.avg - b.avg || a.mx - b.mx || a.start - b.start);
    const mMx = new Map(byMx.map((w, i) => [w.start, i + 1]));
    const mAvg = new Map(byAvg.map((w, i) => [w.start, i + 1]));
    return (rankCache[wd] = { mx: mMx, avg: mAvg, total: list.length });
  }

  // Optionally collapse overlapping record-breakers — adjacent 5-min-shifted
  // windows that broke around the same event — down to one representative (the
  // calmest) per weekday, using the same non-overlap rule as the day cards.
  let items = recs.slice();
  if (recNoOverlap) {
    const byDay = {};
    for (const r of items) (byDay[r.wd] = byDay[r.wd] || []).push(r);
    const kept = [];
    for (const wd in byDay) {
      const dayRecs = byDay[wd].slice().sort((a, b) =>
        a.w.mx - b.w.mx || a.w.avg - b.w.avg || a.w.start - b.w.start);
      const chosen = [];
      for (const r of dayRecs) {
        let clash = false;
        for (const c of chosen) {
          let d = Math.abs(r.w.start - c.w.start);
          d = Math.min(d, DAY_MINUTES - d);
          if (d < winLen) { clash = true; break; }
        }
        if (!clash) chosen.push(r);
      }
      kept.push(...chosen);
    }
    items = kept;
  }

  // Sort: newest change first, or most-changed (most unstable) first.
  if (recSort === 'unstable') {
    items.sort((a, b) =>
      (b.w.recn || 0) - (a.w.recn || 0) ||
      b.w.rec.w.localeCompare(a.w.rec.w) || (a.w.mx - b.w.mx));
  } else {
    items.sort((a, b) =>
      b.w.rec.w.localeCompare(a.w.rec.w) || (a.w.mx - b.w.mx) || (a.w.avg - b.w.avg));
  }

  const scope = $('weekday').value === 'all' ? '' : ' — ' + DATA.names[$('weekday').value];
  const head = document.createElement('h2');
  head.textContent = `🔺 تغییراتِ بیشینه${scope} (${items.length.toLocaleString('fa')} مورد)`;
  box.appendChild(head);

  // Controls: how far back to look, sort order, and overlap collapse.
  const ctrls = document.createElement('div');
  ctrls.className = 'recctrls';
  ctrls.appendChild(labelWrap('بازه:', buildSelect(
    [[30, '۱ ماه'], [90, '۳ ماه'], [180, '۶ ماه'], [365, '۱ سال'], [100000, 'همه']],
    recWindowDays, (v) => { recWindowDays = parseInt(v, 10); renderRecords(ds, winLen); })));
  ctrls.appendChild(labelWrap('مرتب‌سازی:', buildSelect(
    [['new', 'جدیدترین'], ['unstable', 'بی‌ثبات‌ترین']],
    recSort, (v) => { recSort = v; renderRecords(ds, winLen); })));
  box.appendChild(ctrls);

  const tog = document.createElement('label');
  tog.className = 'rectoggle';
  const cb = document.createElement('input');
  cb.type = 'checkbox';
  cb.checked = recNoOverlap;
  cb.addEventListener('change', () => {
    recNoOverlap = cb.checked;
    renderRecords(ds, winLen);
  });
  tog.appendChild(cb);
  tog.appendChild(document.createTextNode(' بدون هم‌پوشانی (فقط رکوردهای متمایز)'));
  box.appendChild(tog);

  const help = document.createElement('div');
  help.className = 'rhelp';
  help.textContent =
    `بازه‌هایی که بیشینه‌شان بالا رفته (عددی بالاتر از هرچه قبلاً). «تعداد تغییر» = چند بار در ` +
    `طول سال بیشینه بالا رفته — عددِ بالا یعنی بی‌ثبات و مستعدِ جهش. طولِ بازه: ${winLabel(winLen)}.`;
  box.appendChild(help);

  if (!items.length) {
    const none = document.createElement('div');
    none.className = 'rhelp';
    none.textContent = 'در این بازهٔ زمانی تغییرِ بیشینه‌ای نبوده — بازه را بزرگ‌تر کن.';
    box.appendChild(none);
    box.style.display = '';
    return;
  }

  // All records live inside a bounded, scrollable list so the panel never
  // takes over the page no matter how many there are.
  const list = document.createElement('div');
  list.className = 'reclist';
  items.forEach(({ wd, w }) => {
    const day = DATA.names[String(wd)];
    const R = ranksFor(wd);
    const rMx = R.mx.get(w.start);
    const rAvg = R.avg.get(w.start);
    const card = document.createElement('div');
    card.className = 'reccard';
    card.innerHTML =
      `<div class="rt">🔺 ${day} ${w.label}</div>` +
      `<div class="row"><span>آخرین تغییر</span><b class="hot">بیشینه از ${w.rec.f} به ${w.rec.t} • ${w.rec.w}</b></div>` +
      `<div class="row"><span>تعداد تغییرِ بیشینه (سال)</span><b class="hot">${w.recn} بار</b></div>` +
      `<div class="row"><span>میانگین تناوب</span><b>${w.avg.toFixed(2)}</b></div>` +
      `<div class="row"><span>بیشینه</span><b>${w.mx} (${w.mxc} بار)</b></div>` +
      `<div class="row"><span>احتمال بالای میانگین</span><b>${w.ap}%</b></div>` +
      `<div class="row"><span>تعداد نمونه</span><b>${w.n} بار</b></div>` +
      `<div class="row"><span>رتبهٔ کم‌ترین بیشینه (${day})</span><b>${rMx} از ${R.total}</b></div>` +
      `<div class="row"><span>رتبهٔ کم‌ترین میانگین (${day})</span><b>${rAvg} از ${R.total}</b></div>`;
    list.appendChild(card);
  });
  box.appendChild(list);
  box.style.display = '';
}

// --- Night filter (01:00–06:00 local) + per-panel day filter -----------------
const NIGHT_START = 60, NIGHT_END = 360;  // minutes: 01:00 .. 06:00

// Does [startMin, endMin) on the 1440-minute ring touch the night interval?
function spanTouchesNight(startMin, endMin) {
  const segs = endMin <= 1440 ? [[startMin, endMin]]
    : [[startMin, 1440], [0, endMin - 1440]];
  return segs.some(([a, b]) => a < NIGHT_END && b > NIGHT_START);
}

function runTouchesNight(r) {
  const toMin = (t) => parseInt(t.slice(0, 2), 10) * 60 + parseInt(t.slice(3), 10);
  const s = toMin(r.st);
  let e = toMin(r.en) + 1;
  if (e <= s) e += 1440;  // the run crossed midnight
  return spanTouchesNight(s, e);
}

let hideNight = true;   // drop events touching 01:00–06:00 (both event panels)
let burnDay = 'all';    // in-panel weekday filter of the burn log
let extDay = 'all';     // in-panel weekday filter of the extreme-run log

function checkboxWrap(text, checked, onChange) {
  const lab = document.createElement('label');
  lab.className = 'rectoggle';
  const cb = document.createElement('input');
  cb.type = 'checkbox';
  cb.checked = checked;
  cb.addEventListener('change', () => onChange(cb.checked));
  lab.appendChild(cb);
  lab.appendChild(document.createTextNode(' ' + text));
  return lab;
}

function dayOptions() {
  return [['all', 'همهٔ روزها']].concat(
    DATA.order.map((wd) => [String(wd), DATA.names[String(wd)]]));
}

// The weekdays a panel shows: the page-level weekday scope, narrowed by the
// panel's own day filter.
function panelDays(panelDay) {
  const base = selectedDays();
  return panelDay === 'all' ? base
    : base.filter((wd) => String(wd) === panelDay);
}

// Burn log: every time in the past year a window that ranked in the TOP-10
// priorities AT THAT MOMENT (lowest max or lowest average, reconstructed
// historically — not today's ranks) had its ceiling broken. Overlapping
// neighbours breaking on the same event are collapsed to one row.
function renderBurns(ds, winLen) {
  const box = $('prisk');
  box.innerHTML = '';
  box.style.display = 'none';
  const per = ds.burns && ds.burns[String(winLen)];
  if (!per) return;
  const raw = [];
  for (const wd of panelDays(burnDay)) {
    for (const e of (per[String(wd)] || [])) {
      if (hideNight && spanTouchesNight(e.s, e.s + winLen)) continue;
      raw.push({ wd, e });
    }
  }
  // Collapse same-day overlapping windows (adjacent 5-min-shifted starts that
  // broke on the same underlying event) to the best-ranked representative.
  raw.sort((a, b) =>
    a.e.d.localeCompare(b.e.d) || a.wd - b.wd || a.e.s - b.e.s);
  const items = [];
  for (const r of raw) {
    const last = items[items.length - 1];
    if (last && last.e.d === r.e.d && last.wd === r.wd
        && r.e.s - last.hi < winLen) {
      last.hi = Math.max(last.hi, r.e.s);
      last.merged++;
      if (Math.min(r.e.rmx, r.e.ravg) < Math.min(last.e.rmx, last.e.ravg)) {
        last.e = r.e;
      }
    } else {
      items.push({ wd: r.wd, e: r.e, hi: r.e.s, merged: 1 });
    }
  }
  items.sort((a, b) => b.e.d.localeCompare(a.e.d) || a.e.s - b.e.s);

  const dayName = burnDay === 'all'
    ? ($('weekday').value === 'all' ? '' : ' — ' + DATA.names[$('weekday').value])
    : ' — ' + DATA.names[burnDay];
  const head = document.createElement('h2');
  head.textContent =
    `📌 سابقهٔ سوختنِ اولویت‌های ۱–۱۰${dayName} (${items.length.toLocaleString('fa')} رخداد)`;
  box.appendChild(head);

  const ctrls = document.createElement('div');
  ctrls.className = 'recctrls';
  ctrls.appendChild(labelWrap('روز:', buildSelect(
    dayOptions(), burnDay,
    (v) => { burnDay = v; renderBurns(ds, winLen); })));
  ctrls.appendChild(checkboxWrap('حذف بازه‌های ۰۱:۰۰–۰۶:۰۰', hideNight, (v) => {
    hideNight = v;
    renderBurns(ds, winLen);
    renderExtreme(ds, winLen);
  }));
  box.appendChild(ctrls);

  // Per-weekday breakdown of the (filtered, collapsed) events.
  if (burnDay === 'all' && items.length) {
    const byDay = {};
    for (const it of items) byDay[it.wd] = (byDay[it.wd] || 0) + 1;
    const co = document.createElement('div');
    co.className = 'rhelp';
    co.innerHTML = 'به تفکیکِ روز: ' + DATA.order
      .filter((wd) => byDay[wd])
      .map((wd) => `<b>${DATA.names[String(wd)]}:</b> ${byDay[wd]}`)
      .join(' • ');
    box.appendChild(co);
  }

  const help = document.createElement('div');
  help.className = 'rhelp';
  help.textContent =
    'هر بار که سقفِ بازه‌ای شکست که «در همان لحظه» جزو ۱۰ اولویتِ اولِ کم‌ترین بیشینه یا ' +
    'کم‌ترین میانگین بود — رتبه‌ها مالِ همان لحظه‌اند، نه امروز. رخدادهای بازه‌های هم‌پوشان ' +
    `ادغام شده‌اند. ۸ هفتهٔ اولِ داده حذف شده (رتبه هنوز معنی ندارد). طول بازه: ${winLabel(winLen)}.`;
  box.appendChild(help);
  if (!items.length) {
    const none = document.createElement('div');
    none.className = 'rhelp';
    none.textContent = 'در این محدوده هیچ اولویتِ تاپ-۱۰ی نسوخته — 👍';
    box.appendChild(none);
    box.style.display = '';
    return;
  }

  const list = document.createElement('div');
  list.className = 'reclist';
  for (const { wd, e, merged } of items) {
    const wlist = (ds.rolling[String(winLen)] || {})[String(wd)] || [];
    const w = wlist.find((x) => x.start === e.s);
    const label = w ? w.label : fmtTime(e.s);
    const card = document.createElement('div');
    card.className = 'reccard';
    const mergeNote = merged > 1 ? ` <span style="font-weight:normal;font-size:12px">(+${merged - 1} بازهٔ هم‌پوشان)</span>` : '';
    card.innerHTML =
      `<div class="rt">📌 ${DATA.names[String(wd)]} ${label} • ${e.d}${mergeNote}</div>` +
      `<div class="row"><span>بیشینه</span><b class="hot">از ${e.f} به ${e.n}</b></div>` +
      `<div class="row"><span>اولویت در آن لحظه</span><b>کم‌ترین بیشینه #${e.rmx} • کم‌ترین میانگین #${e.ravg}</b></div>` +
      `<div class="row"><span>سابقهٔ حضور در تاپ-۱۰</span><b>${e.wks} هفته</b></div>`;
    list.appendChild(card);
  }
  box.appendChild(list);
  box.style.display = '';
}

// Extreme-alternation event log: every genuine uninterrupted run of >= the
// selected threshold (default 7 تناوب) across the whole analysed span, with
// exact local start/end times and the priority the starting window held then.
let extremeMin = 7;

function renderExtreme(ds, winLen) {
  const box = $('extreme');
  box.innerHTML = '';
  box.style.display = 'none';
  const all = ds.extreme || [];
  if (!all.length) return;
  const days = panelDays(extDay);
  const inScope = all.filter((r) =>
    days.includes(r.wd) && !(hideNight && runTouchesNight(r)));
  const shown = inScope.filter((r) => r.f >= extremeMin)
    .sort((a, b) => b.d.localeCompare(a.d) || b.f - a.f);

  const dayName = extDay === 'all'
    ? ($('weekday').value === 'all' ? '' : ' — ' + DATA.names[$('weekday').value])
    : ' — ' + DATA.names[extDay];
  const head = document.createElement('h2');
  head.textContent =
    `⚡️ تناوب‌های شدید (≥ ${extremeMin})${dayName} (${shown.length.toLocaleString('fa')} رخداد)`;
  box.appendChild(head);

  const ctrls = document.createElement('div');
  ctrls.className = 'recctrls';
  ctrls.appendChild(labelWrap('آستانه:', buildSelect(
    [[7, '۷ تناوب'], [8, '۸ تناوب'], [9, '۹ تناوب'], [10, '۱۰ تناوب']],
    extremeMin, (v) => { extremeMin = parseInt(v, 10); renderExtreme(ds, winLen); })));
  ctrls.appendChild(labelWrap('روز:', buildSelect(
    dayOptions(), extDay,
    (v) => { extDay = v; renderExtreme(ds, winLen); })));
  ctrls.appendChild(checkboxWrap('حذف ۰۱:۰۰–۰۶:۰۰', hideNight, (v) => {
    hideNight = v;
    renderBurns(ds, winLen);
    renderExtreme(ds, winLen);
  }));
  box.appendChild(ctrls);

  // Per-weekday breakdown of what's shown.
  if (extDay === 'all' && shown.length) {
    const byDay = {};
    for (const r of shown) byDay[r.wd] = (byDay[r.wd] || 0) + 1;
    const cd = document.createElement('div');
    cd.className = 'rhelp';
    cd.innerHTML = 'به تفکیکِ روز: ' + DATA.order
      .filter((wd) => byDay[wd])
      .map((wd) => `<b>${DATA.names[String(wd)]}:</b> ${byDay[wd]}`)
      .join(' • ');
    box.appendChild(cd);
  }

  // Distribution of ALL extreme runs in scope, independent of the filter.
  const dist = { 7: 0, 8: 0, 9: 0, '10+': 0 };
  for (const r of inScope) {
    if (r.f >= 10) dist['10+']++;
    else dist[r.f] = (dist[r.f] || 0) + 1;
  }
  const co = document.createElement('div');
  co.className = 'rhelp';
  co.innerHTML =
    `در کلِ داده: <b>۷:</b> ${dist[7]} بار • <b>۸:</b> ${dist[8]} بار • ` +
    `<b>۹:</b> ${dist[9]} بار • <b>۱۰+:</b> ${dist['10+']} بار`;
  box.appendChild(co);

  const help = document.createElement('div');
  help.className = 'rhelp';
  help.textContent =
    'هر رشتهٔ تناوبِ واقعی و بی‌وقفه، با ساعتِ دقیقِ شروع و پایان، و اولویتی که بازهٔ ' +
    'شروعش «در همان لحظه» داشت (برای طولِ بازهٔ انتخابی).';
  box.appendChild(help);

  const list = document.createElement('div');
  list.className = 'reclist';
  for (const r of shown) {
    const pr = r.pr && r.pr[String(winLen)];
    const prTxt = pr
      ? `کم‌ترین بیشینه #${pr[0]} • کم‌ترین میانگین #${pr[1]}`
      : '— (اوایلِ داده)';
    const card = document.createElement('div');
    card.className = 'reccard';
    card.innerHTML =
      `<div class="rt">⚡️ ${DATA.names[String(r.wd)]} ${r.d} • ${r.st} تا ${r.en}</div>` +
      `<div class="row"><span>طول رشته</span><b class="hot">${r.f} تناوب</b></div>` +
      `<div class="row"><span>اولویتِ بازهٔ شروع در آن لحظه</span><b>${prTxt}</b></div>`;
    list.appendChild(card);
  }
  box.appendChild(list);
  box.style.display = '';
}

// 🕐 Hour heat-map: one glance at which hours of the (selected) day are
// historically calm. For each start hour 00..23 it aggregates the windows
// starting in that hour — mean alternation average, worst max ever — plus how
// many extreme runs (>=7) started there and how many top-10 burns hit there.
// Green = calmest hours, red = most alternating.
function renderHours(ds, winLen) {
  const box = $('hourmap');
  box.innerHTML = '';
  box.style.display = 'none';
  const per = ds.rolling && ds.rolling[String(winLen)];
  if (!per) return;
  const days = selectedDays();
  const agg = Array.from({ length: 24 }, () => ({ sum: 0, n: 0, mx: 0, runs: 0, burns: 0 }));
  for (const wd of days) {
    for (const w of (per[String(wd)] || [])) {
      const a = agg[Math.floor(w.start / 60)];
      a.sum += w.avg;
      a.n++;
      a.mx = Math.max(a.mx, w.mx);
    }
  }
  for (const r of (ds.extreme || [])) {
    if (days.includes(r.wd)) agg[parseInt(r.st.slice(0, 2), 10)].runs++;
  }
  const perB = ds.burns && ds.burns[String(winLen)];
  if (perB) {
    for (const wd of days) {
      for (const e of (perB[String(wd)] || [])) agg[Math.floor(e.s / 60)].burns++;
    }
  }
  const avgs = agg.filter((a) => a.n).map((a) => a.sum / a.n);
  if (!avgs.length) return;
  const lo = Math.min(...avgs), hi = Math.max(...avgs);

  const scope = $('weekday').value === 'all' ? ' (کل هفته)' : ' — ' + DATA.names[$('weekday').value];
  const head = document.createElement('h2');
  head.textContent = '🕐 نقشهٔ ساعت‌ها' + scope;
  box.appendChild(head);
  const help = document.createElement('div');
  help.className = 'rhelp';
  help.textContent =
    'برای هر ساعتِ شروع: میانگینِ تناوبِ بازه‌هایش (سبز = آرام‌تر، قرمز = پرتناوب‌تر)، ' +
    'بدترین بیشینهٔ تاریخی، و تعدادِ رشته‌های شدید (⚡) و سوختنِ تاپ-۱۰ (📌) که آن‌جا شروع شده‌اند. ' +
    `طول بازه: ${winLabel(winLen)}.`;
  box.appendChild(help);

  const grid = document.createElement('div');
  grid.className = 'hgrid';
  for (let h = 0; h < 24; h++) {
    const a = agg[h];
    const cell = document.createElement('div');
    cell.className = 'hcell';
    if (!a.n) {
      cell.innerHTML = `<span class="hh">${String(h).padStart(2, '0')}</span>—`;
    } else {
      const avg = a.sum / a.n;
      const t = hi > lo ? (avg - lo) / (hi - lo) : 0;
      cell.style.background = `hsl(${Math.round(120 * (1 - t))},65%,86%)`;
      const marks =
        (a.runs ? ` <span class="hm">⚡${a.runs}</span>` : '') +
        (a.burns ? ` <span class="hm">📌${a.burns}</span>` : '');
      cell.innerHTML =
        `<span class="hh">${String(h).padStart(2, '0')}</span>` +
        `<b>${avg.toFixed(1)}</b>` +
        `<span class="hx">تا ${a.mx}${marks}</span>`;
    }
    grid.appendChild(cell);
  }
  box.appendChild(grid);
  box.style.display = '';
}

function showCustomMsg(box, msg) {
  box.innerHTML = `<div class="rhelp">${msg}</div>`;
  box.style.display = '';
}

// Look up a user-typed start time and show that window's full stat card for the
// selected weekday(s) — the same information the day cards give, on demand.
function renderCustom(ds, winLen, tol) {
  const box = $('custom');
  box.innerHTML = '';
  box.style.display = 'none';
  const raw = ($('customhour').value || '').trim();
  if (!raw) return;
  const m = raw.match(/^(\d{1,2})(?:[:.،]?(\d{2}))?$/);
  if (!m) { showCustomMsg(box, 'ساعت را مثل 14:30 وارد کن.'); return; }
  const hh = parseInt(m[1], 10);
  const mm = m[2] ? parseInt(m[2], 10) : 0;
  if (hh > 23 || mm > 59) { showCustomMsg(box, 'ساعتِ نامعتبر.'); return; }
  const target = hh * 60 + mm;
  const per = ds.rolling && ds.rolling[String(winLen)];
  if (!per) { showCustomMsg(box, 'برای این تایم‌فریم بازهٔ لغزان موجود نیست.'); return; }
  const showHist = $('hist').checked;

  const head = document.createElement('h2');
  head.textContent = `🔎 بازهٔ دلخواه — شروع ${fmtTime(target)}`;
  box.appendChild(head);
  const help = document.createElement('div');
  help.className = 'rhelp';
  help.textContent = `آمارِ کاملِ بازه‌ای که در این ساعت شروع می‌شود (طول: ${winLabel(winLen)}).`;
  box.appendChild(help);

  let any = false;
  for (const wd of selectedDays()) {
    const listw = per[String(wd)] || [];
    if (!listw.length) continue;
    let best = null, bd = Infinity;
    for (const w of listw) {
      let d = Math.abs(w.start - target);
      d = Math.min(d, DAY_MINUTES - d);
      if (d < bd) { bd = d; best = w; }
    }
    if (!best) continue;
    any = true;
    const card = document.createElement('div');
    card.className = 'day';
    const near = bd > 0 ? ' <span style="font-size:12px;color:#8a5a55">(نزدیک‌ترین)</span>' : '';
    card.innerHTML = `<h2>${DATA.names[String(wd)]}${near}</h2>`;
    card.appendChild(buildWinCard(best, wd, listw, tol, null, showHist));
    box.appendChild(card);
  }
  if (any) box.style.display = '';
}

function renderGap() {
  if (!DATA) return;
  const key = ($('coin').value || 'btc') + '_' + $('exchange').value + '_' + $('tf').value;
  const ds = DATA.datasets[key];
  const box = $('gapOut');
  box.innerHTML = '';
  if (!ds || !ds.gaps) { box.textContent = 'داده‌ای نیست.'; return; }
  const N = Math.max(1, parseInt($('gapN').value || '6', 10));
  const e = ds.gaps[String(N)];
  if (!e) {
    box.innerHTML = `<div class="gapbig">هیچ تناوبِ ≥ ${N} در کل سال رخ نداده.</div>`;
    return;
  }
  const g = e.gap, nx = e.next;
  const tfMin = ds.meta.tf_minutes || 5;

  const big = document.createElement('div');
  big.className = 'gapbig';
  big.innerHTML =
    `بعد از تناوبِ ≥ <b>${N}</b> (که <b>${g.n}</b> بار رخ داده): معمولاً ` +
    `<b>${g.avg}</b> کندل (~${Math.round(g.avg * tfMin)} دقیقه) فاصله، و تناوب بعدی ` +
    `معمولاً <b>${nx.avg}</b> تایی بوده.`;
  box.appendChild(big);

  // --- Gap to next alternation ---
  const gh = document.createElement('div');
  gh.className = 'gsub';
  gh.textContent = '⏱ فاصله تا تناوب بعدی (کندل)';
  box.appendChild(gh);
  const gi = document.createElement('div');
  gi.innerHTML =
    `<div class="row"><span>میانگین / میانه</span><b>${g.avg} / ${g.med} کندل</b></div>` +
    `<div class="row"><span>کم‌ترین / بیش‌ترین</span><b>${g.min} / ${g.max} کندل</b></div>`;
  box.appendChild(gi);
  box.appendChild(distBars(g.hist));

  // --- Length of the next alternation ---
  const nh = document.createElement('div');
  nh.className = 'gsub';
  nh.textContent = '🔁 طول تناوب بعدی';
  box.appendChild(nh);
  const ni = document.createElement('div');
  ni.innerHTML =
    `<div class="row"><span>میانگین / میانه</span><b>${nx.avg} / ${nx.med}</b></div>` +
    `<div class="row"><span>کم‌ترین / بیش‌ترین</span><b>${nx.min} / ${nx.max}</b></div>`;
  box.appendChild(ni);
  box.appendChild(distBars(nx.hist));
}

function fillWeekdays() {
  const sel = $('weekday');
  for (const wd of DATA.order) {
    const o = document.createElement('option');
    o.value = String(wd);
    o.textContent = DATA.names[String(wd)];
    sel.appendChild(o);
  }
}

// Populate the coin selector from the datasets that were actually built.
function fillCoins() {
  const sel = $('coin');
  const coins = (DATA.meta && DATA.meta.coins) || [['btc', 'بیت‌کوین']];
  for (const [key, label] of coins) {
    const o = document.createElement('option');
    o.value = key;
    o.textContent = label;
    sel.appendChild(o);
  }
}

let lastFetch = 0;

// Re-pull data.json and re-render, preserving the user's current selections
// (the controls are untouched). Throttled so returning to the app doesn't spam
// the network; `cache: 'no-cache'` revalidates, so unchanged data is a cheap
// 304. Called on focus/visibility and on a background interval.
async function refreshData(force) {
  const now = Date.now();
  if (!force && now - lastFetch < 90 * 1000) return;
  lastFetch = now;
  try {
    const res = await fetch('./data.json', { cache: 'no-cache' });
    const fresh = await res.json();
    if (fresh && fresh.datasets) {
      DATA = fresh;
      render();  // render() also refreshes the records panel and the gap section
    }
  } catch (e) { /* transient network error -> keep showing current data */ }
}

async function init() {
  try {
    const res = await fetch('./data.json', { cache: 'no-cache' });
    DATA = await res.json();
    lastFetch = Date.now();
  } catch (e) {
    $('meta').textContent = 'خطا در بارگذاری داده.';
    return;
  }
  fillCoins();
  fillWeekdays();
  ['coin', 'exchange', 'tf', 'window', 'winlen', 'order', 'weekday', 'topn', 'tol', 'customhour', 'nooverlap', 'hist']
    .forEach((id) => $(id).addEventListener('input', render));
  $('gapN').addEventListener('input', renderGap);
  render();

  // Keep an open app fresh: re-pull when the user comes back to it, and every
  // few minutes in the background (the data itself is rebuilt hourly).
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') refreshData();
  });
  window.addEventListener('focus', () => refreshData());
  setInterval(() => {
    if (document.visibilityState === 'visible') refreshData();
  }, 5 * 60 * 1000);
}

if ('serviceWorker' in navigator) {
  // Auto-reload once when a freshly installed service worker takes control,
  // so deploys apply without the user manually clearing the cache.
  let refreshing = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (refreshing || !navigator.serviceWorker.controller) return;
    refreshing = true;
    location.reload();
  });
  // updateViaCache:'none' so the SW script itself is never served stale, and
  // check for a new version when the user returns to the app and every few
  // minutes — so a new deploy applies to an OPEN app too, not just on reload.
  window.addEventListener('load', () =>
    navigator.serviceWorker.register('./sw.js', { updateViaCache: 'none' })
      .then((reg) => {
        reg.update();
        document.addEventListener('visibilitychange', () => {
          if (document.visibilityState === 'visible') reg.update();
        });
        setInterval(() => reg.update(), 5 * 60 * 1000);
      })
      .catch(() => {}));
}
init();
