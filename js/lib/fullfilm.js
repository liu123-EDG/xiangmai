/* ==========================================================================
   弦脉 · 满圈之后那支片子
   --------------------------------------------------------------------------
   用户的要求："点完那个圆，你加个窗口，然后播放一遍这个视频，
   然后自己渐渐消失。"

   所以它是一条**一次性的仪式**，不是播放器：
     满圈 → 主题曲起 → 黑幕拉开，片子放一遍
          → 放完自己渐渐消失 → 露出解锁后的页面
   不循环、不重播、不留按钮。看完了它就是看完了。

   三个设计决定，都说一下理由：
     ① 视频**静音**。现场已经有主题曲在放（满圈那一刻起），
        片子再带一条音轨只会和它打架。这也是压缩时只录画面流的原因。
     ② 给一个「跳过」。15 秒对已经点满 16 下的人来说不算短，
        不让跳就是把奖励变成惩罚。跳过 = 立刻淡出，不是关掉整段体验。
     ③ 满圈时若开了"减弱动效"，**不放片子**，直接解锁 ——
        这一条是给人的，不是给片子的。
   ========================================================================== */

const el = (tag, cls, html) => {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (html !== undefined) n.innerHTML = html;
  return n;
};

/* 两个尺寸。和站里其他视频同一个约定：
   桌面 960×540 / 手机 640×360，按视口宽挑。

   **路径由 base + 相对路径拼成，base 必须带尾斜杠。**
   踩过一次：base 传了 '..'（没尾斜杠），拼出来是 `..assets/...` ——
   少一个字符，浏览器把它当文件名，报的却是
   "MEDIA_ELEMENT_ERROR: Format error"（错误码 4），
   看着像文件坏了，其实是地址错了。下面会强制补斜杠。

   **不用站点根绝对路径（'/assets/...'）** —— 那在 file:// 下会指向
   磁盘根目录，整站双击打开就全瞎了。站里所有资源都是相对路径，这里也一样。 */
const SRC_DESKTOP = 'assets/video/full/full-circle-slim.webm';
const SRC_MOBILE = 'assets/video/full/full-circle-slim-m.webm';

const isDesktop = () => {
  try { return window.matchMedia('(min-width: 900px)').matches; } catch { return true; }
};

const FADE_IN = 1.1;     // 幕布淡入
const FADE_OUT = 1.8;    // 放完之后渐渐消失

/**
 * @param {object} opts
 * @param {string} [opts.base]   相对站点根的路径前缀（第四章是 '../' 或 ''）
 * @param {boolean} [opts.reduced] 减弱动效时直接跳过
 * @param {Function} [opts.onDone] 片子结束（或跳过）之后回调
 * @returns {{play: Function, skip: Function, state: Function}|null}
 */
