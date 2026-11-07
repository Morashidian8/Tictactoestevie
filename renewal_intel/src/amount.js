/* Amount reader for Persian-digit numbers (۲,۵۰۰,۰۰۰,۰۰۰): Tesseract misses the dot-shaped zeros,
   so the line is split into connected shapes; dots become ۰, low marks are separators, and only the
   remaining real digits are recognised one by one. */
function drBinary(c){
  const g = c.getContext("2d"), d = g.getImageData(0, 0, c.width, c.height), a = d.data, n = c.width * c.height;
  const hist = new Array(256).fill(0), gray = new Uint8Array(n);
  for (let i = 0, p = 0; i < n; i++, p += 4){ const v = (a[p] * 0.3 + a[p + 1] * 0.59 + a[p + 2] * 0.11) | 0; gray[i] = Math.max(a[p], a[p + 1], a[p + 2]) - Math.min(a[p], a[p + 1], a[p + 2]) > 80 ? 255 : v; hist[gray[i]]++; }
  let sum = 0; for (let i = 0; i < 256; i++) sum += i * hist[i];
  let sB = 0, wB = 0, max = 0, t = 128;
  for (let i = 0; i < 256; i++){ wB += hist[i]; if (!wB) continue; const wF = n - wB; if (!wF) break; sB += i * hist[i]; const mB = sB / wB, mF = (sum - sB) / wF, v = wB * wF * (mB - mF) ** 2; if (v > max){ max = v; t = i; } }
  const bin = new Uint8Array(n); for (let i = 0; i < n; i++) bin[i] = gray[i] < Math.min(t, 170) ? 1 : 0;
  return { bin, W: c.width, H: c.height };
}
function drComponents({ bin, W, H }){
  const lab = new Int32Array(W * H), comps = []; let id = 0;
  for (let s = 0; s < W * H; s++){
    if (!bin[s] || lab[s]) continue;
    id++; const st = [s]; lab[s] = id; let x0 = W, x1 = 0, y0 = H, y1 = 0, area = 0;
    while (st.length){ const p = st.pop(), x = p % W, y = (p / W) | 0; area++; if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++){ const nx = x + dx, ny = y + dy; if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue; const q = ny * W + nx; if (bin[q] && !lab[q]){ lab[q] = id; st.push(q); } } }
    comps.push({ id, x0, x1, y0, y1, w: x1 - x0 + 1, h: y1 - y0 + 1, area });
  }
  return comps;
}
// Split a cell into text lines by horizontal ink projection.
function drLines(c){
  const B = drBinary(c), { bin, W, H } = B, rows = [];
  for (let y = 0; y < H; y++){ let n = 0; for (let x = 0; x < W; x++) n += bin[y * W + x]; rows.push(n); }
  const out = []; let s = -1;
  for (let y = 0; y <= H; y++){ const on = y < H && rows[y] > 0; if (on && s < 0) s = y; if (!on && s >= 0){ if (y - s > 4) out.push([s, y]); s = -1; } }
  // merge lines closer than a few pixels (dots above/below letters)
  const m = []; out.forEach(l => { const p = m[m.length - 1]; if (p && l[0] - p[1] < 6) p[1] = l[1]; else m.push(l.slice()); });
  return m;
}
// ۸ is a Λ: its top row of ink is much narrower than its bottom; ۵ is round
function drTopBottom({ bin, W }, k){
  const span = (ya, yb) => { let lo = 1e9, hi = -1; for (let y = ya; y < yb; y++) for (let x = k.x0; x <= k.x1; x++) if (bin[y * W + x]){ if (x < lo) lo = x; if (x > hi) hi = x; } return hi < 0 ? 0 : hi - lo + 1; };
  const b = Math.max(2, Math.round(k.h * 0.25)), top = span(k.y0, k.y0 + b), bot = span(k.y1 - b + 1, k.y1 + 1);
  return bot ? top / bot : 1;
}
function drHole({ bin, W }, k){
  // background pixels inside the shape's box that cannot reach the box edge
  const w = k.w + 2, h = k.h + 2, seen = new Uint8Array(w * h), at = (x, y) => { const X = k.x0 - 1 + x, Y = k.y0 - 1 + y; return X >= k.x0 && X <= k.x1 && Y >= k.y0 && Y <= k.y1 && bin[Y * W + X]; };
  const st = [0]; seen[0] = 1;
  while (st.length){ const p = st.pop(), x = p % w, y = (p / w) | 0; [[1,0],[-1,0],[0,1],[0,-1]].forEach(([dx, dy]) => { const nx = x + dx, ny = y + dy; if (nx < 0 || ny < 0 || nx >= w || ny >= h) return; const q = ny * w + nx; if (!seen[q] && !at(nx, ny)){ seen[q] = 1; st.push(q); } }); }
  let n = 0; for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) if (!seen[y * w + x] && !at(x, y)) n++;
  return n > k.w * k.h * 0.02;
}
function drSlant({ bin, W }, k){
  const band = Math.max(2, Math.round(k.h * 0.3)), cx = (ya, yb) => { let s = 0, n = 0; for (let y = ya; y < yb; y++) for (let x = k.x0; x <= k.x1; x++) if (bin[y * W + x]){ s += x; n++; } return n ? s / n : 0; };
  return cx(k.y0, k.y0 + band) - cx(k.y1 - band + 1, k.y1 + 1);
}
async function drAmountLine(w, c){
  const B = drBinary(c), comps = drComponents(B).filter(k => k.area > 6 && !(k.w > B.W * 0.6) && !(k.h > B.H * 0.9 && k.w < 6));
  if (comps.length < 3) return null;
  const H = Math.max(...comps.map(k => k.h));
  const big = comps.filter(k => k.h >= H * 0.5), small = comps.filter(k => k.h < H * 0.5);
  if (!big.length || big.length > 8) return null;
  const base = big.map(k => k.y1).sort((a, b) => a - b)[big.length >> 1];
  // the number reads left to right
  const seq = comps.slice().sort((a, b) => a.x0 - b.x0);
  let out = "", conf = 100, digits = 0;
  for (const k of seq){
    if (k.h < H * 0.5){
      const comma = k.y0 > base - H * 0.18 || k.y1 > base + H * 0.15; // separators hang at or below the baseline; zeros sit mid-height
      if (comma) out += ","; else if (k.w < H * 0.6 && k.h < H * 0.45){ out += "0"; digits++; }
      continue;
    }
    // a slanted stroke is the «/» thousands separator (۱/۶۰۰/۰۰۰): its top leans right of its bottom
    if (window.DR_SLANT && k.w < H * 0.6 && drSlant(B, k) > k.h * 0.22){ out += ","; continue; }
    // one real digit: recognise it alone
    const pad = Math.round(H * 0.4), g = drCanvas(k.w + pad * 2, H + pad * 2), cx = g.getContext("2d");
    cx.fillStyle = "#fff"; cx.fillRect(0, 0, g.width, g.height);
    const src = c.getContext("2d").getImageData(k.x0, Math.max(0, base - H + 1), k.w, H), d = src.data;
    for (let i = 0; i < d.length; i += 4){ const v = (d[i] * 0.3 + d[i + 1] * 0.59 + d[i + 2] * 0.11) < 150 ? 0 : 255; d[i] = d[i + 1] = d[i + 2] = v; }
    cx.putImageData(src, pad, pad);
    // read the digit; if the first read is not a digit, try a smaller rendering
    const read = async img => { const r = await w.recognize(img); return { ch: (r.data.text || "").trim().replace(/[۰-۹]/g, x => "۰۱۲۳۴۵۶۷۸۹".indexOf(x)), conf: r.data.confidence }; };
    let pick = await read(g);
    if (!/^\d$/.test(pick.ch)) pick = await read(drFit(g, Math.round(g.width * 0.7)));
    if (!/^\d$/.test(pick.ch)) return null;
    out += pick.ch; digits++; conf = Math.min(conf, pick.conf);
  }
  const clean = out.replace(/^,+|,+$/g, "");
  if (!/^\d{1,3}(,\d{3})+$/.test(clean) && !/^\d+$/.test(clean)) return { text: clean, value: null, conf: 20 };
  return { text: clean, value: +clean.replace(/,/g, ""), conf };
}
async function drAmount(w, c){
  await w.setParameters({ tessedit_pageseg_mode: "10", tessedit_char_whitelist: "۱۲۳۴۵۶۷۸۹" });
  for (const [y0, y1] of drLines(c)){
    const line = drCanvas(c.width, y1 - y0 + 8); const g = line.getContext("2d"); g.fillStyle = "#fff"; g.fillRect(0, 0, line.width, line.height); g.drawImage(c, 0, y0, c.width, y1 - y0, 0, 4, c.width, y1 - y0);
    const r = await drAmountLine(w, line);
    if (r && r.value != null) return r;
  }
  return null;
}

