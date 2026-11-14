# 서울 열린데이터광장의 생태현황도(개별비오톱 평가도, OA-21126, 2025 기준, EPSG:5174)에서 판 둘레의 면을 뽑아 tools/raw/seoul-biotope.json 에 저장한다(커밋하지 않는다).
# 서울 전역을 빈틈없이 나눈 면(블록·필지 단위)마다 토지 이용, 녹지율, 포장율, 현존 식생이 붙어 있어 OSM 면 자료가 없는 곳의 바닥을 채운다.
# 공공누리 제1유형(출처 표시). 실행: python3 tools/ground.py  (표준 라이브러리만 쓴다. 받은 파일은 tools/raw/seoul/ 에 둔다)
import json, math, os, struct, sys, urllib.parse, urllib.request, zipfile

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


# ── EPSG:5174(Korean 1985 / Modified Central Belt, 베셀 타원체 횡단 메르카토르) → 경위도(WGS84) ──
# 투영을 풀어 베셀 경위도를 얻고, 지심 좌표로 바꿔 7변수 변환(towgs84=-115.80,474.99,674.11,1.16,-2.31,-1.63,6.43, 위치 벡터 방식)으로 WGS84 에 옮긴다
BA = 6377397.155
BF = 1 / 299.1528128
BE2 = 2 * BF - BF * BF
LAT0 = math.radians(38.0)
LON0 = math.radians(127.0028902777778)
FE, FN = 200000.0, 500000.0
WA = 6378137.0
WF = 1 / 298.257223563
WE2 = 2 * WF - WF * WF
TOWGS = (-115.80, 474.99, 674.11, 1.16, -2.31, -1.63, 6.43)


def _m(phi, a, e2):
    e4, e6 = e2 * e2, e2 * e2 * e2
    return a * ((1 - e2 / 4 - 3 * e4 / 64 - 5 * e6 / 256) * phi - (3 * e2 / 8 + 3 * e4 / 32 + 45 * e6 / 1024) * math.sin(2 * phi)
                + (15 * e4 / 256 + 45 * e6 / 1024) * math.sin(4 * phi) - (35 * e6 / 3072) * math.sin(6 * phi))


M0 = _m(LAT0, BA, BE2)
E1 = (1 - math.sqrt(1 - BE2)) / (1 + math.sqrt(1 - BE2))
EP2 = BE2 / (1 - BE2)


def tm_inv(x, y):
    mu = (M0 + (y - FN)) / (BA * (1 - BE2 / 4 - 3 * BE2 * BE2 / 64 - 5 * BE2 ** 3 / 256))
    p1 = (mu + (3 * E1 / 2 - 27 * E1 ** 3 / 32) * math.sin(2 * mu) + (21 * E1 ** 2 / 16 - 55 * E1 ** 4 / 32) * math.sin(4 * mu)
          + (151 * E1 ** 3 / 96) * math.sin(6 * mu) + (1097 * E1 ** 4 / 512) * math.sin(8 * mu))
    s, c, t = math.sin(p1), math.cos(p1), math.tan(p1)
    c1 = EP2 * c * c
    t1 = t * t
    n1 = BA / math.sqrt(1 - BE2 * s * s)
    r1 = BA * (1 - BE2) / (1 - BE2 * s * s) ** 1.5
    d = (x - FE) / n1
    lat = p1 - (n1 * t / r1) * (d * d / 2 - (5 + 3 * t1 + 10 * c1 - 4 * c1 * c1 - 9 * EP2) * d ** 4 / 24
                                 + (61 + 90 * t1 + 298 * c1 + 45 * t1 * t1 - 252 * EP2 - 3 * c1 * c1) * d ** 6 / 720)
    lon = LON0 + (d - (1 + 2 * t1 + c1) * d ** 3 / 6 + (5 - 2 * c1 + 28 * t1 - 3 * c1 * c1 + 8 * EP2 + 24 * t1 * t1) * d ** 5 / 120) / c
    return lat, lon


def to_wgs(x, y):
    lat, lon = tm_inv(x, y)
    n = BA / math.sqrt(1 - BE2 * math.sin(lat) ** 2)
    X = n * math.cos(lat) * math.cos(lon)
    Y = n * math.cos(lat) * math.sin(lon)
    Z = n * (1 - BE2) * math.sin(lat)
    tx, ty, tz, rx, ry, rz, ppm = TOWGS
    k = math.pi / (180 * 3600)
    rx, ry, rz, sc = rx * k, ry * k, rz * k, 1 + ppm * 1e-6
    X2 = tx + sc * (X - rz * Y + ry * Z)
    Y2 = ty + sc * (rz * X + Y - rx * Z)
    Z2 = tz + sc * (-ry * X + rx * Y + Z)
    p = math.hypot(X2, Y2)
    la = math.atan2(Z2, p * (1 - WE2))
    for _ in range(6):
        nn = WA / math.sqrt(1 - WE2 * math.sin(la) ** 2)
        h = p / math.cos(la) - nn
        la = math.atan2(Z2, p * (1 - WE2 * nn / (nn + h)))
    return math.degrees(la), math.degrees(math.atan2(Y2, X2))


def download(inf_id, inf_seq, seq, name):
    path = os.path.join(DL, name)
    if os.path.exists(path):
        return path
    body = urllib.parse.urlencode({'infId': inf_id, 'infSeq': inf_seq, 'seq': seq}).encode()
    req = urllib.request.Request('https://datafile.seoul.go.kr/bigfile/iot/inf/nio_download.do?&useCache=false', data=body, headers={'User-Agent': 'mapo-live-3d-bake/0.1'})
    with urllib.request.urlopen(req, timeout=900) as res:
        data = res.read()
        disp = res.headers.get('Content-Disposition', '')
    if 'attachment' not in disp:
        sys.exit(f'{inf_id} 파일 {seq} 을 받지 못했다(파일 번호가 바뀌었을 수 있다): {data[:200]!r}')
    open(path, 'wb').write(data)
    print(f'{name}: {len(data) / 1e6:.1f}MB', file=sys.stderr)
    return path


