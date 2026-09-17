/* 第五章 · 历史与传承 —— 来源、经典化、抢救、当代运用
   主题曲也在这里响：这一页讲的是同一段音乐的来路。 */
import { bootChapter } from '../lib/chapter.js';
import { createTheme, autoPlayOnGesture } from '../lib/theme.js';

const ctx = bootChapter({ active: 'lishi', soundBand: 0 });

const theme = createTheme('../assets/audio/mashrap/theme.mp3');
theme.preload();

/* 第一次交互就把声音打开：手鼓垫底 + 主题曲。
   能走到这一页说明门已经开了，不该再让用户找开关。 */
autoPlayOnGesture({ theme, seq: ctx.seq, band: 0, fade: 3.0 });

// 自检用
window.__XM_THEME__ = theme;
