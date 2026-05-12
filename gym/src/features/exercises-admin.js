/**
 * 운동 관리 화면 어댑터 (Wave 11.7.4b · spec §10-1).
 *
 * mocks/admin.html 은 ADMIN_EXERCISES 하드코딩 fixture 위에서 동작.
 * SPA 환경에서는 BUILTIN + custom 통합 리스트를 listExercisesForUser 로 hydrate.
 *
 * 책임:
 *   - renderExercisesTab(part) — 부위별 운동 리스트 동적 렌더링 (mocks 의 #adminExList 영역).
 *   - hookExerciseTabClicks — 부위 chip 클릭 / 숨기기 토글 / 커스텀 추가 폼 hook.
 *   - mocks 허브(iframe)에선 db() 가 throw → 모든 함수 graceful no-op.
 */

import {
  listExercisesForUser,
  toggleExerciseHidden,
  createCustomExercise,
  setExerciseOrderForPart,
} from '../db/queries.js';
import { PART_IDS, PARTS } from '../db/exercises.js';

const VIEW_ATTR = 'data-spa-managed';
let _activePart = 'chest';

/** 부위 chip + 운동 리스트 모두 hydrate. mocks fixture 는 덮어씀. */
export async function renderExercisesTab(root) {
  const doc = root || (typeof document !== 'undefined' ? document : null);
  if (!doc) return { skipped: 'no-document' };
  try {
    await renderPartsChips(doc);
    await renderExerciseList(doc);
    // mountManageView 가 별도로 click wiring 호출 안 함 → renderExercisesTab 가 wiring 도 보장
    // (Phase B 단계 4 manage shell 분리 회귀 복구). idempotent 가드 — hookExerciseTabClicks 내부.
    hookExerciseTabClicks(doc);
    return { rendered: true, part: _activePart };
  } catch (e) {
    if (e && /window\.gymDB 미초기화/.test(String(e.message))) {
      return { skipped: 'no-db' };
    }
    console.error('[exercises-admin] renderExercisesTab', e);
    return { error: e?.message };
  }
}

async function renderPartsChips(doc) {
  const partsEl = doc.getElementById('adminParts');
  if (!partsEl) return;
  // spec §11 6 부위만. mocks 의 'core' 등은 SPA 진입 시 사라짐.
  const html = PART_IDS.map(id => {
    const isActive = id === _activePart ? ' is-active' : '';
    const label = escapeHtml(PARTS[id]);
    return `<button class="part-chip${isActive}" data-part="${id}" ${VIEW_ATTR}="1">${label}</button>`;
  }).join('');
  partsEl.innerHTML = html;
}

async function renderExerciseList(doc) {
  const listEl = doc.getElementById('adminExList');
  if (!listEl) return;
  const list = await listExercisesForUser({ part: _activePart, includeHidden: true });
  if (!list.length) {
    listEl.innerHTML = `<div class="ex-empty" data-empty="1">이 부위에 등록된 운동이 없습니다.</div>`;
    return;
  }
  listEl.innerHTML = list.map(ex => renderRow(ex)).join('');
}

function renderRow(ex) {
  const visible = !ex.hidden;
  const meta = formatMeta(ex);
  const customCls = ex.custom ? ' is-custom' : '';
  const hiddenCls = visible ? '' : ' is-hidden';
  return `
    <div class="ex-row${hiddenCls}${customCls}" data-id="${escapeHtml(ex.id)}" ${VIEW_ATTR}="1">
      <span class="ex-grip" aria-hidden="true">
        <svg viewBox="0 0 16 16" fill="currentColor"><circle cx="5" cy="3" r="1.4"/><circle cx="11" cy="3" r="1.4"/><circle cx="5" cy="8" r="1.4"/><circle cx="11" cy="8" r="1.4"/><circle cx="5" cy="13" r="1.4"/><circle cx="11" cy="13" r="1.4"/></svg>
      </span>
      <span class="ex-name">${escapeHtml(ex.name)}</span>
      <span class="ex-meta">${escapeHtml(meta)}</span>
      <button class="ex-toggle${visible ? ' is-on' : ''}" data-toggle="${escapeHtml(ex.id)}" aria-label="${escapeHtml(ex.name)} 사용 여부"></button>
    </div>
  `;
}

function formatMeta(ex) {
  if (ex.equipment === 'cardio') {
    return `${ex.defaultSets ?? 1}회`;
  }
  if (ex.equipment === 'bodyweight') {
    return `맨몸 · ${ex.defaultReps}회`;
  }
  return `${ex.defaultWeight}kg × ${ex.defaultReps}회`;
}

