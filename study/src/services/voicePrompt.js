/**
 * voicePrompt.js — 세션에서 배운 문장을 ChatGPT 음성 모드로 연습하는 붙여넣기용 프롬프트 빌더.
 *
 * 세션 요약(summaryV2)과 말하기 연습 화면(#/speak)이 같이 쓴다. 표현은 문자열 또는
 * { expr, sentence, ko, situation, miniDialogue, drills } (speakPicks.toSpeakItem 모양).
 *
 * 2026-09-11 재설계 근거 — 실제 ChatGPT 음성 여섯 번:
 * · 타깃을 숨기고 상황으로 유도하는 옛 방식은 초급(단어 하나만 나옴)에게 시험이 된다. 문장을 먼저 들려주고 쓰게 한다.
 * · 막혔을 때 정답을 통째로 주면 따라 말하기만 남는다. 첫 두 단어만 준다 (자가수정 유도 우선 — Ammar & Spada 2006).
 * · 붙여 넣은 직후 음성을 켜면 지시가 반영되지 않았다. 텍스트 답장을 받은 뒤 음성으로.
 *
 * 2026-09-15 재설계 근거 — 2026-09-14 실기 세션(사용자 기록) + 같은 프롬프트 재현(ChatGPT 웹):
 * · 산문 절차("Do the dialogue with me. You say A's lines…")는 모델에게만 하는 말이라, 학습자는 직전 지시인
 *   "따라 해 보세요" 를 계속 따랐고 대화가 통째로 따라 말하기가 됐다. 역할 전환을 교사 대사로 직접 말하게 한다.
 * · 학습자가 상대 대사를 따라 말해도 모델이 발음 교정으로 처리했다. 역할 이탈 교정 규칙을 따로 적는다.
 * · 카드 4장이 같은 미니대화를 공유하는데(seeds/en-personal-2026-09-13.json) 카드마다 실려 같은 대화가 4번
 *   찍혔고 "Do it twice" 까지 붙어 8회전이 됐다. 대화는 중복을 걷어 한 번만, 두 회전으로.
 * · 재현에서 모델이 A 첫 대사를 건너뛰고, "계속하자" 에 "좋아요, 바로 이어갈게요." 로 빈 턴을 썼다.
 *   절차를 단계 번호로 적고(작업지시서 2026-09-10 §4 교훈), 한 턴 한 단계·빈 대답 금지를 규칙으로 못박는다.
 */
export const VOICE_PROMPT_INTRO = '[아래를 ChatGPT 새 대화에 붙여 넣고, 텍스트 답장이 온 뒤에 같은 대화에서 음성 모드를 켜세요]';

const DRILL_MAX = 3;
const str = (v) => String(v ?? '').trim();
const linesOf = (arr) => (Array.isArray(arr) ? arr : []).filter((x) => x && str(x.en));
const isB = (l) => str(l.speaker).toUpperCase() === 'B';

/** 문자열·객체 혼합 배열 → 정규화 배열. expr 이 비면 뺀다. 미니대화·드릴은 en 이 있는 항목만 남긴다. */
export function normalizeVoiceItems(items) {
  return (Array.isArray(items) ? items : [])
    .map((it) => (typeof it === 'string' ? { expr: it } : it))
    .filter((it) => it && str(it.expr))
    .map((it) => ({
      expr: str(it.expr),
      situation: str(it.situation),
      sentence: str(it.sentence),
      ko: str(it.ko),
      miniDialogue: linesOf(it.miniDialogue).map((l) => ({ speaker: str(l.speaker) || 'A', en: str(l.en), ko: str(l.ko) })),
      drills: linesOf(it.drills).map((d) => ({ en: str(d.en), ko: str(d.ko) })),
    }));
}

const sentenceOf = (it) => it.sentence || it.expr;

/** 오늘 문장 목록 한 줄 — 뜻·핵심 표현·상황은 소리 내지 않는 참고란이다. */
function headerLine(it, n) {
  const key = it.sentence && it.expr && it.expr !== it.sentence ? `  (key: ${it.expr})` : '';
  const sit = it.situation && !it.miniDialogue.length ? `  (${it.situation})` : ''; // 대화가 있으면 상황은 대화가 대신한다
  return `S${n} "${sentenceOf(it)}"${it.ko ? ` = ${it.ko}` : ''}${key}${sit}`;
}

/* 안내를 한 단계로 따로 두면 학습자가 답할 것이 없는데도 모델이 기다려 턴이 빈다.
 * 안내는 그 회전의 첫 단계 앞에 붙여, 말할 차례가 있는 단계에만 실린다. */
function withGuide(steps, guide) {
  const head = steps[0];
  if (!head) return steps;
  const merged = head.startsWith('In Korean: ')
    ? `In Korean: ${guide} ${head.slice('In Korean: '.length)}`
    : `In Korean: ${guide} Then ${head[0].toLowerCase()}${head.slice(1)}`;
  return [merged, ...steps.slice(1)];
}

