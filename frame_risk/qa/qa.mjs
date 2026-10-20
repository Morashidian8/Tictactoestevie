// FRAME app QA loop: build → serve → render all views × viewports × themes → checks + screenshots
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
import { execSync, spawn } from 'node:child_process';
import fs from 'node:fs';
const REPO=new globalThis.URL('../..', import.meta.url).pathname.replace(/\/$/,''), OUT=process.argv[2]||'shots', SITE=OUT+'/site';
fs.rmSync(OUT,{recursive:true,force:true}); fs.mkdirSync(SITE+'/frame',{recursive:true});
execSync(`cat ${REPO}/frame_risk/pwa/head.html ${REPO}/frame_risk/index.html > ${SITE}/frame/index.html && cp ${REPO}/frame_risk/pwa/manifest.json ${REPO}/frame_risk/pwa/sw.js ${SITE}/frame/ && cp -r ${REPO}/frame_risk/pwa/icons ${SITE}/frame/icons`);
try{ execSync('fuser -k 8766/tcp',{stdio:'ignore'}); }catch(e){}
const srv = spawn('python3',['-m','http.server','8766'],{cwd:SITE,stdio:'ignore'});
await new Promise(r=>setTimeout(r,800));
const URL='http://localhost:8766/frame/';
const VIEWS=['b:info','b:water','b:sp','summary','start','info','geo','vent','fuel','ign','ppl','val','water','np','sp','fr','esc','cont','result','report','formula'];
const b = await chromium.launch({executablePath:'/opt/pw-browsers/chromium'}).catch(()=>chromium.launch());
const problems=[]; const P=(...a)=>{problems.push(a.join(' '));};
for (const vp of [{n:'phone',width:390,height:844},{n:'desk',width:1366,height:900}]) for (const theme of ['light','dark']) {
  const ctx = await b.newContext({viewport:{width:vp.width,height:vp.height},colorScheme:theme,deviceScaleFactor:1});
  const p = await ctx.newPage();
  p.on('pageerror',e=>P('PAGEERROR',vp.n,theme,e.message)); p.on('console',m=>{if(m.type()==='error')P('CONSOLE',vp.n,theme,m.text())});
  await p.goto(URL); await p.waitForLoadState('networkidle').catch(()=>{});
  for (const v of VIEWS){
    await p.evaluate(v=>{ const b=v.startsWith('b:'); P.ctx = (b||v==='summary') ? 'b' : P.floors[0].id; st.view=b?v.slice(2):v; renderAll();window.scrollTo(0,0);document.querySelectorAll('main details').forEach(d=>d.open=true)},v); await p.waitForTimeout(120);
    const r = await p.evaluate(()=>{
      const de=document.documentElement, out=[];
      if (de.scrollWidth>de.clientWidth+1) out.push('HSCROLL '+de.scrollWidth+'>'+de.clientWidth);
      document.querySelectorAll('main *, aside *, header *').forEach(el=>{
        const cs=getComputedStyle(el); if(cs.display==='none'||cs.visibility==='hidden') return;
        if (el.closest('.scroll,nav.steps')) return;
        const rc=el.getBoundingClientRect(); if(!rc.width) return;
        if (rc.right>de.clientWidth+1||rc.left<-1) out.push('OUT '+el.tagName+'.'+el.className+' '+Math.round(rc.left)+'..'+Math.round(rc.right));
        if (el.children.length===0 && el.scrollWidth>el.clientWidth+2 && cs.overflowX==='visible' && el.textContent.trim()) out.push('CLIP '+el.tagName+'.'+el.className+' "'+el.textContent.trim().slice(0,30)+'"');
      });
      return out.slice(0,8);
    });
    r.forEach(x=>P('LAYOUT',vp.n,theme,v,x));
    if (theme==='light' || ['info','result','report','summary'].includes(v)) await p.screenshot({path:`${OUT}/${vp.n}-${theme}-${v.replace(':','_')}.png`,fullPage:true});
  }
  await ctx.close();
}
// ---- engine copy in index.html must equal frame2015.js ----
{ const html=fs.readFileSync(REPO+'/frame_risk/index.html','utf8'), js=fs.readFileSync(REPO+'/frame_risk/frame2015.js','utf8');
  const cut=t=>t.slice(t.indexOf('// FRAME2015-ENGINE-START'), t.indexOf('// FRAME2015-ENGINE-END'));
  if (cut(html)!==cut(js)) P('ENGINE inline copy differs from frame2015.js'); }