/** SPA 환경에서 admin 진입 시 호출. 부위 click + 토글 click 위임 등록. idempotent (data-spa-hooked guard). */
export function hookExerciseTabClicks(root) {
  const doc = root || (typeof document !== 'undefined' ? document : null);
  if (!doc) return;
  const partsEl = doc.getElementById('adminParts');
  const listEl = doc.getElementById('adminExList');
  if (!partsEl || !listEl) return;
  // 중복 호출 (renderExercisesTab 가 매번 hookExerciseTabClicks 호출) 시 핸들러 중복 등록 방지
  if (partsEl.dataset.spaHooked === '1' && listEl.dataset.spaHooked === '1') return;

  // 위임: 부위 chip
  partsEl.addEventListener('click', async (e) => {
    const b = e.target.closest('[data-part]');
    if (!b) return;
    _activePart = b.dataset.part;
    await renderExercisesTab(doc);
  });

  // 위임: 운동 리스트 토글 (SPA 환경에서만 hookExerciseTabClicks 호출되므로 항상 SPA 모드)
  listEl.addEventListener('click', async (e) => {
    const t = e.target.closest('[data-toggle]');
    if (!t) return;
    const id = t.dataset.toggle;
    try {
      await toggleExerciseHidden(id);
      await renderExercisesTab(doc);
    } catch (err) {
      console.error('[exercises-admin] toggleExerciseHidden', err);
    }
  });

  hookExerciseDrag(listEl, doc);

  partsEl.dataset.spaHooked = '1';
  listEl.dataset.spaHooked = '1';
}

/**
 * §10-1 (drag handle) — .ex-grip pointerdown 즉시 grab.
 *  - 누르자마자 잡힘 (long-press 아님)
 *  - 같은 부위 (활성 탭) 내에서만 순서 변경
 *  - drop 시 setExerciseOrderForPart 로 영구 저장 (settings.exerciseOrder[part])
 */
function hookExerciseDrag(listEl, doc) {
  let state = null;

  listEl.addEventListener('pointerdown', (e) => {
    const grip = e.target?.closest?.('.ex-grip');
    if (!grip) return;
    const row = grip.closest('.ex-row');
    if (!row || !listEl.contains(row)) return;
    e.preventDefault();
    try { grip.setPointerCapture?.(e.pointerId); } catch (_) {}
    const rows = Array.from(listEl.querySelectorAll('.ex-row'));
    state = {
      pointerId: e.pointerId,
      grip, row, rows,
      startY: e.clientY,
      currentIndex: rows.indexOf(row),
      originalIndex: rows.indexOf(row),
    };
    row.classList.add('is-dragging');
  });

  listEl.addEventListener('pointermove', (e) => {
    if (!state || e.pointerId !== state.pointerId) return;
    const dy = e.clientY - state.startY;
    state.row.style.transform = `translateY(${dy}px)`;

    let newIndex = state.currentIndex;
    for (let i = 0; i < state.rows.length; i++) {
      if (i === state.currentIndex) continue;
      const other = state.rows[i];
      if (other === state.row) continue;
      const r = other.getBoundingClientRect();
      const centerY = r.top + r.height / 2;
      if (i < state.currentIndex && e.clientY < centerY) { newIndex = i; break; }
      if (i > state.currentIndex && e.clientY > centerY) newIndex = i;
    }
    if (newIndex !== state.currentIndex) {
      const ref = state.rows[newIndex];
      if (newIndex < state.currentIndex) listEl.insertBefore(state.row, ref);
      else listEl.insertBefore(state.row, ref.nextSibling);
      state.rows = Array.from(listEl.querySelectorAll('.ex-row'));
      state.currentIndex = state.rows.indexOf(state.row);
      const newRect = state.row.getBoundingClientRect();
      state.startY = e.clientY - (e.clientY - (newRect.top + newRect.height / 2));
      state.row.style.transform = `translateY(${e.clientY - state.startY}px)`;
    }
  });

  const endDrag = async (e) => {
    if (!state || (e && e.pointerId !== state.pointerId)) return;
    const { row, currentIndex, originalIndex, grip, pointerId } = state;
    try { grip.releasePointerCapture?.(pointerId); } catch (_) {}
    row.classList.remove('is-dragging');
    row.style.transform = '';
    const orderedIds = state.rows.map((r) => r.dataset.id).filter(Boolean);
    const changed = currentIndex !== originalIndex;
    state = null;
    if (!changed) return;
    try {
      await setExerciseOrderForPart(_activePart, orderedIds);
      await renderExercisesTab(doc);
    } catch (err) {
      console.error('[exercises-admin] setExerciseOrderForPart', err);
      await renderExercisesTab(doc);
    }
  };
  listEl.addEventListener('pointerup', endDrag);
  listEl.addEventListener('pointercancel', endDrag);
}

/**
 * 커스텀 운동 추가 (mocks 의 asSave 핸들러가 호출).
 * 호출자가 검증한 폼 데이터 받기. 성공 시 createCustomExercise + 재렌더 + 새 활성 부위로 전환.
 */
export async function createCustomExerciseFromForm(input, root) {
  const created = await createCustomExercise(input);
  _activePart = created.part;
  await renderExercisesTab(root);
  return created;
}

/** 활성 부위 반환 (mocks 의 IIFE 가 부위 변경 시 동기화 가능) */
export function getActivePart() { return _activePart; }
export function setActivePart(part) {
  if (PART_IDS.includes(part)) _activePart = part;
}

function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, (m) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[m]));
}

/* mocks 허브 inline script 접근용 */
if (typeof window !== 'undefined') {
  window.gymExercisesAdmin = {
    renderExercisesTab,
    hookExerciseTabClicks,
    createCustomExerciseFromForm,
    getActivePart,
    setActivePart,
  };
}
