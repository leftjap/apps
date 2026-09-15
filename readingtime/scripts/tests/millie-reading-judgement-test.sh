#!/bin/zsh
set -eu

# 밀리 독서 판정 (2026-09-15 실사고) — history_drift 에 행이 생겼다 ≠ 읽었다.
# 밀리는 뷰어를 열기만 해도 행을 만들고 updated_at 을 갱신한다. 실측:
#   · 사피엔스 09-06 15:02:41  location_percent NULL (뷰어 로그에도 0%)
#   · 살찌지 않는 몸 09-10 23:44:51  location_percent NULL
#   · 만만하게 시작하는 왕초보 영어패턴 09-11 13:06:34  4% — 13:06:15 에 열어 2페이지
#
# 처음 열어보는 책은 비교할 직전 관측이 없다. 그때 '판정 불가 → 인정' 으로 두면 검색해서
# 눌러본 책이 그대로 올라온다(사용자 지적 2026-09-15). 최근 30일 밀리 앱 세션 62개 중
# 38개가 1분 미만인 만큼 이 경우가 대부분이다. 그래서 첫 관측은 올리지 않고 진도가 실제로
# 늘어나는 것을 한 번은 봐야 인정한다. 짧은 독서를 놓치지 않도록 데몬 주기를 15분에서
# 3분으로 줄였다(launchd StartInterval 180).
# 이것들이 "읽고 있는 책"으로 홈 캐러셀에 올라왔다.
#
# 반대로 실제로 읽은 책이 탈락했다 — 스크린타임 세션은 사용 구간을 조각조각 남긴다.
#   · 왕초보 스피킹 코치 09-11 12:56:35 (4분간 0→18%) 이 조각 사이 틈에 떨어져 제외됨
#     (조각: 12:53:36~12:54:05, 12:58:42~12:59:17)

SYNC="${MILLIE_SYNC_BIN:-$HOME/.local/bin/millie-book-sync.sh}"
TMPDIR=$(mktemp -d)
trap 'rm -r "$TMPDIR"' EXIT
MDB="$TMPDIR/millie.db"
KDB="$TMPDIR/knowledgeC.db"
CAT="$TMPDIR/catalog.db"
BIN="$TMPDIR/bin"
CALLS="$TMPDIR/calls.log"
mkdir -p "$BIN"


sqlite3 "$MDB" <<'SQL'
CREATE TABLE history_drift (book_id TEXT PRIMARY KEY, updated_at INTEGER, location_percent REAL, delete_yn INTEGER);
CREATE TABLE book (book_id TEXT PRIMARY KEY, content_name TEXT, author TEXT, publisher TEXT, published_at TEXT, read_percent INTEGER, content_thumb_url TEXT, cover_image_url TEXT);
CREATE TABLE highlight_drift (id INTEGER PRIMARY KEY, cfi TEXT, preview TEXT, delete_yn INTEGER, updated_at INTEGER, book_id TEXT);

INSERT INTO book VALUES ('opened','열어만 본 책','작가','출판','2020-01-01',0,'c1',NULL);
INSERT INTO book VALUES ('skimmed','진도 그대로인 책','작가','출판','2020-01-01',4,'c2',NULL);
INSERT INTO book VALUES ('read','실제로 읽은 책','작가','출판','2020-01-01',18,'c3',NULL);
INSERT INTO book VALUES ('gap','조각 사이에 읽은 책','작가','출판','2020-01-01',30,'c4',NULL);
INSERT INTO book VALUES ('newbook','처음 열어본 책','작가','출판','2020-01-01',4,'c6',NULL);
INSERT INTO book VALUES ('phone','폰에서 읽은 책','작가','출판','2020-01-01',50,'c5',NULL);

-- 오늘 09:00 기준 상대 배치 (start of day + 초)
INSERT INTO history_drift VALUES ('opened',  strftime('%s','now','start of day')+32500, NULL, 0);
INSERT INTO history_drift VALUES ('skimmed', strftime('%s','now','start of day')+32510, 4.0,  0);
INSERT INTO history_drift VALUES ('read',    strftime('%s','now','start of day')+32520, 18.0, 0);
INSERT INTO history_drift VALUES ('gap',     strftime('%s','now','start of day')+32700, 30.0, 0);
INSERT INTO history_drift VALUES ('newbook', strftime('%s','now','start of day')+32530, 4.0,  0);
INSERT INTO history_drift VALUES ('phone',   strftime('%s','now','start of day')+70000, 50.0, 0);
SQL

# 맥 밀리 세션 두 조각: [32400,32600] 과 [32800,33000].
# 'gap'(32700)은 두 조각 **사이 틈**에 있다 — 그날 사용 구간 [32400,33000] 안이므로 인정해야 한다.
# 'phone'(70000)은 그날 어느 구간에도 없다 — 제외.
sqlite3 "$KDB" <<'SQL'
CREATE TABLE ZOBJECT (ZSTREAMNAME TEXT, ZVALUESTRING TEXT, ZSTARTDATE REAL, ZENDDATE REAL);
INSERT INTO ZOBJECT VALUES ('/app/usage','kr.co.millie.MillieShelf',
  strftime('%s','now','start of day')-978307200+32400, strftime('%s','now','start of day')-978307200+32600);
