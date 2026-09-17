/* ==========================================================================
   弦脉 · 麦西热甫圆圈
   --------------------------------------------------------------------------
   第四章的互动。麦西热甫最核心的动作是"下场跳"——所以这里不让你敲鼓，
   让你**往里加人**：

     点一下 → 圈里多一个人 → 鼓点密一层 → 纹样亮一分

   为什么这样做：麦西热甫讲的不是个人技巧，是群体。一个人敲鼓是练习，
   一圈人一起才是麦西热甫。所以互动的单位是"人"，不是"鼓点"。

   音频：每加一个人，就多打开一层伴奏（由手鼓音序器实时合成），
         圈满时各层全开，节奏型也换成最密的那个。
   ========================================================================== */

const SVGNS = 'http://www.w3.org/2000/svg';
const el = (tag, attrs) => {
  const n = document.createElementNS(SVGNS, tag);
  for (const k in attrs) n.setAttribute(k, attrs[k]);
  return n;
};

/** 圈子最多容纳多少人 */
const MAX = 24;

/**
 * @param {object} opts
 * @param {HTMLElement} opts.host      容器
 * @param {(n:number)=>void} [opts.onChange]  人数变化时回调（拿去驱动纹样与音频）
 * @param {boolean} [opts.reduced]
 */
