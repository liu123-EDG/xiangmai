/* ==========================================================================
   弦脉 · 师承网络
   --------------------------------------------------------------------------
   口传心授没有总谱，只有交接。这一层把"师承"做成可操作的图：
   点一位木卡姆其 → 展开他的传承支系 → 点第二个点 → 画出一条线。
   线的两端是"谁把哪一段，交给了谁"。

   作为模块导出 initNetwork()，由页面在启动时挂上；
   打开动作走 window 上的 xiangmai:network-open 事件，页面不用知道内部细节。
   ========================================================================== */
  /* ------------------------------------------------------------ 师承数据 */
  /* 示意的师承关系取自公开的非遗代表性传承人资料；
     次级分支为结构示意，用来呈现"口传是一条链，不是一个点"。 */

  const LINEAGE = [
    {
      id: 'ysf-tuhty',
      name: '于苏甫·托合提',
      note: '莎车 · 古典演唱',
      step: 0.85,
      kids: ['阿不都热合曼', '吐尔逊·托合提', '阿依古丽·买买提', '赛买提·艾山', '热依汗古丽'],
    },
    {
      id: 'ame-han',
      name: '阿曼尼莎汗',
      note: '叶尔羌 · 16世纪',
      step: 0.6,
      kids: ['木卡姆文本整理', '宫廷乐师谱系', '喀迪尔汗', '十二套曲目定名'],
    },
    {
      id: 'turdi-ahong',
      name: '吐尔迪阿洪',
      note: '英吉沙 · 1951年录音',
      step: 0.95,
      kids: ['全套十二木卡姆演唱', '口传版本互校', '达斯坦长诗演唱', '麦西热甫套曲'],
    },
    {
      id: 'abdurexit',
      name: '阿不都热西提·托合提',
      note: '伊宁 · 北疆形态',
      step: 0.7,
      kids: ['伊犁木卡姆变体', '萨塔尔演奏法', '青年班社', '双人合乐'],
    },
    {
      id: 'rouzi-aimaiti',
      name: '肉孜·艾买提',
      note: '喀什 · 达斯坦',
      step: 0.8,
      kids: ['达斯坦长诗', '气口与拖腔', '茶馆说唱', '民间赛歌'],
    },
    {
      id: 'tursun-mamat',
      name: '吐尔逊·买买提',
      note: '和田 · 麦西热甫',
      step: 0.75,
      kids: ['鼓点加花', '舞蹈程式', '节庆班社', '少年学徒'],
    },
    {
      id: 'aqam-isa',
      name: '阿卜力克木·阿卜杜拉',
      note: '哈密 · 哈密木卡姆',
      step: 0.65,
      kids: ['哈密套曲', '方言唱腔', '乡村班社', '女性歌者'],
    },
    {
      id: 'dawut-ablet',
      name: '达吾提·阿不都热合曼',
      note: '刀郎 · 刀郎木卡姆',
      step: 0.72,
      kids: ['刀郎套曲', '高亢唱法', '手鼓群奏', '荒漠麦西热甫'],
    },
    {
      id: 'mahmud-satar',
      name: '买买提·托合提',
      note: '莎车 · 萨塔尔',
      step: 0.7,
      kids: ['萨塔尔弓法', '乐器制作', '师徒对弹', '合乐伴奏'],
    },
    {
      id: 'zulpiya',
      name: '祖丽菲亚·艾买提',
      note: '乌鲁木齐 · 学院传授',
      step: 0.55,
      kids: ['课堂记谱', '音像归档', '青年乐团', '跨地交流'],
    },
    {
      id: 'mushrap-team',
      name: '麦西热甫班社',
      note: '民间 · 集体传承',
      step: 0.5,
      kids: ['节庆流程', '围观入圈', '即兴应对', '代际轮换'],
    },
    {
      id: 'archive',
      name: '万桐书 · 记谱档案',
      note: '1951—1956 · 文本化',
      step: 0.4,
      kids: ['钢丝录音', '乐谱转写', '版本比勘', '后世教材'],
    },
  ];

/* ------------------------------------------------------------ 常量 */
const VB = { w: 900, h: 560 };
const SVGNS = 'http://www.w3.org/2000/svg';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const round1 = (v) => Math.round(v * 10) / 10;

