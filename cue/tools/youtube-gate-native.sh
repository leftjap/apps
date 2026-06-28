#!/bin/zsh
# Cue YouTube 게이트 (네이티브) — Chrome 활성 탭이 유튜브일 때 마찰 카드 팝업.
# 발동: ① 비유튜브→유튜브 진입(transition) ② 유튜브를 계속 보면 REPROMPT 초마다 재알림
#   (사용자가 '이미 유튜브를 보고 있어도' 떠야 한다는 요구 — transition 만으론 안 떴음).
# KeepAlive 상주 루프(3초 폴). StartInterval 은 sleep/wake 후 멈춰서 폐기.
LOG=/tmp/cue-yt-gate.log
STATE=/tmp/cue-yt-gate.state
LASTFIRE=/tmp/cue-yt-gate.lastfire
REPROMPT=600   # 유튜브 계속 시청 시 재알림 간격(초). 10분.

while true; do
  if [[ -f /tmp/cue-popup-disabled ]]; then sleep 3; continue; fi   # 사용자가 팝업 끔 → 감지 스킵(루프 유지)

  # 타임아웃으로 Chrome 무응답(특히 wake 직후) 시 무한 행 방지. 실패하면 상태 안 바꾸고 다음 사이클로.
  url=$(osascript -e 'with timeout of 4 seconds' -e 'tell application "Google Chrome" to if (count of windows) > 0 then return URL of active tab of front window' -e 'end timeout' 2>/dev/null)
  if [[ $? -ne 0 ]]; then sleep 3; continue; fi
  case "$url" in
    *youtube.com/*) cur=yt ;;
    *)              cur=no ;;
  esac
  prev=$(cat "$STATE" 2>/dev/null)
  print -r -- "$cur" > "$STATE"

  if [[ "$cur" == "yt" ]]; then
    now=$(date +%s); last=$(cat "$LASTFIRE" 2>/dev/null || echo 0)
    if [[ "$prev" != "yt" ]]; then reason=enter; elif (( now - last >= REPROMPT )); then reason=reprompt; else reason=""; fi
    if [[ -n "$reason" ]]; then
      print -r -- "$now" > "$LASTFIRE"
      print -r -- "$(date '+%H:%M:%S') youtube($reason)  url=$url  → cue-popup card" >> "$LOG"
      # 오늘 Cue due 활동 판정(service-role 헬퍼). 실패 시 stale 폴백. node 는 launchd 최소 PATH 대응 절대경로.
      [[ -f "$HOME/.config/study/.env" ]] && { set -a; source "$HOME/.config/study/.env"; set +a; }
      export CUE_USER_ID=$(grep -o 'USER_ID_LEFTJAP=[0-9a-f-]*' "$HOME/apps/today/.env.local" 2>/dev/null | cut -d= -f2)
      due=$(/opt/homebrew/bin/node "$HOME/apps/cue/tools/due-now.mjs" 2>>"$LOG")
      [[ -z "$due" ]] && due=stale
      print -r -- "$(date '+%H:%M:%S') due=$due" >> "$LOG"
      # 4개 다 완료(toast)면 팝업 안 띄움 — 마칠 일 없으니 마찰 불필요
      [[ "$due" == "toast" ]] || printf '%s' "$due" > /tmp/cue-popup-trigger
    fi
  fi

  sleep 3
done
