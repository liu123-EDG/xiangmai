/* ==========================================================================
   弦脉 · 传承之路
   --------------------------------------------------------------------------
   角色扮演：你是一名非遗传承人。两个场景，每个场景做一次选择。

   规则（用户定的）：
     · 两个选项要**很分明**，一眼看得出哪个对哪个错
     · 选错 → 播「失传」的视频 + 一句"这条路会失去什么" → 闪回，只能重选
     · 选对 → 播「活着」的视频 + 一个真实的传承案例 → 下一场景
     · 两个场景走完 → 结尾（结尾页稍后再做，这里先留位）

   视频还没做。没有视频时不报错、不空白，退化成场景自带的底色 ——
   机制照常能走完，素材到位后把 VIDEOS 里的路径填上就行。

   **案例人物我不编。** 名字、年份、做了什么，必须由用户核实后填。
   编一个错的放上去，是把错的东西教给别人 —— 比不做更糟。
   ========================================================================== */

const $ = (s, r) => (r || document).querySelector(s);

/* ------------------------------------------------------------------ 素材 */
/* 视频在 assets/video/inherit/ 下。
   桌面用 960×540（*-slim.webm），手机用 640×360（*-slim-m.webm）——
   和概念片同一套做法。素材没到位就退化成 CSS 底色，机制照常能走。 */
const VIDEO_DIR = '../assets/video/inherit/';
const MOBILE = !window.matchMedia('(min-width: 900px)').matches;
const SUF = MOBILE ? '-slim-m.webm' : '-slim.webm';
const V = {
  gobi:     'gobi' + SUF,        // 场景一 环境
  qonLive:  'qon-live' + SUF,    // 场景一 选对：文化活着
  qonLost:  'qon-lost' + SUF,    // 场景一 选错：文化失传
  qonCase:  'qon-case' + SUF,    // 场景一 成功案例
  steppe:   'steppe' + SUF,      // 场景二 环境
  tibLive:  'tib-live' + SUF,    // 场景二 选对
  tibLost:  'tib-lost' + SUF,    // 场景二 选错
  tibCase:  'tib-case' + SUF,    // 场景二 成功案例
};

/* ------------------------------------------------------------------ 剧本 */
const SCENES = [
  {
    id: 'gobi',
    kicker: '第一幕 · 戈壁',
    bg: 'gobi',
    intro: {
      title: '你来到了新疆的戈壁滩',
      text: '风把沙子推过地面。你面前是一整套十二木卡姆——' +
            '它要二十多个小时才能唱完，靠口传，一个师父带一拨徒弟。' +
            '你手上有一次机会，只能做一件事。你做什么？',
    },
    choices: [
      {
        ok: false,
        label: '把木卡姆的旋律录下来，带回城市，放进音乐厅里保存。',
        say: '你带走了旋律，但没有人再唱它。',
        tail: '十二木卡姆终究没能走出戈壁。',
        video: 'qonLost',
      },
      {
        ok: true,
        label: '留在戈壁，找到还在唱的人，跟着他学，把它唱给下一个愿意听的人。',
        say: '你留了下来。',
        tail: '只要还有人在唱，它就没有断。',
        video: 'qonLive',
        caseRef: 'qon',
      },
    ],
  },
  {
    id: 'steppe',
    kicker: '第二幕 · 草原',
    bg: 'steppe',
    intro: {
      title: '你来到了无垠的草原',
      text: '高原上的风一直没停。这里有一种说唱，艺人要连着讲好几天，' +
            '学的人得跟着师父一句一句背。' +
            '你还是只有一次机会。你做什么？',
    },
    choices: [
      {
        ok: false,
        label: '把格萨尔史诗翻译成文字，印成书，放进图书馆。',
        say: '你记下了故事，但没有人再讲它。',
        tail: '藏族文化终究没能走出草原。',
        video: 'tibLost',
      },
      {
        ok: true,
        label: '坐在草原上，听他说，跟着他学，让下一个孩子也能听见。',
        say: '你坐了下来。',
        tail: '风还在吹，故事还在往下讲。',
        video: 'tibLive',
        caseRef: 'tib',
      },
    ],
  },
];

/* 成功案例。**人名与事实由用户提供，不是我编的。** */
const CASES = {
  qon: {
    name: '玉苏普·托合提',
    year: '莎车县木卡姆文化传承中心 · 传承人',
    fact: '带出 20 多名徒弟，年龄最小的仅 20 岁。',
  },
  tib: {
    name: '桑珠',
    year: '西藏那曲 · 格萨尔说唱艺人 · 2009 年入选国家级非遗代表性传承人',
    fact: '能唱 60 多部《格萨尔》。',
  },
};

/* ------------------------------------------------------------------ 状态 */
const state = { scene: 0, phase: 'intro', tried: 0 };

