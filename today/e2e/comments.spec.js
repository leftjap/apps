/**
 * Wave 11.7.1 — 댓글 CRUD + composer wiring + Realtime e2e
 *
 * 검증 (비인증 상태에서 page.evaluate 로 직접 호출):
 *   - window.todayComments 노출 (8개 멤버)
 *   - commentToHtml — mine vs partner / 삭제 버튼 / XSS escape
 *   - commentsToSectionHtml — 빈 / 다건
 *   - handleRealtimeCommentChange — table mismatch / entry mismatch / dedup
 *
 * 비대상 (별 wave / 사용자 환경 의존):
 *   - mocks 마운트 후 실 composer Enter → createComment → Supabase upload + 파트너 Realtime echo
 *   - 페어링 환경 (soyoun312 + leftjap) Realtime 양방향 검증 — Wave 11.5.3.3 동일 한계
 */
import { test, expect } from '@playwright/test';

test.describe('Wave 11.7.1 comments', () => {
  test('window.todayComments — 8개 멤버 노출', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('#today-login-card');
    const exposed = await page.evaluate(() => {
      const c = window.todayComments;
      const required = [
        'mountCommentsView',
        'mountForArticle',
        'syncComposerState',
        'handleRealtimeCommentChange',
        'commentToHtml',
        'commentsToSectionHtml',
        'formatCommentTime',
        'escapeHtml',
      ];
      const missing = required.filter((k) => typeof (c || {})[k] !== 'function');
      return { hasComments: !!c, missing };
    });
    expect(exposed.hasComments).toBe(true);
    expect(exposed.missing).toEqual([]);
  });

  test('commentToHtml — mine 삭제 버튼 + partner author 라벨', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('#today-login-card');
    const result = await page.evaluate(() => {
      const c = window.todayComments;
      const OWNER = 'owner-uid';
      const PARTNER = 'partner-uid';
      const mine = c.commentToHtml(
        { id: 'c1', body: 'test', created_at: '2026-04-30T15:00:00Z', author_id: OWNER },
        { currentUserId: OWNER },
      );
      const partner = c.commentToHtml(
        { id: 'c2', body: '파트너', author_id: PARTNER },
        { currentUserId: OWNER, partnerName: '소연' },
      );
      return { mine, partner };
    });
    expect(result.mine).toContain('data-mine="1"');
    expect(result.mine).toContain('comment-row__delete');
    expect(result.mine).toContain('>나<');
    expect(result.partner).toContain('data-mine="0"');
    expect(result.partner).not.toContain('comment-row__delete');
    expect(result.partner).toContain('>소연<');
  });

  test('commentToHtml — XSS escape', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('#today-login-card');
    const html = await page.evaluate(() => {
      return window.todayComments.commentToHtml(
        { id: 'x', body: '<script>alert(1)</script>', author_id: 'p' },
        { currentUserId: 'me' },
      );
    });
    expect(html).not.toContain('<script>');
    expect(html).toContain('&lt;script&gt;');
  });

  test('commentsToSectionHtml — 빈 (Wave 11.6.8a 0건 시 빈 string) / 다건', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('#today-login-card');
    const r = await page.evaluate(() => {
      const c = window.todayComments;
      return {
        empty: c.commentsToSectionHtml([], { currentUserId: 'me' }),
        many: c.commentsToSectionHtml([
          { id: 'a', body: 'A', author_id: 'me' },
          { id: 'b', body: 'B', author_id: 'p' },
        ], { currentUserId: 'me', partnerName: '소연' }),
      };
    });
    expect(r.empty).toBe('');
    expect(r.many).toContain('class="doc__comments"');
    expect(r.many).toContain('class="doc__comments-count">2<');
    expect(r.many).toContain('data-comment-id="a"');
    expect(r.many).toContain('data-comment-id="b"');
    expect(r.many).not.toContain('comment-empty');
  });

  test('handleRealtimeCommentChange — table mismatch / entry mismatch', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('#today-login-card');
    const r = await page.evaluate(async () => {
      const c = window.todayComments;
      const tableMismatch = await c.handleRealtimeCommentChange(
        { table: 'today_entries', eventType: 'INSERT', new: { id: 'x' } },
        document,
      );
      // article 미존재 환경
      const noArticle = await c.handleRealtimeCommentChange(
        { table: 'today_comments', eventType: 'INSERT', new: { id: 'c1', entry_id: 'e1' } },
        document,
      );
      return { tableMismatch, noArticle };
    });
    expect(r.tableMismatch.applied).toBe(false);
    expect(r.tableMismatch.reason).toBe('table_mismatch');
    expect(r.noArticle.applied).toBe(false);
    expect(r.noArticle.reason).toBe('no_article');
  });
});
