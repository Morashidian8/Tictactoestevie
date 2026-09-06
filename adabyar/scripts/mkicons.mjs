import { chromium } from 'playwright-core'
import fs from 'node:fs'

const svg = fs.readFileSync('public/favicon.svg', 'utf8')
const maskable = svg.replace('rx="112"', 'rx="0"').replace(
  '<path d="M96 150',
  '<g transform="translate(256,256) scale(0.78) translate(-256,-256)"><path d="M96 150',
).replace('</svg>', '</g></svg>')

const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' })
const page = await browser.newPage()
const shots = [
  ['public/icon-192.png', 192, svg],
  ['public/icon-512.png', 512, svg],
  ['public/icon-maskable.png', 512, maskable],
]
for (const [out, size, content] of shots) {
  await page.setViewportSize({ width: size, height: size })
  await page.setContent(`<style>*{margin:0;padding:0}svg{display:block;width:${size}px;height:${size}px}</style>${content}`)
  await page.screenshot({ path: out, omitBackground: true })
  console.log('wrote', out)
}
await browser.close()
