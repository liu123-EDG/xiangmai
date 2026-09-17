/* ==========================================================================
   弦脉 · 打包
   --------------------------------------------------------------------------
   为什么需要这一步：

   浏览器对 file:// 下的 ES module 一律按 CORS 处理并拒绝执行
   （origin 为 null）。只要用了 <script type="module">，
   **双击打开 index.html 就是一片空白** —— 材质不烘焙、交互不初始化。

   所以这里把 module 依赖图合并成**一个普通脚本**，页面用 <script src> 加载，
   file:// 与 http:// 都能跑。源码保持模块化，lib/ 里的东西被各章复用。

   —— 合并方式 ——
   每个模块包一层同名函数，导出登记成"闭包函数"而非值：

     function __M3__() {
       ...模块原样body...
       __ns3.mountShell = function () { return mountShell; };   // 闭包，不是值
     }
     __M3__();  __XM[3] = __ns3;      // 执行完这个模块才轮到下一个

   三条经验，都是踩出来的：
     1) 不要用 this 传作用域 —— 产物外层是严格模式，无接收者的调用里 this 是 undefined。
     2) 不要用 getter 做导入绑定 —— 绑定要在模块体最前面就存在，
        而模块体里常有立即执行的启动代码（boot()），它会在末尾登记之前就用到这些名字。
     3) 用闭包函数而不是直接赋值 —— 赋值是快照，闭包在"取的时候"才求值，
        依赖顺序怎么写都不会拿到 undefined。
   ========================================================================== */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join, resolve, relative } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

/** 每个页面入口 → 产物路径 */
const PAGES = [
  { entry: 'js/pages/home.js', out: 'js/dist/home.js' },
  { entry: 'js/pages/qiongnaieman.js', out: 'js/dist/qiongnaieman.js' },
  { entry: 'js/pages/dastan.js', out: 'js/dist/dastan.js' },
  { entry: 'js/pages/mashrap.js', out: 'js/dist/mashrap.js' },
  { entry: 'js/pages/lishi.js', out: 'js/dist/lishi.js' },
  { entry: 'js/pages/fulu.js', out: 'js/dist/fulu.js' },
];

const IMPORT_RE = /^[ \t]*import\s+(?:([\s\S]*?)\s+from\s+)?['"]([^'"]+)['"][ \t]*;?[ \t]*$/gm;

function stripImports(code) {
  return code.replace(
    /^[ \t]*import\s+(?:[\s\S]*?\s+from\s+)?['"][^'"]+['"][ \t]*;?[ \t]*$/gm,
    ''
  );
}

/** export { ... } 可能跨行，所以用 [\s\S] */
function stripExports(code) {
  return code
    .replace(/^[ \t]*export\s+default\s+/gm, 'const __default__ = ')
    .replace(/^[ \t]*export\s*\{[\s\S]*?\}[ \t]*;?/gm, '')
    .replace(/^[ \t]*export\s+(const|let|var|function|class|async)\s/gm, '$1 ');
}

function parseExports(code) {
  const out = [];
  for (const m of code.matchAll(/^[ \t]*export\s+(?:const|let|var|function|class|async\s+function)\s+([A-Za-z_$][\w$]*)/gm)) {
    out.push({ local: m[1], exported: m[1] });
  }
  for (const m of code.matchAll(/^[ \t]*export\s*\{([\s\S]*?)\}[ \t]*;?/gm)) {
    m[1].split(',').forEach((part) => {
      const t = part.trim();
      if (!t) return;
      const mm = t.match(/^([A-Za-z_$][\w$]*)(?:\s+as\s+([A-Za-z_$][\w$]*))?$/);
      if (mm) out.push({ local: mm[1], exported: mm[2] || mm[1] });
    });
  }
  return out;
}

function parseImports(code) {
  const out = [];
  for (const m of code.matchAll(IMPORT_RE)) {
    const clause = (m[1] || '').trim();
    const source = m[2];
    if (!clause) continue;
    const names = [];
    const braces = clause.match(/\{([\s\S]*)\}/);
    if (braces) {
      braces[1].split(',').forEach((part) => {
        const t = part.trim();
        if (!t) return;
        const mm = t.match(/^([A-Za-z_$][\w$]*)(?:\s+as\s+([A-Za-z_$][\w$]*))?$/);
        if (mm) names.push({ imported: mm[1], local: mm[2] || mm[1] });
      });
    }
    out.push({ source, names });
  }
  return out;
}

/** 按拓扑序收集：被依赖者先入列 */
function collect(entry, seen = new Set(), out = []) {
  const abs = resolve(root, entry);
  if (seen.has(abs)) return out;
  seen.add(abs);

  if (!existsSync(abs)) throw new Error('找不到模块：' + entry);
  const src = readFileSync(abs, 'utf8');

  for (const m of src.matchAll(IMPORT_RE)) {
    const spec = m[2];                               // m[1] 是子句，m[2] 才是路径
    if (!spec.startsWith('.')) continue;
    const dep = relative(root, resolve(dirname(abs), spec)).replace(/\\/g, '/');
    collect(dep, seen, out);
  }
  out.push({ file: relative(root, abs).replace(/\\/g, '/'), src });
  return out;
}

