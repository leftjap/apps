# 서울 열린데이터광장의 교통안전시설물 자료에서 판 둘레의 횡단보도·차선을 뽑아 tools/raw/ 에 저장한다(커밋하지 않는다).
#  - 서울시 교통안전시설물 횡단보도 정보(OA-15554): 횡단보도 면(A004_A, 2021-08 기준, EPSG:5186)
#  - 서울시 차선 관련 정보(OA-15537): 차선 선(A058_L, 2021-08 기준, EPSG:5186). 중앙선·차선·가장자리선·정지선·버스전용차선
#  - 서울특별시 자치구 횡단보도 정보(OA-22906): 횡단보도 점(2026-03 기준, 경위도). 보행등 유무
#  - 서울시 교통안전시설물 안전지대 정보(OA-15533): 안전지대 면(A005_A, 2025-04 기준, EPSG:5186)
#  - 서울시 교통안전시설물 방향표시 정보(OA-15536): 노면 화살표 점(A055_P, 2026-09 기준, EPSG:5186). 종류 코드와 각도
#  - 서울시 신호등 관련 정보(OA-15546): 신호등 부착대 선분(A057_L, 2023-06 기준 CSV, EPSG:5186). 신호등 종류(3색등·4색등·보행등)와 지주관리번호
#  - 서울시 안전표지 관련 정보(OA-15540): 표지 점(A064_P, 2026-02 기준, EPSG:5186). 표지 번호(도로교통법 시행규칙 별표6, 329 비보호좌회전 등)와 지주관리번호
# 모두 공공누리 제1유형(출처 표시). 실행: python3 tools/seoul.py  (표준 라이브러리만 쓴다. 받은 파일은 tools/raw/seoul/ 에 둔다)
import csv, io, json, math, os, re, struct, sys, urllib.parse, urllib.request, zipfile

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


# ── EPSG:5186(Korea 2000 / Central Belt 2010, GRS80 횡단 메르카토르) → 경위도 ──
A = 6378137.0
F = 1 / 298.257222101
E2 = 2 * F - F * F
EP2 = E2 / (1 - E2)
LAT0 = math.radians(38.0)
LON0 = math.radians(127.0)
FE, FN = 200000.0, 600000.0


def _m(phi):
    e4, e6 = E2 * E2, E2 * E2 * E2
    return A * ((1 - E2 / 4 - 3 * e4 / 64 - 5 * e6 / 256) * phi - (3 * E2 / 8 + 3 * e4 / 32 + 45 * e6 / 1024) * math.sin(2 * phi)
                + (15 * e4 / 256 + 45 * e6 / 1024) * math.sin(4 * phi) - (35 * e6 / 3072) * math.sin(6 * phi))


M0 = _m(LAT0)
E1 = (1 - math.sqrt(1 - E2)) / (1 + math.sqrt(1 - E2))


def tm_to_ll(x, y):
    mu = (M0 + (y - FN)) / (A * (1 - E2 / 4 - 3 * E2 * E2 / 64 - 5 * E2 ** 3 / 256))
    p1 = (mu + (3 * E1 / 2 - 27 * E1 ** 3 / 32) * math.sin(2 * mu) + (21 * E1 ** 2 / 16 - 55 * E1 ** 4 / 32) * math.sin(4 * mu)
          + (151 * E1 ** 3 / 96) * math.sin(6 * mu) + (1097 * E1 ** 4 / 512) * math.sin(8 * mu))
    s, c, t = math.sin(p1), math.cos(p1), math.tan(p1)
    c1 = EP2 * c * c
    t1 = t * t
    n1 = A / math.sqrt(1 - E2 * s * s)
    r1 = A * (1 - E2) / (1 - E2 * s * s) ** 1.5
    d = (x - FE) / n1
    lat = p1 - (n1 * t / r1) * (d * d / 2 - (5 + 3 * t1 + 10 * c1 - 4 * c1 * c1 - 9 * EP2) * d ** 4 / 24
                                 + (61 + 90 * t1 + 298 * c1 + 45 * t1 * t1 - 252 * EP2 - 3 * c1 * c1) * d ** 6 / 720)
    lon = LON0 + (d - (1 + 2 * t1 + c1) * d ** 3 / 6 + (5 - 2 * c1 + 28 * t1 - 3 * c1 * c1 + 8 * EP2 + 24 * t1 * t1) * d ** 5 / 120) / c
    return math.degrees(lat), math.degrees(lon)


def near_board(x, y):
    lat, lon = tm_to_ll(x, y)
    bx, bz = to_xz(lat, lon)
    return math.hypot(bx, bz) < R + 300


