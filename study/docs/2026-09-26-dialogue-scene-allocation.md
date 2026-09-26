# 개인화 대화 — 장면 배정표 100편 (2026-09-26)

> 2026-09-26 사용자 결정으로 소재 규칙과 공급원 순위가 바뀌었다. 이 문서가 그 결정의 정본이고, 3묶음부터는 이 배정표에서 장면을 골라 쓴다. 절차는 스킬 `study-dialogue-batch`, 규칙 요약은 작업지시서 `2026-09-13-dialogue-session-work-order.md` §7.

## 1. 바뀐 규칙 (2026-09-26)

1. **소재는 창작한다.** 일기는 더 이상 장면의 출처가 아니라 **인물 시트**(§2)의 출처다. 장면은 영어 교재가 다루는 일반 상황(호텔·공항·기내·길 묻기·교통·주문·쇼핑·텍스 리펀·스몰토크·외국인 길 안내·전화 예약·병원 접수)을 인물 시트에 맞게 만든다. 실제 인물과 동물에 대한 사실은 시트와 어긋나면 안 된다 — 나니는 시력을 잃었고, 호야는 2026-01-29 에 떠났고, 소연은 대한항공 승무원이다. 투자 얘기는 여전히 제외한다. "장면 하나 = 일기 한 편" 과 "뱅크에 없는 사실 금지" 는 폐기한다(2026-09-19 규칙). 대신 줄마다 `src` 에 근거를 적되, 근거는 인물 시트 항목이거나 "(일반 대사)" 다.
2. **지오 줄은 상황을 말하는 문장이어야 한다.** 여덟 줄 중 반응만 하는 지오 줄(`That sounds great.` `You might be right.` 류)은 한두 줄까지다. 2묶음이 별로였던 원인이 이것이다 — 모두영어를 우선하니 상황과 무관한 반응 문장만 골라졌고, 소연이 사실을 말하고 지오는 맞장구만 쳤다.
3. **공급원 순위: ① 영상 30패턴 → ② 모두영어 그대로 → ③ 233 뱅크.** 2026-09-20 의 "모두영어 그대로 > 30패턴 자작" 은 폐기한다. 재사용은 기본값이 아니다 — 먼저 그 자리에서 지오가 할 말을 한국어로 정하고, 영어로 옮길 때 같은 뜻의 30패턴 문장·모두영어 문장이 있으면 그것을 쓴다. 뜻이 같은 후보가 둘이면 순위대로 고른다. 30패턴은 할당량이 아니라 순위다(유지).

4. **영어를 실제로 쓰는 상황만 고른다.** 무대는 둘이다 — (가) 해외: 소연 비행을 따라가서 소연이 근무하는 동안 혼자 다니는 지오, (나) 한국: 홍대·공항철도 앞에 사는 지오가 만나는 외국인(반복 인물 넷 + 일회성 여행객). 소연·친구·국내 상담원과의 대화는 한국어로 하는 일이라 새 장면에서 뺐다(1차 표의 30편이 여기에 걸려 폐기).
5. **2026년에 사람과 말이 오가는 자리만 쓴다.** 환전소·유심 카운터·택시 요금 흥정·전화 예약·배달 전화·카드 분실 전화·종이 티켓 수령은 앱과 키오스크로 넘어갔으므로 쓰지 않는다. 텍스 리펀은 나라에 따라 다르다 — 유럽·한국은 키오스크·즉시 환급이 흔하지만 태국은 세관 창구에서 사람이 확인하므로 방콕 시리즈에는 넣을 수 있다. 남은 자리는 프런트에서 문제 풀기, 기내, 입국심사(미국·태국은 대면), 식당 주문의 세부, 약국, 스몰토크, 한국에서 길 묻는 외국인(구글맵이 한국에서 도보 안내를 못 한다 — 2026년 중반 지식 기준이고, 지도 반출 허가로 바뀌었으면 장면 89 만 고친다), 그랩 기사가 픽업 위치를 못 찾아 걸어 오는 전화다.
6. **재미는 인물과 사건에서 나온다.** 반복 인물(§2-2)과 시리즈로 묶어, 복습 때 장면이 떠오르게 한다. 모두영어는 아는 사이의 말이 대부분이라 반복 인물이 있어야 자연스럽게 들어간다.

