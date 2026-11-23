import unittest

from shapely.geometry import box

from aerial_buildings import extract


def raw_ring(west, south, east, north):
    return [[south, west], [north, west], [north, east], [south, east], [south, west]]


class AerialBuildingsTest(unittest.TestCase):
    def test_keeps_courtyard_and_disjoint_footprint_in_lon_lat_order(self):
        record = {'f': 3, 'h': 0, 'r': [
            raw_ring(126.90, 37.50, 126.91, 37.51),
            raw_ring(126.902, 37.502, 126.904, 37.504),
            raw_ring(126.92, 37.50, 126.93, 37.51),
        ]}
        result = extract([record], box(126.89, 37.49, 126.94, 37.52))
        self.assertEqual(sorted(len(row['rings']) for row in result), [1, 2])
        for row in result:
            self.assertEqual(row['floors'], 3)
            self.assertIsNone(row['height'])
            for ring in row['rings']:
                self.assertTrue(all(126 < lon < 127 and 37 < lat < 38 for lon, lat in ring))

    def test_crossing_boundary_keeps_whole_building_and_excludes_distant_part(self):
        record = {'f': 0, 'h': 8.1, 'r': [
            raw_ring(126.90, 37.50, 126.91, 37.51),
            raw_ring(126.92, 37.50, 126.93, 37.51),
        ]}
        result = extract([record], box(126.899, 37.499, 126.901, 37.501))
        self.assertEqual(len(result), 1)
        self.assertIsNone(result[0]['floors'])
        self.assertEqual(result[0]['height'], 8.1)
        self.assertIn([126.91, 37.51], result[0]['rings'][0])


if __name__ == '__main__':
    unittest.main()
