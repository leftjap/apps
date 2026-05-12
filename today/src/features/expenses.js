/**
 * Expenses integration layer (Wave 11.6.3 — 가계부 대시보드/타임라인 UI).
 *
 * 책임:
 *  - mocks 의 가계부 카테고리 active 변경 감지 → listExpensesByMonth 호출
 *  - #recentsList 재패치 (최근 5건 거래)
 *  - .exp-headline 부분 patch (월 총액·일평균)
 *  - .exp-month-day-amount 일별 합계 patch
 *  - .exp-tab-panel--feed 의 타임라인 재구성 (.exp-tl-list)
 *  - mocks IIFE 접근용 `window.todayExpenses` 노출
 *
 * Clean Room 정합:
 *  - mocks/today-mac.html 은 불변. SPA layer 가 mocks renderExpense 결과 위에 부분 patch.
 *  - rows.length === 0 시엔 mocks FIXTURE 그대로 보존.
 *
 * 비대상 (별 wave):
 *  - 편집 모달 (Wave 11.6.4b)
 *  - 브랜드 랭킹 / 누적 / 월별 추이 (Dexie 누적 데이터 부족)
 *
 * Wave 11.6.3.2 보강:
 *  - 일자 popover monkey-patch (window.openExpDayPopover) — Dexie listExpensesByDate 기반
 *  - 1건 이하 시 .exp-day-detail__foot 숨김 (합계 행 의미 없음)
 */
import { Queries } from '../db/queries.js';
import Classifier from '../services/expense-classifier.js';

/** 영문 카테고리 id (DB enum) → 한글 라벨.
 * 2026-05-12: 사용자 picker 외 id (예: LEFTJAP 사용자에게 'food'/'cafe' 같은 SOYOUN 전용
 * id) 또는 null 은 '기타' (etc) 로 통합. 화면에서 사용자가 만들지 않은 라벨이
 * 노출되는 것을 방지 — 통계/타임라인/검색 모두 일관.
 */
export function toCategoryLabel(id) {
  if (id) {
    const hit = Classifier.getCategoryById?.(id);
    if (hit) return hit.name;
  }
  const etc = Classifier.getCategoryById?.('etc');
  return etc?.name || '기타';
}

let _categoryObserver = null;
let _onCategoryChange = null;
let _currentUser = null;
let _activeMonthKey = null; // "YYYY-MM" — race 가드

// ───────────────────────────────────────────────────────────────────────────
// 어댑터 (순수 함수)
// ───────────────────────────────────────────────────────────────────────────

/** 숫자 → mocks formatAmount HTML (today-mac.html L3845-3847 답습). */
export function formatAmount(n) {
  const v = Number(n) || 0;
  return `<span class="amt-num">${v.toLocaleString('ko-KR')}</span> <span class="amt-unit">원</span>`;
}

