/* ==========================================================================
   弦脉 · 十二木卡姆轮盘
   --------------------------------------------------------------------------
   用十二点几何表示十二套木卡姆，而不是一个音符符号。

   理由不是审美偏好：十二木卡姆本身就是"十二个套曲循环"这件事，
   用十二等分的环形结构表示，是准确；而音符是外来记谱体系的符号，
   放在一个口传心授的传统上是文化逻辑错位。

   几何取自维吾尔木雕与花窗里常见的十二角星。十二个节点就是十二个入口。

   可访问性：每个节点是真正的 <a>，能 Tab、能回车、有 aria-label。
   ========================================================================== */

import { MUQAM, ringPos } from './muqam-data.js';

const SVGNS = 'http://www.w3.org/2000/svg';
const VB = 720;            // viewBox 边长
const CX = 360, CY = 360;
const R_NODE = 232;        // 节点半径
const R_RING = 196;        // 装饰环

const el = (tag, attrs) => {
  const n = document.createElementNS(SVGNS, tag);
  for (const k in attrs) n.setAttribute(k, attrs[k]);
  return n;
};

/**
 * 在容器里生成十二木卡姆轮盘。
 * @param {HTMLElement} host
 * @param {object} [opts]
 * @param {string} [opts.hrefBase='../muqam/'] 各分页面的路径前缀
 * @param {(id:string)=>void} [opts.onPick]    点击回调（不传则直接跳转）
 */
