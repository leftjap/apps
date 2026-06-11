/* adapter.js — 실데이터 → 시안 habit shape (단일 상태 cur).
   같은 Supabase 프로젝트의 4앱 테이블을 읽어 빌드. demo 와 동일 shape 라 컴포넌트 그대로 동작.

   Supabase client 는 주입(DI):
     - 앱: 브라우저 anon 클라이언트 (RLS 가 로그인 사용자로 격리)
     - 검증 스크립트: service-role 클라이언트 (RLS 우회 → owner 명시 필터 필수)
   → 두 경로 모두 owner 컬럼을 명시 필터(study/gym=user_id, today/book=owner_id).

   지표(작업지시서 §4):
     어학 study  = study_daily_stats.utterance_count 합/일 (문장)
     글쓰기 today = today_entries.content 글자수→매수(200자=1매), WRITING_KINDS
     운동 gym    = gym_sessions.duration_min, status=completed (이번주 회수 + active 라이브)
     독서 book   = book_reading_seconds.seconds/60 (분)
   ※ "오늘 흐름" 점 좌표 (flow 작업지시서 §5):
      atMin   = 오늘 완료 시 실제 DB 기록 시각 분 (gym=end_time, today/study=created_at).
      usualMin = 평소 실행 시간대 — 최근 4주 실행 시각 중앙값, 기록<3회면 usualFallback.
      book 만 일별 집계 테이블이라 분 단위 시각 없음 → 항상 usualFallback (구 slot 폴백 승계). */
import {
  dailySeries, dayKeysEndingToday, localDayKey, runDays, longestRun, relativeDayLabel,
  lastActiveDaysAgo, sheetsFromHtml, countDaysInCurrentWeek, startOfToday, weeklyActivityRatios,
  lastSessionLabel, isStaleActiveSession, latestTodayTs, minuteOfDay, medianMinuteOfDay,
} from './transforms.js';

const WINDOW = 84;       // 84일=12주 — 전체통계 추세 + 충분한 streak/최장 계산
const TREND_WEEKS = 12;  // 전체통계 모달 주별 추세 막대 수
const HIST_LEN = 35;     // 히트맵 표시(34 hist + 오늘), Tweaks 기록 기간 최대 35일
const USUAL_DAYS = 28;   // usualMin 중앙값 산출 창 — 최근 4주 (flow 작업지시서 §5)
const WRITING_KINDS = ['navi', 'fiction', 'blog', 'memo']; // today 앱 WRITING_KINDS

// 습관별 정적 메타 (지표 unit·히트맵 max, usualMin 폴백 분, 미실행 CTA)
const META = {
  today: { ko: '글쓰기', en: 'Today', url: 'https://leftjap.github.io/apps/today/', metric: { unit: '매', max: 3.4 }, usualFallback: 6 * 60 + 40, enterNone: '쓰기' },
  gym:   { ko: '운동', en: 'Gym', url: null, device: 'iPhone', metric: { unit: '분', max: 60 }, usualFallback: 13 * 60 + 50, enterNone: null },
  study: { ko: '어학', en: 'Study', url: 'https://leftjap.github.io/apps/study/', metric: { unit: '문장', max: 46 }, usualFallback: 20 * 60, enterNone: '열기' },
  book:  { ko: '독서', en: 'Book', url: 'https://leftjap.github.io/apps/book/', metric: { unit: '분', max: 50 }, usualFallback: 22 * 60 + 30, enterNone: '읽기' },
};

const round1 = (v) => Math.round(v * 10) / 10;

function viewHabit(id, hist, st, lastLabel, trend, longest, usualMin) {
  const m = META[id];
  return {
    id, ko: m.ko, en: m.en, url: m.url, device: m.device,
    metric: m.metric, usualMin, last: lastLabel,
    hist, trend, longest, cycle: ['cur'], start: 'cur', states: { cur: st },
  };
}

