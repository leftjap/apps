// due-now.mjs — 오늘 Cue의 첫 미완료 활동(독서→글쓰기→어학→운동)을 stdout 으로 출력.
//   출력값: 독서 | 글쓰기 | 어학 | 운동 | toast(4개 완료) | stale(판정 실패 폴백)
//   인증: service-role(RLS 우회) + 고정 UID 명시 필터 — 로컬 자동화 전용(키는 env 주입, 하드코딩 금지).
//   done 로직은 cue adapter.js(done=오늘값>0)와 동일 — youtube-cue-gate.user.js 검증 포팅 복제.
//   호출: youtube-gate-native.sh 가 env 주입 후 `node due-now.mjs` 로 실행.
const SB_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const UID = process.env.CUE_USER_ID || process.env.USER_ID_LEFTJAP;

const out = (s) => { process.stdout.write(s); process.exit(0); };
if (!SB_URL || !KEY || !UID) { console.error('[due-now] env 누락(URL/KEY/UID) → stale'); out('stale'); }

const p2 = (x) => String(x).padStart(2, '0');
const ymd = (d) => `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}`;
const now = new Date();
const today = ymd(now);
const todayISO = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();

const round1 = (v) => Math.round(v * 10) / 10;
const sheets = (html) => { const t = String(html ?? '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim(); return round1(t.replace(/\s/g, '').length / 200); };
const isWorkout = (r) => r.status === 'completed' || (r.status === 'active' && Array.isArray(r.blocks) && r.blocks.some((b) => b && Array.isArray(b.sets) && b.sets.some((x) => x && x.done)));
const effMin = (r) => { const d = Number(r.duration_min) || 0; if (d > 0) return d; const fins = (r.blocks || []).map((b) => Number(b && b.finishedAt) || 0).filter(Boolean); const st = Number(r.start_time) || 0; return fins.length && st ? Math.max(1, Math.round((Math.max(...fins) - st) / 60000)) : 0; };

async function api(path) {
  const r = await fetch(`${SB_URL}/rest/v1/${path}`, { headers: { apikey: KEY, Authorization: `Bearer ${KEY}` }, signal: AbortSignal.timeout(5000) });
  if (!r.ok) throw new Error(`${r.status} ${(await r.text()).slice(0, 120)}`);
  return r.json();
}

async function isDone(id) {
  if (id === 'read') {
    const rows = await api(`book_reading_seconds?owner_id=eq.${UID}&day=eq.${today}&select=seconds`);
    return rows.reduce((a, r) => a + Math.round((Number(r.seconds) || 0) / 60), 0) > 0;
  }
  if (id === 'write') {
    const rows = await api(`today_entries?owner_id=eq.${UID}&kind=in.(navi,fiction,blog,memo)&deleted_at=is.null&created_at=gte.${todayISO}&select=content`);
    return round1(rows.reduce((a, r) => a + sheets(r.content), 0)) > 0;
  }
  if (id === 'lang') {
    const rows = await api(`study_daily_stats?user_id=eq.${UID}&date=eq.${today}&select=study_time_sec`);
    return rows.reduce((a, r) => a + Math.round((Number(r.study_time_sec) || 0) / 60), 0) > 0;
  }
  if (id === 'gym') {
    const rows = await api(`gym_sessions?user_id=eq.${UID}&date=eq.${today}&select=status,blocks,duration_min,start_time`);
    return rows.filter(isWorkout).some((r) => effMin(r) > 0);
  }
  return false;
}

const ORDER = [['read', '독서'], ['write', '글쓰기'], ['lang', '어학'], ['gym', '운동']];
try {
  for (const [id, label] of ORDER) { if (!(await isDone(id))) out(label); }
  out('toast');
} catch (e) {
  console.error('[due-now] 조회 실패 → stale:', e.message);
  out('stale');
}
