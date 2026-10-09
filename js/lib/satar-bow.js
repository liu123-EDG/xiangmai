/* ==========================================================================
   弦脉 · 拉萨它尔（第二章 · 穹乃额曼）
   --------------------------------------------------------------------------
   指导老师：要"多一些交互"，而且要是沉浸式的，不是简单点击。

   这一章正文里有两句话，天生就该用手体会，而不是用眼睛读：

     ① 「开篇是**散板序唱**（木凯迪满）：主乐师奏响萨它尔，独唱者唱起
        「格则勒」体诗歌。没有伴唱，不打手鼓，**节奏自由**。」
        → 那就让人自己拉：**拖多快，声音就多快；停住，声音就停。**
          没有节拍器、没有打分 —— 散板本来就是自由的。

     ② 「萨它尔是最核心的乐器……它的角色是**定调者** ——
        奏出的旋律确立了整部木卡姆的「母调」。」
        → 页面底下那层持续音（drone）就是**母调**：它一直在响，
          你拉出来的音是在它上面走的。**拉之前先听见"母调"。**

   —— 声音是怎么做的 ——
     弓弦乐器不好用采样（没有素材），所以用合成：
     锯齿波过一条低通 + 慢起音（弓是"蹭"上去的，不是"点"一下），
     再加一条轻微失谐的第二振荡器 —— 两根弦的拍频，
     这也就是 drone 那一层在用同一个手法（让音"活"起来）。

   —— 音高怎么定 ——
     **不写死一个音阶。** 拖动的横向位置直接映射到一个连续的音高范围，
     为什么不做成"踩格子"：木卡姆的四分中立音本来就**不是十二平均律**，
     画成格子反而会给人"它就是一个普通音阶"的错觉。
     连续滑动更诚实 —— 也正好对应"散板"这两个字。
   ========================================================================== */

const SVGNS = 'http://www.w3.org/2000/svg';
const el = (tag, attrs, cls) => {
  const n = document.createElementNS(SVGNS, tag);
  for (const k in attrs) n.setAttribute(k, attrs[k]);
  if (cls) n.setAttribute('class', cls);
  return n;
};

/* 音高范围。以 drone 的基音（110Hz，A2）为"母调"，
   萨它尔在它上面两个八度里走 —— 这是"定调者"和"母调"的关系。 */
const DRONE_HZ = 110;
const LOW_HZ = DRONE_HZ * 2;          // 220
const HIGH_HZ = DRONE_HZ * 4;         // 440

/**
 * @param {object} opts
 * @param {HTMLElement} opts.host
 * @param {boolean} [opts.reduced]
 * @returns {{setActive:Function, state:Function}}
 */
