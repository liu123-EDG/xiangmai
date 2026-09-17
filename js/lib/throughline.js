/* ==========================================================================
   弦脉 · 贯穿线
   --------------------------------------------------------------------------
   第一章「穹乃额曼」的纵贯视觉：一个音符钉在开场，符干往下延长，
   越往下越向右，最后落到页面底部的「进入第三章」入口上。

   它同时是三件事：
     · 视觉 —— 一个音一直在响，一直没停（十二木卡姆一遍二十多小时）
     · 语义 —— 线越长越偏，呼应旋律的「游移」；末端渐细渐暗，像声音自然衰减
     · 导航 —— 末端就是通往下一章的入口，线本身成了一条路

   声音：一层极轻的持续音垫在底下（drone）。不是旋律，是气息。
   默认不响 —— 浏览器不允许自动播放，得等用户点「声音 开」。
   ========================================================================== */

const SVGNS = 'http://www.w3.org/2000/svg';
const el = (tag, attrs) => {
  const n = document.createElementNS(SVGNS, tag);
  for (const k in attrs) n.setAttribute(k, attrs[k]);
  return n;
};

/**
 * @param {object} opts
 * @param {HTMLElement} opts.host    放 SVG 的容器（一般是 body 下的一层）
 * @param {HTMLElement} opts.anchor  起点元素（音头对齐到它）
 * @param {HTMLElement} opts.endRef  终点元素（线要落到它上面）
 * @param {string}    [opts.tone]    线的颜色
 * @param {number}    [opts.drift]   越往下右偏的比例（0.2 = 最终右偏屏宽的 20%）
 * @param {boolean}   [opts.reduced]
 */
export function buildThroughline(opts) {
  const { host, anchor, endRef } = opts;
  if (!host || !anchor || !endRef) return null;

  const tone = opts.tone || '#7d97a6';
  const drift = opts.drift === undefined ? 0.22 : opts.drift;
  const reduced = !!opts.reduced;

  /* ---- SVG 骨架。viewBox 用「文档坐标」，这样滚动时不用改路径 ---- */
  const svg = el('svg', {
    class: 'tl', 'aria-hidden': 'true', focusable: 'false',
  });
  const defs = el('defs');

  // 线的渐变：起点实、末端虚，像声音衰减
  const grad = el('linearGradient', { id: 'tlGrad', x1: '0', y1: '0', x2: '0.35', y2: '1' });
  grad.appendChild(el('stop', { offset: '0', 'stop-color': tone, 'stop-opacity': '0.85' }));
  grad.appendChild(el('stop', { offset: '0.55', 'stop-color': tone, 'stop-opacity': '0.5' }));
  grad.appendChild(el('stop', { offset: '1', 'stop-color': tone, 'stop-opacity': '0.9' }));
  defs.appendChild(grad);

  // 末端的光晕
  const glow = el('radialGradient', { id: 'tlGlow' });
  glow.appendChild(el('stop', { offset: '0', 'stop-color': tone, 'stop-opacity': '0.55' }));
  glow.appendChild(el('stop', { offset: '1', 'stop-color': tone, 'stop-opacity': '0' }));
  defs.appendChild(glow);
  svg.appendChild(defs);

  // 底衬：比主线粗，压出一点体积，避免细线被背景吃掉
  const sleeve = el('path', { class: 'tl__sleeve', fill: 'none' });
  const path = el('path', { class: 'tl__path', fill: 'none', stroke: 'url(#tlGrad)' });
  svg.appendChild(sleeve);
  svg.appendChild(path);

  // 末端的落点：一圈光晕 + 一个小节点头
  const endG = el('g', { class: 'tl__end' });
  endG.appendChild(el('circle', { r: 26, fill: 'url(#tlGlow)', class: 'tl__endglow' }));
  endG.appendChild(el('circle', { r: 4.5, class: 'tl__enddot' }));
  svg.appendChild(endG);

  // 音头：椭圆符头。
  // 不另画符干 —— 那条曲线本身就是符干，"一个音符往下拖出长线"这件事
  // 才读得出来；再画一根独立的干，会变成"一根线 + 一个音符"两个东西。
  const headG = el('g', { class: 'tl__head' });
  const head = el('ellipse', { rx: 14.5, ry: 10.6, class: 'tl__headshape' });
  headG.appendChild(head);
  svg.appendChild(headG);

  host.appendChild(svg);

  let geom = null;

  /** 量出起点与终点，生成路径 */
  const measure = () => {
    const sx = window.scrollX;
    const docW = document.documentElement.clientWidth;
    const a = anchor.getBoundingClientRect();
    const e = endRef.getBoundingClientRect();

    // 起点：音头放在锚点**下方**、左侧留白里，避免压在标题或正文上
    const y0 = a.top + window.scrollY + a.height + 78;
    const x0 = Math.max(28, a.left - 46);
    const y1 = e.top + window.scrollY + e.height * 0.5;
    const x1 = e.left + e.width * 0.5;

    const dy = Math.max(200, y1 - y0);
    const driftPx = docW * drift;

    /* 曲线：先向右下走，末端收一小段水平线接到链接上。
       末端收平是有意的 —— 让"线到这里停住，接上了"这件事读得出来。 */
    const bendX = Math.min(x0 + driftPx, docW - 90);
    const c1x = x0 + driftPx * 0.30;
    const c1y = y0 + dy * 0.30;
    const c2x = bendX;
    const c2y = y0 + dy * 0.74;
    // 末端控制点：从弯处水平过渡到落点
    const c3x = x1 - Math.min(140, (x1 - bendX) * 0.55);
    const c3y = y1;

    const d = 'M ' + x0.toFixed(1) + ' ' + y0.toFixed(1) +
      ' C ' + c1x.toFixed(1) + ' ' + c1y.toFixed(1) +
      ', ' + c2x.toFixed(1) + ' ' + c2y.toFixed(1) +
      ', ' + bendX.toFixed(1) + ' ' + (y0 + dy * 0.88).toFixed(1) +
      ' S ' + c3x.toFixed(1) + ' ' + c3y.toFixed(1) +
      ', ' + x1.toFixed(1) + ' ' + y1.toFixed(1);

    geom = { d, x0, y0, x1, y1 };

    svg.setAttribute('viewBox', sx + ' 0 ' + docW + ' ' + document.documentElement.scrollHeight);
    svg.setAttribute('width', docW);
    svg.setAttribute('height', document.documentElement.scrollHeight);
    path.setAttribute('d', d);
    sleeve.setAttribute('d', d);

    // 音头贴在起点
    headG.setAttribute('transform', 'translate(' + x0.toFixed(1) + ' ' + y0.toFixed(1) + ')');
    head.setAttribute('transform', 'rotate(-18)');

    endG.setAttribute('transform', 'translate(' + x1.toFixed(1) + ' ' + y1.toFixed(1) + ')');
  };

  /* ---- 随滚动把线画出来 ---- */
  let total = 0;
  const tick = () => {
    if (!geom) return;

    const r = host.getBoundingClientRect();
    // 进度：文档滚到哪，线画到哪
    const vh = window.innerHeight;
    const docH = Math.max(1, document.documentElement.scrollHeight - vh);
    const p = Math.min(1, Math.max(0, window.scrollY / docH * 1.25));

    if (!total || total < 10) {
      try { total = path.getTotalLength(); } catch { total = 2000; }
      path.style.strokeDasharray = total + ' ' + total;
      sleeve.style.strokeDasharray = total + ' ' + total;
    }

    if (reduced) {
      path.style.strokeDashoffset = '0';
      sleeve.style.strokeDashoffset = '0';
      endG.style.opacity = '1';
      return;
    }

    const off = total * (1 - p);
    path.style.strokeDashoffset = off.toFixed(1);
    sleeve.style.strokeDashoffset = off.toFixed(1);

    // 末端在接近画完时才亮起来
    endG.style.opacity = String(Math.min(1, Math.max(0, (p - 0.55) / 0.35)));

    // 音头随滚动淡一点，让位给正文
    const headFade = Math.max(0.25, 1 - window.scrollY / (vh * 1.6));
    headG.style.opacity = headFade.toFixed(2);
    host.style.setProperty('--tl-progress', p.toFixed(4));
    void r;
  };

  let ticking = false;
  const onScroll = () => {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(() => { ticking = false; tick(); });
  };

  measure();
  tick();
  // 字体/图片加载完高度会变，重算一次
  window.addEventListener('load', () => { measure(); total = 0; tick(); });
  window.addEventListener('resize', () => { measure(); total = 0; tick(); }, { passive: true });
  window.addEventListener('scroll', onScroll, { passive: true });

  return {
    svg, measure, tick,
    destroy() {
      window.removeEventListener('scroll', onScroll);
    },
  };
}

