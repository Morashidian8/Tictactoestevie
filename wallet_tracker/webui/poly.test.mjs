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

if (failed) { console.error(`\n${failed} test(s) failed`); process.exit(1); }
console.log("\nall browser-engine tests passed");
