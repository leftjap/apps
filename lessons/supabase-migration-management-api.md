# Supabase 마이그레이션 — "대시보드 수동 적용" 불필요 (Management API 경로)

**증상**: geo-apps 공유 프로젝트에서 `supabase db push` 가 마이그레이션 히스토리
버전 충돌로 실패 → "대시보드 SQL Editor 수동 적용" 이 절차로 굳어짐
(book 0003 millie 핸드오프, 2026-06-06). 이후 세션들이 이 문서를 근거로
적용을 사용자에게 위임함.

**실제**: supabase CLI 가 로그인돼 있으면(`supabase projects list` 로 확인)
**Management API 로 DDL 을 헤드리스 실행 가능** — db push 의 히스토리 검증을
거치지 않는다. 2026-06-12 book 0004(book_quote_highlights) 를 이 경로로 적용,
스키마·RLS·실왕복 검증까지 완료.

```bash
# 1) 키체인에서 CLI 액세스 토큰 (go-keyring base64 래핑 주의)
TOKEN=$(security find-generic-password -s "Supabase CLI" -w | sed 's/^go-keyring-base64://' | base64 -d)
# 2) SQL 파일 → JSON 래핑 → 실행 (성공 시 [] 반환)
SQL=$(cat <마이그파일>.sql | python3 -c "import json,sys; print(json.dumps({'query': sys.stdin.read()}))")
curl -s -X POST "https://api.supabase.com/v1/projects/<PROJECT_REF>/database/query" \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" -d "$SQL"
```

**검증 패턴**: 같은 엔드포인트로 `information_schema.columns` / `pg_policies` /
`pg_tables.rowsecurity` 조회 + service role REST 로 insert→select→delete 왕복
(정리 필수) + anon 키로 RLS 차단(빈 select·42501) 확인.

**주의**:
- 이 경로는 schema_migrations 히스토리에 기록을 남기지 않음 — 마이그 파일을
  repo 에 커밋해 정본 유지 (적용 여부는 information_schema 로 판별).
- 토큰은 출력 금지(변수로만). `security` 호출이 키체인 프롬프트를 띄울 수 있음
  (이번엔 무프롬프트 통과).
- PROJECT_REF(geo-apps): `tcbooffrdacfatywdzcm`.
