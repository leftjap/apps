# ~/apps/lessons/

환경 함정 lesson 모음. 각 파일 = 한 topic.

## 자동 로드 X

`CLAUDE.md` 에 `@import` 안 함. 필요 시 Claude 가 Read 툴로 직접 읽음. 토큰 비용 0 (선택적 로드).

## 분류

- `happy-dom-image-api-limits.md` — vitest 단위 테스트 사각지대 (`createImageBitmap` / `canvas.toDataURL` / `ClipboardItem` 미지원). Today Wave 11.7~11.9.2 잠재 회귀 노출 케이스
- `chrome-devtools-mcp-autoconnect.md` — chrome-devtools MCP 의 Chrome 146+ autoConnect 모드. 별 chrome 인스턴스 대신 사용자 chrome (또는 별 profile) 에 attach → OAuth 세션 공유 → PWA 통합 검증 자동화. 셋업 + 보안 + 격리 권장
- `regex-hook-shell-limits.md` — PreToolUse Bash hook 의 substring 매칭 한계. 백틱·`bash -c`·`$()` 우회 / grep·sed pattern 안 차단 키워드 false positive / 회피 패턴 (키워드 분리·인용부호 분할)
- `ios-simulator-web-audio-lock-verification.md` — iOS 시뮬레이터에서 웹·PWA 잠금 중 오디오 재생 정량 검증 절차 (DEVELOPER_DIR 우회·System Events 메뉴·CGEvent 탭·페이지 beacon 로그). 2026-09-06 실측: Safari 탭·홈 화면 앱 모두 잠금 중 반복 재생 유지, 잠금화면 패널 표시. #D 재발 사례
- `verification-layer-mismatch.md` — 단일 layer 검증으로 다른 layer "정합/해소/동작/사용자 입장 검증" 단정 = 거짓. 사례 분류 (preview .click() / Bash head 잘림 / Edit 후 라인 추정 / OAuth 세션 미공유 / 테스트 통과 = spec 정합 단정 / **#C gym 웹 검증 = 네이티브 실기 단정** / **#D 도구 능력 오단정 — Xcode 없음·무선설치 위임**). 글로벌 `~/.claude/CLAUDE.md` axis I 본문

## 작성 규칙

- 한 파일 = 한 topic
- 머리: 발생 wave / 환경 / 한 줄 요약
- 본문: Why (근본 원인) + How to avoid (구체 명령어·패턴) + 검증 (재발 시 사인)
- 200줄 이하. 초과 시 sub-topic 분리

## 트리거

환경·명령어·빌드·tooling 함정 발견 시 즉시 신규 파일 생성. 분류 규칙 = `~/apps/CLAUDE.md` "기록 위치" 참조.

## 인용 패턴

`CLAUDE.md` 에서 참조 시:
```
**hook 함정**: `~/apps/lessons/regex-hook-shell-limits.md` 참조
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
| `github-pages-pwa-path-migration.md` | github-pages,PWA,서브경로,base path,서비스워커,SW,navigateFallback,redirect 스텁,self-destroying,sw.js,캐시,경로 이관 | */vite.config.js,*/public/sw.js |
| `happy-dom-image-api-limits.md` | happy-dom,createImageBitmap,canvas,toDataURL,ClipboardItem,vitest 이미지,image API,jsdom,압축 | src/features/*image*.js,src/features/*editor*.test.js,src/features/entries.test.js |
| `import-acceptance-not-db-only.md` | import,migration,seed,bulk-update,acceptance,더미,실 데이터,교체,더미 제거,데이터 들어갔,upsert,backfill | scripts/import-*.js,scripts/migration-*.js,scripts/seed-*.js,scripts/verify-import*.js,src/main.js,src/features/*.js,src/features/*.test.js,src/db/sync.js,src/db/devSeed.js,mocks/*.html |
| `iphone-safari-pwa-2026.md` | iPhone,Safari,PWA,iOS,Web Push,IndexedDB,SW,Service Worker,manifest,홈 화면,standalone,apple-mobile-web-app-capable,Badge API | */public/manifest.webmanifest,*/index.html,*/sw.js,*/service-worker.js,*/src/db/**,*/src/**/*push* |
| `regex-hook-shell-limits.md` | hook,PreToolUse,regex,substring,false positive,bash -c,백틱,shell parser,차단,Bash freeze | .claude/settings.json,.claude/hooks/*.sh |
| `supabase-migration-management-api.md` | supabase,migration,마이그레이션,db push,management API,대시보드,수동 적용,SQL Editor,히스토리 충돌,CLI | */supabase/migrations/*.sql,*/supabase/config.toml |
| `supabase-select-default-1000-limit.md` | supabase,pagination,select,1000,row,limit,head:true,count:exact,truncation | src/db/sync.js,src/db/queries.js,scripts/import-*.js,scripts/verify-*.js |
| `verification-layer-mismatch.md` | layer,검증,단정,통과,화면,사용자 입장,evidence,acceptance,vitest 통과,e2e 통과,사각,실기기,네이티브,배포,반영,Xcode,무선설치 | - |

<!-- LESSON_INDEX_END -->
