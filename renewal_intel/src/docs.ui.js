/* ---------- documents & contracts ---------- */
// PDF, photos, Word and text files are read on the device; each read value is shown next to the image of
// its row so the broker confirms it before it becomes a contract. Saved contracts feed the year-to-year
// comparison and the market benchmark.
const DOC_RE = /\.(pdf|jpe?g|png|webp|docx|txt)$/i;
const isDocFile = f => DOC_RE.test(f.name);
const MT = v => v === Infinity ? "بدون سقف" : fmtNum(v);
const pctCh = (a, b) => a == null || b == null || a === Infinity || b === Infinity || !a ? null : b / a - 1;
const median = a => { const s = a.filter(v => v != null && isFinite(v)).sort((x, y) => x - y); return s.length ? (s.length % 2 ? s[s.length >> 1] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2) : null; };
const orgKey = s => norm(s || "").replace(/^(مجتمع|شرکت|موسسه|دانشگاه|سازمان)\s+/, "").replace(/\s+/g, "");

async function handleDocs(files, opts){
  const box = n => `<div class="box" role="dialog" aria-modal="true" aria-label="خواندن مدارک"><div class="panel-h"><h2>خواندن مدارک</h2></div><div class="panel-b" style="display:flex;flex-direction:column;gap:10px">
    <p class="small muted">همه‌چیز روی همین دستگاه خوانده می‌شود؛ فایلی به جایی فرستاده نمی‌شود. اسکن و عکس چند ثانیه برای هر صفحه طول می‌کشد.</p>
    <div class="fs on"><span class="fi">${fmtInt(n)}</span><div><b id="docFile"></b><span id="docStep">آماده‌سازی…</span></div></div><div class="prog"><i id="docBar" style="width:3%"></i></div></div></div>`;
  let last = null;
  for (let i = 0; i < files.length; i++){
    const f = files[i];
    $("modal").innerHTML = box(i + 1); $("modal").hidden = false; $("docFile").textContent = `${f.name} (${fmtInt(i + 1)} از ${fmtInt(files.length)})`;
    let ticks = 0;
    try {
      const doc = await readDocument(f, (s, frac) => { ticks++; $("docStep").textContent = s; $("docBar").style.width = (frac != null ? Math.max(3, Math.min(99, frac * 100)) : Math.min(60, 3 + ticks * 2)).toFixed(1) + "%"; });
      const u = understand(doc);
      u.planPremium = {}; (u.plans.length ? u.plans : ["اصلی"]).forEach((p, k) => { u.planPremium[p] = { v: k === 0 && u.premium ? u.premium / 1e7 : null, per: "year" }; });
      state.docs.push({ id: "d" + Date.now() + i, file: f.name, doc, u, saved: false });
      last = state.docs.length - 1;
    } catch (err){ state.errors.push(`«${f.name}» خوانده نشد: ${err.message}`); }
  }
  $("modal").hidden = true;
  if (opts && opts.claims) state.retClaims = state.docs.slice(state.docs.length - files.length).filter(d => !d.saved).map(d => d.id);
  const first = opts && opts.claims ? state.docs.findIndex(d => state.retClaims && state.retClaims.includes(d.id)) : -1;
  if (first >= 0) go("doc", first); else if (last != null) go("doc", last); else render();
}

// The row as it looks on paper: the start of its title (Persian starts at the right) next to its amounts,
// so the number is large enough to check even on a phone.
function rowSnip(d, r){
  if (r.img !== undefined) return r.img;
  const pg = d.doc.pages[r.page]; if (!pg || !pg.canvas || !r.box) return (r.img = "");
  const parts = [];
  if (r.lbox){ const w = Math.min(r.lbox.x1 - r.lbox.x0, (r.box.y1 - r.box.y0) * 5); parts.push({ x0: r.lbox.x1 - w, x1: r.lbox.x1 }); }
  if (r.vbox) parts.push({ x0: r.vbox.x0, x1: r.vbox.x1 });
  if (!parts.length) parts.push({ x0: r.box.x0, x1: r.box.x1 });
  const y0 = r.box.y0, h = r.box.y1 - r.box.y0, total = parts.reduce((s, p) => s + p.x1 - p.x0, 0) + (parts.length - 1) * 12;
  const sc = Math.min(1.2, 640 / total), c = document.createElement("canvas");
  c.width = Math.round(total * sc); c.height = Math.round(h * sc);
  const g = c.getContext("2d"); g.fillStyle = "#fff"; g.fillRect(0, 0, c.width, c.height);
  let x = c.width; // right to left, like the page
  parts.forEach(p => { const w = (p.x1 - p.x0) * sc; x -= w; g.drawImage(pg.canvas, p.x0, y0, p.x1 - p.x0, h, x, 0, w, c.height); x -= 12 * sc; });
  return (r.img = c.toDataURL("image/jpeg", 0.85));
}
const catOptions = sel => `<option value="">— نادیده گرفتن —</option>` + CCAT.map(([k, n]) => `<option value="${k}"${k === sel ? " selected" : ""}>${n}</option>`).join("");

