/**
 * Wave 11.9.6 — 세션 요약 변환 어댑터.
 *
 * spec §12 정합 형식 (Wave 11.9.5 finalize) 우선, mocks Wave 11.6D 형식 fallback.
 *  - spec: { blocks: [{type:'single', exerciseId:'영문', sets:[...]}, ...] }
 *  - mocks: { blocks: [{type:'single', exercises:[{exerciseName:'한국어', sets:[...]}]}] }
 *
 * 영문 exerciseId → 한국어 name 매핑: BUILTIN_EXERCISES + 커스텀 캐시(primeCustomExerciseCache).
 *
 * mocks/summary.html 의 sessionToVariant 와 동일 출력 형식:
 *   { label, title, subtitle, volume, time, pr, kcal, exercises:[{name, sets, pr}] }
 *
 * circuit 블록은 별 wave (현재 spec §12 정합 single 만).
 */

import { getBuiltinExercise, getCachedCustomExercise, primeCustomExerciseCache } from '../db/exercises.js';
import { getSessionById, getSessionsByRange, listCustomExercises, weekRangeISO, toISODate } from '../db/queries.js';

const WEEKDAY_KOR = ['일', '월', '화', '수', '목', '금', '토'];

export function summarizeSession(session) {
  if (!session || typeof session !== 'object') {
    return defaultEmptyVariant();
  }
  const exercises = extractExerciseList(session);
  const subtitle = formatSubtitle(session.date);
  const prCount = exercises.reduce((sum, e) => sum + (e.pr ? 1 : 0), 0);
  return {
    label: '운동 완료',
    title: '잘 끝냈다',
    subtitle,
    volume: (Number(session.totalVolume) || 0).toLocaleString(),
    time: Number(session.durationMin) || 0,
    pr: prCount,
    kcal: Number(session.totalCalories) || 0,
    exercises,
  };
}

function extractExerciseList(session) {
  const blocks = Array.isArray(session.blocks) ? session.blocks : [];
  const out = [];
  for (const b of blocks) {
    if (!b) continue;
    if (b.type === 'circuit') continue; // 별 wave
    // spec §12 — { type:'single', exerciseId, sets }
    if (b.exerciseId && Array.isArray(b.sets)) {
      const item = formatSingleSpec(b);
      if (item) out.push(item);
      continue;
    }
    // mocks Wave 11.6D — { type:'single', exercises:[{exerciseName, sets, ...}] }
    if (Array.isArray(b.exercises)) {
      for (const ex of b.exercises) {
        const item = formatSingleMocks(ex);
        if (item) out.push(item);
      }
    }
  }
  return out;
}

function formatSingleSpec(block) {
  const name = exerciseIdToName(block.exerciseId);
  const allSets = Array.isArray(block.sets) ? block.sets : [];
  const doneSets = allSets.filter((s) => s && s.done);
  if (!doneSets.length) return null; // 완료 세트 없으면 표시 제외
  const firstSet = doneSets[0];
  if (firstSet && firstSet.duration != null) {
    return formatTimeBased(name, firstSet, doneSets.some((s) => s.pr), doneSets.length);
  }
  return formatVolumeBased(name, doneSets);
}

function formatSingleMocks(ex) {
  if (!ex) return null;
  const name = ex.exerciseName || ex.exerciseId || '';
  const allSets = Array.isArray(ex.sets) ? ex.sets : [];
  if (!allSets.length) return null;
  const firstSet = allSets[0];
  if (firstSet && firstSet.duration != null) {
    return formatTimeBased(name, firstSet, false, allSets.length);
  }
  return formatVolumeBased(name, allSets, false);
}

function formatTimeBased(name, firstSet, pr, setCount = 1) {
  const min = Math.round(Number(firstSet.duration) / 60);
  const km = firstSet.distance ? ` · ${firstSet.distance}km` : '';
  // 영수증 3열 — 시간기반은 볼륨(kg) 없음. volume 열에 시간/거리 문자열 노출.
  return { name, sets: `${min}분${km}`, setCount, volume: `${min}분${km}`, pr: !!pr };
}

