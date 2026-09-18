/* ==========================================================================
   一键推送
   --------------------------------------------------------------------------
   为什么要脚本：这台机器到 github.com 的 **443 端口是通的假象** ——
   实际上 HTTPS 会超时，只有 22 端口（SSH）稳定。
   所以远程地址用 SSH；这个脚本再做两件事：

     ① 推送前先确认 SSH 认证正常，不通就直接说清楚，
        而不是让 git 抛一堆 fatal: Could not read from remote repository
     ② 失败时退避重试（网络偶尔抽风，但 22 端口基本稳）

   用法： node tools/push.mjs  ["提交信息"]
   带提交信息时会先 git add -A + commit，再推。
   ========================================================================== */
import { execFileSync, execSync } from 'node:child_process';

const cwd = new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
const msg = process.argv.slice(2).join(' ').trim();

const run = (args, opts = {}) =>
  execFileSync(args[0], args.slice(1), {
    cwd, encoding: 'utf8', stdio: opts.quiet ? 'pipe' : 'inherit', ...opts,
  });

const out = (args) => {
  try { return execFileSync(args[0], args.slice(1), { cwd, encoding: 'utf8' }).trim(); }
  catch { return ''; }
};

console.log('\n──── 推送 ────\n');

/* ① 远程必须是 SSH。HTTPS 在这台机器上必然超时。 */
const url = out(['git', 'remote', 'get-url', 'origin']);
if (!/^git@/.test(url)) {
  console.log('  ✗ 远程地址不是 SSH：' + url);
  console.log('    这台机器到 github.com:443 不通，必须走 SSH。修复：');
  console.log('      git remote set-url origin git@github.com:liu123-EDG/xiangmai.git');
  process.exit(1);
}
console.log('  远程  ' + url);

/* ② 先验 SSH 认证。不通就别浪费时间重试推送了。 */
try {
  const r = execSync('ssh -o BatchMode=yes -o ConnectTimeout=12 -T git@github.com 2>&1',
    { encoding: 'utf8' });
  console.log('  SSH   ' + (r.trim().split('\n')[0] || 'ok'));
} catch (e) {
  const text = String((e.stdout || '') + (e.stderr || ''));
  if (/successfully authenticated/.test(text)) {
    console.log('  SSH   已认证');
  } else {
    console.log('  ✗ SSH 认证失败：' + text.trim().split('\n')[0]);
    console.log('    检查 https://github.com/settings/keys');
    console.log('    应有指纹 SHA256:ykx5ETvTRkDVhsxDdJJROJl6xnex2S+bS7h7ljjgjZE 的 Authentication key');
    process.exit(1);
  }
}

/* ③ 有提交信息就先提交 */
if (msg) {
  run(['git', 'add', '-A']);
  const staged = out(['git', 'diff', '--cached', '--name-only']);
  if (staged) {
    run(['git', 'commit', '-q', '-m', msg]);
    console.log('  提交  ' + msg);
  } else {
    console.log('  提交  （没有改动，跳过）');
  }
}

/* ④ 还没推的提交 */
const ahead = out(['git', 'log', '--oneline', 'origin/main..HEAD']);
if (!ahead) {
  console.log('\n  ✓ 已是最新，无需推送\n');
  process.exit(0);
}
console.log('  待推  ' + ahead.split('\n').length + ' 个提交');

/* ⑤ 推送 + 退避重试 */
const t0 = Date.now();
let ok = false;
for (let i = 1; i <= 6; i++) {
  try {
    execFileSync('git', ['push', 'origin', 'main'], { cwd, stdio: 'pipe', encoding: 'utf8' });
    ok = true;
    break;
  } catch (e) {
    const text = String((e.stdout || '') + (e.stderr || ''));
    if (/everything up-to-date/i.test(text)) { ok = true; break; }
    console.log('  第 ' + i + ' 次失败：' + (text.trim().split('\n').pop() || '').slice(0, 90));
    if (i < 6) execSync('node -e "setTimeout(()=>{}, ' + (i * 3000) + ')"');
  }
}

if (!ok) {
  console.log('\n  ✗ 推送失败（试了 6 次）\n');
  process.exit(1);
}

const secs = ((Date.now() - t0) / 1000).toFixed(1);
const head = out(['git', 'rev-parse', 'HEAD']).slice(0, 7);
const remote = out(['git', 'rev-parse', 'origin/main']).slice(0, 7);
console.log('\n  ✓ 推送成功  ' + secs + ' 秒   ' + head + ' → ' + remote);
if (head !== remote) console.log('  ⚠ 本地与远端不一致，请再跑一次');
console.log('');
