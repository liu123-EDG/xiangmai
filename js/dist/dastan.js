/* 由 tools/build.mjs 生成，请勿直接编辑。改源码后运行 node tools/build.mjs
   本页模块（依依赖序）：
     js/lib/part-data.js  → PART_TONE, PARTS
     js/lib/part.js  → renderPart
     js/lib/materials.js  → VERT_SRC, NOISE_GLSL, MATERIAL_GLSL, SCENE_FRAG, DUST_FRAG, EMBER_FRAG, CHAPTER_AIR_FRAG, WALL_FRAG
     js/lib/renderer.js  → COLORS, SEG_H, SEG_BOUNDS, BREATH, Renderer
     js/lib/sequencer.js  → DapSequencer, PATTERNS
     js/lib/site.js  → NAV, mountShell, mountChapterNav, revealOnScroll, mountSlots
     js/lib/chapter.js  → bootChapter, REDUCED
     js/lib/parallax.js  → buildParallax
     js/pages/dastan.js
*/
(function () {
"use strict";

var __XM = [];
var __ns = null;
__XM[0] = {};
__XM[1] = {};
__XM[2] = {};
__XM[3] = {};
__XM[4] = {};
__XM[5] = {};
__XM[6] = {};
__XM[7] = {};
__XM[8] = {};

/* ── js/lib/part-data.js ── */
function __M0__() {
/* ==========================================================================
   弦脉 · 三个部分的内容
   --------------------------------------------------------------------------
   第二章 穹乃额曼 / 第三章 达斯坦 / 第四章 麦西热甫 —— 结构完全一样，
   只是内容不同。所以数据写在这里，页面由 js/lib/part.js 统一渲染。

   —— 怎么往里填内容 ——
   每个部分有 intro（开场）和 sections（若干节）。每一节可以只放文字、
   只放图片、或者图文都有：

     { title: '小标题', body: ['第一段', '第二段'], images: [{...}] }
     { images: [{...}] }                       // 纯图片节
     { title: '小标题', body: ['…'] }           // 纯文字节

   图片写成：
     { src: '../assets/img/qiongnaieman/xxx.jpg',
       label: '图片位（缺图时显示的提示）',
       ratio: '16 / 9',
       caption: '图注' }

   **文件名不用提前确定**，放好图片后把路径填进来即可；文件不存在时
   槽位会显示占位样式，版面不会变形。

   —— 内容准则 ——
   只写可查证的内容。不确定的地方留空或标注"待补"，不要编。
   你现在看到的下面的文字，是现有资料里能确认的那部分。
   ========================================================================== */

/** 三段共用的色调，与首屏结构柱、章节卡一一对应 */
const PART_TONE = {
  qon: '#7d97a6',
  dastan: '#c08a3e',
  mashrap: '#4a8071',
};

const PARTS = {
  /* ======================================================== 二 · 穹乃额曼 */
  qon: {
    id: 'qon',
    num: '二',
    title: '穹乃额曼',
    sub: '大曲',
    latin: 'Qonuneqme',
    tone: PART_TONE.qon,
    order: '三段中的第一段',
    mood: '舒缓 → 明朗',
    lead: '每一套木卡姆都由三大部分构成，情绪层层推进。穹乃额曼是开篇——' +
          '由散板序唱进入节拍性段落，情绪由舒缓深沉逐渐趋向明朗热烈。' +
          '唱词多采用古典诗歌，是整套木卡姆中最具古典气质的部分。',
    /** 概念图：跟在开场之后的一整屏画框。换图只改 src；
        fallback 是取不到 webp 时的退路；宽高写上可避免加载时跳动 */
    heroImage: {
      src: '../assets/img/qiongnaieman/hero.webp',
      fallback: '../assets/img/qiongnaieman/hero.png',
      alt: '萨塔尔琴与手抄本，窗外是喀什老城与远处的天山',
      caption: '概念图 · 穹乃额曼',
      w: 1312,
      h: 1199,
    },
    stats: [
      { v: '一', unit: '', label: '三段中的第一部分' },
      { v: '2/3', unit: '', label: '占每套木卡姆的篇幅' },
      { v: '散→快→散', unit: '', label: '节拍结构' },
    ],
    sections: [
      {
        title: '什么是「穹乃额曼」',
        body: [
          '穹乃额曼是十二木卡姆的第一部分，也是历史最久远、结构最庞大的部分，' +
          '占到每套木卡姆的<strong>三分之二左右</strong>，与汉唐时期的「西域大曲」有直接源流关系。',
          '「穹」是天穹，「乃额曼」是曲子，合起来有<strong>「苍穹下的曲子」</strong>之意。',
        ],
      },
      {
        title: '段落构成：散 → 慢 → 中 → 快 → 散',
        body: [
          '整体遵循「散→慢→中→快→散」的节拍结构。',
          '开篇是<strong>散板序唱</strong>（木凯迪满）：主乐师奏响萨它尔，独唱者唱起「格则勒」体诗歌。' +
          '没有伴唱，不打手鼓，节奏自由。这个散板序唱<strong>决定了整部木卡姆的「母调」</strong>，' +
          '是后续所有曲调的基础和主干。',
          '手鼓进入后，依次经过<strong>太孜</strong>（慢板叙咏歌）、<strong>努斯赫</strong>（变体乐段）、' +
          '<strong>穆斯坦扎特</strong>、<strong>耶李姆沙给</strong>等中板段落，速度逐步加快。',
          '到<strong>朱拉</strong>（意为「光、闪耀、欢乐」，适合婚礼演唱）和<strong>赛乃姆</strong>' +
          '（舞蹈形象的音乐）进入歌舞段落，<strong>穹赛勒克</strong>（5/8 拍）时情绪热烈，达到高潮。' +
          '最后以<strong>太喀特</strong>轻快收尾，成为过渡到达斯坦的桥梁，' +
          '尾唱时散板主乐句变化再现，形成自足循环。',
          '不同套木卡姆的穹乃额曼内部曲目并不完全一致，但「散→慢→中→快→散」的整体情绪弧线是共通的。',
        ],
      },
      {
        title: '乐器及角色',
        body: [
          '穹乃额曼的乐器使用有一个鲜明特征——<strong>开始部分没有舞蹈，也很少用鼓</strong>，' +
          '以弦乐和叙唱为主。',
          '<strong>萨它尔</strong>是最核心的乐器，散板序唱就在它的琴声中展开。' +
          '它的角色是<strong>定调者</strong>——奏出的旋律确立了整部木卡姆的「母调」。',
          '<strong>手鼓（达普）</strong>在太孜段落才进入，角色是<strong>节奏框架的建立者</strong>。' +
          '散板阶段没有手鼓，因为散板本身自由无固定节拍；' +
          '一旦进入太孜，手鼓就把音乐从自由的叙唱拉入有结构的乐段推进中。',
          '整体以<strong>人声叙唱为主导</strong>，器乐更多是跟随和间奏。',
        ],
      },
      {
        title: '调式 / 律制：四分中立音',
        body: [
          '<strong>四分中立音律是核心特征。</strong>' +
          '普通音乐把一个全音分成两个半音，木卡姆中大量使用把全音分成四个「四分音」的做法，' +
          '由此产生<strong>中立三度</strong>（介于大、小三度之间）、中立六度等「非标准」音程——' +
          '这些音在十二平均律里根本不存在。',
          '这些四分音往往以<strong>「游移音」</strong>的面貌出现：不是固定在某一个精确高度上，' +
          '而是在一个音区里上下游移，使旋律有一种「不稳定感」和「飘移感」。',
          '调式上还存在<strong>「多结音现象」</strong>——一首乐曲中不止一个音可以作为结音；' +
          '<strong>「一级多音现象」</strong>也常见，同一个音级位置上可能同时存在几个不同乐音。',
        ],
      },
      {
        title: '聆听要点',
        body: [
          '听穹乃额曼，不要用听流行歌曲的习惯。它的「好听」不在旋律的记忆点，' +
          '在<strong>音色的质感</strong>和<strong>旋律的游移</strong>。',
          '<strong>先听散板序唱的那句「起音」。</strong>' +
          '萨它尔的琴声苍劲、干涩，像老木头被拉动。人声进来后是独唱，没有伴奏——' +
          '注意它的音是不是「准」的：有些音「挂」在两个标准音之间，上不去也下不来，' +
          '这就是四分中立音。<strong>不要试图把它「听准」，要听它的「不准」本身。</strong>',
          '<strong>再听手鼓什么时候进来。</strong>' +
          '散板阶段没有鼓，只有弦乐和人声；太孜一开始，手鼓打起来，音乐的「身体」才出现。' +
          '注意节拍是不是规整的，3/4、5/4、7/8 这些不常见节拍会交替出现，脚打不准是正常的。',
          '<strong>听旋律的走向。</strong>' +
          '穹乃额曼的旋律不是「往上走到高潮再下来」的拱形，更多是一种<strong>盘旋式推进</strong>——' +
          '在一个音区里绕，绕到某个点突然拔高，像「撕云裂帛」，然后又低回下去。',
          '<strong>最后注意听「尾唱」。</strong>' +
          '当乐曲接近结束时，散板序唱的主乐句会变化再现，熟悉的萨它尔音色重新出现，' +
          '但和开头不完全一样——是一种<strong>「回来了，但已经不是原来的地方」</strong>的感觉。',
        ],
      },
    ],
  },

  /* ======================================================== 三 · 达斯坦 */
  dastan: {
    id: 'dastan',
    num: '三',
    title: '达斯坦',
    sub: '叙事诗',
    latin: 'Dastan',
    tone: PART_TONE.dastan,
    order: '三段中的第二段',
    mood: '叙事 · 铺陈',
    lead: '达斯坦承接大曲，带有鲜明的叙事特征。' +
          '歌词与民间故事、爱情传说、人生感怀相联系，' +
          '演唱段落之间穿插器乐曲——唱一段，奏一段，再唱一段。',
    stats: [
      { v: '二', unit: '', label: '三段中的第二部分' },
      { v: '唱·奏·唱', unit: '', label: '演唱与器乐交替' },
      { v: '叙事', unit: '', label: '讲一个完整的故事' },
    ],
    sections: [
      {
        title: '从抒情转向讲故事',
        body: [
          '如果说穹乃额曼是在铺开一种气质，达斯坦就是在讲一件具体的事。' +
          '它的歌词与民间故事、爱情传说、人生感怀相连，' +
          '篇幅更长，句子更密，唱的人要一边记词一边记腔。',
          '演唱段落之间穿插器乐曲——器乐不是伴奏，是段落之间的过渡与呼吸。' +
          '所以达斯坦的听感是"唱一段、奏一段、再唱一段"，一段一段往前推。',
        ],
      },
      {
        images: [{
          src: '../assets/img/dastan/section-1.jpg',
          label: '图片位 · 建议 16:9（约 1600×900）',
          ratio: '16 / 9',
          caption: '图注位 · 说明图片内容与来源',
        }],
      },
      {
        title: '待补',
        pending: [
          '常唱的曲目与实际唱法',
          '长诗从哪里来、唱哪些故事',
          '器乐间奏用什么乐器、什么形制',
          '聆听要点：听什么、怎么听',
        ],
      },
    ],
  },

  /* ======================================================== 四 · 麦西热甫 */
  mashrap: {
    id: 'mashrap',
    num: '四',
    title: '麦西热甫',
    sub: '歌舞曲',
    latin: 'Meshrep',
    tone: PART_TONE.mashrap,
    order: '三段中的第三段',
    mood: '高涨 · 欢腾',
    lead: '麦西热甫是终章。节奏鲜明，气氛逐步高涨，' +
          '展现群体欢聚时的生命活力——到了这一段，听的人不再只是听，' +
          '而是要下场跳的。',
    stats: [
      { v: '三', unit: '', label: '三段中的第三部分' },
      { v: '群体', unit: '', label: '不是独唱，是一场聚会' },
      { v: '高涨', unit: '', label: '情绪走向' },
    ],
    sections: [
      {
        title: '从一个人唱，到一群人跳',
        body: [
          '走到麦西热甫，音乐的性格整个变了。节奏变得鲜明、短促、循环性强，' +
          '因为它的目的不是让人坐着听，而是让人下场动起来。',
          '"麦西热甫"既是这一段的名字，也是一种聚会形式的名字。' +
          '音乐、舞蹈、游戏、罚则都在里面，参加的人既是观众也是演员。',
        ],
      },
      {
        images: [{
          src: '../assets/img/mashrap/section-1.jpg',
          label: '图片位 · 建议 16:9（约 1600×900）',
          ratio: '16 / 9',
          caption: '图注位 · 说明图片内容与来源',
        }],
      },
      {
        title: '待补',
        pending: [
          '节奏型与常见鼓点',
          '舞蹈程式与动作',
          '一场麦西热甫的流程：谁起头、怎么轮、什么时候罚',
          '聆听要点：听什么、怎么听',
        ],
      },
    ],
  },
};

__ns = __XM[0];
__ns.mount_PART_TONE = function () { return PART_TONE; };
__ns.mount_PARTS = function () { return PARTS; };
}

/* ── js/lib/part.js ── */
function __M1__() {
var PARTS = __XM[0]["PARTS"];

/* ==========================================================================
   弦脉 · 三个部分章的渲染
   --------------------------------------------------------------------------
   第二章 / 第三章 / 第四章结构完全一样，只是内容不同。
   所以页面骨架由这里统一生成，HTML 里只留容器，数据在 part-data.js。

   这样加内容 = 改数据，不用碰 HTML；三个页也不会各自跑偏。
   ========================================================================== */



const $ = (s) => document.querySelector(s);

/** 一句一行地排正文 */
function bodyHTML(lines) {
  return lines.map((t) => '<p class="body reveal">' + t + '</p>').join('');
}

function statsHTML(stats) {
  return '<ul class="chapter-hero__stats reveal" data-delay="4">' + stats.map((s) =>
    '<li><b>' + s.v + (s.unit ? '<i>' + s.unit + '</i>' : '') + '</b>' +
    '<span>' + s.label + '</span></li>'
  ).join('') + '</ul>';
}

function slotHTML(img, i) {
  return '<figure class="slot reveal" data-delay="' + Math.min(5, i + 1) + '"' +
    ' data-src="' + img.src + '"' +
    ' data-label="' + (img.label || '图片位') + '"' +
    ' style="--slot-ratio: ' + (img.ratio || '16 / 9') + '">' +
    '<img alt="' + (img.alt || img.caption || '') + '" loading="lazy" decoding="async">' +
    (img.caption ? '<figcaption>' + img.caption + '</figcaption>' : '') +
    '</figure>';
}

function imagesHTML(images) {
  if (!images || !images.length) return '';
  if (images.length === 1) return slotHTML(images[0], 0);
  // 两张并排
  return '<div class="slot-pair">' +
    images.map((im, i) => slotHTML(im, i)).join('') + '</div>';
}

function pendingHTML(items) {
  return '<p class="pending reveal">这里还缺：<br>' +
    items.map((t) => '· ' + t).join('<br>') + '</p>';
}

function sectionHTML(sec, i) {
  const delay = Math.min(4, i);
  return '<section class="act" data-act="' + (i + 1) + '">' +
    '<span class="act__num" aria-hidden="true">' + '一二三四五六七八'[i] + '</span>' +
    '<div class="act__inner">' +
      (sec.title ? '<h2 class="act__title reveal" data-delay="' + delay + '">' + sec.title + '</h2>' : '') +
      (sec.body ? bodyHTML(sec.body) : '') +
      (sec.images ? imagesHTML(sec.images) : '') +
      (sec.pending ? pendingHTML(sec.pending) : '') +
    '</div></section>';
}

/**
 * 用数据铺满整页。HTML 里需要三个容器：
 *   #part-hero（开场）、#part-body（正文各节）、.chapter-nav（底部，由 site.js 填）
 * 以及 <body data-part="qon"> 指明用哪一份数据。
 */
function renderPart() {
  const id = document.body.dataset.part;
  const p = PARTS[id];
  if (!p) {
    if (window.console) console.warn('[弦脉] 找不到 part 数据：' + id);
    return null;
  }

  document.title = '第' + p.num + '章 · ' + p.title + '（' + p.sub + '）｜十二木卡姆 — 弦脉';
  const desc = document.querySelector('meta[name="description"]');
  if (desc) desc.setAttribute('content', p.lead);

  // 这一段的色调，供页面上的小面积强调色使用
  document.body.style.setProperty('--part-tone', p.tone);

  const hero = $('#part-hero');
  if (hero) {
    hero.innerHTML = '<div class="chapter-hero__inner">' +
      '<p class="chapter-hero__part reveal">第' + p.num + '章 · 十二木卡姆的' +
        (p.num === '二' ? '第一' : p.num === '三' ? '第二' : '第三') + '部分</p>' +
      '<h1 class="reveal" data-delay="1">' + p.title + '</h1>' +
      '<span class="chapter-hero__ug reveal" data-delay="2">' + p.latin + ' · ' + p.sub + '</span>' +
      '<p class="chapter-hero__lead reveal" data-delay="3">' + p.lead + '</p>' +
      statsHTML(p.stats) +
      '</div>';
  }

  /* 概念图：紧跟开场的一整屏画框。
     图是"这一章的视觉主题"，不是插图，所以给它独立一屏，
     按原图比例展示，不裁切。
     用 <picture>：优先 webp（小得多），取不到就退回原作者给的格式。 */
  const heroImg = $('#part-hero-image');
  if (heroImg && p.heroImage) {
    const hi = p.heroImage;
    const dims = (hi.w ? ' width="' + hi.w + '"' : '') + (hi.h ? ' height="' + hi.h + '"' : '');
    const sources = [];
    if (/\.webp$/i.test(hi.src)) sources.push('<source srcset="' + hi.src + '" type="image/webp">');
    if (hi.fallback) sources.push('<source srcset="' + hi.fallback + '">');

    heroImg.innerHTML =
      '<figure class="plate">' +
        '<picture>' + sources.join('') +
          '<img src="' + (hi.fallback || hi.src) + '" alt="' + (hi.alt || p.title) + '"' +
            ' loading="lazy" decoding="async"' + dims + '>' +
        '</picture>' +
        (hi.caption ? '<figcaption>' + hi.caption + '</figcaption>' : '') +
      '</figure>';
  } else if (heroImg) {
    heroImg.innerHTML = '';          // 没有图就整屏收起（.plate-act:empty 会 display:none）
  }

  const body = $('#part-body');
  if (body) body.innerHTML = p.sections.map(sectionHTML).join('');

  return p;
}

__ns = __XM[1];
__ns.mount_renderPart = function () { return renderPart; };
}

/* ── js/lib/materials.js ── */
function __M2__() {
/* ==========================================================================
   弦脉 · 共享材质库
   --------------------------------------------------------------------------
   把"好看"这件事拆成四层，每层各自独立、可单独调强度：

     wall   洞窟壁面 —— 灰浆颗粒 + 矿物斑点，近距离的质感
     mural  壁画残迹 —— 斑驳颜料 + 剥落的白灰地仗 + 冰裂纹（远景暗示，不是主体）
     light  顶部光缝 —— 一道斜向漏光，尘埃在光里可见
     dust   浮尘     —— FBO 乒乓反馈场，滚动给它惯性

   全部程序化生成，没有一张位图。所有层都以"极低对比"为原则：
   背景要厚，但不能抢中央的结构柱。
   ========================================================================== */

/** 顶点着色器：一个覆盖全屏的三角形 */
const VERT_SRC = `
attribute vec2 a_pos;
void main() { gl_Position = vec4(a_pos, 0.0, 1.0); }
`;

/* ---------------------------------------------------------------- 噪声库 --
   被材质着色器与壁面着色器共用，所以单独抽出来拼接，避免两处各写一份。 */
const NOISE_GLSL = `
float hash21(vec2 p) {
  p = fract(p * vec2(233.34, 851.73));
  p += dot(p, p + 23.45);
  return fract(p.x * p.y);
}
float vnoise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  float a = hash21(i);
  float b = hash21(i + vec2(1.0, 0.0));
  float c = hash21(i + vec2(0.0, 1.0));
  float d = hash21(i + vec2(1.0, 1.0));
  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}
float fbm(vec2 p, int oct) {
  float s = 0.0, a = 0.5;
  mat2 R = mat2(0.82, 0.57, -0.57, 0.82);
  for (int i = 0; i < 7; i++) {
    if (i >= oct) break;
    s += a * vnoise(p);
    p = R * p * 2.03;
    a *= 0.5;
  }
  return s;
}
float ridge(vec2 p, int oct) {
  float s = 0.0, a = 0.5;
  for (int i = 0; i < 7; i++) {
    if (i >= oct) break;
    float n = abs(vnoise(p) * 2.0 - 1.0);
    s += a * (1.0 - n);
    p *= 2.07;
    a *= 0.5;
  }
  return s;
}
float bandf(float v, float e) { return smoothstep(0.5 - e, 0.5 + e, v); }
`;

/* ------------------------------------------------------- 三段结构柱材质 --
   这三段是首屏的主体。它们不画在背景上，而是烘焙成纹理交给 DOM，
   由布局引擎负责几何 —— 这样位置和比例永远与设计一致。 */
const MATERIAL_GLSL = `
${NOISE_GLSL}

/* 穹乃额曼：剥落壁画。
   正确的层次是：赭石地子 → 覆盖其上的暗青壁画层 → 剥落处露回赭石，
   剥落边缘受光。之前把暗青当成"露出的底"，明暗关系就反了。 */
vec3 matQon(vec2 q, float w, float t) {
  vec2 s = q * vec2(w, 1.0) + vec2(0.0, t * 0.004);   // 各向同性空间

  float n  = fbm(s * 2.4, 5);
  float n2 = fbm(s * 0.70 + 7.3, 4);
  float vul = n * 0.72 + n2 * 0.36;

  float layer = bandf(vul, 0.055);                    // 1 = 壁画层完好，0 = 已剥落
  float edge  = 1.0 - abs(layer * 2.0 - 1.0);         // 剥落边缘

  vec3 ground  = u_c1a * 0.46;                        // 赭石地子
  vec3 plaster = u_c1b * 0.95;                        // 覆盖的暗青壁画层
  vec3 col = mix(ground, plaster, layer);

  // 浮雕：光源在左上，边缘一侧受光、一侧落影。
  // 需要 GL_OES_standard_derivatives；若驱动不支持（u_deriv = 0）就退回无浮雕。
  vec3 col2 = col;
  if (u_deriv > 0.5) {
    vec2 toLight = normalize(vec2(-0.75, 0.65));
    float gx = dFdx(layer), gy = dFdy(layer);
    float relief = -(gx * toLight.x + gy * toLight.y);
    col2 += vec3(0.16, 0.135, 0.105) * clamp(relief * 42.0, 0.0, 1.0) * edge;
    col2 *= 1.0 - clamp(-relief * 30.0, 0.0, 1.0) * edge * 0.45;
  } else {
    col2 += vec3(0.13, 0.11, 0.085) * pow(edge, 2.4) * 0.9;
  }
  col = col2;

  // 墙面自身的斑驳
  float patina = fbm(s * 1.1 - 5.1, 4);
  col *= 0.86 + 0.28 * patina;

  // 极细的墙粒
  col *= 0.94 + 0.12 * fbm(s * 26.0, 3);
  return col;
}

/* 达斯坦：流动的叙事长句。
   之前用极端的横向各向异性 ridge，数学上就等于木纹方向 —— 越调越像木头。
   改成"抖动网格 + 旋转格内笔画"：横竖斜都有、粗细不一、断续，
   才读作写满的字，而不是年轮。 */
vec3 matDastan(vec2 q, float w, float t) {
  // 同样先映射到各向同性空间，笔画粗细才均匀
  vec2 p = vec2(q.x * w, q.y);
  vec2 s = p * vec2(1.05, 0.30);
  float warp = fbm(s * 1.4 + vec2(0.0, t * 0.025), 3);
  vec2 d = s + vec2(warp * 2.2, warp * 0.30);

  const float ROWS = 17.0;
  vec2 g = d * ROWS;
  vec2 id = floor(g);
  float h = hash21(id);
  vec2 f = fract(g) - 0.5;
  f.x += (h - 0.5) * 0.55;                       // 抖动：打散规则网格
  f.y += (fract(h * 7.31) - 0.5) * 0.40;

  // 笔画方向：以横向为主（走句），少数例外做变化
  float hh = fract(h * 13.7);
  float ang = (hh < 0.72) ? 0.0 : (hh - 0.72) / 0.28 * 3.14159;
  vec2 ff = vec2(f.x * cos(ang) - f.y * sin(ang), f.x * sin(ang) + f.y * cos(ang));
  float thick = 0.048 + fract(h * 3.17) * 0.052; // 笔画粗细不一
  float stroke = smoothstep(thick, thick * 0.30, abs(ff.y));

  float ink = stroke * step(0.58, h);            // 断续：多数格子是空的

  float flow = fbm(d * 2.6 + 13.7, 4);

  vec3 base = u_c2b * 0.40;
  vec3 col = mix(base, u_c2a * 0.70, flow * 0.55);
  col += vec3(0.115, 0.082, 0.034) * ink;        // 暗墨痕，压得住
  col *= 0.88 + 0.24 * fbm(p * vec2(3.0, 0.6) + 3.0, 3);
  return col;
}

/* 麦西热甫：鼓面击点。
   注意：贴图宽高比约 2.9:1，若在归一化坐标里定"正方形"网格，
   落到贴图上会被横向拉伸近 3 倍 —— 圆点变成横条，读作斑马纹。
   所有各向同性的图案都必须按宽高比换算。 */
vec3 matMashrap(vec2 q, float w, float t) {
  /* 关键：先把坐标映射到"各向同性空间"再算图案。
     q.x 乘上宽高比之后，x / y 的物理尺度才一致 ——
     否则 length() 算出来的"圆"在贴图上是一条横线（踩过这个坑）。 */
  vec2 p = vec2(q.x * w, q.y);

  const float ROWS = 6.5;                     // 纵向 6.5 个单元
  vec2 g = p * ROWS;
  vec2 id = floor(g);
  float h = hash21(id);
  vec2 f = fract(g) - 0.5;

  // 格内随机落点：位置一散，规则网格感就没了，才像密集跳跃而不是波点布
  f.x += (hash21(id + 3.1) - 0.5) * 0.62;
  f.y += (hash21(id + 7.7) - 0.5) * 0.55;

  float present = step(0.30, h);              // 只有一部分格子被敲到
  float rad = 0.17 + fract(h * 5.13) * 0.13;  // 大小不一
  float hit = present * smoothstep(rad, rad * 0.30, length(f));

  vec3 base = u_c3a * 0.46;
  vec3 col = mix(base, u_c3b * 1.10, hit * mix(0.40, 1.0, fract(h * 7.31)));
  col += vec3(0.26, 0.17, 0.11) * pow(hit, 2.6) * (0.3 + 0.7 * fract(h * 3.17));

  float grain = fbm(p * vec2(9.0, 26.0) + t * 0.09, 3);
  col *= 0.90 + 0.20 * grain;

  col = mix(col, u_c3a * 0.80, bandf(fbm(p * vec2(1.8, 5.0) + 9.0, 3), 0.16) * 0.28);
  return col;
}
`;

/* --------------------------------------------- 场景着色器（烘焙 + 整柱） --
   两个用途共用一份材质函数：
     u_bandMode >= 0  只渲染该段材质铺满缓冲 → 读回成纹理
     u_bandMode <  0  渲染整根结构柱（保留给实时管线） */
const SCENE_FRAG = `
#extension GL_OES_standard_derivatives : enable
precision highp float;

uniform vec2  u_buf;
uniform float u_cs;
uniform vec4  u_pillarCss;
uniform float u_time;
uniform float u_stage;
uniform float u_active;
uniform float u_open;
uniform float u_lit[3];
uniform float u_breath[3];
uniform vec4  u_segBound;

uniform vec3 u_c1a, u_c1b, u_c1c;
uniform vec3 u_c2a, u_c2b;
uniform vec3 u_c3a, u_c3b;
uniform vec3 u_g1, u_g2, u_g3;
uniform vec3 u_ink;
uniform vec3 u_bg;
uniform sampler2D u_dust;

uniform float u_bandMode;
uniform float u_bandSeed;
uniform float u_dim;
uniform float u_deriv;     // 是否可用 dFdx/dFdy（GL_OES_standard_derivatives）
uniform vec2  u_tile;

${MATERIAL_GLSL}

void main() {
  if (u_bandMode > -0.5) {
    vec2 t = gl_FragCoord.xy / u_tile;
    float w = u_tile.x / u_tile.y;
    vec3 m;
    if (u_bandMode < 0.5)      m = matQon(t, w, u_bandSeed);
    else if (u_bandMode < 1.5) m = matDastan(t, w, u_bandSeed);
    else                       m = matMashrap(t, w, u_bandSeed);
    gl_FragColor = vec4(m * u_dim, 1.0);
    return;
  }

  float s = u_buf.y;
  vec2 uvp = gl_FragCoord.xy / s;
  float aspect = u_buf.x / u_buf.y;
  vec2 p = uvp - vec2(aspect * 0.5, 0.5);
  p.y = -p.y;

  vec2 PS  = vec2(u_pillarCss.x, u_pillarCss.y) * u_cs / s;
  vec2 PSS = vec2(u_pillarCss.z, u_pillarCss.w) * u_cs / s;
  vec2 q = (p - PS) / PSS;
  float w = PSS.x / PSS.y;

  vec3 bg = u_bg + vec3(0.008, 0.0075, 0.0068) * fbm(p * 1.4 + 4.0, 3);
  vec3 haze = texture2D(u_dust, uvp * 0.5 + 0.14).rgb
            + texture2D(u_dust, uvp * 0.5 + vec2(0.37, 0.61)).rgb;
  bg += max(haze - vec3(0.02), vec3(0.0)) * 0.08;
  vec3 col = bg;

  if (q.x > -0.9 && q.x < 1.9 && q.y > -0.5 && q.y < 1.5) {
    q.x += (u_stage / 3.0 - 0.5) * 0.035;
    float qy = clamp(q.y - sin(u_time * 0.115) * 0.006, 0.0, 1.0);

    float b1 = u_segBound.y, b2 = u_segBound.z;
    float isTop = step(qy, b1);
    float isMid = step(b1, qy) * step(qy, b2);
    float idx = isTop * 0.0 + isMid * 1.0 + (1.0 - isTop - isMid) * 2.0;

    vec3 c;
    if (isTop > 0.5)      c = matQon(q, w, u_time);
    else if (isMid > 0.5) c = matDastan(q, w, u_time);
    else                  c = matMashrap(q, w, u_time);

    float period = u_breath[0];
    float act = 0.0;
    for (int i = 0; i < 3; i++) {
      if (float(i) == idx) { period = u_breath[i]; act = u_lit[i]; }
    }

    float breath = 0.80 + 0.20 * (0.5 + 0.5 * sin(u_time * 6.28318 / period - idx * 1.7));
    c *= breath;
    c *= 0.90 + 0.20 * fbm(vec2(q.x * w * 1.3, q.y * 2.1) + 17.0, 3);
    c *= 0.94 + 0.14 * fbm(vec2(q.x * 3.1, q.y * 0.38) + 2.0, 4);

    vec2 seamCoord = vec2(q.x * w * 2.6, q.y * 26.0);
    float sA = b1 + (fbm(seamCoord + 11.0, 4) - 0.5) * 0.022;
    float sB = b2 + (fbm(seamCoord + 41.0, 4) - 0.5) * 0.022;
    float ds = min(abs(qy - sA), abs(qy - sB));
    c = mix(c, u_ink, smoothstep(0.010, 0.0016, ds));
    c += vec3(0.10, 0.085, 0.07) * smoothstep(0.016, 0.009, ds) * smoothstep(0.0016, 0.004, ds);

    float edgeD = min(min(q.x, 1.0 - q.x) * PSS.x, min(qy, 1.0 - qy) * PSS.y);
    c *= 1.0 + 0.30 * smoothstep(2.2, 0.0, edgeD);

    float maxLit = max(u_lit[0], max(u_lit[1], u_lit[2]));
    c *= mix(1.0, 0.70, maxLit * (1.0 - act));

    vec3 glow = isTop > 0.5 ? u_g1 : (isMid > 0.5 ? u_g2 : u_g3);
    c += glow * act * (0.11 + 0.07 * breath);

    float sw = fract(u_time * 0.09 + u_active * 0.33);
    c += vec3(0.16, 0.13, 0.10) * exp(-pow((qy - (sw * 2.6 - 0.8)) * 7.0, 2.0)) * act * 0.9;
    c += (hash21(gl_FragCoord.xy) - 0.5) * (1.6 / 255.0);

    float nx = fbm(vec2(q.y * 7.0, 3.3), 3) - 0.5;
    float ny = fbm(vec2(q.x * w * 1.5, 9.1) + 21.0, 3) - 0.5;
    float eL = nx * 0.020;
    float eR = 1.0 + fbm(vec2(q.y * 6.2, 7.7) + 5.0, 3) * 0.020 - 0.010;
    float eBot = ny * 0.010;
    float eTop = 1.0 + ny * 0.010;
    float mask = smoothstep(eL - 0.004, eL + 0.004, q.x)
               * smoothstep(eR + 0.004, eR - 0.004, q.x)
               * smoothstep(eBot - 0.003, eBot + 0.003, qy)
               * smoothstep(eTop + 0.003, eTop - 0.003, qy);

    float ao = 1.0 - 0.55 * smoothstep(0.0, 0.16, max(max(-q.x, q.x - 1.0), 0.0));
    ao *= 1.0 - 0.5 * smoothstep(0.0, 0.010, max(max(-qy, qy - 1.0), 0.0));
    col = mix(col, c * ao, mask);

    if (u_open < 0.999) {
      float openT = u_open * 3.4 - idx * 0.62;
      float reveal = smoothstep(0.0, 0.62, openT);
      float line = smoothstep(0.0, 0.07, openT) * smoothstep(0.20, 0.05, openT);
      col = mix(bg, col, smoothstep(0.0, 0.05, qy - (1.0 - reveal)));
      col += vec3(0.30, 0.24, 0.16) * line * mask * 0.55;
    }
  }

  gl_FragColor = vec4(col, 1.0);
}
`;

/* ------------------------------------------------------------ 浮尘反馈场 -- */
const DUST_FRAG = `
precision highp float;

uniform sampler2D u_prev;
uniform vec2  u_res;
uniform float u_time;
uniform float u_vel;
uniform float u_frame;
uniform float u_amount;

${NOISE_GLSL}

void main() {
  vec2 res = u_res;
  vec2 uvp = gl_FragCoord.xy / res;
  // 残影只留几帧：留太久会把每个尘点拖成一条流星
  vec3 col = texture2D(u_prev, uvp).rgb * mix(0.86, 0.74, clamp(u_vel, 0.0, 1.0));

  float t = u_time;
  float yShift = t * 0.0025 - u_vel * 0.004;

  for (int i = 0; i < 28; i++) {
    if (float(i) >= u_amount) break;
    float fi = float(i);
    float sp = hash21(vec2(fi, 7.7));
    vec2 p = vec2(hash21(vec2(fi, 1.3)), fract(hash21(vec2(fi, 3.9)) + yShift * (0.45 + sp)));
    p.x += sin(t * (0.035 + sp * 0.07) + fi * 2.3) * (0.006 + sp * 0.012);
    p.y += sin(t * (0.025 + sp * 0.05) + fi * 5.1) * 0.003;

    vec2 d = (uvp - p) * vec2(res.x / res.y, 1.0);
    float anim = fract(u_frame * 0.012 + fi * 0.37);
    float amp = (0.0009 + sp * 0.0021) * mix(0.8, 1.25, anim);

    col += vec3(0.040, 0.036, 0.029) * exp(-dot(d, d) / (amp * amp));

    if (sp > 0.9) {
      vec2 d2 = (uvp - p * 0.97 - vec2(0.01, 0.0)) * vec2(res.x / res.y, 1.0);
      col += vec3(0.085, 0.085, 0.082) * exp(-dot(d2, d2) / (amp * amp * 0.30));
    }
  }

  float r = length((uvp - 0.5) * vec2(res.x / res.y, 1.0) * 1.6);
  col *= 1.0 - 0.30 * smoothstep(0.5, 1.25, r);
  gl_FragColor = vec4(col, 1.0);
}
`;

/* ==========================================================================
   章节页材质
   --------------------------------------------------------------------------
   首屏的"房间"是暗的、静的；章节页要有推进感，所以换成另一种东西：
   深色结壳，裂缝下透出热量。这不是纹样，是质地 ——
   西域大地的颜色，而且它天生适合承载"时间在流动"这件事。
   ========================================================================== */

/* ---- 地火：裂纹结壳，热量从缝里出来 ---- */
const EMBER_FRAG = `
precision highp float;

uniform float u_time;
uniform vec2  u_res;
uniform float u_heat;    // 0..1 整体热度（滚动推进时升起来）
uniform float u_scale;   // 纹理尺度
uniform vec2  u_center;  // 热量中心（跟随当前条目）

${NOISE_GLSL}

void main() {
  vec2 uv = gl_FragCoord.xy / u_res.y;
  float aspect = u_res.x / u_res.y;
  vec2 p = vec2((uv.x - aspect * 0.5), (uv.y - 0.5));

  /* 域扭曲：两层嵌套的 fbm，让纹理像被地下的力推着走 */
  vec2 w1 = vec2(fbm(p * 1.6 + 3.1, 4), fbm(p * 1.6 + 8.7, 4)) - 0.5;
  vec2 q = p * u_scale + w1 * 0.9 + vec2(u_time * 0.012, -u_time * 0.008);
  vec2 w2 = vec2(fbm(q * 2.3, 4), fbm(q * 2.3 + 17.0, 4)) - 0.5;
  float crust = fbm(q + w2 * 0.7, 5);

  /* 结壳的"板块"：阈值化之后是硬边，像冷却的岩面 */
  float plate = bandf(crust, 0.055);

  /* 裂缝：板缘就是缝。缝里是热的 */
  float seam = 1.0 - abs(plate * 2.0 - 1.0);
  float crack = pow(clamp(seam, 0.0, 1.0), 1.6);

  /* 分叉的细纹，让缝不是一条光溜溜的线 */
  float hair = ridge(q * 7.5, 3);
  crack = max(crack, pow(clamp(hair, 0.0, 1.0), 7.0) * 0.55);

  /* 热量分布：离当前条目的位置越近越热 */
  vec2 d = (uv - u_center) * vec2(aspect, 1.0);
  float near = exp(-dot(d, d) * 1.9);
  float heat = u_heat * (0.28 + 0.72 * near);

  /* 颜色：结壳是暗褐，缝里从暗红一路烧到暖黄 */
  vec3 rock = mix(vec3(0.030, 0.026, 0.024), vec3(0.075, 0.055, 0.042), plate);
  vec3 emberCol = mix(vec3(0.44, 0.13, 0.045),   // 暗红
                      vec3(0.95, 0.62, 0.22),    // 暖黄
                      pow(clamp(heat, 0.0, 1.0), 1.4));

  vec3 col = rock;
  col += emberCol * crack * heat * 1.35;
  col += emberCol * 0.10 * heat * (1.0 - plate) * 0.6;   // 板面上的余温

  /* 极细的灰，压在暗部避免色阶 */
  col += (hash21(gl_FragCoord.xy + fract(u_time)) - 0.5) * (2.6 / 255.0);

  gl_FragColor = vec4(col, 1.0);
}
`;

/* ---- 章节页的房间：壁面质感保留，但更冷、更静，不抢地火 ---- */
const CHAPTER_AIR_FRAG = `
precision highp float;

uniform sampler2D u_air;     // 尘埃场（半分辨率）
uniform sampler2D u_layer;   // 底层：地火等绘制结果
uniform vec2  u_buf;
uniform float u_time;
uniform float u_wallGain;
uniform float u_heat;

${NOISE_GLSL}

void main() {
  vec2 uvp = gl_FragCoord.xy / u_buf;
  float aspect = u_buf.x / u_buf.y;
  vec2 p = uvp - 0.5;
  p.x *= aspect;

  /* 底层画面 */
  vec3 col = texture2D(u_layer, uvp).rgb;

  /* 壁面：一层很轻的质感，让纯色区域有"墙"的颗粒 */
  float mortar = fbm(uvp * vec2(aspect, 1.0) * 62.0, 3);
  float patina = fbm(uvp * vec2(aspect, 1.0) * 5.2 + 11.3, 5);
  col += ((mortar - 0.5) * 0.005 + (patina - 0.5) * 0.020) * u_wallGain;

  /* 热度渗到空气里 */
  col += vec3(0.022, 0.011, 0.004) * u_heat * 0.5;

  /* 浮尘 */
  vec3 d = texture2D(u_air, uvp * 0.5 + 0.31).rgb
         + texture2D(u_air, uvp * 0.5 + vec2(0.67, 0.21)).rgb;
  col += max(d, vec3(0.0)) * 0.9;

  /* 暗角 */
  col *= 0.34 + 0.66 * smoothstep(1.55, 0.25, length(p * vec2(1.0, 1.14)));
  col += (fract(sin(dot(gl_FragCoord.xy, vec2(12.9898, 78.233))) * 43758.5453) - 0.5) * (2.4 / 255.0);

  gl_FragColor = vec4(col, 1.0);
}
`;

/* ------------------------------------------------- 壁面 + 壁画残片 + 光缝 --
   这是"背景不再单调"的主力。四层叠出来：

     1. 灰浆颗粒   —— 近距离的墙面质感，极低对比
     2. 壁画残迹   —— 斑驳颜料 + 剥落的白灰地仗 + 冰裂纹
                      只在画面外圈出现（中央 55% 刻意留白给结构柱）
     3. 顶部光缝   —— 一道斜向漏光，让尘埃可见，立刻有纵深
     4. 暗角       —— 四角压到接近全黑，把视线收进中央

   注意：壁画层是"残迹"不是"壁画"——没有可辨认的人物或故事画，
   只有颜料的斑驳、地仗的剥落和裂纹。远看是洞窟残墙，近看是材质。 */
const WALL_FRAG = `
precision highp float;

uniform sampler2D u_dust;
uniform vec2  u_buf;
uniform float u_time;
uniform float u_wallGain;   // 壁面质感总强度（0 关闭）
uniform float u_muralGain;  // 壁画残片强度（0 关闭）

${NOISE_GLSL}

void main() {
  vec2 uvp = gl_FragCoord.xy / u_buf;
  float aspect = u_buf.x / u_buf.y;
  vec2 p = uvp - 0.5;
  p.x *= aspect;

  /* ---- 1. 洞窟壁面：两层噪声，一层近一层远 ---- */
  float mortar = fbm(uvp * vec2(aspect, 1.0) * 62.0, 3);          // 灰浆颗粒
  float patina = fbm(uvp * vec2(aspect, 1.0) * 5.2 + 11.3, 5);    // 大面积色斑
  float relief = fbm(uvp * vec2(aspect, 1.0) * 13.0 - 4.7, 4);    // 抹灰的起伏

  float wall = 0.0;
  wall += (mortar - 0.5) * 0.0060;
  wall += (patina - 0.5) * 0.0320;
  wall += (relief - 0.5) * 0.0150;

  /* ---- 2. 壁画残迹：颜料斑 + 白灰地仗 + 冰裂纹 ----
     只出现在外圈。u_ramp 在中央附近为 0，越靠外越强。 */
  float rad = length(p * vec2(1.0, 1.28));
  float ramp = smoothstep(0.34, 0.92, rad) * smoothstep(1.75, 1.05, rad);

  // 颜料块：大的、边界模糊的斑，像褪了色的矿物颜料
  vec2 mp = uvp * vec2(aspect, 1.0) * 2.6 + 31.0;
  float mpWarp = fbm(mp * 0.7, 3);
  float pigment = bandf(fbm(mp + mpWarp * 1.6, 4), 0.16);
  float pigment2 = bandf(fbm(mp * 1.9 + 12.0, 4), 0.13);

  // 三种矿物颜料的色。比结构柱更暗更灰，因为它在远景，隔着空气看
  vec3 cInk  = vec3(0.150, 0.072, 0.048);   // 土红
  vec3 cBlue = vec3(0.050, 0.082, 0.098);   // 石青
  vec3 cGold = vec3(0.128, 0.094, 0.042);   // 土黄
  vec3 mural = mix(cInk, cBlue, pigment2);
  mural = mix(mural, cGold, bandf(fbm(mp * 3.1 - 20.0, 3), 0.11) * 0.6);
  mural *= 0.72 + 0.28 * pigment;

  // 剥落：露出的白灰地仗。这是"残"的关键，没有它就像贴纸
  float lost = bandf(fbm(mp * 1.15 + 7.7, 5), 0.10);
  mural = mix(mural, vec3(0.112, 0.100, 0.082), lost);

  // 冰裂纹：细密的网状裂纹，只在壁画区域可见
  float craq = ridge(mp * 8.5, 3);
  float crack = 1.0 - smoothstep(0.62, 0.92, craq);
  mural *= 1.0 - crack * 0.55;

  mural *= ramp;

  /* ---- 3. 顶部光缝：一道斜向漏光 ---- */
  vec2 sp = p;
  sp.x += sp.y * 0.55;                                  // 让光柱倾斜
  float shaft = exp(-pow(sp.x * 3.6, 2.0));             // 收窄，否则像一层雾
  float shaftNoise = 0.68 + 0.60 * fbm(uvp * vec2(aspect, 1.0) * 3.4 + u_time * 0.012, 4);
  shaft *= shaftNoise;
  shaft *= smoothstep(0.52, -0.16, p.y);                // 越往上越亮，说明光从上方漏下来
  shaft *= smoothstep(-0.72, -0.28, p.y);               // 最上沿收住，避免切边
  shaft *= 0.0165;

  /* ---- 组合 ---- */
  float room = 0.0095 + 0.0028 * sin(u_time * 0.21);
  vec3 col = vec3(room);

  col += wall * u_wallGain;
  col += mural * u_muralGain;

  // 光缝：暖白，尘埃在光里会被下面的加色再提亮一次
  col += vec3(1.0, 0.92, 0.78) * shaft;

  /* ---- 4. 浮尘：进光柱里的尘会亮一些 ---- */
  vec3 d = texture2D(u_dust, uvp * 0.5 + 0.24).rgb
         + texture2D(u_dust, uvp * 0.5 + vec2(0.61, 0.17)).rgb;
  d = max(d, vec3(0.0));
  col += d * (0.85 + shaft * 42.0);

  // 暗角：四角压到接近全黑
  col *= 0.30 + 0.70 * smoothstep(1.58, 0.22, length(p * vec2(1.0, 1.16)));

  // 抖动，避免大片暗面出现色阶
  col += (fract(sin(dot(gl_FragCoord.xy, vec2(12.9898, 78.233))) * 43758.5453) - 0.5) * (2.4 / 255.0);

  gl_FragColor = vec4(col, 1.0);
}
`;

__ns = __XM[2];
__ns.mount_VERT_SRC = function () { return VERT_SRC; };
__ns.mount_NOISE_GLSL = function () { return NOISE_GLSL; };
__ns.mount_MATERIAL_GLSL = function () { return MATERIAL_GLSL; };
__ns.mount_SCENE_FRAG = function () { return SCENE_FRAG; };
__ns.mount_DUST_FRAG = function () { return DUST_FRAG; };
__ns.mount_EMBER_FRAG = function () { return EMBER_FRAG; };
__ns.mount_CHAPTER_AIR_FRAG = function () { return CHAPTER_AIR_FRAG; };
__ns.mount_WALL_FRAG = function () { return WALL_FRAG; };
}

/* ── js/lib/renderer.js ── */
function __M3__() {
var VERT_SRC = __XM[2]["VERT_SRC"];
var SCENE_FRAG = __XM[2]["SCENE_FRAG"];
var DUST_FRAG = __XM[2]["DUST_FRAG"];
var WALL_FRAG = __XM[2]["WALL_FRAG"];
var EMBER_FRAG = __XM[2]["EMBER_FRAG"];
var CHAPTER_AIR_FRAG = __XM[2]["CHAPTER_AIR_FRAG"];
var MATERIAL_GLSL = __XM[2]["MATERIAL_GLSL"];

/* ==========================================================================
   弦脉 · 渲染器
   --------------------------------------------------------------------------
   一条很短的管线，三个 pass，每个 pass 只干一件事：

     pass 1  浮尘反馈场   半分辨率 FBO 乒乓，做真拖尾（不是粒子数组）
     pass 2  房间合成     壁面质感 + 壁画残迹 + 顶部光缝 + 浮尘 + 暗角 → 上屏
     (bake)  材质烘焙     把某一段结构柱材质渲进离屏 FBO，读回成纹理

   —— 尺寸原则 ——
   整条管线只有一个尺寸来源：**画布自身的布局盒**。后备缓冲、离屏目标、
   视口全部由它按同一个比例推出，合成永远是 1:1。这样任何环境的缩放或
   像素预算都不会让几何错位 —— 这是踩过坑之后定下的规矩。

   —— 分工原则 ——
   结构柱不在这里画。它由 GPU 生成材质、烘焙成纹理、交给 DOM 承载，
   几何归布局引擎管。渲染器只负责"空气和墙"。
   ========================================================================== */



/** 三段结构柱的配色令牌。与 styles.css 的 :root 同值，tools/verify.mjs 会校验。 */
const COLORS = {
  seg1a: [58 / 255, 43 / 255, 40 / 255],    // 深赭石
  seg1b: [30 / 255, 48 / 255, 56 / 255],    // 暗青
  seg1c: [36 / 255, 31 / 255, 32 / 255],
  seg2a: [192 / 255, 138 / 255, 62 / 255],  // 暖金
  seg2b: [153 / 255, 66 / 255, 42 / 255],   // 土红
  seg3a: [74 / 255, 128 / 255, 113 / 255],  // 石绿
  seg3b: [163 / 255, 59 / 255, 40 / 255],   // 朱砂

  glow1: [0.46, 0.60, 0.68],
  glow2: [0.80, 0.60, 0.30],
  glow3: [0.34, 0.58, 0.50],
  ink: [10 / 255, 9 / 255, 8 / 255],
  bg: [0.025, 0.0235, 0.0215],
};

/** 三段体量比例（与 DOM 里的 --h 一致）：穹乃额曼最重 */
const SEG_H = [1.18, 0.86, 0.96];
const SEG_SUM = SEG_H[0] + SEG_H[1] + SEG_H[2];
const SEG_BOUNDS = [0, SEG_H[0] / SEG_SUM, (SEG_H[0] + SEG_H[1]) / SEG_SUM, 1];

/** 三段呼吸周期（秒）。越往下越快，与性格同步。 */
const BREATH = [13.0, 9.5, 6.5];

const SEG_COUNT = 3;

class Renderer {
  /**
   * @param {HTMLCanvasElement} canvas
   * @param {object} [opts]
   * @param {'room'|'chapter'} [opts.mode='room']  room = 房间（壁面+壁画），chapter = 章节页（地火+空气）
   * @param {number} [opts.wallGain=1]   壁面质感强度
   * @param {number} [opts.muralGain=1]  壁画残片强度
   * @param {number} [opts.maxPixels=2.6e6]  后备缓冲像素上限（集显保护）
   */
  constructor(canvas, opts = {}) {
    const gl = canvas.getContext('webgl', {
      alpha: false, antialias: false, depth: false, stencil: false,
      premultipliedAlpha: false, preserveDrawingBuffer: false,
      powerPreference: 'high-performance',
    }) || canvas.getContext('experimental-webgl');
    if (!gl) throw new Error('no-webgl');

    this.canvas = canvas;
    this.gl = gl;
    this.mode = opts.mode || 'room';
    this.wallGain = opts.wallGain === undefined ? 1 : opts.wallGain;
    this.muralGain = opts.muralGain === undefined ? 1 : opts.muralGain;
    this.maxPixels = opts.maxPixels || 2.6e6;
    this.heat = 0;
    this.emberScale = 1.55;
    this.center = [0.5, 0.5];

    this.quad = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, this.quad);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);

    // 剥落边缘的浮雕用 dFdx/dFdy，需要显式开启导数扩展
    this.derivatives = !!gl.getExtension('OES_standard_derivatives');

    this.pScene = this._program(VERT_SRC, SCENE_FRAG, 'scene');
    this.pDust = this._program(VERT_SRC, DUST_FRAG, 'dust');
    this.pAir = this._program(VERT_SRC, WALL_FRAG, 'air');
    this.pEmber = this._program(VERT_SRC, EMBER_FRAG, 'ember');
    this.pChapterAir = this._program(VERT_SRC, CHAPTER_AIR_FRAG, 'chapterAir');

    this.uScene = this._locs(this.pScene,
      ['u_buf', 'u_cs', 'u_pillarCss', 'u_time', 'u_stage', 'u_active', 'u_open',
       'u_c1a', 'u_c1b', 'u_c1c', 'u_c2a', 'u_c2b', 'u_c3a', 'u_c3b',
       'u_g1', 'u_g2', 'u_g3', 'u_ink', 'u_bg', 'u_dust',
       'u_bandMode', 'u_bandSeed', 'u_dim', 'u_deriv', 'u_tile'],
      ['u_lit', 'u_breath', 'u_segBound']);
    this.uDust = this._locs(this.pDust,
      ['u_res', 'u_time', 'u_vel', 'u_frame', 'u_amount'], ['u_prev']);
    this.uAir = this._locs(this.pAir,
      ['u_buf', 'u_time', 'u_wallGain', 'u_muralGain'], ['u_dust']);
    this.uEmber = this._locs(this.pEmber,
      ['u_time', 'u_res', 'u_heat', 'u_scale', 'u_center'], []);
    this.uCAir = this._locs(this.pChapterAir,
      ['u_buf', 'u_time', 'u_wallGain', 'u_heat'], ['u_air', 'u_layer']);

    this.rt = null;
    this.ping = this._target(1, 1);
    this.pong = this._target(1, 1);
    this.size = [0, 0];
    this.css = [0, 0];
    this.cs = 1;
    this.started = performance.now();
    this.cleared = false;

    // 性能自适应：帧时连续偏慢就减尘埃，仍然慢就整体降级
    this.dustAmount = 28;
    this.frameTimes = [];
    this.degraded = false;
  }

  /* ------------------------------------------------------------ GL 基础 */

  _compile(type, src, name) {
    const gl = this.gl;
    const sh = gl.createShader(type);
    gl.shaderSource(sh, src);
    gl.compileShader(sh);
    if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
      throw new Error('shader[' + name + ']: ' + gl.getShaderInfoLog(sh));
    }
    return sh;
  }

  _program(vs, fs, name) {
    const gl = this.gl;
    const p = gl.createProgram();
    gl.attachShader(p, this._compile(gl.VERTEX_SHADER, vs, name + '.vs'));
    gl.attachShader(p, this._compile(gl.FRAGMENT_SHADER, fs, name + '.fs'));
    gl.bindAttribLocation(p, 0, 'a_pos');
    gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) {
      throw new Error('link[' + name + ']: ' + gl.getProgramInfoLog(p));
    }
    return p;
  }

  _locs(prog, scalar, arrays) {
    const gl = this.gl;
    const o = { u: {}, a: {} };
    scalar.forEach((n) => { o.u[n] = gl.getUniformLocation(prog, n); });
    (arrays || []).forEach((n) => { o.a[n] = gl.getUniformLocation(prog, n + '[0]'); });
    return o;
  }

  _target(w, h) {
    const gl = this.gl;
    const tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    const fb = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    return { tex, fb, w, h };
  }

  _bindQuad(prog) {
    const gl = this.gl;
    gl.bindBuffer(gl.ARRAY_BUFFER, this.quad);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
  }

  /* -------------------------------------------------------------- 尺寸 */

  /**
   * 尺寸只有一个来源：画布的布局盒。
   * @param {number} cssW
   * @param {number} cssH
   * @param {number} [dpr] 设备像素比，默认取 window.devicePixelRatio
   */
  resize(cssW, cssH, dpr) {
    const gl = this.gl;
    cssW = Math.max(1, Math.round(cssW));
    cssH = Math.max(1, Math.round(cssH));
    if (dpr === undefined) dpr = window.devicePixelRatio || 1;

    let scale = Math.min(dpr, 1.5);
    if (cssW * cssH * scale * scale > this.maxPixels) {
      scale *= Math.sqrt(this.maxPixels / (cssW * cssH * scale * scale));
    }
    scale = Math.max(1, scale);

    const bw = Math.max(1, Math.round(cssW * scale));
    const bh = Math.max(1, Math.round(cssH * scale));
    if (this.canvas.width !== bw || this.canvas.height !== bh) {
      this.canvas.width = bw;
      this.canvas.height = bh;
    }

    if (this.size[0] !== bw || this.size[1] !== bh) {
      if (this.rt) { gl.deleteTexture(this.rt.tex); gl.deleteFramebuffer(this.rt.fb); }
      this.rt = this._target(bw, bh);
      this.size = [bw, bh];

      const dw = Math.max(1, Math.round(bw * 0.5));
      const dh = Math.max(1, Math.round(bh * 0.5));
      [this.ping, this.pong].forEach((t) => {
        gl.bindTexture(gl.TEXTURE_2D, t.tex);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, dw, dh, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
        t.w = dw; t.h = dh;
      });
      this.cleared = false;
    }

    this.css = [cssW, cssH];
    // 坐标映射比例：从实际后备缓冲推，不用期望的 dpr
    this.cs = this.canvas.width / cssW;
    if (!this.cleared) { this.clearDust(); this.cleared = true; }
  }

  /** 新建的纹理内容是未定义的，不清就会在开头把画面冲成一片亮雾 */
  clearDust() {
    const gl = this.gl;
    gl.disable(gl.BLEND);
    gl.clearColor(0, 0, 0, 1);
    [this.ping, this.pong].forEach((t) => {
      gl.bindFramebuffer(gl.FRAMEBUFFER, t.fb);
      gl.viewport(0, 0, t.w, t.h);
      gl.clear(gl.COLOR_BUFFER_BIT);
    });
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  }

  /* ------------------------------------------------------------ 材质烘焙 */

  /**
   * 把一段结构柱材质渲进离屏 FBO 并读回成 PNG data URL。
   *
   * 这是"几何归布局、材质归 GPU"这个分工的落点：着色器负责生成，
   * 布局引擎负责摆放，两边不互相干扰。
   *
   * @param {number} band 0 穹乃额曼 / 1 达斯坦 / 2 麦西热甫
   * @param {number} w 纹理宽（按该段真实宽高比给，避免拉伸）
   * @param {number} h 纹理高
   * @param {number} [dim=1] 整体明度：暗版作底，亮版做高光层
   * @returns {string} data URL
   */
  bake(band, w, h, dim) {
    const gl = this.gl;
    const rt = this._target(w, h);
    gl.bindFramebuffer(gl.FRAMEBUFFER, rt.fb);
    gl.viewport(0, 0, w, h);
    gl.disable(gl.BLEND);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, null);   // 否则与当前帧缓冲形成反馈回路
    gl.useProgram(this.pScene);
    this._bindQuad(this.pScene);

    const u = this.uScene.u;
    gl.uniform1i(u.u_dust, 0);
    gl.uniform2f(u.u_buf, w, h);
    gl.uniform1f(u.u_cs, 1);
    gl.uniform4f(u.u_pillarCss, 0, 0, 1, 1);
    gl.uniform1f(u.u_time, 0);
    gl.uniform1f(u.u_stage, 0);
    gl.uniform1f(u.u_active, 0);
    gl.uniform1f(u.u_open, 1);
    gl.uniform1f(u.u_bandMode, band);
    gl.uniform1f(u.u_bandSeed, band * 3.7);
    gl.uniform2f(u.u_tile, w, h);
    gl.uniform1f(u.u_dim, dim === undefined ? 1 : dim);
    gl.uniform1f(u.u_deriv, this.derivatives ? 1 : 0);
    gl.uniform3fv(u.u_c1a, COLORS.seg1a);
    gl.uniform3fv(u.u_c1b, COLORS.seg1b);
    gl.uniform3fv(u.u_c1c, COLORS.seg1c);
    gl.uniform3fv(u.u_c2a, COLORS.seg2a);
    gl.uniform3fv(u.u_c2b, COLORS.seg2b);
    gl.uniform3fv(u.u_c3a, COLORS.seg3a);
    gl.uniform3fv(u.u_c3b, COLORS.seg3b);
    gl.uniform1fv(this.uScene.a.u_lit, new Float32Array([1, 1, 1]));
    gl.uniform1fv(this.uScene.a.u_breath, new Float32Array(BREATH));
    gl.uniform1fv(this.uScene.a.u_segBound, new Float32Array(SEG_BOUNDS));
    gl.drawArrays(gl.TRIANGLES, 0, 3);

    const px = new Uint8Array(w * h * 4);
    gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, px);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.deleteTexture(rt.tex);
    gl.deleteFramebuffer(rt.fb);

    // GL 原点在左下，PNG 需要自上而下
    const out = document.createElement('canvas');
    out.width = w; out.height = h;
    const ctx = out.getContext('2d');
    const img = ctx.createImageData(w, h);
    for (let y = 0; y < h; y++) {
      const src = (h - 1 - y) * w * 4;
      img.data.set(px.subarray(src, src + w * 4), y * w * 4);
    }
    ctx.putImageData(img, 0, 0);
    return out.toDataURL('image/png');
  }

  /* -------------------------------------------------------------- 渲染 */

  /**
   * @param {object} st
   * @param {number} st.time 秒
   * @param {number} [st.velocity] 0..1.4 滚动惯性
   * @param {number} [st.frame] 帧序号
   * @param {number} [st.heat] 0..1 地火热度（chapter 模式）
   * @param {number[]} [st.center] 热量中心，归一化 uv（chapter 模式）
   */
  render(st) {
    const gl = this.gl;
    const bw = this.size[0], bh = this.size[1];
    if (!bw) return;

    /* ---- pass 1：浮尘反馈场（两种模式共用） ---- */
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.pong.fb);
    gl.viewport(0, 0, this.pong.w, this.pong.h);
    gl.disable(gl.BLEND);
    gl.useProgram(this.pDust);
    this._bindQuad(this.pDust);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.ping.tex);
    gl.uniform1i(this.uDust.a.u_prev, 0);
    gl.uniform2f(this.uDust.u.u_res, this.pong.w, this.pong.h);
    gl.uniform1f(this.uDust.u.u_time, st.time);
    gl.uniform1f(this.uDust.u.u_vel, st.velocity || 0);
    gl.uniform1f(this.uDust.u.u_frame, st.frame || 0);
    gl.uniform1f(this.uDust.u.u_amount, this.dustAmount);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    const tmp = this.ping; this.ping = this.pong; this.pong = tmp;

    /* ---- pass 2：底层画面（房间 / 地火） ---- */
    const chapter = this.mode === 'chapter';
    gl.bindFramebuffer(gl.FRAMEBUFFER, chapter ? this.rt.fb : null);
    gl.viewport(0, 0, bw, bh);
    gl.clearColor(0, 0, 0, 1);
    gl.clear(gl.COLOR_BUFFER_BIT);

    if (chapter) {
      gl.useProgram(this.pEmber);
      this._bindQuad(this.pEmber);
      const u = this.uEmber.u;
      gl.uniform1f(u.u_time, st.time);
      gl.uniform2f(u.u_res, bw, bh);
      gl.uniform1f(u.u_heat, st.heat === undefined ? this.heat : st.heat);
      gl.uniform1f(u.u_scale, this.emberScale);
      gl.uniform2f(u.u_center, this.center[0], this.center[1]);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    }

    /* ---- pass 3：空气层 / 房间层，上屏 ---- */
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, bw, bh);
    gl.useProgram(chapter ? this.pChapterAir : this.pAir);
    this._bindQuad(chapter ? this.pChapterAir : this.pAir);

    if (chapter) {
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, this.ping.tex);
      gl.activeTexture(gl.TEXTURE1);
      gl.bindTexture(gl.TEXTURE_2D, this.rt.tex);
      gl.uniform1i(this.uCAir.a.u_air, 0);
      gl.uniform1i(this.uCAir.a.u_layer, 1);
      gl.uniform2f(this.uCAir.u.u_buf, bw, bh);
      gl.uniform1f(this.uCAir.u.u_time, st.time);
      gl.uniform1f(this.uCAir.u.u_wallGain, this.wallGain);
      gl.uniform1f(this.uCAir.u.u_heat, st.heat === undefined ? this.heat : st.heat);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      gl.activeTexture(gl.TEXTURE0);
    } else {
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, this.ping.tex);
      gl.uniform1i(this.uAir.a.u_dust, 0);
      gl.uniform2f(this.uAir.u.u_buf, bw, bh);
      gl.uniform1f(this.uAir.u.u_time, st.time);
      gl.uniform1f(this.uAir.u.u_wallGain, this.wallGain);
      gl.uniform1f(this.uAir.u.u_muralGain, this.muralGain);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    }
  }

  /* ---------------------------------------------------------- 性能自适应 */

  /** 帧时连续偏慢就减尘埃，仍然慢就整体降级 */
  sample(dt) {
    if (this.degraded) return;
    this.frameTimes.push(dt);
    if (this.frameTimes.length < 90) return;
    const avg = this.frameTimes.reduce((a, b) => a + b, 0) / this.frameTimes.length;
    this.frameTimes.length = 0;
    if (avg > 26 && this.dustAmount > 14) this.dustAmount -= 7;
    else if (avg < 17 && this.dustAmount < 28) this.dustAmount += 4;
    if (this.dustAmount <= 14 && avg > 30) this.degraded = true;
  }
}