// ---- logic + interaction ----
const ctx = await b.newContext({viewport:{width:1366,height:900}}); const p = await ctx.newPage();
p.on('pageerror',e=>P('PAGEERROR logic',e.message));
await p.goto(URL);
const L = await p.evaluate(()=>{
  const out=[], base={...DEFAULTS}, c=compute(base), chk=(cond,msg)=>{ if(!cond) out.push(msg); };
  const w=(k,v)=>compute({...base,[k]:v});
  chk(w('s6',11).R<c.R && w('s6',11).R2<c.R2 && Math.abs(w('s6',11).R1-c.R1)<1e-9,'sprinkler should lower R,R2 only');
  chk(w('Qm',2000).R>c.R && w('Qm',2000).R1>c.R1,'fire load should raise R,R1');
  chk(w('Wex',6).R1<c.R1,'wider exits should lower R1');
  chk(w('p0',8).R1>c.R1,'less mobile people should raise R1');
  chk(w('n2',2).R>c.R && w('n2',2).R1>c.R1 && w('n2',2).R2>c.R2,'missing extinguishers should raise all');
  chk(w('E',10).R>c.R,'higher floor should raise R');
  chk(w('E',-2).R>c.R,'basement should raise R');
  chk(w('fs',180).R<c.R,'fire resistance should lower R');
  chk(w('uSt',4).R1<c.R1,'protected stairs should lower R1');
  chk(w('yFin',true).R2<c.R2,'backups should lower R2');
  chk(w('d',0.1).R2<c.R2,'lower dependency should lower R2');
  chk(w('M',5).R>c.R,'flammable linings should raise R');
  chk(w('win',60).R<c.R,'venting should lower R');
  chk((()=>{const x=compute({...base,sAD:8,sTrans:true});return x.R<c.R&&x.R1<c.R1})(),'transmitted detection should lower R,R1');
  chk(compute({...base,sAD:8,sTrans:false}).R===c.R,'untransmitted detection should not count (FRAME rule)');
  chk(compute({...base,X:5000,Wex:0.6}).R1===Infinity,'too few exits → infinite R1');
  chk(compute({...base,s6:0,u4:10}).R1===compute({...base,s6:0,u4:0}).R1,'escape-sprinkler credit must need sprinklers');
  chk(compute({...base,sAD:0,uVent:true}).R1===c.R1,'hidden smoke-vent answer must not count');
  chk(compute({...base,a3:0,a4:0.15}).R===c.R,'fuel question hidden when no heater in space');
  chk(compute({...base,area:500,u2:4}).R1===compute({...base,area:500,u2:0}).R1,'sub-compartments only for >1000 m²');
  chk(compute({...base,s6:11,u4:10}).R1<compute({...base,s6:11,u4:0}).R1,'escape-sprinkler credit counts with sprinklers');
  // fuzz
  const sels=ALLFIELDS.filter(f=>f.t==='sel'&&f.id!=='use');
  for(let n=0;n<3000;n++){ const d={...base}; sels.forEach(f=>d[f.id]=f.o[Math.floor(Math.random()*f.o.length)].v);
    const ar=10+Math.random()*20000; Object.assign(d,{area:ar,l:Math.max(1,Math.sqrt(ar)*(0.5+Math.random()*2)),h:2+Math.random()*20,E:Math.round(Math.random()*40-5),H:Math.random()*120-20,win:Math.random()*ar*0.3,Qm:1+Math.random()*15000,X:1+Math.round(Math.random()*30),Wex:0.6+Math.random()*20,O:Math.round(Math.random()*4),store:Math.random()*500,c70:Math.round(Math.random()*5),bar:Math.random()*10});
    const x=compute(d); for(const k of ['R','R1','R2']) if(!(x.invalid || x[k]===Infinity || (isFinite(x[k])&&x[k]>0))){ out.push('fuzz non-finite '+k+' '+JSON.stringify(d)); n=1e9; break; } }
  return {out, sample:compute(SAMPLE), def:c};
});
L.out.forEach(x=>P('LOGIC',x));
console.log('sample R/R1/R2', L.sample.R.toFixed(3), L.sample.R1.toFixed(3), L.sample.R2.toFixed(3), '| default', L.def.R.toFixed(3), L.def.R1.toFixed(3), L.def.R2.toFixed(3));
// interaction: number input → live gauge, radio → selection, confirm → progress, new assessment, data round-trip
await p.evaluate(()=>{P.ctx=P.floors[0].id;st.view='geo';renderAll()});
const before = await p.textContent('#res');
await p.fill('#area','2400'); await p.waitForTimeout(100);
if ((await p.textContent('#res'))===before) P('INTERACT number input did not update live panel');
await p.evaluate(()=>{P.ctx='b';st.view='sp';renderAll()});
await p.click('label.opt:has-text("دارد، آب از شبکهٔ شهری")'); await p.waitForTimeout(100);
if (await p.evaluate(()=>st.data.s6)!==11) P('INTERACT radio did not set s6');
if (!(await p.$('label.opt.sel:has-text("دارد، آب از شبکهٔ شهری")'))) P('INTERACT radio .sel class missing');
await p.click('label:has(#s8_unk)');
if (!(await p.evaluate(()=>st.unk.s8 && st.data.s8===4))) P('INTERACT unknown option');
await p.click('label:has(#s8_0)'); if (await p.evaluate(()=>st.unk.s8 || st.data.s8!==8)) P('INTERACT leaving unknown');
await p.click('[data-confirm]'); await p.waitForTimeout(100);
if (!(await p.evaluate(()=>st.seen.includes('sp')))) P('INTERACT confirm not recorded');
if (await p.evaluate(()=>st.view)!=='fr') P('INTERACT next did not advance');
// ---- project: building profile, spaces, overrides, summary ----
{ const r = await p.evaluate(()=>{ const out=[]; const n0 = P.floors.length;
    const b6 = P.building.s6;                                      // building answer set above (sprinklers)
    P.ctx = P.floors[1].id; if (st.data.s6 !== b6) out.push('floor does not inherit building answer');
    P.view='sp'; renderAll();
    if (document.querySelector('#fld_s6')) out.push('inherited question should be shown compact, not as a field');
    document.querySelector('[data-ovr="s6"]').click();
    if (!document.querySelector('#fld_s6')) out.push('override did not open the field');
    document.querySelector('label:has(#s6_0)').click();
    if (P.floors[1].data.s6!==0 || P.building.s6!==b6) out.push('override must change only this floor');
    P.ctx = P.floors[2].id; if (st.data.s6!==b6) out.push('other floors must keep building answer');
    P.ctx = P.floors[1].id; renderAll(); document.querySelector('[data-unovr="s6"]').click();
    if (st.data.s6!==b6 || P.floors[1].ovr.s6) out.push('reset to building answer failed');
    const top = Math.max(...P.floors.map(f=>+f.data.E||0)), bottom = Math.min(...P.floors.map(f=>+f.data.E||0));
    document.querySelector('[data-addfloor]').click(); document.querySelector(`[data-lvl="${top+1}"]`).click();
    if (P.floors.length!==n0+1 || curFloor().data.E!==top+1) out.push('add floor above failed');
    document.querySelector('[data-addfloor]').click(); document.querySelector(`[data-lvl="${bottom-1}"]`).click();
    if (P.floors.length!==n0+2 || curFloor().data.E!==bottom-1 || curFloor().data.H>=0 && bottom-1<0) out.push('add basement failed');
    if (P.floors[0].id!==P.ctx) out.push('floors must be sorted bottom-up');
    if (!/زیرزمین|همکف/.test(floorName(curFloor()))) out.push('basement/ground name not automatic');
    document.querySelector('[data-addfloor]').click(); document.querySelector('#lvN').value='-3'; document.querySelector('#lvGo').click();
    if (curFloor().data.E!==-3) out.push('custom floor number failed');
    P.view='summary'; P.ctx='b'; renderAll();
    if (document.querySelectorAll('table.sumt tbody tr').length!==P.floors.length) out.push('summary table rows ≠ spaces');
    const rows = floorResults(), w = worstOf(rows,'R1');
    if (rows.some(r=>r.x.R1>w.x.R1)) out.push('governing R1 is not the maximum');
    return out; });
  r.forEach(x=>P('PROJECT',x)); }
