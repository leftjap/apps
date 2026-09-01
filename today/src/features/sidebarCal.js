/**
 * 사이드바 "최근 4주" 기록 캘린더 (작업지시서 — 사이드바 캘린더 §2~§7).
 *
 * 책임:
 *  - rolling 4주 창 계산 (마지막 행 = 오늘 포함 주 · 월요일 시작 · 28칸 고정)
 *  - IndexedDB entries 집계 (CAL_KINDS 4종, created_at 로컬 날짜 귀속, 파트너 제외 §10-3)
 *  - mocks `.sb__cal` 셸 렌더 (헤더 범위·페이징, 날짜 그리드, 합계 행)
 *  - 셀 클릭: 1편 → 바로 열기 / 2편+ → 일자 팝오버 (#expDayPopover 문법 재사용 §5)
 *  - 렌더 갱신 시점 (§7): 앱 시작(mount + post-sync), 글 저장/삭제 후
 *    (entries.js 가 `globalThis.todaySidebarCal.refresh` 동적 lookup — 순환 참조 회피,
 *     queries.js 의 todaySync 패턴 답습), 날짜 변경(자정) 후 첫 인터랙션.
 *
 * 창 상태(_offset)는 세션 내 유지, 리로드 시 현재 창으로 초기화 (§3).
 */
import { Queries } from '../db/queries.js';
import { CAL_KINDS, charCount, sheetCount, openEntryByRow, escapeHtml } from './entries.js';

// §10-4 — 농도 수식 상한 기준 글자수 (실데이터 분포 확인 후 조정 가능, 상수로만)
export const FULL_CHARS = 800;

const WINDOW_DAYS = 28;
const MS_DAY = 86400000;
const DOW_KO = ['일', '월', '화', '수', '목', '금', '토'];
const KIND_LABEL = Object.freeze({
  navi: '오늘의 네비', fiction: '단편', blog: '블로그', memo: '메모',
});

let _user = null;
let _offset = 0; // 0 = 현재 창, -1 = 지난 4주 … (미래 창 없음 — 최대 0)
let _agg = new Map();
let _renderedDayKey = null; // 자정 감지 — 렌더 시점의 로컬 날짜 키
let _installed = false;

// ───────────────────────────────────────────────────────────────────────────
// 순수 로직 (단위 테스트 대상)
// ───────────────────────────────────────────────────────────────────────────

/** 로컬 날짜 키 — 'YYYY-M-D' (§7: created_at 의 로컬 날짜 기준, 타임존 별도 처리 없음). */
export function localDayKey(d) {
  return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
}

function atMidnight(d) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

/**
 * rolling 4주 창 (§5): 마지막 행 = 오늘이 포함된 달력 주(월요일 시작),
 * 그 위로 3주 = 총 28칸. 달력 월 아님 — 월초에도 창이 끊기지 않는다.
 * offset 은 창 단위 ±28일 이동 (0 = 현재 창).
 */
export function computeWindow(today, offset = 0) {
  const t0 = atMidnight(today);
  const mondayDelta = (t0.getDay() + 6) % 7; // 월=0 … 일=6
  const start = new Date(t0.getFullYear(), t0.getMonth(), t0.getDate() - mondayDelta - 21 + offset * WINDOW_DAYS);
  const days = [];
  for (let i = 0; i < WINDOW_DAYS; i++) {
    days.push(new Date(start.getFullYear(), start.getMonth(), start.getDate() + i));
  }
  return { start, end: days[WINDOW_DAYS - 1], days };
}

/** 농도 수식 (§5, 절대 기준 — 창 내 최대값 대비 상대 농도 금지). */
export function alphaOf(chars) {
  return Math.min(0.72, 0.14 + (0.58 * chars) / FULL_CHARS);
}

/**
 * 일 단위 집계 (§7): created_at 로컬 날짜 귀속, 하루 여러 편 글자수 합산.
 * 파트너 소유 행 제외 (§10-3). deleted_at 필터는 Queries.listEntries 가 담당.
 * @returns Map<dayKey, { chars, rows[] (created_at 오름차순) }>
 */