__ns = __XM[3];
__ns.mount_COLORS = function () { return COLORS; };
__ns.mount_SEG_H = function () { return SEG_H; };
__ns.mount_SEG_BOUNDS = function () { return SEG_BOUNDS; };
__ns.mount_BREATH = function () { return BREATH; };
__ns.mount_Renderer = function () { return Renderer; };
}

/* ── js/lib/sequencer.js ── */
function __M4__() {
/* ==========================================================================
   弦脉 · 手鼓音序器
   --------------------------------------------------------------------------
   —— 时间尺度是这套东西的关键，先说清楚 ——

   人耳感知"节拍"有门槛：相邻两声超过约 1.5–2 秒，就不再被听成节奏，
   而是一声一声孤立的响。所以散板也不能真的散到五六秒一记 ——
   那不叫"疏"，那叫"断"。

   这里定的规矩：
     · 一个乐句 = 12 拍，时长压到 5–6 秒（有效拍感 120–150 bpm）
     · 音间间隔不超过约 1 秒 —— 留白靠"轻音填空"，不靠真空
     · 一轮四个乐句约 21–24 秒，循环一次刚好听得出起承转合，又不嫌长

   —— 五种音色（全部加法合成，无采样）——
     dum    低音：正弦 118→46Hz，叠三角波给"皮"的质感
     tek    边击：带通噪声 + 极短皮面音
     snap   脆击：噪声高频 + 音高上扬的短音，麦西热甫的尖点
     mute   闷击：闭音，decay 极短，用来收紧句尾
     roll   指滚：噪声被 52Hz 调制，一口气碾过去

   —— 三段的性格差异 ——
     穹乃额曼  慢而不空。骨架极简，靠轻音把时间撑住；声场最远最暗
     达斯坦    中速规整。走句与加花，密度上升但留气口；中景
     麦西热甫  快而密。十六分与三连音交织，句句相扣；最近最亮

   每记带 ±1.8% 的音高抖动与 ±4ms 的时间偏移 —— 人手的不精确，
   这是"顺耳"和"机械"的分界线。
   ========================================================================== */

/* 一拍里的细分密度：1 = 疏（散板感），2 = 八分，3 = 三连音。

   pulse 是"脉冲轨"：当主节奏留下过长的空档时，自动补一记极轻的边击。
   它的作用不是加音符，而是给耳朵一个稳定的时间参照 ——
   有了它，骨架才敢真的稀疏。真实鼓乐合奏里本来就有这种持续脉动。

   pulseEvery  补点的最小间隔（步）
   pulseGain   补点力度（很轻，是"气息"不是"音符"）
   pulseGuard  离主音太近就不补（步）—— 否则补点会贴在主音前十几毫秒，
               糊成一个 flam，反而更脏 */
const PATTERNS = [
  { // ── 穹乃额曼：慢而不空。骨架极简，靠脉冲轨把时间撑住 ──
    bpm: 108,
    pulseEvery: 2, pulseGain: 0.085, pulseGuard: 0,
    phrases: [
      { div: 1, steps: [
        { b: 0, s: 'dum', g: 0.40, a: 1 },
        { b: 3, s: 'tek', g: 0.13 },          // 轻音填空，避免"断"
        { b: 6, s: 'mute', g: 0.15 },
        { b: 9, s: 'tek', g: 0.12 },
      ] },
      { div: 2, steps: [
        { b: 0, s: 'dum', g: 0.42, a: 1 },
        { b: 4, s: 'tek', g: 0.14 },
        { b: 8, s: 'dum', g: 0.28 },
        { b: 11, s: 'tek', g: 0.12 },         // 句尾挂一下，接回第一句
      ] },
      { div: 1, steps: [
        { b: 0, s: 'dum', g: 0.40, a: 1 },
        { b: 3, s: 'tek', g: 0.15 },
        { b: 6, s: 'dum', g: 0.26 },
        { b: 9, s: 'mute', g: 0.16 },
      ] },
      { div: 2, steps: [
        { b: 0, s: 'dum', g: 0.44, a: 1 },
        { b: 3, s: 'tek', g: 0.13 },
        { b: 6, s: 'tek', g: 0.15 },
        { b: 9, s: 'roll', g: 0.13 },         // 一口气滚过去，回到起点
      ] },
    ],
  },
  { // ── 达斯坦：规整 12 拍。有走句，有气口 ──
    bpm: 122,
    pulseEvery: 3, pulseGain: 0.070, pulseGuard: 1,
    phrases: [
      { div: 2, steps: [
        { b: 0, s: 'dum', g: 0.38, a: 1 },
        { b: 3, s: 'tek', g: 0.16 },
        { b: 6, s: 'dum', g: 0.26 },
        { b: 8, s: 'tek', g: 0.18 },
        { b: 10, s: 'tek', g: 0.14 },
      ] },
      { div: 2, steps: [
        { b: 0, s: 'dum', g: 0.36, a: 1 },
        { b: 2, s: 'tek', g: 0.15 },
        { b: 5, s: 'dum', g: 0.24 },
        { b: 7, s: 'tek', g: 0.17 },
        { b: 9, s: 'dum', g: 0.30, a: 1 },
        { b: 11, s: 'tek', g: 0.13 },
      ] },
      { div: 3, steps: [                       // 三连音：走句开始流动
        { b: 0, s: 'dum', g: 0.38, a: 1 },
        { b: 4, s: 'tek', g: 0.16 }, { b: 4, s: 'tek', g: 0.11 },
        { b: 8, s: 'dum', g: 0.27 },
        { b: 10, s: 'tek', g: 0.19 }, { b: 10, s: 'snap', g: 0.13 },
      ] },
      { div: 2, steps: [                       // 句尾 fill：滚奏推进
        { b: 0, s: 'dum', g: 0.34, a: 1 },
        { b: 6, s: 'dum', g: 0.28 },
        { b: 9, s: 'snap', g: 0.16 },
        { b: 10, s: 'roll', g: 0.20 },
        { b: 11, s: 'tek', g: 0.15 },
      ] },
    ],
  },
  { // ── 麦西热甫：欢腾。密集、跳跃、句句相扣 ──
    bpm: 152,
    pulseEvery: 4, pulseGain: 0.055, pulseGuard: 1,   // 本来就密，脉冲只做支撑
    phrases: [
      { div: 2, steps: [
        { b: 0, s: 'dum', g: 0.40, a: 1 },
        { b: 1, s: 'tek', g: 0.17 }, { b: 2, s: 'snap', g: 0.15 },
        { b: 3, s: 'dum', g: 0.28 },
        { b: 5, s: 'tek', g: 0.20 }, { b: 6, s: 'tek', g: 0.15 },
        { b: 8, s: 'dum', g: 0.32 },
        { b: 9, s: 'snap', g: 0.17 },
        { b: 11, s: 'tek', g: 0.22 },
      ] },
      { div: 3, steps: [                       // 三连音滚奏
        { b: 0, s: 'dum', g: 0.40, a: 1 },
        { b: 2, s: 'tek', g: 0.18 }, { b: 2, s: 'snap', g: 0.16 },
        { b: 4, s: 'tek', g: 0.20 },
        { b: 6, s: 'dum', g: 0.30 },
        { b: 7, s: 'tek', g: 0.22 }, { b: 7, s: 'tek', g: 0.14 },
        { b: 9, s: 'snap', g: 0.19 },
        { b: 10, s: 'roll', g: 0.18 },
        { b: 11, s: 'mute', g: 0.22 },
      ] },
      { div: 2, steps: [
        { b: 0, s: 'dum', g: 0.42, a: 1 },
        { b: 2, s: 'tek', g: 0.19 }, { b: 3, s: 'snap', g: 0.17 },
        { b: 4, s: 'tek', g: 0.21 },
        { b: 6, s: 'dum', g: 0.34 },
        { b: 8, s: 'tek', g: 0.20 }, { b: 9, s: 'snap', g: 0.16 },
        { b: 10, s: 'tek', g: 0.24 },
        { b: 11, s: 'mute', g: 0.18 },
      ] },
      { div: 3, steps: [                       // 收句：滚奏冲到顶
        { b: 0, s: 'dum', g: 0.44, a: 1 },
        { b: 3, s: 'tek', g: 0.18 },
        { b: 5, s: 'roll', g: 0.22 },
        { b: 8, s: 'dum', g: 0.36, a: 1 },
        { b: 9, s: 'snap', g: 0.20 },
        { b: 11, s: 'tek', g: 0.24 },
      ] },
    ],
  },
];

/* 某个拍位在这一句里是否有主节奏（给脉冲轨的避让判断用） */
function gridHas(beat, phrase) {
  for (let i = 0; i < phrase.steps.length; i++) {
    if (phrase.steps[i].b === beat) return true;
  }
  return false;
}

class DapSequencer {  /**
   * @param {object} [opts]
   * @param {number} [opts.volume=0.3]  总音量
   * @param {(info:object)=>void} [opts.onPhrase]  乐句切换回调（视觉可以跟着动）
   */
  constructor(opts = {}) {
    this.volume = opts.volume === undefined ? 0.34 : opts.volume;
    this.onPhrase = opts.onPhrase || null;

    this.ctx = null;
    this.master = null;
    this.gain = null;          // 声部汇总点
    this.gainNode = null;
    this.bandGain = null;      // 每段的整体音量差
    this.tone = null;
    this.dry = null;
    this.wet = null;
    this.comp = null;
    this.chain = null;
    this.noiseBuf = null;
    this.ready = false;
    this.enabled = false;

    this.band = 0;
    this.phrase = 0;
    this.step = 0;
    this.nextT = 0;
    this.timer = null;

    this.LOOKAHEAD = 0.18;
    this.TICK = 40;
  }

  /* ------------------------------------------------------------ 生命周期 */
  init() {
    if (this.ready) return true;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return false;
    const c = new AC();
    this.ctx = c;

    /* 信号链：
         voices → gain → hp → tone ┬→ dry ─┐
                                   └→ conv ─┴→ comp → master → out

       限幅是必须的：5 个声部叠加时瞬时峰值会超过 1.0，直接数字削波很刺耳。
       压缩器把峰值收住，整体反而更响、更稳。 */
    const gain = c.createGain();
    gain.gain.value = 1;

    const bandGain = c.createGain();
    bandGain.gain.value = 1;

    const hp = c.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 22;
    const tone = c.createBiquadFilter();
    tone.type = 'lowpass';
    tone.frequency.value = 9000;
    tone.Q.value = 0.4;

    const dry = c.createGain();
    dry.gain.value = 0.85;

    const wet = c.createGain();
    wet.gain.value = 0.35;

    const conv = c.createConvolver();
    conv.buffer = this._makeRoomIR(0.42, 0.55);

    const comp = c.createDynamicsCompressor();
    comp.threshold.value = -10;
    comp.knee.value = 6;
    comp.ratio.value = 4;
    comp.attack.value = 0.004;
    comp.release.value = 0.18;

    const master = c.createGain();
    master.gain.value = 0;                    // 由 enable() 淡入

    // voices → bandGain → gain → hp → tone → (dry | conv→wet) → comp → master → out
    bandGain.connect(gain);
    gain.connect(hp);
    hp.connect(tone);
    tone.connect(dry);
    tone.connect(conv);
    conv.connect(wet);
    dry.connect(comp);
    wet.connect(comp);
    comp.connect(master);
    master.connect(c.destination);

    this.gain = gain;
    this.bandGain = bandGain;
    this.tone = tone;
    this.dry = dry;
    this.wet = wet;
    this.comp = comp;
    this.master = master;
    this.chain = this.gain;                   // 声部接到这里

    this.noiseBuf = this._makeNoise();
    this.ready = true;
    this._applyBand();
    return true;
  }

  /* ---------------------------------------------------------------- 房间 --
     合成一段 0.4 秒的房间脉冲响应：指数衰减噪声 + 几个早期反射。
     目的是让声音有"在一个暗房间里"的距离感，而不是贴在脸上。
     一定要短 —— 打击乐的混响超过半秒就会糊成一团，反而不如干声清楚。
     比采样混响省得多。 */
  _makeRoomIR(decay, damp) {
    const c = this.ctx;
    const sr = c.sampleRate;
    const len = Math.max(1, Math.floor(sr * decay));
    const buf = c.createBuffer(2, len, sr);

    for (let ch = 0; ch < 2; ch++) {
      const d = buf.getChannelData(ch);
      let lp = 0;
      for (let i = 0; i < len; i++) {
        const t = i / len;
        const env = Math.pow(1 - t, 2.6);          // 尾巴衰减
        const white = Math.random() * 2 - 1;
        // 一阶低通：越往后越暗，像被墙吸掉高频
        lp = lp * (0.55 + t * 0.35) + white * (0.45 - t * 0.35);
        d[i] = lp * env * damp;
      }
      // 早期反射：几个离散的抽头，给房间一点尺寸感
      [0.011, 0.019, 0.031, 0.047].forEach((sec, k) => {
        const at = Math.floor(sec * sr) + (ch ? 37 : 0);
        if (at < len) d[at] += (k % 2 ? -1 : 1) * (0.32 / (k + 1));
      });
    }
    return buf;
  }

  /** 三段各自的房间与音色：远 → 近 → 更近 */
  _applyBand() {
    if (!this.ready) return;
    const t = this.ctx.currentTime;
    const P = [
      // 穹乃额曼：慢而稀（一个 dum 要等 6 秒），必须给足电平，
      // 否则整段会被听成"没在响"。远、暗靠混响与低通做，不靠压电平。
      { wet: 0.45, dry: 1.10, lp: 5000, gain: 2.10 },
      { wet: 0.30, dry: 1.00, lp: 8000, gain: 1.25 },   // 达斯坦：中景
      { wet: 0.18, dry: 1.05, lp: 12000, gain: 1.15 },  // 麦西热甫：贴脸、亮
    ][this.band];

    this.wet.gain.setTargetAtTime(P.wet, t, 0.4);
    this.dry.gain.setTargetAtTime(P.dry, t, 0.4);
    this.tone.frequency.setTargetAtTime(P.lp, t, 0.4);
    if (this.bandGain) this.bandGain.gain.setTargetAtTime(P.gain, t, 0.4);
  }

  /** 粉噪底：白噪过一次一阶低通，用来做各种击打音色 */
  _makeNoise() {
    const len = Math.floor(this.ctx.sampleRate * 0.5);
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = buf.getChannelData(0);
    let last = 0;
    for (let i = 0; i < len; i++) {
      const white = Math.random() * 2 - 1;
      last = (last + 0.02 * white) / 1.02;
      d[i] = last * 3.2;
    }
    return buf;
  }

  enable() {
    if (!this.init()) return false;
    if (this.ctx.state === 'suspended') this.ctx.resume();
    this.enabled = true;
    this.step = 0;
    this.nextT = this.ctx.currentTime + 0.08;
    this.master.gain.cancelScheduledValues(this.ctx.currentTime);
    this.master.gain.setTargetAtTime(this.volume, this.ctx.currentTime, 0.8);
    if (!this.timer) this.timer = setInterval(() => this._tick(), this.TICK);
    return true;
  }

  disable() {
    this.enabled = false;
    if (this.timer) { clearInterval(this.timer); this.timer = null; }
    if (this.ctx && this.master) {
      this.master.gain.cancelScheduledValues(this.ctx.currentTime);
      this.master.gain.setTargetAtTime(0.0001, this.ctx.currentTime, 0.35);
    }
  }

  /** 切换段落：乐句从头开始，避免切段时半句悬空；房间与音色跟着换 */
  setBand(i) {
    const n = Math.max(0, Math.min(2, i | 0));
    if (n === this.band) return;
    this.band = n;
    this.phrase = 0;
    this.step = 0;
    this._applyBand();
  }

  /* -------------------------------------------------------------- 音色库 */

  /** 低音：正弦 118→46Hz，叠三角波给"皮"的质感 */
  _dum(t, g, pitch) {
    const c = this.ctx;
    const o = c.createOscillator(), gn = c.createGain();
    o.type = 'sine';
    o.frequency.setValueAtTime(118 * pitch, t);
    o.frequency.exponentialRampToValueAtTime(46 * pitch, t + 0.13);
    gn.gain.setValueAtTime(0.0001, t);
    gn.gain.exponentialRampToValueAtTime(g, t + 0.005);
    gn.gain.exponentialRampToValueAtTime(0.0001, t + 0.36);
    o.connect(gn).connect(this.chain);
    o.start(t); o.stop(t + 0.42);

    const o2 = c.createOscillator(), g2 = c.createGain();
    o2.type = 'triangle';
    o2.frequency.setValueAtTime(210 * pitch, t);
    o2.frequency.exponentialRampToValueAtTime(96 * pitch, t + 0.06);
    g2.gain.setValueAtTime(0.0001, t);
    g2.gain.exponentialRampToValueAtTime(g * 0.32, t + 0.003);
    g2.gain.exponentialRampToValueAtTime(0.0001, t + 0.1);
    o2.connect(g2).connect(this.chain);
    o2.start(t); o2.stop(t + 0.14);
  }

  /** 边击：带通噪声 + 极短的皮面音 */
  _tek(t, g, pitch) {
    const c = this.ctx;
    this._noiseHit(t, g, 1750 * pitch, 1.15, 0.075);

    const o = c.createOscillator(), gn = c.createGain();
    o.type = 'triangle';
    o.frequency.setValueAtTime(390 * pitch, t);
    gn.gain.setValueAtTime(0.0001, t);
    gn.gain.exponentialRampToValueAtTime(g * 0.5, t + 0.002);
    gn.gain.exponentialRampToValueAtTime(0.0001, t + 0.05);
    o.connect(gn).connect(this.chain);
    o.start(t); o.stop(t + 0.07);
  }

  /** 脆击：高频噪声 + 音高上扬的短音。麦西热甫的尖点 */
  _snap(t, g, pitch) {
    const c = this.ctx;
    this._noiseHit(t, g * 0.75, 3100 * pitch, 1.6, 0.045);

    const o = c.createOscillator(), gn = c.createGain();
    o.type = 'sine';
    o.frequency.setValueAtTime(620 * pitch, t);
    o.frequency.exponentialRampToValueAtTime(1180 * pitch, t + 0.035);   // 上扬
    gn.gain.setValueAtTime(0.0001, t);
    gn.gain.exponentialRampToValueAtTime(g * 0.42, t + 0.002);
    gn.gain.exponentialRampToValueAtTime(0.0001, t + 0.05);
    o.connect(gn).connect(this.chain);
    o.start(t); o.stop(t + 0.07);
  }

  /** 闷击：闭音。decay 极短，用来收紧句尾 */
  _mute(t, g, pitch) {
    const c = this.ctx;
    this._noiseHit(t, g * 0.6, 900 * pitch, 2.2, 0.035);

    const o = c.createOscillator(), gn = c.createGain();
    o.type = 'sine';
    o.frequency.setValueAtTime(150 * pitch, t);
    o.frequency.exponentialRampToValueAtTime(88 * pitch, t + 0.03);
    gn.gain.setValueAtTime(0.0001, t);
    gn.gain.exponentialRampToValueAtTime(g * 0.7, t + 0.003);
    gn.gain.exponentialRampToValueAtTime(0.0001, t + 0.06);
    o.connect(gn).connect(this.chain);
    o.start(t); o.stop(t + 0.08);
  }

  /** 指滚：噪声被 52Hz 调制，一口气碾过去 */
  _roll(t, g, pitch) {
    const c = this.ctx;
    const dur = 0.30;

    const s = c.createBufferSource();
    s.buffer = this.noiseBuf;
    s.loop = true;

    const bp = c.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 1400 * pitch;
    bp.Q.value = 0.85;

    const vca = c.createGain();
    vca.gain.value = 0;

    // 调制器：把连续噪声切成"一下一下"，才像手指滚过鼓面
    const lfo = c.createOscillator();
    lfo.type = 'triangle';
    lfo.frequency.value = 52;
    const lfoGain = c.createGain();
    lfoGain.gain.value = 0.5;

    const env = c.createGain();
    env.gain.setValueAtTime(0.0001, t);
    env.gain.exponentialRampToValueAtTime(g, t + 0.02);
    env.gain.setValueAtTime(g, t + dur * 0.72);
    env.gain.exponentialRampToValueAtTime(0.0001, t + dur);

    lfo.connect(lfoGain).connect(vca.gain);
    s.connect(bp).connect(vca).connect(env).connect(this.chain);
    s.start(t); s.stop(t + dur + 0.02);
    lfo.start(t); lfo.stop(t + dur + 0.02);
  }

  _noiseHit(t, g, freq, q, dur) {
    const c = this.ctx;
    const s = c.createBufferSource();
    s.buffer = this.noiseBuf;
    const bp = c.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = freq;
    bp.Q.value = q;
    const gn = c.createGain();
    gn.gain.setValueAtTime(0.0001, t);
    gn.gain.exponentialRampToValueAtTime(g, t + 0.003);
    gn.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(bp).connect(gn).connect(this.chain);
    s.start(t); s.stop(t + dur + 0.02);
  }

  /* -------------------------------------------------------------- 调度 */

  _tick() {
    const pat = PATTERNS[this.band];
    const phrase = pat.phrases[this.phrase];
    const spb = 60 / pat.bpm / phrase.div;
    const total = 12 * phrase.div;

    while (this.nextT < this.ctx.currentTime + this.LOOKAHEAD) {
      const beat = this.step % total;
      let struck = false;

      for (let i = 0; i < phrase.steps.length; i++) {
        const ev = phrase.steps[i];
        if (ev.b !== beat) continue;

        // 人手的不精确：音高 ±1.8%，时间 ±4ms
        const pitch = 1 + (Math.random() - 0.5) * 0.036;
        const when = this.nextT + (Math.random() - 0.5) * 0.004;
        const gain = ev.g * (ev.a ? 1.1 : 1);
        this._hit(ev.s, when, gain, pitch);
        struck = true;
      }

      /* 脉冲轨：主节奏留下过长空档时，补一记极轻的边击。
         这是让"留白"被听成留白、而不是断掉的关键。
         离主音太近（pulseGuard 之内）就跳过，否则会糊成 flam。 */
      if (!struck && pat.pulseEvery > 0 && beat % pat.pulseEvery === 0) {
        const guard = pat.pulseGuard || 1;
        let tooClose = false;
        for (let k = 1; k <= guard; k++) {
          const before = ((beat - k) % total + total) % total;
          const after = (beat + k) % total;
          if (gridHas(before, phrase) || gridHas(after, phrase)) { tooClose = true; break; }
        }
        if (!tooClose) {
          this._hit('tek', this.nextT, pat.pulseGain, 1 + (Math.random() - 0.5) * 0.02);
        }
      }

      this.step++;
      if (this.step >= total) {
        this.step = 0;
        this.phrase = (this.phrase + 1) % pat.phrases.length;
        if (this.onPhrase) this.onPhrase({ band: this.band, phrase: this.phrase });
      }
      this.nextT += spb;
    }
  }

  _hit(kind, t, g, pitch) {
    switch (kind) {
      case 'dum':  this._dum(t, g, pitch); break;
      case 'tek':  this._tek(t, g, pitch); break;
      case 'snap': this._snap(t, g, pitch); break;
      case 'mute': this._mute(t, g, pitch); break;
      case 'roll': this._roll(t, g, pitch); break;
      default: break;
    }
  }
}

__ns = __XM[4];
__ns.mount_DapSequencer = function () { return DapSequencer; };
__ns.mount_PATTERNS = function () { return PATTERNS; };
}

