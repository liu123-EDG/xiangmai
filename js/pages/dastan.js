/* 第三章 · 达斯坦 —— 内容在 js/lib/part-data.js，骨架由 js/lib/part.js 生成
   背景换成滚动视差：三个场景，/3 换一次（层由 tools/slice.py 生成） */
import { renderPart } from '../lib/part.js';
import { bootChapter } from '../lib/chapter.js';
import { buildParallax } from '../lib/parallax.js';

renderPart();
const ctx = bootChapter({ active: 'dastan', soundBand: 1 });

const pxHost = document.getElementById('px');
const pxAnchor = document.getElementById('px-anchor');
if (pxHost && pxAnchor) {
  // 场景顺序即滚动顺序；每层的 shift 由切片工具按深度算好
  const SCENES = [
    { base: '../assets/img/dastan/parallax/scene-a/', tint: 'rgba(6, 8, 16, 0.44)' },
    { base: '../assets/img/dastan/parallax/scene-b/', tint: 'rgba(10, 8, 6, 0.36)' },
    { base: '../assets/img/dastan/parallax/scene-c/', tint: 'rgba(9, 7, 8, 0.38)' },
  ].map((sc) => Object.assign(sc, {
    layers: [
      { file: 'layer1.webp', shift: 1.00 },
      { file: 'layer2.webp', shift: 0.62 },
      { file: 'layer3.webp', shift: 0.38 },
      { file: 'layer4.webp', shift: 0.22 },
      { file: 'layer5.webp', shift: 0.12 },
    ],
  }));

  buildParallax({
    host: pxHost,
    anchor: pxAnchor,
    scenes: SCENES,
    maxShift: 96,
    reduced: ctx.REDUCED,
  });
  document.body.classList.add('has-parallax');
}
