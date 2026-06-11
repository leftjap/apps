/* adapter.js — 실데이터 → v8 앱 shape (design-ref/v8 작업지시서 §8).
   같은 Supabase 프로젝트의 4앱 테이블을 읽어 빌드. mock 과 동일 shape 라 컴포넌트 그대로 동작.

   Supabase client 는 주입(DI):
     - 앱: 브라우저 anon 클라이언트 (RLS 가 로그인 사용자로 격리)
     - 검증 스크립트: service-role 클라이언트 (RLS 우회 → owner 명시 필터 필수)
   → 두 경로 모두 owner 컬럼을 명시 필터(study/gym=user_id, today/book=owner_id).

   지표 (§8 — 윈도우는 올해 1/1~오늘, 최소 63일):
     독서 read   = book_reading_seconds.seconds/60 (분). 외부 millie-tracker 가 채움 — 시각 없음
     글쓰기 write = today_entries.content 글자수→매수(200자=1매), WRITING_KINDS. hook=마지막 문서 제목
     어학 lang   = study_daily_stats.study_time_sec/60 (분). hook=study_today_lessons sceneTitle
     운동 gym    = gym_sessions.duration_min, status=completed. 주 4일 목표, 부위=tags[0]
   문장 생성은 copy.js (§9), 수치 함수는 transforms.js. */
import {
  dailySeries, dayKeysEndingToday, localDayKey, runDays, longestRun,
  lastActiveDaysAgo, sheetsFromHtml, countDaysInCurrentWeek, startOfToday,
  latestTodayTs, minuteOfDay, medianMinuteOfDay, p2,
  monthSeries, monthSum, weeklySums, weeklyActiveDayCounts, weeks4Streak,
} from './transforms.js';
import { buildRead, buildWrite, buildLang, buildGym } from './copy.js';

const USUAL_DAYS = 28; // usualMin 중앙값 산출 창 — 최근 4주
const WRITING_KINDS = ['navi', 'fiction', 'blog', 'memo']; // today 앱 WRITING_KINDS

// 앱별 정적 메타 (딥링크·usualMin 폴백·캘린더 단위)
const META = {
  read:  { url: 'https://leftjap.github.io/apps/book/',  usualFallback: 22 * 60 + 30, calUnit: '분' },
  write: { url: 'https://leftjap.github.io/apps/today/', usualFallback: 6 * 60 + 40,  calUnit: '매' },
  lang:  { url: 'https://leftjap.github.io/apps/study/', usualFallback: 20 * 60,      calUnit: '분' },
  gym:   { url: null, usualFallback: 13 * 60 + 50, calUnit: '분' }, // iPhone 전용 — CTA 무동작
};

const round1 = (v) => Math.round(v * 10) / 10;
const fmtHM = (min) => `${p2(Math.floor(min / 60))}:${p2(Math.round(min) % 60)}`;

/** 올해 1/1~오늘 일수 (최소 63 — 1월에도 8주 집계 확보) */
function ytdLen(today) {
  const base = new Date(today); base.setHours(0, 0, 0, 0);
  const jan1 = new Date(base.getFullYear(), 0, 1);
  return Math.max(Math.round((base - jan1) / 86400000) + 1, 63);
}

/** 모든 활동 공용 수치 묶음 (series = 올해 일별, 마지막 = 오늘) */
function seriesStats(series, today) {
  const last = series.length - 1;
  const todayVal = round1(series[last]);
  const done = todayVal > 0;
  const lastDaysAgo = done ? 0 : lastActiveDaysAgo(series);
  return {
    todayVal, done,
    streak: done ? runDays(series) : runDays(series.slice(0, last)),
    best: longestRun(series),
    dayBest: round1(Math.max(...series, 0)),
    lastDaysAgo,
    lastVal: lastDaysAgo != null ? round1(series[last - lastDaysAgo]) : null,
    yearSum: round1(series.reduce((a, b) => a + b, 0)),
    yearDays: series.filter((v) => v > 0).length,
    cal: monthSeries(series, today),
    weekly8: weeklySums(series, today, 8),
  };
}

