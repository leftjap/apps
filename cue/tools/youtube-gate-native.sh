#!/bin/zsh
# Cue YouTube 게이트 (네이티브) — Chrome 활성 탭이 유튜브로 '진입'하는 순간 1회 팝업.
# KeepAlive 상주 루프(3초 폴). StartInterval 은 sleep/wake 후 spawn 이 멈추는 문제가 있어 폐기 →
# 내부 while 루프로 신뢰성 확보(프로세스가 죽으면 KeepAlive 가 재기동).
LOG=/tmp/cue-yt-gate.log
STATE=/tmp/cue-yt-gate.state

while true; do
  if [[ -f /tmp/cue-popup-disabled ]]; then sleep 3; continue; fi   # 사용자가 팝업 끔 → 감지 스킵(루프 유지)

  # 타임아웃으로 Chrome 무응답(특히 wake 직후) 시 무한 행 방지. 실패하면 상태 안 바꾸고 다음 사이클로(스퓨리어스 transition 방지).
  url=$(osascript -e 'with timeout of 4 seconds' -e 'tell application "Google Chrome" to if (count of windows) > 0 then return URL of active tab of front window' -e 'end timeout' 2>/dev/null)
  if [[ $? -ne 0 ]]; then sleep 3; continue; fi
  case "$url" in
    *youtube.com/*) cur=yt ;;
    *)              cur=no ;;
  esac
  prev=$(cat "$STATE" 2>/dev/null)
  print -r -- "$cur" > "$STATE"

  if [[ "$cur" == "yt" && "$prev" != "yt" ]]; then
    print -r -- "$(date '+%H:%M:%S') transition->youtube  url=$url  → cue-popup card" >> "$LOG"
    # 오늘 Cue due 활동 판정(service-role 헬퍼). 실패 시 stale 폴백. node 는 launchd 최소 PATH 대응 절대경로.
    [[ -f "$HOME/.config/study/.env" ]] && { set -a; source "$HOME/.config/study/.env"; set +a; }
    export CUE_USER_ID=$(grep -o 'USER_ID_LEFTJAP=[0-9a-f-]*' "$HOME/apps/today/.env.local" 2>/dev/null | cut -d= -f2)
    due=$(/opt/homebrew/bin/node "$HOME/apps/cue/tools/due-now.mjs" 2>>"$LOG")
    [[ -z "$due" ]] && due=stale
    print -r -- "$(date '+%H:%M:%S') due=$due" >> "$LOG"
    # 4개 다 완료(toast)면 팝업 안 띄움 — 마칠 일 없으니 마찰 불필요
    [[ "$due" == "toast" ]] || printf '%s' "$due" > /tmp/cue-popup-trigger
  fi

  sleep 3
done
