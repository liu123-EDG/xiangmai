import {createServer} from 'node:http';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {existsSync} from 'node:fs';
import {dirname,join,extname} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {spawn} from 'node:child_process';
const root=join(dirname(fileURLToPath(import.meta.url)),'..');
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const mime={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.png':'image/png','.webp':'image/webp','.mp3':'audio/mpeg','.mp4':'video/mp4'};
const server=createServer(async(req,res)=>{try{const path=new URL(req.url,'http://local').pathname;const file=join(root,path==='/'?'/index.html':path);const data=await readFile(file);res.writeHead(200,{'content-type':mime[extname(file)]||'application/octet-stream'});res.end(data);}catch{res.writeHead(404);res.end();}});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const base='http://127.0.0.1:'+server.address().port+'/';
const chromePath=['C:/Program Files/Google/Chrome/Application/chrome.exe','C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'].find(existsSync);
const profile=join(root,'.chrome-voices');await mkdir(profile,{recursive:true});await mkdir(join(root,'shots'),{recursive:true});
const browser=spawn(chromePath,['--headless=new','--remote-debugging-port=10461','--user-data-dir='+profile,'--no-first-run','--hide-scrollbars','--enable-unsafe-swiftshader','about:blank'],{stdio:'ignore'});
let ws;let failures=0;const errors=[];
const check=(v,label)=>{console.log((v?'  ok   ':'  FAIL ')+label);if(!v)failures++;};
try{
 let target;
 for(let i=0;i<80&&!target;i++){try{target=(await(await fetch('http://127.0.0.1:10461/json/list')).json()).find(x=>x.type==='page');}catch{}if(!target)await sleep(100);}
 ws=new WebSocket(target.webSocketDebuggerUrl);await new Promise((r,j)=>{ws.onopen=r;ws.onerror=j;});
 let id=0;const pending=new Map();
 ws.onmessage=e=>{const m=JSON.parse(e.data);if(m.id){pending.get(m.id)?.(m);pending.delete(m.id);}if(m.method==='Runtime.exceptionThrown')errors.push(m.params.exceptionDetails.exception?.description||m.params.exceptionDetails.text);};
 const send=(method,params={})=>new Promise(r=>{const n=++id;pending.set(n,r);ws.send(JSON.stringify({id:n,method,params}));});
 const evaluate=async(expression)=>{const m=await send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});if(m.result.exceptionDetails)throw Error(m.result.exceptionDetails.exception?.description||m.result.exceptionDetails.text);return m.result.result.value;};
 const visit=async(path)=>{await send('Page.navigate',{url:path.startsWith('file:')?path:base+path});for(let i=0;i<70;i++){await sleep(100);if(await evaluate('!!window.__XM_VOICE_JOURNEY__ || !!window.__XM_HERITAGE_EXPERIENCE__'))break;}await sleep(250);};
 const screenshot=async(name)=>{const m=await send('Page.captureScreenshot',{format:'png'});await writeFile(join(root,'shots',name+'.png'),Buffer.from(m.result.data,'base64'));};
 const click=async(selector)=>{await evaluate('document.querySelector('+JSON.stringify(selector)+').scrollIntoView({block:"center"})');await sleep(250);const point=await evaluate('(()=>{const r=document.querySelector('+JSON.stringify(selector)+').getBoundingClientRect();return {x:r.left+r.width/2,y:r.top+r.height/2}})()');await send('Input.dispatchMouseEvent',{type:'mousePressed',...point,button:'left',clickCount:1});await send('Input.dispatchMouseEvent',{type:'mouseReleased',...point,button:'left',clickCount:1});await sleep(200);};
 await send('Runtime.enable');await send('Page.enable');await send('Emulation.setDeviceMetricsOverride',{width:1440,height:1000,deviceScaleFactor:1,mobile:false});

