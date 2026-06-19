// ====== HSE Inspection — Offline PWA ======
let CHECKLIST = null, ITEMS = [], idx = 0;
const STORE_KEY = "hse_pwa_v1";
const HISTORY_KEY = "hse_pwa_history";
let state = { building: {}, answers: {} };
const objURLs = {};
let isDownloading = false;
let currentInspectionData = null;

const $ = (s) => document.querySelector(s);
const screens = ["startScreen", "wizardScreen", "finishScreen", "historyScreen"];
function show(id){ screens.forEach(s=>$("#"+s).style.display = s===id?"block":"none"); scrollTo(0,0); }
function toast(m, ms=2600){ const t=$("#toast"); t.textContent=m; t.classList.add("show");
  clearTimeout(t._t); t._t=setTimeout(()=>t.classList.remove("show"),ms); }
function toFa(n){ return String(n).replace(/\d/g,d=>"۰۱۲۳۴۵۶۷۸۹"[d]); }

// =================== تقویم شمسی (Jalali) ===================
const JMONTHS = ["فروردین","اردیبهشت","خرداد","تیر","مرداد","شهریور","مهر","آبان","آذر","دی","بهمن","اسفند"];
const JWEEK = ["ش","ی","د","س","چ","پ","ج"];
function jdiv(a,b){return ~~(a/b);} function jmod(a,b){return a-~~(a/b)*b;}
function jalCal(jy){ const breaks=[-61,9,38,199,426,686,756,818,1111,1181,1210,1635,2060,2097,2192,2262,2324,2394,2456,3178];
  const bl=breaks.length, gy=jy+621; let leapJ=-14, jp=breaks[0], jm,jump=0,leap,leapG,march,n,i;
  for(i=1;i<bl;i+=1){ jm=breaks[i]; jump=jm-jp; if(jy<jm) break; leapJ+=jdiv(jump,33)*8+jdiv(jmod(jump,33),4); jp=jm; }
  n=jy-jp; leapJ+=jdiv(n,33)*8+jdiv(jmod(n,33)+3,4);
  if(jmod(jump,33)===4 && jump-n===4) leapJ+=1;
  leapG=jdiv(gy,4)-jdiv((jdiv(gy,100)+1)*3,4)-150; march=20+leapJ-leapG;
  if(jump-n<6) n=n-jump+jdiv(jump+4,33)*33;
  leap=jmod(jmod(n+1,33)-1,4); if(leap===-1) leap=4;
  return {leap, gy, march}; }
function g2d(gy,gm,gd){ let d=jdiv((gy+jdiv(gm-8,6)+100100)*1461,4)+jdiv(153*jmod(gm+9,12)+2,5)+gd-34840408;
  d=d-jdiv(jdiv(gy+100100+jdiv(gm-8,6),100)*3,4)+752; return d; }
function d2g(jdn){ let j=4*jdn+139361631; j=j+jdiv(jdiv(4*jdn+183187720,146097)*3,4)*4-3908;
  const i=jdiv(jmod(j,1461),4)*5+308; const gd=jdiv(jmod(i,153),5)+1, gm=jmod(jdiv(i,153),12)+1, gy=jdiv(j,1461)-100100+jdiv(8-gm,6);
  return {gy,gm,gd}; }
function toJalaali(gy,gm,gd){ const jdn=g2d(gy,gm,gd), gy2=d2g(jdn).gy; let jy=gy2-621; const r=jalCal(jy), jdn1f=g2d(r.gy,3,r.march);
  let k=jdn-jdn1f, jm,jd; if(k>=0){ if(k<=185){ jm=1+jdiv(k,31); jd=jmod(k,31)+1; return {jy,jm,jd}; } else k-=186; } else { jy-=1; k+=179; if(r.leap===1)k+=1; }
  jm=7+jdiv(k,30); jd=jmod(k,30)+1; return {jy,jm,jd}; }
function toGregorian(jy,jm,jd){ const r=jalCal(jy); const jdn=g2d(r.gy,3,r.march)+(jm-1)*31-jdiv(jm,7)*(jm-7)+jd-1; return d2g(jdn); }
function isLeapJ(jy){ return jalCal(jy).leap===0; }
function jMonthLen(jy,jm){ if(jm<=6)return 31; if(jm<=11)return 30; return isLeapJ(jy)?30:29; }
function jToday(){ const n=new Date(); return toJalaali(n.getFullYear(), n.getMonth()+1, n.getDate()); }

