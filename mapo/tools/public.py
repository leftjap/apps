# 국가 공공 공간정보 SHP 에서 판 둘레만 뽑아 tools/raw/ 에 저장한다(커밋하지 않는다).
#  - 국토교통부 GIS건물통합정보(브이월드, 서울특별시 전체): 건물 외곽선·지상 층수·높이·용도·건물명 → tools/raw/gis-buildings.json
#  - 행정안전부 도로명주소 전자지도 실폭도로(TL_SPRD_RW): 도로 면 → tools/raw/gis-roads.json
# 두 자료 모두 로그인·신청 뒤 받으므로 이 스크립트는 받지 않는다. 받은 zip(또는 풀어 둔 .shp·.dbf·.prj)을
# tools/raw/public/ 에 넣고 실행한다: python3 tools/public.py
# 좌표계는 .prj 를 읽어 정한다(GRS80 횡단 메르카토르: EPSG:5186·5179 등). 표준 라이브러리만 쓴다.
import io, json, math, os, re, struct, sys, zipfile

HERE = os.path.dirname(os.path.abspath(__file__))
RAW = os.path.join(HERE, 'raw')
SRC = os.path.join(RAW, 'public')

ORIGIN = (37.5515, 126.919)
M_LAT = 110950
M_LON = 111320 * math.cos(math.radians(ORIGIN[0]))
R = 2100  # 판 반지름 + 여유(m)


def to_xz(lat, lon):
    return (lon - ORIGIN[1]) * M_LON, -(lat - ORIGIN[0]) * M_LAT


# ── 횡단 메르카토르 역변환. 매개변수는 .prj 에서 읽는다 ──
class TM:
    def __init__(self, prj):
        def par(name):
            m = re.search(r'PARAMETER\["%s",\s*([-\d.eE]+)\]' % name, prj, re.I)
            if not m:
                raise SystemExit(f'.prj 에 {name} 없음: {prj[:300]}')
            return float(m.group(1))
        if not re.search(r'Transverse_Mercator', prj, re.I):
            raise SystemExit(f'횡단 메르카토르가 아닌 좌표계: {prj[:300]}')
        sph = re.search(r'SPHEROID\["([^"]*)",\s*([\d.]+),\s*([\d.]+)', prj, re.I)
        self.a = float(sph.group(2))
        f = 1 / float(sph.group(3))
        if abs(self.a - 6378137.0) > 1:
            raise SystemExit(f'GRS80·WGS84 가 아닌 타원체({sph.group(1)}): 7변수 변환이 필요하다')
        self.e2 = 2 * f - f * f
        self.ep2 = self.e2 / (1 - self.e2)
        self.lat0 = math.radians(par('latitude_of_origin'))
        self.lon0 = math.radians(par('central_meridian'))
        self.k0 = par('scale_factor')
        self.fe, self.fn = par('false_easting'), par('false_northing')
        self.m0 = self._m(self.lat0)
        self.e1 = (1 - math.sqrt(1 - self.e2)) / (1 + math.sqrt(1 - self.e2))
        self.desc = f'{sph.group(1)} TM 원점 {math.degrees(self.lat0):.4f},{math.degrees(self.lon0):.4f} k={self.k0} FE={self.fe:.0f} FN={self.fn:.0f}'
        # 판 중심의 투영 좌표(빠른 범위 거르기용)
        x, y = self.fe, self.fn
        for _ in range(40):
            bx, bz = to_xz(*self.ll(x, y))
            x -= bx
            y += bz
        self.cx, self.cy = x, y

    def _m(self, phi):
        a, e2 = self.a, self.e2
        e4, e6 = e2 * e2, e2 * e2 * e2
        return a * ((1 - e2 / 4 - 3 * e4 / 64 - 5 * e6 / 256) * phi - (3 * e2 / 8 + 3 * e4 / 32 + 45 * e6 / 1024) * math.sin(2 * phi)
                    + (15 * e4 / 256 + 45 * e6 / 1024) * math.sin(4 * phi) - (35 * e6 / 3072) * math.sin(6 * phi))

    def ll(self, x, y):
        a, e2, ep2, e1 = self.a, self.e2, self.ep2, self.e1
        mu = (self.m0 + (y - self.fn) / self.k0) / (a * (1 - e2 / 4 - 3 * e2 * e2 / 64 - 5 * e2 ** 3 / 256))
        p1 = (mu + (3 * e1 / 2 - 27 * e1 ** 3 / 32) * math.sin(2 * mu) + (21 * e1 ** 2 / 16 - 55 * e1 ** 4 / 32) * math.sin(4 * mu)
              + (151 * e1 ** 3 / 96) * math.sin(6 * mu) + (1097 * e1 ** 4 / 512) * math.sin(8 * mu))
        s, c, t = math.sin(p1), math.cos(p1), math.tan(p1)
        c1 = ep2 * c * c
        t1 = t * t
        n1 = a / math.sqrt(1 - e2 * s * s)
        r1 = a * (1 - e2) / (1 - e2 * s * s) ** 1.5
        d = (x - self.fe) / (n1 * self.k0)
        lat = p1 - (n1 * t / r1) * (d * d / 2 - (5 + 3 * t1 + 10 * c1 - 4 * c1 * c1 - 9 * ep2) * d ** 4 / 24
                                     + (61 + 90 * t1 + 298 * c1 + 45 * t1 * t1 - 252 * ep2 - 3 * c1 * c1) * d ** 6 / 720)
        lon = self.lon0 + (d - (1 + 2 * t1 + c1) * d ** 3 / 6 + (5 - 2 * c1 + 28 * t1 - 3 * c1 * c1 + 8 * ep2 + 24 * t1 * t1) * d ** 5 / 120) / c
        return math.degrees(lat), math.degrees(lon)


