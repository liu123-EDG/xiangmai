/* 第二章 · 穹乃额曼 —— 内容在 js/lib/part-data.js，骨架由 js/lib/part.js 生成 */
import { renderPart } from '../lib/part.js';
import { bootChapter } from '../lib/chapter.js';

renderPart();                                   // 先铺内容
bootChapter({ active: 'qon', soundBand: 0 });   // 再启动（mountSlots 要能看到生成的槽位）
