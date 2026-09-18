/**
 * صحنهٔ پس‌زمینهٔ سرصفحه — ابر، ستاره، و دو لکهٔ نور.
 *
 * چرا تصویرسازی و نه دو دایرهٔ محو: نسخهٔ پیشین سرصفحه یک نوار رنگیِ
 * ساده بود و همان چیزی بود که «مبتدیانه» خوانده شد. یک صحنه — حتی به
 * این سادگی — سرصفحه را از نوار به فضا تبدیل می‌کند.
 *
 * همه‌چیز سفیدِ کم‌شفاف است، پس روی هر سه آسمانِ نقش کار می‌کند و
 * هیچ‌وقت با متنِ سفیدِ رویش رقابت نمی‌کند.
 */
export function SkyScene() {
  return (
    <svg
      className="sky-scene"
      viewBox="0 0 390 230"
      preserveAspectRatio="none"
      aria-hidden
      focusable="false"
    >
      <circle cx="326" cy="34" r="54" fill="#fff" opacity=".10" />
      <circle cx="44" cy="102" r="70" fill="#fff" opacity=".07" />

      <g fill="#fff" opacity=".18">
        <ellipse cx="72" cy="40" rx="26" ry="13" />
        <ellipse cx="90" cy="35" rx="19" ry="15" />
        <ellipse cx="288" cy="112" rx="22" ry="11" />
        <ellipse cx="303" cy="108" rx="16" ry="13" />
      </g>

      <g fill="#fff" opacity=".55">
        <circle cx="150" cy="26" r="2.2" />
        <circle cx="246" cy="60" r="1.8" />
        <circle cx="52" cy="62" r="2" />
        <circle cx="336" cy="96" r="1.7" />
        <circle cx="118" cy="120" r="1.9" />
      </g>
    </svg>
  )
}

/**
 * موجِ پایین سرصفحه.
 *
 * رنگش `--paper` است، یعنی خودِ بوم: موج چیزی نمی‌کشد، بومِ صفحه را
 * بالا می‌آورد. پس هر تغییری در رنگ بوم خودبه‌خود اینجا هم می‌افتد و
 * دو رنگِ «تقریباً یکی» هرگز ساخته نمی‌شود.
 */
export function SkyWave() {
  return (
    <svg
      className="sky-wave"
      viewBox="0 0 390 48"
      preserveAspectRatio="none"
      height="48"
      aria-hidden
      focusable="false"
    >
      <path
        d="M0 24 C 46 -6 104 34 158 22 C 214 9 248 40 302 26 C 340 16 368 26 390 20 L390 48 L0 48Z"
        fill="var(--paper)"
      />
    </svg>
  )
}