/* ------------------------------------------------------------------ 构建 */
export function buildInheritGame(opts = {}) {
  const host = $('#inherit');
  if (!host) return null;

  const bg = $('#g-bg', host);
  const kicker = $('#g-kicker', host);
  const title = $('#g-title', host);
  const text = $('#g-text', host);
  const choices = $('#g-choices', host);
  const caseEl = $('#g-case', host);
  const nextBtn = $('#g-next', host);
  const progress = $('#g-progress', host);

  const reduced = !!opts.reduced;

  /* 视频：一段一个元素，按需挂 src。
     取不到就什么都不显示，露出底色 —— 不报错、不留空白框。 */
  let videoEl = null;
  function makeVideo() {
    if (videoEl) return videoEl;
    videoEl = document.createElement('video');
    videoEl.muted = true;
    videoEl.playsInline = true;
    videoEl.preload = 'none';
    videoEl.setAttribute('aria-hidden', 'true');
    videoEl.className = 'g-video';
    bg.appendChild(videoEl);
    return videoEl;
  }

  /** 播一段视频；没有素材就静默退化成底色 */
  function playVideo(key, onDone) {
    const file = V[key];
    if (!file || reduced) { onDone(); return; }
    const v = makeVideo();
    let settled = false;
    const finish = () => { if (!settled) { settled = true; onDone(); } };
    v.onerror = finish;                       // 文件不在 → 直接往下走
    v.onended = finish;
    v.src = VIDEO_DIR + file;
    v.classList.add('is-on');
    v.play().then(() => {
      /* 播起来之后再挂一个兜底：万一 ended 不触发（webm 有时没时长元数据），
         也不至于卡在这一步。 */
      setTimeout(finish, 12000);
    }).catch(finish);
  }

  function clearVideo() {
    if (!videoEl) return;
    try { videoEl.pause(); } catch {}
    videoEl.classList.remove('is-on');
    videoEl.removeAttribute('src');
  }

  function setBg(kind) {
    host.dataset.bg = kind || '';
  }

  /* ---------------------------------------------------------- 渲染各阶段 */
  function renderIntro() {
    const s = SCENES[state.scene];
    state.phase = 'intro';
    clearVideo();
    setBg(s.bg);
    kicker.textContent = s.kicker;
    title.textContent = s.intro.title;
    text.textContent = s.intro.text;
    caseEl.hidden = true;
    nextBtn.hidden = true;
    progress.textContent = '第 ' + (state.scene + 1) + ' / ' + SCENES.length + ' 幕';

    choices.hidden = false;
    choices.innerHTML = '';
    s.choices.forEach((c, i) => {
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
    const s = SCENES[state.scene];
    const c = s.choices[i];
    choices.hidden = true;
    hideOthers();
    if (c.ok) {
      state.phase = 'right';
      title.textContent = c.say;
      text.textContent = c.tail;
      setBg(s.bg);
      playVideo(c.video, () => {
        // 活着那段播完，接着给成功案例
        showCase(c.caseRef);
      });
    } else {
      state.phase = 'wrong';
      state.tried++;
      title.textContent = c.say;
      text.textContent = c.tail;
      setBg(s.bg + '-lost');
      /* **闪回按钮立刻出现**，不等视频播完。
         这里踩过一次：原来把 showRetry 挂在视频的 ended 回调里，
         结果视频一发 ended（或者没时长元数据不触发），
         玩家就卡在失败画面**没有出口** —— 而"选错必须能重选"
         是这个游戏的核心规则，不能依赖视频播放是否顺利。 */
      showRetry();
      playVideo(c.video, () => {});
    }
  }

  function hideOthers() {
    caseEl.hidden = true;
    nextBtn.hidden = true;
  }

  function showRetry() {
    nextBtn.hidden = false;
    nextBtn.textContent = '回到选择';
    nextBtn.onclick = () => renderIntro();
  }

  function showCase(ref) {
    const c = CASES[ref];
    state.phase = 'case';
    setBg(SCENES[state.scene].bg);
    playVideo(SCENES[state.scene].choices.find((x) => x.ok).video === 'qonLive'
      ? 'qonCase' : 'tibCase', () => {});
    if (c) {
      caseEl.hidden = false;
      caseEl.innerHTML =
        '<span class="g-case__name">' + c.name + '</span>' +
        '<span class="g-case__year">' + c.year + '</span>' +
        '<span class="g-case__fact">' + c.fact + '</span>';
    }
    nextBtn.hidden = false;
    const last = state.scene >= SCENES.length - 1;
    nextBtn.textContent = last ? '继续' : '前往下一幕';
    nextBtn.onclick = () => {
      if (last) showEnding();
      else { state.scene++; renderIntro(); }
    };
  }

  /* 结尾页稍后再做 —— 这里先停住，写清楚下一步是什么 */
  function showEnding() {
    state.phase = 'end';
    clearVideo();
    setBg('end');
    kicker.textContent = '终章';
    title.textContent = '你把它带出来了';
    text.textContent = '两处地方，两次选择，两样文化都还在。' +
      (state.tried ? '你走过一次弯路——那条路上没有人。' : '');
    hideOthers();
    /* 把选项**内容也清掉**，不只是隐藏。
       光靠 hidden 不够稳：.g-choices 上有 display: grid，
       它会盖掉 hidden 属性自带的 display:none，
       结果"隐藏"了的按钮照样显示（踩过，截图里和结尾页叠在一起）。
       CSS 那边已经补了 [hidden] 规则，这里再把内容清空，双保险。 */
    choices.hidden = true;
    choices.innerHTML = '';
    progress.textContent = '（结尾页待做）';
  }

  renderIntro();

  /* 自检用：可以问当前状态，也可以直接跳到某一幕 */
  return {
    state: () => JSON.parse(JSON.stringify(state)),
    scenes: () => SCENES.map((s) => s.id),
    goScene: (i) => { state.scene = Math.max(0, Math.min(SCENES.length - 1, i)); renderIntro(); },
    choose,
  };
}