/** 미니대화 한 회전 → 단계 문자열 배열. A 대사마다 바로 뒤 B 대사를 기대 답으로 단다. */
function dialogueRound(lines, round) {
  const firstB = lines.find(isB);
  const guide =
    round === 1
      ? `이제 대화 연습입니다. 따라 말하지 말고 제 말에 영어로 답하세요.${firstB ? ` 첫 대사는 "${firstB.en}" 입니다.` : ''}`
      : '같은 대화를 한 번 더 합니다. 이번에도 제 말에 답하세요.';
  const out = [];
  for (let i = 0; i < lines.length; i += 1) {
    if (isB(lines[i])) {
      out.push(`In Korean: 먼저 말하세요.  (I answer: ${lines[i].en})`);
      continue;
    }
    const next = lines[i + 1];
    if (next && isB(next)) {
      out.push(`Say "${lines[i].en}"  (I answer: ${next.en})`);
      i += 1;
    } else {
      out.push(`Say "${lines[i].en}"`);
    }
  }
  return withGuide(out, guide);
}

/** 같은 미니대화를 쓰는 카드가 여럿이어도 대화는 한 번만 태운다 (첫 등장 순서 유지). */
function distinctDialogues(list) {
  const seen = new Set();
  const out = [];
  list.forEach((it) => {
    if (!it.miniDialogue.length) return;
    const k = it.miniDialogue.map((l) => `${l.speaker}|${l.en}`).join('\n');
    if (seen.has(k)) return;
    seen.add(k);
    out.push(it.miniDialogue);
  });
  return out;
}

function buildSteps(list) {
  const steps = [];
  if (!list.length) {
    steps.push('Ask me to say a few simple everyday sentences, one at a time.');
  }
  list.forEach((it) => {
    steps.push(`Say "${sentenceOf(it)}" In Korean, point out one stress or linked sound, then say: ${it.ko ? `${it.ko} ` : ''}따라 해 보세요.`);
  });
  distinctDialogues(list).forEach((lines) => {
    steps.push(...dialogueRound(lines, 1), ...dialogueRound(lines, 2));
  });
  const drillSteps = list.flatMap((it) =>
    it.drills.slice(0, DRILL_MAX).map((d) => (d.ko ? `Say in Korean: ${d.ko}  (I answer: ${d.en})` : `Ask me to say "${d.en}"`)),
  );
  steps.push(...withGuide(drillSteps, '이제 한국어를 듣고 영어로 말하세요.'));
  list.forEach((it) => {
    steps.push(`Ask me in English one simple question that I would answer with "${sentenceOf(it)}" Then wait.`);
  });
  steps.push('In Korean, tell me which of the sentences above I said on my own and which needed help. Count one as on my own only if I said it in a dialogue step or a Korean-to-English step with no hint and no correction from you. Then stop.');
  return steps.map((s, i) => `${i + 1}. ${s}`).join('\n');
}

/** items → ChatGPT 붙여넣기용 프롬프트 문자열. */
export function buildVoicePrompt(items) {
  const list = normalizeVoiceItems(items);
  const header = list.length
    ? list.map((it, i) => headerLine(it, i + 1)).join('\n')
    : 'S1 (use a few simple everyday sentences)';

  return `${VOICE_PROMPT_INTRO}

You are my English speaking tutor. We practice by voice. Take as long as each step needs; we will not always reach the last step, and that is fine.

About me: Korean adult, beginner. I can read simple English, but when I speak, usually only one word comes out and I can't build the sentence. I repeat well after hearing it.

Today's sentences, from my app:
${header}

How to run this lesson:
- Do ONE numbered step per turn, in order, then stop and wait for me. A step can have several parts: do all of its parts in that one turn. Never merge two steps into one turn, and never skip a step.
- A hint or a correction is not a step. Stay on the same step until I have said my line, then go on.
- Say only what the step tells you to say, in the language it names. Use only the sentences written in this message: no new practice sentences, no new grammar. (The questions in the last steps are yours to write.)
- Text in ( ) is a note for you. Never say it out loud, and never say the step numbers or the headings.
- In a step that ends with 따라 해 보세요, repeating your English line is exactly what I should do. Say nothing about it and go on.
- In the dialogue steps I must answer, not repeat. If I say your line back, say in Korean "그건 제 대사예요", then give me the first two words of my line and wait.
- If I stop partway, or say only one word, give me the next one or two words from where I stopped, and wait. If that would finish my line, say the Korean meaning instead. Never say my whole line for me when it is my turn to speak. (Telling me my first line in a Korean 안내 is not that.)
- If I answer with a different sentence from today, say in Korean which sentence I need now, then give me its first two words.
- If I ask you to go on, move to the next step and do it, even if this step is unfinished. Never reply with only "좋아요" or "네", and never say several steps at once.
- Fix one mistake at a time, briefly, in Korean, then have me say it again. When I get it right, say nothing about it and do the next step. No praise.
- Do not ask me whether I am ready or whether I want to continue. Just do the next step.
- Speak clearly. If I don't understand, say the English again slower, then a short Korean hint, and stay on this step.
- My control words: 다시 = say this whole step again. 천천히 = say the English of this step again, slowly. 뜻 = give the Korean meaning of the English you just said. 다음 = leave this step and do the next one. 그만 = skip to the last step.

Steps:
${buildSteps(list)}

Start now. Say only step 1, then wait.`;
}
