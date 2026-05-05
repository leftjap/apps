/**
 * Wave 11.7.3b — session 화면 PR 영속화 e2e.
 *
 * 환경: vite preview (4173) 정적 빌드. fakeUser ensureUserDB 패턴 (Wave 11.7.2b 답습).
 *
 * 검증:
 *   A. SPA fakeUser → window.gymSessionPR API 노출 확인.
 *   B. persistSetPR 첫 호출 → DB prs row + isPR=true.
 *   C. 더 큰 e1rm 두 번째 호출 → PR 갱신.
 *   D. 더 작은 e1rm → PR 아님 + DB 변화 없음.
 */
import { test, expect } from '@playwright/test';

const FAKE_USER = { id: '22222222-3333-4444-5555-666666666666', email: 'pr@e2e.test' };

async function bootstrapFake(page) {
  await page.goto('/');
  await page.evaluate(async (user) => {
    if (!window.gymAuth) return;
    await window.gymAuth.ensureUserDB(user);
  }, FAKE_USER);
  // 깨끗한 상태 보장
  await page.evaluate(async () => {
    if (!window.gymQueries || !window.gymDB) return;
    const prs = await window.gymQueries.listAllPRs();
    for (const p of prs) await window.gymQueries.deletePR(p.exerciseId, p.type);
  });
}

test.describe('Wave 11.7.3b — session PR 영속화', () => {
  test('A. SPA fakeUser → window.gymSessionPR API 노출', async ({ page }) => {
    await bootstrapFake(page);
    const dbReady = await page.evaluate(() => !!window.gymDB);
    test.skip(!dbReady, 'fake bootstrap 환경 외');
    const apiOk = await page.evaluate(() => {
      return !!(window.gymSessionPR
        && typeof window.gymSessionPR.persistSetPR === 'function'
        && typeof window.gymSessionPR.mapNameToExerciseId === 'function'
        && typeof window.gymSessionPR.getPrevBestE1RMForName === 'function');
    });
    expect(apiOk).toBe(true);
    // 한국어 매핑 동작 확인
    const id = await page.evaluate(() => window.gymSessionPR.mapNameToExerciseId('벤치프레스'));
    expect(id).toBe('bench_press');
  });

  test('B. 첫 세트 → PR + DB 영속화', async ({ page }) => {
    await bootstrapFake(page);
    const dbReady = await page.evaluate(() => !!window.gymDB);
    test.skip(!dbReady, 'fake bootstrap 환경 외');

    const r = await page.evaluate(async () => {
      return await window.gymSessionPR.persistSetPR({
        exerciseName: '벤치프레스',
        weight: 60,
        reps: 10,
        sessionId: 'sess-e2e-1',
        date: '2026-04-01',
      });
    });
    expect(r.ok).toBe(true);
    expect(r.isPR).toBe(true);
    expect(r.exerciseId).toBe('bench_press');
    expect(r.e1rm).toBeCloseTo(80, 1);

    const stored = await page.evaluate(async () => {
      return await window.gymQueries.getBestE1RM('bench_press');
    });
    expect(stored).toBeTruthy();
    expect(stored.weight).toBe(60);
    expect(stored.reps).toBe(10);
  });

  test('C. 더 큰 e1rm → PR 갱신', async ({ page }) => {
    await bootstrapFake(page);
    const dbReady = await page.evaluate(() => !!window.gymDB);
    test.skip(!dbReady, 'fake bootstrap 환경 외');

    await page.evaluate(async () => {
      await window.gymSessionPR.persistSetPR({
        exerciseName: '벤치프레스', weight: 60, reps: 10,
        sessionId: 'sess1', date: '2026-04-01',
      });
    });
    const r2 = await page.evaluate(async () => {
      return await window.gymSessionPR.persistSetPR({
        exerciseName: '벤치프레스', weight: 70, reps: 8,
        sessionId: 'sess2', date: '2026-04-08',
      });
    });
    expect(r2.isPR).toBe(true);
    const stored = await page.evaluate(async () => {
      return await window.gymQueries.getBestE1RM('bench_press');
    });
    expect(stored.weight).toBe(70);
    expect(stored.reps).toBe(8);
  });

  test('D. 더 작은 e1rm → PR 아님, DB 보존', async ({ page }) => {
    await bootstrapFake(page);
    const dbReady = await page.evaluate(() => !!window.gymDB);
    test.skip(!dbReady, 'fake bootstrap 환경 외');

    await page.evaluate(async () => {
      await window.gymSessionPR.persistSetPR({
        exerciseName: '벤치프레스', weight: 70, reps: 8,
        sessionId: 'sess1', date: '2026-04-01',
      });
    });
    const r2 = await page.evaluate(async () => {
      return await window.gymSessionPR.persistSetPR({
        exerciseName: '벤치프레스', weight: 60, reps: 10,
        sessionId: 'sess2', date: '2026-04-08',
      });
    });
    expect(r2.isPR).toBe(false);
    const stored = await page.evaluate(async () => {
      return await window.gymQueries.getBestE1RM('bench_press');
    });
    expect(stored.weight).toBe(70); // 첫 입력 보존
  });
});
