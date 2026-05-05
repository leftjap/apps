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
