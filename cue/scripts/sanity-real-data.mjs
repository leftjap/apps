/* sanity-real-data.mjs — 실 Supabase 데이터로 adapter.buildRealHabits 검증 (로컬 전용).
   브라우저 OAuth 없이 실데이터 경로(쿼리+변환)를 점검: service-role 키로 RLS 우회하되
   adapter 가 owner 명시 필터로 사용자 행만 집계하는지 확인 (앱은 anon+RLS 로 동일 코드 사용).

   실행 (cue/ 에서):
     set -a; . ~/.config/study/.env; set +a
     export USER_ID_LEFTJAP=$(grep -o 'USER_ID_LEFTJAP=[0-9a-f-]*' ../today/.env.local | cut -d= -f2)
     node scripts/sanity-real-data.mjs
   ※ service-role 키는 절대 커밋 금지 — env 로만 주입(이 스크립트는 하드코딩 안 함). */
import { createClient } from '@supabase/supabase-js';
import { buildRealHabits } from '../src/data/adapter.js';

const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
const userId = process.env.USER_ID_LEFTJAP || process.env.CUE_USER_ID;

if (!url || !key || !userId) {
  console.error('env 누락: SUPABASE_URL · SUPABASE_SERVICE_ROLE_KEY · USER_ID_LEFTJAP 필요');
  process.exit(1);
}

const client = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
const habits = await buildRealHabits(client, userId);

console.log(`\n=== cue 실데이터 빌드 (user ${userId.slice(0, 8)}…) ===\n`);
for (const h of habits) {
  const st = h.states.cur;
  const histSum = Math.round(h.hist.reduce((a, b) => a + b, 0) * 10) / 10;
  const activeDays = h.hist.filter((v) => v > 0).length;
  console.log(
    `${h.ko.padEnd(3)} ${h.en.padEnd(5)} | ${st.kind.padEnd(8)} | ${String(st.big).padStart(3)} ${st.unit.padEnd(6)} | 오늘 ${String(st.today).padStart(4)}${h.metric.unit} | "${st.line}" | hist합 ${histSum}${h.metric.unit}/${activeDays}일 | ${h.url ?? '(iPhone)'}`,
  );
}
console.log('');
process.exit(0);
