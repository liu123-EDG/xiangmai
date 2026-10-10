/* ==========================================================================
   第四章 · 麦西热甫
   --------------------------------------------------------------------------
   背景不用图片，用程序化生成的维吾尔几何纹样（八瓣星网格 + 交错菱形带 +
   卷草），随互动实时变化：圈里的人越多，纹样越密越亮。

   互动：点一下往圈里加一个人。人越多，鼓点密一层，纹样亮一分。
   ========================================================================== */
import { renderPart } from '../lib/part.js';
import { bootChapter } from '../lib/chapter.js';
import { buildCircle } from '../lib/circle.js';
import { createTheme, autoPlayOnGesture, unlock } from '../lib/theme.js';
import { buildFullCircleFilm } from '../lib/fullfilm.js';
import { buildRhythmLab } from '../lib/rhythm-lab.js';

renderPart();
const heroInner=document.querySelector('.chapter-hero__inner');
if(heroInner)heroInner.insertAdjacentHTML('beforeend','<nav class="mesh-entry reveal" aria-label="本章体验入口"><a href="#mq-act">进入舞圈 <span>让人物与鼓点一起动起来 ↗</span></a><a href="#rlab-act">试奏节奏 <span>自己敲，听见从疏到密 ↗</span></a></nav>');
const ensembleSection=document.querySelectorAll('#part-body > .act')[1];
if(ensembleSection){
const items=[
{name:'手鼓 · 达普',role:'立起节奏',text:'手鼓给出清晰的节奏骨架。接着到节奏台，试着敲出自己的鼓点。',shape:'<ellipse cx="80" cy="73" rx="43" ry="48"/><ellipse cx="80" cy="73" rx="35" ry="40"/><path d="M49 113L42 137M111 113L118 137"/>'},
{name:'萨帕依',role:'填入铁环声',text:'带铁环的打击乐器在摇动中发声。它与手鼓形成不同的声音层次；在节奏台里观察记号怎样填入空隙。',shape:'<path d="M71 145L71 47Q80 31 89 47L89 145M71 116L89 116"/><circle cx="60" cy="57" r="20"/><circle cx="100" cy="57" r="20"/><circle cx="60" cy="78" r="17"/><circle cx="100" cy="78" r="17"/>'},
{name:'舞者',role:'把节奏变成动作',text:'人一个一个加入，舞圈逐渐成形。到下方舞圈体验自由加入，也可以打开“跟着鼓点跳”，感受落在拍上的时刻。',shape:'<circle cx="80" cy="43" r="12"/><path d="M67 32L93 32L89 23L71 23ZM70 60Q80 53 90 60L98 100L114 132L46 132L62 100ZM70 68L46 81L32 61M90 68L111 51L127 64M65 133L59 149M95 133L101 149"/>'}
];
const box=document.createElement('div');box.className='mesh-ensemble';
box.innerHTML='<p>选一个角色，看它怎样参与这场聚会</p><div class="mesh-ensemble__choices">'+items.map((x,i)=>'<button type="button" aria-pressed="'+(i===0)+'" data-role="'+i+'"><svg viewBox="0 0 160 170" aria-hidden="true">'+x.shape+'</svg><b>'+x.name+'</b><span>'+x.role+'</span></button>').join('')+'</div><p class="mesh-ensemble__detail" aria-live="polite">'+items[0].text+'</p><small>乐器与人物为示意图案，非实拍或舞蹈动作教学。</small>';
ensembleSection.querySelector('.act__inner').appendChild(box);
box.addEventListener('click',event=>{const button=event.target.closest('button[data-role]');if(!button)return;box.querySelectorAll('button').forEach(b=>b.setAttribute('aria-pressed',String(b===button)));box.querySelector('.mesh-ensemble__detail').textContent=items[Number(button.dataset.role)].text;});
}

const ctx = bootChapter({ active: 'mashrap', soundBand: 2, mode: 'pattern' });

const host = document.getElementById('mq-host');
const readout = document.getElementById('mq-readout');

