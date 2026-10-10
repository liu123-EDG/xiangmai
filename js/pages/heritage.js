/* ==========================================================================
   弦脉 · 民族分页的入口（八个页面共用）
   --------------------------------------------------------------------------
   页面 HTML 完全一样，靠 <body data-ethnic="壮族的 id"> 区分是哪一族。

   为什么共用一份：
     八份 HTML 就有八个地方要改，早晚改漏一个 ——
     这个项目已经栽过一次（导航里一处漏改，底部链接直接打不开）。
     内容都在 heritage-data.js，页面只负责"长什么样"。

   声音：这一页**只有配乐，没有手鼓**。
   和第三章、第五章同理 —— 有自己配乐的页面必须 drums:false，
   否则声音按钮会接在鼓上，按"开"听到的是序章那套鼓点（踩过）。
   ========================================================================== */
import { bootChapter } from '../lib/chapter.js';
import { createTheme, autoPlayOnGesture } from '../lib/theme.js';
import { heritageById, HERITAGE } from '../lib/heritage-data.js';
import { buildHeritagePage } from '../lib/heritage-page.js';

/* 哪一族：从 body 上读。读不到就退回第一族 —— 不留白屏。 */
const id = document.body.dataset.ethnic || HERITAGE[0].id;
const item = heritageById(id);

const ctx = bootChapter({
  base: '../../',           // heritage/<id>/ 比普通章节深一层，导航需回到站点根目录
  active: 'fulu',            // 顶栏高亮挂在附录那一格（这八页是附录伸出来的）
  drums: false,
  /* 这几页正文不长，地火再压一档 —— 和第五章同一个理由：
     文字压在火上读着累。 */
  emberGain: 0.3,
});

if (item) {
  document.title = item.group + ' · ' + item.name + '｜八音 · 弦脉';
  buildHeritagePage({ item, host: document.getElementById('ethnic') });
} else {
  const host = document.getElementById('ethnic');
  if (host) {
    host.innerHTML = '<p class="h-notice__t">没有这一族</p>' +
      '<p class="h-notice__b">地址里的民族标识不认识。' +
      '<a href="../../fulu/index.html#melody-act">回到旋律图</a>挑一个吧。</p>';
  }
}

/* 配乐：复用附录那首主题曲（站内只有三首 mp3，不复用就得再加文件）。
   **路径是两层 ../**：这一页在 heritage/<id>/ 下，比别的章节还深一层。
   写成一层会 404 —— 而且 createTheme 的 catch 会把它吞成一句 warning，
   页面看着正常、就是没声（这个坑在第五章踩过一次，八页自检又抓了一次）。 */
const theme = createTheme('../../assets/audio/mashrap/theme.mp3');
theme.setVolume(0.26);       // 比第五章更轻 —— 这一页是读文字，不是看场面
theme.preload();
autoPlayOnGesture({ theme, seq: null, fade: 2.4 });

// 自检用
window.__XM_THEME__ = theme;
window.__XM_CTX__ = ctx;
