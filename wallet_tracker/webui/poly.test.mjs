// Node smoke test for the browser-side PnL engine (no network).
//   node wallet_tracker/webui/poly.test.mjs
import { createRequire } from "module";
const require = createRequire(import.meta.url);
const Poly = require("./poly.js");

let failed = 0;
const eq = (got, want, msg) => {
  const a = Math.round(got * 1e6) / 1e6;
  if (a !== want) { console.error(`✗ ${msg}: got ${a}, want ${want}`); failed++; }
  else console.log(`✓ ${msg}`);
};

const buy = (a, s, p, t) => ({ type: "TRADE", side: "BUY", asset: a, size: s, price: p, usdcSize: s * p, timestamp: t, title: a });
const sell = (a, s, p, t) => ({ type: "TRADE", side: "SELL", asset: a, size: s, price: p, usdcSize: s * p, timestamp: t, title: a });

// simple buy/sell
let r = Poly.fifoPnl([buy("A", 100, 0.4, 1000), sell("A", 100, 0.6, 2000)]);
eq(r.realizedTotal, 20, "simple buy/sell realized = 20");

// FIFO partial
r = Poly.fifoPnl([buy("A", 100, 0.2, 1000), buy("A", 100, 0.5, 1500), sell("A", 150, 0.6, 2000)]);
eq(r.events[0].cost_basis, 45, "FIFO partial cost basis = 45");
eq(r.events[0].realized, 45, "FIFO partial realized = 45");

// redeem winner
r = Poly.fifoPnl([buy("A", 100, 0.3, 1000), { type: "REDEEM", asset: "A", size: 100, usdcSize: 100, timestamp: 2000, title: "A" }]);
eq(r.events[0].realized, 70, "redeem winner realized = 70");

// reward income
r = Poly.fifoPnl([{ type: "REWARD", asset: "A", size: 0, usdcSize: 5, timestamp: 1000, title: "A" }]);
eq(r.realizedTotal, 5, "reward income = 5");

// window slice by timestamp
const rows = [buy("A", 100, 0.4, 1000), sell("A", 100, 0.6, 2000)];
r = Poly.fifoPnl(rows);
let w = Poly.windowSlice(r.events, rows, 1500, 2500);
eq(w.realized, 20, "window [1500,2500] realized = 20");
eq(w.trades_count, 1, "window [1500,2500] trades = 1");
eq(w.net_cash_flow, 60, "window [1500,2500] cash flow = 60");
w = Poly.windowSlice(r.events, rows, 0, 1500);
eq(w.realized, 0, "window [0,1500] realized = 0");
eq(w.net_cash_flow, -40, "window [0,1500] cash flow = -40");

// REDEEM with empty asset matches lots via conditionId (real API shape)
r = Poly.fifoPnl([
  { type: "TRADE", side: "BUY", asset: "TOK", conditionId: "C1", size: 100, price: 0.45, usdcSize: 45, timestamp: 1000, title: "BTC 5m", outcome: "Up" },
  { type: "REDEEM", asset: "", conditionId: "C1", size: 100, usdcSize: 100, timestamp: 2000, title: "BTC 5m" },
]);
eq(r.events[0].cost_basis, 45, "redeem-by-condition cost basis = 45");
eq(r.events[0].realized, 55, "redeem-by-condition realized = 55");
if (r.warnings.length) { console.error("✗ redeem-by-condition should not warn"); failed++; }

// worthless (resolved, never redeemed) position realizes a LOST event at endDate
r = Poly.fifoPnl(
  [{ type: "TRADE", side: "BUY", asset: "TOK", conditionId: "C1", size: 100, price: 0.5, usdcSize: 50, timestamp: 1000, title: "BTC 5m", outcome: "Down" }],
  [{ asset: "TOK", size: 100, curPrice: 0, avgPrice: 0.5, title: "BTC 5m", outcome: "Down", endDate: "1970-01-01T00:50:00Z" }],
  10000
);
const lostEv = r.events.find((e) => e.kind === "LOST");
eq(lostEv.realized, -50, "worthless position realized = -50");
eq(lostEv.timestamp, 3000, "worthless position ts = endDate (3000)");
eq(r.lostAssets.length, 1, "lostAssets has 1 entry");
let wl = Poly.windowSlice(r.events, [], 2500, 3500);
eq(wl.realized, -50, "LOST lands in its endDate window");
wl = Poly.windowSlice(r.events, [], 5000, 10000);
eq(wl.realized, 0, "LOST excluded from later windows");

// open position with a live price is NOT worthless
r = Poly.fifoPnl(
  [{ type: "TRADE", side: "BUY", asset: "TOK", conditionId: "C1", size: 10, price: 0.5, usdcSize: 5, timestamp: 1000, title: "m" }],
  [{ asset: "TOK", size: 10, curPrice: 0.42, avgPrice: 0.5 }],
  2000
);
eq(r.lostAssets.length, 0, "live-priced position not treated as lost");
eq(r.realizedTotal, 0, "no realized pnl for open position");

// cost basis uses actual cash paid, not quoted price
r = Poly.fifoPnl([
  { type: "TRADE", side: "BUY", asset: "A", size: 20, price: 0.5, usdcSize: 11, timestamp: 1000, title: "m" },
  { type: "TRADE", side: "SELL", asset: "A", size: 20, price: 0.6, usdcSize: 12, timestamp: 2000, title: "m" },
]);
eq(r.events[0].cost_basis, 11, "cost basis = cash paid (11), not 10");
eq(r.events[0].realized, 1, "realized = 12 - 11 = 1");

// taker rebate counts as income
r = Poly.fifoPnl([{ type: "TAKER_REBATE", asset: "A", size: 0, usdcSize: 1.5, timestamp: 1000, title: "m" }]);
eq(r.realizedTotal, 1.5, "taker rebate income = 1.5");

// orphan losing lot not in positions API is realized as a loss
r = Poly.fifoPnl(
  [{ type: "TRADE", side: "BUY", asset: "TOK", conditionId: "C1", size: 20, price: 0.5, usdcSize: 10, timestamp: 1783090000, slug: "btc-updown-5m-1783090000", title: "m", outcome: "Up" }],
  [], // positions API returns nothing
  1783099999
);
eq(r.realizedTotal, -10, "orphan lost lot realized = -10");
{
  const ev = r.events.find((e) => e.kind === "LOST");
  eq(ev.timestamp, 1783090300, "orphan LOST ts = slug + 5m");
  eq(r.lostAssets.length, 1, "orphan added to lostAssets");
}

// orphan on an unresolved (future) market stays open
r = Poly.fifoPnl(
  [{ type: "TRADE", side: "BUY", asset: "TOK", conditionId: "C1", size: 20, price: 0.5, usdcSize: 10, timestamp: 1000, slug: "btc-updown-5m-3999999999", title: "m" }],
  [],
  1783099999
);
eq(r.realizedTotal, 0, "unresolved orphan not booked");
eq(r.lostAssets.length, 0, "unresolved orphan not in lostAssets");

if (failed) { console.error(`\n${failed} test(s) failed`); process.exit(1); }
console.log("\nall browser-engine tests passed");