# ── 파일 찾기: tools/raw/public/ 아래 zip(안의 zip 까지) 과 풀어 둔 파일에서 같은 이름의 .shp·.dbf·.prj 묶음 ──
def layers():
    """(이름, {'.shp': bytes, '.dbf': bytes, '.prj': bytes}) 를 낸다"""
    found = {}

    def add(name, data):
        base, ext = os.path.splitext(name)
        ext = ext.lower()
        if ext in ('.shp', '.dbf', '.prj'):
            found.setdefault(base, {})[ext] = data
        elif ext == '.zip':
            walk_zip(zipfile.ZipFile(io.BytesIO(data)), base)

    def walk_zip(z, prefix):
        for i in z.infolist():
            n = i.filename
            try:
                n = n.encode('cp437').decode('cp949')
            except (UnicodeEncodeError, UnicodeDecodeError):
                pass
            if not i.is_dir():
                add(prefix + '/' + n, z.read(i.filename))

    for root, _, files in os.walk(SRC):
        for f in files:
            p = os.path.join(root, f)
            add(os.path.relpath(p, SRC), open(p, 'rb').read())
    for base, parts in sorted(found.items()):
        if '.shp' in parts and '.dbf' in parts:
            yield base, parts


def dbf_fields(data):
    fields = []
    o = 32
    while data[o] != 0x0D:
        d = data[o:o + 32]
        fields.append((d[:11].split(b'\0')[0].decode('ascii', 'ignore'), chr(d[11]), d[16]))
        o += 32
    return fields


def dbf_rows(data, enc):
    n, hl, rl = struct.unpack('<IHH', data[4:12])
    fields = dbf_fields(data)
    for k in range(n):
        r = data[hl + k * rl: hl + (k + 1) * rl]
        row = {}
        p = 1
        for name, _, ln in fields:
            row[name] = r[p:p + ln].decode(enc, 'ignore').strip()
            p += ln
        yield row


def dbf_encoding(parts, data):
    """.cpg 가 없으면 한글 필드를 utf-8 로 읽어 보고 깨지면 cp949"""
    n, hl, rl = struct.unpack('<IHH', data[4:12])
    sample = data[hl: hl + rl * min(n, 2000)]
    try:
        sample.decode('utf-8')
        return 'utf-8'
    except UnicodeDecodeError:
        return 'cp949'


def shp_shapes(data, tm):
    """(부분 목록[[(x, y), ...], ...] 또는 None) 을 레코드 순서대로. 판에서 먼 레코드는 None"""
    o = 100
    lim = R + 300
    while o < len(data):
        _, clen = struct.unpack('>ii', data[o:o + 8])
        c = data[o + 8: o + 8 + clen * 2]
        o += 8 + clen * 2
        st = struct.unpack('<i', c[:4])[0]
        if st == 0:
            yield None
            continue
        xmin, ymin, xmax, ymax = struct.unpack('<4d', c[4:36])
        if xmax < tm.cx - lim or xmin > tm.cx + lim or ymax < tm.cy - lim or ymin > tm.cy + lim:
            yield None
            continue
        npart, npt = struct.unpack('<ii', c[36:44])
        parts = list(struct.unpack(f'<{npart}i', c[44:44 + 4 * npart])) + [npt]
        pts = struct.unpack(f'<{npt * 2}d', c[44 + 4 * npart: 44 + 4 * npart + 16 * npt])
        yield [[(pts[2 * i], pts[2 * i + 1]) for i in range(parts[k], parts[k + 1])] for k in range(npart)]


