/**
 * validate-seed.mjs — 시드 콘텐츠 검증기 (INSERT 전 게이트).
 *
 * 배경 (2026-06-10): 구조 검증(seed-supabase.mjs validatePayload)만 있고 콘텐츠 검증이
 * 산문 체크리스트뿐이라 매칭 stuck·drills 하한 깔기·재INSERT 사고가 규율로만 방어됐음.
 * 본 모듈이 guide-en §6.3 체크리스트의 기계화 가능 항목을 결정적으로 차단한다.
 *
 * 구성:
 *  - validateSeedContent(payload, { existingSeeds, speakerNames }) — 순수 콘텐츠 검증
 *  - evaluateServerGuards({ serverRows, payloadIds }) — 1일 1장면 + completed 게이트 (순수)
 *  - parseSpeakerVoiceNames(src) — speech.js 소스에서 SPEAKER_VOICES en-US 화자 키 추출
 *    (speech.js 는 Vite 전용 import.meta.env 의존이라 Node 에서 직접 import 불가 → 소스 파싱)
 *  - loadExistingSeeds(dir, excludeFile) — seeds/en-*.json 사용 이력 로드
 *
 * CLI: node scripts/validate-seed.mjs --payload seeds/<f>.json
 *      (서버 게이트는 seed-supabase.mjs 가 SELECT 결과로 evaluateServerGuards 호출)
 */
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, basename } from 'node:path';
import { argv, exit } from 'node:process';
import { nearDupDrills } from '../src/components/session/applied.js';

// session-new.js deriveDialogue 와 동일 정규화 (매칭 계약 시뮬레이션용 — 로직 변경 시 양쪽 동기화)
// ⚠️ 근접중복 판정엔 쓰지 말 것 — 아포스트로피를 지워 `it's` 를 2단어로 세므로 렌더(applied.js)와 결과가 갈린다.
//    근접중복은 applied.js 의 nearDupDrills 가 단일 출처 (2026-07-10).
const norm = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();

const isSceneCard = (c) => Array.isArray(c?.explanation?.dialogue);

/** speech.js 소스에서 SPEAKER_VOICES 의 'en-US' 블록 화자 키 추출. */
export function parseSpeakerVoiceNames(src) {
  const names = new Set();
  const start = src.indexOf('SPEAKER_VOICES');
  if (start === -1) return names;
  const block = src.slice(start);
  // '키': { voice: ... } 형태의 따옴표 키만 수집 (lang 키 'en-US' 류 제외)
  for (const m of block.matchAll(/'([^']+)'\s*:\s*\{\s*voice:/g)) names.add(m[1]);
  return names;
}

/** seeds 디렉토리에서 en-*.json 사용 이력 로드 (자기 자신 제외). */
export function loadExistingSeeds(dir, excludeFile) {
  const out = [];
  for (const f of readdirSync(dir)) {
    if (!f.startsWith('en-') || !f.endsWith('.json') || f === excludeFile) continue;
    try {
      const p = JSON.parse(readFileSync(join(dir, f), 'utf8'));
      out.push({
        file: f,
        ids: new Set((p.cards || []).map((c) => c.id)),
        source: p._source ?? null,
      });
    } catch { /* 손상 파일은 이력에서 제외 — ID·구간 비교 불가 시 보수적으로 무시 */ }
  }
  return out;
}

const EXPL_REQUIRED = ['key', 'situation', 'drills', 'grammar', 'chunks', 'phonemes', 'mistake', 'similar', 'category', 'frequency'];

// 학습 anchor (2026-06-29 복원): 기본동사 중심 + 어려운(라틴계·추상) 어휘 차단.
// 배경: 2026-06-08 콩트→RealClass 전환 시 '기본동사 70%+ / 라틴 차단' 원칙이 §6.2(archive)로
// 강등돼 활성 경로에서 기계 강제가 소멸 → 페다고지 회귀. 산문이 아닌 게이트로 박제.
const HARD_VOCAB = new Set(['construct', 'decline', 'require', 'warrior', 'utilize', 'endeavor', 'commence', 'facilitate', 'ascertain', 'subsequently', 'nevertheless', 'demonstrate', 'implement', 'sufficient', 'obtain', 'acquire', 'comprehend', 'terminate', 'initiate', 'prior', 'regarding', 'pertaining', 'accordingly']);
export const BASIC_VERBS = new Set(['be', 'am', 'is', 'are', 'was', 'were', 'been', 'have', 'has', 'had', 'get', 'got', 'gotten', 'take', 'took', 'taken', 'give', 'gave', 'given', 'make', 'made', 'do', 'did', 'done', 'go', 'went', 'gone', 'come', 'came', 'put', 'keep', 'kept', 'let', 'look', 'find', 'found', 'tell', 'told', 'ask', 'turn', 'move', 'help', 'fix', 'care', 'hit', 'run', 'ran', 'call', 'feel', 'felt', 'need', 'want', 'like', 'work', 'talk', 'show', 'bring', 'set', 'hold', 'pay', 'leave', 'left', 'stop', 'start', 'try', 'use', 'mean', 'meant']);
// 구동사 particle (phrasal verb 끝). validate-seed 비기본동사 구동사 판정 + scan-source-chunks 공용.
export const PARTICLES = new Set(['up', 'out', 'on', 'off', 'in', 'back', 'over', 'down', 'away', 'around', 'through', 'along']);

