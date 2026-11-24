import unittest

from check_hapjeong_car_run import ConnectedStops


class ConnectedStopsTest(unittest.TestCase):
    def test_uses_positions_even_with_positive_speed_or_red_signal(self):
        audit = ConnectedStops(120)
        def describe(t, row):
            return [t, *row[:3]]
        row = [6, 24., 65.] + [0] * 26
        row[9] = .2
        row[20] = 1
        audit.add(0, [row], describe)
        audit.add(120, [row], describe)
        self.assertEqual(audit.over_cycle, [])
        audit.add(120.1, [row], describe)
        self.assertEqual(len(audit.over_cycle), 1)
        self.assertEqual(audit.over_cycle[0][1], 6)

    def test_anchors_break_on_displacement_and_absence(self):
        audit = ConnectedStops(120)
        describe = lambda t, row: [t, *row[:3]]
        audit.add(0, [[1, 0, 0], [2, 0, 0]], describe)
        audit.add(100, [[1, 1, 0]], describe)
        audit.add(130, [[1, 1, 0], [2, 0, 0]], describe)
        self.assertEqual(audit.over_cycle, [])


if __name__ == '__main__':
    unittest.main()
