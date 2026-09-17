/* 暴露三段烘焙纹理给 tools/material-probe.mjs。
   尺寸必须与 js/pages/home.js 里的 BAKE_SIZES 一致 ——
   材质是按那个宽高比设计的，用别的比例烘出来会被拉伸，量出来的形状就不准。 */
import { Renderer } from '/js/lib/renderer.js';

const SIZE = [[560, 192], [560, 142], [560, 158]];   // 与 BAKE_SIZES 同比例，取半分辨率

function run() {
  const host = document.createElement('canvas');
  const r = new Renderer(host, { wallGain: 1, muralGain: 1.25 });
  window.__XM_PROBE__ = SIZE.map(([w, h], i) => r.bake(i, w, h, 1.0));
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', run);
else run();
