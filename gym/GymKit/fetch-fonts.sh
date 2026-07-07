#!/bin/sh
# 시안 폰트(OFL)를 받아 GymViews 리소스로 배치. 바이너리는 repo 미커밋(.gitignore) — 빌드 전 1회 실행.
# Pretendard(sans, jsDelivr @v1.3.9 정합) + Space Grotesk(mono, Google Fonts ofl).
set -e
DIR="$(dirname "$0")/Sources/GymViews/Fonts"
mkdir -p "$DIR"
fetch() { [ -f "$DIR/$2" ] || curl -fsSL -m 60 "$1" -o "$DIR/$2"; echo "ok $2 ($(wc -c < "$DIR/$2") bytes)"; }

PRE="https://raw.githubusercontent.com/orioncactus/pretendard/v1.3.9/packages/pretendard/dist/public/static"
fetch "$PRE/Pretendard-Regular.otf"    "Pretendard-Regular.otf"
fetch "$PRE/Pretendard-Medium.otf"     "Pretendard-Medium.otf"
fetch "$PRE/Pretendard-SemiBold.otf"   "Pretendard-SemiBold.otf"
fetch "$PRE/Pretendard-Bold.otf"       "Pretendard-Bold.otf"
fetch "$PRE/Pretendard-ExtraBold.otf"  "Pretendard-ExtraBold.otf"

GF="https://raw.githubusercontent.com/google/fonts/main/ofl/spacegrotesk"
fetch "$GF/SpaceGrotesk%5Bwght%5D.ttf" "SpaceGrotesk-VF.ttf"

ls -la "$DIR"
