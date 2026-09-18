/* 附录 · 形制比较 —— 十二套木卡姆轮盘 + 八个民族的旋律入口 */
import { bootChapter } from '../lib/chapter.js';
import { buildWheel, bindWheelScroll } from '../lib/wheel.js';
import { buildMelody, bindMelodyScroll } from '../lib/melody.js';
import { MUQAM } from '../lib/muqam-data.js';
import { HERITAGE } from '../lib/heritage-data.js';
import { unlock, createTheme, autoPlayOnGesture } from '../lib/theme.js';
import { buildInheritGame } from '../lib/inherit-game.js';

/* 这一页不放鼓：它是一次"横向看"的比较，主题曲一个人铺底就够。
   所以 sound:false —— 免得鼓点和主题曲抢。 */
const ctx = bootChapter({ active: 'fulu', sound: false });
const { REDUCED } = ctx;
const $ = (s) => document.querySelector(s);

const theme = createTheme('../assets/audio/mashrap/theme.mp3');
theme.preload();
autoPlayOnGesture({ theme, seq: null, fade: 3.2 });

// 自检用
window.__XM_THEME__ = theme;

/* ------------------------------------------------------------------ 门
   其他民族的页面要先把麦西热甫那场圆圈玩完才开。
   没解锁时点任一入口，就把人送回第四章的互动，并说明原因。

   这是引导，不是安全机制 —— 目的是让人按设计的顺序走一遍。 */
const GATE = {
  href: '../mashrap/index.html#mq-act',
  msg: '先把第四章那场麦西热甫跳完（把圈子点满），这里才开。',
};

/** 给未解锁的元素加统一的"锁着"视觉 */
function applyLock(root) {
  if (!root) return;
  root.classList.add('is-locked');
  root.setAttribute('aria-disabled', 'true');
}

function gate(onBlocked) {
  if (unlock.done) return;
  // 进入页面时就把视觉改掉
  document.querySelectorAll('.wnode, .mnote').forEach(applyLock);
  // 点任何一个都被拦下
  document.addEventListener('click', (e) => {
    const a = e.target.closest && e.target.closest('.wnode, .mnote');
    if (!a) return;
    e.preventDefault();
    e.stopPropagation();
    if (onBlocked) onBlocked();
  }, true);
}

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

/* ---- 上锁与解锁提示 ----
   未解锁：给所有入口加"锁着"的视觉，点任何一处都把人送回第四章的互动。
   已解锁：不动，正常走。 */
const gateNote = document.getElementById('gate-note');
if (!unlock.done) {
  gate(() => {
    if (gateNote) {
      gateNote.innerHTML = '<b>还没开门</b>' + GATE.msg +
        '<br><a href="' + GATE.href + '">去第四章 · 麦西热甫 →</a>';
      gateNote.classList.add('is-on');
      gateNote.scrollIntoView({ behavior: REDUCED ? 'auto' : 'smooth', block: 'center' });
    } else {
      location.href = GATE.href;
    }
  });
  // 提示条里的链接要能点（gate 是捕获阶段拦的，得让它放行）
  if (gateNote) {
    gateNote.addEventListener('click', (e) => {
      if (e.target.tagName === 'A') e.stopPropagation();
    }, true);
  }
} else if (gateNote) {
  gateNote.remove();
}

/* ---- 传承之路（角色扮演） ----
   放在附录最后一屏：你是一名非遗传承人，两处地方各做一次选择。
   跟"上锁"无关 —— 它是这一页的正片结尾，不是入口，所以不参与 gate。

   素材是 8 段视频（戈壁/草原 × 环境/活着/失传/案例），
   桌面 960×540、手机 640×360，共 8.3 / 4.6 MB。
   素材若缺，游戏会退化成 CSS 底色，机制照常能走完。 */
const inherit = buildInheritGame({ reduced: REDUCED });
// 自检用
window.__XM_GAME__ = inherit;

