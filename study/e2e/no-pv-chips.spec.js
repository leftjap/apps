/**
 * Wave 11.30 — SPA 모드에서 mocks 디버그 chip (.pv-bar) 일괄 hide 회귀 방지.
 *
 * 검증 (4건, 모든 mocks):
 *  A. /#/login → .pv-bar display:none + offsetHeight=0
 *  B. /#/home → .pv-bar display:none
 *  C. /#/session?mode=combined → .pv-bar display:none (session.html 인라인 분기 + app.js 일괄 hide 둘 다 적용)
 *  D. /#/summary → .pv-bar display:none
 *
 * SPA 가드: window.studyDB 가 있어야 .pv-bar 가 hide 됨. ensureUserDB(fakeUser) 우회 후 검증.
 * (login 라우트는 가드 통과 → studyDB 가 있어도 visible 한다는 전제 → 단, app.js 의 hidePvChips 가 라우트 무관하게 동작)
 */
import { test, expect } from '@playwright/test';

const FAKE_USER = {
  id: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
  email: 'test@example.com',
};

async function bootstrap(page) {
  await page.goto('/');
  await page.evaluate(async (user) => {
    await window.studyAuth.ensureUserDB(user);
  }, FAKE_USER);
}

async function expectHidden(page, route) {
  // page.goto 가 같은 hash 면 no-op → mount 미발화. 항상 다른 라우트로 우회 후 진입.
  await page.goto('/#/__bootstrap__');
  await page.goto(route);
  // mount + reExecuteScripts + hidePvChips 가 동기 → 즉시 적용
  // 단, summary 의 sessionStorage.studySummary 부재 시 IIFE 가 fallback fixture 로 render — pv-bar 는 그대로 hide
  const bars = page.locator('.pv-bar');
  const count = await bars.count();
  if (count === 0) return; // 해당 mocks 에 .pv-bar 없음 — pass
  for (let i = 0; i < count; i++) {
    const display = await bars.nth(i).evaluate((el) => getComputedStyle(el).display);
    expect(display, `route ${route} pv-bar[${i}] display`).toBe('none');
  }
  // .pv-spacer 도 hide
  const spacers = page.locator('.pv-spacer');
  const sc = await spacers.count();
  for (let i = 0; i < sc; i++) {
    const display = await spacers.nth(i).evaluate((el) => getComputedStyle(el).display);
    expect(display, `route ${route} pv-spacer[${i}] display`).toBe('none');
  }
}

test.describe('Wave 11.30 — SPA 모드 .pv-bar hide', () => {
  test('A. /#/login → pv-bar hide (login 라우트도 SPA 모드면 hide)', async ({ page }) => {
    await bootstrap(page);
    await expectHidden(page, '/#/login');
  });

  test('B. /#/home → pv-bar hide', async ({ page }) => {
    await bootstrap(page);
    await expectHidden(page, '/#/home');
  });

  test('C. /#/session?mode=combined → pv-bar hide (인라인 + app.js 둘 다)', async ({ page }) => {
    await bootstrap(page);
    await expectHidden(page, '/#/session?mode=combined');
  });

  test('D. /#/summary → pv-bar hide', async ({ page }) => {
    await bootstrap(page);
    // summary 는 sessionStorage.studySummary 가 없어도 fixture fallback render — .pv-bar 는 hide
    await expectHidden(page, '/#/summary');
  });
});
