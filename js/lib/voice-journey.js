/* Scroll-driven, reversible illustrations. All descriptions derive from heritage-data.js.
   The diagrams explain forms; they are not recordings, measured waveforms or maps. */
import { HERITAGE } from './heritage-data.js';
const STORIES = {
 'zhuang-tianqin': { word:'弦与铃', title:'一把天琴，把歌舞连起来', steps:[['弹','天琴与弹唱相伴。'],['唱','唱腔婉转，弹、唱、舞融为一体。'],['舞','脚系铜铃，声音走进祈福与节庆。']], mode:'lute' },
 'mongol-morinhuur': { word:'弓与弦', title:'琴头是马，弦声辽阔', steps:[['琴头','马头琴以琴头雕刻的马头得名。'],['弓弦','弓弦相遇，声音低沉浑厚，也辽阔悠扬。'],['生活','它贯穿草原的节庆、祭祀与日常生活。']], mode:'bow' },
 'dong-dage': { word:'众与独', title:'众低独高，声音层层相遇', steps:[['众低','低声部形成厚实的背景。'],['独高','高声部领唱或凸显，形成多声部关系。'],['歌班','歌师教歌、歌班唱歌，传递村寨的知识与记忆。']], mode:'choir' },
 'manchu-xinchengxi': { word:'戏与舞', title:'从八角鼓，走进一方舞台', steps:[['根基','新城戏以八角鼓为基础。'],['融合','融合萨满音乐、满族民歌与舞蹈。'],['舞台','满族历史与民间故事成为舞台上的剧目。']], mode:'stage' },
 'miao-guge': { word:'歌与忆', title:'古歌中，留下集体的记忆', steps:[['创世','古歌涉及创世神话等叙事内容。'],['迁徙','战争、迁徙、劳动与风俗也是古歌的主题。'],['传述','通过口头演述与抄本传播；地区与版本各有差异。']], mode:'memory' },
 'yi-shan-ge': { word:'问与答', title:'一句问，一句答，山间相逢', steps:[['问','盘县彝族山歌的歌词有问答形式。'],['答','独唱、对唱、群体对唱等形式各有特点。'],['相传','通过口传心授延续；不同地方的形态不能混为一谈。']], mode:'dialogue' },
 'dai-zhangha': { word:'声与述', title:'故事，跟着章哈的声音流动', steps:[['故事','创世神话、爱情故事、历史传说进入章哈说唱。'],['说唱','歌手通过口头传承演唱，傣玎相伴。'],['节庆','泼水节、赕佛和村寨节庆是演唱场合。']], mode:'river' },
 'tibetan-gesar': { word:'史与诗', title:'一部史诗，生长出许多版本', steps:[['英雄','格萨尔王的英雄故事构成史诗叙事。'],['版本','不同地区、师承与场合的讲述有所不同。'],['传承','说唱、吟诵、抄本、绘画与藏戏等形态共同传承。']], mode:'epic' }
};
const esc = s => String(s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const clamp = n => Math.max(0,Math.min(1,n));
const path = (d, layer=0, extra='') => '<path class="vs-line vs-layer" data-layer="'+layer+'" pathLength="1" d="'+d+'" '+extra+'/>';
const label = (x,y,s,layer=0) => '<text class="vs-layer vs-label" data-layer="'+layer+'" x="'+x+'" y="'+y+'">'+s+'</text>';
const person = (x,y,layer=0) => '<g class="vs-layer vs-person" data-layer="'+layer+'" transform="translate('+x+' '+y+')"><circle cy="-18" r="9"/><path d="M-18 28 Q-20 -5 0 -5 Q20 -5 18 28 Z"/></g>';
function illustration(item) {
 const mode=STORIES[item.id].mode;
 let art='';
 if(mode==='lute') art=path('M227 100 L218 290 M244 100 L254 290 M227 100 Q236 91 244 100 M218 280 C159 276 140 340 174 374 C203 405 271 405 297 373 C327 335 306 276 254 280 Z',0)+path('M232 120 L229 357 M239 120 L240 357 M203 350 L267 350',1)+path('M80 245 Q115 180 166 202 M85 283 Q116 229 157 239 M345 234 Q391 217 409 274',1)+'<g class="vs-layer" data-layer="2"><circle cx="91" cy="337" r="18"/><circle cx="381" cy="337" r="18"/>'+label(91,342,'铃',2)+label(381,342,'铃',2)+'</g>'+label(237,439,'弹 · 唱 · 舞',2);
 if(mode==='bow') art=path('M233 119 L225 284 L183 287 L164 389 L305 389 L284 285 L245 284 L249 124 M233 121 L220 100 L225 71 L258 62 L281 89 L269 103 L248 94 L249 125',0)+path('M231 140 L223 370 M242 140 L247 370 M195 357 L274 357',1)+path('M95 280 Q239 220 388 278 M94 290 Q242 230 390 288',1)+path('M45 427 Q105 390 158 426 Q228 472 305 419 Q369 386 439 420',2)+label(237,458,'草原 · 日常 · 节庆',2);
 if(mode==='choir') {
  art=[100,168,236,304,372].map(x=>person(x,340,0)).join('')+path('M70 283 Q150 235 236 283 T403 283 M70 267 Q150 219 236 267 T403 267',0)+person(236,155,1)+path('M96 216 Q160 145 236 216 T381 216',1)+path('M100 378 Q236 452 372 378 M236 185 L236 307',2)+label(237,455,'歌师 → 歌班 → 村寨',2)+label(238,109,'独高',1)+label(239,318,'众低',0);
 }
 if(mode==='stage') art=path('M211 185 L261 185 L296 220 L296 270 L261 305 L211 305 L176 270 L176 220 Z M202 207 L270 207 L279 270 L237 288 L195 270 Z',0)+path('M69 384 L69 101 L405 101 L405 384 M69 103 Q127 150 69 281 M405 103 Q347 150 405 281 M69 385 L405 385',1)+person(237,340,2)+path('M110 419 L364 419',2)+label(237,454,'八角鼓 · 民歌 · 舞蹈',2);
 if(mode==='memory'||mode==='epic') {
  const names=mode==='memory'?['创世','迁徙','风俗','劳动','口述','抄本']:['英雄','地区','师承','说唱','绘画','藏戏'];
  art='<g class="vs-layer" data-layer="0"><circle cx="237" cy="242" r="43"/>'+label(237,248,mode==='memory'?'古歌':'史诗')+'</g>';
  names.forEach((n,i)=>{const a=i*Math.PI/3-Math.PI/2,x=237+Math.cos(a)*147,y=242+Math.sin(a)*147,l=Math.floor(i/2);art+=path('M237 242 Q'+(x+25)+' '+(y+35)+' '+x+' '+y,l)+'<g class="vs-layer" data-layer="'+l+'"><circle cx="'+x+'" cy="'+y+'" r="29"/>'+label(x,y+6,n,l)+'</g>';});
  art+=label(237,453,mode==='memory'?'地区与版本，各有来处':'同一史诗，多种讲述',2);
 }
 if(mode==='dialogue') art=person(99,226,0)+path('M128 172 Q199 115 276 172 M257 155 L276 172 L252 179',0)+label(207,126,'问',0)+person(374,310,1)+path('M347 279 Q260 332 171 279 M191 269 L171 279 L193 294',1)+label(264,347,'答',1)+path('M45 406 L108 357 L170 401 L236 362 L300 409 L368 365 L436 409',2)+label(237,452,'对唱 · 口传心授',2);
 if(mode==='river') art=path('M68 161 C420 100 56 336 390 316 M65 178 C392 123 78 354 393 335',0)+[label(119,111,'神话',0),label(241,237,'爱情',1),label(364,381,'传说',2)].join('')+path('M243 218 L243 331 M261 218 L261 331 M243 331 Q204 347 224 373 Q241 392 277 373 Q300 343 261 331 M251 228 L251 368',1)+path('M72 423 Q134 391 184 423 T295 423 T411 423',2)+label(237,461,'口头说唱 · 节庆相伴',2);
 return '<svg class="vs-art" viewBox="0 0 474 500" role="img" aria-label="'+esc(item.name+'形态示意')+'"><circle class="vs-orbit" cx="237" cy="243" r="200"/><circle class="vs-orbit" cx="237" cy="243" r="170"/>'+art+'</svg>';
}
function landscape() {
 return '<svg class="vs-land" viewBox="0 0 1440 800" preserveAspectRatio="xMidYMid slice" aria-hidden="true"><circle class="vs-moon" cx="1050" cy="170" r="83"/><path class="vs-ridge vs-ridge--far" d="M0 440 L130 340 L229 407 L389 250 L515 396 L686 290 L826 449 L1028 319 L1164 412 L1340 280 L1440 380 V800 H0Z"/><path class="vs-ridge vs-ridge--mid" d="M0 602 Q170 422 351 555 T680 520 T1040 578 T1440 495 V800 H0Z"/><path class="vs-ridge vs-ridge--near" d="M0 704 Q196 588 410 676 T864 693 T1440 648 V800 H0Z"/></svg>';
}
function scene(item, index) {
 const s=STORIES[item.id];
 return '<article class="vs-scene" data-voice="'+item.id+'" style="--voice-hue:'+item.hue+'" aria-hidden="true"><div class="vs-copy"><p class="vs-eyebrow">'+String(index+1).padStart(2,'0')+' / 08 · '+esc(item.group)+'</p><p class="vs-word">'+s.word+'</p><h2>'+s.title+'</h2><p class="vs-subtitle">'+esc(item.name)+' / '+esc(item.kind)+'</p><div class="vs-captions">'+s.steps.map(([k,t],i)=>'<p class="vs-caption" data-layer="'+i+'"><b>'+k+'</b>'+t+'</p>').join('')+'</div><a class="vs-link" href="'+item.id+'/index.html">走进'+esc(item.group)+'档案 <span>↗</span></a></div><div class="vs-drawing">'+illustration(item)+'<p class="vs-footnote">形态示意 · 非实测声波</p></div></article>';
}
export function mountVoiceJourney(host) {
 if(!host) return;
 const list=HERITAGE;
 host.className='voice-journey';
 host.innerHTML='<div class="vs-sticky">'+landscape()+'<div class="vs-heading"><span>八音长卷</span><span>向下滚动，让声音展开 ↓</span></div><div class="vs-scenes">'+list.map(scene).join('')+'</div><nav class="vs-rail" aria-label="选择八音长卷中的民族">'+list.map((h,i)=>'<button type="button" data-stop="'+i+'" aria-label="转到'+esc(h.group)+'" style="--voice-hue:'+h.hue+'"><span>'+String(i+1).padStart(2,'0')+'</span>'+esc(h.group)+'</button>').join('')+'</nav><div class="vs-track"><span></span></div></div>';
 const scenes=[...host.querySelectorAll('.vs-scene')], buttons=[...host.querySelectorAll('[data-stop]')];
 const reduced=matchMedia('(prefers-reduced-motion: reduce)');
 let active=-1, progress=0, queued=false;
 function paint() {
  queued=false;
  if(reduced.matches) {scenes.forEach(n=>{n.classList.add('is-current');n.setAttribute('aria-hidden','false');n.inert=false;n.style.setProperty('--draw',1);n.querySelectorAll('[data-layer]').forEach(el=>el.style.setProperty('--layer',1));});return;}
  const distance=Math.max(1,host.offsetHeight-innerHeight+80);
  progress=clamp((80-host.getBoundingClientRect().top)/distance);
  const scaled=progress*8,index=Math.min(7,Math.floor(scaled)), local=clamp(scaled-index);
  host.style.setProperty('--journey',progress.toFixed(4));
  host.querySelector('.vs-track span').style.transform='scaleX('+progress+')';
  if(active!==index) {
   active=index;
   scenes.forEach((el,i)=>{el.classList.toggle('is-current',i===index);el.setAttribute('aria-hidden',i===index?'false':'true');el.inert=i!==index;});
   buttons.forEach((el,i)=>{el.setAttribute('aria-current',i===index?'step':'false');});
  }
  const current=scenes[index];
  current.style.setProperty('--draw',clamp(local*2.8+.15));
  current.querySelectorAll('[data-layer]').forEach(el=>el.style.setProperty('--layer',clamp((local-Number(el.dataset.layer)*.19)*3.9+.12)));
 }
 function schedule(){if(!queued){queued=true;requestAnimationFrame(paint);}}
 buttons.forEach((el,i)=>el.addEventListener('click',()=>{
  if(reduced.matches) {scenes[i].scrollIntoView({block:'start',behavior:'instant'});return;}
  const distance=Math.max(1,host.offsetHeight-innerHeight+80);
  const y=scrollY+host.getBoundingClientRect().top-80+distance*(i+.55)/8;
  window.scrollTo({top:y,behavior:'smooth'});
 }));
 addEventListener('scroll',schedule,{passive:true});addEventListener('resize',schedule);reduced.addEventListener('change',()=>{active=-1;schedule();});paint();
 window.__XM_VOICE_JOURNEY__={state:()=>({active,progress,id:list[Math.max(0,active)].id,scenes:scenes.length,reduced:reduced.matches})};
}
export function heritageExperienceMarkup(item) {
 const s=STORIES[item.id];if(!s)return '';
 return '<section class="hx-experience" id="voice-experience" style="--voice-hue:'+item.hue+'"><header class="hx-heading"><p class="vs-eyebrow">看见声音 / '+s.word+'</p><h2>'+s.title+'</h2><p>往下读，看图形逐层展开；也可以选择下方的讲解。</p></header><div class="hx-layout"><div class="hx-visual">'+illustration(item)+'<nav class="hx-controls" aria-label="选择'+esc(item.name)+'的演示层">'+s.steps.map(([k],i)=>'<button type="button" data-part="'+i+'" aria-pressed="false">'+k+'</button>').join('')+'</nav><p class="hx-feedback" aria-live="polite"></p><small>形态示意，不代表实际音高或声波</small></div><div class="hx-steps">'+s.steps.map(([k,t],i)=>'<section class="hx-step" data-step="'+i+'"><span>0'+(i+1)+'</span><h3>'+k+'</h3><p>'+t+'</p></section>').join('')+'</div></div></section>';
}
export function mountHeritageExperience(item,host) {
 const section=host.querySelector('.hx-experience');if(!section)return;
 const visual=section.querySelector('.hx-visual'), steps=[...section.querySelectorAll('.hx-step')],buttons=[...section.querySelectorAll('[data-part]')];
 const reduced=matchMedia('(prefers-reduced-motion: reduce)');let active=-1,queued=false,manualY=null;
 function select(index,amount=1) {
  active=index;section.dataset.activePart=index;
  visual.querySelectorAll('[data-layer]').forEach(el=>{const l=Number(el.dataset.layer);el.style.setProperty('--layer',reduced.matches?1:l<index?1:l===index?amount:0);});
  buttons.forEach((el,i)=>el.setAttribute('aria-pressed',i===index?'true':'false'));
  steps.forEach((el,i)=>el.classList.toggle('is-active',i===index));
  const feedback=section.querySelector('.hx-feedback'),text=STORIES[item.id].steps[index][1];
  if(feedback.textContent!==text)feedback.textContent=text;
 }
 function paint(){queued=false;if(manualY!==null&&Math.abs(scrollY-manualY)<12)return;manualY=null;
  let index=0;const midpoint=innerHeight*.64;steps.forEach((el,i)=>{if(el.getBoundingClientRect().top<midpoint)index=i;});
  const r=steps[index].getBoundingClientRect(),amount=clamp((midpoint-r.top)/Math.max(1,r.height*.55));select(index,Math.max(.45,amount));
 }
 function schedule(){if(!queued){queued=true;requestAnimationFrame(paint);}}
 buttons.forEach((el,i)=>el.addEventListener('click',()=>{manualY=scrollY;select(i); }));
 addEventListener('scroll',schedule,{passive:true});addEventListener('resize',()=>{manualY=null;schedule();});reduced.addEventListener('change',()=>{manualY=null;schedule();});paint();
 window.__XM_HERITAGE_EXPERIENCE__={state:()=>({id:item.id,active,layers:visual.querySelectorAll('[data-layer]').length,reduced:reduced.matches})};
}
