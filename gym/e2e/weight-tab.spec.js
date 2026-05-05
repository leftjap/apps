/**
 * Wave 11.7.2b — admin 체중 탭 wiring e2e 검증.
 *
 * 환경 가정:
 *   - vite preview (4173) 정적 빌드 환경.
 *   - .env.local 설정 시: 실 supabase 세션이 있으면 OAuth 자동 redirect 가능 → SPA 환경 케이스 skip.
 *   - 미설정 시: window.gymAuth.isSupabaseConfigured=false → fakeUser ensureUserDB 로 가드 통과.
 *
 * 검증:
 *   A. 미인증 admin 직접 접근 → #/login 가드 (회귀 — 기존 가드 흐름).
 *   B. SPA fakeUser admin 진입 → window.gymWeights 노출 + entry form 토글.
 *   C. saveWeightInput 직접 호출 → list/hero 동적 갱신 + PR 팝 (DOM-driven 검증).
 */
import { test, expect } from '@playwright/test';

const FAKE_USER = { id: '11111111-2222-3333-4444-555555555555', email: 'fake@e2e.test' };

async function bootstrapFake(page) {
  await page.goto('/');
  await page.evaluate(async (user) => {
    if (!window.gymAuth) return;
    await window.gymAuth.ensureUserDB(user);
  }, FAKE_USER);
}

test.describe('Wave 11.7.2b — admin weight tab', () => {
  test('A. 미인증 #/admin → 가드 redirect', async ({ page }) => {
    await page.goto('/#/admin');
    await page.waitForURL(/#\/login$/, { timeout: 5_000 });
    await expect(page.locator('body')).toHaveAttribute('data-route', 'login');
  });

  test('B. SPA fakeUser → admin 마운트 + 체중 탭 키패드 sheet 토글', async ({ page }) => {
    await bootstrapFake(page);
    // gymDB 가 fakeUser 로 셋업됐는지 확인. 안 됐으면 skip (env 시뮬 환경 외)
    const dbReady = await page.evaluate(() => !!window.gymDB);
    test.skip(!dbReady, 'window.gymDB 미할당 — fake bootstrap 환경 외');

    await page.evaluate(() => { window.location.hash = '#/admin'; });
    await page.waitForFunction(() => document.body.dataset.route === 'admin', { timeout: 5_000 });

    // 체중 탭 진입
    await page.click('[data-tab="weight"]');
    await expect(page.locator('[data-page="weight"]')).toHaveClass(/is-active/);

    // 키패드 sheet 기본 닫힘 (Wave 11.7.5a)
    const sheet = page.locator('[data-bind="keypad-sheet"]');
    await expect(sheet).not.toHaveClass(/is-open/);

    // weight-add 클릭 → 키패드 sheet 열림
    await page.click('[data-act="weight-add"]');
    await expect(sheet).toHaveClass(/is-open/);

    // 0~9 키 클릭 → display 갱신
    await page.click('[data-bind="keypad-sheet"] [data-key="7"]');
    await page.click('[data-bind="keypad-sheet"] [data-key="2"]');
    await page.click('[data-bind="keypad-sheet"] [data-key="."]');
    await page.click('[data-bind="keypad-sheet"] [data-key="5"]');
    await expect(page.locator('[data-bind="keypad-value"]')).toHaveText('72.5');

    // backdrop 좌상단(시트 영역 밖) 클릭 → 닫힘. backdrop 은 sheet 와 겹친 부분이 있어 좌표 명시.
    await page.locator('[data-bind="keypad-backdrop"]').click({ position: { x: 10, y: 10 } });
    await expect(sheet).not.toHaveClass(/is-open/);
  });

  test('C. saveWeightInput → 리스트·hero 갱신 + 신기록 PR 팝', async ({ page }) => {
    await bootstrapFake(page);
    const dbReady = await page.evaluate(() => !!window.gymDB);
    test.skip(!dbReady, 'fake bootstrap 환경 외');

    await page.evaluate(() => { window.location.hash = '#/admin'; });
    await page.waitForFunction(() => document.body.dataset.route === 'admin', { timeout: 5_000 });
    await page.click('[data-tab="weight"]');

    // 깨끗한 DB 보장 — 이전 테스트 잔재 제거
    await page.evaluate(async () => {
      const all = await window.gymQueries.listAllWeights();
      for (const r of all) await window.gymQueries.deleteWeight(r.date);
    });

    // 첫 입력 (PR 비교 대상 없음 → PR 아님)
    const r1 = await page.evaluate(async () => {
      return await window.gymWeights.saveWeightInput('73.4', '2026-04-01');
    });
    expect(r1.ok).toBe(true);
    expect(r1.isPR).toBe(false);

    // hero/list 갱신 확인
    await expect(page.locator('[data-bind="weight-hero-num"]')).toHaveText('73.4');
    await expect(page.locator('[data-bind="weight-list"] .weight-row')).toHaveCount(1);

    // 두 번째 입력 (이전보다 낮음 → 신기록 PR)
    const r2 = await page.evaluate(async () => {
      return await window.gymWeights.saveWeightInput('72.1', '2026-04-08');
    });
    expect(r2.ok).toBe(true);
    expect(r2.isPR).toBe(true);

    await expect(page.locator('[data-bind="weight-hero-num"]')).toHaveText('72.1');
    await expect(page.locator('[data-bind="weight-list"] .weight-row')).toHaveCount(2);
    // 가장 낮은 row 에 pr-mark
    const prMarks = await page.locator('[data-bind="weight-list"] .pr-mark').count();
    expect(prMarks).toBe(1);

    // 세 번째 입력 (이전 최저 동률 → PR 아님)
    const r3 = await page.evaluate(async () => {
      return await window.gymWeights.saveWeightInput('72.1', '2026-04-15');
    });
    expect(r3.ok).toBe(true);
    expect(r3.isPR).toBe(false);

    // chart-legend 갱신 검증 (hotfix) — 3건 [04-01 73.4 / 04-08 72.1 / 04-15 72.1]
    const legendTexts = await page.locator('.chart-legend span').allTextContents();
    expect(legendTexts.length).toBeGreaterThanOrEqual(3);
    expect(legendTexts[0]).toContain('73.4 kg'); // 가장 오래된 (2026-04-01)
    expect(legendTexts[1]).toContain('1.3 kg');  // 변화 abs (73.4 → 72.1)
    expect(legendTexts[2]).toContain('72.1 kg'); // 가장 최근 (2026-04-15)

    // 정리
    await page.evaluate(async () => {
      const all = await window.gymQueries.listAllWeights();
      for (const r of all) await window.gymQueries.deleteWeight(r.date);
    });
  });
});