// 소스 순서 정책 (2026-07-01, Parks/Office 뒤죽박죽 방지 — 사용자 결정 "한 드라마 완주 후 다음").
// finish-parks-first: Parks 완주 후 Office. 각 쇼는 s1e1→s1e6 순차. 정본 = 가이드 §6.3.
export const SHOW_PRIORITY = ['parks', 'office'];
const EPISODE_NUMS = [1, 2, 3, 4, 5, 6]; // realclass-{show}-s1e{1..6} — 화당 소스 파일 존재
// show 판정·파일스템은 본 모듈이 단일 출처 (scan-source-chunks 가 import 재사용 — 3쇼 확장 시 여기만 갱신).
export const showOfEpisode = (ep) => (/^office/i.test(String(ep)) ? 'office' : 'parks');
export const epFileStem = (ep) => String(ep).replace(/^(office|parks)-?/i, ''); // 'office-s1e2'|'parks-s1e2'→'s1e2' (소스 파일명 스템)
const epNumOfEpisode = (ep) => { const m = String(ep).match(/s1e(\d+)/i); return m ? parseInt(m[1], 10) : null; };

/** 소스 대본 파일에서 문장번호→EN 텍스트 맵 파싱 (s1e1 'EN:/KO:' + ep2~ 'N. EN/KO' 양식 모두). */
function parseSourceEnByNum(text) {
  const map = new Map();
  let cur = null;
  for (const raw of String(text).split('\n')) {
    const m = raw.match(/^(\d+)\.\s*(.*)$/);
    if (m) {
      cur = parseInt(m[1], 10);
      const rest = m[2].trim();
      if (rest && !/^EN:/i.test(rest)) { map.set(cur, rest); cur = null; }
      continue;
    }
    const em = raw.match(/^EN:\s*(.*)$/i);
    if (em && cur != null) { map.set(cur, em[1].trim()); cur = null; }
  }
  return map;
}

/** _source(episode, lines[, show]) → 그 구간 EN 대사 배열. 소스 파일 부재 시 null (충실성 검증 생략). */
export function loadSourceEnLines(seedsDir, source) {
  if (!source?.episode || !Array.isArray(source?.lines) || source.lines.length !== 2) return null;
  const show = source.show || showOfEpisode(source.episode);
  const ep = epFileStem(source.episode);
  let text;
  try { text = readFileSync(join(seedsDir, 'sources', `realclass-${show}-${ep}.txt`), 'utf8'); }
  catch { return null; }
  const byNum = parseSourceEnByNum(text);
  const [a, b] = source.lines;
  const out = [];
  for (let i = a; i <= b; i += 1) if (byNum.has(i)) out.push(byNum.get(i));
  return out;
}

/**
 * 콘텐츠 검증 본체. 반환 { ok, errors[], warnings[] }.
 * RealClass 분기: lang==='en' && 첫 정렬 카드에 dialogue 존재. 그 외(ja 등)는 generic 만.
 */