export function buildSatarBow(opts = {}) {
  const host = opts.host;
  if (!host) return null;
  const reduced = !!opts.reduced;

  let ctx = null;
  let master = null;
  let voice = null;              // 当前正在响的那条弦
  let dragging = false;
  let bowFrac = 0.38;            // 弓在弦上的位置（0..1）
  let started = 0;               // 起弓的时刻（算"拉了多久"）
  let bows = 0;                  // 一共拉了多少弓（自检用）
  let active = true;

  const wrap = document.createElement('div');
  wrap.className = 'bow';
  wrap.innerHTML =
    '<div class="bow__stage">' +
      '<svg class="bow__svg" viewBox="0 0 900 260" role="img" ' +
        'aria-label="萨它尔：按住并左右拖动来拉弓">' +
        '<g class="bow__body"></g>' +
        '<g class="bow__strings"></g>' +
        '<line class="bow__bowhair" x1="0" y1="150" x2="0" y2="186" />' +
        '<circle class="bow__hand" r="15" />' +
        '<g class="bow__ripples"></g>' +
      '</svg>' +
      '<p class="bow__readout" aria-live="polite">' +
        '按住琴弦左右拖动 —— 这就是散板：没有节拍，快慢由你。' +
      '</p>' +
    '</div>' +
    '<p class="bow__note">' +
      '底下那层持续音是<strong>母调</strong>（穹乃额曼开头由萨它尔定下的调）。' +
      '你拉出来的音都走在它上面。' +
      '<br>这里<strong>没有对错、不计分</strong> —— 散板本来就不该有节拍器。' +
    '</p>';
  host.appendChild(wrap);

  const svg = wrap.querySelector('.bow__svg');
  const bodyG = wrap.querySelector('.bow__body');
  const stringsG = wrap.querySelector('.bow__strings');
  const hair = wrap.querySelector('.bow__bowhair');
  const hand = wrap.querySelector('.bow__hand');
  const ripplesG = wrap.querySelector('.bow__ripples');
  const readout = wrap.querySelector('.bow__readout');

  /* ---- 琴身 ----
     不做写实乐器（没有参考图，画出来一定是错的）。
     只画**能读懂的几根线**：细长的琴颈、一个大一点的共鸣箱、
     两根弦 —— 萨它尔是长颈、瓢形音箱、多弦，这里取最简的形。 */
  const NECK_X0 = 150, NECK_X1 = 620;
  const BODY_CX = 700, BODY_CY = 130, BODY_R = 62;
  bodyG.appendChild(el('path', {
    d: 'M ' + NECK_X0 + ' 128 L ' + NECK_X1 + ' 128 L ' + NECK_X1 + ' 136 L ' + NECK_X0 + ' 136 Z',
    class: 'bow__neck',
  }));
  bodyG.appendChild(el('ellipse', {
    cx: BODY_CX, cy: BODY_CY, rx: BODY_R, ry: BODY_R * 0.78, class: 'bow__box',
  }));
  /* 弦：两根，横跨整个琴颈 */
  [132, 134.5].forEach((y) => {
    stringsG.appendChild(el('line', {
      x1: NECK_X0 - 30, y1: y, x2: BODY_CX - 10, y2: y, class: 'bow__string',
    }));
  });

  /** 横向位置（0..1）→ 频率。连续，不量化。 */
  const hzOf = (f) => LOW_HZ * Math.pow(HIGH_HZ / LOW_HZ, Math.min(1, Math.max(0, f)));

  const ensure = () => {
    if (ctx) return ctx;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = 0.14;      // 比 drone 高一点：这是主角
    master.connect(ctx.destination);
    return ctx;
  };

  /** 起弓：建一条弦。慢起音 —— 弓是蹭上去的，不是点一下。 */
  function startBow(t, f) {
    const hz = hzOf(f);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.85, t + 0.14);   // 慢起音

    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.setValueAtTime(900, t);
    lp.frequency.linearRampToValueAtTime(2400, t + 0.2);
    lp.Q.value = 0.9;

    const o1 = ctx.createOscillator();
    o1.type = 'sawtooth';
    o1.frequency.setValueAtTime(hz, t);
    /* 第二根"弦"：微微失谐，产生拍频 —— 和 drone 同一个手法，
       让这个音听起来是"活的"，不是电子长音。 */
    const o2 = ctx.createOscillator();
    o2.type = 'sawtooth';
    o2.frequency.setValueAtTime(hz * 1.004, t);

    const g2 = ctx.createGain();
    g2.gain.value = 0.55;

    o1.connect(lp);
    o2.connect(g2).connect(lp);
    lp.connect(g).connect(master);
    o1.start(t); o2.start(t);

    return { g, lp, o1, o2, hz };
  }

  function stopBow(t) {
    if (!voice) return;
    const v = voice;
    voice = null;
    /* 收弓也要慢 —— 突然截断会"啪"一声。 */
    try {
      v.g.gain.cancelScheduledValues(t);
      v.g.gain.setValueAtTime(Math.max(0.0001, v.g.gain.value), t);
      v.g.gain.exponentialRampToValueAtTime(0.0001, t + 0.22);
      v.o1.stop(t + 0.26); v.o2.stop(t + 0.26);
    } catch { /* 已经停了 */ }
  }

  /** 拖动中：滑音 + 加一点揉弦（轻微的音高抖动）。
      揉弦幅度很小 —— 这是一把长颈弦乐器，不是小提琴。 */
  function slideTo(t, f) {
    if (!voice) return;
    const hz = hzOf(f);
    /* **把当前频率记下来。**
       `setTargetAtTime` 是给音频时钟排的，不反映在 `.value` 上 ——
       光读 oscillator.frequency.value 永远是最初那个数。
       自检要验"音高跟着位置走"，就得自己记（踩过）。 */
    voice.hz = hz;
    const vib = 1 + Math.sin((t - started) * 2 * Math.PI * 4.6) * 0.0032;
    try {
      voice.o1.frequency.setTargetAtTime(hz * vib, t, 0.04);
      voice.o2.frequency.setTargetAtTime(hz * 1.004 * vib, t, 0.04);
      voice.lp.frequency.setTargetAtTime(1100 + 1500 * f, t, 0.08);
    } catch { /* 正在换弦 */ }
  }

  /* ------------------------------------------------------------ 拖动 */

  const fracOf = (ev) => {
    const r = svg.getBoundingClientRect();
    return Math.min(1, Math.max(0, (ev.clientX - r.left) / r.width));
  };

  /** 画弓和手 —— 让"我在拉"这件事看得见 */
  const paint = () => {
    const r = svg.getBoundingClientRect();
    const x = bowFrac * 900;
    hair.setAttribute('x1', x); hair.setAttribute('x2', x);
    hand.setAttribute('cx', x); hand.setAttribute('cy', 168);
    wrap.style.setProperty('--bow-at', bowFrac.toFixed(3));
  };

  function down(ev) {
    if (!active) return;
    if (!ensure()) return;
    if (ctx.state === 'suspended') ctx.resume();
    ev.preventDefault();
    svg.setPointerCapture && svg.setPointerCapture(ev.pointerId);
    const t = ctx.currentTime + 0.01;
    if (!voice) {
      voice = startBow(t, fracOf(ev));
      started = t;
      bows++;
    }
    dragging = true;
    bowFrac = fracOf(ev);
    paint();
    svg.classList.add('is-bowing');
    readout.textContent = '拉着呢 —— 左右拖动改变音高，松手就停。';
  }

  function move(ev) {
    if (!dragging || !voice || !ctx) return;
    ev.preventDefault();
    bowFrac = fracOf(ev);
    slideTo(ctx.currentTime + 0.01, bowFrac);
    paint();
    newRipple();
  }

  function up() {
    if (!dragging) return;
    dragging = false;
    svg.classList.remove('is-bowing');
    if (ctx) stopBow(ctx.currentTime + 0.01);
    readout.textContent = '松手了 —— 这就是散板：起和停都由你。';
  }

  let rippleSeed = 0;
  function newRipple() {
    /* 拉弓时弦上荡出的圈：位置跟着手走，自己淡掉 */
    if (reduced) return;
    rippleSeed++;
    if (rippleSeed % 3 !== 0) return;      // 每三次移动画一个，不然太密
    const c = el('circle', { cx: bowFrac * 900, cy: 133, r: 6, class: 'bow__ripple' });
    ripplesG.appendChild(c);
    setTimeout(() => { if (c.parentNode) c.parentNode.removeChild(c); }, 900);
  }

  svg.addEventListener('pointerdown', down);
  svg.addEventListener('pointermove', move);
  window.addEventListener('pointerup', up);
  window.addEventListener('pointercancel', up);

  /* 键盘：左右方向键挪弓位。不做键盘起弓 —— 一条"按住"的交互
     用键盘表达不清楚，与其做个别扭的替代，不如明说它需要拖动。 */
  svg.addEventListener('keydown', (ev) => {
    if (ev.key !== 'ArrowLeft' && ev.key !== 'ArrowRight') return;
    ev.preventDefault();
    bowFrac = Math.min(1, Math.max(0, bowFrac + (ev.key === 'ArrowRight' ? 0.04 : -0.04)));
    paint();
    if (voice && ctx) slideTo(ctx.currentTime + 0.01, bowFrac);
  });
  svg.setAttribute('tabindex', '0');

  paint();

  return {
    /** 关掉交互（比如页面切到后台） */
    setActive: (v) => { active = !!v; if (!active) up(); },
    /** 自检用 */
    state: () => ({
      bows,
      voiceOn: !!voice,
      dragging,
      bowFrac: +bowFrac.toFixed(3),
      /* 当前音高。voice.hz 在 slideTo 里更新（不是读 oscillator.value ——
         那个反映不了 setTargetAtTime 排的目标值）。 */
      hz: voice ? Math.round(voice.hz) : null,
      ctxState: ctx ? ctx.state : 'none',
      readout: readout.textContent,
    }),
    /** 自检用：直接按位置起弓/滑音，不用合成指针事件 */
    _testBow: (f) => {
      if (!ensure()) return false;
      if (ctx.state === 'suspended') ctx.resume();
      const t = ctx.currentTime + 0.01;
      if (!voice) { voice = startBow(t, f); started = t; bows++; }
      else slideTo(t, f);
      bowFrac = f; paint();
      return true;
    },
    _testRelease: () => { if (ctx) stopBow(ctx.currentTime + 0.01); dragging = false; },
  };
}
