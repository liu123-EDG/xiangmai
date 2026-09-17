/* ==========================================================================
   第三章 · 达斯坦
   --------------------------------------------------------------------------
   内容在 js/lib/part-data.js，骨架由 js/lib/part.js 生成。
   背景是滚动视差：三个场景，滑到 1/3、2/3 各换一次（层由 tools/slice.py 生成）。

   配乐跟着场景走：
     第一个场景 → scene-a.mp3（18.7 秒）
     后两个场景 → scene-b.mp3（19.3 秒），之后不再换回
   切换用交叉淡入，中间不留空白。
   ========================================================================== */
import { renderPart } from '../lib/part.js';
import { bootChapter } from '../lib/chapter.js';
import { buildParallax } from '../lib/parallax.js';
import { createTheme, autoPlayOnGesture } from '../lib/theme.js';

renderPart();
/* drums:false —— 这一页有自己的配乐，不要手鼓音序器。
   否则声音按钮会接在鼓上，按"开"听到的是序章那套鼓点（踩过）。 */
const ctx = bootChapter({ active: 'dastan', drums: false });

/* 场景配乐。比主题曲轻 —— 它是氛围，不该压过正文和鼓。 */
const TRACKS = ['../assets/audio/dastan/scene-a.mp3', '../assets/audio/dastan/scene-b.mp3'];
const pxAudio = createTheme(TRACKS[0]);

/* 场景 → 音轨。前两场景各一首，最后一个沿用第二首（不换回）。 */
const trackForScene = (i) => (i === 0 ? TRACKS[0] : TRACKS[1]);

let curScene = 0;
pxAudio.setVolume(0.30);        // 比主题曲（0.55）轻一档
pxAudio.preload();
pxAudio.loadUrl(TRACKS[1]);     // 第二段也提前解码，切场景时不卡

/* 第一次交互就起第一段（浏览器不允许无手势自动播放）。
   这里不放鼓 —— 达斯坦是叙事章，鼓会盖住配乐。 */
autoPlayOnGesture({ theme: pxAudio, seq: null, fade: 2.4 });

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
    onScene: (i) => {
      curScene = i;
      const want = trackForScene(i);
      if (pxAudio.url !== want) pxAudio.crossfadeTo(want, 2.0);
    },
  });
  document.body.classList.add('has-parallax');
}

// 自检用
window.__XM_THEME__ = pxAudio;
window.__XM_SCENE__ = () => curScene;