7. **관계사·삽입절을 편마다 두 줄 이상, 지오 줄에 최소 한 줄 넣는다.** 사용자가 약한 부분이다(2026-09-26). 상대 질문에도(`Is this the bus that goes to Siam?` `Do you know where I can top up?`), 지오 답에도(`That's the hotel I'm staying at.` `The seat I picked online isn't showing.` `I'm not sure if I heard that right.`). `verify-draft` 가 어림으로 세어 경고하고, 접촉절(`the room I booked`)은 어림으로 못 잡으니 줄에 `rel: true` 를 붙인다.

배정표는 **장면 유형에 닻 문형 1~2개**를 붙인 것이다. 2026-09-19 에 실패한 "패턴 배정표" 는 대화 한 편의 줄마다 패턴을 먼저 박은 것이었고, 그건 여전히 금지다. 대화는 한 가닥으로 먼저 쓰고, 닻 문형이 자연스럽게 들어갈 자리가 없으면 바꾼다.

## 2. 인물 시트 (일기에서 확인된 사실만)

| 항목 | 사실 |
|---|---|
| 지오 | 50세. 홍대 근처, 공항철도가 코앞인 집. 앱을 직접 만든다(운동앱·유튜브 절제기). 헬스장(트레드밀·스쿼트·데드리프트), 허리 통증 이력. 세브란스 초음파 검진(매년), 여의도 성모병원 CT(폐 결절 추적). 늦잠이 잦다(정오 기상). 맥주는 숙취가 심해 외식 때 한 병만. 벤츠. 장거리 운전(제천 왕복 8시간). 4만원 남성 전용 미용실. |
| 소연 | 아내. 대한항공 승무원(라스베가스·런던·방콕 노선), 새벽 4~5시 출근이 잦다. 오른쪽 시신경이 약해 안과 추적 검사. 청국장·깻잎·매콤한 음식을 좋아한다. 미감이 뛰어나고 작은 돈도 오래 고민한다. 미싱. 이준혁 팬. 방콕에서 감기. |
| 나니 | 고양이. **시력을 잃었다.** 안약은 관리. 털이 많아 목욕이 큰일. 건사료를 과식하면 토한다. 캣타워에서 잔다. |
| 호야 | 고양이. 2026-01-29 사망. 그 뒤 장면에는 나오지 않는다. |
| 친구 | 봉수(약속에 늘 늦음) · 정경섭(연남동, 당구, 늦음, 세종 이사 예정) · 상구(아이 있음) · 용구(딸 있음, 오랜 채무를 다 갚음) · 윤호 |
| 가족 | 처제(반려동물을 다 떠나보냄) · 장모님 생일 7/13 · 부모님은 제천(아버지가 노인회 회장) · 어머니 환갑 제주 여행 예정 · 소연 막내삼촌(치앙마이 효도관광 답례로 보약) |
| 여행 | 방콕(2022 이후 처음, 비즈니스 좌석, MK수키는 기대 이하, 시암센터) · 하노이 3박 4일을 2박으로 줄인 적(고양이 그리워) · 베트남 가족 효도관광 예정 · 예전엔 소연 비행을 따라다녀 '제드의 왕자' |
| 외식 | 진진 만두국 · 와우 끝집(회) · 화규(예약) · 영동 감자탕 · 오봉집/마포소금구이 · 안동실비 · 혼시츠·야키토리묵(예약제) · 호반식당(청국장) · 고릴라 · 연희동 보쌈 · 현대음률(와인) · 오향만두 · 청기와(갈비) |
| 살림 | 새 세탁기(누수로 미룸) · 아마존 직구 가습기(말다툼) · 벤타·다이슨 · 맥미니·새 모니터 · 소연 아이폰 선물 · 워커힐 김치 택배 · 수육·쌈 장보기 |
| 이동 | 버스(망원·연희동) · 택시(안동실비) · 공항 픽업 새벽 운전 · 공항철도 |

## 2-2. 반복 인물 (창작 — 인물 시트와 어긋나지 않게)