/** ISO spent_at → "MM-DD" (mocks tx.date 형식). 날짜 파트만 추출. */
export function isoToMockDate(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${mm}-${dd}`;
}

/** Dexie expense row → mocks tx 형식 (id, date, category, memo, amount, brand?, card?). */
export function rowToMockTx(row) {
  return {
    id: row.id,
    date: isoToMockDate(row.spent_at),
    category: row.category || '미분류',
    memo: row.memo || row.merchant || '',
    amount: row.amount_krw || 0,
    brand: row.brand || null,
    card: row.card || null,
  };
}

/** rows → { "MM-DD": sum } 일별 합계 Map. */
export function dailyTotalsFromRows(rows) {
  const totals = {};
  for (const r of rows || []) {
    const d = isoToMockDate(r.spent_at);
    if (!d) continue;
    totals[d] = (totals[d] || 0) + (r.amount_krw || 0);
  }
  return totals;
}

/** rows → 월 총액 + 일평균. todayDay 는 사용자 시각 기준 일자 (디폴트 = 오늘). */
export function summarizeMonth(rows, todayDay) {
  const total = (rows || []).reduce((s, r) => s + (r.amount_krw || 0), 0);
  const day = todayDay || new Date().getDate();
  const avg = day > 0 ? Math.round(total / day) : total;
  return { total, dailyAvg: avg, headlineMan: Math.round(total / 10000) };
}

export function escapeHtml(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** 만원/원 단위 단순 표시 — mocks today-mac.html L4209-4213 의 formatManwon 답습. */
export function formatManwon(n) {
  const v = Number(n) || 0;
  if (v >= 10000) return `${Math.round(v / 10000)}만원`;
  return `${v.toLocaleString('ko-KR')}원`;
}

/**
 * rows → { topBrand, brands } — 가맹점별 합산 + 정렬 + 상위 N.
 * mocks today-mac.html L3670-3678 (FIXTURE.expense.topBrand / brands) 형식 답습.
 *
 * - merchant 별 합산 (amount_krw total + count). brand 우선, 없으면 merchant.
 * - cat = 가장 빈번한 category (동률 시 첫 발견 — deterministic Object.entries 순회)
 * - share = Math.round(amount/total × 1000) / 10 (소수 첫 자리, mocks topBrand.share 형식)
 * - topBrand: { name, initial, count, share, amount } 또는 null
 * - brands: [{ rank, name, cat, amount, count }, ...] (rank 2~, desc 정렬)
 */
export function rankMerchantsByMonth(rows) {
  if (!rows || !rows.length) return { topBrand: null, brands: [] };
  const total = rows.reduce((s, r) => s + (r.amount_krw || 0), 0);
  const groups = new Map();
  for (const r of rows) {
    const name = r.brand || r.merchant;
    if (!name) continue;
    const amt = r.amount_krw || 0;
    const cat = r.category || '미분류';
    let g = groups.get(name);
    if (!g) {
      g = { name, amount: 0, count: 0, catCounts: {} };
      groups.set(name, g);
    }
    g.amount += amt;
    g.count += 1;
    g.catCounts[cat] = (g.catCounts[cat] || 0) + 1;
  }
  if (!groups.size) return { topBrand: null, brands: [] };
  const sorted = [...groups.values()]
    .sort((a, b) => b.amount - a.amount)
    .map((g) => ({
      name: g.name,
      amount: g.amount,
      count: g.count,
      cat: pickModeCategory(g.catCounts),
    }));
  const top = sorted[0];
  const share = total > 0 ? Math.round((top.amount / total) * 1000) / 10 : 0;
  const topBrand = {
    name: top.name,
    initial: top.name.charAt(0) || '',
    count: top.count,
    share,
    amount: top.amount,
  };
  const brands = sorted.slice(1).map((g, i) => ({
    rank: i + 2,
    name: g.name,
    cat: g.cat,
    amount: g.amount,
    count: g.count,
  }));
  return { topBrand, brands };
}

function pickModeCategory(catCounts) {
  let max = 0;
  let mode = '미분류';
  for (const [k, v] of Object.entries(catCounts)) {
    if (v > max) {
      max = v;
      mode = k;
    }
  }
  return mode;
}

// ───────────────────────────────────────────────────────────────────────────
// DOM 패치 — Recents 사이드바
// ───────────────────────────────────────────────────────────────────────────

/**
 * #recentsList 를 Dexie expense rows 로 재구성. rows.length === 0 시 no-op.
 * mocks renderRecents 의 expense 분기 (today-mac.html L3755-3764) 답습:
 *   <div class="sb__item sb__item--recent" data-tx-id="${id}" onclick="jumpToExpenseTx('${id}')">
 *     ${memo} <span class="recent-share recent-share--amount">${formatAmount}</span>
 *   </div>
 */
export function renderExpenseRecentsFromRows(rows, doc = document) {
  const list = doc.getElementById('recentsList');
  if (!list) return false;
  if (!rows || !rows.length) return false;
  // 최근 5건 (spent_at desc — listExpensesByMonth 가 이미 desc 정렬)
  const items = rows.slice(0, 5).map((r) => {
    const id = escapeHtml(r.id);
    const memo = escapeHtml(r.memo || r.merchant || r.brand || r.category || '거래');
    const amt = formatAmount(r.amount_krw || 0);
    return `<div class="sb__item sb__item--recent" data-tx-id="${id}" onclick="jumpToExpenseTx('${id}')">${memo}<span class="recent-share recent-share--amount">${amt}</span></div>`;
  }).join('');
  list.innerHTML = items;
  return true;
}

// ───────────────────────────────────────────────────────────────────────────
// DOM 패치 — 헤드라인 (월 총액 + 일평균)
// ───────────────────────────────────────────────────────────────────────────

/**
 * .exp-headline-title <strong> + .exp-headline-sub <strong> 텍스트만 갱신.
 * inline onclick 보존 (전체 갈아치움 안 함).
 */
export function patchHeadlineFromRows(rows, opts = {}, doc = document) {
  const title = doc.querySelector('.exp-headline-title strong');
  const sub = doc.querySelector('.exp-headline-sub strong');
  if (!title && !sub) return false;
  if (!rows || !rows.length) return false;
  const { total, dailyAvg, headlineMan } = summarizeMonth(rows, opts.todayDay);
  if (title) title.textContent = `${headlineMan}만원`;
  if (sub) sub.textContent = `${dailyAvg.toLocaleString('ko-KR')}원`;
  return true;
}

// ───────────────────────────────────────────────────────────────────────────
// DOM 패치 — 캘린더 일별 합계
// ───────────────────────────────────────────────────────────────────────────

/**
 * .exp-month-day[data-date] 의 .exp-month-day-amount 텍스트 갱신.
 * highThreshold = 100,000 원 고정 (사용자 정책: 10만원 이상 지출만 강조).
 */
export function patchCalendarFromRows(rows, opts = {}, doc = document) {
  const cells = doc.querySelectorAll('.exp-month-day[data-date]');
  if (!cells.length) return false;
  if (!rows || !rows.length) return false;
  const totals = dailyTotalsFromRows(rows);
  const highThreshold = 100000;
  cells.forEach((cell) => {
    const ds = cell.getAttribute('data-date');
    const total = totals[ds] || 0;
    const amtEl = cell.querySelector('.exp-month-day-amount');
    if (amtEl) {
      amtEl.textContent = total > 0 ? total.toLocaleString('ko-KR') : '';
      amtEl.classList.toggle('high', total >= highThreshold && total > 0);
    }
    // is-zero 갱신 (today 는 예외 — mocks 정책 답습)
    const isToday = cell.classList.contains('today');
    cell.classList.toggle('is-zero', total === 0 && !isToday);
  });
  return true;
}

// ───────────────────────────────────────────────────────────────────────────
// DOM 패치 — 타임라인 재구성
// ───────────────────────────────────────────────────────────────────────────

/**
 * 타임라인 (.exp-tl-list) 를 Dexie rows 로 재구성.
 * mocks renderExpense L4421-4458 패턴 답습 — 같은 날 두 번째 거래부터 좌측 컬럼 .is-cont.
 */
export function renderTimelineFromRows(rows, opts = {}, doc = document, year) {
  const list = doc.querySelector('.exp-tl-list');
  if (!list) return false;
  if (!rows || !rows.length) return false;
  const yr = year || new Date().getFullYear();
  const highThreshold = 100000; // 10만원 이상 지출 → 오렌지 강조 (정책)
  const txByDate = {};
  for (const r of rows) {
    const d = isoToMockDate(r.spent_at);
    if (!d) continue;
    if (!txByDate[d]) txByDate[d] = [];
    txByDate[d].push(r);
  }
  const sortedDates = Object.keys(txByDate).sort((a, b) => b.localeCompare(a));
  const dows = ['일', '월', '화', '수', '목', '금', '토'];
  const html = sortedDates.map((dateStr) => {
    const [tm, td] = dateStr.split('-').map(Number);
    const dn = dows[new Date(yr, tm - 1, td).getDay()];
    return txByDate[dateStr].map((r, i) => {
      const merchant = escapeHtml(r.brand || r.memo || r.merchant || '');
      const card = escapeHtml(r.card || '삼성카드 & MILEAGE PLATINUM');
      const cat = escapeHtml(toCategoryLabel(r.category));
      const isCont = i > 0;
      const dateCell = isCont
        ? '<div class="exp-tl-row__date is-cont" aria-hidden="true"></div>'
        : `<div class="exp-tl-row__date"><span class="exp-tl-row__date-dow">${dn}</span><span class="exp-tl-row__date-d">${td}일</span></div>`;
      const isHigh = (r.amount_krw || 0) >= highThreshold;
      const amt = formatAmount(r.amount_krw || 0);
      const id = escapeHtml(r.id);
      return `<div class="exp-tl-row${isCont ? ' is-cont' : ''}" data-tx-id="${id}" onclick="openExpenseModal('edit', '${id}')">${dateCell}<div class="exp-tl-row__body"><div class="exp-tl-row__head"><span class="exp-tl-row__cat">${cat}</span><span class="exp-tl-row__card">${card}</span></div><div class="exp-tl-row__merchant">${merchant}</div></div><div class="exp-tl-row__amount${isHigh ? ' is-high' : ''}">${amt}</div></div>`;
    }).join('');
  }).join('');
  list.innerHTML = html;
  return true;
}

// ───────────────────────────────────────────────────────────────────────────
// DOM 패치 — 가맹점 랭킹 섹션 (단일 월)
// ───────────────────────────────────────────────────────────────────────────

/** onclick 속성에 들어갈 가맹점 이름 — 작은따옴표/백슬래시 escape (가맹점명 한국어 안전). */
export function escapeAttr(s) {
  return String(s ?? '').replace(/\\/g, '\\\\').replace(/'/g, "\\'");
}

/**
 * .exp-rank-section 의 1위 카드 (.exp-rank-1) + 그리드 (.exp-rank-grid) Dexie rows 로 갱신.
 * mocks today-mac.html L4552-4563 (rank-1) + L4466-4477 (brands grid) 답습.
 *
 * - 1위 카드: __num/__avatar/__name/__meta/__amt 부분 patch (inline onclick 보존+이름 갱신)
 * - 헤드라인 strong: '4월에는 <strong>{name}</strong>에 많이 쓰고 있어요'
 * - 2~N위 그리드 (.exp-rank-grid): innerHTML 통째 갈아치움 (각 카드 inline onclick 포함, 최대 6개)
 * - rows.length === 0 → no-op (mocks fixture 보존)
 * - 가맹점 후보 0건 (모든 rows merchant/brand 없음) → no-op (fixture 보존)
 */
export function patchRankSectionFromRows(rows, doc = document) {
  if (!rows || !rows.length) return false;
  const section = doc.querySelector('.exp-rank-section');
  if (!section) return false;
  const { topBrand, brands } = rankMerchantsByMonth(rows);
  if (!topBrand) return false;
  const rank1 = section.querySelector('.exp-rank-1');
  if (rank1) {
    const numEl = rank1.querySelector('.exp-rank-1__num');
    const avatarEl = rank1.querySelector('.exp-rank-1__avatar');
    const nameEl = rank1.querySelector('.exp-rank-1__name');
    const metaEl = rank1.querySelector('.exp-rank-1__meta');
    const amtEl = rank1.querySelector('.exp-rank-1__amt');
    if (numEl) numEl.textContent = '1';
    if (avatarEl) avatarEl.textContent = topBrand.initial;
    if (nameEl) nameEl.textContent = topBrand.name;
    if (metaEl) metaEl.textContent = `${topBrand.count}건 · ${topBrand.share}%`;
    if (amtEl) amtEl.textContent = formatManwon(topBrand.amount);
    rank1.setAttribute('onclick', `openMerchantDetail('${escapeAttr(topBrand.name)}', event)`);
  }
  const headStrong = section.querySelector('.exp-headline-title strong');
  if (headStrong) headStrong.textContent = topBrand.name;
  const grid = section.querySelector('.exp-rank-grid');
  if (grid) {
    // 2026-05-04 — chip 영문 enum (etc/delivery/dining/...) → 한글 라벨 변환 (Classifier).
    const gridHtml = brands.slice(0, 6).map((b) => `<div class="exp-rank-card" onclick="openMerchantDetail('${escapeAttr(b.name)}', event)"><span class="exp-rank-card__num">${b.rank}</span><span class="exp-rank-card__chip">${escapeHtml(toCategoryLabel(b.cat))}</span><div class="exp-rank-card__main"><span class="exp-rank-card__name">${escapeHtml(b.name)}</span><span class="exp-rank-card__amt">${formatManwon(b.amount)}</span></div></div>`).join('');
    grid.innerHTML = gridHtml;
  }
  return true;
}

// ───────────────────────────────────────────────────────────────────────────
// 카테고리 active 감지 + 통합 patch
// ───────────────────────────────────────────────────────────────────────────

function observeCategoryChange(cb) {
  _onCategoryChange = cb;
  if (_categoryObserver) _categoryObserver.disconnect();
  const items = document.querySelectorAll('.sb__item[data-category]');
  if (!items.length) return;
  _categoryObserver = new MutationObserver((muts) => {
    for (const m of muts) {
      if (m.type !== 'attributes' || m.attributeName !== 'class') continue;
      const el = m.target;
      if (el.classList.contains('sb__item--active')) {
        cb(el.dataset.category);
      }
    }
  });
  items.forEach((el) => _categoryObserver.observe(el, { attributes: true }));
  const initial = document.querySelector('.sb__item[data-category].sb__item--active');
  if (initial) cb(initial.dataset.category);
}

/**
 * 0건 시 mocks fixture 데이터(tx-XX 더미)를 화면에서 비운다 — Keep import 후 정책.
 * 헤드라인 0원 / 캘린더 amount 비우기 + is-zero 적용 / 타임라인 비우기 / Recents 비우기.
 * mocks 의 inline onclick 등 구조 자체는 유지 (사용자 클릭 시 빈 popover).
 */
export function clearExpensesFixture(doc = document) {
  if (!doc) return false;
  // 헤드라인 — 월 총액 0원 / 일평균 0원
  const title = doc.querySelector('.exp-headline-title strong');
  if (title) title.textContent = '0';
  const sub = doc.querySelector('.exp-headline-sub strong');
  if (sub) sub.textContent = '0';
  // 캘린더 일별 합계 비우기
  const cells = doc.querySelectorAll('.exp-month-day[data-date]');
  cells.forEach((cell) => {
    const amtEl = cell.querySelector('.exp-month-day-amount');
    if (amtEl) {
      amtEl.textContent = '';
      amtEl.classList.remove('high');
    }
    const isToday = cell.classList.contains('today');
    cell.classList.toggle('is-zero', !isToday);
  });
  // 타임라인 비우기
  const tl = doc.querySelector('.exp-tl-list');
  if (tl) tl.innerHTML = '<div class="exp-tl-empty" style="padding:32px;text-align:center;color:var(--ink-4,#b5ad9e);font-size:14px;">이 달의 거래가 없습니다.</div>';
  // Recents 비우기 (사이드바)
  const list = doc.getElementById('recentsList');
  if (list) list.innerHTML = '';
  return true;
}

/**
 * 캘린더 grid (`.exp-month-grid`) 의 일자 cell 통째 재빌드 + nav-label 갱신.
 * mocks today-mac.html L4615-4647 패턴 답습 — dow-row 는 정적이라 보존.
 * - 미래 월 차단: nextDisabled 토글 (현재 시스템 월 도달 시 다음 달 버튼 비활성)
 * - amount 비움 (renderTimelineFromRows / patchCalendarFromRows 가 후속 채움)
 * 2026-05-04 — N2 (가계부 month-change 미동작) 해소.
 */
export function rebuildCalendarGrid(year, month, doc = document) {
  const grid = doc.querySelector('.exp-month-grid');
  if (!grid) return false;
  const firstDow = new Date(year, month - 1, 1).getDay();
  const daysInMonth = new Date(year, month, 0).getDate();
  const cells = [];
  for (let i = 0; i < firstDow; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);
  while (cells.length % 7 !== 0) cells.push(null);
  const now = new Date();
  const isCurrentMonth = year === now.getFullYear() && month === now.getMonth() + 1;
  const todayDay = isCurrentMonth ? now.getDate() : -1;
  const mm = String(month).padStart(2, '0');
  const calCells = cells.map((d) => {
    if (d === null) return '<div class="exp-month-day empty"></div>';
    const ds = `${mm}-${String(d).padStart(2, '0')}`;
    const cls = ['exp-month-day'];
    if (d === todayDay) cls.push('today');
    return `<div class="${cls.join(' ')}" data-date="${ds}"><div class="exp-month-day-num">${d}</div><div class="exp-month-day-amount"></div></div>`;
  }).join('');
  // dow-row 보존 후 cells 갈아치움
  const dowRow = grid.querySelector('.exp-month-dow-row');
  grid.innerHTML = '';
  if (dowRow) grid.appendChild(dowRow);
  const tmp = doc.createElement('div');
  tmp.innerHTML = calCells;
  while (tmp.firstChild) grid.appendChild(tmp.firstChild);
  // nav-label
  const label = doc.querySelector('.exp-month-nav-label');
  if (label) label.textContent = `${year}년 ${month}월`;
  // nextDisabled 토글 — mocks L4626 정합
  const sysYM = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  const currentYM = `${year}-${mm}`;
  const nextDisabled = currentYM >= sysYM;
  const navBtns = doc.querySelectorAll('.exp-month-nav-btn');
  navBtns.forEach((btn) => {
    const aria = btn.getAttribute('aria-label') || '';
    if (aria.includes('다음')) {
      btn.classList.toggle('is-disabled', nextDisabled);
      if (nextDisabled) btn.setAttribute('disabled', '');
      else btn.removeAttribute('disabled');
    }
  });
  return true;
}

/**
 * 통계 탭 — 월별 추이 막대 차트 (.exp-bar-chart) 동적 갱신.
 * 최근 6개월 (현재 월 포함) sumExpensesMonth 6번 호출 → mocks 정적 monthlyTrend fixture 갈아치움.
 * 2026-05-04 — N (월별 추이 5월 미업데이트) 해소.
 */
export async function patchMonthlyTrendChart(year, month, doc = document) {
  const chart = doc.querySelector('.exp-bar-chart');
  if (!chart) return false;
  const months = [];
  for (let i = 5; i >= 0; i--) {
    let m = month - i;
    let y = year;
    while (m < 1) { m += 12; y -= 1; }
    months.push({ year: y, month: m });
  }
  const totals = [];
  for (const { year: y, month: m } of months) {
    try {
      const t = await Queries.sumExpensesMonth(y, m);
      totals.push(t || 0);
    } catch {
      totals.push(0);
    }
  }
  const max = Math.max(...totals, 1);
  const html = months.map((mo, i) => {
    const total = totals[i];
    const pct = Math.max(8, Math.round((total / max) * 100));
    const isCurrent = mo.year === year && mo.month === month;
    const manwon = Math.round(total / 10000);
    return `<div class="exp-bar ${isCurrent ? 'is-current' : ''}"><div class="exp-bar__col"><div class="exp-bar__fill" style="height:${pct}%"></div></div><div class="exp-bar__amount">${manwon}만</div><div class="exp-bar__label">${mo.month}월</div></div>`;
  }).join('');
  chart.innerHTML = html;
  return true;
}

/**
 * 통계 탭 — 누적 헤드라인 + 누적 브랜드 TOP 10 동적 갱신.
 * 최근 6개월 (현재 월 포함) listExpensesByMonth 6번 → 가맹점별 합산 → top 10 row 갈음.
 * 누적 헤드라인 (`2026년 M월 D일까지 총 X만원`) 도 같이 갱신.
 * 2026-05-04 — N (누적 브랜드 TOP 10 미업데이트) 해소.
 */
export async function patchCumulativeFromHistory(year, month, doc = document) {
  const cumWrap = doc.querySelector('.exp-cumulative');
  if (!cumWrap) return false;
  const rankWrap = cumWrap.querySelector('.exp-cumulative-rank');
  const headTitle = cumWrap.querySelector(':scope > .exp-headline-title');
  const headSub = cumWrap.querySelector(':scope > .exp-headline-sub');
  // 2026-05-12 — 데이터 범위를 'year-to-date' 로 변경.
  // 헤드라인이 "YYYY년 M월 D일까지" 라고 표시되는데 실 합산이 최근 6개월 (이전 해 일부 포함)
  // 이라 사용자 인지 ("올해 누적") 와 모순. year-to-date 로 정합.
  const months = [];
  for (let m = 1; m <= month; m++) {
    months.push({ year, month: m });
  }
  let allRows = [];
  for (const { year: y, month: m } of months) {
    try {
      const rs = await Queries.listExpensesByMonth(y, m);
      allRows = allRows.concat(rs || []);
    } catch { /* skip */ }
  }
  const groups = new Map();
  const catTotals = new Map();
  let total = 0;
  for (const r of allRows) {
    const amt = r.amount_krw || 0;
    total += amt;
    // brand TOP 10 집계
    const name = r.brand || r.merchant;
    if (name) groups.set(name, (groups.get(name) || 0) + amt);
    // 카테고리 누적 집계 (treemap 용) — toCategoryLabel 이 사용자 picker 외 id/null 을
    // '기타' 로 통합 처리 (2026-05-12). 별도 fallback 불필요.
    const catLabel = toCategoryLabel(r.category);
    catTotals.set(catLabel, (catTotals.get(catLabel) || 0) + amt);
  }
  // 헤드라인 갱신
  const today = new Date();
  const isCurrent = today.getFullYear() === year && today.getMonth() + 1 === month;
  const dayLabel = isCurrent ? today.getDate() : new Date(year, month, 0).getDate();
  if (headTitle) headTitle.innerHTML = `${year}년 ${month}월 ${dayLabel}일까지 총 <strong>${Math.round(total / 10000)}만원</strong> 쓰고 있어요`;
  // 2026-05-12 — sub 텍스트 제거 (헤드라인 자체가 이미 'YYYY년' 시간 범위를 표시).
  if (headSub) headSub.textContent = '';
  // 누적 brand TOP 10
  if (rankWrap) {
    const sorted = [...groups.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10);
    const subEl = rankWrap.querySelector('.exp-headline-sub');
    const rowsHtml = sorted.map(([name, amount], idx) => `<div class="exp-cumulative-rank__row" onclick="openMerchantDetail('${escapeAttr(name)}', event)"><span class="exp-cumulative-rank__num">${idx + 1}</span><span class="exp-cumulative-rank__chip">${escapeHtml(name.slice(0, 1))}</span><span class="exp-cumulative-rank__name">${escapeHtml(name)}</span><span class="exp-cumulative-rank__amt">${formatManwon(amount)}</span></div>`).join('');
    rankWrap.innerHTML = '';
    if (subEl) rankWrap.appendChild(subEl);
    else {
      const newSub = doc.createElement('div');
      newSub.className = 'exp-headline-sub';
      newSub.style.cssText = 'margin-top:32px;margin-bottom:8px;';
      newSub.textContent = '누적 브랜드 TOP 10';
      rankWrap.appendChild(newSub);
    }
    const tmp = doc.createElement('div');
    tmp.innerHTML = rowsHtml;
    while (tmp.firstChild) rankWrap.appendChild(tmp.firstChild);
  }
  // 카테고리 treemap 갱신 (.exp-treemap-section) — mocks fixture (주거 등 가짜 항목) 덮어쓰기.
  // _categoryExpanded 상태는 mocks IIFE local — DOM 의 .exp-cat-row 개수로 추론 (>5 = expanded).
  const treemapSection = cumWrap.querySelector('.exp-treemap-section');
  if (treemapSection && catTotals.size > 0) {
    const items = [...catTotals.entries()]
      .map(([key, amount]) => ({ key, amount }))
      .sort((a, b) => b.amount - a.amount);
    const max = items[0].amount;
    const existingRows = treemapSection.querySelectorAll('.exp-cat-row').length;
    const isExpanded = existingRows > 5;
    const visibleCount = isExpanded ? items.length : Math.min(5, items.length);
    const visible = items.slice(0, visibleCount);
    const hiddenCount = items.length - visibleCount;
    const catRowsHtml = visible.map((it, idx) => {
      const pct = max > 0 ? Math.round((it.amount / max) * 100) : 0;
      const amountText = Math.round(it.amount / 10000) + '만';
      const isTop = idx === 0;
      return `<div class="exp-cat-row${isTop ? ' is-top' : ''}" data-cat="${escapeAttr(it.key)}" onclick="openCategoryDetail('${escapeAttr(it.key)}', event)"><span class="exp-cat-row__label">${escapeHtml(it.key)}</span><div class="exp-cat-row__track"><div class="exp-cat-row__fill" style="width:${pct}%;"></div></div><span class="exp-cat-row__amt">${amountText}</span></div>`;
    }).join('');
    let catMoreHtml = '';
    if (hiddenCount > 0) {
      catMoreHtml = `<button class="exp-cat-more" onclick="toggleCategoryMore(event)">+ ${hiddenCount}개 더 보기</button>`;
    } else if (isExpanded && items.length > 5) {
      catMoreHtml = `<button class="exp-cat-more" onclick="toggleCategoryMore(event)">접기</button>`;
    }
    // 기존 .exp-cat-list + .exp-cat-more 제거 후 새로 추가 ('exp-headline-sub' 헤더는 보존).
    treemapSection.querySelectorAll('.exp-cat-list, .exp-cat-more').forEach((el) => el.remove());
    const catTmp = doc.createElement('div');
    catTmp.innerHTML = `<div class="exp-cat-list">${catRowsHtml}</div>${catMoreHtml}`;
    while (catTmp.firstChild) treemapSection.appendChild(catTmp.firstChild);
  }
  return true;
}

/** 지정 월 (year, month) 의 expense 데이터를 로드 + 캘린더/헤드라인/타임라인/랭킹 patch. */
export async function loadAndRenderMonth(year, month, doc = document) {
  const monthKey = `${year}-${String(month).padStart(2, '0')}`;
  _activeMonthKey = monthKey;
  rebuildCalendarGrid(year, month, doc);
  try {
    const rows = await Queries.listExpensesByMonth(year, month);
    if (_activeMonthKey !== monthKey) return; // race
    console.info(`[expenses] year=${year} month=${month} count=${rows.length}`);
    const now = new Date();
    const isCurrentMonth = year === now.getFullYear() && month === now.getMonth() + 1;
    const todayDay = isCurrentMonth ? now.getDate() : 0;
    if (!rows.length) {
      // 2026-05-04 정책 — Keep import 후 mocks fixture (tx-XX 더미) 표시 차단.
      clearExpensesFixture(doc);
      return;
    }
    renderExpenseRecentsFromRows(rows);
    patchHeadlineFromRows(rows, { todayDay });
    patchCalendarFromRows(rows, { todayDay });
    renderTimelineFromRows(rows, { todayDay }, doc, year);
    patchRankSectionFromRows(rows, doc);
    // 통계 탭 — 월별 추이 + 누적 brand TOP 10 (panel hidden 상태에서도 갱신해서 stats 클릭 시 즉시 반영)
    await patchMonthlyTrendChart(year, month, doc);
    await patchCumulativeFromHistory(year, month, doc);
  } catch (e) {
    console.warn('[expenses] loadAndRenderMonth 실패', e?.message || e);
  }
}

/**
 * `.exp-mini-tab[data-tab="stats"]` 클릭 시 — 현재 month 기준 stats panel 강제 재갱신.
 * 보강 — handleCategoryActive 의 patch 가 race / 진입 누락된 경우의 안전망.
 * 2026-05-04 — 1-1 (히어로 카드 mocks fixture 그대로) 해소.
 */
let _statsTabBound = false;
function bindStatsTabHandler() {
  if (_statsTabBound) return;
  if (typeof document === 'undefined') return;
  _statsTabBound = true;
  document.addEventListener('click', async (e) => {
    const btn = e.target?.closest?.('.exp-mini-tab[data-tab="stats"]');
    if (!btn) return;
    // mocks setExpTab 가 panel show/hide. SPA 가 추가로 stats panel 데이터 강제 patch.
    const label = document.querySelector('.exp-month-nav-label');
    const m = label?.textContent?.match(/(\d{4})년\s*(\d{1,2})월/);
    const now = new Date();
    const year = m ? Number(m[1]) : now.getFullYear();
    const month = m ? Number(m[2]) : now.getMonth() + 1;
    try {
      const rows = await Queries.listExpensesByMonth(year, month);
      if (rows && rows.length) patchRankSectionFromRows(rows, document);
      await patchMonthlyTrendChart(year, month, document);
      await patchCumulativeFromHistory(year, month, document);
    } catch (err) {
      console.warn('[expenses] stats tab patch 실패', err?.message || err);
    }
  }, true); // capture — mocks setExpTab 보다 먼저 또는 동등
}

/** expense 카테고리 진입 시 — 현재 월 로드. */
async function handleCategoryActive(kind) {
  if (kind !== 'expense') return;
  // mocks renderExpense 가 동기로 view.innerHTML 갈아치움 → microtask 후 patch
  await new Promise((r) => setTimeout(r, 0));
  const now = new Date();
  await loadAndRenderMonth(now.getFullYear(), now.getMonth() + 1, document);
}

/**
 * 가계부 사이드바 클릭 위임 — 매 클릭마다 patch 재실행.
 *
 * MutationObserver (observeCategoryChange) 는 `is-active` class 변경 시에만 발화한다.
 * 이미 active 인 가계부를 재클릭하면 mocks `setCategory('expense')` 가 renderExpense() 로
 * fixture HTML 을 다시 그리지만 class 무변경 → observer 무발화 → SPA patch 미발동 →
 * fixture 가 화면에 그대로 노출되는 race 가 있다. 본 핸들러가 그 race 를 메운다.
 * (entries.js installCategoryClickHandler 는 entries.handleCategoryActive 를 호출하는데
 *  거기서 expense 는 early return 이라 patch 미실행.)
 */
let _expenseClickInstalled = false;
function installExpenseCategoryClickHandler() {
  if (_expenseClickInstalled) return;
  if (typeof document === 'undefined') return;
  _expenseClickInstalled = true;
  // (1) 사이드바 가계부 클릭 — bubble 단계 OK.
  document.addEventListener('click', (e) => {
    const item = e.target?.closest?.('.sb__item[data-category="expense"]');
    if (!item) return;
    // mocks setCategory → renderExpense 가 동기로 발동 → 그 뒤 task 에서 patch 강제 재실행.
    setTimeout(() => {
      handleCategoryActive('expense').catch((err) =>
        console.warn('[expenses] category re-click patch 실패:', err?.message || err),
      );
    }, 0);
  });
  // (2) 카테고리 treemap "접기 / + N개 더 보기" 클릭 — mocks toggleCategoryMore 가
  //     renderExpense() 전체를 재호출해 SPA patch 가 fixture 로 회귀하는 race 메움.
  //     toggleCategoryMore 가 event.stopPropagation() 하므로 capture 단계로 청취.
  document.addEventListener('click', (e) => {
    const more = e.target?.closest?.('.exp-cat-more');
    if (!more) return;
    // 1) capture 단계 — 본 핸들러 먼저 발화
    // 2) 그 뒤 inline onclick toggleCategoryMore → _categoryExpanded 토글 + renderExpense (동기)
    // 3) setTimeout(0) 콜백 — 새로 그려진 fixture 위에 patch 재실행
    setTimeout(() => {
      handleCategoryActive('expense').catch((err) =>
        console.warn('[expenses] cat-more re-render patch 실패:', err?.message || err),
      );
    }, 0);
  }, true);
}

/**
 * `.exp-month-nav-btn` 클릭 → 이전/다음 달 전환. document delegation.
 * label 텍스트 (`YYYY년 M월`) 파싱으로 현재 월 추적 (state 보존 X — DOM single source).
 * 2026-05-04 — N2 해소.
 */
let _expMonthNavBound = false;
function bindMonthNavHandlers() {
  if (_expMonthNavBound) return;
  if (typeof document === 'undefined') return;
  _expMonthNavBound = true;
  document.addEventListener('click', (e) => {
    const btn = e.target?.closest?.('.exp-month-nav-btn');
    if (!btn) return;
    if (btn.disabled || btn.classList.contains('is-disabled')) return;
    const label = document.querySelector('.exp-month-nav-label');
    if (!label) return;
    const m = label.textContent?.match(/(\d{4})년\s*(\d{1,2})월/);
    if (!m) return;
    let year = Number(m[1]);
    let month = Number(m[2]);
    const aria = btn.getAttribute('aria-label') || '';
    if (aria.includes('이전')) {
      month -= 1;
      if (month < 1) { month = 12; year -= 1; }
    } else if (aria.includes('다음')) {
      const now = new Date();
      if (year > now.getFullYear() || (year === now.getFullYear() && month >= now.getMonth() + 1)) return;
      month += 1;
      if (month > 12) { month = 1; year += 1; }
    } else {
      return;
    }
    e.preventDefault();
    e.stopPropagation();
    loadAndRenderMonth(year, month, document);
  }, true); // capture — mocks 혹시 모를 핸들러 차단
}

// ───────────────────────────────────────────────────────────────────────────
// Wave 11.6.4b — 편집 모달 (spec §13 L479-491)
// mocks 의 window.openExpenseModal / saveExpenseFromModal / deleteExpenseFromModal monkey-patch.
// 폼 데이터 추출 → Dexie CRUD → 카테고리 view 재패치.
// ───────────────────────────────────────────────────────────────────────────

const EXPENSE_MODAL_FIELDS = ['expModalAmount', 'expModalDatetime', 'expModalMerchant', 'expModalCard', 'expModalMemo', 'expModalUrl'];

/** datetime-local 'YYYY-MM-DDTHH:mm' → ISO (로컬 시간대 기준). 빈 입력 시 null. */
export function datetimeLocalToIso(s) {
  if (!s || typeof s !== 'string') return null;
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString();
}

/** ISO → datetime-local string (사용자 로컬 시간대 기준 'YYYY-MM-DDTHH:mm'). */
export function isoToDatetimeLocal(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const yy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  const hh = String(d.getHours()).padStart(2, '0');
  const mn = String(d.getMinutes()).padStart(2, '0');
  return `${yy}-${mm}-${dd}T${hh}:${mn}`;
}

/** mocks 모달 폼에서 expense 데이터 추출 (DOM 의존). */
export function extractExpenseFromForm(doc = document) {
  const get = (id) => doc.getElementById(id);
  const amountStr = get('expModalAmount')?.value || '';
  const amount_krw = parseInt(String(amountStr).replace(/[^\d]/g, ''), 10) || 0;
  const dtVal = get('expModalDatetime')?.value || '';
  const spent_at = datetimeLocalToIso(dtVal);
  const merchant = (get('expModalMerchant')?.value || '').trim();
  const card = (get('expModalCard')?.value || '').trim();
  const memo = (get('expModalMemo')?.value || '').trim();
  const merchant_url = (get('expModalUrl')?.value || '').trim();
  const catEl = doc.querySelector('#expModalCatGrid .exp-cat-cell.is-active');
  const category = catEl?.getAttribute('data-cat') || null;
  return {
    amount_krw,
    spent_at,
    merchant: merchant || null,
    card: card || null,
    memo: memo || null,
    merchant_url: merchant_url || null,
    category,
  };
}

/** Dexie row → 모달 폼 채우기 (수정 모드 진입 시). */
export function populateExpenseForm(row, doc = document) {
  if (!row) return false;
  const set = (id, v) => { const el = doc.getElementById(id); if (el) el.value = v; };
  set('expModalAmount', (row.amount_krw || 0).toLocaleString('ko-KR'));
  set('expModalDatetime', isoToDatetimeLocal(row.spent_at));
  set('expModalMerchant', row.merchant || row.brand || '');
  set('expModalCard', row.card || '');
  set('expModalMemo', row.memo || '');
  set('expModalUrl', row.merchant_url || '');
  // 카테고리 활성화 — 그리드 .is-active toggle (mocks 패턴 답습)
  doc.querySelectorAll('#expModalCatGrid .exp-cat-cell').forEach((c) => c.classList.remove('is-active'));
  if (row.category) {
    const cell = doc.querySelector(`#expModalCatGrid .exp-cat-cell[data-cat="${row.category}"]`);
    if (cell) cell.classList.add('is-active');
  }
  // 카드 라벨 (mocks 의 expModalCardLabel 동기화)
  const cardLabel = doc.getElementById('expModalCardLabel');
  if (cardLabel) cardLabel.textContent = row.card || '선택 안 함';
  // 일시 텍스트 (mocks 의 expModalDtText)
  const dtText = doc.getElementById('expModalDtText');
  if (dtText && row.spent_at) {
    const d = new Date(row.spent_at);
    if (!Number.isNaN(d.getTime())) {
      const m = d.getMonth() + 1;
      const dd = d.getDate();
      const hh = String(d.getHours()).padStart(2, '0');
      const mn = String(d.getMinutes()).padStart(2, '0');
      dtText.textContent = `${m}월 ${dd}일 ${hh}:${mn}`;
    }
  }
  return true;
}

