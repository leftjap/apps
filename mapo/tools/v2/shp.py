# SHP 읽기(표준 라이브러리만): 면·선·점의 좌표를 고리 목록으로. dbf 는 필드 이름과 값을 글자로.
import struct


def shapes(path):
    """[(종류, [고리(점 목록)...]), ...]  종류: 1 점, 3 선, 5 면 (Z·M 은 같은 종류로)"""
    d = open(path, 'rb').read()
    out, pos = [], 100
    while pos + 8 <= len(d):
        clen = struct.unpack('>i', d[pos + 4:pos + 8])[0] * 2
        rec = d[pos + 8:pos + 8 + clen]
        pos += 8 + clen
        if len(rec) < 4:
            continue
        st = struct.unpack('<i', rec[:4])[0] % 10
        if st == 1:
            out.append((1, [[struct.unpack('<2d', rec[4:20])]]))
        elif st in (3, 5):
            nparts, npts = struct.unpack('<2i', rec[36:44])
            parts = list(struct.unpack(f'<{nparts}i', rec[44:44 + 4 * nparts])) + [npts]
            base = 44 + 4 * nparts
            pts = [struct.unpack('<2d', rec[base + 16 * i:base + 16 * i + 16]) for i in range(npts)]
            out.append((st, [pts[parts[i]:parts[i + 1]] for i in range(nparts)]))
        else:
            out.append((0, []))
    return out


def dbf(path, enc='cp949'):
    d = open(path, 'rb').read()
    n, hlen, rlen = struct.unpack('<IHH', d[4:12])
    fields, p = [], 32
    while d[p] != 0x0D:
        fields.append((d[p:p + 11].split(b'\0')[0].decode(enc, 'ignore'), d[p + 16]))
        p += 32
    rows = []
    for i in range(n):
        r = d[hlen + i * rlen + 1:hlen + (i + 1) * rlen]
        row, q = {}, 0
        for name, ln in fields:
            row[name] = r[q:q + ln].decode(enc, 'ignore').strip()
            q += ln
        rows.append(row)
    return [f[0] for f in fields], rows
