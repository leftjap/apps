/**
 * 프로필 화면 어댑터 (Wave 11.7.6 · spec §10-3).
 *
 * 책임:
 *  - settings (height / birthYear / goalWeight / weeklyGoal) 4 필드 hydrate.
 *  - 필드 click → inline number input prompt → upsertUserSettings → re-render.
 *
 * 의존성: queries.js 의 getUserSettings / upsertUserSettings (Wave 11.7.1 완비).
 *
 * mocks 허브(iframe)에선 db() 가 throw → renderProfileTab graceful no-op (fixture 보존).
 */

import { getUserSettings, upsertUserSettings } from '../db/queries.js';

export const FIELD_DEFS = Object.freeze({
  height: {
    setting: 'height',
    label: '키',
    unit: 'cm',
    fallback: 173,
    parse: (s) => {
      const n = Number(String(s).trim());
      if (!Number.isFinite(n) || n < 100 || n > 250) return null;
      return Math.round(n);
    },
    format: (v) => v == null ? '—' : `${v} cm`,
  },
  birthyear: {
    setting: 'birthYear',
    label: '생년',
    unit: '',
    fallback: null,
    parse: (s) => {
      const n = Number(String(s).trim());
      if (!Number.isFinite(n) || n < 1900 || n > 2100) return null;
      return Math.round(n);
    },
    format: (v) => v == null ? '—' : String(v),
  },
  'goal-weight': {
    setting: 'goalWeight',
    label: '목표 체중',
    unit: 'kg',
    fallback: 69,
    parse: (s) => {
      const n = Number(String(s).trim().replace(',', '.'));
      if (!Number.isFinite(n) || n <= 0 || n > 300) return null;
      return Math.round(n * 10) / 10;
    },
    format: (v) => v == null ? '—' : `${v} kg`,
  },
  'weekly-goal': {
    setting: 'weeklyGoal',
    label: '주간 목표',
    unit: '회',
    fallback: 4,
    parse: (s) => {
      const n = Number(String(s).trim());
      if (!Number.isFinite(n) || n < 1 || n > 7) return null;
      return Math.round(n);
    },
    format: (v) => v == null ? '—' : `${v} 회`,
  },
});

export const PROFILE_FIELD_KEYS = Object.freeze(Object.keys(FIELD_DEFS));

/**
 * 프로필 페이지 진입 시 호출 — 4 필드의 .f-val 텍스트를 settings 실값으로 갱신.
 * mocks 허브(window.gymQueries 미할당) 또는 db() throw 시 graceful no-op.
 */
export async function renderProfileTab(root) {
  const doc = root || (typeof document !== 'undefined' ? document : null);
  if (!doc) return { skipped: 'no-document' };
  let settings;
  try {
    settings = await getUserSettings();
  } catch (e) {
    if (e && /window\.gymDB 미초기화/.test(String(e.message))) {
      return { skipped: 'no-db' };
    }
    console.error('[profile] getUserSettings 실패', e);
    return { error: e?.message };
  }
  for (const fieldKey of PROFILE_FIELD_KEYS) {
    const def = FIELD_DEFS[fieldKey];
    const btn = doc.querySelector(`[data-field="${fieldKey}"]`);
    if (!btn) continue;
    const valEl = btn.querySelector('.f-val');
    if (!valEl) continue;
    const v = settings[def.setting] ?? def.fallback;
    // hint span 보존 (예: 주간 목표의 "1~7" hint)
    const hint = valEl.querySelector('.hint');
    valEl.textContent = def.format(v);
    if (hint) valEl.appendChild(hint);
  }
  return { rendered: true, settingsSnapshot: settings };
}

/**
 * 필드 click 핸들러 — prompt 로 새 값 입력 → 검증 → upsertUserSettings → 재렌더.
 * 사용자 cancel 또는 잘못된 입력은 no-op.
 */
export async function editProfileField(fieldKey, root, promptFn) {
  const def = FIELD_DEFS[fieldKey];
  if (!def) return { ok: false, reason: 'unknown_field' };
  const doc = root || (typeof document !== 'undefined' ? document : null);
  if (!doc) return { ok: false, reason: 'no-document' };
  let settings;
  try {
    settings = await getUserSettings();
  } catch (e) {
    if (e && /window\.gymDB 미초기화/.test(String(e.message))) {
      return { ok: false, reason: 'no-db' };
    }
    return { ok: false, reason: 'error', error: e?.message };
  }
  const current = settings[def.setting] ?? def.fallback;
  const ask = typeof promptFn === 'function'
    ? promptFn
    : (msg, defVal) => (typeof window !== 'undefined' && typeof window.prompt === 'function')
        ? window.prompt(msg, defVal)
        : null;
  const raw = ask(`${def.label} (${def.unit})`, current == null ? '' : String(current));
  if (raw == null || raw === '') return { ok: false, reason: 'cancelled' };
  const parsed = def.parse(raw);
  if (parsed == null) return { ok: false, reason: 'invalid_input', input: raw };
  await upsertUserSettings({ [def.setting]: parsed });
  await renderProfileTab(doc);
  return { ok: true, fieldKey, value: parsed };
}

/* mocks 허브 inline script 접근용 */
if (typeof window !== 'undefined') {
  window.gymProfile = {
    PROFILE_FIELD_KEYS,
    FIELD_DEFS,
    renderProfileTab,
    editProfileField,
  };
}
