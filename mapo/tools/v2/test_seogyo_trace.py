"""Subpixel digitizing can be tested independently of the 3D camera."""
import math
import unittest
from pathlib import Path
from xml.etree import ElementTree as ET

from seogyo_trace import build

ROOT = Path(__file__).resolve().parents[2] / 'public/data/v2'
NS = {'s': 'http://www.w3.org/2000/svg'}


class SeogyoTraceTest(unittest.TestCase):
    def setUp(self):
        self.road, self.lines = (ET.parse(ROOT / f'seogyo-{name}.svg').getroot()
                                 for name in ('road', 'lines'))

    def test_same_registered_vectors_for_both_views(self):
        for layer in (self.road, self.lines):
            self.assertEqual(layer.get('viewBox'), '0 0 780 780')
            self.assertEqual(layer.find("s:g[@id='survey-frame']", NS).get('transform'), 'rotate(4.6 390 390)')
            self.assertIsNone(layer.find('.//s:image', NS))
        def marks(layer):
            return [(e.tag, e.get('d'), e.get('x1'), e.get('y1'), e.get('x2'), e.get('y2'))
                    for e in layer.findall(".//*[@id='paint']//*", NS)]
        self.assertTrue(len(marks(self.road)) > 100)
        self.assertEqual(marks(self.road), marks(self.lines))
        self.assertIsNotNone(self.road.find(".//*[@id='ground']"))
        self.assertIsNone(self.lines.find(".//*[@id='ground']"))

    def test_each_approach_has_two_distinct_yellow_centre_stripes(self):
        group = self.road.find(".//*[@id='divider']")
        stripes = group.findall('s:path', NS)
        self.assertEqual(len(stripes), 8)
        for first, second in zip(stripes[::2], stripes[1::2]):
            self.assertEqual(first.get('d'), second.get('d'))
            self.assertNotEqual(first.get('transform'), second.get('transform'))

    def test_shipped_layers_match_the_digitized_source(self):
        for name in ('road', 'lines'):
            self.assertEqual((ROOT / f'seogyo-{name}.svg').read_text(), build(name == 'lines'))

    def test_crossing_halves_hit_independently_sampled_white_stripes(self):
        # Centres on separate clear stripes in each photographed half (0.2 m per unit).
        samples = {'upper': [(338, 251), (385, 273)], 'lower': [(348, 457), (367, 481)],
                   'left': [(228, 373), (252, 387)], 'right': [(505, 389), (520, 370)]}
        for side, points in samples.items():
            group = self.road.find(f".//*[@id='crossing-{side}']")
            segments = [[float(e.get(k)) for k in ('x1', 'y1', 'x2', 'y2')]
                        for e in group.findall('s:line', NS)]
            for x, y in points:
                distances = []
                for ax, ay, bx, by in segments:
                    dx, dy = bx-ax, by-ay
                    t = max(0, min(1, ((x-ax)*dx + (y-ay)*dy) / (dx*dx+dy*dy)))
                    distances.append(math.hypot(ax+t*dx-x, ay+t*dy-y))
                self.assertLess(min(distances), 1.5, (side, x, y))


if __name__ == '__main__':
    unittest.main()
