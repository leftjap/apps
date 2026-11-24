import unittest
from unittest.mock import patch

from shapely.geometry import box

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