/** 폼 데이터 검증. 누락 필드명 배열 반환 (빈 배열 = OK). */
export function validateExpenseForm(data) {
  const missing = [];
  if (!data.amount_krw || data.amount_krw <= 0) missing.push('amount');
  if (!data.spent_at) missing.push('datetime');
  if (!data.merchant) missing.push('merchant');
  if (!data.category) missing.push('category');
  return missing;
}

/** 모달 저장 — new = createExpenseWithAutoMatch / edit = updateExpense (수정 가능 필드만). */
export async function saveExpenseFromForm(opts = {}, doc = document) {
  if (!_currentUser?.id) return { ok: false, reason: 'no_user' };
  const data = extractExpenseFromForm(doc);
  const missing = validateExpenseForm(data);
  if (missing.length) return { ok: false, reason: 'validation', missing };
  const mode = opts.mode || 'new';
  const editId = opts.editId || null;
  try {
    if (mode === 'edit' && editId) {
      // spec L491 — 수정 모드: category / memo / merchant_url 만 변경 (4필드 read-only)
      const row = await Queries.updateExpense(editId, {
        category: data.category,
        memo: data.memo,
        merchant_url: data.merchant_url,
      });
      // 학습: 사용자가 카테고리 수동 변경 시 user-scope 룰 upsert →
      //       이후 같은 가맹점 SMS 가 들어오면 동일 카테고리 자동 적용
      try {
        if (data.category && row?.merchant_raw && _currentUser?.id) {
          await Queries.upsertUserMerchantRule(
            row.merchant_raw,
            { brand: row.brand ?? null, category: data.category },
            _currentUser.id,
          );
        }
      } catch (ruleErr) {
        console.warn('[expenses] user-rule upsert 실패 (무시)', ruleErr?.message || ruleErr);
      }
      refreshSidebarExpenseTotal(doc);
      return { ok: true, mode: 'edit', row };
    }
    // new — auto-match merchant_rules 적용
    const row = await Queries.createExpenseWithAutoMatch({
      owner_id: _currentUser.id,
      spent_at: data.spent_at,
      amount_krw: data.amount_krw,
      merchant: data.merchant,
      merchant_raw: data.merchant,
      card: data.card,
      memo: data.memo,
      merchant_url: data.merchant_url,
      category: data.category,
      source: 'manual',
    });
    refreshSidebarExpenseTotal(doc);
    return { ok: true, mode: 'new', row };
  } catch (e) {
    console.warn('[expenses] saveExpenseFromForm 실패', e?.message || e);
    return { ok: false, reason: 'error', error: e };
  }
}

