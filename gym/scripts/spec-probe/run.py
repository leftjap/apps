#!/usr/bin/env python3
"""시안/PWA 정본 ↔ 네이티브 렌더 픽셀 대조 하네스.

손으로 옮겨 적은 값이 새는 걸 사람 눈이 아니라 기계가 잡는다.
probes.json 의 각 항목은 반드시 `source`(시안 행 / PWA 파일:행)를 갖는다 — 근거 없는 기대값 금지.

    python3 verify/spec-probe/run.py            # 두 폭(402pt·375pt) 전부
    python3 verify/spec-probe/run.py --device 375

실패 시 exit 1. SKIP 은 조용히 통과시키지 않고 사유를 찍는다.
"""
import argparse, datetime, glob, json, math, os, plistlib, subprocess, sys, uuid

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, "..", ".."))   # gym/
BUNDLE = "com.leftjap.gym"
DEVELOPER_DIR = "/Applications/Xcode.app/Contents/Developer"

DEVICES = {
    "402": {"name": "iPhone 17", "type": "com.apple.CoreSimulator.SimDeviceType.iPhone-17"},
    "375": {"name": "GymSE375", "type": "com.apple.CoreSimulator.SimDeviceType.iPhone-SE-3rd-generation"},
}


# ─────────────────────────── 색 유틸 (paper.css oklch → sRGB) ───────────────────────────

def oklch(L, C, H):
    h = math.radians(H)
    a, b = C * math.cos(h), C * math.sin(h)
    l_ = L + 0.3963377774 * a + 0.2158037573 * b
    m_ = L - 0.1055613458 * a - 0.0638541728 * b
    s_ = L - 0.0894841775 * a - 1.2914855480 * b
    l, m, s = l_ ** 3, m_ ** 3, s_ ** 3
    lr = 4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s
    lg = -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s
    lb = -0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s

    def g(x):
        c = min(max(x, 0.0), 1.0)
        return 1.055 * c ** (1 / 2.4) - 0.055 if c >= 0.0031308 else 12.92 * c
    return tuple(round(g(v) * 255) for v in (lr, lg, lb))


def token_rgb(spec, name):
    v = spec["tokens"][name]
    if isinstance(v, str) and v.startswith("#"):
        return tuple(int(v[i:i + 2], 16) for i in (1, 3, 5))
    return oklch(*v)


def near(c, t, tol):
    return abs(c[0] - t[0]) + abs(c[1] - t[1]) + abs(c[2] - t[2]) <= tol


# ─────────────────────────── 시뮬레이터 ───────────────────────────

def sh(*args, check=True, capture=True):
    env = dict(os.environ, DEVELOPER_DIR=DEVELOPER_DIR)
    return subprocess.run(args, check=check, env=env,
                          capture_output=capture, text=True)


def ensure_device(key):
    d = DEVICES[key]
    out = sh("xcrun", "simctl", "list", "devices").stdout
    for line in out.splitlines():
        s = line.strip()
        # "iPhone 17 (UDID) (Booted)" — 이름 정확 일치 ("iPhone 17 Pro" 오매치 방지)
        if not s.startswith(d["name"] + " ("):
            continue
        udid = s.split("(")[1].split(")")[0]
        if len(udid) == 36:
            return udid
    rt = [l for l in sh("xcrun", "simctl", "list", "runtimes").stdout.splitlines()
          if "iOS" in l and "com.apple" in l]
    runtime = rt[-1].split()[-1]
    return sh("xcrun", "simctl", "create", d["name"], d["type"], runtime).stdout.strip()


def container_plist(udid):
    r = sh("xcrun", "simctl", "get_app_container", udid, BUNDLE, "data", check=False)
    if r.returncode == 0 and r.stdout.strip():
        base = r.stdout.strip()
    else:
        root = os.path.expanduser(
            f"~/Library/Developer/CoreSimulator/Devices/{udid}/data/Containers/Data/Application")
        base = None
        for cand in glob.glob(f"{root}/*"):
            meta = f"{cand}/.com.apple.mobile_container_manager.metadata.plist"
            if os.path.exists(meta):
                with open(meta, "rb") as f:
                    if plistlib.load(f).get("MCMMetadataIdentifier") == BUNDLE:
                        base = cand
                        break
        if base is None:
            sys.exit(f"앱 컨테이너 없음 — 먼저 설치할 것 ({udid})")
    os.makedirs(f"{base}/Library/Preferences", exist_ok=True)
    return f"{base}/Library/Preferences/{BUNDLE}.plist"


