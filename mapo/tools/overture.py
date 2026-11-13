# Overture Maps 건물 자료에서 판 둘레의 건물 외곽선을 받아 tools/raw/overture.jsonl 에 저장한다.
# OSM 에 건물이 비어 있는 동네(망원동 서쪽 등)는 Overture 가 합쳐 둔 동아시아 건물 자료(Qian Shi 외 2023, CC BY 4.0)로 채운다.
# 실행: python3 -m venv /tmp/ov && /tmp/ov/bin/pip install duckdb && /tmp/ov/bin/python tools/overture.py
# (duckdb 는 이 스크립트를 돌릴 때만 필요하고 앱의 의존성이 아니다. 받은 파일은 커밋하지 않는다)
import json, os, sys, time
import duckdb

RELEASE = os.environ.get('OVERTURE_RELEASE', '2026-10-21.0')
OUT = os.path.join(os.path.dirname(__file__), 'raw', 'overture.jsonl')
# 판(중심 37.5515, 126.9190, 반지름 2km)을 덮는 사각형
BBOX = (126.8950, 37.5325, 126.9430, 37.5705)

t0 = time.time()
con = duckdb.connect()
for ext in ['httpfs', 'spatial']:
    con.execute(f'INSTALL {ext}; LOAD {ext};')
con.execute("SET s3_region='us-west-2'")
rows = con.execute(f"""
SELECT id, height, num_floors, class, subtype,
       list_transform(sources, lambda s: s.dataset) AS src,
       ST_AsGeoJSON(geometry) AS g
FROM read_parquet('s3://overturemaps-us-west-2/release/{RELEASE}/theme=buildings/type=building/*', hive_partitioning=1)
WHERE bbox.xmin > {BBOX[0]} AND bbox.xmax < {BBOX[2]} AND bbox.ymin > {BBOX[1]} AND bbox.ymax < {BBOX[3]}
""").fetchall()
with open(OUT, 'w') as f:
    for r in rows:
        f.write(json.dumps({'id': r[0], 'height': r[1], 'floors': r[2], 'class': r[3], 'subtype': r[4], 'src': r[5], 'g': json.loads(r[6])}, ensure_ascii=False) + '\n')
print(len(rows), 'rows', round(time.time() - t0), 's', file=sys.stderr)
