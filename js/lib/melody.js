/* ==========================================================================
   弦脉 · 旋律入口图
   --------------------------------------------------------------------------
   一串旋律的形状，八个民族的音乐非遗各占一个音。

   画法直接采用乐谱语言：五线谱、音符头、符干、高音谱号。
   音符的位置就是它的音高 —— 所以这张图既是导航，也是一条真正读得出来的旋律线。

   交互：
     · 每个音符是一个 <a>，能点、能 Tab、能新标签打开
     · 悬停/聚焦：音符亮起，下方读数显示那一项的说明
     · 随滚动：旋律线被"吹奏"出来，一个游标沿曲线前进
   ========================================================================== */

import { HERITAGE, heritageHref } from './heritage-data.js';

const SVGNS = 'http://www.w3.org/2000/svg';
const VB = { w: 1160, h: 380 };

/* 五线谱几何：线距 15，五条线 */
const STAFF = { x0: 74, x1: 1110, gap: 15, top: 120 };
STAFF.bottom = STAFF.top + STAFF.gap * 4;           // 下加一线位置（pitch = 1）

/* 音符横向起点 */
const NOTE_X0 = 232;
const NOTE_DX = 118;
const HEAD_RX = 11.5;
const HEAD_RY = 8.4;

const el = (tag, attrs) => {
  const n = document.createElementNS(SVGNS, tag);
  for (const k in attrs) n.setAttribute(k, attrs[k]);
  return n;
};

/** pitch → y。1 在下加一线，每加 1 上升半格（半个线距） */
const pitchY = (pitch) => STAFF.bottom - (pitch - 1) * (STAFF.gap / 2);

/**
 * Catmull-Rom → 三次贝塞尔，把节点连成平滑旋律线
 */
function smoothPath(pts) {
  if (pts.length < 2) return '';
  let d = 'M ' + pts[0].x.toFixed(1) + ' ' + pts[0].y.toFixed(1);
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] || pts[i];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = pts[i + 2] || p2;
    const c1x = p1.x + (p2.x - p0.x) / 6;
    const c1y = p1.y + (p2.y - p0.y) / 6;
    const c2x = p2.x - (p3.x - p1.x) / 6;
    const c2y = p2.y - (p3.y - p1.y) / 6;
    d += ' C ' + c1x.toFixed(1) + ' ' + c1y.toFixed(1) +
         ', ' + c2x.toFixed(1) + ' ' + c2y.toFixed(1) +
         ', ' + p2.x.toFixed(1) + ' ' + p2.y.toFixed(1);
  }
  return d;
}

/**
 * 生成旋律入口图。
 * @param {HTMLElement} host
 * @param {object} [opts]
 * @param {(m:object,i:number)=>void} [opts.onHover]
 * @param {(id:string)=>void} [opts.onPick]  不传则直接跳转
 */