export function aggregateEntriesByDay(rows, userId) {
  const agg = new Map();
  for (const r of rows || []) {
    if (!r || r.owner_id !== userId) continue;
    const d = r.created_at ? new Date(r.created_at) : null;
    if (!d || Number.isNaN(d.getTime())) continue;
    const key = localDayKey(d);
    let slot = agg.get(key);
    if (!slot) {
      slot = { chars: 0, rows: [] };
      agg.set(key, slot);
    }
    slot.chars += charCount(r.content);
    slot.rows.push(r);
  }
  for (const slot of agg.values()) {
    slot.rows.sort((a, b) => (a.created_at || '').localeCompare(b.created_at || ''));
  }
  return agg;
}

/** 범위 표기 'M.D – M.D' (§3 — 하이픈이 아니라 공백 포함 en dash). */
export function fmtRange(start, end) {
  return `${start.getMonth() + 1}.${start.getDate()} – ${end.getMonth() + 1}.${end.getDate()}`;
}

/**
 * 셀 모델 (§5, 판정 순서 고정: ①오늘·썼음 ②오늘·안씀 ③과거·썼음 ④과거·안씀 ⑤미래).
 * @returns { label, state: 'today'|'today-off'|'on'|'off'|'future', m1, alpha?, title? }
 */
export function buildCellModel(day, today, agg) {
  const t0 = atMidnight(today);
  const key = localDayKey(day);
  const chars = agg.get(key)?.chars || 0;
  const isToday = key === localDayKey(t0);
  const isFuture = day.getTime() > t0.getTime();
  const m1 = day.getDate() === 1;
  const label = m1 ? `${day.getMonth() + 1}/1` : String(day.getDate());
  const state = isToday
    ? (chars > 0 ? 'today' : 'today-off')
    : isFuture
      ? 'future'
      : chars > 0 ? 'on' : 'off';
  const model = { label, state, m1 };
  if (state === 'on') model.alpha = alphaOf(chars);
  if (!isFuture) {
    model.title = isToday
      ? `오늘 · ${chars}자`
      : `${day.getMonth() + 1}월 ${day.getDate()}일 · ${chars > 0 ? `${chars}자` : '기록 없음'}`;
  }
  return model;
}

/**
 * 합계 행 (§6): 총 매수 = round1(Σ창 내 charCount / 200) — 글자수 합산 후 나눔
 * (일별 반올림 누적 오차 방지). 정수면 소수점 생략, 아니면 소수 1자리.
 * 하루 평균 = 총 매수 / 분모 (항상 소수 1자리) — 현재 창: 창 시작~오늘 경과 일수(오늘 포함),
 * 과거 창: 28.
 */
export function computeSummary(agg, days, today) {
  let totalChars = 0;
  for (const d of days) totalChars += agg.get(localDayKey(d))?.chars || 0;
  const sheets = Math.round((totalChars / 200) * 10) / 10;
  const totalText = Number.isInteger(sheets) ? String(sheets) : sheets.toFixed(1);
  const t0 = atMidnight(today);
  const start = days[0];
  const inWindow = t0.getTime() >= start.getTime() && t0.getTime() <= days[days.length - 1].getTime();
  const denom = inWindow ? Math.round((t0.getTime() - start.getTime()) / MS_DAY) + 1 : WINDOW_DAYS;
  const avgText = (Math.round((sheets / denom) * 10) / 10).toFixed(1);
  return { totalText, avgText };
}

/** 헤더 페이징 모델 (§3): 범위 라벨 + ‹ title(대상 창 범위) + › 활성 여부. */
export function buildPagingModel(today, offset = 0) {
  const cur = computeWindow(today, offset);
  const prev = computeWindow(today, offset - 1);
  return {
    rangeText: fmtRange(cur.start, cur.end),
    prevTitle: `지난 4주 (${fmtRange(prev.start, prev.end)})`,
    nextTitle: '다음 4주',
    nextDisabled: offset >= 0, // 미래로는 현재 창까지만 (§3)
  };
}

// ───────────────────────────────────────────────────────────────────────────
// 데이터 로드 + 렌더
// ───────────────────────────────────────────────────────────────────────────

async function loadAgg() {
  const lists = await Promise.all(CAL_KINDS.map((k) => Queries.listEntries(k)));
  return aggregateEntriesByDay(lists.flat(), _user.id);
}

