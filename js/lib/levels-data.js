/* ==========================================================================
   弦脉 · 传承之路 · 关卡数据
   --------------------------------------------------------------------------
   **加一关 = 往下面这个数组里加一条记录，不用改任何代码。**

   一条记录长这样：
     level   关卡代号（URL 用 ?level=xxx）
     name    关卡名，显示在游戏页上
     kicker  小标签，两三个字
     bg      背景色号，用在 CSS 里（inherit[data-bg="..."]）
     cover   入口卡片的封面图（可选；没有就只用底色）
     scene   场景类型：'gobi' | 'steppe' | ...（决定入口卡片的色调）
     intro   开场白：{ title, text }
     choices 两个选项。**顺序不重要，ok 决定对错**
     case    成功案例：{ name, year, fact }

   提交版包含两关：维吾尔族（木卡姆）、藏族（格萨尔）。
   ========================================================================== */

export const LEVELS = [
  /* ======================= 已完成 ======================= */
  {
    level: 'muqam',
    scene: 'gobi',
    name: '维吾尔族 · 十二木卡姆',
    kicker: '戈壁',
    short: '十二木卡姆',
    cover: 'assets/img/game/gobi-cover.webp',
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
        caseVideo: 'qonCase',
      },
    ],
    case: {
      name: '玉苏普·托合提',
      year: '莎车县木卡姆文化传承中心 · 传承人',
      fact: '带出 20 多名徒弟，年龄最小的仅 20 岁。',
    },
  },
  {
    level: 'gesar',
    scene: 'steppe',
    name: '藏族 · 格萨尔',
    kicker: '草原',
    short: '格萨尔',
    cover: 'assets/img/game/steppe-cover.webp',
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
        caseVideo: 'tibCase',
      },
    ],
    case: {
      name: '桑珠',
      year: '西藏那曲 · 格萨尔说唱艺人 · 2009 年入选国家级非遗代表性传承人',
      fact: '能唱 60 多部《格萨尔》。',
    },
  },

];

/** 能玩的关卡（ready !== false 且选项齐了） */
export function playableLevels() {
  return LEVELS.filter((L) => L.ready !== false && L.choices && L.choices.length === 2);
}

/** 提交版已完成的全部关卡 */
export function allLevels() { return LEVELS; }

/** 按代号找一关 */
export function levelByKey(key) {
  return LEVELS.find((L) => L.level === key) || null;
}
