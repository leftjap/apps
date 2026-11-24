#!/usr/bin/env python3
"""docs/code-map.md 를 코드에서 자동으로 만든다(손으로 고치지 않는다).

쓰는 법: tools/sol/codemap.py            (mapo/ 에서. tools/sol/run.sh 가 커밋이 생긴 실행 뒤에 돌린다)
파일마다 줄 수, 맨 위 설명 한 줄, 함수·클래스의 이름과 줄 범위를 적는다.
새 Sol 세션이 길을 찾으려고 파일을 통째로 읽지 않고 필요한 줄 범위만 읽게 하는 것이 목적이다.
"""
import glob
import os
import re

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
GROUPS = [
    ("새 화면(수치지형도·정밀도로지도 판)", ["src/aerial/*.ts"]),
    ("굽기와 검사(새 판)", ["tools/v2/*.py", "tools/v2/*.mts", "tools/v2/*.ts"]),
    ("차 엔진(예전 판에서 가져와 그대로 쓴다)", ["src/sim/*.ts", "src/sim/intersection/*.ts"]),
    ("사람 엔진(예전 판에서 가져와 그대로 쓴다)", ["src/sim/people/*.ts"]),
    ("실시간 자료와 중계", ["src/data/live.ts", "src/data/subway.ts", "supabase/functions/*/index.ts"]),
    ("Sol 실행 도구", ["tools/sol/*"]),
]
TS = re.compile(r"^( {0,2})(?:export\s+)?(?:default\s+)?(?:async\s+)?(?:function\*?\s+([A-Za-z_$][\w$]*)|class\s+([A-Za-z_$][\w$]*)|const\s+([A-Za-z_$][\w$]*)\s*=\s*(?:async\s*)?(?:\([^)]*\)|[A-Za-z_$][\w$]*)\s*(?::[^=]+)?=>)")
PY = re.compile(r"^(?:async\s+)?(?:def|class)\s+([A-Za-z_]\w*)")


def describe(lines, is_py):
    for line in lines[:12]:
        text = line.strip()
        if is_py:
            m = re.match(r'^(?:[ru]?"""|\'\'\')(.*?)(?:"""|\'\'\')?$', text)
            if m and m.group(1).strip():
                return m.group(1).strip()
            if text.startswith("#") and not text.startswith("#!"):
                return text.lstrip("# ").strip()
        else:
            m = re.match(r"^(?://+|/\*+|\*)\s*(.+?)\s*(?:\*/)?$", text)
            if m and not m.group(1).startswith(("eslint", "@ts-")):
                return m.group(1)
    return ""


def symbols(lines, is_py):
    found = []
    for at, line in enumerate(lines, 1):
        if is_py:
            m = PY.match(line)
            if m:
                found.append((0, m.group(1), at))
        else:
            m = TS.match(line)
            if m:
                found.append((len(m.group(1)), m.group(2) or m.group(3) or m.group(4), at))
    out = []
    for k, (depth, name, start) in enumerate(found):
        # 끝 줄은 같은 깊이나 더 얕은 다음 선언의 앞 줄
        end = len(lines)
        for depth2, _, start2 in found[k + 1:]:
            if depth2 <= depth:
                end = start2 - 1
                break
        out.append(f"{'  ' if depth else ''}{name} {start}-{end}")
    return out


def main():
    os.chdir(ROOT)
    parts = [
        "# 코드 지도 (자동 생성: `tools/sol/codemap.py`. 손으로 고치지 않는다)",
        "",
        "파일마다 줄 수, 맨 위 설명, 함수·클래스의 줄 범위다. 들여 쓴 이름은 바로 위 함수 안에 있다. "
        "여기서 자리를 찾아 `sed -n '시작,끝p'` 로 필요한 범위만 읽는다.",
    ]
    seen = set()
    for title, patterns in GROUPS:
        paths = sorted(p for pat in patterns for p in glob.glob(pat) if os.path.isfile(p) and p not in seen)
        if not paths:
            continue
        parts += ["", f"## {title}"]
        for path in paths:
            seen.add(path)
            lines = open(path, encoding="utf-8", errors="replace").read().split("\n")
            is_py = path.endswith(".py")
            code = path.endswith((".py", ".ts", ".mts"))
            note = describe(lines, is_py)
            parts.append(f"- `{path}` ({len(lines)}줄){': ' + note[:110] if note else ''}")
            syms = symbols(lines, is_py) if code and not re.search(r"(^|/)test_|\.test\.", path) else []
            if syms:
                parts.append("  - " + " · ".join(s.strip() if not s.startswith("  ") else "↳" + s.strip() for s in syms))
    open("docs/code-map.md", "w", encoding="utf-8").write("\n".join(parts) + "\n")


if __name__ == "__main__":
    main()
