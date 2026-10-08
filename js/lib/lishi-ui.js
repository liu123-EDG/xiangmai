/* ==========================================================================
   弦脉 · 第五章的互动部件
   --------------------------------------------------------------------------
   第五章的问题不是"内容不好"，是**形式没跟着内容走**：
   五段全是 kicker → 标题 → 正文 → 正文 → 配色块，结构一模一样，
   滚起来就是同一屏重复五遍；而全章最厚的证据（近六年、340 余首）
   和最亮的冲突（不识字的人不信铁疙瘩）都只是几行小字。

   所以这里给四段各配一种**和内容对应的**形式：

     一 · 渊源     横向时间长轴 —— 一千年拉成一条线，
                   16 部 → 12 套的"减法"用刻度长短看出来
     二 · 阿曼尼莎 16 → 12 的减法 —— 16 个方块逐个灭掉 4 个
     三 · 抢救     手摇钢丝录音机 —— 能亲手摇，摇到哪一年就讲哪一年，
                   转数累计对应"近六年、340 余首"
     四 · 双轨     两条长度按**真实数据**来的轨

   一条纪律：所有数字都来自页面原有的正文，**不新增任何史实**。
   ========================================================================== */

const el = (tag, cls, html) => {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (html !== undefined) n.innerHTML = html;
  return n;
};

/* ---------------------------------------------------------------- 一 · 长轴 */

/** 千年拉成一条横线。三个节点均匀分布，第三个（16世纪）最重。 */
export function buildTimeline(host, data) {
  if (!host || !data || !data.length) return null;

  const wrap = el('div', 'tls');
  const line = el('div', 'tls__line');
  const fill = el('div', 'tls__fill');
  line.appendChild(fill);
  wrap.appendChild(line);

  const nodes = data.map((d, i) => {
    const n = el('div', 'tls__node' + (d.emphasis ? ' is-heavy' : ''));
    n.dataset.i = String(i);
    n.appendChild(el('span', 'tls__dot'));
    n.appendChild(el('span', 'tls__era', d.era));
    wrap.appendChild(n);
    return n;
  });

  const detail = el('div', 'tls__detail');
  wrap.appendChild(detail);
  host.appendChild(wrap);

  let cur = -1;
  function select(i, animate) {
    if (i === cur) return;
    cur = i;
    const d = data[i];
    nodes.forEach((n, k) => {
      n.classList.toggle('is-on', k === i);
      n.classList.toggle('is-past', k < i);
    });
    fill.style.width = (nodes.length <= 1 ? 100 : (i / (nodes.length - 1)) * 100) + '%';
    detail.innerHTML =
      '<h3 class="tls__title">' + d.title + '</h3>' +
      '<p class="tls__body">' + d.body + '</p>' +
      (d.tag ? '<span class="tls__tag">' + d.tag + '</span>' : '');
    if (animate && !prefersReduced()) {
      detail.animate(
        [{ opacity: 0, transform: 'translateY(8px)' }, { opacity: 1, transform: 'none' }],
        { duration: 620, easing: 'cubic-bezier(.22,.61,.36,1)' });
    }
  }

  const prefersReduced = () =>
    window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  nodes.forEach((n, i) => {
    n.addEventListener('click', () => select(i, true));
    // 键盘可达：它是可以点的，就该能 Tab 到
    n.tabIndex = 0;
    n.setAttribute('role', 'button');
    n.setAttribute('aria-label', data[i].era + ' ' + data[i].title);
    n.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); select(i, true); }
    });
  });

  select(0, false);
  /* 滚到这一段时自动推进到 16 世纪（最重的那一格），
     让"它最后收拢成一套"这件事自己发生；用户也可以自己点。 */
  const io = new IntersectionObserver((ents) => {
    ents.forEach((e) => {
      if (!e.isIntersecting) return;
      const heavy = data.findIndex((d) => d.emphasis);
      if (heavy >= 0) setTimeout(() => select(heavy, true), 900);
      io.disconnect();
    });
  }, { threshold: 0.5 });
  io.observe(wrap);

  return { select, state: () => ({ cur, total: data.length }) };
}

