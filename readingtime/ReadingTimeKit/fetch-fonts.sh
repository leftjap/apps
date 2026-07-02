#!/bin/sh
# 시안 웹폰트(OFL)를 Google Fonts 저장소에서 받아 RTViews 리소스로 배치.
# 폰트 바이너리는 repo 미커밋(.gitignore) — 빌드 전 1회 실행.
set -e
DIR="$(dirname "$0")/Sources/RTViews/Fonts"
mkdir -p "$DIR"
BASE="https://raw.githubusercontent.com/google/fonts/main/ofl"
fetch() { [ -f "$DIR/$2" ] || curl -fsSL -m 60 "$BASE/$1" -o "$DIR/$2"; echo "ok $2"; }

fetch "notosanskr/NotoSansKR%5Bwght%5D.ttf" "NotoSansKR-VF.ttf"
fetch "ibmplexmono/IBMPlexMono-Regular.ttf"  "IBMPlexMono-Regular.ttf"
fetch "ibmplexmono/IBMPlexMono-Medium.ttf"   "IBMPlexMono-Medium.ttf"
fetch "ibmplexmono/IBMPlexMono-SemiBold.ttf" "IBMPlexMono-SemiBold.ttf"
fetch "ibmplexmono/IBMPlexMono-Bold.ttf"     "IBMPlexMono-Bold.ttf"
fetch "poppins/Poppins-SemiBold.ttf"         "Poppins-SemiBold.ttf"
ls -la "$DIR"
