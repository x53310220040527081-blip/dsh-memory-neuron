"""归档会话检索 —— 从 ~/.dsh/sessions 里翻旧对话（冷备，不占每轮成本）

用法：
  python recall.py --q "关键词" [--limit 20] [--days 30] [--ws 关键词] [--full]

原理：session.v4.jsonl.zstd 是**多帧拼接**（每个事件一帧），
Node 的 zlib 只能解第一帧，所以用 zstandard 的流式 reader 连帧解。
"""

import argparse
import datetime as dt
import json
import os
import sys

try:
    sys.stdout.reconfigure(encoding='utf-8', errors='replace')
except Exception:
    pass

ROOT = os.path.join(os.path.expanduser("~"), ".dsh", "sessions")


def iter_events(path):
    import zstandard as zstd

    dctx = zstd.ZstdDecompressor()
    with open(path, "rb") as fh:
        with dctx.stream_reader(fh) as r:
            buf = b""
            while True:
                chunk = r.read(1 << 20)
                if not chunk:
                    break
                buf += chunk
                while b"\n" in buf:
                    line, buf = buf.split(b"\n", 1)
                    line = line.strip()
                    if line:
                        yield line
            if buf.strip():
                yield buf.strip()


def _parts(content):
    """content 可能是字符串或 [{type,text}] 列表"""
    out = []
    if isinstance(content, str):
        return [content]
    if isinstance(content, list):
        for part in content:
            if isinstance(part, dict):
                if part.get("type") in ("text", "reasoning") and part.get("text"):
                    if part.get("type") == "text":
                        out.append(part["text"])
            elif isinstance(part, str):
                out.append(part)
    return out


def event_role_and_text(ev, with_tools=False):
    """按 DSH 会话事件结构取 (role, text)"""
    t = ev.get("type")
    d = ev.get("data") or {}
    if t == "user/message":
        txt = "\n".join(_parts(d.get("content")))
        return ("你", txt)
    if t == "assistant/message":
        msg = d.get("message") or {}
        txt = "\n".join(_parts(msg.get("content")))
        return ("我", txt)
    if with_tools and t == "tool/result":
        msg = d.get("message") or {}
        txt = "\n".join(_parts(msg.get("content")))
        return ("工具", txt)
    return (None, "")


def event_time(ev):
    for k in ("time", "timestamp", "ts", "createdAt"):
        v = ev.get(k)
        if isinstance(v, (int, float)) and v > 0:
            return v
    return 0


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--q", default="", help="关键词（空 = 只列最近会话）")
    ap.add_argument("--limit", type=int, default=20)
    ap.add_argument("--days", type=int, default=0, help="只看最近 N 天")
    ap.add_argument("--ws", default="", help="工作区名包含该字符串")
    ap.add_argument("--full", action="store_true", help="打印完整命中行")
    ap.add_argument("--with-tools", action="store_true", help="连工具输出一起搜（默认只搜对话）")
    a = ap.parse_args()

    if not os.path.isdir(ROOT):
        print("没有找到会话目录:", ROOT)
        return 1

    cutoff = None
    if a.days > 0:
        cutoff = (dt.datetime.now() - dt.timedelta(days=a.days)).timestamp() * 1000

    hits = []
    scanned = 0
    for ws in sorted(os.listdir(ROOT)):
        if a.ws and a.ws not in ws:
            continue
        wsd = os.path.join(ROOT, ws)
        if not os.path.isdir(wsd):
            continue
        for sess in sorted(os.listdir(wsd)):
            path = os.path.join(wsd, sess, "session.v4.jsonl.zstd")
            if not os.path.exists(path):
                continue
            scanned += 1
            try:
                for line in iter_events(path):
                    try:
                        ev = json.loads(line.decode("utf-8", "replace"))
                    except Exception:
                        continue
                    if ev.get("type") == "session":
                        continue
                    role, texts = event_role_and_text(ev, a.with_tools)
                    if not texts or not role:
                        continue
                    if a.q and a.q not in texts:
                        continue
                    ts = event_time(ev)
                    if cutoff and isinstance(ts, (int, float)) and ts and ts < cutoff:
                        continue
                    hits.append({
                        "ws": ws,
                        "sess": sess,
                        "role": role,
                        "ts": ts,
                        "text": texts,
                    })
            except Exception as e:
                print(f"  [跳过] {ws}/{sess}: {e}", file=sys.stderr)

    def fmt_ts(ts):
        try:
            if isinstance(ts, (int, float)) and ts > 1e12:
                return dt.datetime.fromtimestamp(ts / 1000).strftime("%Y-%m-%d %H:%M")
            if isinstance(ts, (int, float)) and ts > 1e9:
                return dt.datetime.fromtimestamp(ts).strftime("%Y-%m-%d %H:%M")
        except Exception:
            pass
        return "?"

    print(f"扫描 {scanned} 个会话，命中 {len(hits)} 条" + (f"（关键词：{a.q}）" if a.q else ""))
    for h in hits[-a.limit:]:
        body = h["text"] if a.full else h["text"].replace("\n", " ")[:160]
        print(f"\n[{fmt_ts(h['ts'])}] {h['ws'].replace('--', '')} · {h['role']}")
        print(f"  {body}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