/** 모달 삭제 — softDeleteExpense. */
export async function deleteExpenseFromForm(editId) {
  if (!editId) return { ok: false, reason: 'no_id' };
  try {
    const row = await Queries.softDeleteExpense(editId);
    refreshSidebarExpenseTotal();
    return { ok: true, row };
  } catch (e) {
    console.warn('[expenses] deleteExpenseFromForm 실패', e?.message || e);
    return { ok: false, reason: 'error', error: e };
  }
}

// monkey-patch state — 같은 모달 세션 안에서 mode/editId 추적 (mocks 의 _expModalEditId 와 별도 SPA scope)
let _spaModalMode = 'new';
let _spaModalEditId = null;
let _modalPatched = false;

/** mocks 의 closeExpenseModal 함수 호출 (있으면 — 모달 overlay 닫기 + reset). */
function callMocksClose(doc = document) {
  if (typeof window === 'undefined') return;
  // 우선 _doCloseExpenseModal (dirty 검사 우회) → 없으면 closeExpenseModal
  if (typeof window._doCloseExpenseModal === 'function') {
    window._doCloseExpenseModal();
    return;
  }
  // fallback — overlay 직접 닫기
  const overlay = doc.getElementById('expModalOverlay');
  if (overlay) {
    overlay.classList.remove('is-open');
    overlay.setAttribute('aria-hidden', 'true');
  }
}

