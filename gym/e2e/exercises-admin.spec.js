/**
 * Wave 11.7.4b — admin 운동 탭 wiring e2e.
 *
 * 환경: vite preview (4173) 정적 빌드 + fakeUser ensureUserDB 패턴.
 *
 * 검증:
 *   A. SPA fakeUser → admin 진입 시 운동 리스트 hydrate (BUILTIN 41).
 *   B. 부위 chip 클릭 → 해당 부위만 표시.
 *   C. 토글 클릭 → settings.hiddenExercises 갱신 + UI 반영 (is-hidden 클래스).
 */
import { test, expect } from '@playwright/test';

const FAKE_USER = { id: '33333333-4444-5555-6666-777777777777', email: 'admin-ex@e2e.test' };

async function bootstrapFake(page) {
  await page.goto('/');
  await page.evaluate(async (user) => {
    if (!window.gymAuth) return;
    await window.gymAuth.ensureUserDB(user);
  }, FAKE_USER);
  // 깨끗한 상태 — settings hiddenExercises 비우기
  await page.evaluate(async () => {
    if (!window.gymQueries || !window.gymDB) return;
    await window.gymQueries.upsertUserSettings({
      hiddenExercises: [], exerciseOrder: {}, exercisePartOverride: {},
    });
    const customs = await window.gymQueries.listCustomExercises();
    for (const c of customs) await window.gymQueries.deleteCustomExercise(c.id);
  });
}

async function navigateAdmin(page) {
  await page.evaluate(() => { window.location.hash = '#/admin'; });
  await page.waitForFunction(() => document.body.dataset.route === 'admin', { timeout: 5_000 });
  // SPA hydrate 완료 대기 — adminParts 가 6 부위 chip 으로 바뀐 시점
  await page.waitForFunction(() => {
    const el = document.getElementById('adminParts');
    if (!el) return false;
    return el.querySelectorAll('[data-part]').length === 6;
  }, { timeout: 5_000 });
}

test.describe('Wave 11.7.4b — admin exercises tab', () => {
  test('A. SPA admin 진입 → 6 부위 + chest 운동 hydrate', async ({ page }) => {
    await bootstrapFake(page);
    const dbReady = await page.evaluate(() => !!window.gymDB);
    test.skip(!dbReady, 'fake bootstrap 환경 외');

    await navigateAdmin(page);

    // 부위 chip 6개 (spec §11)
    const partChips = await page.locator('#adminParts [data-part]').count();
    expect(partChips).toBe(6);

    // 기본 활성 부위 chest — 그 부위 운동 row 가 1건 이상
    const exRows = await page.locator('#adminExList .ex-row').count();
    expect(exRows).toBeGreaterThan(0);

    // bench_press 행이 보임
    await expect(page.locator('#adminExList .ex-row[data-id="bench_press"]')).toBeVisible();
  });

  test('B. 부위 chip 클릭 → 해당 부위만 표시', async ({ page }) => {
    await bootstrapFake(page);
    const dbReady = await page.evaluate(() => !!window.gymDB);
    test.skip(!dbReady, 'fake bootstrap 환경 외');

    await navigateAdmin(page);

    // legs 부위 클릭
    await page.click('#adminParts [data-part="legs"]');
    await expect(page.locator('#adminParts [data-part="legs"]')).toHaveClass(/is-active/);

    // squat 행 보임 (legs)
    await expect(page.locator('#adminExList .ex-row[data-id="squat"]')).toBeVisible();
    // bench_press 는 legs 부위 아니므로 미표시
    await expect(page.locator('#adminExList .ex-row[data-id="bench_press"]')).toHaveCount(0);
  });

  test('C. 토글 클릭 → settings.hiddenExercises + is-hidden 클래스', async ({ page }) => {
    await bootstrapFake(page);
    const dbReady = await page.evaluate(() => !!window.gymDB);
    test.skip(!dbReady, 'fake bootstrap 환경 외');

    await navigateAdmin(page);

    const benchRow = page.locator('#adminExList .ex-row[data-id="bench_press"]');
    await expect(benchRow).not.toHaveClass(/is-hidden/);

    // 토글 click
    await benchRow.locator('[data-toggle="bench_press"]').click();

    // is-hidden 클래스 부여
    await expect(benchRow).toHaveClass(/is-hidden/, { timeout: 3_000 });

    // settings.hiddenExercises 에 bench_press 포함
    const hidden = await page.evaluate(async () => {
      const s = await window.gymQueries.getUserSettings();
      return s.hiddenExercises;
    });
    expect(hidden).toContain('bench_press');

    // 한 번 더 클릭 → 복귀
    await benchRow.locator('[data-toggle="bench_press"]').click();
    await expect(benchRow).not.toHaveClass(/is-hidden/, { timeout: 3_000 });
  });
});
