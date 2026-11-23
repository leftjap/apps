"""No-adjustment road paint rules and corridor continuity."""
import unittest

from shapely.geometry import LineString, Point, box
from shapely.ops import unary_union

from bake_aerial_ground import Frame, Mark, build

SEOGYO = (126.91820684511595,37.55267169896349)
HAPJEONG = (126.91344791581167,37.549291798107255)


class AerialRulesTest(unittest.TestCase):
    def test_centred_zebra_spacing_width_and_half_offset(self):
        from aerial_rules import zebra
        face = box(-6,-4,6,4)
        halves,stripes = zebra(face,True)
        self.assertEqual(len(halves),2)
        first,second = [[s for s in stripes if half.covers(s.centroid)] for half in halves]
        for stripes in (first,second):
            centres = sorted(s.centroid.x for s in stripes)
            for a,b in zip(centres,centres[1:]):
                self.assertAlmostEqual(b-a,1.1)
            self.assertTrue(all(abs(s.bounds[2]-s.bounds[0]-.49)<1e-8 for s in stripes))
        x = lambda group: sorted(s.centroid.x for s in group)
        self.assertAlmostEqual((x(first)[0]+x(first)[-1])/2,0)
        self.assertAlmostEqual((x(second)[0]-x(first)[0])%1.1,.55)

    def test_only_close_stops_move_outwards_to_one_metre_paint_clearance(self):
        from aerial_rules import move_stop
        crossing = box(-6,-4,6,4)
        for y,expected in ((-4.4,-5.225),(4.6,5.225),(8,8)):
            line = LineString([(-4,y),(1,y)])
            got = move_stop(line,[crossing],.45)
            self.assertAlmostEqual(got.centroid.y,expected)
            self.assertAlmostEqual(got.length,line.length)

    def test_duplicate_guides_keep_crossings_branches_and_opposite_subtypes(self):
        from aerial_rules import merge_guides
        base = Mark('a',12,1,LineString([(0,0),(12,0)]))
        duplicate = Mark('b',12,1,LineString([(12,.4),(0,.4)]))
        branch = Mark('c',12,1,LineString([(0,.15),(7,.2),(12,2)]))
        crossing = Mark('d',12,1,LineString([(6,-5),(6,5)]))
        other_subtype = Mark('e',12,2,LineString([(0,-.2),(12,-.2)]))
        result,merged = merge_guides([base,duplicate,branch,crossing,other_subtype])
        self.assertEqual({m.id for m in result},{'a','c','d','e'})
        self.assertEqual(merged,{'a':['b']})

    def test_corridor_is_continuous_and_carries_no_site_adjustments(self):
        ground = build(SEOGYO,156,{},end=HAPJEONG)
        frame = Frame(*SEOGYO)
        from shapely.geometry import Polygon
        holes = ground.get('roadHoles',[[] for _ in ground['road']])
        road = unary_union([Polygon([frame.project(p) for p in ring],
                                   [[frame.project(p) for p in hole] for hole in holes[i]])
                            for i,ring in enumerate(ground['road'])])
        a,b = Point(0,0),Point(frame.project(HAPJEONG))
        self.assertTrue(any(component.buffer(1).covers(a) and component.buffer(1).covers(b)
                            for component in getattr(road,'geoms',[road])))
        self.assertGreater(len(ground['crossings']),4)
        self.assertGreater(len(ground['lines']),100)
        self.assertEqual(ground['fixes'],[])
        self.assertTrue(all(not feature['fixes'] for feature in ground['lines']+ground['crossings']))


if __name__ == '__main__':
    unittest.main()
