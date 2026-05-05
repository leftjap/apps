#!/usr/bin/env bash
# Wave 11.26 — e2e 환경 자동화
# .env.local 채워진 사용자 환경에서 e2e 실행 시 auth-guard B 가
# isSupabaseConfigured=true 분기로 빠져 ss('error') 트리거 안 됨 → 결정적 실패.
# 빈 env 로 강제 build + trap 으로 항상 복원 (build 실패/playwright 실패/Ctrl+C 모두).
set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
ENV_FILE="$PROJECT_DIR/.env.local"
BACKUP_FILE="$PROJECT_DIR/.env.local.e2e-backup"

cleanup() {
  if [ -f "$BACKUP_FILE" ]; then
    mv "$BACKUP_FILE" "$ENV_FILE"
    echo "[e2e] .env.local 복원"
  fi
}
trap cleanup EXIT INT TERM

if [ -f "$ENV_FILE" ]; then
  cp "$ENV_FILE" "$BACKUP_FILE"
  echo "[e2e] .env.local → .env.local.e2e-backup 백업"
fi

# 빈 env 작성 — supabase=null + isSupabaseConfigured=false 가정 (auth-guard B 조건)
: > "$ENV_FILE"

cd "$PROJECT_DIR"
pnpm build
pnpm exec playwright test "$@"
