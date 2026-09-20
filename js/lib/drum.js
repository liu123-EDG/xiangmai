/* ==========================================================================
   弦脉 · 手鼓
   --------------------------------------------------------------------------
   序章那三段结构柱原来就是三块硬切的彩色矩形（560×218 / 560×161 / 560×179），
   用户说"三个大格子视觉上很难看，弄个鼓自己在那里敲也行"。
   所以换成一只俯视的手鼓，自己在敲。

   **一只鼓，三种打法** —— 这正是"三段构成"那个意思，
   不用三块色卡去说：
     穹乃额曼  108 bpm  慢而沉，主打低音
     达斯坦    122 bpm  有叙述感，节奏走起来
     麦西热甫  152 bpm  密而快

   敲击速度跟着当前段变，鼓心的颜色也跟着换。

   同步说明：**鼓用的是自己的时钟**，速度取自音序器真实的 BPM。
   没有去挂音序器内部的音节回调 —— 那要动音频代码，风险大。
   速度和节奏型都对得上，相位可能差几十毫秒，作为背景层看不出来。
   ========================================================================== */

const NS = 'http://www.w3.org/2000/svg';

const el = (tag, attrs) => {
  const n = document.createElementNS(NS, tag);
  if (attrs) for (const k in attrs) n.setAttribute(k, attrs[k]);
  return n;
};

/* 三段的打法。bpm / div 取自 sequencer.js 的 PATTERNS —— 不另编。 */
const SECTIONS = [
  { bpm: 108, div: 2, voice: 0.40, tone: '#7d97a6', label: '苍劲' },  // 穹乃额曼
  { bpm: 122, div: 2, voice: 0.30, tone: '#c08a3e', label: '叙事' },  // 达斯坦
  { bpm: 152, div: 2, voice: 0.34, tone: '#4a8071', label: '欢腾' },  // 麦西热甫
];

/**
 * @param {object} opts
 * @param {HTMLElement} opts.host    放鼓的容器
 * @param {number} [opts.size]       直径（px），默认按容器算
 * @param {boolean} [opts.reduced]   减弱动效
 */
