/**
 * Wave 11.5.9 — openAccModal Dexie + Auth wiring e2e
 *
 * 검증 (비인증 상태에서 page.evaluate 로 직접 호출):
 *   - window.todayAccount 노출 (8개 멤버)
 *   - rowToTrashHtml — Dexie row → 휴지통 HTML 직렬화
 *   - formatDeletedDate — ISO → "M월 D일"
 *
 * 비대상 (별 wave):
 *   - mocks IIFE 마운트 후 실 ⌘ 메뉴 → 로그아웃 → 실 Supabase signOut + login 화면 복귀
 *     (Auth 인증 환경 의존 — Wave 11.5.7 / autosave.spec.js 단위 e2e 패턴 답습)
 *   - 휴지통 click → restoreEntry → 카테고리 recents 복귀 (Dexie + mocks IIFE 마운트 의존)
 */
import { test, expect } from '@playwright/test';

test.describe('Wave 11.5.9 account', () => {
  test('window.todayAccount — 8개 멤버 노출', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('#today-login-card');
    const exposed = await page.evaluate(() => {
      const a = window.todayAccount;
      const required = [
        'mountAccountView',
        'patchLogoutHandler',
        'patchProfileSaveHandler',
        'patchTrashRestoreHandler',
        'patchOpenAccModalHandler',
        'rowToTrashHtml',
        'formatDeletedDate',
        'escapeHtml',
      ];
      const missing = required.filter((k) => typeof (a || {})[k] !== 'function');
      return { hasAccount: !!a, missing };
    });
    expect(exposed.hasAccount).toBe(true);
    expect(exposed.missing).toEqual([]);
  });

  test('rowToTrashHtml — fiction → "단편 · 4월 18일 삭제"', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('#today-login-card');
    const html = await page.evaluate(() => {
      return window.todayAccount.rowToTrashHtml({
        id: 'abc-1',
        title: '여름의 잔상',
        kind: 'fiction',
        deleted_at: '2026-04-18T10:00:00Z',
      });
    });
    expect(html).toContain('data-trash-id="abc-1"');
    expect(html).toContain('여름의 잔상');
    expect(html).toContain('단편 · 4월 18일 삭제');
  });

  test('rowToTrashHtml — XSS escape', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('#today-login-card');
    const html = await page.evaluate(() => {
      return window.todayAccount.rowToTrashHtml({
        id: 'x',
        title: '<script>alert(1)</script>',
        kind: 'navi',
        deleted_at: null,
      });
    });
    expect(html).not.toContain('<script>');
    expect(html).toContain('&lt;script&gt;');
  });

  test('formatDeletedDate — ISO + null 처리', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('#today-login-card');
    const result = await page.evaluate(() => {
      const f = window.todayAccount.formatDeletedDate;
      return {
        valid: f('2026-04-18T10:00:00Z'),
        nullCase: f(null),
        invalid: f('not-a-date'),
      };
    });
    expect(result.valid).toBe('4월 18일');
    expect(result.nullCase).toBe('');
    expect(result.invalid).toBe('');
  });
});