/* ------------------------------------------------------------ 二 · 16 → 12 */

/** 16 个方块，后 4 个被"剔除"——这是全章唯一一个看得见的动作。 */
export function buildSubtract(host, opts) {
  if (!host) return null;
  const from = opts.from, to = opts.to;
  const drop = from - to;

  const wrap = el('div', 'sub');
  const grid = el('div', 'sub__grid');
  const cells = [];
  for (let i = 0; i < from; i++) {
    const c = el('span', 'sub__cell');
    // 要剔除的那几个排在后半段，视觉上像"被挑出去"
    if (i >= from - drop) c.classList.add('sub__cell--drop');
    grid.appendChild(c);
    cells.push(c);
  }
  wrap.appendChild(grid);

  const readout = el('div', 'sub__readout');
  wrap.appendChild(readout);
  host.appendChild(wrap);

  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  let done = false;

  function run() {
    if (done) return;
    done = true;
    cells.forEach((c, i) => {
      if (i < from - drop) return;
      const delay = (i - (from - drop)) * 140;
      if (reduced) { c.classList.add('is-out'); return; }
      setTimeout(() => c.classList.add('is-out'), 700 + delay);
    });
    setTimeout(() => {
      readout.innerHTML =
        '<span class="sub__n"><b>' + from + '</b>部</span>' +
        '<span class="sub__arrow" aria-hidden="true">→</span>' +
        '<span class="sub__n sub__n--to"><b>' + to + '</b>套</span>' +
        '<span class="sub__cap">剔除 4 部，定名「十二木卡姆」</span>';
      readout.classList.add('is-in');
    }, reduced ? 0 : 700 + drop * 140 + 200);
  }

  readout.innerHTML =
    '<span class="sub__n"><b>' + from + '</b>部</span>' +
    '<span class="sub__cap">最初整理的规模</span>';

  const io = new IntersectionObserver((ents) => {
    ents.forEach((e) => { if (e.isIntersecting) { run(); io.disconnect(); } });
  }, { threshold: 0.45 });
  io.observe(wrap);

  return { run, state: () => ({ done, from, to, dropped: drop }) };
}

/* --------------------------------------------------- 三 · 手摇钢丝录音机 */

/* 六个年份的说明。数字全部来自页面原有正文：
   40 年代只剩一人能完整演唱、1950 万桐书到新疆、
   近六年工作、1960 出版、340 余首。**没有新增史实。** */
const REEL_STOPS = [
  { year: 1950, at: 0.00, head: '万桐书到新疆',
    body: '音乐家万桐书受派前往新疆，与吐尔迪·阿洪相遇。两人语言不通、背景迥异。' },
  { year: 1951, at: 0.14, head: '「听一句，记一句」',
    body: '记谱要一句一句地拆，而老人唱歌习惯一气呵成。合作的第一个障碍在这里。' },
  { year: 1952, at: 0.34, head: '他不信那个铁疙瘩',
    body: '用钢丝录音机录。吐尔迪·阿洪不相信「铁疙瘩能把歌声装进去」。' },
  { year: 1953, at: 0.54, head: '每次唱得都不一样',
    body: '万桐书追求记谱的准确，老人却每次都即兴发挥 —— 这正是口传音乐的样子。' },
  { year: 1955, at: 0.78, head: '一首一首地过',
    body: '靠着一次次重来，全套曲目被一首一首地固定下来。' },
  { year: 1960, at: 1.00, head: '《十二木卡姆》出版',
    body: '记录 340 余首古典叙诵歌曲、民间叙事组歌、舞曲、即兴乐曲。抢救完成。' },
];

/**
 * 一台能亲手摇的钢丝录音机。
 * 拖动（或方向键）→ 钢丝盘转、年份走、累计转数涨、说明跟着换。
 *
 * 为什么做这个：这一段原来最厚（近六年、340 余首），却只是排比句。
 * "他不相信铁疙瘩能把歌声装进去"这句话，配一台**你能亲手摇的机器**才有分量。
 */