/* 节奏台 —— 指导老师要的"随着鼓点动"就是这一块：记号跟着鼓声亮。
   它自带一套调度（自己的 AudioContext + 音频时钟驱动的动画），
   **不复用页面的手鼓音序器**：那个只有 onPhrase 回调，没有"每一拍"，
   靠定时器对嘴一定会飘。宁可多一个 context，也不要对不上嘴。 */
const lab = buildRhythmLab(document.getElementById('rlab-host'), {
  reduced: ctx.REDUCED,
});
window.__XM_LAB__ = lab;   // 自检用

/* 满圈之后那支片子。
   在这里建（而不是等满圈时才建）：元素提前进 DOM，满圈时只是加个类，
   不会有"第一次点开时卡一下"的空档。
   base 传 '..' —— 这一页在 mashrap/ 下，视频在 assets/ 下。
   reduced 时它自己会跳过，直接回调 onDone。

   **主题曲让位**：片子有声音（作者拍的现场声），它响的时候主题曲压下去，
   放完（或跳过）抬回来。
   音量常量写在这里而不是散在回调里 —— 以后想调只改这两个数。 */
const THEME_NORMAL = 0.55;     // 满圈之后主题曲的正常音量
const THEME_DUCKED = 0.10;     // 片子说话时压到这里（不是 0：留一点底，衔接不生硬）

const film = buildFullCircleFilm({
  base: '..',
  reduced: ctx.REDUCED,
  onStart: () => theme.setVolume(THEME_DUCKED),
  onDone: () => {
    /* 放完（或跳过）之后回到页面。两件事：
       ① 主题曲抬回来 —— 一进收场就抬，不等幕布淡完（淡出要 1.8 秒，
          等它淡完再抬，中间会有近两秒的静默空档）
       ② 解锁在满圈那一刻就完成了，幕布一撤，用户看到的就是打开的页面 */
    theme.setVolume(THEME_NORMAL);
    const hint = document.getElementById('mq-hint');
    if (hint) hint.classList.add('is-done');
  },
});
window.__XM_FILM__ = film;   // 自检用

/* 主题曲。点满圆圈就开始放 —— 那一下是用户手势，浏览器允许出声；
   解码是异步的，所以提前预载，免得到时候有半秒空白。

   **复用同一个 AudioContext**：页面上有两个独立 context 时，
   浏览器会让其中一个不响（静音的真实原因，定位了很久）。 */
const theme = createTheme('../assets/audio/mashrap/theme.mp3');
theme.preload();

/* ------------------------------------------------------------------ 自动开声
   这一章没有声音等于白做 —— 鼓点、萨帕依、主题曲都是内容的一部分，
   不该让人先去找开关。第一次交互就自动打开手鼓。

   主题曲**不在这里起**：它要等圈子点满才响（见下面的 onFull）。
   但这一次手势必须把 theme 接上同一个 AudioContext ——
   否则等点满时它的 context 还是 suspended，就"点了也没声"。 */
autoPlayOnGesture({
  theme,                  // 传进去只为了复用 context 与唤醒，不会立刻出声
  seq: ctx.seq,
  band: 2,
  startTheme: false,      // 关键：这一页的主题曲由 onFull 触发
});

