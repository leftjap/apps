#!/usr/bin/env bash
# 서울 열린데이터광장 일반 인증키를 마포 실시간 중계 함수(mapo-citydata)의 Supabase secret 으로 넣는다.
# 키는 화면에 보이지 않게 입력받고 파일에 남기지 않는다. 키를 바꿀 때도 이 명령을 다시 실행한다.
set -euo pipefail
read -rsp "서울 열린데이터광장 일반 인증키를 붙여 넣고 Enter: " KEY
echo
[ -n "$KEY" ] || { echo "키가 비어 있습니다."; exit 1; }
supabase secrets set "SEOUL_OPENAPI_KEY=$KEY" --project-ref tcbooffrdacfatywdzcm >/dev/null
echo "넣었습니다. 몇 분 안에 화면에 실시간 자료가 들어옵니다."
