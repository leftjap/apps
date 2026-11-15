# 서울 열린데이터광장의 식품 인허가 자료(로그인 없이 받는다, 공공누리 제1유형)에서 판 둘레 영업 중인 가게를 tools/raw/seoul-shops.json 에 저장한다(커밋하지 않는다).
#  - 서울시 일반음식점 인허가 정보(OA-16094), 서울시 휴게음식점 인허가 정보(OA-16095): 마포구·서대문구로 걸러 받는다
#  - 가게마다 [위도, 경도, 종류]. 종류 1 카페(커피숍·다방·제과·아이스크림, 일반음식점 '까페') 2 식당 3 주점(호프·소주방·감성주점·라이브카페) 4 편의점(밤새 켠다)
# 좌표는 EPSG:5174(중부원점, 베셀 타원체)라 7변수로 세계측지계로 옮긴다. 실행: python3 tools/shops.py  (표준 라이브러리만. 받은 파일은 tools/raw/seoul/ 에 둔다)
import csv, io, json, math, os, sys, urllib.parse, urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))
RAW = os.path.join(HERE, 'raw')
DL = os.path.join(RAW, 'seoul')
os.makedirs(DL, exist_ok=True)

ORIGIN = (37.5515, 126.919)
M_LAT = 110950
M_LON = 111320 * math.cos(math.radians(ORIGIN[0]))
R = 2100


def to_xz(lat, lon):
    return (lon - ORIGIN[1]) * M_LON, -(lat - ORIGIN[0]) * M_LAT


# ── EPSG:5174 → 경위도(WGS84) ──
BA, BF = 6377397.155, 1 / 299.1528128
LAT0, LON0, K0, FE, FN = math.radians(38.0), math.radians(127.0028902777778), 1.0, 200000.0, 500000.0
TOWGS84 = (-115.80, 474.99, 674.11, 1.16, -2.31, -1.63, 6.43)


def tm_inverse(x, y, a, f):
    e2 = 2 * f - f * f
    ep2 = e2 / (1 - e2)
    e1 = (1 - math.sqrt(1 - e2)) / (1 + math.sqrt(1 - e2))

    def m(phi):
        e4, e6 = e2 * e2, e2 ** 3
        return a * ((1 - e2 / 4 - 3 * e4 / 64 - 5 * e6 / 256) * phi - (3 * e2 / 8 + 3 * e4 / 32 + 45 * e6 / 1024) * math.sin(2 * phi)
                    + (15 * e4 / 256 + 45 * e6 / 1024) * math.sin(4 * phi) - (35 * e6 / 3072) * math.sin(6 * phi))
    mu = (m(LAT0) + (y - FN) / K0) / (a * (1 - e2 / 4 - 3 * e2 * e2 / 64 - 5 * e2 ** 3 / 256))
    p1 = (mu + (3 * e1 / 2 - 27 * e1 ** 3 / 32) * math.sin(2 * mu) + (21 * e1 ** 2 / 16 - 55 * e1 ** 4 / 32) * math.sin(4 * mu)
          + (151 * e1 ** 3 / 96) * math.sin(6 * mu) + (1097 * e1 ** 4 / 512) * math.sin(8 * mu))
    s, c, t = math.sin(p1), math.cos(p1), math.tan(p1)
    c1, t1 = ep2 * c * c, t * t
    n1 = a / math.sqrt(1 - e2 * s * s)
    r1 = a * (1 - e2) / (1 - e2 * s * s) ** 1.5
    d = (x - FE) / (n1 * K0)
    lat = p1 - (n1 * t / r1) * (d * d / 2 - (5 + 3 * t1 + 10 * c1 - 4 * c1 * c1 - 9 * ep2) * d ** 4 / 24
                                 + (61 + 90 * t1 + 298 * c1 + 45 * t1 * t1 - 252 * ep2 - 3 * c1 * c1) * d ** 6 / 720)
    lon = LON0 + (d - (1 + 2 * t1 + c1) * d ** 3 / 6 + (5 - 2 * c1 + 28 * t1 - 3 * c1 * c1 + 8 * ep2 + 24 * t1 * t1) * d ** 5 / 120) / c
    return lat, lon


