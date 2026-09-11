import { fileURLToPath, URL } from 'node:url'
import { defineConfig, type Plugin } from 'vitest/config'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

// بخش ۱۴.۱ سند: PWA با React. توزیع مستقل از فروشگاه.
// بخش ۱۴.۲: کارکرد کامل در ۴ ساعت آفلاین، پس پوسته اپ باید پیش‌ذخیره شود.

/**
 * عکس‌های کودکان نمونه نباید وارد بیلد تولید شوند.
 *
 * کدشان حذف می‌شود (شاخه انتخاب‌نشده با import پویا کنار می‌رود)، ولی
 * Vite خود فایل‌های تصویر را همچنان بیرون می‌دهد و یتیم در dist می‌مانند.
 * این افزونه همان‌ها را پاک می‌کند، پس بیلد تولید هیچ عکس کودک نمونه‌ای
 * حمل نمی‌کند. build.test.ts همین را می‌سنجد.
 */
function dropDemoFaces(isDemo: boolean): Plugin {
  return {
    name: 'kg-drop-demo-faces',
    apply: 'build',
    generateBundle(_options, bundle) {
      if (isDemo) return
      for (const name of Object.keys(bundle)) {
        if (/child-\d+-[\w-]+\.webp$/.test(name)) delete bundle[name]
      }
    },
  }
}

export default defineConfig({
  // زیر زیرپوشه سایت منتشر می‌شود (مثلاً /Tictactoestevie/kindergarten/)،
  // پس همه نشانی‌ها باید با همان پیشوند ساخته شوند. محلی همان ریشه است.
  base: process.env.BASE_PATH ?? '/',
  plugins: [
    react(),
    dropDemoFaces(process.env.VITE_DEMO === '1' || process.env.NODE_ENV !== 'production'),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icon.svg'],
      manifest: {
        name: 'سامانه مدیریت مهدکودک',
        short_name: 'مهد',
        description: 'گزارش روزانه، حضور و غیاب و پرونده کودک',
        lang: 'fa',
        dir: 'rtl',
        start_url: '.',
        display: 'standalone',
        background_color: '#F5F7F4', // --paper، بخش ۱۲.۲
        theme_color: '#0F8C86', // --turquoise، بخش ۱۲.۲
        icons: [
          { src: 'icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' },
        ],
      },
      workbox: {
        // بخش ۱۴.۲: کارکرد کامل در ۴ ساعت آفلاین. عکس کودکان بخشی از
        // صفحه «امروز» است، پس باید پیش‌ذخیره شود نه اینکه آفلاین خالی بماند.
        globPatterns: ['**/*.{js,css,html,svg,woff2,webp}'],
      },
    }),
  ],
  resolve: {
    alias: {
      '@app': fileURLToPath(new URL('./src/app', import.meta.url)),
      '@core': fileURLToPath(new URL('./src/core', import.meta.url)),
      '@ds': fileURLToPath(new URL('./src/design-system', import.meta.url)),
      '@i18n': fileURLToPath(new URL('./src/i18n', import.meta.url)),
      '@reports': fileURLToPath(new URL('./src/reports', import.meta.url)),
    },
  },
  test: {
    globals: true,
    environment: 'node',
    // e2e با مرورگر واقعی و با npm run test:e2e اجرا می‌شود، نه اینجا.
    include: ['src/**/*.test.ts'],
  },
})
