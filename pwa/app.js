'use strict';

const DAY_MINUTES = 24 * 60;
let DATA = null;

const $ = (id) => document.getElementById(id);

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
  // order = "<metric>_<dir>": metric avg|max, dir low|high.
  const order = $('order').value;
  const byMax = order.startsWith('max');
  const high = order.endsWith('high');

  // Window length: options come from the dataset's available rolling lengths.
  syncWinlen(ds);
  const winLen = mode === 'rolling' ? parseInt($('winlen').value, 10) : 60;
  $('winlen').disabled = mode !== 'rolling';

  renderRecords(ds, winLen);

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
    let list = (source || []).slice();
    if (!list.length) continue;
    const keyf = byMax ? (x) => x.mx : (x) => x.avg;      // primary metric
    const tief = byMax ? (x) => x.avg : (x) => x.mx;      // tie-breaker
    list.sort((a, b) =>
      (high ? keyf(b) - keyf(a) : keyf(a) - keyf(b)) ||
      (high ? tief(b) - tief(a) : tief(a) - tief(b)) ||
      a.start - b.start);
    const chosen = pick(list, topn, noOverlap, winLen);

    const card = document.createElement('div');
    card.className = 'day';
    card.innerHTML = `<h2>${DATA.names[String(wd)]}</h2>`;

    chosen.forEach((w, i) => {
      const div = document.createElement('div');
      div.className = 'win';
      const star = i === 0 ? ' <span class="star">★</span>' : '';
      const recMark = w.rec ? ' <span class="recbadge">🔺</span>' : '';
      const recRow = w.rec
        ? `<div class="row"><span>🔺 رکورد اخیر</span><b>بیشینه از ${w.rec.f} به ${w.rec.t} (${w.rec.w})</b></div>`
        : '';
      div.innerHTML =
        `<span class="badge">${i + 1}</span>` +
        `<div class="t">${w.label}${star}${recMark}</div>` +
        `<div class="row"><span>تعداد نمونه</span><b>${w.n} بار</b></div>` +
        `<div class="row"><span>میانگین تناوب</span><b>${w.avg.toFixed(2)}</b></div>` +
        `<div class="row"><span>احتمال تناوب بالای میانگین</span><b>${w.ap}%</b></div>` +
        `<div class="row"><span>بیشینه</span><b>${w.mx} (${w.mxc} بار)</b></div>` +
        recRow;
      if (showHist) div.appendChild(histBars(w.hist));
      if (w.rc && w.rc.length) div.appendChild(recentToggle(w, wd));
      card.appendChild(div);
    });
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

// User toggle for the records panel: collapse overlapping record-breakers.
let recNoOverlap = false;

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
  const recs = [];
  for (const wd of DATA.order) {
    for (const w of (per[String(wd)] || [])) {
      if (w.rec) recs.push({ wd, w });
    }
  }
  if (!recs.length) return;

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

  // Newest record-break first (date descending), then calmest as a tie-breaker
  // so same-day records read in a sensible order.
  items.sort((a, b) =>
    b.w.rec.w.localeCompare(a.w.rec.w) ||
    (a.w.mx - b.w.mx) ||
    (a.w.avg - b.w.avg));

  const head = document.createElement('h2');
  head.textContent = `🔺 رکوردهای اخیر (${items.length.toLocaleString('fa')} مورد)`;
  box.appendChild(head);

  // Option to switch between overlapping (all) and non-overlapping (distinct
  // events) — each render rebuilds it, so it reflects the persisted state.
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
    `این بازه‌ها به‌تازگی رکوردِ بیشینه‌شان شکسته — عددی بالاتر از هرچه قبلاً دیده شده. ` +
    `از جدیدترین (بالا) تا قدیمی‌ترین (پایین). طول بازه: ${winLabel(winLen)}.`;
  box.appendChild(help);

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
      `<div class="row"><span>رکورد</span><b class="hot">بیشینه از ${w.rec.f} به ${w.rec.t} • ${w.rec.w}</b></div>` +
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
  ['coin', 'exchange', 'tf', 'window', 'winlen', 'order', 'weekday', 'topn', 'nooverlap', 'hist']
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
  window.addEventListener('load', () =>
    navigator.serviceWorker.register('./sw.js')
      .then((reg) => reg.update())
      .catch(() => {}));
}
init();