/** copy 빌더 결과 + 수치 메타 → 뷰 한 장 */
function view(id, s, built, { usualMin, atMin = null, tlMeta = null }) {
  return {
    id, url: META[id].url, done: s.done, usualMin, atMin, tlMeta,
    cal: s.cal, calUnit: META[id].calUnit, weekly8: s.weekly8, ...built,
  };
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

async function fetchRead(client, userId, today, len, sinceKey) {
  const data = await rows(client, 'book_reading_seconds', 'day, seconds',
    (q) => q.eq('owner_id', userId).gte('day', sinceKey));
  const series = dailySeries(data, (r) => r.day, (r) => Math.round(r.seconds / 60), len, today);
  const s = seriesStats(series, today);
  const built = buildRead({
    done: s.done, todayMin: s.todayVal, lastVal: s.lastVal, lastDaysAgo: s.lastDaysAgo,
    streak: s.streak, best: s.best, dayBest: s.dayBest, yearMin: s.yearSum, yearDays: s.yearDays, today,
  });
  // book 은 일별 집계 테이블 — 시각 없음 → 위치는 usualFallback, tlMeta 는 분량만
  return view('read', s, built, {
    usualMin: META.read.usualFallback,
    tlMeta: s.done ? `${s.todayVal}분` : null,
  });
}

async function fetchWrite(client, userId, today, len, sinceKey, usualSinceKey) {
  const data = await rows(client, 'today_entries', 'title, content, created_at, kind, deleted_at',
    (q) => q.eq('owner_id', userId).in('kind', WRITING_KINDS).is('deleted_at', null).gte('created_at', sinceKey));
  const series = dailySeries(data, (r) => localDayKey(r.created_at), (r) => sheetsFromHtml(r.content), len, today)
    .map(round1);
  const s = seriesStats(series, today);
  const latest = data.reduce((mx, r) => (!mx || r.created_at > mx.created_at ? r : mx), null);
  const doc = latest
    ? { title: (latest.title || '').trim() || '제목 없는 글', sheets: sheetsFromHtml(latest.content) }
    : null;
  const usualTs = data.filter((r) => localDayKey(r.created_at) >= usualSinceKey).map((r) => r.created_at);
  const usualMin = medianMinuteOfDay(usualTs, META.write.usualFallback);
  const atMin = minuteOfDay(latestTodayTs(data.map((r) => r.created_at), today));
  const prevMonthSheets = monthSum(series, today, 1);
  const built = buildWrite({
    done: s.done, todaySheets: s.todayVal, doc, lastDaysAgo: s.lastDaysAgo,
    dayBest: s.dayBest, lastSheets: s.lastVal,
    monthSheets: monthSum(series, today, 0) ?? 0, prevMonthSheets,
    prevMonthName: today.getMonth() === 0 ? 12 : today.getMonth(),
    yearSheets: s.yearSum, yearDays: s.yearDays, today,
  });
  return view('write', s, built, {
    usualMin, atMin,
    tlMeta: s.done ? `${fmtHM(atMin ?? usualMin)} · ${s.todayVal}매` : null,
  });
}

async function fetchLang(client, userId, today, len, sinceKey, usualSince) {
  const data = await rows(client, 'study_daily_stats', 'date, study_time_sec',
    (q) => q.eq('user_id', userId).gte('date', sinceKey));
  const series = dailySeries(data, (r) => r.date, (r) => r.study_time_sec / 60, len, today)
    .map((v) => Math.round(v));
  const s = seriesStats(series, today);
  // 마지막 레슨명 = "마지막 학습일 이전" 최신 sceneTitle — 오늘 시드만 생성되고 미학습이면 잡지 않음
  let scene = null;
  if (s.lastDaysAgo != null) {
    const keys = dayKeysEndingToday(len, today);
    const lastActiveKey = keys[len - 1 - s.lastDaysAgo];
    const lessons = await rows(client, 'study_today_lessons', 'date, explanation',
      (q) => q.eq('user_id', userId)
        .or('explanation->>sceneTitle.not.is.null,explanation->>scene_title.not.is.null')
        .lte('date', lastActiveKey)
        .order('date', { ascending: false }).limit(1));
    const r = lessons[0];
    const title = r && (r.explanation?.sceneTitle || r.explanation?.scene_title);
    if (title) {
      const [, m, d] = r.date.split('-').map(Number);
      scene = { title, m, d };
    }
  }
  const logs = await rows(client, 'study_session_logs', 'created_at',
    (q) => q.eq('user_id', userId).gte('created_at', usualSince.toISOString()).order('created_at', { ascending: false }));
  const usualMin = medianMinuteOfDay(logs.map((r) => r.created_at), META.lang.usualFallback);
  const atMin = minuteOfDay(latestTodayTs([logs[0]?.created_at], today));
  const built = buildLang({
    done: s.done, todayMin: s.todayVal, scene, lastDaysAgo: s.lastDaysAgo,
    streak: s.streak, best: s.best, dayBest: s.dayBest, lastVal: s.lastVal,
    yearMin: s.yearSum, yearDays: s.yearDays, today,
  });
  return view('lang', s, built, {
    usualMin, atMin,
    tlMeta: s.done ? `${fmtHM(atMin ?? usualMin)} · ${s.todayVal}분` : null,
  });
}

async function fetchGym(client, userId, today, len, sinceKey, usualSinceKey) {
  const data = await rows(client, 'gym_sessions', 'date, status, duration_min, start_time, end_time, tags',
    (q) => q.eq('user_id', userId).gte('date', sinceKey));
  const completed = data.filter((r) => r.status === 'completed');
  const series = dailySeries(completed, (r) => r.date, (r) => r.duration_min, len, today);
  const s = seriesStats(series, today);
  const weekCount = countDaysInCurrentWeek(completed.map((r) => r.date), today);
  const w4 = weeks4Streak(weeklyActiveDayCounts(series, today, Math.ceil(len / 7)));
  // 평소 시간대 = 최근 4주 완료 세션 시작 시각 중앙값
  const usualMin = medianMinuteOfDay(
    completed.filter((r) => r.date >= usualSinceKey).map((r) => Number(r.start_time) || null),
    META.gym.usualFallback);
  const atMin = minuteOfDay(latestTodayTs(completed.map((r) => Number(r.end_time || r.start_time) || null), today));
  const todayKey = localDayKey(today);
  const todayLast = completed
    .filter((r) => r.date === todayKey)
    .reduce((mx, r) => (!mx || Number(r.end_time || 0) > Number(mx.end_time || 0) ? r : mx), null);
  const built = buildGym({
    done: s.done, todayMin: s.todayVal,
    atLabel: s.done ? fmtHM(atMin ?? usualMin) : null,
    tag: todayLast?.tags?.[0] ?? null,
    weekCount, w4, dayBest: s.dayBest, lastVal: s.lastVal, lastDaysAgo: s.lastDaysAgo,
    yearCount: completed.filter((r) => r.duration_min > 0).length, yearMin: s.yearSum, today,
  });
  return view('gym', s, built, {
    usualMin, atMin,
    tlMeta: s.done ? `${fmtHM(atMin ?? usualMin)} · ${s.todayVal}분` : null,
  });
}

/** v8 앱 4개 — 표시 순서 고정: 독서 → 글쓰기 → 어학 → 운동 (§3) */
export async function buildRealApps(client, userId) {
  const today = startOfToday();
  const len = ytdLen(today);
  const keys = dayKeysEndingToday(len, today);
  const sinceKey = keys[0];
  const usualSinceKey = keys[Math.max(0, len - USUAL_DAYS)];
  const usualSince = new Date(today);
  usualSince.setDate(usualSince.getDate() - (USUAL_DAYS - 1));
  const [read, write, lang, gym] = await Promise.all([
    fetchRead(client, userId, today, len, sinceKey),
    fetchWrite(client, userId, today, len, sinceKey, usualSinceKey),
    fetchLang(client, userId, today, len, sinceKey, usualSince),
    fetchGym(client, userId, today, len, sinceKey, usualSinceKey),
  ]);
  return [read, write, lang, gym];
}