let calView=null, calTarget=null;
function buildCalendar(){
  const pop=document.createElement("div"); pop.id="jcal"; pop.className="jcal"; pop.style.display="none";
  pop.innerHTML=`
    <div class="jcal-head">
      <button type="button" class="jcal-nav" data-d="-1">‹</button>
      <div class="jcal-title"><select class="jcal-mon"></select><select class="jcal-yr"></select></div>
      <button type="button" class="jcal-nav" data-d="1">›</button>
    </div>
    <div class="jcal-week">${JWEEK.map(w=>`<span>${w}</span>`).join("")}</div>
    <div class="jcal-grid"></div>
    <div class="jcal-foot"><button type="button" class="jcal-today">امروز</button><button type="button" class="jcal-close">بستن</button></div>`;
  document.body.appendChild(pop);
  const mon=pop.querySelector(".jcal-mon"), yr=pop.querySelector(".jcal-yr");
  JMONTHS.forEach((m,i)=>{ const o=document.createElement("option"); o.value=i+1; o.textContent=m; mon.appendChild(o); });
  const ty=jToday().jy; for(let y=ty-80;y<=ty+5;y++){ const o=document.createElement("option"); o.value=y; o.textContent=toFa(y); yr.appendChild(o); }
  mon.onchange=()=>{ calView.jm=+mon.value; renderCal(); };
  yr.onchange=()=>{ calView.jy=+yr.value; renderCal(); };
  pop.querySelectorAll(".jcal-nav").forEach(b=> b.onclick=()=>{ calView.jm+=+b.dataset.d;
    if(calView.jm>12){calView.jm=1;calView.jy++;} if(calView.jm<1){calView.jm=12;calView.jy--;} renderCal(); });
  pop.querySelector(".jcal-today").onclick=()=>{ const t=jToday(); pickDate(t.jy,t.jm,t.jd); };
  pop.querySelector(".jcal-close").onclick=closeCal;
  document.addEventListener("click",(e)=>{ if(pop.style.display==="block" && !pop.contains(e.target) && e.target!==calTarget) closeCal(); });
  return pop;
}
function renderCal(){
  const pop=$("#jcal"); pop.querySelector(".jcal-mon").value=calView.jm; pop.querySelector(".jcal-yr").value=calView.jy;
  const grid=pop.querySelector(".jcal-grid"); grid.innerHTML="";
  const g=toGregorian(calView.jy,calView.jm,1); const dow=new Date(g.gy,g.gm-1,g.gd).getDay(); // 0=Sun
  const startCol=(dow+1)%7; // شنبه=0
  for(let i=0;i<startCol;i++){ const s=document.createElement("span"); s.className="jcal-empty"; grid.appendChild(s); }
  const len=jMonthLen(calView.jy,calView.jm); const t=jToday();
  for(let d=1;d<=len;d++){ const b=document.createElement("button"); b.type="button"; b.className="jcal-day"; b.textContent=toFa(d);
    if(t.jy===calView.jy&&t.jm===calView.jm&&t.jd===d) b.classList.add("today");
    if(calView.sel&&calView.sel.jy===calView.jy&&calView.sel.jm===calView.jm&&calView.sel.jd===d) b.classList.add("sel");
    b.onclick=()=>pickDate(calView.jy,calView.jm,d); grid.appendChild(b); }
}
function openCal(target){
  calTarget=target; if(!$("#jcal")) buildCalendar();
  let init=jToday(); const m=(target.value||"").match(/(\d{3,4})\D(\d{1,2})\D(\d{1,2})/);
  if(m){ const toEn=s=>s.replace(/[۰-۹]/g,d=>"۰۱۲۳۴۵۶۷۸۹".indexOf(d)); init={jy:+toEn(m[1]),jm:+toEn(m[2]),jd:+toEn(m[3])}; }
  calView={jy:init.jy,jm:init.jm,sel:init};
  const pop=$("#jcal"); pop.style.display="block"; renderCal();
  const r=target.getBoundingClientRect();
  pop.style.top=(window.scrollY+r.bottom+6)+"px"; pop.style.left=Math.max(8,window.scrollX+r.left)+"px";
}
function closeCal(){ const p=$("#jcal"); if(p) p.style.display="none"; }
function pickDate(jy,jm,jd){ const v=`${toFa(jy)}/${toFa(String(jm).padStart(2,"0"))}/${toFa(String(jd).padStart(2,"0"))}`;
  if(calTarget){ calTarget.value=v; } closeCal(); }

