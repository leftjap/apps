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
- en (⭐ RealClass-mining, 2026-06-08 전환): **1세션 = 1장면** — scene 카드 1장 (`order_index: 0`, explanation = `sceneTitle/sceneSummary/dialogue:[{speaker,en,ko}]` 6~10줄) + 표현 카드 5~7장 (explanation = `key/situation/drills:[{en,ko,kr}]/grammar/chunks/phonemes/mistake/similar` + `category/frequency` — 한국인 해설 8필드, 2026-06-10 발음·문법 복원). 형식 정본 = [en-2026-06-10.json](./en-2026-06-10.json) (구 형식 참고 = en-parks-s1e1.json). 소스 = `sources/realclass-parks-s1e1.txt` (gitignored — 유료 콘텐츠 전문 커밋 금지, 발췌만 커밋). 콩트 형식 (skit 메타) 은 5/29 이전 시드 잔존분 — 신규 사용 금지

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
- `--dry-run` 시 SELECT 만 수행