/* ── js/lib/site.js ── */
function __M5__() {
/* ==========================================================================
   弦脉 · 站点外壳
   --------------------------------------------------------------------------
   导航与页脚用同一份数据生成，所有页面（含后续十二个分页面）自动获得完整
   导航 —— 加新页面只要改这里一处，不用去每个 HTML 里改链接。

   另外提供两个章节页反复用到的小件：
     revealOnScroll  滚动进入视口时显形
     imageSlot       图片槽（含缺图兜底与说明位）
   ========================================================================== */

/** 章节结构。id 用于高亮当前页 */
const NAV = [
  { id: 'prologue',  num: '序',    label: '序',         href: 'index.html' },
  { id: 'qon',       num: '二',    label: '穹乃额曼',    href: 'qiongnaieman/index.html', sub: '大曲' },
  { id: 'dastan',    num: '三',    label: '达斯坦',      href: 'dastan/index.html',       sub: '叙事诗' },
  { id: 'mashrap',   num: '四',    label: '麦西热甫',    href: 'mashrap/index.html',      sub: '歌舞曲' },
  { id: 'lishi',     num: '五',    label: '历史与传承',  href: 'lishi/index.html' },
  { id: 'fulu',      num: '附录',  label: '形制比较',    href: 'fulu/index.html' },
];

const $ = (s, r) => (r || document).querySelector(s);

/**
 * 把顶部导航渲染进 .topbar（HTML 里只留一个占位结构）。
 * @param {object} opts
 * @param {string} opts.base  相对站点根的路径前缀，如 '../' 或 ''
 * @param {string} opts.active 当前页的 NAV id
 * @param {boolean} [opts.showSound] 是否显示声音开关
 */
function mountShell(opts) {
  const base = opts.base || '';
  const active = opts.active || '';
  const topbar = $('.topbar');
  if (!topbar) return;

  const links = NAV.map((n) => {
    const cur = n.id === active ? ' aria-current="page"' : '';
    const sub = n.sub ? '<i class="sitelinks__sub">' + n.sub + '</i>' : '';
    return '<li><a href="' + base + n.href + '"' + cur + '>' +
      n.num + ' · ' + n.label + sub + '</a></li>';
  }).join('');

  const sound = opts.showSound === false ? '' :
    '<button class="sound" id="sound-toggle" type="button" aria-pressed="false" aria-label="手鼓节奏音效开关">' +
    '<span class="sound__ring" aria-hidden="true"></span>' +
    '<span class="sound__text" id="sound-text">声音 关</span></button>';

  topbar.innerHTML =
    '<a class="brand" href="' + base + 'index.html" aria-label="弦脉 Stringline Heritage 首页">' +
      '<i class="brand__glyph" aria-hidden="true"></i>' +
      '<span class="brand__name">弦脉</span>' +
      '<span class="brand__latin">Stringline Heritage</span>' +
    '</a>' +
    '<div class="topbar__right">' +
      '<nav aria-label="站点章节"><ul class="sitelinks">' + links + '</ul></nav>' +
      sound +
    '</div>';
}

/**
 * 页面底部的「上一章 / 下一章」。按 NAV 的链条自动生成 ——
 * 以后调整章节顺序或插新页，不用改任何 HTML。
 */
function mountChapterNav(opts) {
  const base = opts.base || '';
  const host = $('.chapter-nav');
  if (!host) return;
  const i = NAV.findIndex((n) => n.id === opts.active);
  if (i < 0) return;

  const prev = NAV[i - 1];
  const next = NAV[i + 1];
  const label = (n) => n.num + ' · ' + n.label;

  host.innerHTML =
    (prev ? '<a href="' + base + prev.href + '">← ' + label(prev) + '</a>' : '<span></span>') +
    (next ? '<a class="next" href="' + base + next.href + '">' + label(next) + ' →</a>' : '<span></span>');
}

/**
 * 滚动进入视口时加 is-in。用于幕的推进、时间轴刻度点亮。
 * @param {string} selector
 * @param {object} [opts]
 * @param {number} [opts.threshold=0.18]
 * @param {boolean} [opts.once=true]
 */
function revealOnScroll(selector, opts = {}) {
  const nodes = Array.from(document.querySelectorAll(selector));
  if (!nodes.length) return;
  const threshold = opts.threshold === undefined ? 0.18 : opts.threshold;
  const once = opts.once !== false;

  if (!('IntersectionObserver' in window)) {
    nodes.forEach((n) => n.classList.add('is-in'));
    return;
  }

  const io = new IntersectionObserver((entries) => {
    entries.forEach((e) => {
      if (e.isIntersecting) {
        e.target.classList.add('is-in');
        if (once) io.unobserve(e.target);
      } else if (!once) {
        e.target.classList.remove('is-in');
      }
    });
  }, { threshold, rootMargin: '0px 0px -8% 0px' });

  nodes.forEach((n) => io.observe(n));
}

/**
 * 图片槽：设置 src 后自动加载，成功则淡入，失败则保持占位样式。
 * HTML 里写成 <figure class="slot" data-src="..." data-label="...">，
 * 这里统一接管，避免每处都写一遍 onerror。
 */
function mountSlots() {
  Array.from(document.querySelectorAll('figure.slot')).forEach((fig) => {
    const src = fig.getAttribute('data-src');
    const img = fig.querySelector('img');
    if (!img) { fig.classList.add('is-empty'); return; }

    if (!src) { fig.classList.add('is-empty'); return; }

    fig.classList.remove('is-empty');
    img.addEventListener('load', () => img.classList.add('is-loaded'), { once: true });
    img.addEventListener('error', () => {
      // 文件还没放进来：退回占位，版面不变形
      fig.classList.add('is-empty');
      img.removeAttribute('src');
    }, { once: true });
    img.src = src;
  });
}

__ns = __XM[5];
__ns.mount_NAV = function () { return NAV; };
__ns.mount_mountShell = function () { return mountShell; };
__ns.mount_mountChapterNav = function () { return mountChapterNav; };
__ns.mount_revealOnScroll = function () { return revealOnScroll; };
__ns.mount_mountSlots = function () { return mountSlots; };
}

