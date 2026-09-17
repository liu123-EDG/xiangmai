/* ==========================================================================
   入口页
   --------------------------------------------------------------------------
   整屏循环播放概念片，永不让位。

   复用 js/lib/hero-video.js —— 那是给序章写的同一套东西，
   只要把 fadeStart 设成 2（进度永远到不了）并且不调用 setProgress，
   视频就一直循环、永不淡出。不用再写一份循环逻辑。

   手机上不启用：三段全屏视频对手机太重，那时这页退化成
   "暖光底 + 品牌 + 进入"，一样能用。
   ========================================================================== */
import { buildHeroVideo, isDesktop } from '../lib/hero-video.js';

const host = document.getElementById('hero-video');
const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

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

  /* 立刻起播（这一页没有滚动，不该等用户手势）。
     静音视频的自动播放浏览器是允许的；
     万一被拒，hero-video 里已经装了看门狗，会在 play() 失败后反复重试。 */
  if (film) {
    film.start();
    // 再补一次：有些环境要等 readyState 到位才放得出来
    setTimeout(() => film.start(), 400);
  }

  window.__XM_FILM__ = film;
} else if (host) {
  /* 手机 / 减弱动效：去掉视频层，露出 .wait 那层暖光底。
     这样这一页仍然成立，只是不放片子。 */
  host.remove();
}

/* 视频没起来时给个提示，别让人对着一片黑等 */
setTimeout(() => {
  const f = window.__XM_FILM__;
  const first = host && host.querySelector('video');
  const ok = f && first && first.readyState >= 2;
  if (!ok) document.body.classList.add('film-slow');
}, 4000);
