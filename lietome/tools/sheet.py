# 확인용: 사람마다 [답할 때 | 평소] 를 한 줄로 붙여 한 장으로 만든다.
import sys
from pathlib import Path
from PIL import Image, ImageDraw
root = Path(__file__).resolve().parent.parent
names, out = sys.argv[2:], sys.argv[1]
S = 360
sheet = Image.new('RGB', (S * 2 + 30, (S + 24) * len(names)), 'white')
d = ImageDraw.Draw(sheet)
for r, n in enumerate(names):
    y = r * (S + 24)
    d.text((6, y + 4), n + '   (left: answer / right: baseline)', fill='black')
    for c, kind in enumerate(['ans', 'base']):
        p = root / 'img' / f'{n}-{kind}.jpg'
        if p.exists():
            sheet.paste(Image.open(p).resize((S, S)), (c * (S + 10) + 5, y + 20))
sheet.save(out, quality=85)
