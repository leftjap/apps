#!/bin/zsh
set -eu

# 데몬은 repo 밖(~/.local/bin)에 산다 — README "수집 데몬" 절.
SYNC="${MILLIE_SYNC_BIN:-$HOME/.local/bin/millie-sync.sh}"
TMPDIR=$(mktemp -d)
trap 'rm -r "$TMPDIR"' EXIT
KDB="$TMPDIR/knowledgeC.db"
BIN="$TMPDIR/bin"
CALLS="$TMPDIR/calls.log"
mkdir -p "$BIN"

sqlite3 "$KDB" <<'SQL'
CREATE TABLE ZOBJECT (ZSTREAMNAME TEXT, ZVALUESTRING TEXT, ZSTARTDATE REAL, ZENDDATE REAL);
INSERT INTO ZOBJECT VALUES ('/app/usage','kr.co.millie.MillieShelf',strftime('%s','now','start of day','-2 day')-978307200+10,strftime('%s','now','start of day','-2 day')-978307200+69);
INSERT INTO ZOBJECT VALUES ('/app/usage','kr.co.millie.MillieShelf',strftime('%s','now','start of day')-978307200+100,strftime('%s','now','start of day')-978307200+160);
INSERT INTO ZOBJECT VALUES ('/app/usage','kr.co.millie.MillieShelf',strftime('%s','now','start of day','-1 day')-978307200+100,strftime('%s','now','start of day','-1 day')-978307200+220);
SQL

cat > "$BIN/curl" <<'SH'
#!/bin/zsh
url=""; payload=""; method="GET"; prefer=""
while (( $# )); do
  case "$1" in
    -X) method="$2"; shift 2 ;;
    -d) payload="$2"; shift 2 ;;
    -H) [[ "$2" == Prefer:* ]] && prefer="$2"; shift 2 ;;
    -o|-w) shift 2 ;;
    -s|-S|-f|-sS|-fsS) shift ;;
    http*) url="$1"; shift ;;
    *) shift ;;
  esac
done
if [[ "$method" == "GET" ]]; then
  if [[ "$url" == *"day=eq.$(date +%Y-%m-%d)"* ]]; then
    print -r -- '[{"seconds":100}]'
  else
    print -r -- '[]'
  fi
else
  print -r -- "${url}\t${prefer}\t${payload}" >> "$MILLIE_TEST_CALLS"
  print -r -- '200'
fi
SH
chmod +x "$BIN/curl"

PATH="$BIN:/usr/bin:/bin" \
MILLIE_ENV_FILE=/dev/null \
MILLIE_KDB="$KDB" \
MILLIE_SQL_ERR_LOG="$TMPDIR/sql-err.log" \
MILLIE_TEST_CALLS="$CALLS" \
SUPABASE_URL=https://example.invalid \
SUPABASE_SERVICE_ROLE_KEY=test \
"$SYNC"

# 쓰기 정책(README "밀리 수집 정확도") — 원본은 손실 없이 보존한다.
#  ① 날짜별 초는 그대로 올린다. 1분 미만 날을 기록에서 빼는 건 앱 표시 계층(ebookMinSeconds).
#     데몬이 걸러 버리면 되돌릴 수 없다.
#  ② 삽입은 신규일만(ignore-duplicates), 갱신은 기존보다 클 때만(seconds=lt.N).
#     knowledgeC 가 28일째 그날 앞부분을 지우므로, 잘린 합계가 정본을 덮으면 안 된다.
[[ -f "$CALLS" ]] || { print -u2 "아무 기록도 저장되지 않음"; exit 1; }

for sec in 59 120 60; do
  grep -q "\"seconds\":${sec}," "$CALLS" || { print -u2 "${sec}초 기록이 저장되지 않음"; cat "$CALLS"; exit 1; }
done

# 감소 차단은 PATCH URL 의 seconds=lt.N 이 한다 — 이게 빠지면 잘린 합계가 정본을 파괴한다
grep -q 'seconds=lt.60' "$CALLS" || { print -u2 "감소 차단 조건(seconds=lt.N)이 PATCH 에 없음"; cat "$CALLS"; exit 1; }
grep -q 'resolution=ignore-duplicates' "$CALLS" || { print -u2 "삽입이 신규일 전용(ignore-duplicates)이 아님"; cat "$CALLS"; exit 1; }

print "millie-sync-test: PASS"