// =================== IndexedDB (عکس‌ها) ===================
let _db;
function db(){ if(_db) return Promise.resolve(_db);
  return new Promise((res,rej)=>{ const r=indexedDB.open("hse_pwa",1);
    r.onupgradeneeded=()=>r.result.createObjectStore("photos"); r.onsuccess=()=>{_db=r.result;res(_db);}; r.onerror=()=>rej(r.error); }); }
async function putPhoto(id,blob){ const d=await db(); return new Promise((res,rej)=>{ const t=d.transaction("photos","readwrite");
  t.objectStore("photos").put(blob,id); t.oncomplete=res; t.onerror=()=>rej(t.error); }); }
async function getPhoto(id){ const d=await db(); return new Promise((res,rej)=>{ const t=d.transaction("photos","readonly");
  const q=t.objectStore("photos").get(id); q.onsuccess=()=>res(q.result); q.onerror=()=>rej(q.error); }); }
async function delPhoto(id){ const d=await db(); return new Promise((res)=>{ const t=d.transaction("photos","readwrite");
  t.objectStore("photos").delete(id); t.oncomplete=res; }); }

function persist(){ localStorage.setItem(STORE_KEY, JSON.stringify(state)); }
function loadLocal(){ try{ const r=localStorage.getItem(STORE_KEY); if(r) return JSON.parse(r);}catch(e){} return null; }

// تاریخچه و آرشیو
function getHistory(){ try{ const h=localStorage.getItem(HISTORY_KEY); return h ? JSON.parse(h) : []; }catch(e){ return []; } }
function saveHistory(item){ const h=getHistory(); h.unshift({...item, timestamp: new Date().toLocaleString('fa-IR')}); if(h.length>3) h.pop(); localStorage.setItem(HISTORY_KEY, JSON.stringify(h)); }
function clearHistory(){ localStorage.removeItem(HISTORY_KEY); }
function showHistory(){
  const h=getHistory();
  const list=$("#historyList");
  list.innerHTML="";
  if(h.length===0){ list.innerHTML="<p style='text-align:center;color:#999'>هنوز گزارشی ذخیره نشده</p>"; show("historyScreen"); return; }
  h.forEach((item,i)=>{
    const div=document.createElement("div");
    div.style.cssText="background:#f8fafc;border:1px solid #e5e7eb;border-radius:12px;padding:12px;";
    const name=item.building?.name || "بدون نام";
    const pct=item.stats?.pct || 0;
    div.innerHTML=`
      <div style="font-weight:bold;color:#1f4e78;">${name}</div>
      <div style="font-size:0.9rem;color:#666;margin:4px 0;">📅 ${item.timestamp}</div>
      <div style="font-size:0.9rem;color:#666;margin:4px 0;">📊 ایمنی: ${toFa(pct)}٪</div>
      <div style="display:flex;gap:8px;margin-top:8px;">
        <button class="btn primary" style="flex:1;padding:8px;font-size:0.9rem;" onclick="exportFromHistory(${i},'Excel')">📥 Excel</button>
        <button class="btn blue" style="flex:1;padding:8px;font-size:0.9rem;" onclick="exportFromHistory(${i},'Word')">📥 Word</button>
      </div>
    `;
    list.appendChild(div);
  });
  show("historyScreen");
}
async function exportFromHistory(index, format){
  const h=getHistory();
  if(index<0 || index>=h.length) return;
  const item=h[index];
  // بازسازی state برای خروجی
  state = { building: item.building||{}, answers: item.answers||{} };
  if(format==="Excel") await exportExcel();
  else if(format==="Word") await exportWord();
}

