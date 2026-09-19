/* 附录 · 形制比较 —— 十二套木卡姆轮盘 + 八个民族的旋律入口 */
import { bootChapter } from '../lib/chapter.js';
import { buildWheel, bindWheelScroll } from '../lib/wheel.js';
import { buildMelody, bindMelodyScroll } from '../lib/melody.js';
import { MUQAM } from '../lib/muqam-data.js';
import { HERITAGE } from '../lib/heritage-data.js';
import { unlock, createTheme, autoPlayOnGesture } from '../lib/theme.js';
import { buildSources } from '../lib/sources.js';

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

/* ---- 八个民族的旋律入口 ----
   点音符的两种去处：
     · 已经做了关卡的 → 进 game/ 玩那一关（选对给"活着"、选错给"失传"）
     · 还没做的       → 不出关卡，明说"还在制作中"，不假装有内容

   维吾尔族不在八音之列（那八个是壮/蒙/侗/满/苗/彝/傣/藏），
   它的十二木卡姆是这一站的正题，所以关卡挂在藏族那个音符上：
   点藏族进的是格萨尔，点附录里的木卡姆入口进的是另一关。

   实际上：藏族音符 → ?level=gesar。木卡姆那一关从第五章/附录的
   木卡姆入口进（见下面 wheel 那段）。 */
const LEVEL_BY_HERITAGE = {
  'tibetan-gesar': 'gesar',
};
/* 还没做关卡的，点进去给一句实话，别跳 404 */
const PENDING_NOTE = '这一个民族的关卡还在制作中。' +
  '已经能玩的是藏族（格萨尔）那一关。';

const mHost = $('#melody-host');
const mReadout = $('#melody-readout');
if (mHost) {
  // 字段缺了就跳过，不显示空行 —— note 留空待补时不至于出现空白
  const line = (m) => '<b>' + m.name + (m.ug ? ' · ' + m.ug : '') + '</b>' +
    (m.group || '') + (m.kind ? '　<em>' + m.kind + '</em>' : '') +
    (m.note ? '<br>' + m.note : '');

  const melody = buildMelody(mHost, {
    onPick: (id) => {
      const level = LEVEL_BY_HERITAGE[id];
      if (level) { location.href = '../game/index.html?level=' + level; return; }
      const m = HERITAGE.find((x) => x.id === id);
      if (m && mReadout) {
        mReadout.innerHTML = line(m) +
          '<br><span style="color:var(--bone-faint)">' + PENDING_NOTE + '</span>';
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

/* ---- 参考来源 ----
   放在这一页最后。分"已核实"与"尚未核实"两块。
   所有外链都经 tools/check-sources.mjs 逐条访问确认过 ——
   政府网站改版频繁，死链比不写来源更糟。
   外链页面**不属于 gate 管**，所以不参与上锁。 */
const sources = buildSources();
window.__XM_SOURCES__ = sources;