function renderDoc(i){
  const d = state.docs[i]; if (!d){ state.page = "docs"; return render(); }
  const u = d.u, plans = u.plans.length ? u.plans : ["اصلی"];
  setHead(d.file, "خواندن مدرک");
  // a cap that jumps more than ×3 or halves against the same organisation's earlier contract is flagged too
  const prev = state.contracts.filter(c => c.src !== d.id && u.org && orgKey(c.org) === orgKey(u.org) && c.year < (u.year || 0)).sort((x, y) => y.year - x.year)[0];
  u.rows.forEach(r => { r.odd = null; if (!prev || !r.cat) return; const pv = prev.caps[r.cat]; Object.entries(r.vals).forEach(([p, v]) => {
    if (pv == null || !isFinite(pv) || v.rial === Infinity || r.cat === "combo" || r.cat === "total") return; const ratio = v.rial / 1e7 / pv;
    if (ratio > 3 || ratio < 0.5){ v.conf = Math.min(v.conf, 60); r.odd = `در ${fmtInt(prev.year).replace(/٬/g, "")} ${MT(pv)} بود (×${fmtNum(ratio)})؛ با تصویر مقایسه کنید.`; } }); });
  const lowRows = u.rows.filter(r => Object.values(r.vals).some(v => v.conf < 70)).length;
  $("view").innerHTML = `
  ${crumb(["docs", "مدارک و قراردادها"], [null, esc(d.file)])}
  <div class="ph"><div style="display:flex;flex-direction:column;gap:6px"><div class="hchips"><h1>${esc(d.file)}</h1><span class="tag t-protect">${esc(u.kind)}</span>${d.saved ? '<span class="tag t-good">ذخیره شد</span>' : ""}</div>
    <span class="sub">${[u.org, u.insurer, u.year ? fmtInt(u.year).replace(/٬/g, "") : null, u.insured ? fmtInt(u.insured) + " نفر" : null].filter(Boolean).map(esc).join(" · ")} · ${fmtInt(d.doc.pages.length || 1)} صفحه</span>
    ${progressHTML(u)}</div>
    <div class="actions"><button class="btn" type="button" id="docDel">حذف</button><button class="btn primary" type="button" id="docSave">${d.saved ? "به‌روزرسانی قرارداد" : "ذخیره به‌عنوان قرارداد"}</button></div></div>
  <section class="panel"><div class="panel-h"><h2>مشخصات</h2><span class="small muted">هر چیزی را که درست خوانده نشده اصلاح کنید</span></div>
    <div class="panel-b form">
      <label class="field">بیمه‌گذار (سازمان)<input type="text" data-df="org" value="${esc(u.org || "")}" placeholder="مثلاً مجتمع فولاد گیلان"></label>
      <label class="field">بیمه‌گر<input type="text" data-df="insurer" value="${esc(u.insurer || "")}" placeholder="مثلاً بیمه آسیا"></label>
      <label class="field">سال قرارداد (شروع)<input type="number" data-df="year" value="${u.year || ""}" placeholder="۱۴۰۵"></label>
      <label class="field">تعداد بیمه‌شدگان<input type="number" data-df="insured" value="${u.insured || ""}"></label>
      <label class="field">فرانشیز (٪)<input type="number" data-df="franchise" value="${u.franchise ?? ""}"></label>
      ${plans.map(p => { const pp = u.planPremium[p] || { v: null, per: "year" }; return `<label class="field">حق‌بیمهٔ هر نفر${plans.length > 1 ? ` — ${esc(p)}` : ""} (میلیون تومان)
        <span style="display:flex;gap:6px"><input type="number" step="0.01" data-dp="${esc(p)}" value="${pp.v != null ? +pp.v.toFixed(3) : ""}" style="flex:1" placeholder="${u.kind === "استعلام قیمت" ? "هنوز قیمتی نیست" : "وارد کنید"}">
        <select data-dper="${esc(p)}" style="border:1px solid var(--input-line);border-radius:9px;background:var(--surface);padding:0 8px"><option value="year"${pp.per === "year" ? " selected" : ""}>سالانه</option><option value="month"${pp.per === "month" ? " selected" : ""}>ماهانه</option></select></span>
        ${p === plans[0] && u.premiumNote ? `<span class="small muted">${esc(u.premiumNote)}</span>` : ""}</label>
        <label class="field">کل حق‌بیمهٔ سالانه${plans.length > 1 ? ` — ${esc(p)}` : ""} (میلیون تومان)<input type="number" step="1" data-dtot="${esc(p)}" value="${pp.v != null && u.insured ? Math.round((pp.per === "month" ? pp.v * 12 : pp.v) * u.insured) : ""}" placeholder="هر نفر × تعداد"><span class="small muted" data-dtotnote="${esc(p)}">${pp.v != null && u.insured ? `${fmtNum(pp.per === "month" ? pp.v * 12 : pp.v)} × ${fmtInt(u.insured)} نفر` : "با واردکردن کل، حق‌بیمهٔ هر نفر خودکار حساب می‌شود"}</span></label>`; }).join("")}
    </div></section>
  ${reviewHTML(d, u, plans, prev)}
  ${u.issues.length ? `<section class="panel"><div class="panel-h"><h2>نیاز به توجه</h2></div><div class="panel-b"><ul class="dq">${u.issues.map(x => `<li><span class="sev tag t-mid">بررسی</span><span>${esc(x)}</span></li>`).join("")}</ul></div></section>` : ""}
  <details class="panel"><summary class="panel-h" style="cursor:pointer"><h2>متن کامل خوانده‌شده</h2></summary><div class="panel-b">${u.fixes ? `<p class="small muted" style="margin-bottom:8px">${fmtInt(u.fixes)} واژه با فرهنگ واژه‌های بیمه اصلاح شد؛ رنگی‌اند و با نگه‌داشتن رویشان، آنچه خوانده شده بود دیده می‌شود.</p>` : ""}<pre style="white-space:pre-wrap;font:inherit;font-size:12.5px;max-height:420px;overflow:auto;margin:0">${lexHtml(d.doc.text.trim())}</pre></div></details>`;

  const num = s => { s = drNorm(String(s)).trim(); if (/^(∞|بدون|بی)/.test(s)) return Infinity; const v = parseFloat(s.replace(/,/g, "")); return isNaN(v) ? null : v; };
  $("view").querySelectorAll("[data-df]").forEach(el => el.onchange = () => { const k = el.dataset.df; u[k] = el.type === "number" ? (el.value === "" ? null : +el.value) : el.value.trim(); if (k === "insured") plans.forEach(syncTot); });
  const syncTot = p => { const pp = u.planPremium[p] || {}, t = $("view").querySelector(`[data-dtot="${CSS.escape(p)}"]`), nt = $("view").querySelector(`[data-dtotnote="${CSS.escape(p)}"]`); if (!t) return;
    const y = pp.v == null ? null : pp.per === "month" ? pp.v * 12 : pp.v;
    t.value = y != null && u.insured ? Math.round(y * u.insured) : ""; nt.textContent = y != null && u.insured ? `${fmtNum(y)} × ${fmtInt(u.insured)} نفر` : "با واردکردن کل، حق‌بیمهٔ هر نفر خودکار حساب می‌شود"; };
  $("view").querySelectorAll("[data-dp]").forEach(el => el.onchange = () => { const p = el.dataset.dp; (u.planPremium[p] = u.planPremium[p] || { per: "year" }).v = num(el.value); syncTot(p); });
  $("view").querySelectorAll("[data-dtot]").forEach(el => el.onchange = () => { const p = el.dataset.dtot, t = num(el.value), pp = u.planPremium[p] = u.planPremium[p] || { per: "year" };
    if (t == null || !u.insured) return; const y = t / u.insured; pp.v = pp.per === "month" ? y / 12 : y;
    const inp = $("view").querySelector(`[data-dp="${CSS.escape(p)}"]`); if (inp) inp.value = +pp.v.toFixed(3); syncTot(p); });
  $("view").querySelectorAll("[data-dper]").forEach(el => el.onchange = () => { const p = el.dataset.dper; (u.planPremium[p] = u.planPremium[p] || { v: null }).per = el.value; syncTot(p); });
  $("view").querySelectorAll("[data-dc]").forEach(el => el.onchange = () => { u.rows[+el.dataset.dc].cat = el.value || null; });
  $("view").querySelectorAll("[data-dv]").forEach(el => el.onchange = () => { const [ri, p] = el.dataset.dv.split("|"), v = num(el.value), r = u.rows[+ri];
    if (v == null) delete r.vals[p]; else r.vals[p] = { rial: v === Infinity ? Infinity : v * 1e7, conf: 100 }; el.style.borderColor = "var(--input-line)"; el.style.background = "var(--surface)";
    $("view").querySelectorAll(`[data-rial="${el.dataset.dv}"]`).forEach(x => { x.textContent = v == null ? "" : v === Infinity ? "بدون سقف" : fmtInt(v * 1e7) + " ریال"; });
    $("view").querySelectorAll(`[data-dv="${el.dataset.dv}"]`).forEach(x => { if (x !== el) x.value = el.value; }); });
  // zoom: the whole row at full resolution, scrollable and pinch-zoomable
  $("view").querySelectorAll("[data-zoom]").forEach(img => img.onclick = () => {
    const r = u.rows[+img.dataset.zoom], pg = d.doc.pages[r.page]; if (!pg || !r.box) return;
    const b = r.box, pad = 10, c = document.createElement("canvas"), w = b.x1 - b.x0 + pad * 2, h = b.y1 - b.y0 + pad * 2;
    c.width = w; c.height = h; const g = c.getContext("2d"); g.fillStyle = "#fff"; g.fillRect(0, 0, w, h); g.drawImage(pg.canvas, b.x0 - pad, b.y0 - pad, w, h, 0, 0, w, h);
    $("modal").innerHTML = `<div class="box" style="width:min(1100px,100%)" role="dialog" aria-modal="true" aria-label="بزرگ‌نمایی"><div class="panel-h"><h2>بزرگ‌نمایی ردیف</h2>
      <div style="display:flex;gap:6px"><button class="iconbtn" type="button" id="zIn" aria-label="بزرگ‌تر">＋</button><button class="iconbtn" type="button" id="zOut" aria-label="کوچک‌تر">−</button><button class="iconbtn" type="button" data-close aria-label="بستن">✕</button></div></div>
      <div style="overflow:auto;max-height:75vh;padding:10px;touch-action:pan-x pan-y pinch-zoom"><img id="zImg" src="${c.toDataURL("image/png")}" alt="" style="width:${Math.max(100, Math.round(1600 / Math.max(1, w) * 100))}%;max-width:none;image-rendering:auto;display:block"></div></div>`;
    $("modal").hidden = false;
    const z = k => { const el = $("zImg"); el.style.width = Math.max(50, parseFloat(el.style.width) * k) + "%"; };
    $("zIn").onclick = () => z(1.4); $("zOut").onclick = () => z(1 / 1.4);
  });
  $("view").querySelectorAll("[data-cur]").forEach(el => el.onclick = () => { d.cur = +el.dataset.cur; render(); });
  $("view").querySelectorAll("[data-alt]").forEach(el => el.onclick = () => { const [p, v] = el.dataset.alt.split("|"), r = u.rows[d.cur]; r.vals[p] = { rial: +v, conf: 100 }; r.odd = null; r.fixedByUser = true; render(); });
  const nextRow = () => { const order = u.rows.map((r, k) => k), doubt = order.find(k => !u.rows[k].ok && rowStatus(u.rows[k]) === "doubt"); return doubt ?? order.find(k => !u.rows[k].ok) ?? null; };
  if ($("rvOk")) $("rvOk").onclick = () => { u.rows[d.cur].ok = true; d.cur = nextRow(); render(); };
  if ($("rvAllSure")) $("rvAllSure").onclick = () => { u.rows.forEach(r => { if (rowStatus(r) === "sure") r.ok = true; }); d.cur = nextRow(); render(); };
  if ($("rvSkip")) $("rvSkip").onclick = () => { const r = u.rows[d.cur]; r.cat = null; r.ok = true; d.cur = nextRow(); render(); };
  const box = $("paperBox"), hl = $("paperHl"); if (box && hl) setTimeout(() => { box.scrollTop = Math.max(0, hl.offsetTop - box.clientHeight / 2); }, 0);
  $("docAddRow").onclick = () => { u.rows.push({ cat: null, label: "ردیف دستی", vals: {}, page: 0, box: null, img: "" }); render(); };
  $("docDel").onclick = () => { state.contracts = state.contracts.filter(c => c.src !== d.id); state.docs.splice(i, 1); go("docs"); };
  $("docSave").onclick = () => {
    if (!u.org || !u.year){ alert("نام بیمه‌گذار و سال قرارداد را وارد کنید."); return; }
    state.contracts = state.contracts.filter(c => c.src !== d.id);
    plans.forEach(p => {
      const caps = {}; u.rows.forEach(r => { if (r.cat && r.vals[p]) { const v = r.vals[p].rial === Infinity ? Infinity : r.vals[p].rial / 1e7; if (caps[r.cat] == null) caps[r.cat] = v; } });
      if (!Object.keys(caps).length) return;
      const pp = u.planPremium[p] || {}, prem = pp.v == null ? null : pp.per === "month" ? pp.v * 12 : pp.v;
      state.contracts.push({ id: d.id + p, src: d.id, org: u.org, insurer: u.insurer, year: u.year, plan: plans.length > 1 ? p : "", premium: prem, insured: u.insured, franchise: u.franchise, caps, kind: u.kind });
    });
    d.saved = true; state.cmpOrg = orgKey(u.org);
    if (state.retClaims){ // started from the claims page: next unsaved document of that upload, then back to the analysis
      const next = state.docs.findIndex(x => !x.saved && state.retClaims.includes(x.id));
      if (next >= 0) return go("doc", next);
      state.retClaims = null; state.cl.picked = false; return go("claims");
    }
    go("docs");
  };
}

