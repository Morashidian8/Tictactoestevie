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
  const order = $('order').value;
  const wdSel = $('weekday').value;
  const topn = Math.max(1, parseInt($('topn').value || '2', 10));
  const noOverlap = $('nooverlap').checked;
  const showHist = $('hist').checked;
  const highest = order === 'highest';
  // Window length only applies to rolling windows; clock buckets are 1 hour.
  const winLen = mode === 'rolling' ? parseInt($('winlen').value, 10) : 60;
  $('winlen').disabled = mode !== 'rolling';

  const m = ds.meta;
  $('meta').innerHTML =
    `${m.exchange} • تایم‌فریم ${m.timeframe} • بازه ${winLen === 120 ? '۲ ساعت' : '۱ ساعت'} • ` +
    `${m.candles.toLocaleString('en')} کندل • ${m.oldest} تا ${m.newest} • ${DATA.meta.tz}`;

  const days = wdSel === 'all' ? DATA.order : [parseInt(wdSel, 10)];
  out.innerHTML = '';

  for (const wd of days) {
    const source = mode === 'rolling'
      ? (ds.rolling[String(winLen)] || {})[String(wd)]
      : ds.clock[String(wd)];
    let list = (source || []).slice();
    if (!list.length) continue;
    list.sort((a, b) => (highest ? b.avg - a.avg : a.avg - b.avg)
      || (highest ? b.mx - a.mx : a.mx - b.mx) || a.start - b.start);
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
