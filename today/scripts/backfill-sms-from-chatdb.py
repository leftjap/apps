#!/usr/bin/env python3
"""Read-only card SMS extraction; dry-run by default, explicit --apply to ingest.

Private output defaults to audit/sms-recovery (git-ignored). Tokens are resolved
from the selected owner's existing server record, never embedded in this file.
"""
import argparse
import json
import os
import re
import sqlite3
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from collections import Counter
from datetime import datetime, timedelta, timezone
from pathlib import Path


def extract_attr_body(blob):
    """Decode the NSString payload used by Messages attributedBody."""
    if not blob:
        return None
    for prefix in (b'\x84\x01\x2b', b'\x94\x84\x01\x2b'):
        idx = blob.find(prefix)
        if idx < 0:
            continue
        pos = idx + len(prefix)
        if pos >= len(blob):
            continue
        tag = blob[pos]
        if tag in (0x81, 0x82):
            size = 2 if tag == 0x81 else 4
            if pos + 1 + size > len(blob):
                continue
            length = int.from_bytes(blob[pos + 1:pos + 1 + size], 'little')
            pos += 1 + size
        elif tag < 0x80:
            length = tag
            pos += 1
        else:
            continue
        if pos + length > len(blob):
            continue
        try:
            return blob[pos:pos + length].decode('utf-8')
        except UnicodeDecodeError:
            continue
    return None


def card_of(text):
    """Select actual card messages, independent of replacement-card numbers."""
    for issuer, code in ((r'삼성(?:카드)?', 'samsung'), (r'KB국민카드', 'kb'), (r'KB국민체크\(?', 'kb_check'), (r'신한(?:카드)?', 'shinhan')):
        match = re.search(issuer + r'\]?\s*(\d{4})', text)
        if match:
            return f'{code}_{match[1]}'
    if 'KB국민카드' in text and '후불하이패스' in text:
        return 'kb_hipass'
    if '현대백화점카드' in text:
        return 'hyundai_department'
    return None


