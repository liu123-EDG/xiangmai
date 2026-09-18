/* ==========================================================================
   弦脉 · 站点外壳
   --------------------------------------------------------------------------
   导航与页脚用同一份数据生成，所有页面（含后续十二个分页面）自动获得完整
   导航 —— 加新页面只要改这里一处，不用去每个 HTML 里改链接。

   另外提供两个章节页反复用到的小件：
     revealOnScroll  滚动进入视口时显形
     imageSlot       图片槽（含缺图兜底与说明位）
   ========================================================================== */

/** 章节结构。id 用于高亮当前页。
    requires: 需要先完成某件事才能进（值为 localStorage 的键）。
    有 requires 的章节在未完成时**显示为锁着**，点它不跳转，
    而是把人送去完成那件事的地方。 */
export const NAV = [
  // 入口页（整屏循环那条概念片）。放第一项，从任何内页都能跳回去重看。
  { id: 'welcome',   num: '影',    label: '概念片',      href: 'welcome/index.html' },
  { id: 'prologue',  num: '序',    label: '序',         href: 'index.html' },
  { id: 'qon',       num: '二',    label: '穹乃额曼',    href: 'qiongnaieman/index.html', sub: '大曲' },
  { id: 'dastan',    num: '三',    label: '达斯坦',      href: 'dastan/index.html',       sub: '叙事诗' },
  { id: 'mashrap',   num: '四',    label: '麦西热甫',    href: 'mashrap/index.html',      sub: '歌舞曲' },
  {
    id: 'lishi', num: '五', label: '历史与传承', href: 'lishi/index.html',
    // 和附录在同一道门后面：不跳完那场圆圈，这两页都不该进得去。
    // 之前只锁了附录，第五章漏了 —— 结果能直接点进去。
    requires: 'xiangmai.unlocked.mashrap',
    lockHref: 'mashrap/index.html#mq-act',
    lockHint: '先把第四章那场麦西热甫跳完',
  },
  {
    id: 'fulu', num: '附录', label: '形制比较', href: 'fulu/index.html',
    requires: 'xiangmai.unlocked.mashrap',
    lockHref: 'mashrap/index.html#mq-act',
    lockHint: '先把第四章那场麦西热甫跳完',
  },
];

const $ = (s, r) => (r || document).querySelector(s);

/** 读取解锁状态。localStorage 读不到（隐私模式）就当没锁，别把人挡在外面。 */
function isLocked(entry) {
  if (!entry.requires) return false;
  try { return localStorage.getItem(entry.requires) !== '1'; } catch { return false; }
}

/**
 * 把顶部导航渲染进 .topbar（HTML 里只留一个占位结构）。
 * @param {object} opts
 * @param {string} opts.base  相对站点根的路径前缀，如 '../' 或 ''
 * @param {string} opts.active 当前页的 NAV id
 * @param {boolean} [opts.showSound] 是否显示声音开关
 */
