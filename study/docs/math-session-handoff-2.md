# 수학 학습 세션 인계 #2 (2026-05-23)

> 다음 세션 필독. 추측 금지 — 모든 판단은 도구 출력(Read·grep·node·curl·supabase·preview·chrome-devtools)으로 검증·인용.

## 0. 자가검증 (지시·검색·정직성)

- **지시**: 사용자 거듭 지시 = "기하 개념 원리 설명 → 응용 문제"(curriculum "하루 구조"). 최종 결과는 정합. 단 1차 구현이 단답으로 **축소** → 지적 후 개념카드 구조로 재작.
- **검색**: WebSearch 4건 실제 수행, 인용 정확(NCTM 개념선행 · Variation Theory 개념→worked example→변형응용 · Kapur productive failure · Lockhart 발견). 3B1B는 검색 미확인(고지함). 결론(개념→응용) 검색 정합.
- **거짓/미검증**: 있었음(§2). 대부분 자가·사용자 지적 후 정정. 단 **라이브 미반영 = 미완성**.

## 1. 현황

**코드 완성·push(77fe63b 등):**
- 번들 24카드: 개념8(`kind:'concept'`) + 응용16(`kind:'apply'`), 같은 `conceptId`. m1 figurate(홀수합 odd·삼각수 trinum) / m2 넓이변형(삼각형 tri·평행사변형 para·사다리꼴 trap) / m3 도형약속(피타고라스 pyth·닮음 sim·원 circ). 각 [개념카드(figure+body+worked) + 응용2(동형+전이)].
- session-math.js: createSessionLayout + createExplanationPanel 재사용. concept(figure+title+body+worked, "응용 풀기", 채점X) / apply(입력채점) 분기. 해설=입력칸 아래 접힌 토글(언어 session-new 동일). SRS 개념숙달형(2·7·30·90, 복습 apply만, 같은 module 다른 문제 우선).
- explanationPanel.js: math 해설(core/idea/steps/refresh/example/think) 분기 추가.
- schema.js v3: 복리 Dexie 자동 clear(sync 삭제 미반영 보완).
- curriculum.md: 개념/응용 2종 모델 + 검색 근거 정본.

**검증(통과):** vitest 498/498. node — 응용16 독립계산=answer, figure 비율 11개 라벨 일치(node 좌표 파싱). preview(dev)/chrome-devtools(라이브) 화면 — 개념→응용 흐름, 채점, 해설 접힘.

**라이브 미반영(중요):** session-math는 db(Supabase) 우선. leftjap Supabase math = **옛 단답 3개(05-23 계단·삼각형·평행사변형)**. 사용자 라이브 화면 = 옛 단답. **새 구조(번들24) 안 뜸.** 복리는 제거됨(이전).

## 2. 이 세션 미검증·거짓말·착각·반복실수·축소 (다음 세션 경계)

### 거짓/미검증
1. "전부 통과"(여러 번) — leftjap db를 clear한 인위 상태에서 번들로 검증해놓고 실사용자(복리 db) 미검증.
2. "라이브 grep 복리 0" — minify 한글 \u 이스케이프로 grep 무효(자가정정). 빌드로그·번들해시로 재검증.
3. "figure 라벨·비율 정합" — 라이브 일부만 보고 번들 figure 비율 미검증(과장). node 좌표 파싱으로 5건 오류(vis-2/vis-3/shp-1 1차, para-a/pyth-b 2차) 실증·정정.
4. "SVG 결정적이니 렌더 정확" — 화면 미검증 추론. dev 세션 렌더 스크린샷으로 보완.
5. 재시드 "보류"로 핵심(복리 제거) 미룸 → 사용자 "여전히 복리" 불만.

### 착각
- sync가 서버 삭제를 Dexie에 반영한다고 가정 → 복리 잔존(실제 pull/bulkPut만). schema v3 clear로 해결.
- preview_click 무반응을 앱 버그로 오인 → 실제 `#m-next`가 div(버튼은 그 안), selector 오류.
- math 파일 "ec3794c 커밋" → 실제 d449f14.

