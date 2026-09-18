/* ==========================================================================
   入口页
   --------------------------------------------------------------------------
   整屏循环播放概念片，永不让位。

   复用 js/lib/hero-video.js —— 那是给序章写的同一套东西，
   只要把 fadeStart 设成 2（进度永远到不了）并且不调用 setProgress，
   视频就一直循环、永不淡出。不用再写一份循环逻辑。

   文字浮现：第三段（黑场那道金线）上浮出「十二木卡姆」。
   —— 这段本来是有的。我做"可循环"版本时为了能接回开头，
      把整块文字层删掉了，结果整条片子里再也没出现过那几个字。
      现在按循环时钟接回来：第三段走到约 0.9 秒开始浮现，
      循环回第一段之前淡掉，不会硬切。

   手机上不启用视频：三段全屏视频对手机太重，
   那时这页退化成"暖光底 + 品牌 + 进入"，一样能用。
   ========================================================================== */
import { buildHeroVideo, isDesktop } from '../lib/hero-video.js';

const host = document.getElementById('hero-video');
const title = document.getElementById('w-title');
const ug = title && title.querySelector('.w-title__ug');
const rule = title && title.querySelector('.w-title__rule');
const cn = title && title.querySelector('.w-title__cn');
const lat = title && title.querySelector('.w-title__lat');
const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/* 和 hero-video 里的时间轴对齐：三段各 5.09 秒 */
const CLIP = 5.09;
const T3 = CLIP * 2;            // 10.18：第三段开始
const LOOP_LEN = 15.90;         // 整圈长度

const clamp01 = (x) => Math.min(1, Math.max(0, x));
const easeOut = (x) => 1 - Math.pow(1 - x, 3);

/**
 * 按整圈秒数推进文字。s 是"相对第三段起点"的秒数。
 *
 *   0.9 – 3.5   维吾尔文浮现（模糊 → 清晰，暗 → 亮）
 *   2.9 – 4.0   分隔线展开（正好压在视频那道金线上）
 *   3.0 – 4.3   中文
 *   3.3 – 4.6   英文
 *   4.9 – 5.8   整体淡掉，接回第一段
 */
function tickTitle(t) {
  if (!title) return;
  const s = t - T3;

  if (s < 0) {                       // 还没到第三段：全部藏起来
    if (ug) { ug.style.opacity = '0'; ug.style.filter = 'blur(20px) brightness(0.4)'; }
    if (rule) { rule.style.width = '0'; rule.style.opacity = '0'; }
    if (cn) cn.style.opacity = '0';
    if (lat) lat.style.opacity = '0';
    return;
  }

  // 整体淡出（循环出去之前）
  const fade = 1 - clamp01((s - 4.9) / 0.9);

  // 维吾尔文：浮现
  const p = clamp01((s - 0.9) / 2.6);
  const e = easeOut(p);
  if (ug) {
    ug.style.opacity = String((p <= 0 ? 0 : Math.min(1, p * 1.5)) * fade);
    ug.style.filter = 'blur(' + (20 * (1 - e)).toFixed(2) + 'px) brightness(' +
      (0.4 + 0.6 * e).toFixed(3) + ')';
  }
  if (rule) {
    const rp = clamp01((s - 2.9) / 1.1);
    rule.style.width = (easeOut(rp) * 30).toFixed(2) + 'vmin';
    rule.style.opacity = String(rp * fade);
  }
  if (cn) cn.style.opacity = String(clamp01((s - 3.0) / 1.3) * fade);
  if (lat) lat.style.opacity = String(clamp01((s - 3.3) / 1.3) * fade);
}

/* 用 setInterval 推进文字 —— 不该跟着帧率走，
   而且 rAF 在后台标签页会被节流。200ms 足够细。 */
let timer = 0;
function startTitleClock(beganAt) {
  if (timer || !title) return;
  timer = setInterval(() => {
    tickTitle(((performance.now() - beganAt) / 1000) % LOOP_LEN);
  }, 200);
}

if (host && isDesktop() && !reduced) {
  const film = buildHeroVideo({
    host,
    base: '../',          // 这一页在子目录里，素材路径要往上一层
    /* 关键：让位阈值设成不可能达到的值 ——
       这一页的视频是主角，不该因为任何滚动而淡出。 */
    fadeStart: 2,
    fadeEnd: 3,
    reduced: false,
  });

  if (film) {
    const beganAt = performance.now();   // 与 film.start() 同一时刻起算
    film.start();
    setTimeout(() => film.start(), 400); // 有些环境要等 readyState 到位
    startTitleClock(beganAt);
  }

  window.__XM_FILM__ = film;
} else if (host) {
  /* 手机 / 减弱动效：去掉视频层，露出 .w-wait 那层暖光底。
     文字也不浮 —— 没有画面托着，字突然出现会很怪。 */
  host.remove();
  if (title) title.remove();
}

/* 视频没起来时给个提示，别让人对着一片黑等 */
setTimeout(() => {
  const f = window.__XM_FILM__;
  const first = host && host.querySelector('video');
  const ok = f && first && first.readyState >= 2;
  if (!ok) document.body.classList.add('film-slow');
}, 4000);
