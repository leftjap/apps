/**
 * Wave 11.29 — 콘텐츠 빈 상태 home UI e2e (spec §5-1).
 *
 * 검증 3건:
 *  A. todayLessons today 분 0건 → summary-row "신규 준비 중" + Clawd "New content coming soon!"
 *  B. todayLessons today 분 모두 completed=true → "오늘 학습 완료" + Clawd "All done for today!"
 *  C. todayLessons today 분 remaining > 0 (seed 디폴트 3건) → "N new" + 일반 메시지
 *
 * 인증 우회: data-display 패턴.
 *
 * 데이터 조작:
 *  - seed 가 todayLessons 3건 (n1/n2/n3) 을 TODAY_ISO 로 add — 디폴트 = remaining 3건 (case C)
 *  - case A: bootstrap 후 db.todayLessons.clear()
 *  - case B: bootstrap 후 db.todayLessons.toCollection().modify({ completed: true })
 */
import { test, expect } from '@playwright/test';

const FAKE_USER = {
  id: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
  email: 'test@example.com',
};

async function bootstrapFakeUser(page) {
  await page.goto('/');
  await page.evaluate(async (user) => {
    await window.studyAuth.ensureUserDB(user);
  }, FAKE_USER);
}

test.describe('Wave 11.29 — Empty content home UI', () => {
  test('A. todayLessons 0건 → "신규 준비 중" + Clawd "New content coming soon!"', async ({ page }) => {
    await bootstrapFakeUser(page);
    // 시드 todayLessons 3건 모두 제거 → 콘텐츠 미생성 시뮬
    await page.evaluate(async () => {
      await window.studyDB.todayLessons.clear();
    });
    await page.goto('/#/home');
    // updateHomeStats 비동기 → DOM 갱신 대기
    await expect(page.locator('#summary-row .summary-item-empty')).toBeVisible({ timeout: 5_000 });
    await expect(page.locator('#summary-row .summary-item-empty')).toHaveText('신규 준비 중');
    await expect(page.locator('#clawd-bubble')).toHaveText('New content coming soon!');
  });

  test('B. todayLessons 모두 completed=true → "오늘 학습 완료" + Clawd "All done for today!"', async ({ page }) => {
    await bootstrapFakeUser(page);
    // 시드 3건 모두 completed=true 로 마킹 (TODAY_ISO 가 동적 — 단, seed 의 date 가 TODAY_ISO 이므로 today 분)
    await page.evaluate(async () => {
      await window.studyDB.todayLessons.toCollection().modify({ completed: true });
    });
    await page.goto('/#/home');
    await expect(page.locator('#summary-row .summary-item-done')).toBeVisible({ timeout: 5_000 });
    await expect(page.locator('#summary-row .summary-item-done')).toHaveText('오늘 학습 완료');
    await expect(page.locator('#clawd-bubble')).toHaveText('All done for today!');
  });

  test('C. todayLessons remaining > 0 (시드 디폴트) → "N new" + 일반 메시지', async ({ page }) => {
    await bootstrapFakeUser(page);
    await page.goto('/#/home');
    // 시드 3건 모두 today + completed=false → remaining=3
    await expect(page.locator('#summary-row')).toBeVisible({ timeout: 5_000 });
    const rowHtml = await page.locator('#summary-row').innerHTML();
    // "3 new" 표시 (다른 N 값일 가능성도 cover — \d+ 매칭)
    expect(rowHtml).toMatch(/<span class="summary-val">\d+<\/span>\s*new/);
    // empty / done 클래스 미노출
    const emptyCount = await page.locator('#summary-row .summary-item-empty').count();
    const doneCount = await page.locator('#summary-row .summary-item-done').count();
    expect(emptyCount).toBe(0);
    expect(doneCount).toBe(0);
    // Clawd 메시지는 streak/daysAgo 의존 — 콘텐츠 분기 ("New content..." / "All done...") 미노출 검증
    const bubble = (await page.locator('#clawd-bubble').textContent()) || '';
    expect(bubble).not.toMatch(/New content coming soon|All done for today/);
  });
});
