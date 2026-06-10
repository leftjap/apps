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
  setExerciseDeleted,
  createCustomExercise,
  setExerciseOrderForPart,
  deleteCustomExercise,
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
        <svg viewBox="0 0 16 16" fill="currentColor"><rect x="2" y="3.5" width="12" height="1.5" rx="0.75"/><rect x="2" y="7.25" width="12" height="1.5" rx="0.75"/><rect x="2" y="11" width="12" height="1.5" rx="0.75"/></svg>
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
  hookCustomAddButton(doc);
  hookCustomLongPressDelete(listEl, doc);

  partsEl.dataset.spaHooked = '1';
  listEl.dataset.spaHooked = '1';
}

/**
 * 커스텀 운동 long-press(500ms) → 삭제 확인 → deleteCustomExercise.
 *  - .ex-row.is-custom 만 대상 (빌트인은 toggle hidden 만 지원, 코드 카탈로그라 삭제 불가)
 *  - .ex-grip 영역은 drag 우선 (grip 위 pointerdown 은 long-press 무시)
 *  - pointermove > 8px / pointercancel / pointerleave 시 timer cancel
 */
function hookCustomLongPressDelete(listEl, doc) {
  let timerId = null;
  let trackedRow = null;
  let startX = 0, startY = 0;
  const cancel = () => {
    if (timerId !== null) { clearTimeout(timerId); timerId = null; }
    trackedRow = null;
  };
  const closeMenus = () => {
    doc.querySelectorAll('[data-bind="row-action-menu"]').forEach(m => m.remove());
  };
  listEl.addEventListener('pointerdown', (e) => {
    if (e.target?.closest?.('.ex-grip')) return;
    if (e.target?.closest?.('[data-toggle]')) return;
    if (e.target?.closest?.('[data-bind="row-action-menu"]')) return;
    const row = e.target?.closest?.('.ex-row');
    if (!row) return;
    trackedRow = row;
    startX = e.clientX || 0;
    startY = e.clientY || 0;
    timerId = setTimeout(() => {
      timerId = null;
      const id = trackedRow?.dataset?.id;
      const isCustom = trackedRow?.classList?.contains('is-custom');
      trackedRow = null;
      if (!id) return;
      closeMenus();
      const row2 = listEl.querySelector(`.ex-row[data-id="${CSS.escape(id)}"]`);
      if (!row2) return;
      const menu = doc.createElement('div');
      menu.dataset.bind = 'row-action-menu';
      menu.style.cssText = 'display:flex;gap:6px;padding:8px 18px;background:var(--hover-bg);border-radius:var(--r-sm);';
      // 커스텀·빌트인 모두 '삭제' = 실제 제거. 커스텀은 DB 행 삭제, 빌트인은 코드 카탈로그라
      // settings.deletedExercises 에 기록해 영속 제거 (목록·운동선택 어디에도 안 보임).
      const btns = [
        { act: 'delete', label: '삭제', color: 'var(--danger)' },
        { act: 'cancel', label: '취소', color: 'var(--ink-3)' },
      ];
      menu.innerHTML = btns.map(b => `<button type="button" data-act="${b.act}" style="flex:1;height:36px;border-radius:var(--r-sm);border:0;background:transparent;color:${b.color};cursor:pointer;font-size:15px;font-weight:600;">${b.label}</button>`).join('');
      row2.insertAdjacentElement('afterend', menu);
      menu.addEventListener('click', async (ev) => {
        const act = ev.target?.closest?.('[data-act]')?.dataset?.act;
        if (!act) return;
        menu.remove();
        if (act === 'cancel') return;
        try {
          if (act === 'delete') {
            if (isCustom) await deleteCustomExercise(id);
            else await setExerciseDeleted(id, true);
          }
          await renderExercisesTab(doc);
        } catch (err) { console.error('[exercises-admin] long-press action', err); }
      });
    }, 500);
  });
  listEl.addEventListener('pointermove', (e) => {
    if (!trackedRow) return;
    const dx = Math.abs((e.clientX || 0) - startX);
    const dy = Math.abs((e.clientY || 0) - startY);
    if (dx > 8 || dy > 8) cancel();
  });
  listEl.addEventListener('pointerup', cancel);
  listEl.addEventListener('pointercancel', cancel);
  listEl.addEventListener('pointerleave', cancel);
}

/**
 * §10-1 (custom add) — "+ 커스텀 운동 추가" 버튼 click → prompt 로 운동명 입력 →
 * createCustomExerciseFromForm 호출. 부위는 현재 활성 탭 (_activePart).
 * equipment 는 활성 탭이 cardio 면 cardio, 그 외엔 barbell default. 추후 편집 가능.
 */
