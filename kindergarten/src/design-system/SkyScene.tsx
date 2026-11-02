import type { ShellTone } from './tone.ts'

/**
 * صحنهٔ پس‌زمینهٔ سرصفحه — یکی برای هر نقش.
 *
 * چرا سه صحنه و نه یکی: رنگِ آسمان تنها چیزی است که در یک نگاه می‌گوید
 * کدام حساب باز است، و مربی و مدیر گاهی یک نفرند. رنگ به‌تنهایی از دور
 * و در نور آفتاب گم می‌شود؛ شکلِ صحنه گم نمی‌شود.
 *
 * ── قاعده‌ای که هر سه صحنه نگه می‌دارند ─────────────────────────
 *
 * متنِ سفیدِ سرصفحه رویشان می‌نشیند، پس هیچ صحنه‌ای حق ندارد پس‌زمینه
 * را **روشن‌تر** کند. هرچه اضافه می‌شود یا تیره است (تاجِ درخت، کوه) یا
 * سفیدِ کم‌شفاف در ناحیه‌ای که متن ندارد (ابر، ستونِ نور). تیره‌ترین
 * پلهٔ هر گرادیان با سفید بالای ۴٫۵ سنجیده شده و این‌ها آن را خراب
 * نمی‌کنند.
 */
export function SkyScene({ tone }: { tone: ShellTone }) {
  return (
    <svg
      className="sky-scene"
      viewBox="0 0 390 176"
      preserveAspectRatio="none"
      aria-hidden
      focusable="false"
    >
      {tone === 'teacher' ? <Forest /> : tone === 'parent' ? <Clouds /> : <Mountains />}
    </svg>
  )
}

/** مربی — کفِ جنگلِ آفتاب‌خورده: تاجِ درخت، ستونِ نور، برگِ شناور. */
function Forest() {
  return (
    <>
      <g fill="#fff" opacity=".13">
        <path d="M40 0 92 0 26 176-16 176Z" />
        <path d="M120 0 152 0 88 176 58 176Z" />
        <path d="M236 0 256 0 206 176 184 176Z" />
      </g>
      <g fill="#0A6A4E" opacity=".4">
        <ellipse cx="14" cy="4" rx="40" ry="26" />
        <ellipse cx="56" cy="-8" rx="34" ry="24" />
        <ellipse cx="100" cy="0" rx="28" ry="18" />
        <ellipse cx="268" cy="-10" rx="34" ry="22" />
        <ellipse cx="312" cy="0" rx="38" ry="24" />
        <ellipse cx="366" cy="-6" rx="36" ry="26" />
      </g>
      <g fill="#0F7D5C" opacity=".45">
        <path d="M32 18q14 4 16 20-16 2-20-14z" />
        <path d="M84 12q13 6 12 22-16 0-18-16z" />
        <path d="M300 16q-14 5-15 21 16 1 19-15z" />
        <path d="M352 22q-13 6-12 22 16 0 18-16z" />
      </g>
      <g opacity=".6">
        <path d="M196 54q-13-11-4-22 11-4 13 11 11-13 19-4 4 11-11 15z" fill="#BFF0DA" />
        <path d="M120 104q-10-9-3-17 9-3 11 9 9-11 16-3 3 9-9 12z" fill="#A8E7CB" opacity=".85" />
        <path d="M64 142q-8-7-2-13 7-2 8 7 7-8 12-2 2 7-7 9z" fill="#CFF4E4" opacity=".7" />
      </g>
    </>
  )
}