export function buildFullCircleFilm(opts = {}) {
  /* base 强制补尾斜杠 —— 传 '..' 和传 '../' 都得能对上。
     少这个斜杠就是 `..assets/...`，浏览器报"格式错误"，
     极难从错误信息反推到"少了个斜杠"。 */
  let base = opts.base === undefined ? '' : String(opts.base);
  if (base && !base.endsWith('/')) base += '/';

  let box = null;
  let video = null;
  let skipBtn = null;
  let phase = 'idle';      // idle → in → playing → out → done
  let startedAt = 0;
  let outTimer = 0;
  let watchdog = 0;
  /* 收场的原因。**一定要记** —— 不记的话，出了问题只能看到
     "它很快就 done 了"，分不清是解码失败、被策略拒、还是真的放完了。 */
  let lastWhy = '';
  let lastErr = '';
  /* 片子是不是正在出声（用来保证 onStart / onDone 严格配对，
     不会出现"压了两次、只抬回一次"或者反过来）。 */
  let soundOn = false;

  function make() {
    if (box) return box;
    box = el('div', 'fullfilm');
    box.setAttribute('role', 'dialog');
    box.setAttribute('aria-label', '满圈之后的短片');
    box.setAttribute('aria-hidden', 'true');

    const inner = el('div', 'fullfilm__frame');
    video = document.createElement('video');
    video.className = 'fullfilm__video';
    /* **片子有声音。**
       一开始做成静音的，理由是"现场主题曲正在放，再加一条音轨会打架"。
       那是回避问题，不是解决 —— 作者拍的片子自带现场声，
       静音播等于把内容丢掉一半。
       正确做法是**压低另一条**：片子响的时候主题曲让位
       （onStart / onDone 回调，由调用方调 theme.setVolume），放完抬回来。
       对话时把背景音乐压下去，是这个场景的标准处理。

       muted 的初值仍是 true：有的浏览器对"带声自动播放"更严，
       真正起播前一行再放开（见 play() 里）。
       注意 setAttribute('muted') 只影响**初始**状态，
       运行时算数的是 video.muted 这个属性。 */
    video.muted = true;
    video.defaultMuted = true;
    video.playsInline = true;
    video.preload = 'none';
    video.setAttribute('muted', '');
    video.setAttribute('playsinline', '');
    /* 不设 aria-hidden：那会把这段短片从可访问性树里摘掉，
       而它是有内容的（带声音）。给个名字让人知道有多长。 */
    video.setAttribute('aria-label', '满圈之后的短片，约 15 秒，有声音');

    skipBtn = el('button', 'fullfilm__skip', '跳过');
    skipBtn.type = 'button';

    inner.appendChild(video);
    box.appendChild(inner);
    box.appendChild(skipBtn);
    document.body.appendChild(box);

    skipBtn.addEventListener('click', () => finish('用户跳过'));

    /* 兜底：webm 有时没时长元数据，ended 可能不触发。
       不能让幕布永远挂着 —— 那会把整页糊住（站里别的视频踩过这个坑）。 */
    video.addEventListener('ended', () => finish('播完'));
    video.addEventListener('error', () => {
      const e = video.error;
      lastErr = e ? ('code ' + e.code + (e.message ? ' ' + e.message : '')) : '未知';
      finish('解码失败 ' + lastErr);
    });
    video.addEventListener('stalled', () => { lastErr = 'stalled'; });
    video.addEventListener('abort', () => { lastErr = 'abort'; });
    /* 加载过程只记**最后一步**，不记全过程。
       排查时真正需要的是"走到哪一步断的" —— 全程日志在成品里是噪音。
       （这次就是靠 loadstart 那行看到 src 拼成了 `..assets/...`，
       而报错信息只有"格式错误"三个字，完全看不出是地址错了。） */
    video.addEventListener('loadstart', () => { lastErr = 'loadstart ' + video.getAttribute('src'); });
    video.addEventListener('loadedmetadata', () => {
      lastErr = 'loadedmetadata dur=' +
        (isFinite(video.duration) ? video.duration.toFixed(1) : String(video.duration));
    });
    video.addEventListener('canplay', () => { lastErr = 'canplay rs=' + video.readyState; });
    video.addEventListener('timeupdate', () => {
      /* 兜底：webm 常常没有时长元数据（duration = Infinity），
         这时这个判断不成立，靠下面的 watchdog 收场。
         有时长信息时，超过标称时长 0.6 秒还没 ended 就当它完了。 */
      if (video.duration && isFinite(video.duration) &&
          video.currentTime > video.duration + 0.6) finish('超时兜底');
    });

    return box;
  }

  function finish(why) {
    if (phase === 'out' || phase === 'done') return;
    lastWhy = why;
    phase = 'out';
    if (outTimer) { clearTimeout(outTimer); outTimer = 0; }
    if (watchdog) { clearTimeout(watchdog); watchdog = 0; }
    if (video) { try { video.pause(); } catch { /* 已停 */ } }
    if (box) {
      box.classList.remove('is-in');
      box.classList.add('is-out');
    }
    /* 主题曲抬回来 —— 一进入收场就抬，不等幕布淡完。
       幕布要淡 1.8 秒，等它淡完再抬音量，中间会有近两秒的静默空档。 */
    if (soundOn) { soundOn = false; if (opts.onDone) opts.onDone(why); }
    const wait = opts.reduced ? 0 : FADE_OUT * 1000;
    outTimer = setTimeout(() => {
      phase = 'done';
      if (box && box.parentNode) box.parentNode.removeChild(box);
      box = null; video = null; skipBtn = null;
    }, wait);
  }

  function play() {
    if (phase !== 'idle') return false;
    /* 减弱动效：不放，直接当它结束了。
       这一条是给人的，不是给片子的。 */
    if (opts.reduced) { phase = 'done'; if (opts.onDone) opts.onDone('减弱动效，跳过'); return false; }

    const b = make();
    const src = base + (isDesktop() ? SRC_DESKTOP : SRC_MOBILE);
    lastErr = 'play() ' + src;
    video.src = src;
    video.load();

    phase = 'in';
    startedAt = Date.now();
    // 下一帧再加类，保证 transition 真的跑起来
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        b.classList.add('is-in');
        b.setAttribute('aria-hidden', 'false');
      });
    });

    /* **放开静音**，然后立刻 play()。
       这两行必须在同一次手势的调用栈里 —— play() 是被点击触发的
       （用户刚点完第 16 下），这会儿还在用户激活窗口内，带声起播是允许的。
       放到 await 之后再做，激活就过期了，会退化成"被策略拒"。 */
    video.muted = false;
    const p = video.play();
    if (p && p.then) {
      p.then(() => {
        phase = 'playing';
        /* 真的响起来了，才让主题曲让位。
           ——为什么不在 play() 之前就压：万一起播被拒，
           片子没声、主题曲也压低了，变成两头都听不清。 */
        if (!soundOn) { soundOn = true; if (opts.onStart) opts.onStart(); }
      }).catch((e) => finish('自动播放被拒：' + ((e && e.name) || e)));
    } else {
      phase = 'playing';
      if (!soundOn) { soundOn = true; if (opts.onStart) opts.onStart(); }
    }

    /* 硬兜底：不管发生什么，25 秒之后一定收场。
       幕布挂住比不放片子严重得多。 */
    watchdog = setTimeout(() => finish('watchdog'), 25000);

    return true;
  }

  return {
    play,
    skip: () => finish('外部跳过'),
    state: () => ({
      phase,
      why: lastWhy,
      err: lastErr,
      hasBox: !!box,
      src: video ? (video.getAttribute('src') || '') : '',
      elapsed: startedAt ? +((Date.now() - startedAt) / 1000).toFixed(2) : 0,
      readyState: video ? video.readyState : null,
      networkState: video ? video.networkState : null,
      dur: video && isFinite(video.duration) ? +video.duration.toFixed(2) : null,
      t: video ? +video.currentTime.toFixed(2) : null,
      paused: video ? video.paused : null,
      // 给自检看：幕布是不是真的淡出掉了
      opacity: box ? +(+getComputedStyle(box).opacity).toFixed(3) : 0,
      inDom: !!(box && box.parentNode),
    }),
  };
}
