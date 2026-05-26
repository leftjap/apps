# Today — 오늘의내비 PWA

> 4앱 공통 룰은 `~/apps/CLAUDE.md` 참조. 본 파일은 Today 앱 전용.

## 도메인

글 + 댓글 시스템.

## 설계 원칙

| ID | 내용 |
|---|---|
| F-01 | 댓글: 매 단락에 글과 관련된 추가 정보를 연결 |

## 스펙

- 앱 스펙: `~/apps/today/specs/today-app-spec.md` (착수 Wave 에서 작성)
- 프로토타입 우선 적용 여부: 착수 시 재결정 (`~/apps/CLAUDE.md` PWA 가이드 참조)

## 관련 스킬

`supabase-pattern` — `src/db/sync.js`·`schema.js`·`auth.js` 수정 시.

## SMS 카드 결제 ingest

`specs/sms-ingest-pipeline.md` 참조 — 단축어 spec, iOS 한계, launchd backfill, Edge Function API, 디버깅 절차 모두 거기.

**카드 정보(발신번호·친화명·채널·자동화 매핑)는 spec의 "카드·발신번호 마스터" 섹션이 single source of truth.** 매번 사용자에 묻거나 chat.db 쿼리 금지. 카드 추가/변경 시 (1) 마스터 테이블, (2) `_shared/cardSmsParser.js`의 `CARD_ALIASES`, (3) 자동화 트리거 섹션 셋 다 한 commit으로 갱신.
