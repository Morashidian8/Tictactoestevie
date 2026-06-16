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

function render() {
  if (!DATA) return;
  const key = $('exchange').value + '_' + $('tf').value;
  const ds = DATA.datasets[key];
  const out = $('out');
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
  // Window length only applies to rolling windows; clock buckets are 1 hour.
  const winLen = mode === 'rolling' ? parseInt($('winlen').value, 10) : 60;
  $('winlen').disabled = mode !== 'rolling';

  const winLabel = { 60: '۱ ساعت', 120: '۲ ساعت', 180: '۳ ساعت' }[winLen] || `${winLen} دقیقه`;
  const m = ds.meta;
  $('meta').innerHTML =
    `${m.exchange} • تایم‌فریم ${m.timeframe} • بازه ${winLabel} • ` +
    `${m.candles.toLocaleString('en')} کندل • ${m.oldest} تا ${m.newest} • ${DATA.meta.tz}`;

  const days = wdSel === 'all' ? DATA.order : [parseInt(wdSel, 10)];
  out.innerHTML = '';

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
      div.innerHTML =
        `<span class="badge">${i + 1}</span>` +
        `<div class="t">${w.label}${star}</div>` +
        `<div class="row"><span>تکرار در سال</span><b>${w.n} بار</b></div>` +
        `<div class="row"><span>میانگین تناوب</span><b>${w.avg.toFixed(2)}</b></div>` +
        `<div class="row"><span>احتمال تناوب بالای میانگین</span><b>${w.ap}%</b></div>` +
        `<div class="row"><span>بیشینه</span><b>${w.mx} (${w.mxc} بار)</b></div>`;
      if (showHist) div.appendChild(histBars(w.hist));
      card.appendChild(div);
    });
    out.appendChild(card);
  }
  renderGap();
}

function renderGap() {
  if (!DATA) return;
  const key = $('exchange').value + '_' + $('tf').value;
  const ds = DATA.datasets[key];
  const box = $('gapOut');
  box.innerHTML = '';
  if (!ds || !ds.gaps) { box.textContent = 'داده‌ای نیست.'; return; }
  const N = Math.max(1, parseInt($('gapN').value || '6', 10));
  const s = ds.gaps[String(N)];
  if (!s) {
    box.innerHTML = `<div class="gapbig">هیچ تناوبِ ≥ ${N} در کل سال رخ نداده.</div>`;
    return;
  }
  const tfMin = ds.meta.tf_minutes || 5;
  const big = document.createElement('div');
  big.className = 'gapbig';
  big.innerHTML =
    `بعد از تناوبِ ≥ <b>${N}</b>، معمولاً <b>${s.avg}</b> کندل ` +
    `(~${Math.round(s.avg * tfMin)} دقیقه) تا تناوب بعدی فاصله بوده.`;
  box.appendChild(big);

  const info = document.createElement('div');
  info.innerHTML =
    `<div class="row"><span>تعداد رخداد در سال</span><b>${s.n} بار</b></div>` +
    `<div class="row"><span>میانه‌ی فاصله</span><b>${s.med} کندل</b></div>` +
    `<div class="row"><span>کم‌ترین / بیش‌ترین فاصله</span><b>${s.min} / ${s.max} کندل</b></div>`;
  box.appendChild(info);

  // Distribution of gaps (last bucket = "21+").
  const max = Math.max(...s.hist.map((p) => p[1]), 1);
  const wrap = document.createElement('div');
  wrap.className = 'hist';
  for (const [g, c] of s.hist) {
    const bar = document.createElement('div');
    bar.className = 'bar';
    const label = g >= 21 ? '۲۱+' : String(g);
    bar.innerHTML =
      `<span class="k">${label}</span>` +
      `<span class="b" style="width:${Math.round((c / max) * 120) + 2}px"></span>` +
      `<span class="c">${c}</span>`;
    wrap.appendChild(bar);
  }
  box.appendChild(wrap);
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

async function init() {
  try {
    const res = await fetch('./data.json', { cache: 'no-cache' });
    DATA = await res.json();
  } catch (e) {
    $('meta').textContent = 'خطا در بارگذاری داده.';
    return;
  }
  fillWeekdays();
  ['exchange', 'tf', 'window', 'winlen', 'order', 'weekday', 'topn', 'nooverlap', 'hist']
    .forEach((id) => $(id).addEventListener('input', render));
  $('gapN').addEventListener('input', renderGap);
  render();
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
