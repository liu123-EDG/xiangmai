/* ==========================================================================
   弦脉 · 民族分页的渲染
   --------------------------------------------------------------------------
   八个入口（壮 / 蒙古 / 侗 / 满 / 苗 / 彝 / 傣 / 藏）共用这一份渲染逻辑，
   页面 HTML 完全一样，只靠 <body data-ethnic="..."> 区分。

   为什么八个页面不各写一份：
     · 八份 HTML 就有八个地方要改，早晚改漏一个（这个项目已经栽过一次：
       导航里一处漏改，底部链接直接打不开）
     · 内容都在 heritage-data.js 里，页面只负责"长什么样"

   **八个风格的落法**：用每族自己的色相 --eh 驱动整页的强调色 ——
   标题下划线、字段标签、正文里的小标记、页脚线条，全部跟着走。
   壮族偏金、傣族偏孔雀青、苗族偏朱、蒙古族偏草绿……同一套骨架，八种气质。

   两条纪律（同「参考来源」那一节）：
     ① 正文只写 heritage-data.js 里有的，这里不做任何补充。
     ② 未收录的那两族**明说未收录**，并且不用相近内容凑数。
   ========================================================================== */

const $ = (s, r) => (r || document).querySelector(s);

function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"]/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}

/** 把正文里的「」引号加一点强调，并把 **粗体** 转成 <b>。
    只动样式，不动文字。
    **粗体这条是补的**：原来只处理「」，于是 caveat 里写的 `**应避免…**`
    原样显示成了星号（彝族那页踩过，和 sources.js 是同一个坑）。 */
function rich(s) {
  return esc(s)
    .replace(/「([^」]+)」/g, '<em class="h-q">「$1」</em>')
    .replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>');
}

/**
 * @param {object} opts
 * @param {object} opts.item  heritage-data.js 里的一条
 * @param {HTMLElement} opts.host
 */
export function buildHeritagePage(opts) {
  const item = opts.item;
  const host = opts.host;
  if (!item || !host) return null;

  /* 每族的色相驱动整页强调色。
     hsl 用空格分隔写法（--h 那套约定，见 styles/chapter.css）。 */
  const root = document.documentElement;
  root.style.setProperty('--eh', String(item.hue));
  document.body.dataset.ethnic = item.id;
  document.body.dataset.collected = item.collected ? '1' : '0';

  const fields = [
    ['等级', item.level],
    ['流传', item.region],
    ['形态', item.form],
    ['乐器', item.instrument],
  ].filter(([, v]) => v);

  const bodyHtml = (item.body || []).map((p) => '<p class="h-p">' + rich(p) + '</p>').join('');

  /* 资料里明确指出的口径问题。
     单独一块、放在正文之前 —— 读者按错的口径去理解，
     比读到空字段更糟（苗族古歌"不是一般意义上的歌曲"就是这种）。 */
  const caveatHtml = item.caveat
    ? '<aside class="h-caveat">' +
        '<span class="h-caveat__tag">读之前先知道</span>' +
        '<p class="h-caveat__b">' + rich(item.caveat) + '</p>' +
      '</aside>'
    : '';

  /* 来源列表。带链接的做成外链（新标签、noopener），
     没链接的（比如"作者提供的某 docx"）就只是文字。 */
  const sources = item.sources || (item.source ? [[item.source, '']] : []);
  const sourcesHtml = sources.length
    ? '<ul class="h-srcs">' + sources.map(([name, url]) =>
        '<li>' + (url
          ? '<a href="' + esc(url) + '" target="_blank" rel="noopener noreferrer">' +
              esc(name) + '<span class="h-out" aria-hidden="true">↗</span></a>'
          : '<span>' + esc(name) + '</span>') +
        '</li>').join('') + '</ul>'
    : '<p class="h-src">（这一条尚未标注来源）</p>';

  const relatedHtml = (item.related && item.related.length)
    ? '<section class="h-block">' +
        '<h3 class="h-sub">同族还有这些（不在这一条里）</h3>' +
        '<ul class="h-related">' +
          item.related.map((r) => '<li>' + esc(r) + '</li>').join('') +
        '</ul>' +
        '<p class="h-fine">列在这里只是为了说明「这一族不止这一项」，它们各自另有条目。</p>' +
      '</section>'
    : '';

  /* 未收录的族（现在八族都收录了，这段留着 —— 以后加新族时还用得上）：
     明说，并给出原因。不摆"敬请期待"那种空话 ——
     它和"我们还没查到"是两回事。 */
  const noticeHtml = item.collected ? '' :
    '<aside class="h-notice">' +
      '<p class="h-notice__t">这一页尚未收录</p>' +
      '<p class="h-notice__b">' + rich(sources.map(([n]) => n).join('；') || '暂无资料') + '</p>' +
      '<p class="h-notice__b">下面这些是站内已有的、能追溯到来源的内容；' +
      '剩余部分等查到可靠出处再补。' +
      '<b>不用相近内容凑数</b>——一个敢说自己缺什么的档案，比什么都敢写的可信。</p>' +
    '</aside>';

  host.innerHTML =
    '<header class="h-hero">' +
      '<p class="h-kicker">' + esc(item.group) + ' · ' + esc(item.kind) + '</p>' +
      '<h1 class="h-title">' + esc(item.name) + '</h1>' +
      '<p class="h-ug">' + esc(item.ug) + '</p>' +
      '<p class="h-lead">' + rich(item.note) + '</p>' +
      (item.collected
        ? '<p class="h-badge h-badge--on">已收录 · ' + sources.length + ' 项来源</p>'
        : '<p class="h-badge h-badge--off">未收录 · 见下方说明</p>') +
    '</header>' +

    noticeHtml +
    caveatHtml +

    '<section class="h-block">' +
      '<div class="h-grid">' +
        fields.map(([k, v]) =>
          '<div class="h-field">' +
            '<span class="h-field__k">' + esc(k) + '</span>' +
            '<span class="h-field__v">' + esc(v) + '</span>' +
          '</div>').join('') +
      '</div>' +
    '</section>' +

    '<section class="h-block h-block--body">' +
      '<h2 class="h-h2">它是什么</h2>' +
      bodyHtml +
    '</section>' +

    '<section class="h-block">' +
      '<h2 class="h-h2">来源</h2>' +
      sourcesHtml +
      '<p class="h-fine">本页文字取自上述材料，未作补充。' +
      '站内「参考来源」一节列了已核实与尚未核实的内容。</p>' +
    '</section>' +

    relatedHtml +

    '<nav class="h-back"><a href="../fulu/index.html#melody-act">← 回到旋律图</a></nav>';

  // 自检用
  window.__XM_HERITAGE__ = {
    id: item.id, collected: item.collected,
    state: () => ({
      id: item.id, hue: item.hue,
      bodyParas: (item.body || []).length,
      notice: !item.collected,
      fields: fields.length,
      related: (item.related || []).length,
      sources: sources.length,
      linkedSources: sources.filter(([, u]) => u).length,
      caveat: !!item.caveat,
    }),
  };

  return window.__XM_HERITAGE__;
}
