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
    format: (v) => v == null ? '—' : String(v),
  },
  birthdate: {
    setting: 'birthDate',
    label: '생년월일',
    unit: 'YYYY.MM.DD',
    fallback: null,
    parse: (s) => {
      const m = String(s).trim().match(/^(\d{4})[.\-\/](\d{1,2})[.\-\/](\d{1,2})$/);
      if (!m) return null;
      const y = parseInt(m[1], 10), mo = parseInt(m[2], 10), d = parseInt(m[3], 10);
      if (y < 1900 || y > 2100 || mo < 1 || mo > 12 || d < 1 || d > 31) return null;
      return `${y}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    },
    format: (v) => {
      if (v == null) return '—';
      const m = String(v).match(/^(\d{4})-(\d{2})-(\d{2})$/);
      return m ? `${m[1]}.${m[2]}.${m[3]}` : String(v);
    },
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
    format: (v) => v == null ? '—' : String(v),
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
    format: (v) => v == null ? '—' : String(v),
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
  // §10-3 — 필드 click + 로그아웃 wiring (idempotent)
  try { wireProfileTab(doc); } catch (e) { console.error('[profile] wireProfileTab', e); }

  // §10-3 — 동기화 칩 + 사용자 정보 갱신 (실제 sync 상태 + Auth user)
  try { await renderSyncStatus(doc); } catch (e) { console.error('[profile] renderSyncStatus', e); }

  return { rendered: true, settingsSnapshot: settings };
}

/** 동기화 칩 + 사용자 정보 갱신 — window.gymSync.isSyncActive + window.gymAuth.getCurrentUser. */
export async function renderSyncStatus(doc) {
  doc = doc || (typeof document !== 'undefined' ? document : null);
  if (!doc) return { skipped: 'no-document' };
  const card = doc.querySelector('[data-bind="sync-card"]');
  const dot = doc.querySelector('[data-bind="sync-dot"]');
  const text = doc.querySelector('[data-bind="sync-text"]');
  const userEl = doc.querySelector('[data-bind="sync-user"]');
  if (!card || !dot || !text || !userEl) return { skipped: 'no-mounts' };

  const sync = typeof window !== 'undefined' ? window.gymSync : null;
  const auth = typeof window !== 'undefined' ? window.gymAuth : null;
  const active = sync?.isSyncActive?.() === true;
  let user = null;
  try { user = await auth?.getCurrentUser?.(); } catch (_) { user = null; }

  // 상태 분류: 활성=정상(sage) / 비활성+user=대기(amber) / user 없음=로그인 필요(accent)
  if (active) {
    text.textContent = '동기화 정상';
    text.style.color = 'var(--sage-soft)';
    dot.style.background = 'var(--sage)';
    dot.style.boxShadow = '0 0 8px var(--sage)';
    card.style.background = 'rgba(120,140,93,0.10)';
    card.style.borderColor = 'rgba(120,140,93,0.25)';
  } else if (user) {
    text.textContent = '동기화 대기';
    text.style.color = 'rgba(217,180,87,0.85)';
    dot.style.background = 'rgba(217,180,87,0.85)';
    dot.style.boxShadow = '0 0 8px rgba(217,180,87,0.5)';
    card.style.background = 'rgba(217,180,87,0.08)';
    card.style.borderColor = 'rgba(217,180,87,0.22)';
  } else {
    text.textContent = '로그인 필요';
    text.style.color = 'var(--accent)';
    dot.style.background = 'var(--accent)';
    dot.style.boxShadow = '0 0 8px var(--accent)';
    card.style.background = 'rgba(217,119,87,0.08)';
    card.style.borderColor = 'rgba(217,119,87,0.22)';
  }

  if (user) {
    const name = user.user_metadata?.full_name || user.user_metadata?.name || user.email?.split('@')[0] || '—';
    userEl.textContent = `${name} · ${user.email || '—'}`;
  } else {
    userEl.textContent = '로그인하지 않음';
  }
  return { active, hasUser: !!user };
}

/**
 * §10-3 — 프로필 필드 click → editProfileField, 로그아웃 → Auth.signOut.
 * idempotent: 각 element 에 dataset.spaHooked='1' 가드.
 */
export function wireProfileTab(doc) {
  doc = doc || (typeof document !== 'undefined' ? document : null);
  if (!doc) return { wired: 0 };
  let wired = 0;
  for (const key of PROFILE_FIELD_KEYS) {
    const el = doc.querySelector(`[data-field="${key}"]`);
    if (!el || el.dataset.spaHooked === '1') continue;
    el.style.cursor = 'pointer';
    el.addEventListener('click', () => {
      editProfileField(key, doc).catch((e) => console.error('[profile] editProfileField', key, e));
    });
    el.dataset.spaHooked = '1';
    wired += 1;
  }
  const logout = doc.querySelector('[data-bind="logout-trigger"]');
  if (logout && logout.dataset.spaHooked !== '1') {
    logout.addEventListener('click', async () => {
      if (typeof window === 'undefined' || !window.confirm?.('로그아웃하시겠습니까?')) return;
      try { await window.gymAuth?.signOut?.(); }
      catch (e) { console.error('[profile] signOut', e); }
    });
    logout.dataset.spaHooked = '1';
    wired += 1;
  }
  return { wired };
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
    wireProfileTab,
    renderSyncStatus,
  };
}
