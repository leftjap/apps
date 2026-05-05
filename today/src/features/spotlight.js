/**
 * Spotlight integration layer (Wave 11.5.7 — Dexie 기반 통합 검색).
 *
 * 책임:
 *  - mocks IIFE 의 _spotlightCollectDocs / _spotlightCollectTxns monkey-patch
 *  - Dexie entries (본인 모든 kind + partner shared navi) + expenses (본인) cache
 *  - mocks render 시 collect 호출 → SPA cache 동기 반환
 *
 * Clean Room 정합:
 *  - mocks/today-mac.html 의 spotlight UI / render / openItem 그대로
 *  - SPA layer 가 데이터 source 만 hijack (FIXTURE → Dexie)
 *
 * 설계 결정 (Wave 11.5.7):
 *  - 1회 cache fill (mountSpotlightView 시점). Spotlight open 직전 리프레시 함수 노출 (refreshSpotlightCache)
 *  - mocks _spotlightRender 가 동기 호출 → cache 동기 반환 (await 못 함)
 *  - 새 글 / 거래 추가 직후 spotlight 열면 stale 가능 (open 시 refresh 호출 권장)
 */
import { Queries } from '../db/queries.js';
import { renderDocFromRow } from './entries.js';

let _currentUser = null;
let _cachedDocs = [];
let _cachedTxns = [];
let _patched = false;

const KIND_TO_LABEL = Object.freeze({
  navi: '오늘의 네비',
  soyoun_navi: '오늘의 네비',
  fiction: '단편',
  blog: '블로그',
  memo: '메모',
});

const KIND_TO_CATEGORY_KEY = Object.freeze({
  navi: 'navi',
  soyoun_navi: 'navi', // partner shared navi 도 네비 카테고리로 진입
  fiction: 'fiction',
  blog: 'blog',
  memo: 'memo',
});

/** Dexie entry → mocks spotlight doc 형식. */
export function entryToSpotlightDoc(row) {
  const kind = row?.kind || 'navi';
  return {
    kind: 'doc',
    categoryKey: KIND_TO_CATEGORY_KEY[kind] || 'navi',
    categoryLabel: KIND_TO_LABEL[kind] || '오늘의 네비',
    id: row?.id || '',
    title: row?.title || '(제목 없음)',
    body: row?.content || '',
  };
}

/** ISO spent_at → 'MM-DD'. */
export function spentAtToMockDate(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${mm}-${dd}`;
}

/** Dexie expense → mocks spotlight txn 형식. */
export function expenseToSpotlightTxn(row) {
  return {
    kind: 'expense',
    id: row?.id || '',
    title: row?.merchant || row?.memo || '거래',
    category: row?.category || '',
    date: spentAtToMockDate(row?.spent_at),
    amount: row?.amount_krw || 0,
  };
}

/**
 * Dexie 재조회 → cache 갱신 (async). UI 가 await 가능.
 * 호출 시점 권장: openSpotlight 직전 또는 글/거래 변경 직후.
 */
export async function refreshSpotlightCache() {
  if (!_currentUser?.id) {
    _cachedDocs = [];
    _cachedTxns = [];
    return { docs: 0, txns: 0 };
  }
  try {
    const [entries, expenses] = await Promise.all([
      Queries.searchEntries(''),
      Queries.searchExpenses(''),
    ]);
    _cachedDocs = entries.map(entryToSpotlightDoc);
    _cachedTxns = expenses.map(expenseToSpotlightTxn);
  } catch (e) {
    console.warn('[spotlight] refreshSpotlightCache 실패:', e?.message || e);
  }
  return { docs: _cachedDocs.length, txns: _cachedTxns.length };
}

/** mocks `window._spotlightCollectDocs` / `_spotlightCollectTxns` monkey-patch. */
export function patchSpotlightHandlers({ win = (typeof window !== 'undefined' ? window : null) } = {}) {
  if (!win) return;
  if (_patched) return;
  _patched = true;
  win._spotlightCollectDocs = function patchedCollectDocs() {
    return _cachedDocs.slice();
  };
  win._spotlightCollectTxns = function patchedCollectTxns() {
    return _cachedTxns.slice();
  };
}

/**
 * Wave 11.5.7b — mocks `window._spotlightOpenItem` monkey-patch.
 * doc 분기에서 categoryKey 활성화 후 추가로 Dexie getEntry → renderDocFromRow 로
 * 특정 entry mainView 진입.
 *
 * action / expense 분기는 mocks 원본 호출 (회귀 0).
 */
let _openItemPatched = false;
export function patchOpenItemHandler({
  win = (typeof window !== 'undefined' ? window : null),
  doc = (typeof document !== 'undefined' ? document : null),
} = {}) {
  if (!win) return;
  if (_openItemPatched) return;
  const orig = win._spotlightOpenItem;
  if (typeof orig !== 'function') return;
  _openItemPatched = true;

  win._spotlightOpenItem = function patchedOpenItem(item) {
    if (!item) return;
    if (item.kind !== 'doc') {
      // action / expense 분기는 mocks 원본 그대로 (closeSpotlight + 모달 등)
      return orig.call(this, item);
    }
    // doc 분기 — 카테고리 활성화 + 특정 entry 렌더
    if (typeof win.closeSpotlight === 'function') win.closeSpotlight();
    setTimeout(() => {
      if (typeof win._spotlightGoCategory === 'function') {
        win._spotlightGoCategory(item.categoryKey || 'navi');
      }
    }, 80);
    setTimeout(async () => {
      if (!item.id) return;
      try {
        const row = await Queries.getEntry(item.id);
        if (row && doc) renderDocFromRow(row, doc);
      } catch (e) {
        console.warn('[spotlight] getEntry 실패:', e?.message || e);
      }
    }, 200);
  };
}

/**
 * mocks `window.openSpotlight` monkey-patch — 호출 직전 cache 리프레시.
 * 사용자가 ⌘K 누를 때마다 최신 Dexie 데이터 사용.
 */
export function patchOpenSpotlightHandler({ win = (typeof window !== 'undefined' ? window : null) } = {}) {
  if (!win) return;
  const orig = win.openSpotlight;
  if (typeof orig !== 'function') return;
  if (orig.name === 'patchedOpenSpotlight') return; // idempotent
  win.openSpotlight = async function patchedOpenSpotlight(...args) {
    await refreshSpotlightCache();
    return orig.apply(this, args);
  };
}

/** main.js entry point. user 미설정 시 no-op. */
export async function mountSpotlightView(user) {
  if (!user?.id) return;
  _currentUser = user;
  if (typeof document === 'undefined') return; // node (vitest) 환경
  await refreshSpotlightCache();
  patchSpotlightHandlers();
  patchOpenSpotlightHandler();
  patchOpenItemHandler();
}

export const Spotlight = {
  mountSpotlightView,
  refreshSpotlightCache,
  entryToSpotlightDoc,
  expenseToSpotlightTxn,
  spentAtToMockDate,
  patchSpotlightHandlers,
  patchOpenSpotlightHandler,
  patchOpenItemHandler,
};

if (typeof window !== 'undefined') {
  window.todaySpotlight = Spotlight;
}

export default Spotlight;
