import { test, expect } from '@playwright/test';

test('PC 레일의 모든 진입 버튼은 기존 경로를 유지한다', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('mocks/home.html?demo=1&phase=mid');
  const routes = [
    ['.vh-cta.pri', '#/session-new'],
    ['.vh-cta.rev', '#/session-review'],
    ['.vh-cta.sec >> text=문장 모아보기', '#/sentences'],
    ['.vh-cta.sec >> text=연속 듣기', '#/listen'],
    ['.vh-cta.sec >> text=말하기 연습', '#/speak'],
    ['button[aria-label="기록"]', '#/stats'],
    ['button[aria-label="설정"]', '#/settings'],
  ];
  for (const [selector, hash] of routes) {
    await page.locator(`nav ${selector}`).click();
    await expect.poll(() => page.evaluate(() => location.hash)).toBe(hash);
  }
});

test('과목을 왕복하면 레일 행동과 수학 경로가 함께 바뀐다', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('mocks/home.html?demo=1');
  await page.getByRole('button', { name: '일본어', exact: true }).click();
  await expect(page.locator('nav .vh-cta')).toHaveCount(4);
  await expect(page.locator('.vh-practice')).toContainText('한글 뒤 일본어');
  await page.getByRole('button', { name: '수학', exact: true }).click();
  await expect(page.locator('nav .vh-cta')).toHaveCount(2);
  await expect(page.locator('.vh-practice')).toHaveCount(0);
  await page.locator('.vh-cta.pri').click();
  await expect.poll(() => page.evaluate(() => location.hash)).toBe('#/session-math?mode=new');
  await page.locator('.vh-cta.rev').click();
  await expect.poll(() => page.evaluate(() => location.hash)).toBe('#/session-math?mode=review');
  await page.getByRole('button', { name: '영어', exact: true }).click();
  await expect(page.locator('nav .vh-cta')).toHaveCount(5);
});

test('반응형 경계를 왕복해도 칸·발화·버튼을 잃지 않는다', async ({ page }) => {
  await page.goto('mocks/home.html?demo=1&phase=mid');
  for (const width of [390, 1023, 1024, 1159, 1160, 1280, 1920, 1023, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    await expect(page.locator(width >= 1024 ? '.vh' : '.vhm')).toBeVisible();
    await expect(page.locator('.vh-cell')).toHaveCount(28);
    await expect(page.locator('.vh-wk')).toHaveCount(4);
    await expect(page.locator('.vh-ring2 .n')).toHaveText('18');
    await expect(page.locator('.vh-cta')).toHaveCount(5);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    if (width >= 1024) {
      expect((await page.locator('nav').boundingBox()).width).toBe(296);
      expect(await page.locator('.vh-wkcol').evaluate((node) => getComputedStyle(node).display)).toBe(width < 1160 ? 'grid' : 'flex');
      expect((await page.locator('.vh-col').boundingBox()).width).toBe(Math.min(920, width - 368));
    }
  }
});

for (const [phase, label] of [['fresh', '학습 시작'], ['mid', '이어서 하기'], ['done', '다시 듣기']]) {
  test(`${phase} 데모의 학습 라벨과 PC 본문`, async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(`mocks/home.html?demo=1&phase=${phase}`);
    await expect(page.locator('nav .vh-cta.pri .t1')).toHaveText(label);
    await expect(page.locator('main .vh-todayline')).toBeVisible();
    await expect(page.locator('main .vh-cum > div')).toHaveCount(4);
  });
}
