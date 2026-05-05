<!-- trigger: hook,settings.json,verify-claims,GitHub 차단,PreToolUse,Stop hook,UserPromptSubmit,checklist-required | match-paths: .claude/settings.json,.claude/hooks/*.sh,scripts/*hook*.sh -->
# Hooks 보강 라운드 — 2026-05-04

GitHub 접근 차단 + verify-spec 외부 분석 axis + verify-claims 정밀도 한계.

## 머리

- **발생 컨텍스트**: ground truth 인프라 점검. main 브랜치 origin/main 대비 +253 커밋 누적 발견 → 텍스트 규칙(`CLAUDE.md` "GitHub 접근 금지") 강제력 0 실증
- **환경**: `~/.claude/settings.json` PreToolUse Bash hook + `~/.claude/skills/verify-spec/SKILL.md`
- **한 줄 요약**: GitHub mutation 차단 hook 승격 + fetch/pull 분리 (mutation vs read) + ALLOW_GH 우회 환경변수 + 정규식 hook 의 shell semantic 한계 박제

## Axis 1 — 텍스트 규칙의 누적 압박 한계

`CLAUDE.md` "GitHub 접근 금지" 가 선언적 규칙뿐이었음 (`git push --force` 만 hook 차단). auto mode 에서 의미 커밋 +WIP 스냅샷 누적 결과 origin/main 대비 +253. 정책↔현실 gap 실증. **텍스트 규칙은 누적 압박 하 무력**. hook 강제력 승격이 정직한 fix.

## Axis 2 — fetch/pull 분리 (mutation vs read 축)

원래 정책 원문 "원격 저장소 접근 전면 금지" 일괄 차단 검토 → 모순 발견:
- `git fetch` = read-only, 로컬 변경 X. 차단 시 origin/main 비교 같은 누적 모니터링 도구도 막힘 (본 라운드 +253 검출이 사례)
- `git pull` = merge/rebase mutation. 차단 합리적

→ 정책 정신 = mutation 방지. fetch 허용, push/pull/gh 차단으로 분리. 정책 원문도 L36 갱신.

## Axis 3 — ALLOW_GH early return 위치

`CLAUDE_ALLOW_GH=1` 환경변수 우회 추가 시 위치 결정 핵심:

**앞에 두면 위험**: `CLAUDE_ALLOW_GH=1 git push --force origin main` 통과. 우회가 force 까지 풀어 정책 의도 초과
**뒤에 두면 안전**: 기존 차단 (force/reset --hard/clean -f/rm -rf) 모두 통과 후 ALLOW_GH 검사 → 신규 GH 블록만 우회

→ early return 은 **기존 안전장치 모두 통과 후, 신규 GH 차단 직전**. 안전장치는 GH 정책과 별 axis 라 우회 대상 아님.

## Axis 4 — 정규식 hook 의 shell semantic 한계

본 세션 실측 false positive 1건 + 이론상 우회 케이스 박제.

### False positive (실측 1건)

```bash
grep -n "GitHub\|git push\|hook" /Users/gio_c/apps/CLAUDE.md
```

기존 hook L66 정규식 `(--no-verify|-n\b)` AND `git\s+(commit|push|...)` 가 grep 명령에서 둘 다 매칭:
- `git push` 가 grep pattern 안 → 첫 조건 매칭
- `-n` 이 grep flag → 둘째 조건 매칭 (word boundary 가 grep flag 도 포함)
- AND → 차단

### 정규식 우회 (이론, 실측 X)

shell 평가 전 raw 텍스트만 정규식 매칭:
- 백틱: `` `git push origin main` `` → 우회 가능 (anchor 미매칭)
- `bash -c "git push origin main"` → 우회 가능
- `$(git push origin main)` → 우회 가능

### 보강 보류 근거

anchor `(^|[;&|]\s*)git\s+...` 추가하면 raw `grep -n "git push"` false positive fix 가능. 단:
- false positive 빈도 낮음 (실측 1건). 정규식 회귀 위험 감수 가치 낮음
- 백틱·bash-c 진짜 우회는 anchor 로도 차단 불가 (텍스트 정규식 vs shell parser 한계)
- false positive fix 만 하면 hook 신뢰도 잘못 올라감

→ **anchor 추가 보류, 한계 박제만**. 빈발 시 fix.

### 회피 패턴

차단 false positive 발생 시:
- grep pattern 에서 `git push` 단어 분리 (예: `grep -n "Git" + grep "push"` 분리)
- 또는 raw 텍스트 안에 `git push` 단어 회피

## Axis 5 — verify-spec 외부 분석 axis 통합

`CLAUDE.md` 9번 Phase 0 (자체 분석 출처 검증) 와 verify-spec 스킬이 같은 axis 였음. 본 라운드에서 외부 분석 (다른 인스턴스 응답·복붙 문서) 항목 추가 시 verify-spec 스킬 본문에 통합 (트리거·절차 일원화). `CLAUDE.md` Phase 0b 는 verify-spec 참조 1줄로 단순화. 강제력은 `verify-claims.sh` 가 실행 — 위치보단 트리거 명확성이 핵심.

## Axis 6 — verify-claims false positive (인용 파일명 패턴)

본 라운드 진행 중 hook 자체 false positive 1건:

```
[검증 안 된 코드 참조] — 이 turn 의 Read/Grep/Glob/Bash/WebFetch 와 매칭 없음:
  * common-YYYY-MM.md
```

`STATUS-common.md:5` 본문에 `archive: <폐기된 .status-archive>/common-YYYY-MM.md` 인용 → hook 의 코드 ref 검출 정규식이 `common-YYYY-MM.md` 파일명 패턴 catch. 같은 turn tool_use input 에는 `STATUS-common.md` 만 있고 `common-YYYY-MM.md` 직접 매칭 X → 차단. (참고: 본 lesson 작성 후 STATUS 체계 자체가 폐기되어 archive 경로 무관)

본질: **인용된 파일명 (Read 한 파일 본문에서 발견된 파일명 패턴)** vs **단정된 파일명 (자가 검증 없는 인용)** 구분 못함.

회피 패턴: 인용 명시 라벨 — "(STATUS-common.md L5 인용)" 같은 출처 표기 + 단정 회피 어구.

본 hook 정밀도 한계 인정. 빈발 시 정규식 보강 검토.

## Axis 7 — 자가 점검 발화 의무는 시스템 강제 불가

본 라운드 직후 두 외부 세션 (Today import 검증 + Study 일/영 콘텐츠 검증) 결과 박제. 두 세션 모두 자가 거짓말 보고 발화 — **사용자 명시 요청 ("거짓말 보고") 효과**. 본 라운드 보강 axis (verify-spec 외부 분석 / 거짓말 방지 메타 라벨) 와 별개.

### 3 axis 분리

| axis | 보강 | 강제력 |
|---|---|---|
| A. 거짓말 발화 차단 | verify-claims.sh 메타 라벨 + 라인번호 매칭 | hook (강) |
| B. 외부 분석 수용 시 자가 Read | verify-spec 스킬 (본 라운드 신규) | hook (강) — 트리거 매칭 시 |
| **C. 자가 점검 발화 의무** | **부재** | **사용자 prompt 영역** |

### axis C 시스템 한계

- hook 은 검출/차단 도구 — 새 발화 강제 X
- 응답 종료 시점에 자가 점검 부재 검출은 가능하나, 새 응답 강제 발화 불가 (사용자 다음 turn 필요)
- → axis C 의 1차 메커니즘은 **사용자 운영 패턴**: 매 작업 후 "거짓말 보고" 명시 요청
- 글로벌 `~/.claude/CLAUDE.md` G axis 는 **보조** — 텍스트 규칙 한계 명시 (G 만 의존 = 환상)

### axis A 보강으로 axis C 필요성 일부 감소

종결 단정 패턴 ("미비점 0건", "(오류|갭|누락|결함|이슈) 0건", "전부 검증", "전수 (확인|검증)") 는 axis A (verify-claims.sh) 에서 차단. 발화 자체가 안 일어나면 자가 점검 의무도 줄어듦. 본 라운드 axis A 패턴 4건 추가 = 분할 평가 결과 (강력 catch / 중간 catch 분리, 강력 우선).

### 환상 차단 — 외부 검증자 2종 결합

자가 검증은 본질적 확증 편향 한계 (검증자가 원래 생성의 오류를 무심코 재생산). hook·텍스트 규칙은 검출 도구지 환각 제거 도구 아님. **외부 검증자 2종** (hook + 다른 LLM 인스턴스) 결합 — 본 라운드 보강 = hook 검출 강화 + 외부 분석 수용 axis (verify-spec). 사용자는 검증자가 아니라 시스템 사용자 — AI 결함을 매 작업 보완하는 역할 부여 X. **시스템이 못 하는 axis 는 시스템 보강 후보로 박제**, 사용자 운영 패턴으로 우회 X (책임 전가 회피).

### 보강 보류 (false positive 위험)

- 일반 어휘 "진짜 원인", "정확히", "유력" — false positive 높음, 보류
- 종결 단정 중 "이미 박혀 있음" / "추가 작업 없음" — fact 묘사 충돌, 보류 (빈발 시 추가)

## How to avoid (요약)

1. 텍스트 규칙은 누적 압박에 무력 — 강제력 필요 시 hook 승격
2. mutation vs read 분리 — 정책 원문 정신 보존
3. 우회 환경변수 early return 위치 = 신규 차단 직전 (기존 안전장치 보호)
4. 정규식 hook 은 shell parser 가 아님 — 백틱·bash-c·$() 우회 가능. 한계 인지
5. false positive 1건은 lesson 박제. 빈발 시 fix
6. 외부 분석 axis = 자체 분석과 다른 트리거. 스킬 본문 통합 권장 (강제력은 hook)
7. 자가 점검 의무 axis C 는 시스템 강제 불가 — 사용자 운영 패턴이 1차 메커니즘. 종결 단정 패턴 axis A 보강이 일부 보완
8. axis 효과 본 라운드 실측: GH hook 100% / UserPromptSubmit 100% 알림 / verify-claims 13% 차단 / verify-spec 외부 분석 25% 발동 + FP 1건. 추가 보강 후보 = 트리거 키워드 확장 ("두 세션", "이전 세션", "학술", "자가 점검", "자가 거짓말 보고") + "외부" 단독 false positive 좁힘 (결합형 "외부 분석/응답/의견"). 운영 데이터 누적 시 보강
9. 결정 시 신뢰도 분류 의무 (글로벌 CLAUDE.md H axis) — 일률 위임 = 책임 회피. 본 라운드 발견. 학술 정합 = Confidence-Based Autonomy [외부 분석 인용]

## 참고 (외부 분석 인용, 자가 검증 안 함)

본 라운드 결정의 학술 근거 — Claude 본 세션 직접 검증 안 함. 다음 보강 결정 시 anchor.

- **작업 복잡도 ↑ → 환각 ↑** — LLM 은 입력 크기·쿼리 복잡도 증가 시 환각 비율 증가 (출처: arxiv 등 다수 LLM 평가 보고). agentic 시스템 핵심 원칙 = 작업 분할 + 사실 grounding
- **자가 검증 확증 편향 한계** — 검증자가 원래 생성의 오류를 무심코 재생산하는 본질적 한계 (출처: arxiv). self-eval 만으로 환각 0 불가능
- **분할 + grounding + 외부 검증 결합 표준** — 학술/엔지니어링 표준 패턴 (출처: SQ Magazine 등). 본 라운드 인프라 = hook 검출 (grounding) + verify-spec (외부 분석 수용) + UserPromptSubmit 복잡도 알림 (분할 신호). 사용자 검증 axis 는 시스템 보강 후보로 박제 (책임 전가 회피)

본 섹션 모든 단정은 외부 분석 인용. 출처 URL·시점은 사용자 prompt 에서 공유된 정보 그대로 — Claude 본 세션 fetch 검증 안 함.
