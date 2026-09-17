/* ==========================================================================
   弦脉 · 滚动分段
   --------------------------------------------------------------------------
   把"滚到哪儿 = 第几段"这件事抽出来，因为后续每一章都要用同一套逻辑：
   结构柱是天然的进度条，滚动本身就是操作，不需要任何控件。

   只负责算，不碰 DOM —— 由页面决定怎么渲染这个状态。
   ========================================================================== */

/**
 * @typedef {object} BandState
 * @property {number} progress   0..1 本章推进进度
 * @property {number} band       0..n 已点亮段数（0 = 还没开始）
 * @property {number} active    当前段索引（连续，用于着色器相位）
 * @property {number[]} lit      每段的点亮值 0..1，已做缓动
 */

export class BandScroller {
  /**
   * @param {HTMLElement} section 定义"一段有多长"的容器
   * @param {object} opts
   * @param {number[]} opts.thresholds 各段点亮的进度阈值
   * @param {number[]} [opts.anchors]  各状态对应的滚动锚点（供跳转用）
   * @param {number} [opts.count=3]    段数
   * @param {number} [opts.litUp=0.075]   点亮缓动速率
   * @param {number} [opts.litDown=0.024] 退暗缓动速率
   */
  constructor(section, opts = {}) {
    this.section = section;
    this.count = opts.count || 3;
    this.thresholds = opts.thresholds || [0.10, 0.40, 0.86];
    this.anchors = opts.anchors || [0.02, 0.16, 0.52, 0.97];
    this.litUp = opts.litUp === undefined ? 0.075 : opts.litUp;
    this.litDown = opts.litDown === undefined ? 0.024 : opts.litDown;

    this.band = -1;
    this.progress = 0;
    this.lit = new Float32Array(this.count);
    this._velocity = 0;
    this._lastY = window.scrollY || 0;
  }

  /** 读一次滚动位置，返回目标状态（lit 需要按帧推进，见 step） */
  read() {
    const top = this.section.offsetTop;
    const denom = Math.max(1, this.section.offsetHeight - window.innerHeight);
    const progress = Math.min(1, Math.max(0, (window.scrollY - top) / denom));

    let band = 0;
    for (let i = 0; i < this.thresholds.length; i++) {
      if (progress >= this.thresholds[i]) band = i + 1;
    }

    const raw = Math.min(1.4, Math.abs(window.scrollY - this._lastY) / 26);
    this._lastY = window.scrollY;
    this._velocity += (raw - this._velocity) * 0.10;

    this.progress = progress;
    return { progress, band, velocity: this._velocity };
  }

  /** 按帧推进点亮缓动；返回是否有段状态发生变化 */
  step(band) {
    const changed = band !== this.band;
    this.band = band;
    const litCount = Math.min(band, this.count);
    for (let i = 0; i < this.count; i++) {
      const want = i < litCount ? 1 : 0;
      const rate = want > this.lit[i] ? this.litUp : this.litDown;
      this.lit[i] += (want - this.lit[i]) * rate;
    }
    return changed;
  }

  /** 跳到某个状态（0 = 起始，1..count = 各段） */
  jumpTo(state, smooth = true) {
    const top = this.section.offsetTop;
    const denom = Math.max(1, this.section.offsetHeight - window.innerHeight);
    const a = this.anchors[Math.max(0, Math.min(this.anchors.length - 1, state))];
    window.scrollTo({ top: top + denom * a + 2, behavior: smooth ? 'smooth' : 'auto' });
  }

  get velocity() { return this._velocity; }

  /** 页面切到后台再回来时重置惯性，避免累积出一个巨大的差值 */
  resetVelocity() {
    this._lastY = window.scrollY;
    this._velocity = 0;
  }
}

/**
 * 给一个滚动容器绑定"只需算一次"的轻量节流，避免每帧都读 offsetHeight。
 * 返回取消函数。
 */
export function onScrollThrottled(fn) {
  let ticking = false;
  const handler = () => {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(() => { ticking = false; fn(); });
  };
  window.addEventListener('scroll', handler, { passive: true });
  return () => window.removeEventListener('scroll', handler);
}