def zip_member(zpath, suffix):
    z = zipfile.ZipFile(zpath)
    for i in z.infolist():
        if i.filename.endswith(suffix):
            return z.read(i.filename)
    raise KeyError(f'{zpath} 에 {suffix} 없음')


def dbf_rows(data):
    n, hl, rl = struct.unpack('<IHH', data[4:12])
    fields = []
    o = 32
    while data[o] != 0x0D:
        d = data[o:o + 32]
        fields.append((d[:11].split(b'\0')[0].decode('cp949'), d[16]))
        o += 32
    for k in range(n):
        r = data[hl + k * rl: hl + (k + 1) * rl]
        row = {}
        p = 1
        for name, ln in fields:
            row[name] = r[p:p + ln].decode('cp949', 'ignore').strip()
            p += ln
        yield row


# 판 둘레 상자(EPSG:5174). 판 가운데의 투영 좌표를 한 번 찾아 두고 상자로 거른다
def _find_center():
    x, y = 195000.0, 450000.0
    for _ in range(30):
        lat, lon = to_wgs(x, y)
        bx, bz = to_xz(lat, lon)
        x -= bx
        y += bz
    return x, y


CX, CY = _find_center()


def shp_shapes(data):
    o = 100
    while o < len(data):
        _, clen = struct.unpack('>ii', data[o:o + 8])
        c = data[o + 8: o + 8 + clen * 2]
        o += 8 + clen * 2
        st = struct.unpack('<i', c[:4])[0]
        if st == 0:
            yield None
            continue
        xmin, ymin, xmax, ymax = struct.unpack('<4d', c[4:36])
        if xmax < CX - R - 50 or xmin > CX + R + 50 or ymax < CY - R - 50 or ymin > CY + R + 50:
            yield None
            continue
        npart, npt = struct.unpack('<ii', c[36:44])
        parts = list(struct.unpack(f'<{npart}i', c[44:44 + 4 * npart])) + [npt]
        pts = struct.unpack(f'<{npt * 2}d', c[44 + 4 * npart: 44 + 4 * npart + 16 * npt])
        yield [[(pts[2 * i], pts[2 * i + 1]) for i in range(parts[k], parts[k + 1])] for k in range(npart)]


zpath = download('OA-21126', 1, 3, 'biotope-sep.zip')
num = lambda v: round(float(v or 0))
out = []
for row, shape in zip(dbf_rows(zip_member(zpath, '.dbf')), shp_shapes(zip_member(zpath, '.shp'))):
    if not shape:
        continue
    rings = [[to_wgs(x, y) for x, y in part] for part in shape]
    if not any(math.hypot(*to_xz(a, b)) < R for r in rings for a, b in r):
        continue
    # 토지이용 코드, 이용범례, 식생범례, 비오톱유형, 녹지율·불투수 포장율·투수 포장율·건폐율(%)
    out.append({'lu': row['토지이용'], 'use': row['이용범례'], 'veg': row['식생범례'], 't': row['비오톱유형'],
                'green': num(row['녹지율']), 'imp': num(row['불투포장율']), 'perm': num(row['투수포장율']), 'bcr': num(row['건폐율']),
                'r': [[[round(a, 7), round(b, 7)] for a, b in r] for r in rings]})
json.dump({'src': 'OA-21126 개별비오톱 평가도(2025)', 'areas': out}, open(os.path.join(RAW, 'seoul-biotope.json'), 'w'), ensure_ascii=False)
print(f'비오톱 면 {len(out)}개', file=sys.stderr)

# ── 가로수(OA-23040, 2026 서울시 가로수 위치정보, 경위도 점) ──
import re
import xml.etree.ElementTree as ET

NS = '{http://schemas.openxmlformats.org/spreadsheetml/2006/main}'
tpath = download('OA-23040', 4, 1, 'street-trees.xlsx')
z = zipfile.ZipFile(tpath)
strings = [''.join(t.text or '' for t in si.iter(NS + 't')) for si in ET.fromstring(z.read('xl/sharedStrings.xml')).iter(NS + 'si')]
trees = []
for name in z.namelist():
    if not re.match(r'xl/worksheets/sheet\d+\.xml$', name):
        continue
    head = None
    for row in ET.fromstring(z.read(name)).iter(NS + 'row'):
        vals = {}
        for c in row.iter(NS + 'c'):
            v = c.find(NS + 'v')
            if v is None:
                continue
            vals[re.sub(r'\d', '', c.get('r'))] = strings[int(v.text)] if c.get('t') == 's' else v.text
        if head is None:
            if any('위도' in (s or '') for s in vals.values()):
                head = {s.strip(): k for k, s in vals.items()}
            continue
        try:
            lat = float(vals[next(k for s, k in head.items() if '위도' in s)])
            lon = float(vals[next(k for s, k in head.items() if '경도' in s)])
        except (KeyError, StopIteration, TypeError, ValueError):
            continue
        if math.hypot(*to_xz(lat, lon)) < R:
            trees.append([round(lat, 7), round(lon, 7), vals.get(head.get('수종', ''), '')])
json.dump({'src': 'OA-23040 서울시 가로수 위치정보(2026)', 'trees': trees}, open(os.path.join(RAW, 'seoul-trees.json'), 'w'), ensure_ascii=False)
print(f'가로수 {len(trees)}그루', file=sys.stderr)
