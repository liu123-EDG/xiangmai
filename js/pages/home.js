/* ==========================================================================
   弦脉 · 序（首屏）
   --------------------------------------------------------------------------
   首屏是入口，不是封面。它按顺序完成三件事：

     1) 建立"有内部结构的复杂系统"的认知 —— 一条竖向结构柱，三段硬切堆叠
     2) 让结构自己呼吸 —— 三段以不同频率明暗交替
     3) 在最底部交出入口 —— 一句话，点它进入师承网络

   几何交给布局引擎，材质交给 GPU，空气交给渲染器。这一层只做编排。
   ========================================================================== */

import { Renderer, SEG_BOUNDS, BREATH } from '../lib/renderer.js';
import { DapSequencer } from '../lib/sequencer.js';
import { BandScroller } from '../lib/scroll.js';
import { mountShell, mountSoundButton } from '../lib/site.js';
import { buildHeroVideo, shouldSkipVideo } from '../lib/hero-video.js';
import { initNetwork } from './network.js';

const REDUCED = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const $ = (s) => document.querySelector(s);
const $$ = (s) => Array.from(document.querySelectorAll(s));

/* 三段时间坐标：随结构推进逐条替换，像档案页码在翻 */
const FIGURES = [
  { num: '16世纪', cap: '叶尔羌宫廷 · 套曲系统整理' },
  { num: '1951—1956', cap: '英吉沙 · 全套十二木卡姆录音与记谱' },
  { num: '2005', cap: '列入联合国教科文组织人类口头和非物质遗产代表作' },
];

/* 各段材质的烘焙尺寸：必须与该段在页面上的真实宽高比一致，否则贴图会被拉伸。
   设计比例见 styles.css 的 .pillar-wrap 与 .seg 的 --h。 */
const BAKE_SIZES = [[1024, 428], [1024, 317], [1024, 352]];

const heroEl = $('#hero');
const canvas = $('#gl');
const railMarks = $$('.rail__mark');
const words = $$('.word');
const segs = $$('.seg');
const figureNum = $('#figure-num');
const figureCap = $('#figure-cap');
const networkEl = $('#network');
const stageEl = $('.stage-words');

/* 顶栏改为由 site.js 统一渲染 —— 首页原本是静态写死的，
   结果"附录"那一格的锁定状态不会跟着解锁走。
   交给 mountShell 之后，全站六格的状态由同一份数据决定。 */
mountShell({ base: '', active: 'prologue' });

let renderer = null;
let scroller = null;
let heroVideo = null;
let audio = null;
let dataIndex = -1;
let cssW = 0, cssH = 0, dpr = 0;
let openStart = 0;
let frame = 0;
let visible = true;
let lastT = performance.now();

/* ------------------------------------------------------------- 尺寸同步 */

function syncSize() {
  const r = canvas.getBoundingClientRect();
  const w = Math.max(1, Math.round(r.width));
  const h = Math.max(1, Math.round(r.height));
  const d = window.devicePixelRatio || 1;
  if (w === cssW && h === cssH && d === dpr) return;
  cssW = w; cssH = h; dpr = d;
  if (renderer) renderer.resize(w, h, d);
}

/* ------------------------------------------------------------- 状态渲染 */

function renderBandState(band) {
  document.body.dataset.stage = String(band);
  const litCount = Math.min(band, 3);

  segs.forEach((el, i) => {
    el.classList.toggle('is-lit', i < litCount);
    el.classList.toggle('is-active', i < litCount && i === litCount - 1);
  });
  railMarks.forEach((m, i) => {
    m.classList.toggle('is-lit', i < litCount);
    m.classList.toggle('is-active', i === litCount - 1);
  });
  words.forEach((w, i) => {
    const lit = i < litCount;
    w.classList.toggle('is-shown', lit && i === litCount - 1);
    w.classList.toggle('is-past', lit && i !== litCount - 1);
  });

  setFigure(Math.max(0, Math.min(2, band - 1)));
  if (audio) audio.setBand(Math.max(0, Math.min(2, band - 1)));
}

function setFigure(i) {
  if (i === dataIndex || !figureNum) return;
  dataIndex = i;
  const f = FIGURES[i];
  figureNum.textContent = f.num;
  figureCap.textContent = f.cap;
  if (REDUCED) return;
  const box = figureNum.parentElement && figureNum.parentElement.parentElement;
  if (box && box.animate) {
    box.animate([{ opacity: 0.25 }, { opacity: 1 }],
      { duration: 1100, easing: 'cubic-bezier(.22,.61,.36,1)' });
  }
}

/** 乐句切换时让进度轴上的那一段轻轻跳一下 —— 情绪弧线是听得出来的，也要看得见 */
function pulseBand(band) {
  const mark = railMarks[band];
  if (!mark || REDUCED || !mark.animate) return;
  mark.animate(
    [{ transform: 'scaleY(1)' }, { transform: 'scaleY(1.22)' }, { transform: 'scaleY(1)' }],
    { duration: 340, easing: 'cubic-bezier(.22,.61,.36,1)' }
  );
}