# ── 내려받기: 열린데이터광장 파일은 데이터셋 번호(infId)·파일 묶음(infSeq)·파일 번호(seq)로 POST 한다 ──
def download(inf_id, inf_seq, seq, name):
    path = os.path.join(DL, name)
    if os.path.exists(path):
        return path
    body = urllib.parse.urlencode({'infId': inf_id, 'infSeq': inf_seq, 'seq': seq}).encode()
    req = urllib.request.Request('https://datafile.seoul.go.kr/bigfile/iot/inf/nio_download.do?&useCache=false', data=body, headers={'User-Agent': 'mapo-live-3d-bake/0.1'})
    for _ in range(3):
        with urllib.request.urlopen(req, timeout=900) as res:
            data = res.read()
            disp = res.headers.get('Content-Disposition', '')
            size = int(res.headers.get('Content-Length') or len(data))
        if len(data) >= size:  # 큰 파일은 끝이 잘려 오는 때가 있다
            break
    if 'attachment' not in disp:
        sys.exit(f'{inf_id} 파일 {seq} 을 받지 못했다(파일 번호가 바뀌었을 수 있다): {data[:200]!r}')
    open(path, 'wb').write(data)
    print(f'{name}: {len(data) / 1e6:.1f}MB', file=sys.stderr)
    return path


def zip_member(zpath, suffix):
    """압축 파일 안에서 이름이 suffix 로 끝나는 파일의 내용(한글 이름은 cp949)"""
    z = zipfile.ZipFile(zpath)
    for i in z.infolist():
        n = i.filename
        try:
            n = n.encode('cp437').decode('cp949')
        except (UnicodeEncodeError, UnicodeDecodeError):
            pass
        if n.endswith(suffix):
            return z.read(i.filename)
    raise KeyError(f'{zpath} 에 {suffix} 없음')


def dbf_rows(data):
    n, hl, rl = struct.unpack('<IHH', data[4:12])
    fields = []
    o = 32
    while data[o] != 0x0D:
        d = data[o:o + 32]
        fields.append((d[:11].split(b'\0')[0].decode('ascii'), d[16]))
        o += 32
    for k in range(n):
        r = data[hl + k * rl: hl + (k + 1) * rl]
        row = {}
        p = 1
        for name, ln in fields:
            row[name] = r[p:p + ln].decode('cp949', 'ignore').strip()
            p += ln
        yield row


def shp_shapes(data):
    """(부분 목록[[(x, y), ...], ...] 또는 None) 을 레코드 순서대로"""
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
        if not near_board((xmin + xmax) / 2, (ymin + ymax) / 2):
            yield None
            continue
        npart, npt = struct.unpack('<ii', c[36:44])
        parts = list(struct.unpack(f'<{npart}i', c[44:44 + 4 * npart])) + [npt]
        pts = struct.unpack(f'<{npt * 2}d', c[44 + 4 * npart: 44 + 4 * npart + 16 * npt])
        yield [[(pts[2 * i], pts[2 * i + 1]) for i in range(parts[k], parts[k + 1])] for k in range(npart)]


def shp_points(data):
    """점 자료: (x, y) 또는 None 을 레코드 순서대로"""
    o = 100
    while o < len(data):
        _, clen = struct.unpack('>ii', data[o:o + 8])
        c = data[o + 8: o + 8 + clen * 2]
        o += 8 + clen * 2
        if struct.unpack('<i', c[:4])[0] == 0:
            yield None
            continue
        yield struct.unpack('<2d', c[4:20])


def in_board(ll_pts):
    return any(math.hypot(*to_xz(lat, lon)) < R for lat, lon in ll_pts)


r6 = lambda v: round(v, 7)

# ── 횡단보도 점(최신, 보행등 유무) ──
pts_path = download('OA-22906', 1, 4, 'crosswalk-points.csv')
points = {}
for row in list(csv.reader(io.StringIO(open(pts_path, 'rb').read().decode('cp949'))))[1:]:
    if len(row) < 13 or not row[6] or not row[7]:
        continue
    lat, lon = float(row[7]), float(row[6])
    if math.hypot(*to_xz(lat, lon)) > R:
        continue
    points[row[4]] = {'id': row[4], 'kind': row[5], 'lat': r6(lat), 'lon': r6(lon), 'sig': row[9] == 'Y', 'date': row[12]}

# ── 횡단보도 면 ──
xw_zip = download('OA-15554', 3, 10, 'crosswalk-areas.zip')
inner = os.path.join(DL, 'A004_A.zip')
if not os.path.exists(inner):
    open(inner, 'wb').write(zip_member(xw_zip, 'A004_A_횡단보도.zip'))
KIND = {'001': '일단(화살표있음)', '002': '이단(화살표있음)', '003': '일단(화살표없음)', '004': '이단(화살표없음)'}
areas = []
for row, shape in zip(dbf_rows(zip_member(inner, 'A004_A.dbf')), shp_shapes(zip_member(inner, 'A004_A.shp'))):
    if not shape:
        continue
    ring = [tm_to_ll(x, y) for x, y in shape[0]]
    if not in_board(ring):
        continue
    p = points.get(row['MGRNU'])
    areas.append({'id': row['MGRNU'], 'kind': KIND.get(row['A004_KND_C'], ''), 'css': row['CSS_CDE'], 'sig': p['sig'] if p else None,
                  'ring': [[r6(a), r6(b)] for a, b in ring]})
matched = {a['id'] for a in areas}
extra = [p for k, p in points.items() if k not in matched]

