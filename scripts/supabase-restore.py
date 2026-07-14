#!/usr/bin/env python3
"""로컬 백업(supabase-backup.py 산출물) → Supabase 복구.

유사시 DB 복구 경로. 기본 --dry-run(검증만, 쓰기 없음). 실제 복원은 --apply + 테이블 명시 필요.
- service_role 로 PK(onConflict=id) upsert. 존재하는 행은 덮어쓰고 없는 행은 삽입 → 비파괴 병합.
- 안전장치: --apply 없이는 절대 쓰지 않음. 테이블별로 PK 자동탐지, 페이로드 유효성 검증.

사용:
  python3 supabase-restore.py <백업날짜|경로>                 # 전 테이블 dry-run 검증
  python3 supabase-restore.py <백업날짜> --table gym_sessions --apply   # 실제 복원(1테이블)
  python3 supabase-restore.py <백업날짜> --apply --yes         # 전 테이블 실제 복원(위험)
"""
import os, sys, json, pathlib, urllib.request, urllib.error

def load_env(p):
    for line in pathlib.Path(p).expanduser().read_text().splitlines():
        line = line.strip()
        if line and not line.startswith("#") and "=" in line:
            k, v = line.split("=", 1)
            os.environ.setdefault(k.strip(), v.strip().strip('"').strip("'"))

load_env("~/.config/study/.env")
URL = os.environ["SUPABASE_URL"].rstrip("/")
KEY = os.environ["SUPABASE_SERVICE_ROLE_KEY"]

# 실제 DB 기본키 (information_schema.table_constraints 조회, 2026-07-14).
# 추측 금지 — onConflict 이 실제 PK 와 다르면 복원이 데이터를 오염시킨다.
PK = {
    "book_comments": "id", "book_current_reading": "owner_id", "book_profiles": "user_id",
    "book_quote_highlights": "quote_id,owner_id", "book_quotes": "id",
    "book_reading_books": "owner_id,day,title", "book_reading_seconds": "owner_id,day",
    "gym_custom_exercises": "id", "gym_prs": "id", "gym_sessions": "id",
    "gym_user_settings": "user_id", "gym_weights": "user_id,date",
    "pick_profiles": "user_id", "pick_ratings": "id", "pick_reco_requests": "id",
    "pick_recommendations": "id", "readingtime_daily": "owner_id,day,source",
    "readingtime_userdata": "owner_id", "screentime_daily": "owner_id,date,kind,name",
    "study_daily_stats": "id", "study_math_problems": "id", "study_math_queue": "id",
    "study_pr_records": "user_id", "study_pronunciation_log": "id", "study_review_queue": "id",
    "study_session_logs": "id", "study_today_lessons": "id", "study_user_meta": "user_id",
    "today_comments": "id", "today_entries": "id", "today_expenses": "id",
    "today_merchant_rules": "id", "today_notifications": "id", "today_profiles": "user_id",
    "today_reactions": "id", "today_sms_ingest_tokens": "token",
    "today_user_brand_categories": "user_id,brand", "today_user_categories": "user_id,id",
    "today_user_merchant_aliases": "user_id,merchant_pattern",
}

def pk_for(table, rows):
    if table not in PK:
        raise SystemExit(f"❌ {table}: 알려진 PK 없음 — 복원 전 information_schema 로 PK 확인 필요")
    return PK[table]

def upsert(table, rows, pk, apply):
    if not rows:
        return "빈 테이블 — 스킵"
    # 페이로드 검증 — PK 컬럼이 전 행에 존재하나
    pk_cols = pk.split(",")
    missing = [i for i, r in enumerate(rows) if any(c not in r for c in pk_cols)]
    if missing:
        return f"❌ PK({pk}) 누락 행 {len(missing)}개 — 복원 불가"
    if not apply:
        return f"✓ dry-run OK — {len(rows)}행, onConflict={pk} 로 upsert 가능 (검증만, 미전송)"
    # 실제 upsert (배치 500)
    sent = 0
    for i in range(0, len(rows), 500):
        chunk = rows[i:i + 500]
        req = urllib.request.Request(
            f"{URL}/rest/v1/{table}?on_conflict={pk}",
            data=json.dumps(chunk).encode(),
            headers={"apikey": KEY, "Authorization": f"Bearer {KEY}",
                     "Content-Type": "application/json", "Prefer": "resolution=merge-duplicates"},
            method="POST")
        urllib.request.urlopen(req, timeout=60)
        sent += len(chunk)
    return f"✅ 복원 {sent}행 upsert 완료"

def main():
    if len(sys.argv) < 2:
        print(__doc__); sys.exit(1)
    arg = sys.argv[1]
    apply = "--apply" in sys.argv
    yes = "--yes" in sys.argv
    only = None
    if "--table" in sys.argv:
        only = sys.argv[sys.argv.index("--table") + 1]
    d = pathlib.Path(arg)
    if not d.exists():
        d = pathlib.Path("~/backups/supabase").expanduser() / arg
    if not d.exists():
        print(f"백업 경로 없음: {d}"); sys.exit(1)

    if apply and not only and not yes:
        print("전 테이블 실제 복원은 --yes 필요(위험). 보통은 --table 로 1개씩."); sys.exit(1)

    files = sorted(d.glob("*.json"))
    files = [f for f in files if f.name != "_manifest.json"]
    print(f"{'DRY-RUN 검증' if not apply else '실제 복원'} — {d}\n")
    ok = bad = 0
    for f in files:
        table = f.stem
        if only and table != only:
            continue
        rows = json.loads(f.read_text())
        pk = pk_for(table, rows)
        try:
            msg = upsert(table, rows, pk, apply)
        except urllib.error.HTTPError as e:
            msg = f"❌ HTTP {e.code}: {e.read()[:200].decode(errors='replace')}"
        print(f"  {table:32s} {msg}")
        ("❌" in msg) and (bad := bad + 1) or (ok := ok + 1)
    print(f"\n{'검증' if not apply else '복원'}: {ok} OK · {bad} 실패")
    sys.exit(1 if bad else 0)

if __name__ == "__main__":
    main()