def bessel_to_wgs84(lat, lon):
    """베셀 경위도 → 지심 좌표 → 7변수(위치 벡터 방식) → GRS80 경위도"""
    e2 = 2 * BF - BF * BF
    n = BA / math.sqrt(1 - e2 * math.sin(lat) ** 2)
    X = n * math.cos(lat) * math.cos(lon)
    Y = n * math.cos(lat) * math.sin(lon)
    Z = n * (1 - e2) * math.sin(lat)
    tx, ty, tz, rx, ry, rz, ds = TOWGS84
    rx, ry, rz = (math.radians(v / 3600) for v in (rx, ry, rz))
    k = 1 + ds * 1e-6
    X2 = tx + k * (X - rz * Y + ry * Z)
    Y2 = ty + k * (rz * X + Y - rx * Z)
    Z2 = tz + k * (-ry * X + rx * Y + Z)
    a, f = 6378137.0, 1 / 298.257223563
    e2w = 2 * f - f * f
    p = math.hypot(X2, Y2)
    la = math.atan2(Z2, p * (1 - e2w))
    for _ in range(6):
        nn = a / math.sqrt(1 - e2w * math.sin(la) ** 2)
        la = math.atan2(Z2 + e2w * nn * math.sin(la), p)
    return math.degrees(la), math.degrees(math.atan2(Y2, X2))


def post(inf, gu_code, name):
    path = os.path.join(DL, name)
    if os.path.exists(path):
        return path
    form = {'srvType': 'S', 'infId': inf, 'serviceKind': 1, 'pageNo': 1, 'ssUserId': 'SAMPLE_VIEW', 'strWhere': '', 'strOrderby': '', 'filterCol': 'OPNSFTEAMCODE', 'txtFilter': gu_code}
    req = urllib.request.Request('https://datafile.seoul.go.kr/bigfile/iot/sheet/csv/download.do', data=urllib.parse.urlencode(form).encode(),
                                 headers={'User-Agent': 'mapo-live-3d-bake/0.1', 'Referer': 'https://data.seoul.go.kr/'})
    with urllib.request.urlopen(req, timeout=600) as res:
        data = res.read()
        if 'attachment' not in res.headers.get('Content-Disposition', ''):
            sys.exit(f'{name} 을 받지 못했다: {data[:200]!r}')
    open(path, 'wb').write(data)
    print(f'{name}: {len(data) / 1e6:.1f}MB', file=sys.stderr)
    return path


CAFE = {'커피숍', '다방', '떡카페', '전통찻집', '아이스크림', '과자점', '까페'}
BAR = {'호프/통닭', '정종/대포집/소주방', '감성주점', '라이브카페'}
SKIP = {'철도역구내', '극장', '백화점', '유원지', '푸드트럭', '출장조리', '키즈카페'}


def kind(src, up):
    if up in SKIP:
        return 0
    if up in CAFE:
        return 1
    if up in BAR:
        return 3
    if up == '편의점':
        return 4
    return 1 if src == 'OA-16095' and up == '기타 휴게음식점' else 2


shops = []
count = {}
for inf in ['OA-16094', 'OA-16095']:
    for gu, code in [('마포구', '3130000'), ('서대문구', '3120000')]:
        p = post(inf, code, f'{inf}-{gu}.csv')
        for r in csv.DictReader(io.StringIO(open(p, 'rb').read().decode('cp949', 'replace'))):
            if not r['영업상태명'].startswith('영업'):
                continue
            k = kind(inf, r['업태구분명'].strip())
            try:
                x, y = float(r['좌표정보(X)']), float(r['좌표정보(Y)'])
            except ValueError:
                continue
            if not k:
                continue
            lat, lon = bessel_to_wgs84(*tm_inverse(x, y, BA, BF))
            if math.hypot(*to_xz(lat, lon)) > R:
                continue
            shops.append([round(lat, 7), round(lon, 7), k])
            count[k] = count.get(k, 0) + 1
json.dump({'src': '서울시 일반음식점·휴게음식점 인허가 정보(OA-16094·16095)', 'shops': shops}, open(os.path.join(RAW, 'seoul-shops.json'), 'w'))
print(f'판 둘레 영업 중 가게 {len(shops)}곳: 카페 {count.get(1, 0)}, 식당 {count.get(2, 0)}, 주점 {count.get(3, 0)}, 편의점 {count.get(4, 0)}', file=sys.stderr)
