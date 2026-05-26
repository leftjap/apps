/**
 * Supabase 클라이언트 단일 인스턴스 (Wave 11.19 · spec §3 · Wave 11.18 후속).
 *
 * Wave 11.19 변경:
 *  - `@supabase/supabase-js` 제거 → `@supabase/auth-js` (AuthClient) + `@supabase/postgrest-js` (PostgrestClient) 직접 사용.
 *  - Realtime/Functions/Storage 의존성 완전 제거 (Study 사용 0건).
 *  - bundle 청크 197 kB → ~80 kB 목표.
 *
 * 아키텍처:
 *  - `AuthClient` — `${SUPABASE_URL}/auth/v1` + apikey + Authorization 헤더 + PKCE flow.
 *  - `PostgrestClient` — `${SUPABASE_URL}/rest/v1` + apikey 헤더. 초기 Authorization 은 anon key.
 *  - `onAuthStateChange` listener — session.access_token 변경 시 PostgrestClient 의 mutable Headers 갱신
 *    (postgrest-js L4702: `this.headers = new Headers(headers)` 가 Headers 인스턴스 → `.set()` 으로 런타임 mutate).
 *
 * 통합 wrapper export 형식:
 *  - `supabase.auth.*` — AuthClient 인스턴스 그대로 (.getSession / .onAuthStateChange / .signInWithOAuth / .signOut 동일 시그니처).
 *  - `supabase.from(table)` — PostgrestClient.from 으로 위임.
 *  - 기존 호출부 (auth.js / sync.js) 변경 0.
 *
 * env 누락 시:
 *  - 두 클라이언트 모두 인스턴스화 안 함.
 *  - `supabase = null` → auth.js 가 null 체크 후 모든 호출 no-op + 콘솔 경고.
 *
 * import.meta.env 는 빌드 타임 인라인 → 런타임 변경 불가.
 */
import { AuthClient } from '@supabase/auth-js';
import { PostgrestClient } from '@supabase/postgrest-js';
import { createIndexedDBStorage } from './auth-storage.js';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;

let _supabase = null;
let _envWarned = false;

function warnEnvMissing() {
  if (_envWarned) return;
  _envWarned = true;
  console.warn(
    '[supabase] VITE_SUPABASE_URL 또는 VITE_SUPABASE_ANON_KEY 미설정. ' +
    'docs/oauth-setup.md 의 1단계 참고해 .env.local 을 작성하세요. 인증 기능 비활성.',
  );
}

if (SUPABASE_URL && SUPABASE_ANON_KEY) {
  const authHeaders = {
    Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
    apikey: SUPABASE_ANON_KEY,
  };

  const _storageKey = `sb-${new URL(SUPABASE_URL).hostname.split('.')[0]}-auth-token`;
  const authClient = new AuthClient({
    url: `${SUPABASE_URL}/auth/v1`,
    headers: authHeaders,
    storageKey: _storageKey,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: true,
    // PKCE flow — iOS PWA standalone 안전성 향상 (implicit grant 보다 권장)
    flowType: 'pkce',
    // iOS Safari ITP 7일 룰 회피 — localStorage 대신 IndexedDB.
    storage: createIndexedDBStorage({ legacyLocalStorageKey: _storageKey }),
  });

  const postgrestClient = new PostgrestClient(`${SUPABASE_URL}/rest/v1`, {
    headers: {
      apikey: SUPABASE_ANON_KEY,
      Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
    },
  });

  // Token 갱신 wiring — supabase-js 의 internal _handleTokenChanged 패턴 (index.mjs L561-566) 의 외부 구현.
  // postgrest-js 의 this.headers 는 Headers 인스턴스 (mutable). .set() 으로 런타임 갱신.
  authClient.onAuthStateChange((event, session) => {
    const token = session?.access_token;
    if (token) {
      postgrestClient.headers.set('Authorization', `Bearer ${token}`);
    } else {
      // SIGNED_OUT 또는 INITIAL_SESSION 에 session 없음 — anon key 로 fallback.
      postgrestClient.headers.set('Authorization', `Bearer ${SUPABASE_ANON_KEY}`);
    }
  });

  _supabase = {
    auth: authClient,
    from: (table) => postgrestClient.from(table),
  };
} else {
  warnEnvMissing();
}

/** Supabase 클라이언트 wrapper. env 누락 시 null. */
export const supabase = _supabase;

/** env 가 정상 설정됐는지 여부. login.html 등에서 안내용. */
export const isSupabaseConfigured = Boolean(_supabase);

/** auth 토큰 저장 키 (세션 백업 모듈이 별도 백업 키 파생에 사용). AuthClient storageKey 와 동일 식. */
export const storageKey = SUPABASE_URL
  ? `sb-${new URL(SUPABASE_URL).hostname.split('.')[0]}-auth-token`
  : null;