export function buildMelody(host, opts = {}) {
  if (!host) return null;

  const svg = el('svg', {
    class: 'melody',
    viewBox: `0 0 ${VB.w} ${VB.h}`,
    preserveAspectRatio: 'xMidYMid meet',
    role: 'list',
    'aria-label': '旋律入口：八个民族的音乐类非物质文化遗产，每个音符是一个入口',
  });

  /* ---- defs：旋律线的渐变（从起点到终点，暗示"被吹奏"的方向） ---- */
  const defs = el('defs');
  const grad = el('linearGradient', { id: 'melodyGrad', x1: '0', y1: '0', x2: '1', y2: '0' });
  [['0%', '#c08a3e'], ['38%', '#e0b070'], ['72%', '#8fb0a4'], ['100%', '#6f9c8d']].forEach(([off, col]) => {
    grad.appendChild(el('stop', { offset: off, 'stop-color': col }));
  });
  defs.appendChild(grad);
  svg.appendChild(defs);

  /* ---- 五线谱 ---- */
  const staff = el('g', { class: 'melody__staff', 'aria-hidden': 'true' });
  for (let i = 0; i < 5; i++) {
    const y = STAFF.top + i * STAFF.gap;
    staff.appendChild(el('line', {
      x1: STAFF.x0, y1: y, x2: STAFF.x1, y2: y, class: 'melody__line',
    }));
  }
  svg.appendChild(staff);

  /* ---- 高音谱号：手绘路径，避免依赖字体 ---- */
  const clef = el('path', {
    class: 'melody__clef',
    'aria-hidden': 'true',
    d: 'M 108 176 C 96 168 90 156 94 146 C 98 136 110 132 118 138 ' +
       'C 128 145 128 158 120 168 C 110 180 96 192 88 206 ' +
       'C 78 224 80 244 94 254 C 108 264 126 258 132 244 ' +
       'C 138 230 130 216 116 214 C 104 212 96 220 96 230',
  });
  svg.appendChild(clef);

  /* ---- 拍号 ---- */
  const ts = el('g', { class: 'melody__timesig', 'aria-hidden': 'true' });
  const t1 = el('text', { x: 152, y: STAFF.top + 21 });
  t1.textContent = '4';
  const t2 = el('text', { x: 152, y: STAFF.top + 51 });
  t2.textContent = '4';
  ts.appendChild(t1); ts.appendChild(t2);
  svg.appendChild(ts);

  /* ---- 节点坐标 ---- */
  const pts = HERITAGE.map((m, i) => ({
    x: NOTE_X0 + i * NOTE_DX,
    y: pitchY(m.pitch),
    m, i,
  }));

  /* ---- 旋律线 ---- */
  const dPath = smoothPath(pts);
  const pathSleeve = el('path', { class: 'melody__sleeve', d: dPath, 'aria-hidden': 'true' });
  const pathLine = el('path', { class: 'melody__curve', d: dPath, 'aria-hidden': 'true' });
  svg.appendChild(pathSleeve);
  svg.appendChild(pathLine);

  const totalLen = pathLine.getTotalLength ? pathLine.getTotalLength() : 1200;

  /* ---- 游标：随滚动沿曲线前进 ---- */
  const playhead = el('g', { class: 'melody__playhead', 'aria-hidden': 'true' });
  playhead.appendChild(el('circle', { r: 13, class: 'melody__pulse' }));
  playhead.appendChild(el('circle', { r: 4.2, class: 'melody__dot' }));
  svg.appendChild(playhead);

  /* ---- 八个音符 ---- */
  const nodes = el('g', { class: 'melody__notes' });
  const items = [];

  pts.forEach((p) => {
    const m = p.m;
    const g = el('a', {
      class: 'mnote',
      href: heritageHref(m.id),
      role: 'listitem',
      'data-id': m.id,
      'aria-label': m.name + '（' + m.group + ' · ' + m.kind + '）· ' + m.region + '，进入分页面',
    });
    g.style.setProperty('--h', String(m.hue));

    // 命中区：比音符本身大，方便点
    g.appendChild(el('rect', {
      x: p.x - NOTE_DX / 2 + 8, y: STAFF.top - 46,
      width: NOTE_DX - 16, height: STAFF.gap * 4 + 92,
      class: 'mnote__hit',
    }));

    // 符干 + 符尾（做成八分音符，看起来才是"旋律"而不是一排豆子）
    g.appendChild(el('line', {
      x1: p.x + HEAD_RX - 1.5, y1: p.y - 2,
      x2: p.x + HEAD_RX - 1.5, y2: p.y - 52,
      class: 'mnote__stem',
    }));
    g.appendChild(el('path', {
      d: 'M ' + (p.x + HEAD_RX - 1.5) + ' ' + (p.y - 52) +
         ' c 13 5, 21 13, 20 25 c 3 -15, -6 -25, -20 -30 z',
      class: 'mnote__flag',
    }));

    // 音符头：椭圆稍作旋转，像真的谱面
    g.appendChild(el('ellipse', {
      cx: p.x, cy: p.y, rx: HEAD_RX, ry: HEAD_RY,
      transform: 'rotate(-20 ' + p.x + ' ' + p.y + ')',
      class: 'mnote__head',
    }));

    // 内芯亮点：悬停时亮起，像被按下的音
    g.appendChild(el('circle', { cx: p.x, cy: p.y, r: 2.4, class: 'mnote__core' }));

    // 名称：谱表下方
    const tx = p.x;
    const nm = el('text', { x: tx, y: VB.h - 68, class: 'mnote__name' });
    nm.textContent = m.name;
    const gp = el('text', { x: tx, y: VB.h - 44, class: 'mnote__group' });
    gp.textContent = m.group;
    const kd = el('text', { x: tx, y: VB.h - 22, class: 'mnote__kind' });
    kd.textContent = m.kind;
    g.appendChild(nm); g.appendChild(gp); g.appendChild(kd);

    g.addEventListener('click', (e) => {
      if (!opts.onPick) return;
      e.preventDefault();
      opts.onPick(m.id);
    });
    const report = () => { if (opts.onHover) opts.onHover(m, p.i); };
    g.addEventListener('mouseenter', report);
    g.addEventListener('focus', report);

    nodes.appendChild(g);
    items.push({ data: m, el: g, x: p.x, y: p.y });
  });

  svg.appendChild(nodes);
  host.appendChild(svg);

  return { svg, items, pathLine, playhead, totalLen };
}

/**
 * 随滚动"吹奏"这条旋律：线被画出来，游标沿曲线前进。
 * @param {HTMLElement} section
 * @param {object} melody  buildMelody 的返回值
 * @param {boolean} reduced
 */
export function bindMelodyScroll(section, melody, reduced) {
  if (!melody || reduced) {
    // 减弱动效：直接给完整曲线，不做逐段显示
    melody.pathLine.style.strokeDasharray = 'none';
    melody.playhead.style.opacity = '0';
    return () => {};
  }

  const { pathLine, playhead, totalLen } = melody;
  playhead.style.opacity = '0';
  let ticking = false;

  const update = () => {
    ticking = false;
    const r = section.getBoundingClientRect();
    const vh = window.innerHeight;
    // 0 = 刚进视口底部，1 = 完全离开上方
    const raw = (vh - r.top) / (vh + r.height);
    const p = Math.min(1, Math.max(0, raw));
    // 在进入视口中央之前就把旋律吹完，别等滚出去
    const play = Math.min(1, Math.max(0, (p - 0.12) / 0.56));

    pathLine.style.strokeDasharray = totalLen + ' ' + totalLen;
    pathLine.style.strokeDashoffset = (totalLen * (1 - play)).toFixed(1);

    if (playhead.getTotalLength) {
      const pt = pathLine.getPointAtLength(totalLen * play);
      playhead.setAttribute('transform', 'translate(' + pt.x.toFixed(1) + ' ' + pt.y.toFixed(1) + ')');
    }
    playhead.style.opacity = play > 0.01 && play < 0.995 ? '1' : (play >= 0.995 ? '0.35' : '0');
    melody.svg.style.setProperty('--melody-play', play.toFixed(3));
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
