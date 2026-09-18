/* 由 tools/build.mjs 生成，请勿直接编辑。改源码后运行 node tools/build.mjs
   本页模块（依依赖序）：
     js/lib/hero-video.js  → isDesktop, shouldSkipVideo, buildHeroVideo
     js/lib/theme.js  → createTheme, autoPlayOnGesture, unlock
     js/pages/welcome.js
*/
(function () {
"use strict";

var __XM = [];
var __ns = null;
__XM[0] = {};
__XM[1] = {};
__XM[2] = {};

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
const LOOP_LEN = 17.60;         // 整圈长度（三段放完 + 片尾定格与淡出）

/** 桌面端？—— 用来选素材尺寸（960p 还是 640p），不再用来决定"放不放"。 */
function isDesktop() {
  if (typeof window.matchMedia !== 'function') return true;
  const wide = window.matchMedia('(min-width: 900px)').matches;
  const fine = window.matchMedia('(hover: hover) and (pointer: fine)').matches;
  const cores = navigator.hardwareConcurrency || 4;
  return wide && fine && cores >= 4;
}

/** 该不该**放弃**放视频（低端设备 / 省流模式）。
    注意这跟 isDesktop 是两件事：
      · 早先我拿 isDesktop 当"放不放"的开关，结果手机上一片黑 ——
        用户直接问"手机端看不到第一页的视频"。
        素材压小之后手机完全放得动（640×360 三段共 1.2MB），
        所以现在**手机也放**，只有确实带不动或用户开了省流才降级。 */
function shouldSkipVideo() {
  if (typeof window.matchMedia === 'function') {
    // 省流模式：用户明确表示不想吃流量，尊重它
    if (window.matchMedia('(prefers-reduced-data: reduce)').matches) return true;
  }
  const cores = navigator.hardwareConcurrency || 4;
  const mem = navigator.deviceMemory || 4;      // 只有 Chromium 有，缺省当 4G
  return cores < 4 || mem < 2;
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
  /* 两套素材：
       桌面  960×540 / 2.2Mbps   三段共 2.3MB
       手机  640×360 / 1.1Mbps   三段共 1.2MB
     手机屏幕就那么宽，540p 是浪费；小版省一半流量、解码也轻。
     都是 webm/vp9 —— 它是 MediaRecorder 出的，容器一定合法
     （我手写 mp4 那次浏览器直接不认，错误码 4）。 */
  const slim = window.matchMedia('(min-width: 900px)').matches;
  const suffix = slim ? '-slim.webm' : '-slim-m.webm';
  const files = ['01-mural' + suffix, '02-drain' + suffix, '03-black' + suffix];
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
      现在一套总共 1.2–2.3MB，全挂上启动只多一两 MB，稳得多。 */
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
    if (t >= T3) {
      showClip(2);
      /* 第三段本身只有 5.09 秒，但整圈是 17.6 秒 ——
         后面那几秒留给文字浮现和停留。
         所以第三段播完就**停在最后一帧**，让黑场继续，
         别让视频回到第一帧（那样文字就没画面托着了）。

         判据用 ended，不用 duration —— MediaRecorder 出来的 webm
         **不写时长元数据**，v.duration 是 NaN，用它这条判断永远不成立。
         ended 是浏览器播到头时给的，跟容器有没有元数据无关。 */
      const v = vids[2];
      if (!v.paused && (v.ended || (v.duration && v.currentTime >= v.duration - 0.06))) {
        try { v.pause(); } catch {}
      }
    }
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
    /* 当前时钟位置（整圈秒数）。
       别的图层（文字、浮尘）**必须**用它来对齐 ——
       各自拿 performance.now() 起算会漂移，
       表现是"文字在该出现的时候已经没了"（踩过，很难查）。 */
    now() { return started ? (performance.now() - t0) / 1000 : 0; },
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
__ns.mount_shouldSkipVideo = function () { return shouldSkipVideo; };
__ns.mount_buildHeroVideo = function () { return buildHeroVideo; };
}

/* ── js/lib/theme.js ── */
function __M1__() {
/* ==========================================================================
   弦脉 · 主题曲播放
   --------------------------------------------------------------------------
   用 Web Audio 播 mp3（不用 <audio> 标签），理由：
     · 能和已有的手鼓总线上共用一条链路，音量、淡入淡出一致
     · 能对着 context.currentTime 做精确的交叉淡入
     · 能无缝循环（AudioBufferSourceNode.loop）

   两个关键点（都踩过）：
     1) decodeAudioData 是异步的。第一次调用只启动加载，加载完自动接上播 ——
        不然"点完最后一下要立刻听到声音"会变成半秒空白。
     2) 一定要**自己 new 一个 AudioContext**，不能借用手鼓那个。
        两个独立的 context 在浏览器里会互相干扰（一个在跑，另一个不响）。
   ========================================================================== */

/** 一个简易主题曲播放器
 *  @param {string} url
 *  @param {object} [opts]
 *  @param {AudioContext} [opts.ctx] 复用已有的 AudioContext。
 *         不传就自己建一个 —— 但**同一个页面上最好只有一个**：
 *         两个独立的 context 会互相干扰（一个在跑、另一个不响），
 *         这是排查了很久才定位到的静音原因。 */
function createTheme(url, opts = {}) {
  let ctx = opts.ctx || null;
  let buffer = null;
  let curUrl = url;
  const cache = new Map();     // url → AudioBuffer，换曲不用重新解码
  let loading = null;
  let src = null;              // 当前正在播的 source
  let gain = null;             // 当前 source 的增益
  let want = false;
  let waiting = false;        // 想播但 AudioContext 还没被唤醒
  let ctxWatched = false;     // 是否已经挂上 statechange 监听
  let volume = 0.55;          // 主题曲比手鼓略高，它要站得住

  /** 换用别的 AudioContext —— 页面上应该只有一个。 */
  const useContext = (c) => {
    if (!c || c === ctx) return;
    ctx = c;
    gain = null;              // 旧增益挂在上一个 context 上，作废
  };

  const ensureCtx = () => {
    if (ctx) return ctx;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
    return ctx;
  };

  /** 延迟建增益节点：必须挂在这个 context 上，且 context 变了要重建 */
  const ensureGain = () => {
    if (gain && gain.context === ctx) return gain;
    gain = ctx.createGain();
    gain.gain.value = 0;
    gain.connect(ctx.destination);
    return gain;
  };

  /** 取一段音频（带缓存）。任一 URL 只解码一次。 */
  const loadUrl = (u) => {
    if (cache.has(u)) return Promise.resolve(cache.get(u));
    const c = ensureCtx();
    if (!c) return Promise.resolve(null);
    return fetch(u)
      .then((r) => {
        if (!r.ok) throw new Error('http ' + r.status);
        return r.arrayBuffer();
      })
      .then((buf) => new Promise((res, rej) => {
        // Safari 只认回调形式，所以两种都接
        const p = c.decodeAudioData(buf, res, rej);
        if (p && p.then) p.then(res, rej);
      }))
      .then((buf) => { cache.set(u, buf); return buf; })
      .catch((e) => {
        if (window.console) console.warn('[弦脉] 音频加载失败 ' + u + '：', e && e.message);
        return null;
      });
  };

  const load = () => {
    if (buffer) return Promise.resolve(buffer);
    if (loading) return loading;
    loading = loadUrl(curUrl).then((buf) => { buffer = buf; return buf; });
    return loading;
  };

  /** 唤醒 AudioContext。必须在**真实用户手势**的调用栈里调用，浏览器才认。
      没有这个的话，在"没有手鼓"的页面上没人唤醒 context，
      主题曲会一直卡在 suspended —— 表现是"手势做了也不出声"。 */
  const resume = () => {
    const c = ensureCtx();
    if (!c) return Promise.resolve(false);
    if (c.state === 'running') return Promise.resolve(true);
    const p = c.resume();
    if (p && p.then) return p.then(() => c.state === 'running').catch(() => false);
    return Promise.resolve(c.state === 'running');
  };

  /** 起一个循环播放的 source，带淡入。每次换曲都新建一个 gain ——
      各曲各的增益，交叉淡入时互不干扰。 */
  const playBuffer = (buf, fade, from) => {
    const c = ensureCtx();
    if (!c) return null;
    const g = c.createGain();
    g.gain.value = 0.0001;
    g.connect(c.destination);
    const s = c.createBufferSource();
    s.buffer = buf;
    s.loop = true;
    s.connect(g);
    const t = c.currentTime;
    g.gain.cancelScheduledValues(t);
    g.gain.setValueAtTime(from === undefined ? 0.0001 : Math.max(0.0001, from), t);
    g.gain.linearRampToValueAtTime(volume, t + fade);
    s.start(t);
    return { s, g };
  };

  /** 开始播放（带淡入）。第一次调用会先解码，好了自动响。
   *
   *  AudioContext 可能是 suspended（页面还没有用户手势）。
   *  这里**自己负责唤醒**：先 resume，等 state 变成 running 再起播。
   *  早期版本直接 return 等调用方来唤醒 —— 结果在没有手鼓的页面
   *  （附录）没人唤醒它，一直干等，表现就是"点了没声"。 */
  const start = (fadeSec) => {
    want = true;
    const c = ensureCtx();
    if (!c) return false;

    const fade = fadeSec === undefined ? 2.2 : fadeSec;
    const begin = () => {
      if (!want || !buffer) return;
      const cc = ensureCtx();
      if (cc.state === 'suspended') {
        waiting = true;
        // 先试着唤醒；唤醒成功后 statechange 会再叫我们一次
        const p = cc.resume();
        if (p && p.then) p.then(() => { if (cc.state !== 'suspended') begin(); }).catch(() => {});
        return;
      }
      waiting = false;
      if (src) {                                   // 已经在放，只把音量拉回去
        gain.gain.cancelScheduledValues(cc.currentTime);
        gain.gain.setTargetAtTime(volume, cc.currentTime, fade / 3);
        return;
      }
      const next = playBuffer(buffer, fade, 0.0001);
      if (next) { src = next.s; gain = next.g; }
    };

    // 上下文醒了就自动接上（浏览器在用户第一次手势后会把 state 推到 running）
    if (!ctxWatched) {
      ctxWatched = true;
      c.addEventListener('statechange', () => {
        if (want && !src && c.state === 'running') begin();
      });
    }

    if (buffer) { begin(); return true; }
    load().then(begin);
    return true;
  };

  /** 被 resume 之后调用：把之前因为 suspended 而没起得来的那次播出去 */
  const wake = (fadeSec) => {
    if (!want || !buffer) return false;
    const c = ensureCtx();
    if (!c || c.state === 'suspended') return false;
    if (src) return true;
    const next = playBuffer(buffer, fadeSec === undefined ? 2.2 : fadeSec, 0.0001);
    if (next) { src = next.s; gain = next.g; }
    waiting = false;
    return true;
  };

  const stop = (fadeSec) => {
    want = false;
    if (!ctx || !src || !gain) return;
    const fade = fadeSec === undefined ? 1.2 : fadeSec;
    const t = ctx.currentTime;
    gain.gain.cancelScheduledValues(t);
    gain.gain.setTargetAtTime(0, t, fade / 3);
    const s = src;
    src = null;
    try { s.stop(t + fade * 1.6); } catch { /* 已经停了 */ }
  };

  const setVolume = (v) => {
    volume = Math.max(0, Math.min(1, v));
    if (ctx && src && gain) gain.gain.setTargetAtTime(volume, ctx.currentTime, 0.3);
  };

  /** 起一个循环播放的 source，带淡入。每次换曲都新建一个 gain ——
      各曲各的增益，交叉淡入时互不干扰。 */
  

  /** 换一段音频并交叉淡入。正在播时换曲不会留空白。
      滚动驱动的场景切换会频繁调用，所以：目标没变就直接返回。 */
  const crossfadeTo = (newUrl, fadeSec) => {
    if (!newUrl || newUrl === curUrl) return Promise.resolve(false);
    const fade = fadeSec === undefined ? 1.6 : fadeSec;
    return loadUrl(newUrl).then((buf) => {
      if (!buf) return false;
      curUrl = newUrl;
      buffer = buf;
      const old = src, oldGain = gain;
      const c = ensureCtx();
      if (c && c.state === 'suspended') { const p = c.resume(); if (p && p.then) p.catch(() => {}); }
      const next = playBuffer(buf, fade, 0.0001);
      if (next) { src = next.s; gain = next.g; }
      if (old) {
        try {
          const t = c.currentTime;
          oldGain.gain.cancelScheduledValues(t);
          oldGain.gain.setValueAtTime(Math.max(0.0001, oldGain.gain.value), t);
          oldGain.gain.linearRampToValueAtTime(0.0001, t + fade);
          old.stop(t + fade + 0.1);
        } catch { try { old.stop(); } catch { /* 已停 */ } }
      }
      return true;
    });
  };

  /* 自检用：报告真实状态，而不是"我觉得应该响了" */
  const state = () => ({
    ready: !!buffer,
    playing: !!src,
    waiting,
    url: curUrl,
    cached: cache.size,
    ctxState: ctx ? ctx.state : 'none',
    gain: ctx && gain ? +gain.gain.value.toFixed(4) : -1,
    volume,
    duration: buffer ? +buffer.duration.toFixed(2) : 0,
  });

  return {
    start, stop, setVolume, state, useContext, wake, crossfadeTo, loadUrl, resume,
    preload: load,
    get playing() { return !!src; },
    get waiting() { return waiting; },
    get ready() { return !!buffer; },
    get url() { return curUrl; },
    get duration() { return buffer ? buffer.duration : 0; },
  };
}

/* ==========================================================================
   自动播放：挂在第一次用户交互上
   --------------------------------------------------------------------------
   浏览器不允许"无交互自动播放"。所以做法是：**监听第一次手势**
   （滚动、点按、按键），一有动作就把声音打开 —— 用户不需要去找按钮。

   这一章的鼓点、萨帕依、主题曲都是内容的一部分，不该让人先找开关。
   **默认开**：按钮一开始就显示"开"，第一次交互自动起。
   声音按钮仍然保留：关掉之后就不再自动开。
   ========================================================================== */
function autoPlayOnGesture(opts) {
  const { theme, seq, band } = opts;
  let armed = true;
  const btn = document.getElementById('sound-toggle');
  const text = document.getElementById('sound-text');

  const markOn = () => {
    if (btn) btn.setAttribute('aria-pressed', 'true');
    if (text) text.textContent = '声音 开';
  };
  const markOff = () => {
    if (btn) btn.setAttribute('aria-pressed', 'false');
    if (text) text.textContent = '声音 关';
  };

  /* 默认开：先把标签落成"开"，和下面第一次手势自动起保持一致。
     只写标签不放声音是骗人，所以这个"开"必须配自动起。 */
  markOn();

  const on = () => {
    if (!armed) return;
    armed = false;
    detach();
    if (seq && !seq.enabled) seq.enable();
    if (seq) {
      if (band !== undefined) seq.setBand(band);
      // 主题曲复用手鼓的 context —— 一个页面只留一个 AudioContext
      if (theme && seq.ctx) theme.useContext(seq.ctx);
    }
    /* 关键：**在这里唤醒 context**。
       有手鼓的页面由 seq.enable() 顺手唤醒；没有手鼓的页面
       （比如第三章，它只有配乐）就必须自己唤醒，否则一直 suspended。
       resume() 要在手势的调用栈里同步发起，浏览器才放行。 */
    if (theme) {
      const p = theme.resume();
      if (p && p.then) p.then(() => { if (theme) theme.wake(opts.fade === undefined ? 2.6 : opts.fade); });
    }
    /* startTheme:false 的页面（第四章）主题曲由别处触发，
       但这一次手势仍要让 context 就绪，否则到时候点了也没声。 */
    if (theme && opts.startTheme !== false && !theme.playing) {
      theme.start(opts.fade === undefined ? 2.6 : opts.fade);
    }
    markOn();
  };

  const evs = ['pointerdown', 'touchstart', 'keydown', 'wheel', 'scroll'];
  const detach = () => evs.forEach((e) => window.removeEventListener(e, on));
  evs.forEach((e) => window.addEventListener(e, on, { passive: true }));

  /* 自动开之后，声音按钮**必须由这一页的音乐接管**。
     之前只写了"关掉就不再自动开"，按钮仍挂在别处（比如手鼓）——
     结果按"声音 开"打开的是鼓点，不是这一页的音乐（踩过）。
     所以这里用捕获阶段接管：开/关都作用在 theme 上。 */
  if (btn && opts.ownButton !== false) {
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopImmediatePropagation();
      const isOn = btn.getAttribute('aria-pressed') === 'true';
      armed = false;
      detach();
      if (isOn) {
        if (theme) theme.stop(1.0);
        if (seq) seq.disable();
        markOff();
        return;
      }
      if (seq && !seq.enabled) seq.enable();
      if (seq && band !== undefined) seq.setBand(band);
      if (theme && seq && seq.ctx) theme.useContext(seq.ctx);
      if (theme) {
        const p = theme.resume();
        if (p && p.then) p.then(() => { if (theme) theme.start(1.4); });
      }
      markOn();
    }, true);
  }

  return { trigger: on, get armed() { return armed; } };
}

/* ==========================================================================
   解锁标记
   --------------------------------------------------------------------------
   互动完成后才允许进其他民族的页面。标记写在 localStorage，
   所以刷新、换页都还在。

   说明：这是**引导**，不是安全机制 —— 真想绕过的人清一下浏览器数据就行。
   目的是让人按设计的顺序走一遍，不是防谁。
   ========================================================================== */
const KEY = 'xiangmai.unlocked.mashrap';

const unlock = {
  get done() {
    try { return localStorage.getItem(KEY) === '1'; } catch { return false; }
  },
  set() {
    try { localStorage.setItem(KEY, '1'); } catch { /* 隐私模式写不了，忽略 */ }
    window.dispatchEvent(new CustomEvent('xiangmai:unlocked'));
  },
  clear() {
    try { localStorage.removeItem(KEY); } catch { /* 忽略 */ }
  },
};

__ns = __XM[1];
__ns.mount_createTheme = function () { return createTheme; };
__ns.mount_autoPlayOnGesture = function () { return autoPlayOnGesture; };
__ns.mount_unlock = function () { return unlock; };
}

