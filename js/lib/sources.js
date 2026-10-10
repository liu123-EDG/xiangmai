/* 弦脉 · 提交版参考来源
   附录汇总公开资料，保留来源链接、项目组材料口径及概念影像说明。
   各民族详情页另列条目对应的来源。 */

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

/* ---- 编制方法 ----
   写清楚"我们怎么做的"，比写"我们做了什么"更有用。 */
const METHOD = [
  ['来源优先级', '官方名录与政府发布 > 权威媒体 > 其他。凡是能用名录直接核对的（项目名、传承人名、认定年份），一律以名录为准，不用转述。'],
  ['链接核实', '本页所有外链在交付前逐个访问确认可用。政府网站改版频繁，链接失效时请以站名与标题重新检索。'],
  ['资料口径', '第二、三、四章的结构与听感介绍依据项目组提供的文字材料整理。各民族档案另列对应资料来源，地区与版本差异见各页说明。'],
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

  const method = METHOD.map(([k, v]) => (
    '<div class="src__m"><dt>' + esc(k) + '</dt><dd>' + rich(v) + '</dd></div>'
  )).join('');

  host.innerHTML =
    '<p class="src__lead">' +
      /* 注意：模板里塞进去的文字都要过 rich() ——
         不然 **强调** 会原样显示成星号（踩过，截图里看得见）。 */
      rich('本节汇总站内引用的公开资料。各民族档案页另列对应条目的资料来源。') +
    '</p>' +

    '<div class="src__stat">' +
      '<span><b>' + count + '</b> 条已核实来源</span>' +
    '</div>' +

    groups +

    '<section class="src__group">' +
      '<h3 class="src__gtitle">编制说明</h3>' +
      '<dl class="src__method">' + method + '</dl>' +
    '</section>';

  return { count, pending: 0, groups: SOURCES.length };
}
