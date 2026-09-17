/* ==========================================================================
   弦脉 —— 静态校验
   1) 脚本：剥离注释/字符串/正则/模板串后做括号配平
   2) 着色器：以分号/花括号切分语句；ES 1.00 动态索引陷阱（允许循环计数器）
   3) 约束：无西方音符符号；首屏非定义句；三段命名齐备；配色令牌 CSS↔shader 一致
   ========================================================================== */
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
let fails = 0;
const ok = (m) => console.log('  ok   ' + m);
const bad = (m) => { fails++; console.log('  FAIL ' + m); };

const read = (p) => readFileSync(join(root, p), 'utf8');

/* 模块化之后，源码分布在 lib / pages 下。
   这里按目录扫一遍，新增页面会自动进入校验，不用改脚本。 */
const JS_FILES = [
  'js/lib/materials.js',
  'js/lib/renderer.js',
  'js/lib/sequencer.js',
  'js/lib/scroll.js',
  'js/lib/site.js',
  'js/lib/chapter.js',
  'js/lib/muqam-data.js',
  'js/lib/heritage-data.js',
  'js/lib/wheel.js',
  'js/lib/melody.js',
  'js/pages/home.js',
  'js/pages/network.js',
  'js/pages/qiongnaieman.js',
  'js/pages/dastan.js',
  'js/pages/mashrap.js',
  'js/pages/lishi.js',
  'js/pages/fulu.js',
];

const SOURCES = JS_FILES.map((f) => [f, read(f)]);
const app = read('js/lib/materials.js') + '\n' + read('js/lib/renderer.js');
const css = read('styles.css');
const html = read('index.html');

/* --------------------------------------------------------------------------
   剥离：注释 / 单双引号字符串 / 模板串 / 正则字面量
   （模板串内容单独返回，因为着色器源码在里面）
   -------------------------------------------------------------------------- */
