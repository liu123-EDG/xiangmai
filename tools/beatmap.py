"""==========================================================================
卡点分析：把 mp3 的鼓点时刻算出来，给视频剪辑用
--------------------------------------------------------------------------
做法：
  1. 用 ffmpeg 解码（没有 ffmpeg 就退回纯 Python 解 MP3 帧头估时长）
  2. 算短时能量 + 谱通量，找出每一击的起音点
  3. 输出"第几秒切一刀"的清单，以及平均间隔 / BPM

用法： python tools/beatmap.py <音频> [--max 15]
=========================================================================="""
import json
import subprocess
import sys
import wave
from pathlib import Path

import numpy as np


def decode(path, sr=22050):
    """用 ffmpeg 解码成单声道 numpy。失败返回 None。"""
    try:
        out = subprocess.run(
            ["ffmpeg", "-v", "quiet", "-i", str(path), "-ac", "1",
             "-ar", str(sr), "-f", "wav", "-"],
            capture_output=True, check=True,
        ).stdout
    except Exception:
        return None, sr
    import io
    with wave.open(io.BytesIO(out), "rb") as w:
        data = np.frombuffer(w.readframes(w.getnframes()), dtype=np.int16)
        return data.astype(np.float32) / 32768.0, w.getframerate()


def onset_envelope(x, sr, hop=256, win=1024):
    """谱通量起音包络。比纯能量更能抓鼓点，尤其是密集的鼓。"""
    n = 1 + max(0, (len(x) - win) // hop)
    if n < 4:
        return np.zeros(0), sr / hop
    frames = np.lib.stride_tricks.as_strided(
        x, shape=(n, win), strides=(x.strides[0] * hop, x.strides[0])
    ) * np.hanning(win)
    mag = np.abs(np.fft.rfft(frames, axis=1))
    flux = np.diff(mag, axis=0)
    flux[flux < 0] = 0
    env = flux.sum(axis=1)
    # 归一化
    if env.max() > 0:
        env = env / env.max()
    return env, sr / hop


def pick_peaks(env, fps, min_gap=0.10, thresh=0.14):
    """在包络上挑峰：局部极大 + 最小间隔 + 阈值。"""
    if len(env) == 0:
        return []
    gap = max(1, int(min_gap * fps))
    peaks = []
    last = -10 ** 9
    for i in range(1, len(env) - 1):
        if env[i] < thresh:
            continue
        if env[i] < env[i - 1] or env[i] < env[i + 1]:
            continue
        if i - last < gap:
            # 同一击的抖动，留强的那个
            if peaks and env[i] > env[peaks[-1]]:
                peaks[-1] = i
                last = i
            continue
        peaks.append(i)
        last = i
    return [p / fps for p in peaks]


def main():
    src = sys.argv[1]
    cap = 15.0
    for a in sys.argv[1:]:
        if a.startswith("--max"):
            cap = float(a.split("=")[-1])

    x, sr = decode(src)
    if x is None or len(x) == 0:
        print("ffmpeg 不可用或解码失败，无法做卡点分析。")
        print("（可以先装 ffmpeg，或者直接按音乐听感手数拍子）")
        return

    dur = len(x) / sr
    env, fps = onset_envelope(x, sr)
    hits = pick_peaks(env, fps)
    hits = [h for h in hits if h <= cap]

    print("时长 %.2f 秒   采样率 %d   检出鼓点 %d 个" % (dur, sr, len(hits)))
    if len(hits) < 2:
        print("鼓点太少，可能不是打击乐主导的曲子。")
        return

    gaps = np.diff(hits)
    print("平均间隔 %.3f 秒  →  约 %.0f BPM" % (gaps.mean(), 60.0 / gaps.mean()))
    print("最短间隔 %.3f 秒   最长 %.3f 秒" % (gaps.min(), gaps.max()))

    print("\n切点清单（秒）：")
    line = []
    for i, h in enumerate(hits):
        if i == 0:
            line.append("%.2f" % h)
        else:
            line.append("%.2f (+%.2f)" % (h, hits[i] - hits[i - 1]))
        if len(line) == 4:
            print("  " + "   ".join(line))
            line = []
    if line:
        print("  " + "   ".join(line))

    # 每隔 N 个鼓点切一刀的粗剪方案
    for every in (1, 2, 3, 4):
        pts = hits[::every]
        print("\n每 %d 个鼓点切一刀 → %d 个镜头" % (every, len(pts)))
        print("  " + "  ".join("%.2f" % p for p in pts[:24]) + (" …" if len(pts) > 24 else ""))

    Path(".tmp/beatmap.json").write_text(
        json.dumps({"duration": dur, "bpm": 60.0 / gaps.mean(), "hits": hits},
                   ensure_ascii=False, indent=2), encoding="utf-8")
    print("\n已写出 .tmp/beatmap.json")


if __name__ == "__main__":
    main()
