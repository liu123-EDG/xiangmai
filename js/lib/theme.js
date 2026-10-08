/* ==========================================================================
   弦脉 · 主题曲播放
   --------------------------------------------------------------------------
   用 Web Audio 播 mp3（不用 <audio> 标签），理由：
     · 能和已有的手鼓总线上共用一条链路，音量、淡入淡出一致
     · 能对着 context.currentTime 做精确的交叉淡入
     · 能无缝循环（AudioBufferSourceNode.loop）

   两个关键点（都踩过）：
     1) decodeAudioData 是异步的。第一次调用只启动加载，加载完自动接上播 ——
        不然"点完最后一下要立刻听到声音"会变成半秒空白。
     2) 一定要**自己 new 一个 AudioContext**，不能借用手鼓那个。
        两个独立的 context 在浏览器里会互相干扰（一个在跑，另一个不响）。

   ---------------------------------------------------------------------------
   **file:// 下走另一条路**（见文件末尾的 createThemeViaElement）
   ---------------------------------------------------------------------------
   双击 index.html 打开时，站点是 file:// 源，而：
     · fetch()   → 被 CORS 挡掉（Failed to fetch）
     · XHR       → 同
     · <audio>   → **能加载**（实测时长 29.92s 正常读出）
     · <audio> 接 createMediaElementSource → 被当作跨源，输出被静音（实测 rms=0）
   所以本地打开时用 <audio> 元素自己播 —— 放弃精确淡入，换回**有声音**。
   这条路上音量靠 element.volume，淡入用定时器推。
   ========================================================================== */

/** 一个简易主题曲播放器
 *  @param {string} url
 *  @param {object} [opts]
 *  @param {AudioContext} [opts.ctx] 复用已有的 AudioContext。
 *         不传就自己建一个 —— 但**同一个页面上最好只有一个**：
 *         两个独立的 context 会互相干扰（一个在跑、另一个不响），
 *         这是排查了很久才定位到的静音原因。 */
