/**
 * 인증 어댑터 (Wave 11.4 — Wave 11.5.1 확장 — Gym 11.7 / Study 11.12 패턴 답습).
 *
 * 책임:
 *  - Supabase Auth (Google OAuth) wrapper
 *  - 허용 이메일 allowlist 검증 (커플 2계정 고정)
 *  - userHash(user) → 사용자별 IndexedDB 이름 격리 (Wave 11.5.1)
 *  - ensureUserDB / closeUserDB — Dexie 인스턴스 동적 할당 (Wave 11.5.1)
 *  - signOut cleanup 콜백 (Realtime unsubscribe 등 등록)
 *  - mocks IIFE 접근용 `window.todayAuth` 노출
 *
 * env 미설정(supabase=null) 시 Auth 호출 no-op + 콘솔 경고.
 * Dexie 는 supabase 없어도 동작 (오프라인 우선) — 단 user.id 가 있어야 ensureUserDB 가능.
 */
import { supabase, isSupabaseConfigured, storageKey } from './supabase.js';
import { markExplicitSignOut } from './auth-session-guard.js';
import { clearBackup } from './auth-session-backup.js';
import { createTodayDB } from '../db/schema.js';

/** 허용 이메일 (대소문자 무관) — Gym/Study 와 동일 allowlist 공유. */
export const ALLOWED_EMAILS = Object.freeze([
  'leftjap@gmail.com',
  'soyoun312@gmail.com',
  'causencompany@gmail.com', // 디버깅 전용 (chrome-devtools attach 격리)
]);

export const AUTH_ERROR_KEY = 'todayAuthError';

const _signOutCallbacks = new Set();
let _currentDB = null;
let _currentDBName = null;
let _initPromise = null;

function warnNotConfigured(fn) {
  console.warn(`[auth] supabase 미설정 — ${fn} 호출 무시.`);
}

// ───────────────────────────────────────────────────────────────────────────
// 세션 / OAuth
// ───────────────────────────────────────────────────────────────────────────

async function getSession() {
  if (!supabase) return null;
  const { data, error } = await supabase.auth.getSession();
  if (error) {
    console.error('[auth] getSession 실패', error);
    return null;
  }
  return data.session ?? null;
}

async function getCurrentUser() {
  const session = await getSession();
  return session?.user ?? null;
}

function onAuthStateChange(cb) {
  if (!supabase) {
    warnNotConfigured('onAuthStateChange');
    return () => {};
  }
  const { data } = supabase.auth.onAuthStateChange((event, session) => {
    cb(event, session);
  });
  return () => data.subscription?.unsubscribe();
}

/**
 * Email + password 로그인 — preview / E2E 검증 전용.
 * production 사용자 흐름은 OAuth 한정. Supabase Dashboard 에서 계정 사전 생성 필요.
 * ALLOWED_EMAILS 게이트는 OAuth 와 동일하게 적용됨.
 */
async function signInWithPassword({ email, password } = {}) {
  if (!supabase) {
    warnNotConfigured('signInWithPassword');
    return { error: new Error('Supabase 미설정') };
  }
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) console.error('[auth] signInWithPassword 실패', error);
  return { data, error };
}

async function signInWithGoogle() {
  if (!supabase) {
    warnNotConfigured('signInWithGoogle');
    return { error: new Error('Supabase 미설정') };
  }
  // base path 포함 (GitHub Pages 서브경로 배포 시 origin 만으로는 다른 앱으로 redirect 됨).
  const redirectTo = typeof window !== 'undefined'
    ? window.location.origin + import.meta.env.BASE_URL
    : undefined;
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo },
  });
  if (error) console.error('[auth] signInWithGoogle 실패', error);
  return { data, error };
}

async function signOut() {
  // 1) 외부 cleanup 콜백 (Realtime unsubscribe 등 등록)
  for (const cb of _signOutCallbacks) {
    try { await cb(); } catch (e) { console.error('[auth] signOut cleanup 실패', e); }
  }
  // 2) Dexie close
  closeUserDB();
  // 3) Supabase 세션 종료
  if (!supabase) {
    warnNotConfigured('signOut');
    return;
  }
  markExplicitSignOut();
  clearBackup(storageKey); // 명시 로그아웃 — 백업 폐기로 자동복원 부활 차단
  // scope:'local' — 이 기기/앱만 로그아웃. 전역(global) 은 같은 계정의 타 기기·타 앱 세션까지 폭파.
  const { error } = await supabase.auth.signOut({ scope: 'local' });
  if (error) console.error('[auth] signOut 실패', error);
}

function registerOnSignOut(cb) {
  _signOutCallbacks.add(cb);
  return () => _signOutCallbacks.delete(cb);
}

function isAllowedEmail(email) {
  if (!email) return false;
  const normalized = String(email).trim().toLowerCase();
  return ALLOWED_EMAILS.includes(normalized);
}

// ───────────────────────────────────────────────────────────────────────────
// userHash + ensureUserDB + closeUserDB (Wave 11.5.1)
// ───────────────────────────────────────────────────────────────────────────

/**
 * user.id (UUID) 를 sha256 → hex 12자.
 * Dexie DB 이름 `today_<hash>` 용. 사용자 2명 환경에서 충돌 0 (12 hex = 48 bits).
 */
async function userHash(user) {
  if (!user?.id) throw new Error('userHash: user.id 누락');
  const buf = new TextEncoder().encode(user.id);
  const digest = await crypto.subtle.digest('SHA-256', buf);
  const bytes = new Uint8Array(digest);
  let hex = '';
  for (let i = 0; i < 6; i++) hex += bytes[i].toString(16).padStart(2, '0');
  return hex;
}

/**
 * user 기반 Dexie 인스턴스 보장.
 * 같은 user 면 기존 인스턴스 재사용, 다른 user 면 close 후 재생성.
 * window.todayDB 동적 할당 → mocks 의 inline script 가 즉시 새 인스턴스 참조.
 *
 * 동시성:
 *  - 동시 호출 시 _initPromise 로 직렬화 (signOut → 재로그인 race 방지).
 */
async function ensureUserDB(user) {
  if (!user?.id) return null;
  if (_initPromise) {
    await _initPromise.catch(() => {});
  }
  const hash = await userHash(user);
  const dbName = 'today_' + hash;
  if (_currentDB && _currentDBName === dbName) return _currentDB;

  _initPromise = (async () => {
    if (_currentDB) {
      try { _currentDB.close(); } catch (e) { console.error('[auth] prev db close 실패', e); }
    }
    _currentDB = createTodayDB(dbName);
    _currentDBName = dbName;
    if (typeof window !== 'undefined') window.todayDB = _currentDB;
    return _currentDB;
  })();
  try { return await _initPromise; }
  finally { _initPromise = null; }
}

function closeUserDB() {
  if (_currentDB) {
    try { _currentDB.close(); } catch (e) { console.error('[auth] db close 실패', e); }
  }
  _currentDB = null;
  _currentDBName = null;
  _initPromise = null;
  if (typeof window !== 'undefined') window.todayDB = null;
}

// ───────────────────────────────────────────────────────────────────────────
// 노출
// ───────────────────────────────────────────────────────────────────────────

export const Auth = {
  ALLOWED_EMAILS,
  AUTH_ERROR_KEY,
  isSupabaseConfigured,
  getSession,
  getCurrentUser,
  onAuthStateChange,
  signInWithGoogle,
  signInWithPassword,
  signOut,
  registerOnSignOut,
  isAllowedEmail,
  userHash,
  ensureUserDB,
  closeUserDB,
};

if (typeof window !== 'undefined') {
  window.todayAuth = Auth;
}

export default Auth;