export function buildWheel(host, opts = {}) {
  if (!host) return null;
  const hrefBase = opts.hrefBase || '../muqam/';

  const svg = el('svg', {
    class: 'wheel',
    viewBox: `0 0 ${VB} ${VB}`,
    preserveAspectRatio: 'xMidYMid meet',
    role: 'list',
    'aria-label': '十二木卡姆，每一点对应一套，可进入对应页面',
  });

  /* ---- 底纹：三层同心环 + 十二角星 ---- */
  const deco = el('g', { class: 'wheel__deco', 'aria-hidden': 'true' });

  deco.appendChild(el('circle', { cx: CX, cy: CY, r: R_RING, class: 'wheel__ring' }));
  deco.appendChild(el('circle', { cx: CX, cy: CY, r: R_RING - 13, class: 'wheel__ring wheel__ring--thin' }));
  deco.appendChild(el('circle', { cx: CX, cy: CY, r: 58, class: 'wheel__ring wheel__ring--thin' }));

  // 十二角星：两组六角，交错叠成
  for (const rot of [0, 30]) {
    const pts = [];
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2 - Math.PI / 2 + (rot * Math.PI) / 180;
      pts.push((CX + Math.cos(a) * R_RING).toFixed(1) + ',' + (CY + Math.sin(a) * R_RING).toFixed(1));
    }
    deco.appendChild(el('polygon', { points: pts.join(' '), class: 'wheel__star' }));
  }

  // 十二根辐条
  for (let i = 0; i < MUQAM.length; i++) {
    const p1 = ringPos(i, CX, CY, 58);
    const p2 = ringPos(i, CX, CY, R_RING - 13);
    deco.appendChild(el('line', {
      x1: p1.x.toFixed(1), y1: p1.y.toFixed(1),
      x2: p2.x.toFixed(1), y2: p2.y.toFixed(1),
      class: 'wheel__spoke',
    }));
  }

  const rotating = el('g', { class: 'wheel__rotor' });
  rotating.appendChild(deco);
  svg.appendChild(rotating);

  /* ---- 中心：标题 ---- */
  const core = el('g', { class: 'wheel__core' });
  const t1 = el('text', { x: CX, y: CY - 6, class: 'wheel__core-num' });
  t1.textContent = '12';
  const t2 = el('text', { x: CX, y: CY + 24, class: 'wheel__core-label' });
  t2.textContent = '套木卡姆';
  core.appendChild(t1);
  core.appendChild(t2);
  svg.appendChild(core);

  /* ---- 十二个节点 ---- */
  const nodes = el('g', { class: 'wheel__nodes' });
  const items = [];

  MUQAM.forEach((m, i) => {
    const p = ringPos(i, CX, CY, R_NODE);
    const g = el('a', {
      class: 'wnode',
      href: hrefBase + m.id + '/index.html',
      role: 'listitem',
      'data-id': m.id,
      'aria-label': '第' + (i + 1) + '套 · ' + m.name + '（' + m.ug + '）· ' + m.region + ' · ' + m.char,
    });

    // 每个节点用自己的色相，来自它所属的那一段性格
    g.style.setProperty('--h', String(m.hue));

    g.appendChild(el('circle', { cx: p.x.toFixed(1), cy: p.y.toFixed(1), r: 22, class: 'wnode__halo' }));
    g.appendChild(el('circle', { cx: p.x.toFixed(1), cy: p.y.toFixed(1), r: 6, class: 'wnode__dot' }));

    // 编号：贴在圆心一侧
    const numA = ringPos(i, CX, CY, R_NODE - 34);
    const tnum = el('text', {
      x: numA.x.toFixed(1), y: numA.y.toFixed(1), class: 'wnode__num',
    });
    tnum.textContent = String(i + 1).padStart(2, '0');
    g.appendChild(tnum);

    // 名称：贴在圆外一侧，沿半径向外排
    const outA = ringPos(i, CX, CY, R_NODE + 34);
    const tname = el('text', {
      x: outA.x.toFixed(1), y: outA.y.toFixed(1), class: 'wnode__name',
      'text-anchor': Math.abs(outA.x - CX) < 30 ? 'middle' : (outA.x > CX ? 'start' : 'end'),
    });
    tname.textContent = m.name;
    g.appendChild(tname);

    const tug = el('text', {
      x: outA.x.toFixed(1), y: (outA.y + 19).toFixed(1), class: 'wnode__ug',
      'text-anchor': Math.abs(outA.x - CX) < 30 ? 'middle' : (outA.x > CX ? 'start' : 'end'),
    });
    tug.textContent = m.ug;
    g.appendChild(tug);

    g.addEventListener('click', (e) => {
      if (!opts.onPick) return;      // 没给回调就让它正常跳转
      e.preventDefault();
      opts.onPick(m.id);
    });
    // 悬停/聚焦时把信息推给外部（右下角的读数）
    const report = () => { if (opts.onHover) opts.onHover(m, i); };
    g.addEventListener('mouseenter', report);
    g.addEventListener('focus', report);

    nodes.appendChild(g);
    items.push({ data: m, el: g, x: p.x, y: p.y });
  });

  svg.appendChild(nodes);
  host.appendChild(svg);

  return { svg, items, rotating };
}

/* ==========================================================================
   配合滚动的入场：轮盘随滚动进度慢慢转、慢慢亮
   ========================================================================== */
export function bindWheelScroll(section, wheel, reduced) {
  if (!wheel || reduced) return () => {};
  let ticking = false;
  const update = () => {
    ticking = false;
    const r = section.getBoundingClientRect();
    const vh = window.innerHeight;
    // 0 = 刚进视口，1 = 完全离开上方
    const p = Math.min(1, Math.max(0, (vh - r.top) / (vh + r.height)));

    // 转动：整段滚动过程中转约 24 度，慢到"几乎察觉不到但在动"
    wheel.rotating.style.transform = 'rotate(' + (p * 24 - 12).toFixed(2) + 'deg)';
    wheel.rotating.style.transformOrigin = '50% 50%';

    // 亮度：进入视口中央时最亮
    const focus = 1 - Math.abs(p - 0.5) * 1.5;
    wheel.svg.style.setProperty('--wheel-focus', Math.max(0.25, focus).toFixed(3));
  };
  const onScroll = () => {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(update);
  };
  window.addEventListener('scroll', onScroll, { passive: true });
  window.addEventListener('resize', onScroll, { passive: true });
  update();
  return () => {
    window.removeEventListener('scroll', onScroll);
    window.removeEventListener('resize', onScroll);
  };
}
