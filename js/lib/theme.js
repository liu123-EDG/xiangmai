/* ==========================================================================
   弦脉 · 主题曲播放
   --------------------------------------------------------------------------
   用 Web Audio 播 mp3（不用 <audio> 标签），理由：
     · 能和已有的手鼓总线上共用一条链路，音量、淡入淡出一致
     · 能对着 context.currentTime 做精确的交叉淡入
     · 能无缝循环（AudioBufferSourceNode.loop）
   decodeAudioData 是异步的，所以第一次调用只启动加载，
   加载完自动接上播。这点对"玩家点完最后一下要立刻听到声音"很重要。
   ========================================================================== */

/** 一个简易主题曲播放器 */
export function createTheme(url) {
  let ctx = null;
  let buffer = null;
  let loading = null;
  let src = null;
  let gain = null;
  let want = false;
  let volume = 0.42;

  const ensureCtx = () => {
    if (ctx) return ctx;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
    gain = ctx.createGain();
    gain.gain.value = 0;
    gain.connect(ctx.destination);
    return ctx;
  };

  const load = () => {
    if (buffer) return Promise.resolve(buffer);
    if (loading) return loading;
    const c = ensureCtx();
    if (!c) return Promise.resolve(null);
    loading = fetch(url)
      .then((r) => {
        if (!r.ok) throw new Error('http ' + r.status);
        return r.arrayBuffer();
      })
      .then((buf) => new Promise((res, rej) => {
        // Safari 只认回调形式
        const p = c.decodeAudioData(buf, res, rej);
        if (p && p.then) p.then(res, rej);
      }))
      .then((buf) => { buffer = buf; return buf; })
      .catch((e) => {
        if (window.console) console.warn('[弦脉] 主题曲加载失败：', e && e.message);
        return null;
      });
    return loading;
  };

  /** 开始播放（带淡入）。第一次调用会先解码，好了自动响。 */
  const start = (fadeSec) => {
    want = true;
    const c = ensureCtx();
    if (!c) return false;
    if (c.state === 'suspended') c.resume();

    const fade = fadeSec === undefined ? 2.2 : fadeSec;
    const begin = () => {
      if (!want || !buffer) return;
      if (src) { // 已经在放
        gain.gain.cancelScheduledValues(c.currentTime);
        gain.gain.setTargetAtTime(volume, c.currentTime, fade / 3);
        return;
      }
      src = c.createBufferSource();
      src.buffer = buffer;
      src.loop = true;                    // 34 秒，循环铺底
      src.connect(gain);
      const t = c.currentTime;
      gain.gain.cancelScheduledValues(t);
      gain.gain.setValueAtTime(0.0001, t);
      gain.gain.linearRampToValueAtTime(volume, t + fade);
      src.start(t);
    };

    if (buffer) { begin(); return true; }
    load().then(begin);
    return true;
  };

  const stop = (fadeSec) => {
    want = false;
    if (!ctx || !src) return;
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
    if (ctx && src) gain.gain.setTargetAtTime(volume, ctx.currentTime, 0.3);
  };

  return {
    start, stop, setVolume,
    preload: load,
    get playing() { return !!src; },
    get ready() { return !!buffer; },
    get duration() { return buffer ? buffer.duration : 0; },
  };
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
