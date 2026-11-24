import unittest

from shapely.geometry import LineString, Point, box

from area import area_window


class AreaOutlineTest(unittest.TestCase):
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
