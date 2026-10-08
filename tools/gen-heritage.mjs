/* ==========================================================================
   生成八族分页的 HTML
   --------------------------------------------------------------------------
   八个目录的 index.html **内容完全一样**，只有 <body data-ethnic="...">、
   <title>、<meta description> 不同。所以由这个脚本从数据生成 ——
   手写八份就有八个地方要改，早晚改漏一个。

   用法：node tools/gen-heritage.mjs
   改了 heritage-data.js 之后跑一次（自检会提醒）。
   ========================================================================== */
import { writeFileSync, mkdirSync, existsSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { HERITAGE } from '../js/lib/heritage-data.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

const page = (item) => `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>${item.group} · ${item.name}｜八音 — 弦脉</title>
<meta name="description" content="${item.group}${item.name}：${item.note.replace(/"/g, '')}">
<meta name="theme-color" content="#0a0908">
<meta name="color-scheme" content="dark">
<meta property="og:title" content="${item.group} · ${item.name}｜弦脉">
<meta property="og:description" content="${item.note.replace(/"/g, '')}">
<meta property="og:type" content="article">
<link rel="icon" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'%3E%3Crect width='32' height='32' fill='%230a0908'/%3E%3Crect x='12' y='4' width='8' height='8' fill='%233a2b28'/%3E%3Crect x='12' y='12' width='8' height='8' fill='%23c08a3e'/%3E%3Crect x='12' y='20' width='8' height='8' fill='%23a33b28'/%3E%3C/svg%3E">
<link rel="stylesheet" href="../../styles.css">
<link rel="stylesheet" href="../../styles/chapter.css">
<link rel="stylesheet" href="../../styles/heritage.css">
</head>
<!-- data-ethnic 决定渲染哪一族。八个页面的 HTML 除这一处之外完全一样。 -->
<body class="chapter heritage-page" data-ethnic="${item.id}" data-render="pending">

<a class="sr-only" href="#ethnic">跳到正文</a>

<header class="topbar"></header>

<canvas class="air" id="air" aria-hidden="true"></canvas>
<div class="fallback-ember" aria-hidden="true"></div>

<main>
  <!-- 内容由 js/dist/heritage.js 从 heritage-data.js 渲染 -->
  <article class="ethnic" id="ethnic"></article>
  <nav class="chapter-nav" aria-label="章节导航"></nav>
</main>

<script src="../../js/dist/heritage.js" defer></script>
</body>
</html>
`;

let n = 0;
for (const item of HERITAGE) {
  const dir = join(root, 'heritage', item.id);
  mkdirSync(dir, { recursive: true });
  const file = join(dir, 'index.html');
  const next = page(item);
  // 内容没变就不写，免得 git 里全是无意义的 diff
  const same = existsSync(file) && readFileSync(file, 'utf8') === next;
  if (!same) writeFileSync(file, next, 'utf8');
  console.log('  ' + (same ? '不变  ' : '写出  ') + 'heritage/' + item.id + '/index.html');
  n++;
}
console.log('\n  共 ' + n + ' 页\n');
