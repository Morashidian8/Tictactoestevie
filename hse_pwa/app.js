// ====== HSE Inspection — Offline PWA ======
let CHECKLIST = null, ITEMS = [], idx = 0;
const STORE_KEY = "hse_pwa_v1";
let state = { building: {}, answers: {} };   // answers[row] = {status, note, photoIds:[]}
const objURLs = {};                          // photoId -> object URL (preview cache)

const $ = (s) => document.querySelector(s);
const screens = ["startScreen", "wizardScreen", "finishScreen"];
function show(id){ screens.forEach(s=>$("#"+s).style.display = s===id?"block":"none"); scrollTo(0,0); }
function toast(m){ const t=$("#toast"); t.textContent=m; t.classList.add("show");
  clearTimeout(t._t); t._t=setTimeout(()=>t.classList.remove("show"),2200); }
function toFa(n){ return String(n).replace(/\d/g,d=>"۰۱۲۳۴۵۶۷۸۹"[d]); }

// -------------------- IndexedDB (ذخیره عکس‌ها) --------------------
let _db;
function db(){
  if(_db) return Promise.resolve(_db);
  return new Promise((res,rej)=>{
    const r = indexedDB.open("hse_pwa", 1);
    r.onupgradeneeded = ()=> r.result.createObjectStore("photos");
    r.onsuccess = ()=>{ _db=r.result; res(_db); };
    r.onerror = ()=> rej(r.error);
  });
}
async function putPhoto(id, blob){ const d=await db();
  return new Promise((res,rej)=>{ const t=d.transaction("photos","readwrite");
    t.objectStore("photos").put(blob,id); t.oncomplete=res; t.onerror=()=>rej(t.error); }); }
async function getPhoto(id){ const d=await db();
  return new Promise((res,rej)=>{ const t=d.transaction("photos","readonly");
    const q=t.objectStore("photos").get(id); q.onsuccess=()=>res(q.result); q.onerror=()=>rej(q.error); }); }
async function delPhoto(id){ const d=await db();
  return new Promise((res)=>{ const t=d.transaction("photos","readwrite");
    t.objectStore("photos").delete(id); t.oncomplete=res; }); }

// -------------------- ذخیره وضعیت --------------------
function persist(){ localStorage.setItem(STORE_KEY, JSON.stringify(state)); }
function loadLocal(){ try{ const r=localStorage.getItem(STORE_KEY); if(r) return JSON.parse(r);}catch(e){} return null; }

// -------------------- راه‌اندازی --------------------
async function init(){
  CHECKLIST = await (await fetch("checklist_data.json")).json();
  ITEMS = CHECKLIST.items;

  const saved = loadLocal();
  if(saved && saved.answers && Object.keys(saved.answers).length){
    $("#resumeBtn").style.display="inline-block";
    $("#resumeBtn").onclick=()=>{ state=saved; fillBuilding(); idx=firstUnanswered(); show("wizardScreen"); renderItem(); };
  }
  $("#startBtn").onclick=()=>{ readBuilding(); idx=0; show("wizardScreen"); renderItem(); };
  $("#prevBtn").onclick=()=>{ saveCurrent(); if(idx>0){idx--; renderItem();} };
  $("#nextBtn").onclick=onNext;
  $("#cameraInput").onchange=onPhotoSelected;
  $("#folderInput").onchange=onPhotoSelected;
  $("#excelBtn").onclick=exportExcel;
  $("#wordBtn").onclick=exportWord;
  $("#backWizardBtn").onclick=()=>{ idx=ITEMS.length-1; show("wizardScreen"); renderItem(); };
  $("#resetBtn").onclick=async()=>{ if(confirm("همه اطلاعات این بازدید پاک شود؟")){
    localStorage.removeItem(STORE_KEY);
    const d=await db(); d.transaction("photos","readwrite").objectStore("photos").clear();
    state={building:{},answers:{}}; location.reload(); } };

  document.querySelectorAll(".status-btn").forEach(b=>{
    b.onclick=()=>{ document.querySelectorAll(".status-btn").forEach(x=>x.classList.remove("selected"));
      b.classList.add("selected");
      const row=ITEMS[idx].row;
      state.answers[row]=state.answers[row]||{photoIds:[]};
      state.answers[row].status=b.dataset.status; persist(); };
  });

  // نصب PWA
  if(!window.matchMedia("(display-mode: standalone)").matches) $("#installHint").style.display="block";
  if("serviceWorker" in navigator) navigator.serviceWorker.register("sw.js").catch(()=>{});
}