export function createTheme(url, opts = {}) {
  /* file:// 源下 fetch 拿不到本地文件，Web Audio 那条路整个不通。
     换 <audio> 元素实现 —— 接口一模一样，调用方不用改。 */
  if (typeof location !== 'undefined' && location.protocol === 'file:') {
    return createThemeViaElement(url, opts);
  }
  let ctx = opts.ctx || null;
  let buffer = null;
  let curUrl = url;
  const cache = new Map();     // url → AudioBuffer，换曲不用重新解码
  let loading = null;
  let src = null;              // 当前正在播的 source
  let gain = null;             // 当前 source 的增益
  let want = false;
  let waiting = false;        // 想播但 AudioContext 还没被唤醒
  let ctxWatched = false;     // 是否已经挂上 statechange 监听
  let volume = 0.55;          // 主题曲比手鼓略高，它要站得住

  /** 换用别的 AudioContext —— 页面上应该只有一个。 */
  const useContext = (c) => {
    if (!c || c === ctx) return;
    ctx = c;
    gain = null;              // 旧增益挂在上一个 context 上，作废
  };

  const ensureCtx = () => {
    if (ctx) return ctx;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
    return ctx;
  };

  /** 延迟建增益节点：必须挂在这个 context 上，且 context 变了要重建 */
  const ensureGain = () => {
    if (gain && gain.context === ctx) return gain;
    gain = ctx.createGain();
    gain.gain.value = 0;
    gain.connect(ctx.destination);
    return gain;
  };

  /** 取一段音频（带缓存）。任一 URL 只解码一次。 */
  const loadUrl = (u) => {
    if (cache.has(u)) return Promise.resolve(cache.get(u));
    const c = ensureCtx();
    if (!c) return Promise.resolve(null);
    return fetch(u)
      .then((r) => {
        if (!r.ok) throw new Error('http ' + r.status);
        return r.arrayBuffer();
      })
      .then((buf) => new Promise((res, rej) => {
        // Safari 只认回调形式，所以两种都接
        const p = c.decodeAudioData(buf, res, rej);
        if (p && p.then) p.then(res, rej);
      }))
      .then((buf) => { cache.set(u, buf); return buf; })
      .catch((e) => {
        if (window.console) console.warn('[弦脉] 音频加载失败 ' + u + '：', e && e.message);
        return null;
      });
  };

  const load = () => {
    if (buffer) return Promise.resolve(buffer);
    if (loading) return loading;
    loading = loadUrl(curUrl).then((buf) => { buffer = buf; return buf; });
    return loading;
  };

  /** 唤醒 AudioContext。必须在**真实用户手势**的调用栈里调用，浏览器才认。
      没有这个的话，在"没有手鼓"的页面上没人唤醒 context，
      主题曲会一直卡在 suspended —— 表现是"手势做了也不出声"。 */
  const resume = () => {
    const c = ensureCtx();
    if (!c) return Promise.resolve(false);
    if (c.state === 'running') return Promise.resolve(true);
    const p = c.resume();
    if (p && p.then) return p.then(() => c.state === 'running').catch(() => false);
    return Promise.resolve(c.state === 'running');
  };

  /** 起一个循环播放的 source，带淡入。每次换曲都新建一个 gain ——
      各曲各的增益，交叉淡入时互不干扰。 */
  const playBuffer = (buf, fade, from) => {
    const c = ensureCtx();
    if (!c) return null;
    const g = c.createGain();
    g.gain.value = 0.0001;
    g.connect(c.destination);
    const s = c.createBufferSource();
    s.buffer = buf;
    s.loop = true;
    s.connect(g);
    const t = c.currentTime;
    g.gain.cancelScheduledValues(t);
    g.gain.setValueAtTime(from === undefined ? 0.0001 : Math.max(0.0001, from), t);
    g.gain.linearRampToValueAtTime(volume, t + fade);
    s.start(t);
    return { s, g };
  };

  /** 开始播放（带淡入）。第一次调用会先解码，好了自动响。
   *
   *  AudioContext 可能是 suspended（页面还没有用户手势）。
   *  这里**自己负责唤醒**：先 resume，等 state 变成 running 再起播。
   *  早期版本直接 return 等调用方来唤醒 —— 结果在没有手鼓的页面
   *  （附录）没人唤醒它，一直干等，表现就是"点了没声"。 */
  const start = (fadeSec) => {
    want = true;
    const c = ensureCtx();
    if (!c) return false;

    const fade = fadeSec === undefined ? 2.2 : fadeSec;
    const begin = () => {
      if (!want || !buffer) return;
      const cc = ensureCtx();
      if (cc.state === 'suspended') {
        waiting = true;
        // 先试着唤醒；唤醒成功后 statechange 会再叫我们一次
        const p = cc.resume();
        if (p && p.then) p.then(() => { if (cc.state !== 'suspended') begin(); }).catch(() => {});
        return;
      }
      waiting = false;
      if (src) {                                   // 已经在放，只把音量拉回去
        gain.gain.cancelScheduledValues(cc.currentTime);
        gain.gain.setTargetAtTime(volume, cc.currentTime, fade / 3);
        return;
      }
      const next = playBuffer(buffer, fade, 0.0001);
      if (next) { src = next.s; gain = next.g; }
    };

    // 上下文醒了就自动接上（浏览器在用户第一次手势后会把 state 推到 running）
    if (!ctxWatched) {
      ctxWatched = true;
      c.addEventListener('statechange', () => {
        if (want && !src && c.state === 'running') begin();
      });
    }

    if (buffer) { begin(); return true; }
    load().then(begin);
    return true;
  };

  /** 被 resume 之后调用：把之前因为 suspended 而没起得来的那次播出去 */
  const wake = (fadeSec) => {
    if (!want || !buffer) return false;
    const c = ensureCtx();
    if (!c || c.state === 'suspended') return false;
    if (src) return true;
    const next = playBuffer(buffer, fadeSec === undefined ? 2.2 : fadeSec, 0.0001);
    if (next) { src = next.s; gain = next.g; }
    waiting = false;
    return true;
  };

  const stop = (fadeSec) => {
    want = false;
    if (!ctx || !src || !gain) return;
    const fade = fadeSec === undefined ? 1.2 : fadeSec;
    const t = ctx.currentTime;
    gain.gain.cancelScheduledValues(t);
    gain.gain.setTargetAtTime(0, t, fade / 3);
    const s = src;
    src = null;
    try { s.stop(t + fade * 1.6); } catch { /* 已经停了 */ }
  };

  const setVolume = (v) => {
    volume = Math.max(0, Math.min(1, v));
    if (ctx && src && gain) gain.gain.setTargetAtTime(volume, ctx.currentTime, 0.3);
  };

  /** 起一个循环播放的 source，带淡入。每次换曲都新建一个 gain ——
      各曲各的增益，交叉淡入时互不干扰。 */
  

  /** 换一段音频并交叉淡入。正在播时换曲不会留空白。
      滚动驱动的场景切换会频繁调用，所以：目标没变就直接返回。 */
  const crossfadeTo = (newUrl, fadeSec) => {
    if (!newUrl || newUrl === curUrl) return Promise.resolve(false);
    const fade = fadeSec === undefined ? 1.6 : fadeSec;
    return loadUrl(newUrl).then((buf) => {
      if (!buf) return false;
      curUrl = newUrl;
      buffer = buf;
      const old = src, oldGain = gain;
      const c = ensureCtx();
      if (c && c.state === 'suspended') { const p = c.resume(); if (p && p.then) p.catch(() => {}); }
      const next = playBuffer(buf, fade, 0.0001);
      if (next) { src = next.s; gain = next.g; }
      if (old) {
        try {
          const t = c.currentTime;
          oldGain.gain.cancelScheduledValues(t);
          oldGain.gain.setValueAtTime(Math.max(0.0001, oldGain.gain.value), t);
          oldGain.gain.linearRampToValueAtTime(0.0001, t + fade);
          old.stop(t + fade + 0.1);
        } catch { try { old.stop(); } catch { /* 已停 */ } }
      }
      return true;
    });
  };

  /* 自检用：报告真实状态，而不是"我觉得应该响了" */
  const state = () => ({
    ready: !!buffer,
    playing: !!src,
    waiting,
    url: curUrl,
    cached: cache.size,
    ctxState: ctx ? ctx.state : 'none',
    gain: ctx && gain ? +gain.gain.value.toFixed(4) : -1,
    volume,
    duration: buffer ? +buffer.duration.toFixed(2) : 0,
  });

  return {
    start, stop, setVolume, state, useContext, wake, crossfadeTo, loadUrl, resume,
    preload: load,
    get playing() { return !!src; },
    get waiting() { return waiting; },
    get ready() { return !!buffer; },
    get url() { return curUrl; },
    get duration() { return buffer ? buffer.duration : 0; },
  };
}

