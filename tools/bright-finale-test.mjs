import {createServer} from 'node:http';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {existsSync} from 'node:fs';
import {dirname,join,extname} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {spawn} from 'node:child_process';
const root=join(dirname(fileURLToPath(import.meta.url)),'..');
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const mime={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.png':'image/png','.webp':'image/webp','.mp3':'audio/mpeg','.mp4':'video/mp4','.wav':'audio/wav'};
const server=createServer(async(req,res)=>{try{const path=new URL(req.url,'http://local').pathname;const file=join(root,path==='/'?'/index.html':path);const data=await readFile(file);res.writeHead(200,{'content-type':mime[extname(file)]||'application/octet-stream'});res.end(data);}catch{res.writeHead(404);res.end();}});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const base='http://127.0.0.1:'+server.address().port+'/';
const chromePath=['C:/Program Files/Google/Chrome/Application/chrome.exe','C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'].find(existsSync);
const profile=join(root,'.chrome-finale');await mkdir(profile,{recursive:true});await mkdir(join(root,'shots'),{recursive:true});
const browser=spawn(chromePath,['--headless=new','--remote-debugging-port=10469','--user-data-dir='+profile,'--no-first-run','--hide-scrollbars','--enable-unsafe-swiftshader','about:blank'],{stdio:'ignore'});
let ws;let failures=0;const errors=[];
const check=(v,label)=>{console.log((v?'  ok   ':'  FAIL ')+label);if(!v)failures++;};
try{
 let target;
 for(let i=0;i<80&&!target;i++){try{target=(await(await fetch('http://127.0.0.1:10469/json/list')).json()).find(x=>x.type==='page');}catch{}if(!target)await sleep(100);}
 ws=new WebSocket(target.webSocketDebuggerUrl);await new Promise((r,j)=>{ws.onopen=r;ws.onerror=j;});
 let id=0;const pending=new Map();
 ws.onmessage=e=>{const m=JSON.parse(e.data);if(m.id){pending.get(m.id)?.(m);pending.delete(m.id);}if(m.method==='Runtime.exceptionThrown')errors.push(m.params.exceptionDetails.exception?.description||m.params.exceptionDetails.text);};
 const send=(method,params={})=>new Promise(r=>{const n=++id;pending.set(n,r);ws.send(JSON.stringify({id:n,method,params}));});
 const evaluate=async(expression)=>{const m=await send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});if(m.result.exceptionDetails)throw Error(m.result.exceptionDetails.exception?.description||m.result.exceptionDetails.text);return m.result.result.value;};
 const visit=async(path)=>{await send('Page.navigate',{url:path.startsWith('file:')?path:base+path});for(let i=0;i<70;i++){await sleep(100);if(await evaluate('!!window.__XM_FINALE__'))break;}await sleep(250);};
 const screenshot=async(name)=>{const m=await send('Page.captureScreenshot',{format:'png'});await writeFile(join(root,'shots',name+'.png'),Buffer.from(m.result.data,'base64'));};
 const click=async(selector)=>{await evaluate('document.querySelector('+JSON.stringify(selector)+').scrollIntoView({block:"center",behavior:"instant"})');await sleep(250);const point=await evaluate('(()=>{const r=document.querySelector('+JSON.stringify(selector)+').getBoundingClientRect();return {x:r.left+r.width/2,y:r.top+r.height/2}})()');await send('Input.dispatchMouseEvent',{type:'mousePressed',...point,button:'left',clickCount:1});await send('Input.dispatchMouseEvent',{type:'mouseReleased',...point,button:'left',clickCount:1});await sleep(200);};
 await send('Runtime.enable');await send('Page.enable');await send('Emulation.setDeviceMetricsOverride',{width:1440,height:1000,deviceScaleFactor:1,mobile:false});