export function mountShell(opts) {
  const base = opts.base || '';
  const active = opts.active || '';
  const topbar = $('.topbar');
  if (!topbar) return;

  const links = NAV.map((n) => {
    const cur = n.id === active ? ' aria-current="page"' : '';
    const sub = n.sub ? '<i class="sitelinks__sub">' + n.sub + '</i>' : '';
    const locked = isLocked(n);
    // 锁着时保留原 href（语义仍在），但加标记；点击由下面的监听拦下
    const attrs = locked
      ? ' class="is-locked" data-locked="1" aria-disabled="true"' +
        ' title="' + (n.lockHint || '还没解锁') + '"' +
        ' data-lock-href="' + base + (n.lockHref || n.href) + '"'
      : '';
    return '<li><a href="' + base + n.href + '"' + cur + attrs + '>' +
      n.num + ' · ' + n.label + sub +
      (locked ? '<i class="sitelinks__lock" aria-hidden="true"></i>' : '') + '</a></li>';
  }).join('');

  const sound = opts.showSound === false ? '' :
    '<button class="sound" id="sound-toggle" type="button" aria-pressed="true" aria-label="声音开关">' +
    '<span class="sound__ring" aria-hidden="true"></span>' +
    '<span class="sound__text" id="sound-text">声音 开</span></button>';

  /* 窄屏用一个三条横杠的按钮把导航收起来 ——
     七个章节在手机上横排太挤（用户直接说"给人感觉很挤"）。
     按钮只在窄屏出现（CSS 控制），宽屏看不见、也不改变原有排布。
     无障碍：aria-expanded 跟着开合，Esc 关闭，点了链接自动收起。 */
  topbar.innerHTML =
    '<a class="brand" href="' + base + 'index.html" aria-label="弦脉 Stringline Heritage 首页">' +
      '<i class="brand__glyph" aria-hidden="true"></i>' +
      '<span class="brand__name">弦脉</span>' +
      '<span class="brand__latin">Stringline Heritage</span>' +
    '</a>' +
    '<div class="topbar__right">' +
      '<button class="navburger" id="nav-burger" type="button"' +
        ' aria-controls="site-nav" aria-expanded="false" aria-label="展开章节导航">' +
        '<i class="navburger__bar" aria-hidden="true"></i>' +
        '<i class="navburger__bar" aria-hidden="true"></i>' +
        '<i class="navburger__bar" aria-hidden="true"></i>' +
      '</button>' +
      '<nav aria-label="站点章节" id="site-nav"><ul class="sitelinks">' + links + '</ul></nav>' +
      sound +
    '</div>';

  /* 横杠按钮的开合 */
  const burger = $('#nav-burger', topbar);
  const wrap = topbar.querySelector('.topbar__right');
  const setOpen = (open) => {
    if (wrap) wrap.classList.toggle('is-open', open);
    if (burger) burger.setAttribute('aria-expanded', open ? 'true' : 'false');
    document.body.classList.toggle('nav-open', open);
  };
  if (burger) {
    burger.addEventListener('click', (e) => {
      e.stopPropagation();
      setOpen(!(wrap && wrap.classList.contains('is-open')));
    });
    // 点空白处收起
    document.addEventListener('click', (e) => {
      if (!wrap || !wrap.classList.contains('is-open')) return;
      if (topbar.contains(e.target)) return;
      setOpen(false);
    });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') setOpen(false);
    });
    // 点了导航项就收起，不然展开的菜单会挡着刚打开的页面
    topbar.addEventListener('click', (e) => {
      const a = e.target.closest ? e.target.closest('.sitelinks a') : null;
      if (a) setOpen(false);
    });
  }

  /* 锁着的导航项：点了不跳，而是把人送去该去的地方，并给一句提示。
     用捕获阶段拦，免得别处的处理器先跳走。 */
  topbar.addEventListener('click', (e) => {
    const a = e.target.closest ? e.target.closest('a[data-locked]') : null;
    if (!a) return;
    e.preventDefault();
    e.stopPropagation();
    const go = a.getAttribute('data-lock-href');
    const li = a.parentElement;
    // 先给个"锁着"的抖动反馈，再走
    if (li) {
      li.classList.remove('is-nudged');
      void li.offsetWidth;                 // 强制重排，让动画能重放
      li.classList.add('is-nudged');
    }
    if (go) setTimeout(() => { location.href = go; }, 260);
  }, true);
}

/**
 * 声音开关，**默认开**。
 *
 * 为什么不能只把标签写成"开"：
 *   浏览器的自动播放策略不允许没有用户手势就出声。
 *   所以"默认开"的正确做法是 —— 按钮一开始就显示"开"，
 *   然后**第一次交互（点击/滚动/按键）自动把声音打开**。
 *   只改标签不放声音，就是在骗用户。
 *
 * @param {object} opts
 * @param {string} [opts.on]  用户点"开"时怎么开：返回 false 表示开不了
 * @param {string} [opts.off] 用户点"关"时怎么关
 * @param {string} [opts.onFirstGesture]
 *        第一次手势时自动开。不传就不自动开（那种页面由别处开，
 *        比如有主题曲的页面用 autoPlayOnGesture）。
 */
