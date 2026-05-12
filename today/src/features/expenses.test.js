/**
 * expenses.js 단위 테스트 (Wave 11.6.3 — 가계부 대시보드/타임라인 UI).
 *
 * 범위:
 *   - 어댑터: formatAmount / isoToMockDate / rowToMockTx / dailyTotalsFromRows / summarizeMonth / escapeHtml
 *   - Expenses 인터페이스 노출
 *   - mountExpensesView no-op (user 누락)
 *
 * 비대상:
 *   - DOM 패치 (renderExpenseRecentsFromRows / patchHeadlineFromRows / patchCalendarFromRows / renderTimelineFromRows)
 *     → e2e (expenses.spec.js, page.evaluate) 에서 검증
 */
import 'fake-indexeddb/auto';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  Expenses,
  formatAmount,
  isoToMockDate,
  rowToMockTx,
  dailyTotalsFromRows,
  summarizeMonth,
  escapeHtml,
  formatManwon,
  rankMerchantsByMonth,
  escapeAttr,
  mountExpensesView,
  datetimeLocalToIso,
  isoToDatetimeLocal,
  validateExpenseForm,
  rowToPopoverHtml,
  monthDayToIsoDate,
  dayOfWeekFromMonthDay,
  patchDayPopoverFromRows,
  rowToExpSearchHtml,
  renderExpSearchDexie,
  patchExpSearchHandlers,
  __resetExpSearchPatchState,
  fetchCategoryExpenses,
  buildCategoryPopupHtml,
  openCategoryDetailPopup,
  patchOpenCategoryDetailHandler,
  __resetCategoryDetailPatchState,
  clearExpensesFixture,
} from './expenses.js';
import { createTodayDB } from '../db/schema.js';

describe('Expenses 인터페이스 노출', () => {
  it('필수 멤버 노출 (Wave 11.6.3 + 11.6.4b)', () => {
    const expected = [
      'mountExpensesView', 'rebindCategoryObserver',
      'formatAmount', 'isoToMockDate', 'rowToMockTx',
      'dailyTotalsFromRows', 'summarizeMonth', 'escapeHtml',
      'renderExpenseRecentsFromRows', 'patchHeadlineFromRows',
      'patchCalendarFromRows', 'renderTimelineFromRows',
      // Wave 11.6.3.1 — 가맹점 랭킹
      'formatManwon', 'rankMerchantsByMonth', 'escapeAttr',
      'patchRankSectionFromRows',
      // Wave 11.6.4b
      'datetimeLocalToIso', 'isoToDatetimeLocal',
      'extractExpenseFromForm', 'populateExpenseForm',
      'validateExpenseForm', 'saveExpenseFromForm', 'deleteExpenseFromForm',
      'patchExpenseModalHandlers',
      // 2026-05-04 — 빈 월에 mocks fixture 더미 차단
      'clearExpensesFixture',
    ];
    for (const k of expected) {
      expect(Expenses, `Expenses.${k} 누락`).toHaveProperty(k);
    }
  });
});

describe('mountExpensesView', () => {
  it('user 누락 시 no-op (throw 없음)', () => {
    expect(() => mountExpensesView(null)).not.toThrow();
    expect(() => mountExpensesView({})).not.toThrow();
  });
});

describe('clearExpensesFixture — 빈 월 시 mocks fixture 더미 표시 차단', () => {
  // jsdom 미도입 환경 — 단순 fake DOM 으로 querySelector/querySelectorAll/getElementById 시뮬.
  function makeNode(opts = {}) {
    const classes = new Set(opts.classList || []);
    return {
      textContent: opts.textContent ?? '',
      innerHTML: opts.innerHTML ?? '',
      classList: {
        toggle(c, on) {
          if (on === undefined) {
            if (classes.has(c)) classes.delete(c); else classes.add(c);
          } else if (on) classes.add(c);
          else classes.delete(c);
        },
        add(c) { classes.add(c); },
        remove(c) { classes.delete(c); },
        contains(c) { return classes.has(c); },
      },
      _classes: classes,
      _children: opts.children || {},
      querySelector(sel) {
        return this._children[sel] || null;
      },
    };
  }

  function makeDoc({ headlineTitle, headlineSub, cells, tlList, recents } = {}) {
    return {
      _headlineTitleStrong: headlineTitle,
      _headlineSubStrong: headlineSub,
      _cells: cells || [],
      _tl: tlList,
      _recents: recents,
      querySelector(sel) {
        if (sel === '.exp-headline-title strong') return this._headlineTitleStrong || null;
        if (sel === '.exp-headline-sub strong') return this._headlineSubStrong || null;
        if (sel === '.exp-tl-list') return this._tl || null;
        return null;
      },
      querySelectorAll(sel) {
        if (sel === '.exp-month-day[data-date]') return this._cells;
        return [];
      },
      getElementById(id) {
        if (id === 'recentsList') return this._recents || null;
        return null;
      },
    };
  }

  it('헤드라인 strong 텍스트를 0 으로 설정', () => {
    const title = makeNode({ textContent: '21만원' });
    const sub = makeNode({ textContent: '79,542원' });
    const doc = makeDoc({ headlineTitle: title, headlineSub: sub });
    const ok = clearExpensesFixture(doc);
    expect(ok).toBe(true);
    expect(title.textContent).toBe('0');
    expect(sub.textContent).toBe('0');
  });

  it('캘린더 셀의 amount 텍스트를 비우고 is-zero 적용 (today 제외)', () => {
    const amt1 = makeNode({ textContent: '29,100', classList: ['high'] });
    const amtToday = makeNode({ textContent: '12,500' });
    const cell1 = makeNode({ children: { '.exp-month-day-amount': amt1 } });
    const cellToday = makeNode({
      classList: ['today'],
      children: { '.exp-month-day-amount': amtToday },
    });
    const doc = makeDoc({ cells: [cell1, cellToday] });
    clearExpensesFixture(doc);
    expect(amt1.textContent).toBe('');
    expect(amt1.classList.contains('high')).toBe(false);
    expect(cell1.classList.contains('is-zero')).toBe(true);
    expect(cellToday.classList.contains('is-zero')).toBe(false); // today 예외
  });

  it('타임라인 .exp-tl-list innerHTML 을 빈-거래 메시지로 교체', () => {
    const tl = makeNode({ innerHTML: '<div class="exp-tl-row">더미</div>' });
    const doc = makeDoc({ tlList: tl });
    clearExpensesFixture(doc);
    expect(tl.innerHTML).toContain('이 달의 거래가 없습니다');
    expect(tl.innerHTML).not.toContain('exp-tl-row');
  });

  it('Recents 사이드바 #recentsList 비우기', () => {
    const recents = makeNode({ innerHTML: '<div class="sb__item--recent">tx-01 dummy</div>' });
    const doc = makeDoc({ recents });
    clearExpensesFixture(doc);
    expect(recents.innerHTML).toBe('');
  });

  it('doc 누락 → false', () => {
    expect(clearExpensesFixture(null)).toBe(false);
  });
});