/** 挂上师承网络。没有对应 DOM 的页面调用它也不会出事。 */
export function initNetwork() {
  const svg = document.getElementById('network-svg');
  const stepEl = document.getElementById('network-step');
  const closeBtn = document.getElementById('network-close');
  const panel = document.getElementById('network');
  if (!svg || !stepEl || !panel) return;

  /* ------------------------------------------------------------ 状态 */
  const nodes = new Map();     // id -> { data, el, cx, cy, kind, parentId }
  let sourceId = null;
  let built = false;
  let busy = false;
  const links = [];            // { a, b, el }

  /* ------------------------------------------------------------ 建图 */
  function el(tag, attrs) {
    const n = document.createElementNS(SVGNS, tag);
    for (const k in attrs) n.setAttribute(k, attrs[k]);
    return n;
  }

  function build() {
    if (built) return;
    built = true;
    svg.textContent = '';

    // 图层顺序：连线在下，节点在上
    const gLinks = el('g', { class: 'links' });
    const gNodes = el('g', { class: 'nodes' });
    svg.appendChild(gLinks);
    svg.appendChild(gNodes);

    // 主干：一条竖向的"传承时间线"，自 16 世纪到今天
    const gSpine = el('g', { class: 'spine' });
    svg.insertBefore(gSpine, gLinks);
    gSpine.appendChild(el('line', {
      x1: 150, y1: 46, x2: 150, y2: VB.h - 40,
      stroke: 'rgba(221,213,199,0.10)', 'stroke-width': 1,
    }));

    const n = LINEAGE.length;
    const pad = 46;
    const span = VB.h - pad * 2;

    LINEAGE.forEach((d, i) => {
      const cx = 150;
      const cy = pad + (span * i) / (n - 1);

      // 时间刻度：每 3 个一记，避免视觉噪音
      if (i % 3 === 0) {
        gSpine.appendChild(el('line', {
          x1: 142, y1: round1(cy), x2: 150, y2: round1(cy),
          stroke: 'rgba(221,213,199,0.22)', 'stroke-width': 1,
        }));
      }

      const root = makeNode(gNodes, {
        id: d.id, label: d.name, sub: d.note, kind: 'root', cx, cy,
      });
      root.data = d;

      // 支系：向右扇形展开
      const kids = d.kids || [];
      const m = kids.length;
      const spread = Math.min(96, 26 + m * 16);
      d._kids = kids.map((label, j) => {
        const t = m === 1 ? 0.5 : j / (m - 1);
        const kx = 470 + Math.sin(t * Math.PI) * 22 + (j % 2) * 14;
        const ky = clamp(cy + (t - 0.5) * spread, 18, VB.h - 18);
        const kid = makeNode(gNodes, {
          id: d.id + '::' + j, label, kind: 'satellite', cx: kx, cy: ky, parentId: d.id,
        });
        kid.data = { id: kid.id, name: label, note: d.name + ' 的支系', step: d.step - 0.08 };
        kid.el.classList.add('is-collapsed');
        return kid;
      });
    });
  }

  function makeNode(parent, o) {
    const r = o.kind === 'root' ? 5.5 : 3.2;
    const g = el('g', {
      class: 'node node--' + o.kind,
      'data-id': o.id,
      tabindex: '0',
      role: 'button',
      'aria-label': (o.kind === 'root' ? o.label + '，' + (o.sub || '') : o.label) + '，点击选择',
    });
    g.style.opacity = o.kind === 'root' ? '' : '0';

    g.appendChild(el('circle', { class: 'node__halo', cx: o.cx, cy: o.cy, r: r + 13 }));
    g.appendChild(el('circle', { class: 'node__ring', cx: o.cx, cy: o.cy, r: r + 7 }));
    g.appendChild(el('circle', { class: 'node__core', cx: o.cx, cy: o.cy, r }));

    const tx = o.cx - (r + 12);
    const t = el('text', {
      class: 'node__label' + (o.kind === 'root' ? ' node__label--root' : ''),
      x: round1(tx), y: round1(o.cy), 'text-anchor': 'end',
    });
    t.textContent = o.label;
    g.appendChild(t);

    if (o.kind === 'root' && o.sub) {
      const s = el('text', {
        class: 'node__sub', x: round1(tx), y: round1(o.cy + 14), 'text-anchor': 'end',
      });
      s.textContent = o.sub;
      g.appendChild(s);
    }

    // 卫星节点：标签放在点的下方，避免与扇形弧线打架
    if (o.kind === 'satellite') {
      const t2 = g.querySelector('text');
      t2.setAttribute('x', round1(o.cx));
      t2.setAttribute('y', round1(o.cy + 14));
      t2.setAttribute('text-anchor', 'middle');
    }

    g.addEventListener('click', (e) => { e.stopPropagation(); activate(o.id); });
    g.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); activate(o.id); }
    });

    parent.appendChild(g);
    const rec = { id: o.id, el: g, cx: o.cx, cy: o.cy, kind: o.kind, parentId: o.parentId, data: null };
    nodes.set(o.id, rec);
    return rec;
  }

  /* ------------------------------------------------------------ 交互 */
  function setStep(text) { stepEl.textContent = text; }

  function activate(id) {
    if (busy) return;
    const rec = nodes.get(id);
    if (!rec) return;

    // 未选源：卫星不可直接点，先选一位木卡姆其
    if (!sourceId) {
      if (rec.kind !== 'root') {
        setStep('先点左边的名字——从一位木卡姆其开始。');
        flash(rec.el);
        return;
      }
      sourceId = id;
      rec.el.classList.add('is-source');
      revealKids(rec);
      setStep('已选「' + (LINEAGE.find((d) => d.id === id) || {}).name + '」。再点他的一个支系，画出这条传承。');
      return;
    }

    // 已选源，点了另一个根：换源
    if (id === sourceId) {
      clearSource();
      setStep('已取消。重新点一位木卡姆其。');
      return;
    }
    if (rec.kind === 'root') {
      clearSource();
      sourceId = id;
      rec.el.classList.add('is-source');
      revealKids(rec);
      setStep('改选「' + (LINEAGE.find((d) => d.id === id) || {}).name + '」。再点他的一个支系。');
      return;
    }

    // 画线：源 → 支系
    drawLink(nodes.get(sourceId), rec);
  }

  function clearSource() {
    if (!sourceId) return;
    const prev = nodes.get(sourceId);
    if (prev) {
      prev.el.classList.remove('is-source');
      const d = LINEAGE.find((x) => x.id === sourceId);
      if (d && d._kids) d._kids.forEach((k) => k.el.classList.add('is-collapsed'));
    }
    sourceId = null;
  }

  async function revealKids(rec) {
    const d = LINEAGE.find((x) => x.id === rec.id);
    if (!d || !d._kids) return;
    busy = true;
    rec.el.classList.add('is-linked');
    for (const k of d._kids) {
      k.el.classList.remove('is-collapsed');
      k.el.style.transition = 'opacity .75s cubic-bezier(.22,.61,.36,1)';
      await sleep(70);
      k.el.style.opacity = '1';
    }
    busy = false;
  }

  function drawLink(a, b) {
    const key = a.id + '>' + b.id;
    if (links.some((l) => l.key === key)) {
      setStep('这条线已经画过了。再点别的支系，或者换一位木卡姆其。');
      return;
    }

    const mx = (a.cx + b.cx) / 2;
    const my = (a.cy + b.cy) / 2;
    const ctrlY = my + (b.cy - a.cy) * 0.06;
    const d = 'M ' + round1(a.cx) + ' ' + round1(a.cy) +
              ' Q ' + round1(mx) + ' ' + round1(ctrlY) +
              ' ' + round1(b.cx) + ' ' + round1(b.cy);
    const len = Math.hypot(b.cx - a.cx, b.cy - a.cy) * 1.08;

    const g = el('g', { class: 'link' });
    g.appendChild(el('path', { class: 'link__sleeve', d }));
    const p = el('path', { class: 'link__draw', d, style: '--len:' + round1(len) });
    g.appendChild(p);
    // 线的中点标注：这不是装饰，是关系说明
    const lbl = el('text', {
      class: 'link__label',
      x: round1(mx * 0.75 + b.cx * 0.25),
      y: round1(my + (b.cy - a.cy) * 0.03 - 7),
    });
    const rootName = (LINEAGE.find((x) => x.id === a.id) || {}).name || '';
    lbl.textContent = '传 · ' + rootName;
    g.appendChild(lbl);

    svg.querySelector('.links').appendChild(g);
    links.push({ key, a: a.id, b: b.id, el: g });

    b.el.classList.add('is-linked');
    a.el.classList.add('is-linked');

    setStep('已连线 ' + links.length + ' 条。换一位木卡姆其，继续接。');
    pulse(b.el);
  }

  function pulse(nodeEl) {
    nodeEl.animate(
      [{ opacity: 1 }, { opacity: 0.45 }, { opacity: 1 }],
      { duration: 620, easing: 'ease-out' }
    );
  }

  function flash(nodeEl) {
    nodeEl.animate(
      [{ transform: 'translateX(0)' }, { transform: 'translateX(3px)' }, { transform: 'translateX(0)' }],
      { duration: 320, easing: 'ease-out' }
    );
  }

  /* ------------------------------------------------------------ 开关 */
  function open() {
    panel.removeAttribute('hidden');
    build();
    panel.classList.add('is-open');
    // 首次打开：主干逐个浮出，像一列名字慢慢显影
    if (svg.dataset.entered !== '1') {
      svg.dataset.entered = '1';
      const roots = Array.from(svg.querySelectorAll('.node--root'));
      roots.forEach((r, i) => {
        r.style.transition = 'opacity 1.1s cubic-bezier(.22,.61,.36,1)';
        r.style.opacity = '0';
        setTimeout(() => { r.style.opacity = ''; }, 180 + i * 95);
      });
    }
    setStep(sourceId ? '接着上一条线，或者换一位木卡姆其。' : '先点一位木卡姆其。');
    closeBtn.focus({ preventScroll: true });
  }

  function close() {
    panel.classList.remove('is-open');
    window.dispatchEvent(new CustomEvent('xiangmai:network-close'));
  }

  closeBtn.addEventListener('click', close);
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && document.body.classList.contains('is-network')) close();
  });
  // 点击空白处 = 取消当前选择
  svg.addEventListener('click', () => {
    if (sourceId) { clearSource(); setStep('已取消。重新点一位木卡姆其。'); }
  });

  window.addEventListener('xiangmai:network-open', open);
}

export { LINEAGE };
