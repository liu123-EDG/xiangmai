/* ==========================================================================
   本地预览服务器
   --------------------------------------------------------------------------
   为什么需要它：file:// 是"这台电脑的本地文件"，手机上没有 D 盘，
   所以 file:///D:/... 的链接在手机上永远打不开。
   要在手机上看，必须走 http:// 局域网地址。

   用法：node tools/serve.mjs [端口]
   然后手机连同一个 WiFi，访问 http://<本机IP>:<端口>/

   绑 0.0.0.0 而不是 127.0.0.1 —— 只绑回环的话手机连不进来。
   ========================================================================== */
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join, extname, normalize } from 'node:path';
import { networkInterfaces } from 'node:os';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const PORT = Number(process.argv[2]) || 8080;

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.png': 'image/png', '.webp': 'image/webp',
  '.woff2': 'font/woff2', '.ico': 'image/x-icon',
};

const server = createServer(async (req, res) => {
  try {
    let p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    if (p.endsWith('/')) p += 'index.html';
    // 防目录穿越
    const file = join(root, normalize(p).replace(/^(\.\.[/\\])+/, ''));
    if (!file.startsWith(root)) { res.writeHead(403); res.end('403'); return; }

    const st = await stat(file);
    if (st.isDirectory()) {
      res.writeHead(302, { location: p + '/' });
      res.end();
      return;
    }
    const body = await readFile(file);
    res.writeHead(200, {
      'content-type': MIME[extname(file).toLowerCase()] || 'application/octet-stream',
      'cache-control': 'no-cache',      // 改了源码刷新就能看到，免得手机缓存误导
    });
    res.end(body);
  } catch {
    res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
    res.end('404');
  }
});

server.listen(PORT, '0.0.0.0', () => {
  const ips = [];
  const nets = networkInterfaces();
  for (const name of Object.keys(nets)) {
    for (const n of nets[name] || []) {
      if (n.family === 'IPv4' && !n.internal) ips.push(n.address);
    }
  }
  console.log('');
  console.log('  弦脉 · 本地预览已启动');
  console.log('');
  console.log('  本机：      http://127.0.0.1:' + PORT + '/');
  ips.forEach((ip) => {
    console.log('  手机访问：  http://' + ip + ':' + PORT + '/');
  });
  if (!ips.length) console.log('  （没找到局域网 IP，检查一下有没有连上 WiFi）');
  console.log('');
  console.log('  手机需要和这台电脑连同一个 WiFi。');
  console.log('  停止：Ctrl+C');
  console.log('');
});
