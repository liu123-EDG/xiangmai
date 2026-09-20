/* ==========================================================================
   弦脉 · 传承之路 · 游戏引擎
   --------------------------------------------------------------------------
   数据驱动：剧本全部在 levels-data.js 里，这个文件只管"怎么演"。
   加一关不用碰这里。

   规则（用户定的）：
     · 两个选项要**很分明**，一眼看得出哪个对哪个错
     · 选错 → 播「失传」的视频 + 一句后果 → 闪回，只能重选
     · 选对 → 播「活着」的视频 → 播「成功案例」→ 收束
   ========================================================================== */
import { LEVELS, levelByKey, playableLevels } from './levels-data.js';

const $ = (s, r) => (r || document).querySelector(s);

/* ------------------------------------------------------------------ 素材 */
/* 视频在 assets/video/inherit/ 下。桌面 960×540、手机 640×360 —— 和概念片同一套。 */
const VIDEO_DIR = '../assets/video/inherit/';
const MOBILE = !window.matchMedia('(min-width: 900px)').matches;
const SUF = MOBILE ? '-slim-m.webm' : '-slim.webm';
const V = {
  gobi:     'gobi' + SUF,
  qonLive:  'qon-live' + SUF,
  qonLost:  'qon-lost' + SUF,
  qonCase:  'qon-case' + SUF,
  steppe:   'steppe' + SUF,
  tibLive:  'tib-live' + SUF,
  tibLost:  'tib-lost' + SUF,
  tibCase:  'tib-case' + SUF,
};

/* ------------------------------------------------------------------ 状态 */
/* phase 记录走到哪一步了：
     intro 正在选 · right 选对了（放"活着"）· wrong 选错了（放"失传"）
     case  正在看成功案例 · end 收束
   自检靠它判断进度。
   （重写引擎时我把它漏掉了，测试一直报 "没收束：undefined" —— 补回来。） */
const state = { phase: 'intro', tried: 0 };
let LEVEL = null;

