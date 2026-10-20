// Checks frame2015.js against reference FRAME 2015 spreadsheets.
// Input: JSON produced by extracting the REF sheets (see qa/extract_xlsx.py). Usage: node validate.mjs cases.json
import fs from 'node:fs';
import { createRequire } from 'node:module';
const FRAME = createRequire(import.meta.url)('../frame2015.js');
const cases = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
const map = c => ({ Qi:c.Qi, Qm:c.Qm, T:c.T, m:c.m, M:c.M, l:c.l, area:c.A, access:c.access, h:c.h_raw,
  win:c.win||0, vents:c.vents||0, flow:c.flow||0, kEst:c.k_est||0, E:c.E||0, Z:c.Z, H:c.H||0,
  a:c.a.map(v=>v||0), X:c.X, x:c.x, O:c.O, p0:c.p0, pPerc:c.p_perc===0, pPlan:c.p_plan===0, pPanic:c.p_panic===0, rset:c.rset||0,
  c1:c.c1, value:c.val||0, deflNow:c.defl_now, defl2000:c.defl_2000, xr:c.xr, d:c.d,
  w1:c.w1, store:c.store||0, flowcap:c.flowcap||0, looped:c.looped, c70:c.c70||0, c80:c.c80||0, c110:c.c110||0, bar:c.bar||0,
  n1:c.n1, n2:c.n2, n3:c.n3, n4:c.n4, n5:c.n5, sTrans:c.s_trans, sAD:c.s_ad, sFault:c.s_fault, sZone:c.s_zone, s2:c.s2, s3:c.s3, s4:c.s4,
  s5:c.s5, s6:c.s6, s7:c.s7, s8:c.s8, s9:c.s9, fs:c.fs, fo:c.fo, fc:c.fc, fi:c.fi,
  uPartial:c.u_partial, u300:c.u_300, uVoice:c.u_voice, u2:c.u2, uSt:c.u_st, uHe:c.u_he, uSign:c.u_sign, u4:c.u4, uVent:c.u_vent,
  yDet:c.y_det, ySpr:c.y_spr, yOth:c.y_oth, yFin:c.y_fin, ySpare:c.y_spare, yRep:c.y_rep, yReloc:c.y_reloc, yCoop:c.y_coop, yProd:c.y_prod });
const KEYS = ['q','i','g','e','v','z','P','P1','P2','t','c','r','A','A1','A2','W','N','S','F','U','Y','D','D1','D2','R','R1','R2','Fo','Ro'];
let worst = 0, bad = 0;
for (const cs of cases){
  if (cs.err){ console.log('SKIP', cs.file, cs.err); continue; }
  const got = FRAME.compute(map(cs.in)), diffs = [];
  for (const k of KEYS){ const ref = cs.out[k]; if (typeof ref !== 'number') continue;
    const rel = Math.abs(got[k]-ref) / Math.max(Math.abs(ref), 1e-9); worst = Math.max(worst, rel);
    if (rel > 1e-9) diffs.push(`${k}: mine ${got[k].toFixed(6)} vs ref ${ref.toFixed(6)}`); }
  if (diffs.length){ bad++; console.log('MISMATCH', cs.file, '\n   ' + diffs.join('\n   ')); }
}
console.log(`${cases.length} cases, ${bad} with mismatches, worst relative error ${worst.toExponential(2)}`);
