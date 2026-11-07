/* ================= Document reader =================
   Reads PDF (text or scanned), photos, Word and text files on the device. Scanned pages go through
   on-device OCR (Tesseract, Persian model): table lines are found first and every cell is read on its
   own, so amounts are not mixed with the long coverage descriptions. Libraries load on first use. */

// Libraries ship next to the page (vendor/); if that fails (some viewers block it) the same versions
// load from jsDelivr. Nothing about the document itself ever leaves the device.
const DR = { worker: null, eng: null, pdf: null, src: null, lanes: [], engs: [],
  bases: [
    { pdf: "vendor/pdf/", tjs: "vendor/ocr/tesseract.min.js", worker: "vendor/ocr/worker.min.js", core: "vendor/ocr/", fas: "vendor/ocr/", eng: "vendor/ocr/", b64: true },
    { pdf: "https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/", tjs: "https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/tesseract.min.js",
      worker: "https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/worker.min.js", core: "https://cdn.jsdelivr.net/npm/tesseract.js-core@5.1.1/",
      fas: "https://cdn.jsdelivr.net/npm/@tesseract.js-data/fas@1.0.0/4.0.0_best_int/", eng: "https://cdn.jsdelivr.net/npm/@tesseract.js-data/eng@1.0.0/4.0.0_best_int/" },
  ] };
const drScript = src => new Promise((ok, bad) => { const s = document.createElement("script"); s.src = src; s.onload = ok; s.onerror = () => bad(new Error("بارگذاری " + src + " نشد")); document.head.appendChild(s); });
const drAbs = p => new URL(p, location.href).href;
async function drTry(fn){
  if (location.protocol === "file:") throw new Error("خواندن PDF و عکس در نسخهٔ فلش فعال نیست؛ از نسخهٔ نصب‌شده روی گوشی یا لینک آنلاین استفاده کنید.");
  let last;
  for (const b of DR.src ? [DR.src] : DR.bases){ try { const r = await fn(b); DR.src = b; return r; } catch (e){ last = e; } }
  throw new Error("ابزار خواندن مدرک بارگذاری نشد" + (last ? ` (${last.message})` : ""));
}
async function drPDF(){
  if (DR.pdf) return DR.pdf;
  return drTry(async b => {
    if (!window.pdfjsLib) await drScript(b.pdf + "pdf.min.js");
    pdfjsLib.GlobalWorkerOptions.workerSrc = drAbs(b.pdf + "pdf.worker.min.js");
    return (DR.pdf = pdfjsLib);
  });
}
// Language data: shipped as base64 text next to the page (every host serves .txt), gzip on the CDN.
// tesseract.js fetches "<langPath>/<code>.traineddata.gz"; a blob URL ending in "#" makes that suffix a
// fragment, so the decoded bytes are fetched from memory. (Passing the bytes directly hangs in 5.1.1.)
async function drLangPath(b, code){
  if (!b.b64) return drAbs(b[code]);
  const r = await fetch(drAbs(b[code] + code + ".traineddata.b64.txt"));
  if (!r.ok) throw new Error(`داده‌ی زبان ${code} دریافت نشد (${r.status})`);
  const bin = atob((await r.text()).trim()), data = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) data[i] = bin.charCodeAt(i);
  return URL.createObjectURL(new Blob([data], { type: "application/gzip" })) + "#";
}
async function drOCR(){
  if (DR.worker) return DR.worker;
  return drTry(async b => {
    if (!window.Tesseract) await drScript(b.tjs);
    DR.fasPath = await drLangPath(b, "fas");
    DR.worker = await Tesseract.createWorker("fas", 1, { workerPath: drAbs(b.worker), corePath: drAbs(b.core), langPath: DR.fasPath, gzip: true, cacheMethod: "none" });
    return DR.worker;
  });
}

