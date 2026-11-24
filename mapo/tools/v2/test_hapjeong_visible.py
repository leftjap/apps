"""Focused tests for the optional 240-second visible gate."""
import json
import unittest

from check_hapjeong_visible import Stationary, gate_failures, measure


class VisibleGateTest(unittest.TestCase):
    def setUp(self):
        self.rules = {
            'P1': dict(people_on_red=0, cars_on_red=0, signed_face_cars=0),
            'P2': dict(unsignalized_cars=0, body_contacts=0, occupied_landing_passages=0),
            'P3': dict(island_wait_on_red=7),
            'P4': dict(models=6, missing_direction=0, visible_events=0),
            'P5': dict(off_floor=0, invalid=0, stuck=4),
            'P6': dict(peak_5m=25, walk_blocked=5),
            'C3': dict(min_left_passed=1),
            'C5': dict(stuck=0, visible_events=0, off_floor=0, overlap=0),
        }
        stop = dict(calls=[0, 120], boarded=1, alighted=1, waiting=[1, 1, 0, 1, 0, 1, 1, 0, 0])
        self.visible = dict(road_red_over_30=[], stuck_over_120=[], sidewalk_30_to_120=[],
                            buses=[dict(stop, key='A'), dict(stop, key='B')], legacy={'cars':True, 'people':True})

    def test_records_other_metrics_without_gating_on_them(self):
        self.assertEqual(gate_failures(self.rules, self.visible), [])

    def test_cannot_pass_with_a_missing_bus_or_prior_hash(self):
        self.visible['buses'][0]['waiting'] = [1, 1, 0, 1, 0, 1, 0, 0, 0]
        self.visible['legacy']['people'] = False
        self.assertEqual({r['gate'] for r in gate_failures(self.rules, self.visible)}, {7, 8})

    def test_red_spells_are_continuous_and_split_when_walker_moves(self):
        spells = Stationary()
        for sec in range(31):
            spells.frame(sec, [((1, 'out'), (0, 0), 'cross', 'A')])
        spells.frame(31, [])
        for sec in range(32, 64):
            spells.frame(sec, [((1, 'out'), (0, 0), 'cross', 'A')])
        spells.frame(64, [((1, 'out'), (0.2, 0), 'cross', 'A')])
        longest, = spells.over(30)
        self.assertEqual((longest['start'], longest['end'], longest['seconds']), (32, 63, 31))
        self.assertEqual(spells.over(120), [])

    def test_sidewalk_takes_priority_over_overlapping_road_and_crossing(self):
        def area(left, right):
            return [[[(left, 0), (right, 0), (right, 4), (left, 4)]]]

        meta = dict(offset=0, cycle=120, duration=240, platforms=[],
                    crosswalks=[dict(id='TEST', sig=True, associated=True)])
        plan = dict(faces=[dict(id='TEST', faces=area(0, 5))],
                    phase=[dict(start=0, duration=120, walk=[], green=[1])])
        floor = dict(walk=area(0, 2), road=area(0, 5))
        frames = [json.dumps(meta)]
        for t in range(32):
            people = [[1, 1, 1, 'cross', 0, 2, True, False, False, None],
                      [2, 3, 1, 'cross', 0, 2, True, False, False, None]]
            frames.append(json.dumps([t, [], people, None]))
        result = measure(iter(frames),plan,floor,{'landings': {'TEST': []}})
        self.assertEqual([r['id'] for r in result['road_red_over_30']], [2])
        self.assertEqual([r['id'] for r in result['sidewalk_30_to_120']], [1])

    def test_actual_late_road_event_is_a_failure(self):
        self.visible['road_red_over_30'] = [{'id': 42}]
        self.assertEqual([r['gate'] for r in gate_failures(self.rules, self.visible)], [5])


if __name__ == '__main__':
    unittest.main()
