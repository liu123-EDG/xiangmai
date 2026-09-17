"""==========================================================================
深度估计：图片 → 深度图（灰阶 PNG）
--------------------------------------------------------------------------
用 Depth Anything V2 Small 的 ONNX 量化版跑推理。纯 CPU，一张图几秒。

用法：
    python tools/depth.py <图片> [输出.png] [--size 518]

输出是一张灰阶深度图：越亮 = 越近，越暗 = 越远。
后续 tools/slice.py 会拿它切片。
=========================================================================="""
import sys
import numpy as np
from PIL import Image
import onnxruntime as ort

MODEL = r"D:\dsh\.tmp\models\depth-anything-v2-small.onnx"


def estimate(img_path, out_path=None, size=518):
    img = Image.open(img_path).convert("RGB")
    w0, h0 = img.size

    # 模型输入是固定边长（518 是 Depth Anything 的默认），保持长宽比做 letterbox
    scale = size / max(w0, h0)
    nw, nh = max(1, round(w0 * scale)), max(1, round(h0 * scale))
    resized = img.resize((nw, nh), Image.LANCZOS)

    canvas = Image.new("RGB", (size, size), (0, 0, 0))
    canvas.paste(resized, ((size - nw) // 2, (size - nh) // 2))

    arr = np.asarray(canvas, dtype=np.float32) / 255.0
    mean = np.array([0.485, 0.456, 0.406], dtype=np.float32)
    std = np.array([0.229, 0.224, 0.225], dtype=np.float32)
    arr = (arr - mean) / std
    x = arr.transpose(2, 0, 1)[None].astype(np.float32)

    sess = ort.InferenceSession(MODEL, providers=["CPUExecutionProvider"])
    in_name = sess.get_inputs()[0].name
    out = sess.run(None, {in_name: x})[0]

    depth = np.squeeze(out)
    # letterbox 的部分裁掉，再放大回原尺寸
    top = (size - nh) // 2
    left = (size - nw) // 2
    depth = depth[top:top + nh, left:left + nw]
    depth = np.asarray(Image.fromarray(depth).resize((w0, h0), Image.BILINEAR))

    # 归一化到 0..255
    d = depth - depth.min()
    if d.max() > 1e-6:
        d = d / d.max()
    gray = (d * 255).astype(np.uint8)

    if out_path:
        Image.fromarray(gray, mode="L").save(out_path)
        print("深度图已写出：" + out_path)
    return gray


if __name__ == "__main__":
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    size = 518
    for a in sys.argv[1:]:
        if a.startswith("--size"):
            size = int(a.split("=")[-1])
    src = args[0]
    dst = args[1] if len(args) > 1 else None
    g = estimate(src, dst, size)
    print("尺寸 %d×%d  深度范围 %d..%d" % (g.shape[1], g.shape[0], g.min(), g.max()))
