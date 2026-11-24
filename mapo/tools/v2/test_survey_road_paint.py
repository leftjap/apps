import unittest

from shapely.geometry import LineString, box

from survey_road_paint import closed_zones, hatch, split_white_paint, surface_arrow


class SurveyRoadPaintTest(unittest.TestCase):
    def test_near_closed_median_keeps_measured_sides(self):
        edges = [LineString(points) for points in [
            [(0, 0), (30, 0)], [(0, 2), (30, 2)],
            [(0, 0), (0, 2)], [(30, 0), (30, 1.4)],
        ]]
        faces, opened = closed_zones(edges, .7)
        self.assertEqual(len(faces), 1)
        self.assertFalse(opened)
        self.assertAlmostEqual(faces[0].area, 60)
        self.assertTrue(all(faces[0].covers(stripe) for stripe in hatch(faces[0])))

    def test_ambiguous_and_open_ends_do_not_form_zones(self):
        faces, opened = closed_zones([LineString([(0, 0), (3, 0), (3, 8), (0, 8)])], .7)
        self.assertFalse(faces)
        self.assertEqual(len(opened), 1)

    def test_wide_stop_preserves_paint_union(self):
        original = box(-2,-1,2,1)
        line = dict(paths=[[[-3,0],[3,0]]],ink=dict(width=.45,dash=0,color=2),kind='530')
        fine,stops = split_white_paint(original,[line])
        self.assertAlmostEqual(stops.bounds[3]-stops.bounds[1],.45)
        self.assertAlmostEqual(fine.intersection(stops).area,0)
        self.assertTrue(fine.union(stops).equals(original))

    def test_surface_arrow_uses_directed_lane_and_source_box(self):
        envelope = box(-1, -2, 1, 2)
        west = surface_arrow('5372', envelope, LineString([(0, 6), (0, -6)]))
        east = surface_arrow('5372', envelope, LineString([(0, -6), (0, 6)]))
        self.assertTrue(envelope.covers(west))
        self.assertTrue(envelope.covers(east))
        self.assertLess(west.intersection(box(-.85,-2,-.65,2)).area,
                        east.intersection(box(-.85,-2,-.65,2)).area)
        self.assertIsNone(surface_arrow('599', envelope, LineString([(0, 6), (0, -6)])))


if __name__ == '__main__':
    unittest.main()
