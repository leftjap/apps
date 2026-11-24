"""Fix the distance and ordering of several surveyed stops along one A2 lane."""
import unittest

from shapely.geometry import LineString
from shapely.ops import unary_union

from survey_signal_sites import split_at_signal_stops


class SurveySignalSitesTest(unittest.TestCase):
    def test_multiple_stops_keep_all_original_segments_and_downstream_link(self):
        lane = [(0, 0), (40, 0), (40, 60)]
        data = dict(links=[
            dict(id='lane', kind='6', points=lane, len=100, next=[1],
                 stop=dict(id='junction', at=99), duplicateOf=None),
            dict(id='connector', kind='1', points=[(40, 60), (40, 70)], len=10, next=[],
                 stop=None, duplicateOf=None),
        ], bundles=[dict(lanes=[0]), dict(lanes=[1])], bus=[0, 1], central=[1])
        sites = [
            dict(kind='junction', at=[40, 60], crossings=['a'], approaches=[dict(link='lane', line='junction', at=99)]),
            dict(kind='midblock', at=[0, 0], crossings=['b'], approaches=[dict(link='lane', line='first', at=20)]),
            dict(kind='midblock', at=[0, 0], crossings=['c'], approaches=[dict(link='lane', line='second', at=80)]),
        ]
        split_at_signal_stops(data, sites)
        links = data['links']
        self.assertEqual([r['next'] for r in links], [[1], [2], [3], []])
        self.assertEqual([r['len'] for r in links], [20, 60, 20, 10])
        self.assertEqual([r['stop']['at'] for r in links[:3]], [20, 60, 19])
        self.assertEqual([r['approaches'][0]['edge'] for r in data['signalSites']], [2, 0, 1])
        self.assertTrue(unary_union([LineString(r['points']) for r in links[:3]]).equals(LineString(lane)))
        self.assertEqual(data['bus'], [0, 1, 2, 3])
        self.assertEqual(data['central'], [3])


if __name__ == '__main__':
    unittest.main()
