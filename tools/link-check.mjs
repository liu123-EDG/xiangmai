/* ==========================================================================
   死链检查
   --------------------------------------------------------------------------
   站内所有 href / src 指向的本地文件必须真实存在。
   这类错误很隐蔽：页面看着正常，点下去才 404。
   （踩过一次：改了目录名，导航里一处漏改，底部链接直接打不开。）

   用法：node tools/link-check.mjs
   ========================================================================== */
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve, dirname as dn } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

/** 全站页面。加了新页记得加到这里 ——
    注意：漏加就等于这一页**从没被检查过**，
    而输出仍然显示"无死链"，很容易误以为都验过了（踩过：
    welcome 和 game 两页一直不在列表里）。 */
const PAGES = [
  'welcome/index.html',
  'index.html',
  'qiongnaieman/index.html',
  'dastan/index.html',
  'mashrap/index.html',
  'lishi/index.html',
  'fulu/index.html',
  'game/index.html',
];

let fails = 0;
const ok = (m) => console.log('  ok   ' + m);
const bad = (m) => { fails++; console.log('  FAIL ' + m); };
const note = (m) => console.log('  --   ' + m);

console.log('\n[死链检查]');

const ATTR = /(?:href|src)\s*=\s*"([^"]+)"/g;

for (const page of PAGES) {
  const abs = join(root, page);
  if (!existsSync(abs)) { bad('页面不存在：' + page); continue; }
  const html = readFileSync(abs, 'utf8');
  const from = dn(abs);
  const seen = new Set();
  let placeholders = 0;

  console.log('\n  ' + page);
  for (const m of html.matchAll(ATTR)) {
    const url = m[1];
    // 跳过：锚点、协议外链、data:
    if (/^(#|https?:|mailto:|data:|javascript:)/.test(url)) continue;
    // 运行时由 JS 生成的分页面目录（还没建，属设计内）
    if (/^(\.\.\/)?(muqam|heritage)\//.test(url)) continue;
    if (seen.has(url)) continue;
    seen.add(url);

    const clean = url.split('#')[0].split('?')[0];
    if (!clean) continue;
    const target = resolve(from, clean);
    if (existsSync(target)) {
      ok(url);
    } else if (clean.indexOf('assets/img/') >= 0) {
      // 图片槽：缺图是设计内的 —— figure.slot 会退回占位样式，版面不变形。
      // 这类只提示，不算失败，否则每加一个槽位都要先有图才能过检查。
      placeholders++;
      note('待补图片（占位生效，不算失败）：' + url);
    } else {
      bad(url + '  →  找不到 ' + target.replace(root + '\\', '').replace(root + '/', ''));
    }
  }
  if (placeholders) note('本页共 ' + placeholders + ' 个待补图片槽');
}

/* 导航承诺：site.js 里列出的每一章，文件必须真的在 */
console.log('\n  [导航承诺]');
const siteSrc = readFileSync(join(root, 'js/lib/site.js'), 'utf8');
const navBlock = siteSrc.match(/export const NAV = \[([\s\S]*?)\n\];/);
if (!navBlock) {
  bad('读不到 site.js 里的 NAV 定义');
} else {
  const entries = [...navBlock[1].matchAll(/id:\s*'([^']+)'[\s\S]*?href:\s*'([^']+)'/g)];
  if (!entries.length) bad('NAV 里没解析出条目');
  for (const [, id, href] of entries) {
    if (existsSync(join(root, href))) ok(id + ' → ' + href);
    else bad('导航里的「' + id + '」指向 ' + href + '，但文件不存在');
  }
}

console.log('');
console.log(fails ? '✗ ' + fails + ' 项未通过\n' : '✓ 无死链\n');
process.exit(fails ? 1 : 0);
