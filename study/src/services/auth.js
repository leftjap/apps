/**
 * 인증 어댑터 (Wave 11.12 · spec §3).
 *
 * 책임:
 *  - Supabase Auth (Google OAuth) wrapper.
 *  - 허용 이메일 allowlist 검증 (spec §3).
 *  - userHash(user) → Dexie DB 이름 분리용 (spec §4).
 *  - signOut 시 Dexie close 콜백 호출 (등록된 핸들러 전부).
 *  - mocks IIFE 접근용 `window.studyAuth` 노출.
 *
 * env 미설정(supabase=null) 시 모든 호출 no-op + 콘솔 경고.
 */
import { supabase, isSupabaseConfigured } from './supabase.js';
import { markExplicitSignOut } from './auth-session-guard.js';
import { createStudyDB } from '../db/schema.js';
import { backfill20260504 } from '../db/backfill20260504.js';

/** spec §3 — 허용 이메일 (대소문자 무관, 공백 trim) */
export const ALLOWED_EMAILS = Object.freeze([
  'leftjap@gmail.com',
  'soyoun312@gmail.com',
  'causencompany@gmail.com',
]);

/** localStorage key — login 화면이 비허용 이메일 차단 결과 표시용. */
export const AUTH_ERROR_KEY = 'studyAuthError';

const _signOutCallbacks = new Set();

/** 현재 활성 Dexie 인스턴스 (사용자 격리). 미인증 시 null. */
let _currentDB = null;
let _currentDBName = null;
/** 동시 ensureUserDB 호출 race 방지용 in-flight Promise. */
let _initPromise = null;

function warnNotConfigured(fn) {
  console.warn(`[auth] supabase 미설정 — ${fn} 호출 무시.`);
}

/** 현재 세션. supabase 미설정·로그인 안 됨 → null. */
async function getSession() {
  if (!supabase) return null;
  const { data, error } = await supabase.auth.getSession();
  if (error) {
    console.error('[auth] getSession 실패', error);
    return null;
  }
  return data.session ?? null;
}

/** 현재 user (편의). settings 프로필 hydrate 등에서 사용. */
async function getCurrentUser() {
  const session = await getSession();
  return session?.user ?? null;
}

/**
 * Auth state 구독.
 * cb(event, session) — event: SIGNED_IN | SIGNED_OUT | TOKEN_REFRESHED | USER_UPDATED ...
 * 반환: unsubscribe 함수.
 */
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
async function signInWithPassword(email, password) {
  if (!supabase) {
    warnNotConfigured('signInWithPassword');
    return { error: new Error('Supabase 미설정') };
  }
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) console.error('[auth] signInWithPassword 실패', error);
  return { data, error };
}

/** Google OAuth 시작 — 브라우저가 redirect 됨. */
async function signInWithGoogle() {
  if (!supabase) {
    warnNotConfigured('signInWithGoogle');
    return { error: new Error('Supabase 미설정') };
  }
  // redirectTo: 같은 origin 으로 돌아옴. PWA standalone 도 manifest start_url 과 일치하므로 자동 복귀.
  // 해시 라우터 사용 → 토큰 fragment 와 충돌 없음 (Supabase 가 detectSessionInUrl 로 자동 처리 후 정리).
  // base path 포함 (GitHub Pages 서브경로 배포 시 origin 만으로는 다른 앱으로 redirect 됨).
  const redirectTo = typeof window !== 'undefined'
    ? window.location.origin + import.meta.env.BASE_URL
    : undefined;
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo },
  });
  if (error) {
    console.error('[auth] signInWithGoogle 실패', error);
  }
  return { data, error };
}

/** 로그아웃 + Dexie close + 외부 cleanup 콜백 호출. */
async function signOut() {
  // 1) 외부 cleanup 콜백 (등록된 옵저버 등)
  for (const cb of _signOutCallbacks) {
    try { await cb(); } catch (e) { console.error('[auth] signOut cleanup 실패', e); }
  }
  // 2) Dexie close — 다음 로그인에서 새 인스턴스 보장
  closeUserDB();
  // 3) Supabase 세션 종료
  if (!supabase) {
    warnNotConfigured('signOut');
    return;
  }
  markExplicitSignOut();
  const { error } = await supabase.auth.signOut();
  if (error) console.error('[auth] signOut 실패', error);
}

/**
 * user 기반 Dexie 인스턴스 보장.
 * 같은 user 면 기존 인스턴스 재사용, 다른 user 면 close 후 재생성.
 * window.studyDB 동적 할당 → mocks 의 `const db = window.studyDB` 가 즉시 새 인스턴스 참조.
 *
 * 동시성:
 *  - 동시 호출 시 _initPromise 로 직렬화 (signOut → 즉시 재로그인 race 방지).
 *  - in-flight 중 다른 user 호출이면 첫 호출 종료 후 두 번째 실행 (lock 안 놓침).
 */
async function ensureUserDB(user) {
  if (!user?.id) return null;
  // in-flight init 있으면 먼저 종료 대기 (같은 user 면 결과 재사용, 다른 user 면 그 위에 다시 init)
  if (_initPromise) {
    await _initPromise.catch(() => {});
  }
  // 빠른 경로: 이미 같은 user db 활성
  const hash = await userHash(user);
  const dbName = 'study_' + hash;
  if (_currentDB && _currentDBName === dbName) return _currentDB;
  // 슬로우 경로: lock 잡고 인스턴스 교체
  _initPromise = (async () => {
    if (_currentDB) {
      try { _currentDB.close(); } catch (e) { console.error('[auth] prev db close 실패', e); }
    }
    _currentDB = createStudyDB(dbName);
    _currentDBName = dbName;
    if (typeof window !== 'undefined') window.studyDB = _currentDB;
    try { await backfill20260504(_currentDB); }
    catch (e) { console.error('[backfill 2026-05-04] failed', e); }
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
  if (typeof window !== 'undefined') window.studyDB = null;
}

/** 로그아웃 시 호출할 cleanup (Dexie close 등) 등록. 반환: unregister. */
function registerOnSignOut(cb) {
  _signOutCallbacks.add(cb);
  return () => _signOutCallbacks.delete(cb);
}

/** 허용 이메일 검증 (대소문자 무관). */
function isAllowedEmail(email) {
  if (!email) return false;
  const normalized = String(email).trim().toLowerCase();
  return ALLOWED_EMAILS.includes(normalized);
}

/**
 * user.id (UUID) 를 sha256 → hex 12자 hash.
 * Dexie DB 이름 `study_<hash>` 용. 사용자 2명 환경에서 충돌 0 (12 hex = 48 bits).
 * Web Crypto API 사용 — 모든 모던 브라우저 + iOS Safari 지원.
 */
async function userHash(user) {
  if (!user?.id) throw new Error('userHash: user.id 누락');
  const buf = new TextEncoder().encode(user.id);
  const digest = await crypto.subtle.digest('SHA-256', buf);
  const bytes = new Uint8Array(digest);
  let hex = '';
  for (let i = 0; i < 6; i++) hex += bytes[i].toString(16).padStart(2, '0');
  return hex; // 12 hex chars
}

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
  window.studyAuth = Auth;
}

export default Auth;
