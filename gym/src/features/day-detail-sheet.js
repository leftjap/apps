/**
 * §9-1 — 캘린더 날짜 탭 → 운동 요약 바텀시트.
 *
 * 단일 #dayDetailSheet DOM 으로 summary / confirm 2 step 처리 (DOM 한 번 §6-10).
 *  - tap (<500ms)  → summary  : entry 의 부위·볼륨·시간·PR·운동 리스트 표시
 *  - long-press(≥500ms) → confirm : "삭제하시겠습니까?" + 삭제(accent) 버튼
 *
 * fetch 는 caller (home.js / stats.js wiring) 가 window.gymHome.fetchDayDetail
 * 결과를 entry 로 넘겨준다. 시트 모듈은 렌더·열기·닫기·이벤트 위임만 담당.
 */

const WEEKDAY_KR = ['일', '월', '화', '수', '목', '금', '토'];

function formatDayLabel(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso || ''));
  if (!m) return '';
  const y = parseInt(m[1], 10);
  const mo = parseInt(m[2], 10);
  const d = parseInt(m[3], 10);
  const date = new Date(y, mo - 1, d);
  const wd = WEEKDAY_KR[date.getDay()];
  return `${mo}월 ${d}일 (${wd})`;
}

function escapeText(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function renderSummary(doc, iso, entry) {
  const dateEl = doc.getElementById('dayDetailDate');
  const tagEl = doc.getElementById('dayDetailTag');
  const metaEl = doc.getElementById('dayDetailMeta');
  const listEl = doc.getElementById('dayDetailExList');
  const emptyEl = doc.getElementById('dayDetailEmpty');
  const confirmEl = doc.getElementById('dayDetailConfirm');
  if (!dateEl || !tagEl || !metaEl || !listEl || !emptyEl) return;

  dateEl.textContent = formatDayLabel(iso);
  if (confirmEl) confirmEl.style.display = 'none';

  if (!entry) {
    tagEl.textContent = '';
    metaEl.innerHTML = '';
    metaEl.style.display = 'none';
    listEl.innerHTML = '';
    listEl.style.display = 'none';
    emptyEl.style.display = '';
    return;
  }

  emptyEl.style.display = 'none';
  metaEl.style.display = 'flex';
  listEl.style.display = 'flex';

  tagEl.textContent = entry.tag || '';

  const chips = [];
  if (entry.vol) chips.push(`<span>볼륨 ${escapeText(entry.vol)}</span>`);
  if (entry.min) chips.push(`<span>${escapeText(entry.min)}분</span>`);
  if (entry.pr) chips.push(`<span style="color:var(--accent);">PR ${escapeText(entry.pr)}</span>`);
  if (entry.level) chips.push(`<span>${escapeText(entry.level)}</span>`);
  metaEl.innerHTML = chips.join('');

  const items = Array.isArray(entry.ex) ? entry.ex : [];
  if (items.length === 0) {
    listEl.innerHTML = '<div class="kr" style="font-size:12px;color:rgba(255,255,255,0.4);">운동 기록 없음</div>';
  } else {
    listEl.innerHTML = items.map((it) => {
      const n = escapeText(it?.n);
      const s = escapeText(it?.s);
      return `<div class="kr" style="display:flex;justify-content:space-between;font-size:13px;color:rgba(255,255,255,0.85);padding:6px 0;border-bottom:1px solid rgba(255,255,255,0.04);">`
        + `<span>${n}</span><span style="color:rgba(255,255,255,0.5);">${s}</span>`
        + `</div>`;
    }).join('');
  }
}

function renderConfirm(doc, iso) {
  const dateEl = doc.getElementById('dayDetailDate');
  const tagEl = doc.getElementById('dayDetailTag');
  const metaEl = doc.getElementById('dayDetailMeta');
  const listEl = doc.getElementById('dayDetailExList');
  const emptyEl = doc.getElementById('dayDetailEmpty');
  const confirmEl = doc.getElementById('dayDetailConfirm');
  if (!dateEl || !confirmEl) return;

  dateEl.textContent = formatDayLabel(iso);
  if (tagEl) tagEl.textContent = '';
  if (metaEl) { metaEl.innerHTML = ''; metaEl.style.display = 'none'; }
  if (listEl) { listEl.innerHTML = ''; listEl.style.display = 'none'; }
  if (emptyEl) emptyEl.style.display = 'none';
  confirmEl.style.display = 'flex';
}

export function openDayDetailSheet(doc, { iso, entry, step = 'summary', onDelete } = {}) {
  if (!doc) return;
  const sheet = doc.getElementById('dayDetailSheet');
  const backdrop = doc.getElementById('dayDetailBackdrop');
  if (!sheet || !backdrop) return;
  sheet.dataset.iso = iso || '';
  sheet.dataset.step = step;
  sheet._onDelete = typeof onDelete === 'function' ? onDelete : null;
  if (step === 'confirm') renderConfirm(doc, iso);
  else renderSummary(doc, iso, entry);
  sheet.dataset.open = 'true';
  sheet.style.transform = 'translateY(0)';
  backdrop.dataset.open = 'true';
  backdrop.style.opacity = '1';
  backdrop.style.pointerEvents = 'auto';
}

export function closeDayDetailSheet(doc) {
  if (!doc) return;
  const sheet = doc.getElementById('dayDetailSheet');
  const backdrop = doc.getElementById('dayDetailBackdrop');
  if (!sheet || !backdrop) return;
  sheet.dataset.open = 'false';
  sheet.style.transform = 'translateY(100%)';
  backdrop.dataset.open = 'false';
  backdrop.style.opacity = '0';
  backdrop.style.pointerEvents = 'none';
  sheet._onDelete = null;
}

export function wireDayDetailSheet(doc) {
  if (!doc) return { wired: 0 };
  const sheet = doc.getElementById('dayDetailSheet');
  const backdrop = doc.getElementById('dayDetailBackdrop');
  if (!sheet || !backdrop) return { wired: 0 };
  if (sheet.dataset.spaHooked === '1') return { wired: 0 };
  sheet.dataset.spaHooked = '1';

  backdrop.addEventListener('click', () => closeDayDetailSheet(doc));

  sheet.addEventListener('click', async (e) => {
    const btn = e.target?.closest?.('[data-day-detail-action]');
    if (!btn) return;
    const action = btn.getAttribute('data-day-detail-action');
    if (action === 'cancel') {
      closeDayDetailSheet(doc);
      return;
    }
    if (action === 'delete-confirm') {
      const fn = sheet._onDelete;
      const iso = sheet.dataset.iso || '';
      closeDayDetailSheet(doc);
      if (typeof fn === 'function') {
        try { await fn(iso); } catch (err) { console.error('[gymDayDetail] delete', err); }
      }
    }
  });

  return { wired: 1 };
}

/**
 * 캘린더 컨테이너에 pointer 이벤트 위임.
 *  onTap(iso)       : <longPressMs tap
 *  onLongPress(iso) : ≥longPressMs hold
 * pointermove > 8px / pointercancel / pointerleave 시 timer cancel.
 */
export function attachCalendarTapHandlers(container, {
  cellSelector,
  isoExtractor,
  onTap,
  onLongPress,
  longPressMs = 500,
} = {}) {
  if (!container || typeof isoExtractor !== 'function') return;
  if (container.dataset.spaTapsHooked === '1') return;
  container.dataset.spaTapsHooked = '1';

  let timerId = null;
  let startX = 0;
  let startY = 0;
  let trackedIso = '';
  let longPressFired = false;

  const cancel = () => {
    if (timerId !== null) { clearTimeout(timerId); timerId = null; }
    trackedIso = '';
    longPressFired = false;
  };

  container.addEventListener('pointerdown', (e) => {
    const cell = cellSelector ? e.target?.closest?.(cellSelector) : e.target;
    if (!cell) return;
    const iso = isoExtractor(cell);
    if (!iso) return;
    trackedIso = iso;
    startX = e.clientX || 0;
    startY = e.clientY || 0;
    longPressFired = false;
    timerId = setTimeout(() => {
      longPressFired = true;
      timerId = null;
      if (typeof onLongPress === 'function') {
        try { onLongPress(trackedIso); } catch (err) { console.error('[gymDayDetail] longPress', err); }
      }
    }, longPressMs);
  });

  container.addEventListener('pointermove', (e) => {
    if (!trackedIso) return;
    const dx = Math.abs((e.clientX || 0) - startX);
    const dy = Math.abs((e.clientY || 0) - startY);
    if (dx > 8 || dy > 8) cancel();
  });

  container.addEventListener('pointerup', () => {
    if (!trackedIso) return;
    const iso = trackedIso;
    const fired = longPressFired;
    if (timerId !== null) { clearTimeout(timerId); timerId = null; }
    trackedIso = '';
    longPressFired = false;
    if (fired) return;
    if (typeof onTap === 'function') {
      try { onTap(iso); } catch (err) { console.error('[gymDayDetail] tap', err); }
    }
  });

  container.addEventListener('pointercancel', cancel);
  container.addEventListener('pointerleave', cancel);
}

export const __test__ = { formatDayLabel };
