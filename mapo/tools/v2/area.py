"""Load the shared area manifest for the survey tools."""
import argparse
import json
from pathlib import Path

MAPO = Path(__file__).resolve().parents[2]
DEFAULT_AREA = Path(__file__).with_name('areas') / 'hapjeong.json'


def load_area():
    parser = argparse.ArgumentParser(add_help=False, allow_abbrev=False)
    parser.add_argument('--area', type=Path, default=DEFAULT_AREA)
    args, _ = parser.parse_known_args()
    return read_area(args.area)


def read_area(path=DEFAULT_AREA):
    return json.loads(path.read_text())


def asset(area, suffix='', *, root=MAPO):
    output = area['output']
    return root / output['directory'] / f"{output['stem']}{suffix}.json"
