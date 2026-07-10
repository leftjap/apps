// 인증 (study 패턴: Google OAuth + 허용 이메일)
import { auth } from './supabase.js'

export const ALLOWED_EMAILS = Object.freeze(['leftjap@gmail.com', 'soyoun312@gmail.com'])

export function isAllowed(session) {
  const email = session?.user?.email?.trim().toLowerCase()
  return Boolean(email && ALLOWED_EMAILS.includes(email))
}

export async function getSession() {
  if (!auth) return null
  const { data } = await auth.getSession()
  return data?.session ?? null
}

export function signInWithGoogle() {
  return auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo: location.origin + import.meta.env.BASE_URL },
  })
}

export function signOut() {
  return auth.signOut()
}

export function onAuthChange(cb) {
  if (!auth) return () => {}
  const { data } = auth.onAuthStateChange(cb)
  return () => data.subscription.unsubscribe()
}