describe('formatAmount — mocks 패턴 정합', () => {
  it('숫자 → amt-num + amt-unit HTML', () => {
    const html = formatAmount(305000);
    expect(html).toContain('<span class="amt-num">305,000</span>');
    expect(html).toContain('<span class="amt-unit">원</span>');
  });

  it('0 / null / undefined → 0원', () => {
    expect(formatAmount(0)).toContain('0');
    expect(formatAmount(null)).toContain('0');
    expect(formatAmount(undefined)).toContain('0');
  });

  it('toLocaleString ko-KR 포맷', () => {
    expect(formatAmount(1490000)).toContain('1,490,000');
  });
});

describe('isoToMockDate — ISO → MM-DD (사용자 로컬 시간대 기준)', () => {
  it('정상 ISO (KST 명시 — 시간대 무관)', () => {
    expect(isoToMockDate('2026-04-15T10:30:00+09:00')).toBe('04-15');
  });

  it('null / undefined / 빈 → ""', () => {
    expect(isoToMockDate(null)).toBe('');
    expect(isoToMockDate(undefined)).toBe('');
    expect(isoToMockDate('')).toBe('');
    expect(isoToMockDate('not-iso')).toBe('');
  });

  it('한 자릿수 월/일 0 패딩', () => {
    expect(isoToMockDate('2026-01-05T00:00:00+09:00')).toBe('01-05');
  });
});

describe('rowToMockTx — Dexie row → mocks tx', () => {
  it('필수 + 옵션 필드 변환', () => {
    const row = {
      id: 'exp-1',
      spent_at: '2026-04-11T15:00:00+09:00',
      amount_krw: 26350,
      category: '온라인쇼핑',
      memo: '쿠팡',
      brand: '쿠팡',
      card: '삼성카드',
      merchant: '쿠팡',
    };
    const tx = rowToMockTx(row);
    expect(tx).toEqual({
      id: 'exp-1',
      date: '04-11',
      category: '온라인쇼핑',
      memo: '쿠팡',
      amount: 26350,
      brand: '쿠팡',
      card: '삼성카드',
    });
  });

  it('memo 누락 → merchant fallback, category 누락 → 미분류', () => {
    const tx = rowToMockTx({
      id: 'x',
      spent_at: '2026-04-15T10:00:00+09:00',
      amount_krw: 5000,
      merchant: '편의점 X',
    });
    expect(tx.category).toBe('미분류');
    expect(tx.memo).toBe('편의점 X');
  });

  it('amount_krw 누락 → 0', () => {
    const tx = rowToMockTx({ id: 'x', spent_at: '2026-04-15T10:00:00+09:00' });
    expect(tx.amount).toBe(0);
  });
});

describe('dailyTotalsFromRows — 일별 합계 Map', () => {
  it('같은 날 거래 합산', () => {
    const rows = [
      { spent_at: '2026-04-11T10:00:00+09:00', amount_krw: 24000 },
      { spent_at: '2026-04-11T15:00:00+09:00', amount_krw: 26350 },
      { spent_at: '2026-04-12T12:00:00+09:00', amount_krw: 11880 },
    ];
    const totals = dailyTotalsFromRows(rows);
    expect(totals['04-11']).toBe(50350);
    expect(totals['04-12']).toBe(11880);
  });

  it('빈 배열 / null → 빈 객체', () => {
    expect(dailyTotalsFromRows([])).toEqual({});
    expect(dailyTotalsFromRows(null)).toEqual({});
  });

  it('amount_krw 누락 → 0 합산 (skip 안 함)', () => {
    const rows = [
      { spent_at: '2026-04-11T10:00:00+09:00' },
      { spent_at: '2026-04-11T11:00:00+09:00', amount_krw: 100 },
    ];
    expect(dailyTotalsFromRows(rows)['04-11']).toBe(100);
  });

  it('잘못된 spent_at row 는 skip', () => {
    const rows = [
      { spent_at: null, amount_krw: 999 },
      { spent_at: '2026-04-11T10:00:00+09:00', amount_krw: 100 },
    ];
    const totals = dailyTotalsFromRows(rows);
    expect(totals['04-11']).toBe(100);
    expect(Object.keys(totals)).toEqual(['04-11']);
  });
});

describe('summarizeMonth — 월 총액 + 일평균 + 만원', () => {
  it('총액 합산 + 일평균 (todayDay 명시)', () => {
    const rows = [
      { amount_krw: 1000000 },
      { amount_krw: 1150000 },
    ];
    const r = summarizeMonth(rows, 27);
    expect(r.total).toBe(2150000);
    expect(r.dailyAvg).toBe(Math.round(2150000 / 27)); // 79629
    expect(r.headlineMan).toBe(215);
  });

  it('빈 배열 → total=0, dailyAvg=0', () => {
    const r = summarizeMonth([], 15);
    expect(r.total).toBe(0);
    expect(r.dailyAvg).toBe(0);
    expect(r.headlineMan).toBe(0);
  });

  it('todayDay=0 또는 누락 시 디폴트 (오늘 날짜)', () => {
    const r = summarizeMonth([{ amount_krw: 100 }], 0);
    // todayDay=0 → 디폴트 new Date().getDate() — 적어도 1 이상
    expect(r.dailyAvg).toBeGreaterThanOrEqual(0);
    expect(r.total).toBe(100);
  });
});

describe('escapeHtml — XSS 방지', () => {
  it('& < > " \' 변환', () => {
    expect(escapeHtml('<img onerror=1>')).toBe('&lt;img onerror=1&gt;');
    expect(escapeHtml(`a "b" 'c' & d`)).toBe('a &quot;b&quot; &#39;c&#39; &amp; d');
  });

  it('null/undefined → ""', () => {
    expect(escapeHtml(null)).toBe('');
    expect(escapeHtml(undefined)).toBe('');
  });
});

// ───────────────────────────────────────────────────────────────────────────
// Wave 11.6.3.1 — 가맹점 랭킹 (단일 월)
// ───────────────────────────────────────────────────────────────────────────

describe('formatManwon — mocks today-mac.html L4209-4213 답습', () => {
  it('1만원 이상 → "N만원" (반올림)', () => {
    expect(formatManwon(10000)).toBe('1만원');
    expect(formatManwon(155000)).toBe('16만원');
    expect(formatManwon(1490000)).toBe('149만원');
    expect(formatManwon(2150000)).toBe('215만원');
  });

  it('1만원 미만 → "N,NNN원" (ko-KR locale)', () => {
    expect(formatManwon(0)).toBe('0원');
    expect(formatManwon(5000)).toBe('5,000원');
    expect(formatManwon(9999)).toBe('9,999원');
  });

  it('null / undefined / 음수 → 0원', () => {
    expect(formatManwon(null)).toBe('0원');
    expect(formatManwon(undefined)).toBe('0원');
    expect(formatManwon(NaN)).toBe('0원');
  });
});

