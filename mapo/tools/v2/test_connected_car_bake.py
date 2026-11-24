import unittest
from unittest.mock import patch

from shapely.geometry import LineString, box

import hapjeong_cars as bake


def lane(key, kind, points, start, end):
    return {'id': key, 'kind': kind, 'points': points, 'raw': points,
            'from_id': start, 'to': end, 'line': LineString(points), 'next': []}


class ConnectedCarBakeTest(unittest.TestCase):
    def test_does_not_bridge_proximity_without_both_a1_nodes(self):
        first = lane('first','6',[(0,1),(2,1)],'a','b')
        outgoing = lane('out','6',[(2.01,1),(4,1)],'c','d')
        separated = lane('upper','6',[(2.01,1),(4,1)],'u','v')
        first['raw'] = [(0,1,20),(2,1,20)]
        outgoing['raw'] = [(2.01,1,20.01),(4,1,20.01)]
        separated['raw'] = [(2.01,1,24),(4,1,24)]
        with patch.object(bake,'WINDOW',box(-1,0,5,3)):
            bake.connect([first,outgoing,separated], {'b': first['raw'][-1]},
                         node_tolerance=.05)
        self.assertEqual(first['next'], [])
        self.assertEqual(outgoing['points'][0], (2.01,1))

    def test_connects_same_node_survey_rounding_without_moving_line(self):
        first = lane('first','4',[(0,1),(2,1)],'a','b')
        outgoing = lane('out','1',[(2.03,1),(4,1)],'b','c')
        unrelated = lane('other','1',[(2.03,1),(4,1)],'d','e')
        with patch.object(bake,'WINDOW',box(-1,0,5,3)):
            bake.connect([first,outgoing,unrelated], {'b': (2,1)}, node_tolerance=.05)
        self.assertEqual(first['next'], [1])
        self.assertEqual(outgoing['points'][0], (2.03,1))

    def test_short_boundary_sliver_is_distinct_from_interior_short_link(self):
        boundary = LineString([(0,1),(.392,1)])
        interior = LineString([(1,1),(1.392,1)])
        with patch.object(bake,'WINDOW',box(0,0,2,2)):
            self.assertTrue(bake.short_boundary_piece(boundary))
            self.assertFalse(bake.short_boundary_piece(interior))
