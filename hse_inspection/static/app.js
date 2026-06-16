// ====== HSE Inspection Wizard ======
let CHECKLIST = null;
let ITEMS = [];
let idx = 0;                 // ایندکس ردیف فعلی
const STORE_KEY = "hse_session_v1";
let state = { building: {}, answers: {} };   // answers[row] = {status, note, photos:[]}

const $ = (s) => document.querySelector(s);
const screens = ["startScreen", "wizardScreen", "finishScreen"];

function show(id) {
  screens.forEach((s) => ($("#" + s).style.display = s === id ? "block" : "none"));
  window.scrollTo(0, 0);
}
function toast(msg) {
  const t = $("#toast");
  t.textContent = msg; t.classList.add("show");
  clearTimeout(t._t); t._t = setTimeout(() => t.classList.remove("show"), 2200);
}

// ---------- ذخیره / بازیابی ----------
function persist() {
  localStorage.setItem(STORE_KEY, JSON.stringify(state));
  // ذخیره سمت سرور هم برای پشتیبان
  fetch("/api/save", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify(state),
  }).catch(() => {});
}
function loadLocal() {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (raw) return JSON.parse(raw);
  } catch (e) {}
  return null;
}

// ---------- بارگذاری اولیه ----------
async function init() {
  const res = await fetch("/api/checklist");
  CHECKLIST = await res.json();
  ITEMS = CHECKLIST.items;

  const saved = loadLocal();
  if (saved && saved.answers && Object.keys(saved.answers).length) {
    $("#resumeBtn").style.display = "inline-block";
    $("#resumeBtn").onclick = () => {
      state = saved;
      fillBuildingInputs();
      idx = firstUnanswered();
      show("wizardScreen"); renderItem();
    };
  }

  $("#startBtn").onclick = () => {
    readBuildingInputs();
    idx = 0; show("wizardScreen"); renderItem();
  };
  $("#prevBtn").onclick = () => { saveCurrent(); if (idx > 0) { idx--; renderItem(); } };
  $("#nextBtn").onclick = onNext;
  $("#photoInput").onchange = onPhotoSelected;

  $("#excelBtn").onclick = () => download("/api/export/excel");
  $("#wordBtn").onclick = () => download("/api/export/word");
  $("#backWizardBtn").onclick = () => { idx = ITEMS.length - 1; show("wizardScreen"); renderItem(); };
  $("#resetBtn").onclick = () => {
    if (confirm("همه اطلاعات این بازدید پاک شود؟")) {
      localStorage.removeItem(STORE_KEY);
      state = { building: {}, answers: {} };
      location.reload();
    }
  };

  // وضعیت‌ها
  document.querySelectorAll(".status-btn").forEach((b) => {
    b.onclick = () => {
      document.querySelectorAll(".status-btn").forEach((x) => x.classList.remove("selected"));
      b.classList.add("selected");
      const row = ITEMS[idx].row;
      state.answers[row] = state.answers[row] || { photos: [] };
      state.answers[row].status = b.dataset.status;
    };
  });
}

// ---------- اطلاعات ساختمان ----------
function readBuildingInputs() {
  state.building = {
    name: $("#b_name").value, address: $("#b_address").value,
    date: $("#b_date").value, inspector: $("#b_inspector").value,
    code: $("#b_code").value, period: $("#b_period").value,
  };
  persist();
}
function fillBuildingInputs() {
  const b = state.building || {};
  $("#b_name").value = b.name || ""; $("#b_address").value = b.address || "";
  $("#b_date").value = b.date || ""; $("#b_inspector").value = b.inspector || "";
  $("#b_code").value = b.code || ""; $("#b_period").value = b.period || "";
}
function firstUnanswered() {
  for (let i = 0; i < ITEMS.length; i++)
    if (!(state.answers[ITEMS[i].row] && state.answers[ITEMS[i].row].status)) return i;
  return 0;
}

// ---------- رندر یک ردیف ----------
function renderItem() {
  const it = ITEMS[idx];
  const a = state.answers[it.row] || { photos: [] };

  $("#sectionTag").textContent = it.section;
  $("#counter").textContent = `${toFa(idx + 1)} / ${toFa(ITEMS.length)}`;
  $("#progressBar").style.width = ((idx + 1) / ITEMS.length * 100) + "%";
  $("#rowNum").textContent = toFa(it.row);
  $("#itemText").textContent = it.item;
  $("#refTag").textContent = it.ref ? "مرجع: " + it.ref : "";
  $("#refTag").style.display = it.ref ? "inline-block" : "none";
  $("#prioTag").textContent = it.priority ? "اولویت: " + it.priority : "";
  $("#prioTag").style.display = it.priority ? "inline-block" : "none";

  document.querySelectorAll(".status-btn").forEach((b) => {
    b.classList.toggle("selected", a.status === b.dataset.status);
  });
  $("#noteInput").value = a.note || "";
  renderPhotos();
  $("#uploadStatus").textContent = "";

  $("#nextBtn").textContent = idx === ITEMS.length - 1 ? "پایان و گزارش ✓" : "بعدی ▶";
  $("#prevBtn").style.visibility = idx === 0 ? "hidden" : "visible";
}