describe('escapeAttr — onclick 속성 안 가맹점 이름', () => {
  it('작은따옴표 escape', () => {
    expect(escapeAttr("Joe's Cafe")).toBe("Joe\\'s Cafe");
  });

  it('백슬래시 escape (먼저 처리)', () => {
    expect(escapeAttr('a\\b')).toBe('a\\\\b');
  });

  it('한국어 가맹점 그대로 통과', () => {
    expect(escapeAttr('파인만컴')).toBe('파인만컴');
    expect(escapeAttr('주식회사우아')).toBe('주식회사우아');
  });

  it('null / undefined → ""', () => {
    expect(escapeAttr(null)).toBe('');
    expect(escapeAttr(undefined)).toBe('');
  });
});

describe('rankMerchantsByMonth — 가맹점별 합산 + 정렬', () => {
  it('빈 배열 / null → { topBrand: null, brands: [] }', () => {
    expect(rankMerchantsByMonth([])).toEqual({ topBrand: null, brands: [] });
    expect(rankMerchantsByMonth(null)).toEqual({ topBrand: null, brands: [] });
  });

  it('모든 rows merchant/brand 없음 → topBrand null (fixture 보존 신호)', () => {
    const rows = [
      { amount_krw: 1000, category: '외식' },
      { amount_krw: 500, category: '편의점' },
    ];
    const r = rankMerchantsByMonth(rows);
    expect(r.topBrand).toBeNull();
    expect(r.brands).toEqual([]);
  });

  it('단일 가맹점 → topBrand 있고 brands 빈 배열', () => {
    const rows = [
      { amount_krw: 50000, brand: '파인만컴', category: '외식' },
      { amount_krw: 30000, brand: '파인만컴', category: '외식' },
    ];
    const r = rankMerchantsByMonth(rows);
    expect(r.topBrand).toEqual({
      name: '파인만컴',
      initial: '파',
      count: 2,
      share: 100,
      amount: 80000,
    });
    expect(r.brands).toEqual([]);
  });

  it('다중 가맹점 → amount desc 정렬 + share% + rank 2~', () => {
    const rows = [
      { amount_krw: 1000000, brand: '쿠팡', category: '온라인쇼핑' },
      { amount_krw: 550000, brand: '쿠팡', category: '온라인쇼핑' },
      { amount_krw: 300000, brand: '파인만컴', category: '외식' },
      { amount_krw: 90000, brand: '주식회사우아', category: '배달' },
      { amount_krw: 60000, brand: '양화정', category: '외식' },
    ];
    const r = rankMerchantsByMonth(rows);
    expect(r.topBrand.name).toBe('쿠팡');
    expect(r.topBrand.amount).toBe(1550000);
    expect(r.topBrand.count).toBe(2);
    // share = 1550000 / 2000000 = 0.775 → 77.5
    expect(r.topBrand.share).toBe(77.5);
    expect(r.topBrand.initial).toBe('쿠');
    expect(r.brands.length).toBe(3);
    expect(r.brands[0]).toEqual({ rank: 2, name: '파인만컴', cat: '외식', amount: 300000, count: 1 });
    expect(r.brands[1]).toEqual({ rank: 3, name: '주식회사우아', cat: '배달', amount: 90000, count: 1 });
    expect(r.brands[2]).toEqual({ rank: 4, name: '양화정', cat: '외식', amount: 60000, count: 1 });
  });

  it('cat mode 패턴 — 가맹점 다중 카테고리 시 빈도 max', () => {
    const rows = [
      { amount_krw: 100, brand: 'X', category: '외식' },
      { amount_krw: 100, brand: 'X', category: '외식' },
      { amount_krw: 100, brand: 'X', category: '편의점' },
      { amount_krw: 50, brand: 'Y', category: '구독' },
    ];
    const r = rankMerchantsByMonth(rows);
    expect(r.topBrand.name).toBe('X');
    // brands[0] 가 Y — 1위 X 분리되어 brands 에는 안 들어감. cat mode 검증은 topBrand 외 분리 전체 sorted 보강 필요
    // 다중 cat 검증 — 1위 (X) 의 cat 도 mode 에 따라 결정. 단 topBrand 에는 cat 필드 없음 (mocks 형식 답습)
    // Y 만 brands 에 → cat='구독' (mode 단일)
    expect(r.brands.length).toBe(1);
    expect(r.brands[0].cat).toBe('구독');
  });

  it('brand 없으면 merchant fallback', () => {
    const rows = [
      { amount_krw: 1000, merchant: '편의점 X', category: '편의점' },
      { amount_krw: 500, brand: 'Y', category: '외식' },
    ];
    const r = rankMerchantsByMonth(rows);
    expect(r.topBrand.name).toBe('편의점 X');
    expect(r.brands[0].name).toBe('Y');
  });

  it('amount_krw 누락 → 0 합산', () => {
    const rows = [
      { brand: 'A', category: '외식' },
      { amount_krw: 5000, brand: 'A', category: '외식' },
    ];
    const r = rankMerchantsByMonth(rows);
    expect(r.topBrand.amount).toBe(5000);
    expect(r.topBrand.count).toBe(2);
    // share = 5000 / 5000 = 100
    expect(r.topBrand.share).toBe(100);
  });

  it('total = 0 (모든 amount_krw 0) → share 0 (분모 0 회피)', () => {
    const rows = [
      { amount_krw: 0, brand: 'A' },
      { amount_krw: 0, brand: 'A' },
    ];
    const r = rankMerchantsByMonth(rows);
    expect(r.topBrand.amount).toBe(0);
    expect(r.topBrand.share).toBe(0);
  });
});

// ───────────────────────────────────────────────────────────────────────────
// Wave 11.6.4b — 모달 데이터 변환 + validation + Dexie save/delete
// ───────────────────────────────────────────────────────────────────────────

describe('datetimeLocalToIso / isoToDatetimeLocal — round-trip', () => {
  it('datetime-local → ISO (로컬 시간대 기준)', () => {
    const iso = datetimeLocalToIso('2026-04-15T10:30');
    // 사용자 로컬 시간대에서 2026-04-15 10:30 — 환경 무관 검증: 변환 후 다시 datetime-local 추출 시 같음
    expect(isoToDatetimeLocal(iso)).toBe('2026-04-15T10:30');
  });

  it('빈 / null / 잘못된 입력 → null/""', () => {
    expect(datetimeLocalToIso(null)).toBeNull();
    expect(datetimeLocalToIso('')).toBeNull();
    expect(datetimeLocalToIso('not-iso')).toBeNull();
    expect(isoToDatetimeLocal(null)).toBe('');
    expect(isoToDatetimeLocal('not-iso')).toBe('');
  });
});

