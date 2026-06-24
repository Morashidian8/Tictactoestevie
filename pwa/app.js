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
  const h = min / 60;
  return Number.isInteger(h) ? `${h.toLocaleString('fa')} ساعت` : `${min} دقیقه`;
}

// Rebuild the window-length dropdown from the lengths the dataset actually has.
function syncWinlen(ds) {
  const sel = $('winlen');
  const want = Object.keys(ds.rolling).map(Number).sort((a, b) => a - b);
  const current = sel.value;
  const have = Array.from(sel.options).map((o) => Number(o.value));
  const same = have.length === want.length && have.every((v, i) => v === want[i]);
  if (!same) {
    sel.innerHTML = '';
    for (const wm of want) {
      const o = document.createElement('option');
      o.value = String(wm);
      o.textContent = winLabel(wm);
      sel.appendChild(o);
    }
    // Keep the previous choice if still available, else prefer 60, else first.
    sel.value = want.includes(Number(current)) ? current
      : (want.includes(60) ? '60' : String(want[0]));
  }
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

  // Window length: options come from the dataset's available rolling lengths.
  syncWinlen(ds);
  const winLen = mode === 'rolling' ? parseInt($('winlen').value, 10) : 60;
  $('winlen').disabled = mode !== 'rolling';

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

function renderGap() {
  if (!DATA) return;
  const key = $('exchange').value + '_' + $('tf').value;
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