if (host) {
  /** 人数 → 一句说明。让"加人"这件事有叙事，不只是数字变大。 */
  const stage = (n, max) => {
    const r = n / max;
    if (n === 0) return ['还没人下场', '麦西热甫是从第一个下场的人开始的。点一下圆圈。'];
    if (r < 0.2) return ['起头', '一个人先站进去。鼓点还稀，节奏还慢，等的是别人跟上。'];
    if (r < 0.45) return ['有人跟上', '两三个人就能把节拍立起来。手鼓开始有呼应了。'];
    if (r < 0.7) return ['成圈', '人一多，节奏型就密了。这时候跳错也没人管——本来就是大家一起热闹。'];
    if (r < 1) return ['热起来', '圈快满了。鼓点、纹样、转圈的速度都在往上走。'];
    return ['满圈 · 门开了',
      '这是麦西热甫该有的样子：不是谁在表演，是一圈人自己把场子烧起来。' +
      '<br><span style="color:var(--amber)">主题曲响起，其他民族的页面也解开了。</span>'];
  };

/* 满圈之后那一下「断」。
   ——为什么要有这个——
   这一页最后一句是「人散了，鼓还在耳朵里」。文字说得出，
   但**身体感觉不到**。所以满圈的 flourish 砸下去之后，
   让**页面本身**跟着断一下：整屏急速压暗、纹样抽掉，
   0.7 秒后再回来。

   这和节奏台第三段是同构的 —— 那边是"最密的那一拍直接切断"，
   这边是"整场一起停"。同一件事，一个用耳朵、一个用眼睛。
   ——注意别过头——
   只压暗、不变黑、不挡住入口：断完要能立刻继续用。
   减弱动效时整段跳过。 */
function pageCut() {
  if (ctx.REDUCED) return false;
  const b = document.body;
  b.classList.add('is-cut');
  setTimeout(() => b.classList.remove('is-cut'), 700);
  return true;
}

const circle = buildCircle({
  host,
  reduced: ctx.REDUCED,
  /* 「跟着鼓点跳」模式要用它判断"现在离最近的拍有多远"。
     这个数只有音频时钟知道，页面自己算不出来（见 sequencer.phase 的注释）。 */
  beatPhase: () => (ctx.seq ? ctx.seq.phase() : null),
  /* 踩上 / 踩偏各给一声：用声音告诉人，不弹框打分。
     踩上用 snap（脆），踩偏用 mute（闷）。 */
  onHit: (kind) => {
    if (!ctx.seq) return;
    if (kind === 'on') ctx.seq.hit('snap');
    else ctx.seq.hit('mute');
  },
  // 满圈：砸一声，把"人散了鼓还在耳朵里"那个结尾感做出来
  onFull: () => {
      if (ctx.seq) {
        if (ctx.seq.ctx) theme.useContext(ctx.seq.ctx);
        ctx.seq.flourish();
      }
      if (ctx.renderer) {
        ctx.renderer.patternZoom = 1.75;      // 纹样整体推近一下
      }
      /* 断一下 —— 紧跟着那记重击，让整页和音频一起停 */
      pageCut();
      // 主题曲淡入；同时解锁其他民族的页面
      theme.start(2.6);
      unlock.set();
      // 圈满了，操作提示就该退场
      const hint = document.getElementById('mq-hint');
      if (hint) hint.classList.add('is-done');

      /* 满圈之后放一遍那支片子，放完自己渐渐消失。
         用户要的就是这个：点完那个圆，加个窗口，播一遍，然后自己淡掉。
         解锁**已经在上一步做完了** —— 片子是仪式，不是门槛：
         万一片子放不出来（没有 MediaCodec、被策略拦），
         用户照样进得去，不会卡在这里。 */
      if (film) film.play();
    },
    onChange: (n, max) => {
      const r = n / max;
      const hint=document.getElementById('mq-hint');
      if(hint)hint.classList.toggle('is-done',n>=max);
      // 驱动背景纹样：人越多越亮、越推近
      if (ctx.renderer) {
        ctx.renderer.heat = r;
        ctx.renderer.patternZoom = 1 + r * 0.55;
      }
      // 驱动声音：人越多，节奏型越密
      if (ctx.seq) {
        ctx.seq.setBand(r < 0.35 ? 0 : r < 0.75 ? 1 : 2);
      }
      /* 提示**一直留着**，直到圈满。
         一开始我写成"点一下就收掉"，但那正好毁掉它的用处 ——
         用户点了一下、提示消失，就以为完事了，不会接着点。
         它要说的就是"别停"，那就得陪着到终点。 */
      if (readout) {
        const [title, text] = stage(n, max);
        readout.innerHTML = '<b>' + title + '</b>' + text +
          (n >= max ? '<br><span style="color:var(--bone-faint)">再点一下重新开始。</span>' : '');
      }
    },
  });

  // 自检用
  window.__XM_CIRCLE__ = circle;
  window.__XM_RENDERER__ = ctx.renderer;
  window.__XM_THEME__ = theme;
}
