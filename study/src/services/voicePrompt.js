/**
 * voicePrompt.js — 세션에서 배운 기본 문장을 ChatGPT 음성 모드로 연습하는 붙여넣기용 프롬프트 빌더.
 *
 * 세션 요약(summaryV2)과 말하기 연습 화면(#/speak)이 같이 쓴다. 표현은 문자열 또는
 * { expr, sentence, ko, situation, miniDialogue, drills } (speakPicks.toSpeakItem 모양).
 *
 * 2026-09-19 재설계 — 정본은 specs/study-app-spec.md §9-9 "프롬프트". 근거:
 * · 단계 대본과 대사 목록을 주면 교사가 목록 밖 표현을 지어내고 학습자는 빈칸만 채운다
 *   (2026-09-10 v4 실측 `~/apps/tmp/voice-teacher/runs-analysis-v4.md`). 길이가 아니라 대본이 문제였다.
 *   그래서 목적·재료·규칙 여덟 줄만 주고 진행은 교사에게 맡긴다.
 * · 재료는 목표 문장이 아니라 기본 문장 — 구문을 포함하는 드릴 중 가장 짧은 것. 세션 시안의 ② 단계와
 *   같은 뜻이지만 그 시안은 아직 앱에 없고, 여기서는 단어 경계까지 본다.
 * · 실제 ChatGPT 다섯 번 검증(2026-09-19): 규칙 줄을 늘리지 말고 기존 줄을 정확하게 만들어야 지켜진다.
 *   "안 바꾸면 무엇을 바꿀지 말하라", "맞게 말한 것만 센다", "네 번째 답마다 되묻게 하라" 로 조건과
 *   시점을 박은 뒤에야 변형 강제·3회 세기·되묻기가 안정됐다.
 * · 미니대화는 이 프롬프트에서 쓰지 않는다. 대본 대화를 태우면 구간 전체가 따라 말하기로 무너졌다(2026-09-14 실기).
 */
export const VOICE_PROMPT_INTRO = '[아래를 ChatGPT 새 대화에 붙여 넣고, 텍스트 답장이 온 뒤에 같은 대화에서 음성 모드를 켜세요]';

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

const sentenceOf = (it) => it.sentence || it.expr;
const wordCount = (s) => str(s).split(/\s+/).filter(Boolean).length;

/* 구문의 앞머리 — "Do you want to ~" 는 물론 "How about ~?", "pick ~ up" 처럼 ~ 가 중간에 있는 키도
 * 앞부분으로 맞춘다(실제 시드 313개 중 8개). */
const headOf = (expr) => expr.split('~')[0].trim() || expr.replace(/~/g, ' ').trim();

/* 단어 경계까지 본다. 그냥 부분 문자열로 찾으면 "I keep" 이 "Nani keeps" 안에 걸려,
 * 학습자가 배운 형태가 아닌 문장이 기본 문장으로 뽑힌다(en-personal-2026-09-17 카드 2에서 실제로 발생). */
function headMatcher(head) {
  const esc = head.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`(^|[^\\p{L}\\p{N}])${esc}($|[^\\p{L}\\p{N}])`, 'iu');
}

/** 기본 문장 — 구문을 포함하는 드릴 중 가장 짧은 것. 없으면 가장 짧은 드릴, 드릴도 없으면 목표 문장. */
function baseOf(it) {
  const head = headOf(it.expr);
  const re = head ? headMatcher(head) : null;
  const withHead = re ? it.drills.filter((d) => re.test(d.en)) : [];
  const pool = withHead.length ? withHead : it.drills;
  if (!pool.length) return { en: sentenceOf(it), ko: it.ko };
  return pool.reduce((a, b) => (wordCount(b.en) < wordCount(a.en) ? b : a));
}

/** 오늘 문장 한 줄 — 기본 문장·뜻·구문. 구문이 문장과 같으면 따로 붙이지 않는다. */
function baseLine(it, n) {
  const b = baseOf(it);
  const pattern = it.expr && it.expr !== b.en ? `  (${it.expr})` : '';
  return `B${n} "${b.en}"${b.ko ? ` = ${b.ko}` : ''}${pattern}`;
}

/** 교사가 질문을 만들 소재 — 카드마다 적힌 상황을 중복 없이 한 줄로. */
function background(list) {
  const seen = new Set();
  return list
    .map((it) => it.situation)
    .filter((s) => s && !seen.has(s) && seen.add(s))
    .join(' ');
}

/** items → ChatGPT 붙여넣기용 프롬프트 문자열. */
export function buildVoicePrompt(items) {
  const list = normalizeVoiceItems(items);
  const header = list.length
    ? list.map((it, i) => baseLine(it, i + 1)).join('\n')
    : 'B1 (use a few simple everyday sentences)';
  const span = list.length > 1 ? `B1 to B${list.length}` : 'B1';
  const bg = background(list);

  return `${VOICE_PROMPT_INTRO}

You are my English speaking partner. I learned the sentences below in my app, so do not teach or explain them. Your job is to make me say each of them out loud many times by asking me questions and by answering mine, and to make me change a word or two for a new situation. I want them to stick without memorizing them.

About me: Korean adult. I read English well, but when I speak, only fragments come out. I repeat well after hearing. I want to say these from meaning, without looking at them.${bg ? `\nMy day, so your questions make sense: ${bg}` : ''}

Today's session, the sentences I practiced:
${header}

How to run it:
- Make me say each of ${span} three times, spread out. A time counts only when I say the whole sentence correctly in answer to your question; a wrong or off-target answer does not count. For one of those three, ask in a way that forces me to change a person, a time, or a thing, and do not wait for me to change it on my own. If my answer comes back without that change, say in Korean what to change in three words or fewer, then wait.
- Ask me things that make ${span} the natural answer. Never tell me which sentence or which pattern to use. Ask a different question every time: never reuse a question you have already asked.
- After every fourth answer of mine, say "이번엔 저한테 물어보세요", then answer my question in one line and go on.
- One question per turn. Then stop and wait at least five seconds. Your turn is one line, under twelve words. I must talk more than you.
- Never say my sentence for me. When I am stuck or wrong, give one hint: the first two words, or in Korean what to fix in three words or fewer ("주어부터", "과거로요"). Then wait again.
- If the hint does not work, say the whole sentence once, say "따라 하세요.", and ask for that sentence again two or three turns later.
- If I repeat your line instead of answering, say "그건 제 대사예요" and give me the first two words.
- Always fix a missing be-verb, a missing subject, or a wrong tense. Ignore article and preposition slips when the meaning is clear. No praise: say "네" and go straight on.
- When each of ${span} has come out three times, stop. Give one word per sentence: 혼자 / 힌트 / 모델. Then one sentence on what to practice tomorrow.

Start now: one line in Korean to tell me we are starting, then your first question.`;
}
