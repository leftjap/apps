#!/usr/bin/env python3
"""Sol(Codex) 실행 기록에서 문맥으로 들어간 출력이 어디서 왔는지 센다.

쓰는 법: tools/sol/where.py <기록.log> [<기록.log> ...]   (--top N: 큰 출력 N개도 적는다)
명령마다 출력 바이트를 세어 종류별(파일 읽기, 찾기, 실행, git)로 합친다.
Sol 의 문맥에 들어간 글자는 그 뒤 모든 차례에 다시 실리므로, 큰 출력이 곧 비용이다.
"""
import re
import sys

KINDS = [
    ("파일 읽기", re.compile(r"(^|[;&|\n(]\s*)(cat|sed -n|head|tail|nl|less|bat)\b")),
    ("찾기", re.compile(r"(^|[;&|\n(]\s*)(rg|grep|find|ls|fd|wc)\b")),
    ("실행", re.compile(r"\b(python3?|node|pnpm|uv|npx|tsx|deno|\.venv/bin/python|compare\.sh)\b")),
    ("git", re.compile(r"(^|[;&|\n(]\s*)git\b")),
]


def blocks(lines):
    """(종류, 명령 글, 출력 바이트)를 낸다. 종류는 exec·patch·codex·그 밖."""
    i, n = 0, len(lines)
    while i < n:
        if lines[i] == "exec":
            j = i + 1
            cmd = []
            while j < n and not re.match(r" (succeeded|exited|failed)", lines[j]):
                if lines[j] in ("exec", "codex", "patch:"):
                    break
                cmd.append(lines[j])
                j += 1
            k = j + 1
            size = 0
            while k < n and lines[k] not in ("exec", "codex", "patch:", "tokens used"):
                size += len(lines[k].encode()) + 1
                k += 1
            yield "exec", "\n".join(cmd), size
            i = k
        else:
            i += 1


def kind_of(cmd):
    body = re.sub(r"^/bin/zsh -lc ['\"]?", "", cmd)
    hit = [name for name, pat in KINDS if pat.search(body)]
    # 읽기와 실행이 섞이면 출력은 대개 읽기 쪽이 크다
    return hit[0] if hit else "그 밖"


def main():
    args = sys.argv[1:]
    top = 0
    if "--top" in args:
        at = args.index("--top")
        top = int(args[at + 1])
        del args[at:at + 2]
    print("기록\t명령 수\t출력(KB)\t파일 읽기\t찾기\t실행\tgit\t그 밖\t20KB 넘는 출력")
    for path in args:
        lines = open(path, encoding="utf-8", errors="replace").read().split("\n")
        rows = list(blocks(lines))
        by = {}
        for _, cmd, size in rows:
            by[kind_of(cmd)] = by.get(kind_of(cmd), 0) + size
        total = sum(size for _, _, size in rows)
        big = sum(1 for _, _, size in rows if size > 20000)
        name = path.split("/")[-1]
        cells = [f"{by.get(k, 0) / 1000:.0f}" for k in ("파일 읽기", "찾기", "실행", "git", "그 밖")]
        print(f"{name}\t{len(rows)}\t{total / 1000:.0f}\t" + "\t".join(cells) + f"\t{big}")
        if top:
            for _, cmd, size in sorted(rows, key=lambda r: -r[2])[:top]:
                one = re.sub(r"\s+", " ", re.sub(r"^/bin/zsh -lc ['\"]?", "", cmd))[:150]
                print(f"    {size / 1000:.0f}KB  {one}")


if __name__ == "__main__":
    main()
