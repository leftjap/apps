#!/usr/bin/env bash
# Claude Code Stop hook — WIP 스냅샷
#
# 목적: Claude 가 응답 종료 시 의미 단위 커밋을 못 하고 끝낸 경우,
#       추적 파일 변경분을 WIP 커밋으로 자동 백업.
#       git reset --hard 사고·세션 누적 미커밋 방지.
#
# 정책:
#   - ~/apps 한정 (타 repo 영향 없음)
#   - 추적 파일만 (`git add -u`). 신규 파일은 의도적 제외 (보안·민감파일 우발 커밋 방지)
#   - 이미 스테이지가 있으면 Claude 가 수동 커밋 준비 중으로 판단 → 건드리지 않음
#   - pre-commit hook 통과 필요 (--no-verify 사용 안 함 — 사용자 정책 존중)
#   - 실패 시 silent skip (스테이지만 해제하고 원상 복원)
#
# squash 방법: 다음 의미 커밋 직전에 `git reset --soft HEAD~N` 또는 `git commit --amend`

set -euo pipefail

cd ~/apps 2>/dev/null || exit 0

# git repo 아니면 skip
git rev-parse --git-dir >/dev/null 2>&1 || exit 0

# 변경 없으면 skip
git diff-index --quiet HEAD 2>/dev/null && exit 0

# 이미 스테이지된 것이 있으면 Claude 가 수동 커밋 준비 중 — 건드리지 않음
if ! git diff --cached --quiet 2>/dev/null; then
  exit 0
fi

# 추적 파일만 자동 스테이징
git add -u 2>/dev/null || exit 0

# 스테이지된 것이 없으면 skip (신규 파일만 있는 경우 등)
git diff --cached --quiet 2>/dev/null && exit 0

# 안전장치: 너무 많은 파일이 잡히면 세션 스코프 이탈 신호 → skip
# 이전 세션 누적 미커밋이 섞여들어가 WIP 스냅샷이 거대한 커밋을 만드는 사고 방지
SAFETY_THRESHOLD=10
changed_count=$(git diff --cached --name-only | wc -l | tr -d ' ')
if [ "$changed_count" -gt "$SAFETY_THRESHOLD" ]; then
  git reset HEAD >/dev/null 2>&1 || true
  echo "[claude-wip-snapshot] $changed_count files staged, exceeds threshold $SAFETY_THRESHOLD. Skipping to prevent cross-session contamination. Resolve manually with: git status" >&2
  exit 0
fi

# 충돌마커 가드: stash-pop/merge 중단 상태 파일을 스냅샷하면 깨진 코드가 커밋되고
# 이후 auto-push 에 섞여 배포가 죽음 (2026-06-09 today 404 — comments.js 마커 커밋 3f35b04).
# `=======` 단독 검사는 markdown 구분선 오탐 가능 → <<<<<<</>>>>>>> 만 검사 (실제 충돌엔 둘 다 존재).
conflicted=$(git diff --cached --name-only -z | xargs -0 grep -lI -E '^(<<<<<<<|>>>>>>>) ' 2>/dev/null || true)
if [ -n "$conflicted" ]; then
  git reset HEAD >/dev/null 2>&1 || true
  echo "[claude-wip-snapshot] conflict markers in: $(echo "$conflicted" | tr '\n' ' '). Skipping snapshot — resolve markers first." >&2
  exit 0
fi

# pre-commit 통과 필요. 실패 시 스테이지 해제 후 skip
if ! git commit -m "WIP(claude-snapshot): $(date +%Y-%m-%d-%H%M) — 다음 의미 커밋에 squash 가능" >/dev/null 2>&1; then
  git reset HEAD >/dev/null 2>&1 || true
  exit 0
fi

exit 0