/* ---------- pages ---------- */
function drCanvas(w, h){ const c = document.createElement("canvas"); c.width = Math.round(w); c.height = Math.round(h); return c; }
function drFit(src, width){ // scale an image/canvas to a working width (OCR likes ~1800px wide A4)
  const s = width / (src.width || src.naturalWidth), c = drCanvas((src.width || src.naturalWidth) * s, (src.height || src.naturalHeight) * s);
  const g = c.getContext("2d"); g.fillStyle = "#fff"; g.fillRect(0, 0, c.width, c.height); g.imageSmoothingQuality = "high"; g.drawImage(src, 0, 0, c.width, c.height); return c;
}
function drRotate(c, deg){
  if (!deg) return c;
  const r = deg % 180 ? drCanvas(c.height, c.width) : drCanvas(c.width, c.height), g = r.getContext("2d");
  g.translate(r.width / 2, r.height / 2); g.rotate(deg * Math.PI / 180); g.drawImage(c, -c.width / 2, -c.height / 2); return r;
}
async function drImagePages(file){
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise((ok, bad) => { const i = new Image(); i.onload = () => ok(i); i.onerror = () => bad(new Error("تصویر باز نشد")); i.src = url; });
    return [{ canvas: drFit(img, 1800), scanned: true }];
  } finally { URL.revokeObjectURL(url); }
}
async function drPdfPages(file, progress){
  const lib = await drPDF();
  const doc = await lib.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise;
  const pages = [];
  for (let n = 1; n <= doc.numPages; n++){
    progress && progress(`صفحهٔ ${fmtInt(n)} از ${fmtInt(doc.numPages)}`);
    const p = await doc.getPage(n), v1 = p.getViewport({ scale: 1 });
    const scale = 1800 / Math.min(v1.width, v1.height), vp = p.getViewport({ scale });
    const canvas = drCanvas(vp.width, vp.height), g = canvas.getContext("2d");
    g.fillStyle = "#fff"; g.fillRect(0, 0, canvas.width, canvas.height);
    await p.render({ canvasContext: g, viewport: vp }).promise;
    const tc = await p.getTextContent();
    const items = tc.items.filter(it => it.str && it.str.trim()).map(it => {
      const [a, b, c, d, e, f] = lib.Util.transform(vp.transform, it.transform), h = Math.hypot(c, d);
      return { text: it.str, x0: e - (it.width * scale) * (it.dir === "rtl" ? 0 : 0), y0: f - h, x1: e + it.width * scale, y1: f, conf: 99 };
    });
    const words = drJoin(items), textLen = words.reduce((s, it) => s + it.text.trim().length, 0);
    // Some PDFs carry a text layer with a broken font map (letters and digits come out wrong): read those by OCR.
    const good = textLen >= 40 && drTextSane(words.map(w => w.text).join(" "));
    pages.push({ canvas, scanned: !good, words: good ? words : null });
  }
  return pages;
}
// Share of the page's Persian words that are real words: a correct policy page is mostly vocabulary words,
// a broken font map gives fragments that match almost nothing.
function drTextSane(text){
  const known = drTextSane.set || (drTextSane.set = new Set([...LEX_WORDS, ...LEX_COMMON].map(w => w.replace(/‌/g, ""))));
  const toks = (norm(text).match(/[آ-ی]{3,}/g) || []);
  if (toks.length < 15) return true;
  const hit = toks.filter(t => known.has(t) || known.has(t.replace(/^(و|ب|در)/, "")) || known.has(t.replace(/(ها|های|ی|ه)$/, ""))).length;
  drTextSane.last = hit / toks.length;
  return hit / toks.length >= 0.15;
}
// PDF text often stores Persian as separate presentation-form glyphs (ﺟ ﺒ ﺮ). NFKC turns them into normal
// letters; touching glyphs on one line are joined right to left into words.
function drJoin(items){
  const fa = t => /^[\u0600-\u06FF\u200c\s]+$/.test(t);
  const list = items.map(it => Object.assign({}, it, { text: it.text.normalize("NFKC") })).filter(it => it.text.trim());
  list.sort((a, b) => Math.abs(a.y1 - b.y1) > (a.y1 - a.y0) * 0.5 ? a.y1 - b.y1 : b.x1 - a.x1);
  const out = [];
  list.forEach(it => {
    const p = out[out.length - 1], h = it.y1 - it.y0;
    if (p && fa(p.text) && fa(it.text) && Math.abs(p.y1 - it.y1) < h * 0.5 && p.x0 - it.x1 < h * 0.25){ p.text = it.text.trim() ? p.text + it.text : p.text; p.x0 = Math.min(p.x0, it.x0); }
    else out.push(Object.assign({}, it));
  });
  // a real gap between glyph runs is a space: split merged runs back on wide gaps is not needed (PDF keeps spaces as items)
  return out.map(w => Object.assign(w, { text: w.text.replace(/\s+/g, " ").trim() })).filter(w => w.text);
}
// Excel caps sheet: every sheet is one table; numbers keep their exact value.
function drXlsx(bytes){
  const wb = XLSX.read(bytes, { type: "array" }), tables = [], lines = [];
  wb.SheetNames.forEach(n => {
    const rows = XLSX.utils.sheet_to_json(wb.Sheets[n], { header: 1, raw: true, defval: null })
      .map(r => r.map(v => v == null ? "" : typeof v === "number" ? String(Math.round(v)) : String(v))).filter(r => r.some(c => c.trim()));
    if (!rows.length) return;
    rows.forEach(r => lines.push(r.filter(c => c.trim()).join(" ")));
    tables.push(rows.map(r => r.map(t => ({ text: t, conf: 99 }))));
  });
  return { text: lines.join("\n"), tables, pages: [] };
}
async function drDocx(file){
  const z = XLSX.CFB.read(new Uint8Array(await file.arrayBuffer()), { type: "array" });
  const ent = XLSX.CFB.find(z, "word/document.xml") || XLSX.CFB.find(z, "/word/document.xml");
  if (!ent) throw new Error("محتوای Word پیدا نشد");
  const xml = new TextDecoder().decode(ent.content), dom = new DOMParser().parseFromString(xml, "application/xml");
  const W = "http://schemas.openxmlformats.org/wordprocessingml/2006/main", txt = el => [...el.getElementsByTagNameNS(W, "t")].map(t => t.textContent).join("");
  const tables = [...dom.getElementsByTagNameNS(W, "tbl")].map(t => [...t.getElementsByTagNameNS(W, "tr")].map(tr => [...tr.getElementsByTagNameNS(W, "tc")].map(tc => ({ text: txt(tc), conf: 99 }))));
  const text = [...dom.getElementsByTagNameNS(W, "p")].map(txt).join("\n");
  return { text, tables, pages: [] };
}

