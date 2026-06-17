# Today — 오늘의내비 PWA

> 4앱 공통 룰은 `~/apps/CLAUDE.md` 참조. 본 파일은 Today 앱 전용.

## 도메인

글(entries)·가계부(expenses)·댓글(comments) + SMS 카드결제 ingest 파이프라인. (코드 규모: entries 2685줄·expenses 2178줄 ≫ comments 576줄)

## 설계 원칙

| ID | 내용 |
|---|---|
| F-01 | 댓글: 매 단락에 글과 관련된 추가 정보를 연결 |

## 스펙

- 앱 스펙: `~/apps/today/specs/today-app-spec.md` (착수 Wave 에서 작성)
- 프로토타입 우선 적용 여부: 착수 시 재결정

## 관련 스킬

`supabase-pattern` — `src/db/sync.js`·`schema.js`·`src/services/auth.js` 수정 시.

## SMS 카드 결제 ingest

`specs/sms-ingest-pipeline.md` 참조 — 단축어 spec, iOS 한계, launchd backfill, Edge Function API, 디버깅 절차 모두 거기.

**카드 정보(발신번호·친화명·채널·자동화 매핑)는 spec의 "카드·발신번호 마스터" 섹션이 single source of truth.** 매번 사용자에 묻거나 chat.db 쿼리 금지. 카드 추가/변경 시 (1) 마스터 테이블, (2) `_shared/cardSmsParser.js`의 `CARD_ALIASES`, (3) 자동화 트리거 섹션, (4) 필요 시 `scripts/backfill-sms-from-chatdb.py`의 SQL 발신번호 필터 — 한 commit으로 갱신 (spec "카드·발신번호 마스터" §).
