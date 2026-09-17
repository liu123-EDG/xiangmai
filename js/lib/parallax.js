/* ==========================================================================
   弦脉 · 滚动视差场景
   --------------------------------------------------------------------------
   把一张图按深度切成若干层，滚动时每层以不同速度位移，产生纵深。
   层文件由 tools/depth.py + tools/slice.py 生成。

   一个"场景组"可以有好几个场景（比如每三分之一换一个）：
   滚动进度决定当前是哪个场景，场景之间用透明度交叉淡化。

   实现要点：
     · 层全部 position:fixed 铺满视口，图片 object-fit:cover
     · 位移用 transform: translate3d，交给合成器，不触发重排
     · 场景切换只动 opacity，不做 display 切换（否则会闪）
     · 换层位移用 rAF 节流，滚动时不写样式以外的任何东西
   ========================================================================== */

/**
 * @param {object} opts
 * @param {HTMLElement} opts.host       容器（占位，实际层是 fixed 的）
 * @param {Array} opts.scenes           场景数组，每项 { layers:[{file,shift}], base }
 * @param {HTMLElement} opts.anchor     进度参照元素（一般传一个很长的 section）
 * @param {number} [opts.maxShift]      最大位移像素（默认 90）
 * @param {number} [opts.vh]            一个场景占几屏滚动（默认 1.2）
 * @param {boolean} [opts.reduced]      减弱动效
 */
export function buildParallax(opts) {
  const { host, scenes, anchor } = opts;
  if (!host || !scenes || !scenes.length) return null;

  const maxShift = opts.maxShift === undefined ? 90 : opts.maxShift;
  const reduced = !!opts.reduced;

  host.classList.add('px');
  host.innerHTML = '';

  const groups = scenes.map((sc, si) => {
    const g = document.createElement('div');
    g.className = 'px__scene';
    g.dataset.scene = String(si);
    // 第一个场景先可见，其余等滚动决定
    g.style.opacity = si === 0 ? '1' : '0';
    const layerEls = [];
    (sc.layers || []).forEach((L) => {
      const img = document.createElement('img');
      img.className = 'px__layer';
      img.src = sc.base + L.file;
      img.alt = '';
      img.decoding = 'async';
      img.loading = si === 0 ? 'eager' : 'lazy';
      // 该层的位移倍数：slice.py 算好的 shift
      img.dataset.shift = String(L.shift === undefined ? 0.5 : L.shift);
      g.appendChild(img);
      layerEls.push(img);
    });
    if (sc.tint) g.style.setProperty('--px-tint', sc.tint);
    host.appendChild(g);
    return { el: g, layerEls };
  });

  let ticking = false;

  const update = () => {
    ticking = false;
    const r = anchor.getBoundingClientRect();
    const vh = window.innerHeight;
    // 0 = 区块顶部刚碰到视口底部；1 = 区块底部离开视口顶部
    const raw = (vh - r.top) / (vh + r.height);
    const p = Math.min(1, Math.max(0, raw));

    // 当前场景：把总进度切成 scenes.length 段
    const n = groups.length;
    const pos = p * n;                 // 连续位置
    const cur = Math.min(n - 1, Math.floor(pos));

    groups.forEach((G, i) => {
      // 交叉淡化：场景在自己的区段里全亮，边缘 12% 内过渡
      const local = pos - i;           // 0..1 表示正在这个场景内
      let a;
      if (local < -0.12 || local > 1.12) a = 0;
      else if (local < 0.12) a = (local + 0.12) / 0.24;
      else if (local > 0.88) a = Math.max(0, (1.12 - local) / 0.24);
      else a = 1;
      G.el.style.opacity = reduced ? (i === cur ? '1' : '0') : a.toFixed(3);
    });

    if (reduced) return;

    // 位移：以当前场景内的局部进度为准，避免切场景时跳一下
    const local = Math.min(1, Math.max(0, pos - cur));
    groups.forEach((G, i) => {
      if (i !== cur && Math.abs(pos - i) > 1) return;   // 完全不在视野里的场景不动
      G.layerEls.forEach((img) => {
        const k = parseFloat(img.dataset.shift) || 0.5;
        // 近层往上走得快，远层慢 —— 加一点横向，避免直线运动太机械
        const dy = -local * maxShift * k;
        const dx = Math.sin(local * Math.PI) * maxShift * k * 0.16;
        img.style.transform = 'translate3d(' + dx.toFixed(2) + 'px,' + dy.toFixed(2) + 'px,0)';
      });
    });

    host.style.setProperty('--px-progress', p.toFixed(4));
  };

  const onScroll = () => {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(update);
  };

  window.addEventListener('scroll', onScroll, { passive: true });
  window.addEventListener('resize', onScroll, { passive: true });
  update();

  return {
    groups,
    update,
    destroy() {
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
    },
  };
}
