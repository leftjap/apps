# 거짓말한 사람의 '평소'와 '답할 때' 사진 차이가 가장 큰 곳을 찾아 단서 위치(정규화 좌표)로 쓴다.
# 사용: python3 tools/tells.py c1-b c2-b ...  → tools/tells.json 과 확인용 tools/tells-check.jpg
import json, sys
from pathlib import Path
from PIL import Image, ImageChops, ImageDraw, ImageFilter, ImageStat
root = Path(__file__).resolve().parent.parent
out, tiles = {}, []
for name in sys.argv[1:]:
    a = Image.open(root / 'img' / f'{name}-ans.jpg').convert('L')
    b = Image.open(root / 'img' / f'{name}-base.jpg').convert('L')
    # 밝기 차이를 맞춘 뒤 차이를 흐려서 덩어리로 본다
    shift = ImageStat.Stat(a).mean[0] - ImageStat.Stat(b).mean[0]
    b = b.point(lambda v: max(0, min(255, v + shift)))
    d = ImageChops.difference(a, b).filter(ImageFilter.GaussianBlur(14))
    W, H = d.size
    px = d.load()
    best, bx, by = -1, 0, 0
    for y in range(int(H * 0.18), int(H * 0.92), 4):
        for x in range(int(W * 0.18), int(W * 0.82), 4):
            if px[x, y] > best:
                best, bx, by = px[x, y], x, y
    out[name] = {'x': round(bx / W, 3), 'y': round(by / H, 3), 'peak': best}
    t = Image.open(root / 'img' / f'{name}-ans.jpg').convert('RGB').resize((384, 384))
    dr = ImageDraw.Draw(t)
    cx, cy = bx / W * 384, by / H * 384
    dr.ellipse([cx - 24, cy - 24, cx + 24, cy + 24], outline=(255, 60, 40), width=3)
    dr.text((6, 6), f'{name} {out[name]}', fill=(255, 255, 0))
    tiles.append(t)
(root / 'tools' / 'tells.json').write_text(json.dumps(out, indent=1))
sheet = Image.new('RGB', (384 * len(tiles), 384))
for i, t in enumerate(tiles):
    sheet.paste(t, (i * 384, 0))
sheet.save(root / 'tools' / 'tells-check.jpg', quality=85)
print(json.dumps(out))
