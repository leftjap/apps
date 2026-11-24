#!/usr/bin/env python3
"""Codex 세션 파일(~/.codex/sessions)에서 실제 토큰 내역을 뽑는다.

쓰는 법: tools/sol/usage.py <세션 번호> [--after <UTC 초>] [--before <UTC 초>]
출력(탭): 호출 수, 끝 문맥, 최대 문맥, 입력(캐시 포함), 비캐시 입력+출력
Sol 은 호출마다 그때까지의 문맥 전체를 다시 싣는다. 그래서 비용은 「호출 수 × 문맥 크기」이고,
Codex 가 끝에 찍는 「tokens used」(비캐시 입력+출력)는 그 일부만 보여 준다.
"""
import glob
import json
import os
import sys
from datetime import datetime, timezone


def events(sid):
    paths = glob.glob(os.path.expanduser(f"~/.codex/sessions/*/*/*/rollout-*{sid}.jsonl"))
    for path in sorted(paths):
        for line in open(path, encoding="utf-8", errors="replace"):
            if '"token_count"' not in line:
                continue
            try:
                row = json.loads(line)
            except ValueError:
                continue
            info = row.get("payload", {}).get("info")
            if row.get("payload", {}).get("type") != "token_count" or not info:
                continue
            at = datetime.fromisoformat(row["timestamp"].replace("Z", "+00:00")).timestamp()
            yield at, info


def main():
    args = sys.argv[1:]
    sid = args[0]
    after = float(args[args.index("--after") + 1]) if "--after" in args else 0.0
    before = float(args[args.index("--before") + 1]) if "--before" in args else float("inf")
    base = {"input_tokens": 0, "cached_input_tokens": 0, "output_tokens": 0}
    last = None
    calls, peak, end = 0, 0, 0
    for at, info in events(sid):
        if at <= after:
            base = info["total_token_usage"]
            continue
        if at > before:
            break
        calls += 1
        end = info["last_token_usage"]["input_tokens"]
        peak = max(peak, end)
        last = info["total_token_usage"]
    if last is None:
        print("0\t0\t0\t0\t0")
        return
    inp = last["input_tokens"] - base["input_tokens"]
    cached = last["cached_input_tokens"] - base["cached_input_tokens"]
    out = last["output_tokens"] - base["output_tokens"]
    print(f"{calls}\t{end}\t{peak}\t{inp}\t{inp - cached + out}")


if __name__ == "__main__":
    main()