# ─────────────────────────── 픽스처 (결정적, 오늘 기준) ───────────────────────────

def build_fixture(today):
    """이번 달 안에서만 배치. 볼륨 편차 + 0kg 운동일(유산소 단독) 포함."""
    if today.day < 10:
        return None, "이번 달 일수 부족 (오늘 day<10) — 히트맵 확정 배치 불가"

    def st(w=None, r=None, dur=None):
        return {"id": str(uuid.uuid4()).upper(), "weight": w, "reps": r, "done": True,
                "pr": False, "preset": False, "duration": dur, "distance": None}

    def blk(ex, sets, fin=None):
        d = {"id": str(uuid.uuid4()).upper(), "type": "single", "exerciseId": ex, "sets": sets}
        if fin:
            d["finishedAt"] = fin
        return d

    def sess(day, blocks, tags):
        date = today.replace(day=day).strftime("%Y-%m-%d")
        vol = sum((s["weight"] or 0) * (s["reps"] or 0) for b in blocks for s in b["sets"])
        ms = int(datetime.datetime.combine(today.replace(day=day),
                                           datetime.time(18)).timestamp() * 1000)
        return {"id": f"probe_{day}", "date": date, "startTime": ms, "endTime": ms + 3_300_000,
                "blocks": blocks, "tags": tags, "totalVolume": vol, "totalCalories": 400,
                "durationMin": 55, "status": "completed"}

    D = today.day
    sessions = [
        sess(D - 2, [blk("squat", [st(100, 8), st(110, 6), st(120, 5)]),
                     blk("leg_press", [st(180, 10), st(180, 10)])], ["legs"]),          # 최대 볼륨
        sess(D - 1, [blk("bench_press", [st(70, 10), st(75, 8)]),
                     blk("bicep_curl", [st(30, 12)])], ["chest", "arms"]),
        sess(D - 4, [blk("deadlift", [st(120, 5), st(130, 5)]),
                     blk("treadmill", [st(dur=1800)])], ["back", "cardio"]),
        sess(D - 6, [blk("cycle", [st(dur=1500)])], ["cardio"]),                        # 0kg 운동일
        sess(D - 8, [blk("shoulder_press", [st(40, 10)])], ["shoulder"]),
    ]
    sessions = [s for s in sessions if int(s["date"][-2:]) >= 1]
    active = {
        "id": "probe_active", "date": today.strftime("%Y-%m-%d"),
        "startTime": int(datetime.datetime.now().timestamp() * 1000) - 18 * 60000,
        "endTime": None,
        "blocks": [
            blk("cable_crossover", [st(25, 12), st(25, 12)], fin=1),
            blk("bench_press", [st(65, 10), st(65, 10),
                                {"id": str(uuid.uuid4()).upper(), "weight": 65, "reps": 8,
                                 "done": False, "pr": False, "preset": False,
                                 "duration": None, "distance": None},
                                {"id": str(uuid.uuid4()).upper(), "weight": 60, "reps": 8,
                                 "done": False, "pr": False, "preset": True,
                                 "duration": None, "distance": None}]),
            blk("incline_bench", [{"id": str(uuid.uuid4()).upper(), "weight": 45, "reps": 10,
                                   "done": False, "pr": False, "preset": True,
                                   "duration": None, "distance": None}]),
        ],
        "tags": ["chest"], "totalVolume": 0, "totalCalories": 0, "durationMin": 0,
        "status": "active",
    }
    return {"sessions": sessions, "active": active}, None


def day_volumes(fixture, today):
    out = {}
    for s in fixture["sessions"]:
        d = int(s["date"][-2:])
        out[d] = out.get(d, 0) + s["totalVolume"]
    return out