| 이름 | 누구 | TTS | 편수 | 살리는 시트 항목 |
|---|---|---|---:|---|
| Liam | 홍대 헬스장 트레드밀 옆자리, 캐나다인 영어 강사, 30대 | B(남) | 12 | 러닝 5→30분 · 허리 부상 · 50세 · 맥주 한 병 규칙 · 운동앱 · 운동 안 가면 기분 가라앉음 |
| Emma | 위층으로 이사 온 영국인 디자이너, 고양이 두 마리 | A(여) | 10 | 나니 시력·소리 민감 · 화재경보기 3시간 · 택배 · 워커힐 김치 · 새 세탁기 · 천호 이사 계획 |
| Tom | 공항철도 역 앞 카페에서 일하는 호주인 바리스타(워킹홀리데이) | B(남) | 8 | 커피 줄이기 · 앱 개발 · 동네 맛집(보쌈·감자탕) · 아내 비행 주말 · 늦잠 |
| Sarah | 소연의 외국인 동료 승무원(대한항공 현지 채용) | A(여) | 8 + 해외 2 | 소연 새벽 출근 · 기내에서 "소연 남편" · 맥주 한 병 · 나니 소개 · 기념일 아이폰 |
| May | 방콕 호텔 프런트(태국에서 흔한 영어식 애칭) | A(여) | 5 | 크루 요금 예약 · 늦잠 조식 · 에어컨 · 시암센터 길 · 체크아웃 |
| 여행객·직원·승객 | 일회성 | 상황별 | 나머지 | — |

남성 인물(Liam·Tom)은 지오와 같은 B 음성이다(1묶음 정경섭 장면과 같은 처리). 이름은 흔하고 서로 구분되는 것으로 골랐다 — 첫소리 L·E·T·S·M (2026-09-26 지적으로 Emma·Tom·Sarah·May 에서 바꿈).

## 3. 배정표 (100편 — 2차, 2026-09-26)

열 뜻: **사건** = 그 편의 한 줄 줄거리(재미가 여기서 난다). **닻** = 자연스러운 30패턴 1~2개. **모두영어** = 뜻이 그대로 맞는 문장 후보. (사용) = 이미 카드로 쓴 문장.

### 3-0. 긴장 장면은 겹쳐서 만든다 (한 번만 만들지 않는다)

검색(2026-09-26)에서 영어가 약한 여행자가 가장 힘들다고 꼽힌 자리는 입국심사(심사관과 1:1, 틀리면 2차 검사), 공항 절차(안내방송·보안 지시·시간 압박이 겹침), 교통(기사와의 소통), 호텔 체크인, 식당 주문, 긴급 상황이었다. 사용자가 지목한 그랩·택시·호텔·입국심사·티케팅을 더해 여섯 유형으로 묶었다.

**겹은 나라를 바꿔 반복하는 것이 아니다.** 유형마다 아래 네 층이 있어야 하고, 층마다 상대의 핵심 질문을 **다른 표현**으로 듣게 한다 — 심사관과 기사는 교재 문장으로 말하지 않는다.

- L1 기본 흐름: 절차가 그대로 풀린다. 문형과 순서를 익힌다.
- L2 **되묻기·확인**: 못 알아듣는다. `Sorry, could you say that again?` `Do you mean the hotel?` `I'm not sure if I heard that right.` 로 복구한다. 긴장하는 사람에게 가장 중요한 층이고 1차 표에 없었다.
- L3 문제·협상: 짐 초과, 예약 불일치, 잘못 나온 음식, 요금 다툼.
- L4 한국에서 거꾸로: 같은 상황을 도와주는 쪽에서 겪어 질문이 귀에 익는다.

