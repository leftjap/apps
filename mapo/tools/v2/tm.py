# 한국 중부원점 TM(EPSG:5186, GRS80, 원점 38°N 127°E, 축척 1, 가산 200000/600000) ↔ 경위도 ↔ 판 좌표(x 동, z 남, m)
import math

A = 6378137.0
F = 1 / 298.257222101
E2 = 2 * F - F * F
EP2 = E2 / (1 - E2)
LAT0, LON0, K0, FE, FN = math.radians(38.0), math.radians(127.0), 1.0, 200000.0, 600000.0
ORIGIN = (37.5515, 126.919)
M_LAT = 110950
M_LON = 111320 * math.cos(math.radians(ORIGIN[0]))


def _m(lat):
    return A * ((1 - E2 / 4 - 3 * E2 ** 2 / 64 - 5 * E2 ** 3 / 256) * lat - (3 * E2 / 8 + 3 * E2 ** 2 / 32 + 45 * E2 ** 3 / 1024) * math.sin(2 * lat) + (15 * E2 ** 2 / 256 + 45 * E2 ** 3 / 1024) * math.sin(4 * lat) - (35 * E2 ** 3 / 3072) * math.sin(6 * lat))


M0 = _m(LAT0)


def tm_to_ll(x, y):
    m = M0 + (y - FN) / K0
    mu = m / (A * (1 - E2 / 4 - 3 * E2 ** 2 / 64 - 5 * E2 ** 3 / 256))
    e1 = (1 - math.sqrt(1 - E2)) / (1 + math.sqrt(1 - E2))
    p1 = mu + (3 * e1 / 2 - 27 * e1 ** 3 / 32) * math.sin(2 * mu) + (21 * e1 ** 2 / 16 - 55 * e1 ** 4 / 32) * math.sin(4 * mu) + (151 * e1 ** 3 / 96) * math.sin(6 * mu) + (1097 * e1 ** 4 / 512) * math.sin(8 * mu)
    c1 = EP2 * math.cos(p1) ** 2
    t1 = math.tan(p1) ** 2
    n1 = A / math.sqrt(1 - E2 * math.sin(p1) ** 2)
    r1 = A * (1 - E2) / (1 - E2 * math.sin(p1) ** 2) ** 1.5
    d = (x - FE) / (n1 * K0)
    lat = p1 - (n1 * math.tan(p1) / r1) * (d ** 2 / 2 - (5 + 3 * t1 + 10 * c1 - 4 * c1 ** 2 - 9 * EP2) * d ** 4 / 24 + (61 + 90 * t1 + 298 * c1 + 45 * t1 ** 2 - 252 * EP2 - 3 * c1 ** 2) * d ** 6 / 720)
    lon = LON0 + (d - (1 + 2 * t1 + c1) * d ** 3 / 6 + (5 - 2 * c1 + 28 * t1 - 3 * c1 ** 2 + 8 * EP2 + 24 * t1 ** 2) * d ** 5 / 120) / math.cos(p1)
    return math.degrees(lat), math.degrees(lon)


def ll_to_xz(lat, lon):
    return (lon - ORIGIN[1]) * M_LON, -(lat - ORIGIN[0]) * M_LAT


def tm_to_xz(x, y):
    return ll_to_xz(*tm_to_ll(x, y))
