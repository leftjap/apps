"""Recovery safety regressions; synthetic messages only."""
import contextlib
import importlib.util
import io
import json
import sqlite3
import tempfile
import unittest
from datetime import datetime, timezone
from pathlib import Path
from unittest.mock import patch


SCRIPT = Path(__file__).with_name('backfill-sms-from-chatdb.py')


def definitions():
    spec = importlib.util.spec_from_file_location('backfill_sms', SCRIPT)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return vars(module)


class BackfillSafetyTests(unittest.TestCase):
    def test_replacement_samsung_number_is_selected(self):
        card = definitions()['card_of']('삼성1595승인 테*트\n7,400원 일시불\n10/18 20:35 테스트점')
        self.assertEqual(card, 'samsung_1595')

    def test_replacement_card_cancellation_is_selected(self):
        self.assertEqual(definitions()['card_of']('[삼성카드]1595취소\n10/18 테스트점\n-7,400원'), 'samsung_1595')

    def test_kb_debit_is_selected_without_credit_card_keyword(self):
        self.assertEqual(definitions()['card_of']('KB국민체크(1303)\n테*트님\n07/30 17:42\n18,000원\n테스트점 사용'), 'kb_check_1303')

    def test_card_name_in_bank_notice_is_not_a_payment(self):
        self.assertIsNone(definitions()['card_of']('[신한은행] 계좌 잔액 안내'))

    def test_truncated_attributed_body_is_ignored(self):
        self.assertIsNone(definitions()['extract_attr_body'](b'prefix\x84\x01\x2b'))

    def test_long_little_endian_attributed_body_is_decoded(self):
        body = ('[삼성카드]1595 ' + '테스트' * 100).encode()
        blob = b'prefix\x84\x01\x2b\x81' + len(body).to_bytes(2, 'little') + body
        self.assertEqual(definitions()['extract_attr_body'](blob), body.decode())

    def test_payload_marks_recovery_without_resetting_phone_health(self):
        build = definitions().get('build_payload')
        self.assertTrue(callable(build), 'recovery needs an explicit backfill payload')
        self.assertEqual(build({'text': '삼성1595승인', 'received_at': '2026-08-14T22:15:00+09:00'}), {
            'text': '삼성1595승인', 'received_at': '2026-08-14T22:15:00+09:00', 'ingest_channel': 'backfill',
        })

    def test_reader_excludes_outgoing_and_uses_kst_without_host_timezone(self):
        read = definitions().get('read_messages')
        self.assertTrue(callable(read), 'read-only bounded extraction is required')
        with tempfile.TemporaryDirectory() as d:
            db = Path(d) / 'chat.db'
            con = sqlite3.connect(db)
            con.executescript('CREATE TABLE handle (id TEXT); CREATE TABLE message (handle_id INTEGER, date INTEGER, text TEXT, attributedBody BLOB, is_from_me INTEGER);')
            con.execute('INSERT INTO handle VALUES (?)', ('+8215888900',))
            apple_ns = int((datetime(2026, 8, 14, 13, 15, tzinfo=timezone.utc).timestamp() - 978307200) * 1_000_000_000)
            for outgoing in (0, 1):
                con.execute('INSERT INTO message VALUES (1,?,?,NULL,?)', (apple_ns, '삼성1595승인 45,000원', outgoing))
            con.commit()
            con.close()
            rows = read(db, '2026-08-14', '2026-08-14')
            self.assertEqual(len(rows), 1)
            self.assertEqual(rows[0]['received_at'], '2026-08-14T22:15:00+09:00')

    def test_default_cli_is_dry_run_and_does_not_contact_server(self):
        main = definitions().get('main')
        self.assertTrue(callable(main), 'a guarded dry-run CLI is required')
        with tempfile.TemporaryDirectory() as d:
            source = Path(d) / 'source.json'
            output = Path(d) / 'preview.json'
            source.write_text(json.dumps([{'text': '삼성1595승인 7,400원', 'received_at': '2026-10-18T20:35:00+09:00'}]))
            with patch('urllib.request.urlopen', side_effect=AssertionError('dry run contacted server')), contextlib.redirect_stdout(io.StringIO()):
                result = main(['--input-json', str(source), '--output', str(output)])
            self.assertEqual(result, 0)
            preview = json.loads(output.read_text())
            self.assertEqual(preview['mode'], 'dry_run')
            self.assertEqual(preview['selected'], 1)
            self.assertEqual(output.stat().st_mode & 0o777, 0o600)


if __name__ == '__main__':
    unittest.main()