| 유형 | L1 기본 | L2 되묻기·확인 | L3 문제·협상 | L4 거꾸로 | 상대 핵심 질문 변형(층마다 다르게) |
|---|---|---|---|---|---|
| 입국심사 | 4 방콕 | 36 런던(빨리 말해 되묻기) | 21 미국(아내 직업까지 추가 질문) · 50 베트남(부모님 대신 답) | — | What's the purpose of your visit? / What brings you to the UK? / Business or pleasure? |
| 공항 카운터·탑승 | 1 좌석 변경 · 33 보안 | 45 안내방송 못 알아듣고 확인 | 20 짐 초과 · 34 게이트 변경·지연 | 98 공항 가는 법 | Any bags to check? / Are you checking anything in today? / Just the one bag? |
| 호텔 | 6 크루 요금 체크인 · 23 동반자 등록 · 49 부모님 방 층 | 8 방 전화로 고장 신고(회선 나빠 되묻기) | 7 조식 마감 뒤 · 19 체크아웃 정산 | — | Do you have a reservation? / What name is it under? / Checking in? |
| 교통·기사 전화 | 10 BTS 표 · 37 컨택리스 | 5 그랩 기사 전화(위치 설명 다시) · 22 우버 기사 전화 | 16 길 잃음 · 29 우버에 둔 가방 | 89 공항철도 · 90 환승 · 94 교통카드 | Where are you exactly? / Which door are you at? / Can you see the taxi sign? |
| 식당·계산 | 12 카페 · 13 주문 | 38 펍(빠른 질문 되묻기) | 40 잘못 나온 음식·계산 착오 · 47 부모님 못 먹는 것 | 91 식당 추천 | Anything to drink? / What can I get you? / Are you ready to order? |
| 아플 때·분실 | 14 약국(증상 설명) | 43 약국(약 이름 몰라 설명으로) | 15 마사지 허리 · 29 분실 신고 | 95 약국 안내 | What are the symptoms? / How long have you had it? / Is it for you or someone else? |

입국심사와 호텔은 L4 가 없다 — 지오가 심사관이나 프런트가 될 일은 없다. 대신 L1~L3 를 각각 두 편 이상으로 채웠다.

### 해외 I — 방콕 5일 (20편, 소연 근무 중 지오 혼자)

| # | 사건 | 상대 | 닻 | 모두영어 |
|---|---|---|---|---|
| 1 | 인천 카운터. 앱 체크인은 됐는데 좌석이 소연 담당 구역과 딴 칸 | 직원 | #20 I was wondering if · #7 Can I get | |
| 2 | 기내. 소연 동료 Sarah: "소연 남편이죠? 맥주는 한 병만이라던데요" | Sarah | #2 I'm supposed to · #3 I was about to | I was just about to ~ (1편 #45 사용) |
| 3 | 기내 옆자리 태국 출장객. "아내가 지금 저 뒤에서 일해요" → "승객이 아니라 근무 중" 오해 풀기 | 승객 | #29 That's why · #30 That's what I mean | How did you two meet? (1편 #27) |
| 4 | 수완나품 입국심사(대면). 목적·일수·호텔 | 심사관 | #4 I'm here to · #2 I'm supposed to | |
| 5 | 그랩 기사 전화. 못 알아들어 다시 말해 달라고 하고, 앱 위치가 다른 층이라 세븐일레븐으로 설명 | 기사 | #16 There's · #8 Can you | I'm on my way. (사용) |
| 6 | 호텔 체크인. 예약이 소연 이름·크루 요금 | May | #4 I'm here to · #10 I'm not sure if | |
| 7 | 첫 아침. 늦잠으로 조식 마감 10분 뒤 | May | #7 Can I get · #27 I didn't mean to | I overslept. (사용) |
| 8 | 방 전화로 프런트에. 회선이 나빠 되묻고, 에어컨 소음·리모컨 먹통에 사람 보내 달라기 | May | #18 I need you to · #8 Can you | It's not working. (1편 #175) |
| 9 | 시암센터 가는 법. BTS 냐 그랩이냐, 비 예보 | May | #25 It depends on · #24 You might want to | |
| 10 | BTS 창구. 카드 기계 오류 → 현금 | 직원 | #1 I'm trying to · #11 I don't think | |
| 11 | 시암센터 점원. 미감 까다로운 아내 선물 | 점원 | #10 I'm not sure if · #21 The thing is | |
| 12 | 카페. 디카페인 있나, 커피 줄이는 중 | 바리스타 | #7 Can I get · #1 I'm trying to | Can I get a coffee? (2편 #74) · I'm trying to cut down. (사용) |
| 13 | MK수키 주문. 매운 정도, 소연 몫 포장 | 직원 | #17 I'd like to · #30 That's what I mean | |
| 14 | 약국. 소연 감기(기침·목) | 약사 | #4 I'm here to · #15 It sounds like | |
| 15 | 마사지. 데드리프트로 다친 허리 조심 | 직원 | #9 Do you mind · #13 It feels like | My back hurts. (사용) |
| 16 | 길 잃음. 구글맵 오프라인, 행인에게 | 행인 | #20 I was wondering if · #14 It looks like | |
| 17 | 호텔 라운지. 은퇴한 호주 부부 "왜 혼자?" | 여행자 | #5 I've been · #29 That's why | |
| 18 | 시암 앞. 소연과 사진 부탁(좋은 추억) | 행인 | #9 Do you mind · #19 I just wanted to | |
| 19 | 체크아웃. 미니바 맥주 한 병 = 규칙 지킴 | May | #11 I don't think · #28 I can't wait to | It's been a long day. (1편 #330) |
| 20 | 귀국 카운터. 소연 쇼핑으로 짐 초과 | 직원 | #25 It depends on · #23 You don't have to | |

