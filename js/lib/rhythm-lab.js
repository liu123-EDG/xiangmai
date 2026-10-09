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
      '</svg>' +
      '<p class="rlab__cue" aria-live="polite"></p>' +
    '</div>' +
    '<div class="rlab__bar">' +
      '<button class="rlab__play" type="button">▶ 听一遍</button>' +
      '<div class="rlab__stages" role="group" aria-label="三段节奏"></div>' +
    '</div>' +
    '<p class="rlab__note">' +
      '这三段节奏是为了演示<strong>「填满」</strong>和<strong>「切断」</strong>' +
      '这两个结构特征而设计的，<strong>不是某一套木卡姆的记谱</strong>。' +
      '真实节奏型与鼓点记法列在页末「本站还缺」里。' +
    '</p>';

  host.appendChild(wrap);

  const svg = wrap.querySelector('.rlab__svg');
  const lanesG = wrap.querySelector('.rlab__lanes');
  const marksG = wrap.querySelector('.rlab__marks');
  const head = wrap.querySelector('.rlab__playhead');
  const cue = wrap.querySelector('.rlab__cue');
  const playBtn = wrap.querySelector('.rlab__play');
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
  lanesG.innerHTML = LANES.map((L) =>
    '<text class="rlab__lane" x="8" y="' + (L.y + 4) + '">' + L.label + '</text>' +
    '<line class="rlab__lane-line" x1="' + PAD + '" y1="' + L.y +
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
    playBtn.textContent = '■ 停';
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
    playBtn.textContent = '▶ 听一遍';
    clearInterval(timer); timer = 0;
    cancelAnimationFrame(raf); raf = 0;
    queue = [];
    marks.forEach((m) => { m.hit = false; m.node.classList.remove('is-hit'); });
    cue.textContent = STAGES[stage].hint;
    paintIdle();
  }

  playBtn.addEventListener('click', () => { if (playing) stop(); else start(); });

  buildMarks();
  paintIdle();

  /* 自检用 */
  const api = {
    start, stop, setStage,
    get playing() { return playing; },
    state: () => ({
      playing,
      stage,
      bpm: STAGES[stage].bpm,
      marks: marks.length,
      /* 记号的位置和力度 —— 自检据此判断"满的那段确实更密" */
      beats: marks.map((m) => ({ kind: m.kind, beat: m.beat })),
      ctxState: ctx ? ctx.state : 'none',
      /* 播过之后亮起来过几个记号 —— 用来验"真的随鼓点动了" */
      litTotal: litTotal,
      cutAt: STAGES[stage].cut || null,
      cue: cue.textContent,
    }),
  };
  return api;
}