// ---- corrective measures: catalog, cost, package ----
{ const r = await p.evaluate(()=>{ const out=[];
    const NEVER = ['Qi','s8','n4','s2','a1','a8','a9','a11','p0','pPerc','pPanic','u300','yProd','T','m','use','d','c1','access','Z'];
    const rnd = (f) => f.o[Math.floor(Math.random()*f.o.length)].v;
    for (let k=0; k<150; k++){
      const d = {...DEFAULTS};
      ALLFIELDS.forEach(f=>{ if (f.t==='sel' && Math.random()<0.5) d[f.id] = rnd(f); });
      d.use = rnd(FIELD.use); d.area = 100+Math.random()*3000; d.l = Math.sqrt(d.area)*(1+Math.random()*2); d.X = 5+Math.floor(Math.random()*400);
      d.Wex = 0.9+Math.random()*4; d.O = 1+Math.floor(Math.random()*3); d.Qm = 100+Math.random()*2000; d.E = Math.floor(Math.random()*8)-2; d.H = d.E*3.2;
      const c = candidates(d);
      c.forEach(m=>{ const ks = Object.keys(m.patch);
        if (ks.some(k=>NEVER.includes(k))) out.push('non-actionable measure offered: '+ks);
        if (![1,2,3].includes(m.cost)) out.push('measure without cost class: '+m.id);
        if (m.patch.sAD===4 || m.patch.s9===14) out.push('unrealistic option offered: '+m.id);
        if (m.patch.s7 && NO_S7.includes(d.use)) out.push('s7 offered for '+d.use);
        if ((m.patch.sTrans||m.patch.sFault||m.patch.sZone) && !(d.sAD>2)) out.push('panel feature offered without a panel'); });
      const x0 = compute(d); if (x0.invalid) continue;
      const ev = acc=>[compute({...d, ...acc})];
      const pk = allOk([x0]) ? null : greedy(ev, acc=>candidates({...d, ...acc}).map(m=>({...m, apply:a=>({...a, ...m.patch})})));
      if (!pk) continue;
      if (pk.steps.length>10) out.push('package longer than 10 steps');
      let e = excess([x0]), acc = {};
      pk.steps.forEach(st_=>{ acc = {...acc, ...st_.patch}; const nx = ev(acc); if (!(excess(nx) < e)) out.push('package step does not reduce risk'); e = excess(nx); });
      if (Math.abs(excess(ev(acc)) - excess(pk.final)) > 1e-9) out.push('package replay mismatch');
      if (pk.ok !== allOk(pk.final)) out.push('package ok flag wrong');
      if (new Set(pk.steps.map(s=>s.key)).size !== pk.steps.length) out.push('package repeats a measure');
    }
    const d = {...DEFAULTS, Wex:1.2, X:200, vents:0, Qm:900};
    const ids = candidates(d).map(m=>m.id);
    ['exitW','vents','Qm'].forEach(k=>{ if (!ids.includes(k)) out.push('numeric measure missing: '+k); });
    if (!candidates({...d, pPlan:false}).some(m=>m.patch.pPlan===true)) out.push('evacuation plan not offered');
    if (!candidates({...d, M:3}).some(m=>m.patch.M===0)) out.push('linings not offered');
    // building package on a deliberately bad building
    P.building.sAD=0; P.building.pPlan=false; P.floors.forEach(f=>{ f.data.X=150; f.data.Wex=1.2; f.data.Qm=1200; });
    const bp = buildingPackage();
    if (!bp || !bp.steps.length) out.push('building package empty for a bad building');
    else { let acc = {}; bp.steps.forEach(s=>{ acc = s.apply(acc); });
      const fx = floorsEval(bp.fls)(acc); if (Math.abs(excess(fx)-excess(bp.final))>1e-9) out.push('building package replay mismatch');
      if (bp.steps.some(s=>s.scope==='b' && !Object.keys(s.patch).every(k=>BFIELDS.has(k)))) out.push('shared step changes a floor field');
      if (bp.steps.some(s=>s.scope!=='b' && Object.keys(s.patch).some(k=>BFIELDS.has(k) && !s.fl.ovr[k]))) out.push('floor step changes a shared field'); }
    P.view='summary'; P.ctx='b'; renderAll();
    if (!/بستهٔ پیشنهادی ساختمان/.test(document.querySelector('main').textContent)) out.push('building package not shown in summary');
    if (!document.querySelector('.ctag.c1, .ctag.c2, .ctag.c3')) out.push('cost tags not shown');
    if (!/بستهٔ پیشنهادی/.test(summaryText())) out.push('package missing from summary text');
    P.ctx=P.floors[1].id; P.view='result'; renderAll();
    if (!/بستهٔ پیشنهادی/.test(document.querySelector('main').textContent)) out.push('space package not shown on result page');
    return out; });
  r.forEach(x=>P('MEASURES',x)); }
