"""Geometry rules shared by calibrated and uncalibrated aerial drawings."""
import unittest

from shapely.geometry import LineString, Point, box

from aerial_rules import parallel_duplicate
from bake_aerial_ground import Frame, Mark


class PlacementTest(unittest.TestCase):
    def test_one_metre_duplicate_keeps_crossing_adjacent_lane_and_branch(self):
        line = LineString([(0,0),(16,0)])
        self.assertTrue(parallel_duplicate(line,LineString([(16,.8),(0,.8)]),1))
        self.assertFalse(parallel_duplicate(line,LineString([(16,2.6),(0,2.6)]),1))
        self.assertFalse(parallel_duplicate(line,LineString([(0,-.2),(16,.2)]),1))
        self.assertFalse(parallel_duplicate(line,LineString([(0,.2),(10,.2),(16,1.5)]),1))

    def test_point_duplicate_is_same_kind_and_at_most_one_metre(self):
        from aerial_placement import same_kind_point
        rows = [(7,Point(0,0),'first')]
        self.assertEqual(same_kind_point(rows,7,Point(1,0)),'first')
        self.assertIsNone(same_kind_point(rows,8,Point(0,0)))
        self.assertIsNone(same_kind_point(rows,7,Point(1.01,0)))

    def test_whole_face_duplicate_does_not_remove_adjacent_crossing(self):
        from aerial_placement import duplicate_face
        face = box(0,0,3,16)
        self.assertTrue(duplicate_face(face,box(.7,.1,3.7,16.1)))
        self.assertFalse(duplicate_face(face,box(3.2,0,6.2,16)))
        self.assertFalse(duplicate_face(face,box(0,0,3,4)))

    def test_arrow_uses_lane_centre_tangent_and_current_stop(self):
        from aerial_placement import lane_slot
        borders = [Mark('a',6,1,LineString([(0,-1.5),(25,-1.5)])),
                   Mark('b',6,1,LineString([(0,1.5),(25,1.5)]))]
        frame = Frame(0,0,0)
        line = {'id':'stop','parts':[[frame.geographic(23,-1.5),frame.geographic(23,1.5)]]}
        slot = lane_slot(Point(10,.4),(1,0),borders,[line],frame)
        self.assertIsNotNone(slot)
        self.assertAlmostEqual(slot['point'].x,17,places=2)
        self.assertAlmostEqual(slot['point'].y,0,places=2)
        self.assertEqual(slot['stop'],'stop')
        self.assertEqual(slot['bearing'],0)
        moved = {'id':'stop','parts':[[frame.geographic(20,-1.5),frame.geographic(20,1.5)]]}
        following = lane_slot(Point(10,.4),(1,0),borders,[moved],frame)
        self.assertAlmostEqual(following['point'].x,14,places=2)
        self.assertIsNone(lane_slot(Point(10,.4),(1,0),borders[:1],[line],frame))

    def test_source_segments_of_one_lane_do_not_create_a_second_slot(self):
        from aerial_placement import same_stop_lane
        frame = Frame(0,0,0)
        stop = LineString([(10,0),(10,9)])
        a = {'stop':'stop','at':frame.geographic(4,4.2),'lane':['a','curb'],'laneWidth':3.0}
        b = {'stop':'stop','at':frame.geographic(4,2.85),'lane':['earlier','curb'],'laneWidth':3.1}
        adjacent = {'stop':'stop','at':frame.geographic(4,7.2),'lane':['curb','outside'],'laneWidth':3.0}
        self.assertTrue(same_stop_lane(a,b,{'stop':stop},frame))
        self.assertFalse(same_stop_lane(a,adjacent,{'stop':stop},frame))

    def test_crosswalk_shadow_uses_final_crossing_and_stop(self):
        from aerial_placement import stop_shadows
        face = box(8,-3,11,3)
        stop = Mark('a',4,1,LineString([(5,-1),(5,1)]))
        shadow = stop_shadows([stop],[face])
        self.assertTrue(shadow.covers(Point(6,0)))
        self.assertFalse(shadow.covers(Point(6,2)))
        self.assertFalse(shadow.covers(Point(4,0)))
        moved = Mark('a',4,1,LineString([(3,-1),(3,1)]))
        self.assertTrue(stop_shadows([moved],[box(7,-3,12,3)]).covers(Point(4,0)))


if __name__=='__main__':
    unittest.main()