### 해외 II — 라스베가스 레이오버 (15편)

| # | 사건 | 상대 | 닻 | 모두영어 |
|---|---|---|---|---|
| 21 | 미국 입국심사. "아내가 승무원인데 왜 혼자?" | 심사관 | #4 I'm here to · #29 That's why | |
| 22 | 우버 기사 전화. 픽업 존을 못 찾음, 팁은 앱으로 되나 | 기사 | #8 Can you · #22 As far as I know | Can you give me a ride? (2편 #129) |
| 23 | 크루 호텔 프런트. 소연 방에 합류 등록 | 직원 | #4 I'm here to · #18 I need you to | |
| 24 | 소연 동료들과 저녁. Sarah 가 맥주 한 병 규칙으로 놀림 | Sarah | #23 You don't have to · #27 I didn't mean to | I'll buy you a drink. (1편 #113) · Don't make a habit of it. (1편 #283) |
| 25 | 뷔페 줄. 옆 사람과 | 손님 | #16 There's · #14 It looks like | Are you in line? (1편 #8) · Who's next? (1편 #9) |
| 26 | 카지노 안 하는 이유. "안 좋아해서?" "돈 문제가 아니라 그게 내 말이야" | 동료 | #21 The thing is · #30 That's what I mean | I'm not in the mood. (1편 #187) |
| 27 | 아울렛. 사이즈·환불 정책 | 점원 | #25 It depends on · #10 I'm not sure if | |
| 28 | 아울렛 교환. 소연이 산 것 | 점원 | #27 I didn't mean to · #7 Can I get | |
| 29 | 우버에 두고 내린 가방 | 직원 | #14 It looks like · #26 I'll let you know | I totally forgot. (1편 #66) |
| 30 | 시차로 새벽 로비. 야근 직원과 | 직원 | #5 I've been · #13 It feels like | I can't sleep. (1편 #267) |
| 31 | 호텔 헬스장. 트레드밀 순서 | 손님 | #9 Do you mind · #3 I was about to | Are you almost done? (사용) |
| 32 | 소연 새벽 출근 뒤 혼자 조식 | 직원 | #7 Can I get · #16 There's | |
| 33 | TSA 보안. 노트북·신발 | 직원 | #2 I'm supposed to · #23 You don't have to | |
| 34 | 게이트 변경·지연 | 직원 | #14 It looks like · #26 I'll let you know | How long will it take? (1편 #101) · It might take a while. (1편 #102) |
| 35 | 기내 옆자리. 한국 처음 가는 미국인에게 서울 추천 | 승객 | #12 I think you should · #24 You might want to | You'll love it. (2편 #46) |

### 해외 III — 런던 (10편)

| # | 사건 | 상대 | 닻 | 모두영어 |
|---|---|---|---|---|
| 36 | 히스로. 전자게이트 실패 → 대면. 심사관이 빨리 말해 두 번 되묻는다 | 심사관 | #10 I'm not sure if · #4 I'm here to | |
| 37 | 컨택리스로 지하철 되나 | 직원 | #8 Can you · #25 It depends on | |
| 38 | 펍. 바텐더의 빠른 질문을 되묻고, 현지 에일 한 잔만(규칙) | 바텐더 | #7 Can I get · #17 I'd like to | |
| 39 | 비 날씨 스몰토크 | 손님 | #14 It looks like · #15 It sounds like | |
| 40 | 식당. 주문과 다른 음식이 나오고 계산에 한 잔 더 찍힘 | 직원 | #11 I don't think · #27 I didn't mean to | |
| 41 | 크루 호텔 조식. 소연 새벽 브리핑 | 직원 | #7 Can I get · #6 Let me | |
| 42 | 소연의 영국인 동료와 산책. 서울 얘기 | 동료 | #5 I've been · #28 I can't wait to | It's been ages. (사용) · I've heard a lot about you. (1편 #296) |
| 43 | 약국. 소연 안약이 떨어졌는데 약 이름을 몰라 증상과 용도로 설명 | 약사 | #4 I'm here to · #18 I need you to | |
| 44 | 시차·수면 스몰토크 | 동료 | #13 It feels like · #1 I'm trying to | I haven't been sleeping. (사용) |
| 45 | 게이트 안내방송을 못 알아들음. 직원에게 다시 확인 | 직원 | #10 I'm not sure if · #3 I was about to | |

