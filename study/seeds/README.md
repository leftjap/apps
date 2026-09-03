# Study Seed Payloads

`study_today_lessons` Supabase INSERT 용 콘텐츠 payload JSON.

## 형식

```json
{
  "lang": "ja" | "en",
  "date": "YYYY-MM-DD",
  "cards": [
    {
      "id": "<lang>-<date>-<idx>",
      "sentence": "...",
      "meaning": "...",
      "reading": "..." (ja 만, en 은 null),
      "phonetic_kr": "...",
      "explanation": { ... },
      "order_index": 1
    },
    ...
  ]
}
```

`explanation` 스키마:
- ja: 4필드 (whenToUse/grammar/pronPoints/similar) + 메타 5필드 (stage/newElements/knownElements/frequency/category) — 콩트 단위
- en (⭐ RealClass-mining): **규칙 정본 = [가이드 §6.3](../docs/lesson-explanation-guide-en.md) 단일** (1세션=1장면 · scene+표현 카드 · 8필드 · `_source` 의무 — 여기 재서술 금지, SSOT 2026-06-10). 형식 예시 = [en-2026-06-10-2.json](./en-2026-06-10-2.json). 기계 게이트 = `scripts/validate-seed.mjs` (INSERT 전 자동). 콩트 형식 (skit 메타) 은 5/29 이전 시드 잔존분 — 신규 사용 금지

정본: `~/apps/study/docs/lesson-explanation-guide-{ja,en}.md` (en 활성 = §6.3) + `explanation-schema.md`

## 트리거

```bash
# 1. payload commit + push
git add seeds/ja-2026-05-04.json
git commit -m "seed(study): ja 2026-05-04 (10건)"
git push

# 2. workflow 실행
gh workflow run study-seed-supabase.yml \
  --field payload=seeds/ja-2026-05-04.json \
  --field user_id=<UUID> \
  --field dry_run=false

# 3. 결과 확인
gh run list --workflow=study-seed-supabase.yml --limit 1
gh run view --log
```

## user_id 조회

Supabase Dashboard → Auth → Users → 해당 이메일 → ID 컬럼 (UUID).

## 안전장치

- `cards.length > 50` → script 차단
- `lang ∉ {en, ja}` → script 차단
- `id` 중복 → script 차단
- INSERT 후 SELECT count 일치 검증
- 완료(`completed=true`)된 id 는 날짜와 무관하게 재INSERT 차단 (2026-09-03, `seed-supabase.mjs` id 기준 게이트 — 옛 날짜 파일 재적재로 완료가 풀리던 사고 수정)
- 14일 방치 미완료 자동 삭제는 2026-09-03 폐지 (일괄 적재한 코어100 묶음을 지우던 사고) — 정리는 `expire-stale-lessons.mjs` 수동 실행만
- `--dry-run` 시 SELECT 만 수행
