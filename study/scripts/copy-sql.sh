#!/usr/bin/env bash
# Wave 11.12 — supabase/migrations/0001_study_init.sql 을 클립보드에 복사.
# 사용: pnpm sql:copy
set -euo pipefail

HERE="$(cd "$(dirname "$0")" && pwd)"
SQL="$HERE/../supabase/migrations/0001_study_init.sql"

if [ ! -f "$SQL" ]; then
  echo "❌ SQL 파일 없음: $SQL"
  exit 1
fi

if ! command -v pbcopy >/dev/null 2>&1; then
  echo "❌ pbcopy 없음 (macOS 전용). 파일 경로:"
  echo "   $SQL"
  exit 1
fi

pbcopy < "$SQL"
LINES=$(wc -l < "$SQL" | tr -d ' ')
BYTES=$(wc -c < "$SQL" | tr -d ' ')
echo "✅ SQL 클립보드 복사 완료 (${LINES} lines / ${BYTES} bytes)"
echo ""
echo "다음 단계:"
echo "  1. Supabase Dashboard → SQL Editor → New query 열기"
echo "     https://supabase.com/dashboard/project/_/sql/new"
echo "  2. Cmd+V 로 붙여넣기"
echo "  3. Run (Cmd+Enter)"
echo "  4. 검증 쿼리:"
echo "     select tablename, rowsecurity from pg_tables"
echo "     where schemaname='public' and tablename like 'study_%';"
echo "     → 6 row, 모두 rowsecurity=true 이어야 정상"