/** 카테고리 view 재패치 — save/delete 후 헤드라인/캘린더/타임라인/Recents 갱신. */
async function refreshExpenseView() {
  await handleCategoryActive('expense');
}

/**
 * mocks `window.openExpenseModal` / `saveExpenseFromModal` / `deleteExpenseFromModal` monkey-patch.
 * mocks 의 _resetExpModal / _setExpModalDt / pickExpCard 등 헬퍼는 그대로 호출.
 */
export function patchExpenseModalHandlers() {
  if (typeof window === 'undefined') return;
  if (_modalPatched) return;
  _modalPatched = true;

  // openExpenseModal — Dexie row 기반 edit 진입 (new 는 mocks 원본 호출)
  const origOpen = window.openExpenseModal;
  window.openExpenseModal = async function patchedOpen(mode = 'new', txId = null) {
    _spaModalMode = mode;
    _spaModalEditId = txId;
    if (mode === 'new' || !txId) {
      if (typeof origOpen === 'function') return origOpen.call(this, mode, txId);
      return;
    }
    // edit — Dexie 에서 row 가져오기
    let row = null;
    try {
      row = await Queries.getExpense(txId);
    } catch (e) {
      console.warn('[expenses] getExpense 실패', e?.message || e);
    }
    if (!row) {
      // Dexie miss — mocks fixture 일 수도 있으므로 원본 호출 (mocks FIXTURE.txns find)
      if (typeof origOpen === 'function') return origOpen.call(this, mode, txId);
      return;
    }
    // mocks 의 _resetExpModal + 모달 열기 흐름 답습
    // 1) reset (있으면)
    if (typeof window._resetExpModal === 'function') window._resetExpModal();
    // 2) 폼 채우기
    populateExpenseForm(row);
    // 3) 제목 / 휴지통 / read-only / overlay open
    const title = document.getElementById('expModalTitle');
    if (title) title.textContent = '지출 수정';
    const dBtn = document.getElementById('expModalDeleteBtn');
    if (dBtn) dBtn.style.display = '';
    // Wave 11.6.5 — read-only 정책 변경: category 는 변경 가능 (사용자 결정 + spec §13 line 487 정합)
    ['amount', 'datetime', 'merchant', 'card'].forEach((name) => {
      const f = document.querySelector(`#expModalOverlay .exp-field[data-field="${name}"]`);
      if (f) f.classList.add('is-readonly');
    });
    const overlay = document.getElementById('expModalOverlay');
    if (overlay) {
      overlay.classList.add('is-open');
      overlay.setAttribute('aria-hidden', 'false');
    }
  };

  // saveExpenseFromModal — Dexie create / update
  window.saveExpenseFromModal = async function patchedSave() {
    const result = await saveExpenseFromForm({ mode: _spaModalMode, editId: _spaModalEditId });
    if (!result.ok) {
      if (result.reason === 'validation') {
        const labels = { amount: '금액', datetime: '일시', merchant: '지출처', category: '카테고리' };
        const first = result.missing[0];
        if (typeof window.alert === 'function') {
          window.alert(`${labels[first] || first}을(를) 입력해주세요.`);
        }
      }
      return result;
    }
    callMocksClose();
    await refreshExpenseView();
    return result;
  };

  // deleteExpenseFromModal — Dexie softDelete
  window.deleteExpenseFromModal = async function patchedDelete() {
    if (!_spaModalEditId) return { ok: false, reason: 'no_id' };
    const result = await deleteExpenseFromForm(_spaModalEditId);
    if (!result.ok) return result;
    callMocksClose();
    await refreshExpenseView();
    return result;
  };
}

