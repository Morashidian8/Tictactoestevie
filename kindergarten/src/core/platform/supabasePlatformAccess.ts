import { supabase } from '../data/supabase/client.ts'
import { ALL_FEATURES } from '../data/index.ts'
import type { CentreFeature, FeatureFlags } from '../data/index.ts'
import type { CenterSummary, NewCenter, PlatformAccess } from './types.ts'

type Row = Record<string, unknown>

function orThrow<T>(res: { data: T; error: { message: string } | null }): T {
  if (res.error) throw new Error(res.error.message)
  return res.data
}

/**
 * لایهٔ سکو روی Supabase.
 *
 * هر سه متد از توابع `security definer` مهاجرت ۰۰۴۱ می‌خوانند، نه از
 * جدول‌ها. دلیلش همان خط قرمز است: تابع، فقط شمار برمی‌گرداند و
 * خواندنِ مستقیمِ جدول‌ها را سیاست سطر-محور می‌بندد — حتی برای اپراتور.
 */
export function createSupabasePlatformAccess(): PlatformAccess {
  const db = supabase()

  return {
    async listCenters() {
      const rows = ((orThrow(await db.rpc('platform_overview')) ?? []) as Row[])
      return rows.map(
        (r): CenterSummary => ({
          centerId: r.center_id as string,
          name: r.name as string,
          plan: (r.plan as string | null) ?? null,
          activeUntil: (r.active_until as string | null) ?? null,
          licenceActive: Boolean(r.licence_active),
          children: Number(r.children ?? 0),
          staff: Number(r.staff ?? 0),
          families: Number(r.families ?? 0),
          lastActivity: (r.last_activity as string | null) ?? null,
        }),
      )
    },

    async createCenter(input: NewCenter) {
      const rows = ((orThrow(
        await db.rpc('create_center', {
          centre_name: input.name.trim(),
          manager_name: input.managerName.trim(),
          manager_phone: input.managerPhone.trim(),
          centre_plan: input.plan?.trim() || null,
          until: input.activeUntil ?? null,
        }),
      ) ?? []) as Row[])
      const made = rows[0]?.center_id as string | undefined
      if (!made) throw new Error('مهد ساخته نشد.')
      return made
    },

    async setCenterLicence(centerId, plan, activeUntil) {
      orThrow(
        await db.rpc('set_center_licence', {
          centre: centerId,
          centre_plan: plan?.trim() || null,
          until: activeUntil,
        }),
      )
    },

    async listCenterFeatures(centerId) {
      const rows = ((orThrow(
        await db.rpc('center_features', { centre: centerId }),
      ) ?? []) as Row[])
      /* از «همه روشن» شروع می‌شود — همان قاعدهٔ `center_feature_on`. */
      const flags = Object.fromEntries(
        ALL_FEATURES.map((f) => [f, true]),
      ) as FeatureFlags
      for (const r of rows) {
        const key = r.feature as CentreFeature
        if (key in flags) flags[key] = Boolean(r.enabled)
      }
      return flags
    },

    async setCenterFeature(centerId, feature, on) {
      orThrow(
        await db.rpc('set_center_feature', {
          centre: centerId,
          which: feature,
          turn_on: on,
        }),
      )
    },
  }
}