/* ==========================================================================
   弦脉 · file:// 下的主题曲播放（<audio> 元素版）
   --------------------------------------------------------------------------
   为什么单独写一个：
     双击 index.html 打开时站点是 file:// 源。实测四条路只有一条通：
       fetch()  → Failed to fetch（CORS）
       XHR      → onerror
       <audio>  → **通**，时长正常读出
       <audio> + createMediaElementSource → 元素能播，但**输出被静音**
                 （file:// 下元素算跨源，rms 实测 0）
     所以本地打开时用 <audio> 自己播，**不接 Web Audio**。

   取舍（明说）：
     · 放弃：精确的交叉淡入、和手鼓共用一条总线、无缝循环（元素 loop 有极短间隙）
     · 换回：**有声音**
   对一个"离线运行"的作品来说，"双击能听见"比"淡入更精确"重要得多。

   接口与原版**完全一致** —— 调用方一行都不用改。
   ========================================================================== */
function createThemeViaElement(url, opts = {}) {
  let curUrl = url;
  let audio = null;
  let want = false;
  let volume = 0.55;
  let fadeTimer = 0;
  let pendingUrl = null;

  const cap = (v) => Math.max(0, Math.min(1, v));

  /** 取（或建）承载音频的元素。opts.ctx 在这一版里用不上，忽略。 */
  const ensure = () => {
    if (audio) return audio;
    audio = new Audio();
    audio.preload = 'auto';
    audio.loop = true;
    audio.volume = 0;
    audio.addEventListener('error', () => {
      if (window.console) {
        console.warn('[弦脉] file:// 下音频加载失败 ' + curUrl +
          '（本地打开时元素加载一般可用；若仍失败，用 node tools/serve.mjs 起本地服务器）');
      }
    });
    audio.addEventListener('ended', () => { if (want && audio) audio.play().catch(() => {}); });
    return audio;
  };

  /** 用定时器做音量渐变 —— element.volume 没有 setTargetAtTime。 */
  const fadeTo = (target, sec) => {
    if (!audio) return;
    if (fadeTimer) { clearInterval(fadeTimer); fadeTimer = 0; }
    const from = audio.volume;
    const dur = Math.max(0.05, sec || 0) * 1000;
    const t0 = Date.now();
    if (dur <= 60) { audio.volume = cap(target); return; }
    fadeTimer = setInterval(() => {
      if (!audio) { clearInterval(fadeTimer); fadeTimer = 0; return; }
      const p = Math.min(1, (Date.now() - t0) / dur);
      audio.volume = cap(from + (target - from) * p);
      if (p >= 1) { clearInterval(fadeTimer); fadeTimer = 0; }
    }, 40);
  };

  const start = (fadeSec) => {
    want = true;
    const a = ensure();
    /* 什么时候要显式 load()：
         · 还没有源（第一次起播）
         · 有源但 readyState 还是 0 —— 说明元素压根没去取数据
       第二种是真踩过的坑：preload() 会先把 src 设上但不触发加载，
       然后 start() 看到"已经有源"就跳过 load，元素永远停在 readyState 0，
       表现就是"点了没声、时长读成 0"（第五章）。 */
    if (!a.getAttribute('src') || a.readyState === 0) {
      a.src = curUrl;
      a.load();
    }
    const fade = fadeSec === undefined ? 2.2 : fadeSec;
    const p = a.play();
    if (p && p.catch) p.catch(() => {});     // 没手势时会被拒，交给调用方再试
    fadeTo(volume, fade);
    return true;
  };

  const stop = (fadeSec) => {
    want = false;
    if (!audio) return;
    fadeTo(0.0001, fadeSec === undefined ? 1.0 : fadeSec);
    const a = audio;
    setTimeout(() => { if (!want && a) { try { a.pause(); } catch { /* 已停 */ } } },
      Math.max(80, (fadeSec === undefined ? 1.0 : fadeSec) * 1000 + 60));
  };

  const setVolume = (v) => {
    volume = cap(v);
    if (audio && !audio.paused) fadeTo(volume, 0.4);
    return volume;
  };

  /** 换曲：元素直接换 src。先淡出再换，避免"咔"的一声。 */
  const crossfadeTo = (next, fadeSec) => {
    if (!next || next === curUrl) return Promise.resolve(false);
    const fade = fadeSec === undefined ? 1.2 : fadeSec;
    pendingUrl = next;
    fadeTo(0.0001, fade);
    return new Promise((res) => {
      setTimeout(() => {
        curUrl = next;
        pendingUrl = null;
        const a = ensure();
        a.src = curUrl;
        a.load();
        if (want) { const p = a.play(); if (p && p.catch) p.catch(() => {}); }
        fadeTo(want ? volume : 0.0001, fade);
        res(true);
      }, Math.max(80, fade * 1000 + 60));
    });
  };

  return {
    start, stop, setVolume, crossfadeTo,
    /* 这一版没有 AudioContext —— 报 'element'，别假装有。
       自检看到它就知道走的是本地那条路。 */
    state: () => ({
      ready: !!(audio && audio.readyState >= 1),
      playing: !!(audio && !audio.paused && want),
      waiting: false,
      url: curUrl,
      cached: 0,
      ctxState: 'element',
      gain: audio ? +audio.volume.toFixed(4) : -1,
      volume,
      duration: audio && isFinite(audio.duration) ? +audio.duration.toFixed(2) : 0,
      /* 这几个是给自检用的：证明播放头真的在走，而不是"我觉得应该响了"。
         （元素不挂在 DOM 上，所以查不到，只能从这里读。） */
      readyState: audio ? audio.readyState : -1,
      networkState: audio ? audio.networkState : -1,
      actualSrc: audio && audio.src ? audio.src.split(String.fromCharCode(47)).slice(-4).join(String.fromCharCode(47)) : null,
      errCode: audio && audio.error ? audio.error.code : null,
      currentTime: audio && isFinite(audio.currentTime) ? +audio.currentTime.toFixed(2) : 0,
      viaElement: true,
    }),
    useContext: () => {},                    // 这一版用不到，留着不报错
    wake: (fadeSec) => { if (want) start(fadeSec); },
    loadUrl: (u) => { curUrl = u || curUrl; const a = ensure(); a.src = curUrl; return Promise.resolve(null); },
    resume: () => Promise.resolve(),
    /* 预加载：建元素、设源，但**不主动 load**。
       真正的加载交给 start() —— 那里会判断 readyState 再决定要不要 load。
       这里若也 load，会和 start 抢，出现"刚加载又从头来"。 */
    preload: () => { ensure(); return Promise.resolve(null); },
    get playing() { return !!(audio && !audio.paused && want); },
    get waiting() { return false; },
    get ready() { return !!(audio && audio.readyState >= 1); },
    get url() { return curUrl; },
    get duration() { return audio && isFinite(audio.duration) ? audio.duration : 0; },
    get pending() { return pendingUrl; },
  };
}