/* ── js/lib/chapter.js ── */
function __M6__() {
var Renderer = __XM[3]["Renderer"];
var DapSequencer = __XM[4]["DapSequencer"];
var mountShell = __XM[5]["mountShell"];
var mountChapterNav = __XM[5]["mountChapterNav"];
var revealOnScroll = __XM[5]["revealOnScroll"];
var mountSlots = __XM[5]["mountSlots"];

/* ==========================================================================
   弦脉 · 章节页公共启动
   --------------------------------------------------------------------------
   每个章节页要做的事几乎一样：装导航、铺空气层（地火）、显形、图片槽、
   可选的声音、可见性暂停。抽成一处，页面只提供自己的配置。

   这样加一页的成本 = 一个 HTML + 一次 bootChapter() 调用 + 三行构建配置。
   ========================================================================== */





const REDUCED = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/**
 * @param {object} opts
 * @param {string} opts.base    相对站点根的路径前缀（章节页一律 '../'）
 * @param {string} opts.active  当前页在导航里的 id
 * @param {number} [opts.wallGain=0.9]
 * @param {boolean} [opts.sound=true]  是否挂声音开关（页面上要有 #sound-toggle）
 * @param {number} [opts.soundBand=0]  声音默认放第几段的鼓
 * @param {boolean} [opts.heat=true]   是否启用随滚动上升的地火热度
 */
function bootChapter(opts = {}) {
  mountShell({ base: opts.base || '../', active: opts.active });
  mountChapterNav({ base: opts.base || '../', active: opts.active });
  mountSlots();

  let renderer = null;
  let seq = null;
  let cssW = 0, cssH = 0, dpr = 0;
  let visible = true;
  let lastT = performance.now();
  let frame = 0;
  let heatNow = 0;
  let center = [0.5, 0.5];

  /* ---- 空气层：地火 + 壁面 + 浮尘 ---- */
  const canvas = document.getElementById('air');
  if (canvas) {
    try {
      renderer = new Renderer(canvas, {
        mode: 'chapter',
        wallGain: opts.wallGain === undefined ? 0.9 : opts.wallGain,
        muralGain: 0,
      });
      document.body.dataset.render = 'chapter';
    } catch (err) {
      document.body.dataset.render = 'basic';
      if (window.console) console.warn('[弦脉] 退回基础渲染：', err && err.message);
    }
  }

  const syncSize = () => {
    if (!canvas || !renderer) return;
    const r = canvas.getBoundingClientRect();
    const w = Math.max(1, Math.round(r.width));
    const h = Math.max(1, Math.round(r.height));
    const d = window.devicePixelRatio || 1;
    if (w === cssW && h === cssH && d === dpr) return;
    cssW = w; cssH = h; dpr = d;
    renderer.resize(w, h, d);
  };

  /** 热度：越往下读越热，这是章节页的推进体感 */
  const readHeat = () => {
    if (opts.heat === false) return 0.4;
    const max = Math.max(1, document.documentElement.scrollHeight - window.innerHeight);
    return Math.min(1, Math.max(0, window.scrollY / max));
  };

  /** 热源跟着当前幕走，让地火的亮处随阅读位置移动 */
  const readCenter = () => {
    const acts = Array.from(document.querySelectorAll('[data-act]'));
    if (!acts.length) return [0.5, 0.5];
    const mid = window.innerHeight * 0.55;
    let best = acts[0], bestD = Infinity;
    acts.forEach((a) => {
      const r = a.getBoundingClientRect();
      const d = Math.abs(r.top + r.height * 0.5 - mid);
      if (d < bestD) { bestD = d; best = a; }
    });
    const r = best.getBoundingClientRect();
    const cx = (r.left + r.width * 0.5) / Math.max(1, window.innerWidth);
    const cy = 1 - (r.top + r.height * 0.5) / Math.max(1, window.innerHeight);
    return [Math.min(0.86, Math.max(0.14, cx)), Math.min(0.86, Math.max(0.14, cy))];
  };

  const loop = (now) => {
    requestAnimationFrame(loop);
    frame++;
    const dt = now - lastT;
    lastT = now;

    heatNow += (readHeat() - heatNow) * 0.035;
    center = readCenter();
    if (!renderer || !visible) return;

    syncSize();
    renderer.render({
      time: (now - renderer.started) / 1000,
      velocity: 0,
      frame,
      heat: heatNow,
    });
    renderer.sample(dt);
  };

  /* ---- 声音（可选） ---- */
  if (opts.sound !== false) {
    seq = new DapSequencer({ volume: 0.34 });
    window.__XM_SEQ__ = seq;                 // 自检用

    const btn = document.getElementById('sound-toggle');
    const text = document.getElementById('sound-text');
    if (btn) {
      btn.addEventListener('click', () => {
        const on = btn.getAttribute('aria-pressed') !== 'true';
        if (on) {
          if (!seq.enable()) { if (text) text.textContent = '声音 不可用'; return; }
          seq.setBand(opts.soundBand || 0);
        } else {
          seq.disable();
        }
        btn.setAttribute('aria-pressed', String(on));
        if (text) text.textContent = on ? '声音 开' : '声音 关';
      });
    }
  }

  /* ---- 显形 ---- */
  revealOnScroll('.reveal', { threshold: 0.15 });
  revealOnScroll('.tl-item', { threshold: 0.25 });
  revealOnScroll('.plate', { threshold: 0.12 });

  if ('IntersectionObserver' in window) {
    const main = document.querySelector('main');
    if (main) {
      new IntersectionObserver((es) => {
        es.forEach((e) => { visible = e.isIntersecting; });
      }, { threshold: 0 }).observe(main);
    }
  }

  window.addEventListener('resize', () => { cssW = 0; syncSize(); }, { passive: true });
  document.addEventListener('visibilitychange', () => { lastT = performance.now(); });

  requestAnimationFrame(loop);
  requestAnimationFrame(() => document.body.classList.add('is-ready'));

  return { renderer, seq, REDUCED, syncSize };
}

__ns = __XM[6];
__ns.mount_bootChapter = function () { return bootChapter; };
__ns.mount_REDUCED = function () { return REDUCED; };
}

