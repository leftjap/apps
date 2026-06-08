/* useHabits — 데모(목업) vs 실데이터(Supabase) 전환 + 로그인 상태 관리.
   status: 'demo' | 'loading' | 'ready' | 'signed-out' | 'error'

   ⚠️ supabase v2 데드락 회피: onAuthStateChange 콜백은 auth 락을 쥔 채 실행되므로
   그 안에서 auth 메서드(getSession/getUser)나 PostgREST 쿼리(내부적으로 getSession 호출)를
   부르면 재진입 데드락 → 영원히 hang. 따라서 콜백은 세션만 state 에 저장하고,
   실제 fetch(buildRealHabits)는 콜백 밖 별도 effect 에서 수행한다. */
import { useState, useEffect } from 'react';
import { MOCK_HABITS } from './mock.js';
import { buildRealHabits } from './adapter.js';
import { supabase } from '../services/supabase.js';
import { onAuthChange, isSupabaseConfigured } from '../services/auth.js';

export function useHabits(demoMode) {
  const [state, setState] = useState(() =>
    demoMode ? { status: 'demo', habits: MOCK_HABITS } : { status: 'loading', habits: null });
  // undefined = 아직 모름, null = 로그아웃, { userId } = 로그인
  const [auth, setAuth] = useState(undefined);

  // 1) 인증 구독 — 콜백은 세션만 저장 (락 안에서 supabase 호출 금지 → 데드락 회피)
  useEffect(() => {
    if (demoMode || !isSupabaseConfigured) return undefined;
    let alive = true;
    let settled = false;
    const off = onAuthChange((session) => {
      if (!alive) return;
      settled = true;
      const uid = session?.user?.id ?? null;
      // 같은 사용자면 state 무변경 → effect2 재요청 안 함 (토큰 refresh 등 중복 fetch 방지)
      setAuth((prev) => {
        const prevId = prev === undefined ? undefined : (prev ? prev.userId : null);
        if (prevId === uid) return prev;
        return uid ? { userId: uid } : null;
      });
    });
    // 안전망: INITIAL_SESSION 이 안 오면 로딩 무한 고착 방지 → 로그아웃 처리(로그인 버튼 노출)
    const timer = setTimeout(() => { if (alive && !settled) setAuth(null); }, 6000);
    return () => { alive = false; clearTimeout(timer); off(); };
  }, [demoMode]);

  // 2) demoMode/auth 반응 — fetch 는 인증 콜백 밖(락 미보유)에서 수행
  useEffect(() => {
    if (demoMode) { setState({ status: 'demo', habits: MOCK_HABITS }); return undefined; }
    if (!isSupabaseConfigured) { setState({ status: 'signed-out', habits: null }); return undefined; }
    if (auth === undefined) { setState((s) => (s.status === 'ready' ? s : { status: 'loading', habits: null })); return undefined; }
    if (auth === null) { setState({ status: 'signed-out', habits: null }); return undefined; }

    // 상시표시 모니터용 자동 새로고침: 90초 폴링 + 탭 가시화/포커스 시 즉시 재요청
    // (앱 DB 변경을 reload 없이 cue 에 반영). 폴링 실패는 기존 데이터 유지(깜빡임 방지).
    let alive = true;
    const load = async (showLoading) => {
      if (showLoading) setState((s) => ({ status: 'loading', habits: s.habits }));
      try {
        const habits = await buildRealHabits(supabase, auth.userId);
        if (alive) setState({ status: 'ready', habits });
      } catch (e) {
        console.warn('[useHabits]', e);
        if (alive) setState((s) => (s.habits ? { status: 'ready', habits: s.habits } : { status: 'error', habits: null }));
      }
    };
    load(true);
    const iv = setInterval(() => { if (!document.hidden) load(false); }, 90000);
    const onVisible = () => { if (!document.hidden) load(false); };
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('focus', onVisible);
    return () => {
      alive = false;
      clearInterval(iv);
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('focus', onVisible);
    };
  }, [demoMode, auth]);

  return state;
}
