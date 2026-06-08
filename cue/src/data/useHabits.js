/* useHabits — 데모(목업) vs 실데이터(Supabase) 전환 + 로그인 상태 관리.
   status: 'demo' | 'loading' | 'ready' | 'signed-out' | 'error' */
import { useState, useEffect } from 'react';
import { MOCK_HABITS } from './mock.js';
import { buildRealHabits } from './adapter.js';
import { supabase } from '../services/supabase.js';
import { getUser, onAuthChange, isSupabaseConfigured } from '../services/auth.js';

export function useHabits(demoMode) {
  const [state, setState] = useState(() =>
    demoMode ? { status: 'demo', habits: MOCK_HABITS } : { status: 'loading', habits: null });

  useEffect(() => {
    if (demoMode) { setState({ status: 'demo', habits: MOCK_HABITS }); return undefined; }
    if (!isSupabaseConfigured) { setState({ status: 'signed-out', habits: null }); return undefined; }

    let alive = true;
    async function load() {
      const user = await getUser();
      if (!alive) return;
      if (!user) { setState({ status: 'signed-out', habits: null }); return; }
      try {
        const habits = await buildRealHabits(supabase, user.id);
        if (alive) setState({ status: 'ready', habits });
      } catch (e) {
        console.warn('[useHabits]', e);
        if (alive) setState({ status: 'error', habits: null });
      }
    }
    setState((s) => (s.habits ? s : { status: 'loading', habits: null }));
    load();
    const off = onAuthChange(() => load()); // 로그인/로그아웃 시 재로드
    return () => { alive = false; off(); };
  }, [demoMode]);

  return state;
}
