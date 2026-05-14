import { chromium } from '@playwright/test';
import { writeFileSync, mkdirSync } from 'fs';
import { dirname, resolve } from 'path';

const root = resolve(import.meta.dirname, '..');
const pub = resolve(root, 'public');

// 마스크 가능(maskable) 변형은 SVG 내부에서 안전 영역(80%)에 맞춰 축소
function buildSVG({ maskable = false } = {}) {
  const scale = maskable ? 0.78 : 1;
  const off = (1024 - 1024 * scale) / 2;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024" width="1024" height="1024">
    <rect width="1024" height="1024" fill="#fdfdfd"/>
    <g transform="translate(${off},${off}) scale(${scale})">
      <text x="512" y="540" text-anchor="middle" dominant-baseline="central"
            font-family="'Pretendard', 'Apple SD Gothic Neo', 'AppleGothic', system-ui, sans-serif"
            font-weight="700" font-size="640" fill="#332f2b" letter-spacing="-12">투</text>
      <circle cx="780" cy="244" r="34" fill="#d97757"/>
    </g>
  </svg>`;
}

const targets = [
  { path: 'favicon-16.png',           size: 16,  maskable: false },
  { path: 'favicon-32.png',           size: 32,  maskable: false },
  { path: 'icons/icon-180.png',       size: 180, maskable: false },
  { path: 'icons/icon-192.png',       size: 192, maskable: false },
  { path: 'icons/icon-512.png',       size: 512, maskable: false },
  { path: 'icons/icon-512-maskable.png', size: 512, maskable: true  },
];

const browser = await chromium.launch();
try {
  for (const t of targets) {
    const ctx = await browser.newContext({
      viewport: { width: t.size, height: t.size },
      deviceScaleFactor: 1,
    });
    const page = await ctx.newPage();
    const svg = buildSVG({ maskable: t.maskable });
    const html = `<!doctype html><html><head>
      <link rel="preconnect" href="https://cdn.jsdelivr.net">
      <link rel="stylesheet" href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/static/pretendard.css">
      <style>
        html,body{margin:0;padding:0;background:transparent}
        body{width:${t.size}px;height:${t.size}px;font-family:'Pretendard',sans-serif}
        svg{display:block;width:${t.size}px;height:${t.size}px}
      </style></head><body>${svg}</body></html>`;
    await page.setContent(html, { waitUntil: 'networkidle' });
    await page.evaluate(async () => {
      if (document.fonts) {
        await document.fonts.load('700 640px Pretendard');
        await document.fonts.ready;
      }
    });
    const buf = await page.screenshot({ type: 'png', omitBackground: false, clip: { x: 0, y: 0, width: t.size, height: t.size } });
    const out = resolve(pub, t.path);
    mkdirSync(dirname(out), { recursive: true });
    writeFileSync(out, buf);
    console.log(`wrote ${t.path} (${t.size}×${t.size}, maskable=${t.maskable}) — ${buf.length} bytes`);
    await ctx.close();
  }
} finally {
  await browser.close();
}