function saveCurrent() {
  const row = ITEMS[idx].row;
  state.answers[row] = state.answers[row] || { photos: [] };
  state.answers[row].note = $("#noteInput").value;
  persist();
}

function onNext() {
  const row = ITEMS[idx].row;
  const a = state.answers[row];
  if (!a || !a.status) { toast("لطفاً وضعیت این ردیف را انتخاب کنید"); return; }
  saveCurrent();
  if (idx === ITEMS.length - 1) { showFinish(); return; }
  idx++; renderItem();
}

// ---------- عکس‌ها ----------
function renderPhotos() {
  const a = state.answers[ITEMS[idx].row] || { photos: [] };
  const list = $("#photoList"); list.innerHTML = "";
  (a.photos || []).forEach((fn, i) => {
    const div = document.createElement("div");
    div.className = "photo-thumb";
    div.innerHTML = `<img src="/uploads/${fn}"><button title="حذف">×</button>`;
    div.querySelector("button").onclick = () => {
      a.photos.splice(i, 1); persist(); renderPhotos();
    };
    list.appendChild(div);
  });
}

async function onPhotoSelected(e) {
  const files = [...e.target.files];
  e.target.value = "";
  if (!files.length) return;
  const row = ITEMS[idx].row;
  state.answers[row] = state.answers[row] || { photos: [] };
  state.answers[row].photos = state.answers[row].photos || [];
  $("#uploadStatus").textContent = "در حال آپلود...";
  for (const file of files) {
    const fd = new FormData(); fd.append("photo", file);
    try {
      const r = await fetch("/api/upload", { method: "POST", body: fd });
      const j = await r.json();
      if (j.filename) state.answers[row].photos.push(j.filename);
      else toast(j.error || "خطا در آپلود");
    } catch (err) { toast("خطا در آپلود عکس"); }
  }
  $("#uploadStatus").textContent = "";
  persist(); renderPhotos();
}

// ---------- صفحه پایان ----------
function showFinish() {
  persist();
  let ok = 0, warn = 0, bad = 0, na = 0, scoreSum = 0, scoreMax = 0;
  ITEMS.forEach((it) => {
    const a = state.answers[it.row];
    if (!a || !a.status) return;
    if (a.status === "ok") { ok++; scoreSum += 3; scoreMax += 3; }
    else if (a.status === "warn") { warn++; scoreSum += 1; scoreMax += 3; }
    else if (a.status === "bad") { bad++; scoreMax += 3; }
    else if (a.status === "na") { na++; }
  });
  const answered = ok + warn + bad + na;
  const pct = scoreMax ? Math.round(scoreSum / scoreMax * 1000) / 10 : 0;
  const [level, color] = safetyLevel(pct);
  $("#summaryBox").innerHTML = `
    <div>تعداد آیتم پاسخ‌داده‌شده: <b>${toFa(answered)}</b> از ${toFa(ITEMS.length)}</div>
    <div>✅ مطلوب: <b>${toFa(ok)}</b> &nbsp; ⚠️ نیاز به بهبود: <b>${toFa(warn)}</b>
         &nbsp; ❌ نامطلوب: <b>${toFa(bad)}</b> &nbsp; N/A کاربرد ندارد: <b>${toFa(na)}</b></div>
    <div>درصد ایمنی: <span class="pill" style="background:${color}">${toFa(pct)}٪</span>
         سطح: <b>${level}</b></div>`;
  show("finishScreen");
}

function safetyLevel(p) {
  if (p >= 85) return ["ایمن – قابل قبول", "#d1fae5"];
  if (p >= 70) return ["متوسط – نیاز به توجه", "#fef3c7"];
  if (p >= 50) return ["ضعیف – اقدام فوری", "#fed7aa"];
  return ["بحرانی – مداخله اضطراری", "#fee2e2"];
}

// ---------- دانلود خروجی ----------
async function download(url) {
  readBuildingInputsIfStart();
  toast("در حال تولید فایل...");
  try {
    const r = await fetch(url, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify(state),
    });
    if (!r.ok) { toast("خطا در تولید فایل"); return; }
    const blob = await r.blob();
    const cd = r.headers.get("Content-Disposition") || "";
    const m = cd.match(/filename="?([^"]+)"?/);
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = m ? m[1] : "report";
    document.body.appendChild(a); a.click(); a.remove();
  } catch (e) { toast("خطا در ارتباط با سرور"); }
}
function readBuildingInputsIfStart() {
  if ($("#startScreen").style.display !== "none") readBuildingInputs();
}

// ---------- اعداد فارسی ----------
function toFa(n) {
  return String(n).replace(/\d/g, (d) => "۰۱۲۳۴۵۶۷۸۹"[d]);
}

init();