// 일별 습관(study/today/book) 공통 상태 빌더.
// lastOverride: "N일 전 HH:MM"(시각 있으면) / usualTs: 최근 4주 실행 타임스탬프(중앙값용)
function buildDaily(id, series, noneLine, lastOverride, at, usualTs) {
  const m = META[id];
  const lastI = WINDOW - 1;
  const hist = series.slice(WINDOW - HIST_LEN, lastI); // 히트맵용 최근 34일(오늘 제외)
  const todayVal = series[lastI];
  const done = todayVal > 0;
  const big = done ? runDays(series) : runDays(series.slice(0, lastI)); // 오늘 안 했으면 어제까지 연속
  const unit = '일 연속';
  const usualMin = medianMinuteOfDay(usualTs, m.usualFallback);
  const st = done
    ? { kind: 'done', big, unit, today: todayVal, line: `오늘 ${todayVal}${m.metric.unit}`, enter: '다시 열기',
        atMin: minuteOfDay(at) ?? usualMin, amount: `${todayVal}${m.metric.unit}` }
    : { kind: 'none', big, unit, today: 0, line: noneLine, enter: m.enterNone };
  const d = lastActiveDaysAgo(series);
  const last = lastOverride || (d != null ? relativeDayLabel(d) : '기록 없음');
  return viewHabit(id, hist, st, last, weeklyActivityRatios(series, TREND_WEEKS), longestRun(series), usualMin);
}

async function rows(client, table, columns, filters = (q) => q) {
  if (!client) return [];
  try {
    const { data, error } = await filters(client.from(table).select(columns));
    if (error) { console.warn(`[adapter] ${table}`, error.message); return []; }
    return data || [];
  } catch (e) {
    console.warn(`[adapter] ${table}`, e); return [];
  }
}

async function fetchStudy(client, userId, today, sinceKey, todayKey, usualSince) {
  const data = await rows(client, 'study_daily_stats', 'date, utterance_count',
    (q) => q.eq('user_id', userId).gte('date', sinceKey));
  const series = dailySeries(data, (r) => r.date, (r) => r.utterance_count, WINDOW, today);
  const due = await rows(client, 'study_review_queue', 'next_review',
    (q) => q.eq('user_id', userId).lte('next_review', todayKey));
  const noneLine = due.length > 0 ? `복습 ${due.length}개 대기` : '오늘 아직';
  // 최근 4주 세션 로그 — [0]=직전 세션(라벨·at), 전체=usualMin 중앙값. 4주 무기록 시 series 폴백 라벨
  const logs = await rows(client, 'study_session_logs', 'created_at',
    (q) => q.eq('user_id', userId).gte('created_at', usualSince.toISOString()).order('created_at', { ascending: false }));
  const at = latestTodayTs([logs[0]?.created_at], today);
  return buildDaily('study', series, noneLine, lastSessionLabel(logs[0]?.created_at, today), at,
    logs.map((r) => r.created_at));
}

async function fetchToday(client, userId, today, sinceKey, usualSinceKey) {
  const data = await rows(client, 'today_entries', 'content, created_at, kind, deleted_at',
    (q) => q.eq('owner_id', userId).in('kind', WRITING_KINDS).is('deleted_at', null).gte('created_at', sinceKey));
  const series = dailySeries(data, (r) => localDayKey(r.created_at), (r) => sheetsFromHtml(r.content), WINDOW, today)
    .map(round1);
  const lastTs = data.reduce((mx, r) => (!mx || r.created_at > mx ? r.created_at : mx), null);
  const at = latestTodayTs(data.map((r) => r.created_at), today);
  const usualTs = data.filter((r) => localDayKey(r.created_at) >= usualSinceKey).map((r) => r.created_at);
  return buildDaily('today', series, '오늘 아직', lastSessionLabel(lastTs, today), at, usualTs);
}

