/* audit-study-hygiene.mjs — study_daily_stats 데이터 위생 게이트 (로컬 + CI 센티널).
   2026-07-04 진단에서 확인된 두 오염 패턴의 재발을 감지한다 (근본 수정은 study activeTimer 지만,
   이 게이트는 "어떤 경로로든 다시 생기면 알린다"는 구조적 방어):
     ① 팬텀 행 — 실학습 신호(발화·신규·복습) 0 인데 study_time_sec 가 큼 (탭 방치류)
     ② 폭주 행 — study_time_sec 가 하루 상한을 넘거나, 발음로그 증거가 결핍된 장시간 기록
   FAIL 시 exit 1 → CI(data-sentinel.yml)가 실패해 GitHub 알림 발송.

   실행 (cue/ 에서):
     set -a; . ~/.config/study/.env; set +a
     node scripts/audit-study-hygiene.mjs            # 실데이터 검사
     node scripts/audit-study-hygiene.mjs --self-test # DB 없이 판정 로직 자가검증 */
import { createClient } from '@supabase/supabase-js';

// 임계값 — 2026-07-04 실측 오염(팬텀 1445s~19206s·폭주 17207~25728s vs 발음로그 7~51분) 기준.
// activeTimer 정상 동작 시 무녹음 청취 세션도 수십 분을 넘기 어렵다는 전제.
const PHANTOM_MAX = 3600;   // 신호 0 행 허용 상한 (1h)
const DAY_MAX = 21600;      // 하루 학습시간 절대 상한 (6h)
const EVIDENCE_MIN_SEC = 7200; // 이 이상 기록(2h)이면 발음로그 최소 건수 요구
const EVIDENCE_MIN_LOGS = 3;

const hasSignal = (r) => (r.utterance_count || 0) > 0 || (r.new_sentences || 0) > 0 || (r.review_count || 0) > 0;

/** 위반 목록 — rows: study_daily_stats[], logCount: (date,lang)→발음로그 수 */
export function violations(rows, logCount = () => null) {
  const out = [];
  for (const r of rows || []) {
    const t = Number(r.study_time_sec) || 0;
    if (!hasSignal(r) && t > PHANTOM_MAX) {
      out.push({ date: r.date, lang: r.lang, rule: '팬텀(신호0·시간과다)', sec: t });
      continue;
    }
    if (t > DAY_MAX) {
      out.push({ date: r.date, lang: r.lang, rule: `일일상한(${DAY_MAX / 3600}h)초과`, sec: t });
      continue;
    }
    if (t > EVIDENCE_MIN_SEC) {
      const n = logCount(r.date, r.lang);
      if (n != null && n < EVIDENCE_MIN_LOGS) {
        out.push({ date: r.date, lang: r.lang, rule: `증거결핍(2h+인데 발음로그 ${n}건)`, sec: t });
      }
    }
  }
  return out;
}

// ── 자가검증 — 오염 케이스가 전부 걸리고, 정상 행은 통과해야 함 ──
// 앞 2건은 2026-07-04 실측 원본값. 3번째는 실측(06-29 22338s)을 일일상한 아래로 조정한
// 변형값(12338s) — 상한 규칙에 먼저 걸리지 않게 해 증거결핍 규칙을 단독 검증하기 위함.
if (process.argv.includes('--self-test')) {
  const bad = [
    { date: '2026-07-04', lang: 'en', study_time_sec: 16967, utterance_count: 0, new_sentences: 0, review_count: 0 }, // 팬텀 (실측)
    { date: '2026-06-23', lang: 'en', study_time_sec: 25575, utterance_count: 20, new_sentences: 4, review_count: 0 }, // 일일상한 (실측)
    { date: '2026-06-29', lang: 'en', study_time_sec: 12338, utterance_count: 25, new_sentences: 2, review_count: 2 }, // 증거결핍(변형값·로그 2건 가정)
  ];
  const good = [
    { date: '2026-06-25', lang: 'en', study_time_sec: 2820, utterance_count: 45, new_sentences: 11, review_count: 5 }, // 정상 학습
    { date: '2026-07-03', lang: 'en', study_time_sec: 112, utterance_count: 7, new_sentences: 0, review_count: 0 },    // 정상 소량
    { date: '2026-07-01', lang: 'en', study_time_sec: 430, utterance_count: 0, new_sentences: 0, review_count: 0 },    // 신호0이나 소량 — 허용
  ];
  const hit = violations(bad, () => 2);
  const miss = violations(good, () => 50);
  const ok = hit.length === 3 && miss.length === 0;
  console.log(`self-test: 오염 3건 검출=${hit.length} · 정상 오탐=${miss.length} → ${ok ? 'PASS' : 'FAIL'}`);
  if (!ok) console.log(JSON.stringify({ hit, miss }, null, 1));
  process.exit(ok ? 0 : 1);
}

// ── 실데이터 검사 ──
const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
const uid = process.env.USER_ID_LEFTJAP || process.env.CUE_USER_ID;
if (!url || !key || !uid) { console.error('env 누락: SUPABASE_URL · SUPABASE_SERVICE_ROLE_KEY · USER_ID_LEFTJAP'); process.exit(1); }
const c = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });

const { data: rows, error } = await c.from('study_daily_stats')
  .select('date, lang, study_time_sec, utterance_count, new_sentences, review_count').eq('user_id', uid);
if (error) { console.error(error.message); process.exit(1); }

// 발음로그 수는 2h+ 행에만 필요 — 해당 날짜만 조회
const heavy = rows.filter((r) => (r.study_time_sec || 0) > EVIDENCE_MIN_SEC);
const counts = new Map();
for (const r of heavy) {
  const { count, error: e2 } = await c.from('study_pronunciation_log')
    .select('*', { count: 'exact', head: true }).eq('user_id', uid).eq('date', r.date).eq('lang', r.lang);
  counts.set(`${r.date}|${r.lang}`, e2 ? null : (count || 0)); // 조회 실패 시 null → 해당 규칙 스킵(오탐 방지)
}

const v = violations(rows, (d, l) => counts.get(`${d}|${l}`) ?? null);
console.log(`### study 데이터 위생 — ${rows.length}행 검사 ###`);
for (const x of v) console.log(`  ❌ ${x.date} ${x.lang} ${x.rule} — ${x.sec}s`);
console.log(v.length ? `### ${v.length} FAIL ###` : '### PASS ###');
process.exit(v.length ? 1 : 0);