/* ── js/lib/parallax.js ── */
function __M7__() {
/* ==========================================================================
   弦脉 · 滚动视差场景
   --------------------------------------------------------------------------
   把一张图按深度切成若干层，滚动时每层以不同速度位移，产生纵深。
   层文件由 tools/depth.py + tools/slice.py 生成。

   一个"场景组"可以有好几个场景（比如每三分之一换一个）：
   滚动进度决定当前是哪个场景，场景之间用透明度交叉淡化。

   实现要点：
     · 层全部 position:fixed 铺满视口，图片 object-fit:cover
     · 位移用 transform: translate3d，交给合成器，不触发重排
     · 场景切换只动 opacity，不做 display 切换（否则会闪）
     · 换层位移用 rAF 节流，滚动时不写样式以外的任何东西
   ========================================================================== */

/**
 * @param {object} opts
 * @param {HTMLElement} opts.host       容器（占位，实际层是 fixed 的）
 * @param {Array} opts.scenes           场景数组，每项 { layers:[{file,shift}], base }
 * @param {HTMLElement} opts.anchor     进度参照元素（一般传一个很长的 section）
 * @param {number} [opts.maxShift]      最大位移像素（默认 90）
 * @param {number} [opts.vh]            一个场景占几屏滚动（默认 1.2）
 * @param {boolean} [opts.reduced]      减弱动效
 */
function buildParallax(opts) {
  const { host, scenes, anchor } = opts;
  if (!host || !scenes || !scenes.length) return null;

  const maxShift = opts.maxShift === undefined ? 90 : opts.maxShift;
  const reduced = !!opts.reduced;

  host.classList.add('px');
  host.innerHTML = '';

  const groups = scenes.map((sc, si) => {
    const g = document.createElement('div');
    g.className = 'px__scene';
    g.dataset.scene = String(si);
    // 第一个场景先可见，其余等滚动决定
    g.style.opacity = si === 0 ? '1' : '0';
    const layerEls = [];
    (sc.layers || []).forEach((L) => {
      const img = document.createElement('img');
      img.className = 'px__layer';
      img.src = sc.base + L.file;
      img.alt = '';
      img.decoding = 'async';
      img.loading = si === 0 ? 'eager' : 'lazy';
      // 该层的位移倍数：slice.py 算好的 shift
      img.dataset.shift = String(L.shift === undefined ? 0.5 : L.shift);
      g.appendChild(img);
      layerEls.push(img);
    });
    if (sc.tint) g.style.setProperty('--px-tint', sc.tint);
    host.appendChild(g);
    return { el: g, layerEls };
  });

  let ticking = false;

  const update = () => {
    ticking = false;
    const r = anchor.getBoundingClientRect();
    const vh = window.innerHeight;
    // 0 = 区块顶部刚碰到视口底部；1 = 区块底部离开视口顶部
    const raw = (vh - r.top) / (vh + r.height);
    const p = Math.min(1, Math.max(0, raw));

    // 当前场景：把总进度切成 scenes.length 段
    const n = groups.length;
    const pos = p * n;                 // 连续位置
    const cur = Math.min(n - 1, Math.floor(pos));

    groups.forEach((G, i) => {
      // 交叉淡化：场景在自己的区段里全亮，边缘 12% 内过渡
      const local = pos - i;           // 0..1 表示正在这个场景内
      let a;
      if (local < -0.12 || local > 1.12) a = 0;
      else if (local < 0.12) a = (local + 0.12) / 0.24;
      else if (local > 0.88) a = Math.max(0, (1.12 - local) / 0.24);
      else a = 1;
      G.el.style.opacity = reduced ? (i === cur ? '1' : '0') : a.toFixed(3);
    });

    if (reduced) return;

    // 位移：以当前场景内的局部进度为准，避免切场景时跳一下
    const local = Math.min(1, Math.max(0, pos - cur));
    groups.forEach((G, i) => {
      if (i !== cur && Math.abs(pos - i) > 1) return;   // 完全不在视野里的场景不动
      G.layerEls.forEach((img) => {
        const k = parseFloat(img.dataset.shift) || 0.5;
        // 近层往上走得快，远层慢 —— 加一点横向，避免直线运动太机械
        const dy = -local * maxShift * k;
        const dx = Math.sin(local * Math.PI) * maxShift * k * 0.16;
        img.style.transform = 'translate3d(' + dx.toFixed(2) + 'px,' + dy.toFixed(2) + 'px,0)';
      });
    });

    host.style.setProperty('--px-progress', p.toFixed(4));
  };

  const onScroll = () => {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(update);
  };

  window.addEventListener('scroll', onScroll, { passive: true });
  window.addEventListener('resize', onScroll, { passive: true });
  update();

  return {
    groups,
    update,
    destroy() {
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
    },
  };
}

__ns = __XM[7];
__ns.mount_buildParallax = function () { return buildParallax; };
}