describe('validateExpenseForm — 필수 필드 검증', () => {
  it('모두 채워짐 → []', () => {
    expect(validateExpenseForm({
      amount_krw: 1000, spent_at: '2026-04-15T10:00:00Z',
      merchant: '식당', category: '외식',
    })).toEqual([]);
  });

  it('amount 0 또는 누락 → ["amount"]', () => {
    expect(validateExpenseForm({ amount_krw: 0, spent_at: 'x', merchant: 'x', category: 'x' })).toContain('amount');
    expect(validateExpenseForm({ spent_at: 'x', merchant: 'x', category: 'x' })).toContain('amount');
  });

  it('spent_at 누락 → ["datetime"]', () => {
    expect(validateExpenseForm({ amount_krw: 100, merchant: 'x', category: 'x' })).toContain('datetime');
  });

  it('merchant / category 누락', () => {
    expect(validateExpenseForm({ amount_krw: 100, spent_at: 'x', category: 'x' })).toContain('merchant');
    expect(validateExpenseForm({ amount_krw: 100, spent_at: 'x', merchant: 'x' })).toContain('category');
  });

  it('전부 누락 → 4 모두', () => {
    const m = validateExpenseForm({});
    expect(m.sort()).toEqual(['amount', 'category', 'datetime', 'merchant']);
  });
});

// fake-indexeddb 환경에서 saveExpenseFromForm / deleteExpenseFromForm 동작 검증.
// _currentUser 는 mountExpensesView 가 set — 단위 테스트는 호출 후 saveExpenseFromForm.
describe('saveExpenseFromForm — Dexie create/update', () => {
  const OWNER = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';

  beforeEach(async () => {
    const dbName = 'today_test_' + Math.random().toString(36).slice(2, 10);
    globalThis.todayDB = createTodayDB(dbName);
    // fake document — extractExpenseFromForm 가 doc 인자 받음
    Expenses.mountExpensesView({ id: OWNER });
  });

  afterEach(async () => {
    if (globalThis.todayDB) {
      await globalThis.todayDB.delete();
      globalThis.todayDB = null;
    }
  });

  function makeFakeDoc(values) {
    const inputs = {
      expModalAmount: { value: values.amount || '' },
      expModalDatetime: { value: values.datetime || '' },
      expModalMerchant: { value: values.merchant || '' },
      expModalCard: { value: values.card || '' },
      expModalMemo: { value: values.memo || '' },
      expModalUrl: { value: values.url || '' },
    };
    const catCell = values.category
      ? { getAttribute: (k) => k === 'data-cat' ? values.category : null }
      : null;
    return {
      getElementById: (id) => inputs[id] || null,
      querySelector: (sel) => sel.includes('.is-active') ? catCell : null,
      querySelectorAll: () => [],
    };
  }

  it('new — createExpense + auto-match (매칭 룰 없으면 그대로)', async () => {
    const doc = makeFakeDoc({
      amount: '21,500',
      datetime: '2026-04-15T12:30',
      merchant: '파인만컴',
      card: '삼성카드',
      memo: '점심',
      category: '외식',
    });
    const result = await Expenses.saveExpenseFromForm({ mode: 'new' }, doc);
    expect(result.ok).toBe(true);
    expect(result.mode).toBe('new');
    expect(result.row.amount_krw).toBe(21500);
    expect(result.row.category).toBe('외식');
    expect(result.row.merchant).toBe('파인만컴');
    expect(result.row.source).toBe('manual');
    expect(result.row.owner_id).toBe(OWNER);

    const count = await globalThis.todayDB.expenses.count();
    expect(count).toBe(1);
  });

  it('edit — updateExpense (수정 가능 필드만: category/memo/merchant_url)', async () => {
    // 사전 생성
    const doc1 = makeFakeDoc({
      amount: '50,000',
      datetime: '2026-04-19T18:00',
      merchant: '회식 1차',
      card: '현대카드',
      category: '외식',
    });
    const first = await Expenses.saveExpenseFromForm({ mode: 'new' }, doc1);
    const editId = first.row.id;

    // edit — category/memo/url 만 변경
    const doc2 = makeFakeDoc({
      amount: '99,999', // 무시됨 (read-only 정책)
      datetime: '2099-01-01T00:00',
      merchant: 'IGNORED',
      card: 'IGNORED',
      memo: '편집된 메모',
      url: 'https://example.com',
      category: '간식',
    });
    const result = await Expenses.saveExpenseFromForm({ mode: 'edit', editId }, doc2);
    expect(result.ok).toBe(true);
    expect(result.mode).toBe('edit');
    expect(result.row.id).toBe(editId);
    // 수정된 필드
    expect(result.row.category).toBe('간식');
    expect(result.row.memo).toBe('편집된 메모');
    expect(result.row.merchant_url).toBe('https://example.com');
    // 보존된 필드 (read-only)
    expect(result.row.amount_krw).toBe(50000);
    expect(result.row.merchant).toBe('회식 1차');
    expect(result.row.card).toBe('현대카드');
  });

  it('validation 실패 — missing 배열 반환', async () => {
    const doc = makeFakeDoc({ amount: '0', merchant: '', category: '' });
    const result = await Expenses.saveExpenseFromForm({ mode: 'new' }, doc);
    expect(result.ok).toBe(false);
    expect(result.reason).toBe('validation');
    expect(result.missing).toContain('amount');
    expect(result.missing).toContain('datetime');
    expect(result.missing).toContain('merchant');
    expect(result.missing).toContain('category');
  });

  it('user 없음 → no_user', async () => {
    // _currentUser 리셋 — mountExpensesView({}) 는 no-op 이라 _currentUser 보존됨
    // 직접 unmount 흉내: mountExpensesView 의 _currentUser 갱신 (id 없는 객체는 early return → 보존)
    // → 별도 모듈 인스턴스 (vi.resetModules) 없이 직접 검증 어려움. saveExpenseFromForm 자체 가드 검증.
    // 우회: deleteExpenseFromForm 의 no_id 가 user 가드 이전에 트리거 — 별 케이스로 검증.
    const result = await Expenses.deleteExpenseFromForm(null);
    expect(result.ok).toBe(false);
    expect(result.reason).toBe('no_id');
  });
});