export function validateSeedContent(payload, { existingSeeds = [], speakerNames = new Set(), sourceEnLines = null } = {}) {
  const errors = [];
  const warnings = [];
  const cards = Array.isArray(payload?.cards) ? payload.cards : [];

  // ── generic: payload 내 + 기존 시드 간 ID 고유 ──
  const seen = new Set();
  for (const c of cards) {
    if (seen.has(c.id)) errors.push(`ID 중복 (payload 내): ${c.id}`);
    seen.add(c.id);
    for (const ex of existingSeeds) {
      if (ex.ids.has(c.id)) errors.push(`ID 중복 (기존 시드 ${ex.file}): ${c.id}`);
    }
    // seed-supabase validatePayload 필수 필드 (2026-06-29: 게이트↔시드 정합 — meaning 누락이
    // validate 통과 후 seed 에서 터지던 갭 차단). id/explanation 은 구조 검증이 별도 커버.
    if (!c.sentence) errors.push(`${c.id}: card.sentence 누락 (seed-supabase 필수)`);
    if (!c.meaning) errors.push(`${c.id}: card.meaning 누락 (seed-supabase 필수)`);
  }

  const sorted = [...cards].sort((a, b) => (a.order_index ?? 0) - (b.order_index ?? 0));
  // en 신규 시드 = RealClass 트랙 의무 (guide §6.3 활성 정본) — scene 부재도 RealClass 규칙으로 차단
  const isRealClass = payload?.lang === 'en';
  if (!isRealClass) return { ok: errors.length === 0, errors, warnings };
  // 한시 트랙(모두영어 유튜브 발췌, 사용자 결정): scene·_source 없는 표현 전용 세션. 표현카드 품질검사(8필드·
  // 발음정합·drills·기본동사 비중 경고)는 유지하되 scene/dialogue/충실성/_source 게이트 + 비기본동사 구동사
  // 하드 차단(고정 커리큘럼 표현이라 '다른 구간 선택' 불가)만 면제. 예외는 track==='moduyeongeo'
  // payload 에만 발동 → 정상 en 시드(track 필드 없음)는 불변. 105편 완료 후 이 트랙 미사용 시 규칙 자동 원복.
  const isModuTrack = payload?.track === 'moduyeongeo';

  // ── 구조: scene 1장 (oi 0) + 표현 1~2장 (PPP 집중 추출 — 최소 1장 차단 / 3장 초과 경고) ──
  const scenes = sorted.filter(isSceneCard);
  const exprs = sorted.filter((c) => !isSceneCard(c));
  if (!isModuTrack && scenes.length !== 1) errors.push(`scene 카드는 정확히 1장이어야 함 (현재 ${scenes.length})`);
  const scene = scenes[0];
  if (scene && (scene.order_index ?? null) !== 0) errors.push(`scene 카드 order_index 는 0 (현재 ${scene.order_index})`);
  // PPP(2026-06-29): 진짜 장면(P1) → 핵심 표현 1~2개 집중 추출 → 레벨 변형 연습(P2). 과다추출 지양.
  if (exprs.length < 1) errors.push(`표현 카드 최소 1장 필요 (현재 ${exprs.length})`);
  if (!isModuTrack && exprs.length > 3) warnings.push(`표현 ${exprs.length}장 — PPP 집중 추출은 1~2개 권장 (과다 추출 — 핵심만 깊이)`);

  // ── scene: dialogue 6~10줄, speaker/en/ko 완비, 화자 TTS 등록 (moduyeongeo 트랙은 scene 없음 → 면제) ──
  const dialogue = scene?.explanation?.dialogue ?? [];
  if (!isModuTrack) {
    if (dialogue.length < 6 || dialogue.length > 10) errors.push(`dialogue 는 6~10줄 (현재 ${dialogue.length})`);
    dialogue.forEach((l, i) => {
      if (!l?.speaker || !l?.en || !l?.ko) errors.push(`dialogue ${i + 1}줄 speaker/en/ko 누락`);
      else if (speakerNames.size && !speakerNames.has(l.speaker)) {
        errors.push(`화자 '${l.speaker}' 가 SPEAKER_VOICES 미등록 — speech.js 에 voice(성별·rate) 등록 후 적재 (미등록 시 Aria 폴백으로 성별 불일치)`);
      }
    });
  }

  // ── 충실성 게이트 (2026-06-29 신설): dialogue 각 en 이 소스 _source 구간에 실재해야 함 ──
  // 배경: 직전 시드(forum-discussion)가 민원인 대사를 진행자 대사로 둔갑·합성했는데 통과됨.
  // 소스 대사 발췌만 허용(말미 trim·선택), 단어/화자/순서 변경·합성 차단. 소스 부재 시 검증 생략(경고).
  if (Array.isArray(sourceEnLines)) {
    const normedSrc = sourceEnLines.map(norm).filter(Boolean);
    if (normedSrc.length) {
      dialogue.forEach((l, i) => {
        const nl = norm(l?.en);
        if (nl && !normedSrc.some((sl) => sl.includes(nl))) {
          errors.push(`충실성 위반: dialogue ${i + 1}줄 이 소스 #${payload._source?.lines?.[0]}~${payload._source?.lines?.[1]} 에 실재하지 않음 — 원문 발췌만(단어/화자/순서 변경·합성 금지): "${l?.en}"`);
        }
      });
    }
  } else if (isRealClass && !isModuTrack) {
    warnings.push('충실성 미검증: 소스 파일 미제공 — dialogue 가 실제 대사인지 기계 확인 불가 (로컬 seeds/sources 필요)');
  }

  // ── 표현 카드: 8필드 + 발음 정합 + drills ──
  let allDrillsAtFloor = exprs.length > 0;
  for (const c of exprs) {
    const ex = c.explanation || {};
    for (const f of EXPL_REQUIRED) {
      if (ex[f] === undefined || ex[f] === null || ex[f] === '') errors.push(`${c.id}: explanation.${f} 누락 (8필드 의무)`);
    }
    if (Array.isArray(ex.grammar) && (ex.grammar.length < 1 || ex.grammar.length > 2)) {
      errors.push(`${c.id}: grammar 는 1~2건 (현재 ${ex.grammar.length})`);
    }
    if (Array.isArray(ex.phonemes) && (ex.phonemes.length < 1 || ex.phonemes.length > 3)) {
      errors.push(`${c.id}: phonemes 는 1~3건 (현재 ${ex.phonemes.length})`);
    }
    // 발음 정합 (guide §6.3 발음 정합 룰)
    if (Array.isArray(ex.chunks) && ex.chunks.length) {
      const krJoin = ex.chunks.map((x) => x?.[1] ?? '').join(' ');
      if (krJoin !== c.phonetic_kr) {
        errors.push(`${c.id}: phonetic_kr 이 chunks kr 이어붙임과 불일치 ("${c.phonetic_kr}" ≠ "${krJoin}")`);
      }
      const enJoin = norm(ex.chunks.map((x) => x?.[0] ?? '').join(' '));
      if (enJoin !== norm(c.sentence)) {
        errors.push(`${c.id}: chunks 가 본문 전단어 미커버 ("${norm(c.sentence)}" ≠ "${enJoin}")`);
      }
    }
    // drills 3~8 + en/ko/kr 완비
    const drills = Array.isArray(ex.drills) ? ex.drills : [];
    if (drills.length < 3 || drills.length > 8) errors.push(`${c.id}: drills 는 3~8개 (현재 ${drills.length})`);
    drills.forEach((d, i) => {
      if (!d?.en || !d?.ko || !d?.kr) errors.push(`${c.id}: drills[${i}] en/ko/kr 누락 (kr 음차 의무)`);
    });
    if (drills.length > 4) allDrillsAtFloor = false;
  }
  if (allDrillsAtFloor) {
    warnings.push('전 표현 카드 drills ≤4 — 하한 일괄 깔기 의심 (schema §drills: 핵심·헷갈림 6~8 / 쉬움 3)');
  }

  // ── 기본동사 중심 + 어려운 어휘 차단 (학습 anchor, 2026-06-29 복원) ──
  // 어려운(라틴계·추상) 어휘 = 차단(error). 기본동사 비중 <60% = 경고. 비기본동사 구동사 = 차단(error).
  let basicVerbCards = 0;
  for (const c of exprs) {
    const sentWords = norm(`${c.sentence} ${c.explanation?.key ?? ''}`).split(' ').filter(Boolean);
    const hard = [...new Set(sentWords.filter((w) => HARD_VOCAB.has(w)))];
    if (hard.length) {
      errors.push(`${c.id}: 어려운 어휘 차단 — 라틴계·추상 어휘 (${hard.join(', ')}). 기본동사 구동사·관용구로 교체 (학습 anchor: 기본동사 중심)`);
    }
    // 기본동사 판정·구동사 검사는 '타깃 청크'(key 의 '=' 앞) 기준 — 해설 산문이 신호를 오염시키지 않게
    // (2026-06-30 'wrap it up' 사고: key 해설의 "let's get it done" 의 기본동사로 비기본동사 타깃이 통과됨).
    const chunk = String(c.explanation?.key ?? '').split('=')[0].trim();
    const chunkW = norm(chunk).split(' ').filter(Boolean);
    const hasBasicVerb = chunkW.some((w) => BASIC_VERBS.has(w));
    if (hasBasicVerb) basicVerbCards += 1;
    // 구동사(끝 단어가 particle)인데 기본동사 머리가 아니면 **차단(error)** — 기본동사 '다양 활용' 중점 위배.
    // 하드 차단(2026-07-01, 사용자 요구): wrap it up 류가 seed-supabase INSERT 전 구조적으로 못 들어가게.
    // wrap/hang/fill/write 등 비기본동사 머리 구동사를 일괄 차단(경고로는 라우틴이 무시해 재발 → 하드 차단).
    // 기존 적재분(fill in 등)은 재INSERT 안 하므로 grandfather. 소스에 기본동사 청크 없으면 다른 구간/화 선택
    // (scan-source-chunks 로 확인). close by 는 particle 끝 아님 → 통과.
    // moduyeongeo 트랙 면제(2026-07-08): 표현이 유튜브 커리큘럼에 고정 지정 → 에이전트가 '다른 구간 선택' 불가.
    // 하드 차단의 취지(RealClass 마이닝이 wrap it up 류를 고르는 '선택'을 막음)가 고정표현엔 적용 안 됨.
    // 기본동사 비중 경고는 유지되므로 '기본동사' 신호는 남음. (ep92 count me in/out — count 는 비기본동사 구동사)
    if (!isModuTrack && chunkW.length >= 2 && PARTICLES.has(chunkW[chunkW.length - 1]) && !hasBasicVerb) {
      errors.push(`${c.id}: 타깃 "${chunk}" 는 비기본동사 구동사 — 차단. 구동사는 기본동사(get/take/put/come/go/look/find/call…) 머리여야 함. scan-source-chunks 로 기본동사 청크 후보를 뽑아 교체하거나 다른 구간 선택`);
    }
  }
  if (exprs.length && basicVerbCards / exprs.length < 0.6) {
    warnings.push(`기본동사 비중 낮음: 표현 ${exprs.length}장 중 ${basicVerbCards}장만 기본동사 타깃 (<60%) — 일상 전이 가능 기본동사 우선 (학습 anchor)`);
  }

  // ── 목표적합 추출 (2026-06-29 PPP): 학습 대상은 '짧은 고빈도 청크'여야 함 ──
  // key 의 '=' 앞(타깃 표현)이 6단어 이상이면 '긴 절·명대사성' 추출 의심 → 경고.
  // (예: 'let me show you how it's done'(7) 탈락 / 'how are things going'(4)·'look good'(2) 통과)
  // 빈도 우선순위(NGSL-Spoken/PHaVE)는 §6.3 추출 rubric 이 에이전트에 지시 — 게이트는 길이 backstop.
  for (const c of exprs) {
    const chunk = String(c.explanation?.key ?? '').split('=')[0].trim();
    const wc = chunk ? chunk.split(/\s+/).filter(Boolean).length : 0;
    if (wc > 5) {
      warnings.push(`${c.id}: 타깃 표현 ${wc}단어 ("${chunk}") — 긴 절·명대사성 의심. 짧은 고빈도 청크(구동사·관용구, ≤5단어)로 추출 권장 (목표적합 — guide §6.3 추출 rubric)`);
    }
    // sentence 가 맨 구문이면 차단 (2026-06-30): 복습/녹음은 card.sentence 를 쓰므로 sentence=구문이면
    // 복습이 구문 조각이 된다. sentence = 장면 원문 전체 문장(구문은 key 에). 그 구문을 품은 더 긴 원문
    // 라인이 있으면 그 라인을 sentence 로 써야 함. (구문이 곧 완전한 한 줄이면 — 더 긴 라인 없음 — 통과)
    const nSent = norm(c.sentence);
    const nChunk = norm(chunk);
    if (nChunk && nSent === nChunk) {
      const fuller = dialogue.find((l) => {
        const nl = norm(l?.en);
        return nl.includes(nChunk) && nl.split(' ').filter(Boolean).length > nChunk.split(' ').filter(Boolean).length;
      });
      if (fuller) errors.push(`${c.id}: sentence 가 맨 구문 "${c.sentence}" — 장면 원문 전체 문장("${fuller.en}")을 sentence 로, 구문은 key 로 (복습이 구문 조각이 됨)`);
    }
  }

  // ── (선택) 확장 사다리 ladder: base 청크를 단당 1요소씩 키우는 수직 확장 (guide §6.3 — video2 '핵심절→확장' +
  // sentence-expansion). 선택 필드 → 미존재 시 skip(하위호환). 존재 시 구조·kr음차·단조 확장만 검사(내용 판단은 rubric).
  // ⚠️ ladder 는 2026-07-09 폐기 (렌더 제거). chain(무자막 청각 확장)으로 대체. 구조 검사는 하위호환 유지.
  for (const c of exprs) {
    const ladder = c.explanation?.ladder;
    if (ladder === undefined) continue;
    warnings.push(`${c.id}: ladder 는 폐기된 필드입니다 (렌더 제거됨) — chain{target,chunks,ko} 를 쓰세요.`);
    if (!Array.isArray(ladder) || ladder.length < 2 || ladder.length > 6) {
      errors.push(`${c.id}: ladder 는 2~6단 배열이어야 함 (현재 ${Array.isArray(ladder) ? `${ladder.length}단` : typeof ladder})`);
      continue;
    }
    let prevWords = 0;
    ladder.forEach((rung, i) => {
      for (const f of ['en', 'ko', 'kr']) {
        if (typeof rung?.[f] !== 'string' || !rung[f].trim()) {
          errors.push(`${c.id}: ladder[${i}] ${f} 누락/빈값 — 각 단 en·ko·kr(음차) 의무`);
        }
      }
      const wc = String(rung?.en ?? '').trim().split(/\s+/).filter(Boolean).length;
      if (wc < prevWords) errors.push(`${c.id}: ladder[${i}] 가 이전 단보다 짧음 (${wc}<${prevWords}) — 단조 확장(base→길게) 위배`);
      prevWords = wc;
      // (선택) back-chaining pass: 이 단을 끝→처음 tail-anchored 청크로 재조립 (연결발화 훈련). [[en,kr]…] 2~4개, tail 성장.
      const back = rung?.back;
      if (back !== undefined) {
        if (!Array.isArray(back) || back.length < 2 || back.length > 4) {
          errors.push(`${c.id}: ladder[${i}].back 는 2~4개 tail 청크 배열이어야 함 (현재 ${Array.isArray(back) ? `${back.length}개` : typeof back})`);
        } else {
          let bw = 0;
          back.forEach((bc, j) => {
            const ok = Array.isArray(bc) && typeof bc[0] === 'string' && bc[0].trim() && typeof bc[1] === 'string' && bc[1].trim();
            if (!ok) { errors.push(`${c.id}: ladder[${i}].back[${j}] 는 [en, kr음차] 쌍이어야 함`); return; }
            const w = bc[0].trim().split(/\s+/).filter(Boolean).length;
            if (w < bw) errors.push(`${c.id}: ladder[${i}].back[${j}] 가 이전보다 짧음 (${w}<${bw}) — 끝→처음(tail-anchored) 성장 위배`);
            bw = w;
          });
        }
      }
    });
  }

  // ── (선택) 체이닝 chain: 무자막 청각 확장 (2026-07-09 사용자 결정 — ladder 대체).
  // 스크립트를 주지 않고 '듣고 따라 말하기'로 base 를 2문장 수준까지 확장. 앱이 chunks 를 누적해
  // 단계를 만들므로(단계 수 고정 X), chunks 를 순서대로 이어붙이면 target 과 일치해야 한다.
  // ko 는 3회 실패 시 첫 힌트(한국어 뜻)에 쓰이므로 의무. 선택 필드 → 미존재 시 skip(하위호환).
  for (const c of exprs) {
    const chain = c.explanation?.chain;
    if (chain === undefined) continue;
    if (typeof chain !== 'object' || chain === null || Array.isArray(chain)) {
      errors.push(`${c.id}: chain 은 { target, chunks, ko } 객체여야 함`);
      continue;
    }
    if (typeof chain.target !== 'string' || !chain.target.trim()) errors.push(`${c.id}: chain.target 누락/빈값`);
    if (typeof chain.ko !== 'string' || !chain.ko.trim()) errors.push(`${c.id}: chain.ko(한국어 뜻) 의무 — 3회 실패 힌트에 쓰임`);
    if (!Array.isArray(chain.chunks) || chain.chunks.length < 2 || chain.chunks.length > 8) {
      errors.push(`${c.id}: chain.chunks 는 2~8개 배열이어야 함 (현재 ${Array.isArray(chain.chunks) ? `${chain.chunks.length}개` : typeof chain.chunks})`);
      continue;
    }
    if (chain.chunks.some((s) => typeof s !== 'string' || !s.trim())) {
      errors.push(`${c.id}: chain.chunks 항목은 비어있지 않은 문자열이어야 함`);
      continue;
    }
    if (typeof chain.target === 'string' && norm(chain.chunks.join(' ')) !== norm(chain.target)) {
      errors.push(`${c.id}: chain.chunks 를 순서대로 이어붙이면 chain.target 과 같아야 함 (앱이 청크 누적으로 단계를 생성)`);
    }
    const tw = norm(chain.target).split(' ').filter(Boolean).length;
    if (tw && tw < 8) warnings.push(`${c.id}: chain.target 이 ${tw}단어 — 약 2문장(8단어+)까지 확장 권장 (짧으면 앵무새 반복이 됨)`);
    // 2026-07-13 — 단계 세분화(사용자 결정): 한 단계 = 성분 1개(부사구·전치사구·접속절, 1~4단어·절 최대 5).
    // 억양 단위 연구(자연 발화 청크 = 1~4단어)와 일치. 경고만 — 차단하면 경고를 끄려고 성분 내부를 작위 분절한다.
    // 분절은 자연 쉼·억양 경계에서만, 부족하면 target 재구성 우선. 단계 **수**는 규정하지 않는다(같은 날 사용자
    // 결정) — 증분 규칙만 지키면 단계 수는 target 길이가 자연 결정하고, 하한 경고는 억지 확장을 유발한다.
    const incs = chain.chunks.slice(1).map((s) => norm(s).split(' ').filter(Boolean).length);
    const bigIdx = incs.findIndex((n) => n > 5);
    if (bigIdx >= 0) {
      warnings.push(`${c.id}: chain 증분 과대 — ${bigIdx + 2}번째 chunk 가 ${incs[bigIdx]}단어. 한 단계 = 성분 1개(1~4단어, 절 최대 5). 성분 경계를 깨며 쪼개지 말고 target 을 재구성할 것 (재구성도 부자연스러우면 경고를 남겨도 됨)`);
    }
  }

  // ── drills 근접중복: 호칭('honey')·감탄사('okay')만 덧붙인 건 변주가 아니다.
  // 2026-07-10 — moduyeongeo 도 차단으로 승격(사용자 지시: 렌더에서 감추지 말고 생성에서 막을 것).
  // 방출 payload 만 깨끗하면 되므로 원본 seeds/moduyeongeo/epNNN.json 은 손대지 않는다 — 루틴이 그날 편만 교체 저작.
  //   exact = base 와 완전 동일(영상 원문 반복) → 0개 (2026-07-11 사용자 지시: 응용에 base 반복 금지)
  //   added = base 를 통째로 품고 2단어 이하만 덧붙임 → 0개 (진짜 변주로 교체할 것)
  //   ※ 새 세션(방출 payload)에만 적용. 렌더 필터 filterNearDupDrills 는 exact 1개를 남겨
  //     이미 시드된 ep1-3 등 기존 데이터는 base 가 그대로 보인다 — 의도된 divergence.
  for (const c of exprs) {
    const { exact, added } = nearDupDrills(c.sentence, c.explanation?.drills);
    if (added > 0) {
      errors.push(`${c.id}: 근접중복 드릴 ${added}개 — base 를 그대로 둔 채 호칭·감탄사(", honey")를 붙이거나 뒤에 말만 덧붙인 꼬리확장("Is there a problem here?"). 주어·시제·극성·문형·목적어 중 하나를 바꾼 변주로 교체할 것.`);
    }
    if (exact > 0) {
      errors.push(`${c.id}: 근접중복 — 응용에 영상 원문(base)과 완전 동일한 드릴 ${exact}개. base 는 응용에 넣지 말고 진짜 변주로 교체할 것.`);
    }
  }

  // ── 매칭 계약: deriveDialogue 순차 커서 시뮬레이션 — 표현 전수 번호 부여 의무 ──
  if (scene && exprs.length) {
    let ci = 0;
    for (const line of dialogue) {
      if (ci >= exprs.length) break;
      const nl = norm(line.en);
      const nc = norm(exprs[ci].sentence);
      if (nl && nc && nl.includes(nc)) ci += 1;
    }
    if (ci !== exprs.length) {
      errors.push(`다이얼로그 매칭 실패: 표현 ${exprs.length}장 중 ${ci}장만 번호 부여 — 카드 순서가 dialogue 등장 순서와 일치하고 sentence 가 해당 줄에 포함(정규화)돼야 함 (session-new.js deriveDialogue 계약)`);
    }
  }

  // ── 약점 음소 가중 (Step 4, 2026-06-10): 생성 절차가 기록한 _context.weakPhonemes 와
  // 표현 카드 phonemes 의 교차가 0이면 경고 — 단계 3-4 컨텍스트가 발췌에 반영 안 된 신호.
  // 콘텐츠 풀 제약상 항상 가능하진 않으므로 차단 아님. _context 부재 시 검사 생략 (구 시드 호환).
  const weak = payload._context?.weakPhonemes;
  if (Array.isArray(weak) && weak.length) {
    const weakSet = new Set(weak.map((w) => String(w).replace(/[/]/g, '')));
    const hit = exprs.some((c) => (c.explanation?.phonemes ?? []).some(
      (p) => weakSet.has(String(p?.[0] ?? '').replace(/[/]/g, '')),
    ));
    if (!hit) {
      warnings.push(`약점 음소 미반영: _context.weakPhonemes (${weak.join(', ')}) 와 표현 카드 phonemes 교차 0 — 장면 선정 가중 재검토 (guide §6.3 약점 음소 가중)`);
    }
  }

  // ── _source 구조화 + 기존 시드 구간 겹침 (moduyeongeo 트랙은 소스 구간 개념 없음 → 면제) ──
  const src = payload._source;
  if (!isModuTrack) {
    if (!src?.episode || !Array.isArray(src?.lines) || src.lines.length !== 2) {
      errors.push('_source 누락 — { episode, lines: [시작, 끝] } 구조 의무 (사용 구간 기계 검증용)');
    } else {
      for (const ex of existingSeeds) {
        const s = ex.source;
        if (!s?.episode || s.episode !== src.episode || !Array.isArray(s.lines)) continue;
        const [a1, a2] = src.lines;
        const [b1, b2] = s.lines;
        if (a1 <= b2 && b1 <= a2) {
          errors.push(`_source 구간 겹침: ${src.episode} #${a1}~${a2} ↔ ${ex.file} #${b1}~${b2}`);
        }
      }
    }
  }

  // ── 소스 순서 가드 (2026-07-01, Parks/Office 뒤죽박죽 방지): finish-parks-first + 에피소드 순차 ──
  // 경고만(차단 아님) — 발췌기준 미달로 정당하게 스킵한 경우는 _note 에 사유 기록. 정책 정본 = 가이드 §6.3.
  // 신호는 '전량 미착수 화'(existingSeeds 에 해당 화 사용구간 0)로 판정 — coarse 하지만 오탐 없이 왕복만 잡음.
  if (src?.episode && Array.isArray(src?.lines)) {
    const usedByShow = { parks: new Set(), office: new Set() };
    for (const ex of existingSeeds) {
      const e = ex.source?.episode;
      const n = e != null ? epNumOfEpisode(e) : null;
      if (n != null) usedByShow[showOfEpisode(e)].add(n);
    }
    const payShow = showOfEpisode(src.episode);
    const payEp = epNumOfEpisode(src.episode);
    // (i) finish-parks-first: 더 높은 우선순위 쇼에 '전량 미착수' 화가 남아있는데 뒤 쇼를 고르면 경고
    for (const higher of SHOW_PRIORITY) {
      if (higher === payShow) break;
      const untouched = EPISODE_NUMS.find((n) => !usedByShow[higher].has(n));
      if (untouched != null) {
        warnings.push(`finish-parks-first 순서 이탈: ${higher} s1e${untouched} 미착수인데 ${payShow} 선택 — 한 쇼 완주 후 전환 (뒤죽박죽 방지, 가이드 §6.3). 정당한 전환이면 _note 에 ${higher} 소진 사유 기록`);
        break;
      }
    }
    // (ii) 에피소드 순차: 같은 쇼에서 더 이른 '전량 미착수' 화를 건너뛰고 뒤 화를 고르면 경고
    if (payEp != null) {
      const earlier = EPISODE_NUMS.find((n) => n < payEp && !usedByShow[payShow].has(n));
      if (earlier != null) {
        warnings.push(`에피소드 순서 이탈: ${payShow} s1e${earlier} 미착수인데 s1e${payEp} 선택 — 낮은 화부터 순차 소진 권장 (가이드 §6.3)`);
      }
    } else {
      // 파싱 실패 가시화: s1eN 형식이 아니면(시즌2·오타) 순차 검사가 조용히 skip 되므로 경고로 노출 (무증상 통과 금지)
      warnings.push(`_source.episode '${src.episode}' 화 번호 파싱 실패(s1eN 형식 아님) — 순차 검사 skip. 형식 확인 또는 시즌 확장 시 가드 갱신 필요`);
    }
  }

  return { ok: errors.length === 0, errors, warnings };
}

