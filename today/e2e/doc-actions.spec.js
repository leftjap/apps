/**
 * Wave 11.5.8 — 에디터 ⋯ 메뉴 (사본 / 내보내기 / 글 삭제) Dexie wiring e2e
 *
 * 검증 (비인증 상태에서 page.evaluate 로 직접 호출):
 *   - window.todayEntries 의 새 함수 4개 노출 (handleDeleteAction / handleDuplicateAction / handleExportAction / entryToExportJson)
 *   - entryToExportJson pure 직렬화 (필수 6필드)
 *   - handleDeleteAction unsaved 분기 (entryId='new-...' → reason=unsaved, remove 미호출)
 *
 * 비대상 (별 wave):
 *   - mocks IIFE 마운트 후 실 ⌘ 메뉴 클릭 → softDeleteEntry → mainView article 사라짐 통합 흐름
 *     (mountEntriesView 가 인증 user 의존 — Wave 11.5.7 / autosave.spec.js 의 단위 e2e 패턴 답습)
 *   - 실 OAuth 통과 후 Dexie + Supabase 양방향 — 사용자 환경 (leftjap 실기)
 */
import { test, expect } from '@playwright/test';

test.describe('Wave 11.5.8 doc-more-actions', () => {
  test('window.todayEntries — 4개 신규 함수 노출', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('#today-login-card');
    const exposed = await page.evaluate(() => {
      const e = window.todayEntries;
      const required = [
        'handleDeleteAction',
        'handleDuplicateAction',
        'handleExportAction',
        'entryToExportJson',
      ];
      const missing = required.filter((k) => typeof (e || {})[k] !== 'function');
      return { hasEntries: !!e, missing };
    });
    expect(exposed.hasEntries).toBe(true);
    expect(exposed.missing).toEqual([]);
  });

  test('entryToExportJson — 필수 6필드 직렬화', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('#today-login-card');
    const result = await page.evaluate(() => {
      const json = window.todayEntries.entryToExportJson({
        id: 'abc',
        kind: 'navi',
        title: '제목',
        content: '<p>본문</p>',
        created_at: '2026-04-01T00:00:00Z',
        updated_at: '2026-04-30T12:00:00Z',
      });
      return JSON.parse(json);
    });
    expect(result).toEqual({
      id: 'abc',
      kind: 'navi',
      title: '제목',
      content: '<p>본문</p>',
      created_at: '2026-04-01T00:00:00Z',
      updated_at: '2026-04-30T12:00:00Z',
    });
  });

  test('annotateEditToolbar — fake editToolbar 의 4 button 에 data-format 부여 + idempotent', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('#today-login-card');
    const result = await page.evaluate(() => {
      // login 화면에는 #editToolbar 가 없을 수 있어 fake doc 으로 검증
      const buttons = {
        '.et-btn--bold': { dataset: {} },
        '.et-btn--italic': { dataset: {} },
        '.et-btn--underline': { dataset: {} },
        '[title="취소선"]': { dataset: {} },
      };
      const fakeToolbar = { querySelector: (s) => buttons[s] || null };
      const fakeDoc = { getElementById: (id) => (id === 'editToolbar' ? fakeToolbar : null) };
      const c1 = window.todayEntries.annotateEditToolbar(fakeDoc);
      const c2 = window.todayEntries.annotateEditToolbar(fakeDoc);
      return {
        c1,
        c2,
        bold: buttons['.et-btn--bold'].dataset.format,
        italic: buttons['.et-btn--italic'].dataset.format,
        underline: buttons['.et-btn--underline'].dataset.format,
        strike: buttons['[title="취소선"]'].dataset.format,
      };
    });
    expect(result.c1).toBe(4);
    expect(result.c2).toBe(0);
    expect(result.bold).toBe('bold');
    expect(result.italic).toBe('italic');
    expect(result.underline).toBe('underline');
    expect(result.strike).toBe('strikeThrough');
  });

  test('handleDeleteAction — 미저장 글 (new- prefix) → reason=unsaved + remove 미호출', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('#today-login-card');
    const result = await page.evaluate(async () => {
      let removed = false;
      const article = {
        dataset: { entryId: 'new-' + Date.now() },
        remove: () => { removed = true; },
      };
      const r = await window.todayEntries.handleDeleteAction(article);
      return { ok: r.ok, reason: r.reason, removed };
    });
    expect(result.ok).toBe(false);
    expect(result.reason).toBe('unsaved');
    expect(result.removed).toBe(false);
  });
});
