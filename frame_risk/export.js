/* FRAME tool — file exports, loaded on demand: an Excel workbook in the layout of the FRAME 2015
   spreadsheet (summary, one sheet per space with P / A / D, corrective measures) and a Word report,
   each in Persian or English. Uses the app's globals (P, compute, floorResults, buildingPackage …). */
(() => {
"use strict";

/* ---------- English texts for questions and options ---------- */
const YNE = {true:"Yes", false:"No"};
const MINE = {0:"None", 30:"30 min", 60:"60 min", 90:"90 min", 120:"120 min", 180:"180 min or more"};
const EN = {
  project:["Building / site"], comp:["Compartment assessed"], assessor:["Assessor"], date:["Date of the analysis"],
  use:["Main occupancy", {office:"Offices", home:"Residential", hosp:"Hospital / care", school:"Education (classrooms)", hotel:"Hotel / dormitory", shop:"Retail / shops", lib:"Library / archives", ind:"Industrial / workshop", store:"Warehouse", low:"Low hazard (parking, plant rooms, corridors)"}],
  area:["Total compartment area"], l:["Theoretical length (longest dimension)"],
  access:["Fire brigade access", {long:"Building accessible at its long side", narrow:"Accessible at the narrow side only"}],
  Z:["Number of access directions", {4:"From four sides", 3:"From three sides", 2:"From two sides", 1:"From one side only"}],
  E:["Level (floor number)"], H:["Height difference to the fire brigade access level"],
  h:["Floor-to-ceiling height"], win:["Single-glazed windows and skylights (upper part)"], vents:["Aerodynamic area of smoke vents"], flow:["Nominal flow of mechanical smoke extraction"],
  Qm:["Mobile fire load density"],
  Qi:["Immobile (building) fire load", {0:"Fully incombustible construction", 100:"Incombustible, max. 10% combustible parts", 300:"Timber frame with protective cladding, or masonry with timber floors", 1000:"Incombustible structure with much combustible cladding", 1500:"Fully combustible building"}],
  M:["Reaction to fire of wall and ceiling linings", {0:"Incombustible (A1)", 0.5:"Practically incombustible (A2)", 1:"Hardly combustible (B)", 2:"Slowly burning (C)", 3:"Normally combustible (D)", 4:"Easily combustible (E)", 5:"Very easily combustible (F)"}],
  T:["Damage temperature of the contents", {20:"Highly flammable liquids", 100:"Very sensitive (electronics)", 200:"Sensitive (textile, wood, paper)", 250:"Household goods", 300:"Machinery", 400:"Metal goods", 500:"Incombustible materials"}],
  m:["Average dimension of the contents", {0.005:"Very fine (dust, powder)", 0.05:"Fine", 0.3:"Normal", 1:"Large", 3:"Very large"}],
  a1:["Hazard of the main activity", {0:"Low", 0.2:"Medium", 0.4:"High"}],
  a2:["Heating system", {0:"Water or steam heating, or none", 0.05:"Hot air or thermal oil"}],
  a3:["Location of the heat generator", {0:"None, or in a separate boiler room", 0.1:"Inside this compartment"}],
  a4:["Fuel of the heat generator in this compartment", {0:"Electricity, coal or oil", 0.1:"Gas", 0.15:"Wood or waste"}],
  a5:["Electrical installation", {0:"Compliant and regularly inspected", 0.1:"Compliant, no periodic inspection", 0.2:"Not compliant"}],
  a6:["Explosive gas or vapour", {0:"None", 0.1:"Occasional leak possible", 0.2:"Present in normal operation", 0.3:"Always present"}],
  a7:["Combustible dust", {0:"None", 0.1:"Produced, no extraction", 0.2:"Heavy dust, explosion hazard"}],
  a8:["Welding or cutting", YNE], a9:["Woodworking or plastic cutting", YNE],
  a10:["Painting, spraying or gluing", {0:"Not done", 0.05:"Separate room with good ventilation", 0.1:"Separate room without special ventilation", 0.2:"In this compartment, not separated"}],
  a11:["Other special hazard", YNE],
  X:["Number of occupants (peak)"], Wex:["Total width of the exits"], O:["Independent escape routes to the outside"],
  p0:["Type of occupants", {1:"Healthy adults familiar with the building", 2:"People who need guidance", 8:"People with reduced mobility", 20:"People who need individual assistance"}],
  pPerc:["All occupants can perceive the danger", YNE], pPlan:["Written evacuation plan known to the occupants", YNE],
  pPanic:["Low risk of panic", {true:"Yes, low panic risk", false:"No, panic is possible"}],
  c1:["Replaceability of the contents", {0:"Easily", 0.1:"With difficulty", 0.2:"Irreplaceable"}],
  value:["Value of building and contents"],
  d:["Type of activity (dependency)", {0.8:"Offices or high-tech industry", 0.6:"Precision industry", 0.35:"Common manufacturing", 0.3:"Most businesses", 0.1:"Commerce and storage"}],
  w1:["Water reserve", {0:"Yes, refilled automatically", 4:"Yes, refilled manually", 10:"No reserve"}],
  store:["Water reserve available for fire fighting"],
  dia:["Main fire water pipe", {0:"None or < 80 mm", 34.3:"80 mm (3\")", 59.2:"100 mm (4\")", 134.3:"150 mm (6\")", 232.3:"200 mm (8\")", 366.8:"250 mm (10\")", 526.1:"300 mm (12\")", 676.9:"350 mm or more"}],
  looped:["Looped water network", {true:"Yes, looped", false:"No, dead-end"}],
  c70:["Hydrant connections 70 mm (2.5\")"], c80:["Hydrant connections 80 mm (3\")"], c110:["Hydrant connections 110 mm (4\")"], bar:["Pressure in the fire water network"],
  n1a:["Permanent (24 h) presence in the building", YNE], n1b:["Manual call points and alarm", YNE],
  n1c:["Reliable, immediate alerting of the fire brigade", YNE], n1d:["Warning of the occupants by alarm", YNE],
  n2:["Portable extinguishers", {0:"Sufficient and in good order", 2:"Insufficient or inadequate"}],
  n3:["Hose reels", {0:"Sufficient", 2:"Insufficient or inadequate", 4:"None"}],
  n4:["Arrival time of the first fire engine", {0:"Less than 10 min", 2:"10 to 15 min", 5:"15 to 30 min", 10:"More than 30 min"}],
  n5:["Fire-fighting training of the staff", {0:"Everybody has had practical training", 2:"Only a few", 4:"No training"}],
  sAD:["Automatic fire detection", {0:"None", 2:"Stand-alone smoke alarms only", 4:"Via the sprinkler flow switch only", 5:"Heat detectors on a fire panel", 8:"Smoke (or flame) detectors on a fire panel"}],
  sTrans:["Automatic transmission to the fire brigade or a 24 h control room", YNE], sFault:["Fire panel shows faults", YNE], sZone:["Fire panel shows the zone of the fire", YNE],
  s6:["Sprinklers", {0:"None", 11:"Yes, town water supply", 14:"Yes, one tank with its own pump", 20:"Yes, two independent water supplies"}],
  s7:["Other automatic extinguishing (gas, foam, mist, powder)", {0:"None, or one small room only", 11:"The whole compartment is protected"}],
  s3:["Water reserve dedicated to fire fighting", YNE], s4:["Water supply owned by the site", YNE], s2:["Water supply at least 4 times the need", YNE],
  s5:["Fire pumps", {0:"One pump or none", 5:"One tank with two pumps", 12:"Two tanks, each with its own pump"}],
  s8:["Public fire brigade", {8:"Full-time professional, 24 h", 6:"Full-time by day, part-time at night", 4:"Part-time", 2:"Volunteer"}],
  s9:["Private fire brigade", {0:"None", 6:"During working hours only", 14:"24 h"}],
  fs:["Fire resistance of the load-bearing structure", MINE], fo:["Fire resistance of the facades", MINE],
  fc:["Fire resistance of the ceiling / roof above", MINE], fi:["Fire resistance of the internal compartment walls", MINE],
  vsep:["Floors fire-separated from each other (risers, shafts, stairs)", {all:"Yes, all floors are separated", some:"Some floors have open links", none:"No, no floor is separated"}],
  vopen:["Open link for fire to the floor above", {true:"Yes, at least one open link", false:"No, sealed"}],
  extH:["External hazard next to the building (fuel tank, generator, substation, gas)", {0:"None", 1:"Present, adequately separated", 2:"Present, not separated"}],
  extNear:["This space faces the external hazard", YNE],
  uSt:["Escape stairs", {0:"No escape stair, or open stair", 1:"One enclosed internal stair", 2:"More than one enclosed stair, or one + escape ladder / chute", 3:"At least one enclosed, smoke-protected stair", 4:"More than one enclosed, smoke-protected stair", 6:"Internal stair + one external escape stair", 8:"Internal stair + more than one external escape stair"}],
  uHe:["Safe refuge area on the same floor", {0:"No", 2:"Yes, for about half the occupants", 8:"Yes, for everybody"}],
  u2:["Subdivision into sectors < 1000 m²", {0:"No", 2:"Yes, 30 min walls and doors", 4:"Yes, 60 min walls and doors"}],
  uSign:["Exit signs and emergency lighting on all routes", {true:"Yes, complete", false:"No, or incomplete"}],
  uVoice:["Voice evacuation messages", YNE],
  u300:["Fewer than 300 people evacuated at the same time", {true:"Yes, fewer than 300", false:"No, more than 300"}],
  uPartial:["Detection in the life-critical areas", YNE],
  u4:["Sprinklers covering the escape routes", {0:"No", 5:"High-risk areas only", 10:"Whole compartment incl. corridors"}],
  uVent:["Smoke vents opened automatically by detection", YNE],
  yFin:["Off-site backup of financial and administrative data", YNE], ySpare:["Replacement equipment readily available", YNE],
  yRep:["Quick repair after a fire possible", YNE], yReloc:["Activity can be relocated immediately", YNE],
  yCoop:["Written agreement for relocation", YNE], yProd:["Same activity at more than one site", YNE],
  yDet:["Detection in business-critical areas", YNE], ySpr:["Local sprinklers on critical equipment", YNE], yOth:["Local gas / foam extinguishing on critical equipment", YNE],
};
const SEC_EN = {info:"General information", geo:"Size, level and access", vent:"Ceiling and smoke venting", fuel:"Fire load and materials", ign:"Ignition sources",
  ppl:"Occupants and evacuation", val:"Value and activity", water:"Fire water supply", np:"Normal protection", sp:"Special protection",
  fr:"Fire resistance and separation", esc:"Escape facilities", cont:"Business continuity"};
const UNIT_EN = {"متر مربع":"m²", "متر":"m", "طبقه":"", "نفر":"persons", "راه":"routes", "عدد":"", "میلیون یورو":"M€"};
// FRAME 2015 symbols of the inputs, as in the official spreadsheet
const SYM = {Qi:"Qi", Qm:"Qm", T:"T", m:"m", M:"M", l:"l", area:"Atot", h:"h", E:"E", Z:"Z", H:"H",
  a1:"a1", a2:"a2", a3:"a3", a4:"a4", a5:"a5", a6:"a6", a7:"a7", a8:"a8", a9:"a9", a10:"a10", a11:"a11",
  X:"X", Wex:"x", O:"O", p0:"p", pPerc:"p", pPlan:"p", pPanic:"p", c1:"c1", value:"c2", d:"d",
  w1:"w1", store:"w2", dia:"w3", looped:"w3", c70:"w4", c80:"w4", c110:"w4", bar:"w5",
  n1a:"n1", n1b:"n1", n1c:"n1", n1d:"n1", n2:"n2", n3:"n3", n4:"n4", n5:"n5",
  sAD:"s1", sTrans:"s1", sFault:"s1", sZone:"s1", s2:"s2", s3:"s3", s4:"s4", s5:"s5", s6:"s6", s7:"s7", s8:"s8", s9:"s9",
  fs:"fs", fo:"fo", fc:"fc", fi:"fi", uSt:"u3", uHe:"u3", u2:"u2", u4:"u4", yFin:"y", ySpare:"y", yRep:"y", yReloc:"y", yCoop:"y", yProd:"y", yDet:"y", ySpr:"y", yOth:"y"};
const FACT = {
  q:["ضریب بار حریق","Fire load factor"], i:["ضریب گسترش آتش","Fire spread factor"], g:["ضریب مساحت","Area factor"], e:["ضریب طبقه","Level factor"],
  v:["ضریب تهویه","Venting factor"], z:["ضریب دسترسی","Access factor"], a:["ضریب فعال‌سازی (علت‌های آتش)","Activation factor"], t:["ضریب زمان تخلیه","Evacuation time factor"],
  c:["ضریب ارزش","Value factor"], r:["ضریب محیط","Environment factor"], d:["ضریب وابستگی فعالیت","Dependency factor"],
  W:["ضریب آب آتش‌نشانی","Water supply factor"], N:["ضریب حفاظت معمولی","Normal protection factor"], S:["ضریب حفاظت ویژه","Special protection factor"],
  F:["ضریب مقاومت در برابر آتش","Fire resistance factor"], U:["ضریب فرار","Escape factor"], Y:["ضریب ادامهٔ کار","Salvage factor"], Fo:["ضریب Fo (فقط سازه)","Fo factor (structure only)"],
  P:["ریسک بالقوه – ساختمان","Potential risk – property"], P1:["ریسک بالقوه – افراد","Potential risk – occupants"], P2:["ریسک بالقوه – فعالیت","Potential risk – activities"],
  A:["ریسک قابل‌قبول – ساختمان","Acceptable risk – property"], A1:["ریسک قابل‌قبول – افراد","Acceptable risk – occupants"], A2:["ریسک قابل‌قبول – فعالیت","Acceptable risk – activities"],
  D:["سطح حفاظت – ساختمان","Protection level – property"], D1:["سطح حفاظت – افراد","Protection level – occupants"], D2:["سطح حفاظت – فعالیت","Protection level – activities"],
  R:["ریسک ساختمان و دارایی","Risk for the property"], R1:["ریسک افراد","Risk for the occupants"], R2:["ریسک فعالیت","Risk for the activities"], Ro:["ریسک اولیه","Initial risk"],
};
const BLOCKS = [
  {k:"P", t:["محاسبهٔ ریسک بالقوه (P)","Potential risk calculation"], secs:["geo","vent","fuel"], f:["q","i","g","e","v","z"],
   tot:[["P","q*g*i*e*v*z"],["P1","q*i*e*v*z"],["P2","g*i*e*v*z"]]},
  {k:"A", t:["محاسبهٔ ریسک قابل‌قبول (A)","Acceptable risk calculation"], secs:["ign","ppl","val"], f:["a","t","c","r","d"],
   tot:[["A","1.6-a-t-c"],["A1","1.6-a-t-r"],["A2","1.6-a-c-d"]]},
  {k:"D", t:["محاسبهٔ سطح حفاظت (D)","Protection level calculation"], secs:["water","np","sp","fr","esc","cont"], f:["W","N","S","F","U","Y","Fo"],
   tot:[["D","W*N*S*F"],["D1","N*U"],["D2","W*N*S*Y"]]},
];
const RO_EN = ["Use manual fire protection","Add automatic fire detection","Install sprinklers","Sprinklers with improved water supplies","Too hazardous: reduce risk"];
const roIdx = ro => [0,1,1.6,2.7,4.5].filter(v=>ro>=v).length - 1;
const COST_EN = {1:"Low cost", 2:"Medium cost", 3:"High cost"};
const LV = {fa:{ok:"قابل‌قبول", warn:"مرزی", bad:"غیرقابل‌قبول"}, en:{ok:"Acceptable", warn:"Borderline", bad:"Not acceptable"}};
const FILL = {ok:"FFDFF3E6", warn:"FFFBF0CF", bad:"FFFBE1DF"}, INK = {ok:"FF1E7A44", warn:"FF8A6200", bad:"FFB3261E"};

/* ---------- helpers ---------- */
const lvOf = v => !isFinite(v) || v > 1 ? "bad" : v > 0.8 ? "warn" : "ok";
const num = (v, lang, d=2) => v==null || Number.isNaN(v) ? "—" : !isFinite(v) ? "∞" : lang==="fa" ? fa(v, d) : Number(v).toFixed(d);
const T2 = (lang, f, e) => lang==="fa" ? f : e;
function fLabel(f, lang){ return lang==="fa" ? f.l : (EN[f.id] ? EN[f.id][0] : f.l); }
function optText(f, v, lang){
  if (f.t==="sel"){ const o = f.o.find(o=>String(o.v)===String(v));
    if (lang==="fa") return o ? o.l : "—";
    const m = EN[f.id] && EN[f.id][1]; return m && m[String(v)]!==undefined ? m[String(v)] : o ? String(o.v) : "—"; }
  if (f.t==="num"){ const u = lang==="fa" ? (f.u||"") : (UNIT_EN[f.u] ?? f.u ?? ""); return `${num(+v, lang, Number.isInteger(+v) ? 0 : 2)} ${u}`.trim(); }
  return String(v ?? "") || "—";
}
const unitOf = (f, lang) => lang==="fa" ? (f.u||"") : (UNIT_EN[f.u] ?? f.u ?? "");
function spaceName(r, lang){
  if (lang==="fa") return r.name;
  if (!r.merged) return enSpaceName(r);
  const ns = r.members.map(m=>enSpaceName(m));
  return `Combined compartment: ${ns.length > 3 ? `${ns[0]} to ${ns[ns.length-1]} (${ns.length} floors)` : ns.join(" + ")}`;
}
const levelCode = E => { E = +E||0; return `F${E>=0?"+":""}${E}`; };
function measureText(s, lang){
  if (lang==="fa") return {t:s.t, o:s.o};
  const f = FIELD[s.key];
  if (f && f.t==="sel") return {t:fLabel(f,"en"), o:optText(f, s.patch[s.key], "en")};
  const p = s.patch;
  return ({
    exitW:{t:"One more exit, 0.9 m wide", o:`or widen the existing exits accordingly (total ${p.Wex} m)`},
    exitO:{t:"One more independent escape route to the outside", o:`${p.O} routes`},
    vents:{t:"Smoke vents", o:`about ${p.vents} m² (2% of the floor area)`},
    Qm:{t:"Reduce the mobile fire load by 30%", o:`to ${p.Qm} MJ/m² (no storage of paper and cardboard, housekeeping)`},
    store:{t:"Larger fire water reserve", o:`${p.store} m³`},
    hyd:{t:"More hydrant connections around the building", o:`spacing max. 50 m (${p.c70} × 70 mm in total)`},
    bar:{t:"Sufficient pressure in the fire water network", o:`at least ${p.bar} bar (booster pump)`},
  })[s.key] || {t:s.key, o:""};
}
const costText = (c, lang) => lang==="fa" ? COST[c] : COST_EN[c];
function stepCode(k, lang){ if (k===0) return T2(lang, "وضع موجود", "Current"); const c = k===1 ? "1" : `1-${k}`; return lang==="fa" ? c.replace(/\d/g, d=>"۰۱۲۳۴۵۶۷۸۹"[d]) : c; }

/* ---------- the assessment as exported: floors, combined compartments, package states ---------- */
function model(){
  const rows = floorResults().sort((a,b)=>(+a.d.E||0)-(+b.d.E||0));
  const crows = compResults(floorResults());
  const pk = buildingPackage(), steps = pk ? pk.steps : [];
  const accs = [{}]; steps.forEach(s=>accs.push(s.apply(accs[accs.length-1])));
  const keyOf = mem => mem.map(m=>m.fl.id).join("|");
  // risk of every floor and combined compartment after k steps
  const stateAt = acc => {
    const ds = rows.map(r=>floorBase(r.fl, acc)), xs = ds.map(d=>compute(d));
    const comp = {}; linkGroups(ds).forEach(g=>{ comp[g.map(i=>rows[i].fl.id).join("|")] = compute(mergeData(g.map(i=>ds[i]))); });
    return {ds, xs, comp};
  };
  const states = accs.map(stateAt);
  const last = accs[accs.length-1];
  const variant = steps.length ? rows.map(r=>({d:floorBase(r.fl, last), x:compute(floorBase(r.fl, last))})) : null;
  const units = [
    ...rows.map((r,i)=>({kind:"floor", r, name:r.name, d:r.d, x:r.x, v:variant ? variant[i] : null, code:levelCode(r.d.E), at:k=>states[k].xs[i]})),
    ...crows.map((c,j)=>{ const key = keyOf(c.members); const vd = steps.length ? mergeData(c.members.map(m=>floorBase(m.fl, last))) : null;
      return {kind:"comp", r:c, name:c.name, d:c.d, x:c.x, v:vd ? {d:vd, x:compute(vd)} : null, code:`C${j+1}`, at:k=>states[k].comp[key] || null}; }),
  ];
  return {rows, crows, pk, steps, units, b:{...DEFAULTS, ...P.building}};
}

/* ---------- charts as PNG bytes ---------- */
function pngBytes(canvas){ const b64 = chPng(canvas).split(",")[1], bin = atob(b64), u = new Uint8Array(bin.length); for (let i=0;i<bin.length;i++) u[i] = bin.charCodeAt(i); return u; }
function charts(M, lang){
  const nm = u => u.kind==="comp" ? T2(lang, `واحد ترکیبی ${fa(+u.code.slice(1),0)}`, `Combined ${u.code.slice(1)}`) : spaceName(u.r, lang);
  const valid = M.units.filter(u=>!u.x.invalid);
  const sch = chSchematic(M.rows.map(r=>({name:spaceName(r, lang), E:r.d.E, x:r.x})), lang);
  const bars = chBars(valid.map(u=>({label:nm(u), vals:{R:u.x.R, R1:u.x.R1, R2:u.x.R2}})), lang);
  const ro = chRo(valid.map(u=>({name:nm(u), ro:u.x.Ro})), lang);
  const steps = M.steps.length ? valid.map(u=>{ const cats = [], ser = [];
      for (let k=0; k<=M.steps.length; k++){ const x = u.at(k); if (!x || x.invalid) continue; cats.push(stepCode(k, lang)); ser.push({R:x.R, R1:x.R1, R2:x.R2}); }
      return {u, c:chSteps(nm(u), cats, ser, lang)}; }) : [];
  return {sch, bars, ro, steps, nm};
}


/* ---------- Excel: FRAME 2015 workbook layout ---------- */
async function excel(lang){
  const M = model(), C = charts(M, lang), rtl = lang==="fa", font = rtl ? "Tahoma" : "Calibri";
  const wb = new ExcelJS.Workbook(); wb.creator = "FRAME tool"; wb.created = new Date();
  const F = (o={}) => ({name:font, size:10, ...o});
  const AL = (o={}) => ({vertical:"middle", wrapText:true, horizontal:rtl ? "right" : "left", readingOrder:rtl ? "rtl" : "ltr", ...o});
  const fill = c => ({type:"pattern", pattern:"solid", fgColor:{argb:c}});
  const thin = {style:"thin", color:{argb:"FFC9D1DA"}}, box = {top:thin, left:thin, bottom:thin, right:thin};
  const put = (ws, addr, v, o={}) => { const c = ws.getCell(addr); c.value = v; c.font = F(o.font); c.alignment = AL(o.al); if (o.fill) c.fill = fill(o.fill); if (o.fmt) c.numFmt = o.fmt; if (o.border!==false) c.border = box; return c; };
  const lvCell = (c, v) => { const lv = lvOf(v); c.fill = fill(FILL[lv]); c.font = F({bold:true, color:{argb:INK[lv]}}); };
  const res = v => isFinite(v) ? v : "∞";
  const hasV = M.steps.length > 0;
  const used = {}, sheetName = code => { used[code] = (used[code]||0) + 1; return used[code] > 1 ? `${code} (${used[code]})` : code; };
  const addImg = (ws, canvas, row, col=0, width=760) => {
    const id = wb.addImage({base64:chPng(canvas), extension:"png"}), w = width, h = Math.round(width * canvas.height / canvas.width);
    ws.addImage(id, {tl:{col, row}, ext:{width:w, height:h}}); return Math.ceil(h / 20) + 1;
  };

  /* one sheet per space / combined compartment, in the layout of the P-, A- and D-sheets */
  const unitSheet = u => {
    const ws = wb.addWorksheet(u.sheet = sheetName(u.code), {views:[{rightToLeft:rtl, state:"frozen", ySplit:4}]});
    ws.columns = [{width:46},{width:8},{width:10},{width:44},{width:12}, ...(hasV && u.v ? [{width:44},{width:12}] : [])];
    const last = hasV && u.v ? "G" : "E", rowOf = {}, rowOfV = {};
    put(ws, "A1", T2(lang, "ارزیابی ریسک حریق به روش FRAME 2015", "FRAME 2015 fire risk assessment"), {font:{bold:true, size:13}, border:false});
    put(ws, "A2", M.b.project || "—", {font:{bold:true}, border:false}); put(ws, "D2", spaceName(u.r, lang), {font:{bold:true}, border:false});
    put(ws, "A3", `${T2(lang,"ارزیاب","Assessor")}: ${M.b.assessor||"—"}  |  ${T2(lang,"تاریخ","Date")}: ${M.b.date||"—"}`, {border:false});
    let r = 5;
    if (u.kind==="comp"){ ws.mergeCells(`A${r}:${last}${r}`);
      put(ws, `A${r}`, T2(lang, "این طبقه‌ها از نظر آتش از هم جدا نیستند و با هم یک واحد حریق‌اند. مساحت، افراد، عرض خروج و ارزش جمع شده و برای بقیهٔ موارد بدترین پاسخ طبقه‌ها به کار رفته است.",
        "These floors are not fire-separated and form one compartment. Areas, occupants, exit widths and values are added; for the other inputs the worst answer of the floors is used."), {fill:"FFFFF4DB"});
      ws.getRow(r).height = 32; r += 2; }
    if (u.x.invalid){ ws.mergeCells(`A${r}:${last}${r}`); put(ws, `A${r}`, T2(lang, "ورودی‌های این فضا خارج از محدودهٔ فرمول‌های FRAME است (بار حریق خیلی کم، تهویه یا حفاظت ویژه).", "The inputs of this space are outside the range of the FRAME formulas (very low fire load, venting or special protection)."), {fill:FILL.bad}); r += 2; }
    const head = () => { [T2(lang,"داده","DATA"), T2(lang,"نماد","Symbol"), T2(lang,"واحد","Unit"), T2(lang,"وضع موجود (مرجع)","Reference status"), T2(lang,"مقدار","Value"),
        ...(hasV && u.v ? [T2(lang,"گزینهٔ ۱ – پس از بستهٔ پیشنهادی","Variant 1 – after the recommended package"), T2(lang,"مقدار","Value")] : [])]
        .forEach((t,i)=>put(ws, `${"ABCDEFG"[i]}${r}`, t, {font:{bold:true, color:{argb:"FFFFFFFF"}}, fill:"FF34495E"})); r++; };
    const formulaOf = (expr, col, rows) => expr.replace(/[A-Za-z]+\d?/g, t => rows[t] ? `${col}${rows[t]}` : t);
    BLOCKS.forEach(B=>{
      ws.mergeCells(`A${r}:${last}${r}`); put(ws, `A${r}`, B.t[rtl?0:1], {font:{bold:true, size:12, color:{argb:"FFFFFFFF"}}, fill:"FFB4461E"}); ws.getRow(r).height = 20; r++;
      head();
      B.secs.forEach(sid=>{ const sec = SECTIONS.find(s=>s.id===sid);
        const fs = sec.fields.flatMap(f=>f.row||[f]).filter(f=>f.t!=="text" && !META.has(f.id) && (shown(f, u.d) || (u.v && shown(f, u.v.d))));
        if (!fs.length) return;
        ws.mergeCells(`A${r}:${last}${r}`); put(ws, `A${r}`, rtl ? sec.title : SEC_EN[sid], {font:{bold:true}, fill:"FFEAEFF4"}); r++;
        fs.forEach(f=>{
          const show = d => shown(f, d), valOf = d => f.t==="num" ? +d[f.id] : (typeof d[f.id]==="number" ? d[f.id] : null);
          put(ws, `A${r}`, fLabel(f, lang)); put(ws, `B${r}`, SYM[f.id]||"", {al:{horizontal:"center"}}); put(ws, `C${r}`, unitOf(f, lang), {al:{horizontal:"center"}});
          put(ws, `D${r}`, show(u.d) ? optText(f, u.d[f.id], lang) : T2(lang,"مربوط نیست","n/a")); put(ws, `E${r}`, show(u.d) ? valOf(u.d) : null, {fmt:"0.###"});
          if (hasV && u.v){ const ch = JSON.stringify(u.v.d[f.id])!==JSON.stringify(u.d[f.id]);
            put(ws, `F${r}`, show(u.v.d) ? optText(f, u.v.d[f.id], lang) : T2(lang,"مربوط نیست","n/a"), ch ? {fill:"FFFFF2B3", font:{bold:true}} : {});
            put(ws, `G${r}`, show(u.v.d) ? valOf(u.v.d) : null, {fmt:"0.###", ...(ch ? {fill:"FFFFF2B3"} : {})}); }
          r++; });
      });
      B.f.forEach(k=>{ put(ws, `A${r}`, FACT[k][rtl?0:1], {font:{bold:true}, fill:"FFF3F6FA"}); put(ws, `B${r}`, k, {font:{bold:true}, al:{horizontal:"center"}, fill:"FFF3F6FA"}); put(ws, `C${r}`, "", {fill:"FFF3F6FA"}); put(ws, `D${r}`, "", {fill:"FFF3F6FA"});
        put(ws, `E${r}`, res(u.x[k]), {fmt:"0.000", font:{bold:true}, fill:"FFF3F6FA"}); rowOf[k] = r;
        if (hasV && u.v){ put(ws, `F${r}`, "", {fill:"FFF3F6FA"}); put(ws, `G${r}`, res(u.v.x[k]), {fmt:"0.000", font:{bold:true}, fill:"FFF3F6FA"}); rowOfV[k] = r; }
        r++; });
      B.tot.forEach(([k,expr])=>{ put(ws, `A${r}`, FACT[k][rtl?0:1], {font:{bold:true}, fill:"FFE1E9F5"}); put(ws, `B${r}`, k, {font:{bold:true}, al:{horizontal:"center"}, fill:"FFE1E9F5"}); put(ws, `C${r}`, "", {fill:"FFE1E9F5"}); put(ws, `D${r}`, expr.replace(/\*/g,"·"), {fill:"FFE1E9F5", al:{horizontal:"center", readingOrder:"ltr"}});
        put(ws, `E${r}`, u.x.invalid ? "—" : {formula:formulaOf(expr, "E", rowOf), result:u.x[k]}, {fmt:"0.000", font:{bold:true}, fill:"FFE1E9F5"}); rowOf[k] = r;
        if (hasV && u.v){ put(ws, `F${r}`, "", {fill:"FFE1E9F5"}); put(ws, `G${r}`, u.v.x.invalid ? "—" : {formula:formulaOf(expr, "G", rowOfV), result:u.v.x[k]}, {fmt:"0.000", font:{bold:true}, fill:"FFE1E9F5"}); rowOfV[k] = r; }
        r++; });
      r++;
    });
    ws.mergeCells(`A${r}:${last}${r}`); put(ws, `A${r}`, T2(lang,"نتیجه: ریسک حریق R = P / (A · D)","Result: fire risk R = P / (A · D)"), {font:{bold:true, size:12, color:{argb:"FFFFFFFF"}}, fill:"FFB4461E"}); r++;
    head();
    const out = {};
    [["R","P","A","D"],["R1","P1","A1","D1"],["R2","P2","A2","D2"],["Ro","P","A","Fo"]].forEach(([k,p,a,dd])=>{
      put(ws, `A${r}`, FACT[k][rtl?0:1], {font:{bold:true}}); put(ws, `B${r}`, k, {font:{bold:true}, al:{horizontal:"center"}}); put(ws, `C${r}`, "");
      const lvTxt = x => k==="Ro" ? (rtl ? FRAME.roAdvice(x.Ro) : RO_EN[roIdx(x.Ro)]) : LV[lang][lvOf(x[k])];
      const f = (col, rows, x) => x.invalid ? "—" : {formula:`IF(${col}${rows[a]}>0,${col}${rows[p]}/(${col}${rows[a]}*${col}${rows[dd]}),"∞")`, result:res(x[k])};
      put(ws, `D${r}`, u.x.invalid ? "—" : lvTxt(u.x)); const c = put(ws, `E${r}`, f("E", rowOf, u.x), {fmt:"0.00"}); if (k!=="Ro" && !u.x.invalid) lvCell(c, u.x[k]);
      out[k] = `E${r}`;
      if (hasV && u.v){ put(ws, `F${r}`, u.v.x.invalid ? "—" : lvTxt(u.v.x)); const c2 = put(ws, `G${r}`, f("G", rowOfV, u.v.x), {fmt:"0.00"}); if (k!=="Ro" && !u.v.x.invalid) lvCell(c2, u.v.x[k]); out[k+"v"] = `G${r}`; }
      r++; });
    put(ws, `A${r+1}`, T2(lang, "معیار FRAME: R ≤ ۱ یعنی حفاظت موجود برای ریسک بالقوه کافی است.", "FRAME criterion: R ≤ 1 means the protection is sufficient for the potential risk."), {border:false, font:{italic:true, color:{argb:"FF66727F"}}});
    u.out = out;
  };

  /* summary sheet (like the FRAME2015 sheet), measures, then the space sheets */
  const ws = wb.addWorksheet("FRAME2015", {views:[{rightToLeft:rtl}]});
  const SC = scenarios(), wcmp = SC ? wb.addWorksheet(T2(lang, "مقایسه دو حالت", "Comparison"), {views:[{rightToLeft:rtl}]}) : null;
  const wm = wb.addWorksheet(T2(lang, "اقدامات اصلاحی", "Measures"), {views:[{rightToLeft:rtl}]});
  M.units.forEach(unitSheet);

  const cols = [T2(lang,"فضا","Space"), T2(lang,"برگه","Sheet"), T2(lang,"تراز","Level"), T2(lang,"مساحت (m²)","Area (m²)"), T2(lang,"افراد","Occupants"),
    "P","A","D","R","P1","A1","D1","R1","P2","A2","D2","R2","Ro", T2(lang,"سامانهٔ حفاظت پیشنهادی بر پایهٔ Ro","Fire protection concept based on Ro"), T2(lang,"وضعیت","Status"),
    ...(hasV ? [`R – ${T2(lang,"گزینهٔ ۱","V1")}`, `R1 – ${T2(lang,"گزینهٔ ۱","V1")}`, `R2 – ${T2(lang,"گزینهٔ ۱","V1")}`, T2(lang,"وضعیت گزینهٔ ۱","Status V1")] : [])];
  ws.columns = cols.map((c,i)=>({width: i===0 ? 40 : i===18 ? 34 : i===19||i===23 ? 16 : i<5 ? 11 : 9}));
  const L = i => { let s = "", n = i+1; while (n){ s = String.fromCharCode(65 + (n-1)%26) + s; n = Math.floor((n-1)/26); } return s; };
  put(ws, "A1", T2(lang, "خلاصهٔ ارزیابی ریسک حریق – FRAME 2015", "Fire risk assessment summary – FRAME 2015"), {font:{bold:true, size:14}, border:false});
  const info = [[T2(lang,"ساختمان","Building identification"), M.b.project||"—"], [T2(lang,"ارزیاب","Author of this calculation"), M.b.assessor||"—"], [T2(lang,"تاریخ ارزیابی","Date of this analysis"), M.b.date||"—"],
    [T2(lang,"روش","Method"), T2(lang,"FRAME 2015 – محاسبه با ابزار ارزیاب ریسک حریق FRAME","FRAME 2015 – calculated with the FRAME fire risk tool")],
    [T2(lang,"وضع موجود (مرجع)","Reference"), T2(lang,"وضعیت فعلی ساختمان","the actual status")],
    ...(hasV ? [[T2(lang,"گزینهٔ ۱","Variant 1"), T2(lang,`پس از اجرای بستهٔ پیشنهادی (${fa(M.steps.length,0)} اقدام – برگهٔ «اقدامات اصلاحی»)`,`after the recommended package (${M.steps.length} measures – see sheet "Measures")`)]] : []),
    ...(M.crows.length ? [[T2(lang,"واحد ترکیبی","Combined compartment"), T2(lang,"طبقه‌هایی که از نظر آتش جدا نیستند یک بار جدا و یک بار با هم ارزیابی شده‌اند؛ بدترین حالت ملاک است.","floors that are not fire-separated are assessed separately and together; the worst governs.")]] : [])];
  info.forEach(([k,v],i)=>{ put(ws, `A${3+i}`, k, {font:{bold:true}, border:false}); ws.mergeCells(`B${3+i}:S${3+i}`); put(ws, `B${3+i}`, v, {border:false}); });
  let r = 4 + info.length;
  cols.forEach((c,i)=>put(ws, `${L(i)}${r}`, c, {font:{bold:true, color:{argb:"FFFFFFFF"}}, fill:"FF34495E", al:{horizontal:"center"}})); ws.getRow(r).height = 30;
  const first = r + 1;
  M.units.forEach(u=>{ r++;
    const ref = k => u.out[k] ? {formula:`'${u.sheet}'!${u.out[k]}`, result:res(u.x[k])} : res(u.x[k]);
    const vals = [spaceName(u.r, lang), u.sheet, u.kind==="comp" ? "—" : +u.d.E, Math.round(+u.d.area), Math.round(+u.d.X),
      ...["P","A","D"].map(k=>res(u.x[k])), u.x.invalid ? "—" : ref("R"), ...["P1","A1","D1"].map(k=>res(u.x[k])), u.x.invalid ? "—" : ref("R1"),
      ...["P2","A2","D2"].map(k=>res(u.x[k])), u.x.invalid ? "—" : ref("R2"), u.x.invalid ? "—" : ref("Ro"),
      u.x.invalid ? "—" : rtl ? FRAME.roAdvice(u.x.Ro) : RO_EN[roIdx(u.x.Ro)], u.x.invalid ? "—" : LV[lang][lvOf(Math.max(...["R","R1","R2"].map(k=>u.x[k])))],
      ...(hasV ? (u.v && !u.v.x.invalid ? [...["R","R1","R2"].map(k=>u.out[k+"v"] ? {formula:`'${u.sheet}'!${u.out[k+"v"]}`, result:res(u.v.x[k])} : res(u.v.x[k])), LV[lang][lvOf(Math.max(u.v.x.R, u.v.x.R1, u.v.x.R2))]] : ["—","—","—","—"]) : [])];
    vals.forEach((v,i)=>{ const c = put(ws, `${L(i)}${r}`, v, {fmt: i>=5 && i<=17 ? (["R","R1","R2","Ro"].includes(cols[i]) ? "0.00" : "0.000") : i===3||i===4 ? "0" : undefined, ...(i===0 && u.kind==="comp" ? {font:{bold:true}} : {})});
      if (!u.x.invalid && [8,12,16].includes(i)) lvCell(c, u.x[["R","R1","R2"][[8,12,16].indexOf(i)]]);
      if (hasV && u.v && !u.v.x.invalid && i>=20 && i<=22) lvCell(c, u.v.x[["R","R1","R2"][i-20]]);
      if (i===19 && !u.x.invalid) lvCell(c, Math.max(u.x.R, u.x.R1, u.x.R2));
      if (hasV && i===23 && u.v && !u.v.x.invalid) lvCell(c, Math.max(u.v.x.R, u.v.x.R1, u.v.x.R2)); });
  });
  r++; const lastRow = r - 1;
  put(ws, `A${r}`, T2(lang, "ریسک تعیین‌کننده (بدترین فضا)", "Governing risk (worst space)"), {font:{bold:true}, fill:"FFEAEFF4"});
  const valid = M.units.filter(u=>!u.x.invalid);
  [[8,"R"],[12,"R1"],[16,"R2"],[17,"Ro"]].forEach(([i,k])=>{ const w = Math.max(...valid.map(u=>u.x[k]));
    const c = put(ws, `${L(i)}${r}`, isFinite(w) ? {formula:`MAX(${L(i)}${first}:${L(i)}${lastRow})`, result:w} : "∞", {fmt:"0.00", fill:"FFEAEFF4"}); if (k!=="Ro") lvCell(c, w); });
  if (hasV) [[20,"R"],[21,"R1"],[22,"R2"]].forEach(([i,k])=>{ const vs = M.units.filter(u=>u.v && !u.v.x.invalid).map(u=>u.v.x[k]); if (!vs.length) return; const w = Math.max(...vs);
    const c = put(ws, `${L(i)}${r}`, isFinite(w) ? {formula:`MAX(${L(i)}${first}:${L(i)}${lastRow})`, result:w} : "∞", {fmt:"0.00", fill:"FFEAEFF4"}); lvCell(c, w); });
  r += 2;
  put(ws, `A${r}`, T2(lang, "راهنمای Ro (ریسک اولیه)", "Info on Ro (initial risk)"), {font:{bold:true}, border:false});
  [[0,"0"],[1,"1.0"],[1.6,"1.6"],[2.7,"2.7"],[4.5,"4.5"]].forEach(([v,t],i)=>{ put(ws, `A${r+1+i}`, `Ro ≥ ${rtl ? fa(v,1) : t}`); put(ws, `B${r+1+i}`, rtl ? FRAME.roAdvice(v) : RO_EN[i]); ws.mergeCells(`B${r+1+i}:H${r+1+i}`); });
  r += 8;
  put(ws, `A${r}`, T2(lang, "شماتیک و نمودارها", "Schematic and charts"), {font:{bold:true, size:12}, border:false}); r++;
  r += addImg(ws, C.sch, r, 0, 760); r += addImg(ws, C.bars, r, 0, 760); r += addImg(ws, C.ro, r, 0, 760);

  /* comparison sheet: every floor separate vs linked floors */
  if (wcmp){ const [l1, l2] = scLabels(SC, lang), real = SC.cur==="all" ? 0 : 1;
    wcmp.columns = [{width:42},{width:11},{width:11},{width:11},{width:11},{width:11},{width:11},{width:34}];
    put(wcmp, "A1", T2(lang, "مقایسهٔ دو حالت: طبقه‌های جدا یا متصل", "Two cases: separate floors or linked floors"), {font:{bold:true, size:14}, border:false});
    wcmp.mergeCells("A2:H2"); put(wcmp, "A2", T2(lang, `اگر رایزر، شافت یا پله‌ای که آتش‌بند و محصور نیست طبقه‌ها را به هم وصل کند، آن طبقه‌ها یک واحد حریق‌اند. حالت معتبر: «${[l1,l2][real]}» (مطابق پاسخ ارزیابی). «∞» یعنی ریسک قابل‌قبول (A) تمام شده است.`,
      `Floors linked by a riser, shaft or stair that is not fire-stopped or enclosed form one compartment. Valid case: "${[l1,l2][real]}" (according to the assessment). "∞" means the acceptable risk (A) is used up.`), {border:false}); wcmp.getRow(2).height = 44;
    let q = 4;
    put(wcmp, `A${q}`, T2(lang,"بدترین ریسک ساختمان","Governing building risk"), {font:{bold:true, color:{argb:"FFFFFFFF"}}, fill:"FF34495E"});
    put(wcmp, `B${q}`, l1, {font:{bold:true, color:{argb:"FFFFFFFF"}}, fill:"FF34495E", al:{horizontal:"center"}}); wcmp.mergeCells(`B${q}:D${q}`);
    put(wcmp, `E${q}`, l2, {font:{bold:true, color:{argb:"FFFFFFFF"}}, fill:"FF34495E", al:{horizontal:"center"}}); wcmp.mergeCells(`E${q}:G${q}`); wcmp.getRow(q).height = 30;
    [["R",FACT.R],["R1",FACT.R1],["R2",FACT.R2],["Ro",FACT.Ro]].forEach(([k,f])=>{ q++;
      put(wcmp, `A${q}`, `${f[rtl?0:1]} (${k})`, {font:{bold:true}});
      const a = put(wcmp, `B${q}`, res(SC.sep.w[k]), {fmt:"0.00", al:{horizontal:"center"}}); wcmp.mergeCells(`B${q}:D${q}`);
      const b = put(wcmp, `E${q}`, res(SC.link.w[k]), {fmt:"0.00", al:{horizontal:"center"}}); wcmp.mergeCells(`E${q}:G${q}`);
      if (k!=="Ro"){ lvCell(a, SC.sep.w[k]); lvCell(b, SC.link.w[k]); } });
    q += 2;
    [T2(lang,"فضا","Space"), ...["R","R1","R2"].map(k=>`${k} – ${T2(lang,"جدا","separate")}`), ...["R","R1","R2"].map(k=>`${k} – ${T2(lang,"متصل","linked")}`), T2(lang,"واحد حریق در حالت متصل","Compartment in the linked case")]
      .forEach((t,i)=>put(wcmp, `${L(i)}${q}`, t, {font:{bold:true, color:{argb:"FFFFFFFF"}}, fill:"FF34495E", al:{horizontal:"center"}}));
    SC.sep.rows.slice().sort((a,b)=>(+a.d.E||0)-(+b.d.E||0)).forEach(r=>{ q++; const i = SC.sep.rows.indexOf(r), g = SC.link.exp[i], x2 = g ? g.x : SC.link.rows[i].x;
      put(wcmp, `A${q}`, spaceName(r, lang));
      ["R","R1","R2"].forEach((k,j)=>{ lvCell(put(wcmp, `${L(1+j)}${q}`, res(r.x[k]), {fmt:"0.00", al:{horizontal:"center"}}), r.x[k]); lvCell(put(wcmp, `${L(4+j)}${q}`, res(x2[k]), {fmt:"0.00", al:{horizontal:"center"}}), x2[k]); });
      put(wcmp, `H${q}`, g ? spaceName(g, lang) : T2(lang,"جدا","separate")); });
    q += 2; addImg(wcmp, chCompare(SC, lang, scLabels(SC, lang)), q, 0, 720);
  }

  /* measures sheet: the package and the risk after each cumulative step (like tables 7–10 of a FRAME report) */
  wm.columns = [{width:40},{width:44},{width:40},{width:16},{width:26}, ...Array.from({length:Math.max(0, M.steps.length - 4)}, ()=>({width:10}))];
  put(wm, "A1", T2(lang, "اقدامات اصلاحی پیشنهادی (بستهٔ پیشنهادی)", "Recommended corrective measures (package)"), {font:{bold:true, size:14}, border:false});
  put(wm, "A2", T2(lang, "هر قدم اقدامی است که بیشترین کاهش ریسکِ بالای ۱ را نسبت به هزینه‌اش دارد. برچسب‌های هزینه تقریبی‌اند.", "Each step is the measure with the largest reduction of risk above 1 per unit of cost. Cost classes are indicative."), {border:false, font:{italic:true}});
  let q = 4;
  if (!M.steps.length){ put(wm, `A${q}`, valid.every(u=>["R","R1","R2"].every(k=>u.x[k]<=1)) ? T2(lang,"همهٔ ریسک‌ها قابل‌قبول است؛ بستهٔ اصلاحی لازم نیست.","All risks are acceptable; no corrective package is needed.") : T2(lang,"با اقدام‌های چک‌لیست بهبودی پیدا نشد.","No improving measure was found in the checklist."), {border:false}); }
  else {
    [T2(lang,"شمارهٔ اقدام","No."), T2(lang,"اقدام","Measure"), T2(lang,"جزئیات","Detail"), T2(lang,"هزینه","Cost"), T2(lang,"محل اجرا","Applies to")].forEach((t,i)=>put(wm, `${"ABCDE"[i]}${q}`, t, {font:{bold:true, color:{argb:"FFFFFFFF"}}, fill:"FF34495E"}));
    M.steps.forEach((st,i)=>{ q++; const mt = measureText(st, lang);
      put(wm, `A${q}`, rtl ? fa(i+1,0) : i+1, {al:{horizontal:"center"}}); put(wm, `B${q}`, mt.t); put(wm, `C${q}`, mt.o);
      put(wm, `D${q}`, costText(st.cost, lang), {fill:["","FFDFF3E6","FFFBF0CF","FFFBE1DF"][st.cost]});
      put(wm, `E${q}`, st.scope==="b" ? T2(lang,"کل ساختمان","Whole building") : spaceName(M.rows.find(r=>r.fl===st.fl) || {name:"", d:st.fl.data, fl:st.fl}, lang)); });
    q += 2;
    const K = M.steps.length;
    [["R","ریسک ساختمان و دارایی (R)","Risk for the property (R)"],["R1","ریسک افراد (R1)","Risk for the occupants (R1)"],["R2","ریسک فعالیت (R2)","Risk for the activities (R2)"],["Ro","ریسک اولیه (Ro)","Initial risk (Ro)"]].forEach(([k,tf,te])=>{
      put(wm, `A${q}`, T2(lang, `${tf} در هر فضا – قبل و بعد از اقدام‌های اصلاحی تجمعی`, `${te} per space – before and after the cumulative corrective measures`), {font:{bold:true}, border:false}); q++;
      const hdr = [T2(lang,"فضا","Space"), ...Array.from({length:K+1}, (_,j)=>stepCode(j, lang))];
      hdr.forEach((t,i)=>put(wm, `${L(i)}${q}`, t, {font:{bold:true, color:{argb:"FFFFFFFF"}}, fill:"FF34495E", al:{horizontal:"center"}}));
      M.units.forEach(u=>{ q++; put(wm, `A${q}`, spaceName(u.r, lang));
        for (let j=0; j<=K; j++){ const x = u.at(j), c = put(wm, `${L(j+1)}${q}`, !x ? T2(lang,"جدا شد","separated") : x.invalid ? "—" : res(x[k]), {fmt:"0.00", al:{horizontal:"center"}}); if (x && !x.invalid && k!=="Ro") lvCell(c, x[k]); } });
      q += 2; });
    put(wm, `A${q}`, T2(lang, "ستون «۱-۳» یعنی اجرای اقدام‌های ۱ تا ۳ با هم. رنگ سبز: قابل‌قبول (≤ ۰٫۸)، زرد: مرزی، قرمز: غیرقابل‌قبول (> ۱).", "Column \"1-3\" means measures 1 to 3 together. Green: acceptable (≤ 0.8), yellow: borderline, red: not acceptable (> 1)."), {border:false, font:{italic:true}});
    q += 2;
    C.steps.forEach(s=>{ q += addImg(wm, s.c, q, 0, 640); });
  }
  wb.worksheets.forEach(w=>{ w.pageSetup = {paperSize:9, orientation:"landscape", fitToPage:true, fitToWidth:1, fitToHeight:0, margins:{left:0.4, right:0.4, top:0.5, bottom:0.5, header:0.3, footer:0.3}}; });
  const buf = await wb.xlsx.writeBuffer();
  return new Blob([buf], {type:"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"});
}

/* ---------- Word report ---------- */
async function word(lang){
  const D = window.docx, M = model(), C = charts(M, lang), rtl = lang==="fa", FONT = rtl ? "Tahoma" : "Calibri";
  const t = (f, e) => T2(lang, f, e), n0 = v => num(v, lang, 0), n2 = v => num(v, lang, 2);
  const run = (txt, o={}) => new D.TextRun({text:String(txt), font:{ascii:FONT, hAnsi:FONT, cs:FONT, eastAsia:FONT}, size:o.size||21, sizeComplexScript:o.size||21,
    bold:!!o.b, boldComplexScript:!!o.b, italics:!!o.i, italicsComplexScript:!!o.i, color:o.color, rightToLeft:rtl});
  const para = (txt, o={}) => new D.Paragraph({bidirectional:rtl, alignment:o.align, heading:o.h, keepNext:!!o.keepNext, pageBreakBefore:!!o.pb,
    spacing:{before:o.before ?? 0, after:o.after ?? 120, ...(o.line===0 ? {} : {line:o.line || 300})}, indent:o.indent,
    children:Array.isArray(txt) ? txt : [run(txt, o)]});
  const body = txt => para(txt, {align:D.AlignmentType.JUSTIFIED});
  const H = (txt, lvl=1) => para(txt, {h:lvl===1 ? D.HeadingLevel.HEADING_1 : D.HeadingLevel.HEADING_2, size:lvl===1 ? 30 : 25, b:true, color:lvl===1 ? "B4461E" : "34495E", before:lvl===1 ? 240 : 160, after:100, keepNext:true});
  const bullet = txt => para([run("•  ", {b:true}), ...(Array.isArray(txt) ? txt : [run(txt)])], {indent:rtl ? {right:280} : {left:280}, after:60});
  let fig = 0, tab = 0;
  const caption = (kind, txt) => para(`${kind==="fig" ? t("شکل","Figure") : t("جدول","Table")} ${kind==="fig" ? n0(++fig) : n0(++tab)} – ${txt}`, {align:D.AlignmentType.CENTER, size:18, i:true, color:"555F6B", after:200});
  const image = (canvas, width=600) => para([new D.ImageRun({data:pngBytes(canvas), transformation:{width, height:Math.round(width*canvas.height/canvas.width)}})], {align:D.AlignmentType.CENTER, after:60, keepNext:true, line:0});
  const cell = (txt, o={}) => new D.TableCell({children:[para(txt, {size:o.size||17, b:o.b, color:o.color, align:o.align || D.AlignmentType.CENTER, after:0, line:240})],
    shading:o.fill ? {fill:o.fill, type:D.ShadingType.CLEAR, color:"auto"} : undefined, verticalAlign:D.VerticalAlign.CENTER, columnSpan:o.span,
    margins:{top:40, bottom:40, left:60, right:60}});
  const hcell = txt => cell(txt, {b:true, fill:"34495E", color:"FFFFFF"});
  const lvFill = {ok:"DFF3E6", warn:"FBF0CF", bad:"FBE1DF"}, lvInk = {ok:"1E7A44", warn:"8A6200", bad:"B3261E"};
  const rcell = (v, o={}) => v==null ? cell(t("جدا شد","separated"), {size:15, color:"66727F"}) : Number.isNaN(v) ? cell("—") : cell(n2(v), {b:true, fill:lvFill[lvOf(v)], color:lvInk[lvOf(v)], ...o});
  const table = (rows, o={}) => new D.Table({rows:rows.map((r,i)=>new D.TableRow({tableHeader:i===0 && !o.noHeader, cantSplit:true, children:r})),
    width:{size:100, type:D.WidthType.PERCENTAGE}, visuallyRightToLeft:rtl, layout:D.TableLayoutType.AUTOFIT});
  const gap = () => para("", {after:80});
  const valid = M.units.filter(u=>!u.x.invalid), worst = k => valid.reduce((w,u)=>!w || u.x[k] > w.x[k] ? u : w, null);
  const bad = valid.filter(u=>["R","R1","R2"].some(k=>u.x[k] > 1));
  const nm = u => spaceName(u.r, lang), project = M.b.project || t("ساختمان","the building");
  const pkOk = M.pk ? M.pk.ok : true, K = M.steps.length;
  const children = [];
  const add = (...xs) => children.push(...xs);

  /* title page */
  add(para("", {after:1800}),
    para(t("گزارش ارزیابی ریسک حریق","Fire Risk Assessment Report"), {align:D.AlignmentType.CENTER, size:44, b:true, color:"B4461E", after:200}),
    para(t("به روش FRAME 2015","FRAME 2015 method"), {align:D.AlignmentType.CENTER, size:30, color:"34495E", after:800}),
    para(project, {align:D.AlignmentType.CENTER, size:32, b:true, after:400}),
    para(`${t("تعداد فضاهای ارزیابی‌شده","Spaces assessed")}: ${n0(M.rows.length)}`, {align:D.AlignmentType.CENTER, after:100}),
    para(`${t("ارزیاب","Assessor")}: ${M.b.assessor || "—"}`, {align:D.AlignmentType.CENTER, after:100}),
    para(`${t("تاریخ","Date")}: ${M.b.date || "—"}`, {align:D.AlignmentType.CENTER, after:100}));

  /* 1 summary */
  const wR = worst("R"), wR1 = worst("R1"), wR2 = worst("R2");
  add(H(t("۱. چکیده","1. Summary")) , gap());
  children[children.length-2] = para(t("۱. چکیده","1. Summary"), {h:D.HeadingLevel.HEADING_1, size:30, b:true, color:"B4461E", after:100, pb:true});
  add(body(t(`در این گزارش ریسک حریق ${project} در ${n0(M.rows.length)} فضا به روش FRAME 2015 ارزیابی شده است. روش FRAME برای هر فضا سه ریسک را جداگانه می‌سنجد: ریسک ساختمان و دارایی (R)، ریسک افراد (R1) و ریسک فعالیت (R2). مقدار ۱ یا کمتر یعنی حفاظت موجود برای ریسک بالقوه کافی است.`,
    `This report assesses the fire risk of ${project} in ${M.rows.length} spaces with the FRAME 2015 method. FRAME calculates three risks for every space: the risk for the property (R), for the occupants (R1) and for the activities (R2). A value of 1 or less means that the protection is sufficient for the potential risk.`)));
  if (wR) add(body(t(`بدترین مقدارها: ریسک ساختمان ${n2(wR.x.R)} در «${nm(wR)}»، ریسک افراد ${n2(wR1.x.R1)} در «${nm(wR1)}» و ریسک فعالیت ${n2(wR2.x.R2)} در «${nm(wR2)}».`,
    `Governing values: property risk ${n2(wR.x.R)} in "${nm(wR)}", occupant risk ${n2(wR1.x.R1)} in "${nm(wR1)}" and activity risk ${n2(wR2.x.R2)} in "${nm(wR2)}".`)));
  add(body(bad.length ? t(`${n0(bad.length)} فضا یا واحد حریق دست‌کم در یک ریسک از حد مجاز بیشتر است: ${bad.map(nm).join("، ")}. ساختمان در وضعیت فعلی قابل‌قبول نیست.`,
      `${bad.length} space(s) exceed the limit in at least one risk: ${bad.map(nm).join(", ")}. The building is not acceptable in its current state.`)
    : t("همهٔ فضاها در هر سه ریسک قابل‌قبول‌اند.","All spaces are acceptable for the three risks.")));
  if (K) add(body(t(`بستهٔ اصلاحی پیشنهادی ${n0(K)} اقدام دارد و ${pkOk ? "پس از اجرای آن همهٔ فضاها در هر سه ریسک قابل‌قبول می‌شوند" : "حتی پس از اجرای آن برخی فضاها بالای حد مجاز می‌مانند و تغییر بزرگ‌تری لازم است"} (فصل ۵).`,
    `The recommended package contains ${K} measures; ${pkOk ? "after it all spaces are acceptable for the three risks" : "even after it some spaces remain above the limit and larger changes are needed"} (chapter 5).`)));
  if (M.crows.length) add(body(t(`برخی طبقه‌ها از نظر آتش از هم جدا نیستند (رایزر، شافت یا پلهٔ باز). این طبقه‌ها یک بار جدا و یک بار به‌عنوان یک واحد حریق ترکیبی ارزیابی شده‌اند و بدترین نتیجه ملاک است.`,
    `Some floors are not fire-separated (open riser, shaft or stair). They were assessed separately and as one combined compartment; the worst result governs.`)));

  /* 2 introduction */
  add(H(t("۲. مقدمه","2. Introduction")),
    body(t("آتش‌سوزی یکی از جدی‌ترین تهدیدها برای جان افراد، دارایی‌ها و ادامهٔ کار سازمان‌هاست. ارزیابی ریسک حریق به روش‌های کمی و نظام‌مند کمک می‌کند نقاط ضعف ایمنی ساختمان شناسایی شود و اقدام‌های اصلاحی بر پایهٔ اثر و هزینه اولویت‌بندی شوند.",
      "Fire is one of the most serious threats to people, property and business continuity. A quantitative, systematic fire risk assessment identifies the weak points of a building and helps to prioritise corrective measures by their effect and cost.")),
    body(t("روش FRAME (Fire Risk Assessment Method for Engineering) یک روش نیمه‌کمی است که برای ساختمان‌های بزرگ و پیچیده مناسب است و نتیجهٔ آن برای هر فضا سه عدد بی‌بعد است. این گزارش با ابزار ارزیاب ریسک حریق FRAME و مطابق فرمول‌های صفحه‌گستردهٔ رسمی FRAME 2015 تهیه شده است.",
      "FRAME (Fire Risk Assessment Method for Engineering) is a semi-quantitative method suited to large and complex buildings; its result for each space is three dimensionless numbers. This report was produced with the FRAME fire risk tool, following the formulas of the official FRAME 2015 spreadsheet.")));

  /* 3 method */
  add(H(t("۳. روش کار","3. Method")),
    body(t("در روش FRAME ریسک حریق از نسبت ریسک بالقوه (P) به حاصل‌ضرب ریسک قابل‌قبول (A) و سطح حفاظت (D) به دست می‌آید. اگر R ≤ ۱ باشد حفاظت موجود کافی است و اگر R > ۱ باشد ریسک غیرقابل‌قبول است و به اقدام اصلاحی نیاز دارد. این محاسبه برای ساختمان و دارایی، افراد و فعالیت جداگانه انجام می‌شود.",
      "In FRAME the fire risk is the ratio of the potential risk (P) to the product of the acceptable risk (A) and the protection level (D). R ≤ 1 means the protection is sufficient; R > 1 means the risk is not acceptable and corrective measures are needed. The calculation is made separately for the property, the occupants and the activities.")));
  const eq = [["R = P / (A · D)", t("ریسک ساختمان و دارایی","Risk for the property")], ["R1 = P1 / (A1 · D1)", t("ریسک افراد","Risk for the occupants")], ["R2 = P2 / (A2 · D2)", t("ریسک فعالیت","Risk for the activities")],
    ["P = q · i · g · e · v · z", t("ریسک بالقوه: بار حریق، گسترش، مساحت، طبقه، تهویه، دسترسی","Potential risk: fire load, spread, area, level, venting, access")],
    ["P1 = q · i · e · v · z ;  P2 = i · g · e · v · z", t("ریسک بالقوه برای افراد و فعالیت","Potential risk for occupants and activities")],
    ["A = 1.6 − a − t − c", t("ریسک قابل‌قبول: علت‌های آتش، زمان تخلیه، ارزش","Acceptable risk: activation, evacuation time, value")],
    ["A1 = 1.6 − a − t − r ;  A2 = 1.6 − a − c − d", t("ریسک قابل‌قبول برای افراد و فعالیت","Acceptable risk for occupants and activities")],
    ["D = W · N · S · F", t("سطح حفاظت: آب، حفاظت معمولی، حفاظت ویژه، مقاومت سازه","Protection level: water, normal and special protection, fire resistance")],
    ["D1 = N · U ;  D2 = W · N · S · Y", t("سطح حفاظت برای افراد و فعالیت","Protection level for occupants and activities")],
    ["Ro = P / (A · Fo)", t("ریسک اولیه (فقط با استحکام سازه)","Initial risk (structure only)")]];
  add(table([[hcell(t("رابطه","Equation")), hcell(t("مفهوم","Meaning"))], ...eq.map(([e,m])=>[cell(e, {size:17}), cell(m, {size:17})])]), caption("tab", t("رابطه‌های اصلی روش FRAME","Main FRAME equations")));
  add(H(t("۳-۱. سامانهٔ حفاظت پیشنهادی بر پایهٔ ریسک اولیه Ro","3.1 Protection concept based on the initial risk Ro"), 2),
    body(t("ریسک اولیه Ro ریسک ساختمان را فقط با استحکام سازه و بدون تجهیزات نشان می‌دهد و راهنمای انتخاب سامانهٔ حفاظت است:","The initial risk Ro is the property risk with the structure only, without equipment; it guides the choice of the protection system:")),
    table([[hcell("Ro"), hcell(t("سامانهٔ حفاظت پیشنهادی","Suggested protection"))], ...[["< 1.0",0],["1.0 – 1.6",1],["1.6 – 2.7",2],["2.7 – 4.5",3],["> 4.5",4]].map(([r,i])=>[cell(r), cell(rtl ? FRAME.roAdvice([0,1,1.6,2.7,4.5][i]) : RO_EN[i])])]),
    caption("tab", t("راهنمای انتخاب سامانهٔ حفاظت بر پایهٔ Ro","Protection concept based on Ro")));
  add(H(t("۳-۲. جمع‌بندی ساختمان، طبقه‌های متصل و خطرهای بیرونی","3.2 Building summary, linked floors and external hazards"), 2),
    body(t("هر فضا جداگانه ارزیابی شده و ریسک ساختمان برای هر نوع ریسک با بدترین فضا تعیین می‌شود؛ ریسک‌ها جمع یا میانگین گرفته نمی‌شوند. طبقه‌هایی که از نظر آتش از هم جدا نیستند (رایزر آتش‌بند‌نشده، شافت یا پلهٔ باز) یک بار هم به‌عنوان یک واحد حریق ترکیبی ارزیابی می‌شوند: مساحت، افراد، عرض خروج و ارزش جمع و برای بقیهٔ موارد بدترین پاسخ طبقه‌ها به کار می‌رود.",
      "Every space is assessed separately and the building is governed, for each risk, by the worst space; risks are not added or averaged. Floors that are not fire-separated (unsealed riser, open shaft or stair) are also assessed as one combined compartment: areas, occupants, exit widths and values are added and the worst answer of the floors is used for the other inputs.")),
    body(t("روش FRAME خطرهای بیرونی (مثل مخزن سوخت یا پست برق چسبیده به ساختمان) را مستقیم ندارد. در این ارزیابی برای فضاهای مجاور خطر بیرونیِ بدون جداسازی، محتاطانه ۰٫۲ به ضریب علت‌های آتش (a) افزوده و مقاومت نمای رو به خطر صفر در نظر گرفته شده است.",
      "FRAME has no direct factor for external hazards (e.g. a fuel tank or substation next to the building). For spaces facing an unseparated external hazard this assessment conservatively adds 0.2 to the activation factor (a) and takes no fire resistance for the facade towards it.")));
  add(H(t("۳-۳. اقدام‌های اصلاحی و رنگ‌بندی","3.3 Corrective measures and colour code"), 2),
    body(t("اقدام‌های اصلاحی از گزینه‌های عملی چک‌لیست انتخاب می‌شوند. هر اقدام یک برچسب هزینهٔ تقریبی دارد (کم‌هزینه: کار مدیریتی یا تجهیز ساده؛ متوسط: نصب تجهیزات؛ پرهزینه: تغییر ساختمان یا تأسیسات بزرگ). بستهٔ پیشنهادی گام‌به‌گام اقدامی را برمی‌دارد که بیشترین کاهش ریسکِ بالای ۱ را نسبت به هزینه‌اش دارد، تا همهٔ ریسک‌ها به ۱ یا کمتر برسند.",
      "Corrective measures are taken from the practical options of the checklist. Every measure has an indicative cost class (low: management or simple equipment; medium: installed equipment; high: building works or major installations). The recommended package adds, step by step, the measure with the largest reduction of risk above 1 per unit of cost until all risks are 1 or less.")),
    table([[hcell(t("رنگ","Colour")), hcell(t("مفهوم","Meaning"))], [cell(t("سبز","Green"), {fill:lvFill.ok, color:lvInk.ok, b:true}), cell(t("قابل‌قبول (R ≤ ۰٫۸)","Acceptable (R ≤ 0.8)"))],
      [cell(t("زرد","Yellow"), {fill:lvFill.warn, color:lvInk.warn, b:true}), cell(t("مرزی؛ فرصت بهبود (۰٫۸ < R ≤ ۱)","Borderline; room for improvement (0.8 < R ≤ 1)"))],
      [cell(t("قرمز","Red"), {fill:lvFill.bad, color:lvInk.bad, b:true}), cell(t("غیرقابل‌قبول (R > ۱)","Not acceptable (R > 1)"))]]),
    caption("tab", t("رنگ‌بندی سطح ریسک","Colour code of the risk level")));

  /* 4 building data */
  add(H(t("۴. مشخصات ساختمان","4. Building data")),
    body(t(`ساختمان ${project} با ${n0(M.rows.length)} فضای ارزیابی‌شده و مساحت کل ${n0(M.rows.reduce((s,r)=>s+(+r.d.area||0),0))} متر مربع بررسی شده است. پاسخ‌های مشترک ساختمان:`,
      `${project} was assessed in ${M.rows.length} spaces with a total area of ${M.rows.reduce((s,r)=>s+(+r.d.area||0),0).toFixed(0)} m². Shared answers for the building:`)));
  ["access","Z","Qi","fs","fo","fc","vsep","extH","w1","dia","bar","sAD","sTrans","s6","s5","n1a","n4","s8","uSt","uSign","pPlan","n5","yFin"].forEach(k=>{ const f = FIELD[k]; if (!f || !shown(f, M.b)) return;
    add(bullet([run(`${fLabel(f, lang)}: `, {b:true}), run(optText(f, M.b[k], lang))])); });
  const td = [["use",t("کاربری","Use")],["area",t("مساحت","Area")],["h",t("ارتفاع","Height")],["X",t("افراد","Occupants")],["Wex",t("عرض خروج","Exit width")],["O",t("خروج به بیرون","Exits out")],["Qm",t("بار حریق","Fire load")],["sAD",t("کشف خودکار","Detection")],["s6",t("اسپرینکلر","Sprinklers")]];
  add(gap(), table([[hcell(t("فضا","Space")), ...td.map(([,h])=>hcell(h))], ...M.rows.map(r=>[cell(spaceName(r, lang), {size:15}), ...td.map(([k])=>{ const f = FIELD[k]; return cell(f.t==="num" ? n0(+r.d[k]) + (k==="Wex" ? "" : "") : optText(f, r.d[k], lang), {size:15}); })])]),
    caption("tab", t("مشخصات فنی فضاها (مساحت m²، ارتفاع m، عرض خروج m، بار حریق MJ/m²)","Technical data of the spaces (area m², height m, exit width m, fire load MJ/m²)")));

  /* 5 results */
  add(H(t("۵. نتایج ارزیابی","5. Results")),
    body(t("شکل زیر شماتیک ساختمان را با ریسک هر فضا نشان می‌دهد؛ طبقه‌ها از پایین به بالا چیده شده‌اند و خط قهوه‌ای تراز زمین است.","The schematic below shows the building with the risk of every space; floors are stacked bottom-up and the brown line is ground level.")),
    image(C.sch), caption("fig", t("شماتیک ساختمان و ریسک هر فضا","Building schematic and risk per space")));
  add(table([[hcell(t("فضا","Space")), hcell("R"), hcell("R1"), hcell("R2"), hcell("Ro"), hcell(t("سامانهٔ حفاظت پیشنهادی (Ro)","Protection concept (Ro)"))],
    ...M.units.map(u=>[cell(nm(u), {size:16, b:u.kind==="comp"}), ...["R","R1","R2"].map(k=>u.x.invalid ? cell("—") : rcell(u.x[k])), cell(u.x.invalid ? "—" : n2(u.x.Ro)),
      cell(u.x.invalid ? "—" : rtl ? FRAME.roAdvice(u.x.Ro) : RO_EN[roIdx(u.x.Ro)], {size:15})])]), caption("tab", t("نتیجهٔ ارزیابی هر فضا (وضع موجود)","Result per space (current status)")));
  add(image(C.bars), caption("fig", t("ریسک‌های R، R1 و R2 در هر فضا","Risks R, R1 and R2 per space")), image(C.ro), caption("fig", t("ریسک اولیه Ro و سامانهٔ حفاظت پیشنهادی","Initial risk Ro and suggested protection")));
  const SC = scenarios();
  if (SC){ const [l1, l2] = scLabels(SC, lang), real = SC.cur==="all" ? 0 : 1;
    add(H(t("۵-۱. مقایسهٔ دو حالت: طبقه‌های جدا یا متصل","5.1 Two cases: separate or linked floors"), 2),
      body(t(`روش FRAME هر واحد حریق را جدا حساب می‌کند. اگر رایزر، شافت یا پله‌ای که آتش‌بند و محصور نیست طبقه‌ها را به هم وصل کند، آن طبقه‌ها یک واحد حریق‌اند. جدول و نمودار زیر بدترین ریسک ساختمان را در دو حالت «${l1}» و «${l2}» نشان می‌دهند. حالت معتبر برای این ساختمان «${[l1,l2][real]}» است.`,
        `FRAME calculates every fire compartment separately. Floors linked by a riser, shaft or stair that is not fire-stopped or enclosed form one compartment. The table and chart below show the governing building risk in the two cases "${l1}" and "${l2}". The valid case for this building is "${[l1,l2][real]}".`)),
      table([[hcell(t("ریسک","Risk")), hcell(l1), hcell(l2)], ...[["R",FACT.R],["R1",FACT.R1],["R2",FACT.R2],["Ro",FACT.Ro]].map(([k,f])=>[cell(`${f[rtl?0:1]} (${k})`, {size:16}),
        k==="Ro" ? cell(n2(SC.sep.w[k])) : rcell(SC.sep.w[k]), k==="Ro" ? cell(n2(SC.link.w[k])) : rcell(SC.link.w[k])])]),
      caption("tab", t("بدترین ریسک ساختمان در دو حالت","Governing building risk in the two cases")),
      image(chCompare(SC, lang, scLabels(SC, lang)), 560), caption("fig", t("مقایسهٔ دو حالت","The two cases compared")),
      table([[hcell(t("فضا","Space")), ...["R","R1","R2"].map(k=>hcell(`${k} ${t("جدا","sep.")}`)), ...["R","R1","R2"].map(k=>hcell(`${k} ${t("متصل","linked")}`))],
        ...SC.sep.rows.slice().sort((a,b)=>(+a.d.E||0)-(+b.d.E||0)).map(r=>{ const i = SC.sep.rows.indexOf(r), g = SC.link.exp[i], x2 = g ? g.x : SC.link.rows[i].x;
          return [cell(spaceName(r, lang), {size:15}), ...["R","R1","R2"].map(k=>rcell(r.x[k], {size:15})), ...["R","R1","R2"].map(k=>rcell(x2[k], {size:15}))]; })]),
      caption("tab", t("ریسک هر فضا در دو حالت (در حالت متصل: ریسک واحد حریقی که فضا جزو آن است)","Risk per space in the two cases (linked case: the risk of the compartment the space belongs to)")),
      body(t("«∞» یعنی ریسک قابل‌قبول (A) تمام شده است، معمولاً به‌خاطر زمان تخلیهٔ طولانیِ یک واحد حریق بسیار بزرگ، و با هیچ تجهیزاتی جبران نمی‌شود؛ تنها راه، جدا کردن طبقه‌ها از نظر آتش است.",
        "\"∞\" means the acceptable risk (A) is used up, usually because of the long evacuation time of a very large compartment; no equipment can make up for it — the floors have to be fire-separated.")));
  }

  /* 6 corrective measures */
  add(H(t("۶. اقدام‌های اصلاحی پیشنهادی","6. Recommended corrective measures")));
  if (!K) add(body(bad.length ? t("با اقدام‌های چک‌لیست بهبودی پیدا نشد؛ تغییر بزرگ‌تری (کم کردن افراد، تقسیم فضا، تغییر کاربری یا طراحی دوباره) لازم است.","No improving measure was found in the checklist; larger changes (fewer occupants, subdivision, change of use or redesign) are needed.")
    : t("همهٔ ریسک‌ها قابل‌قبول است و بستهٔ اصلاحی لازم نیست. حفظ وضعیت و تکرار ارزیابی پس از هر تغییر توصیه می‌شود.","All risks are acceptable and no corrective package is needed. Keep the current state and repeat the assessment after any change.")));
  else {
    add(body(t(`بستهٔ پیشنهادی شامل ${n0(K)} اقدام به ترتیب اولویت است:`, `The recommended package contains ${K} measures in order of priority:`)));
    M.steps.forEach((s,i)=>{ const mt = measureText(s, lang), where = s.scope==="b" ? t("کل ساختمان","whole building") : spaceName(M.rows.find(r=>r.fl===s.fl), lang);
      add(para([run(`${t("اقدام اصلاحی شمارهٔ","Corrective measure")} ${n0(i+1)}: `, {b:true}), run(`${mt.t}: ${mt.o}`), run(`  (${costText(s.cost, lang)} – ${where})`, {color:"66727F"})], {after:80})); });
    [1,2,3].forEach(c=>{ const ids = M.steps.map((s,i)=>s.cost===c ? n0(i+1) : null).filter(Boolean); if (ids.length) add(bullet(t(`اقدام‌های شمارهٔ ${ids.join("، ")}: ${COST[c]}`, `Measures ${ids.join(", ")}: ${COST_EN[c].toLowerCase()}`))); });
    add(body(pkOk ? t("پس از اجرای همهٔ این اقدام‌ها، همهٔ فضاها در هر سه ریسک به ۱ یا کمتر می‌رسند.","After all these measures every space is at 1 or less for the three risks.")
      : t("حتی پس از اجرای این اقدام‌ها برخی فضاها بالای ۱ می‌مانند؛ تغییر بزرگ‌تری لازم است.","Even after these measures some spaces remain above 1; larger changes are needed.")));
    const stepTable = (k, title) => { add(table([[hcell(t("فضا","Space")), ...Array.from({length:K+1}, (_,j)=>hcell(stepCode(j, lang)))],
      ...M.units.map(u=>[cell(nm(u), {size:15, b:u.kind==="comp"}), ...Array.from({length:K+1}, (_,j)=>{ const x = u.at(j); return !x ? rcell(null) : x.invalid ? cell("—") : k==="Ro" ? cell(n2(x.Ro), {size:16}) : rcell(x[k], {size:16}); })])]),
      caption("tab", title)); };
    stepTable("R", t("ریسک ساختمان و دارایی (R) در فضاها، قبل و بعد از اقدام‌های اصلاحی","Property risk (R) per space before and after the corrective measures"));
    stepTable("R1", t("ریسک افراد (R1) در فضاها، قبل و بعد از اقدام‌های اصلاحی","Occupant risk (R1) per space before and after the corrective measures"));
    stepTable("R2", t("ریسک فعالیت (R2) در فضاها، قبل و بعد از اقدام‌های اصلاحی","Activity risk (R2) per space before and after the corrective measures"));
    add(body(t("راهنمای جدول‌ها: ستون «۱-۳» یعنی اجرای اقدام‌های ۱ تا ۳ با هم. رنگ سبز: قابل‌قبول، زرد: فرصت بهبود، قرمز: غیرقابل‌قبول. «جدا شد» یعنی پس از آن اقدام طبقه‌ها از نظر آتش جدا شده‌اند و واحد ترکیبی دیگر وجود ندارد.",
      "Reading the tables: column \"1-3\" means measures 1 to 3 together. Green: acceptable, yellow: room for improvement, red: not acceptable. \"separated\" means that after this step the floors are fire-separated and the combined compartment no longer exists.")));
    add(body(t("نمودارهای زیر ریسک هر فضا را پس از هر قدم نشان می‌دهند.","The charts below show the risk of every space after each step.")));
    C.steps.forEach(s=>add(image(s.c, 520), caption("fig", t(`نتایج ریسک ${C.nm(s.u)} پس از هر قدم`, `Risk results of ${C.nm(s.u)} after each step`))));
    add(H(t("۶-۱. ریسک اولیه Ro پس از اقدام‌ها","6.1 Initial risk Ro after the measures"), 2));
    stepTable("Ro", t("ریسک اولیه Ro در فضاها، قبل و بعد از اقدام‌های اصلاحی","Initial risk Ro per space before and after the corrective measures"));
  }

  /* 7 findings outside the per-space model */
  const ext = M.b.extH;
  if (M.crows.length || ext){
    add(H(t("۷. طبقه‌های متصل و خطرهای بیرونی","7. Linked floors and external hazards")));
    M.crows.forEach(c=>{ const u = M.units.find(x=>x.r===c);
      add(bullet(t(`${c.members.map(m=>m.name).join("، ")} از نظر آتش از هم جدا نیستند و با هم یک واحد حریق‌اند. ریسک واحد ترکیبی: R ${n2(c.x.R)}، R1 ${n2(c.x.R1)}، R2 ${n2(c.x.R2)}. آتش‌بند کردن رایزرها و عبورها و محصور کردن پله‌ها و شافت‌ها این طبقه‌ها را دوباره از هم جدا می‌کند.`,
        `${c.members.map(m=>enSpaceName(m)).join(", ")} are not fire-separated and form one compartment. Risk of the combined compartment: R ${n2(c.x.R)}, R1 ${n2(c.x.R1)}, R2 ${n2(c.x.R2)}. Fire-stopping risers and penetrations and enclosing stairs and shafts separates these floors again.`))); });
    if (ext) add(bullet(t(`خطر بیرونی نزدیک ساختمان: ${optText(FIELD.extH, ext, "fa")}. فضاهای مجاور: ${M.rows.filter(r=>r.d.extNear).map(r=>r.name).join("، ") || "—"}. فاصلهٔ ایمن، دیوار ضدحریق، حوضچهٔ مهار نشت و اتاقک استاندارد را طبق مقررات (مبحث ۳، NFPA 30) کنترل کنید.`,
      `External hazard next to the building: ${optText(FIELD.extH, ext, "en")}. Spaces facing it: ${M.rows.filter(r=>r.d.extNear).map(r=>enSpaceName(r)).join(", ") || "—"}. Check the safe distance, fire wall, spill containment (bund) and enclosure against the regulations (e.g. NFPA 30).`)));
  }

  /* 8 conclusion */
  add(H(t(M.crows.length || ext ? "۸. نتیجه‌گیری" : "۷. نتیجه‌گیری", M.crows.length || ext ? "8. Conclusion" : "7. Conclusion")),
    body(bad.length ? t(`ارزیابی نشان می‌دهد ${n0(bad.length)} فضا یا واحد حریق در وضعیت فعلی ریسک غیرقابل‌قبول دارد. ${K ? `با اجرای بستهٔ پیشنهادی (${n0(K)} اقدام) ${pkOk ? "همهٔ ریسک‌ها به محدودهٔ قابل‌قبول می‌رسند" : "ریسک‌ها کاهش می‌یابد ولی برای رسیدن به حد مجاز تغییر بزرگ‌تری لازم است"}.` : ""} توصیه می‌شود اقدام‌های کم‌هزینه بی‌درنگ اجرا و اقدام‌های پرهزینه در برنامهٔ سرمایه‌ای قرار گیرند، و ارزیابی پس از اجرای اقدام‌ها یا هر تغییر در کاربری تکرار شود.`,
        `The assessment shows that ${bad.length} space(s) have an unacceptable risk in their current state. ${K ? `With the recommended package (${K} measures) ${pkOk ? "all risks become acceptable" : "the risks decrease, but larger changes are needed to reach the limit"}.` : ""} Low-cost measures should be implemented immediately and high-cost measures planned in the investment programme; the assessment should be repeated after the measures or any change of use.`)
      : t("ارزیابی نشان می‌دهد همهٔ فضاها در وضعیت فعلی ریسک قابل‌قبول دارند. حفظ وضعیت تجهیزات و آموزش، و تکرار ارزیابی پس از هر تغییر در کاربری یا چیدمان توصیه می‌شود.",
        "All spaces have an acceptable risk in their current state. Keep the equipment and training in good order and repeat the assessment after any change of use or layout.")));

  /* appendix: answers per space */
  add(para(t("پیوست – پاسخ‌های چک‌لیست هر فضا","Appendix – checklist answers per space"), {h:D.HeadingLevel.HEADING_1, size:30, b:true, color:"B4461E", after:100, pb:true}));
  M.rows.forEach(r=>{ add(H(spaceName(r, lang), 2));
    const rows = [[hcell(t("مورد","Item")), hcell(t("پاسخ","Answer"))]];
    SECTIONS.forEach(sec=>{ const fs = sec.fields.flatMap(f=>f.row||[f]).filter(f=>f.t!=="text" && !META.has(f.id) && shown(f, r.d)); if (!fs.length) return;
      rows.push([cell(rtl ? sec.title : SEC_EN[sec.id], {b:true, fill:"EAEFF4", span:2})]);
      fs.forEach(f=>rows.push([cell(fLabel(f, lang), {size:15, align:rtl ? undefined : D.AlignmentType.LEFT}), cell(optText(f, r.d[f.id], lang), {size:15})])); });
    add(table(rows), gap()); });

  const doc = new D.Document({creator:"FRAME tool", title:t("گزارش ارزیابی ریسک حریق FRAME","FRAME fire risk assessment report"), description:project,
    styles:{default:{document:{run:{font:FONT, size:21}}}},
    sections:[{properties:{page:{size:{width:11906, height:16838}, margin:{top:1134, bottom:1134, left:1134, right:1134}}},
      footers:{default:new D.Footer({children:[new D.Paragraph({alignment:D.AlignmentType.CENTER, children:[new D.TextRun({children:[D.PageNumber.CURRENT], font:FONT, size:18})]})]})},
      children}]});
  return await D.Packer.toBlob(doc);
}
window.FRAMEX = {xlsx:excel, docx:(...a)=>word(...a)};
window.FRAMEX_MODEL = {EN, SEC_EN, SYM, FACT, BLOCKS, RO_EN, roIdx, COST_EN, LV, FILL, INK, lvOf, num, T2, fLabel, optText, unitOf, spaceName, levelCode, measureText, costText, stepCode, model, charts, pngBytes};
})();
