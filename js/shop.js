/* ============================================================
   ایمن‌گستر آریا — فروشگاه تجهیزات ایمنی و آتش‌نشانی
   ============================================================ */

(function () {
  "use strict";

  var fa = window.toPersianDigits;

  function formatPrice(value) {
    return fa(value.toLocaleString("en-US").replace(/,/g, "٬"));
  }

  /* ---------- تصاویر برداری محصولات ---------- */
  var ART = {
    tile: function (inner, from, to) {
      return (
        '<svg viewBox="0 0 200 200" xmlns="http://www.w3.org/2000/svg" role="img">' +
        '<defs><linearGradient id="g' + from.slice(1) + to.slice(1) + '" x1="0" y1="0" x2="1" y2="1">' +
        '<stop offset="0" stop-color="' + from + '"/><stop offset="1" stop-color="' + to + '"/></linearGradient></defs>' +
        '<rect width="200" height="200" rx="24" fill="url(#g' + from.slice(1) + to.slice(1) + ')"/>' +
        '<circle cx="166" cy="34" r="46" fill="rgba(255,255,255,.07)"/>' +
        '<circle cx="22" cy="178" r="60" fill="rgba(255,255,255,.05)"/>' +
        inner +
        "</svg>"
      );
    }
  };

  var SVGS = {
    extinguisher:
      '<g><rect x="78" y="62" width="44" height="98" rx="14" fill="#e8442e"/>' +
      '<rect x="78" y="92" width="44" height="10" fill="#ffffff" opacity=".85"/>' +
      '<rect x="88" y="46" width="24" height="18" rx="4" fill="#33394a"/>' +
      '<rect x="80" y="36" width="40" height="9" rx="4.5" fill="#33394a"/>' +
      '<circle cx="100" cy="78" r="9" fill="#fff"/><circle cx="100" cy="78" r="5" fill="#ffd166"/>' +
      '<path d="M88 46 C66 52 60 78 62 104" stroke="#33394a" stroke-width="7" fill="none" stroke-linecap="round"/>' +
      '<path d="M58 104 h10 l-3 16 h-6 z" fill="#33394a"/></g>',
    co2:
      '<g><rect x="80" y="58" width="40" height="104" rx="13" fill="#b8271a"/>' +
      '<rect x="80" y="118" width="40" height="8" fill="#ffffff" opacity=".7"/>' +
      '<rect x="90" y="42" width="20" height="18" rx="4" fill="#2b3142"/>' +
      '<rect x="83" y="33" width="34" height="8" rx="4" fill="#2b3142"/>' +
      '<path d="M90 44 C64 50 52 66 52 88 l0 14" stroke="#2b3142" stroke-width="7" fill="none" stroke-linecap="round"/>' +
      '<path d="M40 100 L64 100 L58 134 L46 134 Z" fill="#3a4156"/></g>',
    smoke:
      '<g><circle cx="100" cy="100" r="56" fill="#f4f6fb"/><circle cx="100" cy="100" r="56" fill="none" stroke="#dde2ee" stroke-width="3"/>' +
      '<circle cx="100" cy="100" r="40" fill="#e8ecf5"/><circle cx="100" cy="100" r="40" fill="none" stroke="#cfd6e6" stroke-width="2"/>' +
      '<g stroke="#aab3c8" stroke-width="3" stroke-linecap="round">' +
      '<path d="M72 92 a30 30 0 0 1 14 -14"/><path d="M114 122 a30 30 0 0 0 14 -14"/></g>' +
      '<circle cx="100" cy="100" r="13" fill="#fff" stroke="#cfd6e6" stroke-width="2"/>' +
      '<circle cx="121" cy="84" r="4.5" fill="#e8442e"/></g>',
    heat:
      '<g><circle cx="100" cy="100" r="54" fill="#fff"/><circle cx="100" cy="100" r="54" fill="none" stroke="#f3d9d4" stroke-width="4"/>' +
      '<circle cx="100" cy="100" r="36" fill="#fdeeea"/>' +
      '<path d="M100 76 v30" stroke="#e8442e" stroke-width="7" stroke-linecap="round"/>' +
      '<circle cx="100" cy="118" r="10" fill="#e8442e"/>' +
      '<circle cx="124" cy="80" r="4.5" fill="#ff9f43"/></g>',
    panel:
      '<g><rect x="48" y="46" width="104" height="108" rx="12" fill="#2b3142"/>' +
      '<rect x="60" y="60" width="80" height="34" rx="6" fill="#9fe3c2"/>' +
      '<rect x="66" y="68" width="48" height="5" rx="2.5" fill="#27ae60"/>' +
      '<rect x="66" y="78" width="32" height="5" rx="2.5" fill="#27ae60" opacity=".7"/>' +
      '<g><circle cx="68" cy="112" r="6" fill="#e8442e"/><circle cx="88" cy="112" r="6" fill="#ffd166"/><circle cx="108" cy="112" r="6" fill="#27ae60"/></g>' +
      '<rect x="60" y="128" width="80" height="14" rx="7" fill="#3a4156"/></g>',
    callpoint:
      '<g><rect x="56" y="56" width="88" height="88" rx="12" fill="#e8442e"/>' +
      '<rect x="56" y="56" width="88" height="88" rx="12" fill="none" stroke="#c4301c" stroke-width="3"/>' +
      '<rect x="70" y="70" width="60" height="60" rx="8" fill="#fff"/>' +
      '<rect x="78" y="86" width="44" height="28" rx="4" fill="#e8442e" opacity=".9"/>' +
      '<rect x="84" y="94" width="32" height="4" rx="2" fill="#fff"/><rect x="84" y="102" width="22" height="4" rx="2" fill="#fff"/></g>',
    siren:
      '<g><path d="M70 124 a30 30 0 0 1 60 0 z" fill="#e8442e"/>' +
      '<path d="M76 124 a24 24 0 0 1 48 0 z" fill="#ff6b54"/>' +
      '<rect x="58" y="124" width="84" height="16" rx="8" fill="#2b3142"/>' +
      '<g stroke="#ffd166" stroke-width="5" stroke-linecap="round">' +
      '<path d="M100 66 v-14"/><path d="M68 78 l-10 -10"/><path d="M132 78 l10 -10"/></g></g>',
    hosebox:
      '<g><rect x="50" y="54" width="100" height="92" rx="10" fill="#e8442e"/>' +
      '<rect x="58" y="62" width="84" height="76" rx="7" fill="#fff"/>' +
      '<circle cx="100" cy="100" r="28" fill="#e8442e"/><circle cx="100" cy="100" r="18" fill="#fff"/>' +
      '<circle cx="100" cy="100" r="18" fill="none" stroke="#e8442e" stroke-width="4" stroke-dasharray="6 5"/>' +
      '<circle cx="100" cy="100" r="6" fill="#2b3142"/>' +
      '<rect x="86" y="146" width="28" height="12" rx="4" fill="#2b3142"/></g>',
    helmet:
      '<g><path d="M52 116 a48 48 0 0 1 96 0 z" fill="#ffd166"/>' +
      '<path d="M94 64 h12 v52 h-12 z" fill="#f2b53d"/>' +
      '<rect x="42" y="112" width="116" height="14" rx="7" fill="#e8a020"/>' +
      '<path d="M64 126 q36 26 72 0 l0 10 q-36 22 -72 0 z" fill="#33394a"/></g>',
    blanket:
      '<g><rect x="58" y="50" width="84" height="100" rx="12" fill="#e8442e"/>' +
      '<rect x="58" y="50" width="84" height="100" rx="12" fill="none" stroke="#c4301c" stroke-width="3"/>' +
      '<rect x="72" y="64" width="56" height="40" rx="6" fill="#fff"/>' +
      '<path d="M93 76 c2 -7 9 -7 9 -1 c0 5 -6 6 -6 11 m0 6 v1" stroke="#e8442e" stroke-width="5" fill="none" stroke-linecap="round"/>' +
      '<rect x="86" y="118" width="28" height="20" rx="4" fill="#fff" opacity=".85"/>' +
      '<path d="M100 150 v-12" stroke="#fff" stroke-width="5" stroke-linecap="round"/></g>',
    exit:
      '<g><rect x="44" y="64" width="112" height="72" rx="10" fill="#1d9b62"/>' +
      '<rect x="44" y="64" width="112" height="72" rx="10" fill="none" stroke="#147a4b" stroke-width="3"/>' +
      '<circle cx="86" cy="84" r="6" fill="#fff"/>' +
      '<path d="M84 92 l8 8 l-4 18 m4 -18 l10 -4 m-18 4 l-8 14" stroke="#fff" stroke-width="5" fill="none" stroke-linecap="round" stroke-linejoin="round"/>' +
      '<path d="M118 100 h22 m-8 -8 l8 8 l-8 8" stroke="#fff" stroke-width="5" fill="none" stroke-linecap="round" stroke-linejoin="round"/></g>',
    firstaid:
      '<g><rect x="52" y="62" width="96" height="80" rx="12" fill="#fff"/>' +
      '<rect x="52" y="62" width="96" height="80" rx="12" fill="none" stroke="#dde2ee" stroke-width="3"/>' +
      '<rect x="84" y="50" width="32" height="14" rx="6" fill="#dde2ee"/>' +
      '<path d="M100 82 v40 M80 102 h40" stroke="#e8442e" stroke-width="13" stroke-linecap="round"/></g>',
    gloves:
      '<g><path d="M82 142 v-52 a8 8 0 0 1 16 0 v-12 a8 8 0 0 1 16 0 v14 a7 7 0 0 1 14 0 v32 q0 26 -23 26 h-23 z" fill="#ff9f43" transform="translate(-4 0)"/>' +
      '<path d="M78 96 a8 8 0 0 0 -14 6 l8 22" fill="#ff9f43"/>' +
      '<rect x="74" y="138" width="52" height="16" rx="6" fill="#e8442e"/></g>'
  };

  /* ---------- داده محصولات ---------- */
  var PRODUCTS = [
    { id: 1, name: "کپسول آتش‌نشانی پودر و گاز ۶ کیلوگرمی", cat: "کپسول", price: 1850000, oldPrice: 2200000, rating: 4.8, votes: 312, badge: "پرفروش", art: ART.tile(SVGS.extinguisher, "#fdf1ee", "#fbdcd5"), desc: "مناسب حریق‌های نوع A، B و C — همراه گارانتی و شارژ اولیه" },
    { id: 2, name: "کپسول CO2 سه کیلوگرمی", cat: "کپسول", price: 2950000, oldPrice: 3300000, rating: 4.7, votes: 187, badge: "", art: ART.tile(SVGS.co2, "#f1f3f9", "#dfe4f0"), desc: "ویژه تجهیزات برقی و الکترونیکی — بدون باقی‌ماندن اثر" },
    { id: 3, name: "کپسول آب و گاز ۱۰ لیتری", cat: "کپسول", price: 2350000, oldPrice: 0, rating: 4.5, votes: 96, badge: "", art: ART.tile(SVGS.extinguisher, "#eef4fd", "#d8e6fa"), desc: "مناسب حریق نوع A — جامدات قابل اشتعال مانند چوب و کاغذ" },
    { id: 4, name: "دتکتور دود فتوالکتریک", cat: "اعلام حریق", price: 980000, oldPrice: 1150000, rating: 4.9, votes: 421, badge: "پیشنهاد ویژه", art: ART.tile(SVGS.smoke, "#f3f5fa", "#e2e7f2"), desc: "تشخیص سریع دود — سازگار با پنل‌های متعارف، استاندارد EN 54-7" },
    { id: 5, name: "دتکتور حرارتی ثابت / افزایشی", cat: "اعلام حریق", price: 890000, oldPrice: 0, rating: 4.6, votes: 154, badge: "", art: ART.tile(SVGS.heat, "#fdf3ef", "#fbe2d8"), desc: "مناسب آشپزخانه و پارکینگ — آستانه دمایی ۵۷ درجه" },
    { id: 6, name: "پنل اعلام حریق ۴ زون", cat: "اعلام حریق", price: 7800000, oldPrice: 8500000, rating: 4.8, votes: 88, badge: "", art: ART.tile(SVGS.panel, "#f1f3f9", "#dde3f0"), desc: "پنل متعارف ۴ زون با خروجی آژیر و رله — استاندارد EN 54-2" },
    { id: 7, name: "شستی اعلام حریق", cat: "اعلام حریق", price: 540000, oldPrice: 620000, rating: 4.7, votes: 203, badge: "", art: ART.tile(SVGS.callpoint, "#fdf1ee", "#fadfd7"), desc: "شستی اضطراری قابل بازنشانی — نصب توکار و روکار" },
    { id: 8, name: "آژیر فلاشر اعلام حریق", cat: "اعلام حریق", price: 760000, oldPrice: 0, rating: 4.6, votes: 167, badge: "", art: ART.tile(SVGS.siren, "#fff7ec", "#fde8c8"), desc: "آژیر ۱۰۵ دسی‌بل با فلاشر LED قرمز — مصرف کم" },
    { id: 9, name: "جعبه آتش‌نشانی با هوزریل", cat: "تجهیزات اطفاء", price: 5400000, oldPrice: 6100000, rating: 4.7, votes: 74, badge: "", art: ART.tile(SVGS.hosebox, "#fdf1ee", "#f9ded6"), desc: "جعبه فولادی با قرقره و شیلنگ ۲۰ متری — رنگ کوره‌ای" },
    { id: 10, name: "کلاه ایمنی آتش‌نشانی", cat: "حفاظت فردی", price: 1650000, oldPrice: 0, rating: 4.8, votes: 59, badge: "", art: ART.tile(SVGS.helmet, "#fff8eb", "#fdecc8"), desc: "مقاوم در برابر حرارت و ضربه — همراه محافظ گردن" },
    { id: 11, name: "پتوی نسوز اطفاء حریق", cat: "تجهیزات اطفاء", price: 720000, oldPrice: 850000, rating: 4.9, votes: 246, badge: "پرفروش", art: ART.tile(SVGS.blanket, "#fdf1ee", "#fbdcd5"), desc: "پتوی فایبرگلاس ۱.۲×۱.۲ متر — ضروری برای هر آشپزخانه" },
    { id: 12, name: "دستکش نسوز عملیاتی", cat: "حفاظت فردی", price: 1280000, oldPrice: 0, rating: 4.5, votes: 81, badge: "", art: ART.tile(SVGS.gloves, "#fff7ec", "#fde9cb"), desc: "مقاوم تا ۵۰۰ درجه — مناسب کار صنعتی و امداد" },
    { id: 13, name: "تابلو خروج اضطراری LED", cat: "علائم ایمنی", price: 980000, oldPrice: 1100000, rating: 4.7, votes: 134, badge: "", art: ART.tile(SVGS.exit, "#eefaf3", "#d4f2e2"), desc: "تابلو اضطراری با باتری پشتیبان ۳ ساعته — نصب آسان" },
    { id: 14, name: "جعبه کمک‌های اولیه دیواری", cat: "علائم ایمنی", price: 1450000, oldPrice: 1700000, rating: 4.8, votes: 197, badge: "", art: ART.tile(SVGS.firstaid, "#f3f5fa", "#e2e7f2"), desc: "پک کامل ۴۲ قلم — مطابق الزامات HSE کارگاه‌ها" }
  ];

  var CATEGORIES = ["همه", "کپسول", "اعلام حریق", "تجهیزات اطفاء", "حفاظت فردی", "علائم ایمنی"];

  /* ---------- تصاویر واقعی محصولات (کلیدواژه‌محور) ----------
     عکس واقعی از سرویس loremflickr بارگذاری می‌شود؛ در صورت در دسترس
     نبودن، به‌صورت خودکار تصویر برداری اختصاصی هر محصول جایگزین می‌شود. */
  var PHOTO_KW = {
    1: "fire,extinguisher", 2: "co2,fire,extinguisher", 3: "fire,extinguisher,red",
    4: "smoke,detector", 5: "fire,detector,ceiling", 6: "fire,alarm,control",
    7: "fire,alarm,button", 8: "alarm,siren", 9: "fire,hose,reel",
    10: "firefighter,helmet", 11: "fire,blanket", 12: "safety,gloves",
    13: "exit,sign", 14: "first,aid,kit"
  };
  var artMap = {};
  PRODUCTS.forEach(function (p) { artMap[p.id] = p.art; });

  function photoURL(id) {
    return "https://loremflickr.com/500/500/" + encodeURIComponent(PHOTO_KW[id] || "fire,safety") + "?lock=" + id;
  }
  function artHTML(p) {
    return (
      '<img class="p-photo" src="' + photoURL(p.id) + '" alt="' + p.name +
      '" loading="lazy" data-art-id="' + p.id + '">'
    );
  }
  // جایگزینی تصویر با گرافیک برداری در صورت بروز خطا در بارگذاری
  document.addEventListener("error", function (e) {
    var img = e.target;
    if (img && img.classList && img.classList.contains("p-photo")) {
      var id = img.getAttribute("data-art-id");
      var wrap = img.parentNode;
      if (wrap && artMap[id]) wrap.innerHTML = artMap[id];
    }
  }, true);

  /* ---------- وضعیت ---------- */
  var state = {
    cat: "همه",
    query: "",
    sort: "popular",
    cart: loadCart()
  };

  function loadCart() {
    try {
      return JSON.parse(localStorage.getItem("iga-cart")) || {};
    } catch (e) {
      return {};
    }
  }
  function saveCart() {
    localStorage.setItem("iga-cart", JSON.stringify(state.cart));
  }

  /* ---------- عناصر ---------- */
  var grid = document.getElementById("productGrid");
  var chipsBox = document.getElementById("catChips");
  var searchInput = document.getElementById("shopSearch");
  var sortSelect = document.getElementById("shopSort");
  var emptyBox = document.getElementById("shopEmpty");
  var resultCount = document.getElementById("resultCount");

  var cartBtn = document.getElementById("cartBtn");
  var cartBadge = document.getElementById("cartBadge");
  var drawer = document.getElementById("cartDrawer");
  var drawerOverlay = document.getElementById("drawerOverlay");
  var drawerClose = document.getElementById("drawerClose");
  var cartItemsBox = document.getElementById("cartItems");
  var cartTotalEl = document.getElementById("cartTotal");
  var checkoutBtn = document.getElementById("checkoutBtn");

  var checkoutModal = document.getElementById("checkoutModal");
  var checkoutForm = document.getElementById("checkoutForm");
  var checkoutClose = document.getElementById("checkoutClose");
  var checkoutSuccess = document.getElementById("checkoutSuccess");
  var orderCodeEl = document.getElementById("orderCode");

  var toastBox = document.getElementById("toastBox");

  /* ---------- رندر فیلتر دسته‌ها ---------- */
  function renderChips() {
    chipsBox.innerHTML = CATEGORIES.map(function (c) {
      return '<button class="cat-chip' + (state.cat === c ? " is-active" : "") + '" data-cat="' + c + '">' + c + "</button>";
    }).join("");
  }
  chipsBox.addEventListener("click", function (e) {
    var btn = e.target.closest("[data-cat]");
    if (!btn) return;
    state.cat = btn.dataset.cat;
    renderChips();
    renderGrid();
  });

  /* ---------- رندر محصولات ---------- */
  function visibleProducts() {
    var list = PRODUCTS.filter(function (p) {
      var okCat = state.cat === "همه" || p.cat === state.cat;
      var okQuery = !state.query || (p.name + " " + p.desc).indexOf(state.query) !== -1;
      return okCat && okQuery;
    });
    var sorters = {
      popular: function (a, b) { return b.votes - a.votes; },
      cheap: function (a, b) { return a.price - b.price; },
      expensive: function (a, b) { return b.price - a.price; },
      discount: function (a, b) { return discountOf(b) - discountOf(a); }
    };
    return list.sort(sorters[state.sort] || sorters.popular);
  }

  function discountOf(p) {
    return p.oldPrice ? Math.round((1 - p.price / p.oldPrice) * 100) : 0;
  }

  function starHTML(rating, votes) {
    return (
      '<span class="p-rating"><svg viewBox="0 0 24 24"><path d="M12 17.3 6.2 20.6l1.6-6.6L2.6 9.6l6.7-.6L12 2.8l2.7 6.2 6.7.6-5.2 4.4 1.6 6.6z"/></svg>' +
      fa(rating) + " <small>(" + fa(votes) + " نظر)</small></span>"
    );
  }

  function renderGrid() {
    var list = visibleProducts();
    resultCount.textContent = fa(list.length) + " کالا";
    emptyBox.classList.toggle("is-hidden", list.length > 0);

    grid.innerHTML = list.map(function (p) {
      var off = discountOf(p);
      return (
        '<article class="product-card" data-tilt-skip>' +
        (p.badge ? '<span class="p-badge">' + p.badge + "</span>" : "") +
        (off ? '<span class="p-off">٪' + fa(off) + " تخفیف</span>" : "") +
        '<div class="p-art">' + artHTML(p) + "</div>" +
        '<div class="p-body">' +
        '<span class="p-cat">' + p.cat + "</span>" +
        "<h3>" + p.name + "</h3>" +
        '<p class="p-desc">' + p.desc + "</p>" +
        starHTML(p.rating, p.votes) +
        '<div class="p-foot">' +
        '<div class="p-price">' +
        (p.oldPrice ? '<del>' + formatPrice(p.oldPrice) + "</del>" : "") +
        "<strong>" + formatPrice(p.price) + " <small>تومان</small></strong>" +
        "</div>" +
        '<button class="btn btn--primary btn--sm p-add" data-add="' + p.id + '">' +
        '<svg viewBox="0 0 24 24"><path d="M11 9h2V6h3V4h-3V1h-2v3H8v2h3v3zm-4 9c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2zm10 0c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2zm-9.8-3.2v-.1l.9-1.7h7.4c.7 0 1.4-.4 1.7-1l3.9-7-1.7-1-3.9 7h-7L4.3 2H1v2h2l3.6 7.6-1.4 2.4c-.7 1.4.3 3 1.8 3h12v-2H7.4c-.1 0-.2-.1-.2-.2z"/></svg>' +
        "افزودن به سبد</button>" +
        "</div></div></article>"
      );
    }).join("");
  }

  grid.addEventListener("click", function (e) {
    var btn = e.target.closest("[data-add]");
    if (!btn) return;
    addToCart(+btn.dataset.add);
    btn.classList.add("is-added");
    setTimeout(function () { btn.classList.remove("is-added"); }, 600);
  });

  searchInput.addEventListener("input", function () {
    state.query = searchInput.value.trim();
    renderGrid();
  });
  sortSelect.addEventListener("change", function () {
    state.sort = sortSelect.value;
    renderGrid();
  });

  /* ---------- سبد خرید ---------- */
  function productById(id) {
    return PRODUCTS.find(function (p) { return p.id === id; });
  }

  function cartCount() {
    return Object.values(state.cart).reduce(function (sum, q) { return sum + q; }, 0);
  }
  function cartTotal() {
    return Object.keys(state.cart).reduce(function (sum, id) {
      return sum + productById(+id).price * state.cart[id];
    }, 0);
  }

  function addToCart(id) {
    state.cart[id] = (state.cart[id] || 0) + 1;
    saveCart();
    renderCart();
    toast("به سبد خرید اضافه شد ✓");
  }

  function setQty(id, qty) {
    if (qty <= 0) delete state.cart[id];
    else state.cart[id] = qty;
    saveCart();
    renderCart();
  }

  function renderCart() {
    var count = cartCount();
    cartBadge.textContent = fa(count);
    cartBadge.classList.toggle("is-hidden", count === 0);

    var ids = Object.keys(state.cart);
    if (!ids.length) {
      cartItemsBox.innerHTML =
        '<div class="cart-empty"><svg viewBox="0 0 24 24"><path d="M11 9h2V6h3V4h-3V1h-2v3H8v2h3v3zm-4 9c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2zm10 0c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2zm-9.8-3.2v-.1l.9-1.7h7.4c.7 0 1.4-.4 1.7-1l3.9-7-1.7-1-3.9 7h-7L4.3 2H1v2h2l3.6 7.6-1.4 2.4c-.7 1.4.3 3 1.8 3h12v-2H7.4c-.1 0-.2-.1-.2-.2z"/></svg>' +
        "<p>سبد خرید شما خالی است</p></div>";
    } else {
      cartItemsBox.innerHTML = ids.map(function (id) {
        var p = productById(+id);
        var qty = state.cart[id];
        return (
          '<div class="cart-item">' +
          '<div class="cart-item__art">' + artHTML(p) + "</div>" +
          '<div class="cart-item__info">' +
          "<h4>" + p.name + "</h4>" +
          '<span class="cart-item__price">' + formatPrice(p.price) + " تومان</span>" +
          '<div class="qty">' +
          '<button data-qty="-1" data-id="' + id + '" aria-label="کاهش">−</button>' +
          "<span>" + fa(qty) + "</span>" +
          '<button data-qty="1" data-id="' + id + '" aria-label="افزایش">+</button>' +
          '<button class="qty__remove" data-remove="' + id + '" aria-label="حذف">' +
          '<svg viewBox="0 0 24 24"><path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/></svg></button>' +
          "</div></div></div>"
        );
      }).join("");
    }
    cartTotalEl.textContent = formatPrice(cartTotal()) + " تومان";
    checkoutBtn.disabled = !ids.length;
  }

  cartItemsBox.addEventListener("click", function (e) {
    var qtyBtn = e.target.closest("[data-qty]");
    var removeBtn = e.target.closest("[data-remove]");
    if (qtyBtn) setQty(qtyBtn.dataset.id, state.cart[qtyBtn.dataset.id] + (+qtyBtn.dataset.qty));
    if (removeBtn) setQty(removeBtn.dataset.remove, 0);
  });

  function openDrawer() {
    drawer.classList.add("is-open");
    drawerOverlay.classList.add("is-open");
    document.body.style.overflow = "hidden";
  }
  function closeDrawer() {
    drawer.classList.remove("is-open");
    drawerOverlay.classList.remove("is-open");
    document.body.style.overflow = "";
  }
  cartBtn.addEventListener("click", openDrawer);
  drawerClose.addEventListener("click", closeDrawer);
  drawerOverlay.addEventListener("click", closeDrawer);
  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape") { closeDrawer(); closeModal(); }
  });

  /* ---------- ثبت سفارش ---------- */
  function openModal() {
    checkoutModal.classList.add("is-open");
    checkoutSuccess.classList.add("is-hidden");
    checkoutForm.classList.remove("is-hidden");
  }
  function closeModal() {
    checkoutModal.classList.remove("is-open");
  }
  checkoutBtn.addEventListener("click", function () {
    closeDrawer();
    openModal();
  });
  checkoutClose.addEventListener("click", closeModal);
  checkoutModal.addEventListener("click", function (e) {
    if (e.target === checkoutModal) closeModal();
  });

  checkoutForm.addEventListener("submit", function (e) {
    e.preventDefault();
    var name = checkoutForm.coName.value.trim();
    var phone = checkoutForm.coPhone.value.trim();
    if (!name || !phone) {
      toast("لطفاً نام و شماره تماس را وارد کنید", true);
      return;
    }
    // سفارش به‌صورت نمایشی ذخیره می‌شود؛ برای فروش واقعی باید به درگاه
    // پرداخت و سیستم مدیریت سفارش متصل شود.
    var code = "IGA-" + Math.floor(10000 + Math.random() * 89999);
    var orders = [];
    try { orders = JSON.parse(localStorage.getItem("iga-orders")) || []; } catch (err) {}
    orders.push({ code: code, name: name, phone: phone, items: state.cart, total: cartTotal(), date: new Date().toISOString() });
    localStorage.setItem("iga-orders", JSON.stringify(orders));

    state.cart = {};
    saveCart();
    renderCart();
    checkoutForm.reset();
    checkoutForm.classList.add("is-hidden");
    orderCodeEl.textContent = fa(code.replace("IGA-", "")) ;
    checkoutSuccess.classList.remove("is-hidden");
  });

  /* ---------- اعلان ---------- */
  function toast(message, isError) {
    var el = document.createElement("div");
    el.className = "toast" + (isError ? " toast--error" : "");
    el.textContent = message;
    toastBox.appendChild(el);
    requestAnimationFrame(function () { el.classList.add("is-in"); });
    setTimeout(function () {
      el.classList.remove("is-in");
      setTimeout(function () { el.remove(); }, 350);
    }, 2600);
  }

  /* ---------- شروع ---------- */
  renderChips();
  renderGrid();
  renderCart();
})();
