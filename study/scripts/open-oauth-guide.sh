#!/usr/bin/env bash
# Wave 11.12 — docs/oauth-setup.md 를 기본 앱으로 열고 외부 Dashboard URL 안내.
# 사용: pnpm oauth:guide
set -euo pipefail

HERE="$(cd "$(dirname "$0")" && pwd)"
DOCS="$HERE/../docs/oauth-setup.md"

if [ ! -f "$DOCS" ]; then
  echo "❌ 가이드 파일 없음: $DOCS"
  exit 1
fi

if command -v open >/dev/null 2>&1; then
  open "$DOCS"
  echo "✅ docs/oauth-setup.md 열었습니다"
else
  echo "📄 가이드 경로: $DOCS"
fi

echo ""
echo "외부 Dashboard 링크 (따로 브라우저에서 열어 작업):"
echo "  • Google Cloud Console (OAuth 2.0 client):"
echo "    https://console.cloud.google.com/apis/credentials"
echo "  • Supabase Dashboard (Auth Providers):"
echo "    https://supabase.com/dashboard/project/_/auth/providers"
echo ""
echo "가이드 §3 → Google OAuth client 생성 · §4 → Supabase Google Provider 활성화"