/** خانواده — ابرهای لایه‌لایه با تابشِ گرم. */
function Clouds() {
  return (
    <>
      <defs>
        <radialGradient id="sky-glow" cx=".18" cy=".12" r=".7">
          <stop offset="0" stopColor="#FFE7A8" stopOpacity=".55" />
          <stop offset="1" stopColor="#FFE7A8" stopOpacity="0" />
        </radialGradient>
      </defs>
      <rect x="0" y="0" width="390" height="176" fill="url(#sky-glow)" />
      <g fill="#fff" opacity=".2">
        <ellipse cx="330" cy="30" rx="56" ry="20" />
        <ellipse cx="292" cy="22" rx="34" ry="16" />
        <ellipse cx="360" cy="20" rx="28" ry="13" />
        <ellipse cx="70" cy="118" rx="52" ry="18" />
        <ellipse cx="34" cy="110" rx="30" ry="13" />
      </g>
      <g fill="#fff" opacity=".34">
        <ellipse cx="318" cy="26" rx="34" ry="13" />
        <ellipse cx="288" cy="20" rx="20" ry="10" />
        <ellipse cx="60" cy="114" rx="30" ry="11" />
      </g>
      <g fill="#fff" opacity=".18">
        <ellipse cx="176" cy="150" rx="40" ry="12" />
        <ellipse cx="150" cy="145" rx="22" ry="9" />
      </g>
    </>
  )
}

/**
 * مدیر — سلسله‌کوه و آسمانِ شب.
 *
 * کوه‌ها پیش از لبهٔ پایینی تمام می‌شوند (۱۵۰ از ۱۷۶)، وگرنه موجِ زیر
 * سرصفحه روی یک نوارِ تیره می‌نشیند به‌جای گرادیانِ خالص.
 */
function Mountains() {
  return (
    <>
      <g fill="#fff">
        <circle cx="52" cy="24" r="1.6" opacity=".85" />
        <circle cx="96" cy="14" r="1.1" opacity=".6" />
        <circle cx="134" cy="34" r="1.5" opacity=".75" />
        <circle cx="178" cy="18" r="1" opacity=".55" />
        <circle cx="214" cy="40" r="1.6" opacity=".8" />
        <circle cx="262" cy="16" r="1.2" opacity=".6" />
        <circle cx="306" cy="34" r="1.4" opacity=".7" />
        <circle cx="348" cy="20" r="1" opacity=".5" />
        <circle cx="120" cy="62" r="1.2" opacity=".5" />
        <circle cx="236" cy="66" r="1.1" opacity=".45" />
      </g>
      <g stroke="#fff" strokeWidth="1.1" strokeLinecap="round" opacity=".6">
        <path d="M156 52v-6M156 58v-6M150 55h-6M168 55h-6" />
      </g>
      <path
        d="M0 150 58 100 96 132 150 82 210 138 262 100 318 140 390 92 390 150Z"
        fill="#2E3AA8"
        opacity=".55"
      />
      <path
        d="M0 150 46 124 92 148 146 116 198 150 252 126 312 150 390 118 390 150Z"
        fill="#232C86"
        opacity=".6"
      />
      <g fill="#fff" opacity=".5">
        <path d="M150 82 161 95 155 97 150 94 145 97 139 95Z" />
        <path d="M262 100 271 111 266 113 262 110 258 113 253 111Z" />
      </g>
    </>
  )
}

/**
 * موجِ پایین سرصفحه.
 *
 * رنگش `--wave-fill` است، یعنی سرِ همان بومی که زیرش شروع می‌شود. موج
 * چیزی نمی‌کشد؛ بوم را بالا می‌آورد. پس هر تغییری در بوم خودبه‌خود
 * اینجا هم می‌افتد و دو رنگِ «تقریباً یکی» ساخته نمی‌شود.
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
        fill="var(--wave-fill, var(--paper))"
      />
    </svg>
  )
}

/**
 * چمنزارِ پایین صفحه — مشترک در هر سه پنل.
 *
 * چرا اینجا و نه بالای صفحه: بالای صفحه را کارت‌ها پر می‌کنند و هر نقشی
 * پشتشان دیده نمی‌شود، فقط با متن رقابت می‌کند. پایینِ صفحه — زیر آخرین
 * کارت و پشتِ نوار — تنها جایی است که بوم واقعاً دیده می‌شود.
 *
 * `preserveAspectRatio="none"` عمدی است: صحنه باید عرضِ هر گوشی را پر
 * کند و کشیده شدنِ چند تپه و گل دیده نمی‌شود.
 */