async function fetchBook(client, userId, today, sinceKey) {
  const data = await rows(client, 'book_reading_seconds', 'day, seconds',
    (q) => q.eq('owner_id', userId).gte('day', sinceKey));
  const series = dailySeries(data, (r) => r.day, (r) => Math.round(r.seconds / 60), WINDOW, today);
  const lastI = WINDOW - 1;
  const d = lastActiveDaysAgo(series);
  const noneLine = d != null ? `${relativeDayLabel(d)} ${series[lastI - d]}분 읽음` : '오늘 아직';
  return buildDaily('book', series, noneLine); // 시각 데이터 없음 → usualMin·atMin 폴백
}

async function fetchGym(client, userId, today, sinceKey, usualSinceKey) {
  const data = await rows(client, 'gym_sessions', 'date, status, duration_min, start_time, end_time',
    (q) => q.eq('user_id', userId).gte('date', sinceKey));
  const completed = data.filter((r) => r.status === 'completed');
  const series = dailySeries(completed, (r) => r.date, (r) => r.duration_min, WINDOW, today);
  const lastI = WINDOW - 1;
  const hist = series.slice(WINDOW - HIST_LEN, lastI);
  const todayVal = series[lastI];
  const weekCount = countDaysInCurrentWeek(completed.map((r) => r.date), today);
  const unit = '이번주 회';
  // 평소 시간대 = 최근 4주 완료 세션 시작 시각 중앙값 (시작 시각이 "보통 언제 하나"의 신호)
  const usualMin = medianMinuteOfDay(
    completed.filter((r) => r.date >= usualSinceKey).map((r) => Number(r.start_time) || null),
    META.gym.usualFallback);
  const at = latestTodayTs(completed.map((r) => Number(r.end_time || r.start_time) || null), today);
  const active = data.find((r) =>
    (r.status === 'active' || r.status === 'paused') && !isStaleActiveSession(r.start_time, Date.now()));
  let st;
  if (active) {
    const timer = Math.max(0, Math.floor((Date.now() - Number(active.start_time)) / 1000));
    st = { kind: 'progress', big: weekCount, unit, today: 0, line: '운동 중', timer, enter: null };
  } else if (todayVal > 0) {
    st = { kind: 'done', big: weekCount, unit, today: todayVal, line: `오늘 ${todayVal}분`, enter: null,
      atMin: minuteOfDay(at) ?? usualMin, amount: `${todayVal}분` };
  } else {
    const d = lastActiveDaysAgo(series);
    st = { kind: 'none', big: weekCount, unit, today: 0, line: d != null ? `마지막 운동 ${relativeDayLabel(d)}` : '이번주 아직', enter: null };
  }
  const lastTs = completed.reduce((mx, r) => { const t = Number(r.end_time || r.start_time) || 0; return t > mx ? t : mx; }, 0);
  const dd = lastActiveDaysAgo(series);
  const lastLabel = lastTs ? lastSessionLabel(new Date(lastTs), today) : (dd != null ? relativeDayLabel(dd) : '기록 없음');
  return viewHabit('gym', hist, st, lastLabel,
    weeklyActivityRatios(series, TREND_WEEKS), longestRun(series), usualMin);
}

/** 주어진 Supabase client·userId 로 4개 habit (시안 순서: today→gym→study→book) 빌드 */
export async function buildRealHabits(client, userId) {
  const today = startOfToday();
  const keys = dayKeysEndingToday(WINDOW, today);
  const sinceKey = keys[0];
  const todayKey = keys[keys.length - 1];
  const usualSinceKey = keys[WINDOW - USUAL_DAYS]; // 최근 4주 시작일 (usualMin 창)
  const usualSince = new Date(today);
  usualSince.setDate(usualSince.getDate() - (USUAL_DAYS - 1));
  const [todayH, gymH, studyH, bookH] = await Promise.all([
    fetchToday(client, userId, today, sinceKey, usualSinceKey),
    fetchGym(client, userId, today, sinceKey, usualSinceKey),
    fetchStudy(client, userId, today, sinceKey, todayKey, usualSince),
    fetchBook(client, userId, today, sinceKey),
  ]);
  return [todayH, gymH, studyH, bookH];
}