// ───────────────────────────────────────────────────────────────────────────
// Wave 11.6.3.2 — 일자 popover monkey-patch (Dexie 기반)
// ───────────────────────────────────────────────────────────────────────────

const REPEAT_SVG = '<svg class="exp-row__recurring" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.25" stroke-linecap="round" stroke-linejoin="round"><path d="M4 6L2 8l2 2"/><path d="M2 8h11V5"/><path d="M12 12l2-2-2-2"/><path d="M14 10H3v3"/></svg>';
const DEFAULT_CARD_LABEL = '삼성카드 & MILEAGE PLATINUM';

/** Dexie row → mocks .exp-popover-row HTML. Wave 11.6.8b — onclick inline backup (capture listener fail 시 보호). */
export function rowToPopoverHtml(row, opts = {}) {
  const merchant = row?.merchant || row?.memo || '';
  const card = row?.card || opts.defaultCard || DEFAULT_CARD_LABEL;
  const category = row?.category || '';
  const id = row?.id || '';
  const recurring = row?.recurring ? REPEAT_SVG : '';
  const idAttr = escapeAttr(id);
  const onclick = id ? ` onclick="window.openExpenseModal && window.openExpenseModal('edit', '${idAttr}')"` : '';
  return `<div class="exp-popover-row" data-tx-id="${idAttr}"${onclick}><span class="exp-popover-row__cat">${escapeHtml(category)}</span><span class="exp-popover-row__merchant">${escapeHtml(merchant)}</span><span class="exp-popover-row__card">${escapeHtml(card)}${recurring}</span><span class="exp-popover-row__amount">${formatAmount(row?.amount_krw || 0)}</span></div>`;
}

/** 'MM-DD' → 'YYYY-MM-DD' (_activeMonthKey year 또는 현재 year). null/형식 mismatch → null. */
export function monthDayToIsoDate(monthDay) {
  if (!monthDay || !/^\d{2}-\d{2}$/.test(monthDay)) return null;
  let year = String(new Date().getFullYear());
  if (_activeMonthKey && /^\d{4}-\d{2}$/.test(_activeMonthKey)) {
    year = _activeMonthKey.slice(0, 4);
  }
  return `${year}-${monthDay}`;
}

/** 'MM-DD' → '일'/'월'/.../'토'. (year 는 monthDayToIsoDate 와 동일 결정.) */
export function dayOfWeekFromMonthDay(monthDay) {
  const iso = monthDayToIsoDate(monthDay);
  if (!iso) return '';
  const [y, m, d] = iso.split('-').map(Number);
  const dow = new Date(y, m - 1, d).getDay();
  return ['일','월','화','수','목','금','토'][dow] || '';
}

/**
 * popover DOM 패치 — date / list / foot. 1건 이하 시 foot 숨김 (mocks 와 동일 룰).
 * rows.length === 0 시 empty 메시지 (mocks FIXTURE fallback 안 함 — 시안 데이터 노출 방지).
 */
export function patchDayPopoverFromRows({ monthDay, rows = [], doc = (typeof document !== 'undefined' ? document : null), defaultCard = DEFAULT_CARD_LABEL } = {}) {
  if (!doc || !monthDay) return { applied: false, reason: !doc ? 'no_doc' : 'no_date' };
  const popover = doc.getElementById('expDayPopover');
  if (!popover) return { applied: false, reason: 'no_popover' };

  const [m, d] = monthDay.split('-').map(Number);
  const dowName = dayOfWeekFromMonthDay(monthDay);
  popover.querySelector('.exp-day-detail__date').textContent = `${m}월 ${d}일 ${dowName}요일`;

  const list = popover.querySelector('.expense-list');
  if (rows.length === 0) {
    // Wave 11.6.5 — 빈 상태 메시지 보강 + 거래 추가 빠른 진입
    list.innerHTML = `
      <div class="exp-day-detail__empty">
        <p>이 날의 거래가 없습니다.</p>
        <p class="exp-day-detail__empty-sub">SMS 연동 또는 거래 직접 추가로 데이터를 채워주세요.</p>
        <button class="exp-day-detail__empty-btn" type="button" onclick="window.openNewExpenseForm && window.openNewExpenseForm()">거래 추가</button>
      </div>
    `;
  } else {
    list.innerHTML = rows.map((r) => rowToPopoverHtml(r, { defaultCard })).join('');
  }

  const foot = popover.querySelector('.exp-day-detail__foot');
  if (foot) {
    if (rows.length > 1) {
      foot.style.display = '';
      const sum = rows.reduce((s, r) => s + (r.amount_krw || 0), 0);
      foot.querySelector('.exp-day-detail__foot-count').textContent = `${rows.length}건`;
      foot.querySelector('.exp-day-detail__foot-sum').innerHTML = formatAmount(sum);
    } else {
      foot.style.display = 'none';
    }
  }

  return { applied: true, count: rows.length };
}

let _popoverPatched = false;

/** mocks `window.openExpDayPopover` monkey-patch — Dexie 데이터로 popover. */
export function patchDayPopoverHandlers({ doc = (typeof document !== 'undefined' ? document : null), win = (typeof window !== 'undefined' ? window : null) } = {}) {
  if (!win) return;
  if (_popoverPatched) return;
  _popoverPatched = true;

  const origOpen = win.openExpDayPopover;
  win.openExpDayPopover = async function patchedOpenDay(cellEl) {
    if (!_currentUser?.id) {
      if (typeof origOpen === 'function') return origOpen.call(this, cellEl);
      return;
    }
    // Wave 11.6.6 — 0건 + 오늘 아닌 day-cell 클릭 가드 (mocks today-mac.html:4699 패턴 답습).
    // dev seed 후에도 빈 날짜 클릭은 popover 미오픈. 오늘 날짜는 거래 추가 진입 위해 허용.
    if (cellEl?.classList?.contains?.('is-zero') && !cellEl?.classList?.contains?.('today')) {
      return { applied: false, reason: 'is_zero' };
    }
    const monthDay = cellEl?.dataset?.date;
    if (!monthDay) {
      if (typeof origOpen === 'function') return origOpen.call(this, cellEl);
      return;
    }
    const isoDate = monthDayToIsoDate(monthDay);
    let rows = [];
    try {
      rows = await Queries.listExpensesByDate(isoDate);
    } catch (e) {
      console.warn('[expenses] listExpensesByDate 실패:', e?.message || e);
    }
    patchDayPopoverFromRows({ monthDay, rows, doc });
    if (doc) {
      doc.querySelectorAll('.exp-month-day.is-selected').forEach((el) => el.classList.remove('is-selected'));
      if (cellEl && !cellEl.classList.contains('today')) cellEl.classList.add('is-selected');
      const overlay = doc.getElementById('expDayPopoverOverlay');
      if (overlay) {
        overlay.classList.add('is-open');
        overlay.setAttribute('aria-hidden', 'false');
      }
      const popover = doc.getElementById('expDayPopover');
      if (popover) {
        popover.classList.add('is-open');
        popover.setAttribute('aria-hidden', 'false');
      }
    }
    return { applied: true, count: rows.length };
  };
}

// ───────────────────────────────────────────────────────────────────────────
// 별 wave C — openExpSearch Dexie wiring
// mocks today-mac.html L4820-4886 의 가계부 검색 모달이 FIXTURE.expense.txns 만 사용 →
// SPA 가 capture phase input listener 로 mocks renderExpSearchResults closure 차단 +
// Dexie searchExpenses 결과로 body 덮어쓰기.
// ───────────────────────────────────────────────────────────────────────────

/** Dexie row → mocks .exp-popover-row HTML (검색 결과 + 카테고리 popup 공용). Wave 11.6.8b — onclick inline backup. */
export function rowToExpSearchHtml(row) {
  const merchant = escapeHtml(row?.merchant || row?.memo || '');
  const card = escapeHtml(row?.card || DEFAULT_CARD_LABEL);
  const category = escapeHtml(row?.category || '');
  const id = escapeAttr(row?.id || '');
  const recurring = row?.recurring ? REPEAT_SVG : '';
  const onclick = id ? ` onclick="window.openExpenseModal && window.openExpenseModal('edit', '${id}')"` : '';
  return `<div class="exp-popover-row" data-tx-id="${id}"${onclick}><span class="exp-popover-row__cat">${category}</span><span class="exp-popover-row__merchant">${merchant}</span><span class="exp-popover-row__card">${card}${recurring}</span><span class="exp-popover-row__amount">${formatAmount(row?.amount_krw || 0)}</span></div>`;
}