await visit('heritage/index.html');
check(await evaluate('window.__XM_VOICE_JOURNEY__.state().scenes===8'),'总览八个滚动场景');
const jump=async(i,phase=.7)=>{await evaluate('(()=>{const h=document.querySelector(".voice-journey");window.scrollTo({top:scrollY+h.getBoundingClientRect().top-80+(h.offsetHeight-innerHeight+80)*('+i+'+'+phase+')/8,behavior:"instant"});})()');await sleep(500);};
await jump(2);check(await evaluate('window.__XM_VOICE_JOURNEY__.state().active===2'),'滚动切换到侗族');
await screenshot('eight-voices-dong');
await jump(7);check(await evaluate('window.__XM_VOICE_JOURNEY__.state().active===7'),'滚动切换到藏族');await screenshot('eight-voices-gesar');
await jump(0);check(await evaluate('window.__XM_VOICE_JOURNEY__.state().active===0'),'反向滚动恢复首个场景');await screenshot('eight-voices-tianqin');
await evaluate('document.querySelectorAll("[data-stop]")[4].click()');await sleep(1600);check(await evaluate('window.__XM_VOICE_JOURNEY__.state().active===4'),'点击民族导航滚动到苗族');
check(await evaluate('[...document.querySelectorAll(".vs-scene")].filter(e=>!e.inert).length===1'),'只保留当前场景可键盘访问');
const ids=await evaluate('[...document.querySelectorAll(".vs-scene")].map(e=>e.dataset.voice)');
for(const id of ids){await visit('heritage/'+id+'/index.html');check(await evaluate('!!document.querySelector(".hx-experience svg") && document.querySelectorAll(".hx-step").length===3'),id+'独立图形和三段讲解');await evaluate('document.querySelector(".hx-experience").scrollIntoView({block:"start",behavior:"instant"});document.querySelectorAll("[data-part]")[2].click()');await sleep(250);check(await evaluate('window.__XM_HERITAGE_EXPERIENCE__.state().active===2 && document.querySelectorAll("[data-part]")[2].getAttribute("aria-pressed")==="true"'),id+'主动选择第三层');}
await visit('heritage/dong-dage/index.html');await evaluate('document.querySelector(".hx-experience").scrollIntoView({block:"start",behavior:"instant"})');await sleep(500);await screenshot('eight-voices-detail');
for(const width of [390,320]){await send('Emulation.setDeviceMetricsOverride',{width,height:844,deviceScaleFactor:1,mobile:true});await visit('heritage/index.html');await jump(2);check(await evaluate('document.documentElement.scrollWidth<=innerWidth'),width+'px 总览无横向溢出');check(await evaluate('document.querySelector(".vs-sticky").getBoundingClientRect().top>60 && document.querySelector(".vs-sticky").getBoundingClientRect().top<90'),width+'px 画面跟随滚动固定');await screenshot('eight-voices-mobile-'+width);await visit('heritage/dong-dage/index.html');await evaluate('document.querySelector(".hx-experience").scrollIntoView({block:"start",behavior:"instant"})');await sleep(400);check(await evaluate('document.documentElement.scrollWidth<=innerWidth'),width+'px 详情无横向溢出');await screenshot('eight-voices-detail-mobile-'+width);}
await send('Emulation.setDeviceMetricsOverride',{width:320,height:568,deviceScaleFactor:1,mobile:true});await visit('heritage/index.html');await jump(2);check(await evaluate('document.querySelector(".vs-rail").getBoundingClientRect().bottom<=innerHeight && document.querySelector(".vs-link").getBoundingClientRect().bottom<=innerHeight'),'小屏320×568px导航及档案入口可见');await screenshot('eight-voices-small-phone');
await send('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:'reduce'}]});await visit('heritage/index.html');check(await evaluate('[...document.querySelectorAll(".vs-scene")].every(e=>e.getAttribute("aria-hidden")==="false" && !e.inert)'),'减少动态时八个场景可直接阅读');
await send('Emulation.setDeviceMetricsOverride',{width:1440,height:1000,deviceScaleFactor:1,mobile:false});await send('Emulation.setEmulatedMedia',{features:[]});await visit(pathToFileURL(join(root,'heritage/index.html')).href);check(await evaluate('window.__XM_VOICE_JOURNEY__.state().scenes===8'),'本地双击 file:// 长卷可用');
check(errors.length===0,'无浏览器脚本异常');console.log(errors);console.log('Voice journey failures: '+failures);
}catch(e){check(false,e.stack||e.message);}finally{ws?.close();browser.kill();server.close();}
process.exit(failures?1:0);