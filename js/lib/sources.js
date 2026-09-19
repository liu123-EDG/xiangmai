/* ==========================================================================
   弦脉 · 参考来源
   --------------------------------------------------------------------------
   放在附录最后。

   为什么要单独做一节，而不是页脚列几行：
     · 竞赛作品要交代来源（学术规范）
     · 更要紧的是：**把"我们没查到"也写出来**
       一个敢承认自己缺什么的档案，比一个什么都敢写的档案可信。
       这一节里"尚未核实"那张表不是缺陷，是这一节的重点。

   两条纪律：
     ① **来源只写核实过的。** 每一条都在 tools/check-sources.mjs 里
        跑过一遍，确认链接活着。政府网站改版频繁，死链比不写更糟。
     ② **没来源的内容单列出来。** 不混在"已引用"里充数。
   ========================================================================== */

/* ---- 已核实的来源 ----
   url 全部经 tools/check-sources.mjs 验证为 200。 */
const SOURCES = [
  {
    group: '木卡姆 · 名录与沿革',
    items: [
      {
        t: 'UNESCO 人类非物质文化遗产代表作名录 · 新疆维吾尔木卡姆艺术',
        note: '2005 年宣布为"人类口头和非物质遗产代表作"，名录编号 00109。',
        url: 'https://ich.unesco.org/en/RL/uyghur-muqam-of-xinjiang-00109',
        org: '联合国教科文组织',
      },
      {
        t: '中国新疆维吾尔木卡姆艺术和蒙古族长调民歌列入代表作颁证仪式',
        note: '2005 年 11 月，文化部发布的颁证仪式报道。',
        url: 'https://www.mct.gov.cn/whzx/tpxw/200511/t20051128_828249.htm',
        org: '中华人民共和国文化和旅游部',
      },
      {
        t: '木卡姆的二十年',
        note: '列入名录之后的保护与传承情况回顾。',
        url: 'https://www.ihchina.cn/news_1_details/31487.html',
        org: '中国非物质文化遗产网 · 中国非物质文化遗产数字博物馆',
      },
      {
        t: '国家级非物质文化遗产代表性项目及传承人检索',
        note: '查证某一项目、某一位传承人是否列入国家级名录的**权威入口**。用真名核对，比转述可靠。',
        url: 'https://www.ihchina.cn/',
        org: '中国非物质文化遗产网',
      },
    ],
  },
  {
    group: '传承人 · 桑珠（藏族 · 格萨尔）',
    items: [
      {
        t: '桑珠：说唱一生《格萨尔王传》',
        note: '说唱艺人生平与传承经历的报道。',
        url: 'https://www.xzxw.com/fy/2015-05/14/content_1551027.html',
        org: '西藏新闻网',
      },
      {
        t: '西藏八十六岁老人说唱《格萨尔王传》两千多小时',
        note: '与"能唱 60 多部"这一量级相互印证。',
        url: 'http://www.chinanews.com.cn/gn/news/2009/06-17/1738148.shtml',
        org: '中国新闻网',
      },
      {
        t: '西藏有 52 名国家级非物质文化遗产代表性传承人',
        note: '2009 年公布名单时的报道，可用于核对传承人认定的年份。',
        url: 'http://tibet.cctv.com/20090616/102134.shtml',
        org: '中央电视台 · 西藏频道',
      },
    ],
  },
  {
    group: '传承人 · 玉苏普·托合提（维吾尔族 · 十二木卡姆）',
    items: [
      {
        t: '在"十二木卡姆故乡"莎车 聆听"世纪之音"',
        note: '莎车县木卡姆传承与演出的采访报道。',
        url: 'https://city.cri.cn/2024-08-30/7aa6eed2-ef4a-dc63-91ad-707ee05cd8fc.html',
        org: '国际在线（中央广播电视总台）',
      },
    ],
  },
];

/* ---- 尚未核实的部分 ----
   这一张表是这一节的重点：把"我们知道自己缺什么"摆出来。
   每一条都对应页面上的具体内容，不是泛泛而谈。 */
const PENDING = [
  {
    what: '十二木卡姆的段落构成、乐器、调式与唱词',
    where: '第二 / 三 / 四章正文',
    state: '依据项目组提供的文字材料整理，尚未取得可公开引用的原始出处。',
  },
  {
    what: '八个民族的音乐形态说明',
    where: '附录 · 一条旋律，八个音',
    state: '仍在查证。八个条目中已核实者将补注来源，未核实者保持留空。',
  },
  {
    what: '万桐书与吐尔迪·阿洪的录音记谱经过',
    where: '第五章 · 历史与传承',
    state: '待补权威出处（中国艺术研究院音乐研究所相关档案为宜）。',
  },
  {
    what: '当代传承的四类案例细节',
    where: '第五章 · 当代运用',
    state: '待逐条补注来源。',
  },
  {
    what: '两处关卡视频中的场景与人物',
    where: '传承之路 · 雪原 / 戈壁',
    state: '**视频为 AIGC 生成的概念影像，不是实拍记录。** 场景与人物均为虚构，不代表任何真实地点或真实人物。',
  },
  {
    what: '概念片中的敦煌壁画段',
    where: '入口页 / 序章',
    state: '**同样为 AIGC 生成的概念影像**，用于呈现"从壁画到黑场"的视觉意象，不是文物影像。',
  },
];