/* ── js/pages/welcome.js ── */
function __M2__() {
var buildHeroVideo = __XM[0]["buildHeroVideo"];
var shouldSkipVideo = __XM[0]["shouldSkipVideo"];
var createTheme = __XM[1]["createTheme"];

/* ==========================================================================
   入口页
   --------------------------------------------------------------------------
   一整屏，只放那条概念片。

   这条片子就是 tools/film.html 那一版，时间轴原样搬过来，一秒没改。
   —— 早先我另做了一版"循环用"的，把文字那段删掉了，那是错的：
      用户要的就是带「十二木卡姆」的那一版。这里按原版还原。

   视频本身复用 js/lib/hero-video.js（序章那套同一份代码），
   文字、浮尘、片尾亮起入口，由本文件按时钟驱动。

   手机上不放视频：三段全屏视频对手机太重，退化成"暖光底 + 入口"。
   ========================================================================== */



/* ---- 时间轴（与 tools/film.html 一致，改这里要两边一起改） ---- */
const CLIP = 5.09;
const T2 = CLIP;                 // 5.09   第二段
const T3 = CLIP * 2;             // 10.18  第三段
const LOOP_LEN = 17.60;          // 整圈长度（片尾淡出到黑之后回开头）

const T = {
  bloom:   9.00,                 // 暖光起（第二段末尾已经在变黑）
  ugIn:    9.80,                 // 维吾尔文开始浮现
  ugFull: 12.20,                 // 完全清晰
  rule:   12.50,                 // 分隔线展开
  cn:     12.60,                 // 中文
  lat:    12.90,                 // 英文
  goIn:    7.00,                 // 右上角入口浮现（开头几秒不摆控件）
  litGo:  16.40,                 // 片尾黑场：入口亮起来
  end:    17.60,                 // 全黑
};

const host = document.getElementById('hero-video');
const title = document.getElementById('w-title');
const ug = document.getElementById('w-ug');       // 主标题：维语
const cn = document.getElementById('w-cn');       // 下面一行：汉字
const bloom = document.getElementById('w-bloom');
const rule = title && title.querySelector('.w-title__rule');
const lat = title && title.querySelector('.w-title__lat');
const go = document.getElementById('w-go');
const dustCv = document.getElementById('w-dust');
const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

const clamp01 = (x) => Math.min(1, Math.max(0, x));
const easeOut = (x) => 1 - Math.pow(1 - x, 3);

/* ---------------------------------------------------------------- 浮尘 */
/* 给黑场一点空气。不做"发光粒子"，只做极暗的、缓慢下沉的尘点 ——
   高级感的来源是克制。 */
let dustOn = false;
function initDust() {
  if (!dustCv) return null;
  const g = dustCv.getContext('2d');
  let W = 0, H = 0, dpr = 1, t = 0;
  const motes = [];
  for (let i = 0; i < 80; i++) {
    motes.push({
      x: Math.random(), y: Math.random(),
      r: Math.random() * 1.4 + 0.4,
      vy: Math.random() * 0.0002 + 0.00005,
      vx: (Math.random() - 0.5) * 0.00007,
      a: Math.random() * 0.45 + 0.12,
      ph: Math.random() * Math.PI * 2,
    });
  }
  function resize() {
    const r = dustCv.getBoundingClientRect();
    dpr = Math.min(2, window.devicePixelRatio || 1);
    W = dustCv.width = Math.max(1, Math.round(r.width * dpr));
    H = dustCv.height = Math.max(1, Math.round(r.height * dpr));
  }
  resize();
  window.addEventListener('resize', resize);
  return function draw(alpha) {
    dustCv.style.opacity = String(alpha);
    if (alpha <= 0.01) return;
    t += 1 / 60;
    g.clearRect(0, 0, W, H);
    for (const m of motes) {
      m.y += m.vy; m.x += m.vx;
      if (m.y > 1.02) { m.y = -0.02; m.x = Math.random(); }
      if (m.x < -0.02) m.x = 1.02;
      if (m.x > 1.02) m.x = -0.02;
      const a = m.a * (0.55 + 0.45 * Math.sin(t * 0.5 + m.ph));
      const px = m.x * W, py = m.y * H, rr = m.r * dpr;
      const grd = g.createRadialGradient(px, py, 0, px, py, rr * 4);
      grd.addColorStop(0, 'rgba(242,228,196,' + (a * 0.8).toFixed(3) + ')');
      grd.addColorStop(1, 'rgba(242,228,196,0)');
      g.fillStyle = grd;
      g.beginPath(); g.arc(px, py, rr * 4, 0, Math.PI * 2); g.fill();
    }
  };
}

/* ------------------------------------------------------- 按时钟推进画面 */
function paint(t) {
  /* 文字 */
  if (title) {
    const p = clamp01((t - T.ugIn) / (T.ugFull - T.ugIn));
    const e = easeOut(p);
    if (ug) {
      ug.style.opacity = t < T.ugIn ? '0' : String(e.toFixed(3));
      ug.style.filter = 'blur(' + (20 * (1 - e)).toFixed(2) + 'px) brightness(' +
        (0.4 + 0.6 * e).toFixed(3) + ')';
      /* 一旦浮现完，就把呼吸动画挂上 ——
         静止的光晕看着像贴图，持续起伏才"活"。 */
      ug.classList.toggle('is-live', p > 0.55);
    }
    /* 背后的暖光：比字稍早一点起来，字才有"从光里出来"的感觉 */
    if (bloom) bloom.style.opacity = clamp01((t - T.ugIn + 0.8) / 2.2).toFixed(3);
    if (rule) {
      const rp = clamp01((t - T.rule) / 1.1);
      rule.style.width = (easeOut(rp) * 30).toFixed(2) + 'vmin';
      rule.style.opacity = rp.toFixed(3);
    }
    /* 汉字那一行：跟英文差不多同时出现，比主标题晚一点，
       让"维语先出来、汉字跟上"读起来有层次。 */
    if (cn) cn.style.opacity = clamp01((t - T.cn) / 1.4).toFixed(3);
    if (lat) lat.style.opacity = clamp01((t - T.lat) / 1.4).toFixed(3);
  }
  /* 入口现在**常驻**。
     原来第 7 秒才浮现、循环回开头又消失 ——
     用户说"再次循环播放就又没了，得等再放一遍才有，这样太奇怪了"。
     所以只保留"片尾亮一档"这个提示，不再控制出现与消失。 */
  if (go) go.classList.toggle('is-lit', t >= T.litGo);
  /* 浮尘：黑场起来之后才看得见 */
  if (dustOn) dustOn(clamp01((t - T.bloom) / 4) * 0.8);
}

function reset() {
  if (ug) {
    ug.style.opacity = '0';
    ug.style.filter = 'blur(20px) brightness(0.4)';
    ug.classList.remove('is-live');
  }
  if (bloom) bloom.style.opacity = '0';
  if (rule) { rule.style.width = '0'; rule.style.opacity = '0'; }
  if (lat) lat.style.opacity = '0';
  if (cn) cn.style.opacity = '0';
  /* 入口不再需要重置 —— 它常驻，只在片尾亮一档 */
  if (go) go.classList.remove('is-lit');
  if (dustOn) dustOn(0);
}

/* 用 setInterval 而不是 rAF：时钟不该跟着帧率走，
   而且 rAF 在后台标签页会被节流甚至停掉。80ms 足够细。

   **关键：时钟取自 hero-video 本身**（film.now()），不另起一个。
   早先我自己拿 performance.now() 起算，两边会漂移 ——
   表现是"文字在该出现的时候已经没了"（踩过）。
   画面和文字必须共用一个时钟。 */
let timer = 0;
function startClock(film) {
  if (timer) return;
  let last = -1;
  timer = setInterval(() => {
    const t = film.now() % LOOP_LEN;
    if (t < last) reset();     // 绕回开头了：清干净再画
    last = t;
    paint(t);
  }, 80);
}

/* ---------------------------------------------------------------- 启动 */
if (host && !shouldSkipVideo() && !reduced) {
  dustOn = initDust();
  reset();

  const film = buildHeroVideo({
    host,
    base: '../',          // 这一页在子目录里，素材路径要往上一层
    /* 让位阈值设成不可能达到的值 —— 这一页的视频是主角，不该淡出。
       而且这页锁了滚动，本来也没有进度可算。 */
    fadeStart: 2,
    fadeEnd: 3,
    reduced: false,
  });

  if (film) {
    film.start();
    setTimeout(() => film.start(), 400); // 有些环境要等 readyState 到位
    startClock(film);                    // 文字跟着**视频的**时钟走
  }

  window.__XM_FILM__ = film;
  window.__XM_PAINT__ = paint;           // 自检用：可以拨到任意时刻看状态

  /* ---- 声音：默认开，但要轻 ----
     这一页是"进去之前"的那一屏，音乐不该抢画面，
     所以音量压到 0.22（正片里是 0.55），淡入也慢（3.5 秒）。

     浏览器不允许没手势就出声，所以"默认开"只能这么做：
     第一次交互时唤醒 context 并起播。
     这一页没有声音按钮 —— 访客还没进去，不该先给他一个开关。
     如果他不想要声音，进正片后可以关。 */
  if (!reduced) {
    const amb = createTheme('../assets/audio/mashrap/theme.mp3');
    amb.setVolume(0.22);
    window.__XM_AMB__ = amb;             // 自检用

    const beginAudio = () => {
      ['pointerdown', 'keydown', 'wheel', 'scroll', 'touchstart'].forEach((e) =>
        window.removeEventListener(e, beginAudio));
      /* resume() 必须在手势的调用栈里同步发起，浏览器才认；
         起来之后再起播，否则 context 还是 suspended，等于没声。 */
      const p = amb.resume();
      if (p && p.then) p.then(() => amb.start(3.5));
      else amb.start(3.5);
    };
    ['pointerdown', 'keydown', 'wheel', 'scroll', 'touchstart'].forEach((e) =>
      window.addEventListener(e, beginAudio, { passive: true, once: true }));
  }
} else {
  /* 低端设备 / 省流 / 用户要求减弱动效：
     去掉视频和文字，只留暖光底和入口。这一页仍然成立。 */
  if (host) host.remove();
  if (title) title.remove();
  if (dustCv) dustCv.remove();
}
}