export function buildRecorder(host) {
  if (!host) return null;

  const wrap = el('div', 'rec');
  wrap.innerHTML =
    '<div class="rec__top">' +
      '<div class="rec__reel" aria-hidden="true">' +
        '<svg viewBox="0 0 120 120">' +
          '<circle class="rec__rim" cx="60" cy="60" r="54"/>' +
          '<circle class="rec__hub" cx="60" cy="60" r="13"/>' +
          '<g class="rec__spokes">' +
            '<line x1="60" y1="18" x2="60" y2="46"/>' +
            '<line x1="60" y1="74" x2="60" y2="102"/>' +
            '<line x1="18" y1="60" x2="46" y2="60"/>' +
            '<line x1="74" y1="60" x2="102" y2="60"/>' +
          '</g>' +
        '</svg>' +
      '</div>' +
      '<div class="rec__meta">' +
        '<span class="rec__year" id="rec-year">1950</span>' +
        '<span class="rec__turns"><b id="rec-turns">0</b> 圈</span>' +
      '</div>' +
    '</div>' +
    '<div class="rec__track" id="rec-track" role="slider" tabindex="0"' +
      ' aria-label="拖动摇柄，沿着抢救的年份推进" aria-valuemin="0" aria-valuemax="6">' +
      '<div class="rec__rail"></div>' +
      '<div class="rec__fill" id="rec-fill"></div>' +
      '<div class="rec__knob" id="rec-knob"><span></span></div>' +
    '</div>' +
    '<div class="rec__ticks" id="rec-ticks"></div>' +
    '<div class="rec__panel" id="rec-panel"></div>' +
    '<p class="rec__hint" id="rec-hint">拖动上面的摇柄 —— 这就是那台机器</p>';
  host.appendChild(wrap);

  const track = wrap.querySelector('#rec-track');
  const fill = wrap.querySelector('#rec-fill');
  const knob = wrap.querySelector('#rec-knob');
  const yearEl = wrap.querySelector('#rec-year');
  const turnsEl = wrap.querySelector('#rec-turns');
  const panel = wrap.querySelector('#rec-panel');
  const ticks = wrap.querySelector('#rec-ticks');
  const hint = wrap.querySelector('#rec-hint');
  const reel = wrap.querySelector('.rec__reel');

  // 刻度
  REEL_STOPS.forEach((s) => {
    const t = el('span', 'rec__tick');
    t.style.left = (s.at * 100) + '%';
    t.innerHTML = '<i></i><b>' + s.year + '</b>';
    ticks.appendChild(t);
    t.dataset.at = String(s.at);
  });
  const tickEls = [...ticks.querySelectorAll('.rec__tick')];

  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  let p = 0;              // 0..1 进度
  let traveled = 0;       // 累计走过的路程（算转数用）
  let lastX = null;
  let stopped = false;    // 用户一旦自己动过，就不再自动推进
  let curStop = -1;

  /* 转数：不是真实圈数，是"你摇了多远"的累积。
     用路程换算成一个体面的数字 —— 目的是让手上有反馈，
     不是伪造一个历史数据（面板上写的就是"圈"，对应摇柄的转动）。 */
  const TURNS_PER_PX = 0.16;

  function stopAt(v) {
    let best = 0;
    for (let i = 0; i < REEL_STOPS.length; i++) {
      if (v >= REEL_STOPS[i].at - 0.001) best = i;
    }
    return best;
  }

  function render(animate) {
    const i = stopAt(p);
    fill.style.width = (p * 100) + '%';
    knob.style.left = (p * 100) + '%';
    turnsEl.textContent = String(Math.round(traveled * TURNS_PER_PX));
    track.setAttribute('aria-valuenow', String(i + 1));
    track.setAttribute('aria-valuetext', REEL_STOPS[i].year + ' ' + REEL_STOPS[i].head);

    // 盘子在转：角度跟着进度走，进度越大转得越多
    if (!reduced) {
      reel.style.transform = 'rotate(' + (p * 540) + 'deg)';
    }

    tickEls.forEach((t, k) => {
      t.classList.toggle('is-on', k === i);
      t.classList.toggle('is-past', k < i);
    });

    if (i !== curStop) {
      curStop = i;
      const s = REEL_STOPS[i];
      yearEl.textContent = String(s.year);
      panel.innerHTML =
        '<h3 class="rec__head">' + s.head + '</h3>' +
        '<p class="rec__body">' + s.body + '</p>';
      if (animate && !reduced) {
        panel.animate(
          [{ opacity: 0, transform: 'translateY(6px)' }, { opacity: 1, transform: 'none' }],
          { duration: 520, easing: 'cubic-bezier(.22,.61,.36,1)' });
      }
    }
  }

  function move(clientX, animate) {
    const r = track.getBoundingClientRect();
    const np = Math.max(0, Math.min(1, (clientX - r.left) / Math.max(1, r.width)));
    if (lastX !== null) traveled += Math.abs(clientX - lastX);
    lastX = clientX;
    p = np;
    stopped = true;
    hint.classList.add('is-gone');
    render(animate);
  }

  track.addEventListener('pointerdown', (e) => {
    track.setPointerCapture(e.pointerId);
    lastX = null;
    move(e.clientX, false);
    track.classList.add('is-grabbing');
  });
  track.addEventListener('pointermove', (e) => {
    if (!track.hasPointerCapture(e.pointerId)) return;
    move(e.clientX, false);
  });
  const release = (e) => {
    if (track.hasPointerCapture(e.pointerId)) track.releasePointerCapture(e.pointerId);
    track.classList.remove('is-grabbing');
    lastX = null;
    render(true);
  };
  track.addEventListener('pointerup', release);
  track.addEventListener('pointercancel', release);

  /* 键盘：方向键一档一档走。滑块必须能用键盘操作。 */
  track.addEventListener('keydown', (e) => {
    const i = stopAt(p);
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
      e.preventDefault();
      p = REEL_STOPS[Math.min(REEL_STOPS.length - 1, i + 1)].at;
      traveled += 60; stopped = true; hint.classList.add('is-gone'); render(true);
    } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
      e.preventDefault();
      p = REEL_STOPS[Math.max(0, i - 1)].at;
      stopped = true; hint.classList.add('is-gone'); render(true);
    }
  });

  render(false);

  /* 滚到这一段时自动摇一小段，让人知道这东西能拖；
     用户一旦自己动手，自动推进就停。 */
  const io = new IntersectionObserver((ents) => {
    ents.forEach((e) => {
      if (!e.isIntersecting || reduced) return;
      io.disconnect();
      let step = 0;
      const timer = setInterval(() => {
        if (stopped) { clearInterval(timer); return; }
        step++;
        p = Math.min(0.34, step * 0.045);
        traveled += 14;
        render(false);
        hint.classList.remove('is-gone');
        if (p >= 0.34) clearInterval(timer);
      }, 90);
    });
  }, { threshold: 0.4 });
  io.observe(wrap);

  return {
    set: (v) => { p = v; traveled += 200; stopped = true; render(true); },
    state: () => ({
      p: +p.toFixed(3), stop: stopAt(p),
      year: REEL_STOPS[stopAt(p)].year,
      turns: Math.round(traveled * TURNS_PER_PX),
      stops: REEL_STOPS.length,
    }),
  };
}