def ring_area(r):
    return sum(r[i][0] * r[(i + 1) % len(r)][1] - r[(i + 1) % len(r)][0] * r[i][1] for i in range(len(r))) / 2


r7 = lambda v: round(v, 7)


def read(base, parts):
    if '.prj' not in parts:
        raise SystemExit(f'{base}: .prj 가 없어 좌표계를 알 수 없다')
    tm = TM(parts['.prj'].decode('ascii', 'ignore'))
    enc = dbf_encoding(parts, parts['.dbf'])
    fields = dbf_fields(parts['.dbf'])
    print(f'{base}: {tm.desc}, DBF {enc}, 필드 {[f[0] for f in fields]}', file=sys.stderr)
    out = []
    for row, shape in zip(dbf_rows(parts['.dbf'], enc), shp_shapes(parts['.shp'], tm)):
        if not shape:
            continue
        rings = [[tm.ll(x, y) for x, y in part] for part in shape]
        if not any(math.hypot(*to_xz(a, b)) < R for r in rings for a, b in r):
            continue
        out.append((row, rings))
    return out


# 건물통합정보의 필드 이름(브이월드 배포본은 A0~A28 같은 기호 이름일 수 있어 둘 다 받는다)
BLD = {
    'floors': ('GRND_FLR', 'A26'), 'under': ('UGRND_FLR', 'A27'), 'height': ('HEIGHT', 'A16'),
    'use': ('BDTYP_NM', 'MAIN_PURPS', 'A9'), 'name': ('BULD_NM', 'BLD_NM', 'A24'), 'dong': ('DONG_NM', 'A25'),
    'id': ('GIS_IDNTFC', 'A1'), 'date': ('USEAPR_DAY', 'A13'),
}


def pick(row, keys):
    for k in keys:
        if k in row:
            return row[k]
    return ''


def num(v):
    try:
        return float(v)
    except ValueError:
        return 0.0


buildings, roads = [], []
for base, parts in layers():
    names = {f[0] for f in dbf_fields(parts['.dbf'])}
    if 'SPRD_RW' in base.upper() or 'RW_SN' in names:
        for row, rings in read(base, parts):
            # 바깥 고리(시계 방향, 투영 좌표에서 넓이 음수)와 구멍을 그대로 둔다. 판에서 짝홀 규칙으로 채운다
            roads.append({'id': row.get('RW_SN', ''), 'r': [[[r7(a), r7(b)] for a, b in r] for r in rings]})
    elif names & {'GRND_FLR', 'A26', 'BDTYP_NM', 'A9'}:
        for row, rings in read(base, parts):
            buildings.append({
                'id': pick(row, BLD['id']), 'f': int(num(pick(row, BLD['floors']))), 'uf': int(num(pick(row, BLD['under']))),
                'h': round(num(pick(row, BLD['height'])), 1), 'use': pick(row, BLD['use']), 'name': pick(row, BLD['name']),
                'dong': pick(row, BLD['dong']), 'date': pick(row, BLD['date']),
                'r': [[[r7(a), r7(b)] for a, b in r] for r in rings],
            })
    else:
        print(f'{base}: 쓰지 않는 레이어(필드 {sorted(names)[:12]})', file=sys.stderr)

if buildings:
    json.dump({'src': '국토교통부 GIS건물통합정보', 'buildings': buildings}, open(os.path.join(RAW, 'gis-buildings.json'), 'w'), ensure_ascii=False)
if roads:
    json.dump({'src': '행정안전부 도로명주소 전자지도 실폭도로(TL_SPRD_RW)', 'roads': roads}, open(os.path.join(RAW, 'gis-roads.json'), 'w'), ensure_ascii=False)
print(f'건물 {len(buildings)}동(층수 있음 {sum(1 for b in buildings if b["f"] > 0)}, 높이 있음 {sum(1 for b in buildings if b["h"] > 0)}), 실폭도로 면 {len(roads)}개', file=sys.stderr)
if not buildings and not roads:
    sys.exit(f'{SRC} 에서 쓸 레이어를 찾지 못했다')