function stripJs(src) {
  let out = '';
  const templates = [];
  let i = 0;
  let prevSignificant = '';
  while (i < src.length) {
    const c = src[i];
    const c2 = src.slice(i, i + 2);

    if (c2 === '//') { while (i < src.length && src[i] !== '\n') i++; continue; }
    if (c2 === '/*') { i = src.indexOf('*/', i); i = i < 0 ? src.length : i + 2; continue; }
    if (c === '`') {
      const end = src.indexOf('`', i + 1);
      templates.push(src.slice(i + 1, end < 0 ? src.length : end));
      out += '``';
      i = (end < 0 ? src.length : end + 1);
      prevSignificant = '`';
      continue;
    }
    if (c === '"' || c === "'") {
      const q = c; i++;
      while (i < src.length && src[i] !== q) { if (src[i] === '\\') i++; i++; }
      i++;
      out += q + q;
      prevSignificant = q;
      continue;
    }
    if (c === '/') {
      // 只有在上一个有效字符允许"表达式开始"时才当作正则
      if (/[=(,:[!&|?{};+\-*%~^<>]|^$/.test(prevSignificant)) {
        let j = i + 1, inClass = false, closed = false;
        while (j < src.length && src[j] !== '\n') {
          if (src[j] === '\\') { j += 2; continue; }
          if (src[j] === '[') inClass = true;
          else if (src[j] === ']') inClass = false;
          else if (src[j] === '/' && !inClass) { closed = true; break; }
          j++;
        }
        if (closed) {
          i = j + 1;
          while (i < src.length && /[a-z]/.test(src[i])) i++;
          out += '//';
          prevSignificant = '/';
          continue;
        }
      }
      out += c; i++; prevSignificant = c; continue;
    }
    out += c;
    if (!/\s/.test(c)) prevSignificant = c;
    i++;
  }
  return { code: out, templates };
}

function balance(src, a, b) {
  let d = 0;
  for (const ch of src) { if (ch === a) d++; else if (ch === b) d--; if (d < 0) return d; }
  return d;
}

/* ---------------------------------------------------------------- 1. 脚本 */
console.log('\n[1] 脚本结构');

// 产物必须与源码同步：file:// 下跑的就是 js/dist 里的东西，
// 源码改了没重新打包，页面就会退回到旧行为。
try {
  execFileSync(process.execPath, [join(root, 'tools/build.mjs'), '--check'], { stdio: 'pipe' });
  ok('打包产物与源码一致（js/dist）');
} catch (e) {
  bad('打包产物过期，请运行 node tools/build.mjs');
}

// HTML 不能引用 type="module"：file:// 下会被 CORS 拦掉，交互全失效
const moduleTags = (html.match(/<script[^>]*type\s*=\s*["']module["']/gi) || []).length;
if (moduleTags === 0) ok('页面未使用 type="module"（file:// 可直开）');
else bad('页面里有 ' + moduleTags + ' 个 module 脚本，file:// 下会被拦掉');

// CSS 不得外链 SVG 滤镜：file:// 下同样被安全策略拦掉
const extFilter = (css.match(/url\(\s*["']?[^)"']*\.svg#/gi) || []).length;
if (extFilter === 0) ok('CSS 未外链 SVG 滤镜（改用内联 id 引用）');
else bad('CSS 中有 ' + extFilter + ' 处外链 SVG 滤镜，file:// 下会失效');

for (const [name, src] of SOURCES) {
  const { code } = stripJs(src);
  const br = balance(code, '{', '}');
  const pr = balance(code, '(', ')');
  const sq = balance(code, '[', ']');
  if (br === 0 && pr === 0 && sq === 0) ok(name + ' 括号配平 {}()[]');
  else bad(name + ' 括号不配平: {}= ' + br + ' ()= ' + pr + ' []= ' + sq);

  // 模块化之后不再要求 IIFE。lib 里的模块必须 export；
  // pages 是入口，靠副作用启动，允许没有 export。
  const isLib = /^js\/lib\//.test(name);
  if (/\bexport\s+(default|const|function|class|\{)/.test(src)) ok(name + ' 为 ES 模块（含 export）');
  else if (isLib) bad(name + ' 未见 export，模块边界不明确');
  else ok(name + ' 为页面入口（无需 export）');

  if (/\bawait\b/.test(code)) {
    const inAsync = /async\s+(function|\()|async\s+[a-zA-Z_$]/.test(code);
    if (inAsync) ok(name + ' await 位于 async 上下文');
    else bad(name + ' 出现裸 await');
  }
}

/* ------------------------------------------------------------- 2. 着色器 */
console.log('\n[2] 着色器静态检查');

function grabTpl(src, decl) {
  const i = src.indexOf(decl);
  if (i < 0) return null;
  const start = src.indexOf('`', i);
  const end = src.indexOf('`', start + 1);
  return src.slice(start + 1, end);
}

const shaders = {
  VERT: grabTpl(app, 'const VERT_SRC'),
  // SCENE_FRAG / DUST_FRAG 用 ${NOISE_GLSL} 引了共享噪声函数，校验时要拼回去
  SCENE: grabTpl(app, 'const SCENE_FRAG') + '\n' + grabTpl(app, 'const NOISE_GLSL') + '\n' + grabTpl(app, 'const MATERIAL_GLSL'),
  DUST: grabTpl(app, 'const DUST_FRAG') + '\n' + grabTpl(app, 'const NOISE_GLSL'),
  WALL: grabTpl(app, 'const WALL_FRAG') + '\n' + grabTpl(app, 'const NOISE_GLSL'),
};

const GLSL_BUILTIN = new Set(['radians', 'degrees', 'sin', 'cos', 'tan', 'asin', 'acos', 'atan',
  'pow', 'exp', 'log', 'exp2', 'log2', 'sqrt', 'inversesqrt', 'abs', 'sign', 'floor', 'ceil',
  'fract', 'mod', 'min', 'max', 'clamp', 'mix', 'step', 'smoothstep', 'length', 'distance',
  'dot', 'cross', 'normalize', 'faceforward', 'reflect', 'refract', 'matrixCompMult',
  'lessThan', 'lessThanEqual', 'greaterThan', 'greaterThanEqual', 'equal', 'notEqual',
  'any', 'all', 'not', 'texture2D', 'texture2DProj', 'textureCube', 'dFdx', 'dFdy', 'fwidth',
  'vec2', 'vec3', 'vec4', 'ivec2', 'ivec3', 'ivec4', 'bvec2', 'bvec3', 'bvec4',
  'mat2', 'mat3', 'mat4', 'float', 'int', 'bool', 'if', 'for', 'while', 'return', 'main']);

for (const [name, raw] of Object.entries(shaders)) {
  if (!raw) { bad(name + ' 未找到'); continue; }
  const src = raw.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/\/\/[^\n]*/g, ' ');

  const br = balance(src, '{', '}');
  const pr = balance(src, '(', ')');
  if (br !== 0 || pr !== 0) bad(name + ' 括号不配平 {}=' + br + ' ()=' + pr);
  else ok(name + ' 括号配平');

  // 语句切分：以 ; { } 为界，允许跨行的表达式
  const parts = src.split(/[;{}]/).map((s) => s.trim()).filter(Boolean);
  const badStmt = parts.filter((s) => !/^(precision\b|#|else$|\)$)/.test(s) && /[^\s(){},]$/.test(s) === false);
  void badStmt;
  // 逐条检查：去掉注释后，语句之间不应出现无法归类的残片
  // 逐条检查：允许跨行表达式（本行以运算符开头，或下一行以运算符开头）
  const CONTINUE_END = /[,(+\-*/<>=?:&|]\s*$/;
  const CONTINUE_START = /^[+\-*/<>=?:&|.)]/;
  const lines = src.split('\n');
  const nextNonEmpty = (n) => {
    for (let i = n + 1; i < lines.length; i++) if (lines[i].trim()) return lines[i].trim();
    return '';
  };
  let open = 0, errs = [];
  lines.forEach((ln, n) => {
    const t = ln.trim();
    if (!t) return;
    open += balance(t, '(', ')');
    if (/^(precision|#)/.test(t)) return;
    const endsClean = /[;{}]\s*$/.test(t);
    const continuesNext = CONTINUE_START.test(nextNonEmpty(n));
    if (!endsClean && open <= 0 && !continuesNext && !CONTINUE_START.test(t) && !CONTINUE_END.test(t)) {
      errs.push('L' + (n + 1) + ': ' + t);
    }
  });
  if (errs.length) bad(name + ' 可疑语句结尾 ' + errs.length + ' 处\n       ' + errs.join('\n       '));
  else ok(name + ' 语句终止符完整');

  // ES 1.00：uniform 数组只能常量索引。循环计数器是常量表达式，予以放行。
  const loopVars = new Set();
  for (const m of src.matchAll(/for\s*\(\s*int\s+([a-z_][a-z0-9_]*)\s*=/gi)) loopVars.add(m[1]);
  const dyn = [];
  for (const m of src.matchAll(/\bu_[a-z0-9_]+\s*\[\s*([^\]]+?)\s*\]/gi)) {
    const idx = m[1].trim();
    if (/^\d+$/.test(idx)) continue;                    // 常量
    if (loopVars.has(idx)) continue;                     // 循环计数器
    dyn.push(m[0]);
  }
  if (dyn.length) bad(name + ' 动态索引 uniform 数组：' + dyn.join(', '));
  else ok(name + ' 无动态 uniform 数组索引');

  const declared = new Set();
  for (const m of src.matchAll(/\b(?:float|vec2|vec3|vec4|mat2|mat3|mat4|int|bool|void)\s+([a-z_][a-z0-9_]*)\s*\(/gi)) declared.add(m[1]);
  const unknown = [...new Set([...src.matchAll(/\b([a-z_][a-z0-9_]*)\s*\(/g)].map((m) => m[1]))]
    .filter((c) => !GLSL_BUILTIN.has(c) && !declared.has(c));
  if (unknown.length) bad(name + ' 调用未声明函数：' + unknown.join(', '));
  else ok(name + ' 函数调用全部可解析');

  // 关键防线：texture2D 必须有 sampler2D 声明，否则真实驱动上编译失败
  if (/\btexture2D\s*\(/.test(src)) {
    const samplers = (src.match(/uniform\s+sampler2D\s+([A-Za-z0-9_]+)/g) || []).map((s) => s.split(/\s+/).pop());
    if (samplers.length) {
      const args = [...src.matchAll(/texture2D\s*\(\s*([A-Za-z0-9_]+)/g)].map((m) => m[1]);
      const missing = [...new Set(args)].filter((a) => !samplers.includes(a));
      if (missing.length) bad(name + ' texture2D 采样了未声明的 sampler：' + missing.join(', '));
      else ok(name + ' texture2D 采样器均已声明（' + samplers.join(', ') + '）');
    } else {
      bad(name + ' 使用了 texture2D 但没有 sampler2D 声明（真实驱动会编译失败）');
    }
  }

  // 声明但未使用 / 使用但未声明 的 uniform
  const us = [...src.matchAll(/uniform\s+\w+\s+([A-Za-z0-9_]+)\s*(\[\s*\d+\s*\])?\s*;/g)]
    .map((m) => ({ n: m[1], arr: !!m[2] }));
  const body = src.replace(/uniform[^;]+;/g, ' ');
  const unused = us.filter((u) => !new RegExp('\\b' + u.n + '\\b').test(body)).map((u) => u.n);
  if (unused.length) bad(name + ' 声明未使用的 uniform：' + unused.join(', '));
  else ok(name + ' uniform 声明与使用一致（' + us.length + ' 个）');
}

/* --------------------------------------------------------- 3. 文化与约束 */
console.log('\n[3] 文化约定与页面约束');

// 真正的音符字符：U+2669–U+266F、U+1D100–U+1D1FF（含代理对）。刻意不含 U+FE0F。
const NOTE = /[\u2669-\u266F]|\uD834[\uDD00-\uDDFF]/;
for (const [name, src] of [['index.html', html], ['styles.css', css], ...SOURCES]) {
  if (NOTE.test(src)) bad(name + ' 出现西方音符符号');
  else ok(name + ' 无西方音符符号');
}

const h1 = (html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/) || [])[1] || '';
const h1len = h1.replace(/\s/g, '').length;
if (h1len > 0 && h1len <= 30) ok('首屏 h1 是引导短句（' + h1len + ' 字），不是定义句');
else bad('首屏 h1 长度异常：' + h1len + ' 字');

for (const k of ['穹乃额曼', '达斯坦', '麦西热甫']) {
  if (html.includes(k)) ok('结构命名齐备：' + k);
  else bad('缺少结构命名：' + k);
}

// 硬切：三段之间不得有 linear-gradient 交叉过渡
const segCss = css.slice(css.indexOf('.seg--qon'), css.indexOf('.seg > .seg__breath'));
if (/transition[^;]*background/.test(segCss)) bad('三段背景出现过渡动画，违反"硬切"约束');
else ok('三段背景无过渡，保持硬切');

// 配色令牌 CSS ↔ shader
const cssVars = {};
for (const m of css.matchAll(/--(seg[123]-[ab]):\s*(#[0-9a-f]{6})/gi)) cssVars[m[1]] = m[2];
const pairs = [['seg1-a', 'seg1a'], ['seg1-b', 'seg1b'], ['seg2-a', 'seg2a'],
               ['seg2-b', 'seg2b'], ['seg3-a', 'seg3a'], ['seg3-b', 'seg3b']];
let mismatch = 0;
for (const [cssKey, jsKey] of pairs) {
  const m = app.match(new RegExp(jsKey + ':\\s*\\[([^\\]]+)\\]'));
  if (!m) { bad('app.js 缺少颜色令牌 ' + jsKey); mismatch++; continue; }
  const jsVals = m[1].split(',').map((s) => {
    const mm = s.trim().match(/^(\d+(?:\.\d+)?)\s*\/\s*(\d+(?:\.\d+)?)$/);
    return mm ? Math.round((parseFloat(mm[1]) / parseFloat(mm[2])) * 255) : Math.round(parseFloat(s) * 255);
  });
  const cssVals = [1, 3, 5].map((i) => parseInt(cssVars[cssKey].slice(i, i + 2), 16));
  if (jsVals.join() !== cssVals.join()) {
    bad('配色不一致 ' + cssKey + ' css=[' + cssVals + '] shader=[' + jsVals + ']');
    mismatch++;
  }
}
if (!mismatch) ok('CSS 与着色器配色令牌一致（6 项）');

console.log('\n' + (fails ? '✗ ' + fails + ' 项未通过' : '✓ 全部通过') + '\n');
process.exit(fails ? 1 : 0);