export function buildCircle(opts) {
  const { host } = opts;
  if (!host) return null;
  const reducedMotion = !!opts.reduced;

  const VB = 560;
  const CX = VB / 2, CY = VB / 2;
  const R_RING = 196;        // 圈的地面
  const R_PERSON = 132;      // 人站的位置

  const svg = el('svg', {
    class: 'mq', viewBox: `0 0 ${VB} ${VB}`,
    preserveAspectRatio: 'xMidYMid meet',
    role: 'group',
    'aria-label': '麦西热甫圆圈：点一下往圈里加一个人',
  });

  /* ---- 地面：一圈一圈的同心环，像踩出来的场子 ---- */
  const floor = el('g', { class: 'mq__floor', 'aria-hidden': 'true' });
  [R_RING, R_RING - 22, R_RING - 46, R_PERSON].forEach((r, i) => {
    floor.appendChild(el('circle', { cx: CX, cy: CY, r, class: 'mq__ring mq__ring--' + i }));
  });
  // 放射状的短刻线：像地毯的边饰
  for (let i = 0; i < 48; i++) {
    const a = (i / 48) * Math.PI * 2;
    const r1 = R_RING - 46, r2 = R_RING - 54 + (i % 2 ? 0 : 6);
    floor.appendChild(el('line', {
      x1: CX + Math.cos(a) * r1, y1: CY + Math.sin(a) * r1,
      x2: CX + Math.cos(a) * r2, y2: CY + Math.sin(a) * r2,
      class: 'mq__tick',
    }));
  }
  svg.appendChild(floor);

  /* ---- 庆祝层：满圈时炸开的一次性效果 ----
       分三层：冲击波环、飞散光点、中心闪光。
       平时 opacity 为 0，满圈时触发一次。 */
  const fxDefs = el('defs');
  const fxGlow = el('radialGradient', { id: 'mqGlow' });
  fxGlow.appendChild(el('stop', { offset: '0', 'stop-color': '#ffeec2', 'stop-opacity': '0.9' }));
  fxGlow.appendChild(el('stop', { offset: '0.5', 'stop-color': '#e8c98f', 'stop-opacity': '0.35' }));
  fxGlow.appendChild(el('stop', { offset: '1', 'stop-color': '#c08a3e', 'stop-opacity': '0' }));
  fxDefs.appendChild(fxGlow);
  svg.appendChild(fxDefs);

  const fx = el('g', { class: 'mq__fx', 'aria-hidden': 'true' });
  const flash = el('circle', { cx: CX, cy: CY, r: R_RING + 40, fill: 'url(#mqGlow)', class: 'mq__flash' });
  fx.appendChild(flash);
  const waves = [];
  for (let i = 0; i < 3; i++) {
    const w = el('circle', { cx: CX, cy: CY, r: R_RING, class: 'mq__wave', 'data-i': String(i) });
    fx.appendChild(w);
    waves.push(w);
  }
  const sparks = el('g', { class: 'mq__sparks' });
  const sparkNodes = [];
  for (let i = 0; i < 36; i++) {
    const a = (i / 36) * Math.PI * 2 + (i % 2 ? 0.08 : 0);
    const r0 = R_RING + 6;
    const s = el('circle', {
      cx: CX + Math.cos(a) * r0, cy: CY + Math.sin(a) * r0,
      r: 2 + (i % 3) * 0.9, class: 'mq__spark',
    });
    s.dataset.a = String(a);
    s.dataset.v = String(0.7 + (i % 5) * 0.14);
    sparks.appendChild(s);
    sparkNodes.push(s);
  }
  fx.appendChild(sparks);
  svg.appendChild(fx);

  /* ---- 跳动的环：人越多转得越快、越亮 ---- */
  const pulse = el('circle', { cx: CX, cy: CY, r: R_PERSON, class: 'mq__pulse' });
  svg.appendChild(pulse);

  /* ---- 人 ---- */
  const people = el('g', { class: 'mq__people' });
  svg.appendChild(people);

  /* ---- 中心读数 ---- */
  const core = el('g', { class: 'mq__core' });
  const num = el('text', { x: CX, y: CY + 4, class: 'mq__count' });
  num.textContent = '0';
  const cap = el('text', { x: CX, y: CY + 34, class: 'mq__cap' });
  cap.textContent = '点一下，进圈';
  core.appendChild(num); core.appendChild(cap);
  svg.appendChild(core);

  /* ---- 命中区：整块可点 ---- */
  const hit = el('rect', {
    x: 0, y: 0, width: VB, height: VB, class: 'mq__hit',
  });
  hit.setAttribute('tabindex', '0');
  hit.setAttribute('role', 'button');
  hit.setAttribute('aria-label', '往麦西热甫圆圈里加一个人');
  svg.appendChild(hit);

  host.appendChild(svg);

  let count = 0;
  const nodes = [];
  let burst = 0;              // >0 表示庆祝动画进行中（0..1 的进度）

  /** 满圈庆祝：环炸开 + 光点飞散 + 中心闪一下 + 所有人跳起来 */
  const startBurst = () => { if (reducedMotion) return; burst = 0.0001; };

  /** 每帧推进庆祝动画 */
  const tickBurst = (dt) => {
    if (burst <= 0) return;
    burst += dt / 2800;                       // 2.8 秒走完 —— 要让人看清这一下
    const p = Math.min(1, burst);

    // 闪光：前 25% 就收掉，只留"一下"
    flash.setAttribute('opacity', String(Math.max(0, 1 - p * 3.4)));
    flash.setAttribute('r', String(R_RING + 40 + Math.min(1, p * 2.4) * 190));

    // 三层冲击波，错开出发
    waves.forEach((w, i) => {
      const wp = Math.max(0, Math.min(1, (p - i * 0.10) / 0.80));
      w.setAttribute('r', String(R_RING + wp * (170 + i * 62)));
      w.setAttribute('opacity', String(wp > 0 && wp < 1 ? Math.sin(wp * Math.PI) * 0.9 : 0));
    });

    // 光点飞散
    sparkNodes.forEach((s) => {
      const a = parseFloat(s.dataset.a);
      const v = parseFloat(s.dataset.v);
      const dist = R_RING + 6 + p * 250 * v;
      s.setAttribute('cx', (CX + Math.cos(a) * dist).toFixed(1));
      s.setAttribute('cy', (CY + Math.sin(a) * dist).toFixed(1));
      s.setAttribute('opacity', String(Math.max(0, Math.sin(Math.min(1, p * 1.15) * Math.PI))));
    });

    // 人浪：错开相位地跳，越到后面越平复
    nodes.forEach((g, i) => {
      const phase = (i / Math.max(1, nodes.length)) * Math.PI * 2;
      const decay = Math.max(0, 1 - p * 1.1);
      const hop = Math.max(0, Math.sin(p * Math.PI * 5 + phase)) * decay * 11;
      g.style.setProperty('--hop', hop.toFixed(2) + 'px');
    });

    if (p >= 1) {
      nodes.forEach((g) => g.style.setProperty('--hop', '0px'));
      burst = 0;
    }
  };

  /** 人的位置：按人数均匀分布，并整体缓慢旋转（像真的在绕圈） */
  const layout = () => {
    nodes.forEach((g, i) => {
      const a = (i / MAX) * Math.PI * 2 - Math.PI / 2;
      const r = R_PERSON + (i % 3) * 7 - 7;
      g.dataset.a = String(a);
      g.dataset.r = String(r);
    });
  };

  const add = () => {
    if (count >= MAX) return false;
    const i = count;
    const g = el('g', { class: 'mq__person' });
    // 一个人 = 一个头 + 一个身体（拉长的水滴），简化到不能再简
    g.appendChild(el('circle', { cx: 0, cy: -13, r: 6.4, class: 'mq__head' }));
    g.appendChild(el('path', {
      d: 'M 0 -6 C 7 -6, 9 4, 8 15 L -8 15 C -9 4, -7 -6, 0 -6 Z',
      class: 'mq__body',
    }));
    // 手臂：跳起来是抬着的
    g.appendChild(el('line', { x1: -7, y1: -1, x2: -14, y2: -9, class: 'mq__arm' }));
    g.appendChild(el('line', { x1: 7, y1: -1, x2: 14, y2: -9, class: 'mq__arm' }));
    g.style.setProperty('--h', String((i * 37) % 360));
    // 入场：从中心弹出来
    g.style.setProperty('--in', '0');
    people.appendChild(g);

    nodes.push(g);
    count = i + 1;
    layout();
    place();

    // 入场动画：下一帧把 --in 推到 1
    requestAnimationFrame(() => {
      g.style.setProperty('--in', '1');
      g.classList.add('is-in');
    });

    sync();
    // 满圈：触发庆祝
    if (count >= MAX && opts.onFull) opts.onFull();
    if (count >= MAX) startBurst();
    return true;
  };

  const reset = () => {
    nodes.forEach((g) => g.remove());
    nodes.length = 0;
    count = 0;
    sync();
  };

  /** 按存下来的角度/半径摆放，并叠一个整体的慢转 */
  let spin = 0;
  const place = () => {
    nodes.forEach((g) => {
      const a = parseFloat(g.dataset.a) + spin;
      const r = parseFloat(g.dataset.r);
      const x = CX + Math.cos(a) * r;
      const y = CY + Math.sin(a) * r;
      // 站在圈上的人，脚朝圆心
      const rot = (a * 180) / Math.PI + 90;
      // 庆祝时整体往上跳一下（--hop 由 tickBurst 写入）
      g.setAttribute('transform',
        'translate(' + x.toFixed(1) + ' ' + y.toFixed(1) + ') rotate(' + rot.toFixed(1) + ')' +
        ' translate(0 ' + (g.style.getPropertyValue('--hop') || '0px') + ')');
    });
  };

  const sync = () => {
    num.textContent = String(count);
    cap.textContent = count === 0 ? '点一下，进圈'
      : count >= MAX ? '圈满了' : '再点一下';
    svg.style.setProperty('--mq-heat', (count / MAX).toFixed(3));
    if (opts.onChange) opts.onChange(count, MAX);
  };

  hit.addEventListener('click', () => { if (!add()) reset(); });
  hit.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      if (!add()) reset();
    }
  });

  /* 缓慢自转：让圈看起来是活的。切后台停。 */
  let raf = 0;
  let last = performance.now();
  const loop = (now) => {
    raf = requestAnimationFrame(loop);
    const dt = now - last; last = now;
    // 22 个人以上转得快一点（热闹起来了）
    spin += dt * 0.00004 * (1 + count / MAX);
    place();
    tickBurst(dt);          // 庆祝动画也在这个循环里推进
  };
  if (!opts.reduced) {
    raf = requestAnimationFrame(loop);
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) { cancelAnimationFrame(raf); raf = 0; }
      else if (!raf) { last = performance.now(); raf = requestAnimationFrame(loop); }
    });
  } else {
    // 减弱动效：不做炸开（startBurst 里已有 reducedMotion 守卫）
  }

  sync();

  return {
    add, reset,
    celebrate: startBurst,
    get count() { return count; },
    get max() { return MAX; },
    destroy() { if (raf) cancelAnimationFrame(raf); },
  };
}