// ---------- review helpers ----------
const rowStatus = r => r.ok ? "ok" : (r.odd || Object.values(r.vals).some(v => v.conf < 70)) ? "doubt" : Object.values(r.vals).every(v => v.conf >= 85) && r.cat ? "sure" : "todo";
function progressHTML(u){
  const n = u.rows.length, st = u.rows.map(rowStatus), ok = st.filter(x => x === "ok").length, sure = st.filter(x => x === "sure").length, doubt = st.filter(x => x === "doubt").length;
  if (!n) return "";
  return `<div class="rv-prog"><div><b>${fmtInt(ok)} از ${fmtInt(n)} را تأیید کرده‌اید</b><span class="muted">${[sure ? `${fmtInt(sure)} با اطمینان بالا` : "", doubt ? `${fmtInt(doubt)} مشکوک` : ""].filter(Boolean).join(" · ")}</span></div>
    <div class="prog2"><i style="width:${(ok / n * 100).toFixed(0)}%"></i><i class="sure" style="width:${(sure / n * 100).toFixed(0)}%"></i></div>
    ${sure ? `<button class="link" type="button" id="rvAllSure" style="align-self:flex-start;font-size:12.5px">${fmtInt(sure)} ردیف مطمئن را یکجا تأیید کن</button>` : ""}</div>`;
}
const crop = (d, page, b, maxW, pad) => {
  const pg = d.doc.pages[page]; if (!pg || !pg.canvas || !b) return "";
  pad = pad ?? 6; const w = b.x1 - b.x0 + pad * 2, h = b.y1 - b.y0 + pad * 2, k = Math.min(3, maxW / w), c = document.createElement("canvas");
  c.width = Math.round(w * k); c.height = Math.round(h * k); const g = c.getContext("2d"); g.fillStyle = "#fff"; g.fillRect(0, 0, c.width, c.height); g.imageSmoothingQuality = "high";
  g.drawImage(pg.canvas, b.x0 - pad, b.y0 - pad, w, h, 0, 0, c.width, c.height); return c.toDataURL("image/jpeg", 0.88);
};
function pageImg(d, page){ d.pimg = d.pimg || {}; if (d.pimg[page] != null) return d.pimg[page]; const pg = d.doc.pages[page]; if (!pg || !pg.canvas) return (d.pimg[page] = "");
  const c = drFit(pg.canvas, Math.min(1100, pg.canvas.width)); return (d.pimg[page] = c.toDataURL("image/jpeg", 0.8)); }
