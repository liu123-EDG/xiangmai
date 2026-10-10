import { createGuideActor } from './guide-actor.js';
/* Virtual companions: local, curated chapter conversations. No remote chat service. */
const CHARACTERS = [
  { id: 'uyghur', name: '弦歌', culture: '维吾尔族主题', role: '听见旋律的变化', color: '#81b69c', intro: '从一声琴音开始，我陪你听完这一程。', file: 'xiange.png', atlas: 'xiange-motion-v2.png' },
  { id: 'miao', name: '银铃', culture: '苗族主题', role: '发现音乐里的故事', color: '#a4b7e1', intro: '每一段音乐都有故事，我们一起慢慢发现。', file: 'yinling.png', atlas: 'yinling-motion-v2.png' },
  { id: 'mongol', name: '青岚', culture: '蒙古族主题', role: '探索声音的联系', color: '#d6af70', intro: '跟着声音往前走，看看不同的音乐如何相遇。', file: 'qinglan.png', atlas: 'qinglan-motion-v2.png' },
];
const KEY = 'xiangmai.guide.v1';
const AUTO_KEY = 'xiangmai.guide.auto.v1';
const TOPICS = {
  qon: {
    title: '第二章 · 穹乃额曼',
    hello: '这一章先听“自由”，再听节拍怎样进入。想从哪里开始？',
    topics: [
      ['这一章先听什么？', '先留意散板序唱：节奏自由，人声与弦乐展开。接着听手鼓进入后，音乐怎样逐步走向有节拍的推进。'],
      ['为什么开篇没有手鼓？', '这一页介绍的开篇是散板序唱，没有固定节拍。萨它尔的旋律确立母调，进入太孜等节拍性段落后，手鼓才建立节奏框架。'],
      ['带我试试拉琴', '拖动琴弓，听声音跟着手势变化：你拖多快，它就多快；你停，它就停。底下的持续音托住你拉出的旋律。', '#bow-act'],
    ],
    hints: [
      ['#part-body > .act', '从这里开始，试着留意：自由的散板，怎样逐步走进有节拍的音乐。'],
      ['#bow-act', '轮到你来拉琴了。拖动琴弓，让“节奏自由”变成手里的感觉。'],
    ],
  },
  dastan: {
    title: '第三章 · 达斯坦', hello: '现在走进叙事。留意歌曲和器乐间奏怎样轮流把故事往前推。',
    topics: [
      ['达斯坦有什么不同？', '这一章的核心是叙事。歌曲与器乐间奏交替推进，整体速度逐渐上升，和前一章盘旋展开的听感不同。'],
      ['间奏只是休息吗？', '这页把歌曲理解为“说”，器乐间奏理解为“歇并推进”。间奏既给叙事换气，也继续推动情绪。'],
      ['谁在讲故事？', '主演者称为“达斯坦奇”，常自弹自唱，助演者击节或帮腔。可以到“主要乐器及角色”一节，看演唱与伴奏怎样分工。', '#part-body > .act:nth-child(3)'],
    ],
    hints: [['#part-body > .act', '这一章的线索是故事。试着分辨：什么时候在“说”，什么时候器乐接过了叙事。']],
  },
  mashrap: {
    title: '第四章 · 麦西热甫', hello: '从听故事走向下场参与。我们可以先试节奏，再加入舞圈。',
    topics: [
      ['这章怎样体验？', '先到节奏台自己敲一段，再到舞圈逐个加入人物。想感受落在拍上的时刻，可以打开“跟着鼓点跳”。'],
      ['带我敲一段', '在节奏轨道上敲，观察手鼓与铁环的记号怎样亮起来。页面里的合成节奏用于说明结构，不是某套木卡姆的原始记谱。', '#rlab-act'],
      ['一起进入舞圈', '点击舞圈会加入人物，鼓点与纹样随人数变化。自由加入模式随时可点；踩拍模式让你体会跟上鼓点的时刻。', '#mq-act'],
    ],
    hints: [['#rlab-act', '试着亲手敲一段。你会同时听到声音、看到节奏记号亮起来。'], ['#mq-act', '我们一起进圈吧！想试一试跟拍，可以打开圆圈下方的“跟着鼓点跳”。']],
  },
  lishi: {
    title: '第五章 · 历史与传承', hello: '这一章看看音乐怎样被记录、整理，又怎样继续在人与人之间传下去。',
    topics: [
      ['从哪里开始看？', '先沿时间轴看渊源，再看经典化与抢救记录，最后留意当代运用。它们讲的是同一条传承链的不同环节。', '#act-1'],
      ['录音能代替传承吗？', '记录保存了声音，传习延续了人的经验。可以把本章的抢救记录与传承案例放在一起看：资料与活态实践各自承担什么。'],
      ['带我看看当代案例', '到本章末尾看看当代运用，再比较：音乐进入新的场景时，哪些表达延续了，哪些呈现发生了变化。', '.cases-host'],
    ],
    hints: [['#act-1', '这条时间轴把渊源串起来了。你也可以问我，接下来哪一段值得留意。'], ['.cases-host', '来到当代案例了。试着把这些场景和前面读到的传统形式联系起来。']],
  },
  fulu: {
    title: '附录 · 形制比较', hello: '这里把结构变成可以操作的轮盘与旋律入口。我们换一种方式回看全站。',
    topics: [
      ['怎样使用轮盘？', '点击轮盘中的条目，观察读数怎样变化，把名称与前面章节的结构联系起来。', '#wheel-act'],
      ['带我听八音', '到八音旋律区操作声音，再进入对应民族的档案。这里是探索入口，各民族的音乐形态还需要分别了解。', '#melody-act'],
      ['这些声音来自哪里？', '页面提供了“参考来源”一节。示意声音与真实资料的区别，要以该节的具体说明为准。', '#sources-host'],
    ],
    hints: [['#wheel-act', '试着选一个轮盘条目，让前面读到的名称和结构连起来。'], ['#melody-act', '不同民族的声音入口都在这里。选一个感兴趣的，再去档案里深入看。']],
  },
  bain: {
    title: '八音 · 八族档案', hello: '每张档案卡都是一个新的入口。我们可以按声音、故事或乐器来探索。',
    topics: [
      ['这里有哪些内容？', '这里集中展示壮族、蒙古族、侗族、满族、苗族、彝族、傣族与藏族的相关档案。点击卡片可以阅读具体形式和资料来源。', '#hub'],
      ['怎样比较这些音乐？', '先看每页的音乐或叙事形式，再看演唱、乐器与传承场景。不同地区和传统各有特点，不必把它们归成同一种音乐。'],
      ['资料来源在哪里？', '各民族档案页分别列出资料来源；部分内容来自作者提供的文档，其他内容给出可打开的公开资料链接。'],
    ], hints: [['#hub', '从这里选一张档案卡。我们的同行者会陪你进入下一页。']],
  },
};

