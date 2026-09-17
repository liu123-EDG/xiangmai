/* 音频探针：只在自检页注入。
   用真实 AudioContext 跑音序器，把主输出接进分析器，量 RMS / 峰值 / 频谱重心。
   听不到声音，但能量与频谱是可以量的。 */
(function () {
  function waitFor(fn, tries) {
    return new Promise((resolve, reject) => {
      let n = 0;
      (function tick() {
        if (fn()) return resolve(true);
        if (++n > (tries || 120)) return reject(new Error('等待超时'));
        setTimeout(tick, 100);
      })();
    });
  }

  /* 在引擎的输出节点后面插一个分析器，并统计一段时间 */
  function analyse(node, ms, ctx) {
    return new Promise((resolve) => {
      const an = ctx.createAnalyser();
      an.fftSize = 2048;
      an.smoothingTimeConstant = 0.2;
      node.connect(an);

      const time = new Float32Array(an.fftSize);
      const freq = new Uint8Array(an.frequencyBinCount);
      const nyq = (ctx.sampleRate || 44100) / 2;
      let peak = 0, sum = 0, n = 0, clipped = 0, frames = 0, active = 0;
      let cSum = 0, cN = 0;

      const timer = setInterval(() => {
        an.getFloatTimeDomainData(time);
        let fPeak = 0;
        for (let i = 0; i < time.length; i++) {
          const v = Math.abs(time[i]);
          if (v > peak) peak = v;
          if (v > fPeak) fPeak = v;
          if (v >= 0.999) clipped++;
          sum += time[i] * time[i];
          n++;
        }
        frames++;
        if (fPeak > 0.002) active++;                  // 这一帧有声
        an.getByteFrequencyData(freq);
        let num = 0, den = 0;
        for (let i = 0; i < freq.length; i++) { num += freq[i] * (i / freq.length) * nyq; den += freq[i]; }
        if (den > 0) { cSum += num / den; cN++; }
      }, 16);

      setTimeout(() => {
        clearInterval(timer);
        try { node.disconnect(an); } catch (e) {}
        resolve({
          rms: Math.sqrt(sum / Math.max(1, n)),
          peak,
          clipped,
          centroid: cN ? cSum / cN : 0,
          // 出声帧占比：比 RMS 更能说明"是不是真的一直在响"
          duty: frames ? active / frames : 0,
        });
      }, ms);
    });
  }

  window.__XM_AUDIO__ = async function () {
    try {
      await waitFor(() => window.__XM_SEQ__, 150);
      const seq = window.__XM_SEQ__;
      if (!seq) return JSON.stringify({ ok: false, err: '找不到音序器实例（页面未暴露 __XM_SEQ__）' });
      if (!seq.enable()) return JSON.stringify({ ok: false, err: 'enable() 返回 false' });

      const ctx = seq.ctx;
      const tap = seq.master;

      /* 数所有实际发声的事件 —— 包括脉冲轨。
         只统计主节奏会漏掉补点，低估密度。 */
      const kinds = {};
      let hits = 0;
      const origHit = seq._hit.bind(seq);
      seq._hit = function (kind, t, g, p) {
        hits++; kinds[kind] = (kinds[kind] || 0) + 1;
        return origHit(kind, t, g, p);
      };

      const bands = [];
      for (let b = 0; b < 3; b++) {
        seq.setBand(b);
        seq.phrase = 0;
        seq.step = 0;
        await new Promise((r) => setTimeout(r, 400));       // 等房间参数平滑到位
        hits = 0;
        for (const k in kinds) delete kinds[k];
        /* 窗口必须覆盖一整轮（四个乐句），否则会因为"这 3 秒里恰好没敲"
           得出错误结论 —— 穹乃额曼一个 dum 要等 6 秒。 */
        const st = await analyse(tap, 27000, ctx);
        bands.push({
          rms: st.rms, peak: st.peak, clipped: st.clipped,
          centroid: st.centroid, duty: st.duty, hits,
          kinds: Object.assign({}, kinds),
        });
      }
      seq._hit = origHit;

      /* 限幅对比：把压缩器旁路，量峰值。
         探针点取在压缩器之后（master），所以这里比较的是"压 vs 不压"的最终输出。 */
      let bypass = null;
      try {
        seq.setBand(2);
        await new Promise((r) => setTimeout(r, 300));
        const withComp = await analyse(tap, 2200, ctx);
        const th = seq.comp.threshold.value, ra = seq.comp.ratio.value;
        seq.comp.threshold.value = 0;
        seq.comp.ratio.value = 1;
        const withoutComp = await analyse(tap, 2200, ctx);
        seq.comp.threshold.value = th;
        seq.comp.ratio.value = ra;
        bypass = { withComp: withComp.peak, withoutComp: withoutComp.peak };
      } catch (e) { bypass = null; }

      seq.disable();
      return JSON.stringify({
        ok: true,
        ctxState: ctx.state,
        sampleRate: ctx.sampleRate,
        bands,
        bypass,
      });
    } catch (e) {
      return JSON.stringify({ ok: false, err: String(e && e.message || e) });
    }
  };
})();