/* ==========================================================================
   持续音（drone）
   --------------------------------------------------------------------------
   「一个音一直在响」这件事，光看线感受不到。垫一层几乎察觉不到的持续音，
   整章的体感会不一样。

   做法：两个正弦波微微失谐（差 0.6Hz），再过一条极慢的滤波器扫描 ——
   出来的不是"音"，是"气息"。没有起音、没有节奏，听久了不会烦。
   ========================================================================== */
export function createDrone() {
  let ctx = null, nodes = null, on = false;

  const start = () => {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return false;
    if (!ctx) ctx = new AC();
    if (ctx.state === 'suspended') ctx.resume();

    if (!nodes) {
      const master = ctx.createGain();
      master.gain.value = 0;                       // 从静音淡入

      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = 620;
      lp.Q.value = 0.6;

      const hp = ctx.createBiquadFilter();
      hp.type = 'highpass';
      hp.frequency.value = 58;

      // 三个微微失谐的正弦：拍频让音"活"起来，但不构成旋律
      const freqs = [110, 110.6, 164.8];
      const gains = [0.5, 0.34, 0.16];
      const oscs = freqs.map((f, i) => {
        const o = ctx.createOscillator();
        o.type = 'sine';
        o.frequency.value = f;
        const g = ctx.createGain();
        g.gain.value = gains[i];
        o.connect(g).connect(lp);
        o.start();
        return o;
      });

      // 极慢的滤波器扫描：像呼吸
      const lfo = ctx.createOscillator();
      lfo.frequency.value = 0.045;
      const lfoGain = ctx.createGain();
      lfoGain.gain.value = 190;
      lfo.connect(lfoGain).connect(lp.frequency);
      lfo.start();

      lp.connect(hp).connect(master).connect(ctx.destination);
      nodes = { master, oscs, lfo };
    }

    const t = ctx.currentTime;
    nodes.master.gain.cancelScheduledValues(t);
    nodes.master.gain.setTargetAtTime(0.055, t, 2.4);   // 很轻，几乎是背景
    on = true;
    return true;
  };

  const stop = () => {
    if (!ctx || !nodes) { on = false; return; }
    const t = ctx.currentTime;
    nodes.master.gain.cancelScheduledValues(t);
    nodes.master.gain.setTargetAtTime(0, t, 0.5);
    on = false;
  };

  return { start, stop, get enabled() { return on; } };
}