export function Meadow() {
  return (
    <div className="meadow" aria-hidden>
      <svg className="meadow-hills" viewBox="0 0 390 330" preserveAspectRatio="none">
        <defs>
          <linearGradient id="meadow-1" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#E4F5DA" />
            <stop offset="1" stopColor="#CDEBBE" />
          </linearGradient>
          <linearGradient id="meadow-2" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#C6E7B4" />
            <stop offset="1" stopColor="#A9DC96" />
          </linearGradient>
          <linearGradient id="meadow-3" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#9FD68B" />
            <stop offset="1" stopColor="#7CC468" />
          </linearGradient>
        </defs>
        <path
          d="M0 86C58 44 130 104 198 70 266 36 330 80 390 54L390 330 0 330Z"
          fill="url(#meadow-1)"
        />
        <path
          d="M0 134C72 96 144 148 214 120 284 92 340 128 390 108L390 330 0 330Z"
          fill="url(#meadow-2)"
        />
        <path
          d="M0 196C64 168 150 210 228 184 300 160 344 190 390 176L390 330 0 330Z"
          fill="url(#meadow-3)"
        />
      </svg>

      <svg className="meadow-life" viewBox="0 0 390 330">
        <g stroke="#8ECB79" strokeWidth="2.2" strokeLinecap="round" fill="none" opacity=".75">
          <path d="M14 128q3-14-2-24M20 130q2-16 7-26M26 130q5-12 12-18" />
          <path d="M84 150q3-14-2-24M90 152q2-16 7-26M96 152q5-12 12-18" />
          <path d="M196 132q3-14-2-24M202 134q2-16 7-26M208 134q5-12 12-18" />
          <path d="M300 120q3-14-2-24M306 122q2-16 7-26M312 122q5-12 12-18" />
          <path d="M358 138q3-14-2-24M364 140q2-16 7-26" />
        </g>
        <g stroke="#6FB85C" strokeWidth="2.4" strokeLinecap="round" fill="none" opacity=".8">
          <path d="M46 206q4-18-1-30M120 214q4-18-1-30M256 200q4-18-1-30M330 210q4-18-1-30" />
        </g>

        <Flower x={58} y={156} stem={26} petal="#FF9BB0" heart="#FFD66B" />
        <Flower x={148} y={186} stem={28} petal="#8FD9F0" heart="#FFF3C4" />
        <Flower x={244} y={164} stem={24} petal="#FFFFFF" heart="#F5B733" />
        <Flower x={336} y={174} stem={26} petal="#C9AEF7" heart="#FFD66B" />

        {/* قاصدک، همان‌قدر بخشی از چمنزار که گل. */}
        <g>
          <path d="M100 178q-3-16 1-28" stroke="#6FB85C" strokeWidth="2" fill="none" strokeLinecap="round" />
          <circle cx="101" cy="148" r="8" fill="#fff" opacity=".92" />
          <g stroke="#fff" strokeWidth="1.2" opacity=".9">
            <path d="M101 148 92 143M101 148l9-5M101 148v-10M101 148l-7 6M101 148l7 6" />
          </g>
        </g>

        <Butterfly x={276} y={92} rotate={-12} wing="#FFC36B" wingLow="#F5A63A" body="#7A5A12" />
        <Butterfly x={78} y={74} rotate={14} scale={0.78} wing="#B8D8FF" wingLow="#8FB8F0" body="#41618F" />
        <Butterfly x={196} y={118} rotate={-6} scale={0.62} wing="#FFB3C1" wingLow="#F58FA5" body="#8A3E52" />
      </svg>
    </div>
  )
}