export function mountSoundButton(opts = {}) {
  const btn = $('#sound-toggle');
  const text = $('#sound-text');
  if (!btn) return null;

  const paint = (on, label) => {
    btn.setAttribute('aria-pressed', on ? 'true' : 'false');
    if (text) text.textContent = label || (on ? '声音 开' : '声音 关');
  };

  // 默认就显示"开" —— 配合下面的自动开，标签和实际是一致的
  paint(true);

  if (opts.onFirstGesture) {
    const arm = () => {
      ['pointerdown', 'keydown', 'wheel', 'scroll', 'touchstart'].forEach((e) =>
        window.removeEventListener(e, arm));
      opts.onFirstGesture();
    };
    ['pointerdown', 'keydown', 'wheel', 'scroll', 'touchstart'].forEach((e) =>
      window.addEventListener(e, arm, { passive: true, once: true }));
  }

  btn.addEventListener('click', () => {
    const on = btn.getAttribute('aria-pressed') !== 'true';
    if (on) {
      const r = opts.on ? opts.on() : true;
      if (r === false) { paint(false, '声音 不可用'); return; }
    } else if (opts.off) {
      opts.off();
    }
    paint(on);
  });

  return { paint, setLabel: (t) => { if (text) text.textContent = t; } };
}

/**
 * 页面底部的「上一章 / 下一章」。按 NAV 的链条自动生成 ——
 * 以后调整章节顺序或插新页，不用改任何 HTML。
 */
export function mountChapterNav(opts) {
  const base = opts.base || '';
  const host = $('.chapter-nav');
  if (!host) return;
  const i = NAV.findIndex((n) => n.id === opts.active);
  if (i < 0) return;

  const prev = NAV[i - 1];
  const next = NAV[i + 1];
  const label = (n) => n.num + ' · ' + n.label;

  host.innerHTML =
    (prev ? '<a href="' + base + prev.href + '">← ' + label(prev) + '</a>' : '<span></span>') +
    (next ? '<a class="next" href="' + base + next.href + '">' + label(next) + ' →</a>' : '<span></span>');
}

/**
 * 滚动进入视口时加 is-in。用于幕的推进、时间轴刻度点亮。
 * @param {string} selector
 * @param {object} [opts]
 * @param {number} [opts.threshold=0.18]
 * @param {boolean} [opts.once=true]
 */
export function revealOnScroll(selector, opts = {}) {
  const nodes = Array.from(document.querySelectorAll(selector));
  if (!nodes.length) return;
  const threshold = opts.threshold === undefined ? 0.18 : opts.threshold;
  const once = opts.once !== false;

  if (!('IntersectionObserver' in window)) {
    nodes.forEach((n) => n.classList.add('is-in'));
    return;
  }

  const io = new IntersectionObserver((entries) => {
    entries.forEach((e) => {
      if (e.isIntersecting) {
        e.target.classList.add('is-in');
        if (once) io.unobserve(e.target);
      } else if (!once) {
        e.target.classList.remove('is-in');
      }
    });
  }, { threshold, rootMargin: '0px 0px -8% 0px' });

  nodes.forEach((n) => io.observe(n));
}

/**
 * 图片槽：设置 src 后自动加载，成功则淡入，失败则保持占位样式。
 * HTML 里写成 <figure class="slot" data-src="..." data-label="...">，
 * 这里统一接管，避免每处都写一遍 onerror。
 */
export function mountSlots() {
  Array.from(document.querySelectorAll('figure.slot')).forEach((fig) => {
    const src = fig.getAttribute('data-src');
    const img = fig.querySelector('img');
    if (!img) { fig.classList.add('is-empty'); return; }

    if (!src) { fig.classList.add('is-empty'); return; }

    fig.classList.remove('is-empty');
    img.addEventListener('load', () => img.classList.add('is-loaded'), { once: true });
    img.addEventListener('error', () => {
      // 文件还没放进来：退回占位，版面不变形
      fig.classList.add('is-empty');
      img.removeAttribute('src');
    }, { once: true });
    img.src = src;
  });
}