await p.evaluate(()=>{P.ctx='b';st.view='sp';renderAll()});
await p.click('#btnNew'); await p.click('.modal [data-yes]'); await p.waitForTimeout(100);
if (await p.evaluate(()=>P.floors.length!==1 || P.floors[0].data.area!==600 || P.ctx!=='b')) P('INTERACT new assessment did not reset');
await p.click('#btnData'); const txt = await p.inputValue('#dataBox');
await p.fill('#dataBox', txt.replace('"area": 600','"area": 777')); await p.click('#dLoad'); await p.waitForTimeout(100);
if (await p.evaluate(()=>P.floors[0].data.area)!==777) P('INTERACT data restore failed');
await p.reload(); if (await p.evaluate(()=>P.floors[0].data.area)!==777) P('INTERACT localStorage persistence failed');
await p.evaluate(()=>{P.ctx=P.floors[0].id;st.view='ppl';renderAll()}); await p.click('[data-est="X"]'); await p.waitForTimeout(80);
if (await p.evaluate(()=>st.data.X!==Math.max(1,Math.round(st.data.area*USES.find(u=>u.v===st.data.use).dens)))) P('INTERACT estimate X');
await p.click('details.how summary'); if (!(await p.$('details.how[open]'))) P('INTERACT how guide');
await p.fill('#X','5000'); await p.fill('#Wex','0.6'); if (!(await p.textContent('#warn_Wex')).trim()) P('INTERACT warning not shown');
await p.evaluate(()=>{st.view='fuel';renderAll()}); await p.click('[data-qcalc]'); await p.fill('[data-q="i0"]','10'); await p.fill('[data-q="m3"]','100');
await p.click('#qUse'); await p.waitForTimeout(80);
if (await p.evaluate(()=>st.data.Qm!==Math.round((10*700+100*40)/st.data.area))) P('INTERACT fire-load calculator');
await p.evaluate(()=>{st.view='start';renderAll()}); await p.click('[data-begin]'); await p.waitForTimeout(80);
if (await p.$('.modal [data-yes]')) await p.click('.modal [data-yes]');
if (await p.evaluate(()=>st.view)!=='info') P('INTERACT begin button');
await p.evaluate(()=>{P.ctx=P.floors[0].id;st.view='geo';renderAll()}); await p.fill('#area','3818'); await p.fill('#l','52'); await p.waitForTimeout(80);
if (!(await p.textContent('#warn_l')).trim()) P('INTERACT width>length warning not shown');
await p.evaluate(()=>{P.ctx='b';st.view='sp';st.data.sAD=0;renderAll()});
if (await p.$('#fld_sTrans')) P('INTERACT transmission question should be hidden without detectors');
await p.click('label:has(#sAD_4)'); await p.waitForTimeout(80);
if (!(await p.$('#fld_sTrans'))) P('INTERACT transmission question should appear after choosing detectors');
await p.evaluate(()=>{P.ctx=P.floors[0].id;st.view='result';renderAll()}); await p.click('[data-drv="R1"]');
if (!(await p.$('[data-drv="R1"].on'))) P('INTERACT driver tab');
await b.close(); srv.kill();
console.log(problems.length? 'PROBLEMS:\n'+[...new Set(problems)].join('\n') : 'NO PROBLEMS');
