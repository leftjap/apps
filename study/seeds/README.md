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
- ja: 4필드 (whenToUse/grammar/pronPoints/similar) + 메타 5필드 (stage/newElements/knownElements/frequency/category)
- en: 8필드 (key/situation/grammar 배열/chunks/phonemes/mistake/similar) + 메타 5필드 (drift 영역 — multi-wave 정정 예정)

정본: `~/apps/study/docs/lesson-explanation-guide-{ja,en}.md` + `explanation-schema.md`

## 트리거

```bash
# 1. payload commit + push
git add seeds/ja-2026-05-04.json
git commit -m "seed(study): ja 2026-05-04 (10건)"
git push

# 2. workflow 실행
gh workflow run seed-supabase.yml \
  --field payload=seeds/ja-2026-05-04.json \
  --field user_id=<UUID> \
  --field dry_run=false

# 3. 결과 확인
gh run list --workflow=seed-supabase.yml --limit 1
gh run view --log
```

## user_id 조회

Supabase Dashboard → Auth → Users → 해당 이메일 → ID 컬럼 (UUID).

## 안전장치

- `cards.length > 50` → script 차단
- `lang ∉ {en, ja}` → script 차단
- `id` 중복 → script 차단
- INSERT 후 SELECT count 일치 검증
- `--dry-run` 시 SELECT 만 수행
