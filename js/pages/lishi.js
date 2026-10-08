/* 第五章 · 历史与传承 —— 来源、经典化、抢救、当代运用
   --------------------------------------------------------------------------
   2026 改造：用户说"好无聊，只有文字，背景也有些给人无聊透着压抑"。
   诊断：五段结构一模一样（kicker → 标题 → 正文 → 正文 → 配色块），
   滚起来是同一屏重复五遍；三个图位还全是空的（"图注位"）。

   改法：
     · 背景压暗（emberGain 0.35）—— 五行史实压在火上读着累
     · 删掉三个空图位 —— 没图就别占位
     · 四段各换一种**和内容对应**的形式（见 js/lib/lishi-ui.js）

   这一页**只有背景音乐，没有手鼓**。
   用户明确说过："第五章不该有那个鼓点的，第五章没有背景音乐才对的，还是有"
   —— 意思是这里该是纯配乐。
   原来写的是 bootChapter({ soundBand: 0 })，没传 drums:false，
   于是 bootChapter 建了手鼓音序器，autoPlayOnGesture 又把它打开，
   结果配乐里混着鼓点。现在 drums:false。 */
import { bootChapter } from '../lib/chapter.js';
import { createTheme, autoPlayOnGesture } from '../lib/theme.js';
import { buildTimeline, buildSubtract, buildRecorder, buildRails, buildCases } from '../lib/lishi-ui.js';

const ctx = bootChapter({
  active: 'lishi',
  drums: false,
  /* 地火压到 0.22：序章那种"火在暗处翻"适合开场，
     但这一页全是文字，背景抢戏就是"压抑"（用户原话）。
     光调这个还不够 —— 更要紧的是卡片得是实心的，
     否则纹样会透过卡片压到字上（见 styles/lishi.css 的 .case2）。 */
  emberGain: 0.22,
});

const theme = createTheme('../assets/mashrap/theme.mp3');
theme.preload();

/* 第一次交互就把配乐打开。能走到这一页说明门已经开了，
   不该再让用户找开关。seq 传 null：这一页没有鼓。 */
autoPlayOnGesture({ theme, seq: null, fade: 3.0 });

/* ------------------------------------------------------------------ 部件 */

/* 一 · 渊源：千年拉成一条横线。
   文案沿用页面原有的三段，**一个字没加**。 */
const TIMELINE = [
  {
    era: '汉唐',
    title: '西域大曲',
    body: '源头可追溯至汉唐时期流传于西域的《龟兹乐》《疏勒乐》《高昌乐》。' +
      '学术界有一种观点认为，汉代张骞通西域时带回中原的「摩诃兜勒」是木卡姆的原始形态，' +
      '其曲式结构已包含歌曲、解曲和舞曲，与木卡姆的套曲结构一脉相承。',
    tag: '龟兹乐被视为木卡姆形成发展的第一个中心地',
  },
  {
    era: '10世纪',
    title: '博亚万 · 旷野之歌',
    body: '木卡姆的雏形萌发于公元 10 世纪维吾尔族先民的「博亚万」（旷野之歌）。' +
      '经过几个世纪的演变，逐渐从民间散曲走向成套。',
    tag: '旷野之歌',
  },
  {
    era: '16世纪',
    title: '叶尔羌汗国 · 决定性转折',
    body: '到 16 世纪叶尔羌汗国时期，木卡姆迎来了决定性的转折。' +
      '宫廷乐师将散落民间的木卡姆收集整理，剔除陈旧晦涩的内容，' +
      '首次形成了规范化的古典套曲体系。最初整理为 <strong>16 部</strong>，' +
      '后精简为 <strong>12 套</strong> ——「十二木卡姆」由此得名。',
    tag: '从 16 部到 12 套',
    emphasis: true,
  },
];

/* 四 · 双轨：数字全部来自正文。
   条形长度用平方根压比例 —— 50 对 2000 直接按比例会让前者看不见。 */
const scale = (v, max) => Math.round(Math.sqrt(v / max) * 100);