INSERT INTO ZOBJECT VALUES ('/app/usage','kr.co.millie.MillieShelf',
  strftime('%s','now','start of day')-978307200+32800, strftime('%s','now','start of day')-978307200+33000);
SQL

# 직전 관측 진도 — 'skimmed' 는 그대로(4%), 'read'(10→18)·'gap'(20→30) 은 늘었다.
# 'newbook' 은 직전 관측이 없다 = 처음 열어본 책.
sqlite3 "$CAT" <<'SQL'
CREATE TABLE IF NOT EXISTS progress_snapshots(book_id TEXT NOT NULL, ts INTEGER NOT NULL, percent REAL, PRIMARY KEY(book_id, ts));
INSERT INTO progress_snapshots VALUES ('skimmed', strftime('%s','now','start of day')+3000, 4.0);
INSERT INTO progress_snapshots VALUES ('read',    strftime('%s','now','start of day')+3000, 10.0);
INSERT INTO progress_snapshots VALUES ('gap',     strftime('%s','now','start of day')+3000, 20.0);
SQL

cat > "$BIN/curl" <<'SH'
#!/bin/zsh
payload=""; url=""
while (( $# )); do
  case "$1" in
    -d) payload="$2"; shift 2 ;;
    -o|-w|-H|-X) shift 2 ;;
    http*) url="$1"; shift ;;
    *) shift ;;
  esac
done
print -r -- "${url}\t${payload}" >> "$MILLIE_TEST_CALLS"
print -r -- '200'
SH
chmod +x "$BIN/curl"

PATH="$BIN:/usr/bin:/bin" \
MILLIE_ENV_FILE=/dev/null \
MILLIE_DB="$MDB" \
MILLIE_KDB="$KDB" \
MILLIE_CAT="$CAT" \
MILLIE_LOG_DIR="$TMPDIR/millie-log" \
MILLIE_ARCHIVE_DIR="$TMPDIR/millie-archive" \
MILLIE_TEST_CALLS="$CALLS" \
SUPABASE_URL=https://example.invalid \
SUPABASE_SERVICE_ROLE_KEY=test \
"$SYNC" > "$TMPDIR/out.log" 2>&1 || { print -u2 "데몬 실패"; cat "$TMPDIR/out.log"; exit 1; }

READS=$(grep -E 'book_reading_books|book_current_reading' "$CALLS" || true)
fail() { print -u2 "$1"; print -u2 -- "--- 저장된 독서 판정 ---"; print -r -- "$READS"; exit 1 }

# ① 위치가 없는 행 = 열기만 한 것
! grep -q '열어만 본 책' <<< "$READS" || fail "위치 없는(열기만 한) 책을 독서로 저장함"

# ② 직전 관측과 진도가 같으면 읽은 게 아니다
! grep -q '진도 그대로인 책' <<< "$READS" || fail "진도가 늘지 않은 책을 독서로 저장함"

# ③ 진도가 늘었으면 독서
grep -q '실제로 읽은 책' <<< "$READS" || fail "진도가 늘어난 책이 저장되지 않음"

# ④ 스크린타임 조각 사이 틈에 갱신돼도 그날 사용 구간 안이면 독서
grep -q '조각 사이에 읽은 책' <<< "$READS" || fail "세션 조각 사이 틈의 독서가 탈락함"

# ④-2 처음 열어본 책은 진도가 늘어나는 것을 볼 때까지 올리지 않는다
! grep -q '처음 열어본 책' <<< "$READS" || fail "처음 열어본 책(직전 관측 없음)을 독서로 저장함"

# ⑤ 그날 맥 사용 구간 밖은 여전히 제외 (폰 독서 혼입 차단 — 기존 보장)
! grep -q '폰에서 읽은 책' <<< "$READS" || fail "맥 사용 구간 밖의 갱신을 저장함"

# ⑥ 현재 읽는 책 = 판정을 통과한 것 중 최신 (열어만 본 책이 그 자리를 차지하면 안 된다)
CUR=$(grep 'book_current_reading' "$CALLS" || true)
grep -q '조각 사이에 읽은 책' <<< "$CUR" || fail "현재 읽는 책이 판정 통과분의 최신이 아님"

# ⑦ 이번 실행의 진도가 이력에 쌓여야 다음 실행에서 판정할 수 있다
[[ $(sqlite3 "$CAT" "SELECT COUNT(*) FROM progress_snapshots WHERE book_id='read';") -ge 2 ]] \
  || fail "진도 스냅샷이 누적되지 않음"

print "millie-reading-judgement-test: PASS"
