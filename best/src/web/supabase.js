// Supabase 클라이언트 (study 패턴 축소판 — auth-js + postgrest-js 직접 사용)
import { AuthClient } from '@supabase/auth-js'
import { PostgrestClient } from '@supabase/postgrest-js'

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY

export const isConfigured = Boolean(SUPABASE_URL && SUPABASE_ANON_KEY)

let auth = null
let pg = null

if (isConfigured) {
  auth = new AuthClient({
    url: `${SUPABASE_URL}/auth/v1`,
    headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${SUPABASE_ANON_KEY}` },
    storageKey: 'best-auth',
    flowType: 'pkce',
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: true,
  })
  pg = new PostgrestClient(`${SUPABASE_URL}/rest/v1`, {
    headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${SUPABASE_ANON_KEY}` },
  })
  auth.onAuthStateChange((_event, session) => {
    const token = session?.access_token ?? SUPABASE_ANON_KEY
    // postgrest-js 2.104: headers 는 Headers 인스턴스 — 런타임 mutate (study Wave 11.19 실증)
    pg.headers.set('Authorization', `Bearer ${token}`)
  })
}

export { auth, pg }
