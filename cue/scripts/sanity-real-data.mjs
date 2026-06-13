/* sanity-real-data.mjs — 실 Supabase 데이터로 adapter.buildRealApps 검증 (로컬 전용).
   브라우저 OAuth 없이 실데이터 경로(쿼리+변환)를 점검: service-role 키로 RLS 우회하되
   adapter 가 owner 명시 필터로 사용자 행만 집계하는지 확인 (앱은 anon+RLS 로 동일 코드 사용).

   실행 (cue/ 에서):
     set -a; . ~/.config/study/.env; set +a
     export USER_ID_LEFTJAP=$(grep -o 'USER_ID_LEFTJAP=[0-9a-f-]*' ../today/.env.local | cut -d= -f2)
     node scripts/sanity-real-data.mjs
   ※ service-role 키는 절대 커밋 금지 — env 로만 주입(이 스크립트는 하드코딩 안 함). */
import { createClient } from '@supabase/supabase-js';
import { buildRealApps } from '../src/data/adapter.js';

const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
const userId = process.env.USER_ID_LEFTJAP || process.env.CUE_USER_ID;

if (!url || !key || !userId) {
  console.error('env 누락: SUPABASE_URL · SUPABASE_SERVICE_ROLE_KEY · USER_ID_LEFTJAP 필요');
  process.exit(1);
}

const client = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
const apps = await buildRealApps(client, userId);

const hookStr = (h) => h ? `${h.title}${h.strong ? ` [${h.strong}]` : ''}${h.tail || ''}` : '(없음)';
console.log(`\n=== cue v9 실데이터 빌드 (user ${userId.slice(0, 8)}…) ===\n`);
for (const a of apps) {
  const calSum = Math.round(a.cal.reduce((x, y) => x + y, 0) * 10) / 10;
  console.log(`■ ${a.name} (${a.id}) — done=${a.done} usualMin=${a.usualMin} atMin=${a.atMin} tlMeta=${a.tlMeta ?? '-'}`);
  console.log(`  hook     : ${hookStr(a.hook)}`);
  if (a.hookDone) console.log(`  hookDone : ${hookStr(a.hookDone)}`);
  console.log(`  sub      : ${a.sub}${a.subStrong ? ' [복습대기]' : a.subGap ? ' [공백사실]' : ''}`);
  console.log(`  beat     : ${a.beat[0]}**${a.beat[1]}**${a.beat[2]}`);
  for (const r of a.records) {
    const g = r.goal ? `${r.goal.cur}/${r.goal.max}${r.goal.unit}${r.goal.proposed ? '(제안)' : ''}` : r.v;
    const pr = r.pr > 0 ? ` ★신기록${r.pr}` : '';
    console.log(`  rec      : [${r.lb}] ${g}${pr}${r.note ? ` — ${r.note}` : ''}`);
  }
  console.log(`  cal      : 이번 달 합 ${calSum}${a.calUnit} / weekly8(활동일) [${a.weekly8.join(', ')}] / total "${a.total}"`);
  console.log(`  pace     : ${a.pace.now} · ${a.pace.goal}`);
  for (const r of a.statRecords) console.log(`  stat     : [${r.lb}] ${r.v}`);
  console.log(`  cta      : ${a.cta}${a.ctaDone ? ` / done: ${a.ctaDone}` : ''} → ${a.url ?? '(iPhone 전용)'}\n`);
}
process.exit(0);
