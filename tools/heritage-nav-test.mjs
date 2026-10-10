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
 const click=async(selector)=>{await evaluate('document.querySelector('+JSON.stringify(selector)+').scrollIntoView({block:"center",behavior:"instant"})');await sleep(250);const point=await evaluate('(()=>{const r=document.querySelector('+JSON.stringify(selector)+').getBoundingClientRect();return {x:r.left+r.width/2,y:r.top+r.height/2}})()');await send('Input.dispatchMouseEvent',{type:'mousePressed',...point,button:'left',clickCount:1});await send('Input.dispatchMouseEvent',{type:'mouseReleased',...point,button:'left',clickCount:1});await sleep(200);};
 await send('Runtime.enable');await send('Page.enable');await send('Emulation.setDeviceMetricsOverride',{width:1440,height:1000,deviceScaleFactor:1,mobile:false});


const ids=['zhuang-tianqin','mongol-morinhuur','dong-dage','manchu-xinchengxi','miao-guge','yi-shan-ge','dai-zhangha','tibetan-gesar'];
for(const id of ids){await visit('heritage/'+id+'/index.html');await evaluate('localStorage.setItem("xiangmai.unlocked.mashrap","1")');
const links=await evaluate('[...document.querySelectorAll(".topbar a[href],.chapter-nav a[href],.h-back a[href]")].map(a=>({label:a.innerText,url:a.href}))');
let failed=[];for(const link of links){const r=await fetch(link.url);if(r.status!==200)failed.push(link.label+" "+r.status+" "+link.url);}check(failed.length===0,id+' 顶部、底部与返回链接全部200');if(failed.length)console.log(failed);
check(await evaluate('document.querySelector(".cbtn--next").href.endsWith("/heritage/index.html")'),'下一章指向正确总览');}
await visit('heritage/mongol-morinhuur/index.html');await click('.cbtn--next');await sleep(1000);console.log(await evaluate('({url:location.href,hub:!!window.__XM_HUB__})'));check(await evaluate('location.pathname.endsWith("/heritage/index.html") && !!window.__XM_HUB__'),'真实点击马头琴右下角下一章打开总览');check(errors.length===0,'无脚本异常');
}catch(e){check(false,e.stack||e.message);}finally{ws?.close();browser.kill();server.close();}
process.exit(failures?1:0);