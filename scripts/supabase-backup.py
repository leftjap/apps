#!/usr/bin/env python3
"""공유 Supabase(geo-apps) 전 테이블 → 로컬 JSON 덤프.

배경(2026-07-14): Free 플랜이라 플랫폼 자동 백업이 전무하고(PITR off·물리백업 0),
자체 백업도 없어 gym 세션 1건이 영구 소실될 뻔했다. 이 스크립트가 유일한 백업 경로다.

- service_role 키(~/.config/study/.env)로 RLS 우회, 전 테이블 전 행을 페이지네이션 덤프.
- 공개 repo 노출 방지: 출력은 로컬 ~/backups/supabase/ 에만 쓴다(절대 repo 안 X).
- 읽기 전용 — DB 를 수정하지 않는다.
"""
import os, sys, json, time, urllib.request, urllib.error, datetime, pathlib

def load_env(p):
    for line in pathlib.Path(p).expanduser().read_text().splitlines():
        line = line.strip()
        if line and not line.startswith("#") and "=" in line:
            k, v = line.split("=", 1)
            os.environ.setdefault(k.strip(), v.strip().strip('"').strip("'"))

load_env("~/.config/study/.env")
URL = os.environ["SUPABASE_URL"].rstrip("/")
KEY = os.environ["SUPABASE_SERVICE_ROLE_KEY"]
H = {"apikey": KEY, "Authorization": f"Bearer {KEY}"}

def get(path, extra=None):
    h = dict(H)
    if extra:
        h.update(extra)
    req = urllib.request.Request(f"{URL}/rest/v1/{path}", headers=h)
    with urllib.request.urlopen(req, timeout=60) as r:
        return json.load(r), r.headers.get("Content-Range")

def list_tables():
    spec, _ = get("")  # OpenAPI 루트
    return sorted(p.strip("/") for p in spec.get("paths", {}) if p not in ("/",) and not p.startswith("/rpc/"))

def order_column(t):
    """페이지네이션 안정 정렬용 컬럼 — 첫 행의 키에서 id/created_at 우선, 없으면 첫 컬럼.
    PostgREST 는 order=<서수> 를 400 으로 거부하므로 반드시 실제 컬럼명이어야 한다."""
    sample, _ = get(f"{t}?select=*&limit=1")
    if not sample:
        return None
    keys = list(sample[0].keys())
    for pref in ("id", "created_at", "date", "day", "updated_at"):
        if pref in keys:
            return pref
    return keys[0]

def dump_table(t):
    col = order_column(t)
    ordr = f"&order={col}.asc" if col else ""
    rows, page, size = [], 0, 1000
    while True:
        lo, hi = page * size, page * size + size - 1
        batch, _ = get(f"{t}?select=*{ordr}", {"Range-Unit": "items", "Range": f"{lo}-{hi}"})
        rows += batch
        if len(batch) < size:
            break
        page += 1
        time.sleep(0.05)
    return rows

def main():
    stamp = sys.argv[1] if len(sys.argv) > 1 else datetime.datetime.now().strftime("%Y-%m-%d")
    outdir = pathlib.Path("~/backups/supabase").expanduser() / stamp
    outdir.mkdir(parents=True, exist_ok=True)
    tables = list_tables()
    manifest = {"stamp": stamp, "url": URL, "tables": {}}
    total = 0
    for t in tables:
        try:
            rows = dump_table(t)
            (outdir / f"{t}.json").write_text(json.dumps(rows, ensure_ascii=False, indent=0))
            manifest["tables"][t] = len(rows)
            total += len(rows)
            print(f"  {t:32s} {len(rows):6d} rows")
        except Exception as e:
            manifest["tables"][t] = f"ERROR: {e}"
            print(f"  {t:32s} ERROR {e}", file=sys.stderr)
    (outdir / "_manifest.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=2))
    print(f"\n총 {len(tables)}개 테이블 · {total} 행 → {outdir}")
    # 실패 테이블 있으면 non-zero (launchd/알림에서 감지)
    bad = [t for t, v in manifest["tables"].items() if isinstance(v, str)]
    sys.exit(1 if bad else 0)

if __name__ == "__main__":
    main()
