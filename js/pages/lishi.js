/* 第五章 · 历史与传承 —— 来源、经典化、抢救、当代运用
   --------------------------------------------------------------------------
   这一页**只有背景音乐，没有手鼓**。
   用户明确说过："第五章不该有那个鼓点的，第五章没有背景音乐才对的，还是有"
   —— 意思是这里该是纯配乐。

   原来写的是 bootChapter({ soundBand: 0 })，没传 drums:false，
   于是 bootChapter 建了手鼓音序器，autoPlayOnGesture 又把它打开，
   结果配乐里混着鼓点。

   现在 drums:false：不建音序器，声音按钮交给 autoPlayOnGesture 接主题曲。
   （第三章也是同一处境，那边已经这么改了。） */
import { bootChapter } from '../lib/chapter.js';
import { createTheme, autoPlayOnGesture } from '../lib/theme.js';

const ctx = bootChapter({ active: 'lishi', drums: false });

const theme = createTheme('../assets/audio/mashrap/theme.mp3');
theme.preload();

/* 第一次交互就把配乐打开。能走到这一页说明门已经开了，
   不该再让用户找开关。seq 传 null：这一页没有鼓。 */
autoPlayOnGesture({ theme, seq: null, fade: 3.0 });

// 自检用
window.__XM_THEME__ = theme;