/* ==========================================================================
   自动播放：挂在第一次用户交互上
   --------------------------------------------------------------------------
   浏览器不允许"无交互自动播放"。所以做法是：**监听第一次手势**
   （滚动、点按、按键），一有动作就把声音打开 —— 用户不需要去找按钮。

   这一章的鼓点、萨帕依、主题曲都是内容的一部分，不该让人先找开关。
   **默认开**：按钮一开始就显示"开"，第一次交互自动起。
   声音按钮仍然保留：关掉之后就不再自动开。
   ========================================================================== */
export function autoPlayOnGesture(opts) {
  const { theme, seq, band } = opts;
  let armed = true;
  const btn = document.getElementById('sound-toggle');
  const text = document.getElementById('sound-text');

  const markOn = () => {
    if (btn) btn.setAttribute('aria-pressed', 'true');
    if (text) text.textContent = '声音 开';
  };
  const markOff = () => {
    if (btn) btn.setAttribute('aria-pressed', 'false');
    if (text) text.textContent = '声音 关';
  };

  /* 默认开：先把标签落成"开"，和下面第一次手势自动起保持一致。
     只写标签不放声音是骗人，所以这个"开"必须配自动起。 */
  markOn();

  const on = () => {
    if (!armed) return;
    armed = false;
    detach();
    if (seq && !seq.enabled) seq.enable();
    if (seq) {
      if (band !== undefined) seq.setBand(band);
      // 主题曲复用手鼓的 context —— 一个页面只留一个 AudioContext
      if (theme && seq.ctx) theme.useContext(seq.ctx);
    }
    /* 关键：**在这里唤醒 context 并起播**。
       有手鼓的页面由 seq.enable() 顺手唤醒；没有手鼓的页面
       （比如第三章，它只有配乐）必须自己来，否则一直 suspended。
       resume() 要在手势的调用栈里同步发起，浏览器才放行。

       **这里原来是 theme.wake()，那是错的。**
       wake() 只对"已经在播、被暂停"的 theme 有效；第一次进来
       theme 从没 start 过，wake 什么也不做 ——
       表现就是"这一页明明只有配乐，却一点声都没有"（用户报的第三章）。
       现在改成 resume 之后 start()，跟下面 startTheme 那条路一致。 */
    if (theme) {
      const fade = opts.fade === undefined ? 2.6 : opts.fade;
      const p = theme.resume();
      if (p && p.then) {
        p.then(() => {
          if (!theme) return;
          /* startTheme:false 的页面（第四章）**不能**在这里起播 ——
             它的主题曲要等圆圈点满才响。但 context 必须借这次手势
             跑起来，否则等点满时没手势可用，照样没声。 */
          if (opts.startTheme === false) theme.wake(fade);
          else if (!theme.playing) theme.start(fade);
        });
      }
    }
    markOn();
  };

  const evs = ['pointerdown', 'touchstart', 'keydown', 'wheel', 'scroll'];
  const detach = () => evs.forEach((e) => window.removeEventListener(e, on));
  evs.forEach((e) => window.addEventListener(e, on, { passive: true }));
  /* 自检用把手：外部能就此确认"手势监听到底绑上没有"。
     排查第五章"第一次手势不响"时加上的，留着有用 —— 很小，且只在 window 上挂一个对象。 */
  window.__XM_APG__ = {
    attached: evs.slice(), detached: false,
    get armed() { return armed; },
    theme: !!theme, seq: !!seq,
  };

  /* 自动开之后，声音按钮**必须由这一页的音乐接管**。
     之前只写了"关掉就不再自动开"，按钮仍挂在别处（比如手鼓）——
     结果按"声音 开"打开的是鼓点，不是这一页的音乐（踩过）。
     所以这里用捕获阶段接管：开/关都作用在 theme 上。 */
  if (btn && opts.ownButton !== false) {
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopImmediatePropagation();
      const isOn = btn.getAttribute('aria-pressed') === 'true';
      armed = false;
      detach();
      if (isOn) {
        if (theme) theme.stop(1.0);
        if (seq) seq.disable();
        markOff();
        return;
      }
      if (seq && !seq.enabled) seq.enable();
      if (seq && band !== undefined) seq.setBand(band);
      if (theme && seq && seq.ctx) theme.useContext(seq.ctx);
      if (theme) {
        const p = theme.resume();
        if (p && p.then) p.then(() => { if (theme) theme.start(1.4); });
      }
      markOn();
    }, true);
  }

  return { trigger: on, get armed() { return armed; } };
}

/* ==========================================================================
   解锁标记
   --------------------------------------------------------------------------
   互动完成后才允许进其他民族的页面。标记写在 localStorage，
   所以刷新、换页都还在。

   说明：这是**引导**，不是安全机制 —— 真想绕过的人清一下浏览器数据就行。
   目的是让人按设计的顺序走一遍，不是防谁。
   ========================================================================== */
const KEY = 'xiangmai.unlocked.mashrap';

export const unlock = {
  get done() {
    try { return localStorage.getItem(KEY) === '1'; } catch { return false; }
  },
  set() {
    try { localStorage.setItem(KEY, '1'); } catch { /* 隐私模式写不了，忽略 */ }
    window.dispatchEvent(new CustomEvent('xiangmai:unlocked'));
  },
  clear() {
    try { localStorage.removeItem(KEY); } catch { /* 忽略 */ }
  },
};
