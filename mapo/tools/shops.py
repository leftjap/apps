# 소상공인시장진흥공단 상가(상권)정보(공공데이터포털 15083033, 이용허락범위 제한 없음, 로그인 없이 받는다)에서 판 둘레 가게를 tools/raw/seoul-shops.json 에 저장한다(커밋하지 않는다).
#  - 영업 중인 상가업소만 실린 자료다. 전국 zip(약 350MB)을 tools/raw/seoul/ 에 받고 서울 CSV 를 흘려 읽는다(압축을 풀지 않는다)
#  - 가게마다 [위도, 경도, 종류, 층]. 종류 1 카페 2 음식점 3 주점 4 편의점 5 병원·약국 6 소매·생활(이용·미용·세탁·부동산 포함). 숙박·사무·교육·임대는 1층 가게 간판이 아니라 뺀다
#  - 층: 지하 −1, 1, 2, 3... 층정보가 빈 곳은 1층에 많은 음식점·카페·주점·편의점만 1층으로 보고 나머지는 버린다(사실과 다른 간판을 줄인다)
# 실행: python3 tools/shops.py  (표준 라이브러리만). 내려받기에서 자동 입력 방지 문자를 요구하면 멈춘다
import csv, glob, http.cookiejar, io, json, math, os, sys, urllib.parse, urllib.request, zipfile

HERE = os.path.dirname(os.path.abspath(__file__))
RAW = os.path.join(HERE, 'raw')
DL = os.path.join(RAW, 'seoul')
os.makedirs(DL, exist_ok=True)

ORIGIN = (37.5515, 126.919)
M_LAT = 110950
M_LON = 111320 * math.cos(math.radians(ORIGIN[0]))
R = 2100
PAGE = 'https://www.data.go.kr/data/15083033/fileData.do'


def fetch_zip():
    have = sorted(glob.glob(os.path.join(DL, 'sbiz-*.zip')))
    if have:
        return have[-1]
    op = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(http.cookiejar.CookieJar()))
    op.addheaders = [('User-Agent', 'mapo-live-3d-bake/0.1'), ('Referer', PAGE)]
    page = op.open(PAGE, timeout=60).read().decode('utf-8', 'replace')
    key = page.split("fn_fileDataDown('15083033', '", 1)[1].split("'", 1)[0]
    post = lambda url, form: json.loads(op.open(url, urllib.parse.urlencode(form).encode(), timeout=60).read())
    info = post('https://www.data.go.kr/tcs/dss/selectFileDataDownload.do',
                {'publicDataDetailPk': key, 'publicDataPk': '15083033', 'atchFileId': '', 'fileDetailSn': '1', 'publicDataTyCode': 'PR0051'})
    fid, sn = info['atchFileId'], info['fileDetailSn']
    if post('https://www.data.go.kr/cmm/cmm/check-limit.json', {'atchFileId': fid, 'fileDetailSn': sn}).get('needCaptcha'):
        sys.exit('공공데이터포털이 자동 입력 방지 문자를 요구한다. 브라우저에서 받아 tools/raw/seoul/sbiz-YYYYMM.zip 으로 두고 다시 실행한다')
    name = info['dataSetFileDetailInfo']['dataNm'][-8:-2]
    path = os.path.join(DL, f'sbiz-{name}.zip')
    with op.open(f'https://www.data.go.kr/cmm/cmm/fileDownload.do?atchFileId={fid}&fileDetailSn={sn}&dataNm=sbiz', timeout=3600) as res, open(path, 'wb') as f:
        while chunk := res.read(1 << 20):
            f.write(chunk)
    print(f'{os.path.basename(path)}: {os.path.getsize(path) / 1e6:.0f}MB', file=sys.stderr)
    return path


def kind(big, mid, small):
    big, mid, small = big.strip(), mid.strip(), small.strip()
    if big == '음식':
        return 3 if mid == '주점' else 1 if mid == '비알코올' else 2
    if small == '편의점':
        return 4
    if big == '보건의료' or small == '약국':
        return 5
    if big in ('소매', '수리·개인', '부동산'):
        return 6
    return 0


def floor(v, k):
    v = v.strip()
    if v.isdigit():
        n = int(v)
        return n if 1 <= n <= 60 else None
    if v.startswith('B') or v.startswith('지') or v == '반지층':
        return -1
    return 1 if v == '' and k <= 4 else None


zpath = fetch_zip()
z = zipfile.ZipFile(zpath)
name = next(i for i in z.infolist() if '서울' in i.filename)
shops, count, floors = [], {}, {}
for r in csv.DictReader(io.TextIOWrapper(z.open(name), encoding='utf-8-sig', errors='replace')):
    k = kind(r['상권업종대분류명'], r['상권업종중분류명'], r['상권업종소분류명'])
    if not k:
        continue
    try:
        lon, lat = float(r['경도']), float(r['위도'])
    except ValueError:
        continue
    if math.hypot((lon - ORIGIN[1]) * M_LON, (lat - ORIGIN[0]) * M_LAT) > R:
        continue
    f = floor(r['층정보'], k)
    if f is None:
        continue
    shops.append([round(lat, 7), round(lon, 7), k, f])
    count[k] = count.get(k, 0) + 1
    g = '지하' if f < 0 else '1층' if f == 1 else '2층' if f == 2 else '3층 위'
    floors[g] = floors.get(g, 0) + 1
src = '소상공인시장진흥공단 상가(상권)정보 ' + os.path.basename(zpath)[5:11]
json.dump({'src': src, 'shops': shops}, open(os.path.join(RAW, 'seoul-shops.json'), 'w'))
names = ['', '카페', '음식점', '주점', '편의점', '병원·약국', '소매·생활']
print(f'판 둘레 가게 {len(shops)}곳: ' + ', '.join(f'{names[k]} {count.get(k, 0)}' for k in range(1, 7)) + ' / ' + ', '.join(f'{g} {n}' for g, n in floors.items()), file=sys.stderr)