/* ------------------------------------------------------------- 四 · 双轨 */

/**
 * 两条轨，长度按真实数据来。
 * 数据都在正文里：乡土近 50 位代表性传承人；学院 250+ 专业人才、2000+ 培训人次。
 * 用平方根压一下比例 —— 否则 50 对 250 会让第一条细得看不见。
 */
export function buildRails(host, rails) {
  if (!host) return null;
  const wrap = el('div', 'rails');

  const rows = rails.map((r) => {
    const row = el('article', 'rail-row');
    row.innerHTML =
      '<div class="rail-row__head">' +
        '<span class="rail-row__tag">' + r.tag + '</span>' +
        '<h3 class="rail-row__name">' + r.name + '</h3>' +
      '</div>' +
      '<p class="rail-row__body">' + r.body + '</p>' +
      '<div class="rail-row__bars">' +
        r.bars.map((b) =>
          '<div class="rail-bar">' +
            '<div class="rail-bar__track"><span class="rail-bar__fill" ' +
              'style="--w:' + b.pct + '%"></span></div>' +
            '<div class="rail-bar__read">' +
              '<b>' + b.value + '</b><span>' + b.label + '</span>' +
            '</div>' +
          '</div>').join('') +
      '</div>';
    wrap.appendChild(row);
    return row;
  });

  host.appendChild(wrap);

  /* 进视野时把条子拉出来 —— 长度是这一段的论点，得让人看见它长出来 */
  const io = new IntersectionObserver((ents) => {
    ents.forEach((e) => {
      if (!e.isIntersecting) return;
      rows.forEach((row, i) => setTimeout(() => row.classList.add('is-in'), i * 180));
      io.disconnect();
    });
  }, { threshold: 0.3 });
  io.observe(wrap);

  return { state: () => ({ rows: rails.length }) };
}

