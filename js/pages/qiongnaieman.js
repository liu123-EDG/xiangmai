/* 第二章 · 穹乃额曼 —— 内容在 js/lib/part-data.js，骨架由 js/lib/part.js 生成
   纵贯线：一个音符钉在开场，符干往下延长、越往下越向右，
   最后落到页面底部的「进入第三章」入口上。它同时是装饰和导航。 */
import { renderPart } from '../lib/part.js';
import { bootChapter } from '../lib/chapter.js';
import { buildThroughline, createDrone } from '../lib/throughline.js';
import { PART_TONE } from '../lib/part-data.js';

renderPart();
const ctx = bootChapter({ active: 'qon', soundBand: 0 });

/* ---- 纵贯线 ---- */
const heroTitle = document.querySelector('#part-hero h1');
const nextLink = document.querySelector('.chapter-nav .next');
const tlHost = document.getElementById('throughline');

if (tlHost && heroTitle && nextLink) {
  buildThroughline({
    host: tlHost,
    anchor: heroTitle,
    endRef: nextLink,
    tone: PART_TONE.qon,
    drift: 0.38,
    reduced: ctx.REDUCED,
  });
  document.body.classList.add('has-throughline');

  /* ---- 持续音：跟着「声音」开关一起走 ----
     浏览器不允许自动播放，所以只能挂在已有的开关上。
     开声音 = 手鼓 + 这一层气息同时来；关 = 一起停。 */
  const drone = createDrone();
  const btn = document.getElementById('sound-toggle');
  if (btn) {
    btn.addEventListener('click', () => {
      const nowOn = btn.getAttribute('aria-pressed') === 'true';
      if (nowOn) drone.start(); else drone.stop();
    });
    // 页面切到后台就停，回来不自动恢复（避免突然响）
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) drone.stop();
    });
  }
}
