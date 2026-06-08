/**
 * Supabase 클라이언트 단일 인스턴스 (today/study/gym 패턴 답습).
 *
 * cue 는 읽기 전용 — 자기 테이블 없음. 4앱(study/today/gym/book) 테이블을 RLS 로 읽기만.
 * 같은 Supabase 프로젝트 + 같은 storageKey → github.io 동일 origin 에선 형제 앱과 세션 공유
 * (study/today/book 에 로그인돼 있으면 cue 도 자동 인증).
 *
 * env 누락 시 supabase = null → auth/adapter 가 no-op + 데모 폴백.
 * import.meta.env 는 빌드 타임 인라인. anon key 만 번들 (공개 안전, RLS 격리).
 */
import { createClient } from '@supabase/supabase-js';
import { createIndexedDBStorage } from './auth-storage.js';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;

const STORAGE_KEY = SUPABASE_URL
  ? `sb-${new URL(SUPABASE_URL).hostname.split('.')[0]}-auth-token`
  : null;

let _client = null;

if (SUPABASE_URL && SUPABASE_ANON_KEY) {
  _client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: {
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
  console.warn('[supabase] VITE_SUPABASE_URL/ANON_KEY 미설정 — .env.local 확인. 데모 폴백.');
}

/** Supabase 클라이언트. env 누락 시 null. */
export const supabase = _client;

/** env 정상 설정 여부 (로그인 UI 안내용). */
export const isSupabaseConfigured = Boolean(_client);