// Likely misreads of a cap: swap the digits OCR confuses most (۵/۸، ۲/۳، ۶/۹) and keep the ones that fit last year.
function altValues(v, prevCap){
  if (!isFinite(v)) return [];
  const sig = String(Math.round(v)).replace(/0+$/, ""), zeros = String(Math.round(v)).length - sig.length, SW = { 8: "5", 5: "8", 2: "3", 3: "2", 6: "9", 9: "6" }, out = new Set();
  for (let k = 0; k < sig.length; k++){ const s2 = SW[sig[k]]; if (s2){ out.add(+(sig.slice(0, k) + s2 + sig.slice(k + 1) + "0".repeat(zeros))); } }
  return [...out].filter(x => !prevCap || (x / 1e7 / prevCap >= 0.6 && x / 1e7 / prevCap <= 3)).slice(0, 3);
}
function reviewHTML(d, u, plans, prev){
  if (!u.rows.length) return `<section class="panel"><div class="panel-b"><p class="muted">جدول پوششی پیدا نشد. اگر مدرک جدول دارد، عکس واضح‌تر یا PDF اصلی را امتحان کنید، یا ردیف‌ها را دستی اضافه کنید.</p><button class="btn" type="button" id="docAddRow">＋ افزودن ردیف</button></div></section>`;
  if (d.cur == null || d.cur >= u.rows.length){ const k = u.rows.findIndex(r => rowStatus(r) === "doubt"); d.cur = k >= 0 ? k : u.rows.findIndex(r => rowStatus(r) !== "ok" && rowStatus(r) !== "sure"); if (d.cur < 0) d.cur = 0; }
  const r = u.rows[d.cur], st = rowStatus(r), pg = d.doc.pages[r.page], b = r.vbox || r.box;
  const W = pg && pg.canvas ? pg.canvas.width : 1, H = pg && pg.canvas ? pg.canvas.height : 1;
  const ICON = { ok: ["c-ok", "✓"], sure: ["c-sure", "✓"], doubt: ["c-doubt", "!"], todo: ["c-todo", "…"] };
  return `<div class="rv">
    <section class="panel rv-paper"><div class="panel-h"><h2>صفحهٔ ${fmtInt(r.page + 1)} از ${fmtInt(d.doc.pages.length || 1)}</h2><span class="small muted">جای عدد روی کاغذ روشن شده</span></div>
      <div class="rv-pbox" id="paperBox">${pageImg(d, r.page) ? `<div class="rv-pg"><img src="${pageImg(d, r.page)}" alt="صفحهٔ مدرک">${b ? `<span class="rv-hl ${st}" id="paperHl" style="left:${((b.x0 - 8) / W * 100).toFixed(2)}%;top:${((b.y0 - 8) / H * 100).toFixed(2)}%;width:${((b.x1 - b.x0 + 16) / W * 100).toFixed(2)}%;height:${((b.y1 - b.y0 + 16) / H * 100).toFixed(2)}%"></span>` : ""}</div>` : '<p class="muted small panel-b">این مدرک تصویر صفحه ندارد (Word یا متن).</p>'}</div></section>
    <div class="rv-side">
      <section class="panel rv-cur ${st}"><div class="rv-h"><span class="tag ${st === "doubt" ? "t-mid" : st === "ok" ? "t-good" : "t-line"}">${st === "doubt" ? "⚠ نیاز به بررسی" : st === "ok" ? "✓ تأیید شد" : st === "sure" ? "با اطمینان بالا خوانده شد" : "بررسی کنید"}</span><span class="small muted">ردیف ${fmtInt(d.cur + 1)} از ${fmtInt(u.rows.length)}</span></div>
        <select data-dc="${d.cur}" class="rv-cat">${catOptions(r.cat)}</select>
        ${r.lbox ? `<img class="rv-lbl" src="${crop(d, r.page, Object.assign({}, r.lbox, { x0: Math.max(r.lbox.x0, r.lbox.x1 - (r.lbox.y1 - r.lbox.y0) * 7) }), 640, 4)}" alt="عنوان ردیف در مدرک">` : ""}
        ${r.vbox ? `<img class="rv-cell" src="${crop(d, r.page, r.vbox, 640, 8)}" data-zoom="${d.cur}" alt="عدد در مدرک؛ برای بزرگ‌نمایی بزنید">` : ""}
        ${plans.map(p => { const v = r.vals[p], pv = prev && r.cat ? prev.caps[r.cat] : null, alts = v && (st === "doubt") ? altValues(v.rial, pv) : [];
          return `<label class="rv-val">${plans.length > 1 ? `<span class="small">${esc(p)}</span>` : ""}<span class="rv-in"><input data-dv="${d.cur}|${esc(p)}" value="${v ? (v.rial === Infinity ? "∞" : +(v.rial / 1e7).toFixed(2)) : ""}" inputmode="decimal" aria-label="سقف ${esc(p)} به میلیون تومان"><em>میلیون تومان</em></span>
            <span class="small muted" data-rial="${d.cur}|${esc(p)}">${v ? (v.rial === Infinity ? "بدون سقف" : fmtInt(v.rial) + " ریال") : ""}</span></label>
            ${alts.length ? `<div class="rv-alt"><span class="small muted">منظورتان این است؟</span>${alts.map(x => `<button type="button" data-alt="${esc(p)}|${x}">${fmtNum(x / 1e7)}</button>`).join("")}</div>` : ""}`; }).join("")}
        ${r.odd ? `<p class="small" style="color:var(--mid-ink);margin:0">${esc(r.odd)}</p>` : ""}
        <div class="rv-act"><button class="btn primary" type="button" id="rvOk">تأیید و بعدی ←</button><button class="btn" type="button" id="rvSkip">این ردیف را نادیده بگیر</button></div>
      </section>
      <section class="panel rv-list">${u.rows.map((x, k) => { const s2 = rowStatus(x), ic = ICON[s2]; return `<button type="button" class="rv-li ${k === d.cur ? "now" : ""}" data-cur="${k}"><span class="s ${ic[0]}">${ic[1]}</span><span class="nm">${x.cat ? CCAT_NAME[x.cat] : `<span class="muted">${esc(x.label.slice(0, 30)) || "نوع نامعلوم"}</span>`}</span><b class="num">${Object.values(x.vals).map(v => v.rial === Infinity ? "∞" : fmtNum(v.rial / 1e7)).join(" / ")}${s2 === "doubt" ? "؟" : ""}</b></button>`; }).join("")}
        <div class="panel-b"><button class="btn" type="button" id="docAddRow">＋ افزودن ردیف</button></div></section>
    </div></div>`;
}
function sampleContracts(){
  // Synthetic two-year sample so the comparison page shows what it does before real documents are read.
  const base = { hosp: 120, special: 240, delivery: 12, para: 20, diag: 20, lab: 20, outsurg: 20, rehab: 20, combo: 20, ambIn: 0.5, ambOut: 1, refractive: 10, glasses: 2, dental: 8, visitdrug: 7, hearing: 18, infert: 12 };
  const next = { hosp: 250, special: 500, delivery: 20, para: 25, diag: 25, lab: 25, outsurg: 25, rehab: 25, combo: 75, ambIn: 2, ambOut: 4, refractive: 15, glasses: 2, dental: 8, visitdrug: 7, hearing: 18, infert: 12 };
  return [
    { id: "s1", src: "sample", sample: true, org: "نمونه: شرکت پتروشیمی بندر", insurer: "بیمهٔ نمونه", year: 1404, plan: "", premium: 11.28, insured: 2400, franchise: 10, caps: base },
    { id: "s2", src: "sample", sample: true, org: "نمونه: شرکت پتروشیمی بندر", insurer: "بیمهٔ نمونه", year: 1405, plan: "", premium: 23.4, insured: 2400, franchise: 10, caps: next },
    { id: "s3", src: "sample", sample: true, org: "نمونه: دانشگاه شهر", insurer: "", year: 1405, plan: "نقره‌ای", premium: 17.04, insured: 900, franchise: 10, caps: { hosp: 95, special: 110, delivery: 20, para: 38, diag: 30, lab: 15, outsurg: 9, ambIn: 3, ambOut: 6, dental: 18, glasses: 5, rehab: 4, visitdrug: 15, refractive: 12.5, hearing: 4 } },
  ];
}