def seed(udid, fixture, with_active):
    sh("xcrun", "simctl", "terminate", udid, BUNDLE, check=False)
    sh("xcrun", "simctl", "shutdown", udid, check=False)
    p = container_plist(udid)
    data = {}
    if os.path.exists(p):
        with open(p, "rb") as f:
            data = plistlib.load(f)
    data["gym.sessions.v1"] = json.dumps(fixture["sessions"], ensure_ascii=False).encode()
    data["gym.weights.v1"] = json.dumps(
        [{"date": fixture["sessions"][0]["date"], "kg": 73.1, "height": 173}],
        ensure_ascii=False).encode()
    data.pop("gym.prs.v1", None)
    if with_active:
        data["gym.session.v1"] = json.dumps(fixture["active"], ensure_ascii=False).encode()
    else:
        data.pop("gym.session.v1", None)
    with open(p, "wb") as f:
        plistlib.dump(data, f)
    sh("xcrun", "simctl", "boot", udid, check=False)
    sh("xcrun", "simctl", "bootstatus", udid, "-b", check=False, capture=False)


def shot(udid, args, out):
    sh("xcrun", "simctl", "terminate", udid, BUNDLE, check=False)
    sh("xcrun", "simctl", "launch", udid, BUNDLE, *args)
    subprocess.run(["sleep", "3"])
    sh("xcrun", "simctl", "io", udid, "screenshot", "--type=png", out, check=False)
    return out


# ─────────────────────────── 측정 프리미티브 ───────────────────────────

class Img:
    def __init__(self, path, pt_w):
        from PIL import Image
        self.im = Image.open(path).convert("RGB")
        self.W, self.H = self.im.size
        self.px = self.im.load()
        self.scale = self.W / pt_w

    def pt(self, px):
        return px / self.scale

    def band(self, b):
        return int(self.H * b[0]), int(self.H * b[1])