/* ------------------------------------------------------------------ 构建 */
export function buildInheritGame(opts = {}) {
  const host = $('#inherit');
  if (!host) return null;

  LEVEL = levelByKey(opts.level || 'muqam') || playableLevels()[0];
  if (!LEVEL) return null;

  const bg = $('#g-bg', host);
  const kicker = $('#g-kicker', host);
  const title = $('#g-title', host);
  const text = $('#g-text', host);
  const choices = $('#g-choices', host);
  const caseEl = $('#g-case', host);
  const nextBtn = $('#g-next', host);
  const progress = $('#g-progress', host);

  const reduced = !!opts.reduced;

  /* 标题和小标签由数据决定，页面不用自己写 */
  if (kicker) kicker.textContent = LEVEL.kicker || '';
  if (progress) progress.textContent = LEVEL.name || '';

  /* ---- 视频 ----
     两个元素：
       introV  场景环境片（戈壁 / 草原），**循环**放着当背景
       videoEl 选对/选错/案例那几段，播完触发回调

     原来这两个用的是同一个元素，而且**环境片根本没被播过** ——
     数据里定义了 gobi / steppe，代码里却只有 clearVideo()，
     用户看到的是一片纯色底（"这一页我记得背景也有是视频吧，视频呢"）。
     分开之后各管各的：环境片一直循环，剧情片轮流上。 */
  let videoEl = null;
  let introV = null;

  function makeEl() {
    const v = document.createElement('video');
    v.muted = true;
    v.playsInline = true;
    v.preload = 'none';
    v.setAttribute('aria-hidden', 'true');
    v.className = 'g-video';
    bg.appendChild(v);
    return v;
  }

  function makeVideo() {
    if (!videoEl) videoEl = makeEl();
    return videoEl;
  }

  /** 环境片：循环播放，当背景用。切场景（重玩 / 换关）时换源。 */
  function playIntroVideo(key) {
    const file = key && V[key];
    if (!file || reduced) return;
    if (!introV) introV = makeEl();
    // 已经在放同一段就不重来，免得每次 renderIntro 都闪一下
    if (introV.dataset.key === key && !introV.paused) return;
    introV.dataset.key = key;
    introV.loop = true;            // 环境片要循环
    introV.src = VIDEO_DIR + file;
    introV.classList.add('is-on');
    const p = introV.play();
    if (p && p.catch) p.catch(() => {});   // 起不来就露出底色，不报错
  }

  function stopIntroVideo() {
    if (!introV) return;
    try { introV.pause(); } catch {}
    introV.classList.remove('is-on');
  }

  /** 播一段剧情视频；没有素材就静默退化成底色，不让流程断掉 */
  function playVideo(key, onDone) {
    const file = key && V[key];
    if (!file || reduced) { if (onDone) onDone(); return; }
    const v = makeVideo();
    let settled = false;
    const finish = () => { if (!settled) { settled = true; if (onDone) onDone(); } };
    v.onerror = finish;
    v.onended = finish;
    v.loop = false;                // 剧情片不循环
    v.src = VIDEO_DIR + file;
    v.classList.add('is-on');
    v.play().then(() => {
      /* 兜底：webm 有时没时长元数据，ended 可能不触发，
         不能让回调永远等下去（踩过）。 */
      setTimeout(finish, 12000);
    }).catch(finish);
  }

  function clearVideo() {
    if (videoEl) {
      try { videoEl.pause(); } catch {}
      videoEl.classList.remove('is-on');
      videoEl.removeAttribute('src');
    }
  }

  function setBg(kind) { host.dataset.bg = kind || ''; }

  /* ---------------------------------------------------------- 各阶段 */
  function renderIntro() {
    state.phase = 'intro';
    state.tried = 0;
    clearVideo();                       // 清掉上一段剧情片
    setBg(LEVEL.scene);
    /* 环境片循环放着当背景 —— 戈壁 / 草原。
       这是"你来到了某处"那一段，没有它这一屏就只是一块纯色。 */
    playIntroVideo(LEVEL.scene);
    title.textContent = LEVEL.intro.title;
    text.textContent = LEVEL.intro.text;
    caseEl.hidden = true;
    nextBtn.hidden = true;

    choices.hidden = false;
    choices.innerHTML = '';
    LEVEL.choices.forEach((c, i) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'g-choice';
      b.dataset.ok = c.ok ? '1' : '0';
      b.innerHTML = '<span class="g-choice__key">' + (i === 0 ? 'A' : 'B') + '</span>' +
                    '<span class="g-choice__label">' + c.label + '</span>';
      b.addEventListener('click', () => choose(i));
      choices.appendChild(b);
    });
  }

  function choose(i) {
    const c = LEVEL.choices[i];
    stopIntroVideo();   // 剧情片要盖上来，环境片让开
    choices.hidden = true;
    caseEl.hidden = true;
    nextBtn.hidden = true;
    title.textContent = c.say;
    text.textContent = c.tail;
    if (c.ok) {
      state.phase = 'right';
      setBg(LEVEL.scene);
      playVideo(c.video, () => showCase());
    } else {
      state.phase = 'wrong';
      state.tried++;
      setBg(LEVEL.scene + '-lost');
      /* **闪回按钮立刻出现**，不等视频播完。
         原来挂在 ended 回调里，视频一旦不触发 ended，
         玩家就卡在失败画面没有出口 —— 而"选错必须能重选"
         是这个游戏的核心规则，不能依赖视频播得顺不顺（踩过）。 */
      showRetry();
      playVideo(c.video, () => {});
    }
  }

  function showRetry() {
    nextBtn.hidden = false;
    nextBtn.textContent = '回到选择';
    nextBtn.onclick = () => renderIntro();
  }

  function showCase() {
    state.phase = 'case';
    setBg(LEVEL.scene);
    playVideo(LEVEL.choices.find((x) => x.ok).caseVideo, () => {});
    const c = LEVEL.case;
    if (c) {
      caseEl.hidden = false;
      caseEl.innerHTML =
        '<span class="g-case__name">' + c.name + '</span>' +
        '<span class="g-case__year">' + c.year + '</span>' +
        '<span class="g-case__fact">' + c.fact + '</span>';
    }
    nextBtn.hidden = false;
    nextBtn.textContent = '这一关走完了';
    nextBtn.onclick = () => showEnding();
  }

  function showEnding() {
    state.phase = 'end';
    clearVideo();
    stopIntroVideo();
    setBg('end');
    title.textContent = '你把它带出来了';
    text.textContent = state.tried
      ? '你走过一次弯路——那条路上没有人。现在它还在。'
      : '你一次就走对了。现在它还在。';
    caseEl.hidden = true;
    /* 把选项**内容也清掉**，不只是隐藏。
       .g-choices 上有 display: grid，会盖掉 hidden 自带的 display:none，
       结果"隐藏"了的按钮照样显示（踩过，两屏叠在一起）。 */
    choices.hidden = true;
    choices.innerHTML = '';
    if (typeof opts.onDone === 'function') {
      nextBtn.hidden = false;
      nextBtn.textContent = opts.doneLabel || '回到旋律图';
      nextBtn.onclick = () => opts.onDone();
    } else {
      nextBtn.hidden = true;
    }
  }

  renderIntro();

  return {
    state: () => JSON.parse(JSON.stringify(state)),
    level: () => LEVEL,
    choose,
    replay: renderIntro,
  };
}

/** 入口卡片要用：哪些关能玩、哪些还差内容 */
export function levelSummary() {
  const playable = playableLevels();
  const pending = LEVELS.filter((L) => !playable.includes(L));
  return { playable, pending, total: LEVELS.length };
}