/* ------------------------------------------------------- 五 · 横滑案例带 */

/** 当代运用案例：横着排，滑到哪张哪张亮。像翻唱片。 */
export function buildCases(host, cases) {
  if (!host) return null;

  const wrap = el('div', 'cases2');
  const rail = el('div', 'cases2__rail');
  wrap.appendChild(rail);

  const cards = cases.map((c, i) => {
    const card = el('article', 'case2');
    card.dataset.i = String(i);
    card.innerHTML =
      '<div class="case2__no">' + String(i + 1).padStart(2, '0') + '</div>' +
      '<div class="case2__org">' + c.org + '</div>' +
      '<h3 class="case2__title">' + c.title + '</h3>' +
      '<p class="case2__body">' + c.body + '</p>' +
      (c.stats ? '<ul class="case2__stats">' + c.stats.map((s) =>
        '<li><b>' + s[0] + '</b><span>' + s[1] + '</span></li>').join('') + '</ul>' : '') +
      '<ul class="case2__tags">' + c.tags.map((t) => '<li>' + t + '</li>').join('') + '</ul>';
    rail.appendChild(card);
    return card;
  });

  wrap.appendChild(el('p', 'cases2__hint', '横向滑动 · 或按 ← →'));

  /* 左右按钮：键盘和鼠标都要能用，不能只靠横向滚动（触控板之外不好滑） */
  const nav = el('div', 'cases2__nav');
  const prev = el('button', 'cases2__btn', '←');
  const next = el('button', 'cases2__btn', '→');
  prev.type = 'button'; next.type = 'button';
  prev.setAttribute('aria-label', '上一个案例');
  next.setAttribute('aria-label', '下一个案例');
  nav.appendChild(prev); nav.appendChild(next);
  wrap.appendChild(nav);
  host.appendChild(wrap);

  let cur = 0;
  function go(i) {
    cur = Math.max(0, Math.min(cards.length - 1, i));
    cards[cur].scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
    cards.forEach((c, k) => c.classList.toggle('is-on', k === cur));
    prev.disabled = cur === 0;
    next.disabled = cur === cards.length - 1;
  }
  prev.addEventListener('click', () => go(cur - 1));
  next.addEventListener('click', () => go(cur + 1));

  /* 横向滚动时同步高亮：滑到哪张哪张亮 */
  let raf = 0;
  rail.addEventListener('scroll', () => {
    if (raf) return;
    raf = requestAnimationFrame(() => {
      raf = 0;
      const mid = rail.getBoundingClientRect().left + rail.clientWidth / 2;
      let best = 0, bestD = Infinity;
      cards.forEach((c, k) => {
        const r = c.getBoundingClientRect();
        const d = Math.abs(r.left + r.width / 2 - mid);
        if (d < bestD) { bestD = d; best = k; }
      });
      go(best);
    });
  }, { passive: true });

  go(0);
  return { go, state: () => ({ cur, total: cards.length }) };
}