/**
 * 서버 게이트 (순수). serverRows = 같은 (user, lang, date) 의 { id, completed } 행들.
 *  - 1일 1장면: payload 에 없는 id 가 서버에 존재 → 다른 그룹과 같은 날 충돌 → 차단
 *  - completed 게이트: payload id 중 서버 completed=true → 학습 시작 후 재INSERT → 차단
 */
export function evaluateServerGuards({ serverRows = [], payloadIds = new Set() } = {}) {
  const errors = [];
  for (const r of serverRows) {
    if (!payloadIds.has(r.id)) {
      errors.push(`1일 1장면 위반: 같은 (lang, date) 에 다른 그룹 행 존재 (${r.id}) — 기존 그룹 삭제 후 적재`);
    } else if (r.completed === true) {
      errors.push(`completed 게이트: ${r.id} 학습 시작됨 — 재INSERT 금지 (upsert 가 completed=false 로 리셋)`);
    }
  }
  return { ok: errors.length === 0, errors };
}

/** CLI — 콘텐츠 검증만 (서버 게이트는 seed-supabase.mjs 경로에서 수행). */
function parseArgs(args) {
  const out = {};
  for (let i = 0; i < args.length; i += 1) {
    if (args[i] === '--payload') out.payload = args[i + 1];
  }
  return out;
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isMain) {
  const args = parseArgs(argv.slice(2));
  if (!args.payload) {
    console.error('usage: node scripts/validate-seed.mjs --payload seeds/<f>.json');
    exit(1);
  }
  const payload = JSON.parse(readFileSync(args.payload, 'utf8'));
  const seedsDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'seeds');
  const existingSeeds = loadExistingSeeds(seedsDir, basename(args.payload));
  const speechSrc = readFileSync(join(seedsDir, '..', 'src', 'services', 'speech.js'), 'utf8');
  const sourceEnLines = loadSourceEnLines(seedsDir, payload._source);
  const r = validateSeedContent(payload, { existingSeeds, speakerNames: parseSpeakerVoiceNames(speechSrc), sourceEnLines });
  for (const w of r.warnings) console.warn(`[validate] WARN: ${w}`);
  if (!r.ok) {
    for (const e of r.errors) console.error(`[validate] FAIL: ${e}`);
    exit(1);
  }
  console.log(`[validate] OK — ${payload.lang} ${payload.track === 'moduyeongeo' ? `ep${payload.ep}` : payload.date} cards=${payload.cards.length}`);
}