// =================== راه‌اندازی ===================
async function init(){
  CHECKLIST = await (await fetch("checklist_data.json")).json();
  ITEMS = CHECKLIST.items;

  const saved = loadLocal();
  if(saved && saved.answers && Object.keys(saved.answers).length){
    $("#resumeBtn").style.display="inline-block";
    $("#resumeBtn").onclick=()=>{ state=saved; fillBuilding(); idx=firstUnanswered(); show("wizardScreen"); renderItem(); };
  }
  // تقویم شمسی روی فیلد تاریخ
  const dateEl=$("#b_date"); dateEl.readOnly=true; dateEl.placeholder="انتخاب از تقویم";
  dateEl.addEventListener("click",()=>openCal(dateEl));
  $("#b_date_btn") && ($("#b_date_btn").onclick=()=>openCal(dateEl));

  $("#startBtn").onclick=()=>{ readBuilding(); idx=0; show("wizardScreen"); renderItem(); };
  $("#historyBtn").onclick=showHistory;
  $("#backFromHistory").onclick=()=>show("startScreen");
  $("#prevBtn").onclick=()=>{ saveCurrent(); if(idx>0){idx--; renderItem();} };
  $("#nextBtn").onclick=onNext;
  $("#cameraInput").onchange=onPhotoSelected;
  $("#folderInput").onchange=onPhotoSelected;
  $("#excelBtn").onclick=()=>guard(exportExcel,"Excel");
  $("#wordBtn").onclick=()=>guard(exportWord,"Word");
  $("#backWizardBtn").onclick=()=>{ idx=ITEMS.length-1; show("wizardScreen"); renderItem(); };
  $("#resetBtn").onclick=async()=>{ if(confirm("همه اطلاعات این بازدید پاک شود؟")){
    localStorage.removeItem(STORE_KEY); const d=await db(); d.transaction("photos","readwrite").objectStore("photos").clear();
    state={building:{},answers:{}}; location.reload(); } };

  document.querySelectorAll(".status-btn").forEach(b=>{
    b.onclick=()=>{ document.querySelectorAll(".status-btn").forEach(x=>x.classList.remove("selected"));
      b.classList.add("selected"); const row=ITEMS[idx].row;
      state.answers[row]=state.answers[row]||{photoIds:[]}; state.answers[row].status=b.dataset.status; persist(); };
  });

  if(!window.matchMedia("(display-mode: standalone)").matches) $("#installHint").style.display="block";
  if("serviceWorker" in navigator) navigator.serviceWorker.register("sw.js").catch(()=>{});
}

// اجرای امن خروجی‌ها با نمایش خطا روی صفحه
async function guard(fn,label){
  if(isDownloading){ toast("لطفاً منتظر بمانید..."); return; }
  isDownloading = true;
  try{
    await fn();
  }
  catch(e){
    console.error(e);
    toast(`خطا در ساخت ${label}: ${e.message||e}`, 6000);
    alert(`خطا در ساخت ${label}:\n${e.message||e}`);
  }
  finally{
    isDownloading = false;
  }
}

function readBuilding(){ state.building={ name:$("#b_name").value, address:$("#b_address").value,
  date:$("#b_date").value, inspector:$("#b_inspector").value, code:$("#b_code").value, period:$("#b_period").value }; persist(); }
function fillBuilding(){ const b=state.building||{}; $("#b_name").value=b.name||""; $("#b_address").value=b.address||"";
  $("#b_date").value=b.date||""; $("#b_inspector").value=b.inspector||""; $("#b_code").value=b.code||""; $("#b_period").value=b.period||""; }
function firstUnanswered(){ for(let i=0;i<ITEMS.length;i++) if(!(state.answers[ITEMS[i].row]&&state.answers[ITEMS[i].row].status)) return i; return 0; }

function renderItem(){
  const it=ITEMS[idx], a=state.answers[it.row]||{photoIds:[]};
  $("#sectionTag").textContent=it.section;
  $("#counter").textContent=`${toFa(idx+1)} / ${toFa(ITEMS.length)}`;
  $("#progressBar").style.width=((idx+1)/ITEMS.length*100)+"%";
  $("#rowNum").textContent=toFa(it.row); $("#itemText").textContent=it.item;
  $("#refTag").textContent=it.ref?"مرجع: "+it.ref:""; $("#refTag").style.display=it.ref?"inline-block":"none";
  $("#prioTag").textContent=it.priority?"اولویت: "+it.priority:""; $("#prioTag").style.display=it.priority?"inline-block":"none";
  document.querySelectorAll(".status-btn").forEach(b=>b.classList.toggle("selected", a.status===b.dataset.status));
  $("#noteInput").value=a.note||""; renderPhotos();
  $("#nextBtn").textContent = idx===ITEMS.length-1 ? "پایان و گزارش ✓" : "بعدی ▶";
  $("#prevBtn").style.visibility = idx===0 ? "hidden":"visible";
}
function saveCurrent(){ const row=ITEMS[idx].row; state.answers[row]=state.answers[row]||{photoIds:[]};
  state.answers[row].note=$("#noteInput").value; persist(); }