### 해외 IV — 베트남 가족 여행 (5편, 부모님 모시고)

| # | 사건 | 상대 | 닻 | 모두영어 |
|---|---|---|---|---|
| 46 | 가이드. 부모님 걸음에 맞춰 천천히 | 가이드 | #20 I was wondering if · #17 I'd like to | |
| 47 | 식당. 부모님 못 먹는 것 | 직원 | #23 You don't have to · #11 I don't think | |
| 48 | 시장. 아버지 선물 | 상인 | #12 I think you should · #10 I'm not sure if | |
| 49 | 호텔. 부모님 방을 같은 층으로 | 직원 | #18 I need you to · #8 Can you | |
| 50 | 베트남 입국심사. 부모님 대신 답하기 | 심사관 | #4 I'm here to · #9 Do you mind | |

### 한국 I — 헬스장 Liam (12편)

| # | 사건 | 상대 | 닻 | 모두영어 |
|---|---|---|---|---|
| 51 | 첫 만남. 트레드밀 옆, 러닝 5분 | Liam | #1 I'm trying to · #5 I've been | I've been working out. (사용) · Have you lost weight? (1편 #55) |
| 52 | 나이. 50 → 그래서 러닝 먼저 | Liam | #29 That's why · #22 As far as I know | How old do I look? (사용) · You look so young. (1편 #321) |
| 53 | 스쿼트 자세 → 허리 다친 얘기 | Liam | #13 It feels like · #24 You might want to | |
| 54 | 트레드밀 30분 목표 | Liam | #1 I'm trying to · #26 I'll let you know | We have a long way to go. (1편 #181) |
| 55 | 맥주 한 병 규칙 vs Liam 의 소주 | Liam | #21 The thing is · #11 I don't think | Do you want to grab a drink? (사용) · I'm on a diet. (1편 #52) |
| 56 | 과음 다음 날 결석 | Liam | #27 I didn't mean to · #3 I was about to | Why didn't you call me? (1편 #93) |
| 57 | Liam 이 운동앱 물어봄 | Liam | #16 There's · #6 Let me | Let me show you something. (사용) |
| 58 | Liam 부상 → 병원 추천 | Liam | #12 I think you should · #14 It looks like | You should get some rest. (1편 #148) |
| 59 | 재등록 70만원 얘기 | Liam | #25 It depends on · #10 I'm not sure if | It's up to you. (1편 #178) |
| 60 | Liam 휴가 다녀옴 | Liam | #28 I can't wait to · #20 I was wondering if | How did it go? (사용) · Where have you been? (2편 #51) |
| 61 | 주말. 아내 비행 → 혼자 | Liam | #2 I'm supposed to · #23 You don't have to | I don't have any plans. (1편 #154) |
| 62 | 며칠 빠진 지오. 운동 안 가면 기분 가라앉음 | Liam | #15 It sounds like · #29 That's why | You look a little down. (1편 #261) |

### 한국 II — 이웃 Emma (10편)