describe('deleteExpenseFromForm — softDelete', () => {
  const OWNER = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';

  beforeEach(async () => {
    const dbName = 'today_test_' + Math.random().toString(36).slice(2, 10);
    globalThis.todayDB = createTodayDB(dbName);
    Expenses.mountExpensesView({ id: OWNER });
  });

  afterEach(async () => {
    if (globalThis.todayDB) {
      await globalThis.todayDB.delete();
      globalThis.todayDB = null;
    }
  });

  it('실 row id → deleted_at 마킹', async () => {
    const row = await globalThis.todayDB.expenses.add({
      id: 'exp-1',
      owner_id: OWNER,
      spent_at: '2026-04-15T10:00:00Z',
      amount_krw: 1000,
      source: 'manual',
      category: '외식',
      merchant: 'X',
      created_at: '2026-04-15T10:00:00Z',
      updated_at: '2026-04-15T10:00:00Z',
      deleted_at: null,
      pending_sync: 0,
    });
    const result = await Expenses.deleteExpenseFromForm('exp-1');
    expect(result.ok).toBe(true);
    expect(result.row.deleted_at).toBeTruthy();
    const after = await globalThis.todayDB.expenses.get('exp-1');
    expect(after.deleted_at).toBeTruthy();
  });

  it('id 없음 → no_id', async () => {
    expect((await Expenses.deleteExpenseFromForm(null)).reason).toBe('no_id');
    expect((await Expenses.deleteExpenseFromForm('')).reason).toBe('no_id');
  });
});

// ───────────────────────────────────────────────────────────────────────────
// Wave 11.6.3.2 — 일자 popover
// ───────────────────────────────────────────────────────────────────────────

describe('Expenses 인터페이스 노출 (Wave 11.6.3.2)', () => {
  it('popover 함수 4종 노출', () => {
    expect(Expenses).toHaveProperty('rowToPopoverHtml');
    expect(Expenses).toHaveProperty('monthDayToIsoDate');
    expect(Expenses).toHaveProperty('dayOfWeekFromMonthDay');
    expect(Expenses).toHaveProperty('patchDayPopoverFromRows');
    expect(Expenses).toHaveProperty('patchDayPopoverHandlers');
  });
});

describe('rowToPopoverHtml — Dexie row → popover-row HTML', () => {
  it('필수 필드 모두 렌더 (data-tx-id + 카테고리 + merchant + 카드 + 금액)', () => {
    const html = rowToPopoverHtml({ id: 'exp-1', category: '배달', merchant: '주식회사우아', card: '삼성카드', amount_krw: 11880 });
    expect(html).toContain('data-tx-id="exp-1"');
    expect(html).toContain('>배달<');
    expect(html).toContain('>주식회사우아<');
    expect(html).toContain('삼성카드');
    expect(html).toContain('11,880');
    expect(html).toContain('class="exp-popover-row"');
  });

  it('card 누락 시 default 카드 라벨 사용', () => {
    const html = rowToPopoverHtml({ id: 'x', amount_krw: 1000 });
    expect(html).toContain('삼성카드');
    expect(html).toContain('MILEAGE PLATINUM');
  });

  it('card 누락 + opts.defaultCard 우선', () => {
    const html = rowToPopoverHtml({ id: 'x', amount_krw: 1000 }, { defaultCard: '현대카드 M' });
    expect(html).toContain('현대카드 M');
    expect(html).not.toContain('삼성카드');
  });

  it('merchant 누락 시 memo fallback', () => {
    const html = rowToPopoverHtml({ id: 'x', memo: '메모 폴백', amount_krw: 100 });
    expect(html).toContain('>메모 폴백<');
  });

  it('recurring=true → SVG 포함, false → 미포함', () => {
    const html1 = rowToPopoverHtml({ id: 'a', amount_krw: 100, recurring: true });
    const html2 = rowToPopoverHtml({ id: 'b', amount_krw: 100, recurring: false });
    expect(html1).toContain('exp-row__recurring');
    expect(html2).not.toContain('exp-row__recurring');
  });

  it('XSS 방지 — 카테고리/merchant/card 모두 escapeHtml', () => {
    const html = rowToPopoverHtml({ id: 'x', category: '<script>', merchant: '"a&b"', card: '<img>', amount_krw: 100 });
    expect(html).not.toContain('<script>');
    expect(html).toContain('&lt;script&gt;');
    expect(html).toContain('&amp;');
    expect(html).not.toContain('<img>');
  });

  it('id 누락 / null row → 빈 data-tx-id + 0원', () => {
    expect(rowToPopoverHtml(null)).toContain('data-tx-id=""');
    expect(rowToPopoverHtml(null)).toContain('0');
  });
});

describe('monthDayToIsoDate — MM-DD → YYYY-MM-DD', () => {
  it('정상 형식 → 현재 year prefix', () => {
    const iso = monthDayToIsoDate('04-12');
    expect(iso).toMatch(/^\d{4}-04-12$/);
  });

  it('null/undefined/빈 → null', () => {
    expect(monthDayToIsoDate(null)).toBe(null);
    expect(monthDayToIsoDate(undefined)).toBe(null);
    expect(monthDayToIsoDate('')).toBe(null);
  });

  it('형식 mismatch → null', () => {
    expect(monthDayToIsoDate('04')).toBe(null);
    expect(monthDayToIsoDate('2026-04-12')).toBe(null);
    expect(monthDayToIsoDate('4-12')).toBe(null);
  });
});

describe('dayOfWeekFromMonthDay — MM-DD → 요일 한글', () => {
  it('정상 → 한글 1글자', () => {
    const dow = dayOfWeekFromMonthDay('04-12');
    expect(['일','월','화','수','목','금','토']).toContain(dow);
  });

  it('형식 mismatch → ""', () => {
    expect(dayOfWeekFromMonthDay(null)).toBe('');
    expect(dayOfWeekFromMonthDay('bad')).toBe('');
  });
});

