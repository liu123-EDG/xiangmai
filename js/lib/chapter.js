/* ==========================================================================
   弦脉 · 章节页公共启动
   --------------------------------------------------------------------------
   每个章节页要做的事几乎一样：装导航、铺空气层（地火）、显形、图片槽、
   可选的声音、可见性暂停。抽成一处，页面只提供自己的配置。

   这样加一页的成本 = 一个 HTML + 一次 bootChapter() 调用 + 三行构建配置。
   ========================================================================== */

import { Renderer } from './renderer.js';
import { DapSequencer } from './sequencer.js';
import { mountShell, mountChapterNav, revealOnScroll, mountSlots } from './site.js';

const REDUCED = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/**
 * @param {object} opts
 * @param {string} opts.base    相对站点根的路径前缀（章节页一律 '../'）
 * @param {string} opts.active  当前页在导航里的 id
 * @param {number} [opts.wallGain=0.9]
 * @param {boolean} [opts.sound=true]  是否挂声音开关（页面上要有 #sound-toggle）
 * @param {number} [opts.soundBand=0]  声音默认放第几段的鼓
 * @param {boolean} [opts.heat=true]   是否启用随滚动上升的地火热度
 */
export function bootChapter(opts = {}) {
  mountShell({ base: opts.base || '../', active: opts.active });
  mountChapterNav({ base: opts.base || '../', active: opts.active });
  mountSlots();

  let renderer = null;
  let seq = null;
  let cssW = 0, cssH = 0, dpr = 0;
  let visible = true;
  let lastT = performance.now();
  let frame = 0;
  let heatNow = 0;
  let center = [0.5, 0.5];

  /* ---- 空气层：地火 + 壁面 + 浮尘 ---- */
  const canvas = document.getElementById('air');
  if (canvas) {
    try {
      renderer = new Renderer(canvas, {
        mode: 'chapter',
        wallGain: opts.wallGain === undefined ? 0.9 : opts.wallGain,
        muralGain: 0,
      });
      document.body.dataset.render = 'chapter';
    } catch (err) {
      document.body.dataset.render = 'basic';
      if (window.console) console.warn('[弦脉] 退回基础渲染：', err && err.message);
    }
  }

  const syncSize = () => {
    if (!canvas || !renderer) return;
    const r = canvas.getBoundingClientRect();
    const w = Math.max(1, Math.round(r.width));
    const h = Math.max(1, Math.round(r.height));
    const d = window.devicePixelRatio || 1;
    if (w === cssW && h === cssH && d === dpr) return;
    cssW = w; cssH = h; dpr = d;
    renderer.resize(w, h, d);
  };

  /** 热度：越往下读越热，这是章节页的推进体感 */
  const readHeat = () => {
    if (opts.heat === false) return 0.4;
    const max = Math.max(1, document.documentElement.scrollHeight - window.innerHeight);
    return Math.min(1, Math.max(0, window.scrollY / max));
  };

  /** 热源跟着当前幕走，让地火的亮处随阅读位置移动 */
  const readCenter = () => {
    const acts = Array.from(document.querySelectorAll('[data-act]'));
    if (!acts.length) return [0.5, 0.5];
    const mid = window.innerHeight * 0.55;
    let best = acts[0], bestD = Infinity;
    acts.forEach((a) => {
      const r = a.getBoundingClientRect();
      const d = Math.abs(r.top + r.height * 0.5 - mid);
      if (d < bestD) { bestD = d; best = a; }
    });
    const r = best.getBoundingClientRect();
    const cx = (r.left + r.width * 0.5) / Math.max(1, window.innerWidth);
    const cy = 1 - (r.top + r.height * 0.5) / Math.max(1, window.innerHeight);
    return [Math.min(0.86, Math.max(0.14, cx)), Math.min(0.86, Math.max(0.14, cy))];
  };

  const loop = (now) => {
    requestAnimationFrame(loop);
    frame++;
    const dt = now - lastT;
    lastT = now;

    heatNow += (readHeat() - heatNow) * 0.035;
    center = readCenter();
    if (!renderer || !visible) return;

    syncSize();
    renderer.render({
      time: (now - renderer.started) / 1000,
      velocity: 0,
      frame,
      heat: heatNow,
    });
    renderer.sample(dt);
  };

  /* ---- 声音（可选） ---- */
  if (opts.sound !== false) {
    seq = new DapSequencer({ volume: 0.34 });
    window.__XM_SEQ__ = seq;                 // 自检用

    const btn = document.getElementById('sound-toggle');
    const text = document.getElementById('sound-text');
    if (btn) {
      btn.addEventListener('click', () => {
        const on = btn.getAttribute('aria-pressed') !== 'true';
        if (on) {
          if (!seq.enable()) { if (text) text.textContent = '声音 不可用'; return; }
          seq.setBand(opts.soundBand || 0);
        } else {
          seq.disable();
        }
        btn.setAttribute('aria-pressed', String(on));
        if (text) text.textContent = on ? '声音 开' : '声音 关';
      });
    }
  }

  /* ---- 显形 ---- */
  revealOnScroll('.reveal', { threshold: 0.15 });
  revealOnScroll('.tl-item', { threshold: 0.25 });

  if ('IntersectionObserver' in window) {
    const main = document.querySelector('main');
    if (main) {
      new IntersectionObserver((es) => {
        es.forEach((e) => { visible = e.isIntersecting; });
      }, { threshold: 0 }).observe(main);
    }
  }

  window.addEventListener('resize', () => { cssW = 0; syncSize(); }, { passive: true });
  document.addEventListener('visibilitychange', () => { lastT = performance.now(); });

  requestAnimationFrame(loop);
  requestAnimationFrame(() => document.body.classList.add('is-ready'));

  return { renderer, seq, REDUCED, syncSize };
}

export { REDUCED };