| # | 사건 | 상대 | 닻 | 모두영어 |
|---|---|---|---|---|
| 63 | 이사 인사. 위층, 고양이 둘 | Emma | #16 There's · #19 I just wanted to | It's nice to finally meet you. (1편 #295) |
| 64 | 화재경보기 3시간. 아래층 공사 | Emma | #22 As far as I know · #9 Do you mind | I'm sick of it. (사용) |
| 65 | 나니 얘기. 시력, 소리에 민감 | Emma | #29 That's why · #13 It feels like | |
| 66 | 택배 대신 받아 주기 | Emma | #6 Let me · #26 I'll let you know | Leave it to me. (사용) |
| 67 | 위층 세탁기 소음 사과 | Emma | #27 I didn't mean to · #11 I don't think | No harm done. (사용) · It's no big deal. (1편 #6) |
| 68 | 워커힐 김치 나눔 | Emma | #24 You might want to · #17 I'd like to | I thought you'd like it. (1편 #186) |
| 69 | 고양이 병원 추천 | Emma | #12 I think you should · #10 I'm not sure if | |
| 70 | 엘리베이터. 새벽 출근 소연 마주친 얘기 | Emma | #2 I'm supposed to · #5 I've been | You must be tired. (사용) |
| 71 | 집 보여주기. 새 세탁기·캣타워 | Emma | #16 There's · #28 I can't wait to | I can't get enough of it. (사용) |
| 72 | 천호 이사 계획 | Emma | #21 The thing is · #25 It depends on | I haven't decided yet. (사용) |

### 한국 III — 카페 Tom (8편)

| # | 사건 | 상대 | 닻 | 모두영어 |
|---|---|---|---|---|
| 73 | 아침 커피. 디카페인, 줄이는 중 | Tom | #7 Can I get · #1 I'm trying to | Can I get a coffee? (2편 #74) |
| 74 | 비 오는 날 | Tom | #14 It looks like · #15 It sounds like | |
| 75 | 동네 맛집 추천(보쌈·감자탕) | Tom | #12 I think you should · #29 That's why | I highly recommend it. (2편 #40) |
| 76 | 노트북. 뭐 만드냐 → 앱 | Tom | #16 There's · #21 The thing is | |
| 77 | 주말. 아내 비행 | Tom | #2 I'm supposed to · #3 I was about to | I'm off today. (1편 #152) |
| 78 | Tom 호주 귀향 휴가 | Tom | #28 I can't wait to · #26 I'll let you know | Are you all set? (2편 #153) |
| 79 | 계산 착오 | Tom | #11 I don't think · #27 I didn't mean to | It's no big deal. (1편 #6) |
| 80 | 방콕 다녀와 오랜만에 | Tom | #5 I've been · #20 I was wondering if | It's been a while. (사용) · Where have you been? (2편 #51) |

### 한국 IV — 소연 동료 Sarah (8편, 집 방문·시내)

| # | 사건 | 상대 | 닻 | 모두영어 |
|---|---|---|---|---|
| 81 | 집 방문. 소연 요리 기다리며 | Sarah | #7 Can I get · #16 There's | |
| 82 | 소연 새벽 출근, 지오 못 잠 | Sarah | #5 I've been · #13 It feels like | I haven't been sleeping. (사용) |
| 83 | 라스베가스 노선 얘기 | Sarah | #22 As far as I know · #25 It depends on | |
| 84 | 나니 소개 | Sarah | #29 That's why · #23 You don't have to | |
| 85 | 소연 감기 걱정 | Sarah | #15 It sounds like · #12 I think you should | I hope everything's okay. (1편 #108) |
| 86 | 앱 보여주기 → 써 보기 | Sarah | #20 I was wondering if · #26 I'll let you know | Let me know what you think. (2편 #104) |
| 87 | 결혼기념일 선물 상담 | Sarah | #10 I'm not sure if · #28 I can't wait to | It means a lot to me. (사용) |
| 88 | Sarah 전근 송별 | Sarah | #19 I just wanted to · #3 I was about to | Let's keep in touch. (사용) · I'll miss you? → I've missed you. (1편 #18) |

### 한국 V — 여행객 (12편, 일회성)

