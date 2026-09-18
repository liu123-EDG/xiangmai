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
import { buildHeroVideo, shouldSkipVideo } from '../lib/hero-video.js';
import { createTheme } from '../lib/theme.js';

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
const ug = document.getElementById('w-ug');
const bloom = document.getElementById('w-bloom');
const rule = title && title.querySelector('.w-title__rule');
const cn = title && title.querySelector('.w-title__cn');
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
    if (cn) cn.style.opacity = clamp01((t - T.cn) / 1.4).toFixed(3);
    if (lat) lat.style.opacity = clamp01((t - T.lat) / 1.4).toFixed(3);
  }
  /* 片尾黑场那两秒：入口亮起来，提示该进去了。
     另外第 7 秒起让它浮现 —— 开头几秒画面最有冲击力，那时不摆控件。 */
  if (go) {
    go.classList.toggle('is-here', t >= T.goIn);
    go.classList.toggle('is-lit', t >= T.litGo);
  }
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
  if (cn) cn.style.opacity = '0';
  if (lat) lat.style.opacity = '0';
  if (go) { go.classList.remove('is-lit'); go.classList.remove('is-here'); }
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
