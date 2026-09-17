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

  const tone = opts.tone || '#d9b268';
  const drift = opts.drift === undefined ? 0.38 : opts.drift;
  const reduced = !!opts.reduced;

  /* ---- SVG 骨架。viewBox 用「文档坐标」，这样滚动时不用改路径 ---- */
  const svg = el('svg', {
    class: 'tl', 'aria-hidden': 'true', focusable: 'false',
  });
  const defs = el('defs');

  /* 金丝的"金"不靠一个颜色，靠一条多段渐变：
     暗金 → 亮金 → 冷金 → 亮金 → 暗金。
     单一金色看起来只是"一条黄线"，多段才有金属的明暗。 */
  const grad = el('linearGradient', { id: 'tlGrad', x1: '0', y1: '0', x2: '0.3', y2: '1' });
  [
    ['0.00', '#8a6a2e', '0.92'],
    ['0.18', '#d9b268', '0.95'],
    ['0.34', '#f6e2ab', '1'],
    ['0.52', '#c69a4a', '0.92'],
    ['0.70', '#efd79b', '1'],
    ['0.86', '#b8873a', '0.88'],
    ['1.00', '#8a6a2e', '0.95'],
  ].forEach(([off, col, op]) => {
    grad.appendChild(el('stop', { offset: off, 'stop-color': col, 'stop-opacity': op }));
  });
  defs.appendChild(grad);

  // 流动高光用的亮色渐变
  const sheenGrad = el('linearGradient', { id: 'tlSheen', x1: '0', y1: '0', x2: '1', y2: '0' });
  sheenGrad.appendChild(el('stop', { offset: '0', 'stop-color': '#fff6dd', 'stop-opacity': '0' }));
  sheenGrad.appendChild(el('stop', { offset: '0.5', 'stop-color': '#fff6dd', 'stop-opacity': '1' }));
  sheenGrad.appendChild(el('stop', { offset: '1', 'stop-color': '#fff6dd', 'stop-opacity': '0' }));
  defs.appendChild(sheenGrad);

  // 走针的光晕
  const beadGlow = el('radialGradient', { id: 'tlBead' });
  beadGlow.appendChild(el('stop', { offset: '0', 'stop-color': '#fff3d4', 'stop-opacity': '0.9' }));
  beadGlow.appendChild(el('stop', { offset: '0.45', 'stop-color': '#e8c98f', 'stop-opacity': '0.34' }));
  beadGlow.appendChild(el('stop', { offset: '1', 'stop-color': '#d9b268', 'stop-opacity': '0' }));
  defs.appendChild(beadGlow);

  // 末端的光晕
  const glow = el('radialGradient', { id: 'tlGlow' });
  glow.appendChild(el('stop', { offset: '0', 'stop-color': '#f6e2ab', 'stop-opacity': '0.62' }));
  glow.appendChild(el('stop', { offset: '1', 'stop-color': '#d9b268', 'stop-opacity': '0' }));
  defs.appendChild(glow);

  /* ---- 金属质感滤镜 ----------------------------------------------------
     光靠渐变出不来金属，因为金属的特征是"随表面朝向改变明暗"。
     所以用 feTurbulence 造一个表面高度场，再用 feSpecularLighting 打光 ——
     亮的地方是反光，暗的地方是背光，中间起伏是磨损颗粒。
     这是 SVG 里唯一能做出真金属的路子。 */
  const metal = el('filter', {
    id: 'tlMetal', x: '-30%', y: '-30%', width: '160%', height: '160%',
    'color-interpolation-filters': 'sRGB',
  });
  // 表面高度场：分形噪声，越细越像打磨过的金属
  metal.appendChild(el('feTurbulence', {
    type: 'fractalNoise', baseFrequency: '0.9 0.035',
    numOctaves: '3', seed: '7', result: 'grain',
  }));
  // 打光：远景方向的光，高光偏暖金
  const spec = el('feSpecularLighting', {
    in: 'grain', surfaceScale: '2.4', specularConstant: '1.05',
    specularExponent: '16', lightingColor: '#ffeec2', result: 'spec',
  });
  spec.appendChild(el('fePointLight', { x: '-60', y: '-120', z: '190' }));
  metal.appendChild(spec);
  // 只留高光，叠回原色上
  metal.appendChild(el('feComposite', {
    in: 'spec', in2: 'SourceGraphic', operator: 'in', result: 'specClip',
  }));
  metal.appendChild(el('feComposite', {
    in: 'specClip', in2: 'SourceGraphic', operator: 'arithmetic',
    k1: '0', k2: '1', k3: '0.95', k4: '0',
  }));
  defs.appendChild(metal);

  /* 金丝的横向明暗：模拟圆柱反光。
     一条金属丝不是均匀的，靠中心最亮、两边压暗，
     这一层叠在主线下面，丝才有"圆"的感觉。 */
  const round = el('linearGradient', {
    id: 'tlRound', x1: '0', y1: '0', x2: '1', y2: '0',
  });
  [
    ['0', '#3a2c11', '0.85'],
    ['0.28', '#a8802f', '0.9'],
    ['0.46', '#ffeec2', '1'],
    ['0.62', '#d9b268', '0.95'],
    ['1', '#2e230d', '0.85'],
  ].forEach(([off, col, op]) => {
    round.appendChild(el('stop', { offset: off, 'stop-color': col, 'stop-opacity': op }));
  });
  defs.appendChild(round);

  /* 音头的金色：从左上到右下的斜向渐变，加一圈暗边。
     符头是"实心金属块"，所以要的是块面反光，不是丝状明暗。 */
  const headGrad = el('linearGradient', {
    id: 'tlHead', x1: '0.1', y1: '0', x2: '0.9', y2: '1',
  });
  [
    ['0', '#ffeec2', '1'],
    ['0.22', '#e8c98f', '1'],
    ['0.5', '#a8802f', '1'],
    ['0.72', '#d9b268', '1'],
    ['1', '#5a4318', '1'],
  ].forEach(([off, col, op]) => {
    headGrad.appendChild(el('stop', { offset: off, 'stop-color': col, 'stop-opacity': op }));
  });
  defs.appendChild(headGrad);
  svg.appendChild(defs);

  /* 叠五层出"金丝"：
       shadow  极暗的底，让丝从背景里浮起来
       round   横向明暗（圆柱反光），丝有"圆"的感觉
       sleeve  稍粗的暖衬，做出金属的厚度
       path    主线（多段金渐变 + 金属高光滤镜）
       sheen   沿丝流动的高光
     再加一个走针。 */
  const shadow = el('path', { class: 'tl__shadow', fill: 'none' });
  const roundL = el('path', { class: 'tl__round', fill: 'none', stroke: 'url(#tlRound)' });
  const sleeve = el('path', { class: 'tl__sleeve', fill: 'none' });
  const path = el('path', {
    class: 'tl__path', fill: 'none',
    stroke: 'url(#tlGrad)', filter: 'url(#tlMetal)',
  });
  const sheen = el('path', { class: 'tl__sheen', fill: 'none', stroke: 'url(#tlSheen)' });
  svg.appendChild(shadow);
  svg.appendChild(roundL);
  svg.appendChild(sleeve);
  svg.appendChild(path);
  svg.appendChild(sheen);

  // 走针：沿丝前进的光点
  const beadG = el('g', { class: 'tl__bead' });
  beadG.appendChild(el('circle', { r: 16, fill: 'url(#tlBead)' }));
  beadG.appendChild(el('circle', { r: 3, class: 'tl__beaddot' }));
  svg.appendChild(beadG);

  // 末端的落点：一圈光晕 + 一个小节点头
  const endG = el('g', { class: 'tl__end' });
  endG.appendChild(el('circle', { r: 26, fill: 'url(#tlGlow)', class: 'tl__endglow' }));
  endG.appendChild(el('circle', { r: 4.5, class: 'tl__enddot' }));
  svg.appendChild(endG);

  // 音头：椭圆符头 + 一块高光。
  // 不另画符干 —— 那条曲线本身就是符干，"一个音符往下拖出长线"这件事
  // 才读得出来；再画一根独立的干，会变成"一根线 + 一个音符"两个东西。
  const headG = el('g', { class: 'tl__head' });
  const head = el('ellipse', { rx: 15.5, ry: 11.4, class: 'tl__headshape', filter: 'url(#tlMetal)' });
  headG.appendChild(head);
  // 高光：一小片偏左上，金属的"亮点"就在这
  headG.appendChild(el('ellipse', {
    rx: 5.2, ry: 3.1, cx: -4.2, cy: -3.4, class: 'tl__headspec',
  }));
  headG.appendChild(head);
  svg.appendChild(headG);

  host.appendChild(svg);

  let geom = null;
  /* 动画状态。声明放前面：tick() 会用到它们，而 tick() 在 measure() 之后
     立刻就被调用一次。 */
  let phase = 0;
  let raf = 0;
  let sheenLen = 0;

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

    // 进度：文档滚到哪，线画到哪
    const vh = window.innerHeight;
    const docH = Math.max(1, document.documentElement.scrollHeight - vh);
    const p = Math.min(1, Math.max(0, window.scrollY / docH * 1.25));

    if (!total || total < 10) {
      try { total = path.getTotalLength(); } catch { total = 2000; }
      // 已经画出来的部分：实线 dash
      [shadow, roundL, sleeve, path].forEach((el2) => {
        el2.style.strokeDasharray = total + ' ' + total;
      });
      /* 流动高光：一小段亮斑（约丝长的 7%），靠负的 dashoffset 往前跑。
         它和"画线进度"是两个独立的位移，所以单独用一条 dash 模式。 */
      sheenLen = Math.max(70, total * 0.07);
      sheen.style.strokeDasharray = sheenLen + ' ' + (total - sheenLen);
    }

    if (reduced) {
      [shadow, roundL, sleeve, path].forEach((el2) => { el2.style.strokeDashoffset = '0'; });
      sheen.style.opacity = '0';
      beadG.style.opacity = '0';
      endG.style.opacity = '1';
      return;
    }

    const off = total * (1 - p);
    shadow.style.strokeDashoffset = off.toFixed(1);
    roundL.style.strokeDashoffset = off.toFixed(1);
    sleeve.style.strokeDashoffset = off.toFixed(1);
    path.style.strokeDashoffset = off.toFixed(1);

    // 末端在接近画完时才亮起来
    endG.style.opacity = String(Math.min(1, Math.max(0, (p - 0.55) / 0.35)));

    // 音头随滚动淡一点，让位给正文
    const headFade = Math.max(0.25, 1 - window.scrollY / (vh * 1.6));
    headG.style.opacity = headFade.toFixed(2);
    host.style.setProperty('--tl-progress', p.toFixed(4));

    // 走针：从音头沿丝走到末端，走到头再回来
    try {
      const beadT = (0.5 - 0.5 * Math.cos(phase * 1.15));   // 0→1→0，往返
      const at = total * beadT * p;                          // 只走在已画出的部分上
      const pt = path.getPointAtLength(Math.min(total * p, at));
      beadG.setAttribute('transform', 'translate(' + pt.x.toFixed(1) + ' ' + pt.y.toFixed(1) + ')');
      // 线还没画多少时不显示走针，免得贴在音头上闪
      beadG.style.opacity = p > 0.03 ? String(0.35 + 0.65 * Math.min(1, p * 3)) : '0';
    } catch { /* 路径还没就绪，跳过这一帧 */ }
  };

  /* ---- 只跑一个动画循环，负责"流动"这类与滚动无关的效果 ---- */
  const animate = () => {
    raf = requestAnimationFrame(animate);
    phase += 0.006;
    if (reduced) return;
    // 高光沿丝流动：负位移让它从音头往末端走
    if (total > 0) {
      const span = total + sheenLen;
      const shift = -(phase * 260) % span;
      sheen.style.strokeDashoffset = shift.toFixed(1);
    }
    tick();
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

  // 流动高光与走针需要一个常驻循环（与滚动无关）
  if (!reduced) {
    raf = requestAnimationFrame(animate);
    // 标签页切到后台就停，别空转
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) { cancelAnimationFrame(raf); raf = 0; }
      else if (!raf) raf = requestAnimationFrame(animate);
    });
  }

  return {
    svg, measure, tick,
    destroy() {
      window.removeEventListener('scroll', onScroll);
      if (raf) cancelAnimationFrame(raf);
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
