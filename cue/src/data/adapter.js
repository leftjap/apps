/* adapter.js — 실데이터 → cue 앱 shape (작업지시서 v9 정보 재설계 §7 데이터 계약).
   같은 Supabase 프로젝트의 4앱 테이블을 읽어 빌드. mock 과 동일 shape 라 컴포넌트 그대로 동작.

   Supabase client 는 주입(DI):
     - 앱: 브라우저 anon 클라이언트 (RLS 가 로그인 사용자로 격리)
     - 검증 스크립트: service-role 클라이언트 (RLS 우회 → owner 명시 필터 필수)
   → 두 경로 모두 owner 컬럼을 명시 필터(study/gym=user_id, today/book=owner_id).

   슬롯 구조(§7 — 직전 → 이번 주 근접목표 → 추세/이번 달):
     독서 read   = book_reading_seconds.seconds/60 (분). 제목·진도% 미연동 → hook=직전 시점·slot3=이번 달 시간
     글쓰기 write = today_entries (kind 라벨·title·매수·created_at). 이번 주=편수(행), 이번 달=매수
     어학 lang   = study_daily_stats(utterance·study_time·new_sentences) + study_review_queue(복습 대기·익힌 문장) + sceneTitle
     운동 gym    = gym_sessions (tags=부위 2개·blocks PR·total_volume·duration_min). 주 4일 목표·이번 달 횟수
   문장 생성은 copy.js (§5·§9), 수치 함수는 transforms.js. */
import {
  dailySeries, dayKeysEndingToday, localDayKey, runDays, longestRun,
  lastActiveDaysAgo, sheetsFromHtml, countDaysInCurrentWeek, startOfToday,
  latestTodayTs, minuteOfDay, medianMinuteOfDay, p2,
  monthSeries, monthSum, weeklyActiveDayCounts, weeks4Streak,
  countRowsInWeek, countRowsInMonth, countPRs, thisYearSlice,
} from './transforms.js';
import { buildRead, buildWrite, buildLang, buildGym } from './copy.js';

const USUAL_DAYS = 28; // usualMin 중앙값 산출 창 — 최근 4주
const WRITING_KINDS = ['navi', 'fiction', 'blog', 'memo']; // today 앱 글쓰기 카테고리 (본인 owner 한정)
// 글쓰기 kind 라벨 (검증: today/src/features/spotlight.js KIND_TO_LABEL)
const KIND_LABEL = { navi: '오늘의 네비', soyoun_navi: '오늘의 네비', fiction: '단편', blog: '블로그', memo: '메모' };
// 운동 부위 라벨 (검증: gym/src/db/exercises.js PARTS)
const PARTS = { chest: '가슴', back: '등', shoulder: '어깨', legs: '하체', arms: '팔', cardio: '맨몸' };