function renderDocs(){
  setHead("مدارک و قراردادها", "خواندن و مقایسه");
  const all = state.contracts, groups = {};
  all.forEach(c => { const k = orgKey(c.org); (groups[k] = groups[k] || { name: c.org, list: [] }).list.push(c); });
  const keys = Object.keys(groups);
  if (!state.cmpOrg || !groups[state.cmpOrg]) state.cmpOrg = keys.find(k => groups[k].list.length > 1) || keys[0];
  const G = groups[state.cmpOrg];
  $("view").innerHTML = `
  ${crumb([null, "مدارک و قراردادها"])}
  <div class="ph"><div><h1>مدارک و قراردادها</h1><span class="sub">بیمه‌نامه، الحاقیه، شرایط مناقصه یا استعلام را بدهید (PDF، عکس، Word)؛ سقف‌ها و نرخ خوانده و سال‌به‌سال مقایسه می‌شود.</span></div></div>
  <label class="drop" for="docFileIn" id="docDrop"><span class="di"><svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"/><path d="M14 3v6h6M12 18v-6M9 15l3-3 3 3"/></svg></span><b>مدرک را اینجا بکشید یا بزنید</b><span>PDF (متنی یا اسکن)، عکس با گوشی، Word، اکسل سقف تعهدات یا متن · چند فایل با هم</span></label>
  <input type="file" id="docFileIn" accept=".pdf,.jpg,.jpeg,.png,.webp,.docx,.txt,.xlsx,.xls" multiple hidden>
  ${state.docs.length ? `<section class="panel"><div class="panel-h"><h2>مدارک خوانده‌شده</h2></div><div class="panel-b ilist">${state.docs.map((d, i) => `<button class="ili" type="button" data-doc="${i}"><span>${esc(d.file)} · ${esc(d.u.org || "بیمه‌گذار نامعلوم")} · ${d.u.year ? fmtInt(d.u.year).replace(/٬/g, "") : "سال نامعلوم"}</span><em class="tag ${d.saved ? "t-good" : "t-mid"}">${d.saved ? "ذخیره شد" : "بررسی و ذخیره"}</em></button>`).join("")}</div></section>` : ""}
  ${keys.length ? `<div class="fchips" role="group" aria-label="سازمان" style="flex-wrap:wrap">${keys.map(k => `<button type="button" data-org="${esc(k)}" aria-pressed="${k === state.cmpOrg}">${esc(short(groups[k].name))} ${fmtInt(groups[k].list.length)}</button>`).join("")}</div>${compareView(G, all)}` : ""}`;
  const ir = $("inflR");
  if (ir){ ir.oninput = () => { $("inflV").textContent = fmtInt(+ir.value) + "٪"; ir.style.setProperty("--p", (+ir.value / 80 * 100) + "%"); };
    ir.onchange = () => { state.infl = +ir.value / 100; render(); setTimeout(() => { const el = $("proj"); if (el) el.scrollIntoView({ block: "start" }); }, 0); }; }
  if ($("projXlsx")){ const list = G.list.slice().sort((a, b) => (a.plan || "").localeCompare(b.plan || "") || a.year - b.year), pairs = [];
    list.forEach((c, i) => { const prev = list.slice(0, i).reverse().find(x => (x.plan || "") === (c.plan || "") && x.year < c.year); if (prev) pairs.push([prev, c]); });
    const cats = CCAT.map(c => c[0]).filter(k => list.some(c => c.caps[k] != null));
    $("projXlsx").onclick = () => { try { projectionXlsx(pairs[pairs.length - 1], cats); } catch (e){ alert("ساخت فایل ممکن نشد: " + e.message); } }; }
  $("docFileIn").onchange = e => { const f = [...e.target.files]; e.target.value = ""; if (f.length) handleDocs(f); };
  const dz = $("docDrop"); dz.ondragover = e => { e.preventDefault(); dz.classList.add("over"); }; dz.ondragleave = () => dz.classList.remove("over");
  dz.ondrop = e => { e.preventDefault(); dz.classList.remove("over"); const f = [...e.dataTransfer.files].filter(f => isDocFile(f) || /\.xlsx?$/i.test(f.name)); if (f.length) handleDocs(f); };
}

