# 서울 열린데이터광장에서 로그인 없이 받는 건물 자료로 판 둘레 건물의 층수·높이·용도를 tools/raw/ 에 저장한다(커밋하지 않는다).
#  - 서울시 건물 태양에너지 등급도(OA-15944, 2018 수치지도 건물): 건물마다 가운데 점(UTM-K)·층수·높이(층수 × 3.5m)·바닥 면적·건물명
#    → tools/raw/seoul-bldg-points.json  [위도, 경도, 층수, 바닥 면적(㎡), 건물명]
#  - 서울시 건축물대장 표제부(OA-22424, 매일 갱신): 마포구·서대문구 건물(동)마다 도로명주소·동명·주용도·지상층수·높이·건축면적·세대수·가구수
#    → tools/raw/seoul-bldg-titles.json
# 둘 다 공공누리 제1유형(출처 표시). 실행: python3 tools/buildings.py  (표준 라이브러리만. 받은 파일은 tools/raw/seoul/ 에 둔다)
import csv, io, json, math, os, sys, urllib.parse, urllib.request, zipfile

HERE = os.path.dirname(os.path.abspath(__file__))
RAW = os.path.join(HERE, 'raw')
DL = os.path.join(RAW, 'seoul')
os.makedirs(DL, exist_ok=True)

ORIGIN = (37.5515, 126.919)
M_LAT = 110950
M_LON = 111320 * math.cos(math.radians(ORIGIN[0]))
R = 2100  # 판 반지름 + 여유(m)


def to_xz(lat, lon):
    return (lon - ORIGIN[1]) * M_LON, -(lat - ORIGIN[0]) * M_LAT


# ── EPSG:5179(UTM-K, GRS80, 원점 38°N 127.5°E, k 0.9996, FE 1,000,000 FN 2,000,000) → 경위도 ──
A = 6378137.0
F = 1 / 298.257222101
E2 = 2 * F - F * F
EP2 = E2 / (1 - E2)
LAT0, LON0, K0, FE, FN = math.radians(38.0), math.radians(127.5), 0.9996, 1000000.0, 2000000.0
E1 = (1 - math.sqrt(1 - E2)) / (1 + math.sqrt(1 - E2))


def _m(phi):
    e4, e6 = E2 * E2, E2 ** 3
    return A * ((1 - E2 / 4 - 3 * e4 / 64 - 5 * e6 / 256) * phi - (3 * E2 / 8 + 3 * e4 / 32 + 45 * e6 / 1024) * math.sin(2 * phi)
                + (15 * e4 / 256 + 45 * e6 / 1024) * math.sin(4 * phi) - (35 * e6 / 3072) * math.sin(6 * phi))


M0 = _m(LAT0)


def utmk_to_ll(x, y):
    mu = (M0 + (y - FN) / K0) / (A * (1 - E2 / 4 - 3 * E2 * E2 / 64 - 5 * E2 ** 3 / 256))
    p1 = (mu + (3 * E1 / 2 - 27 * E1 ** 3 / 32) * math.sin(2 * mu) + (21 * E1 ** 2 / 16 - 55 * E1 ** 4 / 32) * math.sin(4 * mu)
          + (151 * E1 ** 3 / 96) * math.sin(6 * mu) + (1097 * E1 ** 4 / 512) * math.sin(8 * mu))
    s, c, t = math.sin(p1), math.cos(p1), math.tan(p1)
    c1 = EP2 * c * c
    t1 = t * t
    n1 = A / math.sqrt(1 - E2 * s * s)
    r1 = A * (1 - E2) / (1 - E2 * s * s) ** 1.5
    d = (x - FE) / (n1 * K0)
    lat = p1 - (n1 * t / r1) * (d * d / 2 - (5 + 3 * t1 + 10 * c1 - 4 * c1 * c1 - 9 * EP2) * d ** 4 / 24
                                 + (61 + 90 * t1 + 298 * c1 + 45 * t1 * t1 - 252 * EP2 - 3 * c1 * c1) * d ** 6 / 720)
    lon = LON0 + (d - (1 + 2 * t1 + c1) * d ** 3 / 6 + (5 - 2 * c1 + 28 * t1 - 3 * c1 * c1 + 8 * EP2 + 24 * t1 * t1) * d ** 5 / 120) / c
    return math.degrees(lat), math.degrees(lon)


