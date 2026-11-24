import unittest
from pathlib import Path
from tempfile import TemporaryDirectory

from shapely.geometry import LineString, Point, box

from area import area_window, read_asset, write_asset


class AreaOutlineTest(unittest.TestCase):
    def test_polygon_keeps_its_hole(self):
        polygon = {'type': 'Polygon', 'coordinates': [
            [[0, 0], [10, 0], [10, 10], [0, 10], [0, 0]],
            [[3, 3], [7, 3], [7, 7], [3, 7], [3, 3]],
        ]}
        window = area_window({'window': [0, 0, 10, 10], 'outline': polygon})
        self.assertEqual(window.area, 84)
        self.assertFalse(window.covers(Point(5, 5)))
        self.assertTrue(window.covers(Point(1, 1)))

    def test_compressed_assets_round_trip_with_deterministic_bytes(self):
        data = {'name': '홍대 일대', 'face': [[0.1234, 2.3456]]}
        with TemporaryDirectory() as folder:
            area = {'output': {'directory': folder, 'stem': 'district', 'gzip': True}}
            path = write_asset(area, '-a', data)
            self.assertEqual(path, Path(folder, 'district-a.json.gz'))
            first = path.read_bytes()
            write_asset(area, '-a', data)
            self.assertEqual(path.read_bytes(), first)
            self.assertEqual(read_asset(area, '-a'), data)

    def test_rectangle_with_exclusion(self):
        window = area_window({'window': [0, 0, 10, 10], 'excludeWindows': [[0, 0, 4, 4]]})
        self.assertTrue(window.equals(box(0, 0, 10, 10).difference(box(0, 0, 4, 4))))

    def test_diagonal_strip_joins_windows_and_stays_within_source_limits(self):
        path = [[0, 0], [30, 30]]
        limit = [-2, -2, 32, 32]
        window = area_window({'window': limit, 'coverage': {
            'windows': [[-2, -2, 3, 3], [28, 28, 32, 32]], 'limits': limit,
            'strips': [{'axis': path, 'halfWidth': 2}],
        }})
        expected = (LineString(path).buffer(2, quad_segs=12).union(box(-2, -2, 3, 3))
                    .union(box(28, 28, 32, 32)).intersection(box(*limit)))
        self.assertTrue(window.equals(expected))
        self.assertTrue(window.covers(Point(15, 15)))
        self.assertFalse(window.covers(Point(15, 2)))


if __name__ == '__main__':
    unittest.main()
