/* ================================================================
   ادب‌یار — مدل دادهٔ محتوا
   هر درس از چهار بخش اصلی ساخته می‌شود:
   ۱) تدریس  ۲) تمرین  ۳) آزمون  ۴) رفع اشکال
   ================================================================ */

export type GradeId = 7 | 8 | 9 | 10 | 11 | 12

/** رشتهٔ تحصیلی — دورهٔ دوم متوسطه دو کتاب دارد: مشترک و «علوم و فنون» */
export type BookId =
  | 'farsi7' | 'farsi8' | 'farsi9'
  | 'farsi10' | 'farsi11' | 'farsi12'

/* ---------------- بلوک‌های متن درس ---------------- */

/** یک بیت: مصراع اول و دوم، معنی روان، و نکته‌ها */
export interface Verse {
  n: number
  /** مصراع اول */
  a: string
  /** مصراع دوم */
  b: string
  /** معنی روان بیت */
  meaning: string
  /** نکتهٔ کوتاه (آرایه، دستور، اشاره) */
  note?: string
}

/** یک بند نثر */
export interface Paragraph {
  n: number
  text: string
  meaning: string
  note?: string
}

export type TextBlock =
  | { kind: 'heading'; text: string }
  | { kind: 'verse'; verses: Verse[] }
  | { kind: 'prose'; paragraphs: Paragraph[] }
  | { kind: 'note'; title: string; text: string }

/* ---------------- اجزای بخش تدریس ---------------- */

export interface GlossaryItem {
  /** واژه یا ترکیب */
  word: string
  /** معنی */
  meaning: string
  /** ریشه/اطلاعات بیشتر */
  extra?: string
}

/** آرایهٔ ادبی به‌کاررفته در درس */
export interface DeviceItem {
  /** نام آرایه: تشبیه، استعاره، کنایه، ... */
  name: string
  /** شاهد مثال از متن درس */
  example: string
  /** توضیح */
  explain: string
}

/** نکتهٔ دستوری / زبانی */
export interface GrammarPoint {
  title: string
  body: string
  examples?: string[]
}

export interface Author {
  name: string
  fullName?: string
  years?: string
  bio: string
  works?: string[]
}

export interface TeachSection {
  /** درآمد و پیش‌نیاز درس */
  intro: string
  /** هدف‌های یادگیری */
  goals: string[]
  author?: Author
  /** متن کامل درس همراه با معنی */
  body: TextBlock[]
  glossary: GlossaryItem[]
  devices: DeviceItem[]
  grammar: GrammarPoint[]
  /** دانش ادبی / قلمرو فکری */
  literary?: GrammarPoint[]
  /** خلاصهٔ شب امتحان */
  summary: string[]
}

/* ---------------- تمرین و آزمون ---------------- */

export type Question =
  | {
      id: string
      type: 'mcq'
      prompt: string
      choices: string[]
      answer: number
      explain: string
      /** ریزموضوع برای تحلیل نقاط ضعف */
      topic: QTopic
      points?: number
    }
  | {
      id: string
      type: 'truefalse'
      prompt: string
      answer: boolean
      explain: string
      topic: QTopic
      points?: number
    }
  | {
      id: string
      type: 'fill'
      /** متن با «___» به‌جای جای خالی */
      prompt: string
      /** پاسخ‌های پذیرفتنی (اولی پاسخ اصلی) */
      accept: string[]
      explain: string
      topic: QTopic
      points?: number
    }
  | {
      id: string
      type: 'match'
      prompt: string
      /** ستون راست */
      left: string[]
      /** ستون چپ — هم‌اندیس با left پاسخ درست است */
      right: string[]
      explain: string
      topic: QTopic
      points?: number
    }
  | {
      id: string
      type: 'order'
      prompt: string
      /** ترتیب درست */
      items: string[]
      explain: string
      topic: QTopic
      points?: number
    }
  | {
      id: string
      type: 'short'
      prompt: string
      /** پاسخ نمونه */
      sample: string
      /** کلیدواژه‌های لازم برای نمره‌دهی خودکار */
      keywords: string[]
      explain: string
      topic: QTopic
      points?: number
    }

export type QTopic =
  | 'واژگان'
  | 'معنی و مفهوم'
  | 'آرایه‌های ادبی'
  | 'دستور زبان'
  | 'املا و نگارش'
  | 'دانش ادبی'
  | 'درک مطلب'

export interface ExamPaper {
  /** دقیقه */
  minutes: number
  /** نمرهٔ قبولی از ۱۰۰ */
  passScore: number
  questions: Question[]
}

/* ---------------- رفع اشکال ---------------- */

export interface FaqItem {
  q: string
  a: string
}

export interface MistakeItem {
  wrong: string
  right: string
  why: string
}

export interface HelpSection {
  faq: FaqItem[]
  mistakes: MistakeItem[]
  /** ترفندهای به‌خاطرسپاری */
  tips: string[]
}

/* ---------------- درس ---------------- */

export interface Lesson {
  id: string
  grade: GradeId
  /** شمارهٔ درس در کتاب */
  number: number
  /** فصل/ستایش */
  unit: string
  title: string
  /** توضیح یک‌خطی */
  subtitle?: string
  /** شاعر یا نویسنده */
  by?: string
  /** دقیقهٔ تقریبی مطالعه */
  minutes: number
  /** رایگان بودن برای پیش‌نمایش */
  free?: boolean
  teach: TeachSection
  practice: Question[]
  exam: ExamPaper
  help: HelpSection
}

/** ورودی فهرست — برای درس‌هایی که هنوز محتوایشان کامل نشده هم وجود دارد */
export interface LessonMeta {
  id: string
  grade: GradeId
  number: number
  unit: string
  title: string
  subtitle?: string
  by?: string
  free?: boolean
  /** آیا محتوای کامل دارد؟ */
  ready: boolean
}

export interface GradeInfo {
  id: GradeId
  title: string
  book: BookId
  /** توضیح کوتاه */
  tagline: string
  /** تعداد فصل‌ها */
  units: string[]
}
