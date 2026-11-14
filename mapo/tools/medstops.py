# 서울시 버스정류소 위치정보(OA-15067, 서울 열린데이터광장, 공공누리 제1유형)에서 판 둘레의 중앙차로 정류장을 골라
# src/data/medStops.ts 로 쓴다. 중앙버스전용차로 정류장(길 가운데 승강장)이 어디인지는 OSM 에 없고, 이 자료의 '정류소타입' 열에만 있다.
# 사용: python3 tools/medstops.py  (표준 라이브러리만. 받은 파일은 tools/raw/seoul/ 에 둔다, 커밋하지 않는다)
# 파일 번호(seq)는 매달 새 파일이 올라오면 바뀐다. 2026-09-02 판이 58번이다.
import math, os, re, sys, urllib.parse, urllib.request, zipfile

HERE = os.path.dirname(os.path.abspath(__file__))
DL = os.path.join(HERE, 'raw', 'seoul')
OUT = os.path.join(HERE, '..', 'src', 'data', 'medStops.ts')
SEQ, DATE = 58, '2026-09-02'
ORIGIN = (37.5515, 126.919)
M_LAT = 110950
M_LON = 111320 * math.cos(math.radians(ORIGIN[0]))
R = 2100  # 판 반지름 + 여유(m)


def to_xz(lat, lon):
    return (lon - ORIGIN[1]) * M_LON, -(lat - ORIGIN[0]) * M_LAT


def download():
    os.makedirs(DL, exist_ok=True)
    path = os.path.join(DL, f'bus-stops-{SEQ}.xlsx')
    if os.path.exists(path):
        return path
    body = urllib.parse.urlencode({'infId': 'OA-15067', 'infSeq': 1, 'seq': SEQ}).encode()
    req = urllib.request.Request('https://datafile.seoul.go.kr/bigfile/iot/inf/nio_download.do?&useCache=false', data=body, headers={'User-Agent': 'mapo-live-3d-bake/0.1'})
    with urllib.request.urlopen(req, timeout=300) as res:
        data = res.read()
        if 'attachment' not in res.headers.get('Content-Disposition', ''):
            sys.exit(f'OA-15067 파일 {SEQ} 을 받지 못했다(파일 번호가 바뀌었을 수 있다): {data[:200]!r}')
    open(path, 'wb').write(data)
    return path


def rows(path):
    """첫 시트의 행들(문자열 목록). 공유 문자열만 풀어 읽는다"""
    z = zipfile.ZipFile(path)
    shared = []
    if 'xl/sharedStrings.xml' in z.namelist():
        for si in re.findall(r'<si>(.*?)</si>', z.read('xl/sharedStrings.xml').decode(), re.S):
            shared.append(''.join(re.findall(r'<t[^>]*>(.*?)</t>', si, re.S)))
    for row in re.findall(r'<row[^>]*>(.*?)</row>', z.read('xl/worksheets/sheet1.xml').decode(), re.S):
        out = []
        for attrs, inner in re.findall(r'<c ([^>]*?)(?:/>|>(.*?)</c>)', row, re.S):
            v = re.search(r'<v>(.*?)</v>', inner or '')
            val = v.group(1) if v else ''
            if 't="s"' in attrs and v:
                val = shared[int(val)]
            out.append(val)
        yield out


stops = []
for r in rows(download()):
    if len(r) < 6 or r[5] != '중앙차로':
        continue
    x, z = to_xz(float(r[4]), float(r[3]))
    if math.hypot(x, z) < R:
        stops.append((r[1], r[2], round(x, 1), round(z, 1)))
stops.sort()
with open(OUT, 'w') as f:
    f.write(f'// tools/medstops.py 가 만든 파일. 서울시 버스정류소 위치정보(OA-15067, {DATE}, 서울 열린데이터광장, 공공누리 제1유형)의\n')
    f.write('// 중앙차로 정류장 가운데 판 둘레의 것: [정류소 번호(ARS), 이름, x, z(판 좌표 m)]\n')
    f.write('export const MED_STOPS: [string, string, number, number][] = [\n')
    for s in stops:
        f.write(f"  ['{s[0]}', '{s[1]}', {s[2]}, {s[3]}],\n")
    f.write('];\n')
print(f'중앙차로 정류장 {len(stops)}곳 → {os.path.relpath(OUT)}', file=sys.stderr)