/* A number written after its label inside running text («حق بیمه هر بیمه شده … : ۱۱۲,۸۰۰,۰۰۰ ریال»): the Persian
   model reads such digits badly, so the stretch of the line right after the label is cropped and split at word
   gaps; each piece is tried with the amount reader, nearest to the label first. */
async function drNumberAfter(w, c, words, labelRe){
  if (!words || !words.length) return null;
  const hs = words.map(k => k.y1 - k.y0).sort((a, b) => a - b), lh = hs[hs.length >> 1] || 30;
  const lines = [];
  words.slice().sort((a, b) => (a.y0 + a.y1) - (b.y0 + b.y1)).forEach(k => { const cy = (k.y0 + k.y1) / 2, l = lines.find(L => Math.abs(L.cy - cy) < lh * 0.6); if (l) l.ws.push(k); else lines.push({ cy, ws: [k] }); });
  for (const L of lines){
    const ws = L.ws.sort((a, b) => b.x1 - a.x1); // right to left
    let acc = "", k = -1;
    for (let i = 0; i < ws.length; i++){ acc += " " + norm(ws[i].text); if (labelRe.test(acc)){ k = i; break; } }
    if (k < 0) continue;
    // the label may run a few more words («در طول مدت بیمه نامه :»): take the next words until a number shows
    let s = k + 1; while (s < ws.length && s <= k + 6 && !/[0-9۰-۹]/.test(ws[s].text) && /[آ-ی]{2,}/.test(ws[s].text) && !/ریال|نفر/.test(ws[s].text)) s++;
    const run = ws.slice(s, s + 3); if (!run.length) continue;
    const x0 = Math.min(...run.map(r => r.x0)), x1 = Math.max(...run.map(r => r.x1)), y0 = Math.min(...run.map(r => r.y0)), y1 = Math.max(...run.map(r => r.y1));
    const pad = 6, crop = drCanvas((x1 - x0 + pad * 2) * 3, (y1 - y0 + pad * 2) * 3), g = crop.getContext("2d");
    g.fillStyle = "#fff"; g.fillRect(0, 0, crop.width, crop.height); g.imageSmoothingQuality = "high";
    g.drawImage(c, x0 - pad, y0 - pad, x1 - x0 + pad * 2, y1 - y0 + pad * 2, 0, 0, crop.width, crop.height);
    // pieces between wide gaps (number | «ریال»), right-most first
    const B = drBinary(crop), comps = drComponents(B).filter(q => q.area > 6); if (!comps.length) continue;
    const H = Math.max(...comps.map(q => q.h)), byX = comps.slice().sort((a, b) => a.x0 - b.x0), groups = [];
    byX.forEach(q => { const G = groups[groups.length - 1]; if (G && q.x0 - G.x1 < H * 0.55){ G.x1 = Math.max(G.x1, q.x1); G.y0 = Math.min(G.y0, q.y0); G.y1 = Math.max(G.y1, q.y1); } else groups.push({ x0: q.x0, x1: q.x1, y0: q.y0, y1: q.y1 }); });
    for (const G of groups.reverse()){
      const p2 = Math.round(H * 0.3), piece = drCanvas(G.x1 - G.x0 + p2 * 2, crop.height), pg = piece.getContext("2d");
      pg.fillStyle = "#fff"; pg.fillRect(0, 0, piece.width, piece.height); pg.drawImage(crop, G.x0 - p2, 0, piece.width, crop.height, 0, 0, piece.width, piece.height);
      const r = await drAmount(w, piece);
      if (r && r.value != null && r.value >= 1000) return r;
    }
  }
  return null;
}
