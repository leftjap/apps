# 피드 큐레이션 루틴 (Claude Code Routines, 주 1회)

> 작업지시서 §4 "엔진". 앱은 `src/data/curation.js` 스냅샷만 읽고(빠른 로딩), 이 루틴이 주 1회 스냅샷을 갱신한다.
> LLM 큐레이션은 **Claude 로컬앱의 루틴즈**가 수행한다 (외부 임베딩 회사·API 미사용 — Claude 가 직접 읽고 판단).

## 스케줄
- 매주 일요일 21:00 (권장). Claude 로컬앱 Routines 에 등록.

## 루틴이 매주 수행하는 작업

1. **어구록 읽기** — `book_quotes`(geo-apps Supabase) 전체를 읽는다.
   - 인증: `~/.config/study/.env` 의 `SUPABASE_SERVICE_ROLE_KEY` (RLS 우회, 읽기 전용) 또는 로그인 세션.
   - 신규 + 기존 모두 대상. soft-deleted(`deleted_at`) 제외.

2. **같은 단어 (키워드 클러스터)** — 2권 이상 책에서 충분히(≥4회) 등장하는 의미 키워드 6개 선별.
   - 각 키워드: 총 등장수 · 등장 책수 · 대표 어구록 id 6개(서로 다른 책 우선).

3. **AI의 발견 (메아리)** — 서로 다른 책의 어구록 중 **의미적으로 통하는 쌍** 2~3개.
   - 각 쌍: `keyword`(닿는 지점) · `note`(왜 닿는지 한 문장) · 어구록 id 둘(반드시 다른 책).
   - 임베딩 아님 — Claude 가 본문을 읽고 주제적 공명을 판단.

4. **스냅샷 기록** — `book/src/data/curation.js` 를 갱신한다.
   ```js
   export const CURATION = {
     generatedAt: 'YYYY-MM-DD',
     clusters: [{ word, count, books, quotes: [quoteId, ...] }, ...],  // 6
     echoes:   [{ keyword, note, a: quoteId, b: quoteId }, ...],        // 2~3, a/b 다른 책
   };
   ```
   - **quote id 만 저장** (본문은 앱이 자기 데이터에서 resolve — 스냅샷에 본문·PII 미포함).

5. **검증 + 배포** — `cd book && pnpm build` 통과 확인 후 Conventional Commit + `git push origin main` (GitHub Actions 자동 배포).

## 앱 연동 (구현 완료)
- `src/features/feed.js` 가 `CURATION` 을 읽어 **AI의 발견**(좌·우 + ≈) · **같은 단어**(키워드 탭) 섹션을 렌더.
- 스냅샷이 비거나 quote id 가 현재 데이터에 없으면 해당 섹션/항목은 자동 숨김 (graceful).

## 초기 시드
- 2026-05-30, 어구록 987개 기준으로 1회 생성 (클러스터 6 + 메아리 3). 이후 이 루틴이 주간 갱신.
