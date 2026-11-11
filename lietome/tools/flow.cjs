// 휴대폰 크기로 시작 → 사건마다 세 사람에게 부고 전하기 → 평소 얼굴 누르기 → 탭·지목 → 결과까지 눌러 보고 화면을 찍는다.
// 사건 1은 꾸민 사람의 단서 위치를, 사건 2가 있으면 일부러 진짜 슬퍼한 사람을 지목한다.
// 사용: node tools/flow.cjs <출력 폴더> <사건1 단서 x> <사건1 단서 y>
const { chromium } = require('/Users/gio_c/apps/pick/node_modules/.pnpm/playwright@1.60.0/node_modules/playwright');
const path = require('path');
(async () => {
  const [, , out, tx = '0.5', ty = '0.33'] = process.argv;
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 375, height: 760 }, deviceScaleFactor: 2, hasTouch: true });
  const pg = await ctx.newPage();
  const errors = [];
  pg.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  pg.on('pageerror', (e) => errors.push(String(e)));
  pg.on('requestfailed', (r) => errors.push(`failed ${r.url()}`));
  await pg.goto('file://' + path.resolve(__dirname, '../dist/index.html'));
  await pg.waitForTimeout(900);
  const shot = (n, full = false) => pg.screenshot({ path: path.join(out, `${n}.png`), fullPage: full });
  await shot('0-start');
  await pg.click('#start');
  const tapAt = async (x, y) => {
    const box = await pg.locator('#mon').boundingBox();
    await pg.mouse.click(box.x + box.width * x, box.y + box.height * y);
  };
  const tellAll = async (first) => {
    for (const key of ['bujang', 'daeri', 'sawon']) {
      await pg.click(`.suspect[data-key=${key}]`);
      if (first && key === 'bujang') await shot('1-before');
      await pg.click('#tell');
      if (first && key === 'bujang') { await pg.waitForTimeout(400); await shot('2-telling'); }
      await pg.waitForTimeout(1500);
    }
  };
  // 사건 1
  await tellAll(true);
  await pg.click('.suspect[data-key=bujang]');
  await pg.dispatchEvent('#hold', 'pointerdown');
  const baseShown = await pg.locator('#mon .base').isVisible();
  await shot('3-hold');
  await pg.dispatchEvent('#hold', 'pointerup');
  await tapAt(+tx, +ty);
  await shot('4-pinned');
  await pg.click('#accuse');
  await pg.waitForTimeout(300);
  await shot('5-reveal-hit', true);
  const pts1 = await pg.textContent('.pts');
  await pg.click('#next');
  // 사건이 더 있으면 진짜 슬퍼한 대리를 지목해 틀리는 경우를 본다
  let pts2 = null;
  if (await pg.locator('.suspect').count()) {
    await tellAll(false);
    await pg.click('.suspect[data-key=daeri]');
    await tapAt(0.5, 0.35);
    await pg.click('#accuse');
    await pg.waitForTimeout(300);
    await shot('6-reveal-miss', true);
    pts2 = await pg.textContent('.pts');
    await pg.click('#next');
  }
  await pg.waitForTimeout(300);
  await shot('7-result', true);
  const stored = await pg.evaluate(() => localStorage.getItem('lietome:v3'));
  const overflow = await pg.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  console.log(JSON.stringify({ errors, baseShown, pts1, pts2, stored, overflow }, null, 1));
  await b.close();
})();
