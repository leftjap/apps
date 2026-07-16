/* audit-faithfulness.mjs — cue 가 Supabase 실데이터를 충실히 반영하는지 전수 대조 (로컬 전용).
   adapter.buildRealApps 출력 vs raw 행에서 '독립 재계산'(adapter 의 transforms 미경유)한 값을 1:1 비교.
   목적: "큐앱에 보이는 값이 팩트인가" 를 필드별 PASS/FAIL 로 증명.

   실행 (cue/ 에서):
     set -a; . ~/.config/study/.env; set +a
     export USER_ID_LEFTJAP=$(grep -o 'USER_ID_LEFTJAP=[0-9a-f-]*' ../today/.env.local | cut -d= -f2)
     node scripts/audit-faithfulness.mjs */
import { createClient } from '@supabase/supabase-js';
import { buildRealApps } from '../src/data/adapter.js';

const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
const uid = process.env.USER_ID_LEFTJAP;
if (!url || !key || !uid) { console.error('env 누락'); process.exit(1); }
const c = createClient(url, key, { auth: { persistSession: false } });

const p2 = (n) => String(n).padStart(2, '0');
const now = new Date(); now.setHours(0, 0, 0, 0);
const key1 = (d) => `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}`;
const localK = (ts) => key1(new Date(ts));
const tk = key1(now);
const monStart = `${now.getFullYear()}-${p2(now.getMonth() + 1)}-01`;
const yStart = `${now.getFullYear()}-01-01`;
const prevMonStart = key1(new Date(now.getFullYear(), now.getMonth() - 1, 1));
const prevMonEnd = key1(new Date(now.getFullYear(), now.getMonth(), 0));
// 이번주(월~오늘) / 지난주(월~일)
const back = (now.getDay() + 6) % 7;
const weekMon = new Date(now); weekMon.setDate(weekMon.getDate() - back);
const wkStart = key1(weekMon);
const lwStart = key1(new Date(weekMon.getFullYear(), weekMon.getMonth(), weekMon.getDate() - 7));
const lwEnd = key1(new Date(weekMon.getFullYear(), weekMon.getMonth(), weekMon.getDate() - 1));

let pass = 0, fail = 0;
const cmp = (label, raw, got) => {
  const ok = String(raw) === String(got);
  if (ok) pass++; else fail++;
  console.log(`  ${ok ? '✅' : '❌'} ${label}: raw=${raw} | adapter=${got}`);
};
const distinctActive = (rows, keyFn, valOk, lo, hi) => {
  const s = new Set();
  for (const r of rows) { const k = keyFn(r); if (k >= lo && k <= hi && valOk(r)) s.add(k); }
  return s.size;
};

const apps = await buildRealApps(c, uid);
const [read, write, lang, gym] = apps;
console.log(`### 전수 충실성 감사 — 오늘 ${tk} (user ${uid.slice(0, 8)}…) ###\n`);

// ─────────── 어학 (en-only) ───────────
console.log('■ 어학 (lang) — 영어만 반영되어야 함');
const { data: sdsAll } = await c.from('study_daily_stats').select('date,lang,study_time_sec,utterance_count,new_sentences,review_count').eq('user_id', uid);
// 실학습 신호 게이트(adapter hasLearningSignal 과 동일 사양) — study_time 만 있는 잔류 세션 행 제외
const hasSignal = (r) => (r.utterance_count || 0) > 0 || (r.new_sentences || 0) > 0 || (r.review_count || 0) > 0;
const en = sdsAll.filter((r) => r.lang === 'en' && hasSignal(r));
const ja = sdsAll.filter((r) => r.lang === 'ja' && hasSignal(r));
console.log(`  (참고) en 행 ${en.length} · ja 행 ${ja.length} (실학습 신호 有) → adapter 는 en 만 집계해야`);
const enToday = en.find((r) => r.date === tk);
const langTodayMin = enToday ? Math.round(enToday.study_time_sec / 60) : 0;
cmp('오늘 분(todayVal)', langTodayMin, lang.done ? parseInt(lang.tlMeta.match(/· (\d+)분/)[1]) : 0);
cmp('done', !!(enToday && langTodayMin > 0), lang.done);
cmp('이번달 익힘(en new June)', en.filter((r) => r.date >= monStart && r.date <= tk).reduce((a, r) => a + r.new_sentences, 0), parseInt(lang.records.find((r) => r.lb === '이번 달 익힘').v.match(/\d+/)[0]));
cmp('지난달 익힘(en new prevMon)', en.filter((r) => r.date >= prevMonStart && r.date <= prevMonEnd).reduce((a, r) => a + r.new_sentences, 0), parseInt(lang.records.find((r) => r.lb === '이번 달 익힘').note.match(/\d+/)[0]));
cmp('올해 발화(en utter)', en.filter((r) => r.date >= yStart).reduce((a, r) => a + r.utterance_count, 0), parseInt(lang.total.match(/발화 ([\d,]+)/)[1].replace(/,/g, '')));
cmp('이번주 활동일(en, study≥30s)', distinctActive(en, (r) => r.date, (r) => Math.round(r.study_time_sec / 60) > 0, wkStart, tk), lang.records.find((r) => r.lb === '이번 주').goal.cur);
cmp('지난주 활동일(en)', distinctActive(en, (r) => r.date, (r) => Math.round(r.study_time_sec / 60) > 0, lwStart, lwEnd), parseInt(lang.records.find((r) => r.lb === '이번 주').note.match(/\d+/)[0]));
const jpChars = (JSON.stringify(lang).match(/[぀-ヿ一-鿿]/g) || []);
cmp('일본어 문자 0개', 0, jpChars.length);

