import {createServer} from 'node:http';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {existsSync} from 'node:fs';
import {dirname,join,extname} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {spawn} from 'node:child_process';
const root=join(dirname(fileURLToPath(import.meta.url)),'..');
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const mime={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.png':'image/png','.webp':'image/webp','.mp3':'audio/mpeg','.wav':'audio/wav','.mp4':'video/mp4'};
const server=createServer(async(req,res)=>{try{const path=new URL(req.url,'http://local').pathname;const file=join(root,path==='/'?'/index.html':path);const data=await readFile(file);res.writeHead(200,{'content-type':mime[extname(file)]||'application/octet-stream'});res.end(data);}catch{res.writeHead(404);res.end();}});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const base='http://127.0.0.1:'+server.address().port+'/';
const chromePath=['C:/Program Files/Google/Chrome/Application/chrome.exe','C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'].find(existsSync);
const profile=join(root,'.chrome-performer');await mkdir(profile,{recursive:true});await mkdir(join(root,'shots'),{recursive:true});
const browser=spawn(chromePath,['--headless=new','--remote-debugging-port=10531','--user-data-dir='+profile,'--no-first-run','--hide-scrollbars','--enable-unsafe-swiftshader','about:blank'],{stdio:'ignore'});
let ws;let failures=0;const errors=[];
const check=(v,label)=>{console.log((v?'  ok   ':'  FAIL ')+label);if(!v)failures++;};
try{
 let target;
 for(let i=0;i<80&&!target;i++){try{target=(await(await fetch('http://127.0.0.1:10531/json/list')).json()).find(x=>x.type==='page');}catch{}if(!target)await sleep(100);}
 ws=new WebSocket(target.webSocketDebuggerUrl);await new Promise((r,j)=>{ws.onopen=r;ws.onerror=j;});
 let id=0;const pending=new Map();
 ws.onmessage=e=>{const m=JSON.parse(e.data);if(m.id){pending.get(m.id)?.(m);pending.delete(m.id);}if(m.method==='Runtime.exceptionThrown')errors.push(m.params.exceptionDetails.exception?.description||m.params.exceptionDetails.text);};
 const send=(method,params={})=>new Promise(r=>{const n=++id;pending.set(n,r);ws.send(JSON.stringify({id:n,method,params}));});
 const evaluate=async(expression)=>{const m=await send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});if(m.result.exceptionDetails)throw Error(m.result.exceptionDetails.exception?.description||m.result.exceptionDetails.text);return m.result.result.value;};
 const visit=async(path)=>{await send('Page.navigate',{url:path.startsWith('file:')?path:base+path});for(let i=0;i<70;i++){await sleep(100);if(await evaluate('!!window.__XM_PERFORMER__?.state().loaded'))break;}await sleep(250);};
 const screenshot=async(name)=>{const m=await send('Page.captureScreenshot',{format:'png'});await writeFile(join(root,'shots',name+'.png'),Buffer.from(m.result.data,'base64'));};
 const click=async(selector)=>{await evaluate('document.querySelector('+JSON.stringify(selector)+').scrollIntoView({block:"center",behavior:"instant"})');await sleep(250);const point=await evaluate('(()=>{const r=document.querySelector('+JSON.stringify(selector)+').getBoundingClientRect();return {x:r.left+r.width/2,y:r.top+r.height/2}})()');await send('Input.dispatchMouseEvent',{type:'mousePressed',...point,button:'left',clickCount:1});await send('Input.dispatchMouseEvent',{type:'mouseReleased',...point,button:'left',clickCount:1});await sleep(200);};
 await send('Runtime.enable');await send('Page.enable');await send('Emulation.setDeviceMetricsOverride',{width:1440,height:1000,deviceScaleFactor:1,mobile:false});



for(const chapter of ['qiongnaieman','mashrap']){
await visit(chapter+'/index.html');check(await evaluate('window.__XM_PERFORMER__.state().loaded'),'人物素材加载 '+chapter);await evaluate('document.querySelector("#instrument-stage").scrollIntoView({behavior:"instant",block:"center"})');await sleep(500);await screenshot('performer-'+chapter+'-rest');
await click('.ip-demo');await sleep(250);check(await evaluate('window.__XM_PERFORMER__.state().narrating'),'点击演示实际播放中文讲解 '+chapter);await click('.ip-stop');check(await evaluate('!window.__XM_PERFORMER__.state().narrating && window.__XM_PERFORMER__.state().mode==="idle"'),'停止取消讲解和演示 '+chapter);
await evaluate('document.querySelector(".ip-voice input").checked=false');await click('.ip-demo');await sleep(2400);check(await evaluate('window.__XM_PERFORMER__.state().step===1 && (window.__XM_PERFORMER__.state().playing || window.__XM_PERFORMER__.state().strikes>0)'),'演奏阶段动作与声音启动 '+chapter);await screenshot('performer-'+chapter+'-playing');await click('.ip-stop');await click('.ip-try');
if(chapter==='qiongnaieman'){
 await evaluate('(()=>{const s=document.querySelector(".ip-slider");s.value=80;s.dispatchEvent(new Event("input",{bubbles:true}));})()');await sleep(300);check(await evaluate('window.__XM_BOW__.state().voiceOn && window.__XM_PERFORMER__.state().position===.8'),'拖动滑块带动运弓和音高');await screenshot('performer-satar-practice');await evaluate('document.querySelector(".ip-slider").dispatchEvent(new Event("change",{bubbles:true}))');check(await evaluate('!window.__XM_BOW__.state().voiceOn'),'松手停止弓弦声音');
}else{
 const before=await evaluate('window.__XM_LAB__.state().strikes');await click('[data-hit=dum]');await click('[data-hit=tek]');check(await evaluate('window.__XM_PERFORMER__.state().strikes>=2 && window.__XM_LAB__.state().strikes>'+before),'鼓面和边圈触发人物与实际音色');await screenshot('performer-dap-practice');
}
await evaluate('window.scrollTo({top:0,behavior:"instant"})');await sleep(250);check(await evaluate('window.__XM_PERFORMER__.state().mode==="idle" && !window.__XM_PERFORMER__.state().narrating'),'离开舞台停止演示 '+chapter);
for(const width of [390,320]){await send('Emulation.setDeviceMetricsOverride',{width,height:844,deviceScaleFactor:1,mobile:true});await evaluate('document.querySelector("#instrument-stage").scrollIntoView({behavior:"instant",block:"start"})');await sleep(200);check(await evaluate('document.documentElement.scrollWidth<=innerWidth'),'手机无横向溢出 '+chapter+' '+width);await screenshot('performer-'+chapter+'-mobile-'+width);}
await send('Emulation.setDeviceMetricsOverride',{width:1440,height:1000,deviceScaleFactor:1,mobile:false});
}
await visit(pathToFileURL(join(root,'qiongnaieman/index.html')).href);await click('.ip-demo');await sleep(300);check(await evaluate('window.__XM_PERFORMER__.state().audioReady && window.__XM_PERFORMER__.state().narrating'),'file:// 本地演示与中文音频可用');await click('.ip-stop');
await send('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:'reduce'}]});await visit('mashrap/index.html');await evaluate('document.querySelector("#instrument-stage").scrollIntoView({behavior:"instant",block:"center"})');await sleep(300);check(await evaluate('!window.__XM_PERFORMER__.state().animated'),'减少动态设置保留静态持鼓');check(errors.length===0,'无浏览器脚本异常');console.log(errors);
}catch(e){check(false,e.stack||e.message);}finally{ws?.close();browser.kill();server.close();}
process.exit(failures?1:0);