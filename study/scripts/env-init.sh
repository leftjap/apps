#!/usr/bin/env bash
# Wave 11.12 — .env.local placeholder 생성 (사용자 키 값만 채우면 됨).
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
# Supabase 연결 정보 — Wave 11.12 셋업
# 값 출처: Supabase Dashboard → Project Settings → API
#   - Project URL          → VITE_SUPABASE_URL
#   - Project API keys → anon public → VITE_SUPABASE_ANON_KEY
# anon 키만 사용 (RLS 보호). service_role 키 절대 금지.

VITE_SUPABASE_URL=
VITE_SUPABASE_ANON_KEY=
EOF

echo "✅ .env.local placeholder 생성: $ENV_PATH"
echo ""
echo "다음 단계:"
echo "  1. Supabase Dashboard → Project Settings → API 에서:"
echo "     - Project URL 복사 → VITE_SUPABASE_URL= 뒤에 붙이기"
echo "     - anon public key 복사 → VITE_SUPABASE_ANON_KEY= 뒤에 붙이기"
echo "  2. pnpm bootstrap 으로 검증"
