import type { CenterSummary, NewCenter, PlatformAccess } from './types.ts'

/**
 * لایهٔ سکو در نسخهٔ نمایشی.
 *
 * چهار مهد نمونه، تا پنل اپراتور واقعاً چیزی برای نشان دادن داشته
 * باشد: یکی نزدیک انقضا، یکی منقضی، یکی بی‌پایان، یکی تازه که هنوز
 * ثبتی نداشته. همان چهار حالتی که اپراتور واقعی با آن‌ها سروکار دارد.
 *
 * داده در حافظهٔ همین صفحه می‌ماند — با نوسازی به حالت اول برمی‌گردد.
 */
const today = new Date()
const day = (offset: number): string => {
  const at = new Date(today)
  at.setDate(at.getDate() + offset)
  return `${at.getFullYear()}-${String(at.getMonth() + 1).padStart(2, '0')}-${String(
    at.getDate(),
  ).padStart(2, '0')}`
}

const CENTERS: CenterSummary[] = [
  {
    centerId: 'centre-aftab',
    name: 'مهد آفتاب',
    plan: 'ماهانه',
    activeUntil: null,
    licenceActive: true,
    children: 27,
    staff: 5,
    families: 24,
    lastActivity: day(0),
  },
  {
    centerId: 'centre-setareh',
    name: 'مهد ستاره',
    plan: 'ماهانه',
    activeUntil: day(9),
    licenceActive: true,
    children: 41,
    staff: 8,
    families: 38,
    lastActivity: day(0),
  },
  {
    centerId: 'centre-bahar',
    name: 'مهد بهار',
    plan: 'ماهانه',
    activeUntil: day(-6),
    licenceActive: false,
    children: 18,
    staff: 4,
    families: 17,
    lastActivity: day(-6),
  },
  {
    centerId: 'centre-shokufeh',
    name: 'مهد شکوفه',
    plan: 'آزمایشی',
    activeUntil: day(21),
    licenceActive: true,
    children: 0,
    staff: 1,
    families: 0,
    lastActivity: null,
  },
]

let seq = 0

export function createLocalPlatformAccess(): PlatformAccess {
  return {
    async listCenters() {
      return CENTERS.map((row) => ({ ...row }))
    },

    async createCenter(input: NewCenter) {
      const name = input.name.trim()
      if (!name) throw new Error('نام مهد لازم است.')
      if (!input.managerName.trim()) throw new Error('نام مدیر لازم است.')
      if (!input.managerPhone.trim()) throw new Error('شماره مدیر لازم است.')

      const id = `centre-new-${(seq += 1)}`
      CENTERS.push({
        centerId: id,
        name,
        plan: input.plan?.trim() || null,
        activeUntil: input.activeUntil ?? null,
        licenceActive: true,
        /* مهد تازه هنوز کودکی ندارد — مدیرش باید ثبت‌نام کند. */
        children: 0,
        staff: 1,
        families: 0,
        lastActivity: null,
      })
      return id
    },

    async setCenterLicence(centerId, plan, activeUntil) {
      const row = CENTERS.find((c) => c.centerId === centerId)
      if (!row) throw new Error('مهد پیدا نشد.')
      row.plan = plan?.trim() || null
      row.activeUntil = activeUntil
      row.licenceActive = activeUntil === null || activeUntil >= day(0)
    },
  }
}
