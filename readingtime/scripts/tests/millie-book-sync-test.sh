#!/bin/zsh
set -eu

# 데몬은 repo 밖(~/.local/bin)에 산다 — README "수집 데몬" 절.
SYNC="${MILLIE_SYNC_BIN:-$HOME/.local/bin/millie-book-sync.sh}"
TMPDIR=$(mktemp -d)
trap 'rm -r "$TMPDIR"' EXIT
MDB="$TMPDIR/millie.db"
KDB="$TMPDIR/knowledgeC.db"
BIN="$TMPDIR/bin"
CALLS="$TMPDIR/calls.log"
mkdir -p "$BIN"

sqlite3 "$MDB" <<'SQL'
CREATE TABLE history_drift (book_id TEXT PRIMARY KEY, updated_at INTEGER, location_percent REAL, delete_yn INTEGER);
CREATE TABLE book (book_id TEXT PRIMARY KEY, content_name TEXT, author TEXT, publisher TEXT, published_at TEXT, read_percent INTEGER, content_thumb_url TEXT, cover_image_url TEXT);
CREATE TABLE highlight_drift (id INTEGER PRIMARY KEY, cfi TEXT, preview TEXT, delete_yn INTEGER, updated_at INTEGER, book_id TEXT);
INSERT INTO book VALUES ('mac','맥에서 읽은 책','작가','출판사','2020-01-01',10,'mac-cover',NULL);
INSERT INTO book VALUES ('phone','폰에서 읽은 책','작가','출판사','2020-01-01',20,'phone-cover',NULL);
INSERT INTO history_drift VALUES ('mac',strftime('%s','now','start of day')+125,10,0);
INSERT INTO history_drift VALUES ('phone',strftime('%s','now','start of day')+500,20,0);
SQL

sqlite3 "$KDB" <<'SQL'
CREATE TABLE ZOBJECT (ZSTREAMNAME TEXT, ZVALUESTRING TEXT, ZSTARTDATE REAL, ZENDDATE REAL);
INSERT INTO ZOBJECT VALUES ('/app/usage','kr.co.millie.MillieShelf',strftime('%s','now','start of day')-978307200+100,strftime('%s','now','start of day')-978307200+200);
SQL

cat > "$BIN/curl" <<'SH'
#!/bin/zsh
# 어느 테이블로 간 요청인지 구분해야 한다 — book_millie_books 는 카탈로그 전체 미러라
# 맥/폰 구분이 없는 게 정상이고, 독서 판정은 book_reading_books·book_current_reading 만 본다.
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

# 독서 판정(진도 증가)은 millie-reading-judgement-test 가 덮는다. 여기 관심사는 맥 세션
# 겹침뿐이므로 두 책 모두 직전 관측을 깔아 판정을 통과시킨다.
sqlite3 "$TMPDIR/catalog.db" <<'SQL'
CREATE TABLE IF NOT EXISTS progress_snapshots(book_id TEXT NOT NULL, ts INTEGER NOT NULL, percent REAL, PRIMARY KEY(book_id, ts));
INSERT INTO progress_snapshots VALUES ('mac',   strftime('%s','now','start of day')+10, 1.0);
INSERT INTO progress_snapshots VALUES ('phone', strftime('%s','now','start of day')+10, 1.0);
SQL

PATH="$BIN:/usr/bin:/bin" \
MILLIE_ENV_FILE=/dev/null \
MILLIE_DB="$MDB" \
MILLIE_KDB="$KDB" \
MILLIE_CAT="$TMPDIR/catalog.db" \
MILLIE_LOG_DIR="$TMPDIR/millie-log" \
MILLIE_ARCHIVE_DIR="$TMPDIR/millie-archive" \
MILLIE_TEST_CALLS="$CALLS" \
SUPABASE_URL=https://example.invalid \
SUPABASE_SERVICE_ROLE_KEY=test \
"$SYNC"

READS=$(grep -E 'book_reading_books|book_current_reading' "$CALLS" || true)

grep -q '맥에서 읽은 책' <<< "$READS" || { print -u2 "맥 사용시간과 겹친 책이 저장되지 않음"; cat "$CALLS"; exit 1; }
! grep -q '폰에서 읽은 책' <<< "$READS" || { print -u2 "맥 사용시간과 겹치지 않은 책을 저장함"; cat "$CALLS"; exit 1; }

print "millie-book-sync-test: PASS"
