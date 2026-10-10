import { createGuideActor } from './guide-actor.js';
const SOURCE='https://www.kashi.gov.cn/ksdqxzgs/c106706/202011/5acebe1c503b44cf9518e0bf1a2e23b7.shtml';
const clamp=n=>Math.max(0,Math.min(1,n));
// Two-joint arm targets keep the hand at the bow grip / drum surface.
function reach(x,y,side,rig){
 const dx=x-(210+(side===0?-rig.shoulder:rig.shoulder)),dy=y-(rig.armY||214);
 const a=rig.upper.height-12,b=rig.forearm.height*.8;
 const distance=Math.max(Math.abs(a-b)+1,Math.min(a+b-1,Math.hypot(dx,dy)));
 const angle=Math.acos(Math.max(-1,Math.min(1,(distance*distance-a*a-b*b)/(2*a*b))))*(side===0?-1:1);
 const upper=Math.atan2(-dx,dy)-Math.atan2(b*Math.sin(angle),a+b*Math.cos(angle));
 return [upper,angle];
}
export function mountInstrumentPerformer({host,kind,bow,lab,reduced=false}){
 if(!host)return null;
 const isBow=kind==='satar',name=isBow?'萨它尔':'手鼓 · 达普';
 const lines=isBow?['先看持琴：琴身竖起，左手扶住琴杆，右手握弓。','琴弓擦过主奏弦。看我的运弓；散板的快慢可以自由变化。','轮到你了：拖动滑块拉弓，松手就停。']:
 ['先托住手鼓，让鼓面朝向演奏者，另一只手准备敲击。','看鼓面和边圈的敲击示意，听两种合成音色的区别。','轮到你了：选鼓面或边圈，每点一下，我跟着敲一下。'];
 host.innerHTML='<div class="ip-stage" aria-label="弦歌演示'+name+'"><div class="ip-portrait"><img src="../assets/img/guides/xiange.png" alt="虚拟同行者弦歌正在持'+name+'"></div><span class="ip-instrument">'+name+'</span><span class="ip-light" aria-hidden="true"></span></div><div class="ip-instructions"><p class="ip-kicker">虚拟乐师 · 弦歌</p><h3>我做一遍，你来试一试</h3><p class="ip-subtitle" aria-live="polite">'+lines[0]+'</p><ol class="ip-steps"><li>持琴 / 托鼓</li><li>看我演奏</li><li>跟着试奏</li></ol><div class="ip-actions"><button type="button" class="ip-demo">开始演示</button><button type="button" class="ip-try">我来试</button><button type="button" class="ip-stop" disabled>停止</button></div><label class="ip-voice"><input type="checkbox" checked> 语音讲解</label><div class="ip-practice" hidden>'+ (isBow?'<label>按住并拖动来拉弓<input class="ip-slider" type="range" min="0" max="100" value="50" aria-label="拉弓位置"></label>':'<div class="ip-drum-controls"><button type="button" data-hit="dum">敲鼓面</button><button type="button" data-hit="tek">敲边圈</button></div>') +'</div><p class="ip-note">动作与音色为简化演示，音色由程序合成。<a href="'+SOURCE+'" target="_blank" rel="noopener noreferrer">乐器介绍 ↗</a></p></div>';
 host.classList.add('instrument-performer');host.id='instrument-stage';
 host.querySelector('.ip-steps li').textContent=isBow?'扶琴与握弓':'托鼓与准备';
 const subtitle=host.querySelector('.ip-subtitle'),stopButton=host.querySelector('.ip-stop'),practice=host.querySelector('.ip-practice'),voiceInput=host.querySelector('.ip-voice input');
 let mode='idle',step=0,position=.5,strikes=0,playing=false,timer=0,raf=0,lastHit=-1000,hitKind='dum',ownedBow=false,started=0,actor=null,hasDemo=false;
 const media=matchMedia('(prefers-reduced-motion: reduce)');
 const state=()=>({kind,mode,step,position,strikes,playing,loaded:actor?.state().loaded,animated:actor?.state().animated,narrating:narration.some(a=>!a.paused),audioReady:narration.every(a=>a.readyState>=2)});
 const narration=lines.map((text,i)=>{const audio=new Audio('../assets/audio/performer/'+kind+'-'+i+'.wav');audio.preload='auto';audio.addEventListener('ended',()=>silence());audio.addEventListener('error',()=>actor?.setMode('idle'));return audio;});
 let prepareFor=2000,performFor=6500,savedThemeVolume=null;
 function silence(){narration.forEach(audio=>{audio.pause();audio.currentTime=0;});if(savedThemeVolume!==null){window.__XM_THEME__?.setVolume(savedThemeVolume);savedThemeVolume=null;}actor?.setMode('idle');}
 function speak(text){
  silence();if(!voiceInput.checked||document.querySelector('#sound-toggle')?.getAttribute('aria-pressed')==='false')return;
  const audio=narration[lines.indexOf(text)];if(!audio)return;const theme=window.__XM_THEME__;if(theme){savedThemeVolume=theme.state().volume;theme.setVolume(.1);}actor?.setMode('talking');audio.play().catch(()=>actor?.setMode('idle'));
 }
 function setStep(index){step=index;subtitle.textContent=lines[index];host.querySelectorAll('.ip-steps li').forEach((el,i)=>el.classList.toggle('is-active',i===index));}
 function soundBow(frac){if(document.querySelector('#sound-toggle')?.getAttribute('aria-pressed')==='false')return;ownedBow=!!bow?._testBow(frac);}
 function releaseBow(){if(ownedBow)bow?._testRelease();ownedBow=false;playing=false;}
 function hit(k){hitKind=k;lastHit=performance.now();playing=true;strikes++;if(document.querySelector('#sound-toggle')?.getAttribute('aria-pressed')!=='false')lab?.strike(k==='dum'?.16:.84);actor?.refresh();}
 function end(){clearTimeout(timer);cancelAnimationFrame(raf);raf=0;mode='idle';releaseBow();stopButton.disabled=true;host.querySelector('.ip-demo').textContent=hasDemo?'再看一遍':'开始演示';silence();actor?.setMode('idle');actor?.refresh();}
 function tick(now){if(mode!=='demo')return;const elapsed=now-started;
  if(elapsed>prepareFor&&elapsed<prepareFor+performFor){if(step!==1){setStep(1);speak(lines[1]);}
   if(isBow){position=.5+.32*Math.sin((elapsed-prepareFor)/850);playing=true;soundBow(position);}
   else if(now-lastHit>720)hit(strikes%2?'tek':'dum');
  }
  if(elapsed>=prepareFor+performFor){end();mode='practice';practice.hidden=false;setStep(2);stopButton.disabled=false;speak(lines[2]);return;}
  raf=requestAnimationFrame(tick);
 }
 const performanceRig={
  pose(p,rig){
   const now=performance.now();const silent=reduced||media.matches;
   if(mode!=='demo'&&isBow&&!ownedBow&&bow){const s=bow.state();if(s.dragging){position=s.bowFrac;playing=true;}else if(mode!=='demo')playing=ownedBow;}
   const impact=!isBow?Math.max(0,1-(now-lastHit)/240):0;
   if(!isBow)playing=impact>0;
   const rightHand=isBow?[158+position*72,348]:[hitKind==='tek'?286:257,302-(1-impact)*26];
   const leftHand=isBow?[292,292]:[227,332];
   const left=reach(...rightHand,0,rig),right=reach(...leftHand,1,rig);
   return {...p,body:0,breath:0,skirt:0,head:silent?0:p.head*.5,leftUpper:left[0],leftLower:left[1],rightUpper:right[0],rightLower:right[1]};
  },
  draw(ctx){
   ctx.save();ctx.lineJoin='round';
   if(isBow){
    const wood=ctx.createLinearGradient(258,0,320,0);wood.addColorStop(0,'#684021');wood.addColorStop(.5,'#d2a264');wood.addColorStop(1,'#633b20');ctx.fillStyle=wood;ctx.strokeStyle='#dfbf85';ctx.lineWidth=2;
    ctx.beginPath();ctx.moveTo(283,360);ctx.bezierCurveTo(270,378,256,413,263,442);ctx.bezierCurveTo(268,478,317,478,326,442);ctx.bezierCurveTo(333,412,312,376,301,360);ctx.closePath();ctx.fill();ctx.stroke();
    ctx.fillRect(283,111,18,272);ctx.strokeRect(283,111,18,272);
    for(let i=0;i<7;i++){ctx.fillStyle='#4e3324';ctx.fillRect(i%2?299:275,120+i*14,10,4);}
    ctx.fillStyle='#e0c392';ctx.fillRect(274,430,40,5);
    ctx.strokeStyle=playing?'#f6deb0':'#ddcba6';ctx.lineWidth=playing?1.8:.7;
    for(let i=0;i<5;i++){ctx.beginPath();ctx.moveTo(288+i*2,122);ctx.lineTo(288+i*2,447);ctx.stroke();}
    for(let i=0;i<13;i++){ctx.strokeStyle='#71502f';ctx.beginPath();ctx.moveTo(284,185+i*11);ctx.lineTo(300,185+i*11);ctx.stroke();}
    const grip=158+position*72;ctx.strokeStyle='#754323';ctx.lineWidth=5;ctx.beginPath();ctx.moveTo(grip-40,336);ctx.quadraticCurveTo(grip+67,327,grip+167,336);ctx.stroke();ctx.strokeStyle='#eee0b8';ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(grip-40,343);ctx.lineTo(grip+167,343);ctx.stroke();
   }else{
    const face=ctx.createRadialGradient(246,280,4,257,302,59);face.addColorStop(0,'#ecd4a0');face.addColorStop(1,'#ab8150');ctx.fillStyle=face;ctx.strokeStyle='#754821';ctx.lineWidth=10;ctx.beginPath();ctx.ellipse(257,302,57,68,-.13,0,Math.PI*2);ctx.fill();ctx.stroke();ctx.strokeStyle='#e3bc72';ctx.lineWidth=2;ctx.stroke();
    for(let i=0;i<8;i++){const a=i*Math.PI/4;ctx.strokeStyle='#ac9a7a';ctx.beginPath();ctx.arc(257+Math.cos(a)*45,302+Math.sin(a)*55,4,0,Math.PI*2);ctx.stroke();}
    const impact=Math.max(0,1-(performance.now()-lastHit)/350);if(impact>0){ctx.strokeStyle='rgba(255,227,162,'+impact+')';ctx.lineWidth=3;ctx.beginPath();ctx.ellipse(257,302,15+(1-impact)*45,18+(1-impact)*50,0,0,Math.PI*2);ctx.stroke();}
   }
   ctx.restore();
  }
 };
 const portrait=host.querySelector('.ip-portrait'),image=portrait.querySelector('img');
 actor=createGuideActor({host:portrait,image,source:'../assets/img/guides/xiange-rig-v3.png',reduced,performance:performanceRig});
 host.querySelector('.ip-demo').addEventListener('click',()=>{end();hasDemo=true;mode='demo';practice.hidden=true;stopButton.disabled=false;setStep(0);speak(lines[0]);prepareFor=voiceInput.checked?Math.max(2000,(narration[0].duration||6)*1000+250):1600;performFor=voiceInput.checked?Math.max(6500,(narration[1].duration||8)*1000+250):6500;started=performance.now();raf=requestAnimationFrame(tick);});
 host.querySelector('.ip-stop').addEventListener('click',end);
 host.querySelector('.ip-try').addEventListener('click',()=>{end();mode='practice';practice.hidden=false;setStep(2);speak(lines[2]);stopButton.disabled=false;});
 voiceInput.addEventListener('change',()=>{if(!voiceInput.checked)silence();});
 if(isBow){const slider=host.querySelector('.ip-slider');slider.addEventListener('input',()=>{position=Number(slider.value)/100;playing=true;soundBow(position);actor.refresh();});slider.addEventListener('pointerdown',()=>{playing=true;soundBow(position);});const release=()=>{releaseBow();actor.refresh();};slider.addEventListener('change',release);addEventListener('pointerup',release);addEventListener('pointercancel',release);slider.addEventListener('blur',release);}
 else host.querySelectorAll('[data-hit]').forEach(b=>b.addEventListener('click',()=>hit(b.dataset.hit)));
 if(!isBow)document.addEventListener('xm:rhythm-strike',event=>{if(event.detail.source==='test'||!['dum','tek'].includes(event.detail.kind))return;hitKind=event.detail.kind;lastHit=performance.now();strikes++;actor.refresh();});
 const observer=new IntersectionObserver(entries=>{if(!entries[0].isIntersecting)end();});observer.observe(host);
 document.addEventListener('visibilitychange',()=>{if(document.hidden)end();});addEventListener('pagehide',end);
 document.querySelector('#sound-toggle')?.addEventListener('click',()=>{if(document.querySelector('#sound-toggle').getAttribute('aria-pressed')==='false')end();});
 setStep(0);const api={state,stop:end,actor};window.__XM_PERFORMER__=api;return api;
}
