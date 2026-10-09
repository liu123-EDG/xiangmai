/* 附录 · 形制比较 —— 十二套木卡姆轮盘 + 八个民族的旋律入口 */
import { bootChapter } from '../lib/chapter.js';
import { buildWheel, bindWheelScroll } from '../lib/wheel.js';
import { buildMelody, bindMelodyScroll } from '../lib/melody.js';
import { MUQAM } from '../lib/muqam-data.js';
import { HERITAGE, heritageHref } from '../lib/heritage-data.js';
import { unlock, createTheme, autoPlayOnGesture } from '../lib/theme.js';
import { buildSources } from '../lib/sources.js';
import { createMelodyVoice } from '../lib/melody-voice.js';

/* 这一页不放鼓：它是一次"横向看"的比较，主题曲一个人铺底就够。
   所以 sound:false —— 免得鼓点和主题曲抢。 */
const ctx = bootChapter({ active: 'fulu', sound: false });
const { REDUCED } = ctx;
const $ = (s) => document.querySelector(s);

/* 八个音的声音。
   和主题曲**各用各的 context**：主题曲是循环配乐，
   这里的音是"滚一下响一声"的一次性音，混在一条链路上互相压。
   代价是页面上有两个 AudioContext（站里其他页都只有一个）——
   这两个都是短促、低音量的，不会互相静音（浏览器限制的是
   "同一页面多个 context 同时长时间播放"）。 */
const voice = createMelodyVoice({ volume: 0.15 });
window.__XM_VOICE__ = voice;   // 自检用

const theme = createTheme('../assets/audio/mashrap/theme.mp3');
theme.preload();
/* 首次交互把旋律的声音也一起唤醒 ——
   滚轮不算手势，不在这时候 arm 的话，后面滚过去是没声的。 */
autoPlayOnGesture({ theme, seq: null, fade: 3.2 });
window.addEventListener('pointerdown', () => voice.arm(), { once: true });
window.addEventListener('keydown', () => voice.arm(), { once: true });

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
/* 音符点进去去哪。
   原来只有藏族能走（它有"传承之路"那关），其余七族被 preventDefault 拦住、
   只显示一句"关卡在制作中" —— 而八族分页现在已经建出来了
   （heritage/<id>/index.html，见 tools/gen-heritage.mjs）。

   所以现在的规则是：
     · 有关卡的那一族 → 直接进关卡（藏族 · 格萨尔），关卡比读页面更值得先看
     · 其余 → 进那一族的档案页
   两条都会跳走，不再有"点了没反应"的情况。 */
const LEVEL_BY_HERITAGE = {
  'tibetan-gesar': 'gesar',
};

const mHost = $('#melody-host');
const mReadout = $('#melody-readout');
if (mHost) {
  // 字段缺了就跳过，不显示空行 —— note 留空待补时不至于出现空白
  const line = (m) => '<b>' + m.name + (m.ug ? ' · ' + m.ug : '') + '</b>' +
    (m.group || '') + (m.kind ? '　<em>' + m.kind + '</em>' : '') +
    (m.note ? '<br>' + m.note : '') +
    (m.collected === false
      ? '<br><span style="color:var(--bone-faint)">这一族的资料尚未收录，页面会说明缺什么</span>'
      : '');

  const melody = buildMelody(mHost, {
    onPick: (id) => {
      const level = LEVEL_BY_HERITAGE[id];
      if (level) { location.href = '../game/index.html?level=' + level; return; }
      const m = HERITAGE.find((x) => x.id === id);
      if (m) { location.href = heritageHref(id); return; }
      if (mReadout) mReadout.innerHTML = '找不到这一条。';
    },
    onHover: (m) => { if (mReadout) mReadout.innerHTML = line(m); },
  });
  /* **自检用的数组要在 bind 之前建。**
     bindMelodyScroll 里面会立刻调一次 update() —— 那次就可能触发 onNote，
     而数组在后面才建，回调里的守卫会把这一笔丢掉（而且后面全丢）。
     踩过：数组永远是空的，看着像"回调没被调用"。 */
  window.__XM_NOTES__ = [];

  bindMelodyScroll($('#melody-act'), melody, REDUCED, {
    /* **滚过去就响。**
       原来这张图只看得见：悬停出说明、点击进分页、游标在走但一声不响。
       说是"一条旋律，八个音"，其实没有旋律。
       现在游标越过哪个音就响哪个 —— 滚一遍等于听一遍。

       音高直接用 HERITAGE 的 pitch 算（见 melody-voice.js），
       所以**图上画在哪儿，听起来就是那个高度** —— 图和声是同一份数据，
       不会出现"看着高、听着低"。 */
    onNote: (item) => {
      /* 记一笔"回调来过了" —— 自检靠它区分两件事：
         "回调没被调用" 和 "调用了但没出声"。
         这两种情况的修法完全不同。 */
      if (window.__XM_NOTES__) window.__XM_NOTES__.push(item ? item.id : '?');
      if (!item) return;
      voice.play(item.pitch, { tone: 0.3 });
    },
  });
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