# ── 차선 ──
lane_zip = download('OA-15537', 3, 9, 'lanes.zip')
lanes = []
for row, shape in zip(dbf_rows(zip_member(lane_zip, 'A058_L.dbf')), shp_shapes(zip_member(lane_zip, 'A058_L.shp'))):
    if not shape:
        continue
    for part in shape:
        ll = [tm_to_ll(x, y) for x, y in part]
        if len(ll) >= 2 and in_board(ll):
            lanes.append({'k': row['A058_KND_C'], 'k2': row['A058_KND2_'], 'eve': row['EVE_CDE'], 'p': [[r6(a), r6(b)] for a, b in ll]})

# ── 안전지대(빗금 친 면) ──
safe_zip = download('OA-15533', 3, 11, 'safety-zones.zip')
zones = []
for row, shape in zip(dbf_rows(zip_member(safe_zip, 'A005_A.dbf')), shp_shapes(zip_member(safe_zip, 'A005_A.shp'))):
    if not shape:
        continue
    ring = [tm_to_ll(x, y) for x, y in shape[0]]
    if in_board(ring):
        zones.append({'id': row['MGRNU'], 'kind': row['A005_KND_C'], 'eve': row['EVE_CDE'], 'ring': [[r6(a), r6(b)] for a, b in ring]})

# ── 노면 화살표(방향표시): 종류 코드, 각도 ──
arrow_zip = download('OA-15536', 3, 15, 'arrows.zip')
arrows = []
for row, pt in zip(dbf_rows(zip_member(arrow_zip, '.dbf')), shp_points(zip_member(arrow_zip, '.shp'))):
    if not pt:
        continue
    lat, lon = tm_to_ll(*pt)
    if math.hypot(*to_xz(lat, lon)) < R:
        arrows.append({'kind': row['A055_KND_C'], 'drn': int(row['DRN'] or 0), 'eve': row['EVE_CDE'], 'lat': r6(lat), 'lon': r6(lon)})

# ── 차량 신호등 부착대(3색등·4색등·버스전용 3색등)와 같은 지주·둘레의 회전 관련 표지 ──
lamp_csv = download('OA-15546', 3, 7, 'signal-lamps.csv')
lamps = []
rows = list(csv.reader(io.StringIO(open(lamp_csv, 'rb').read().decode('cp949'))))
ix = {k: i for i, k in enumerate(rows[0])}
for row in rows[1:]:
    if row[ix['신호등종류']] not in ('002', '003', '005', '006', '022') or row[ix['상태']] == '':
        continue
    nums = [float(v) for v in re.findall(r'-?\d+(?:\.\d+)?', row[ix['공간데이터']].split('ORDINATE_ARRAY')[-1])]
    if len(nums) < 4 or not near_board(nums[0], nums[1]):
        continue
    (x0, z0), (x1, z1) = [to_xz(*tm_to_ll(nums[k], nums[k + 1])) for k in (0, len(nums) - 2)]
    lamps.append({'kind': row[ix['신호등종류']], 'pole': row[ix['지주관리번호']], 'eve': row[ix['고가']], 'p': [round(x0, 2), round(z0, 2), round(x1, 2), round(z1, 2)]})
sign_zip = download('OA-15540', 3, 14, 'signs.zip')
signs = []
for row, pt in zip(dbf_rows(zip_member(sign_zip, '.dbf')), shp_points(zip_member(sign_zip, '.shp'))):
    if not pt or row['MRK_NUM'] not in ('213', '214', '216', '311', '329', '330') or not near_board(*pt):
        continue
    x, z = to_xz(*tm_to_ll(*pt))
    signs.append({'num': row['MRK_NUM'], 'pole': row['A062_MGRNU'], 'rmk': row['RMK'], 'x': round(x, 2), 'z': round(z, 2)})

json.dump({'lamps': lamps, 'signs': signs}, open(os.path.join(RAW, 'seoul-signals.json'), 'w'), ensure_ascii=False)
json.dump({'zones': zones}, open(os.path.join(RAW, 'seoul-safety.json'), 'w'), ensure_ascii=False)
json.dump({'arrows': arrows}, open(os.path.join(RAW, 'seoul-arrows.json'), 'w'), ensure_ascii=False)
json.dump({'areas': areas, 'points': extra}, open(os.path.join(RAW, 'seoul-crosswalks.json'), 'w'), ensure_ascii=False)
json.dump({'lanes': lanes}, open(os.path.join(RAW, 'seoul-lanes.json'), 'w'), ensure_ascii=False)
print(f'횡단보도 면 {len(areas)}개(보행등 있음 {sum(1 for a in areas if a["sig"])}, 점 자료와 못 이은 것 {sum(1 for a in areas if a["sig"] is None)}), 면 없는 점 {len(extra)}개, 차선 {len(lanes)}줄, 안전지대 {len(zones)}개, 노면 화살표 {len(arrows)}개, 차량 신호등 {len(lamps)}개, 회전 표지 {len(signs)}개', file=sys.stderr)