await visit('heritage/index.html#bright-finale');
await sleep(700);
console.log('Anchor position',await evaluate('({top:document.querySelector("#bright-finale").getBoundingClientRect().top,phase:window.__XM_FINALE__.state().phase})'));
check(await evaluate('Math.abs(document.querySelector("#bright-finale").getBoundingClientRect().top)<4'), '直接打开尾声链接定位正确');
await screenshot('finale-anchor-entry');
const scrollToProgress = async (p) => {
 await evaluate(`(()=>{const h=document.querySelector('#bright-finale');const y=scrollY+h.getBoundingClientRect().top;scrollTo({top:y+(h.offsetHeight-h.querySelector('.bf-scene').offsetHeight)*${p},behavior:'instant'})})()`);
 await sleep(750);
 await evaluate('Promise.all([...document.querySelectorAll("#bright-finale img")].map(i=>i.decode().catch(()=>{})))');
};
for(const [p,phase,name] of [[0,0,'dawn'],[.3,1,'notes'],[.58,2,'joining'],[1,3,'complete']]) {
 await scrollToProgress(p);
 const state=await evaluate('window.__XM_FINALE__.state()');
 check(state.phase===phase,'滚动阶段 '+name+' 正确');
 check(state.images.every(i=>i.loaded),'四张原画全部解码 '+name);
 check(await evaluate('(()=>{const h=document.querySelector("#bright-finale");return [...h.querySelectorAll(".bf-chapter")].filter(a=>!a.inert&&getComputedStyle(a).visibility==="visible").length===1})()'),'当前只有一幕可见并可访问');
 await screenshot('finale-'+name);
}
check(await evaluate('getComputedStyle(document.querySelector(".bf-people")).clipPath === "inset(0px 0%)" || getComputedStyle(document.querySelector(".bf-people")).clipPath === "inset(0px 0px)"'),'最后人物完整展开');
check(await evaluate('getComputedStyle(document.querySelector(".bf-return")).display==="inline-flex" && !document.querySelector(".bf-return").inert'),'终点入口可点击');
check(await evaluate('document.querySelector("main").lastElementChild.id==="bright-finale"'),'新尾声位于网站最后');
await scrollToProgress(.3);check((await evaluate('window.__XM_FINALE__.state()')).phase===1,'向上滚动可还原之前一幕');
await click('.bf-entry');await sleep(500);
check(await evaluate('Math.abs(document.querySelector("#bright-finale").getBoundingClientRect().top)<4'),'点击明显入口直达尾声');
await send('Emulation.setDeviceMetricsOverride',{width:1366,height:768,deviceScaleFactor:1,mobile:false});
await scrollToProgress(1);await screenshot('finale-laptop');
check(await evaluate('(()=>{const h=document.querySelector(".bf-chapter--last").getBoundingClientRect();const m=document.querySelector(".bf-mission").getBoundingClientRect();const i=document.querySelector(".bf-people").getBoundingClientRect();return h.top>70&&m.bottom<i.top+i.height*.18})()'),'笔记本标题区域避开人物头部');
for(const width of [390,320]) {
 await send('Emulation.setDeviceMetricsOverride',{width,height:844,deviceScaleFactor:1,mobile:true});
 await scrollToProgress(1);
 check(await evaluate('document.documentElement.scrollWidth <= innerWidth'),'手机 '+width+' 无水平溢出');
 check(await evaluate('(()=>{const c=document.querySelector(".bf-chapter--last").getBoundingClientRect();const b=document.querySelector(".bf-bottom").getBoundingClientRect();return c.top>70&&c.bottom<b.top})()'),'手机 '+width+' 结尾文字与按钮不重叠');
 await screenshot('finale-mobile-'+width);
}
await evaluate('window.__XM_GUIDE__.choose("xiange");document.querySelector(".guide-hint__close").click()');await sleep(700);
check(await evaluate('(()=>{const a=document.querySelector(".bf-return").getBoundingClientRect();const b=document.querySelector(".guide-launcher").getBoundingClientRect();return a.right<=b.left||a.bottom<=b.top})()'),'手机已有同行人物也不会遮住结尾按钮');
await screenshot('finale-mobile-companion');
await send('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:'reduce'}]});await sleep(350);
check(await evaluate('window.__XM_FINALE__.state().reduced && document.querySelector("#bright-finale").offsetHeight < innerHeight*1.2'),'减少动态时无需长距离滚动');
await evaluate('document.querySelector("#bright-finale").scrollIntoView({behavior:"instant"})');await sleep(500);
await screenshot('finale-reduced');
await send('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:'no-preference'}]});
await visit(pathToFileURL(join(root,'heritage/index.html')).href);
await scrollToProgress(1);
check((await evaluate('window.__XM_FINALE__.state()')).images.every(i=>i.loaded),'本地 file:// 四张原画可以显示');
check(errors.length===0,'没有运行时脚本异常');
}catch(e){check(false,e.stack||e.message);}finally{ws?.close();browser.kill();server.close();}
process.exit(failures?1:0);