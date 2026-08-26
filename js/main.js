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
  window.toPersianDigits = toPersianDigits;

  var reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  /* ---------- نوار پیشرفت اسکرول ---------- */
  var progressBar = document.getElementById("scrollProgress");

  /* ---------- منوی موبایل ---------- */
  var navToggle = document.getElementById("navToggle");
  var nav = document.getElementById("nav");

  if (navToggle && nav) {
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
  }

  /* ---------- سایه هدر، نوار پیشرفت و دکمه بازگشت به بالا ---------- */
  var header = document.getElementById("header");
  var backTop = document.getElementById("backTop");

  function onScroll() {
    if (header) header.classList.toggle("is-scrolled", window.scrollY > 10);
    if (backTop) backTop.classList.toggle("is-visible", window.scrollY > 600);
    if (progressBar) {
      var max = document.documentElement.scrollHeight - window.innerHeight;
      progressBar.style.width = (max > 0 ? (window.scrollY / max) * 100 : 0) + "%";
    }
  }
  window.addEventListener("scroll", onScroll, { passive: true });
  onScroll();

  /* ---------- هایلایت لینک فعال منو ---------- */
  var sections = document.querySelectorAll("main section[id]");
  var navLinks = document.querySelectorAll(".nav__link");

  if (sections.length && navLinks.length) {
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
  }

  /* ---------- انیمیشن نمایان شدن (با تاخیر پلکانی) ---------- */
  var revealObserver = new IntersectionObserver(
    function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) {
          entry.target.classList.add("is-visible");
          revealObserver.unobserve(entry.target);
        }
      });
    },
    { threshold: 0.1 }
  );
  document.querySelectorAll(".reveal").forEach(function (el, i) {
    el.style.transitionDelay = Math.min((i % 6) * 70, 350) + "ms";
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

  /* ---------- جلوه ذرات آتش (هیرو) ---------- */
  function initEmbers(emberCanvas) {
    var ctx = emberCanvas.getContext("2d");
    var embers = [];
    var EMBER_COUNT = 46;

    function resizeCanvas() {
      emberCanvas.width = emberCanvas.offsetWidth;
      emberCanvas.height = emberCanvas.offsetHeight;
    }
    resizeCanvas();
    window.addEventListener("resize", resizeCanvas);

    function spawnEmber(randomY) {
      return {
        x: Math.random() * emberCanvas.width,
        y: randomY ? Math.random() * emberCanvas.height : emberCanvas.height + 10,
        r: 1 + Math.random() * 2.4,
        vy: 0.4 + Math.random() * 1.1,
        vx: (Math.random() - 0.5) * 0.5,
        life: 0.4 + Math.random() * 0.6,
        hue: 14 + Math.random() * 26,
        phase: Math.random() * Math.PI * 2
      };
    }
    for (var i = 0; i < EMBER_COUNT; i++) embers.push(spawnEmber(true));

    function drawEmbers(t) {
      ctx.clearRect(0, 0, emberCanvas.width, emberCanvas.height);
      embers.forEach(function (p, idx) {
        p.y -= p.vy;
        p.x += p.vx + Math.sin(t / 900 + p.phase) * 0.3;
        var fade = Math.max(0, Math.min(1, p.y / emberCanvas.height + 0.15));
        if (p.y < -12) embers[idx] = spawnEmber(false);
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fillStyle = "hsla(" + p.hue + ", 95%, 62%, " + (p.life * fade) + ")";
        ctx.shadowColor = "hsla(" + p.hue + ", 95%, 60%, .9)";
        ctx.shadowBlur = 8;
        ctx.fill();
        ctx.shadowBlur = 0;
      });
      requestAnimationFrame(drawEmbers);
    }
    requestAnimationFrame(drawEmbers);
  }
  if (!reducedMotion) {
    document.querySelectorAll(".hero-embers").forEach(initEmbers);
  }

  /* ---------- جلوه تیلت سه‌بعدی روی کارت‌ها ---------- */
  var canHover = window.matchMedia("(hover: hover) and (pointer: fine)").matches;
  if (canHover && !reducedMotion) {
    document.querySelectorAll("[data-tilt]").forEach(function (card) {
      card.addEventListener("mousemove", function (e) {
        var rect = card.getBoundingClientRect();
        var px = (e.clientX - rect.left) / rect.width - 0.5;
        var py = (e.clientY - rect.top) / rect.height - 0.5;
        card.style.transform =
          "perspective(900px) rotateX(" + (-py * 7) + "deg) rotateY(" + (px * 7) + "deg) translateY(-6px)";
      });
      card.addEventListener("mouseleave", function () {
        card.style.transform = "";
      });
    });
  }

  /* ---------- مخفی‌سازی نرم تصاویر شکست‌خورده ---------- */
  document.querySelectorAll("img[data-optional]").forEach(function (img) {
    img.addEventListener("error", function () {
      img.classList.add("is-hidden");
    });
  });

  /* ---------- فرم تماس ---------- */
  var form = document.getElementById("contactForm");
  var formNote = document.getElementById("formNote");

  if (form && formNote) {
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
  }

  /* ---------- سال جاری در فوتر ---------- */
  var yearEl = document.getElementById("year");
  if (yearEl) {
    try {
      var persianYear = new Intl.DateTimeFormat("fa-IR-u-ca-persian", { year: "numeric" }).format(new Date());
      yearEl.textContent = persianYear;
    } catch (err) {
      /* اگر مرورگر از تقویم فارسی پشتیبانی نکند، مقدار پیش‌فرض HTML باقی می‌ماند */
    }
  }
})();
