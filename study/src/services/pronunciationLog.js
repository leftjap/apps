import { buildChainSteps } from '../components/session/applied.js';
/**
 * pronunciationLog.js — 발음 분석 결과 영속화 (spec §9-5 약점 음소 누적의 데이터 source).
 *
 * Wave A.7.2 범위:
 *  - buildPronunciationLog(params)  : Azure 결과 → Dexie row (순수). mockFallback 결과는 null 반환 (저장 스킵)
 *  - savePronunciationLog(db, params): Dexie put. db/log 누락 또는 mock 결과 시 noop
 *
 * Dexie row schema (sync.js L153-180 정합):
 *   { id, lang, sentenceId, date, overallScore, phonemeScores, weakPhonemes, recognizedText, createdAt }
 */

function newId() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
  return `p_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

export function buildPronunciationLog({ result, sentenceId, lang, date } = {}) {
  if (!result || result.mockFallback) return null;
  return {
    id: newId(),
    lang,
    date,
    sentenceId: sentenceId ?? null,
    overallScore: Number(result.score) || 0,
    // Wave A.18.1 — 진단용 하위점수 + 캡처 레벨(rms). 저점 원인 추적(정확도 vs 유창성·완성도 vs 약한 캡처).
    pronScore: result.pronScore ?? null,
    fluencyScore: result.fluencyScore ?? null,
    completenessScore: result.completenessScore ?? null,
    prosodyScore: result.prosodyScore ?? null,
    captureRms: result.captureRms ?? null,
    // 2026-08-29 감점제 1단계 — 억양 단어 태그 요약. 로컬 전용(동기화 매핑 밖) — 감점 단가 보정 원천.
    prosodyIssues: result.prosodyIssues ?? null,
    // 2026-08-31 감점제 화면 전환 — overallScore 는 이제 감점 점수. 원 정확도와 체계 표식을 남겨
    // 전환 전 행(acc 척도)과 구별한다 (§5.5 "전환 시점을 기록에 표시"). 로컬 전용.
    accuracyScore: result.accuracyScore ?? null,
    scoreModel: result.scoreModel ?? null,
    // 2026-08-29 오후 — 감점 3단계 보정·실발화 재현 원천 (단어별 점수·miscue 판정). 종전엔 저장이
    // 안 돼 시뮬이 음소→단어 근사에 머물렀다(전 세션 §5.5 한계). prosodyIssues 와 같은 로컬 전용 패턴.
    wordScores: Array.isArray(result.wordScores) ? result.wordScores : null,
    omissions: Array.isArray(result.omissions) ? result.omissions : null,
    insertions: Array.isArray(result.insertions) ? result.insertions : null,
    phonemeScores: Array.isArray(result.phonemeScores) ? result.phonemeScores : [],
    weakPhonemes: Array.isArray(result.weakPhonemes) ? result.weakPhonemes : [],
    recognizedText: result.recognizedText ?? null,
    // 2026-09-01 — 축약 레퍼런스 채택 여부(analyzeWavRest 의 contractedRef). 로컬 전용 진단 —
    // 어느 기준으로 채점됐는지를 행에서 직접 구별한다 (종전엔 wordScores 철자로만 간접 추적 가능했다).
    contractedRef: result.contractedRef ?? null,
    // 2026-09-03 채점 지연 계측 — 구간별 ms (speech.js·sessionAnalyze.js 가 채움). 동기화 매핑 포함(0008).
    // sinceStopMs = 녹음 종료→저장, 즉 사용자가 체감한 지연.
    timing: (result.timing && typeof result.timing === 'object')
      ? { ...result.timing, ...(Number.isFinite(result.timing.stopAt) ? { sinceStopMs: Date.now() - result.timing.stopAt } : {}) }
      : null,
    createdAt: new Date().toISOString(),
  };
}

export async function savePronunciationLog(db, params) {
  if (!db?.pronunciationLog) return null;
  const log = buildPronunciationLog(params);
  if (!log) return null;
  await db.pronunciationLog.put(log);
  return log;
}

/* 응용 드릴 발화 이력 (2026-08-29 사용자 요구) — 복습에서 "이 응용 문장을 몇 번 말했고 보통 몇 점인지"를
 * 보여주려면 원천이 필요하다. 종전에 드릴 점수는 세션 스냅샷(exLog.drills)에만 살아 세션이 끝나면 사라졌다.
 * 새 테이블을 만들지 않고 같은 pronunciationLog 에 `<카드id>#drill#<드릴 문장>` 으로 구분해 적재한다 —
 * 기존 집계는 전부 **카드 id 로 조회**하므로(session-review loadSentenceLog · stats latestPronScoreByCard ·
 * sentences buildSentenceRows) 이 행들을 그냥 지나친다. 스키마·마이그레이션 변화 0 (sentence_id 는 text).
 * 키가 행 번호가 아니라 **문장 자체**인 이유 (2026-08-29 재감사): 렌더 인덱스는 근접중복 필터
 * (filterNearDupDrills)의 결과 순서라, 필터 로직·카드 문장이 바뀌면 이력이 엉뚱한 행에 붙는다.
 * 문장 텍스트는 재INSERT 금지 규약(guide-en §6.3)으로 동결돼 있어 안정적이다. */
export function drillLogId(cardId, target) {
  return `${cardId}#drill#${String(target ?? '').trim()}`;
}