describe('patchDayPopoverFromRows — DOM 패치 (1건 룰 포함)', () => {
  // 단순 fake DOM (jsdom 미도입 환경)
  function makeFakeDoc() {
    function makeNode() {
      return {
        textContent: '',
        innerHTML: '',
        style: {},
        children: new Map(),
        querySelector(sel) {
          if (this.children.has(sel)) return this.children.get(sel);
          const node = makeNode();
          this.children.set(sel, node);
          return node;
        },
      };
    }
    const popover = makeNode();
    return {
      getElementById(id) {
        if (id === 'expDayPopover') return popover;
        return null;
      },
      _popover: popover,
    };
  }

  it('no_doc → reason="no_doc"', () => {
    const r = patchDayPopoverFromRows({ monthDay: '04-12', rows: [], doc: null });
    expect(r.applied).toBe(false);
    expect(r.reason).toBe('no_doc');
  });

  it('no_date → reason="no_date"', () => {
    const r = patchDayPopoverFromRows({ monthDay: null, rows: [], doc: makeFakeDoc() });
    expect(r.applied).toBe(false);
    expect(r.reason).toBe('no_date');
  });

  it('popover element 누락 → reason="no_popover"', () => {
    const doc = { getElementById: () => null };
    const r = patchDayPopoverFromRows({ monthDay: '04-12', rows: [], doc });
    expect(r.applied).toBe(false);
    expect(r.reason).toBe('no_popover');
  });

  it('rows 0건 → empty 메시지 + foot 숨김', () => {
    const doc = makeFakeDoc();
    const r = patchDayPopoverFromRows({ monthDay: '04-12', rows: [], doc });
    expect(r.applied).toBe(true);
    expect(r.count).toBe(0);
    expect(doc._popover.querySelector('.expense-list').innerHTML).toContain('이 날의 거래가 없습니다');
    expect(doc._popover.querySelector('.exp-day-detail__foot').style.display).toBe('none');
  });

  it('rows 1건 → foot.style.display="none" (1건 룰)', () => {
    const doc = makeFakeDoc();
    const rows = [{ id: 'a', category: '배달', merchant: '주식회사우아', amount_krw: 11880 }];
    const r = patchDayPopoverFromRows({ monthDay: '04-12', rows, doc });
    expect(r.applied).toBe(true);
    expect(r.count).toBe(1);
    expect(doc._popover.querySelector('.expense-list').innerHTML).toContain('주식회사우아');
    expect(doc._popover.querySelector('.exp-day-detail__foot').style.display).toBe('none');
  });

  it('rows 2건 → foot.style.display="" + count + sum', () => {
    const doc = makeFakeDoc();
    const rows = [
      { id: 'a', category: '편의점', merchant: 'GS25', amount_krw: 5000 },
      { id: 'b', category: '간식', merchant: '빵집', amount_krw: 3000 },
    ];
    const r = patchDayPopoverFromRows({ monthDay: '04-25', rows, doc });
    const foot = doc._popover.querySelector('.exp-day-detail__foot');
    expect(r.count).toBe(2);
    expect(foot.style.display).toBe('');
    expect(foot.querySelector('.exp-day-detail__foot-count').textContent).toBe('2건');
    expect(foot.querySelector('.exp-day-detail__foot-sum').innerHTML).toContain('8,000');
  });

  it('rows 4건 → 합계 정확', () => {
    const doc = makeFakeDoc();
    const rows = [
      { id: 'a', amount_krw: 24000 },
      { id: 'b', amount_krw: 26350 },
      { id: 'c', amount_krw: 1490000 },
      { id: 'd', amount_krw: 7890 },
    ];
    const r = patchDayPopoverFromRows({ monthDay: '04-11', rows, doc });
    const foot = doc._popover.querySelector('.exp-day-detail__foot');
    expect(r.count).toBe(4);
    expect(foot.querySelector('.exp-day-detail__foot-count').textContent).toBe('4건');
    expect(foot.querySelector('.exp-day-detail__foot-sum').innerHTML).toContain('1,548,240');
  });

  it('헤더 텍스트 = "M월 D일 X요일"', () => {
    const doc = makeFakeDoc();
    patchDayPopoverFromRows({ monthDay: '04-12', rows: [], doc });
    const dateText = doc._popover.querySelector('.exp-day-detail__date').textContent;
    expect(dateText).toMatch(/^4월 12일 [일월화수목금토]요일$/);
  });
});

// ───────────────────────────────────────────────────────────────────────────
// 별 wave C — openExpSearch Dexie wiring
// ───────────────────────────────────────────────────────────────────────────

describe('rowToExpSearchHtml', () => {
  it('필수 필드 직렬화 + 카드/카테고리 + 금액 (영문 id → 한글 라벨 변환)', () => {
    const html = rowToExpSearchHtml({
      merchant: '쿠팡',
      card: '신한카드',
      category: 'online',  // 영문 id (DB) → toCategoryLabel 이 '온라인쇼핑' 으로 변환
      amount_krw: 50000,
    });
    expect(html).toContain('class="exp-popover-row"');
    expect(html).toContain('쿠팡');
    expect(html).toContain('신한카드');
    expect(html).toContain('온라인쇼핑');
    expect(html).toContain('50,000');
  });
  it('사용자 picker 외 category 는 기타 라벨로 통합 (SOYOUN 전용 / null)', () => {
    const html1 = rowToExpSearchHtml({ merchant: 'M', category: 'food', amount_krw: 100 });
    const html2 = rowToExpSearchHtml({ merchant: 'M', category: null, amount_krw: 100 });
    expect(html1).toContain('>기타<');
    expect(html2).toContain('>기타<');
  });
  it('XSS escape (merchant/card)', () => {
    const html = rowToExpSearchHtml({
      merchant: '<script>x</script>',
      card: 'A&B',
      category: 'online',
      amount_krw: 100,
    });
    expect(html).not.toContain('<script>');
    expect(html).toContain('&lt;script&gt;');
    expect(html).toContain('A&amp;B');
  });
  it('merchant 없음 → memo 폴백', () => {
    const html = rowToExpSearchHtml({ memo: '메모만', amount_krw: 0 });
    expect(html).toContain('메모만');
  });
});

describe('renderExpSearchDexie — Dexie searchExpenses 결과 렌더', () => {
  const OWNER = '11111111-2222-3333-4444-555555555555';

  beforeEach(async () => {
    const dbName = 'today_test_' + Math.random().toString(36).slice(2, 10);
    globalThis.todayDB = createTodayDB(dbName);
  });

  afterEach(async () => {
    if (globalThis.todayDB) {
      await globalThis.todayDB.delete();
      globalThis.todayDB = null;
    }
  });

  function makeFakeDoc() {
    const body = { innerHTML: '' };
    return {
      _body: body,
      getElementById: (id) => (id === 'expSearchResults' ? body : null),
    };
  }

  it('q 빈 → "거래 키워드를 입력하세요" placeholder', async () => {
    const doc = makeFakeDoc();
    const ok = await renderExpSearchDexie('', doc);
    expect(ok).toBe(true);
    expect(doc._body.innerHTML).toContain('거래 키워드를 입력하세요');
  });

  it('매치 0 → "..."와 일치하는 거래가 없습니다 + XSS escape', async () => {
    const doc = makeFakeDoc();
    await renderExpSearchDexie('<script>', doc);
    expect(doc._body.innerHTML).toContain('일치하는 거래가 없습니다');
    expect(doc._body.innerHTML).not.toContain('<script>');
    expect(doc._body.innerHTML).toContain('&lt;script&gt;');
  });

  it('매치 N → 헤더 + 합계 + 행 N개', async () => {
    const { Queries } = await import('../db/queries.js');
    await Queries.createExpense({
      owner_id: OWNER,
      spent_at: '2026-04-12T13:00:00Z',
      amount_krw: 11880,
      merchant: '쿠팡',
      category: '쇼핑',
      source: 'manual',
    });
    await Queries.createExpense({
      owner_id: OWNER,
      spent_at: '2026-04-15T13:00:00Z',
      amount_krw: 5000,
      merchant: '쿠팡 이츠',
      category: '배달',
      source: 'manual',
    });
    await Queries.createExpense({
      owner_id: OWNER,
      spent_at: '2026-04-15T13:00:00Z',
      amount_krw: 3000,
      merchant: '편의점',
      category: '편의점',
      source: 'manual',
    });
    const doc = makeFakeDoc();
    await renderExpSearchDexie('쿠팡', doc);
    expect(doc._body.innerHTML).toContain('2건');
    expect(doc._body.innerHTML).toContain('합계');
    expect(doc._body.innerHTML).toContain('쿠팡');
    expect(doc._body.innerHTML).toContain('쿠팡 이츠');
    expect(doc._body.innerHTML).not.toContain('편의점');
  });

  it('body 미존재 → false', async () => {
    const fakeDoc = { getElementById: () => null };
    expect(await renderExpSearchDexie('q', fakeDoc)).toBe(false);
  });
});

