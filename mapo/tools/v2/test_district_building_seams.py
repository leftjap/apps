import unittest
from unittest.mock import patch

from shapely.geometry import box

import check_connected_map
from hapjeong_buildings import connected_building_faces


class DistrictBuildingSeams(unittest.TestCase):
    def test_joins_same_roof_across_survey_roundoff(self):
        address = dict(zip(('명칭', '종류', '용도', '층수', '도로명', '건물본번', '건물부번'),
                           ('', '일반주택', '주택', '2', '동교로', '256', '4')))
        sheets = [(box(0, 0, 5, 10), {'도엽코드': 'a'}), (box(5, 0, 10, 10), {'도엽코드': 'b'})]
        parts = [(box(1, 1, 5, 6), {**address, 'sheet': 'a', 'UFID': '1'}),
                 (box(5.0001, 1.0001, 9, 6.0001), {**address, 'sheet': 'b', 'UFID': '2'})]
        with (
            patch('hapjeong_buildings.AREA', {'outline': {}}),
            patch('hapjeong_buildings.WINDOW', box(0, 0, 10, 10)),
            patch('hapjeong_buildings.survey_faces', side_effect=lambda code, **_: parts if code.startswith('B') else sheets),
        ):
            buildings = list(connected_building_faces())
        self.assertEqual(len(buildings), 1)
        self.assertEqual(buildings[0][0].geom_type, 'Polygon')
        self.assertAlmostEqual(buildings[0][0].area, 40, places=2)


class SheetSeamFaces(unittest.TestCase):
    SHEETS = [(box(0, 0, 10, 10), {'도엽코드': 'a'}), (box(10, 0, 20, 10), {'도엽코드': 'b'})]

    def seam_faces(self, face):
        with patch.object(check_connected_map, 'WINDOW', box(0, 0, 20, 10)):
            return check_connected_map.sheet_parity([], [face], self.SHEETS)['walk']

    def test_face_clipped_on_the_seam_is_reported(self):
        self.assertEqual(len(self.seam_faces(box(5, 2, 10, 6))), 1)

    def test_face_clipped_a_roundoff_short_of_the_seam_is_reported(self):
        hits = self.seam_faces(box(5, 2, 9.998, 6))
        self.assertEqual(len(hits), 1)
        self.assertAlmostEqual(hits[0]['withinCentimetreM'], 4, places=1)

    def test_face_joined_across_the_seam_keeps_a_seam_parallel_edge(self):
        joined = box(5, 2, 15, 6).difference(box(9.998, 4.5, 15.1, 6.1))
        self.assertEqual(self.seam_faces(joined), [])

    def test_face_joined_across_the_seam_still_fails_on_an_exact_seam_edge(self):
        joined = box(5, 2, 15, 6).difference(box(10, 4.5, 15.1, 6.1))
        hits = self.seam_faces(joined)
        self.assertEqual(len(hits), 1)
        self.assertAlmostEqual(hits[0]['lengthM'], 1.5, places=2)
