/* ==========================================================================
   弦脉 · 三个部分章的渲染
   --------------------------------------------------------------------------
   第二章 / 第三章 / 第四章结构完全一样，只是内容不同。
   所以页面骨架由这里统一生成，HTML 里只留容器，数据在 part-data.js。

   这样加内容 = 改数据，不用碰 HTML；三个页也不会各自跑偏。
   ========================================================================== */

import { PARTS } from './part-data.js';

const $ = (s) => document.querySelector(s);

/** 一句一行地排正文 */
function bodyHTML(lines) {
  return lines.map((t) => '<p class="body reveal">' + t + '</p>').join('');
}

function statsHTML(stats) {
  return '<ul class="chapter-hero__stats reveal" data-delay="4">' + stats.map((s) =>
    '<li><b>' + s.v + (s.unit ? '<i>' + s.unit + '</i>' : '') + '</b>' +
    '<span>' + s.label + '</span></li>'
  ).join('') + '</ul>';
}

function slotHTML(img, i) {
  return '<figure class="slot reveal" data-delay="' + Math.min(5, i + 1) + '"' +
    ' data-src="' + img.src + '"' +
    ' data-label="' + (img.label || '图片位') + '"' +
    ' style="--slot-ratio: ' + (img.ratio || '16 / 9') + '">' +
    '<img alt="' + (img.alt || img.caption || '') + '" loading="lazy" decoding="async">' +
    (img.caption ? '<figcaption>' + img.caption + '</figcaption>' : '') +
    '</figure>';
}

function imagesHTML(images) {
  if (!images || !images.length) return '';
  if (images.length === 1) return slotHTML(images[0], 0);
  // 两张并排
  return '<div class="slot-pair">' +
    images.map((im, i) => slotHTML(im, i)).join('') + '</div>';
}

function pendingHTML(items) {
  return '<p class="pending reveal">这里还缺：<br>' +
    items.map((t) => '· ' + t).join('<br>') + '</p>';
}

function sectionHTML(sec, i) {
  const delay = Math.min(4, i);
  return '<section class="act" data-act="' + (i + 1) + '">' +
    '<span class="act__num" aria-hidden="true">' + '一二三四五六七八'[i] + '</span>' +
    '<div class="act__inner">' +
      (sec.title ? '<h2 class="act__title reveal" data-delay="' + delay + '">' + sec.title + '</h2>' : '') +
      (sec.body ? bodyHTML(sec.body) : '') +
      (sec.images ? imagesHTML(sec.images) : '') +
      (sec.pending ? pendingHTML(sec.pending) : '') +
    '</div></section>';
}

/**
 * 用数据铺满整页。HTML 里需要三个容器：
 *   #part-hero（开场）、#part-body（正文各节）、.chapter-nav（底部，由 site.js 填）
 * 以及 <body data-part="qon"> 指明用哪一份数据。
 */
export function renderPart() {
  const id = document.body.dataset.part;
  const p = PARTS[id];
  if (!p) {
    if (window.console) console.warn('[弦脉] 找不到 part 数据：' + id);
    return null;
  }

  document.title = '第' + p.num + '章 · ' + p.title + '（' + p.sub + '）｜十二木卡姆 — 弦脉';
  const desc = document.querySelector('meta[name="description"]');
  if (desc) desc.setAttribute('content', p.lead);

  // 这一段的色调，供页面上的小面积强调色使用
  document.body.style.setProperty('--part-tone', p.tone);

  const hero = $('#part-hero');
  if (hero) {
    hero.innerHTML = '<div class="chapter-hero__inner">' +
      '<p class="chapter-hero__part reveal">第' + p.num + '章 · 十二木卡姆的' +
        (p.num === '二' ? '第一' : p.num === '三' ? '第二' : '第三') + '部分</p>' +
      '<h1 class="reveal" data-delay="1">' + p.title + '</h1>' +
      '<span class="chapter-hero__ug reveal" data-delay="2">' + p.latin + ' · ' + p.sub + '</span>' +
      '<p class="chapter-hero__lead reveal" data-delay="3">' + p.lead + '</p>' +
      statsHTML(p.stats) +
      '</div>';
  }

  /* 概念图：紧跟开场的一整屏画框。
     图是"这一章的视觉主题"，不是插图，所以给它独立一屏，
     按原图比例展示，不裁切。
     用 <picture>：优先 webp（小得多），取不到就退回原作者给的格式。 */
  const heroImg = $('#part-hero-image');
  if (heroImg && p.heroImage) {
    const hi = p.heroImage;
    const dims = (hi.w ? ' width="' + hi.w + '"' : '') + (hi.h ? ' height="' + hi.h + '"' : '');
    const sources = [];
    if (/\.webp$/i.test(hi.src)) sources.push('<source srcset="' + hi.src + '" type="image/webp">');
    if (hi.fallback) sources.push('<source srcset="' + hi.fallback + '">');

    heroImg.innerHTML =
      '<figure class="plate">' +
        '<picture>' + sources.join('') +
          '<img src="' + (hi.fallback || hi.src) + '" alt="' + (hi.alt || p.title) + '"' +
            ' loading="lazy" decoding="async"' + dims + '>' +
        '</picture>' +
        (hi.caption ? '<figcaption>' + hi.caption + '</figcaption>' : '') +
      '</figure>';
  } else if (heroImg) {
    heroImg.innerHTML = '';          // 没有图就整屏收起（.plate-act:empty 会 display:none）
  }

  const body = $('#part-body');
  if (body) body.innerHTML = p.sections.map(sectionHTML).join('');

  return p;
}
