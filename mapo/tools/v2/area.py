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
    return json.loads(args.area.read_text())


def asset(area, suffix=''):
    output = area['output']
    return MAPO / output['directory'] / f"{output['stem']}{suffix}.json"