function formatVolumeBased(name, sets, pr) {
  const total = sets.reduce(
    (s, x) => s + (Number(x.weight) || 0) * (Number(x.reps) || 0),
    0,
  );
  const hasPR = pr === undefined ? sets.some((s) => s.pr) : !!pr;
  // sets — 기존 결합 문자열 유지. setCount/volume — 영수증 3열용 분리 필드.
  return {
    name,
    sets: `${sets.length}세트 · ${total.toLocaleString()}kg`,
    setCount: sets.length,
    volume: `${total.toLocaleString()}kg`,
    pr: hasPR,
  };
}

export function exerciseIdToName(id) {
  if (!id) return '';
  const builtin = getBuiltinExercise(id);
  if (builtin?.name) return builtin.name;
  const custom = getCachedCustomExercise(id);
  if (custom?.name) return custom.name;
  return id; // fallback — unknown (캐시 미prime 시 cust_* id)
}

function formatSubtitle(date) {
  if (!date) return '';
  const m = String(date).match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return String(date);
  const d = new Date(`${date}T00:00:00`);
  if (Number.isNaN(d.getTime())) return String(date);
  return `${date} · ${WEEKDAY_KOR[d.getDay()]}요일`;
}

function defaultEmptyVariant() {
  return {
    label: '운동 완료',
    title: '잘 끝냈다',
    subtitle: '',
    volume: '0',
    time: 0,
    pr: 0,
    kcal: 0,
    exercises: [],
  };
}

function formatHHMM(ts) {
  if (!Number.isFinite(ts)) return '';
  const d = new Date(ts);
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  return `${hh}:${mm}`;
}

function formatReceiptDate(session) {
  if (!session?.date) return '';
  const m = String(session.date).match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return String(session.date);
  const d = new Date(`${session.date}T00:00:00`);
  if (Number.isNaN(d.getTime())) return String(session.date);
  const weekday = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'][d.getDay()];
  const start = formatHHMM(session.startTime);
  const end = formatHHMM(session.endTime);
  const time = start && end ? ` · ${start}→${end}` : '';
  return `${session.date} · ${weekday}${time}`;
}

function buildReceiptNo(session) {
  // 시안(summary-paper.html:65) 카피 — "SESSION · #0142" (RECEIPT 단어 없음).
  if (!session?.id) return 'SESSION';
  const tail = String(session.id).match(/(\d{4,})$/);
  const num = tail ? tail[1].slice(-4) : String(session.id).slice(-4);
  return `SESSION · #${num}`;
}

function renderExRow(ex) {
  // 라이트 페이퍼 영수증 3열 — 운동명(PR ★) | 세트수 | 볼륨(우). summary-paper.html 정합.
  const star = ex.pr
    ? '<span style="color:var(--crail-deep);font-size:11px;">★</span>'
    : '';
  const nameColor = ex.pr ? 'var(--crail-deep)' : 'var(--ink-1)';
  const count = Number.isFinite(ex.setCount) ? `${ex.setCount}세트` : '';
  const vol = ex.volume != null ? ex.volume : ex.sets;
  return `<div style="display:grid;grid-template-columns:1fr auto auto;align-items:baseline;column-gap:12px;padding:7px 0;"><span style="font-size:13px;font-weight:500;color:${nameColor};display:flex;align-items:center;gap:6px;white-space:nowrap;">${escapeText(ex.name)}${star}</span><span class="mono" style="font-size:12px;color:var(--ink-4);white-space:nowrap;">${escapeText(count)}</span><span class="mono" style="font-size:13px;font-weight:600;color:var(--ink-2);white-space:nowrap;min-width:56px;text-align:right;">${escapeText(vol)}</span></div>`;
}