export function buildDrum(opts = {}) {
  const host = opts.host;
  if (!host) return null;

  const reduced = !!opts.reduced;
  const size = opts.size || 440;
  const C = size / 2;
  const R_RIM = C - 10;          // 鼓沿
  const R_SKIN = R_RIM - 16;     // 鼓面
  const R_C = 56;                // 中心敲击区（太大就吃掉整个鼓面，踩过）

  const svg = el('svg', {
    class: 'drum',
    viewBox: '0 0 ' + size + ' ' + size,
    role: 'img',
    'aria-label': '手鼓：三段各自的节奏',
  });
  svg.style.width = size + 'px';
  svg.style.height = size + 'px';

  /* ---- 鼓面 ----
     三层同心圈 **分别代表三段**，而不是装饰性的同心圆：
       外圈 穹乃额曼 · 中圈 达斯坦 · 内圈 麦西热甫
     当前那一段亮起来，另外两圈按到最暗 —— 一眼看出"现在在打哪一段"。
     这是这只鼓存在的理由：一只鼓，三种打法。 */
  const defs = el('defs');
  const grad = el('radialGradient', { id: 'drumSkin', cx: '50%', cy: '44%', r: '64%' });
  grad.appendChild(el('stop', { offset: '0%', 'stop-color': 'rgba(86,68,46,0.55)' }));
  grad.appendChild(el('stop', { offset: '62%', 'stop-color': 'rgba(38,30,22,0.72)' }));
  grad.appendChild(el('stop', { offset: '100%', 'stop-color': 'rgba(14,12,9,0.92)' }));
  defs.appendChild(grad);
  svg.appendChild(defs);

  // 鼓面（羊皮）
  svg.appendChild(el('circle', {
    cx: C, cy: C, r: R_SKIN, fill: 'url(#drumSkin)',
    stroke: 'rgba(222,214,200,0.12)', 'stroke-width': 1,
  }));

  /* 内阴影：鼓面不是平的，靠中心亮、靠边压暗才有弧度。
     用一圈从透明到黑的径向渐变叠上去。 */
  const inner = el('circle', {
    cx: C, cy: C, r: R_SKIN,
    fill: 'none',
    stroke: 'rgba(0,0,0,0.55)',
    'stroke-width': 34,
    opacity: 0.5,
    filter: 'blur(9px)',
  });
  svg.appendChild(inner);

  /* 鼓绳：一圈斜纹，让它一眼是"鼓"而不是靶子。
     用 dashed stroke 做斜纹，比真画几十条线便宜。 */
  const lash = el('circle', {
    cx: C, cy: C, r: R_RIM - 5, fill: 'none',
    stroke: 'rgba(196,172,132,0.30)', 'stroke-width': 2.4,
    'stroke-dasharray': '3 9', 'stroke-linecap': 'round',
  });
  svg.appendChild(lash);

  // 鼓沿
  svg.appendChild(el('circle', {
    cx: C, cy: C, r: R_RIM, fill: 'none',
    stroke: 'rgba(222,214,200,0.26)', 'stroke-width': 1,
  }));

  /* ---- 三段圈：当前那段亮 ----
     半径要**拉开**（不能只差二十几），否则三圈挤在鼓面中间，
     看着糊成一团、分不出哪圈是哪段。 */
  const RINGS = [R_RIM - 38, R_RIM - 74, R_RIM - 110];
  const rings = RINGS.map((r, i) => {
    const c = el('circle', {
      cx: C, cy: C, r,
      fill: 'none',
      stroke: SECTIONS[i].tone,
      'stroke-width': 1.4,
      opacity: i === 0 ? 0.9 : 0.16,
      /* 加类名：自检要按名字找这三圈。
         只按 stroke-width 找会把涟漪和脉冲圈一起算进来（踩过：
         探针报"三段圈数量 = 5"）。 */
      class: 'drum-ring',
    });
    svg.appendChild(c);
    return c;
  });

  /* ---- 涟漪：敲一下从中心荡一圈，很快散掉 ---- */
  const ripples = [];
  for (let i = 0; i < 2; i++) {
    const c = el('circle', {
      cx: C, cy: C, r: R_C, fill: 'none',
      stroke: SECTIONS[0].tone, 'stroke-width': 1.4, opacity: 0,
    });
    ripples.push({ node: c, t: -1 });
    svg.appendChild(c);
  }

  /* ---- 中心敲击区 ---- */
  const pulseRing = el('circle', {
    cx: C, cy: C, r: R_C + 16, fill: 'none',
    stroke: SECTIONS[0].tone, 'stroke-width': 1.2, opacity: 0.45,
  });
  const core = el('circle', {
    cx: C, cy: C, r: R_C, fill: SECTIONS[0].tone, opacity: 0.9,
  });
  svg.appendChild(pulseRing);
  svg.appendChild(core);

  /* ---- 鼓钉：一圈小点，给"这是一面手鼓"的暗示 ---- */
  for (let i = 0; i < 24; i++) {
    const a = i * 15 * Math.PI / 180;
    const r = R_RIM - 12;
    svg.appendChild(el('circle', {
      cx: C + r * Math.cos(a), cy: C + r * Math.sin(a), r: 1.6,
      fill: 'rgba(222,214,200,0.16)',
    }));
  }

  host.appendChild(svg);

  /* ------------------------------------------------------------ 状态与时钟 */
  let section = 0;
  let nextBeat = 0;          // 下一次敲击的时刻（performance.now() 基准）
  let lastNow = 0;
  let rippleSeed = 0;
  let running = false;
  let raf = 0;

  function setSection(i) {
    const n = Math.max(0, Math.min(2, i | 0));
    if (n === section) return;
    section = n;
    const s = SECTIONS[n];
    core.setAttribute('fill', s.tone);
    pulseRing.setAttribute('stroke', s.tone);
    rings.forEach((r, k) => r.setAttribute('opacity', k === n ? 0.9 : 0.14));
  }
  // 初始就把第 0 段的圈点亮
  rings.forEach((r, k) => r.setAttribute('opacity', k === 0 ? 0.9 : 0.14));

  /** 敲一下：鼓心弹一下 + 荡出一圈涟漪 */
  function strike(now) {
    const s = SECTIONS[section];
    // 中心：缩一下再回去（用 CSS 类触发动画比重画 SVG 便宜）
    core.classList.remove('is-hit');
    void core.getBoundingClientRect();
    core.classList.add('is-hit');

    const r = ripples[rippleSeed % ripples.length];
    rippleSeed++;
    r.t = now;
    r.node.setAttribute('stroke', s.tone);
  }

  function frame(now) {
    raf = requestAnimationFrame(frame);
    const dt = Math.min(0.05, (now - lastNow) / 1000 || 0);
    lastNow = now;

    if (running && now >= nextBeat) {
      strike(now);
      const s = SECTIONS[section];
      nextBeat = now + (60000 / s.bpm / s.div);   // 与音序器同一算法
    }

    // 推涟漪
    /* 寿命要**短于敲击间隔**，否则几条同时挂在屏幕上，
       叠成一圈圈同心圆 —— 看着像靶子，不像在敲（踩过）。
       152 bpm 时间隔约 0.39 秒，所以寿命取 0.85 秒 + 两条轮流，
       最多同时一条多一点，能看清"一圈荡出去、下一圈才开始"。 */
    for (const r of ripples) {
      if (r.t < 0) continue;
      const age = (now - r.t) / 1000;
      const dur = 0.85;
      if (age > dur) { r.node.setAttribute('opacity', 0); r.t = -1; continue; }
      const p = age / dur;
      r.node.setAttribute('r', String(R_C + p * (R_SKIN - R_C - 20)));
      /* 涟漪要**立刻能看见**：正弦曲线起手太慢（p=0.2 时才 0.16），
         看着像"切段了但没在敲"。改成起手就亮，再衰减。 */
      r.node.setAttribute('opacity', String(Math.min(1, p * 6) * (1 - p) * 0.42));
    }
  }

  /* 段号由页面**直接调用** setSection 传进来（见 home.js 的 renderBandState）。
     原来这里自己观察 body[data-stage]：MutationObserver 是微任务，
     比页面状态慢一拍，表现是"文字已经到叙事了、鼓还停在苍劲"（踩过）。
     直接调用没有这个延迟，也少一个监听器要维护。 */

  if (reduced) {
    // 减弱动效：画一个静止的鼓，不敲
    running = false;
  } else {
    running = true;
    lastNow = performance.now();
    nextBeat = lastNow + 300;
    raf = requestAnimationFrame(frame);
  }

  return {
    section: () => section,
    setSection,
    start: () => { running = true; nextBeat = performance.now() + 100; },
    stop: () => { running = false; },
    /* 自检用 */
    state: () => ({ section, running, ripples: ripples.filter((r) => r.t >= 0).length }),
    el: svg,
  };
}