| # | 사건 | 상대 | 닻 | 모두영어 |
|---|---|---|---|---|
| 89 | 공항철도 홍대입구. 구글맵 도보 안 됨 → 네이버맵 | 여행객 | #24 You might want to · #16 There's | |
| 90 | 2호선 환승 | 여행객 | #12 I think you should · #22 As far as I know | |
| 91 | 홍대 식당 추천, 줄 안 서는 시간 | 여행객 | #12 I think you should · #25 It depends on | |
| 92 | 길 안내하다 같이 걸어 줌 | 여행객 | #6 Let me · #23 You don't have to | |
| 93 | 사진 찍어 주기 | 여행객 | #6 Let me · #9 Do you mind | |
| 94 | 교통카드 충전 | 여행객 | #6 Let me · #24 You might want to | |
| 95 | 약국 안내(감기) | 여행객 | #16 There's · #15 It sounds like | |
| 96 | 계단에서 짐 | 여행객 | #6 Let me · #3 I was about to | |
| 97 | 비 오는 날 우산 | 여행객 | #23 You don't have to · #26 I'll let you know | |
| 98 | 공항 가는 법(첫차·직통) | 여행객 | #25 It depends on · #2 I'm supposed to | |
| 99 | 여행객이 영어 칭찬 → 공부 중 | 여행객 | #5 I've been · #1 I'm trying to | You're really good at this. (1편 #223) |
| 100 | 헬스장 앞에서 길 묻는 여행객, Liam 도 나옴 | 여행객 | #14 It looks like · #16 There's | |

## 4. 닻 문형 분포

§3 표의 닻 200개(장면 100 × 2). 30패턴 30종 전부 3회 이상. (아래 §6 명령으로 다시 셀 수 있다.)

| 회수 | 문형 |
|---|---|
| 11 | #16 There's |
| 9 | #7 Can I get · #10 I'm not sure if · #25 It depends on |
| 8 | #4 I'm here to · #5 I've been · #12 I think you should · #14 It looks like · #23 You don't have to · #29 That's why |
| 7 | #1 I'm trying to · #2 I'm supposed to · #3 I was about to · #6 Let me · #11 I don't think · #26 I'll let you know · #27 I didn't mean to |
| 6 | #9 Do you mind · #13 It feels like · #15 It sounds like · #20 I was wondering if · #24 You might want to · #28 I can't wait to |
| 5 | #8 Can you · #21 The thing is · #22 As far as I know |
| 4 | #17 I'd like to · #18 I need you to |
| 3 | #19 I just wanted to · #30 That's what I mean |

1·2묶음에서 못 쓴 #2·#4·#18·#20·#30 은 7·8·4·6·3회. 모두영어 후보가 적힌 행은 50편이고, 그중 35편이 반복 인물(Liam·Emma·Tom·Sarah·May) 장면이다 — 아는 사이의 말이 대부분인 모두영어가 들어갈 자리는 반복 인물이 만든다.

## 5. 시행 순서

1. **도구 수정 (test-first)**: `verify-draft.mjs` 의 src 게이트는 장면에 `date` 가 있을 때만 날짜 접두를 검사하고, 없으면 `src` 존재만 검사한다. `check-sources.mjs` 의 등급을 새 순위로 다시 매긴다 — a = 30패턴이 든 모두영어 그대로, b = 30패턴 자작, c = 모두영어 그대로(30패턴 아님), d = 233. 지오 줄 중 반응형 문장 수를 세어 편당 2를 넘으면 경고한다. 초안 JSON 에 `cast`(상대 이름·TTS 화자)와 `series`(시리즈·회차) 필드를 둔다.
2. **3묶음 = 2묶음 교체.** 시작하지 않은 `en-personal-2026-09-30..10-09` 10편을 이 표로 다시 써서 같은 날짜로 올린다(로더 순서 유지, 옛 카드 id 삭제). 구성은 방콕 1~6편(출발 카운터 → 기내 Sarah → 옆자리 → 입국심사 → 그랩 → May 체크인)에 한국 인물 첫 만남 4편(51 Liam · 63 Emma · 73 Tom · 89 여행객)을 섞어, 열 편 안에서 시리즈 연속성과 인물 소개가 함께 되게 한다. 1묶음 미시작 8편(소연 대화)은 그대로 둔다.
3. 3묶음을 휴대폰에서 써 본 뒤 4묶음부터 10~20편씩. 방콕 나머지 → Liam·Emma 초반 → 라스베가스 → … 순으로 시리즈를 번갈아 진행한다. 표는 계획이므로 쓰면서 장면을 바꿔도 되고, 바뀐 것은 여기에 반영한다.

## 6. 분포 세는 법

```bash
grep -oE '#[0-9]+ ' ~/apps/study/docs/2026-09-26-dialogue-scene-allocation.md | sort | uniq -c | sort -k2 -t'#' -n
```