def post(url, form, name):
    path = os.path.join(DL, name)
    if os.path.exists(path):
        return path
    req = urllib.request.Request(url, data=urllib.parse.urlencode(form).encode(), headers={'User-Agent': 'mapo-live-3d-bake/0.1', 'Referer': 'https://data.seoul.go.kr/'})
    with urllib.request.urlopen(req, timeout=1800) as res:
        data = res.read()
        disp = res.headers.get('Content-Disposition', '')
    if 'attachment' not in disp:
        sys.exit(f'{name} 을 받지 못했다: {data[:200]!r}')
    open(path, 'wb').write(data)
    print(f'{name}: {len(data) / 1e6:.1f}MB', file=sys.stderr)
    return path


# ── 수치지도 건물 점(2018) ──
zpath = post('https://datafile.seoul.go.kr/bigfile/iot/inf/nio_download.do?&useCache=false', {'infId': 'OA-15944', 'infSeq': 3, 'seq': 1}, 'solar-2018.zip')
z = zipfile.ZipFile(zpath)
rows = csv.reader(io.TextIOWrapper(z.open(z.namelist()[0]), encoding='cp949', errors='replace'), delimiter=';')
hdr = next(rows)
ix, iy, ifl, iar, inm = hdr.index('x좌표'), hdr.index('y좌표'), hdr.index('층수'), hdr.index('건물면적'), hdr.index('건물명')
cx, cy = 948680.4, 1950398.5  # 판 가운데의 UTM-K
points = []
for row in rows:
    try:
        x, y = float(row[ix]), float(row[iy])
    except (ValueError, IndexError):
        continue
    if abs(x - cx) > R + 200 or abs(y - cy) > R + 200:
        continue
    lat, lon = utmk_to_ll(x, y)
    if math.hypot(*to_xz(lat, lon)) > R:
        continue
    points.append([round(lat, 7), round(lon, 7), int(float(row[ifl] or 0)), round(float(row[iar] or 0), 1), row[inm].strip()])
json.dump({'src': 'OA-15944 서울시 건물 태양에너지 등급도(2018, 수치지도 건물)', 'points': points}, open(os.path.join(RAW, 'seoul-bldg-points.json'), 'w'), ensure_ascii=False)

# ── 건축물대장 표제부 ──
KEEP = ['법정동코드명', '주지번', '부지번', '새주소도로코드명', '새주소주지번', '새주소부지번', '동명', '주부속구분코드명', '주용도코드명', '기타용도내용',
        '지상층수', '지하층수', '높이', '건축면적', '세대수', '가구수', '건물명']
titles = []
for gu in ['마포구', '서대문구']:
    p = post('https://datafile.seoul.go.kr/bigfile/iot/sheet/csv/download.do',
             {'srvType': 'S', 'infId': 'OA-22424', 'serviceKind': 1, 'pageNo': 1, 'ssUserId': 'SAMPLE_VIEW', 'strWhere': '', 'strOrderby': '', 'filterCol': 'SGG_CD_NM', 'txtFilter': gu},
             f'bldg-title-{gu}.csv')
    for r in csv.DictReader(io.StringIO(open(p, 'rb').read().decode('cp949'))):
        titles.append({k: (r.get(k) or '').strip() for k in KEEP} | {'구': gu})
json.dump({'src': 'OA-22424 서울시 건축물대장 표제부', 'titles': titles}, open(os.path.join(RAW, 'seoul-bldg-titles.json'), 'w'), ensure_ascii=False)
print(f'수치지도 건물 점 {len(points)}개(층수 있음 {sum(1 for p in points if p[2] > 0)}), 표제부 {len(titles)}건', file=sys.stderr)