/* ---------- layout: table grid from ruling lines ---------- */
function drInk(c, thr){
  const g = c.getContext("2d"), { data } = g.getImageData(0, 0, c.width, c.height), W = c.width, H = c.height, ink = new Uint8Array(W * H);
  for (let i = 0, p = 0; i < ink.length; i++, p += 4){ const r = data[p], gg = data[p + 1], b = data[p + 2];
    // dark and not strongly coloured (blue stamps and signatures are mostly saturated)
    ink[i] = (r * 0.3 + gg * 0.59 + b * 0.11) < (thr || 150) && Math.max(r, gg, b) - Math.min(r, gg, b) < 70 ? 1 : 0; }
  return { ink, W, H };
}
function drRuns(get, len, other, gap){ // longest dark run along a line, tolerating small gaps
  let best = 0, cur = 0, miss = 0;
  for (let i = 0; i < len; i++){ if (get(i)){ cur += 1 + miss; miss = 0; if (cur > best) best = cur; } else if (cur && miss < gap) miss++; else { cur = 0; miss = 0; } }
  return best;
}
function drMerge(list, d){ const out = []; list.forEach(v => { const l = out[out.length - 1]; if (l && v - l.e <= d){ l.e = v; } else out.push({ s: v, e: v }); }); return out.map(x => Math.round((x.s + x.e) / 2)); }
function drGrid(c){
  // ruling lines in scans are often faint and broken: a lighter threshold and larger gaps
  const { ink, W, H } = drInk(c, 195);
  const hs = [], vs = [];
  for (let y = 0; y < H; y++) if (drRuns(x => ink[y * W + x], W, 0, 12) > W * 0.3) hs.push(y);
  const hl = drMerge(hs, 6);
  if (hl.length < 3) return null;
  const top = hl[0], bot = hl[hl.length - 1];
  for (let x = 0; x < W; x++){ let run = 0; for (let y = top; y <= bot; y++) if (ink[y * W + x]) run++; if (run > (bot - top) * 0.35) vs.push(x); }
  const vl = drMerge(vs, 6);
  if (vl.length < 2) return null;
  // cells: for every band between two horizontal lines, split at the vertical lines that cross that band
  const rows = [];
  for (let i = 0; i < hl.length - 1; i++){
    const y0 = hl[i], y1 = hl[i + 1]; if (y1 - y0 < 16) continue;
    const cuts = vl.filter(x => { let d = 0; for (let y = y0 + 3; y < y1 - 3; y++){ for (let k = -2; k <= 2; k++) if (ink[y * W + x + k]){ d++; break; } } return d > (y1 - y0 - 6) * 0.7; });
    if (cuts.length < 2) continue;
    const cells = []; for (let k = cuts.length - 1; k > 0; k--) cells.push({ x0: cuts[k - 1], x1: cuts[k], y0, y1 }); // right-to-left
    rows.push(cells);
  }
  return rows.length ? { rows, W, H } : null;
}

