/**
 * book e2e 스모크 — 로그인 게이트 + 인증 후 핵심 플로우(추가→댓글→핀).
 *
 * OAuth 우회: signInWithPassword (~/.config/book/.env 의 TEST_USER_EMAIL/PASSWORD — 본인 계정).
 * 인증 플로우는 email/password env 없으면 skip (CI 안전). 데이터는 Dexie 로컬.
 *
 * 실행: `source ~/.config/book/.env && pnpm e2e`
 */
import { test, expect } from '@playwright/test';

const TEST_EMAIL = process.env.TEST_USER_EMAIL;
const TEST_PASSWORD = process.env.TEST_USER_PASSWORD;

test.describe('book smoke', () => {
  test('로그인 게이트 + 상수 노출', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('#book-login-card');
    await expect(page.locator('.book-login__brand')).toHaveText('book');
    await expect(page.locator('[data-role="signin"]')).toBeVisible();
    const books = await page.evaluate(() => window.bookData?.BOOKS?.length);
    expect(books).toBe(16);
  });

  test('로그인 → 추가 → 댓글 → 핀', async ({ page }) => {
    test.skip(!TEST_EMAIL || !TEST_PASSWORD, 'TEST_USER_EMAIL/PASSWORD 미설정 — 인증 플로우 skip');
    await page.goto('/');
    await page.waitForSelector('#book-login-card');
    await page.evaluate(
      async ({ email, password }) => { await window.bookAuth.signInWithPassword({ email, password }); },
      { email: TEST_EMAIL, password: TEST_PASSWORD },
    );
    // 인증 후 피드 셸 진입
    await page.waitForSelector('#book-app .topbar', { timeout: 12_000 });

    const result = await page.evaluate(async () => {
      const me = (await window.bookAuth.getSession())?.user?.id;
      const q = await window.bookQueries.createQuote({ owner_id: me, book_ref: '1', text: 'e2e 어구록' });
      const c = await window.bookQueries.createComment({ quote_id: q.id, author_id: me, body: 'e2e 댓글' });
      await window.bookQueries.togglePinQuote(q.id);
      const fresh = await window.bookQueries.getQuote(q.id);
      const comments = await window.bookQueries.listCommentsByQuote(q.id);
      // cleanup (로컬 시드 보존)
      await window.bookDB.comments.delete(c.id);
      await window.bookDB.quotes.delete(q.id);
      return { pinned: fresh.pinned, commentCount: comments.length, hasFeed: !!document.querySelector('#book-app .topbar') };
    });
    expect(result.hasFeed).toBe(true);
    expect(result.pinned).toBe(1);
    expect(result.commentCount).toBe(1);
  });
});
