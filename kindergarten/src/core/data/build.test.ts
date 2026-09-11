/**
 * بیلد تولید نباید هیچ ردی از داده نمونه داشته باشد.
 *
 * این تست بر خلاف بقیه، خروجی واقعی بیلد را می‌خواند. دلیلش این است که
 * «شاخه انتخاب‌نشده حذف می‌شود» ادعایی درباره tree-shaking است و فقط
 * روی خروجی واقعی قابل اثبات است، نه از روی کد.
 *
 * اگر dist وجود نداشته باشد تست خودش بیلد می‌گیرد.
 */
import { execFileSync } from 'node:child_process'
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const root = new URL('../../../', import.meta.url).pathname
const dist = join(root, 'dist')

/** هر چیزی که فقط در داده نمونه هست و هرگز نباید به دست خانواده برسد. */
const FORBIDDEN = [
  'fixture',
  'localAuthAdapter',
  'مهد آفتاب',
  '09120000001',
  'زهرا محمدی',
]

function buildOnce() {
  execFileSync('npm', ['run', 'build'], {
    cwd: root,
    stdio: 'pipe',
    env: {
      ...process.env,
      VITE_DATA_SOURCE: 'supabase',
      VITE_SUPABASE_URL: 'https://example.invalid',
      VITE_SUPABASE_ANON_KEY: 'test',
      VITE_DEMO: '',
    },
  })
}

function jsFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name)
    if (statSync(path).isDirectory()) return jsFiles(path)
    return name.endsWith('.js') ? [path] : []
  })
}

describe('بیلد تولید', () => {
  it('هیچ ردی از داده نمونه ندارد', () => {
    if (!existsSync(dist)) buildOnce()
    const files = jsFiles(dist)
    expect(files.length).toBeGreaterThan(0)

    const found: string[] = []
    for (const file of files) {
      const text = readFileSync(file, 'utf8')
      for (const needle of FORBIDDEN) {
        if (text.includes(needle)) found.push(`${needle} در ${file.replace(dist, '')}`)
      }
    }
    expect(found).toEqual([])
  }, 180_000)
})
