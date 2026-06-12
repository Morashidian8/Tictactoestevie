/* ============================================================
   ایمن‌گستر آریا — اسکریپت اصلی سایت
   ============================================================ */

(function () {
  "use strict";

  var PERSIAN_DIGITS = ["۰", "۱", "۲", "۳", "۴", "۵", "۶", "۷", "۸", "۹"];

  function toPersianDigits(value) {
    return String(value).replace(/\d/g, function (d) {
      return PERSIAN_DIGITS[+d];
    });
  }

  /* ---------- منوی موبایل ---------- */
  var navToggle = document.getElementById("navToggle");
  var nav = document.getElementById("nav");

  navToggle.addEventListener("click", function () {
    var isOpen = nav.classList.toggle("is-open");
    navToggle.classList.toggle("is-open", isOpen);
    navToggle.setAttribute("aria-expanded", isOpen ? "true" : "false");
  });

  nav.addEventListener("click", function (e) {
    if (e.target.classList.contains("nav__link")) {
      nav.classList.remove("is-open");
      navToggle.classList.remove("is-open");
      navToggle.setAttribute("aria-expanded", "false");
    }
  });

  /* ---------- سایه هدر و دکمه بازگشت به بالا ---------- */
  var header = document.getElementById("header");
  var backTop = document.getElementById("backTop");

  function onScroll() {
    header.classList.toggle("is-scrolled", window.scrollY > 10);
    backTop.classList.toggle("is-visible", window.scrollY > 600);
  }
  window.addEventListener("scroll", onScroll, { passive: true });
  onScroll();

  /* ---------- هایلایت لینک فعال منو ---------- */
  var sections = document.querySelectorAll("main section[id]");
  var navLinks = document.querySelectorAll(".nav__link");

  var sectionObserver = new IntersectionObserver(
    function (entries) {
      entries.forEach(function (entry) {
        if (!entry.isIntersecting) return;
        var id = entry.target.id;
        navLinks.forEach(function (link) {
          link.classList.toggle("is-active", link.getAttribute("href") === "#" + id);
        });
      });
    },
    { rootMargin: "-40% 0px -55% 0px" }
  );
  sections.forEach(function (section) { sectionObserver.observe(section); });

  /* ---------- انیمیشن نمایان شدن ---------- */
  var revealObserver = new IntersectionObserver(
    function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) {
          entry.target.classList.add("is-visible");
          revealObserver.unobserve(entry.target);
        }
      });
    },
    { threshold: 0.12 }
  );
  document.querySelectorAll(".reveal").forEach(function (el) {
    revealObserver.observe(el);
  });

  /* ---------- شمارنده آمار ---------- */
  function animateCounter(el) {
    var target = parseInt(el.dataset.target, 10);
    var duration = 1800;
    var start = null;

    function tick(timestamp) {
      if (start === null) start = timestamp;
      var progress = Math.min((timestamp - start) / duration, 1);
      // easing: easeOutCubic
      var eased = 1 - Math.pow(1 - progress, 3);
      el.textContent = toPersianDigits(Math.round(eased * target).toLocaleString("en-US").replace(/,/g, "٬"));
      if (progress < 1) requestAnimationFrame(tick);
    }
    requestAnimationFrame(tick);
  }

  var counterObserver = new IntersectionObserver(
    function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) {
          animateCounter(entry.target);
          counterObserver.unobserve(entry.target);
        }
      });
    },
    { threshold: 0.5 }
  );
  document.querySelectorAll(".counter").forEach(function (el) {
    counterObserver.observe(el);
  });

  /* ---------- فرم تماس ---------- */
  var form = document.getElementById("contactForm");
  var formNote = document.getElementById("formNote");

  form.addEventListener("submit", function (e) {
    e.preventDefault();

    var name = form.name.value.trim();
    var phone = form.phone.value.trim();

    formNote.classList.remove("is-success", "is-error");

    if (!name || !phone) {
      formNote.textContent = "لطفاً نام و شماره تماس را وارد کنید.";
      formNote.classList.add("is-error");
      return;
    }

    // در حالت فعلی سایت استاتیک است؛ برای اتصال به سرویس ایمیل یا CRM،
    // این بخش باید به endpoint موردنظر متصل شود.
    formNote.textContent = "درخواست شما با موفقیت ثبت شد. کارشناسان ما به‌زودی با شما تماس می‌گیرند.";
    formNote.classList.add("is-success");
    form.reset();
  });

  /* ---------- سال جاری در فوتر ---------- */
  var yearEl = document.getElementById("year");
  try {
    var persianYear = new Intl.DateTimeFormat("fa-IR-u-ca-persian", { year: "numeric" }).format(new Date());
    yearEl.textContent = persianYear;
  } catch (err) {
    /* اگر مرورگر از تقویم فارسی پشتیبانی نکند، مقدار پیش‌فرض HTML باقی می‌ماند */
  }
})();