/* ── js/pages/dastan.js ── */
function __M8__() {
var renderPart = __XM[1]["renderPart"];
var bootChapter = __XM[6]["bootChapter"];
var buildParallax = __XM[7]["buildParallax"];

/* 第三章 · 达斯坦 —— 内容在 js/lib/part-data.js，骨架由 js/lib/part.js 生成
   背景换成滚动视差：三个场景，/3 换一次（层由 tools/slice.py 生成） */




renderPart();
const ctx = bootChapter({ active: 'dastan', soundBand: 1 });

const pxHost = document.getElementById('px');
const pxAnchor = document.getElementById('px-anchor');
if (pxHost && pxAnchor) {
  // 场景顺序即滚动顺序；每层的 shift 由切片工具按深度算好
  const SCENES = [
    { base: '../assets/img/dastan/parallax/scene-a/', tint: 'rgba(6, 8, 16, 0.44)' },
    { base: '../assets/img/dastan/parallax/scene-b/', tint: 'rgba(10, 8, 6, 0.36)' },
    { base: '../assets/img/dastan/parallax/scene-c/', tint: 'rgba(9, 7, 8, 0.38)' },
  ].map((sc) => Object.assign(sc, {
    layers: [
      { file: 'layer1.webp', shift: 1.00 },
      { file: 'layer2.webp', shift: 0.62 },
      { file: 'layer3.webp', shift: 0.38 },
      { file: 'layer4.webp', shift: 0.22 },
      { file: 'layer5.webp', shift: 0.12 },
    ],
  }));

  buildParallax({
    host: pxHost,
    anchor: pxAnchor,
    scenes: SCENES,
    maxShift: 96,
    reduced: ctx.REDUCED,
  });
  document.body.classList.add('has-parallax');
}
}

