import type { AccountRole } from '../data/types.ts'

/**
 * یک حساب قابل انتخاب برای یک شماره تلفن.
 *
 * بخش ۳.۲: «شماره تلفن شناسه یکتای کاربر نیست.» یک شماره می‌تواند چند
 * حساب داشته باشد و کلید یکتا (شماره، نقش، مرکز) است.
 */
export type AccountOption = {
  id: string
  centerId: string
  centerName: string
  role: AccountRole
  /** نام صاحب حساب در همان نقش. یک نفر می‌تواند دو نام نمایشی داشته باشد. */
  displayName: string
  classIds: string[]
}

export type Session = {
  phone: string
  /** همه حساب‌های این شماره. صفحه انتخاب حساب از این می‌خواند. */
  accounts: AccountOption[]
  /**
   * حساب فعال. دقیقاً یکی، یا هیچ.
   *
   * بخش ۳.۲: «اگر بیش از یک حساب داشت، صفحه انتخاب حساب.» تا وقتی کاربر
   * انتخاب نکرده، حساب فعالی وجود ندارد و هیچ داده‌ای خوانده نمی‌شود.
   *
   * «دسترسی‌ها هرگز ترکیب نمی‌شوند» یعنی این فیلد هرگز آرایه نمی‌شود.
   */
  active: AccountOption | null
}

export interface AuthAdapter {
  /** کد یکبارمصرف را به شماره می‌فرستد. */
  requestCode(phone: string): Promise<void>
  /** کد را بررسی می‌کند و حساب‌های آن شماره را برمی‌گرداند. */
  verifyCode(phone: string, code: string): Promise<AccountOption[]>
  /** حساب فعال نشست را می‌نشاند. */
  selectAccount(accountId: string): Promise<void>
  restore(): Promise<Session | null>
  signOut(): Promise<void>
}

export const ROLE_LABEL: Record<AccountRole, string> = {
  manager: 'مدیر',
  teacher: 'مربی',
  assistant: 'کمک‌مربی',
  guardian: 'سرپرست',
  platform_admin: 'پشتیبانی',
}
