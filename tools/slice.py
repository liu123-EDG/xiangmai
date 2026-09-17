"""==========================================================================
切片：图片 + 深度图 → 若干透明 PNG 层，用于滚动视差
--------------------------------------------------------------------------
思路：
  1. 按深度图的百分位切成 N 个带（近 → 远）
  2. 每个带做成一张与原图等大的 RGBA：带内不透明，带外透明，边缘羽化
  3. **补洞**：把带内的像素向外扩（dilate）若干像素，填进透明区。
     因为视差移动时前面的层会挪开，露出原本被遮住的地方；
     不补的话会看到空洞。扩张半径 = 该层最大位移量。
  4. 导出一张预览图，肉眼确认分层对不对

用法：
    python tools/slice.py <原图> <深度图> <输出目录>
        [--layers 5] [--feather 26] [--shift 60] [--preview]

输出：
    <输出目录>/layer1.png … layerN.png   （layer1 = 最近）
    <输出目录>/preview.png               （各层错位的合成预览）
    <输出目录>/layers.json               （每层的位移量建议）
=========================================================================="""
import json
import os
import sys

import numpy as np
from PIL import Image, ImageFilter

# 每层相对滚动位移的倍数：越近动得越多
# （layer1 最近 → 倍数最大）
SHIFT_TABLE = [1.00, 0.62, 0.38, 0.22, 0.12, 0.06]


def band_masks(depth, n):
    """按百分位切成 n 个深度带，返回 [mask1…maskN]，mask1 最近。

    注意最后一个带的右端要**闭区间**：hi 就是 depth 的最大值，
    写成 `< hi` 会把它整个排除掉，那一层就空了（踩过）。"""
    qs = np.percentile(depth, np.linspace(0, 100, n + 1))
    masks = []
    for i in range(n):
        lo, hi = qs[i], qs[i + 1]
        if i == n - 1:
            m = (depth >= lo) & (depth <= hi)
        else:
            m = (depth >= lo) & (depth < hi)
        masks.append(m)
    masks = masks[::-1]          # 现在 masks[0] 是最近
    # 兜底：万一某个带还是空的，把最接近的像素塞进去，避免整层消失
    for i, m in enumerate(masks):
        if m.sum() == 0:
            center = qs[n - i] if i < len(qs) else qs[-1]
            masks[i] = np.abs(depth - center) <= max(1.0, (qs[-1] - qs[0]) / (n * 4))
    return masks


def feather(mask_img, radius):
    """羽化边缘，避免出现硬切边"""
    if radius <= 0:
        return mask_img
    return mask_img.filter(ImageFilter.GaussianBlur(radius))


def dilate_alpha(mask_img, px):
    """把不透明区向外扩张 px 像素 —— 这就是补洞。
       用最大值滤波近似，PIL 的 MaxFilter 尺寸必须是奇数。"""
    if px <= 0:
        return mask_img
    size = px * 2 + 1
    size = min(size, 9) if size % 2 == 0 else size
    size = size if size % 2 == 1 else size + 1
    out = mask_img
    remaining = px
    while remaining > 0:
        step = min(4, remaining)
        k = step * 2 + 1
        out = out.filter(ImageFilter.MaxFilter(k))
        remaining -= step
    return out


def main():
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    src, depth_path, outdir = args[0], args[1], args[2]

    n_layers = 5
    feather_px = 26
    shift_px = 60
    quality = 86
    for a in sys.argv[1:]:
        if a.startswith("--layers"):
            n_layers = int(a.split("=")[-1])
        elif a.startswith("--feather"):
            feather_px = int(a.split("=")[-1])
        elif a.startswith("--shift"):
            shift_px = int(a.split("=")[-1])
        elif a.startswith("--quality"):
            quality = int(a.split("=")[-1])

    img = Image.open(src).convert("RGBA")
    depth = np.asarray(Image.open(depth_path).convert("L"), dtype=np.float32)
    if depth.shape != (img.height, img.width):
        depth = np.asarray(
            Image.open(depth_path).convert("L").resize(img.size, Image.BILINEAR),
            dtype=np.float32,
        )

    os.makedirs(outdir, exist_ok=True)
    masks = band_masks(depth, n_layers)

    layers = []
    for i, m in enumerate(masks):
        alpha = Image.fromarray((m * 255).astype(np.uint8), mode="L")
        alpha = feather(alpha, feather_px)
        # 补洞半径要覆盖这一层的最大位移
        shift = shift_px * SHIFT_TABLE[min(i, len(SHIFT_TABLE) - 1)]
        alpha = dilate_alpha(alpha, int(shift) + 8)

        layer = img.copy()
        layer.putalpha(alpha)
        # 直接出 WebP：同样画质下 PNG 是它的 15 倍大（13.8MB → 0.9MB）
        path = os.path.join(outdir, "layer%d.webp" % (i + 1))
        layer.save(path, "WEBP", quality=quality, method=6)
        layers.append({
            "file": "layer%d.webp" % (i + 1),
            "shift": round(SHIFT_TABLE[min(i, len(SHIFT_TABLE) - 1)], 3),
            "pixels": int(round(shift)),
            "coverage": round(float(m.mean()), 4),
        })
        print("  layer%d  alpha 覆盖 %5.1f%%   位移 %3d px   %5.0f KB" %
              (i + 1, m.mean() * 100, int(shift), os.path.getsize(path) / 1024))

    # 预览：各层按位移量错位叠起来，看分层对不对
    W, H = img.size
    preview = Image.new("RGBA", (W, H), (12, 11, 10, 255))
    for i in reversed(range(len(layers))):
        layer = Image.open(os.path.join(outdir, layers[i]["file"])).convert("RGBA")
        dx = -int(layers[i]["pixels"] * 0.6)
        dy = int(layers[i]["pixels"] * 0.25)
        preview.alpha_composite(layer, (dx, dy))
    preview.convert("RGB").save(os.path.join(outdir, "preview.jpg"), quality=88, optimize=True)

    with open(os.path.join(outdir, "layers.json"), "w", encoding="utf-8") as f:
        json.dump({"size": [W, H], "layers": layers}, f, ensure_ascii=False, indent=2)

    print("\n  输出目录：" + outdir)
    print("  预览图：preview.png（各层错位叠合，用来检查分层是否合理）")


if __name__ == "__main__":
    main()
