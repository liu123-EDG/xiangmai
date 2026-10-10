/* ==========================================================================
   弦脉 · 节奏台（第四章）
   --------------------------------------------------------------------------
   为什么做这个：
     指导老师的意见 ——「节奏那可以设计一些音符 / 随着鼓点动」
     「最好做一些图 / 交互形式的」「多一些交互内容」。
     而第四章原有的第五节标题就叫「待补」，摆着四行"这里还缺…"。
     这一页最要紧的一句话是"它是满的，每一拍都被东西填住"，
     然后"在最急最密的那一下直接切断" —— **这是打击乐的事，
     光用文字讲是浪费。**

   —— 同步是怎么做到的（这是这个部件唯一的技术难点）——
     **不能用 setTimeout 对着音频"掐时间"**：JS 定时器的抖动有几十毫秒，
     鼓点密的时候会明显对不上嘴。
     做法是反过来：先用 Web Audio 把鼓点**排进音频时间轴**
     （schedule 在未来某个 currentTime），同时把"哪一拍、什么时候响"
     记进一个队列；然后 requestAnimationFrame 每帧拿 ctx.currentTime
     去比队列，到点了才画。
     音频时间是硬件时钟，动画跟着它走，**同步是结构上保证的，不是调出来的。**

   —— 音色 ——
     dum / tek / sapayi 三个音是照 js/lib/sequencer.js 里的实现搬的
     （118→46Hz 的下滑正弦是手鼓的"咚"，噪声+三角波是"哒"）。
     搬一份而不是复用，是因为那些是 Sequencer 实例上的私有方法 ——
     为了一个部件去改全站共用的音序器，风险比收益大。

   —— 诚实说明 ——
     下面的节奏型是**为了演示"填满"和"切断"这两个结构特征而设计的**，
     不是某一套木卡姆的记谱。真实节奏型属于"本站还缺"里的一条，
     页面上会写明这一点，不让读者误以为这是田野记谱。
   ========================================================================== */

/** 十二拍一循环。用 12 是因为它能同时被 3、4、6 整除 ——
    演示"疏 → 密"时不用换拍号，读者不会觉得突然换了曲子。 */
const CYCLE = 12;

/* 三段节奏型。编曲意图写在注释里，改的时候别把意图弄丢。
   数值 = 该拍上的力度（0 或省略 = 不响）。 */
const STAGES = [
  {
    id: 'sparse',
    label: '起头',
    bpm: 92,
    hint: '一个人起头。手鼓给骨架，萨帕依把空档填上——但还听得见缝。',
    dum: { 0: 1.0, 3: 0.72, 6: 1.0, 9: 0.72 },
    tek: { 2: 0.5, 5: 0.42, 8: 0.5, 11: 0.42 },
    sapayi: { 1: 0.2, 4: 0.2, 7: 0.2, 10: 0.2 },
    cut: false,
  },
  {
    id: 'filled',
    label: '满',
    bpm: 118,
    hint: '人一圈圈加进来。铁环的声音碎而密，把每一拍都填住了——没有留白等着。',
    dum: { 0: 1.0, 3: 0.72, 6: 1.0, 9: 0.72 },
    tek: { 1: 0.42, 2: 0.5, 4: 0.42, 5: 0.5, 7: 0.42, 8: 0.5, 10: 0.42, 11: 0.5 },
    sapayi: { 0.5: 0.2, 1.5: 0.2, 2.5: 0.2, 3.5: 0.2, 4.5: 0.2, 5.5: 0.2,
              6.5: 0.2, 7.5: 0.2, 8.5: 0.2, 9.5: 0.2, 10.5: 0.2, 11.5: 0.2 },
    cut: false,
  },
  {
    id: 'cut',
    label: '断',
    bpm: 146,
    hint: '推到最急最密——然后停。不是在慢下来的时候收，是在最密的那一拍直接切断。',
    /* 密度要**比上一段更进一层**才能读出"最急最密"：
       手鼓每一拍都有，铁环每半拍都有。
       原来这里是 6 个手鼓 + 11 个铁环（共 27 个记号），
       和"满"那段的 28 个几乎一样 —— 看不出递进，
       它只在 8 拍里塞，却排得比 12 拍还疏。 */
    dum: { 0: 1.0, 1: 0.68, 2: 0.78, 3: 0.88, 4: 0.72, 5: 0.82,
           6: 1.0, 7: 0.9 },
    tek: { 0.5: 0.5, 1: 0.46, 1.5: 0.54, 2: 0.5, 2.5: 0.46, 3: 0.54,
           3.5: 0.5, 4: 0.46, 4.5: 0.54, 5: 0.5, 5.5: 0.46, 6: 0.54,
           6.5: 0.5, 7: 0.46, 7.5: 0.58 },
    sapayi: { 0.25: 0.22, 0.75: 0.2, 1.25: 0.22, 1.75: 0.2,
              2.25: 0.22, 2.75: 0.2, 3.25: 0.22, 3.75: 0.2,
              4.25: 0.22, 4.75: 0.2, 5.25: 0.22, 5.75: 0.2,
              6.25: 0.22, 6.75: 0.2, 7.25: 0.22, 7.75: 0.24 },
    /* **切断点**：走到第 8 拍（最密处）之前戛然而止。
       剩下的拍子不响、也不画 —— 空出来的那一截就是"断"。 */
    cut: true,
    cutAt: 8,
  },
];

