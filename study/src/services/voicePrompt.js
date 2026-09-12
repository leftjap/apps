/**
 * voicePrompt.js — 세션에서 배운 문장을 ChatGPT 음성 모드로 연습하는 붙여넣기용 프롬프트 빌더.
 *
 * 세션 요약(summaryV2)과 말하기 연습 화면(#/speak)이 같이 쓴다. 표현은 문자열 또는
 * { expr, sentence, ko, situation, miniDialogue, drills } (speakPicks.toSpeakItem 모양).
 *
 * 2026-09-11 재설계 근거 — 2026-09-10 하루 동안 실제 ChatGPT 음성으로 여섯 번 돌린 결과:
 * · 타깃을 숨기고 상황으로 유도하는 옛 방식은 초급(단어 하나만 나옴)에게 시험이 된다. 문장을 먼저 들려주고 쓰게 한다.
 * · 절차를 길게 적으면 모델이 계획을 버리고 질문 기계로 돌아간다. 공개된 튜터 프롬프트들처럼 짧게, 역할극 대사와
 *   한글→영어 목록 같은 모델이 실제로 따르는 형태로만 쓴다.
 * · 한 턴에 여러 지시를 몰면 대본 읽는 소리가 된다(모델 자체 시스템 프롬프트가 "한두 문장" 이다). 한 턴 한 가지.
 * · 막혔을 때 정답을 통째로 주면 따라 말하기만 남는다. 첫 두 단어만 준다 (자가수정 유도 우선 — Ammar & Spada 2006).
 * · 붙여 넣은 직후 음성을 켜면 지시가 반영되지 않았다. 텍스트 답장을 받은 뒤 음성으로.
 * 세션 콘텐츠 중 미니대화(앱에선 듣기·녹음, 2026-09-12)와 드릴 앞 세 개를 실어, 앱에서 배운 것만으로 역할극·응용을 한다.
 */
export const VOICE_PROMPT_INTRO = '[아래를 ChatGPT 새 대화에 붙여 넣고, 텍스트 답장이 온 뒤에 같은 대화에서 음성 모드를 켜세요]';

const DRILL_MAX = 3;
const str = (v) => String(v ?? '').trim();
const linesOf = (arr) => (Array.isArray(arr) ? arr : []).filter((x) => x && str(x.en));

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

function itemBlock(it, n) {
  const key = it.sentence && it.expr && it.expr !== it.sentence ? `  [key: ${it.expr}]` : '';
  const out = [`${n}. "${it.sentence || it.expr}"${it.ko ? `  — ${it.ko}` : ''}${key}`];
  if (it.miniDialogue.length) {
    out.push('Dialogue (you are A, I am B):');
    it.miniDialogue.forEach((l) => out.push(`  ${l.speaker}: ${l.en}`));
  } else if (it.situation) {
    out.push(`  (${it.situation})`);
  }
  if (it.drills.length) {
    out.push('Practice lines (Korean → English):');
    it.drills.slice(0, DRILL_MAX).forEach((d) => out.push(d.ko ? `  ${d.ko}  → ${d.en}` : `  ${d.en}`));
  }
  return out.join('\n');
}

/** items → ChatGPT 붙여넣기용 프롬프트 문자열. */
export function buildVoicePrompt(items) {
  const list = normalizeVoiceItems(items);
  const content = list.length
    ? list.map((it, i) => itemBlock(it, i + 1)).join('\n\n')
    : '1. (use a few simple everyday sentences)';

  return `${VOICE_PROMPT_INTRO}

You are my English speaking tutor. We practice by voice for about 10 minutes.

About me: Korean adult, beginner. I can read simple English, but when I speak, usually only one word comes out and I can't build the sentence. I repeat well after hearing it.

Today I studied the sentences below in my app. Practice ONLY what is listed here. No new sentences, no new grammar.

${content}

For each sentence, in this order:
- Say the sentence once, naturally, and point out one stress or linked sound. Then the Korean meaning. Ask me to repeat it.
- Do the dialogue with me. You say A's lines; I say B's. Wait for me after each of your lines. If B speaks first, tell me to start. Do it twice.
- Practice lines: say the Korean, and I say the English. One at a time.
- Ask me one simple question where I would use the sentence myself.

If I only say a word or stop, don't say the whole sentence — give me the first two words and wait.
Every turn: two short sentences at most, one thing to do, then wait for me.
Fix one mistake at a time, briefly, and have me say it again. Skip the praise — just correct or move on.
Speak clearly; if I don't understand, say it slower, then a short Korean hint.
Don't read the numbers or headings aloud.

At the end, tell me in Korean which sentences I said on my own and which needed help.

Start with sentence 1.`;
}
