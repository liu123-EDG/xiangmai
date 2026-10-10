import assert from 'node:assert/strict';
import {createGuideMotion} from '../js/lib/guide-motion.js';
import {GUIDE_RIGS} from '../js/lib/guide-rigs.js';
const rig=createGuideMotion();let previous=rig.step(0),largest=0;const clips=new Set();
for(let i=0;i<1800;i++){
 if(i===80||i===580)rig.wave();
 if(i===250||i===600)rig.setMode('talking');
 if(i===440||i===770)rig.setMode('idle');
 const pose=rig.step(1/60);clips.add(rig.state().clip);
 for(const key of Object.keys(pose))assert(Number.isFinite(pose[key]),key+' stays finite');
 for(const key of ['head','body','leftUpper','leftLower','rightUpper','rightLower','skirt'])largest=Math.max(largest,Math.abs(pose[key]-previous[key]));
 assert(pose.blink>=0&&pose.blink<=1);assert(pose.mouth>=0&&pose.mouth<=1);
 previous=pose;
}
assert(largest<.15,'joint movement remains continuous through interruptions');
assert(clips.has('greet')&&clips.has('speak')&&clips.has('sleeve')&&clips.has('look'));
const calm=createGuideMotion({reduced:true});const still=calm.step(0);calm.wave();calm.setMode('talking');assert.deepEqual(calm.step(2),still);
const greeting=createGuideMotion();greeting.wave();for(let i=0;i<190;i++)greeting.step(1/60);assert(Math.abs(greeting.state().pose.leftLower+.12)<.001,'greeting returns to rest');
for(const config of Object.values(GUIDE_RIGS))for(const [x,y,w,h]of config.parts)assert(x>=0&&y>=0&&x+w<=1254&&y+h<=1254,'sprite rectangle stays inside atlas');
console.log('✓ 连续动作：关节无跳变、打断衔接、招手收尾、表情范围、减弱动效、图集边界全部通过（最大逐帧角度变化 '+largest.toFixed(3)+' rad）');
