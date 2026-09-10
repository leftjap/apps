# Study 앱 — 내 이야기 트랙 (en `track: mylife`) 5일치

> 작성 2026-09-10. 시드 = `seeds/en-mylife-2026-08-27.json` ~ `-08-30.json`, `-09-02.json` (5묶음 × 5장 = 25장).
> 배경: 2026-09-09~10 ChatGPT 음성 대화에서 **즉석 생산이 A1** 로 확인됐다. 코어100 은 "읽으면 알지만 말로 안 나오는 관용구"(B1 생산)라 방향이 반대다 — 모두영어 실측에서 떠올린 문장은 아는 문법으로 **조립되는** 것뿐이었고(Are you hungry? / I'm sorry I'm late.), 못 떠올린 건 전부 짧은 관용구였다(I'm on my way. / Can you come over? …). 그래서 이 트랙은 **조립되는 문형을 내 상황으로** 말하는 데 집중한다. 코어100 은 지우지 않고 뒤로 미룬다(§4).

## 1. 설계 원칙 (5일 전부 공통)

| 원칙 | 적용 |
|---|---|
| 내 수준 | 문장 3~7단어(평균 5). 새 문법 없음 — 모두 이미 읽으면 아는 것. 카드의 핵심은 **기본동사 청크** 하나(have a cat · get up · go to work · look for · take the train …). 25장 중 21장이 게이트 `BASIC_VERBS` 머리 |
| 내 상황 | 주어·목적어가 나·아내·고양이·집·출퇴근·주말·다음 여행. 카드 `situation` 은 "이 말을 실제로 언제 하는가" |
| 내 목표 | 1~4일차 = 일상 회화(ChatGPT·여행지에서 나에 대해 말하기), 5일차 = 여행 준비. 넷플릭스 목표는 2일차 5번·chain 에 넣어 대화 소재로 |
| 복습 회상 | `meaning` 은 **수렴형** 한글 — 그 영어 하나로 모이게 쓴다("표는 인터넷에서 **구했어요**" → got, "**집에 도착해요**" → get home). `anchor` = 핵심 부분 |
| ChatGPT 대화 | 하루 5문장이 그날 대화 주제 하나(§3)에 다 쓰인다. 미니대화 A(상대)=ChatGPT 가 할 법한 질문, B(나)=타깃. 4일차 1번은 **내가 되묻는 질문** |
| 모두영어 재활용 | 8~13편에서 배운 문장을 **3일차 본문 5장 전부**(ep9·10)와 미니대화·드릴 12곳에 다시 넣었다(§5). 1~7편은 repo 에 시드가 없어 못 넣었다 |
| 형식 | 코어100 과 동일: 표현 카드 8필드 + chain(내 상황으로 확장) + miniDialogue(2~4턴) + chunks 조각 뜻 + anchor. 게이트 `validate-seed.mjs` 통과(sceneless 트랙 `mylife`) |

## 2. 5일 구성

| 일차 | date(순서) | 할 수 있는 것 | 문장 | ChatGPT 주제 |
|---|---|---|---|---|
| 1 | 08-27 | 나·아내·고양이 소개 | I have a cat. / I live with my wife. / My wife is at work. / Our cat sleeps all day. / I want to speak English. | Tell me about your family and your cat. |
| 2 | 08-28 | 내 하루 말하기 | I get up at seven. / I go to work at nine. / I get home around seven. / I have dinner with my wife. / I watch Netflix before bed. | What's your typical day like? |
| 3 | 08-29 | 늦는다고 알리기·연락·초대 (모두영어 복습) | I'm running late. / I'm stuck in traffic. / I'm on my way. / I'll call you when I get there. / Can you come over? | 역할극: 저녁에 늦어 아내에게 전화, 그다음 친구 초대 |
| 4 | 08-30 | 주말·취미 말하고 되묻기 | What do you do on weekends? / I like to stay home. / We go for a walk. / My wife likes cafes. / I take pictures of the cat. | What do you like to do on weekends? |
| 5 | 09-02 | 다음 여행 계획 말하기 | We're going on a trip soon. / We're looking for a hotel. / I got the tickets online. / I want to try local food. / We'll take the train. | Tell me about your next trip. |

**사실 확인이 필요한 문장** (내가 지오의 생활을 모르고 쓴 가정): 2일차 7시 기상·9시 출근·7시 귀가, 4일차 "아내는 카페를 좋아해요", 5일차 "기차를 탈 거예요". 다르면 숫자·명사만 바꿔 재적재한다 — **학습을 시작하기 전에만** 가능(`seed-supabase.mjs` completed 게이트). 고양이 대명사는 기존 시드 관례대로 she 를 썼다(1일차 chain).

## 3. ChatGPT 대화 절차 (하루 10분)

1. 앱에서 그날 묶음(5장)을 끝낸다.
2. ChatGPT 새 대화에 아래 프롬프트를 붙여 넣고 보낸 뒤, **같은 대화에서 음성 모드**를 켠다. `{TOPIC}` 과 `{SENTENCES}` 는 §2 의 그날 것으로 바꾼다.
3. 끝나면 ChatGPT 가 말한 "혼자 쓴 문장 / 힌트 받은 문장"을 기억해 두고, 앱 문장 모아보기에서 못 쓴 문장을 다시 본다.

> 앱 홈의 「말하기 연습」 프롬프트는 아직 "A2–B1·호텔 체크인 장면" 기준이라 이 트랙에는 맞지 않는다(2026-09-10 진단, 앱 개선 항목). 그 화면이 A1 기준으로 바뀔 때까지는 아래 프롬프트를 쓴다.

```
You are my English speaking partner. We talk ONLY by voice. Follow these rules exactly.

# Me
- Korean adult. My reading is okay, but my SPEAKING is beginner level (A1). I need very simple, slow English.
- Today's topic: {TOPIC}

# Today's sentences (for you only — do NOT read this list to me)
{SENTENCES}

# How you talk
1. English only. Speak SLOWLY. Each turn = ONE short question (max 8 words), then STOP and wait for me.
2. Ask real questions about MY life on today's topic — my wife, my cat, my day, my trip. Not quiz questions.
3. A one-sentence answer from me is perfect. Never push for more than one sentence.
4. Build the conversation so that I naturally NEED today's sentences. Never say a target sentence before I do. Never ask me to translate.
5. If I'm silent for a few seconds, say the FIRST WORD only as a hint, then wait again.
6. If I don't understand, say it again slower with easier words. No Korean unless I say "Korean, please".

# Mistakes
7. First react to my meaning ("Nice!", "Really?"). Then fix ONE thing only, by saying the correct short sentence once. Then continue.

# End (after about 8 minutes)
8. Say in simple English: which of today's sentences I used by myself, which needed a hint, and one thing to practice tomorrow.

Start now: one short greeting, then your first question. English only.
```

## 4. 적재 순서·날짜

- 파일 하나 = 세션 하나. `date` 는 달력이 아니라 **순서**(코어100 §3 과 같은 규칙). 남은 코어100 묶음이 2026-09-04 부터라 그보다 앞 날짜 **08-27·28·29·30·09-02** 를 썼다 — 로더(`src/pages/cardLoader.js`)가 오늘까지의 미완료 중 가장 오래된 날짜를 열므로 이 5묶음이 먼저 나오고, 끝나면 코어100 이 이어진다. 08-31·09-01 은 2026-08-31 모두영어 ep14·15 정리의 서버 잔재를 피하려고 건너뛰었다(1일 1장면 서버 게이트).
- 적재: 파일마다 `gh workflow run study-seed-supabase.yml --field payload=seeds/en-mylife-<date>.json --field user_id=<UUID> --field dry_run=false` (5회). 또는 로컬 `set -a && source ~/.config/study/.env && node scripts/seed-supabase.mjs --payload seeds/en-mylife-<date>.json --user-id <UUID>`.
- 코어100 을 5일 뒤에도 미루려면 미완료 코어100 파일의 `date` 를 뒤로 바꿔 재적재한다(미완료 카드는 id 기준 upsert 로 날짜가 갱신된다).
- 복습은 기존 SRS 그대로. 회상 프롬프트 = `meaning`.

## 5. 모두영어 재활용 목록

- **본문**(3일차 전부): I'm running late. / I'm stuck in traffic. / I'm on my way. / I'll call you when I get there. / Can you come over? — 이 중 on my way·come over 는 2026-08-29 복습 실측에서 X 였던 문장이다. 한글 프롬프트를 수렴형으로 바꿨다("지금 가는 중이야", "우리 집에 올 수 있어?").
- **미니대화 상대 줄**: Are you on your way? / I'll be waiting. / What's going on? (2회) / I need your help with something.
- **드릴**: Do you want something to eat? / I'm stuck at work. / I got stuck at work. / I'll call you when I get home. / I'm almost home.

## 6. 이어서 만들 때

- 6일차부터는 같은 형식으로 **할 수 있는 것 하나 = 묶음 하나**. 후보: 길 묻기·식당 주문(여행), 몸 상태·날씨(일상), 아내 직장 얘기, 고양이 병원. 매 묶음 모두영어 문장 2~3개를 다시 넣는다.
- 기준 데이터: 이 5묶음의 복습 자기평가(O/△/X)와 ChatGPT 요약. X 가 몰리는 문장 유형을 보고 다음 묶음 난도를 정한다.
- 앱 개선(2026-09-10 진단, 별도 작업): 홈에 할 수 있는 것·연속일·단계 표시 / 말하기 연습 프롬프트 A1 화·그날 주제 반영 / ChatGPT 결과 기록 / 묶음 6문장 이어 말하기 / 세션 15분 상한 / 졸업 문장 보관.