function Flower({
  x,
  y,
  stem,
  petal,
  heart,
}: {
  x: number
  y: number
  stem: number
  petal: string
  heart: string
}) {
  const top = y - stem
  return (
    <g>
      <path
        d={`M${x} ${y}q4-${stem / 2} 0-${stem}`}
        stroke="#6FB85C"
        strokeWidth="2.2"
        fill="none"
        strokeLinecap="round"
      />
      <circle cx={x} cy={top - 4} r="4.7" fill={petal} />
      <circle cx={x - 7} cy={top + 3} r="4.7" fill={petal} />
      <circle cx={x + 7} cy={top + 3} r="4.7" fill={petal} />
      <circle cx={x - 4} cy={top + 11} r="4.7" fill={petal} />
      <circle cx={x + 4} cy={top + 11} r="4.7" fill={petal} />
      <circle cx={x} cy={top + 4} r="3" fill={heart} />
    </g>
  )
}

function Butterfly({
  x,
  y,
  rotate,
  scale = 1,
  wing,
  wingLow,
  body,
}: {
  x: number
  y: number
  rotate: number
  scale?: number
  wing: string
  wingLow: string
  body: string
}) {
  return (
    <g transform={`translate(${x} ${y}) rotate(${rotate}) scale(${scale})`}>
      <ellipse cx="-6" cy="-4" rx="6.6" ry="7.8" fill={wing} transform="rotate(-25 -6 -4)" />
      <ellipse cx="6" cy="-4" rx="6.6" ry="7.8" fill={wing} transform="rotate(25 6 -4)" />
      <ellipse cx="-5" cy="6" rx="5" ry="5.6" fill={wingLow} />
      <ellipse cx="5" cy="6" rx="5" ry="5.6" fill={wingLow} />
      <path d="M0-10v20" stroke={body} strokeWidth="2" strokeLinecap="round" />
      <path d="M0-10-5-15M0-10 5-15" stroke={body} strokeWidth="1.4" strokeLinecap="round" />
    </g>
  )
}

/**
 * نقش‌های ریزِ مدادرنگی روی بوم.
 *
 * جایی می‌نشینند که چمنزار نمی‌رسد: میانهٔ صفحه، در نوارهای باریکِ کنارِ
 * کارت‌ها. شفافیت عمداً پایین است — این‌ها باید حس شوند، نه دیده.
 */
export function PaperMarks() {
  return (
    <svg className="paper-marks" viewBox="0 0 390 844" preserveAspectRatio="xMidYMin slice" aria-hidden>
      <g stroke="#10B981" strokeWidth="2.5" strokeLinecap="round" fill="none" opacity=".2">
        <path d="M26 236q7-9 14 0 7 9 14 0" />
        <path d="M300 386q7-9 14 0 7 9 14 0" />
        <path d="M40 560q7-9 14 0 7 9 14 0" />
      </g>
      <g stroke="#F59E0B" strokeWidth="2.5" strokeLinecap="round" fill="none" opacity=".24">
        <path d="M334 222v12M328 228h12" />
        <path d="M56 404v12M50 410h12" />
        <path d="M268 612v12M262 618h12" />
      </g>
      <g fill="#7C93FF" opacity=".24">
        <circle cx="80" cy="314" r="4" />
        <circle cx="344" cy="498" r="4" />
        <circle cx="118" cy="650" r="4" />
      </g>
      <g fill="#FF6B6B" opacity=".22">
        <path d="M200 286l4 8 8 1-6 6 2 8-8-4-8 4 2-8-6-6 8-1z" />
        <path d="M44 480l4 8 8 1-6 6 2 8-8-4-8 4 2-8-6-6 8-1z" />
        <path d="M348 590l4 8 8 1-6 6 2 8-8-4-8 4 2-8-6-6 8-1z" />
      </g>
    </svg>
  )
}