/* 체이닝·생산 연습 발화 이력 (2026-09-03 사용자 지시 "발화한 점수를 빠뜨리지 말 것") — 두 블록의 발화는
 * '오늘 발화'에는 세면서 점수 기록은 남기지 않아 어디에도 보이지 않았다. 드릴과 같은 내용 주소 키:
 * 체이닝은 단계 문장(target 접두부, buildChainSteps 산출), 생산은 출제 드릴 문장. 기존 집계(카드 id
 * 정확 일치·#drill# 접두)는 이 행들을 그냥 지나친다. */
export function chainLogId(cardId, stepText) {
  return `${cardId}#chain#${String(stepText ?? '').trim()}`;
}
export function prodLogId(cardId, target) {
  return `${cardId}#prod#${String(target ?? '').trim()}`;
}

/* 과거 발화 점수 수화 (2026-08-31 사용자 결정 — "다시 듣기·복습에서 과거 점수 기록이 학습에
 * 도움") — 발화는 이 로그에 전부 있으므로, 진입 시 전체 이력으로 화면 상태(메인 점수 원 utter ·
 * 드릴 행 점수 drills · 총 N회 recLog)를 재구성한다. 배열은 전체를 담고(카운트 정확성), 렌더가
 * 최신 N개만 그린다(메인 5 · 드릴 8 — sessionExprV2). 드릴 행 인덱스는 렌더러와 같은 필터
 * 결과(filterDrills 콜백) 기준 — 행 키가 문장 텍스트라(drillLogId, a138b9f 내용 주소화)
 * 필터·순서가 바뀌어도 점수가 엉뚱한 행에 붙지 않는다. */
export async function loadScoreHistoryState(db, cards, lang, filterDrills) {
  if (!db?.pronunciationLog || !Array.isArray(cards) || !cards.length) return null;
  try {
    const rows = (await db.pronunciationLog.where('lang').equals(lang).toArray())
      .sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt)));
    if (!rows.length) return null;
    const exLog = {};
    const recLog = {};
    for (const c of cards) {
      const main = rows.filter((r) => r.sentenceId === c.id).map((r) => Math.round(Number(r.overallScore) || 0));
      const dScores = {};
      (filterDrills?.(c) ?? []).forEach((d, i) => {
        const t = String(d?.ja || d?.en || '').trim();
        const ds = rows.filter((r) => r.sentenceId === drillLogId(c.id, t)).map((r) => Math.round(Number(r.overallScore) || 0));
        if (ds.length) dScores[i] = ds;
      });
      // 체이닝(단계 순서)·생산(문장) 이력 (2026-09-03) — 블록이 같은 키로 행에 원을 그린다.
      const chainScores = {};
      buildChainSteps(c.explanation?.chain).forEach((step, i) => {
        const cs = rows.filter((r) => r.sentenceId === chainLogId(c.id, step.text)).map((r) => Math.round(Number(r.overallScore) || 0));
        if (cs.length) chainScores[i] = cs;
      });
      const prodScores = {};
      (filterDrills?.(c) ?? []).forEach((d) => {
        const t = String(d?.en || '').trim();
        if (!t) return;
        const ps = rows.filter((r) => r.sentenceId === prodLogId(c.id, t)).map((r) => Math.round(Number(r.overallScore) || 0));
        if (ps.length) prodScores[t] = ps;
      });
      const all = [...main, ...Object.values(dScores).flat(), ...Object.values(chainScores).flat(), ...Object.values(prodScores).flat()];
      if (!all.length) continue;
      exLog[c.id] = {
        ...(main.length ? { utter: main } : {}),
        ...(Object.keys(dScores).length ? { drills: dScores } : {}),
        ...(Object.keys(chainScores).length ? { chainScores } : {}),
        ...(Object.keys(prodScores).length ? { prodScores } : {}),
      };
      recLog[c.id] = { count: all.length, best: Math.max(...all) };
    }
    return Object.keys(exLog).length ? { exLog, recLog } : null;
  } catch (e) {
    console.error('[pronunciationLog] loadScoreHistoryState', e);
    return null;
  }
}

/** pronunciationLog 행들 → { 카드id: { 드릴문장: { count, avg } } }. beforeISO 이후(당일 포함) 기록은 뺀다. */
export function summarizeDrillLog(rows, cardIds, beforeISO) {
  const want = new Set(cardIds ?? []);
  const acc = {};
  for (const r of rows ?? []) {
    const sid = r?.sentenceId;
    const cut = typeof sid === 'string' ? sid.indexOf('#drill#') : -1;
    if (cut < 0) continue;
    const cardId = sid.slice(0, cut);
    const target = sid.slice(cut + 7);
    if (!want.has(cardId) || !target) continue;
    if (beforeISO && String(r.date ?? '') >= beforeISO) continue;
    ((acc[cardId] ??= {})[target] ??= []).push(Math.round(Number(r.overallScore) || 0));
  }
  const out = {};
  for (const [cardId, byTarget] of Object.entries(acc)) {
    out[cardId] = {};
    for (const [target, scores] of Object.entries(byTarget)) {
      out[cardId][target] = { count: scores.length, avg: Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) };
    }
  }
  return out;
}

/** Dexie 읽기 → summarizeDrillLog. 복습 진입 시 state.drillLog 를 채운다. 실패해도 화면을 막지 않는다. */
export async function loadDrillLog(db, lang, cards, todayISO) {
  if (!db?.pronunciationLog || !Array.isArray(cards) || !cards.length) return {};
  try {
    const rows = await db.pronunciationLog.where('lang').equals(lang).toArray();
    return summarizeDrillLog(rows, cards.map((c) => c?.id).filter(Boolean), todayISO);
  } catch (e) {
    console.error('[pronunciationLog] loadDrillLog', e);
    return {};
  }
}