/* js/lib/part-data.js */
try {
  __ns = __XM[0];
  __M0__();
  for (var k in __XM[0]) { if (k.indexOf("mount_") === 0) __XM[0][k.slice(6)] = __XM[0][k](); }
} catch (e) {
  (window.__XM_BOOT_ERR__ = window.__XM_BOOT_ERR__ || []).push("js/lib/part-data.js" + " :: " + (e && e.stack || e));
}

/* js/lib/part.js */
try {
  __ns = __XM[1];
  __M1__();
  for (var k in __XM[1]) { if (k.indexOf("mount_") === 0) __XM[1][k.slice(6)] = __XM[1][k](); }
} catch (e) {
  (window.__XM_BOOT_ERR__ = window.__XM_BOOT_ERR__ || []).push("js/lib/part.js" + " :: " + (e && e.stack || e));
}

/* js/lib/materials.js */
try {
  __ns = __XM[2];
  __M2__();
  for (var k in __XM[2]) { if (k.indexOf("mount_") === 0) __XM[2][k.slice(6)] = __XM[2][k](); }
} catch (e) {
  (window.__XM_BOOT_ERR__ = window.__XM_BOOT_ERR__ || []).push("js/lib/materials.js" + " :: " + (e && e.stack || e));
}

/* js/lib/renderer.js */
try {
  __ns = __XM[3];
  __M3__();
  for (var k in __XM[3]) { if (k.indexOf("mount_") === 0) __XM[3][k.slice(6)] = __XM[3][k](); }
} catch (e) {
  (window.__XM_BOOT_ERR__ = window.__XM_BOOT_ERR__ || []).push("js/lib/renderer.js" + " :: " + (e && e.stack || e));
}