/**
 * Dexie searchExpenses(q) 결과로 #expSearchResults body 덮어쓰기.
 * q 빈 → mocks 의 placeholder 메시지 ("거래 키워드를 입력하세요").
 * 매치 0 → "..."와 일치하는 거래가 없습니다".
 * 매치 N → count 헤더 + 합계 + 행 N개.
 */
export async function renderExpSearchDexie(q, doc = (typeof document !== 'undefined' ? document : null)) {
  if (!doc) return false;
  const body = doc.getElementById?.('expSearchResults');
  if (!body) return false;
  const ql = (q || '').trim();
  if (!ql) {
    body.innerHTML = '<div class="exp-search-modal__empty">거래 키워드를 입력하세요</div>';
    return true;
  }
  let rows = [];
  try {
    rows = await Queries.searchExpenses(ql);
  } catch (e) {
    console.warn('[expenses] searchExpenses 실패:', e?.message || e);
  }
  if (!rows.length) {
    body.innerHTML = `<div class="exp-search-modal__empty">"${escapeHtml(ql)}" 와 일치하는 거래가 없습니다</div>`;
    return true;
  }
  const total = rows.reduce((s, r) => s + (r.amount_krw || 0), 0);
  const header = `<div class="exp-search-modal__count">${rows.length}건 · 합계 ${formatAmount(total)}</div>`;
  body.innerHTML = `${header}${rows.map(rowToExpSearchHtml).join('')}`;
  return true;
}

let _expSearchPatched = false;
/**
 * mocks `bindExpSearchInput` 의 input listener (closure FIXTURE 사용) 를 capture phase 로 차단.
 * 추가로 `window.openExpSearch` wrap — 모달 open 직후 빈 placeholder (mocks 가 이미 그림 — 변경 0).
 */
export function patchExpSearchHandlers({
  doc = (typeof document !== 'undefined' ? document : null),
  win = (typeof window !== 'undefined' ? window : null),
} = {}) {
  if (!doc) return false;
  if (_expSearchPatched) return true;
  _expSearchPatched = true;
  doc.addEventListener('input', async (e) => {
    const input = e.target;
    if (!input || input.id !== 'expSearchInput') return;
    e.stopImmediatePropagation();
    await renderExpSearchDexie((input.value || '').trim(), doc);
  }, true);
  return true;
}

/** 테스트 전용 — _expSearchPatched 리셋. */
export function __resetExpSearchPatchState() {
  _expSearchPatched = false;
}

// ───────────────────────────────────────────────────────────────────────────
// Wave 11.6.5 — 카테고리 통계 카드 click → 카테고리 상세 popup
// mocks today-mac.html L3962-3967 의 `window.openCategoryDetail` placeholder 를
// SPA 가 wrap → Dexie 결과로 popup 표시 (mocks `openExpenseFloatingPopup` closure 우회)
// ───────────────────────────────────────────────────────────────────────────

/** 'YYYY-MM' prefix 매치 (spent_at ISO timezone 무관 prefix). */
function spentAtMatchesMonth(spentAt, year, month) {
  if (!spentAt) return false;
  const ym = `${year}-${String(month).padStart(2, '0')}`;
  return String(spentAt).startsWith(ym);
}

/** 'YYYY' prefix 매치 — year-to-date scope. */
function spentAtMatchesYear(spentAt, year) {
  if (!spentAt) return false;
  return String(spentAt).startsWith(`${year}-`);
}

/** 카테고리 normalize — 한글 라벨이든 영문 id 든 동일 키로 비교 가능.
 * 한글 ('온라인쇼핑') → id ('online') 변환 시도. 변환 실패 시 raw 유지.
 */
function normalizeCategoryKey(c) {
  if (!c) return '';
  const asId = Classifier.getCategoryIdByName?.(c);
  return asId || c;
}

/** Dexie 직접 조회 (spent_at 범위) → 카테고리 + 월/년 필터 + 합계. UI render 는 별도.
 * 2026-05-12: 한글 라벨 ↔ 영문 id 양방향 매칭 + scope='year' 옵션 (누적 위젯 클릭용).
 * 이전엔 Queries.searchExpenses(키워드 텍스트 매칭) 사용 → category='online' row 가
 * '온라인쇼핑' 검색에 매칭 안 되는 버그. 직접 listExpensesByRange 사용으로 해소.
 */
export async function fetchCategoryExpenses(category, opts = {}) {
  if (!category) return { rows: [], total: 0 };
  const now = new Date();
  const year = opts.year || now.getFullYear();
  const month = opts.month || (now.getMonth() + 1);
  const scope = opts.scope || 'month';
  let rows = [];
  try {
    if (scope === 'year') {
      const from = `${year}-01-01T00:00:00.000Z`;
      const to = `${year}-12-31T23:59:59.999Z`;
      rows = await Queries.listExpensesByRange(from, to);
    } else {
      rows = await Queries.listExpensesByMonth(year, month);
    }
  } catch (e) {
    console.warn('[expenses] listExpenses range/month 실패:', e?.message || e);
    return { rows: [], total: 0 };
  }
  const targetKey = normalizeCategoryKey(category);
  const filtered = rows.filter((r) => normalizeCategoryKey(r.category) === targetKey);
  const total = filtered.reduce((s, r) => s + (r.amount_krw || 0), 0);
  return { rows: filtered, total, year, month, scope };
}

/** 카테고리 popup HTML — heroCard 패턴 (mocks .exp-fp-popup 답습).
 * 2026-05-12: scope='year' 면 제목을 "X · YYYY년" 으로. (누적 위젯 클릭 케이스.)
 */
export function buildCategoryPopupHtml(category, rows, total, opts = {}) {
  const now = new Date();
  const month = opts.month || (now.getMonth() + 1);
  const year = opts.year || now.getFullYear();
  const scope = opts.scope || 'month';
  const title = scope === 'year'
    ? `${escapeHtml(category)} · ${year}년`
    : `${escapeHtml(category)} · ${month}월`;
  if (!rows.length) {
    return `
      <div class="exp-fp-popup exp-fp-popup--category" role="dialog" aria-modal="true">
        <div class="exp-fp-header">
          <span class="exp-fp-title">${title}</span>
          <button class="exp-fp-close" data-popup-close type="button" aria-label="닫기">×</button>
        </div>
        <div class="exp-fp-body">
          <div class="exp-fp-empty">이 카테고리의 거래가 없습니다.</div>
        </div>
      </div>
    `;
  }
  // Wave 11.6.6 — 사용자 요구: 구분선은 합계 위에 1개만. rows 위 / summary 아래 (스샷5 정합).
  const summary = `<div class="exp-fp-summary">${rows.length}건 합계 ${formatAmount(total)}</div>`;
  const list = rows.map(rowToExpSearchHtml).join('');
  return `
    <div class="exp-fp-popup exp-fp-popup--category" role="dialog" aria-modal="true">
      <div class="exp-fp-header">
        <span class="exp-fp-title">${title}</span>
        <button class="exp-fp-close" data-popup-close type="button" aria-label="닫기">×</button>
      </div>
      <div class="exp-fp-body">
        ${list}
        ${summary}
      </div>
    </div>
  `;
}

/** 카테고리 popup 마운트 — overlay + card. close handler 등록. */
export async function openCategoryDetailPopup(category, opts = {}, doc = (typeof document !== 'undefined' ? document : null)) {
  if (!doc || typeof doc.createElement !== 'function') return { ok: false, reason: 'no_doc' };
  if (!category) return { ok: false, reason: 'no_category' };
  // 기존 popup 제거 (idempotent)
  const existing = doc.getElementById('expCategoryPopupOverlay');
  if (existing && existing.parentNode) existing.parentNode.removeChild(existing);
  const { rows, total, year, month, scope } = await fetchCategoryExpenses(category, opts);
  const overlay = doc.createElement('div');
  overlay.id = 'expCategoryPopupOverlay';
  overlay.className = 'exp-fp-overlay';
  overlay.setAttribute('data-category-popup', 'true');
  overlay.innerHTML = buildCategoryPopupHtml(category, rows, total, { year, month, scope });
  doc.body.appendChild(overlay);
  // 2026-05-12 — `.exp-fp-overlay` 기본 opacity:0 + pointer-events:none. `.open` 클래스가
  // 붙어야 시각적으로 노출 (CSS rule `.exp-fp-overlay.open { opacity:1; pointer-events:auto; }`).
  // requestAnimationFrame 으로 다음 frame 에 적용 → opacity transition 정상 발화.
  if (typeof requestAnimationFrame === 'function') {
    requestAnimationFrame(() => overlay.classList.add('open'));
  } else {
    overlay.classList.add('open');
  }
  function close() {
    if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
    doc.removeEventListener('keydown', onKey);
  }
  function onKey(e) {
    if (e.key === 'Escape') close();
  }
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) return close();
    if (e.target.closest?.('[data-popup-close]')) close();
  });
  doc.addEventListener('keydown', onKey);
  return { ok: true, count: rows.length };
}

let _categoryDetailPatched = false;
/** mocks `window.openCategoryDetail` wrap — Dexie 결과로 popup 표시. */
export function patchOpenCategoryDetailHandler({
  win = (typeof window !== 'undefined' ? window : null),
  doc = (typeof document !== 'undefined' ? document : null),
} = {}) {
  if (!win) return false;
  if (_categoryDetailPatched) return true;
  _categoryDetailPatched = true;
  win.openCategoryDetail = function patchedOpenCategoryDetail(cat, event) {
    if (event && typeof event.stopPropagation === 'function') event.stopPropagation();
    // 2026-05-12: 누적 위젯 (.exp-cat-row, year-to-date) 클릭 케이스. scope='year' 로
    // 모달이 2026년 전체 결제를 노출 (이전엔 현재 월만 → 사용자 인지 불일치).
    openCategoryDetailPopup(cat, { scope: 'year' }, doc).catch((e) =>
      console.warn('[expenses] openCategoryDetailPopup 실패:', e?.message || e),
    );
  };
  return true;
}