function readBuilding(){ state.building={ name:$("#b_name").value, address:$("#b_address").value,
  date:$("#b_date").value, inspector:$("#b_inspector").value, code:$("#b_code").value, period:$("#b_period").value }; persist(); }
function fillBuilding(){ const b=state.building||{}; $("#b_name").value=b.name||""; $("#b_address").value=b.address||"";
  $("#b_date").value=b.date||""; $("#b_inspector").value=b.inspector||""; $("#b_code").value=b.code||""; $("#b_period").value=b.period||""; }
function firstUnanswered(){ for(let i=0;i<ITEMS.length;i++) if(!(state.answers[ITEMS[i].row]&&state.answers[ITEMS[i].row].status)) return i; return 0; }

// -------------------- رندر ردیف --------------------
function renderItem(){
  const it=ITEMS[idx], a=state.answers[it.row]||{photoIds:[]};
  $("#sectionTag").textContent=it.section;
  $("#counter").textContent=`${toFa(idx+1)} / ${toFa(ITEMS.length)}`;
  $("#progressBar").style.width=((idx+1)/ITEMS.length*100)+"%";
  $("#rowNum").textContent=toFa(it.row);
  $("#itemText").textContent=it.item;
  $("#refTag").textContent=it.ref?"مرجع: "+it.ref:""; $("#refTag").style.display=it.ref?"inline-block":"none";
  $("#prioTag").textContent=it.priority?"اولویت: "+it.priority:""; $("#prioTag").style.display=it.priority?"inline-block":"none";
  document.querySelectorAll(".status-btn").forEach(b=>b.classList.toggle("selected", a.status===b.dataset.status));
  $("#noteInput").value=a.note||"";
  renderPhotos();
  $("#nextBtn").textContent = idx===ITEMS.length-1 ? "پایان و گزارش ✓" : "بعدی ▶";
  $("#prevBtn").style.visibility = idx===0 ? "hidden":"visible";
}
function saveCurrent(){ const row=ITEMS[idx].row; state.answers[row]=state.answers[row]||{photoIds:[]};
  state.answers[row].note=$("#noteInput").value; persist(); }
function onNext(){ const row=ITEMS[idx].row, a=state.answers[row];
  if(!a||!a.status){ toast("لطفاً وضعیت این ردیف را انتخاب کنید"); return; }
  saveCurrent(); if(idx===ITEMS.length-1){ showFinish(); return; } idx++; renderItem(); }

// -------------------- عکس‌ها --------------------
async function renderPhotos(){
  const a=state.answers[ITEMS[idx].row]||{photoIds:[]}; const list=$("#photoList"); list.innerHTML="";
  for(let i=0;i<(a.photoIds||[]).length;i++){
    const id=a.photoIds[i];
    let url=objURLs[id];
    if(!url){ const blob=await getPhoto(id); if(blob){ url=URL.createObjectURL(blob); objURLs[id]=url; } }
    const div=document.createElement("div"); div.className="photo-thumb";
    div.innerHTML=`<img src="${url||""}"><button title="حذف">×</button>`;
    div.querySelector("button").onclick=async()=>{ a.photoIds.splice(i,1); await delPhoto(id);
      if(objURLs[id]){ URL.revokeObjectURL(objURLs[id]); delete objURLs[id]; } persist(); renderPhotos(); };
    list.appendChild(div);
  }
}
async function onPhotoSelected(e){
  const files=[...e.target.files]; e.target.value=""; if(!files.length) return;
  const row=ITEMS[idx].row; state.answers[row]=state.answers[row]||{photoIds:[]};
  state.answers[row].photoIds=state.answers[row].photoIds||[];
  for(const f of files){ const id="p_"+Date.now()+"_"+Math.random().toString(36).slice(2,8);
    const blob=await downscale(f); await putPhoto(id, blob); state.answers[row].photoIds.push(id); }
  persist(); renderPhotos();
}
// کاهش حجم عکس برای ذخیره و گزارش
function downscale(file, max=1280, q=0.8){
  return new Promise((res)=>{ const img=new Image(); const u=URL.createObjectURL(file);
    img.onload=()=>{ let{width:w,height:h}=img; if(w>max||h>max){ const r=Math.min(max/w,max/h); w=Math.round(w*r); h=Math.round(h*r);}
      const c=document.createElement("canvas"); c.width=w; c.height=h; c.getContext("2d").drawImage(img,0,0,w,h);
      URL.revokeObjectURL(u); c.toBlob(b=>res(b||file),"image/jpeg",q); };
    img.onerror=()=>{ URL.revokeObjectURL(u); res(file); }; img.src=u; });
}