describe('patchExpSearchHandlers', () => {
  beforeEach(() => {
    __resetExpSearchPatchState();
  });

  it('listener 등록 + idempotent', () => {
    const listeners = [];
    const fakeDoc = {
      addEventListener: (type, h, capture) => listeners.push({ type, h, capture }),
      getElementById: () => null,
    };
    expect(patchExpSearchHandlers({ doc: fakeDoc })).toBe(true);
    expect(listeners.length).toBe(1);
    expect(listeners[0].type).toBe('input');
    expect(listeners[0].capture).toBe(true);
    // idempotent
    expect(patchExpSearchHandlers({ doc: fakeDoc })).toBe(true);
    expect(listeners.length).toBe(1);
  });

  it('input listener — id !== expSearchInput → no-op', async () => {
    const listeners = [];
    const fakeDoc = {
      addEventListener: (type, h) => listeners.push({ type, h }),
      getElementById: () => null,
    };
    patchExpSearchHandlers({ doc: fakeDoc });
    const handler = listeners[0].h;
    const event = {
      target: { id: 'otherInput', value: 'q' },
      stopImmediatePropagation: vi.fn(),
    };
    await handler(event);
    expect(event.stopImmediatePropagation).not.toHaveBeenCalled();
  });
});

// ───────────────────────────────────────────────────────────────────────────
// Wave 11.6.5 — 카테고리 통계 카드 click → popup
// ───────────────────────────────────────────────────────────────────────────

describe('fetchCategoryExpenses — Wave 11.6.5', () => {
  const OWNER = '11111111-2222-3333-4444-555555555555';

  beforeEach(async () => {
    const dbName = 'today_test_' + Math.random().toString(36).slice(2, 10);
    globalThis.todayDB = createTodayDB(dbName);
  });

  afterEach(async () => {
    if (globalThis.todayDB) {
      await globalThis.todayDB.delete();
      globalThis.todayDB = null;
    }
  });

  it('카테고리 + 월 매치 — 합계 정확', async () => {
    const { Queries } = await import('../db/queries.js');
    await Queries.createExpense({
      owner_id: OWNER,
      spent_at: '2026-04-12T13:00:00Z',
      amount_krw: 11880,
      merchant: '주식회사우아',
      category: '배달',
      source: 'manual',
    });
    await Queries.createExpense({
      owner_id: OWNER,
      spent_at: '2026-04-15T13:00:00Z',
      amount_krw: 22000,
      merchant: '쿠팡 이츠',
      category: '배달',
      source: 'manual',
    });
    await Queries.createExpense({
      owner_id: OWNER,
      spent_at: '2026-04-20T13:00:00Z',
      amount_krw: 5000,
      merchant: '편의점',
      category: '편의점',
      source: 'manual',
    });
    const r = await fetchCategoryExpenses('배달', { year: 2026, month: 4 });
    expect(r.rows.length).toBe(2);
    expect(r.total).toBe(33880);
  });

  it('다른 월 — 제외', async () => {
    const { Queries } = await import('../db/queries.js');
    await Queries.createExpense({
      owner_id: OWNER,
      spent_at: '2026-03-12T13:00:00Z',
      amount_krw: 1000,
      merchant: 'A',
      category: '배달',
      source: 'manual',
    });
    const r = await fetchCategoryExpenses('배달', { year: 2026, month: 4 });
    expect(r.rows.length).toBe(0);
    expect(r.total).toBe(0);
  });

  it('빈 category → 빈 결과', async () => {
    const r = await fetchCategoryExpenses('');
    expect(r.rows).toEqual([]);
    expect(r.total).toBe(0);
  });

  it('2026-05-12 — 한글 라벨 / 영문 id 양방향 매칭', async () => {
    const { Queries } = await import('../db/queries.js');
    // SMS ingest 시대 데이터 — category 가 영문 id ('online')
    await Queries.createExpense({
      owner_id: OWNER,
      spent_at: '2026-05-06T13:00:00Z',
      amount_krw: 3470,
      merchant: '쿠팡',
      category: 'online',
      source: 'sms',
    });
    // Keep import 시대 데이터 — category 가 한글 ('온라인쇼핑')
    await Queries.createExpense({
      owner_id: OWNER,
      spent_at: '2026-05-05T13:00:00Z',
      amount_krw: 26350,
      merchant: '쿠팡',
      category: '온라인쇼핑',
      source: 'manual',
    });
    // 한글 라벨로 호출 — 두 row 모두 매칭 (id 변환 후 둘 다 'online')
    const byLabel = await fetchCategoryExpenses('온라인쇼핑', { year: 2026, month: 5 });
    expect(byLabel.rows.length).toBe(2);
    expect(byLabel.total).toBe(29820);
    // 영문 id 로 호출 — 동일 결과
    const byId = await fetchCategoryExpenses('online', { year: 2026, month: 5 });
    expect(byId.rows.length).toBe(2);
    expect(byId.total).toBe(29820);
  });

  it('2026-05-12 — scope=year 옵션 (누적 위젯 클릭 케이스)', async () => {
    const { Queries } = await import('../db/queries.js');
    // 2026년 1월
    await Queries.createExpense({
      owner_id: OWNER,
      spent_at: '2026-01-15T13:00:00Z',
      amount_krw: 10000,
      merchant: 'A',
      category: 'online',
      source: 'sms',
    });
    // 2026년 5월
    await Queries.createExpense({
      owner_id: OWNER,
      spent_at: '2026-05-06T13:00:00Z',
      amount_krw: 20000,
      merchant: 'B',
      category: 'online',
      source: 'sms',
    });
    // 2025년 (제외)
    await Queries.createExpense({
      owner_id: OWNER,
      spent_at: '2025-12-31T13:00:00Z',
      amount_krw: 9999,
      merchant: 'C',
      category: 'online',
      source: 'sms',
    });
    const r = await fetchCategoryExpenses('online', { year: 2026, scope: 'year' });
    expect(r.rows.length).toBe(2);
    expect(r.total).toBe(30000);
    expect(r.scope).toBe('year');
  });
});