function escapeText(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

/**
 * 영수증 하단 스탬프용 — 연속 운동 주(週) 수. home.js computeWeekStreak 와 동일 규칙:
 * 이번 주부터 거꾸로, 운동한 주가 연속되는 동안 카운트. 이번 주(i=0) 미운동은 streak 미파기.
 * 입력: completed 세션 날짜 배열(date 문자열). 빈 배열 → 0.
 */
function computeWeekStreakFromDates(dates, now) {
  if (!Array.isArray(dates) || !dates.length) return 0;
  let streak = 0;
  let cursor = new Date(now);
  for (let i = 0; i < 60; i += 1) {
    const { from, to } = weekRangeISO(cursor);
    const hit = dates.some((d) => d >= from && d <= to);
    if (hit) streak += 1;
    else if (i > 0) break; // 이번 주(i=0) 미운동은 유지, 그 이전 빈 주는 중단
    cursor = new Date(cursor);
    cursor.setDate(cursor.getDate() - 7);
  }
  return streak;
}

/** 최근 ~70일 completed 세션 기준 연속 주 수. db 미가용 시 0. */
async function fetchWeekStreak(now = Date.now()) {
  try {
    const today = new Date(now);
    const todayISO = toISODate(today);
    const from = new Date(today);
    from.setDate(today.getDate() - 70);
    const rows = await getSessionsByRange(toISODate(from), todayISO);
    const dates = (rows || [])
      .filter((s) => s && s.status === 'completed')
      .map((s) => String(s.date || ''))
      .filter(Boolean);
    return computeWeekStreakFromDates(dates, now);
  } catch (_) {
    return 0;
  }
}

async function findSummarySession() {
  let id = null;
  try { id = typeof sessionStorage !== 'undefined' ? sessionStorage.getItem('gym.summary.sessionId') : null; }
  catch (_) { /* private */ }
  if (id) {
    try {
      const s = await getSessionById(id);
      if (s) return s;
    } catch (_) { /* fall through */ }
  }
  // 폴백: 오늘 completed 중 endTime 최근
  try {
    const today = new Date().toISOString().slice(0, 10);
    const rows = await getSessionsByRange(today, today);
    const completed = (rows || []).filter((s) => s && s.status === 'completed');
    if (completed.length) {
      completed.sort((a, b) => (a.endTime || a.startTime || 0) - (b.endTime || b.startTime || 0));
      return completed[completed.length - 1];
    }
  } catch (_) { /* db unavailable */ }
  return null;
}

export async function mountSummaryView() {
  if (typeof document === 'undefined') return { skipped: 'no-document' };
  const session = await findSummarySession();
  if (!session) return { skipped: 'no-session' };
  // 커스텀 운동 이름 동기 lookup 캐시 prime — 영수증 운동 목록이 cust_* id 대신 이름 표시.
  try { primeCustomExerciseCache(await listCustomExercises()); } catch (_) { /* db 없음 fallback */ }
  const data = summarizeSession(session);

  const set = (id, text) => {
    const el = document.getElementById(id);
    if (el) el.textContent = text;
  };
  // r-meta 3열 — 소요 / 신기록(PR 카운트) / 세트(총 세트수). #summaryKcal 은 총 세트수로 재사용.
  const totalSets = data.exercises.reduce((s, e) => s + (Number(e.setCount) || 0), 0);
  set('summaryReceiptNo', buildReceiptNo(session));
  set('summaryDate', formatReceiptDate(session));
  set('summaryTotal', data.volume);
  set('summaryDuration', `${data.time}분`);
  set('summaryPR', String(data.pr));
  set('summaryKcal', String(totalSets));

  const exList = document.getElementById('summaryExList');
  if (exList) {
    if (!data.exercises.length) {
      exList.innerHTML = '<div style="text-align:center;padding:10px 0;font-size:13px;color:var(--ink-4);">기록 없음</div>';
    } else {
      exList.innerHTML = data.exercises.map(renderExRow).join('');
    }
  }

  // r-foot 스탬프 — 연속 주 칩. streak<1 이면 중립 '기록 완료' 로 폴백(스탬프 유지).
  const streak = await fetchWeekStreak();
  const stamp = document.getElementById('summaryStamp');
  const stampStar = document.getElementById('summaryStampStar');
  if (stamp) {
    if (streak >= 1) {
      stamp.textContent = `${streak}주 연속 달성`;
      if (stampStar) stampStar.style.display = '';
    } else {
      stamp.textContent = '기록 완료';
      if (stampStar) stampStar.style.display = 'none';
    }
  }
  return { mounted: true, sessionId: session.id, weekStreak: streak };
}

if (typeof window !== 'undefined') {
  window.gymSessionSummary = {
    summarizeSession,
    exerciseIdToName,
    mountSummaryView,
  };
}