// -------------------- صفحه پایان --------------------
const STATUS={ ok:{label:"مطلوب",sym:"✅",score:3}, warn:{label:"نیاز به بهبود",sym:"⚠️",score:1},
  bad:{label:"نامطلوب",sym:"❌",score:0}, na:{label:"کاربرد ندارد",sym:"N/A",score:null} };
function safety(p){ if(p>=85)return["ایمن – قابل قبول","C6EFCE","#d1fae5"]; if(p>=70)return["متوسط – نیاز به توجه","FFEB9C","#fef3c7"];
  if(p>=50)return["ضعیف – اقدام فوری","FCD5B4","#fed7aa"]; return["بحرانی – مداخله اضطراری","FFC7CE","#fee2e2"]; }
function showFinish(){
  persist(); let ok=0,warn=0,bad=0,na=0,sum=0,max=0;
  ITEMS.forEach(it=>{ const a=state.answers[it.row]; if(!a||!a.status) return;
    if(a.status==="ok"){ok++;sum+=3;max+=3;} else if(a.status==="warn"){warn++;sum+=1;max+=3;}
    else if(a.status==="bad"){bad++;max+=3;} else if(a.status==="na"){na++;} });
  const answered=ok+warn+bad+na, pct=max?Math.round(sum/max*1000)/10:0, [lvl,,col]=safety(pct);
  $("#summaryBox").innerHTML=`
    <div>تعداد آیتم پاسخ‌داده‌شده: <b>${toFa(answered)}</b> از ${toFa(ITEMS.length)}</div>
    <div>✅ مطلوب: <b>${toFa(ok)}</b> &nbsp; ⚠️ نیاز به بهبود: <b>${toFa(warn)}</b>
         &nbsp; ❌ نامطلوب: <b>${toFa(bad)}</b> &nbsp; N/A: <b>${toFa(na)}</b></div>
    <div>درصد ایمنی: <span class="pill" style="background:${col}">${toFa(pct)}٪</span> سطح: <b>${lvl}</b></div>`;
  show("finishScreen");
}

// گردآوری ردیف‌های پاسخ‌داده‌شده
function collectRows(){
  const rows=[];
  for(const it of ITEMS){ const a=state.answers[it.row]; if(!a||!a.status) continue;
    const sm=STATUS[a.status]; rows.push({ row:it.row, section:it.section, item:it.item, ref:it.ref||"",
      priority:it.priority||"", status:a.status, label:sm.label, sym:sm.sym, score:sm.score,
      note:(a.note||"").trim(), photoIds:a.photoIds||[] }); }
  return rows;
}

