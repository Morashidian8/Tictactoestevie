import { fileURLToPath, URL } from 'node:url'
import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

// بخش ۱۴.۱ سند: PWA با React. توزیع مستقل از فروشگاه.
// بخش ۱۴.۲: کارکرد کامل در ۴ ساعت آفلاین، پس پوسته اپ باید پیش‌ذخیره شود.
export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icon.svg'],
      manifest: {
        name: 'سامانه مدیریت مهدکودک',
        short_name: 'مهد',
        description: 'گزارش روزانه، حضور و غیاب و پرونده کودک',
        lang: 'fa',
        dir: 'rtl',
        start_url: '/',
        display: 'standalone',
        background_color: '#F5F7F4', // --paper، بخش ۱۲.۲
        theme_color: '#0F8C86', // --turquoise، بخش ۱۲.۲
        icons: [
          { src: '/icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,woff2}'],
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
  },
})