function compareView(G, all){
  const list = G.list.slice().sort((a, b) => (a.plan || "").localeCompare(b.plan || "") || a.year - b.year);
  const ORDER = ["hosp", "special", "delivery", "infert", "para", "diag", "lab", "fetal", "outsurg", "rehab", "visitdrug", "visit", "drug", "emergency", "dental", "refractive", "glasses", "hearing", "ambIn", "ambOut", "amb", "organs", "prosthesis", "orthosis", "supplies", "specialDis", "combo", "total"];
  const cats = ORDER.filter(k => list.some(c => c.caps[k] != null));
  const label = c => `${fmtInt(c.year).replace(/٬/g, "")}${c.plan ? " · " + c.plan : ""}`;
  // consecutive years of the same plan
  const pairs = []; list.forEach((c, i) => { const prev = list.slice(0, i).reverse().find(x => (x.plan || "") === (c.plan || "") && x.year < c.year); if (prev) pairs.push([prev, c]); });
  // the market benchmark only uses real contracts (samples only benchmark other samples)
  const isSample = list.every(c => c.sample);
  const others = all.filter(c => orgKey(c.org) !== orgKey(G.name) && (isSample || !c.sample));
  const market = k => median(others.map(c => c.caps[k]));
  const sugg = [];
  pairs.forEach(([a, b]) => {
    // hospital and special surgery carry most of the cost, so they are judged apart from outpatient items;
    // shared and total caps differ in what they cover and are never compared year to year
    const pc = pctCh(a.premium, b.premium), ch = k => pctCh(a.caps[k], b.caps[k]);
    const main = median(["hosp", "special"].map(ch).filter(v => v != null)), rest = median(cats.filter(k => !["hosp", "special", "combo", "total"].includes(k)).map(ch).filter(v => v != null));
    const tag = b.plan ? `«${b.plan}» ` : "";
    if (pc != null && (main != null || rest != null)){
      const ref = main ?? rest;
      if (pc > Math.max(main ?? -1, rest ?? -1) + 0.1) sugg.push(["warn", `نرخ ${tag}${fmtSignedPct(pc)} بالا رفته، بیشتر از سقف‌ها (${main != null ? `بستری و جراحی ${fmtSignedPct(main)}` : ""}${main != null && rest != null ? "، " : ""}${rest != null ? `بقیهٔ بندها میانه ${fmtSignedPct(rest)}` : ""}). قیمت به ازای پوشش حدود ${fmtPct((1 + pc) / (1 + ref) - 1)} گران‌تر شده؛ در مذاکرهٔ سال بعد افزایش نرخ را به افزایش تعهدات گره بزنید.`]);
      else if (main != null && Math.abs(pc - main) <= 0.1) sugg.push(["note", `نرخ ${tag}(${fmtSignedPct(pc)}) هم‌پای سقف‌های اصلی بستری و جراحی (${fmtSignedPct(main)}) بالا رفته؛ قیمت به ازای پوشش اصلی ثابت مانده.${rest != null && rest < main - 0.2 ? ` ولی بندهای سرپایی کمتر افزایش گرفته‌اند (میانه ${fmtSignedPct(rest)})؛ سال بعد سهم آن‌ها را بخواهید.` : ""}`]);
      else if (pc < ref - 0.1) sugg.push(["ok", `سقف‌ها تندتر از نرخ (${fmtSignedPct(pc)}) بالا رفته‌اند؛ قرارداد ${label(b)} نسبت به سال قبل خرید خوبی بوده است.`]);
      else sugg.push(["note", `نرخ ${tag}${fmtSignedPct(pc)} تغییر کرده و سقف‌ها ${main != null ? `بستری و جراحی ${fmtSignedPct(main)}` : `میانه ${fmtSignedPct(rest)}`}.`]);
    }
    const flat = cats.filter(k => a.caps[k] != null && b.caps[k] != null && a.caps[k] === b.caps[k] && isFinite(a.caps[k]));
    if (flat.length && (pc || 0) > 0.05) sugg.push(["warn", `این سقف‌ها در ${label(b)} افزایش نگرفته‌اند و با تورم ارزش واقعی‌شان کم شده: ${flat.map(k => CCAT_NAME[k]).join("، ")}. برای سال بعد دست‌کم هم‌پای تورم بالا بروند.`]);
    const big = cats.filter(k => k !== "combo" && k !== "total").map(k => [k, pctCh(a.caps[k], b.caps[k])]).filter(([, v]) => v != null && v >= 1).sort((x, y) => y[1] - x[1]);
    if (big.length) sugg.push(["note", `بیشترین بهبود: ${big.slice(0, 4).map(([k, v]) => `${CCAT_NAME[k]} ×${fmtNum(1 + v)}`).join("، ")}. با فایل خسارت معلوم می‌شود این افزایش‌ها لازم بوده یا نه.`]);
  });
  const latest = list.slice().sort((a, b) => b.year - a.year)[0];
  if (latest){
    if (latest.caps.combo != null && cats.some(k => !["combo", "total", "hosp", "special"].includes(k) && latest.caps[k] != null && latest.caps[k] >= latest.caps.combo))
      sugg.push(["warn", `سقف مشترک (${MT(latest.caps.combo)}) از سقف بعضی بندها کمتر یا برابر است؛ یعنی یک بند می‌تواند کل سقف را مصرف کند. در سال بعد سقف مشترک دست‌کم جمع بندهای پرمصرف باشد.`]);
    if (others.length){
      const low = cats.filter(k => { const m = market(k); return m && isFinite(latest.caps[k]) && latest.caps[k] < m * 0.6; });
      if (low.length) sugg.push(["warn", `پایین‌تر از بازار (کمتر از ۶۰٪ میانهٔ ${fmtInt(new Set(others.map(c => orgKey(c.org))).size)} سازمان دیگر): ${low.map(k => `${CCAT_NAME[k]} ${MT(latest.caps[k])} در برابر ${MT(market(k))}`).join("، ")}.`]);
    }
    if (latest.premium) sugg.push(["note", `با حق‌بیمهٔ ${fmtNum(latest.premium)} برای هر نفر، بیمه‌گر تا خسارت سرانهٔ ${fmtNum(latest.premium * 0.75)} (Loss Ratio ۷۵٪) سالم و تا ${fmtNum(latest.premium * 0.85)} مرزی است. فایل خسارت که برسد، اپ دقیقاً می‌گوید کجای این بازه‌اید.`]);
  }
  sugg.push(["info", "پیشنهاد حذف یا کاهش هر پوشش فقط با فایل خسارت ممکن است؛ آن را در «تحلیل تمدید» بدهید تا به همین قرارداد وصل شود."]);
  const SG = { warn: ["t-mid", "هشدار"], ok: ["t-good", "خوب"], note: ["t-protect", "نکته"], info: ["t-line", "بعدی"] };
  const pair = pairs[pairs.length - 1];
  return `
  ${pair ? overviewHTML(pair, cats, G) : ""}
  <details class="panel"${pair ? "" : " open"}><summary class="panel-h" style="cursor:pointer"><h2>${pair ? "جدول کامل همهٔ سقف‌ها" : esc(G.name)}</h2><span class="small muted">میلیون تومان برای هر نفر در سال · ${fmtInt(list.length)} قرارداد</span></summary>
    <div class="tw"><table style="min-width:${300 + list.length * 120 + pairs.length * 80}px"><thead><tr><th>پوشش</th>${list.map(c => `<th>${label(c)}${c.sample ? ' <span class="tag t-line">نمونه</span>' : ""}</th>`).join("")}${pairs.map(([a, b]) => `<th>تغییر ${b.plan ? b.plan + " " : ""}${fmtInt(a.year).replace(/٬/g, "")}←${fmtInt(b.year).replace(/٬/g, "")}</th>`).join("")}${others.length ? "<th>میانهٔ بازار</th>" : ""}</tr></thead><tbody>
      <tr style="background:var(--hl)"><td><b>حق‌بیمهٔ سالانهٔ هر نفر</b></td>${list.map(c => `<td class="nw"><b>${c.premium ? fmtNum(c.premium) : "—"}</b></td>`).join("")}${pairs.map(([a, b]) => { const v = pctCh(a.premium, b.premium); return `<td class="nw"><b>${v == null ? "—" : fmtSignedPct(v)}</b></td>`; }).join("")}${others.length ? `<td class="nw">${fmtNum(median(others.map(c => c.premium)))}</td>` : ""}</tr>
      ${cats.map(k => `<tr><td>${CCAT_NAME[k]}</td>${list.map(c => `<td class="nw">${c.caps[k] == null ? '<span class="faint">—</span>' : MT(c.caps[k])}</td>`).join("")}${pairs.map(([a, b]) => { const v = k === "combo" || k === "total" ? null : pctCh(a.caps[k], b.caps[k]); return `<td class="nw" style="${v == null ? "" : v === 0 ? "color:var(--mid-ink);font-weight:700" : v >= 1 ? "color:var(--good);font-weight:700" : ""}">${v == null ? "—" : v === 0 ? "بدون تغییر" : fmtSignedPct(v)}</td>`; }).join("")}${others.length ? `<td class="nw muted">${market(k) == null ? "—" : MT(market(k))}</td>` : ""}</tr>`).join("")}
    </tbody></table></div></details>
  <div class="ins">${sugg.map(([k, t]) => `<div class="panel in in-${k}"><span class="ic">${{ warn: "!", ok: "✓", note: "i", info: "→" }[k]}</span><div><b>${SG[k][1]}</b><span>${esc(t)}</span></div></div>`).join("")}</div>
  ${pairs.length ? projectionView(pairs[pairs.length - 1], cats) : ""}`;
}