export function mountCompanion({ active }) {
  if (document.getElementById('guide-dock')) return null;
  const script = [...document.scripts].find(s => /\/js\/dist\/[^/]+\.js(?:\?|$)/.test(s.src));
  if (!script) return null;
  const root = new URL('../../', script.src);
  const asset = file => new URL('assets/img/guides/' + file, root).href;
  const stylesheet = document.createElement('link');
  stylesheet.rel = 'stylesheet';
  stylesheet.href = new URL('styles/companion.css', root).href;
  document.head.appendChild(stylesheet);
  const read = (key, fallback) => { try { return localStorage.getItem(key) || fallback; } catch { return fallback; } };
  const save = (key, value) => { try { localStorage.setItem(key, value); } catch { /* Keep this visit usable without storage. */ } };
  let selected = CHARACTERS.find(c => c.id === read(KEY, '')) || null;
  let auto = read(AUTO_KEY, '1') !== '0';
  let shown = false;
  let timer = 0;
  let stateTimer = 0;
  let actor = null;
  let arrivalTimer = 0;
  let arrivalLines = [];
  let arrivalIndex = -1;
  let arrivalActive = false;
  let lastHint = -Infinity;
  let lastInteraction = -Infinity;
  const seen = new Set();
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const dock = document.createElement('aside');
  dock.id = 'guide-dock';
  dock.className = 'guide-dock';
  dock.hidden = !selected;
  dock.dataset.state = 'idle';
  dock.innerHTML = '<div class="guide-hint" hidden><button class="guide-hint__close" type="button" aria-label="关闭这条提示">×</button><span class="guide-hint__eyebrow">同行者的悄悄话</span><p aria-live="polite"></p><div class="guide-hint__steps" hidden><span></span><button type="button" class="guide-hint__next">下一句 →</button></div><button class="guide-hint__talk" type="button">继续聊聊 ↗</button></div>' +
    '<section class="guide-dialog" id="guide-dialog" aria-label="同行者对话" hidden>' +
    '<header><div><span class="guide-dialog__eyebrow">你的同行者</span><h2></h2></div><button class="guide-dialog__close" type="button" aria-label="收起对话">×</button></header>' +
    '<p class="guide-dialog__chapter"></p><p class="guide-dialog__reply" aria-live="polite"></p>' +
    '<div class="guide-dialog__topics"></div><button class="guide-dialog__go" type="button" hidden>带我去体验 ↗</button>' +
    '<footer><button class="guide-dialog__switch" type="button">更换同行者</button><label><input type="checkbox" class="guide-auto">沿途提示</label></footer>' +
    '</section><button class="guide-launcher" type="button" aria-controls="guide-dialog" aria-expanded="false"><img alt="" decoding="async"><span></span><i aria-hidden="true"></i></button>';
  document.body.appendChild(dock);
  const launcher = dock.querySelector('.guide-launcher');
  const dialog = dock.querySelector('.guide-dialog');
  const hint = dock.querySelector('.guide-hint');
  const reply = dock.querySelector('.guide-dialog__reply');
  const topics = dock.querySelector('.guide-dialog__topics');
  const go = dock.querySelector('.guide-dialog__go');
  const autoInput = dock.querySelector('.guide-auto');
  let destination = null;
  let selectionRegion = null;

  function page() {
    if (document.getElementById("inherit-act")) return {
      title: "传承之路 · " + (document.getElementById("g-title")?.textContent || "情境体验"),
      hello: "我们来到情境体验了。先读故事，再做自己的选择。",
      topics: [
        ["这一关怎么玩？", "阅读当前情境，选择你认为能帮助传承的做法，再观察故事的反馈。这是一段概念情境体验。", "#inherit-act"],
        ["这些影像是真实记录吗？", "站内对这两处关卡影像的说明是：AI 生成的概念影像，场景与人物虚构，不是实拍记录。"],
        ["体验后可以想一想什么？", "把自己的选择和故事反馈放在一起想：保存资料、学习实践与继续传习，分别怎样让一种传统延续？"],
      ], hints: [],
    };
    if (document.body.dataset.ethnic) {
      const title = document.title.split('｜')[0];
      const excerpt = document.querySelector('.h-p')?.textContent || '阅读这份档案，了解具体音乐形式与资料来源。';
      return { title, hello: '我们来到新的民族档案了。先看这页自己的形式与资料，再和其他传统比较。', topics: [
        ['这页讲的是什么？', excerpt],
        ['我该留意什么？', '可以先看本页列出的流传地区、形态与乐器，再读正文。不同地区的版本和传承场景，要按本页的具体说明来理解。', '#ethnic'],
        ['在哪里查看资料来源？', '继续向下阅读本页的资料来源。我们用这些具体资料理解传统，也把概念示意和真实记录区分开。', '.h-srcs'],
      ], hints: [['.h-block', '到这一页，先看它自己的地区与形式。每一种传统都有独特的传承场景。']] };
    }
    return TOPICS[active] || TOPICS.bain;
  }

  function chapterLines() {
    const lines = {
      qon: ['我们来到穹乃额曼。先不用急着记名称，听它怎样从自由的散板展开。', '这一章的线索是：从舒缓走向明朗，手鼓进入后，音乐开始有了节拍。', '往后还有拉琴体验。你可以直接问我“带我试试拉琴”，亲手感受节奏自由。'],
      dastan: ['第三章，我们一起走进达斯坦的故事。这里的音乐开始带着叙事往前走。', '留意歌曲与器乐间奏的交替：一段讲述之后，器乐接过情绪，继续推进。', '这一章可以慢慢看场景，也可以点我聊聊“间奏只是休息吗”。'],
      mashrap: ['来到麦西热甫，轮到我们下场参与了！人物会加入舞圈，鼓点也会逐渐热闹起来。', '先试节奏台：亲手敲一段，看声音与记号怎样一起变化。', '然后一起进入舞圈。打开“跟着鼓点跳”，试着在鼓点上加入。'],
      lishi: ['这一章换个角度，看看音乐怎样走到今天，又怎样继续传下去。', '沿时间轴读渊源，再看记录、整理与传习，把它们连成一条线。', '读到后面的当代案例时，我们再一起想想：换了场景，音乐的哪些部分还在？'],
      fulu: ['走到附录，我们可以用轮盘与旋律，重新看一遍前面的结构。', '先选一个轮盘条目，把名称和你刚才听过、玩过的内容连起来。', '八音还连着不同民族的档案。选一个感兴趣的，我们一起继续探索。'],
      bain: ['这里是八族档案，一张卡片就是一段新的音乐旅程。', '可以按乐器、声音或故事选一个入口；每一页都写了自己的形式和资料来源。', '不用一次读完。选你最感兴趣的一张，我会继续陪你。'],
    };
    if (document.body.dataset.ethnic) return ['我们来到'+page().title+'。这一页要先看它自己的地区与音乐形式。', '留意正文介绍的演唱、乐器与传承场景，和前面熟悉的内容有什么不同。', '资料来源在页末。想先抓住重点，可以点我问“这页讲的是什么”。'];
    if (document.getElementById('inherit-act')) return ['我们进入传承之路的情境体验了。先读眼前的故事，再做自己的选择。', '每一个选择都有反馈。看看你的做法怎样影响这个故事里的传承。', '这里的影像是虚构概念影像。体验结束后，可以再想想真实传承需要怎样的实践。'];
    return lines[active] || [page().hello, '想知道这一页的重点，可以随时点我。', '我们按自己的节奏慢慢探索。'];
  }
  function cancelArrival() {
    clearTimeout(arrivalTimer);
    arrivalActive = false;
    hint.querySelector('.guide-hint__steps').hidden = true;
  }
  function nextArrival() {
    clearTimeout(arrivalTimer);
    if (!arrivalActive || !selected || !auto || shown) { cancelArrival(); return; }
    arrivalIndex++;
    if (arrivalIndex >= arrivalLines.length) { dismissHint(); return; }
    showHint(arrivalLines[arrivalIndex], true);
    const steps = hint.querySelector('.guide-hint__steps');
    steps.hidden = false;
    steps.querySelector('span').textContent = (arrivalIndex + 1) + ' / ' + arrivalLines.length;
    steps.querySelector('button').textContent = arrivalIndex === arrivalLines.length - 1 ? '开始探索 ✓' : '下一句 →';
    const duration = Math.max(6500, Math.min(10000, arrivalLines[arrivalIndex].length * 120 + 2000));
    arrivalTimer = setTimeout(() => document.hidden ? cancelArrival() : nextArrival(), duration);
  }
  function startArrival(chosen = false) {
    if (!selected || !auto || shown || document.hidden) return;
    cancelArrival();
    arrivalLines = chapterLines();
    if (chosen) arrivalLines[0] = selected.intro + ' ' + arrivalLines[0];
    arrivalIndex = -1;
    arrivalActive = true;
    nextArrival();
  }

  function state(value, ms = 0) {
    clearTimeout(stateTimer);
    dock.dataset.state = value;
    actor?.setMode(value);
    if (ms) stateTimer = setTimeout(() => { dock.dataset.state = 'idle'; actor?.setMode('idle'); }, ms);
  }
  function dismissHint() {
    cancelArrival();
    clearTimeout(timer);
    hint.hidden = true;
    if (!shown) state('idle');
  }
  function say(text, target) {
    reply.textContent = text;
    destination = target ? document.querySelector(target) : null;
    go.hidden = !destination;
    state('talking', Math.max(3500, Math.min(11000, text.length * 85)));
  }
  function renderTopics() {
    topics.replaceChildren();
    for (const [label, text, target] of page().topics) {
      const button = document.createElement('button');
      button.type = 'button';
      button.textContent = label;
      button.addEventListener('click', () => {
        lastInteraction = performance.now();
        topics.querySelectorAll('button').forEach(b => b.setAttribute('aria-pressed', String(b === button)));
        say(text, target);
      });
      topics.appendChild(button);
    }
  }
  function openPanel(focus = true) {
    if (!selected) return;
    dismissHint();
    shown = true;
    dialog.hidden = false;
    launcher.setAttribute('aria-expanded', 'true');
    dock.querySelector('.guide-dialog__chapter').textContent = page().title;
    renderTopics();
    say(selected.intro + ' ' + page().hello);
    if (focus) topics.querySelector('button')?.focus();
  }
  function closePanel(focus = true) {
    shown = false;
    dialog.hidden = true;
    launcher.setAttribute('aria-expanded', 'false');
    state('idle');
    lastInteraction = performance.now();
    if (focus) launcher.focus();
  }
  function showHint(text, force = false) {
    if (!selected || !auto || shown || document.hidden) return false;
    if (!force && (performance.now() - lastHint < 25000 || performance.now() - lastInteraction < 12000)) return false;
    hint.querySelector('p').textContent = selected.name + '：' + text;
    hint.hidden = false;
    state(arrivalActive ? 'talking' : 'hint');
    lastHint = performance.now();
    clearTimeout(timer);
    if (!arrivalActive) timer = setTimeout(dismissHint, 12000);
    return true;
  }
  function updateCharacter() {
    dock.hidden = !selected;
    if (!selected) return;
    dock.style.setProperty('--guide-color', selected.color);
    actor?.destroy();
    const portrait = launcher.querySelector('img');
    portrait.src = asset(selected.file);
    actor = createGuideActor({ host: launcher, image: portrait, source: asset(selected.atlas), reduced });
    launcher.querySelector('span').textContent = selected.name + ' · 聊聊';
    launcher.setAttribute('aria-label', '与同行者' + selected.name + '聊聊本章');
    dock.querySelector('.guide-dialog h2').textContent = selected.name;
    autoInput.checked = auto;
    selectionRegion?.querySelectorAll('[data-guide]').forEach(button => {
      const isSelected = button.dataset.guide === selected.id;
      button.setAttribute('aria-pressed', String(isSelected));
      button.querySelector('.guide-card__action').textContent = isSelected ? '已选择 · 一起出发' : '选我同行 ↗';
    });
  }
  function choose(id) {
    selected = CHARACTERS.find(c => c.id === id) || CHARACTERS[0];
    save(KEY, selected.id);
    closePanel(false);
    updateCharacter();
    const status = selectionRegion?.querySelector('.guide-selection__status');
    if (status) status.textContent = '已选择' + selected.name + '。后面的章节，我会继续陪你；想聊聊时，点右下角的我。';
    startArrival(true);
  }
  function showSwitch() {
    closePanel(false);
    dismissHint();
    dialog.hidden = false;
    shown = true;
    launcher.setAttribute('aria-expanded', 'true');
    reply.textContent = '换一位同行者，一起继续探索。';
    topics.replaceChildren();
    go.hidden = true;
    for (const character of CHARACTERS) {
      const button = document.createElement('button');
      button.type = 'button';
      button.textContent = character.name + ' · ' + character.culture;
      button.addEventListener('click', () => { choose(character.id); openPanel(); });
      topics.appendChild(button);
    }
    topics.querySelector('button')?.focus();
  }
  launcher.addEventListener('pointerenter', () => actor?.wave());
  launcher.addEventListener('click', () => shown ? closePanel() : openPanel());
  dock.querySelector('.guide-hint__next').addEventListener('click', nextArrival);
  dock.querySelector('.guide-dialog__close').addEventListener('click', () => closePanel());
  dock.querySelector('.guide-hint__close').addEventListener('click', () => { dismissHint(); lastInteraction = performance.now(); });
  dock.querySelector('.guide-hint__talk').addEventListener('click', () => openPanel());
  dock.querySelector('.guide-dialog__switch').addEventListener('click', showSwitch);
  autoInput.addEventListener('change', () => { auto = autoInput.checked; save(AUTO_KEY, auto ? '1' : '0'); if (!auto) dismissHint(); });
  go.addEventListener('click', () => {
    closePanel(false);
    destination?.scrollIntoView({ behavior: reduced ? 'instant' : 'smooth', block: 'center' });
  });
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && shown) closePanel(); else if (e.key === 'Escape') dismissHint(); });
  window.addEventListener('storage', e => {
    if (e.key === KEY || e.key === AUTO_KEY || e.key === null) {
      selected = CHARACTERS.find(c => c.id === read(KEY, '')) || null;
      auto = read(AUTO_KEY, '1') !== '0';
      closePanel(false); dismissHint(); updateCharacter();
    }
  });
  updateCharacter();

  requestAnimationFrame(() => {
    if (active === 'qon') {
      selectionRegion = document.createElement('section');
      selectionRegion.id = 'guide-selection';
      selectionRegion.className = 'guide-selection';
      selectionRegion.setAttribute('aria-labelledby', 'guide-selection-title');
      selectionRegion.innerHTML = '<div class="guide-selection__heading"><p>沿着弦脉 · 结伴而行</p><h2 id="guide-selection-title">选一位同行者，听见更多故事</h2><p>从这一章开始，陪你听、陪你看，也陪你亲手试一试。</p></div>' +
        '<div class="guide-selection__cards">' + CHARACTERS.map(c => '<button type="button" class="guide-card" data-guide="' + c.id + '" aria-pressed="false" style="--guide-color:' + c.color + '">' +
          '<span class="guide-card__stage"><img src="' + asset(c.file) + '" alt="' + c.culture + '虚构向导' + c.name + '" decoding="async" width="1024" height="1536"></span>' +
          '<span class="guide-card__culture">' + c.culture + '</span><strong>' + c.name + '</strong><span class="guide-card__role">' + c.role + '</span><span class="guide-card__action">选我同行 ↗</span></button>').join('') + '</div>' +
        '<p class="guide-selection__status" aria-live="polite">选中人物后，点击右下角的同行者，就能聊聊当前章节。</p><p class="guide-selection__note">虚构文化向导 · AI 创作形象与服饰概念示意</p>';
      const hero = document.getElementById('part-hero');
      hero?.insertAdjacentElement('afterend', selectionRegion);
      selectionRegion.addEventListener('click', e => {
        const button = e.target.closest('[data-guide]');
        if (button) choose(button.dataset.guide);
      });
      const heroInner = hero?.querySelector('.chapter-hero__inner');
      if (heroInner) {
        const link = document.createElement('a');
        link.className = 'guide-entry';
        link.href = '#guide-selection';
        link.textContent = '遇见你的同行者 ↓';
        heroInner.appendChild(link);
      }
      updateCharacter();
      selectionRegion.querySelectorAll('.guide-card').forEach(button => {
        const character = CHARACTERS.find(c => c.id === button.dataset.guide);
        createGuideActor({ host: button.querySelector('.guide-card__stage'), image: button.querySelector('img'), source: asset(character.atlas), reduced, preview: true });
      });
    }
    arrivalTimer = setTimeout(() => startArrival(), 1600);
    if ('IntersectionObserver' in window) {
      const observer = new IntersectionObserver(entries => {
        for (const entry of entries) {
          if (!entry.isIntersecting || seen.has(entry.target) || scrollY < innerHeight * .5) continue;
          if (showHint(entry.target.dataset.guideHint)) seen.add(entry.target);
        }
      }, { threshold: .2 });
      for (const [selector, text] of page().hints) {
        const element = document.querySelector(selector);
        if (element) { element.dataset.guideHint = text; observer.observe(element); }
      }
    }
  });
  const api = { choose, open: openPanel, close: closePanel, actor: () => actor?.state(), state: () => ({ selected: selected?.id || null, auto, open: shown, chapter: page().title, mode: dock.dataset.state, arrival: arrivalActive, arrivalIndex }) };
  window.__XM_GUIDE__ = api;
  return api;
}