/* ---- 编制方法 ----
   写清楚"我们怎么做的"，比写"我们做了什么"更有用。 */
const METHOD = [
  ['来源优先级', '官方名录与政府发布 > 权威媒体 > 其他。凡是能用名录直接核对的（项目名、传承人名、认定年份），一律以名录为准，不用转述。'],
  ['链接核实', '本页所有外链在交付前逐个访问确认可用。政府网站改版频繁，链接失效时请以站名与标题重新检索。'],
  ['留空原则', '查不到可靠出处的条目**留空并注明**，不用推测填充。宁可少写一条，不写无法追溯的一条。'],
  ['影像说明', '站内概念片与关卡视频为 AIGC 生成的概念影像，用于表达意象；站内不包含任何声称是实拍的记录影像。'],
];

const $ = (s, r) => (r || document).querySelector(s);

function esc(s) {
  return String(s).replace(/[&<>"]/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}

/** 把 **强调** 转成 <b>，其余转义 —— 内容里我写了几处星号强调 */
function rich(s) {
  return esc(s).replace(/\*\*(.+?)\*\*/g, '<b>$1</b>');
}

export function buildSources(opts = {}) {
  const host = $('#sources-host');
  if (!host) return null;

  const count = SOURCES.reduce((a, g) => a + g.items.length, 0);

  const groups = SOURCES.map((g) => {
    const items = g.items.map((it) => (
      '<li class="src__item">' +
        '<a class="src__t" href="' + esc(it.url) + '" target="_blank" rel="noopener noreferrer">' +
          esc(it.t) +
          '<span class="src__out" aria-hidden="true">↗</span>' +
        '</a>' +
        (it.note ? '<p class="src__note">' + rich(it.note) + '</p>' : '') +
        '<p class="src__org">' + esc(it.org) + '</p>' +
        '<p class="src__url">' + esc(it.url) + '</p>' +
      '</li>'
    )).join('');
    return '<section class="src__group">' +
      '<h3 class="src__gtitle">' + esc(g.group) + '</h3>' +
      '<ol class="src__list">' + items + '</ol>' +
    '</section>';
  }).join('');

  const pending = PENDING.map((p) => (
    '<tr>' +
      '<th scope="row">' + rich(p.what) + '</th>' +
      '<td class="src__where">' + esc(p.where) + '</td>' +
      '<td>' + rich(p.state) + '</td>' +
    '</tr>'
  )).join('');

  const method = METHOD.map(([k, v]) => (
    '<div class="src__m"><dt>' + esc(k) + '</dt><dd>' + rich(v) + '</dd></div>'
  )).join('');

  host.innerHTML =
    '<p class="src__lead">' +
      /* 注意：模板里塞进去的文字都要过 rich() ——
         不然 **强调** 会原样显示成星号（踩过，截图里看得见）。 */
      rich('这一站的内容分两类：**能追溯到来源的**，和**还追溯不到的**。' +
           '两类都列在下面。' +
           '把后者写出来不是自曝其短 —— 一个敢说自己缺什么的档案，' +
           '比一个什么都敢写的档案可信。') +
    '</p>' +

    '<div class="src__stat">' +
      '<span><b>' + count + '</b> 条已核实来源</span>' +
      '<span><b>' + PENDING.length + '</b> 条尚未核实</span>' +
    '</div>' +

    groups +

    '<section class="src__group src__group--pending">' +
      '<h3 class="src__gtitle">尚未核实 · 这些内容还没有可靠出处</h3>' +
      '<p class="src__pendlead">' +
        rich('下表逐条对应站内具体内容。其中**影像两条最要紧**：' +
             '站内的概念片与关卡视频是 AIGC 生成的概念影像，' +
             '不是实拍记录，这一点必须说清楚，不能让人误以为是现场记录。') +
      '</p>' +
      '<div class="src__tablewrap">' +
        '<table class="src__table">' +
          '<caption class="sr-only">尚未核实的内容清单</caption>' +
          '<thead><tr><th scope="col">内容</th><th scope="col">位置</th><th scope="col">状态</th></tr></thead>' +
          '<tbody>' + pending + '</tbody>' +
        '</table>' +
      '</div>' +
    '</section>' +

    '<section class="src__group">' +
      '<h3 class="src__gtitle">编制说明</h3>' +
      '<dl class="src__method">' + method + '</dl>' +
    '</section>';

  return { count, pending: PENDING.length, groups: SOURCES.length };
}
