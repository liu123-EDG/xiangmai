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
export function isDesktop() {
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
export function shouldSkipVideo() {
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
export function buildHeroVideo(opts) {
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
