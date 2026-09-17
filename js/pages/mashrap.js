/* ==========================================================================
   第四章 · 麦西热甫
   --------------------------------------------------------------------------
   背景不用图片，用程序化生成的维吾尔几何纹样（八瓣星网格 + 交错菱形带 +
   卷草），随互动实时变化：圈里的人越多，纹样越密越亮。

   互动：点一下往圈里加一个人。人越多，鼓点密一层，纹样亮一分。
   ========================================================================== */
import { renderPart } from '../lib/part.js';
import { bootChapter } from '../lib/chapter.js';
import { buildCircle } from '../lib/circle.js';
import { createTheme, autoPlayOnGesture, unlock } from '../lib/theme.js';

renderPart();
const ctx = bootChapter({ active: 'mashrap', soundBand: 2, mode: 'pattern' });

const host = document.getElementById('mq-host');
const readout = document.getElementById('mq-readout');

/* 主题曲。点满圆圈就开始放 —— 那一下是用户手势，浏览器允许出声；
   解码是异步的，所以提前预载，免得到时候有半秒空白。

   **复用同一个 AudioContext**：页面上有两个独立 context 时，
   浏览器会让其中一个不响（静音的真实原因，定位了很久）。 */
const theme = createTheme('../assets/audio/mashrap/theme.mp3');
theme.preload();

/* ------------------------------------------------------------------ 自动开声
   这一章没有声音等于白做 —— 鼓点、萨帕依、主题曲都是内容的一部分，
   不该让人先去找开关。第一次交互就自动打开手鼓。

   主题曲**不在这里起**：它要等圈子点满才响（见下面的 onFull）。
   但这一次手势必须把 theme 接上同一个 AudioContext ——
   否则等点满时它的 context 还是 suspended，就"点了也没声"。 */
autoPlayOnGesture({
  theme,                  // 传进去只为了复用 context 与唤醒，不会立刻出声
  seq: ctx.seq,
  band: 2,
  startTheme: false,      // 关键：这一页的主题曲由 onFull 触发
});

if (host) {
  /** 人数 → 一句说明。让"加人"这件事有叙事，不只是数字变大。 */
  const stage = (n, max) => {
    const r = n / max;
    if (n === 0) return ['还没人下场', '麦西热甫是从第一个下场的人开始的。点一下圆圈。'];
    if (r < 0.2) return ['起头', '一个人先站进去。鼓点还稀，节奏还慢，等的是别人跟上。'];
    if (r < 0.45) return ['有人跟上', '两三个人就能把节拍立起来。手鼓开始有呼应了。'];
    if (r < 0.7) return ['成圈', '人一多，节奏型就密了。这时候跳错也没人管——本来就是大家一起热闹。'];
    if (r < 1) return ['热起来', '圈快满了。鼓点、纹样、转圈的速度都在往上走。'];
    return ['满圈 · 门开了',
      '这是麦西热甫该有的样子：不是谁在表演，是一圈人自己把场子烧起来。' +
      '<br><span style="color:var(--amber)">主题曲响起，其他民族的页面也解开了。</span>'];
  };

  const circle = buildCircle({
    host,
    reduced: ctx.REDUCED,
    // 满圈：砸一声，把"人散了鼓还在耳朵里"那个结尾感做出来
    onFull: () => {
      if (ctx.seq) {
        if (ctx.seq.ctx) theme.useContext(ctx.seq.ctx);
        ctx.seq.flourish();
      }
      if (ctx.renderer) {
        ctx.renderer.patternZoom = 1.75;      // 纹样整体推近一下
      }
      // 主题曲淡入；同时解锁其他民族的页面
      theme.start(2.6);
      unlock.set();
    },    onChange: (n, max) => {
      const r = n / max;
      // 驱动背景纹样：人越多越亮、越推近
      if (ctx.renderer) {
        ctx.renderer.heat = r;
        ctx.renderer.patternZoom = 1 + r * 0.55;
      }
      // 驱动声音：人越多，节奏型越密
      if (ctx.seq) {
        ctx.seq.setBand(r < 0.35 ? 0 : r < 0.75 ? 1 : 2);
      }
      if (readout) {
        const [title, text] = stage(n, max);
        readout.innerHTML = '<b>' + title + '</b>' + text +
          (n >= max ? '<br><span style="color:var(--bone-faint)">再点一下重新开始。</span>' : '');
      }
    },
  });

  // 自检用
  window.__XM_CIRCLE__ = circle;
  window.__XM_RENDERER__ = ctx.renderer;
  window.__XM_THEME__ = theme;
}