const LOOKAHEAD = 0.14;    // 提前排多久的鼓点（秒）
const TICK_MS = 25;        // 调度器的心跳

/* 累计点亮次数。放在模块级而不是实例里，是为了让自检能跨实例读 ——
   实例每次重建都归零的话，"至少亮过一次"就没法验。 */
let litTotal = 0;

export function buildRhythmLab(host, opts = {}) {
  if (!host) return null;
  const reduced = !!opts.reduced;

  let ctx = null;
  let master = null;
  let raf = 0;
  let timer = 0;
  let playing = false;
  let stage = 0;
  /* 'manual' = 自己敲（默认，老师要的沉浸）；'demo' = 看示范 */
  let mode = 'manual';

  /* 排进音频时间轴的鼓点，等动画来"消费"。
     每条：{ at: 音频时刻, kind, gain, beat } */
  let queue = [];
  let nextT = 0;
  let step = 0;               // 当前排到第几拍（可以是小数，见下面的 0.5 拍）
  let cycleStart = 0;         // 本圈的起始音频时刻（画进度用）

  const el = (tag, cls, html) => {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (html !== undefined) n.innerHTML = html;
    return n;
  };

  /* ---------------------------------------------------------- 音色（照搬） */

  function noiseHit(t, g, freq, q, dur) {
    const c = ctx;
    const len = Math.max(1, Math.floor(c.sampleRate * dur * 1.6));
    const buf = c.createBuffer(1, len, c.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) {
      d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2.6);
    }
    const src = c.createBufferSource();
    src.buffer = buf;
    const bp = c.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = freq;
    bp.Q.value = q;
    const gn = c.createGain();
    gn.gain.value = g;
    src.connect(bp).connect(gn).connect(master);
    src.start(t);
  }

  function dum(t, g) {
    const c = ctx;
    const o = c.createOscillator(), gn = c.createGain();
    o.type = 'sine';
    o.frequency.setValueAtTime(118, t);
    o.frequency.exponentialRampToValueAtTime(46, t + 0.13);
    gn.gain.setValueAtTime(0.0001, t);
    gn.gain.exponentialRampToValueAtTime(g, t + 0.005);
    gn.gain.exponentialRampToValueAtTime(0.0001, t + 0.36);
    o.connect(gn).connect(master);
    o.start(t); o.stop(t + 0.42);

    const o2 = c.createOscillator(), g2 = c.createGain();
    o2.type = 'triangle';
    o2.frequency.setValueAtTime(210, t);
    o2.frequency.exponentialRampToValueAtTime(96, t + 0.06);
    g2.gain.setValueAtTime(0.0001, t);
    g2.gain.exponentialRampToValueAtTime(g * 0.32, t + 0.003);
    g2.gain.exponentialRampToValueAtTime(0.0001, t + 0.1);
    o2.connect(g2).connect(master);
    o2.start(t); o2.stop(t + 0.14);
  }

  function tek(t, g) {
    noiseHit(t, g * 0.9, 1750, 1.15, 0.075);
    const c = ctx;
    const o = c.createOscillator(), gn = c.createGain();
    o.type = 'triangle';
    o.frequency.setValueAtTime(390, t);
    gn.gain.setValueAtTime(0.0001, t);
    gn.gain.exponentialRampToValueAtTime(g * 0.5, t + 0.002);
    gn.gain.exponentialRampToValueAtTime(0.0001, t + 0.05);
    o.connect(gn).connect(master);
    o.start(t); o.stop(t + 0.07);
  }

  /* 萨帕依：一串铁环，声音碎、密、带金属味 ——
     它是"填满空档"的那件乐器，所以做得比 tek 更细更长一点。 */
  function sapayi(t, g) {
    const c = ctx;
    const len = Math.floor(c.sampleRate * 0.16);
    const buf = c.createBuffer(1, len, c.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) {
      const x = i / len;
      /* 三四个小峰叠着，像铁环互相撞 —— 单峰听起来像沙锤 */
      const ring = Math.abs(Math.sin(x * Math.PI * 7 + 0.6)) *
                   Math.pow(1 - x, 2.4);
      d[i] = (Math.random() * 2 - 1) * ring;
    }
    const src = c.createBufferSource();
    src.buffer = buf;
    const hp = c.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 4200;
    const gn = c.createGain();
    gn.gain.value = g;
    src.connect(hp).connect(gn).connect(master);
    src.start(t);
  }

  /* ------------------------------------------------------------ 画面 */

  const wrap = el('div', 'rlab');
  wrap.innerHTML =
    '<div class="rlab__stage">' +
      '<svg class="rlab__svg" viewBox="0 0 640 300" role="img" ' +
        'aria-label="十二拍的循环：手鼓、萨帕依、铁环三种记号随鼓点亮起">' +
        '<g class="rlab__lanes"></g>' +
        '<g class="rlab__marks"></g>' +
        '<line class="rlab__playhead" x1="0" y1="26" x2="0" y2="270" />' +
        /* 手动敲的落点标记：敲一下在这里留一个印，看得见自己打在哪 */
        '<g class="rlab__strikes"></g>' +
      '</svg>' +
      '<p class="rlab__cue" aria-live="polite"></p>' +
      '<p class="rlab__judge" aria-live="polite"></p>' +
    '</div>' +
    '<div class="rlab__bar">' +
      /* **默认「我来打」**，不是"听一遍"。
         老师的意见是「只是简单的点击」「可以做一些沉浸式的体验」——
         一个播放键就是一次点击。让人自己敲，才是参与。 */
      '<div class="rlab__modes" role="group" aria-label="怎么玩">' +
        '<button class="rlab__mode is-on" type="button" data-mode="manual">✋ 我来打</button>' +
        '<button class="rlab__mode" type="button" data-mode="demo">▶ 听一遍</button>' +
      '</div>' +
      '<div class="rlab__stages" role="group" aria-label="三段节奏"></div>' +
    '</div>' +
    '<p class="rlab__how" id="rlab-how">' +
      '<strong>在下面随便敲</strong>（轨道上点、或在键盘上按 ' +
      '<kbd>空格</kbd> <kbd>F</kbd> <kbd>J</kbd>）——每一下都出声。' +
      '<br>敲的时候你会看到自己落在哪一拍上。' +
    '</p>' +
    '<p class="rlab__note">' +
      '这三段节奏是为了演示<strong>「填满」</strong>和<strong>「切断」</strong>' +
      '这两个结构特征而设计的，<strong>不是某一套木卡姆的记谱</strong>。' +
      '真实节奏型与鼓点记法列在页末「本站还缺」里。' +
    '</p>';

  host.appendChild(wrap);

  const svg = wrap.querySelector('.rlab__svg');
  const lanesG = wrap.querySelector('.rlab__lanes');
  const marksG = wrap.querySelector('.rlab__marks');
  const strikesG = wrap.querySelector('.rlab__strikes');
  const head = wrap.querySelector('.rlab__playhead');
  const cue = wrap.querySelector('.rlab__cue');
  const judgeEl = wrap.querySelector('.rlab__judge');
  const modesBox = wrap.querySelector('.rlab__modes');
  const stagesBox = wrap.querySelector('.rlab__stages');

  /* 三条轨道：手鼓（大圆）/ 萨帕依（小菱形）/ 铁环（细点）
     一列一拍，横向排开 —— 横着读像谱子，比圆圈更容易看出"密"与"疏"。 */
  const LANES = [
    { key: 'dum', label: '手鼓', y: 78, r: 9, cls: 'rlab__m--dum' },
    { key: 'sapayi', label: '萨帕依', y: 152, r: 5, cls: 'rlab__m--sap' },
    { key: 'tek', label: '铁环', y: 226, r: 5.5, cls: 'rlab__m--tek' },
  ];

  const PAD = 30;
  const COL = (svg.viewBox.baseVal.width - PAD * 2) / CYCLE;
  const xOf = (beat) => PAD + beat * COL;

  /* 轨道名与底线 */
  /* 轨道名带上 data-lane —— 悬停时靠它高亮。
     原来 CSS 用 :nth-of-type(1/3/5) 数位置，那是数不对的：
     nth-of-type 数的是**同类型元素**的第几个，
     而这一组里 text 和 line 是两种类型，各数各的。
     于是只有手鼓那一行会亮（它是第一个 text），另外两行永远不亮。
     标上名字就不用数位置了（用户报的就是"萨帕依那一行不亮"）。 */
  lanesG.innerHTML = LANES.map((L) =>
    '<text class="rlab__lane" data-lane="' + L.key + '" x="8" y="' + (L.y + 4) + '">' +
      L.label + '</text>' +
    '<line class="rlab__lane-line" data-lane="' + L.key + '" x1="' + PAD + '" y1="' + L.y +
      '" x2="' + (640 - PAD + 14) + '" y2="' + L.y + '" />').join('');

  /* 记号：按当前节奏型重建 */
  let marks = [];   // { node, kind, beat, at }
  function buildMarks() {
    const st = STAGES[stage];
    marksG.innerHTML = '';
    marks = [];
    LANES.forEach((L) => {
      const grid = st[L.key] || {};
      Object.keys(grid).forEach((k) => {
        const beat = parseFloat(k);
        const g = parseFloat(grid[k]);
        /* 切断之后不画 —— 空出来的那一截就是"断"，画出来就没了 */
        if (st.cut && beat >= st.cutAt) return;
        const node = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
        node.setAttribute('cx', xOf(beat));
        node.setAttribute('cy', L.y);
        node.setAttribute('r', L.r);
        node.setAttribute('class', 'rlab__m ' + L.cls);
        /* 力度映射到大小：满的那一段记号本来就更大更密，
           所以"密"是**看出来的**，不用靠数 */
        node.setAttribute('r', String(L.r * (0.62 + g * 0.9)));
        marksG.appendChild(node);
        marks.push({ node, kind: L.key, beat, at: 0 });
      });
    });
    /* 拍点刻度 */
    for (let b = 0; b < CYCLE; b++) {
      const t = document.createElementNS('http://www.w3.org/2000/svg', 'text');
      t.setAttribute('x', xOf(b));
      t.setAttribute('y', 288);
      t.setAttribute('class', 'rlab__tick');
      t.textContent = String(b + 1);
      marksG.appendChild(t);
    }
    cue.textContent = st.hint;
  }

  /* 三段选择 */
  stagesBox.innerHTML = STAGES.map((s, i) =>
    '<button type="button" class="rlab__stage' + (i === 0 ? ' is-on' : '') +
    '" data-i="' + i + '">' + s.label + '</button>').join('');
  stagesBox.addEventListener('click', (e) => {
    const b = e.target.closest('.rlab__stage');
    if (!b) return;
    setStage(parseInt(b.dataset.i, 10));
  });

  function setStage(i) {
    stage = Math.max(0, Math.min(STAGES.length - 1, i));
    Array.from(stagesBox.children).forEach((c, k) =>
      c.classList.toggle('is-on', k === stage));
    buildMarks();
    if (playing) restart();
    else paintIdle();
  }

  /* 没播时：让记号有个静态的样子（不要一片灰） */
  function paintIdle() {
    head.setAttribute('x1', xOf(0));
    head.setAttribute('x2', xOf(0));
    head.setAttribute('opacity', '0');
    marks.forEach((m) => m.node.classList.remove('is-hit'));
  }

  /* ------------------------------------------------------------ 调度 */

  function ensureCtx() {
    if (ctx) return ctx;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = 0.9;
    master.connect(ctx.destination);
    return ctx;
  }

  function schedule() {
    const st = STAGES[stage];
    const spb = 60 / st.bpm / 2;          // 半拍一格（节奏型里有 0.5 的位置）
    const total = CYCLE;

    while (nextT < ctx.currentTime + LOOKAHEAD) {
      const beatInCycle = step % total;
      const at = nextT;

      /* 切断：走到 cutAt 就跳回圈首，并且**留一段静默**再进来。
         那段静默就是"人散了，鼓还在耳朵里"的那个空。 */
      if (st.cut && beatInCycle >= st.cutAt) {
        nextT = at + spb * (total - st.cutAt) + 0.75;
        step = Math.ceil(step / total) * total;
        cycleStart = nextT;
        push({ at, kind: 'cut', beat: beatInCycle, gain: 1 });
        continue;
      }

      ['dum', 'tek', 'sapayi'].forEach((kind) => {
        const grid = st[kind] || {};
        const g = grid[beatInCycle];
        if (!g) return;
        /* 微微的人手不精确，跟音序器一致 —— 完全对齐反而像机器 */
        const jitter = (Math.random() - 0.5) * 0.004;
        const t = at + jitter;
        if (kind === 'dum') dum(t, g * 0.8);
        else if (kind === 'tek') tek(t, g * 0.5);
        else sapayi(t, g * 1.5);
        push({ at: t, kind, beat: beatInCycle, gain: g });
      });

      step++;
      nextT += spb;
    }
  }

  function push(ev) { queue.push(ev); }

  /* 动画：每帧拿音频时钟比队列。**同步是这么保证的** ——
     不是"猜下一拍什么时候到"，而是"音频说到了才画"。 */
  function frame() {
    if (!playing) return;
    const now = ctx.currentTime;
    const st = STAGES[stage];

    while (queue.length && queue[0].at <= now + 0.012) {
      const ev = queue.shift();
      if (ev.kind === 'cut') {
        wrap.classList.add('is-cut');
        cue.textContent = '—— 断 ——';
        setTimeout(() => { if (playing) { wrap.classList.remove('is-cut'); cue.textContent = st.hint; } }, 620);
        continue;
      }
      const m = marks.find((x) => x.beat === ev.beat && x.kind === ev.kind && !x.hit);
      if (m) {
        m.hit = true;
        m.node.classList.add('is-hit');
        litTotal++;
        const n = m.node;
        setTimeout(() => n.classList.remove('is-hit'), 190);
      }
    }

    /* 播放头跟着音频时钟走 */
    const spb = 60 / st.bpm / 2;
    if (cycleStart) {
      const span = st.cut ? st.cutAt * spb : CYCLE * spb;
      const p = Math.min(1, Math.max(0, (now - cycleStart) / span));
      const x = PAD + p * (st.cut ? st.cutAt : CYCLE) * COL;
      head.setAttribute('x1', x);
      head.setAttribute('x2', x);
      head.setAttribute('opacity', '1');
    }

    schedule();
    raf = requestAnimationFrame(frame);
  }

  function restart() {
    if (!ctx) return;
    queue = [];
    /* 从下一个半拍整点开始，避免接着上一次的相位 */
    nextT = ctx.currentTime + 0.08;
    step = 0;
    cycleStart = nextT;
    marks.forEach((m) => { m.hit = false; m.node.classList.remove('is-hit'); });
    wrap.classList.remove('is-cut');
  }

  function start() {
    if (!ensureCtx()) return false;
    if (ctx.state === 'suspended') ctx.resume();
    playing = true;
    wrap.classList.add('is-playing');
    /* 起示范就切到示范模式 —— 否则"听一遍"点了没反应，
       因为手动模式下按钮不驱动播放。 */
    if (mode !== 'demo') setMode('demo');
    restart();
    clearInterval(timer);
    timer = setInterval(() => {
      if (!playing || !ctx) return;
      schedule();
    }, TICK_MS);
    raf = requestAnimationFrame(frame);
    return true;
  }

  function stop() {
    playing = false;
    wrap.classList.remove('is-playing', 'is-cut');
    setModeLabel();
    clearInterval(timer); timer = 0;
    cancelAnimationFrame(raf); raf = 0;
    queue = [];
    marks.forEach((m) => { m.hit = false; m.node.classList.remove('is-hit'); });
    cue.textContent = STAGES[stage].hint;
    paintIdle();
  }

  /* --------------------------------------------------- 手动敲（沉浸那部分）

     老师：「但是只是简单的点击」「可以做一些沉浸式的体验」。
     一个播放键就是一次点击。所以这一块让人**自己敲**：

       · 在轨道上点，或者按 空格 / F / J —— 每一下都出声
       · 敲下去的地方留一个印（strikes），看得见自己打在哪
       · 顺手告诉你离最近的拍有多远（准 / 早 / 晚），
         但**不评分、不拦着** —— 这是让人体会节奏，不是考人
       · 「断」那一段示范会自己停，**手打不会** ——
         「停不下来」这件事，手上体会到，比读到一句"它是停不下来"有用

     音色按横向位置分：左边（前几拍）是手鼓，右边是铁环，
     中间偏下是萨帕依 —— 敲哪儿出什么声，位置和轨道对得上。 */

  let strikeCount = 0;
  let judgeTimer = 0;

  /* 第一版的 laneOfX（按横向位置分乐器）已经删掉了 ——
     它和画面（三条分开的横排）对不上，是用户"点不到"的根因。
     现在命中按行判定，见 laneAtY。 */

  function judgeWord(diffMs) {
    const a = Math.abs(diffMs);
    if (a <= 55) return '准';
    if (a <= 130) return diffMs < 0 ? '早一点' : '晚一点';
    return diffMs < 0 ? '早了' : '晚了';
  }

  /**
   * 敲一下。
   * @param {number} frac   横向位置（0..1）——印记画在哪里
   * @param {string} source 'pointer' | 'key' | 'test'
   * @param {string} [kind] 乐器。**不传就按 frac 猜**（键盘和自检用），
   *                        鼠标点击一律由调用方传入行判定结果。
   */
  function strike(frac, source, kind) {
    if (!ensureCtx()) return;
    if (ctx.state === 'suspended') ctx.resume();
    const t = ctx.currentTime + 0.012;
    /* 乐器：调用方给了就用它（鼠标点击按行判定），
       没给就按横向位置猜（键盘 F/J/空格、以及自检）。 */
    const k = kind || (frac < 0.34 ? 'dum' : frac > 0.67 ? 'tek' : 'sapayi');
    if (k === 'dum') dum(t, 0.85);
    else if (k === 'tek') tek(t, 0.5);
    else sapayi(t, 0.32);
    strikeCount++;
    /* 敲过一下就把「在轨道上敲」那句提示收掉 —— 已经会了，不用再教 */
    if (strikeCount === 1) wrap.classList.add('is-struck');

    /* 落在轨道上留个印 —— 印子画在**你点的那一行**上（k），
       横向落在你点的位置（frac）。这样"我敲在哪儿"是看得见的。 */
    const lane = LANES.find((L) => L.key === k) || LANES[0];
    const x = PAD + frac * (640 - PAD * 2);
    const g = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    g.setAttribute('cx', x);
    g.setAttribute('cy', lane.y);
    g.setAttribute('r', 16);
    g.setAttribute('class', 'rlab__strike rlab__strike--' + k);
    strikesG.appendChild(g);
    setTimeout(() => { if (g.parentNode) g.parentNode.removeChild(g); }, 620);

    /* 离最近的拍多远。只在示范模式下有节拍参考 ——
       手打模式下没有"标准答案"，但示范在跑时就有了。 */
    if (playing) {
      const st = STAGES[stage];
      const spb = 60 / st.bpm / 2;
      const elapsed = ctx.currentTime - cycleStart;
      const beatNow = elapsed / spb;
      const nearest = Math.round(beatNow);
      const diffMs = (beatNow - nearest) * spb * 1000;
      judgeEl.textContent = (k === 'dum' ? '咚' : k === 'tek' ? '哒' : '沙') +
        '　' + judgeWord(diffMs) +
        (Math.abs(diffMs) > 55 ? '（' + Math.abs(Math.round(diffMs)) + 'ms）' : '');
      judgeEl.className = 'rlab__judge is-on';
      clearTimeout(judgeTimer);
      judgeTimer = setTimeout(() => {
        judgeEl.className = 'rlab__judge';
        judgeEl.textContent = '';
      }, 900);
    } else {
      /* 没在示范：只说"出什么声"，不谈准不准 —— 没有参照就没有对错 */
      judgeEl.textContent = (k === 'dum' ? '咚' : k === 'tek' ? '哒' : '沙') +
        (source === 'key' ? '　（键盘）' : '');
      judgeEl.className = 'rlab__judge is-on';
      clearTimeout(judgeTimer);
      judgeTimer = setTimeout(() => {
        judgeEl.className = 'rlab__judge';
        judgeEl.textContent = '';
      }, 700);
    }
  }

  /* --------------------------------------------------------------------
     命中的模型：**行决定乐器，列决定敲在哪一拍**
     --------------------------------------------------------------------
     用户反馈（原话）：
     「我的鼠标在手鼓的下面才显示手鼓，到了三行下面才到了萨帕伊和铁环，
       而且明显你的感应框在你画的这个实体横线和圆的下面，
       而且萨帕伊前面两个圆点是点不到的……铁环只有到第四个圆那里才会亮。」

     根因是我第一版把命中**只按横向位置(x)分乐器**：
       frac < 0.34 → 手鼓，0.34..0.67 → 萨帕依，> 0.67 → 铁环
     而画面是**三条分开的横排**。于是：
       · 想敲铁环，点在左边那一列 → 出来的是手鼓
       · 想敲萨帕依，必须点在中间那一列，跟哪一行无关
     图和命中对不上，用户完全没法预判。这是我的设计错，不是实现错。

     现在改成和画面一致：**点在哪一行，就响那一行的乐器**；
     横向位置只决定"敲在这一拍的哪儿"（也就是印记画在哪里）。
     这样"看得见什么、点到什么"是一致的。
     -------------------------------------------------------------------- */
  /** 屏幕坐标 → 落在哪一行。用最近的轨道线判断，不是按顺序切块。 */
  function laneAtY(clientY) {
    const r = svg.getBoundingClientRect();
    const vy = (clientY - r.top) / r.height * svg.viewBox.baseVal.height;
    let best = LANES[0], bestD = Infinity;
    LANES.forEach((L) => {
      const d = Math.abs(vy - L.y);
      if (d < bestD) { bestD = d; best = L; }
    });
    return best;
  }

  /** 屏幕坐标 → 横向位置（0..1，对应十二拍里的第几拍） */
  function fracOfX(clientX) {
    const r = svg.getBoundingClientRect();
    const px = (clientX - r.left) / r.width * 640;
    return Math.min(1, Math.max(0, (px - PAD) / (640 - PAD * 2)));
  }

  const SAY = { dum: '咚（手鼓）', sapayi: '沙（萨帕依·铁环）', tek: '哒（铁环）' };

  /* 悬停：高亮鼠标**所在的那一行**，并说出会出什么声。
     提示里带上"这一行"，用户才知道是按行判定的。 */
  let hoverLane = null;
  let dragging = false;
  /* 按住连打用的定时器（pointerdown 里设，抬手清） */
  let heldTimer = 0;

  function previewAt(ev) {
    const lane = laneAtY(ev.clientY);
    if (lane.key === hoverLane) return;
    hoverLane = lane.key;
    wrap.className = wrap.className.replace(/\s*is-hover-\S+/g, '');
    wrap.classList.add('is-hover-' + lane.key);
    svg.classList.add('is-hovering');
    cue.textContent = '点这一行出「' + SAY[lane.key] + '」';
  }

  function clearPreview() {
    hoverLane = null;
    wrap.className = wrap.className.replace(/\s*is-hover-\S+/g, '');
    svg.classList.remove('is-hovering');
    cue.textContent = mode === 'manual'
      ? '在三条轨道上敲，或按空格 / F / J。点哪一行就响哪一行。'
      : STAGES[stage].hint;
  }

  svg.addEventListener('pointermove', (ev) => {
    if (mode !== 'manual') return;
    /* 拖动中不换预览（那时已经在打了） */
    if (!dragging) previewAt(ev);
  });
  svg.addEventListener('pointerleave', () => { if (!dragging) clearPreview(); });

  svg.addEventListener('pointerdown', (ev) => {
    if (mode !== 'manual') return;
    ev.preventDefault();
    svg.setPointerCapture && svg.setPointerCapture(ev.pointerId);
    dragging = true;
    /* **行决定乐器，列决定敲在哪一拍。**
       行锁定在按下的那一刻 —— 手指按住来回划的时候不该换乐器，
       那是"在一条弦上滑动"，不是"跳到另一条弦"。 */
    const laneKey = laneAtY(ev.clientY).key;
    const f = fracOfX(ev.clientX);
    strike(f, 'pointer', laneKey);
    /* 按住 = 连打。节奏 190ms 一下，接近手鼓的连击。 */
    let last = f;
    const move = (e) => { last = fracOfX(e.clientX); };
    svg.addEventListener('pointermove', move);
    clearInterval(heldTimer);
    heldTimer = setInterval(() => {
      if (mode !== 'manual') { clearInterval(heldTimer); return; }
      strike(last, 'pointer', laneKey);
    }, 190);
    const up = () => {
      dragging = false;
      clearInterval(heldTimer);
      svg.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', up);
    };
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);
  });

  /* 键盘：空格 / F / J。三个键都给，因为左右手都可能有习惯。
     位置按经验分：F 靠左（手鼓）、J 靠右（铁环）、空格中间（萨帕依）。

     **这里原来是坏的，用户报了"按空格没反应"，根因就是下面这个判断。**
     原写法：`if (tag === 'BUTTON' && ev.code === 'Space') return;`
     —— 本意是"焦点在按钮上时空格是在按按钮，别抢"。
     但代价是：只要用户点过**任何一个**按钮（模式切换、三段切换），
     焦点就留在那个按钮上，之后**空格永远敲不响**。
     用户的感觉就是"空格没反应"，而且看不到原因。

     正确的做法：**只在焦点落在一个真的会吃掉空格的表单控件上时才让路。**
     站内这一块自己的按钮（模式 / 段）都是用 click 处理的，
     浏览器对 <button> 的空格也是转成 click —— 我们 preventDefault
     拦下来不会让它们失灵（用户想切模式会用鼠标点或用 Tab+回车）。
     真正要让的是 input / textarea / select：那些地方空格是打字。

     ——顺带说清一个设计取舍——
     鼓是全站共用的"空格是敲鼓"这个约定（节奏台、序章鼓都是），
     所以空格优先给鼓，是这一站该有的行为。 */
  const TYPE_INPUTS = ['INPUT', 'TEXTAREA', 'SELECT'];
  function onKey(ev) {
    if (mode !== 'manual') return;
    const el2 = ev.target;
    const tag = (el2 && el2.tagName) || '';
    if (TYPE_INPUTS.indexOf(tag) >= 0) return;          // 在输入框里：让路
    if (el2 && el2.isContentEditable) return;           // 在可编辑区域：让路
    const map = { Space: 0.5, KeyF: 0.15, KeyJ: 0.85 };
    const frac = map[ev.code];
    if (frac === undefined) return;
    ev.preventDefault();
    strike(frac, 'key');
  }
  window.addEventListener('keydown', onKey);

  /* --------------------------------------------------------------- 模式 */

  function setModeLabel() {
    Array.from(modesBox.children).forEach((b) =>
      b.classList.toggle('is-on', b.dataset.mode === mode));
    wrap.classList.toggle('is-manual', mode === 'manual');
  }

  function setMode(m) {
    mode = m === 'demo' ? 'demo' : 'manual';
    setModeLabel();
    if (mode === 'manual') {
      stop();
      cue.textContent = '在轨道上敲，或按空格 / F / J。每一下都出声。';
    } else {
      cue.textContent = STAGES[stage].hint;
    }
  }

  modesBox.addEventListener('click', (e) => {
    const b = e.target.closest('.rlab__mode');
    if (!b) return;
    setMode(b.dataset.mode);
    /* 「听一遍」点了就该开始播；「我来打」点了就停掉示范。
       只切模式不驱动播放的话，用户点「听一遍」没反应。 */
    if (mode === 'demo') start(); else stop();
  });

  buildMarks();
  paintIdle();
  setMode('manual');
  setModeLabel();

  /* 自检用 */
  const api = {
    start, stop, setStage, setMode,
    get playing() { return playing; },
    get mode() { return mode; },
    /* 手动敲一下 —— 自检用它模拟"用户敲了"，不用去合成指针事件 */
    strike: (frac) => strike(frac === undefined ? 0.5 : frac, 'test'),
    state: () => ({
      playing,
      mode,
      stage,
      bpm: STAGES[stage].bpm,
      marks: marks.length,
      /* 记号的位置和力度 —— 自检据此判断"满的那段确实更密" */
      beats: marks.map((m) => ({ kind: m.kind, beat: m.beat })),
      ctxState: ctx ? ctx.state : 'none',
      /* 手动敲了几下、示范点亮了几次 —— "有没有真的在动"靠这两个数 */
      strikes: strikeCount,
      litTotal: litTotal,
      cutAt: STAGES[stage].cut || null,
      cue: cue.textContent,
      judge: judgeEl.textContent,
    }),
  };
  return api;
}
