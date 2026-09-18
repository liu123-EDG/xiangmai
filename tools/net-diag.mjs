/* 诊断到 GitHub 的网络：是 DNS、是端口、还是丢包。
   量清楚才知道该换 SSH、换代理，还是只能重试。 */
import { execFileSync } from 'node:child_process';
import { createConnection } from 'node:net';
import { lookup } from 'node:dns/promises';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

console.log('\n════════ GitHub 连通性诊断 ════════\n');

/* ① DNS 解析 */
console.log('① DNS');
for (const h of ['github.com', 'codeload.github.com', 'ssh.github.com']) {
  try {
    const r = await lookup(h, { all: true });
    console.log('   ' + h.padEnd(24) + r.map((x) => x.address).join(', '));
  } catch (e) {
    console.log('   ' + h.padEnd(24) + '解析失败：' + e.code);
  }
}

/* ② 端口连通性和握手耗时 —— 这是关键。
      git push 走 443（HTTPS）或 22/443（SSH）。
      连不上就是连不上，重试再多次也没用；间歇性通才是重试能救的。 */
function tryConnect(host, port, timeout = 6000) {
  return new Promise((resolve) => {
    const t0 = Date.now();
    const s = createConnection({ host, port });
    let done = false;
    const fin = (ok, note) => {
      if (done) return;
      done = true;
      try { s.destroy(); } catch {}
      resolve({ ok, ms: Date.now() - t0, note });
    };
    s.setTimeout(timeout);
    s.on('connect', () => fin(true, ''));
    s.on('timeout', () => fin(false, '超时'));
    s.on('error', (e) => fin(false, e.code || e.message));
  });
}

console.log('\n② 端口（每个测 3 次，看是"全不通"还是"间歇性"）');
const targets = [
  ['github.com', 443, 'HTTPS push'],
  ['github.com', 22, 'SSH'],
  ['ssh.github.com', 443, 'SSH over 443'],
];
for (const [h, p, label] of targets) {
  const rs = [];
  for (let i = 0; i < 3; i++) { rs.push(await tryConnect(h, p)); await sleep(200); }
  const okN = rs.filter((r) => r.ok).length;
  const times = rs.filter((r) => r.ok).map((r) => r.ms);
  console.log('   ' + (h + ':' + p).padEnd(24) + label.padEnd(16) +
    okN + '/3 通' +
    (times.length ? '   耗时 ' + times.join('/') + 'ms' : '   ' + (rs[0].note || '')));
}

/* ③ 当前 git 配置里和网络有关的项 */
console.log('\n③ git 配置');
const want = ['http.postBuffer', 'http.lowSpeedLimit', 'http.lowSpeedTime',
  'remote.origin.url', 'http.proxy', 'https.proxy', 'core.compression'];
for (const k of want) {
  let v = '';
  try { v = execFileSync('git', ['config', '--get', k], { cwd: 'D:/dsh/xiangmai' }).toString().trim(); } catch {}
  console.log('   ' + k.padEnd(24) + (v || '（未设置）'));
}

console.log('\n④ 仓库大小');
for (const args of [['count-objects', '-vH'], ['rev-list', '--count', '--objects', '--all']]) {
  try {
    const o = execFileSync('git', args, { cwd: 'D:/dsh/xiangmai' }).toString().trim();
    console.log('   ' + args[0] + (args[1] ? ' ' + args[1] : '') + ':\n     ' + o.split('\n').join('\n     '));
  } catch {}
}

/* ⑤ 待推送的量 —— 大文件是推送慢/超时的常见原因 */
console.log('\n⑤ 待推送的提交与体积');
try {
  const log = execFileSync('git', ['log', '--oneline', 'origin/main..HEAD'],
    { cwd: 'D:/dsh/xiangmai' }).toString().trim();
  console.log('   ' + (log ? log.split('\n').join('\n   ') : '（没有待推送的提交）'));
} catch (e) { console.log('   读取失败'); }

console.log('');