function hookCustomAddButton(doc) {
  const trigger = doc.querySelector('[data-bind="custom-add-trigger"]');
  if (!trigger || trigger.dataset.spaHooked === '1') return;
  trigger.dataset.spaHooked = '1';
  trigger.addEventListener('click', () => {
    if (doc.querySelector('[data-bind="custom-add-form"]')) return;
    const form = doc.createElement('div');
    form.dataset.bind = 'custom-add-form';
    form.style.cssText = 'display:flex;gap:6px;padding:8px 0;';
    form.innerHTML = `<input type="text" placeholder="새 운동 이름" style="flex:1;height:44px;padding:0 14px;border-radius:var(--r-sm);border:1px solid var(--line);background:var(--card);color:var(--ink-1);font-size:16px;" /><button type="button" data-act="save" style="height:44px;padding:0 16px;border-radius:var(--r-sm);border:0;background:var(--ink-1);color:#fbf8f2;cursor:pointer;font-size:15px;font-weight:600;">저장</button><button type="button" data-act="cancel" style="height:44px;padding:0 14px;border-radius:var(--r-sm);border:0;background:transparent;color:var(--ink-3);cursor:pointer;font-size:15px;font-weight:500;">취소</button>`;
    trigger.insertAdjacentElement('afterend', form);
    const input = form.querySelector('input');
    const close = () => form.remove();
    const save = async () => {
      const name = input.value.trim();
      if (!name) return;
      const equipment = _activePart === 'cardio' ? 'cardio' : 'barbell';
      try {
        await createCustomExerciseFromForm({ name, part: _activePart, equipment }, doc);
        close();
      } catch (e) { console.error('[exercises-admin] createCustomExerciseFromForm', e); }
    };
    form.querySelector('[data-act="cancel"]').addEventListener('click', close);
    form.querySelector('[data-act="save"]').addEventListener('click', save);
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') save();
      else if (e.key === 'Escape') close();
    });
    setTimeout(() => input.focus(), 0);
  });
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
    const rect = row.getBoundingClientRect();
    state = {
      pointerId: e.pointerId,
      grip, row, rows,
      startY: e.clientY,
      rowHeight: rect.height,
      originalIndex: rows.indexOf(row),
      currentIndex: rows.indexOf(row),
    };
    row.classList.add('is-dragging');
  });

  listEl.addEventListener('pointermove', (e) => {
    if (!state || e.pointerId !== state.pointerId) return;
    const dy = e.clientY - state.startY;
    state.row.style.transform = `translateY(${dy}px)`;

    const slot = Math.round(dy / state.rowHeight);
    let newIndex = state.originalIndex + slot;
    if (newIndex < 0) newIndex = 0;
    if (newIndex > state.rows.length - 1) newIndex = state.rows.length - 1;
    if (newIndex === state.currentIndex) return;
    state.currentIndex = newIndex;

    // 사이 row 들 슬라이드 — 잡힌 row 는 baseline 자리에 그대로 두고 다른 row 만 transform
    for (let i = 0; i < state.rows.length; i++) {
      const r = state.rows[i];
      if (r === state.row) continue;
      let shift = 0;
      if (newIndex >= state.originalIndex && i > state.originalIndex && i <= newIndex) {
        shift = -state.rowHeight;
      } else if (newIndex < state.originalIndex && i >= newIndex && i < state.originalIndex) {
        shift = state.rowHeight;
      }
      r.style.transform = shift ? `translateY(${shift}px)` : '';
    }
  });

  const endDrag = async (e) => {
    if (!state || (e && e.pointerId !== state.pointerId)) return;
    const { row, rows, currentIndex, originalIndex, grip, pointerId, rowHeight } = state;
    try { grip.releasePointerCapture?.(pointerId); } catch (_) {}
    state = null;

    if (currentIndex === originalIndex) {
      // 변경 없음 — 잡힌 row 만 transition 으로 원위치 (사이 row 는 이미 0)
      row.classList.remove('is-dragging');
      // double rAF — transition 활성화 paint flush 보장 후 transform 변경
      requestAnimationFrame(() => requestAnimationFrame(() => { row.style.transform = ''; }));
      return;
    }

    // 잡힌 row 를 새 자리까지 transition 으로 슬라이드 안착
    // is-dragging 제거 → transition 활성화 → double rAF 후 transform = targetDy 설정
    const targetDy = (currentIndex - originalIndex) * rowHeight;
    row.classList.remove('is-dragging');
    requestAnimationFrame(() => requestAnimationFrame(() => {
      row.style.transform = `translateY(${targetDy}px)`;
    }));

    // 가상 인덱스 기반 새 순서 계산
    const newOrder = rows.slice();
    newOrder.splice(originalIndex, 1);
    newOrder.splice(currentIndex, 0, row);

    // transition 완료 (200ms) 대기 → 실제 DOM 재배치 + transform reset (transition 잠시 off)
    await new Promise((r) => setTimeout(r, 210));
    rows.forEach((r) => { r.style.transition = 'none'; });
    newOrder.forEach((r) => listEl.appendChild(r));
    rows.forEach((r) => { r.style.transform = ''; });
    // 2 frame 후 transition 복원 (style flush 보장)
    requestAnimationFrame(() => requestAnimationFrame(() => {
      rows.forEach((r) => { r.style.transition = ''; });
    }));

    const orderedIds = newOrder.map((r) => r.dataset.id).filter(Boolean);
    try {
      await setExerciseOrderForPart(_activePart, orderedIds);
      // renderExercisesTab 재호출 제거 — innerHTML 통째 재생성 시 깜빡임 발생, DOM 은 이미 정확.
    } catch (err) {
      console.error('[exercises-admin] setExerciseOrderForPart', err);
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
