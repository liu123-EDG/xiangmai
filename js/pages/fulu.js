/* 附录 · 形制比较 —— 十二套木卡姆轮盘 + 八个民族的旋律入口 */
import { bootChapter } from '../lib/chapter.js';
import { buildWheel, bindWheelScroll } from '../lib/wheel.js';
import { buildMelody, bindMelodyScroll } from '../lib/melody.js';
import { MUQAM } from '../lib/muqam-data.js';
import { HERITAGE } from '../lib/heritage-data.js';

const ctx = bootChapter({ active: 'fulu', soundBand: 0 });
const { REDUCED } = ctx;
const $ = (s) => document.querySelector(s);

/* ---- 十二套木卡姆 ---- */
const wHost = $('#wheel-host');
const wReadout = $('#wheel-readout');
if (wHost) {
  const wheel = buildWheel(wHost, {
    hrefBase: '../muqam/',
    onPick: (id) => {
      // 分页面还没做：给反馈而不是跳 404。建好后删掉这段即可正常跳转。
      const m = MUQAM.find((x) => x.id === id);
      if (m && wReadout) {
        wReadout.innerHTML = '<b>' + m.name + ' · ' + m.ug + '</b>' +
          m.region + '　<em>' + m.char + '</em><br>' + m.note +
          '<br><span style="color:var(--bone-faint)">这一套的分页面还在制作中。</span>';
      }
    },
    onHover: (m) => {
      if (!wReadout) return;
      wReadout.innerHTML = '<b>' + m.name + ' · ' + m.ug + '</b>' +
        m.region + '　<em>' + m.char + '</em><br>' + m.note;
    },
  });
  bindWheelScroll($('#wheel-act'), wheel, REDUCED);
}

/* ---- 八个民族的旋律入口 ---- */
const mHost = $('#melody-host');
const mReadout = $('#melody-readout');
if (mHost) {
  // 字段缺了就跳过，不显示空行 —— note 留空待补时不至于出现空白
  const line = (m) => '<b>' + m.name + (m.ug ? ' · ' + m.ug : '') + '</b>' +
    (m.group || '') + (m.kind ? '　<em>' + m.kind + '</em>' : '') +
    (m.note ? '<br>' + m.note : '');

  const melody = buildMelody(mHost, {
    onPick: (id) => {
      const m = HERITAGE.find((x) => x.id === id);
      if (m && mReadout) {
        mReadout.innerHTML = line(m) +
          '<br><span style="color:var(--bone-faint)">这一个分页面还在制作中。</span>';
      }
    },
    onHover: (m) => { if (mReadout) mReadout.innerHTML = line(m); },
  });
  bindMelodyScroll($('#melody-act'), melody, REDUCED);
}
