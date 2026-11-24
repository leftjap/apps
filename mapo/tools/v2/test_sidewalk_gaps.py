"""Small geometry regressions for unmarked sidewalk continuations."""
import unittest

from shapely.geometry import box

from hapjeong_hd import rings
from hapjeong_walk import Network
from sidewalk_gaps import sidewalk_gaps, widen_gap_bands


class SidewalkGapTests(unittest.TestCase):
    def test_connects_same_curb_but_not_across_surveyed_lane(self):
        road = box(0, 0, 30, 4)
        foot = box(0, 0, 11, 4).union(box(16, 0, 30, 4))
        floor = {'floor': {'road': rings(road)}, 'crossingAudit': []}
        links, _ = sidewalk_gaps(foot, floor, [], [], 14)
        self.assertEqual(len(links), 1)
        self.assertAlmostEqual(links[0]['gap'], 5)
        lanes = [{'kind': '0', 'points': [(13, -2), (13, 6)]}]
        links, rejected = sidewalk_gaps(foot, floor, lanes, [], 14)
        self.assertEqual(links, [])
        self.assertIn('surveyed lane', rejected[0]['reason'])

    def test_parallel_pavements_are_opposite_curbs(self):
        road = box(0, 0, 30, 12)
        foot = box(0, 0, 30, 4).union(box(0, 8, 30, 12))
        floor = {'floor': {'road': rings(road)}, 'crossingAudit': []}
        links, rejected = sidewalk_gaps(foot, floor, [], [], 14)
        self.assertEqual(links, [])
        self.assertIn('opposite curb', rejected[0]['reason'])

    def test_centres_the_band_at_the_narrower_sidewalk_width(self):
        road = box(0, -3, 30, 3)
        foot = box(0, -2, 11, 2).union(box(16, -1.5, 30, 1.5))
        strip = box(11, -1, 16, 1)
        network = Network(foot.union(strip))
        ends = (10, 0), (17, 0)
        self.assertTrue(network.edge(*ends))
        self.assertLess(network.edges[ends][1] - network.edges[ends][0], 22)
        links = [{'at': ends, 'width': 2, 'faces': rings(strip)}]
        widened = widen_gap_bands(network, foot, road, [], links)
        self.assertEqual(widened.edges[ends], (-11, 11))
        self.assertEqual(set(widened.edges), set(network.edges))
        self.assertEqual(links[0]['bandMeters'], 2.2)


if __name__ == '__main__':
    unittest.main()
