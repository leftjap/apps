#!/bin/bash
# 상시 감시(watchdog.sh)를 launchd 사용자 에이전트로 등록한다. 5분마다, 로그인하면 바로 한 번. 소리·알림 창·포커스 이동 없음.
# 쓰는 법: tools/sol/watchdog-install.sh [--print | --status | --uninstall]
#   (인자 없음) 설정이 없으면 만들고, plist 를 쓰고, launchctl bootstrap 으로 올린다(이미 올라 있으면 내렸다 올린다)
#   --print      plist 내용만 찍는다(아무것도 바꾸지 않는다)
#   --status     등록 여부와 watchdog.log 끝 몇 줄
#   --uninstall  내리고 plist 를 지운다(설정·기록 폴더는 남긴다)
set -u
LABEL=com.gio.mapo-loop-watch
SCRIPT="${WATCHDOG_SCRIPT:-/Users/gio_c/apps/mapo/tools/sol/watchdog.sh}"
CONF="$HOME/.config/mapo-loop"
STATE="$HOME/.local/state/mapo-loop"
PLIST="$HOME/Library/LaunchAgents/$LABEL.plist"
DOMAIN="gui/$(id -u)"

plist() {
  cat <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>$LABEL</string>
  <key>ProgramArguments</key>
  <array>
    <string>/bin/bash</string>
    <string>$SCRIPT</string>
  </array>
  <key>StartInterval</key>
  <integer>300</integer>
  <key>RunAtLoad</key>
  <true/>
  <key>ProcessType</key>
  <string>Background</string>
  <key>EnvironmentVariables</key>
  <dict>
    <key>PATH</key>
    <string>/opt/homebrew/bin:/opt/homebrew/sbin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin</string>
    <key>HOME</key>
    <string>$HOME</string>
    <key>LANG</key>
    <string>ko_KR.UTF-8</string>
  </dict>
  <key>StandardOutPath</key>
  <string>$STATE/launchd.log</string>
  <key>StandardErrorPath</key>
  <string>$STATE/launchd.log</string>
</dict>
</plist>
EOF
}

case "${1:-}" in
  --print) plist; exit 0 ;;
  --status)
    if launchctl print "$DOMAIN/$LABEL" > /dev/null 2>&1; then echo "등록됨: $DOMAIN/$LABEL ($PLIST)"; else echo "등록 안 됨: $LABEL"; fi
    echo "--- $STATE/watchdog.log 끝"; tail -10 "$STATE/watchdog.log" 2>/dev/null || echo "(기록 없음)"
    exit 0 ;;
  --uninstall)
    launchctl bootout "$DOMAIN/$LABEL" 2>/dev/null && echo "내렸다: $LABEL" || echo "올라 있지 않았다: $LABEL"
    rm -f "$PLIST" && echo "지웠다: $PLIST (설정 $CONF 와 기록 $STATE 는 남겼다)"
    exit 0 ;;
  '') ;;
  *) echo "쓰는 법: tools/sol/watchdog-install.sh [--print | --status | --uninstall]" >&2; exit 2 ;;
esac

[ -f "$SCRIPT" ] || { echo "watchdog-install.sh: $SCRIPT 가 없다" >&2; exit 2; }
mkdir -p "$CONF" "$STATE" "$(dirname "$PLIST")" || exit 2
[ -f "$CONF/dirs" ] || { printf '%s\n' /Users/gio_c/apps/mapo /Users/gio_c/apps-traffic/mapo > "$CONF/dirs"; echo "만들었다: $CONF/dirs"; }
[ -f "$CONF/until" ] || { echo 2026-12-05T00:00 > "$CONF/until"; echo "만들었다: $CONF/until"; }
plist > "$PLIST.tmp" && plutil -lint "$PLIST.tmp" > /dev/null && mv "$PLIST.tmp" "$PLIST" || { echo "watchdog-install.sh: plist 를 쓰지 못했다" >&2; exit 2; }
launchctl bootout "$DOMAIN/$LABEL" 2>/dev/null && echo "이미 올라 있던 것을 내렸다"
launchctl bootstrap "$DOMAIN" "$PLIST" || { echo "watchdog-install.sh: launchctl bootstrap 실패" >&2; exit 2; }
echo "올렸다: $DOMAIN/$LABEL (5분마다 $SCRIPT). 기록 $STATE/watchdog.log"
