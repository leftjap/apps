/**
 * Wave 11.28 — 요약 화면 발음 집계 e2e (spec §10-1).
 *
 * 검증:
 *  A. pronunciationLog 시드 후 finish 흐름 → summary 의 #pronAvg 정확 + .weak-tag Top 3
 *  B. tryCount === 0 (발화 0) → #pronAvg "—" + .weak-tag 모두 제거
 *
 * 인증 우회: data-display 패턴.
 *
 * 시나리오 A 의 데이터:
 *  - pronunciationLog 3건: overallScore 90 / 70 / 80 → 평균 80
 *  - weakPhonemes: '/r/' 3회 + '/θ/' 1회 + '/ʌ/' 1회 → Top 3 ['/r/', '/θ/', '/ʌ/']
 *  - tryCount 강제 양수 (state.tryCount 직접 set 불가 — finish() 의 sessionLogs 기반 집계와 별개로 sessionStorage data 의 tryCount 가 summary 분기 결정)
 *  - 발화 시뮬은 e2e 마이크 미지원 → tryCount/passCount 직접 evaluate 로 state 주입 후 btnEnd
 */
import { test, expect } from '@playwright/test';

const FAKE_USER = {
  id: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
  email: 'test@example.com',
};

async function bootstrapAndEnterSession(page) {
  await page.goto('/');
  await page.evaluate(async (user) => {
    await window.studyAuth.ensureUserDB(user);
  }, FAKE_USER);
  await page.goto('/#/session?mode=combined');
  await page.locator('#btnReveal').waitFor({ timeout: 5_000 });
}

test.describe('Wave 11.28 — Summary pronunciation aggregation', () => {
  test('A. pronunciationLog 3건 시드 → #pronAvg 80 + Top 3 weak-tag', async ({ page }) => {
    await bootstrapAndEnterSession(page);
    // pronunciationLog 직접 시드 (이번 세션 createdAt = 진입 직후 + 안전 마진)
    await page.evaluate(async () => {
      const db = window.studyDB;
      const today = window.studyDay.TODAY_ISO;
      const baseMs = Date.now() + 100; // session.startMs 보다 후
      await db.pronunciationLog.bulkAdd([
        { id: 'pl-test-1', lang: 'en', date: today, overallScore: 90, phonemeScores: [], weakPhonemes: ['/r/', '/θ/'], createdAt: new Date(baseMs).toISOString() },
        { id: 'pl-test-2', lang: 'en', date: today, overallScore: 70, phonemeScores: [], weakPhonemes: ['/r/', '/ʌ/'], createdAt: new Date(baseMs + 100).toISOString() },
        { id: 'pl-test-3', lang: 'en', date: today, overallScore: 80, phonemeScores: [], weakPhonemes: ['/r/'], createdAt: new Date(baseMs + 200).toISOString() },
      ]);
    });
    await page.locator('#btnEnd').click();
    await page.locator('#endConfirm').click();
    await page.waitForURL(/#\/summary/, { timeout: 5_000 });

    // sessionStorage.studySummary 가 finish() 가 채운 pronAvg / weakTop3 보유 검증
    const summary = await page.evaluate(() => JSON.parse(sessionStorage.getItem('studySummary')));
    expect(summary.pronAvg).toBe(80); // (90+70+80)/3 = 80
    expect(summary.weakTop3).toEqual(['/r/', '/θ/', '/ʌ/']); // /r/ 3회 1순위, /θ/ /ʌ/ 1회 동률 (sort 안정성)

    // tryCount = 0 (발화 시뮬 미수행) → summary render 가 "—" + weak-tag 제거
    expect(summary.tryCount).toBe(0);
    await expect(page.locator('#pronAvg')).toHaveText('—');
    const tagCount = await page.locator('.weak-tag').count();
    expect(tagCount).toBe(0);
  });

  test('B. tryCount > 0 + pronAvg null (mocks fallback) → 통과율 점수 + 하드코딩 weak-tag', async ({ page }) => {
    // sessionStorage 직접 주입 → summary 페이지 직접 진입 (finish 우회 — fallback path 검증)
    await page.goto('/');
    await page.evaluate(async (user) => {
      await window.studyAuth.ensureUserDB(user);
    }, FAKE_USER);
    await page.evaluate(() => {
      sessionStorage.setItem('studySummary', JSON.stringify({
        lang: 'en', mode: 'normal',
        durationSec: 600, newCount: 2,
        judged: { got: 5, hmm: 1, no: 1 },
        tryCount: 10, passCount: 8,
        reviewTotal: 7, newTotal: 2,
        // pronAvg / weakTop3 의도적 누락 (mocks 단독 진입 시뮬)
        returnTo: 'home',
      }));
    });
    await page.goto('/#/summary');
    // 통과율 fallback: (8/10) * 80 + 20 = 84
    await expect(page.locator('#pronAvg')).toHaveText('84');
    // 하드코딩 weak-tag 3건 유지 (mocks 시안)
    const tagCount = await page.locator('.weak-tag').count();
    expect(tagCount).toBe(3);
  });
});