def edge_margin(img, band, dark_sum_lt, min_run_frac):
    y0, y1 = img.band(band)
    rows = {}
    for y in range(y0, y1):
        xs = [x for x in range(img.W) if sum(img.px[x, y]) < dark_sum_lt]
        if len(xs) > img.W * min_run_frac:
            rows[y] = (min(xs), max(xs))
    if not rows:
        return None
    ys = sorted(rows)
    l, r = rows[ys[len(ys) // 2]]
    return {"left_pt": img.pt(l), "right_pt": img.pt(img.W - 1 - r)}


def bbox_color(img, band, x_frac, rgb, tol):
    y0, y1 = img.band(band)
    x0, x1 = int(img.W * x_frac[0]), int(img.W * x_frac[1])
    pts = [(x, y) for y in range(y0, y1) for x in range(x0, x1) if near(img.px[x, y], rgb, tol)]
    if not pts:
        return None
    xs = [p[0] for p in pts]
    ys = [p[1] for p in pts]
    return {"left_pt": img.pt(min(xs)), "w_pt": img.pt(max(xs) - min(xs) + 1),
            "h_pt": img.pt(max(ys) - min(ys) + 1)}


def darkest_avg(img, box, n=24):
    x0, y0, x1, y1 = box
    pts = [(sum(img.px[x, y]), img.px[x, y]) for y in range(y0, y1) for x in range(x0, x1)]
    pts.sort(key=lambda t: t[0])
    sel = [p[1] for p in pts[:n]]
    if not sel:
        return None
    return tuple(round(sum(c[i] for c in sel) / len(sel)) for i in range(3))


def clusters(img, band, x_frac, rgb, tol, gap_px=10):
    """색 일치 픽셀을 y·x 근접으로 묶어 bbox 목록 반환 (칩·배지 검출용)."""
    y0, y1 = img.band(band)
    x0, x1 = int(img.W * x_frac[0]), int(img.W * x_frac[1])
    pts = [(x, y) for y in range(y0, y1) for x in range(x0, x1) if near(img.px[x, y], rgb, tol)]
    if not pts:
        return []
    pts.sort(key=lambda p: (p[1], p[0]))
    boxes = []
    for x, y in pts:
        placed = False
        for b in boxes:
            if b[0] - gap_px <= x <= b[2] + gap_px and b[1] - gap_px <= y <= b[3] + gap_px:
                b[0], b[1] = min(b[0], x), min(b[1], y)
                b[2], b[3] = max(b[2], x), max(b[3], y)
                placed = True
                break
        if not placed:
            boxes.append([x, y, x, y])
    return [{"left_pt": img.pt(b[0]), "top_px": b[1],
             "w_pt": img.pt(b[2] - b[0] + 1), "h_pt": img.pt(b[3] - b[1] + 1),
             "box": tuple(b)} for b in boxes]


def heat_clusters(img):
    """캘린더 히트맵 셀 — 붉은 계열 색 덩어리. (숫자·링 제외를 위해 면적 필터)"""
    y0, y1 = int(img.H * 0.15), int(img.H * 0.65)
    def is_heat(c):
        r, g, b = c
        return 190 <= r <= 250 and r - b >= 18 and g > b
    pts = [(x, y) for y in range(y0, y1, 1) for x in range(0, img.W, 1) if is_heat(img.px[x, y])]
    cs = []
    for x, y in pts:
        for b in cs:
            if b[0] - 6 <= x <= b[2] + 6 and b[1] - 6 <= y <= b[3] + 6:
                b[0], b[1] = min(b[0], x), min(b[1], y)
                b[2], b[3] = max(b[2], x), max(b[3], y)
                break
        else:
            cs.append([x, y, x, y])
    out = []
    for b in cs:
        w, h = img.pt(b[2] - b[0] + 1), img.pt(b[3] - b[1] + 1)
        if w < 25 or h < 25:      # 숫자 글리프 제외
            continue
        cx, cy = (b[0] + b[2]) // 2, (b[1] + b[3]) // 2
        # 셀 좌상단 안쪽 (숫자 회피)
        sx, sy = b[0] + int((b[2] - b[0]) * 0.18), b[1] + int((b[3] - b[1]) * 0.18)
        out.append({"w_pt": w, "h_pt": h, "left_pt": img.pt(b[0]),
                    "rgb": img.px[sx, sy], "cy": cy, "cx": cx, "box": tuple(b)})
    return out


def expected_heat_rgb(spec, vol, maxvol, shell=(253, 253, 253)):
    a = 0.14 + 0.82 * (vol / maxvol) if maxvol > 0 else 0.14
    base = token_rgb(spec, "heat_rgb")
    return tuple(round(a * base[i] + (1 - a) * shell[i]) for i in range(3)), a


# ─────────────────────────── 프로브 평가 ───────────────────────────

def evaluate(pid, kind, params, expect, tol_pt, tol_rgb, img, spec, ctx):
    if kind == "edge_margin":
        r = edge_margin(img, params["band"], params["dark_sum_lt"], params["min_run_frac"])
        if not r:
            return False, "CTA 를 못 찾음"
        ok = all(abs(r[k] - expect[k]) <= tol_pt for k in ("left_pt", "right_pt"))
        return ok, f"좌 {r['left_pt']:.2f}pt · 우 {r['right_pt']:.2f}pt (기대 {expect['left_pt']})"

    if kind == "bbox_color":
        rgb = token_rgb(spec, params["token"])
        cs = clusters(img, params["band"], params["x_frac"], rgb, params["tol"])
        if not cs:
            return False, f"{params['token']} 색 덩어리 없음"
        if "h_pt" in expect:
            cs.sort(key=lambda c: abs(c["h_pt"] - expect["h_pt"]))
        c = cs[0]
        msgs, ok = [], True
        for k in ("w_pt", "h_pt", "left_pt"):
            if k in expect:
                d = abs(c[k] - expect[k])
                ok &= d <= tol_pt
                msgs.append(f"{k}={c[k]:.2f}(기대 {expect[k]})")
        if "left_pt_min" in expect:
            ok &= c["left_pt"] >= expect["left_pt_min"] - tol_pt
            msgs.append(f"left_pt={c['left_pt']:.2f}(≥{expect['left_pt_min']})")
        if expect.get("square"):
            ok &= abs(c["w_pt"] - c["h_pt"]) <= tol_pt
            msgs.append(f"{c['w_pt']:.2f}×{c['h_pt']:.2f}")
        return ok, " · ".join(msgs)

    if kind == "heat_cell_square":
        cells = heat_clusters(img)
        if not cells:
            return False, "히트 셀 없음"
        # 셀 간 병합 방지를 위해 가장 작은 덩어리(단일 셀) 채택
        c = min(cells, key=lambda c: c["w_pt"] * c["h_pt"])
        exp_side = (img.pt(img.W) - 36 - 24) / 7
        ok = abs(c["w_pt"] - c["h_pt"]) <= tol_pt and abs(c["w_pt"] - exp_side) <= tol_pt
        return ok, f"{c['w_pt']:.2f}×{c['h_pt']:.2f}pt (기대 정사각 {exp_side:.2f})"

    if kind == "heat_cell":
        cells = heat_clusters(img)
        if len(cells) < 2:
            return False, f"히트 셀 {len(cells)}개 — 캘린더 농도 미적용 의심"
        vols = ctx["day_volumes"]
        maxvol = max(vols.values())
        if params["day"] == "max":
            exp, a = expected_heat_rgb(spec, maxvol, maxvol)
            got = min(cells, key=lambda c: sum(c["rgb"]))["rgb"]
        else:
            exp, a = expected_heat_rgb(spec, 0, maxvol)
            got = max(cells, key=lambda c: sum(c["rgb"]))["rgb"]
        ok = near(got, exp, tol_rgb * 3)
        return ok, f"alpha {a:.2f} → 기대 {exp} 실측 {got}"

    if kind == "ring_color":
        rgb = token_rgb(spec, "crail_deep")
        cs = clusters(img, [0.15, 0.65], [0.0, 1.0], rgb, 60, gap_px=4)
        cs = [c for c in cs if c["w_pt"] > 30 and c["h_pt"] > 30]
        if not cs:
            return False, "오늘 링(crail-deep 사각 아웃라인) 없음"
        c = max(cs, key=lambda c: c["w_pt"] * c["h_pt"])
        b = c["box"]
        stroke = darkest_avg(img, (b[0], b[1], b[0] + 4, b[3]), n=8)
        ok = near(stroke, rgb, tol_rgb)
        return ok, f"링 {c['w_pt']:.1f}×{c['h_pt']:.1f}pt 스트로크 {stroke} (기대 {rgb})"

    if kind == "donut_start":
        crail = token_rgb(spec, "crail_base")
        grays = [(194, 187, 172), (208, 202, 189), (221, 216, 205), (233, 229, 220)]
        y0, y1 = int(img.H * 0.13), int(img.H * 0.52)

        def isring(c):
            return near(c, crail, 26) or any(near(c, g, 12) for g in grays)
        pts = [(x, y) for y in range(y0, y1, 2) for x in range(0, img.W, 2) if isring(img.px[x, y])]
        if len(pts) < 200:
            return False, "도넛 링 미검출"
        # 아래쪽 비율 stacked 막대(가로로 길고 납작)는 제외 — 정사각에 가까운 큰 덩어리만 도넛
        boxes = []
        for x, y in pts:
            for b in boxes:
                if b[0] - 12 <= x <= b[2] + 12 and b[1] - 12 <= y <= b[3] + 12:
                    b[0], b[1] = min(b[0], x), min(b[1], y)
                    b[2], b[3] = max(b[2], x), max(b[3], y)
                    break
            else:
                boxes.append([x, y, x, y])
        cand = [b for b in boxes
                if img.pt(b[2] - b[0]) > 100 and abs((b[2] - b[0]) - (b[3] - b[1])) < img.scale * 14]
        if not cand:
            return False, "정사각 도넛 덩어리 없음 (stacked 막대만 검출?)"
        b = max(cand, key=lambda b: (b[2] - b[0]) * (b[3] - b[1]))
        cx = (b[0] + b[2]) / 2
        cr = [p for p in pts if b[0] <= p[0] <= b[2] and b[1] <= p[1] <= b[3]
              and near(img.px[p[0], p[1]], crail, 26)]
        if not cr:
            return False, "도넛 안에 crail 아크 없음"
        top = min(cr, key=lambda p: p[1])
        dx = img.pt(abs(top[0] - cx))
        ok = dx <= 10
        return ok, f"crail 아크 최상단이 중심에서 {dx:.1f}pt (12시 시작이면 ~0)"

    if kind == "setbar_number_ink":
        target = "crail_base" if params["slot"] == "now" else "ink_2"
        rgb = token_rgb(spec, target)
        cs = clusters(img, [0.14, 0.34], [0.0, 1.0], rgb, 18, gap_px=4)
        # 세트바 = 가로로 긴 막대. 슬롯 수에 따라 폭이 변하므로 상한을 넉넉히 (숫자 글리프는 h<6 or w<20 로 제외)
        cs = [c for c in cs if 20 <= c["w_pt"] <= 140 and 10 <= c["h_pt"] <= 30]
        if not cs:
            return False, f"{params['slot']} 막대 미검출"
        c = sorted(cs, key=lambda c: c["left_pt"])[0 if params["slot"] == "done" else -1]
        b = c["box"]
        box = (b[0], b[3] + int(img.scale * 5), b[2], b[3] + int(img.scale * 20))
        got = darkest_avg(img, box)
        exp = token_rgb(spec, expect["token"])
        ok = got is not None and near(got, exp, tol_rgb * 3)
        return ok, f"숫자 잉크 {got} (기대 {expect['token']} {exp})"

    return False, f"알 수 없는 kind: {kind}"


# ─────────────────────────── 메인 ───────────────────────────

SCREENS = {
    "home": ([], False),
    "stats-cal": (["--route", "stats", "--tab", "cal"], False),
    "stats-body": (["--route", "stats", "--tab", "body"], False),
    "session": (["--route", "session"], True),
}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--device", choices=["375", "402", "all"], default="all")
    # 스크린샷은 gitignore 되는 verify/ 로 (공개 repo 에 개인 데이터 스샷 커밋 금지)
    ap.add_argument("--outdir", default=os.path.join(ROOT, "verify", "spec-probe-shots"))
    a = ap.parse_args()

    spec = json.load(open(os.path.join(HERE, "probes.json"), encoding="utf-8"))
    today = datetime.date.today()
    fixture, why = build_fixture(today)
    if fixture is None:
        print(f"SKIP 전체 — {why}")
        return 2
    vols = day_volumes(fixture, today)
    os.makedirs(a.outdir, exist_ok=True)

    keys = ["402", "375"] if a.device == "all" else [a.device]
    rows, failed = [], 0
    for key in keys:
        udid = ensure_device(key)
        pt_w = float(key)
        # 화면군별로 시드 1회 (active 유무)
        for with_active in (False, True):
            seed(udid, fixture, with_active)
            for sc, (args, needs_active) in SCREENS.items():
                if needs_active != with_active:
                    continue
                png = os.path.join(a.outdir, f"{key}-{sc}.png")
                shot(udid, args, png)
                img = Img(png, pt_w)
                for p in spec["probes"]:
                    if p["screen"] != sc:
                        continue
                    if p["devices"] != ["all"] and key not in p["devices"]:
                        continue
                    ok, msg = evaluate(p["id"], p["kind"], p.get("params", {}), p["expect"],
                                       p.get("tol_pt", 1.0), p.get("tol_rgb", 6), img, spec,
                                       {"day_volumes": vols})
                    rows.append((key, p["id"], ok, msg, p["source"]))
                    failed += 0 if ok else 1

    w = max(len(r[1]) for r in rows)
    print(f"\n{'dev':<5}{'probe':<{w+2}}{'':<6}측정")
    print("-" * (w + 70))
    for dev, pid, ok, msg, src in rows:
        print(f"{dev:<5}{pid:<{w+2}}{'PASS' if ok else 'FAIL':<6}{msg}")
        if not ok:
            print(f"{'':<5}{'':<{w+2}}      ↳ 정본: {src}")
    print("-" * (w + 70))
    nprobes = len({r[1] for r in rows})
    ndev = len({r[0] for r in rows})
    print(f"{len(rows)}개 측정 (프로브 {nprobes} × 기기 {ndev}) · 실패 {failed}")
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
