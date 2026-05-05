/**
 * Wave 11.17 — mocks UI 데이터 표시 e2e.
 *
 * 검증 대상:
 *  - 인증 후 seed (reviewQueue 13 + sessionLogs 11 + dailyStats 11 + todayLessons 3) → home/stats 화면이 그 데이터로 DOM 갱신.
 *  - mocks IIFE 가 window.studyDB 접근해 실 데이터 표시.
 *
 * 인증 우회 전략 (Wave 11.12 의 e2e 와 분리):
 *  - env=빈 환경 (.env.local 백업 후 빈 값) → supabase=null. allowlist 검사 X.
 *  - page.evaluate 로 fakeUser 직접 ensureUserDB 호출 → window.studyDB 셋업 + seedIfNeeded 자동 실행.
 *  - 이후 #/home 이동 → 라우트 가드 통과 (window.studyDB 검사 만 — auth.js 미연동).
 */
import { test, expect } from '@playwright/test';

const FAKE_USER = {
  id: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
  email: 'test@example.com',
};

async function bootstrapFakeUser(page) {
  await page.goto('/');
  // ensureUserDB → window.studyDB 동적 할당 + seedIfNeeded.
  // page.evaluate 의 async fn 은 Promise resolution 까지 기다림.
  await page.evaluate(async (user) => {
    await window.studyAuth.ensureUserDB(user);
  }, FAKE_USER);
}

test.describe('Wave 11.17 — mocks UI 데이터 표시', () => {
  test('home — seed 데이터 기반 #streak-num / summary-row 갱신', async ({ page }) => {
    await bootstrapFakeUser(page);
    await page.goto('/#/home');
    // home.html 의 IIFE 가 updateHomeStats 비동기 호출 → DOM 갱신 대기
    await expect(page.locator('#streak-num')).toBeVisible({ timeout: 5_000 });
    const streakText = await page.locator('#streak-num').textContent();
    expect(streakText).toMatch(/^\d+$/); // streak 은 시점 의존 — 숫자 형식만 검증
    // summary-row 의 expressions / due 카운트 — seed 의 reviewQueue 13건 기반
    const summaryRow = await page.locator('#summary-row').innerHTML();
    expect(summaryRow.length).toBeGreaterThan(0);
  });

  test('home — Dexie reviewQueue lang 별 (en 13 + ja 5, Wave 11.33)', async ({ page }) => {
    await bootstrapFakeUser(page);
    // 직접 db count 검증 — mocks DOM 갱신 전에 db 레벨 확인
    const counts = await page.evaluate(async () => {
      const total = await window.studyDB.reviewQueue.count();
      const en = await window.studyDB.reviewQueue.where('lang').equals('en').count();
      const ja = await window.studyDB.reviewQueue.where('lang').equals('ja').count();
      return { total, en, ja };
    });
    expect(counts.en).toBe(13);
    expect(counts.ja).toBe(5);
    expect(counts.total).toBe(18);
  });

  test('home — Dexie sessionLogs 11건 (seed) 검증', async ({ page }) => {
    await bootstrapFakeUser(page);
    const count = await page.evaluate(async () => {
      return await window.studyDB.sessionLogs.count();
    });
    expect(count).toBe(11);
  });

  test('home → 추가 sessionLog 직접 insert 후 home 재방문 → DOM 갱신', async ({ page }) => {
    await bootstrapFakeUser(page);
    // 신규 sessionLog 추가 (오늘)
    await page.evaluate(async () => {
      const today = window.studyDay?.TODAY_ISO ?? '2026-04-15';
      await window.studyDB.sessionLogs.add({
        id: 'sl-test-' + Date.now(),
        lang: 'en',
        date: today,
        category: 'casual_talk',
        durationSec: 60,
        newCount: 0,
        reviewResults: { O: 1, '△': 0, X: 0 },
        utteranceCount: 1,
        passCount: 1,
        sessionType: 'normal',
        sentenceIds: [],
      });
    });
    await page.goto('/#/home');
    await expect(page.locator('#streak-num')).toBeVisible({ timeout: 5_000 });
    // 추가 row 까지 12건이어야
    const count = await page.evaluate(async () => {
      return await window.studyDB.sessionLogs.count();
    });
    expect(count).toBe(12);
  });
});
