// 쓰는 법: node .../measure.mjs <desktop|mobile> <이름=주소> ...  → 실제 GPU 헤드리스 크롬으로 첫 표시 시각·받는 자료·프레임을 TSV 로 찍는다
// mobile 은 390×844 DPR 3 에 CPU 를 4배 느리게 한다. 칸 자료가 다 붙을 때(tilesPending 0)까지 기다린 시각을 첫 표시로 센다.
import { chromium } from '../../../../tmp/seogyo-auto/browser/node_modules/playwright-core/index.mjs';

const [mode, ...jobs] = process.argv.slice(2);
const mobile = mode === 'mobile';
const browser = await chromium.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true,
  args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist', '--mute-audio'],
});
console.log(['이름', '첫표시ms', '받은바이트', '프레임중앙ms', '프레임p95ms', '오류'].join('\t'));
for (const job of jobs) {
  const at = job.indexOf('=');
  const name = job.slice(0, at), url = job.slice(at + 1);
  const page = await browser.newPage({
    viewport: mobile ? { width: 390, height: 844 } : { width: 1440, height: 900 },
    deviceScaleFactor: mobile ? 3 : 2,
  });
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e).slice(0, 120)));
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Network.enable');
  if (mobile) await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
  // 개발 서버는 모듈을 수백 개로 나눠 보내므로 지도 자료(`/data/v2/`)만 센다
  let bytes = 0;
  const wanted = new Set();
  cdp.on('Network.responseReceived', (event) => {
    if (event.response?.url?.includes('/data/v2/')) wanted.add(event.requestId);
  });
  cdp.on('Network.loadingFinished', (event) => {
    if (wanted.has(event.requestId)) bytes += event.encodedDataLength ?? 0;
  });
  const started = Date.now();
  let first = -1;
  try {
    await page.goto(url, { timeout: 180000 });
    await page.waitForFunction(() => document.querySelector('main')?.dataset.ready === 'true', null, { timeout: 180000 });
    await page.waitForFunction(() => (document.querySelector('canvas')?.dataset.tilesPending ?? '0') === '0', null, { timeout: 120000 });
    first = Date.now() - started;
  } catch (error) {
    errors.push(`안 뜸: ${String(error).slice(0, 120)}`);
  }
  let frames = { median: '', p95: '' };
  if (first >= 0) {
    await page.waitForTimeout(1500);
    frames = await page.evaluate(async () => {
      const canvas = document.querySelector('canvas');
      const gaps = [];
      let last = performance.now();
      await new Promise((done) => {
        const step = (now) => {
          gaps.push(now - last); last = now;
          canvas?.dispatchEvent(new WheelEvent('wheel', { deltaY: 0, bubbles: true }));
          gaps.length < 90 ? requestAnimationFrame(step) : done();
        };
        requestAnimationFrame(step);
      });
      const sorted = gaps.slice(10).sort((a, b) => a - b);
      return { median: sorted[sorted.length >> 1].toFixed(1), p95: sorted[Math.floor(sorted.length * 0.95)].toFixed(1) };
    });
  }
  console.log([name, first, bytes, frames.median, frames.p95, errors.join(' / ')].join('\t'));
  await page.close();
}
await browser.close();
