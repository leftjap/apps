#!/bin/zsh
# Cue YouTube 게이트 (네이티브) — Chrome 활성 탭이 유튜브로 '진입'하는 순간 1회 팝업.
# LaunchAgent(StartInterval)가 주기적으로 호출. 상태파일로 transition(비유튜브→유튜브)에서만 발동.
LOG=/tmp/cue-yt-gate.log
STATE=/tmp/cue-yt-gate.state

url=$(osascript -e 'tell application "Google Chrome" to if (count of windows) > 0 then return URL of active tab of front window' 2>/dev/null)
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
  # 표시는 상주 CuePopup 에이전트가 담당 — 트리거 파일에 상태만 쓴다(중복은 CuePopup 이 처리).
  printf '%s' "$due" > /tmp/cue-popup-trigger
fi