/* --------------------------------------------------------------- 主循环 */

function loop(now) {
  requestAnimationFrame(loop);
  frame++;
  const dt = now - lastT;
  lastT = now;
  if (!scroller) return;

  const { band, velocity, progress } = scroller.read();
  const changed = scroller.step(band);
  if (changed) {
    renderBandState(band);
    if (syncActNav) syncActNav(band);
  }

  /* 概念片跟着滚动淡出。这里记一下"视频已经让位"，
     CSS 靠这个类把结构柱、引导语、时间坐标放出来。 */
  if (heroVideo) {
    const a = heroVideo.setProgress(progress);
    document.body.classList.toggle('video-gone', a < 0.5);
  }

  if (!renderer || !visible) return;

  syncSize();
  if (openStart === 0) openStart = now;

  renderer.render({
    time: (now - renderer.started) / 1000,
    velocity,
    frame,
  });
  renderer.sample(dt);
}

/* ----------------------------------------------------------------- 分幕导航
   首屏原本只靠滚动推进，用户看不出"还能往下走"。这里给一条显式路径：
   上一幕 / 四个刻度点 / 下一幕。最后一幕之后接第二章。
   两个页面之间原本只有一个埋在页面底部的链接，现在这里是最好找的入口。 */

const ACT_LABELS = [
  { name: '结构', hint: '三段式结构柱' },
  { name: '苍劲', hint: '穹乃额曼亮起' },
  { name: '叙事', hint: '达斯坦亮起' },
  { name: '欢腾 · 入口', hint: '麦西热甫与入口句' },
];

/** 逐幕走完之后的下一站。章节链条与 js/lib/site.js 的 NAV 保持一致。 */
const NEXT_PAGE = { href: 'qiongnaieman/index.html', label: '第二章 · 穹乃额曼' };

let syncActNav = null;

function bindActNav() {
  const prev = $('#act-prev');
  const next = $('#act-next');
  const prevLabel = $('#act-prev-label');
  const nextLabel = $('#act-next-label');
  const dots = $$('#act-dots button');
  if (!prev || !next) return;

  const sync = (band) => {
    const i = Math.max(0, Math.min(3, band));
    prev.disabled = i === 0;
    prevLabel.textContent = i === 0 ? '已是第一幕' : '上一幕 · ' + ACT_LABELS[i - 1].name;

    const last = i >= 3;
    nextLabel.textContent = last ? NEXT_PAGE.label : '下一幕 · ' + ACT_LABELS[i + 1].name;
    next.setAttribute('aria-label', last ? '进入' + NEXT_PAGE.label : '进入下一幕：' + ACT_LABELS[i + 1].hint);
    next.classList.toggle('is-final', last);

    dots.forEach((d, k) => d.setAttribute('aria-current', String(k === i)));
  };

  prev.addEventListener('click', () => jumpTo(Math.max(0, scroller.band - 1)));
  next.addEventListener('click', () => {
    if (scroller.band >= 3) { location.href = NEXT_PAGE.href; return; }
    jumpTo(scroller.band + 1);
  });
  dots.forEach((d) => {
    d.addEventListener('click', () => scroller.jumpTo(Number(d.dataset.actJump)));
  });

  sync(Math.max(0, scroller.band));
  return sync;
}

function jumpTo(stage) {
  scroller.jumpTo(Math.max(0, Math.min(3, stage)));
}

/* ----------------------------------------------------------------- 交互 */

function bindInteractions() {
  railMarks.forEach((m, i) => {
    m.addEventListener('click', () => scroller.jumpTo(i + 1));
  });

  document.addEventListener('keydown', (e) => {
    if (document.body.classList.contains('is-network')) return;
    const k = e.key;
    if (k !== 'ArrowDown' && k !== 'ArrowUp' && k !== 'j' && k !== 'k') return;
    const dir = (k === 'ArrowDown' || k === 'j') ? 1 : -1;
    scroller.jumpTo(scroller.band + dir);
    e.preventDefault();
  });

  /* 声音开关默认开：按钮一开始显示"开"，第一次交互自动起鼓。
     只把标签写成"开"而不放声音是骗人 —— 浏览器不允许没手势就出声，
     所以"默认开"必须配一次自动开。 */
  mountSoundButton({
    on: () => {
      if (!audio.enable()) return false;
      audio.setBand(Math.max(0, Math.min(2, scroller.band - 1)));
      return true;
    },
    off: () => audio.disable(),
    onFirstGesture: () => {
      if (!audio.enable()) return;
      audio.setBand(Math.max(0, Math.min(2, scroller.band - 1)));
    },
  });

  $('#entry-btn').addEventListener('click', () => {
    document.body.classList.add('is-network');
    networkEl.setAttribute('aria-hidden', 'false');
    window.dispatchEvent(new CustomEvent('xiangmai:network-open'));
    if (audio.enabled) audio.setBand(2);
  });

  window.addEventListener('xiangmai:network-close', () => {
    document.body.classList.remove('is-network');
    networkEl.setAttribute('aria-hidden', 'true');
  });

  window.addEventListener('resize', () => { cssW = 0; syncSize(); }, { passive: true });

  document.addEventListener('visibilitychange', () => {
    scroller.resetVelocity();
    lastT = performance.now();
  });

  if ('IntersectionObserver' in window) {
    new IntersectionObserver((es) => {
      es.forEach((en) => { visible = en.isIntersecting; });
    }, { threshold: 0 }).observe(heroEl);
  }
}