function onNext(){ const row=ITEMS[idx].row, a=state.answers[row];
  if(!a||!a.status){ toast("لطفاً وضعیت این ردیف را انتخاب کنید"); return; }
  saveCurrent(); if(idx===ITEMS.length-1){ showFinish(); return; } idx++; renderItem(); }

async function renderPhotos(){
  const a=state.answers[ITEMS[idx].row]||{photoIds:[]}; const list=$("#photoList"); list.innerHTML="";
  for(let i=0;i<(a.photoIds||[]).length;i++){ const id=a.photoIds[i]; let url=objURLs[id];
    if(!url){ const blob=await getPhoto(id); if(blob){ url=URL.createObjectURL(blob); objURLs[id]=url; } }
    const div=document.createElement("div"); div.className="photo-thumb";
    div.innerHTML=`<img src="${url||""}"><button title="حذف">×</button>`;
    div.querySelector("button").onclick=async()=>{ a.photoIds.splice(i,1); await delPhoto(id);
      if(objURLs[id]){ URL.revokeObjectURL(objURLs[id]); delete objURLs[id]; } persist(); renderPhotos(); };
    list.appendChild(div); }
}
async function onPhotoSelected(e){ const files=[...e.target.files]; e.target.value=""; if(!files.length) return;
  const row=ITEMS[idx].row; state.answers[row]=state.answers[row]||{photoIds:[]}; state.answers[row].photoIds=state.answers[row].photoIds||[];
  for(const f of files){ const id="p_"+Date.now()+"_"+Math.random().toString(36).slice(2,8);
    const blob=await downscale(f); await putPhoto(id, blob); state.answers[row].photoIds.push(id); }
  persist(); renderPhotos(); }
function downscale(file, max=1280, q=0.82){ return new Promise((res)=>{ const img=new Image(); const u=URL.createObjectURL(file);
  img.onload=()=>{ let w=img.width,h=img.height; if(w>max||h>max){ const r=Math.min(max/w,max/h); w=Math.round(w*r); h=Math.round(h*r);}
    const c=document.createElement("canvas"); c.width=w; c.height=h; c.getContext("2d").drawImage(img,0,0,w,h);
    URL.revokeObjectURL(u); c.toBlob(b=>res(b||file),"image/jpeg",q); };
  img.onerror=()=>{ URL.revokeObjectURL(u); res(file); }; img.src=u; }); }

const STATUS={ ok:{label:"مطلوب",sym:"✅",score:3}, warn:{label:"نیاز به بهبود",sym:"⚠️",score:1},
  bad:{label:"نامطلوب",sym:"❌",score:0}, na:{label:"کاربرد ندارد",sym:"N/A",score:null} };
function safety(p){ if(p>=85)return["ایمن – قابل قبول","C6EFCE","#d1fae5"]; if(p>=70)return["متوسط – نیاز به توجه","FFEB9C","#fef3c7"];
  if(p>=50)return["ضعیف – اقدام فوری","FCD5B4","#fed7aa"]; return["بحرانی – مداخله اضطراری","FFC7CE","#fee2e2"]; }
function showFinish(){ persist(); let ok=0,warn=0,bad=0,na=0,sum=0,max=0;
  ITEMS.forEach(it=>{ const a=state.answers[it.row]; if(!a||!a.status) return;
    if(a.status==="ok"){ok++;sum+=3;max+=3;} else if(a.status==="warn"){warn++;sum+=1;max+=3;}
    else if(a.status==="bad"){bad++;max+=3;} else if(a.status==="na"){na++;} });
  const answered=ok+warn+bad+na, pct=max?Math.round(sum/max*1000)/10:0, [lvl,,col]=safety(pct);
  currentInspectionData = { building: state.building, answers: state.answers, stats: {ok,warn,bad,na,pct,lvl} };
  saveHistory(currentInspectionData);
  $("#summaryBox").innerHTML=`
    <div>تعداد آیتم پاسخ‌داده‌شده: <b>${toFa(answered)}</b> از ${toFa(ITEMS.length)}</div>
    <div>✅ مطلوب: <b>${toFa(ok)}</b> &nbsp; ⚠️ نیاز به بهبود: <b>${toFa(warn)}</b>
         &nbsp; ❌ نامطلوب: <b>${toFa(bad)}</b> &nbsp; N/A: <b>${toFa(na)}</b></div>
    <div>درصد ایمنی: <span class="pill" style="background:${col}">${toFa(pct)}٪</span> سطح: <b>${lvl}</b></div>`;
  show("finishScreen");
}
function collectRows(){ const rows=[]; for(const it of ITEMS){ const a=state.answers[it.row]; if(!a||!a.status) continue;
  const sm=STATUS[a.status]; rows.push({ row:it.row, section:it.section, item:it.item, ref:it.ref||"", priority:it.priority||"",
    status:a.status, label:sm.label, sym:sm.sym, score:sm.score, note:(a.note||"").trim(), photoIds:a.photoIds||[] }); } return rows; }

