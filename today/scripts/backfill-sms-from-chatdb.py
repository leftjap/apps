"""
chat.db 1,167건 카드 결제 SMS 를 sms-card-ingest endpoint 로 풀 backfill.

전제:
- 사용 카드: 삼성카드 1337 / KB국민카드 7007
- chat.db 의 m.date 추출 시 'localtime' 옵션으로 시스템 타임존(KST) 적용됨
- received_at 은 KST → ISO 8601 +09:00 (UTC 변환 안 함)
- 호출 간 100ms (rate limit 보호)

usage: python3 backfill-sms-from-chatdb.py
"""
import sqlite3, re, os, json, urllib.request, urllib.error, time
from collections import Counter

URL = 'https://tcbooffrdacfatywdzcm.supabase.co/functions/v1/sms-card-ingest'
TOKEN = 'de72f3361a68395a009769b2af6a2bbe266c7023244af179'
# Supabase Edge Function gateway 의 platform-level JWT 검증 통과용.
# 새 publishable anon key (sb_publishable_*) 는 JWT format 아니라 거절됨 → service_role JWT 필요.
# .env.local 에서 읽어 하드코딩 회피. launchd 의 WorkingDirectory 가 today 라 가정.
def _load_env(path):
    env = {}
    try:
        with open(path) as f:
            for line in f:
                line = line.strip()
                if not line or line.startswith('#') or '=' not in line: continue
                k, v = line.split('=', 1)
                env[k.strip()] = v.strip()
    except FileNotFoundError:
        pass
    return env
_env = _load_env(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '.env.local'))
SERVICE_KEY = _env.get('SUPABASE_SERVICE_ROLE_KEY', '')
if not SERVICE_KEY:
    raise SystemExit("SUPABASE_SERVICE_ROLE_KEY 누락 — today/.env.local 확인")

con = sqlite3.connect(os.path.expanduser('~/Library/Messages/chat.db'))
con.text_factory = str

# 사용 카드 발신번호 + reject 제외 동일 로직 (cardSmsParser 와 동기)
SQL = """
SELECT datetime(m.date/1000000000 + strftime('%s','2001-01-01'), 'unixepoch', 'localtime'),
       m.text,
       m.attributedBody
FROM message m JOIN handle h ON m.handle_id=h.ROWID
WHERE h.id IN ('+8215888900','+82220008100','+8215881688','+821063491949')
  AND (m.text IS NOT NULL OR m.attributedBody IS NOT NULL)
  AND datetime(m.date/1000000000 + strftime('%s','2001-01-01'), 'unixepoch', 'localtime')
      >= date('now', '-1 year', 'localtime')
ORDER BY m.date ASC
"""

def extract_attr_body(blob):
    """attributedBody (typedstream NSAttributedString) 에서 본문 string 추출."""
    if not blob: return None
    for prefix in (b'\x84\x01\x2b', b'\x94\x84\x01\x2b'):
        idx = blob.find(prefix)
        if idx < 0: continue
        pos = idx + len(prefix)
        b = blob[pos]
        # typedstream 길이는 little-endian (2026-06-11 실측: 0x81 0x8a 0x02 = 650.
        # big 으로 읽으면 35330 → blob 범위 초과 → 추출 실패. 최근 macOS 는 m.text 가
        # NULL 이고 attributedBody 만 있는 메시지가 늘어 이 추출기가 필수 경로)
        if b == 0x81:
            length = int.from_bytes(blob[pos+1:pos+3], 'little'); pos += 3
        elif b == 0x82:
            length = int.from_bytes(blob[pos+1:pos+5], 'little'); pos += 5
        elif b < 0x80:
            length = b; pos += 1
        else:
            continue
        try:
            return blob[pos:pos+length].decode('utf-8')
        except UnicodeDecodeError:
            pass
    return None

def card_of(t):
    if re.search(r'삼성[^\d]{0,5}1337|\[삼성카드\]\s*1337', t): return 'samsung_1337'
    if 'KB국민카드' in t and ('7007' in t or '후불하이패스' in t): return 'kb_7007'
    return None

# Edge Function 응답이 status 알려주므로 클라이언트는 모두 보냄.
# 단 chat.db filter: 사용 카드 매칭만 (다른 카드 noise 사전 차단)
rows = []
attr_recovered = 0
for d, text, attr in con.execute(SQL):
    body = text
    if not body and attr:
        body = extract_attr_body(attr)
        if body: attr_recovered += 1
    if not body: continue
    if card_of(body):
        rows.append((d, body))
print(f"  (attributedBody 에서 추가 복구: {attr_recovered}건)")

print(f"전송 대상: {len(rows)}건")

stats = Counter()
unparsed_samples = []
errors = []

for i, (d, t) in enumerate(rows):
    # KST ISO 8601 — d 는 'YYYY-MM-DD HH:MM:SS' 형식 (KST localtime)
    iso_kst = d.replace(' ', 'T') + '+09:00'
    body = json.dumps({'text': t, 'received_at': iso_kst}).encode('utf-8')
    req = urllib.request.Request(URL, data=body, method='POST', headers={
        'X-Ingest-Token': TOKEN,
        'Content-Type': 'application/json',
        'Authorization': f'Bearer {SERVICE_KEY}',
    })
    try:
        with urllib.request.urlopen(req, timeout=20) as r:
            res = json.loads(r.read())
            status = res.get('status', 'unknown')
            stats[status] += 1
            if status == 'unparsed' and len(unparsed_samples) < 5:
                unparsed_samples.append({'received_at': iso_kst, 'text': t[:200]})
    except urllib.error.HTTPError as e:
        stats[f'http_{e.code}'] += 1
        errors.append((iso_kst, e.code, t[:80]))
    except Exception as e:
        stats['exception'] += 1
        errors.append((iso_kst, str(e)[:80], t[:80]))
    if (i + 1) % 100 == 0:
        print(f"  {i+1}/{len(rows)}: {dict(stats)}")
    time.sleep(0.1)

print("\n=== 최종 분포 ===")
for k, v in stats.most_common():
    print(f"  {k:20s} {v}")

if unparsed_samples:
    print("\n=== unparsed 샘플 5개 (또는 그 이하) ===")
    for s in unparsed_samples:
        print(f"  [{s['received_at']}] {s['text'].replace(chr(10),' / ')[:200]}")

if errors:
    print("\n=== 에러 5개 ===")
    for e in errors[:5]:
        print(f"  {e}")

# 결과 저장
out = '/Users/gio_c/apps/today/audit/sms-fixtures/backfill-result.json'
with open(out, 'w') as f:
    json.dump({
        'sent': len(rows),
        'stats': dict(stats),
        'unparsed_samples': unparsed_samples,
        'errors': errors[:20],
    }, f, ensure_ascii=False, indent=2)
print(f"\n저장: {out}")
