/* FRAME 2015 calculation engine — formulas as in the FRAME 2015 spreadsheet
   (sheets P-REF, A-REF, D-REF). Pure function: compute(inputs) → all factors.
   Used by index.html (inlined copy between the FRAME2015-ENGINE markers) and by qa/validate.mjs. */
// FRAME2015-ENGINE-START
const FRAME = (() => {
  const log = Math.log10, ok = v => v === true || v === "OK";
  function compute(d){
    /* ---------- P: potential risk ---------- */
    const Qi = d.Qi, Qm = d.Qm;
    const q = (2/3)*log(Qi + Qm) - 0.55;
    const i = 1 - d.T/1000 - 0.1*log(d.m) + d.M/10;
    const l = d.l, area = d.area, b = area / l;
    const g = d.access === "narrow" ? (l + 5*Math.cbrt(l*l*b))/200 : (b + 5*Math.cbrt(b*b*l))/200;
    const h = Math.min(d.h, 15);
    const kCalc = (0.3*d.win + d.vents + d.flow/10000) / area;
    const k = Math.max(d.kEst || 0, kCalc);
    const v = 0.84 + 0.1*log(Qm) - Math.sqrt(k*Math.sqrt(h));
    const E = Math.abs(d.E);
    const e = Math.pow((E+3)/(E+2), 0.7*E);
    const H = d.H, Z = d.Z;
    const z = 1 + 0.05*Math.floor(b/(20*Z) + (H < 0 ? H/-3 : H/25));
    const P = q*g*i*e*v*z, P1 = q*i*e*v*z, P2 = g*i*e*v*z;

    /* ---------- A: acceptable risk ---------- */
    const a = d.a.reduce((s,x)=>s+x, 0);
    const X = d.X, x = d.x, O = Math.min(d.O, 4);
    const kk = x*120/X;
    const K = kk < 1 ? 0 : kk < 2 ? 1 : kk < 3 ? 2 : kk < 4 ? 3 : (kk > O ? O : 4);
    const p = d.p0 + (ok(d.pPerc) ? 0 : 2) + (ok(d.pPlan) ? 0 : 2) + (ok(d.pPanic) ? 0 : 2);
    const vert = (H < 0 ? -2 : 1.25) * H;
    const bl = b + l;
    const den = 1.11*K*(1.4*x*bl - 0.44*X);
    const tu = den > 0 ? (p*x*(bl + X/x + vert)*bl) / den : Infinity;   // seconds; too few exits → spreadsheet shows #DIV/0!
    const t = d.rset > 0 ? d.rset/550 : tu/720;
    const euro = d.value * (d.deflNow ? d.defl2000/d.deflNow : 1) * (d.xr || 1);
    const c2 = euro < 7 ? 0 : log(euro/7)/4;
    const c = d.c1 + c2;
    const r = 0.1*log(Qi + 1) + d.M/10;
    const dd = d.d;
    const A = 1.6 - a - t - c, A1 = 1.6 - a - t - r, A2 = 1.6 - a - c - dd;

    /* ---------- D: protection level ---------- */
    const req = (Qi + Qm)/4;                                       // m³
    const ratio = d.store < req ? d.store/req : 1;
    const w2t = ratio >= 1 ? 0 : ratio >= 0.9 ? 1 : ratio >= 0.8 ? 2 : ratio >= 0.7 ? 3 : 4;
    const w2 = d.w1 === 10 ? 0 : w2t;
    const net = ok(d.looped) ? 2*d.flowcap : d.flowcap;
    const w3 = net === 0 ? 6 : net >= req/2 ? 0 : 2;
    const conn = d.c70 + 2*d.c80 + 3*d.c110;
    const spacing = conn > 0 ? 2*(l + b)/conn : Infinity;
    const w4 = spacing > 100 ? 3 : spacing <= 50 ? 0 : 1;
    const w5 = d.bar >= (H + d.h + 35)*0.1 ? 0 : 3;
    const wSum = d.w1 + w2 + w3 + w4 + w5, W = Math.pow(0.95, wSum);

    const n = d.n1.reduce((s,o)=>s+(ok(o)?0:2), 0) + d.n2 + d.n3 + d.n4 + d.n5;
    const N = Math.pow(0.95, n);

    const sDet = ok(d.sTrans) ? d.sAD : 0;
    const sFault = sDet === 0 ? 0 : (d.sAD < 3 ? 0 : (ok(d.sFault) ? 2 : 0));
    const sZone = sDet === 0 ? 0 : (ok(d.sZone) ? 2 : 0);
    const s = sDet + sFault + sZone + (ok(d.s2)?3:0) + (ok(d.s3)?2:0) + (ok(d.s4)?2:0) + d.s5 + d.s6 + d.s7 + d.s8 + d.s9;
    const S = Math.pow(1.05, s);

    const f = d.fs/2 + d.fo/4 + d.fc/8 + d.fi/8;
    const F = (1 + f/100 - Math.pow(f,2.5)/1e6) * (1 - (S-1)/40);
    const Fo = 1 + d.fs/100 - Math.pow(d.fs,2.5)/1e6;

    const u = sDet + sFault + sZone
      + (ok(d.uPartial) ? (sDet > 0 ? 0 : 2) : 0) + (ok(d.u300) ? 2 : 0) + (ok(d.uVoice) ? 6 : 0)
      + d.u2 + d.uSt + d.uHe + (ok(d.uSign) ? 4 : 0) + d.u4 + d.s7
      + (ok(d.uVent) ? (sDet === 0 ? 0 : 3) : 0) + d.s8 + (d.s9 > 0 ? 5 : 0);
    const U = Math.pow(1.05, u);

    const y = d.u2 + (ok(d.yDet) ? (sDet > 0 ? 0 : 2) : 0) + (ok(d.ySpr) ? (d.s6 > 0 ? 0 : 2) : 0) + (ok(d.yOth) ? (d.s7 > 0 ? 0 : 2) : 0)
      + (ok(d.yFin)?2:0) + (ok(d.ySpare)?4:0) + (ok(d.yRep)?2:0) + (ok(d.yReloc)?4:0) + (ok(d.yCoop)?3:0) + (ok(d.yProd)?4:0);
    const Y = Math.pow(1.05, y);

    const D = W*N*S*F, D1 = N*U, D2 = W*N*S*Y;
    const R = P/(A*D), R1 = P1/(A1*D1), R2 = P2/(A2*D2), Ro = P/(A*Fo);
    return {q,i,g,e,v,z,b,k,P,P1,P2, a,K,p,tu,t,c,c2,r,d:dd,A,A1,A2, req,wSum,W,n,N,s,S,f,F,Fo,u,U,y,Y,D,D1,D2, R,R1,R2,Ro};
  }
  const RO_ADVICE = [[0,"حفاظت دستی کافی است"],[1,"اعلام حریق خودکار اضافه شود"],[1.6,"اسپرینکلر نصب شود"],[2.7,"اسپرینکلر با منبع آب تقویت‌شده"],[4.5,"خطر بیش از حد: ریسک باید کاهش یابد"]];
  const roAdvice = ro => RO_ADVICE.filter(([v])=>ro>=v).pop()[1];
  return {compute, roAdvice};
})();
// FRAME2015-ENGINE-END
if (typeof module !== "undefined") module.exports = FRAME;
