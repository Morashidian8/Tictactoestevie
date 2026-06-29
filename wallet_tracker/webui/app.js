"use strict";

const $ = (id) => document.getElementById(id);
let windowMinutes = 60;

// -- window picker ---------------------------------------------------------
$("presets").addEventListener("click", (e) => {
  const btn = e.target.closest(".preset");
  if (!btn) return;
  document.querySelectorAll(".preset").forEach((b) => b.classList.remove("active"));
  btn.classList.add("active");
  windowMinutes = Number(btn.dataset.min);
  $("customMin").value = "";
});

$("customMin").addEventListener("input", (e) => {
  const v = Number(e.target.value);
  if (v > 0) {
    windowMinutes = v;
    document.querySelectorAll(".preset").forEach((b) => b.classList.remove("active"));
  }
});

$("go").addEventListener("click", run);
$("address").addEventListener("keydown", (e) => { if (e.key === "Enter") run(); });

// -- main ------------------------------------------------------------------
async function run() {
  const address = $("address").value.trim();
  if (!/^0x[0-9a-fA-F]{40}$/.test(address)) {
    return showStatus("آدرس نامعتبر است. یک آدرس 0x... روی شبکه Polygon وارد کنید.", true);
  }
  setLoading(true);
  showStatus("در حال خواندن داده‌ها از پلی‌مارکت و شبکه Polygon…", false);
  try {
    const url = `api/report?address=${encodeURIComponent(address)}&minutes=${windowMinutes}`;
    const res = await fetch(url);
    const data = await res.json();
    if (!res.ok) throw new Error(data.detail || "خطای سرور");
    render(data);
    $("status").hidden = true;
  } catch (err) {
    showStatus("خطا: " + err.message, true);
    $("results").hidden = true;
  } finally {
    setLoading(false);
  }
}

function render(d) {
  $("results").hidden = false;

  // balance
  $("balance").textContent = money(d.balance.total_cash);
  $("balanceBreak").textContent =
    `USDC.e: ${money(d.balance.usdc_e)} · native: ${money(d.balance.usdc_native)}`;

  $("portfolio").textContent = money(d.portfolio_value);

  // window pnl
  const w = d.pnl_window;
  setSigned($("pnl"), w.total);
  $("pnlFoot").textContent =
    `${d.window.label} · معاملات: ${w.trades_count} · پاداش: ${money(w.rewards)} · جریان نقدی: ${money(w.net_cash_flow)}`;

  // unrealized
  const op = d.open_positions;
  setSigned($("unrealized"), op.unrealized_pnl_now);
  $("unrealizedFoot").textContent = `${op.count} پوزیشن باز`;

  renderEvents($("events"), w.events);
  renderPositions($("positions"), op.positions);

  // warnings
  const wbox = $("warnings");
  if (d.warnings && d.warnings.length) {
    wbox.hidden = false;
    wbox.innerHTML = "<strong>هشدارها</strong><ul>" +
      d.warnings.map((x) => `<li>${esc(x)}</li>`).join("") + "</ul>";
  } else {
    wbox.hidden = true;
  }

  $("meta").textContent =
    `${d.activity_total_rows} رویداد بررسی شد · ${new Date(d.generated_at * 1000).toLocaleString("fa-IR")}`;
}

function renderEvents(box, events) {
  if (!events || !events.length) {
    box.innerHTML = `<div class="empty">در این بازه معامله‌ی بسته‌شده‌ای نبود.</div>`;
    return;
  }
  box.innerHTML = events.map((e) => {
    const kind = { SELL: "فروش", REDEEM: "تسویه", MERGE: "ادغام", REWARD: "پاداش" }[e.kind] || e.kind;
    return `<div class="row">
      <div style="min-width:0">
        <div class="title">${esc(e.title || e.outcome || e.asset.slice(0, 12))}</div>
        <div class="meta">${kind} · ${esc(e.outcome || "")} · ${fmtTime(e.timestamp)}</div>
      </div>
      <div class="amt ${e.realized >= 0 ? "pos" : "neg"}">${signed(e.realized)}</div>
    </div>`;
  }).join("");
}

function renderPositions(box, positions) {
  if (!positions || !positions.length) {
    box.innerHTML = `<div class="empty">پوزیشن بازی وجود ندارد.</div>`;
    return;
  }
  box.innerHTML = positions.map((p) => `
    <div class="row">
      <div style="min-width:0">
        <div class="title">${esc(p.title || p.outcome)}</div>
        <div class="meta">${esc(p.outcome)} · ${fmtNum(p.size)} سهم @ ${fmtNum(p.avg_price)} → ${fmtNum(p.cur_price)}</div>
      </div>
      <div class="amt ${(p.unrealized_pnl || 0) >= 0 ? "pos" : "neg"}">${signed(p.unrealized_pnl)}</div>
    </div>`).join("");
}

// -- helpers ---------------------------------------------------------------
function setLoading(on) { $("go").disabled = on; $("go").textContent = on ? "در حال محاسبه…" : "محاسبه کن"; }
function showStatus(msg, isError) { const s = $("status"); s.hidden = false; s.textContent = msg; s.classList.toggle("error", !!isError); }
function setSigned(el, v) { el.textContent = signed(v); el.classList.toggle("pos", (v || 0) > 0); el.classList.toggle("neg", (v || 0) < 0); }
function money(v) { return v == null ? "—" : `${Number(v).toLocaleString("en-US", { maximumFractionDigits: 2 })} $`; }
function signed(v) { if (v == null) return "—"; const s = v > 0 ? "+" : ""; return `${s}${Number(v).toLocaleString("en-US", { maximumFractionDigits: 2 })} $`; }
function fmtNum(v) { return v == null ? "—" : Number(v).toLocaleString("en-US", { maximumFractionDigits: 3 }); }
function fmtTime(ts) { return new Date(ts * 1000).toLocaleString("fa-IR", { hour: "2-digit", minute: "2-digit", month: "short", day: "numeric" }); }
function esc(s) { return String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c])); }

// -- PWA service worker ----------------------------------------------------
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => navigator.serviceWorker.register("sw.js").catch(() => {}));
}
