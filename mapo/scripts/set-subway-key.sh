#!/usr/bin/env bash
# 서울 열린데이터광장 실시간 지하철 인증키를 마포 실시간 열차 위치 중계 함수(mapo-subway)의 Supabase secret 으로 넣는다.
# 키는 화면에 보이지 않게 입력받고 파일에 남기지 않는다. 키를 바꿀 때도 이 명령을 다시 실행한다.
set -euo pipefail
read -rsp "서울 열린데이터광장 실시간 지하철 인증키를 붙여 넣고 Enter: " KEY
echo
[ -n "$KEY" ] || { echo "키가 비어 있습니다."; exit 1; }
supabase secrets set "SEOUL_SUBWAY_KEY=$KEY" --project-ref tcbooffrdacfatywdzcm >/dev/null
echo "넣었습니다. 2분 안에 화면의 열차가 실시간 위치로 바뀝니다."
