import { getBuiltinExercise, getCachedCustomExercise } from '../db/exercises.js';

export const CONFIRMED_BODY_WEIGHT_KG = 73;
export const BODY_WEIGHT_CONFIRMED_ON = '2026-10-24';
export function isAssistedExercise(exercise) {
  const ex = typeof exercise === 'object' && exercise ? exercise
    : getBuiltinExercise(exercise) || getCachedCustomExercise(exercise) || { name: exercise };
  if (ex.equipment === 'assisted') return true;
  const key = String(ex.name || '').toLowerCase().replace(/[^\p{L}\p{N}]/gu, '');
  return ['어시스티드친', '어시스티드친업', '어시스트친', '어시스트친업', '어시스티드풀업',
    '어시스트풀업', 'assistedchin', 'assistedchinup', 'assistedpullup'].includes(key);
}
export function isAssistedSet(set, exercise) {
  return set?.weightMode === 'assistance' || isAssistedExercise(exercise);
}
export function currentBodyWeight(weights = [], today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date())) {
  if (today < BODY_WEIGHT_CONFIRMED_ON) return null;
  const rows = weights.filter(w => w.date >= BODY_WEIGHT_CONFIRMED_ON && w.date <= today
    && Number.isFinite(Number(w.kg ?? w.weight)) && Number(w.kg ?? w.weight) > 0).sort((a, b) => b.date.localeCompare(a.date));
  return rows.length ? Number(rows[0].kg ?? rows[0].weight) : CONFIRMED_BODY_WEIGHT_KG;
}
export function snapshotAssistance(set, exercise, bodyWeightKg) {
  if (!isAssistedSet(set, exercise)) return set;
  const out = { ...set, weightMode: 'assistance', pr: false };
  if (out.bodyWeightKg == null && Number.isFinite(bodyWeightKg) && bodyWeightKg > 0) out.bodyWeightKg = bodyWeightKg;
  return out;
}
export function projectAssistedSet(set, exercise, previewBodyWeight = null) {
  return snapshotAssistance(set, exercise, set?.done ? null : previewBodyWeight);
}
export function effectiveLoad(set) {
  if (!Number.isFinite(set?.bodyWeightKg) || set.bodyWeightKg <= 0
      || !Number.isFinite(set?.weight) || set.weight < 0) return null;
  return Math.max(0, set.bodyWeightKg - set.weight);
}
export function estimatedSetVolume(set) {
  const load = effectiveLoad(set);
  return load != null && Number.isFinite(set?.reps) && set.reps >= 0 ? load * set.reps : null;
}
export function setLoadVolume(set, exercise) {
  return isAssistedSet(set, exercise) ? estimatedSetVolume(set) ?? 0
    : (Number(set?.weight) || 0) * (Number(set?.reps) || 0);
}
export function externalSetVolume(set, exercise) {
  return isAssistedSet(set, exercise) ? 0 : setLoadVolume(set);
}
export function externalDoneVolume(session) {
  return (session?.blocks || []).reduce((sum, b) => sum + (b.sets || []).filter(s => s?.done)
    .reduce((n, s) => n + externalSetVolume(s, b.exerciseId || b.exerciseName), 0), 0);
}
export function displayExternalVolume(session) {
  return (session?.blocks || []).some(b => isAssistedExercise(b.exerciseId || b.exerciseName)
    || (b.sets || []).some(s => s?.weightMode === 'assistance'))
    ? externalDoneVolume(session) : Number(session?.totalVolume) || 0;
}
export function assistedVolumeLabel(sets) {
  const values = sets.map(estimatedSetVolume);
  return sets.length && values.every(v => v != null)
    ? `추정 ${values.reduce((a, b) => a + b, 0).toLocaleString()}kg` : '당시 체중 없음 · 추정값 없음';
}
export function assistanceReduction(current, previous = []) {
  const sameReps = previous.filter(s => s?.reps === current?.reps && Number.isFinite(s.weight));
  const min = sameReps.length ? Math.min(...sameReps.map(s => s.weight)) : null;
  return min != null && current?.reps > 0 && current?.weight < min ? min - current.weight : null;
}
