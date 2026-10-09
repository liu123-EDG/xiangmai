/* ==========================================================================
   弦脉 · 八个音的声音（附录「一条旋律，八个音」）
   --------------------------------------------------------------------------
   指导老师：要"多一些交互"，而且要沉浸式的。
   附录那张旋律图原来是**只看的**：悬停显示说明、点击进分页，
   随滚动只是游标在走 —— 说是"一条旋律"，其实一声没响。

   现在滚过去就响。**「一条旋律，八个音」不再只是一句话。**

   —— 音是怎么定的 ——
   这八个音在图上是有音高的（HERITAGE 的 pitch 字段，1 最低、每 +1 升半格）。
   所以声音直接按那个字段算，**不另编一套**：
   图上那个音画在哪儿，它听起来就是那个高度。图和声是同一份数据。

   音色：拨弦。用两个衰减正弦（基音 + 八度泛音）叠一下 ——
   比纯正弦有"弦"的感觉，又不至于像电子琴。
   每个民族的音色略有差别（泛音多少不同），但不做花哨的处理：
   这一块的重点是"听得出来高低"，不是音色炫技。

   为什么不用 _dum/_tek 那套鼓：那是打击乐，没有音高。
   这里是旋律，要能听出 do re mi。
   ========================================================================== */

/** 五声音阶（宫商角徵羽），从 A3 起。用五声是因为这些民族音乐
    大量用五声框架，随便挑一个音都不会难听。 */
const PENTATONIC = [0, 2, 4, 7, 9];
const BASE_HZ = 220;          // A3

/** pitch（1..13）→ 频率。每 +1 升半格，五声框架内循环。 */
function hzOfPitch(pitch) {
  const step = Math.max(0, Math.round(pitch) - 1);
  const oct = Math.floor(step / PENTATONIC.length);
  const deg = step % PENTATONIC.length;
  const semi = PENTATONIC[deg] + oct * 12;
  return BASE_HZ * Math.pow(2, semi / 12);
}

/**
 * @param {object} [opts]
 * @param {number} [opts.volume=0.16]
 */
export function createMelodyVoice(opts = {}) {
  let ctx = null;
  let master = null;
  const volume = opts.volume === undefined ? 0.16 : opts.volume;
  let played = 0;              // 自检用：一共响了几声

  const ensure = () => {
    if (ctx) return ctx;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = volume;
    master.connect(ctx.destination);
    return ctx;
  };

  /**
   * 响一声。
   * @param {number} pitch  音高（HERITAGE 里的 pitch）
   * @param {object} [o]
   * @param {number} [o.tone]  泛音多少（0..1），默认 0.35
   */
  function play(pitch, o = {}) {
    if (!ensure()) return false;
    /* context 可能是 suspended（用户还没交互过）。
       滚轮不算手势，所以这里只能尽力唤醒 ——
       真正保证有声音的是 autoPlayOnGesture 那次首交互。 */
    if (ctx.state === 'suspended') ctx.resume();
    const t = ctx.currentTime + 0.008;
    const hz = hzOfPitch(pitch);
    const dur = o.dur === undefined ? 1.25 : o.dur;
    const tone = o.tone === undefined ? 0.35 : o.tone;

    /* 基音：指数衰减，像被拨了一下 */
    const g1 = ctx.createGain();
    g1.gain.setValueAtTime(0.0001, t);
    g1.gain.exponentialRampToValueAtTime(0.9, t + 0.006);
    g1.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    const o1 = ctx.createOscillator();
    o1.type = 'triangle';
    o1.frequency.setValueAtTime(hz, t);
    o1.connect(g1).connect(master);
    o1.start(t); o1.stop(t + dur + 0.05);

    /* 八度泛音：短、轻 —— 给"弦"的质感 */
    const g2 = ctx.createGain();
    g2.gain.setValueAtTime(0.0001, t);
    g2.gain.exponentialRampToValueAtTime(0.9 * tone, t + 0.004);
    g2.gain.exponentialRampToValueAtTime(0.0001, t + dur * 0.5);
    const o2 = ctx.createOscillator();
    o2.type = 'sine';
    o2.frequency.setValueAtTime(hz * 2, t);
    o2.connect(g2).connect(master);
    o2.start(t); o2.stop(t + dur * 0.55);

    played++;
    return true;
  }

  return {
    play,
    /** 只管唤醒，不出声。首次交互时调一次 —— 有了 running 的 context，
        后面滚动才有声音。 */
    arm: () => { const c = ensure(); if (c && c.state === 'suspended') c.resume(); return !!c; },
    state: () => ({
      played,
      ctxState: ctx ? ctx.state : 'none',
      volume,
    }),
  };
}