// -------------------- خروجی Excel (حذف N/A) --------------------
async function exportExcel(){
  toast("در حال ساخت Excel...");
  const ExcelJS=window.ExcelJS; const wb=new ExcelJS.Workbook(); const ws=wb.addWorksheet("گزارش بازدید",{views:[{rightToLeft:true}]});
  const b=state.building||{};
  ws.mergeCells("A1:I1"); const t=ws.getCell("A1"); t.value="گزارش بازدید ایمنی و آتش‌نشانی ساختمان";
  t.font={bold:true,size:14,color:{argb:"FFFFFFFF"}}; t.alignment={horizontal:"center",vertical:"middle"};
  t.fill={type:"pattern",pattern:"solid",fgColor:{argb:"FF1F4E78"}}; ws.getRow(1).height=26;
  const info=[["نام ساختمان / پروژه",b.name||""],["آدرس",b.address||""],["تاریخ بازدید",b.date||""],
    ["بازرس HSE",b.inspector||""],["کد ساختمان",b.code||""],["دوره بازدید",b.period||""]];
  let r=2; for(let i=0;i<info.length;i+=2){ ws.getCell(r,1).value=info[i][0]; ws.getCell(r,1).font={bold:true};
    ws.getCell(r,2).value=info[i][1]; if(info[i+1]){ ws.getCell(r,4).value=info[i+1][0]; ws.getCell(r,4).font={bold:true};
    ws.getCell(r,5).value=info[i+1][1]; } r++; }
  const head=["ردیف","حوزه","شرح آیتم","مرجع قانونی","وضعیت","مغایرت / توضیح","اولویت","امتیاز","تعداد عکس"];
  const hr=r+1; head.forEach((h,i)=>{ const c=ws.getCell(hr,i+1); c.value=h; c.font={bold:true,color:{argb:"FFFFFFFF"}};
    c.fill={type:"pattern",pattern:"solid",fgColor:{argb:"FF2E75B6"}}; c.alignment={horizontal:"center",vertical:"middle",wrapText:true}; });
  const fillMap={ok:"FFC6EFCE",warn:"FFFFEB9C",bad:"FFFFC7CE"};
  let rr=hr+1; const scored=[];
  for(const row of collectRows()){ if(row.status==="na") continue;   // حذف موارد کاربرد ندارد
    const vals=[row.row,row.section,row.item,row.ref,`${row.sym} ${row.label}`,row.note,row.priority,
      row.score==null?"":row.score, row.photoIds.length];
    vals.forEach((v,i)=>{ const c=ws.getCell(rr,i+1); c.value=v;
      c.alignment={vertical:"middle",wrapText:true,horizontal:[1,2,3,5].includes(i)?"right":"center"};
      c.border={top:{style:"thin",color:{argb:"FFB0B0B0"}},left:{style:"thin",color:{argb:"FFB0B0B0"}},
        right:{style:"thin",color:{argb:"FFB0B0B0"}},bottom:{style:"thin",color:{argb:"FFB0B0B0"}}}; });
    if(fillMap[row.status]) ws.getCell(rr,5).fill={type:"pattern",pattern:"solid",fgColor:{argb:fillMap[row.status]}};
    if(row.score!=null) scored.push(row.score); rr++; }
  if(scored.length){ const total=scored.reduce((a,b)=>a+b,0), maxp=scored.length*3, pct=maxp?Math.round(total/maxp*1000)/10:0;
    ws.getCell(rr+1,3).value="جمع امتیاز کسب‌شده"; ws.getCell(rr+1,3).font={bold:true}; ws.getCell(rr+1,8).value=total; ws.getCell(rr+1,8).font={bold:true};
    ws.getCell(rr+2,3).value="حداکثر امتیاز ممکن"; ws.getCell(rr+2,3).font={bold:true}; ws.getCell(rr+2,8).value=maxp; ws.getCell(rr+2,8).font={bold:true};
    ws.getCell(rr+3,3).value="درصد ایمنی"; ws.getCell(rr+3,3).font={bold:true}; ws.getCell(rr+3,8).value=pct+"%"; ws.getCell(rr+3,8).font={bold:true};
    const [lvl,argb]=safety(pct); const lc=ws.getCell(rr+3,4); lc.value=lvl; lc.font={bold:true};
    lc.fill={type:"pattern",pattern:"solid",fgColor:{argb:"FF"+argb}}; }
  [7,26,45,20,16,35,10,9,10].forEach((w,i)=>ws.getColumn(i+1).width=w);
  const buf=await wb.xlsx.writeBuffer();
  saveAs(new Blob([buf],{type:"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"}),
    `HSE_Report_${today()}.xlsx`);
}