// دانلود مقاوم برای موبایل
function downloadBlob(blob, name){
  if(window.saveAs){ try{ window.saveAs(blob, name); return; }catch(e){} }
  const url=URL.createObjectURL(blob);
  const a=document.createElement("a");
  a.href=url;
  a.download=name;
  a.rel="noopener";
  document.body.appendChild(a);
  a.click();
  setTimeout(()=>{
    a.remove();
    URL.revokeObjectURL(url);
  }, 100);
}

// =================== خروجی Excel ===================
async function exportExcel(){
  if(!window.ExcelJS) throw new Error("کتابخانه ExcelJS بارگذاری نشده (اتصال/کش)");
  toast("در حال ساخت Excel...");
  const ExcelJS=window.ExcelJS; const wb=new ExcelJS.Workbook();
  const ws=wb.addWorksheet("گزارش بازدید",{views:[{rightToLeft:true}]});
  const b=state.building||{};
  ws.mergeCells("A1:I1"); const t=ws.getCell("A1"); t.value="گزارش بازدید ایمنی و آتش‌نشانی ساختمان";
  t.font={name:"B Nazanin",bold:true,size:14,color:{argb:"FFFFFFFF"}}; t.alignment={horizontal:"center",vertical:"middle"};
  t.fill={type:"pattern",pattern:"solid",fgColor:{argb:"FF1F4E78"}}; ws.getRow(1).height=26;
  const info=[["نام ساختمان / پروژه",b.name||""],["آدرس",b.address||""],["تاریخ بازدید",b.date||""],
    ["بازرس HSE",b.inspector||""],["کد ساختمان",b.code||""],["دوره بازدید",b.period||""]];
  let r=2; for(let i=0;i<info.length;i+=2){ ws.getCell(r,1).value=info[i][0]; ws.getCell(r,1).font={name:"B Nazanin",bold:true};
    ws.getCell(r,2).value=info[i][1]; ws.getCell(r,2).font={name:"B Nazanin"};
    if(info[i+1]){ ws.getCell(r,4).value=info[i+1][0]; ws.getCell(r,4).font={name:"B Nazanin",bold:true};
      ws.getCell(r,5).value=info[i+1][1]; ws.getCell(r,5).font={name:"B Nazanin"}; } r++; }
  const head=["ردیف","حوزه","شرح آیتم","مرجع قانونی","وضعیت","مغایرت / توضیح","اولویت","امتیاز","تعداد عکس"];
  const hr=r+1; head.forEach((h,i)=>{ const c=ws.getCell(hr,i+1); c.value=h; c.font={name:"B Nazanin",bold:true,color:{argb:"FFFFFFFF"}};
    c.fill={type:"pattern",pattern:"solid",fgColor:{argb:"FF2E75B6"}}; c.alignment={horizontal:"center",vertical:"middle",wrapText:true};
    c.border=allBorders("FF8DB4E2"); });
  const fillMap={ok:"FFC6EFCE",warn:"FFFFEB9C",bad:"FFFFC7CE"};
  let rr=hr+1; const scored=[];
  for(const row of collectRows()){ if(row.status==="na") continue;
    const vals=[row.row,row.section,row.item,row.ref,`${row.sym} ${row.label}`,row.note,row.priority,
      row.score==null?"":row.score, row.photoIds.length];
    vals.forEach((v,i)=>{ const c=ws.getCell(rr,i+1); c.value=v; c.font={name:"B Nazanin"};
      c.alignment={vertical:"middle",wrapText:true,horizontal:[1,2,3,5].includes(i)?"right":"center"}; c.border=allBorders("FFB0B0B0"); });
    if(fillMap[row.status]) ws.getCell(rr,5).fill={type:"pattern",pattern:"solid",fgColor:{argb:fillMap[row.status]}};
    if(row.score!=null) scored.push(row.score); rr++; }
  if(scored.length){ const total=scored.reduce((a,b)=>a+b,0), maxp=scored.length*3, pct=maxp?Math.round(total/maxp*1000)/10:0;
    setKV(ws,rr+1,"جمع امتیاز کسب‌شده",total); setKV(ws,rr+2,"حداکثر امتیاز ممکن",maxp);
    setKV(ws,rr+3,"درصد ایمنی",pct+"%"); const [lvl,argb]=safety(pct); const lc=ws.getCell(rr+3,4); lc.value=lvl;
    lc.font={name:"B Nazanin",bold:true}; lc.fill={type:"pattern",pattern:"solid",fgColor:{argb:"FF"+argb}}; }
  [7,26,45,20,16,35,10,9,10].forEach((w,i)=>ws.getColumn(i+1).width=w);
  const buf=await wb.xlsx.writeBuffer();
  downloadBlob(new Blob([buf],{type:"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"}), `HSE_Report_${today()}.xlsx`);
  toast("فایل Excel ساخته شد ✓");
}
function allBorders(argb){ const s={style:"thin",color:{argb}}; return {top:s,left:s,right:s,bottom:s}; }
function setKV(ws,row,k,v){ ws.getCell(row,3).value=k; ws.getCell(row,3).font={name:"B Nazanin",bold:true};
  ws.getCell(row,8).value=v; ws.getCell(row,8).font={name:"B Nazanin",bold:true}; }

