"""s1-tiles 통과 검사: 칸 색인이 윤곽을 덮는지, 먼 단계가 자료를 잃지 않았는지 센다."""

import argparse
import gzip
import json
import math
from pathlib import Path

from shapely.geometry import box, shape

ROOT = Path(__file__).resolve().parents[4]
CELL = 500
MIN_CELL_AREA = 10_000  # 윤곽과 겹치는 면적이 이보다 작은 칸은 비어 있어도 넘긴다


def read_asset(output, suffix):
    base = ROOT / output["directory"] / f'{output["stem"]}-{suffix}.json'
    if output.get("gzip"):
        with gzip.open(f"{base}.gz", "rt") as stream:
            return json.load(stream)
    return json.loads(base.read_text())


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--area", required=True)
    args = parser.parse_args()
    area = json.loads((ROOT / "tools/v2/areas" / f"{args.area}.json").read_text())
    output = area["output"]
    folder = ROOT / output["directory"] / f'{output["stem"]}-tiles'
    index = json.loads((folder / "index.json").read_text())
    far = folder / "overview.json.gz"
    print(f"먼 단계 바이트 {far.stat().st_size:,}")
    bad = 0

    missing_files = 0
    for tile in index["tiles"]:
        path = folder / Path(tile["file"]).name
        if not path.exists() or path.stat().st_size != tile["bytes"]:
            missing_files += 1
    print(f"색인과 어긋난 칸 파일 {missing_files}개")
    bad += missing_files > 0

    outline = shape(area["outline"])
    have = {(tile["x"], tile["z"]) for tile in index["tiles"]}
    minx, minz, maxx, maxz = outline.bounds
    uncovered = []
    for cx in range(math.floor(minx / CELL), math.floor(maxx / CELL) + 1):
        for cz in range(math.floor(minz / CELL), math.floor(maxz / CELL) + 1):
            if (cx, cz) in have:
                continue
            cell = box(cx * CELL, cz * CELL, (cx + 1) * CELL, (cz + 1) * CELL)
            share = outline.intersection(cell).area
            if share >= MIN_CELL_AREA:
                uncovered.append((cx, cz, round(share)))
    uncovered.sort(key=lambda row: -row[2])
    print(f"덮지 못한 칸 {len(uncovered)}개")
    for row in uncovered[:5]:
        print(f"  칸 {row[0]}_{row[1]} 윤곽 {row[2]:,}㎡")
    bad += len(uncovered) > 0

    overview = json.load(gzip.open(far, "rt"))
    floor = read_asset(output, "a")
    crossings = len(overview["floor"]["crossings"]), len(floor["crossings"])
    print(f"횡단보도 먼 단계 {crossings[0]:,} / 자료 {crossings[1]:,}")
    bad += crossings[0] != crossings[1]

    buildings = read_asset(output, "buildings")["buildings"]
    kept = sum(len(cell) for cell in overview["boxes"]) + sum(
        len(shapes) for _, shapes in overview["outlines"]
    )
    faces = sum(len(building["faces"]) for building in buildings)
    print(f"건물 면 먼 단계 {kept:,} / 자료 {faces:,}")
    bad += kept != faces

    print("VERIFY-FAIL" if bad else "VERIFY-OK")
    raise SystemExit(1 if bad else 0)


if __name__ == "__main__":
    main()
