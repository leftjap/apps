# raw/<name>.json(데이터 URL 목록)을 img/<name>-ans.jpg, img/<name>-base.jpg 로 푼다. 첫 장=답할 때, 둘째 장=평소.
import base64, io, json, sys
from pathlib import Path
from PIL import Image
root = Path(__file__).resolve().parent.parent
for name in sys.argv[1:]:
    urls = json.loads((root / 'raw' / f'{name}.json').read_text())
    for url, kind in zip(urls, ['ans', 'base']):
        im = Image.open(io.BytesIO(base64.b64decode(url.split(',', 1)[1]))).convert('RGB')
        im.resize((768, 768), Image.LANCZOS).save(root / 'img' / f'{name}-{kind}.jpg', quality=86)
    print(name, len(urls))
