# Today: 오늘의내비 PWA

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

`supabase-pattern`: `src/db/sync.js`·`schema.js`·`src/services/auth.js` 수정 시.

## 오늘의 네비 자동 댓글

- 실행: `scripts/navi-realtime-daemon.mjs`, 맥 launchd `com.gio.navi-realtime-daemon` (맥 실행·로그인·네트워크 필요).
- 지오 `navi`·소연 `soyoun_navi` 공유 글: 마지막 수정 후 1시간. Realtime + 5분 재검색, 최근 3일 미답 글 재포착. 사람 대댓글에는 정착 대기 없음.
- Claude 고정 모델 → `opus` 재시도 후에도 생성 실패·빈 초안·팩트 보류면 ChatGPT 로그인된 Codex CLI의 `gpt-6.1-sol`로 초안부터 재작성·팩트 검증. 팩트 실패 시 미게시, 톤은 권고.
- 기존 봇 author UUID는 알림·UI 호환을 위해 유지. Sol 댓글 본문은 `[GPT‑6.1 Sol]`로 시작하며 작성자 헤더는 기존 `클로드`로 표시된다.
- 생성 전·등록 직전에 글/댓글 상태 재확인, 삭제한 봇 댓글은 복구하지 않음. 동일 글/대댓글 대상은 결정적 댓글 ID로 데몬 간 중복 등록 방지. 별도 Claude 클라우드 루틴과의 동시 등록은 최종 재조회로 줄이지만 DB 트랜잭션으로 묶이지는 않음.
- 검증: `pnpm test scripts/navi-realtime-daemon.test.js scripts/navi-pending.test.js scripts/navi-verify.test.js`. 게시 없는 실제 시험: `node scripts/navi-realtime-daemon.mjs --once <entry_id> --dry-run` (수동 단발만 1시간 대기 생략).
- 자격증명은 기존 `today/.env.local`, `~/.config/navi-daemon/oauth-token`, Codex 로그인 사용. Sol 프로세스에 DB 키·Claude 토큰을 전달하지 않음.

## SMS 카드 결제 ingest

`specs/sms-ingest-pipeline.md` 참조: 단축어 spec, iOS 한계, launchd backfill, Edge Function API, 디버깅 절차 모두 거기.

**카드 정보(발신번호·친화명·채널·자동화 매핑)는 spec의 "카드·발신번호 마스터" 섹션이 single source of truth.** 매번 사용자에 묻거나 chat.db 쿼리 금지. 카드 추가/변경 시 (1) 마스터 테이블, (2) `_shared/cardSmsParser.js`의 `CARD_ALIASES`, (3) 자동화 트리거 섹션, (4) 필요 시 `scripts/backfill-sms-from-chatdb.py`의 SQL 발신번호 필터. 한 commit으로 갱신 (spec "카드·발신번호 마스터" §).
