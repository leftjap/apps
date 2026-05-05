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

if (typeof window !== 'undefined') {
  window.gymSessionSummary = {
    summarizeSession,
    exerciseIdToName,
  };
}
