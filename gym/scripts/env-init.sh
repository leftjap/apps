#!/usr/bin/env bash
# Wave 11.7 — .env.local placeholder 생성 (사용자 키 값만 채우면 됨).
# 사용: pnpm env:init
# 이미 파일이 있으면 덮어쓰지 않음 (안전장치).
set -euo pipefail

HERE="$(cd "$(dirname "$0")" && pwd)"
ENV_PATH="$HERE/../.env.local"

if [ -f "$ENV_PATH" ]; then
  echo "✅ .env.local 이미 존재: $ENV_PATH"
  echo "   덮어쓰기 원하면 기존 파일을 삭제하고 재실행하세요."
  exit 0
fi

cat > "$ENV_PATH" <<'EOF'
# Supabase 연결 정보 — Wave 11.7 셋업
# 값 출처: Supabase Dashboard → Project Settings → API
#   - Project URL          → VITE_SUPABASE_URL
#   - publishable key      → VITE_SUPABASE_ANON_KEY
# Study 와 같은 Supabase 프로젝트 공유 → Study 의 .env.local 값 그대로 재사용 가능.
# legacy JWT (eyJ...) 또는 신규 publishable (sb_publishable_...) 둘 다 동작.
# secret 키 (sb_secret_*, service_role) 는 절대 번들 금지.

VITE_SUPABASE_URL=
VITE_SUPABASE_ANON_KEY=
EOF

echo "✅ .env.local placeholder 생성: $ENV_PATH"
echo ""
echo "다음 단계:"
echo "  1. ~/apps/study/.env.local 의 두 값을 그대로 복사 (공유 프로젝트)"
echo "     또는 Supabase Dashboard → Project Settings → API 에서 복사"
echo "  2. pnpm bootstrap 으로 검증"