def read_messages(db_path, since, until):
    """Read only incoming, bounded card messages. Dates are inclusive in KST."""
    kst = timezone(timedelta(hours=9))
    start = datetime.fromisoformat(since).replace(tzinfo=kst)
    end = datetime.fromisoformat(until).replace(tzinfo=kst) + timedelta(days=1)
    if start >= end:
        raise ValueError('since must not be after until')
    epoch = datetime(2001, 1, 1, tzinfo=timezone.utc)
    start_ns = int((start - epoch).total_seconds() * 1_000_000_000)
    end_ns = int((end - epoch).total_seconds() * 1_000_000_000)
    # SQL is parameterized; never open the user's Messages DB writable.
    connection = sqlite3.connect(Path(db_path).expanduser().resolve().as_uri() + '?mode=ro', uri=True)
    try:
        connection.execute('PRAGMA query_only=ON')
        rows = connection.execute('''
          SELECT m.ROWID,m.date,m.text,m.attributedBody,h.id
          FROM message m JOIN handle h ON h.ROWID=m.handle_id
          WHERE m.is_from_me=0 AND m.date>=? AND m.date<?
          ORDER BY m.date,m.ROWID
        ''', (start_ns, end_ns))
        selected = []
        for message_id, stamp, text, attributed, sender in rows:
            # Filter before decoding to avoid collecting unrelated conversations.
            digits = re.sub(r'\D', '', sender or '')
            if not any(digits.endswith(n) for n in ('15888900', '220008100', '15881688', '15447200', '15447000', '23101234', '15883650')):
                continue
            body = text or extract_attr_body(attributed)
            card = card_of(body or '')
            if not card:
                continue
            received = (epoch + timedelta(microseconds=stamp // 1000)).astimezone(kst).isoformat(timespec='seconds')
            selected.append({'message_id': message_id, 'received_at': received, 'text': body, 'card_key': card})
        return selected
    finally:
        connection.close()


def build_payload(message):
    return {'text': message['text'], 'received_at': message['received_at'], 'ingest_channel': 'backfill'}


def load_env(path):
    result = dict(os.environ)
    if Path(path).exists():
        for line in Path(path).read_text().splitlines():
            match = re.match(r'^\s*([A-Z][A-Z0-9_]*)\s*=\s*(.*?)\s*$', line)
            if match and match[1] not in result:
                result[match[1]] = match[2].strip("'\"")
    return result


def api_json(url, headers, body=None):
    data = None if body is None else json.dumps(body).encode('utf-8')
    request = urllib.request.Request(url, data=data, headers=headers)
    with urllib.request.urlopen(request, timeout=30) as response:
        return json.load(response)


def owner_token(url, service_key, email):
    headers = {'apikey': service_key, 'Authorization': f'Bearer {service_key}'}
    user_id = None
    for page in range(1, 101):
        data = api_json(f'{url}/auth/v1/admin/users?page={page}&per_page=100', headers)
        users = data.get('users', [])
        user_id = next((u['id'] for u in users if u.get('email') == email), None)
        if user_id or len(users) < 100:
            break
    if not user_id:
        raise ValueError('selected owner was not found')
    query = urllib.parse.urlencode({'owner_id': f'eq.{user_id}', 'select': 'token'})
    tokens = api_json(f'{url}/rest/v1/today_sms_ingest_tokens?{query}', headers)
    if len(tokens) != 1:
        raise ValueError('expected exactly one existing ingest token for selected owner')
    return tokens[0]['token']


def write_private(path, data):
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    descriptor = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
    with os.fdopen(descriptor, 'w') as output:
        os.chmod(path, 0o600)
        json.dump(data, output, ensure_ascii=False, indent=2)


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--db', default=str(Path.home() / 'Library/Messages/chat.db'))
    parser.add_argument('--since', default=(datetime.now(timezone(timedelta(hours=9))) - timedelta(days=90)).date().isoformat())
    parser.add_argument('--until', default=datetime.now(timezone(timedelta(hours=9))).date().isoformat())
    parser.add_argument('--input-json', help='Private extracted messages instead of reading chat.db')
    parser.add_argument('--output', default=str(Path(__file__).resolve().parent.parent / 'audit/sms-recovery' / (datetime.now().strftime('%Y%m%d-%H%M%S') + '.json')))
    parser.add_argument('--env', default=str(Path(__file__).resolve().parent.parent / '.env.local'))
    parser.add_argument('--owner-email', help='Required for apply: owner of the source phone')
    parser.add_argument('--apply', action='store_true', help='Send selected messages to the hardened ingest endpoint')
    args = parser.parse_args(argv)
    if args.apply and not args.owner_email:
        parser.error('--apply requires --owner-email matching the source phone')
    try:
        messages = json.loads(Path(args.input_json).read_text()) if args.input_json else read_messages(args.db, args.since, args.until)
        if not isinstance(messages, list):
            raise ValueError('input must be an array of messages')
        for message in messages:
            if not isinstance(message.get('text'), str) or not message['text'].strip():
                raise ValueError('each message needs nonempty text')
            stamp = datetime.fromisoformat(message['received_at'].replace('Z', '+00:00'))
            if stamp.tzinfo is None:
                raise ValueError('each received_at needs a timezone')
        report = {'mode': 'apply' if args.apply else 'dry_run', 'owner_email': args.owner_email, 'selected': len(messages), 'messages': messages, 'results': [], 'stats': {}}
        # Persist the complete private preview before the first network write.
        write_private(args.output, report)
        if not args.apply:
            print(json.dumps({'mode': 'dry_run', 'selected': len(messages), 'output': args.output}))
            return 0
        env = load_env(args.env)
        url = env.get('VITE_SUPABASE_URL', '').rstrip('/')
        key = env.get('SUPABASE_SERVICE_ROLE_KEY')
        if not url or not key:
            raise ValueError('missing Supabase URL/service credentials in selected env')
        token = owner_token(url, key, args.owner_email)
        headers = {'X-Ingest-Token': token, 'Content-Type': 'application/json'}
        counts = Counter()
        for index, message in enumerate(messages):
            try:
                result = api_json(f'{url}/functions/v1/sms-card-ingest', headers, build_payload(message))
            except urllib.error.HTTPError as error:
                result = {'status': 'error', 'http_status': error.code}
            except (OSError, ValueError):
                result = {'status': 'error', 'reason': 'request_failed'}
            counts[result.get('status', 'unknown')] += 1
            report['results'].append({'index': index, **result})
            report['stats'] = dict(counts)
            write_private(args.output, report)
            if result.get('status') == 'error':
                break  # Stop on first failure; retry is safe after diagnosis.
            time.sleep(0.1)
        print(json.dumps({'mode': 'apply', 'selected': len(messages), 'processed': len(report['results']), 'stats': report['stats'], 'output': args.output}))
        return 1 if counts.get('error') else 0
    except (OSError, ValueError, sqlite3.Error) as error:
        print(f'Recovery stopped: {type(error).__name__}: {error}', file=sys.stderr)
        return 1


if __name__ == '__main__':
    raise SystemExit(main())
