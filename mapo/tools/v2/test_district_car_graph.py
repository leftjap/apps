import unittest

from shapely.geometry import LineString, box

from hapjeong_cars import directed_pieces
from district_car_graph import grade_crossings, plan_routes


class DistrictCarGraphTest(unittest.TestCase):
    def test_clip_keeps_direction_and_does_not_join_across_hole(self):
        outline = box(0, 0, 20, 10).difference(box(8, 3, 12, 7))
        lane = LineString([(25, 5), (-5, 5)])
        parts = list(directed_pieces(lane, outline))
        self.assertEqual([list(part.coords) for part in parts], [
            [(20, 5), (12, 5)], [(8, 5), (0, 5)],
        ])

    def test_grade_crossing_uses_height_at_intersection(self):
        rows = [
            {'id': 'surface', 'line': LineString([(0, 5), (20, 5)]), 'heights': [1, 1], 'next': []},
            {'id': 'bridge', 'line': LineString([(10, 0), (10, 10)]), 'heights': [3, 11], 'next': []},
            {'id': 'same-level', 'line': LineString([(17, 0), (17, 10)]), 'heights': [1, 2], 'next': []},
        ]
        pairs = grade_crossings(rows)
        self.assertEqual([(p['lower'], p['upper']) for p in pairs], [(0, 1)])

    def test_internal_portals_require_original_lane_terminals(self):
        def lane(key, kind, x0, x1, next_=(), reasons=()):
            return dict(id=key, kind=kind, points=[(x0, 1), (x1, 1)], len=x1-x0,
                        next=list(next_), duplicateOf=None, disabled=list(reasons))
        rows = [lane('edge', '6', 0, 20, [1]), lane('terminal', '6', 20, 45),
                lane('connector', '1', 45, 60), lane('blocked', '6', 0, 30, [4], ['grade']),
                lane('new-dead-end', '6', 30, 45)]
        plan = plan_routes(rows, [], box(0, 0, 100, 100))
        self.assertEqual(plan['selected'], [0, 1])
        self.assertEqual([p['edge'] for p in plan['entries']], [0])
        self.assertEqual([p['edge'] for p in plan['exits']], [1])
        self.assertFalse(plan['exits'][0]['boundary'])