/* ----------------------------------------------------------------- 启动 */

async function boot() {
  scroller = new BandScroller(heroEl, {
    thresholds: [0.10, 0.40, 0.86],
    anchors: [0.02, 0.16, 0.52, 0.97],
    count: 3,
  });

  audio = new DapSequencer({
    volume: 0.34,
    // 乐句换句时给进度轴一个小脉冲：听觉的呼吸，视觉上也能看到
    onPhrase: ({ band }) => { if (band === scroller.band - 1) pulseBand(band); },
  });

  // 给自检用：tools/audio-test.mjs 需要摸到音序器实例才能量电平
  window.__XM_SEQ__ = audio;

  let baked = 0;
  try {
    renderer = new Renderer(canvas, {
      // 房间的两层"厚度"：壁面质感 1.0，壁画残迹 1.25（残片要看得出来才不白做）
      wallGain: 1,
      muralGain: 1.25,
    });

    // 每段烘两张：暗版作底、亮版作高光层。滚动点亮时只改高光层透明度，
    // 明暗过渡交给 CSS —— 这样既省算力，画质也不受过渡影响。
    segs.forEach((el, i) => {
      try {
        const dimUrl = renderer.bake(i, BAKE_SIZES[i][0], BAKE_SIZES[i][1], 0.46);
        const litUrl = renderer.bake(i, BAKE_SIZES[i][0], BAKE_SIZES[i][1], 1.0);
        if (!dimUrl || dimUrl.length < 500 || !litUrl || litUrl.length < 500) return;

        el.style.setProperty('--tex-dim', 'url("' + dimUrl + '")');
        el.style.setProperty('--tex-lit', 'url("' + litUrl + '")');
        const hi = document.createElement('span');
        hi.className = 'seg__lit';
        hi.setAttribute('aria-hidden', 'true');
        el.appendChild(hi);
        el.classList.add('has-tex');
        baked++;
      } catch (e) { /* 单段失败就退回 assets/filters.svg 的滤镜纹理 */ }
    });

    syncSize();
    document.body.dataset.render = baked === 3 ? 'textured' : 'webgl';
    window.__XM_RENDERER__ = renderer;   // 自检用：查 uniform 位置、量画布
  } catch (err) {
    // 没有 WebGL：退回 DOM + SVG 滤镜，视觉语法保持一致
    document.body.dataset.render = 'basic';
    if (window.console) console.warn('[弦脉] 退回基础渲染：', err && err.message);
  }

  bindInteractions();
  initNetwork();   // 挂上师承网络：入口句点击时由 CustomEvent 唤起

  /* ---- 首屏概念片 ----
     只在桌面端开：三段全屏视频 + WebGL 会拖垮手机。
     "视频阶段 → 结构柱阶段" 靠卷动进度切换，不用额外做一套时序。 */
  const hvHost = $('#hero-video');
  /* 现在手机也放（素材压到 640×360、三段共 1.2MB），
     只有低端设备或省流模式才跳过。 */
  if (hvHost && !shouldSkipVideo() && !REDUCED) {
    heroVideo = buildHeroVideo({
      host: hvHost,
      /* 视频霸屏：前面 4~5 屏全是它，结构柱很晚才出现。
         整段 hero 3780px、视口 900px，可滚距离 2880px，
         所以 0.625 / 1.11 换算成滚动距离就是：
           让位起点 1800px（约 4 屏），完全消失 2880px（滚到底）。
         早先设 0.06 / 0.42 只有 226 / 1587px ——
         鼠标滚六七下视频就没了，和"第一眼就是一整屏画面"的意图不符。 */
      fadeStart: 0.625,   // ≈1800px
      fadeEnd: 1.0,       // ≈2880px（滚到底）
      reduced: REDUCED,
    });
    document.body.classList.add('has-hero-video');
    window.__XM_HERO__ = heroVideo;   // 自检用
  } else if (hvHost) {
    hvHost.remove();          // 手机端整个拿掉，连文件都不下
  }

  // 首帧先把初始状态落下去，再触发入场动画
  const { band } = scroller.read();
  scroller.step(band);
  renderBandState(band);
  syncActNav = bindActNav();

  requestAnimationFrame(loop);
  requestAnimationFrame(() => {
    document.body.classList.add('is-ready');
    openStart = performance.now();
  });

  if (stageEl) stageEl.setAttribute('data-band', String(band));
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
else boot();