function render(doc = (typeof document !== 'undefined' ? document : null)) {
  if (!doc) return false;
  const grid = doc.getElementById('sbCalGrid');
  if (!grid) return false;
  const today = new Date();
  const { days } = computeWindow(today, _offset);
  const paging = buildPagingModel(today, _offset);

  const rangeEl = doc.getElementById('sbCalRange');
  if (rangeEl) rangeEl.textContent = paging.rangeText;
  const prevBtn = doc.getElementById('sbCalPrev');
  if (prevBtn) {
    prevBtn.title = paging.prevTitle;
    prevBtn.setAttribute('aria-label', paging.prevTitle);
  }
  const nextBtn = doc.getElementById('sbCalNext');
  if (nextBtn) {
    nextBtn.disabled = paging.nextDisabled;
    nextBtn.title = paging.nextTitle;
    nextBtn.setAttribute('aria-label', paging.nextTitle);
  }

  grid.innerHTML = '';
  for (const day of days) {
    const m = buildCellModel(day, today, _agg);
    const el = doc.createElement('div');
    el.className = `sb__cal-cell is-${m.state}${m.m1 ? ' is-m1' : ''}`;
    el.textContent = m.label;
    if (m.title) el.title = m.title;
    if (m.alpha != null) el.style.background = `rgba(217,119,87,${m.alpha.toFixed(3)})`; // --crail-base RGB (§5)
    if (m.state !== 'future') el.dataset.date = localDayKey(day);
    grid.appendChild(el);
  }

  const { totalText, avgText } = computeSummary(_agg, days, today);
  const totalEl = doc.getElementById('sbCalSumTotal');
  if (totalEl) totalEl.textContent = totalText;
  const avgEl = doc.getElementById('sbCalSumAvg');
  if (avgEl) avgEl.textContent = avgText;

  _renderedDayKey = localDayKey(today);
  return true;
}

/** 전체 갱신 — Dexie 재집계 + 렌더. entries.js 가 저장/삭제 후 동적 lookup 으로 호출 (§7). */
export async function refreshSidebarCal() {
  if (!_user?.id) return false;
  try {
    _agg = await loadAgg();
  } catch (e) {
    console.warn('[sidebarCal] 집계 실패:', e?.message || e);
    return false;
  }
  return render();
}

// ───────────────────────────────────────────────────────────────────────────
// 인터랙션 — 페이징 · 셀 클릭 · 일자 팝오버 · 자정 감지
// ───────────────────────────────────────────────────────────────────────────

/**
 * 글 열기 (§5) — entries.openEntryByRow 위임: 카테고리 활성화(블로그/메모는 항목이 없어
 * 생략, §1) + _deepLinkInProgress 억제로 카테고리 재로드가 대상 글을 덮지 않게 한다.
 */
function openEntry(row) {
  if (!row?.id) return;
  // 모바일 드로어 닫기 — mocks newDoc·리센츠 클릭과 동일 동작
  document.body.removeAttribute('data-drawer-open');
  openEntryByRow(row);
}

function popoverEls(doc = document) {
  return {
    popover: doc.getElementById('sbCalDayPopover'),
    overlay: doc.getElementById('sbCalDayPopoverOverlay'),
  };
}

function closeDayPopover() {
  const { popover, overlay } = popoverEls();
  if (popover) {
    popover.classList.remove('is-open');
    popover.setAttribute('aria-hidden', 'true');
  }
  if (overlay) {
    overlay.classList.remove('is-open');
    overlay.setAttribute('aria-hidden', 'true');
  }
}

