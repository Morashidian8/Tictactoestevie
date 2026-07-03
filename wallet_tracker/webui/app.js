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

// remember last address + custom RPC locally (no server, nothing leaves the device)
try {
  $("address").value = localStorage.getItem("pw_addr") || "";
  if ($("rpc")) $("rpc").value = localStorage.getItem("pw_rpc") || "";
} catch (_) {}

// -- main: everything runs in the browser, no backend ----------------------
async function run() {
  // Accept a raw 0x address OR a pasted profile URL like
  // https://polymarket.com/profile/0x... — extract the address either way.
  const raw = $("address").value.trim();
  const m = raw.match(/0x[0-9a-fA-F]{40}/);
  if (!m) {
    return showStatus("آدرس نامعتبر است. آدرس 0x... یا لینک پروفایل پلی‌مارکت را وارد کنید.", true);
  }
  const address = m[0].toLowerCase();
  $("address").value = address;
  const rpc = ($("rpc") && $("rpc").value.trim()) || undefined;
  try {
    localStorage.setItem("pw_addr", address);
    if (rpc) localStorage.setItem("pw_rpc", rpc);
  } catch (_) {}

  setLoading(true);
  showStatus("در حال خواندن داده‌ها از پلی‌مارکت و شبکه Polygon…", false);
  try {
    const data = await window.Poly.buildReport(address, windowMinutes, rpc);
    render(data);
    if (data.activity_failed) {
      showStatus("مرورگر نتوانست به سرور پلی‌مارکت وصل شود (فیلترینگ یا CORS). با VPN یا مرورگر دیگری امتحان کن.", true);
    } else {
      $("status").hidden = true;
    }
  } catch (err) {
    showStatus("خطا: " + err.message, true);
    $("results").hidden = true;
  } finally {
    setLoading(false);
  }
}

function render(d) {
  $("results").hidden = false;

  const totalCash = d.balance.total != null ? d.balance.total : d.balance.total_cash;
  $("balance").textContent = money(totalCash);
  $("balanceBreak").textContent =
    `USDC.e: ${money(d.balance.usdc_e)} · native: ${money(d.balance.usdc_native)}`;

  $("portfolio").textContent = money(d.portfolio_value);

  const w = d.pnl_window;
  setSigned($("pnl"), w.total);
  const label = windowLabel(d.window.minutes);
  $("pnlFoot").textContent =
    `${label} · معاملات: ${w.trades_count} · پاداش: ${money(w.rewards)} · جریان نقدی: ${money(w.net_cash_flow)}`;

  const op = d.open_positions;
  setSigned($("unrealized"), op.unrealized_pnl_now);
  $("unrealizedFoot").textContent = `${op.count} پوزیشن باز`;

  renderEvents($("events"), w.events);
  renderPositions($("positions"), op.positions);

  const wbox = $("warnings");
  // The #1 real-world cause of an all-zero report: the entered address is the
  // user's MetaMask/login wallet, not their Polymarket profile (proxy) wallet.
  // Say so explicitly instead of showing silent zeros.
  let extra = "";
  if (!d.activity_failed && d.activity_total_rows === 0) {
    extra = `<li>برای این آدرس <b>هیچ فعالیتی در پلی‌مارکت ثبت نشده</b>. اگر مطمئنی معامله داشته،
      احتمالاً این آدرسِ متامسک/ورود توست، نه آدرس پروفایل پلی‌مارکت.
      <a href="https://polymarket.com/profile/${d.address}" target="_blank" rel="noopener">این لینک پروفایل</a>
      را باز کن — اگر خالی بود، وارد polymarket.com شو، روی پروفایلت بزن و آدرس داخل URL را همین‌جا کپی کن
      (می‌توانی کل لینک پروفایل را هم مستقیم اینجا پیست کنی).</li>`;
  }
  if (extra || (d.warnings && d.warnings.length)) {
    wbox.hidden = false;
    wbox.innerHTML = "<strong>هشدارها</strong><ul>" + extra +
      (d.warnings || []).map((x) => `<li>${esc(x)}</li>`).join("") + "</ul>";
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
    const kind = { SELL: "فروش", REDEEM: "تسویه", MERGE: "ادغام", REWARD: "پاداش", LOST: "باخت در سررسید" }[e.kind] || e.kind;
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
function windowLabel(min) {
  if (min < 60) return `${fmtNum(min)} دقیقه اخیر`;
  const h = min / 60;
  if (h < 24) return `${fmtNum(h)} ساعت اخیر`;
  return `${fmtNum(h / 24)} روز اخیر`;
}
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
