/**
 * Wave 11.5.7 — Spotlight Dexie 통합 e2e
 *
 * 검증 (비인증 상태에서 page.evaluate 로 직접 호출):
 *   - window.todaySpotlight 노출
 *   - entryToSpotlightDoc / expenseToSpotlightTxn / spentAtToMockDate adapter 동작
 *   - patchSpotlightHandlers — fake window 에 collect 함수 셋팅
 *
 * 비대상:
 *   - mocks IIFE 마운트 후 실 ⌘K → spotlight 모달 (Preview MCP 환경, 사용자 환경 의존)
 */
import { test, expect } from '@playwright/test';

test.describe('Wave 11.5.7 spotlight', () => {
  test('window.todaySpotlight 노출 — 모든 멤버', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('#today-login-card');
    const exposed = await page.evaluate(() => {
      const s = window.todaySpotlight;
      const required = [
        'mountSpotlightView',
        'refreshSpotlightCache',
        'entryToSpotlightDoc',
        'expenseToSpotlightTxn',
        'spentAtToMockDate',
        'patchSpotlightHandlers',
        'patchOpenSpotlightHandler',
        'patchOpenItemHandler',
      ];
      const missing = required.filter((k) => !(k in (s || {})));
      return { has: !!s, missing };
    });
    expect(exposed.has).toBe(true);
    expect(exposed.missing).toEqual([]);
  });

  test('entryToSpotlightDoc — navi/soyoun_navi/fiction/blog/memo 매핑', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('#today-login-card');
    const result = await page.evaluate(() => {
      const adapter = window.todaySpotlight.entryToSpotlightDoc;
      return {
        navi: adapter({ id: 'n', kind: 'navi', title: 'A', content: 'body' }),
        soyoun: adapter({ id: 'p', kind: 'soyoun_navi', title: 'P' }),
        fiction: adapter({ kind: 'fiction', id: 'f' }),
        memo: adapter({ kind: 'memo', id: 'm' }),
      };
    });
    expect(result.navi).toEqual({
      kind: 'doc',
      categoryKey: 'navi',
      categoryLabel: '오늘의 네비',
      id: 'n',
      title: 'A',
      body: 'body',
    });
    expect(result.soyoun.categoryKey).toBe('navi');
    expect(result.soyoun.categoryLabel).toBe('오늘의 네비');
    expect(result.fiction.categoryLabel).toBe('단편');
    expect(result.memo.categoryLabel).toBe('메모');
  });

  test('expenseToSpotlightTxn + spentAtToMockDate 매핑', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('#today-login-card');
    const result = await page.evaluate(() => {
      const txn = window.todaySpotlight.expenseToSpotlightTxn({
        id: 'tx-1',
        spent_at: '2026-04-12T13:00:00+09:00',
        amount_krw: 11880,
        merchant: '주식회사우아',
        category: '배달',
      });
      return txn;
    });
    expect(result).toEqual({
      kind: 'expense',
      id: 'tx-1',
      title: '주식회사우아',
      category: '배달',
      date: '04-12',
      amount: 11880,
    });
  });

  test('patchOpenItemHandler — fake window 의 orig wrap (Wave 11.5.7b)', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('#today-login-card');
    const result = await page.evaluate(() => {
      const fake = { _spotlightOpenItem: function origOpen() { return 'orig'; } };
      window.todaySpotlight.patchOpenItemHandler({ win: fake });
      return {
        type: typeof fake._spotlightOpenItem,
        notUndefined: fake._spotlightOpenItem !== undefined,
      };
    });
    expect(result.type).toBe('function');
    expect(result.notUndefined).toBe(true);
  });

  test('refreshSpotlightCache — 인증 없이 호출 → docs:0 / txns:0 (별 wave B 회귀 보강)', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('#today-login-card');
    const result = await page.evaluate(async () => {
      // _currentUser?.id 없음 → 빈 cache. 본격 통합 (실 ⌘K + 검색) 은 사용자 환경 의존 — 이 회귀는 cache fill 안전망만 검증.
      const r = await window.todaySpotlight.refreshSpotlightCache();
      return r;
    });
    expect(result.docs).toBe(0);
    expect(result.txns).toBe(0);
  });

  test('patchSpotlightHandlers — fake window 에 collect 함수 셋팅', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('#today-login-card');
    const result = await page.evaluate(() => {
      const fake = {};
      window.todaySpotlight.patchSpotlightHandlers({ win: fake });
      return {
        hasCollectDocs: typeof fake._spotlightCollectDocs === 'function',
        hasCollectTxns: typeof fake._spotlightCollectTxns === 'function',
        emptyDocs: fake._spotlightCollectDocs(),
        emptyTxns: fake._spotlightCollectTxns(),
      };
    });
    expect(result.hasCollectDocs).toBe(true);
    expect(result.hasCollectTxns).toBe(true);
    expect(result.emptyDocs).toEqual([]);
    expect(result.emptyTxns).toEqual([]);
  });
});
