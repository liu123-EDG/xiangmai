/* 循环与时长诊断：连续跑 20 秒，记录每一次实际触发的时间戳。
   用户报"不会循环了" —— 那就看事件序列在时间上到底是不连续的还是真停了。 */
(function () {
  window.__XM_LOOP__ = async function (seconds) {
    const sec = seconds || 20;
    const seq = window.__XM_SEQ__;
    if (!seq) return JSON.stringify({ ok: false, err: '找不到音序器' });
    if (!seq.enable()) return JSON.stringify({ ok: false, err: 'enable 失败' });

    const t0 = seq.ctx.currentTime;
    const log = [];
    const orig = seq._hit.bind(seq);
    let err = null;
    seq._hit = function (kind, t, g, p) {
      log.push({ t: +(t - t0).toFixed(3), kind, band: seq.band, phrase: seq.phrase, step: seq.step });
      try { return orig(kind, t, g, p); } catch (e) { err = String(e && e.message || e); }
    };

    // 同时盯住调度器的推进状态，看 nextT 有没有被卡住
    const probes = [];
    const timer = setInterval(() => {
      probes.push({
        at: +(seq.ctx.currentTime - t0).toFixed(2),
        nextT: +(seq.nextT - t0).toFixed(2),
        step: seq.step,
        phrase: seq.phrase,
        band: seq.band,
        enabled: seq.enabled,
        timerAlive: !!seq.timer,
      });
    }, 1000);

    await new Promise((r) => setTimeout(r, sec * 1000));
    clearInterval(timer);
    seq._hit = orig;
    seq.disable();

    // 间隔分布
    const gaps = [];
    for (let i = 1; i < log.length; i++) gaps.push(+(log[i].t - log[i - 1].t).toFixed(3));
    const maxGap = gaps.length ? Math.max(...gaps) : 0;

    return JSON.stringify({
      ok: true,
      seconds: sec,
      total: log.length,
      first: log.slice(0, 6),
      last: log.slice(-6),
      maxGap,
      err,
      probes,
    });
  };
})();