/** 把一组模块合并成一个普通脚本 */
export function bundle(entry) {
  const mods = collect(entry);
  const idOf = new Map(mods.map((m, i) => [m.file, i]));

  const parts = mods.map((m, i) => {
    const imps = parseImports(m.src);
    const exps = parseExports(m.src);

    // 导入绑定：模块体最前面的普通局部变量，值来自注册表的闭包
    const bound = new Set();
    const decls = [];
    imps.forEach((imp) => {
      if (!imp.source.startsWith('.')) return;
      const depFile = relative(root, resolve(dirname(resolve(root, m.file)), imp.source)).replace(/\\/g, '/');
      const depIndex = idOf.get(depFile);
      if (depIndex === undefined) return;
      imp.names.forEach((n) => {
        if (bound.has(n.local)) return;
        bound.add(n.local);
        decls.push('var ' + n.local + ' = __XM[' + depIndex + '][' + JSON.stringify(n.imported) + '];');
      });
    });

    // 导出：闭包函数，取的时候才求值（不是快照）
    const assigns = exps
      .filter((e) => !bound.has(e.local))
      .map((e) => '__ns.mount_' + e.exported + ' = function () { return ' + e.local + '; };')
      .join('\n');

    const body = stripExports(stripImports(m.src)).trim();

    return '/* ── ' + m.file + ' ── */\n' +
      'function __M' + i + '__() {\n' +
      (decls.length ? decls.join('\n') + '\n\n' : '') +
      body +
      (assigns ? '\n\n__ns = __XM[' + i + '];\n' + assigns : '') +
      '\n}';
  });

  /* 启动：每个模块先执行，再把它的导出"解包"成 __XM 上的普通属性。
     单独一段启动代码，而不是塞在模块函数里 —— 这样"先跑完依赖、再跑下一个"
     的次序在产物里一眼可见。 */
  const inits = mods.map((m, i) =>
    '/* ' + m.file + ' */\n' +
    'try {\n' +
    '  __ns = __XM[' + i + '];\n' +
    '  __M' + i + '__();\n' +
    '  for (var k in __XM[' + i + ']) { if (k.indexOf("mount_") === 0) __XM[' + i + '][k.slice(6)] = __XM[' + i + '][k](); }\n' +
    '} catch (e) {\n' +
    '  (window.__XM_BOOT_ERR__ = window.__XM_BOOT_ERR__ || []).push(' + JSON.stringify(m.file) +
    ' + " :: " + (e && e.stack || e));\n' +
    '}'
  ).join('\n\n');

  const banner =
    '/* 由 tools/build.mjs 生成，请勿直接编辑。改源码后运行 node tools/build.mjs\n' +
    '   本页模块（依依赖序）：\n' +
    mods.map((m) => {
      const exps = parseExports(m.src).map((e) => e.exported);
      return '     ' + m.file + (exps.length ? '  → ' + exps.join(', ') : '');
    }).join('\n') + '\n*/\n';

  return banner + '(function () {\n"use strict";\n\n' +
    'var __XM = [];\nvar __ns = null;\n' +
    mods.map((m, i) => '__XM[' + i + '] = {};').join('\n') + '\n\n' +
    parts.join('\n\n') + '\n\n' +
    inits + '\n})();\n';
}

function buildOne({ entry, out }) {
  const code = bundle(entry);
  const outAbs = join(root, out);
  mkdirSync(dirname(outAbs), { recursive: true });

  const checkOnly = process.argv.includes('--check');
  const prev = existsSync(outAbs) ? readFileSync(outAbs, 'utf8') : null;

  if (checkOnly) {
    const same = prev === code;
    console.log((same ? '  ok   ' : '  FAIL ') + out +
      (same ? ' 已是最新' : ' 与源码不一致，请运行 node tools/build.mjs'));
    return same;
  }

  writeFileSync(outAbs, code, 'utf8');
  const changed = prev !== code;
  const n = (code.match(/^function __M\d+__\(/gm) || []).length;
  console.log('  ' + (changed ? '✓' : '·') + ' ' + out +
    '  ← ' + n + ' 个模块，' + Math.round(code.length / 1024) + ' KB' +
    (changed ? '' : '（内容未变）'));
  return true;
}

/* 直接运行时才打包；被 import 时只提供 bundle()。
   用 pathToFileURL 而不是手工拼 'file:///' —— Windows 盘符路径手工拼的 URL
   永远对不上，会让这个判断恒为假、构建静默不执行（踩过一次）。 */
if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  console.log('\n[打包]');
  let allOk = true;
  for (const p of PAGES) {
    try {
      if (!buildOne(p)) allOk = false;
    } catch (e) {
      console.error('  FAIL ' + p.entry + '：' + e.message);
      allOk = false;
    }
  }
  console.log('');
  process.exit(allOk ? 0 : 1);
}
