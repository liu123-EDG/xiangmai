/* 由 tools/build.mjs 生成，请勿直接编辑。改源码后运行 node tools/build.mjs
   本页模块（依依赖序）：
     js/lib/hero-video.js  → isDesktop, buildHeroVideo
     js/pages/welcome.js
*/
(function () {
"use strict";

var __XM = [];
var __ns = null;
__XM[0] = {};
__XM[1] = {};

/* ── js/lib/hero-video.js ── */
function __M0__() {
/* ==========================================================================
   弦脉 · 首屏概念片
   --------------------------------------------------------------------------
   即梦那种做法：进站第一眼就是一整屏画面，没有别的。
   滚动时它淡出，把画面让给三段结构柱（那才是真正的"入口"）。

   三段素材循环：
     0.00 – 5.09   壁画推进
     5.09 – 10.18  颜色抽干
    10.18 – 15.90  黑场 · 一道光线
    15.90 → 0      接回开头

   为什么要"接回"而不是让 <video loop>：
   三段是三个文件，前两段放完就停了。所以用一个共享时钟驱动，
   循环点靠**交叉淡入**遮住 —— 观众看到的是一段连续的画面，
   不是一个三段循环的幻灯片。

   性能：三段全屏视频 + WebGL 会拖垮手机，
   所以只在桌面端启用（判据是屏幕宽度和指针类型，不是 UA）。
   ========================================================================== */

const CLIP = 5.09;              // 每段时长（实测，见 tools/mp4info.mjs）
const T2 = CLIP;                // 5.09
const T3 = CLIP * 2;            // 10.18
const LOOP_LEN = 15.90;         // 整圈长度；末尾留一点给交叉淡入

/** 桌面端？手机/平板不开这个 */
function isDesktop() {
  if (typeof window.matchMedia !== 'function') return true;
  const wide = window.matchMedia('(min-width: 900px)').matches;
  const fine = window.matchMedia('(hover: hover) and (pointer: fine)').matches;
  const cores = navigator.hardwareConcurrency || 4;
  return wide && fine && cores >= 4;
}

/**
 * @param {object} opts
 * @param {HTMLElement} opts.host    .hero-video 容器
 * @param {number} [opts.fadeStart]  滚动到哪个进度开始淡出（0..1）
 * @param {number} [opts.fadeEnd]    到哪个进度完全消失
 * @param {boolean} [opts.reduced]
 */
function buildHeroVideo(opts) {
  const { host } = opts;
  if (!host) return null;

  const base = opts.base === undefined ? '' : opts.base;
  const files = ['01-mural.mp4', '02-drain.mp4', '03-black.mp4'];
  const vids = [...host.querySelectorAll('video')];
  if (vids.length < 3) return null;

  const fadeStart = opts.fadeStart === undefined ? 0.03 : opts.fadeStart;
  const fadeEnd = opts.fadeEnd === undefined ? 0.20 : opts.fadeEnd;

  let started = false;
  let t0 = 0;
  let curClip = -1;
  let visible = true;
  let raf = 0;
  let timer = 0;

  /** 挂上素材。
      三段**一次全挂**，不做按需加载 —— 早先想省带宽，只挂第一段、
      别的等切到了再挂，结果 showClip 在未挂载时静默失败
      （表现为"该换第二段了却什么都没发生"）。
      这三个文件本来就会被浏览器缓存，全挂上启动只多几 MB，稳得多。 */
  function mountAll() {
    vids.forEach((v, i) => {
      if (v.dataset.mounted) return;
      v.dataset.mounted = '1';
      v.src = base + 'assets/video/reveal/' + files[i];
      v.load();
    });
  }

  /** 播一段，失败要**看得见**并且**会重试**。
      早先写成 `p.catch(() => {})` —— 静默吞掉，
      结果就是"层可见、视频就绪，但一直是 paused，黑着第一帧"，
      而且控制台一个字都没有（踩过，查了很久）。 */
  function tryPlay(v, tag) {
    if (!v) return;
    const p = v.play();
    if (p && p.catch) {
      p.catch((e) => {
        if (window.console) {
          console.warn('[弦脉] 概念片播放被拒（' + (tag || '') + '）：' + (e && e.name),
            'readyState=' + v.readyState, 'paused=' + v.paused);
        }
        /* 多半是数据还没到（readyState 不够）或手势时机不对。
           等 canplay 再试一次 —— 已经下了一部分的话很快就会到。 */
        if (!v.dataset.retry) {
          v.dataset.retry = '1';
          v.addEventListener('canplay', () => {
            const q = v.play();
            if (q && q.catch) q.catch(() => {});
          }, { once: true });
          // 兜底：600ms 后不管怎样再试一次
          setTimeout(() => { if (v.paused) { const q = v.play(); if (q && q.catch) q.catch(() => {}); } }, 600);
        }
      });
    }
  }

  function showClip(i) {
    if (i === curClip) return;
    curClip = i;
    vids.forEach((v, k) => v.classList.toggle('on', k === i));
    const v = vids[i];
    // 从当前时钟位置接进去，保证画面和时间轴对齐
    const local = (performance.now() - t0) / 1000 - (i === 0 ? 0 : i === 1 ? T2 : T3);
    try { v.currentTime = Math.max(0, local % CLIP); } catch {}
    tryPlay(v, 'showClip' + i);
  }

  function tick() {
    if (!started) return;
    const t = (performance.now() - t0) / 1000;

    /* 看门狗：该播却没播，就再推一把。
       首段要下 9MB，play() 在缓冲到位前必定失败；
       如果只靠 canplay 那一次补播，遇到网络慢、或者用户恰好在这期间
       往下滚了一下，就会停在第一帧不动 —— 看起来就是"闪一下就没了"。
       每 250ms 检查一次，成本可以忽略。 */
    if (visible) {
      const want = vids[curClip < 0 ? 0 : curClip];
      if (want && want.paused && want.readyState >= 2 && !want.dataset.retryBusy) {
        want.dataset.retryBusy = '1';
        tryPlay(want, 'watchdog');
        setTimeout(() => { delete want.dataset.retryBusy; }, 800);
      }
    }

    if (t >= LOOP_LEN) {
      // 回到开头：重启时钟，把第一段重新亮起来
      t0 = performance.now();
      curClip = -1;
      vids.forEach((v) => { v.classList.remove('on'); try { v.pause(); } catch {} });
      showClip(0);
      return;
    }
    if (t >= T3) showClip(2);
    else if (t >= T2) showClip(1);
    else showClip(0);
  }

  /* 起始：先把第一段亮出来（还没播放，先有一帧画面） */
  mountAll();
  vids[0].classList.add('on');
  curClip = 0;

  /** 用户一有动作就播（浏览器不允许自动播放带声的，静音其实可以，
      但为了不吃掉首帧、也为了省流量，还是等第一次交互）。 */
  const start = () => {
    if (started) return;
    started = true;
    t0 = performance.now();
    mountAll();
    tryPlay(vids[0], 'start');
    /* 用 setInterval 而不是 requestAnimationFrame 链：
       视频时钟不该跟着帧率走（掉帧会走慢），
       而且 rAF 在后台标签页或某些无头环境里会被节流甚至停掉 ——
       那样循环就不转了。250ms 对切镜头足够细。 */
    if (!timer) timer = setInterval(tick, 250);
    /* 兜底：数据到位后如果还没播起来，再补一次。
       移动网络下首段要几秒，这段时间里 play() 会一直失败。 */
    vids[0].addEventListener('canplay', () => {
      if (vids[0].paused && vids[0].classList.contains('on')) tryPlay(vids[0], 'canplay');
    });
  };

  if (opts.reduced) {
    // 减弱动效：只留第一段的静帧，不做循环
    started = false;
  } else {
    ['pointerdown', 'keydown', 'wheel', 'touchstart', 'scroll'].forEach((e) =>
      window.addEventListener(e, start, { passive: true, once: true }));
  }

  /* 页面切后台就停，回来再继续。
     注意：这里**不能**简单地"重启整圈" —— 某些环境（无头浏览器、
     快速切标签）会反复触发 visibilitychange，一重启时钟就永远走不完一圈，
     表现是循环卡在第一段（踩过）。
     正确做法：暂停时记住时钟位置，回来时从那儿接着走。 */
  let pausedAt = 0;
  document.addEventListener('visibilitychange', () => {
    if (!started) return;
    if (document.hidden) {
      pausedAt = performance.now();
      vids.forEach((v) => { try { v.pause(); } catch {} });
    } else if (pausedAt) {
      // 把暂停的这段时间从时钟里扣掉，画面从原处继续
      t0 += performance.now() - pausedAt;
      pausedAt = 0;
      const v = vids[curClip < 0 ? 0 : curClip];
      if (v) tryPlay(v, 'visibility');
    }
  });

  return {
    /** 每帧调一次，传当前滚动进度 0..1 */
    setProgress(p) {
      const a = p <= fadeStart ? 1
        : p >= fadeEnd ? 0
        : 1 - (p - fadeStart) / (fadeEnd - fadeStart);
      host.style.opacity = a.toFixed(3);
      /* 让位之后连可见性一起去掉：只留 opacity:0 的话，
         它仍是一层参与合成的图层，会干扰按像素对账的自检，
         也没必要继续占着合成资源。 */
      host.classList.toggle('gone', a < 0.02);
      // 完全淡出后就不再解码了，省电
      const show = a > 0.02;
      if (show !== visible) {
        visible = show;
        if (!show) vids.forEach((v) => { try { v.pause(); } catch {} });
        else if (started) {
          tryPlay(vids[curClip < 0 ? 0 : curClip], 'setProgress');
        }
      }
      return a;
    },
    start,
    destroy() {
      if (raf) cancelAnimationFrame(raf);
      if (timer) { clearInterval(timer); timer = 0; }
    },
    /* 自检用：时钟状态。没有这个就只能靠猜（踩过）。 */
    state() { return { started, timer: !!timer, visible, curClip,
      t: +((performance.now() - t0) / 1000).toFixed(2),
      mounted: vids.map((v) => !!v.dataset.mounted),
      ready: vids.map((v) => v.readyState),
      on: vids.map((v) => v.classList.contains('on')) }; },
    /* 自检用：把时钟拨到某一秒。
       为什么不靠真等：无头浏览器会把后台页面的定时器节流到近乎停摆
       （实测 17 秒只走 1 秒），等真实时间等于等不到。
       直接拨时钟，测的是循环逻辑本身。 */
    seek(sec) { t0 = performance.now() - sec * 1000; tick(); return this.state(); },
    get videos() { return vids; },
    get clip() { return curClip; },
  };
}

__ns = __XM[0];
__ns.mount_isDesktop = function () { return isDesktop; };
__ns.mount_buildHeroVideo = function () { return buildHeroVideo; };
}

/* ── js/pages/welcome.js ── */
function __M1__() {
var buildHeroVideo = __XM[0]["buildHeroVideo"];
var isDesktop = __XM[0]["isDesktop"];

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
}

/* js/lib/hero-video.js */
try {
  __ns = __XM[0];
  __M0__();
  for (var k in __XM[0]) { if (k.indexOf("mount_") === 0) __XM[0][k.slice(6)] = __XM[0][k](); }
} catch (e) {
  (window.__XM_BOOT_ERR__ = window.__XM_BOOT_ERR__ || []).push("js/lib/hero-video.js" + " :: " + (e && e.stack || e));
}

/* js/pages/welcome.js */
try {
  __ns = __XM[1];
  __M1__();
  for (var k in __XM[1]) { if (k.indexOf("mount_") === 0) __XM[1][k.slice(6)] = __XM[1][k](); }
} catch (e) {
  (window.__XM_BOOT_ERR__ = window.__XM_BOOT_ERR__ || []).push("js/pages/welcome.js" + " :: " + (e && e.stack || e));
}
})();
