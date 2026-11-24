"""Pack a baked district into an overview and 500 m static detail tiles."""

import argparse
from filecmp import cmp
import gzip
import json
import math
from pathlib import Path
import subprocess
from tempfile import TemporaryDirectory

from shapely.geometry import Polygon
from shapely.geometry.polygon import orient

ROOT = Path(__file__).resolve().parents[2]
CELL = 500


def read_asset(output, suffix):
    base = ROOT / output["directory"] / f'{output["stem"]}-{suffix}.json'
    if output.get("gzip"):
        with gzip.open(f"{base}.gz", "rt") as stream:
            return json.load(stream)
    return json.loads(base.read_text())


def simplified(faces, tolerance):
    result = []
    for outer, *holes in faces:
        polygon = Polygon(outer, holes).simplify(tolerance, preserve_topology=True)
        if polygon.is_empty or not polygon.area:
            continue
        result.append([
            [[round(x, 1), round(z, 1)] for x, z in list(ring.coords)[:-1]]
            for ring in (polygon.exterior, *polygon.interiors)
        ])
    return result


def overview_buildings(buildings):
    cells = {}
    for building in buildings:
        for index, (outer, *holes) in enumerate(building["faces"]):
            footprint = Polygon(outer, holes)
            rectangle = footprint.minimum_rotated_rectangle
            if rectangle.geom_type != "Polygon":
                continue
            a, b, c, d, _ = rectangle.exterior.coords
            x, z = (a[0] + c[0]) / 2, (a[1] + c[1]) / 2
            angle = math.atan2(b[1] - a[1], b[0] - a[0])
            size = math.dist(a, b), math.dist(b, c)
            appearance = building.get("appearance")
            colors = appearance[index] if appearance else {"roof": "#d9cbbc", "wall": "#b2a79a"}
            cell = (math.floor(x / CELL), math.floor(z / CELL))
            boxes, outlines = cells.setdefault(cell, ([], []))
            height = building["height"]
            roof, wall = (int(colors[key][1:], 16) for key in ("roof", "wall"))
            area = footprint.area
            large_overfill = area >= 220 and rectangle.area >= 1.28 * area
            large_tower = area >= 180 and height >= 24
            if large_overfill or large_tower:
                polygon = orient(footprint.simplify(0.65, preserve_topology=True), sign=1)
                rings = [
                    [[round(px, 2), round(pz, 2)] for px, pz in list(ring.coords)[:-1]]
                    for ring in (polygon.exterior, *polygon.interiors)
                ]
                outlines.append([height, roof, wall, rings])
                continue
            boxes.append([
                round(x, 1), round(z, 1), round(size[0], 1), round(size[1], 1),
                round(angle, 3), round(height, 1), roof, wall,
            ])
    batches = [cells[cell] for cell in sorted(cells)]
    return [boxes for boxes, _ in batches], [
        [index, outlines] for index, (_, outlines) in enumerate(batches) if outlines
    ]


def publish(source, destination):
    if not destination.exists() or not cmp(source, destination, shallow=False):
        source.replace(destination)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--area", required=True, type=Path, help="Path to the area settings JSON")
    args = parser.parse_args()
    output = json.loads(args.area.read_text())["output"]
    floor = read_asset(output, "a")
    buildings = read_asset(output, "buildings")
    boxes, outlines = overview_buildings(buildings["buildings"])
    overview = {
        "floor": {
            "land": simplified(floor.get("land", buildings["ground"]), 4),
            "water": simplified(floor.get("water", []), 4),
            "parks": simplified(floor.get("parks", []), 3),
            "floor": {
                "road": simplified(floor["floor"]["road"], 2),
                "walk": simplified(floor["floor"]["walk"], 2),
                "islands": simplified(floor["floor"]["islands"], 2),
                "a4": [{"faces": simplified(row["faces"], 2)} for row in floor["floor"]["a4"]],
            },
            "decks": [{"faces": simplified(row["faces"], 2)} for row in floor.get("decks", [])],
            "crossings": [
                {"faces": simplified(row["faces"], 0.15), "stripes": simplified(row["stripes"], 0.1)}
                for row in floor["crossings"]
            ],
            "bicycles": [], "paint": [],
        },
        "boxes": boxes,
        "outlines": outlines,
    }
    destination = ROOT / output["directory"] / f'{output["stem"]}-tiles'
    destination.mkdir(exist_ok=True)
    with TemporaryDirectory(prefix=".pack-", dir=destination.parent) as temporary:
        staging = Path(temporary)
        far = gzip.compress(json.dumps(overview, separators=(",", ":")).encode(), mtime=0)
        (staging / "overview.json.gz").write_bytes(far)
        subprocess.run([
            "node", str(Path(__file__).with_name("pack_district_tile_meshes.mjs")),
            str(args.area.resolve()), str(staging), str(CELL), str(len(far)),
        ], cwd=ROOT, check=True)
        index = destination / "index.json"
        old_files = {tile["file"] for tile in json.loads(index.read_text())["tiles"]} if index.exists() else set()
        new_files = {tile["file"] for tile in json.loads((staging / index.name).read_text())["tiles"]}
        for name in sorted(new_files | {"overview.json.gz"}):
            publish(staging / name, destination / name)
        publish(staging / index.name, index)
        for name in old_files - new_files:
            (destination / Path(name).name).unlink(missing_ok=True)
    print(f"{destination.relative_to(ROOT)}: {len(new_files)} detail tiles, {len(far):,} overview bytes, "
          f"{sum(len(shapes) for _, shapes in outlines)} outlined footprints")


if __name__ == "__main__":
    main()