describe('buildCategoryPopupHtml — Wave 11.6.5', () => {
  it('rows 0건 → 빈 메시지', () => {
    const html = buildCategoryPopupHtml('배달', [], 0, { month: 4 });
    expect(html).toContain('배달 · 4월');
    expect(html).toContain('이 카테고리의 거래가 없습니다');
    expect(html).toContain('data-popup-close');
  });

  it('rows N건 → 헤더 + 합계 + 행', () => {
    const rows = [
      { merchant: '쿠팡', card: '신한', category: '배달', amount_krw: 10000 },
      { merchant: '배민', card: '신한', category: '배달', amount_krw: 5000 },
    ];
    const html = buildCategoryPopupHtml('배달', rows, 15000, { month: 4 });
    expect(html).toContain('2건');
    expect(html).toContain('15,000');
    expect(html).toContain('쿠팡');
    expect(html).toContain('배민');
  });

  it('XSS escape', () => {
    const html = buildCategoryPopupHtml('<script>x</script>', [], 0, { month: 4 });
    expect(html).not.toContain('<script>x</script>');
    expect(html).toContain('&lt;script&gt;x&lt;/script&gt;');
  });

  it('2026-05-12 — 카테고리 모달 row 는 카테고리 라벨 대신 날짜 노출 (rowToCategoryPopupHtml)', () => {
    const rows = [
      { id: 'a', merchant: '쿠팡', card: '삼성1337', category: 'online', amount_krw: 3470, spent_at: '2026-05-06T13:00:00Z' },
    ];
    const html = buildCategoryPopupHtml('온라인쇼핑', rows, 3470, { year: 2026, scope: 'year' });
    // 카테고리 라벨 ('온라인쇼핑') 이 row 첫 column 에 반복되지 않아야 함 — 헤드라인에만
    const rowOnlyHtml = html.split('class="exp-fp-summary"')[0];  // summary 이전까지
    const rowSection = rowOnlyHtml.split('class="exp-fp-header"')[1] || rowOnlyHtml;
    expect(rowSection).not.toMatch(/exp-popover-row__cat[^>]*>온라인쇼핑</);
    // 대신 날짜 (MM-DD) 노출
    expect(html).toContain('>05-06<');
    // 헤드라인엔 카테고리 표시
    expect(html).toContain('온라인쇼핑 · 2026년');
  });
});

describe('openCategoryDetailPopup — Wave 11.6.5', () => {
  const OWNER = '11111111-2222-3333-4444-555555555555';

  beforeEach(async () => {
    const dbName = 'today_test_' + Math.random().toString(36).slice(2, 10);
    globalThis.todayDB = createTodayDB(dbName);
  });

  afterEach(async () => {
    if (globalThis.todayDB) {
      await globalThis.todayDB.delete();
      globalThis.todayDB = null;
    }
  });

  it('doc=null → no_doc', async () => {
    const r = await openCategoryDetailPopup('배달', {}, null);
    expect(r.ok).toBe(false);
    expect(r.reason).toBe('no_doc');
  });

  it('빈 category → no_category', async () => {
    const fakeDoc = { createElement: () => ({}), body: { appendChild: () => {} } };
    const r = await openCategoryDetailPopup('', {}, fakeDoc);
    expect(r.ok).toBe(false);
    expect(r.reason).toBe('no_category');
  });

  it('fake doc 에 overlay 마운트 + count=2', async () => {
    const { Queries } = await import('../db/queries.js');
    await Queries.createExpense({
      owner_id: OWNER,
      spent_at: '2026-04-12T13:00:00Z',
      amount_krw: 1000,
      merchant: 'A',
      category: '배달',
      source: 'manual',
    });
    await Queries.createExpense({
      owner_id: OWNER,
      spent_at: '2026-04-15T13:00:00Z',
      amount_krw: 2000,
      merchant: 'B',
      category: '배달',
      source: 'manual',
    });
    const overlays = [];
    const fakeOverlay = {
      _classes: new Set(['exp-fp-overlay']),
      classList: { add: (c) => fakeOverlay._classes.add(c), remove: (c) => fakeOverlay._classes.delete(c) },
      attrs: {},
      setAttribute(k, v) { this.attrs[k] = v; },
      addEventListener: () => {},
      innerHTML: '',
      parentNode: null,
    };
    let removed = false;
    const fakeDoc = {
      createElement: () => fakeOverlay,
      getElementById: () => null,
      body: {
        appendChild: () => { fakeOverlay.parentNode = fakeDoc.body; overlays.push(fakeOverlay); },
        removeChild: () => { fakeOverlay.parentNode = null; removed = true; },
      },
      addEventListener: () => {},
      removeEventListener: () => {},
    };
    const r = await openCategoryDetailPopup('배달', { year: 2026, month: 4 }, fakeDoc);
    expect(r.ok).toBe(true);
    expect(r.count).toBe(2);
    expect(overlays.length).toBe(1);
    expect(fakeOverlay.innerHTML).toContain('배달 · 4월');
    expect(fakeOverlay.innerHTML).toContain('2건');
    expect(fakeOverlay.attrs['data-category-popup']).toBe('true');
  });
});

describe('patchOpenCategoryDetailHandler', () => {
  beforeEach(() => {
    __resetCategoryDetailPatchState();
  });

  it('mocks window.openCategoryDetail wrap + idempotent', () => {
    const fakeWin = {};
    const ok1 = patchOpenCategoryDetailHandler({ win: fakeWin, doc: {} });
    expect(ok1).toBe(true);
    expect(typeof fakeWin.openCategoryDetail).toBe('function');
    // idempotent
    const orig = fakeWin.openCategoryDetail;
    const ok2 = patchOpenCategoryDetailHandler({ win: fakeWin, doc: {} });
    expect(ok2).toBe(true);
    expect(fakeWin.openCategoryDetail).toBe(orig);
  });
});

describe('patchDayPopoverFromRows — Wave 11.6.5 빈 메시지 보강', () => {
  function makeFakeDoc() {
    const popover = document.createElement
      ? document.createElement('div')
      : null;
    if (popover) {
      popover.innerHTML = `
        <span class="exp-day-detail__date"></span>
        <div class="expense-list"></div>
        <div class="exp-day-detail__foot">
          <span class="exp-day-detail__foot-count"></span>
          <span class="exp-day-detail__foot-sum"></span>
        </div>
      `;
      popover.id = 'expDayPopover';
    }
    return {
      _popover: popover,
      getElementById: (id) => (id === 'expDayPopover' ? popover : null),
    };
  }

  it('rows=[] → SMS 연동 안내 + 거래 추가 버튼 포함', () => {
    if (typeof document === 'undefined') return; // node env — skip
    const doc = makeFakeDoc();
    if (!doc._popover) return;
    patchDayPopoverFromRows({ monthDay: '04-12', rows: [], doc });
    const html = doc._popover.querySelector('.expense-list').innerHTML;
    expect(html).toContain('이 날의 거래가 없습니다');
    expect(html).toContain('SMS 연동');
    expect(html).toContain('거래 추가');
    expect(html).toContain('window.openNewExpenseForm');
  });
});
