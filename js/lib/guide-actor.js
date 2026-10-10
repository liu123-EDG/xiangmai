import { createGuideMotion } from './guide-motion.js';
import { GUIDE_RIGS } from './guide-rigs.js';
/* A continuous layered puppet: no whole-person pose swaps or dissolve ghosts. */
export function createGuideActor({ host, image, source, reduced = false, preview = false }) {
  const name = Object.keys(GUIDE_RIGS).find(id => source.includes(id));
  const rig = GUIDE_RIGS[name];
  const canvas = document.createElement('canvas');
  canvas.className = 'guide-actor'; canvas.width = 420; canvas.height = 630;
  canvas.setAttribute('aria-hidden','true'); canvas.hidden = true;
  host.insertBefore(canvas,image);
  const ctx = canvas.getContext('2d'), sheet = new Image();
  const motion = createGuideMotion({reduced:false,phase:preview?Math.random()*22:0});
  let loaded=false,raf=0,visible=!preview,last=0,mode='idle',destroyed=false,draws=0;
  const media=matchMedia('(prefers-reduced-motion: reduce)');
  let disabled=reduced;
  function part(index,x,y,width,height,pivot=[.5,0],angle=0) {
    const r=rig.parts[index]; ctx.save();ctx.translate(x,y);ctx.rotate(angle);
    if(index===0&&rig.headClip){ctx.beginPath();rig.headClip.forEach(([px,py],i)=>{const dx=(px-pivot[0])*width,dy=(py-pivot[1])*height;i?ctx.lineTo(dx,dy):ctx.moveTo(dx,dy)});ctx.closePath();ctx.clip();}
    ctx.drawImage(sheet,...r,-width*pivot[0],-height*pivot[1],width,height);ctx.restore();
  }
  function patch(rect,expressionRect,alpha,w,h,pivot) {
    if(alpha<.015)return;
    const normal=rig.parts[0],expression=rig.parts[7];
    const [x,y,rw,rh]=rect,[ex,ey,ew,eh]=expressionRect;
    ctx.save();ctx.globalAlpha=Math.min(1,alpha);
    // Restrict facial patches to their own rounded area; hair and face contour stay fixed.
    ctx.beginPath();ctx.ellipse((x+rw/2-pivot[0])*w,(y+rh/2-pivot[1])*h,rw*w/2,rh*h/2,0,0,Math.PI*2);ctx.clip();
    ctx.drawImage(sheet,expression[0]+ex*expression[2],expression[1]+ey*expression[3],ew*expression[2],eh*expression[3],(x-pivot[0])*w,(y-pivot[1])*h,rw*w,rh*h);
    ctx.restore();
  }
  function mouth(amount,w,h,pivot) {
    if(amount<.015)return;
    const [x,y,rw,rh]=rig.head.mouth;
    const face=rig.parts[0];
    const sx=face[0]+x*face[2],sy=face[1]+y*face[3];
    const sw=rw*face[2],sh=rh*face[3];
    const dx=(x-pivot[0])*w,dy=(y-pivot[1])*h,dw=rw*w,dh=rh*h;
    // Opaque replacement covers the entire original mouth, including its corners.
    // Deform only the central lip band; surrounding skin fills the same area.
    const lipHeight=dh*.44*(1+.65*Math.max(0,Math.min(1,amount)));
    const rim=(dh-lipHeight)/2;
    ctx.save();ctx.globalAlpha=1;
    ctx.drawImage(sheet,sx,sy,sw,sh*.28,dx,dy,dw,rim);
    ctx.drawImage(sheet,sx,sy+sh*.28,sw,sh*.44,dx,dy+rim,dw,lipHeight);
    ctx.drawImage(sheet,sx,sy+sh*.72,sw,sh*.28,dx,dy+rim+lipHeight,dw,rim);
    ctx.restore();
  }
  function render(p) {
    if(!loaded)return;
    ctx.clearRect(0,0,420,630);ctx.save();
    ctx.translate(210,600);ctx.rotate(p.body);ctx.translate(-210,-600);
    const rise=p.breath,waist=310-rise;
    part(6,210,waist,rig.lower.width,rig.lower.height,[.5,0],p.skirt);
    const arm=(side,upperAngle,lowerAngle)=>{
      const left=side===0,x=210+(left?-rig.shoulder:rig.shoulder),y=(rig.armY||210)-rise;
      const jointY=rig.upper.height-12;
      ctx.save();ctx.translate(x,y);ctx.rotate(upperAngle);
      part(left?2:4,0,0,rig.upper.width,rig.upper.height,rig.upperPivots?.[side]||[.5,.08]);
      ctx.translate(0,jointY);ctx.rotate(lowerAngle);
      part(left?3:5,0,0,rig.forearm.width,rig.forearm.height,[.5,.10]);ctx.restore();
    };
    ctx.save();ctx.translate(210,174-rise);
    if(rig.torsoClip){ctx.beginPath();rig.torsoClip.forEach(([x,y],i)=>{const px=(x-.5)*rig.torso.width,py=y*rig.torso.height;i?ctx.lineTo(px,py):ctx.moveTo(px,py)});ctx.closePath();ctx.clip();}
    part(1,0,0,rig.torso.width,rig.torso.height);ctx.restore();
    arm(0,p.leftUpper,p.leftLower);arm(1,p.rightUpper,p.rightLower);
    const head=rig.head;
    ctx.save();ctx.translate(210,185-rise);ctx.rotate(p.head);
    part(0,0,0,head.width,head.height,head.neck);
    patch(head.eyes,head.expressionEyes,p.blink,head.width,head.height,head.neck);
    mouth(p.mouth,head.width,head.height,head.neck);
    ctx.restore();ctx.restore();draws++;
    canvas.dataset.clip=motion.state().clip;canvas.dataset.mode=mode;
  }
  function loop(now){
    raf=0;if(!loaded||!visible||document.hidden||disabled||destroyed)return;
    if(!last)last=now;
    if(now-last>=1000/30){const dt=(now-last)/1000;last=now;render(motion.step(dt));}
    raf=requestAnimationFrame(loop);
  }
  function pause(){cancelAnimationFrame(raf);raf=0;last=0;}
  function resume(){if(!raf&&loaded&&visible&&!document.hidden&&!disabled&&!destroyed){last=0;raf=requestAnimationFrame(loop);}}
  const onVisibility=()=>document.hidden?pause():resume();
  const onMedia=()=>{disabled=media.matches;if(disabled){pause();render({head:0,body:0,leftUpper:.08,leftLower:-.12,rightUpper:-.08,rightLower:.12,skirt:0,breath:0,blink:0,mouth:0})}else resume()};
  document.addEventListener('visibilitychange',onVisibility);media.addEventListener?.('change',onMedia);
  const observer='IntersectionObserver' in window?new IntersectionObserver(entries=>{visible=entries[0].isIntersecting;visible?resume():pause()}):null;
  observer?.observe(host);if(!observer)visible=true;
  sheet.onload=()=>{if(destroyed||!rig)return;loaded=true;image.hidden=true;canvas.hidden=false;host.classList.add('has-guide-actor');render(motion.step(0));resume()};
  sheet.onerror=()=>{if(!destroyed){image.hidden=false;canvas.hidden=true;pause()}};
  if(rig)sheet.src=source;
  return {
    setMode(value){mode=value;motion.setMode(value);resume()},
    wave(){motion.wave();resume()},
    state:()=>({loaded,mode,animated:!!raf,source,renderer:'layered-rig-v3',draws,...motion.state()}),
    destroy(){destroyed=true;pause();observer?.disconnect();document.removeEventListener('visibilitychange',onVisibility);media.removeEventListener?.('change',onMedia);sheet.onload=null;sheet.onerror=null;canvas.remove();image.hidden=false;host.classList.remove('has-guide-actor')},
  };
}
