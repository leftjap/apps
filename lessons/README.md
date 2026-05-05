# ~/apps/lessons/

환경 함정 lesson 모음. 각 파일 = 한 topic.

## 자동 로드 X

`CLAUDE.md` 에 `@import` 안 함. 필요 시 Claude 가 Read 툴로 직접 읽음. 토큰 비용 0 (선택적 로드).

## 분류

- `happy-dom-image-api-limits.md` — vitest 단위 테스트 사각지대 (`createImageBitmap` / `canvas.toDataURL` / `ClipboardItem` 미지원). Today Wave 11.7~11.9.2 잠재 회귀 노출 케이스
- `chrome-devtools-mcp-autoconnect.md` — chrome-devtools MCP 의 Chrome 146+ autoConnect 모드. 별 chrome 인스턴스 대신 사용자 chrome (또는 별 profile) 에 attach → OAuth 세션 공유 → PWA 통합 검증 자동화. 셋업 + 보안 + 격리 권장
- `hooks-supplementary-2026-05-04.md` — GitHub 접근 차단 hook 승격 + verify-spec 외부 분석 axis 통합 + verify-claims false positive 박제. 텍스트 규칙↔hook 강제력 비대칭 / fetch-pull mutation 분리 / ALLOW_GH early return 위치 / 정규식 hook shell semantic 한계
- `verification-layer-mismatch.md` — 단일 layer 검증으로 다른 layer "정합/해소/동작/사용자 입장 검증" 단정 = 거짓. 6건 거짓말 사례 분류 (preview .click() / Bash head 잘림 / Edit 후 라인 추정 / OAuth 세션 미공유 / 테스트 통과 = spec 정합 단정). 글로벌 `~/.claude/CLAUDE.md` axis I 본문

## 작성 규칙

- 한 파일 = 한 topic
- 머리: 발생 wave / 환경 / 한 줄 요약
- 본문: Why (근본 원인) + How to avoid (구체 명령어·패턴) + 검증 (재발 시 사인)
- 200줄 이하. 초과 시 sub-topic 분리

## 트리거

환경·명령어·빌드·tooling 함정 발견 시 즉시 신규 파일 생성. 분류 규칙 = `~/apps/memory.md` "## 실수 재발 방지" 참조.

## 인용 패턴

`CLAUDE.md` 에서 참조 시:
```
**pnpm 10 함정**: `~/apps/lessons/pnpm-electron.md` 참조
```

`@import` 형태 (`@~/apps/lessons/X.md`) 금지 — auto-load 시 토큰 절감 효과 무효화.

<!-- LESSON_INDEX_BEGIN (auto-generated) -->

## 인덱스 (자동 생성 — 수동 편집 금지)

각 lesson 첫 줄 `<!-- trigger: ... | match-paths: ... -->` 주석에서 추출.
재생성: `bash ~/apps/scripts/regenerate-lesson-index.sh`

| lesson | trigger 키워드 | match-paths (glob) |
|---|---|---|
| `azure-speech-sdk-mic-silent.md` | azure,speech,microphone,mic,silent,SDK,getUserMedia,SpeechRecognizer | src/services/speech*.js,src/features/voice*.js,src/features/study/listening*.js |
| `chrome-devtools-mcp-autoconnect.md` | chrome-devtools,MCP,autoConnect,attach,OAuth 세션,별 chrome,debugging chrome,통합 검증 | - |
| `happy-dom-image-api-limits.md` | happy-dom,createImageBitmap,canvas,toDataURL,ClipboardItem,vitest 이미지,image API,jsdom,압축 | src/features/*image*.js,src/features/*editor*.test.js,src/features/entries.test.js |
| `hooks-supplementary-2026-05-04.md` | hook,settings.json,verify-claims,GitHub 차단,PreToolUse,Stop hook,UserPromptSubmit,checklist-required | .claude/settings.json,.claude/hooks/*.sh,scripts/*hook*.sh |
| `import-acceptance-not-db-only.md` | import,migration,seed,bulk-update,acceptance,더미,실 데이터,교체,더미 제거,데이터 들어갔,upsert,backfill | scripts/import-*.js,scripts/migration-*.js,scripts/seed-*.js,scripts/verify-import*.js,src/main.js,src/features/*.js,src/features/*.test.js,src/db/sync.js,src/db/devSeed.js,mocks/*.html,STATUS.md |
| `supabase-select-default-1000-limit.md` | supabase,pagination,select,1000,row,limit,head:true,count:exact,truncation | src/db/sync.js,src/db/queries.js,scripts/import-*.js,scripts/verify-*.js |
| `verification-layer-mismatch.md` | layer,검증,단정,통과,화면,사용자 입장,evidence,acceptance,vitest 통과,e2e 통과,사각 | - |

<!-- LESSON_INDEX_END -->