// 앱별 정적 메타 (딥링크·usualMin 폴백·캘린더 단위)
const META = {
  // 독서 CTA = 맥 밀리의서재 로컬앱(상시 실행) 포커스. flutterpcviewer:// = 맥앱 등록 스킴(Info.plist CFBundleURLSchemes). 맥앱 전용(iOS 스킴 상이).
  read:  { url: 'flutterpcviewer://',  usualFallback: 22 * 60 + 30, calUnit: '분' },
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

/** 올해 1월 1일 키 (행-수 연간 지표의 전년 제외 경계) */
function jan1Key(today) {
  return `${today.getFullYear()}-01-01`;
}

/** 올해 경과 주 수 (페이스 분모) — 실제 1/1~오늘 기준, 최소 1주 */
function weeksElapsed(today) {
  const base = new Date(today); base.setHours(0, 0, 0, 0);
  const jan1 = new Date(base.getFullYear(), 0, 1);
  const days = Math.round((base - jan1) / 86400000) + 1;
  return Math.max(1, days / 7);
}

/** 모든 활동 공용 수치 묶음 (series = 올해 일별, 마지막 = 오늘) */
function seriesStats(series, today) {
  const last = series.length - 1;
  const todayVal = round1(series[last]);
  const done = todayVal > 0;
  const lastDaysAgo = done ? 0 : lastActiveDaysAgo(series);
  const weekly8 = weeklyActiveDayCounts(series, today, 8); // §4 주별 활동 일수(빈도)
  const yearSlice = thisYearSlice(series, today); // 윈도우가 전년으로 넘어가도 올해만 누적
  return {
    todayVal, done,
    streak: done ? runDays(series) : runDays(series.slice(0, last)),
    best: longestRun(series),
    dayBest: round1(Math.max(...series, 0)),
    lastDaysAgo,
    lastVal: lastDaysAgo != null ? round1(series[last - lastDaysAgo]) : null,
    yearSum: round1(yearSlice.reduce((a, b) => a + b, 0)),
    yearDays: yearSlice.filter((v) => v > 0).length,
    cal: monthSeries(series, today),
    weekly8,
    weekDays: weekly8[7] ?? 0,
    lastWeekDays: weekly8[6] ?? 0,
    monthVal: monthSum(series, today, 0) ?? 0,
    prevMonthVal: monthSum(series, today, 1),
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

/** count(head) — 행 수만 (복습 대기·익힌 문장) */
async function countRows(client, table, filters = (q) => q) {
  if (!client) return 0;
  try {
    const { count, error } = await filters(client.from(table).select('*', { count: 'exact', head: true }));
    if (error) { console.warn(`[adapter] count ${table}`, error.message); return 0; }
    return count || 0;
  } catch (e) {
    console.warn(`[adapter] count ${table}`, e); return 0;
  }
}

async function fetchRead(client, userId, today, len, sinceKey) {
  const data = await rows(client, 'book_reading_seconds', 'day, seconds',
    (q) => q.eq('owner_id', userId).gte('day', sinceKey));
  const series = dailySeries(data, (r) => r.day, (r) => Math.round(r.seconds / 60), len, today);
  const s = seriesStats(series, today);
  // 밀리 현재 책(제목·진도) — millie-book-sync 가 맥 밀리앱 로컬 DB 에서 적재. 테이블 없으면 rows()=[] (안전).
  const cbRows = await rows(client, 'book_current_reading', 'title, read_percent',
    (q) => q.eq('owner_id', userId).limit(1));
  const currentBook = cbRows[0] ? { title: cbRows[0].title, percent: cbRows[0].read_percent } : null;
  const built = buildRead({
    done: s.done, todayMin: s.todayVal, lastVal: s.lastVal, lastDaysAgo: s.lastDaysAgo,
    weekDays: s.weekDays, lastWeekDays: s.lastWeekDays,
    monthMin: s.monthVal, prevMonthMin: s.prevMonthVal,
    streak: s.streak, best: s.best, dayBest: s.dayBest,
    yearMin: s.yearSum, yearDays: s.yearDays,
    paceAvg: round1(s.yearDays / weeksElapsed(today)), today, currentBook,
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
    ? { title: (latest.title || '').trim() || '제목 없는 글', sheets: sheetsFromHtml(latest.content), kindLabel: KIND_LABEL[latest.kind] || '오늘의 네비' }
    : null;
  const dateKeys = data.map((r) => localDayKey(r.created_at));
  const yearEntries = dateKeys.filter((k) => k >= jan1Key(today)).length; // 윈도우 전년 행 제외
  const usualTs = data.filter((r) => localDayKey(r.created_at) >= usualSinceKey).map((r) => r.created_at);
  const usualMin = medianMinuteOfDay(usualTs, META.write.usualFallback);
  const atMin = minuteOfDay(latestTodayTs(data.map((r) => r.created_at), today));
  const built = buildWrite({
    done: s.done, todaySheets: s.todayVal, doc, lastDaysAgo: s.lastDaysAgo,
    weekEntries: countRowsInWeek(dateKeys, today, 0), lastWeekEntries: countRowsInWeek(dateKeys, today, 1),
    monthSheets: s.monthVal, prevMonthSheets: s.prevMonthVal,
    dayBest: s.dayBest, lastSheets: s.lastVal,
    yearSheets: s.yearSum, yearEntries,
    paceAvg: round1(yearEntries / weeksElapsed(today)), today,
  });
  return view('write', s, built, {
    usualMin, atMin,
    tlMeta: s.done ? `${fmtHM(atMin ?? usualMin)} · ${s.todayVal}매` : null,
  });
}

async function fetchLang(client, userId, today, len, sinceKey, usualSince) {
  const data = await rows(client, 'study_daily_stats', 'date, study_time_sec, utterance_count, new_sentences',
    (q) => q.eq('user_id', userId).gte('date', sinceKey));
  const series = dailySeries(data, (r) => r.date, (r) => r.study_time_sec / 60, len, today)
    .map((v) => Math.round(v));
  const utterSeries = dailySeries(data, (r) => r.date, (r) => r.utterance_count, len, today);
  const newSeries = dailySeries(data, (r) => r.date, (r) => r.new_sentences, len, today);
  const s = seriesStats(series, today);
  const lastIdx = s.lastDaysAgo != null ? series.length - 1 - s.lastDaysAgo : null;
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
  const todayKey = localDayKey(today);
  // SRS 복습 대기(오늘 만료) · 익힌 문장(큐 전체) — en/ja 둘 다 (lang 필터 없음)
  const reviewDue = await countRows(client, 'study_review_queue', (q) => q.eq('user_id', userId).lte('next_review', todayKey));
  const collected = await countRows(client, 'study_review_queue', (q) => q.eq('user_id', userId));
  const logs = await rows(client, 'study_session_logs', 'created_at',
    (q) => q.eq('user_id', userId).gte('created_at', usualSince.toISOString()).order('created_at', { ascending: false }));
  const usualMin = medianMinuteOfDay(logs.map((r) => r.created_at), META.lang.usualFallback);
  const atMin = minuteOfDay(latestTodayTs([logs[0]?.created_at], today));
  const built = buildLang({
    done: s.done, todayMin: s.todayVal, scene, lastDaysAgo: s.lastDaysAgo,
    lastUtter: lastIdx != null ? Math.round(utterSeries[lastIdx]) : null,
    lastNew: lastIdx != null ? Math.round(newSeries[lastIdx]) : null,
    weekDays: s.weekDays, lastWeekDays: s.lastWeekDays,
    monthNew: Math.round(monthSum(newSeries, today, 0) ?? 0),
    prevMonthNew: (() => { const v = monthSum(newSeries, today, 1); return v == null ? null : Math.round(v); })(),
    reviewDue, streak: s.streak, best: s.best, dayBest: s.dayBest,
    yearMin: s.yearSum, yearUtter: Math.round(thisYearSlice(utterSeries, today).reduce((a, b) => a + b, 0)), collected,
    paceAvg: round1(s.yearDays / weeksElapsed(today)), today,
  });
  return view('lang', s, built, {
    usualMin, atMin,
    tlMeta: s.done ? `${fmtHM(atMin ?? usualMin)} · ${s.todayVal}분` : null,
  });
}

async function fetchGym(client, userId, today, len, sinceKey, usualSinceKey) {
  const data = await rows(client, 'gym_sessions', 'date, status, duration_min, start_time, end_time, tags, blocks, total_volume',
    (q) => q.eq('user_id', userId).gte('date', sinceKey));
  // 운동 세션 = 완료 OR (진행중 + 완료세트 있음). 진행중도 '종료'만 안 눌렀을 뿐 실제 운동 → 카운트 포함.
  const hasDoneSets = (r) => Array.isArray(r.blocks)
    && r.blocks.some((b) => b && Array.isArray(b.sets) && b.sets.some((x) => x && x.done));
  const workouts = data.filter((r) => r.status === 'completed' || (r.status === 'active' && hasDoneSets(r)));
  // 진행중(미finalize) 세션 표시용 유효 시간·볼륨 — gym finalize 와 동일 계산(완료세트 weight×reps,
  // 마지막 finishedAt−start). DB 는 안 바꾸고 cue 가 읽기 단에서 보정. 완료 세션은 저장값 그대로.
  const effMin = (r) => {
    const d = Number(r.duration_min) || 0; if (d > 0) return d;
    const fins = (r.blocks || []).map((b) => Number(b && b.finishedAt) || 0).filter(Boolean);
    const st = Number(r.start_time) || 0;
    return fins.length && st ? Math.max(1, Math.round((Math.max(...fins) - st) / 60000)) : 0;
  };
  const effVol = (r) => {
    const v = Number(r && r.total_volume) || 0; if (v > 0) return v;
    let sum = 0;
    for (const b of (r && r.blocks) || []) for (const set of b.sets || []) if (set && set.done) sum += (Number(set.weight) || 0) * (Number(set.reps) || 0);
    return sum;
  };
  const effEnd = (r) => Number(r.end_time) || Math.max(0, ...(r.blocks || []).map((b) => Number(b && b.finishedAt) || 0));
  // 미저장(진행중) 세션 — 오늘/어제 것을 '저장 전' nudge 로 (gym 에서 마무리하면 PR·볼륨까지 저장).
  const todayKey = localDayKey(today);
  const ydayKey = localDayKey(new Date(today.getFullYear(), today.getMonth(), today.getDate() - 1));
  const activeWDates = workouts.filter((r) => r.status === 'active').map((r) => r.date);
  const pending = activeWDates.includes(todayKey) ? { daysAgo: 0 }
    : activeWDates.includes(ydayKey) ? { daysAgo: 1 }
      : null;
  const series = dailySeries(workouts, (r) => r.date, effMin, len, today);
  const s = seriesStats(series, today);
  const weekCount = countDaysInCurrentWeek(workouts.map((r) => r.date), today);
  const w4 = weeks4Streak(weeklyActiveDayCounts(series, today, Math.ceil(len / 7)));
  // 직전 운동 = done 이면 오늘 것, 아니면 가장 최근(미저장 active 포함). 시각 동률은 effEnd 늦은 쪽.
  const lastSession = workouts
    .slice()
    .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : effEnd(b) - effEnd(a)))[0] || null;
  const parts = (lastSession?.tags || []).slice(0, 2).map((t) => PARTS[t] || t);
  const usualMin = medianMinuteOfDay(
    workouts.filter((r) => r.date >= usualSinceKey).map((r) => Number(r.start_time) || null),
    META.gym.usualFallback);
  const atMin = minuteOfDay(latestTodayTs(workouts.map((r) => effEnd(r) || Number(r.start_time) || null), today));
  const yearCount = workouts.filter((r) => r.date >= jan1Key(today)).length; // 윈도우 전년 제외
  const built = buildGym({
    done: s.done, todayMin: s.todayVal,
    atLabel: s.done ? fmtHM(atMin ?? usualMin) : null,
    parts, prCount: countPRs(lastSession?.blocks),
    todayVolume: Math.round(effVol(lastSession)),
    lastMin: Math.round(effMin(lastSession || {})),
    weekCount, lastDaysAgo: s.lastDaysAgo, w4, pending,
    monthCount: countRowsInMonth(workouts.map((r) => r.date), today, 0),
    prevMonthCount: countRowsInMonth(workouts.map((r) => r.date), today, 1),
    dayBest: s.dayBest, yearCount, yearMin: s.yearSum,
    paceAvg: round1(yearCount / weeksElapsed(today)), today,
  });
  return view('gym', s, built, {
    usualMin, atMin,
    tlMeta: s.done ? `${fmtHM(atMin ?? usualMin)} · ${s.todayVal}분` : null,
  });
}

/** cue 앱 4개 — 표시 순서 고정: 독서 → 글쓰기 → 어학 → 운동 (§3) */
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
