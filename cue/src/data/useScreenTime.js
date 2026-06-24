/* useScreenTime — screentime_daily 실데이터 → {day,week,month} 뷰.
   demo 모드·미로그인·에러·테이블없음이면 null 반환 → ScreenTime 이 mockup(SCREENTIME_DATA) 폴백.
   useApps 와 별개 effect 에서 fetch (auth 콜백 락 밖이라 getSession 안전). */
import { useState, useEffect } from 'react';
import { supabase } from '../services/supabase.js';
import { isSupabaseConfigured } from '../services/auth.js';
import { startOfToday, localDayKey } from './transforms.js';
import { buildScreenTimeData } from './screentime.js';

export function useScreenTime(demoMode) {
  const [data, setData] = useState(null);
  useEffect(() => {
    if (demoMode || !isSupabaseConfigured) { setData(null); return undefined; }
    let alive = true;
    const load = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        const uid = session?.user?.id;
        if (!uid) { if (alive) setData(null); return; }
        const today = startOfToday();
        const since = new Date(today); since.setDate(since.getDate() - 200); // 월 추세(6개월) 커버
        const { data: rows, error } = await supabase.from('screentime_daily')
          .select('date, kind, name, seconds')
          .eq('owner_id', uid).gte('date', localDayKey(since));
        if (error) { console.warn('[useScreenTime]', error.message); if (alive) setData(null); return; }
        if (alive) setData(buildScreenTimeData(rows || [], today));
      } catch (e) {
        console.warn('[useScreenTime]', e); if (alive) setData(null);
      }
    };
    load();
    const onVis = () => { if (!document.hidden) load(); }; // 데몬이 주기적으로 쓰므로 포커스 시 갱신
    document.addEventListener('visibilitychange', onVis);
    return () => { alive = false; document.removeEventListener('visibilitychange', onVis); };
  }, [demoMode]);
  return data;
}