// KPI cards and the "each cap against the premium" chart for the latest two years of one plan.
function overviewHTML(pair, cats, G){
  const [a, b] = pair, y = c => fmtInt(c.year).replace(/٬/g, ""), pc = pctCh(a.premium, b.premium), ch = k => pctCh(a.caps[k], b.caps[k]);
  const main = median(["hosp", "special"].map(ch).filter(v => v != null)), rest = median(cats.filter(k => !["hosp", "special", "combo", "total"].includes(k)).map(ch).filter(v => v != null));
  const rows = cats.filter(k => k !== "combo" && k !== "total" && ch(k) != null).map(k => [k, ch(k)]).sort((x, z) => z[1] - x[1]);
  const ref = pc ?? main ?? 0, M = Math.max(ref * 1.6, 1, ...rows.map(r => Math.min(r[1], ref * 2.6)));
  const col = v => v <= 0 ? "#E11D48" : v >= ref - 0.1 ? "linear-gradient(to left,#16A34A,#4ADE80)" : "linear-gradient(to left,#F59E0B,#FCD34D)";
  const kp = (l, v, sub, color) => `<div class="panel kp2"><span class="l">${l}</span><b class="big" style="${color ? `color:${color}` : ""}">${v}</b><span class="small muted">${sub}</span></div>`;
  return `<div class="cmp-h"><div><h1>${esc(G.name)}</h1><span class="sub">${[b.insurer, b.insured ? fmtInt(b.insured) + " نفر" : null].filter(Boolean).map(esc).join(" · ")}${b.plan ? " · " + esc(b.plan) : ""} · مقایسهٔ ${y(a)} ← ${y(b)}</span></div></div>
  <div class="kp2s">
    <div class="panel kp2 lead"><span class="l">حق‌بیمهٔ سالانهٔ هر نفر</span><div class="row"><span class="muted num" style="font-size:19px;font-weight:800">${a.premium ? fmtNum(a.premium) : "—"}</span><span class="muted">←</span><b class="big num">${b.premium ? fmtNum(b.premium) : "—"}</b>${pc != null ? `<span class="tag ${pc > 0 ? "t-bad" : "t-good"}">${fmtSignedPct(pc)}</span>` : ""}</div><span class="small muted">میلیون تومان برای هر نفر${b.premium && b.insured ? ` · کل ${fmtNum(b.premium * b.insured / 1000)} میلیارد تومان (${fmtInt(b.insured)} نفر)` : ""}</span></div>
    ${main != null ? kp("سقف بستری و جراحی", fmtSignedPct(main), pc != null ? (Math.abs(main - pc) <= 0.1 ? "هم‌پای نرخ" : main > pc ? "بیشتر از نرخ" : "کمتر از نرخ") : "", "var(--good)") : ""}
    ${rest != null ? kp("بقیهٔ بندها (میانه)", fmtSignedPct(rest), pc != null && rest < pc - 0.1 ? "عقب‌تر از نرخ" : "", pc != null && rest < pc - 0.1 ? "var(--mid-ink)" : "var(--good)") : ""}
    ${b.premium ? kp("حد تحمل خسارت هر نفر", fmtNum(b.premium * 0.75), "با Loss Ratio ۷۵٪") : ""}
  </div>
  ${rows.length ? `<section class="panel"><div class="panel-h"><h2>تغییر هر سقف در برابر تغییر نرخ</h2>${pc != null ? `<span class="small muted"><i class="refkey"></i> افزایش نرخ (${fmtSignedPct(pc)}) · نوار کوتاه‌تر از خط = عقب مانده</span>` : ""}</div>
    <div class="panel-b">${rows.map(([k, v]) => `<div class="brow"><span>${CCAT_NAME[k]}</span><div class="track"><span class="bar" style="width:${v <= 0 ? 1.5 : Math.min(100, v / M * 100).toFixed(1)}%;background:${col(v)}"></span>${pc != null ? `<span class="ref" style="inset-inline-start:${(Math.min(1, ref / M) * 100).toFixed(1)}%"></span>` : ""}</div><b class="num" style="color:${v <= 0 ? "var(--bad)" : v >= ref - 0.1 ? "var(--good)" : "var(--mid-ink)"}">${v === 0 ? "بدون تغییر" : fmtSignedPct(v)} <span class="small muted">${MT(a.caps[k])}←${MT(b.caps[k])}</span></b></div>`).join("")}</div></section>` : ""}`;
}

/* ---------- next-year projection ----------
   Without claims the premium is projected from cap changes: each coverage carries an assumed share of the
   cost (editable; replaced by real shares once a claims file is given). Same caps → premium grows with
   medical inflation; a cap raised more than inflation adds its share on top. */
const COST_W = { hosp: .30, special: .20, delivery: .04, infert: .02, para: .07, diag: .04, lab: .04, fetal: .01, outsurg: .03, rehab: .02, visitdrug: .08, visit: .04, drug: .04,
  emergency: .01, dental: .06, refractive: .02, glasses: .02, hearing: .005, ambIn: .005, ambOut: .005, amb: .005, organs: .005, prosthesis: .005, orthosis: .005, supplies: .002, specialDis: .03 };
