/**
 * Wave 11.9.6 — 세션 요약 변환 어댑터.
 *
 * spec §12 정합 형식 (Wave 11.9.5 finalize) 우선, mocks Wave 11.6D 형식 fallback.
 *  - spec: { blocks: [{type:'single', exerciseId:'영문', sets:[...]}, ...] }
 *  - mocks: { blocks: [{type:'single', exercises:[{exerciseName:'한국어', sets:[...]}]}] }
 *
 * 영문 exerciseId → 한국어 name 매핑은 BUILTIN_EXERCISES 만 (custom 미매핑 시 영문 fallback — 별 wave).
 *
 * mocks/summary.html 의 sessionToVariant 와 동일 출력 형식:
 *   { label, title, subtitle, volume, time, pr, kcal, exercises:[{name, sets, pr}] }
 *
 * circuit 블록은 별 wave (현재 spec §12 정합 single 만).
 */

import { getBuiltinExercise } from '../db/exercises.js';
import { getSessionById, getSessionsByRange } from '../db/queries.js';

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
    return formatTimeBased(name, firstSet, doneSets.some((s) => s.pr));
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
    return formatTimeBased(name, firstSet, false);
  }
  return formatVolumeBased(name, allSets, false);
}

function formatTimeBased(name, firstSet, pr) {
  const min = Math.round(Number(firstSet.duration) / 60);
  const km = firstSet.distance ? ` · ${firstSet.distance}km` : '';
  return { name, sets: `${min}분${km}`, pr: !!pr };
}

function formatVolumeBased(name, sets, pr) {
  const total = sets.reduce(
    (s, x) => s + (Number(x.weight) || 0) * (Number(x.reps) || 0),
    0,
  );
  const hasPR = pr === undefined ? sets.some((s) => s.pr) : !!pr;
  return {
    name,
    sets: `${sets.length}세트 · ${total.toLocaleString()}kg`,
    pr: hasPR,
  };
}

export function exerciseIdToName(id) {
  if (!id) return '';
  const builtin = getBuiltinExercise(id);
  if (builtin?.name) return builtin.name;
  return id; // fallback — custom/unknown
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
  if (!session?.id) return 'SESSION RECEIPT';
  const tail = String(session.id).match(/(\d{4,})$/);
  const num = tail ? tail[1].slice(-4) : String(session.id).slice(-4);
  return `SESSION RECEIPT · #${num}`;
}

function renderExRow(ex) {
  const prBadge = ex.pr
    ? '<span style="font-size:8px;color:var(--accent);padding:1px 5px;border:1px solid var(--accent);border-radius:3px;font-weight:600;margin-left:6px;">PR</span>'
    : '';
  return `<div class="kr" style="display:flex;justify-content:space-between;align-items:baseline;padding:5px 0;"><span style="font-size:12px;color:#fff;display:flex;align-items:center;gap:6px;">${escapeText(ex.name)}${prBadge}</span><span class="num" style="font-size:12px;color:rgba(255,255,255,0.7);font-weight:500;">${escapeText(ex.sets)}</span></div>`;
}

function escapeText(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
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
  const data = summarizeSession(session);

  const set = (id, text) => {
    const el = document.getElementById(id);
    if (el) el.textContent = text;
  };
  set('summaryReceiptNo', buildReceiptNo(session));
  set('summaryDate', formatReceiptDate(session));
  set('summaryTotal', data.volume);
  set('summaryDuration', `${data.time}분`);
  set('summaryPR', data.pr > 0 ? `${data.pr} PR ★` : '0 PR');
  set('summaryKcal', `${data.kcal} kcal`);

  const exList = document.getElementById('summaryExList');
  if (exList) {
    if (!data.exercises.length) {
      exList.innerHTML = '<div class="kr" style="text-align:center;padding:10px 0;font-size:11px;color:rgba(255,255,255,0.3);">기록 없음</div>';
    } else {
      exList.innerHTML = data.exercises.map(renderExRow).join('');
    }
  }
  return { mounted: true, sessionId: session.id };
}

if (typeof window !== 'undefined') {
  window.gymSessionSummary = {
    summarizeSession,
    exerciseIdToName,
    mountSummaryView,
  };
}