/** 2편 이상인 날 — #expDayPopover 문법 재사용한 목록 팝오버 (§5). */
function openDayPopover(dayKey, slot) {
  const { popover, overlay } = popoverEls();
  if (!popover) return;
  const [y, m, d] = dayKey.split('-').map(Number);
  const dow = DOW_KO[new Date(y, m - 1, d).getDay()];
  const dateEl = popover.querySelector('.exp-day-detail__date');
  if (dateEl) dateEl.innerHTML = `${m}월 ${d}일<span class="dow">${dow}요일</span>`;
  const sumEl = popover.querySelector('.exp-day-detail__sum');
  if (sumEl) sumEl.innerHTML = `<b>${slot.chars.toLocaleString('ko-KR')}자</b>`;
  const list = popover.querySelector('.expense-list');
  if (list) {
    list.innerHTML = slot.rows.map((r) => `
      <div class="exp-day-row" data-cal-entry-id="${escapeHtml(r.id)}">
        <div class="exp-day-row__body">
          <div class="exp-day-row__merchant">${escapeHtml(r.title || '제목 없음')}</div>
          <div class="exp-day-row__meta">${escapeHtml(KIND_LABEL[r.kind] || r.kind)}</div>
        </div>
        <div class="exp-day-row__amt">${sheetCount(r.content)}매</div>
      </div>
    `).join('');
  }
  if (overlay) {
    overlay.classList.add('is-open');
    overlay.setAttribute('aria-hidden', 'false');
  }
  popover.classList.add('is-open');
  popover.setAttribute('aria-hidden', 'false');
}

function handleCellClick(cell) {
  const key = cell?.dataset?.date;
  if (!key) return;
  const slot = _agg.get(key);
  if (!slot || slot.rows.length === 0) return; // 빈 날·오늘 링 클릭 = no-op (§5·§10-5)
  if (slot.rows.length === 1) {
    openEntry(slot.rows[0]);
    return;
  }
  openDayPopover(key, slot);
}

/** 자정 감지 (§7) — 날짜 변경 후 첫 인터랙션 시 재렌더. */
function maybeRefreshForNewDay() {
  if (!_renderedDayKey || !_user?.id) return;
  if (localDayKey(new Date()) !== _renderedDayKey) {
    refreshSidebarCal().catch((e) => console.warn('[sidebarCal] 자정 갱신 실패:', e?.message || e));
  }
}

function installHandlers() {
  if (_installed || typeof document === 'undefined') return;
  _installed = true;

  document.getElementById('sbCalPrev')?.addEventListener('click', () => {
    _offset -= 1; // 과거 하한 없음 (§10-6)
    render();
  });
  document.getElementById('sbCalNext')?.addEventListener('click', () => {
    if (_offset >= 0) return;
    _offset += 1;
    render();
  });

  document.getElementById('sbCalGrid')?.addEventListener('click', (e) => {
    handleCellClick(e.target?.closest?.('.sb__cal-cell[data-date]'));
  });

  // 팝오버 닫기 — 닫기 버튼 · overlay · 항목 클릭(글 열기) · ESC
  const { popover, overlay } = popoverEls();
  popover?.querySelector('.exp-day-detail__close')?.addEventListener('click', closeDayPopover);
  overlay?.addEventListener('click', closeDayPopover);
  popover?.addEventListener('click', (e) => {
    const rowEl = e.target?.closest?.('[data-cal-entry-id]');
    if (!rowEl) return;
    const id = rowEl.dataset.calEntryId;
    let row = null;
    for (const slot of _agg.values()) {
      row = slot.rows.find((r) => r.id === id) || row;
    }
    closeDayPopover();
    if (row) openEntry(row);
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && popoverEls().popover?.classList.contains('is-open')) closeDayPopover();
  });

  // 자정 후 첫 인터랙션 감지 (§7) — 클릭 · 탭 복귀
  document.addEventListener('click', maybeRefreshForNewDay, true);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') maybeRefreshForNewDay();
  });
}

// ───────────────────────────────────────────────────────────────────────────
// mount (main.js 가 호출)
// ───────────────────────────────────────────────────────────────────────────

export function mountSidebarCal(user) {
  if (!user?.id) return;
  _user = user;
  _offset = 0; // 리로드/재마운트 시 현재 창으로 초기화 (§3)
  installHandlers();
  // entries.js 저장/삭제 훅의 동적 lookup 대상 (순환 참조 회피 — queries.js todaySync 패턴)
  globalThis.todaySidebarCal = { refresh: refreshSidebarCal };
  refreshSidebarCal().catch((e) => console.warn('[sidebarCal] 초기 렌더 실패:', e?.message || e));
}

export const SidebarCal = {
  mountSidebarCal,
  refresh: refreshSidebarCal,
};
