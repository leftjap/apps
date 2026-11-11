# raw/p-<사람>.json(평소, 사건1 직후, …, 사건2 직후: 마지막 장)을 img/<사람>-base.jpg, img/d1-<사람>.jpg, img/d2-<사람>.jpg 로 푼다.
import base64, io, json, sys
from pathlib import Path
from PIL import Image
root = Path(__file__).resolve().parent.parent
for person in sys.argv[1:]:
    urls = json.loads((root / 'raw' / f'p-{person}.json').read_text())
    for url, out in zip([urls[0], urls[1], urls[-1]], [f'{person}-base', f'd1-{person}', f'd2-{person}']):
        im = Image.open(io.BytesIO(base64.b64decode(url.split(',', 1)[1]))).convert('RGB')
        im.resize((768, 768), Image.LANCZOS).save(root / 'img' / f'{out}.jpg', quality=86)
    print(person, len(urls))
