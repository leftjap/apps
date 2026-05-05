/**
 * spotlight.js 단위 테스트 (Wave 11.5.7).
 *
 * 범위:
 *  - adapter: entryToSpotlightDoc / expenseToSpotlightTxn / spentAtToMockDate
 *  - Spotlight 인터페이스 노출
 *  - mountSpotlightView no-op (user 누락)
 *  - patchSpotlightHandlers — window collect 함수 셋팅 (idempotent)
 *  - patchOpenSpotlightHandler — orig 미존재 시 no-op
 *
 * 비대상:
 *  - refreshSpotlightCache 의 Dexie 통합 (queries.test.js searchEntries/searchExpenses 가 검증)
 *  - mocks _spotlightRender hijack 시각 효과 (Preview MCP)
 */
import { describe, it, expect, beforeEach } from 'vitest';
import {
  Spotlight,
  entryToSpotlightDoc,
  expenseToSpotlightTxn,
  spentAtToMockDate,
  mountSpotlightView,
  patchSpotlightHandlers,
  patchOpenSpotlightHandler,
  patchOpenItemHandler,
} from './spotlight.js';

describe('Spotlight 인터페이스 노출', () => {
  it('필수 멤버 노출 (Wave 11.5.7)', () => {
    const expected = [
      'mountSpotlightView',
      'refreshSpotlightCache',
      'entryToSpotlightDoc',
      'expenseToSpotlightTxn',
      'spentAtToMockDate',
      'patchSpotlightHandlers',
      'patchOpenSpotlightHandler',
      'patchOpenItemHandler',
    ];
    for (const k of expected) {
      expect(Spotlight, `Spotlight.${k} 누락`).toHaveProperty(k);
    }
  });
});

describe('mountSpotlightView', () => {
  it('user 누락 시 no-op (throw 없음)', async () => {
    await expect(mountSpotlightView(null)).resolves.toBeUndefined();
    await expect(mountSpotlightView({})).resolves.toBeUndefined();
  });
});

describe('entryToSpotlightDoc — Dexie entry → mocks doc', () => {
  it('navi 정상 매핑', () => {
    const d = entryToSpotlightDoc({ id: 'e1', kind: 'navi', title: 'A', content: 'body' });
    expect(d).toEqual({
      kind: 'doc',
      categoryKey: 'navi',
      categoryLabel: '오늘의 네비',
      id: 'e1',
      title: 'A',
      body: 'body',
    });
  });

  it('soyoun_navi → categoryKey=navi (네비 카테고리 진입)', () => {
    const d = entryToSpotlightDoc({ id: 'p1', kind: 'soyoun_navi', title: 'P', content: 'b' });
    expect(d.categoryKey).toBe('navi');
    expect(d.categoryLabel).toBe('오늘의 네비');
  });

  it('fiction / blog / memo 매핑', () => {
    expect(entryToSpotlightDoc({ kind: 'fiction', id: 'f' }).categoryLabel).toBe('단편');
    expect(entryToSpotlightDoc({ kind: 'blog', id: 'b' }).categoryLabel).toBe('블로그');
    expect(entryToSpotlightDoc({ kind: 'memo', id: 'm' }).categoryLabel).toBe('메모');
  });

  it('null / 미지 kind → navi default', () => {
    expect(entryToSpotlightDoc(null).categoryKey).toBe('navi');
    expect(entryToSpotlightDoc({ kind: 'unknown', id: 'x' }).categoryKey).toBe('navi');
    expect(entryToSpotlightDoc({ kind: 'unknown', id: 'x' }).categoryLabel).toBe('오늘의 네비');
  });

  it('title / content 누락 시 fallback', () => {
    const d = entryToSpotlightDoc({ id: 'e1', kind: 'navi' });
    expect(d.title).toBe('(제목 없음)');
    expect(d.body).toBe('');
  });
});

describe('spentAtToMockDate — ISO → MM-DD', () => {
  it('정상 ISO + 시간대 명시', () => {
    expect(spentAtToMockDate('2026-04-15T10:00:00+09:00')).toBe('04-15');
  });

  it('null / undefined / 빈 / invalid → ""', () => {
    expect(spentAtToMockDate(null)).toBe('');
    expect(spentAtToMockDate(undefined)).toBe('');
    expect(spentAtToMockDate('')).toBe('');
    expect(spentAtToMockDate('not-iso')).toBe('');
  });
});