// -------------------- خروجی Word (گزارش تصویری) --------------------
async function exportWord(){
  toast("در حال ساخت Word...");
  const D=window.docx; const b=state.building||{};
  const C={blue:"1F4E78",red:"C00000",amber:"BF8F00",green:"008000",gray:"606060"};
  const P=(children,opts={})=> new D.Paragraph(Object.assign({bidirectional:true,alignment:D.AlignmentType.RIGHT,children},opts));
  const R=(text,o={})=> new D.TextRun(Object.assign({text,font:"B Nazanin",rightToLeft:true},o));
  const kids=[];
  kids.push(P([R("گزارش تصویری بازدید ایمنی و آتش‌نشانی ساختمان",{bold:true,size:36,color:C.blue})]));
  [["نام ساختمان / پروژه",b.name],["آدرس",b.address],["تاریخ بازدید",b.date],
   ["بازرس HSE",b.inspector],["کد ساختمان",b.code],["دوره بازدید",b.period]].forEach(([k,v])=>{
    if(v) kids.push(P([R(k+": ",{bold:true,size:24}),R(String(v),{size:24})])); });

  const rows=collectRows().filter(r=>r.status!=="na" && (r.status==="bad"||r.status==="warn"||r.photoIds.length||r.note));
  kids.push(P([R(`تعداد موارد دارای ایراد / نیازمند توجه: ${rows.length}`,{bold:true,size:26,color:C.red})]));
  kids.push(P([R("")]));

  let n=1;
  for(const r of rows){
    kids.push(P([R(`${n}) ردیف ${r.row} – ${r.section}`,{bold:true,size:26,color:C.blue})]));
    kids.push(P([R("شرح آیتم: ",{bold:true,size:24}),R(r.item,{size:24})]));
    const sc={bad:C.red,warn:C.amber,ok:C.green}[r.status];
    const sr=[R("وضعیت: ",{bold:true,size:24}),R(`${r.sym} ${r.label}`,{bold:true,size:24,color:sc})];
    if(r.priority) sr.push(R(`   |   اولویت اصلاح: ${r.priority}`,{size:24}));
    kids.push(P(sr));
    if(r.note) kids.push(P([R("توضیح ناظر: ",{bold:true,size:24}),R(r.note,{size:24})]));
    for(const id of r.photoIds){ const blob=await getPhoto(id); if(!blob) continue;
      const buf=await blob.arrayBuffer(); const dim=await imgSize(blob);
      const w=420, h=Math.round(w*(dim.h/dim.w||0.66));
      kids.push(new D.Paragraph({alignment:D.AlignmentType.CENTER, children:[
        new D.ImageRun({data:buf, transformation:{width:w,height:h}}) ]}));
      const cap=r.note||r.item;
      kids.push(new D.Paragraph({alignment:D.AlignmentType.CENTER,bidirectional:true,
        children:[R(`تصویر مورد ${r.row}: ${cap}`,{size:20,color:C.gray})]}));
    }
    kids.push(new D.Paragraph({alignment:D.AlignmentType.CENTER,children:[R("ـ".repeat(30),{size:20,color:"C0C0C0"})]}));
    n++;
  }
  const doc=new D.Document({ styles:{default:{document:{run:{font:"B Nazanin"}}}},
    sections:[{ properties:{}, children:kids }] });
  const blob=await D.Packer.toBlob(doc);
  saveAs(blob, `HSE_Visual_Report_${today()}.docx`);
}
function imgSize(blob){ return new Promise(res=>{ const u=URL.createObjectURL(blob); const i=new Image();
  i.onload=()=>{ res({w:i.naturalWidth,h:i.naturalHeight}); URL.revokeObjectURL(u); };
  i.onerror=()=>{ res({w:4,h:3}); URL.revokeObjectURL(u); }; i.src=u; }); }
function today(){ const d=new Date(); return d.toISOString().slice(0,10); }

init();