/** 테스트 전용 — _categoryDetailPatched 리셋. */
export function __resetCategoryDetailPatchState() {
  _categoryDetailPatched = false;
}

// ───────────────────────────────────────────────────────────────────────────
// public API
// ───────────────────────────────────────────────────────────────────────────

export function mountExpensesView(user) {
  if (!user?.id) return;
  _currentUser = user;
  if (typeof document === 'undefined') return; // node (vitest) 환경 — DOM 작업 skip
  patchExpenseModalHandlers();
  patchDayPopoverHandlers();
  patchExpSearchHandlers();
  patchOpenCategoryDetailHandler();
  installExpRowClickHandler();
  injectExpensePopupStyles();
  observeCategoryChange(handleCategoryActive);
  installExpenseCategoryClickHandler();
  bindMonthNavHandlers();
  bindStatsTabHandler();
  refreshSidebarExpenseTotal();
}

/**
 * 사이드바 가계부 항목의 .meta 를 현재 월 총액으로 갱신.
 * spec today-app-spec.md:514 — "사이드바 가계부 간략 위젯 — 월간 총액만".
 * mocks 의 하드코딩 "1,284,500 원" 를 실 데이터로 덮어쓴다. 미반영 시 fixture 박제로 표시됨.
 */
export async function refreshSidebarExpenseTotal(doc = (typeof document !== 'undefined' ? document : null)) {
  if (!doc) return;
  const meta = doc.querySelector('.sb__item[data-category="expense"] .meta');
  if (!meta) return;
  try {
    const now = new Date();
    const total = await Queries.sumExpensesMonth(now.getFullYear(), now.getMonth() + 1);
    meta.textContent = `${(total || 0).toLocaleString('ko-KR')} 원`;
  } catch (e) {
    console.warn('[expenses] refreshSidebarExpenseTotal 실패', e?.message || e);
  }
}

// Wave 11.6.6 — popover/popup row 클릭 → 지출 수정 모달 통합 wiring.
// 캘린더 popover (.exp-popover-row[data-tx-id], rowToPopoverHtml) +
// 카테고리 popup / 검색 모달 (.exp-popover-row[data-tx-id], rowToExpSearchHtml) 양쪽 처리.
let _expRowClickInstalled = false;
function installExpRowClickHandler() {
  if (_expRowClickInstalled) return;
  if (typeof document === 'undefined') return;
  _expRowClickInstalled = true;
  document.addEventListener('click', (e) => {
    // Wave 11.6.9 — 히어로/연중누적 모달 (.exp-fp-body .expense-row[data-tx-id]) 도 매치 (T5).
    const row = e.target?.closest?.('.exp-popover-row[data-tx-id], .exp-fp-body .expense-row[data-tx-id]');
    if (!row) return;
    const txId = row.dataset?.txId;
    if (!txId) return;
    e.preventDefault();
    e.stopPropagation();
    // 어느 컨테이너 안인지 판단 + close
    const dayOverlay = document.getElementById('expDayPopoverOverlay');
    if (dayOverlay && dayOverlay.contains(row)) {
      dayOverlay.classList.remove('is-open');
      dayOverlay.setAttribute('aria-hidden', 'true');
      const popover = document.getElementById('expDayPopover');
      if (popover) {
        popover.classList.remove('is-open');
        popover.setAttribute('aria-hidden', 'true');
      }
    }
    const catOverlay = document.getElementById('expCategoryPopupOverlay');
    if (catOverlay && catOverlay.contains(row) && catOverlay.parentNode) {
      catOverlay.parentNode.removeChild(catOverlay);
    }
    const searchOverlay = document.getElementById('expSearchModalOverlay') || document.querySelector('.exp-search-modal__overlay, [data-exp-search-overlay]');
    if (searchOverlay && searchOverlay.contains?.(row)) {
      searchOverlay.classList?.remove?.('is-open');
      searchOverlay.setAttribute?.('aria-hidden', 'true');
    }
    // Wave 11.6.9 — 히어로/연중누적 모달 (`#expFloatingPopupOverlay`) close
    const fpOverlay = document.getElementById('expFloatingPopupOverlay');
    if (fpOverlay && fpOverlay.contains(row) && typeof window.closeExpenseFloatingPopup === 'function') {
      window.closeExpenseFloatingPopup();
    }
    // openExpenseModal monkey-patch (patchExpenseModalHandlers) 가 mode='edit' + Dexie row 로 진입
    if (typeof window !== 'undefined' && typeof window.openExpenseModal === 'function') {
      Promise.resolve(window.openExpenseModal('edit', txId)).catch((err) =>
        console.warn('[expenses] popover row → openExpenseModal 실패:', err?.message || err),
      );
    }
  }, true);
}

// Wave 11.6.9 (이전 11.6.8b/11.6.6) — 모달 케이스 (캘린더/히어로/연중누적 popup) 합계 위 구분선 제거.
// 사용자 의도: row 사이 border 0 + 합계 footer/summary 위에도 border 0 (모달은 컴팩트 시각).
// 적용 범위: 카테고리 popup (.exp-fp-popup--category) + 일반 가맹점 popup (.exp-fp-popup) + 캘린더 popover (.exp-day-detail.is-popover).
// `.exp-day-detail` 는 mocks 상 `is-popover` 상태로만 사용 (메인 view 미사용) → 안전.
let _expensePopupStylesInjected = false;
function injectExpensePopupStyles(doc = (typeof document !== 'undefined' ? document : null)) {
  if (_expensePopupStylesInjected) return;
  if (!doc) return;
  if (doc.getElementById('today-exp-popup-styles')) {
    _expensePopupStylesInjected = true;
    return;
  }
  const style = doc.createElement('style');
  style.id = 'today-exp-popup-styles';
  style.textContent = `
    /* row 사이 border 제거 (Wave 11.6.8b 유지) */
    .exp-fp-body .expense-row,
    .exp-fp-body .expense-row:not(:last-child),
    .exp-fp-popup .exp-popover-row,
    .exp-fp-popup .exp-popover-row:not(:last-child),
    .exp-day-detail .exp-popover-row,
    .exp-day-detail .exp-popover-row:not(:last-child) { border-bottom: 0; }
    /* Wave 11.6.9 — 합계 (footer/summary) 위 border-top 제거 (사용자 요구: 모달 컴팩트) */
    .exp-fp-footer,
    .exp-day-detail__foot { border-top: 0; }
    .exp-fp-popup--category .exp-popover-row { cursor: pointer; }
    .exp-fp-popup--category .exp-popover-row:hover { background: var(--hover-bg, oklch(97.6% 0.006 60)); }
    .exp-fp-popup--category .exp-fp-summary {
      border-top: 0;
      padding-top: 8px;
      margin-top: 4px;
      font-weight: 500;
    }
    /* popover row 클릭 가능 시각 (Wave 11.6.6 B2/B4) */
    .exp-day-detail .exp-popover-row[data-tx-id] { cursor: pointer; }
    .exp-day-detail .exp-popover-row[data-tx-id]:hover { background: var(--hover-bg, oklch(97.6% 0.006 60)); }
    /* Wave 11.6.9 — 히어로/연중누적 모달 row 클릭 가능 (T5 wiring) */
    .exp-fp-body .expense-row[data-tx-id] { cursor: pointer; }
    .exp-fp-body .expense-row[data-tx-id]:hover { background: var(--hover-bg, oklch(97.6% 0.006 60)); }
  `;
  doc.head.appendChild(style);
  _expensePopupStylesInjected = true;
}

export function rebindCategoryObserver() {
  if (_onCategoryChange) observeCategoryChange(_onCategoryChange);
}

export const Expenses = {
  mountExpensesView,
  rebindCategoryObserver,
  refreshSidebarExpenseTotal,
  // 어댑터
  formatAmount,
  isoToMockDate,
  rowToMockTx,
  dailyTotalsFromRows,
  summarizeMonth,
  escapeHtml,
  formatManwon,
  rankMerchantsByMonth,
  escapeAttr,
  // DOM 패치
  renderExpenseRecentsFromRows,
  patchHeadlineFromRows,
  patchCalendarFromRows,
  renderTimelineFromRows,
  patchRankSectionFromRows,
  clearExpensesFixture,
  rebuildCalendarGrid,
  loadAndRenderMonth,
  patchMonthlyTrendChart,
  patchCumulativeFromHistory,
  toCategoryLabel,
  // Wave 11.6.4b — modal
  datetimeLocalToIso,
  isoToDatetimeLocal,
  extractExpenseFromForm,
  populateExpenseForm,
  validateExpenseForm,
  saveExpenseFromForm,
  deleteExpenseFromForm,
  patchExpenseModalHandlers,
  // Wave 11.6.3.2 — 일자 popover
  rowToPopoverHtml,
  monthDayToIsoDate,
  dayOfWeekFromMonthDay,
  patchDayPopoverFromRows,
  patchDayPopoverHandlers,
  // 별 wave C — openExpSearch Dexie wiring
  rowToExpSearchHtml,
  renderExpSearchDexie,
  patchExpSearchHandlers,
  // Wave 11.6.5 — 카테고리 통계 카드 popup
  fetchCategoryExpenses,
  buildCategoryPopupHtml,
  openCategoryDetailPopup,
  patchOpenCategoryDetailHandler,
};

if (typeof window !== 'undefined') {
  window.todayExpenses = Expenses;
}

export default Expenses;