// =================== خروجی Word (جدولی، چهارچوب‌بندی‌شده) ===================
async function exportWord(){
  if(!window.docx) throw new Error("کتابخانه docx بارگذاری نشده (اتصال/کش)");
  toast("در حال ساخت Word...");
  const D=window.docx; const b=state.building||{};
  const FONT="B Nazanin";
  const C={blue:"1F4E78",red:"C00000",amber:"BF8F00",green:"2E7D32",gray:"595959",line:"1F4E78",hdr:"D9E1F2"};
  const R=(text,o={})=> new D.TextRun(Object.assign({text:String(text),font:FONT,rightToLeft:true},o));
  const P=(children,o={})=> new D.Paragraph(Object.assign({bidirectional:true,alignment:D.AlignmentType.RIGHT,
    spacing:{after:60},children:Array.isArray(children)?children:[children]},o));
  const Pc=(children,o={})=> P(children,Object.assign({alignment:D.AlignmentType.CENTER},o));
  const bd=(sz=4,color=C.line)=>({style:D.BorderStyle.SINGLE,size:sz,color});
  const cellBorders={top:bd(),bottom:bd(),left:bd(),right:bd()};

  // ---- سرتیتر: مشخصات ساختمان به‌صورت جدول ----
  const kv=(k,v)=>[ new D.TableCell({ width:{size:18,type:D.WidthType.PERCENTAGE}, shading:{fill:C.hdr},
      margins:{top:40,bottom:40,left:80,right:80}, borders:cellBorders,
      children:[P([R(k,{bold:true,size:22,color:C.blue})])] }),
    new D.TableCell({ width:{size:32,type:D.WidthType.PERCENTAGE}, margins:{top:40,bottom:40,left:80,right:80}, borders:cellBorders,
      children:[P([R(v||"—",{size:22})])] }) ];
  const infoTable=new D.Table({ visuallyRightToLeft:true, width:{size:100,type:D.WidthType.PERCENTAGE},
    rows:[
      new D.TableRow({children:[...kv("نام ساختمان / پروژه",b.name), ...kv("تاریخ بازدید",b.date)]}),
      new D.TableRow({children:[...kv("آدرس",b.address), ...kv("بازرس HSE",b.inspector)]}),
      new D.TableRow({children:[...kv("نام ساختمان / اداره",b.name), ...kv("دوره بازدید",b.period)]}),
    ] });

  // ---- آمار خلاصه ----
  const rowsAll=collectRows();
  let ok=0,warn=0,bad=0,na=0,sum=0,max=0;
  rowsAll.forEach(r=>{ if(r.status==="ok"){ok++;sum+=3;max+=3;} else if(r.status==="warn"){warn++;sum+=1;max+=3;}
    else if(r.status==="bad"){bad++;max+=3;} else if(r.status==="na"){na++;} });
  const pct=max?Math.round(sum/max*1000)/10:0; const [lvl]=safety(pct);

  // ---- عکس‌ها: همه ردیف‌های دارای عکس ----
  const withPhotos=rowsAll.filter(r=>r.status!=="na" && r.photoIds.length>0);

  const children=[
    Pc([R("گزارش بازدید ایمنی و آتش‌نشانی ساختمان",{bold:true,size:34,color:C.blue})],{spacing:{after:40}}),
    Pc([R("گزارش تصویری مغایرت‌ها و مستندسازی بازدید",{size:24,color:C.gray})],{spacing:{after:160}}),
    infoTable,
    P([R("")],{spacing:{after:80}}),
    P([R(`خلاصه نتایج:  مطلوب ${toFa(ok)} | نیاز به بهبود ${toFa(warn)} | نامطلوب ${toFa(bad)} | کاربردندارد ${toFa(na)} | درصد ایمنی ${toFa(pct)}٪ (${lvl})`,
       {bold:true,size:22})], {spacing:{after:160}}),
    Pc([R("مستندات تصویری",{bold:true,size:26,color:C.blue})],{spacing:{before:80,after:120}}),
  ];

  if(withPhotos.length===0){
    children.push(P([R("هیچ عکسی برای این بازدید ثبت نشده است.",{size:22,color:C.gray})]));
  } else {
    // هر عکس به‌صورت یک سلول در جدول دوستونی، با متن زیر عکس
    const cells=[];
    let n=1;
    for(const r of withPhotos){
      const sc={bad:C.red,warn:C.amber,ok:C.green}[r.status]||C.gray;
      for(const id of r.photoIds){
        const blob=await getPhoto(id); if(!blob) continue;
        const buf=await blob.arrayBuffer();
        const w=220, h=220;
        const capRuns=[ R(`تصویر ${toFa(n)} — ردیف ${toFa(r.row)} `,{bold:true,size:20,color:C.blue}),
          R(`(${r.sym} ${r.label})`,{bold:true,size:20,color:sc}) ];
        const cellKids=[
          Pc([ new D.ImageRun({data:buf, transformation:{width:w,height:h}}) ],{spacing:{after:40}}),
          P(capRuns,{spacing:{after:20}}),
          P([R("شرح آیتم: ",{bold:true,size:19}), R(r.item,{size:19})],{spacing:{after:20}}),
        ];
        if(r.note) cellKids.push(P([R("توضیح ناظر: ",{bold:true,size:19,color:C.red}), R(r.note,{size:19})]));
        cells.push(new D.TableCell({ width:{size:50,type:D.WidthType.PERCENTAGE}, margins:{top:80,bottom:80,left:80,right:80},
          borders:cellBorders, verticalAlign:D.VerticalAlign.TOP, children:cellKids }));
        n++;
      }
    }
    // قراردادن سلول‌ها در سطرهای دوتایی
    const rows=[];
    for(let i=0;i<cells.length;i+=2){
      const pair=[cells[i]];
      pair.push(cells[i+1] || new D.TableCell({width:{size:50,type:D.WidthType.PERCENTAGE},borders:cellBorders,children:[P([R("")])]}));
      rows.push(new D.TableRow({children:pair}));
    }
    children.push(new D.Table({ visuallyRightToLeft:true, width:{size:100,type:D.WidthType.PERCENTAGE}, rows }));
  }

  const doc=new D.Document({
    styles:{ default:{ document:{ run:{font:FONT,size:22} } } },
    sections:[{ properties:{ page:{ margin:{top:720,bottom:720,left:720,right:720} } }, children }] });
  const blob=await D.Packer.toBlob(doc);
  downloadBlob(blob, `HSE_Visual_Report_${today()}.docx`);
  toast("فایل Word ساخته شد ✓");
}
function imgSize(blob){ return new Promise(res=>{ const u=URL.createObjectURL(blob); const i=new Image();
  i.onload=()=>{ res({w:i.naturalWidth,h:i.naturalHeight}); URL.revokeObjectURL(u); };
  i.onerror=()=>{ res({w:4,h:3}); URL.revokeObjectURL(u); }; i.src=u; }); }
function today(){ const t=jToday(); const f=n=>String(n).padStart(2,"0");
  return `${t.jy}-${f(t.jm)}-${f(t.jd)}`; }

init();
