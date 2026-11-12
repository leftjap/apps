"""lab/like/index.html 을 만든다: template.html 의 /*FACES*/ 자리에 p1~p9.jpg 를 data URI 로 넣는다.
사용: python3 tools/lab-like/build.py  (lietome 폴더에서)"""
import base64, io, json, os
from PIL import Image

# 앱의 미리보기 창은 큰 HTML 을 열지 못한다(512KB 는 열리고 614KB 는 실패). 500KB 아래로 맞추려고
# 원본의 아홉 장면 중 다섯 장면(0·2·4·6·8)만 256px 로 줄여 넣는다. template.html 의 FRAMES 와 같아야 한다.
FRAME = 256
PICK = (0, 2, 4, 6, 8)
LIMIT = 500 * 1024
here = os.path.dirname(os.path.abspath(__file__))
faces = []
for i in range(1, 10):
    src = Image.open(os.path.join(here, f"p{i}.jpg")).convert("RGB")
    side = src.height
    im = Image.new("RGB", (FRAME * len(PICK), FRAME))
    for j, k in enumerate(PICK):
        im.paste(src.crop((k * side, 0, (k + 1) * side, side)).resize((FRAME, FRAME), Image.LANCZOS), (j * FRAME, 0))
    buf = io.BytesIO()
    im.save(buf, "JPEG", quality=76, optimize=True)
    faces.append("data:image/jpeg;base64," + base64.b64encode(buf.getvalue()).decode())
page = open(os.path.join(here, "template.html"), encoding="utf-8").read()
assert "/*FACES*/" in page
page = page.replace("/*FACES*/", ", ".join(json.dumps(x) for x in faces))
out = os.path.join(here, "..", "..", "lab", "like", "index.html")
assert len(page.encode()) < LIMIT, f"{len(page.encode())} bytes: 미리보기 창 한계를 넘는다"
open(out, "w", encoding="utf-8").write(page)
print("lab/like/index.html", len(page) // 1024, "KB")