const RAILS = [
  {
    tag: '轨道一',
    name: '扎根乡土的活态传承',
    body: '在莎车县木卡姆文化传承中心，像玉苏普·托合提这样的非遗代表性传承人有近 50 人，' +
      '年龄最大的 70 多岁，最小的仅 20 岁。当地通过每月发放生活补贴、每日举办文艺演出等举措，' +
      '让传承人能够以此为业。',
    bars: [
      { value: '近 50', label: '代表性传承人', pct: scale(50, 2000) },
      { value: '70 → 20', label: '年龄跨度（岁）', pct: scale(50, 2000) },
    ],
  },
  {
    tag: '轨道二',
    name: '进入教育体系的专业化培养',
    body: '新疆艺术学院自 1996 年起设立木卡姆专业学历教育，' +
      '已培养出 250 余名专业人才分赴各院团工作，部分已成为一级演员。' +
      '各地每年举办传承人培训班，二十年来累计培训超过 2000 人次。',
    bars: [
      { value: '250+', label: '专业人才', pct: scale(250, 2000) },
      { value: '2000+', label: '累计培训人次', pct: scale(2000, 2000) },
    ],
  },
];

/* 五 · 当代运用：四类案例，改用横滑带。文案沿用原有内容。 */
const CASES = [
  {
    org: '艾热',
    title: '把木卡姆「说」进说唱',
    body: '新疆喀什说唱歌手艾热在创作中持续融入木卡姆元素。' +
      '他选用维吾尔族代表性弦乐器<strong>艾捷克</strong>作为说唱编曲底色，' +
      '用较为激昂高亢的演唱方式诠释十二木卡姆艺术，与说唱音乐无缝嫁接。' +
      '《千里万里》被网友评价为「可以上春晚的水准」，并被世界杯官方账号选用作为推广视频 BGM。',
    tags: ['说唱', '艾捷克', '跨语种传播'],
  },
  {
    org: '刀郎',
    title: '用流行乐「翻译」木卡姆的结构',
    body: '刀郎为电影《万桐书》创作的主题曲《命运的赛勒克》，提供了一个反向思路。' +
      '歌曲以木卡姆音乐特征为基础，在流行律动中加入<strong>复合节拍</strong>，' +
      '融合热瓦普、弹布尔等传统乐器，通过实录民族乐器保留木卡姆的' +
      '「<strong>四分中立音</strong>」律制听感，并运用木卡姆式吟唱与 rap 呼应。' +
      '这首歌的创作目的是向万桐书等抢救木卡姆的学者致敬。',
    tags: ['电影主题曲', '复合节拍', '四分中立音'],
  },
  {
    org: '2024 央视春晚 · 喀什分会场',
    title: '大型舞台呈现',
    body: '歌舞乐综合表演《我的爱献给祖国母亲》，选用十二木卡姆中《且比亚特木卡姆》乐曲重新填词编曲，' +
      '动用 500 多人团队在喀什古城完成户外大型实景表演。' +
      '乐手中既有白发苍苍的民间传承人，也有稚气纯真的小学生。',
    stats: [['300+', '舞蹈演员'], ['90+', '乐手'], ['80+', '演唱者']],
    tags: ['实景演出', '代际同台'],
  },
  {
    org: '创新剧目',
    title: '持续涌现',
    body: '原创芭蕾舞剧《寻找木卡姆》以芭蕾语汇重新诠释木卡姆；' +
      '融合 AI 数字人等技术的歌剧《木卡姆恋歌——万桐书》以现代审美演绎传承故事。' +
      '木卡姆传统乐器还与古琴、箜篌进行跨界合奏，碰撞出跨越民族的艺术火花。',
    tags: ['芭蕾', 'AI 数字人', '跨界合奏'],
  },
];

const parts = {
  timeline: buildTimeline(document.getElementById('tls-host'), TIMELINE),
  subtract: buildSubtract(document.getElementById('subtract-host'), { from: 16, to: 12 }),
  recorder: buildRecorder(document.getElementById('recorder-host')),
  rails: buildRails(document.getElementById('rails-host'), RAILS),
  cases: buildCases(document.getElementById('cases-host'), CASES),
};

// 自检用
window.__XM_THEME__ = theme;
window.__XM_LISHI__ = parts;