/* js/lib/hero-video.js */
try {
  __ns = __XM[0];
  __M0__();
  for (var k in __XM[0]) { if (k.indexOf("mount_") === 0) __XM[0][k.slice(6)] = __XM[0][k](); }
} catch (e) {
  (window.__XM_BOOT_ERR__ = window.__XM_BOOT_ERR__ || []).push("js/lib/hero-video.js" + " :: " + (e && e.stack || e));
}

/* js/lib/theme.js */
try {
  __ns = __XM[1];
  __M1__();
  for (var k in __XM[1]) { if (k.indexOf("mount_") === 0) __XM[1][k.slice(6)] = __XM[1][k](); }
} catch (e) {
  (window.__XM_BOOT_ERR__ = window.__XM_BOOT_ERR__ || []).push("js/lib/theme.js" + " :: " + (e && e.stack || e));
}

/* js/pages/welcome.js */
try {
  __ns = __XM[2];
  __M2__();
  for (var k in __XM[2]) { if (k.indexOf("mount_") === 0) __XM[2][k.slice(6)] = __XM[2][k](); }
} catch (e) {
  (window.__XM_BOOT_ERR__ = window.__XM_BOOT_ERR__ || []).push("js/pages/welcome.js" + " :: " + (e && e.stack || e));
}
})();