// ─────────── 독서 ───────────
console.log('\n■ 독서 (read) — 밀리(book_reading_seconds) + 리딩타임(readingtime_daily) 병합');
const { data: bkMillie } = await c.from('book_reading_seconds').select('day,seconds').eq('owner_id', uid).gte('day', yStart);
const { data: bkPaper } = await c.from('readingtime_daily').select('day,seconds').eq('owner_id', uid).gte('day', yStart);
// adapter 와 동일 사양: 일별 초 합산 → 분 반올림 (행별 반올림 아님)
const bkDayMin = new Map();
for (const r of [...bkMillie, ...bkPaper]) bkDayMin.set(r.day, (bkDayMin.get(r.day) || 0) + r.seconds);
for (const [d, sec] of bkDayMin) bkDayMin.set(d, Math.round(sec / 60));
cmp('오늘 분', bkDayMin.get(tk) || 0, read.tlMeta ? parseInt(read.tlMeta) : 0);
cmp('done', (bkDayMin.get(tk) || 0) > 0, read.done);
const rdMonMin = [...bkDayMin].filter(([d]) => d >= monStart && d <= tk).reduce((a, [, m]) => a + m, 0);
cmp('이번달 시간라벨', rdMonMin >= 60 ? `${Math.round(rdMonMin / 60)}시간` : `${rdMonMin}분`, read.records.find((r) => r.lb === '이번 달').v);
cmp('올해 읽은 날(분≥1)', [...bkDayMin].filter(([d, m]) => d >= yStart && d <= tk && m > 0).length, parseInt(read.total.match(/· (\d+)일/)[1]));

// ─────────── 글쓰기 ───────────
console.log('\n■ 글쓰기 (write)');
const { data: te } = await c.from('today_entries').select('title,content,created_at,kind,deleted_at').eq('owner_id', uid).in('kind', ['navi', 'fiction', 'blog', 'memo']).is('deleted_at', null).gte('created_at', yStart);
const sheets = (h) => Math.round(String(h ?? '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim().replace(/\s/g, '').length / 200 * 10) / 10;
const teKeys = te.map((r) => localK(r.created_at));
cmp('오늘 글 편수', teKeys.filter((k) => k === tk).length, write.done ? te.filter((r) => localK(r.created_at) === tk).length : 0);
cmp('done', teKeys.includes(tk), write.done);
cmp('이번주 편수', teKeys.filter((k) => k >= wkStart && k <= tk).length, write.records.find((r) => r.lb === '이번 주').goal.cur);
cmp('올해 편수', te.filter((r) => localK(r.created_at) >= yStart).length, parseInt(write.total.match(/올해 (\d+)편/)[1]));
cmp('올해 매수', Math.round(te.reduce((a, r) => a + sheets(r.content), 0) * 10) / 10, parseFloat(write.total.match(/· ([\d.]+)매/)[1]));

// ─────────── 운동 ───────────
console.log('\n■ 운동 (gym)');
const { data: gs } = await c.from('gym_sessions').select('date,status,duration_min,start_time,end_time,tags,total_volume,blocks').eq('user_id', uid).gte('date', yStart);
const isWorkout = (r) => r.status === 'completed' || (r.status === 'active' && (r.blocks || []).some((b) => (b.sets || []).some((s) => s && s.done)));
const w = gs.filter(isWorkout);
cmp('이번달 횟수', w.filter((r) => r.date >= monStart && r.date <= tk).length, parseInt(gym.records.find((r) => r.lb === '이번 달').v));
cmp('지난달 횟수', w.filter((r) => r.date >= prevMonStart && r.date <= prevMonEnd).length, parseInt(gym.records.find((r) => r.lb === '이번 달').note.match(/\d+/)[0]));
cmp('올해 횟수', w.filter((r) => r.date >= yStart).length, parseInt(gym.total.match(/올해 (\d+)회/)[1]));
cmp('이번주 회수(distinct day)', new Set(w.filter((r) => r.date >= wkStart && r.date <= tk).map((r) => r.date)).size, gym.records.find((r) => r.lb === '이번 주').goal.cur);

console.log(`\n### 결과: ${pass} PASS · ${fail} FAIL ###`);
process.exit(fail ? 1 : 0);