const nice = v => { if (!isFinite(v) || v <= 0) return v; const p = Math.pow(10, Math.floor(Math.log10(v)) - 1); return Math.ceil(v / p) * p; };
function projection(pair, cats, infl){
  const [a, b] = pair, ks = cats.filter(k => COST_W[k] && b.caps[k] != null && isFinite(b.caps[k]));
  const wsum = ks.reduce((s, k) => s + COST_W[k], 0) || 1, w = k => COST_W[k] / wsum, g = 1 + infl;
  const mainG = median(["hosp", "special"].map(k => pctCh(a.caps[k], b.caps[k])).filter(v => v != null));
  const plans = {
    keep: { name: "حفظ ارزش سقف‌ها", desc: "همهٔ سقف‌ها هم‌پای تورم", cap: k => nice(b.caps[k] * g) },
    economy: { name: "اقتصادی", desc: "بستری و جراحی هم‌پای تورم، بقیه ثابت", cap: k => ["hosp", "special"].includes(k) ? nice(b.caps[k] * g) : b.caps[k] },
    catchup: { name: "جبران عقب‌ماندگی", desc: "بندهایی که سال قبل کمتر از بستری رشد کردند، هم‌پا می‌شوند", cap: k => { const r = pctCh(a.caps[k], b.caps[k]); return nice(b.caps[k] * g * (mainG != null && r != null && r < mainG ? Math.min(2, (1 + mainG) / (1 + r)) : 1)); } },
  };
  Object.values(plans).forEach(p => {
    p.caps = Object.fromEntries(ks.map(k => [k, p.cap(k)]));
    // each coverage's cost grows with medical inflation, scaled by how much its cap grows beyond it
    p.factor = ks.reduce((s, k) => s + w(k) * Math.min(g, p.caps[k] / b.caps[k]) + w(k) * Math.max(0, p.caps[k] / b.caps[k] - g) * 0.5, 0);
    p.premium = b.premium ? b.premium * p.factor : null;
  });
  return { ks, w, plans, last: b, prev: a, year: b.year + 1, g };
}
function projectionView(pair, cats){
  const infl = state.infl ?? 0.35, P = projection(pair, cats, infl), b = P.last, order = ["economy", "catchup", "keep"];
  // recommendation: when outpatient items lagged behind last year, catching up is the fair offer; otherwise keep value
  const [a] = pair, ch = k => pctCh(a.caps[k], b.caps[k]);
  const main = median(["hosp", "special"].map(ch).filter(v => v != null)), rest = median(P.ks.filter(k => !["hosp", "special"].includes(k)).map(ch).filter(v => v != null));
  const rec = main != null && rest != null && rest < main - 0.2 ? "catchup" : "keep";
  const why = rec === "catchup" ? `بندهای سرپایی سال قبل ${fmtSignedPct(rest)} رشد کردند و بستری ${fmtSignedPct(main)}` : "سقف‌ها سال قبل متوازن رشد کرده‌اند";
  const DESC = { economy: [["بستری و جراحی", "هم‌پای تورم"], ["بقیهٔ بندها", "ثابت"]], catchup: [["بندهای جامانده", "هم‌پای بستری"], ["رضایت کارکنان", "بیشترین"]], keep: [["همهٔ سقف‌ها", "هم‌پای تورم"], ["قدرت خرید پوشش", "ثابت"]] };
  const y = fmtInt(P.year).replace(/٬/g, "");
  return `<section class="panel anchor proj" id="proj"><div class="panel-h"><h2>سال ${y}: سه راه پیش رو</h2>
      <div class="slider"><label for="inflR" class="small nw">تورم هزینهٔ درمان</label><input type="range" id="inflR" min="0" max="80" step="5" value="${Math.round(infl * 100)}" style="--p:${Math.round(infl * 100 / 80 * 100)}%"><b class="num" id="inflV">${fmtInt(Math.round(infl * 100))}٪</b></div></div>
    <div class="panel-b" style="display:flex;flex-direction:column;gap:16px">
      <div class="scn">${order.map(k => { const p = P.plans[k]; return `<div class="sc ${k === rec ? "rec" : ""}">${k === rec ? `<span class="badge">پیشنهاد اپ</span>` : ""}<span class="tag t-protect" style="align-self:flex-start">${p.name}</span>
        <div class="pr"><b class="num">${p.premium ? fmtNum(p.premium) : "—"}</b> <span class="small muted">میلیون / نفر</span></div>
        <div class="small" style="font-weight:800;color:${p.factor - 1 < infl ? "var(--good)" : "var(--mid-ink)"}">${fmtSignedPct(p.factor - 1)} نسبت به ${fmtInt(b.year).replace(/٬/g, "")}</div>
        <ul>${DESC[k].map(([l, v]) => `<li><span class="muted">${l}</span><b>${v}</b></li>`).join("")}${b.insured && p.premium ? `<li><span class="muted">کل حق‌بیمه</span><b class="num">${fmtNum(p.premium * b.insured / 1000)} میلیارد</b></li>` : ""}</ul>
        ${k === rec ? `<span class="small muted">${why}</span>` : ""}</div>`; }).join("")}</div>
      ${b.premium ? "" : '<p class="small" style="color:var(--mid-ink)">حق‌بیمهٔ این قرارداد وارد نشده؛ در صفحهٔ مدرک واردش کنید تا مبلغ‌ها حساب شوند.</p>'}
      <div style="display:flex;gap:10px;flex-wrap:wrap;align-items:center"><button class="btn primary" type="button" id="projXlsx">⇩ دانلود فایل محاسبه (اکسل)</button><span class="small muted">تا فایل خسارت نرسیده، سهم هر پوشش از هزینه فرضی است و در فایل اکسل قابل تغییر است.</span></div>
      <details><summary class="small" style="cursor:pointer;font-weight:700;color:var(--brand)">سقف تک‌تک پوشش‌ها در هر راه</summary>
      <div class="tw" style="margin-top:10px"><table style="min-width:600px"><thead><tr><th>پوشش</th><th>سقف ${fmtInt(b.year).replace(/٬/g, "")}</th>${order.map(k => `<th>${P.plans[k].name}</th>`).join("")}</tr></thead><tbody>
        ${P.ks.map(k => `<tr><td>${CCAT_NAME[k]}</td><td class="nw">${MT(b.caps[k])}</td>${order.map(o => { const v = P.plans[o].caps[k]; return `<td class="nw"${v !== b.caps[k] ? ' style="font-weight:800;color:var(--brand)"' : ""}>${MT(v)}</td>`; }).join("")}</tr>`).join("")}
      </tbody></table></div></details>
    </div></section>`;
}
function projectionXlsx(pair, cats){
  const infl = state.infl ?? 0.35, P = projection(pair, cats, infl), a = P.prev, b = P.last, y0 = a.year, y1 = b.year, y2 = P.year;
  const rows = [["محاسبهٔ حق‌بیمهٔ سال " + y2 + " — " + b.org + (b.plan ? " · " + b.plan : "")], ["تورم هزینهٔ درمان", infl], ["حق‌بیمهٔ هر نفر " + y1 + " (میلیون تومان)", b.premium || 0], ["تعداد نفرات", b.insured || 0], [],
    ["پوشش", "سقف " + y0, "سقف " + y1, "رشد " + y0 + "→" + y1, "سهم هزینه (فرض)", "سقف پیشنهادی " + y2, "ضریب هزینه"]];
  const first = rows.length + 1;
  P.ks.forEach((k, i) => {
    const r = first + i, cap = P.plans.keep.caps[k];
    rows.push([CCAT_NAME[k], a.caps[k] ?? "", b.caps[k], { f: `IF(B${r}="","",C${r}/B${r}-1)` }, +P.w(k).toFixed(4), cap,
      { f: `E${r}*(MIN(1+$B$2,F${r}/C${r})+MAX(0,F${r}/C${r}-(1+$B$2))*0.5)` }]);
  });
  const last = first + P.ks.length - 1;
  rows.push([], ["ضریب کل", "", "", "", { f: `SUM(E${first}:E${last})` }, "", { f: `SUM(G${first}:G${last})/SUM(E${first}:E${last})` }],
    ["حق‌بیمهٔ برآوردی هر نفر " + y2, "", "", "", "", "", { f: `B3*G${last + 2}` }], ["کل حق‌بیمه", "", "", "", "", "", { f: `G${last + 3}*B4` }],
    ["سرانهٔ خسارت مجاز (LR ۷۵٪)", "", "", "", "", "", { f: `G${last + 3}*0.75` }], [],
    ["ستون «سقف پیشنهادی» و «سهم هزینه» را تغییر دهید؛ همه‌چیز دوباره حساب می‌شود. با فایل خسارت، سهم واقعی هر پوشش جایگزین فرض می‌شود."]);
  const ws = XLSX.utils.aoa_to_sheet(rows.map(r => r.map(v => v && v.f ? { t: "n", f: v.f } : v)));
  ws["!cols"] = [{ wch: 30 }, { wch: 12 }, { wch: 12 }, { wch: 14 }, { wch: 16 }, { wch: 18 }, { wch: 14 }];
  ws["!views"] = [{ RTL: true }];
  const wb = XLSX.utils.book_new(); wb.Workbook = { Views: [{ RTL: true }] };
  XLSX.utils.book_append_sheet(wb, ws, "سال " + y2);
  XLSX.writeFile(wb, `محاسبه-${(b.org || "قرارداد").replace(/\s+/g, "-")}-${y2}.xlsx`);
}
