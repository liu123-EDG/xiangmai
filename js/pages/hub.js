/* ==========================================================================
   弦脉 · 八音总页面
   --------------------------------------------------------------------------
   八族档案原来是八个散页，没有一个地方能把它们一次看全。
   这一页就是那个地方：八张卡，每张一族。

   卡片上的颜色用的是**那一族档案页的同一个 --eh** ——
   所以从总页点进去，颜色是接得上的；从附录的旋律图点进来，也接得上。
   三处同一个色源，改一处不会只有一处变。

   声部（配乐）与档案页一致：只有主题曲，没有手鼓。
   ========================================================================== */
import { bootChapter } from '../lib/chapter.js';
import { createTheme, autoPlayOnGesture } from '../lib/theme.js';
import { HERITAGE } from '../lib/heritage-data.js';

const $ = (s) => document.querySelector(s);

const ctx = bootChapter({
  active: 'bain',
  drums: false,
  emberGain: 0.32,          // 和档案页同一档 —— 这一节是读文字，背景不该抢
});

/* ---------------------------------------------------------------- 统计 */

const stats = $('#hub-stats');
if (stats) {
  const sources = HERITAGE.reduce((n, h) => n + (h.sources || []).length, 0);
  const links = HERITAGE.reduce((n, h) =>
    n + (h.sources || []).filter(([, u]) => u).length, 0);
  const paras = HERITAGE.reduce((n, h) => n + (h.body || []).length, 0);
  stats.innerHTML =
    '<li><b>' + HERITAGE.length + '<i>族</i></b><span>各一页档案</span></li>' +
    '<li><b>' + sources + '<i>条</i></b><span>标注的来源</span></li>' +
    '<li><b>' + links + '<i>条</i></b><span>可点的官方链接</span></li>' +
    '<li><b>' + paras + '<i>段</i></b><span>正文</span></li>';
}

/* ---------------------------------------------------------------- 八张卡 */

function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"]/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}

const grid = $('#hub-grid');
if (grid) {
  /* 按音高排（和附录旋律图一致的顺序），高→低。
     卡片把这个音高数写在角上。

     为什么非要写出来：CSS 网格是**横向填充**的，三列一折，
     排出来的读序是"往下折"的蛇形，不是一条从高到低的直线。
     光靠位置读者看不出这是音阶顺序 —— 把音高数摊在卡面上，
     顺序就是可核对的事实，不靠"我希望它是这样读的"。 */
  const list = HERITAGE.slice().sort((a, b) => b.pitch - a.pitch);

  grid.innerHTML = list.map((h) => {
    const nSrc = (h.sources || []).length;
    const nLink = (h.sources || []).filter(([, u]) => u).length;
    /* 链接是**同级目录**，不是 heritageHref()。
       档案页在 heritage/<id>/，总页面在 heritage/ 本身 ——
       直接拼 '<id>/index.html' 就行。
       （原来用 heritageHref() 去掉 '../' 得到 'heritage/<id>/index.html'，
       从 heritage/ 出发就成了 heritage/heritage/<id>/ —— 多一层，404。） */
    return '' +
      '<a class="hub-card" href="' + esc(h.id) + '/index.html"' +
        ' style="--eh:' + h.hue + '"' +
        ' aria-label="' + esc(h.group + ' ' + h.name + '，音高第 ' + h.pitch + ' 位') + '，进入档案页">' +
        '<span class="hub-card__bar" aria-hidden="true"></span>' +
        /* 左上角的音高数 + 右边的小谱线，让"这是旋律上的第几个音"看得见 */
        '<span class="hub-card__pitch" aria-hidden="true">' +
          '<b>' + h.pitch + '</b>' +
          '<i>' + '—'.repeat(Math.max(1, Math.round(h.pitch / 3))) + '</i>' +
        '</span>' +
        '<span class="hub-card__group">' + esc(h.group) + '</span>' +
        '<span class="hub-card__name">' + esc(h.name) + '</span>' +
        '<span class="hub-card__ug">' + esc(h.ug) + '</span>' +
        '<span class="hub-card__kind">' + esc(h.kind) + '</span>' +
        '<span class="hub-card__note">' + esc(h.note) + '</span>' +
        '<span class="hub-card__foot">' +
          '<span class="hub-card__meta">' +
            (h.level ? esc(h.level.split('（')[0].split('；')[0]) : '') +
          '</span>' +
          '<span class="hub-card__src">' + nSrc + ' 来源' +
            (nLink ? ' · ' + nLink + ' 链接' : '') + '</span>' +
        '</span>' +
        (h.caveat ? '<span class="hub-card__flag">读之前先知道</span>' : '') +
      '</a>';
  }).join('');
}

/* ---------------------------------------------------------------- 配乐 */

const theme = createTheme('../assets/audio/mashrap/theme.mp3');
theme.setVolume(0.24);
theme.preload();
autoPlayOnGesture({ theme, seq: null, fade: 2.4 });

// 自检用
window.__XM_HUB__ = {
  state: () => ({
    cards: document.querySelectorAll('.hub-card').length,
    hues: [...document.querySelectorAll('.hub-card')]
      .map((c) => c.style.getPropertyValue('--eh').trim()),
    hrefs: [...document.querySelectorAll('.hub-card')]
      .map((c) => c.getAttribute('href')),
    stats: document.querySelectorAll('#hub-stats li').length,
  }),
};
window.__XM_THEME__ = theme;