/* js/lib/sequencer.js */
try {
  __ns = __XM[4];
  __M4__();
  for (var k in __XM[4]) { if (k.indexOf("mount_") === 0) __XM[4][k.slice(6)] = __XM[4][k](); }
} catch (e) {
  (window.__XM_BOOT_ERR__ = window.__XM_BOOT_ERR__ || []).push("js/lib/sequencer.js" + " :: " + (e && e.stack || e));
}

/* js/lib/site.js */
try {
  __ns = __XM[5];
  __M5__();
  for (var k in __XM[5]) { if (k.indexOf("mount_") === 0) __XM[5][k.slice(6)] = __XM[5][k](); }
} catch (e) {
  (window.__XM_BOOT_ERR__ = window.__XM_BOOT_ERR__ || []).push("js/lib/site.js" + " :: " + (e && e.stack || e));
}

/* js/lib/chapter.js */
try {
  __ns = __XM[6];
  __M6__();
  for (var k in __XM[6]) { if (k.indexOf("mount_") === 0) __XM[6][k.slice(6)] = __XM[6][k](); }
} catch (e) {
  (window.__XM_BOOT_ERR__ = window.__XM_BOOT_ERR__ || []).push("js/lib/chapter.js" + " :: " + (e && e.stack || e));
}

/* js/lib/parallax.js */
try {
  __ns = __XM[7];
  __M7__();
  for (var k in __XM[7]) { if (k.indexOf("mount_") === 0) __XM[7][k.slice(6)] = __XM[7][k](); }
} catch (e) {
  (window.__XM_BOOT_ERR__ = window.__XM_BOOT_ERR__ || []).push("js/lib/parallax.js" + " :: " + (e && e.stack || e));
}

/* js/pages/dastan.js */
try {
  __ns = __XM[8];
  __M8__();
  for (var k in __XM[8]) { if (k.indexOf("mount_") === 0) __XM[8][k.slice(6)] = __XM[8][k](); }
} catch (e) {
  (window.__XM_BOOT_ERR__ = window.__XM_BOOT_ERR__ || []).push("js/pages/dastan.js" + " :: " + (e && e.stack || e));
}
})();