/* ---------- OCR ---------- */
function drWords(data){
  const out = [];
  (data.blocks || []).forEach(b => b.paragraphs.forEach(p => p.lines.forEach(l => l.words.forEach(w => out.push({ text: w.text, conf: w.confidence, x0: w.bbox.x0, y0: w.bbox.y0, x1: w.bbox.x1, y1: w.bbox.y1 })))));
  return out;
}
// Orientation: text lines make the ink profile across rows spiky; on a page turned 90° the spikes are
// across columns. Only then OCR decides between 90° and 270° (and 0° vs 180° when confidence is very low).
function drSpiky(c){
  const { ink, W, H } = drInk(drFit(c, 700)), rows = new Float64Array(H), cols = new Float64Array(W);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (ink[y * W + x]){ rows[y]++; cols[x]++; }
  const cv = a => { const m = a.reduce((s, v) => s + v, 0) / a.length; return m ? Math.sqrt(a.reduce((s, v) => s + (v - m) ** 2, 0) / a.length) / m : 0; };
  return { rows: cv(rows), cols: cv(cols) };
}
async function drOrient(c, ctx){
  const w = await drOCR(), small = drFit(c, 900), sp = drSpiky(c);
  await w.setParameters({ tessedit_pageseg_mode: "3", tessedit_char_whitelist: "" });
  const conf = async deg => (await w.recognize(drRotate(small, deg))).data.confidence;
  // a turned page of a scan whose first turned page was decided clearly: same way, no OCR needed
  if (sp.cols > sp.rows * 1.15 && ctx && ctx.turn && ctx.turn.margin >= 12) return { deg: ctx.turn.deg, margin: ctx.turn.margin, turned: true };
  if (sp.cols > sp.rows * 1.15){ const a = await conf(90), b = await conf(270); return { deg: a >= b ? 90 : 270, margin: Math.abs(a - b), turned: true }; }
  return { deg: 0, margin: 99, check180: true };
}
function drCrop(c, cell, k){
  const pad = 4, cw = cell.x1 - cell.x0 - pad * 2, ch = cell.y1 - cell.y0 - pad * 2;
  if (cw < 8 || ch < 8) return null;
  const out = drCanvas(cw * k + 40, ch * k + 40), g = out.getContext("2d");
  g.fillStyle = "#fff"; g.fillRect(0, 0, out.width, out.height); g.imageSmoothingQuality = "high";
  g.drawImage(c, cell.x0 + pad, cell.y0 + pad, cw, ch, 20, 20, cw * k, ch * k); return out;
}
async function drEng(lane){
  lane = lane || 0; if (DR.engs[lane]) return DR.engs[lane];
  const b = DR.src || DR.bases[0];
  const e = await Tesseract.createWorker("eng", 1, { workerPath: drAbs(b.worker), corePath: drAbs(b.core), langPath: DR.engPath || (DR.engPath = await drLangPath(b, "eng")), gzip: true, cacheMethod: "none" });
  await e.setParameters({ tessedit_pageseg_mode: "7", tessedit_char_whitelist: "0123456789/,." });
  if (!lane) DR.eng = e; return (DR.engs[lane] = e);
}
// Cells of a table are read by several workers at once when the device can afford it (each holds the model in memory).
const drLaneCount = () => { if (window.DR_LANES) return window.DR_LANES; const cores = navigator.hardwareConcurrency || 2, mem = navigator.deviceMemory || 4; return cores >= 4 && mem >= 3 ? 2 : 1; };
async function drLane(i){
  if (!i) return drOCR();
  if (DR.lanes[i]) return DR.lanes[i];
  const b = DR.src || DR.bases[0];
  return (DR.lanes[i] = await Tesseract.createWorker("fas", 1, { workerPath: drAbs(b.worker), corePath: drAbs(b.core), langPath: DR.fasPath, gzip: true, cacheMethod: "none" }));
}
const drNorm = s => String(s || "").replace(/[۰-۹]/g, d => "۰۱۲۳۴۵۶۷۸۹".indexOf(d)).replace(/[٠-٩]/g, d => "٠١٢٣٤٥٦٧٨٩".indexOf(d)).replace(/[٬،]/g, ",");
function drParseAmount(t){
  const m = drNorm(t).replace(/\s+/g, "").match(/\d{1,3}(?:[\/,.]\d{3})+|\d{4,}/);
  return m ? +m[0].replace(/[\/,.]/g, "") : null;
}
// One table cell. Narrow cells try the amount readers first (the Persian model turns numbers into letters);
// whatever is not an amount is read as text. Wide description cells: only their first lines are read.
async function drCell(w, c, cell, wide, lane){
  if (wide){
    const top = Object.assign({}, cell, { y1: Math.min(cell.y1, cell.y0 + 130) }), crop = drCrop(c, top, 2);
    if (!crop) return {};
    await w.setParameters({ tessedit_pageseg_mode: "6", tessedit_char_whitelist: "" });
    const r = await w.recognize(crop); return { text: r.data.text.replace(/\s+/g, " ").trim(), conf: r.data.confidence };
  }
  const crop = drCrop(c, cell, (cell.y1 - cell.y0) < 260 ? 3 : 2);
  if (!crop) return { text: "", conf: 0 };
  const a = await drAmount(w, crop);
  if (a && a.value >= 1000) return { text: a.text, conf: a.conf, value: a.value, vconf: a.conf };
  await w.setParameters({ tessedit_pageseg_mode: "6", tessedit_char_whitelist: "" });
  const r = await w.recognize(crop), text = r.data.text.replace(/\s+/g, " ").trim(), out = { text, conf: r.data.confidence };
  if (text.length < 30 && /بدون\s*سق|بدونسق|نامحدود/.test(text)){ out.value = Infinity; out.vconf = r.data.confidence; return out; }
  if (!/[0-9۰-۹]/.test(text) && (text.match(/[آ-ی]/g) || []).length > 6) return out;
  const e = await (await drEng(lane)).recognize(crop), v = drParseAmount(e.data.text);
  if (v != null && e.data.confidence >= 60){ out.value = v; out.vconf = e.data.confidence; }
  return out;
}
// share of dark pixels in a cell (empty cells are skipped)
function drInkShare(c, cell){
  const pad = 5, w = Math.max(1, Math.round(cell.x1 - cell.x0 - pad * 2)), h = Math.max(1, Math.round(cell.y1 - cell.y0 - pad * 2));
  const d = c.getContext("2d").getImageData(Math.round(cell.x0 + pad), Math.round(cell.y0 + pad), w, h).data; let n = 0;
  for (let i = 0; i < d.length; i += 16) if (d[i] * 0.3 + d[i + 1] * 0.59 + d[i + 2] * 0.11 < 140) n++;
  return n / (d.length / 16);
}
async function drReadPage(page, progress, ctx){
  let c = page.canvas;
  const say = (s, f) => progress && progress(s, f);
  if (page.words){ // text PDF: no OCR, just place the words in the grid
    const grid = drGrid(c);
    return { canvas: c, text: page.words.map(w => w.text).join(" "), tables: grid ? [drValues(drFill(grid, page.words))] : [], conf: 99 };
  }
  const w = await drOCR();
  say("تشخیص جهت صفحه", 0.02);
  const o = await drOrient(c, ctx);
  // pages of one scan are turned the same way: an unsure page follows the surest earlier one
  let deg = o.deg; if (o.turned){ if (ctx.turn && (o.margin < 12 || ctx.turn.margin > o.margin)) deg = ctx.turn.deg; else ctx.turn = o; }
  if (deg) c = drRotate(c, deg);
  let grid = drGrid(c);
  // The page read skips the narrow table cells (amounts and short titles): those are read one by one below,
  // and leaving them out keeps the page read fast and its lines from mixing columns.
  const isWide = (gr, cell) => (cell.x1 - cell.x0) >= gr.W * 0.4;
  const pageImg = (cv, gr) => { if (!gr) return cv; const m = drCanvas(cv.width, cv.height), g = m.getContext("2d"); g.drawImage(cv, 0, 0); g.fillStyle = "#fff";
    gr.rows.flat().forEach(k => { if (!isWide(gr, k)) g.fillRect(k.x0 + 2, k.y0 + 2, k.x1 - k.x0 - 4, k.y1 - k.y0 - 4); }); return m; };
  say("خواندن متن صفحه", 0.06);
  await w.setParameters({ tessedit_pageseg_mode: "3", preserve_interword_spaces: "1", tessedit_char_whitelist: "" });
  let full = await w.recognize(pageImg(c, grid), {}, { text: true, blocks: true });
  if (o.check180 && full.data.confidence < 40 && (full.data.text || "").replace(/\s/g, "").length > 20){ // maybe upside down
    const r = drRotate(c, 180), g2 = drGrid(r), keep = grid; grid = g2; const f2 = await w.recognize(pageImg(r, g2), {}, { text: true, blocks: true });
    if (f2.data.confidence > full.data.confidence + 20){ c = r; full = f2; } else grid = keep;
  }
  const words = drWords(full.data), tables = [], fields = {};
  let text = full.data.text;
  // premium figures in the header boxes: read the digits with the amount reader
  for (const [key, re] of [["premium", /حق\s*بیمه\s*هر\s*بیمه\s*شده/], ["annual", /حق\s*بیمه\s*علی\s*ال?\s*حساب/]]){
    if (!re.test(norm(full.data.text))) continue;
    try { const r = await drNumberAfter(w, c, words, re); if (r) fields[key] = { value: r.value, conf: r.conf }; } catch (e){}
  }
  if (grid){
    const t = drFill(grid, words), all = t.rows.flat(), total = all.length;
    // Side columns (row number, family cap, franchise…) hold only small numbers: once the first rows show that, the rest of the column is skipped.
    const col = {}, keyOf = cell => Math.round((cell.x0 + cell.x1) / 2 / 25);
    const minor = cell => { const s = col[keyOf(cell)]; return s && s.n >= 4 && s.small === s.n; };
    let done = 0, next = 0;
    const lanes = Math.min(drLaneCount(), total);
    const run = async lane => {
      const lw = await drLane(lane);
      while (next < all.length){
        const cell = all[next++], wide = isWide(grid, cell);
        // long text cells: the page read is kept unless it was weak there
        if (wide && (cell.text || "").replace(/\s/g, "").length > 5 && (cell.conf || 0) >= 65){}
        else if (!wide && (drInkShare(c, cell) < 0.004 || minor(cell))){ cell.text = cell.text || ""; cell.conf = cell.conf || 0; }
        else {
          const r = await drCell(lw, c, cell, wide, lane);
          if (wide){ if (r.text && (r.conf || 0) >= (cell.conf || 0) - 5) Object.assign(cell, r); } else Object.assign(cell, r);
          if (!wide){ const s = col[keyOf(cell)] = col[keyOf(cell)] || { n: 0, small: 0 }; s.n++;
            const small = (cell.value != null && cell.value < 1000) || /^[\s0-9۰-۹.,٪%-]{0,4}$/.test(drNorm(cell.text || "")) && cell.value == null && !/بدون|نامحدود/.test(cell.text || "");
            if (small) s.small++; }
        }
        done++; if (done % 3 === 0 || done === total) say(`خواندن جدول: خانهٔ ${fmtInt(done)} از ${fmtInt(total)}`, 0.3 + 0.7 * done / total);
      }
    };
    await Promise.all(Array.from({ length: lanes }, (_, i) => run(i)));
    tables.push(t);
    text += "\n" + t.rows.map(r => r.filter(k => !isWide(grid, k)).map(k => k.text || "").join(" ")).join("\n");
  }
  return { canvas: c, text, tables, conf: full.data.confidence, fields };
}
function drFill(grid, words){
  const rows = grid.rows.map(cells => cells.map(cell => {
    const ws = words.filter(w => { const cx = (w.x0 + w.x1) / 2, cy = (w.y0 + w.y1) / 2; return cx > cell.x0 && cx < cell.x1 && cy > cell.y0 && cy < cell.y1; });
    ws.sort((a, b) => Math.abs(a.y0 - b.y0) > 12 ? a.y0 - b.y0 : b.x1 - a.x1);
    return Object.assign({}, cell, { text: ws.map(w => w.text).join(" "), conf: ws.length ? ws.reduce((s, w) => s + w.conf, 0) / ws.length : 0 });
  }));
  return { rows, W: grid.W, H: grid.H };
}