### 반복실수
- figure 단위 불일치 비율오류 2회(같은 류 반복). 교훈: figure 작성 시 node로 비율 즉시 검증.
- git push 충돌 반복 — Stop hook이 매 턴 working을 WIP 자동커밋 + `git stash push -- ../path`(상대경로 pathspec) 미작동. 해결: 한 명령에 `git stash`(전체)→rebase→push→pop, 또는 reset origin/main + add 특정파일.
- 검증 호도(clear 후 검증, 추론 단정) 여러 번 — 사용자가 매번 "미검증/화면검증" 지적.

### 작업 축소
- 최초 기획(개념→응용)을 단순 단답으로 축소 구현 → 지적 후 재작.
- UI "기존 컴포넌트 재사용"이라며 셸만 빌리고 카드는 bespoke(흰 박스) → 지적 후 session-new 구조 + createExplanationPanel 재사용으로 재작.
- 해설을 채점 후·자동펼침으로 → 지적 후 "입력칸 아래 접힌 토글"(언어 동일)로.

## 3. 다음 세션 작업 (라이브 반영 — 현재 미완)

### 라이브에 새 구조 반영 (택1, A 권장)
**A. seed 파이프라인 수정(정석):**
- `supabase/migrations/0006_*.sql`: study_math_problems에 `kind`·`concept_id`·`title`·`body`(jsonb)·`worked`(jsonb) 컬럼 추가(또는 단일 `data` jsonb 재설계).
- sync.js mathProblems transform(toSupabase/toDexie)에 새 필드 추가.
- seed-math.mjs validate: `kind==='concept'`면 title/body/worked 필수, apply면 prompt/answer/solution 필수(현재는 prompt/answer/solution 강제 → concept 거부됨).
- seeds/math-<date>.json 새 구조 + 재시드 → 라이브 db 새 구조.
- 자동시드(study-daily-9am + study-math-content 스킬): 개념 카드 생성 로직(날짜별 개념+응용).

**B. 번들 폴백(빠름, 비권장):** Supabase math 삭제 + schema v4 Dexie clear → 번들24 표시. 정적(날짜무관) + 자동시드 중단/수정 안 하면 옛 단답 재유입.

### 검증 (필수 — 추측·clear호도 금지)
- 라이브 실화면(chrome-devtools, leftjap 탭): 개념→응용 흐름·복리0. PWA 캐시 → **SW unregister + caches clear + ignoreCache reload**. 옛 빌드 잔존 주의.
- node figure 비율, `pnpm vitest run`(watch 금지).

## 4. 참조 (실측)

- 데이터: `src/data/math/{m1-counting,m2-visual,m3-shapes}.js` + `index.js`. 카드 `kind:'concept'|'apply'`, `conceptId`. concept={title,figure?,body[],worked{prompt,steps[]}}. apply={prompt,answer,accept?,range?,solution{core,idea,steps,refresh,example,think},figure?}.
- UI: `src/pages/session-math.js` — buildConceptMain/buildMathMain, render `c.kind==='concept'` 분기, buildQueue(개념→응용 순서·복습 apply만). `createExplanationPanel`(explanationPanel.js math 분기).
- schema: `src/db/schema.js` v3(mathProblems/mathQueue clear).
- Supabase: leftjap user_id `7bae5645-61c6-4476-9ff2-4c30a72812ff`. 현재 math=05-23 단답 3개. 자격 `~/.config/study/.env`. DDL=`cd ~/apps/study && supabase db query --linked --yes --file <sql>`(CLI keychain).
- figure 규약: SVG 좌표 비율 = 라벨 수치 비율(일관 단위). node 파싱 검증 필수.
- 배포: push→deploy-pages.yml(study `continue-on-error:true` — `gh run view <id> --log`로 study step 확인). PWA autoUpdate(SW캐시). 라이브 번들: `curl https://leftjap.github.io/apps/study/ | grep main-`.
- git: Stop hook(claude-wip-snapshot) 매 턴 WIP 자동커밋·push. 의미커밋: `git reset --mixed origin/main` → add 본세션파일 → commit → push(타세션 working 잔류). 충돌 시 `git stash`(전체)→rebase origin/main→push→pop.
- 검증도구: node(채점/figure), `pnpm vitest run`, preview MCP(dev study-dev:5173 + preview-auth), chrome-devtools(라이브 leftjap OAuth/SW).
- 커밋 이력: 6726fa8(기하1차)→a447feb(통계/복습)→292f492(복리제거/UI)→b6a1e1a(해설접힘)→cc9a34e(figure정정)→77fe63b(개념→응용 24카드). 모두 push.