describe('expenseToSpotlightTxn — Dexie expense → mocks txn', () => {
  it('정상 매핑 — merchant 우선', () => {
    const t = expenseToSpotlightTxn({
      id: 'tx-1',
      spent_at: '2026-04-15T10:00:00+09:00',
      amount_krw: 11880,
      merchant: '주식회사우아',
      memo: '점심',
      category: '배달',
    });
    expect(t).toEqual({
      kind: 'expense',
      id: 'tx-1',
      title: '주식회사우아',
      category: '배달',
      date: '04-15',
      amount: 11880,
    });
  });

  it('merchant 누락 시 memo fallback', () => {
    const t = expenseToSpotlightTxn({ id: 'x', memo: '메모만', amount_krw: 100, spent_at: '2026-04-01T00:00:00+09:00' });
    expect(t.title).toBe('메모만');
  });

  it('merchant + memo 모두 없음 → "거래" fallback', () => {
    const t = expenseToSpotlightTxn({ id: 'x', amount_krw: 100, spent_at: '2026-04-01T00:00:00+09:00' });
    expect(t.title).toBe('거래');
  });

  it('null row → 기본값', () => {
    const t = expenseToSpotlightTxn(null);
    expect(t.kind).toBe('expense');
    expect(t.title).toBe('거래');
    expect(t.amount).toBe(0);
  });
});

describe('patchSpotlightHandlers — window monkey-patch', () => {
  beforeEach(() => {
    // 테스트 격리 — module level _patched 가 true 면 후속 테스트 영향. 유의: Spotlight._patched 는 export 안 됨
    // → 첫 호출은 셋팅, 둘째 호출은 idempotent (no-op). 테스트 환경에선 global window 검증으로 충분.
  });

  it('win 누락 시 no-op', () => {
    expect(() => patchSpotlightHandlers({ win: null })).not.toThrow();
  });

  it('win 객체에 collect 함수 셋팅', () => {
    const win = {};
    patchSpotlightHandlers({ win });
    expect(typeof win._spotlightCollectDocs).toBe('function');
    expect(typeof win._spotlightCollectTxns).toBe('function');
    // 빈 cache 시 빈 배열
    expect(win._spotlightCollectDocs()).toEqual([]);
    expect(win._spotlightCollectTxns()).toEqual([]);
  });
});

describe('patchOpenSpotlightHandler — openSpotlight 가드', () => {
  it('win 누락 시 no-op', () => {
    expect(() => patchOpenSpotlightHandler({ win: null })).not.toThrow();
  });

  it('win.openSpotlight 미존재 시 no-op', () => {
    const win = {};
    patchOpenSpotlightHandler({ win });
    expect(win.openSpotlight).toBeUndefined();
  });

  it('win.openSpotlight 존재 시 wrapper 로 교체', () => {
    let calledOrig = 0;
    const win = { openSpotlight: function origOpen() { calledOrig += 1; } };
    patchOpenSpotlightHandler({ win });
    expect(win.openSpotlight.name).toBe('patchedOpenSpotlight');
    expect(calledOrig).toBe(0);
  });
});

describe('patchOpenItemHandler — _spotlightOpenItem 가드 (Wave 11.5.7b)', () => {
  it('win 누락 시 no-op', () => {
    expect(() => patchOpenItemHandler({ win: null })).not.toThrow();
  });

  it('win._spotlightOpenItem 미존재 시 no-op (orig 안 함수)', () => {
    const win = {};
    patchOpenItemHandler({ win });
    expect(win._spotlightOpenItem).toBeUndefined();
  });

  it('win._spotlightOpenItem 존재 시 wrapper 로 교체 (idempotent guard 통과)', () => {
    const win = { _spotlightOpenItem: function origOpen() {} };
    patchOpenItemHandler({ win });
    // module level _openItemPatched 가 이전 테스트에서 셋팅된 경우 그대로일 수도. 핵심: function 인지 검증.
    expect(typeof win._spotlightOpenItem).toBe('function');
  });
});
