// Self-contained, browser-side data + PnL logic. NO backend required.
// The PWA calls Polymarket's public Data API and a Polygon RPC directly from
// the browser, so the whole app can be hosted as static files (GitHub Pages).
//
// The pure functions (fifoPnl, windowSlice) take plain data and are exported for
// Node tests too; the fetch-based clients only run in the browser.

(function (root) {
  "use strict";

  const DATA_BASE = "https://data-api.polymarket.com";
  const DEFAULT_RPC = "https://polygon-rpc.com";
  const USDC_E = "0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174"; // Polymarket collateral
  const USDC_NATIVE = "0x3c499c542cEF5E3811e1192ce70d8cc03d5c3359";
  const USDC_DECIMALS = 6;
  const BALANCE_OF = "0x70a08231";
  const PAGE_LIMIT = 500;
  const MAX_ROWS = 20000;

  const num = (v) => {
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  };

  // -- on-chain USDC balance (Polygon JSON-RPC) ---------------------------- //
  async function erc20Balance(rpcUrl, token, address, decimals = USDC_DECIMALS) {
    const data = BALANCE_OF + address.toLowerCase().replace(/^0x/, "").padStart(64, "0");
    const res = await fetch(rpcUrl, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "eth_call", params: [{ to: token, data }, "latest"] }),
    });
    const json = await res.json();
    const raw = json && json.result;
    if (typeof raw !== "string" || !raw.startsWith("0x") || raw === "0x") return null;
    return Number(BigInt(raw)) / 10 ** decimals;
  }

  async function usdcBalances(address, rpcUrl = DEFAULT_RPC) {
    const [e, n] = await Promise.all([
      erc20Balance(rpcUrl, USDC_E, address).catch(() => null),
      erc20Balance(rpcUrl, USDC_NATIVE, address).catch(() => null),
    ]);
    const total = e == null && n == null ? null : (e || 0) + (n || 0);
    return { usdc_e: e, usdc_native: n, total };
  }

  // -- Polymarket Data API ------------------------------------------------- //
  async function getJson(url) {
    const res = await fetch(url, { headers: { accept: "application/json" } });
    if (!res.ok) throw new Error("HTTP " + res.status);
    return res.json();
  }

  function asRows(data) {
    if (Array.isArray(data)) return data.filter((r) => r && typeof r === "object");
    if (data && typeof data === "object") {
      for (const k of ["data", "activity", "positions", "history"]) {
        if (Array.isArray(data[k])) return data[k];
      }
    }
    return [];
  }

  async function portfolioValue(address) {
    let d = await getJson(`${DATA_BASE}/value?user=${address}`);
    if (Array.isArray(d)) d = d[0] || {};
    return d ? num(d.value) : null;
  }

  async function positions(address) {
    const d = await getJson(`${DATA_BASE}/positions?user=${address}&limit=500&sortBy=CURRENT&sortDirection=DESC`);
    return asRows(d);
  }

  async function activity(address) {
    const rows = [];
    let offset = 0;
    while (rows.length < MAX_ROWS) {
      const url = `${DATA_BASE}/activity?user=${address}&limit=${PAGE_LIMIT}&offset=${offset}&sortBy=TIMESTAMP&sortDirection=ASC`;
      const page = asRows(await getJson(url));
      if (!page.length) break;
      rows.push(...page);
      if (page.length < PAGE_LIMIT) break;
      offset += PAGE_LIMIT;
    }
    rows.sort((a, b) => (num(a.timestamp) || 0) - (num(b.timestamp) || 0));
    return rows.slice(0, MAX_ROWS);
  }

  // -- FIFO realized-PnL engine (pure) ------------------------------------- //
  // Replays activity oldest-first, keeps per-asset FIFO lots, emits one closing
  // event per SELL/REDEEM/MERGE (and REWARD as income). Returns { events,
  // realizedTotal, warnings }.
  function fifoPnl(rows) {
    const lots = new Map(); // asset -> [{size, price}]
    const meta = new Map(); // asset -> {title, outcome}
    const events = [];
    const warnings = [];
    let realizedTotal = 0;

    const buyPrice = (price, usdc, size) =>
      price != null && price > 0 ? price : size > 0 ? usdc / size : 0;

    const open = (asset, size, price) => {
      if (size <= 0) return;
      if (!lots.has(asset)) lots.set(asset, []);
      lots.get(asset).push({ size, price });
    };

    const close = (ts, kind, asset, size, proceeds) => {
      const m = meta.get(asset) || { title: "", outcome: "" };
      const q = lots.get(asset) || [];
      let cost = 0;
      let remaining = size;
      while (remaining > 1e-9 && q.length) {
        const lot = q[0];
        const take = Math.min(lot.size, remaining);
        cost += take * lot.price;
        lot.size -= take;
        remaining -= take;
        if (lot.size <= 1e-9) q.shift();
      }
      if (remaining > 1e-6) {
        warnings.push("بخشی از یک بستن پوزیشن بدون مبنای هزینه‌ی ثبت‌شده بود؛ ممکن است تاریخچه کامل نباشد.");
      }
      const realized = proceeds - cost;
      realizedTotal += realized;
      events.push({ timestamp: ts, kind, asset, title: m.title, outcome: m.outcome, size, proceeds, cost_basis: cost, realized });
    };

    for (const r of rows) {
      const asset = String(r.asset || "");
      const type = String(r.type || "").toUpperCase();
      const side = String(r.side || "").toUpperCase();
      const ts = num(r.timestamp) || 0;
      const size = Math.abs(num(r.size) || 0);
      const usdc = Math.abs(num(r.usdcSize) || 0);
      const price = num(r.price);
      const title = String(r.title || "");
      const outcome = String(r.outcome || "");
      if (asset) meta.set(asset, { title, outcome });

      if (type === "REWARD") {
        events.push({ timestamp: ts, kind: "REWARD", asset, title, outcome, size: 0, proceeds: usdc, cost_basis: 0, realized: usdc });
        realizedTotal += usdc;
      } else if (type === "CONVERSION") {
        warnings.push("یک رویداد CONVERSION نادیده گرفته شد (اثر مستقیم نقدی ندارد).");
      } else if (type === "TRADE" && side === "BUY") {
        open(asset, size, buyPrice(price, usdc, size));
      } else if (type === "SPLIT") {
        open(asset, size, buyPrice(price, usdc, size));
      } else if (type === "TRADE" && side === "SELL") {
        close(ts, "SELL", asset, size, usdc || size * (price || 0));
      } else if (type === "MERGE") {
        close(ts, "MERGE", asset, size, usdc || size * (price || 0));
      } else if (type === "REDEEM") {
        close(ts, "REDEEM", asset, size, usdc);
      }
    }
    return { events, realizedTotal, warnings };
  }

  // Slice the replayed events + raw activity into one window.
  function windowSlice(events, rows, startTs, endTs) {
    const inWin = events.filter((e) => e.timestamp >= startTs && e.timestamp <= endTs);
    const realized = inWin.filter((e) => e.kind !== "REWARD").reduce((s, e) => s + e.realized, 0);
    const rewards = inWin.filter((e) => e.kind === "REWARD").reduce((s, e) => s + e.realized, 0);
    let inflow = 0, outflow = 0, trades = 0;
    for (const r of rows) {
      const ts = num(r.timestamp) || 0;
      if (ts < startTs || ts > endTs) continue;
      const type = String(r.type || "").toUpperCase();
      const side = String(r.side || "").toUpperCase();
      const usdc = Math.abs(num(r.usdcSize) || 0);
      if (type === "TRADE") {
        trades += 1;
        if (side === "BUY") outflow += usdc;
        else if (side === "SELL") inflow += usdc;
      } else if (type === "REDEEM" || type === "MERGE" || type === "REWARD") {
        inflow += usdc;
      } else if (type === "SPLIT") {
        outflow += usdc;
      }
    }
    inWin.sort((a, b) => b.timestamp - a.timestamp);
    return { realized, rewards, total: realized + rewards, net_cash_flow: inflow - outflow, trades_count: trades, events: inWin };
  }

  function summarizePositions(rows) {
    let unrealized = 0;
    const items = rows.map((p) => {
      const pnl = num(p.cashPnl);
      if (pnl != null) unrealized += pnl;
      return {
        title: p.title || "", outcome: p.outcome || "",
        size: num(p.size), avg_price: num(p.avgPrice), cur_price: num(p.curPrice),
        current_value: num(p.currentValue), unrealized_pnl: pnl,
      };
    });
    items.sort((a, b) => (b.current_value || 0) - (a.current_value || 0));
    return { count: items.length, unrealized_pnl_now: unrealized, positions: items.slice(0, 25) };
  }

  // -- top-level report (browser) ------------------------------------------ //
  async function buildReport(address, windowMinutes, rpcUrl = DEFAULT_RPC) {
    const now = Math.floor(Date.now() / 1000);
    const startTs = now - Math.round(windowMinutes * 60);
    const warnings = [];

    const safe = async (label, fn) => {
      try { return await fn(); }
      catch (e) { warnings.push(`خواندن «${label}» ناموفق بود: ${e.message}`); return null; }
    };

    const [balance, value, posRows, actRows] = await Promise.all([
      safe("موجودی روی Polygon", () => usdcBalances(address, rpcUrl)),
      safe("ارزش پورتفولیو", () => portfolioValue(address)),
      safe("پوزیشن‌های باز", () => positions(address)),
      safe("تاریخچه فعالیت", () => activity(address)),
    ]);

    const { events, warnings: pnlWarn } = fifoPnl(actRows || []);
    warnings.push(...pnlWarn);
    const win = windowSlice(events, actRows || [], startTs, now);
    const open = summarizePositions(posRows || []);

    return {
      address, generated_at: now,
      window: { minutes: windowMinutes, start_ts: startTs, end_ts: now },
      balance: balance || { usdc_e: null, usdc_native: null, total: null },
      portfolio_value: value,
      pnl_window: win,
      open_positions: open,
      activity_total_rows: (actRows || []).length,
      warnings,
    };
  }

  const api = { fifoPnl, windowSlice, summarizePositions, usdcBalances, buildReport, portfolioValue, positions, activity };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.Poly = api;
})(typeof window !== "undefined" ? window : globalThis);