// Text sources (text PDF, Word): amounts come straight from the cell text.
function drValues(t){
  t.rows.forEach(cells => cells.forEach((c, i) => {
    if (c.x0 == null){ c.x0 = (cells.length - 1 - i) * 100; c.x1 = c.x0 + 90; c.y0 = 0; c.y1 = 0; }
    if (c.value != null) return;
    const txt = c.text || "";
    if (txt.length < 30 && /بدون\s*سق|بدونسق|نامحدود/.test(txt)){ c.value = Infinity; c.vconf = 99; return; }
    const v = drParseAmount(txt); if (v != null && v >= 1000 && txt.replace(/[^آ-ی]/g, "").length < 25){ c.value = v; c.vconf = 99; }
  }));
  return t;
}

/* ---------- entry ---------- */
async function readDocument(file, progress){
  const name = file.name.toLowerCase();
  if (/\.docx$/.test(name)){ const d = await drDocx(file); d.tables = d.tables.map(rows => drValues({ rows, page: 0 })); return Object.assign(d, { file: file.name }); }
  if (/\.(xlsx|xls)$/.test(name)){ const d = drXlsx(new Uint8Array(await file.arrayBuffer())); d.tables = d.tables.map(rows => drValues({ rows, page: 0 })); return Object.assign(d, { file: file.name }); }
  if (/\.(txt|csv)$/.test(name)) return { file: file.name, text: await file.text(), tables: [], pages: [] };
  const pages = /\.pdf$/.test(name) ? await drPdfPages(file, progress) : await drImagePages(file);
  const out = { file: file.name, text: "", tables: [], pages: [] };
  const ctx = {};
  for (let i = 0; i < pages.length; i++){
    const r = await drReadPage(pages[i], (s, f) => progress && progress(`صفحهٔ ${fmtInt(i + 1)} از ${fmtInt(pages.length)}: ${s}`, (i + (f || 0)) / pages.length), ctx);
    out.pages.push(r); out.text += "\n" + r.text; out.fields = Object.assign({}, r.fields || {}, out.fields || {}); r.tables.forEach(t => out.tables.push(Object.assign(t, { page: i })));
  }
  return out;
}
