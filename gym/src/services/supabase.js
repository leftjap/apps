/**
 * Supabase 클라이언트 단일 인스턴스 (Wave 11.7 · spec §3 기반).
 *
 * env 누락 시:
 *  - createClient 호출하지 않음 (URL 없으면 throw 함).
 *  - `supabaseClient = null` → auth.js 가 null 체크 후 모든 호출 no-op + 콘솔 경고.
 *  - login.html 은 미설정 안내 banner 표시 (별 처리).
 *
 * import.meta.env 는 빌드 타임 인라인 → 런타임 변경 불가.
 *
 * Key 형식 호환: legacy JWT (eyJ...) + 신규 publishable (sb_publishable_...) 둘 다 동작.
 */
import { createClient } from '@supabase/supabase-js';
import { createIndexedDBStorage } from './auth-storage.js';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;

// 기존 localStorage 키 (createClient default = `sb-<projectref>-auth-token`).
// 명시해서 IDB storage 의 마이그 대상 키와 일치시킴.
const STORAGE_KEY = SUPABASE_URL
  ? `sb-${new URL(SUPABASE_URL).hostname.split('.')[0]}-auth-token`
  : null;

let _client = null;
let _envWarned = false;

function warnEnvMissing() {
  if (_envWarned) return;
  _envWarned = true;
  // catch 가 아니지만 captureConsoleIntegration 미적용 (일반 경고). Sentry 도입 후 재검토.
  console.warn(
    '[supabase] VITE_SUPABASE_URL 또는 VITE_SUPABASE_ANON_KEY 미설정. ' +
    'docs/oauth-setup.md 의 1단계 참고해 .env.local 을 작성하세요. 인증 기능 비활성.',
  );
}

if (SUPABASE_URL && SUPABASE_ANON_KEY) {
  _client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: {
      // PKCE flow — iOS PWA standalone 안전성 향상 (implicit grant 보다 권장)
      flowType: 'pkce',
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: true,
      // iOS Safari ITP 7일 룰 회피 — localStorage 대신 IndexedDB.
      storageKey: STORAGE_KEY,
      storage: createIndexedDBStorage({ legacyLocalStorageKey: STORAGE_KEY }),
    },
  });
} else {
  warnEnvMissing();
}

/** Supabase 클라이언트. env 누락 시 null. */
export const supabase = _client;

/** env 가 정상 설정됐는지 여부. login.html 등에서 안내용. */
export const isSupabaseConfigured = Boolean(_client);
