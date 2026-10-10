/* 由 tools/build.mjs 生成，请勿直接编辑。改源码后运行 node tools/build.mjs
   本页模块（依依赖序）：
     js/lib/materials.js  → VERT_SRC, NOISE_GLSL, MATERIAL_GLSL, SCENE_FRAG, DUST_FRAG, EMBER_FRAG, CHAPTER_AIR_FRAG, MASHRAQ_FRAG, WALL_FRAG
     js/lib/renderer.js  → COLORS, SEG_H, SEG_BOUNDS, BREATH, Renderer
     js/lib/guide-actor.js  → createGuideActor
     js/lib/companion.js  → mountCompanion
     js/lib/sequencer.js  → DapSequencer, PATTERNS
     js/lib/site.js  → NAV, mountShell, mountSoundButton, mountChapterNav, revealOnScroll, mountSlots
     js/lib/chapter.js  → bootChapter, REDUCED
     js/lib/theme.js  → createTheme, autoPlayOnGesture, unlock
     js/lib/heritage-data.js  → HERITAGE, heritageHref, heritageById, collectedHeritage, heritageImages
     js/lib/heritage-page.js  → buildHeritagePage
     js/pages/heritage.js
*/
(function () {
"use strict";

var __XM = [];
var __ns = null;
__XM[0] = {};
__XM[1] = {};
__XM[2] = {};
__XM[3] = {};
__XM[4] = {};
__XM[5] = {};
__XM[6] = {};
__XM[7] = {};
__XM[8] = {};
__XM[9] = {};
__XM[10] = {};

/* ── js/lib/materials.js ── */
function __M0__() {
/* ==========================================================================
   弦脉 · 共享材质库
   --------------------------------------------------------------------------
   把"好看"这件事拆成四层，每层各自独立、可单独调强度：

     wall   洞窟壁面 —— 灰浆颗粒 + 矿物斑点，近距离的质感
     mural  壁画残迹 —— 斑驳颜料 + 剥落的白灰地仗 + 冰裂纹（远景暗示，不是主体）
     light  顶部光缝 —— 一道斜向漏光，尘埃在光里可见
     dust   浮尘     —— FBO 乒乓反馈场，滚动给它惯性

   全部程序化生成，没有一张位图。所有层都以"极低对比"为原则：
   背景要厚，但不能抢中央的结构柱。
   ========================================================================== */

/** 顶点着色器：一个覆盖全屏的三角形 */
const VERT_SRC = `
attribute vec2 a_pos;
void main() { gl_Position = vec4(a_pos, 0.0, 1.0); }
`;

/* ---------------------------------------------------------------- 噪声库 --
   被材质着色器与壁面着色器共用，所以单独抽出来拼接，避免两处各写一份。 */
const NOISE_GLSL = `
float hash21(vec2 p) {
  p = fract(p * vec2(233.34, 851.73));
  p += dot(p, p + 23.45);
  return fract(p.x * p.y);
}
float vnoise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  float a = hash21(i);
  float b = hash21(i + vec2(1.0, 0.0));
  float c = hash21(i + vec2(0.0, 1.0));
  float d = hash21(i + vec2(1.0, 1.0));
  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}
float fbm(vec2 p, int oct) {
  float s = 0.0, a = 0.5;
  mat2 R = mat2(0.82, 0.57, -0.57, 0.82);
  for (int i = 0; i < 7; i++) {
    if (i >= oct) break;
    s += a * vnoise(p);
    p = R * p * 2.03;
    a *= 0.5;
  }
  return s;
}
float ridge(vec2 p, int oct) {
  float s = 0.0, a = 0.5;
  for (int i = 0; i < 7; i++) {
    if (i >= oct) break;
    float n = abs(vnoise(p) * 2.0 - 1.0);
    s += a * (1.0 - n);
    p *= 2.07;
    a *= 0.5;
  }
  return s;
}
float bandf(float v, float e) { return smoothstep(0.5 - e, 0.5 + e, v); }
`;

/* ------------------------------------------------------- 三段结构柱材质 --
   这三段是首屏的主体。它们不画在背景上，而是烘焙成纹理交给 DOM，
   由布局引擎负责几何 —— 这样位置和比例永远与设计一致。 */
const MATERIAL_GLSL = `
${NOISE_GLSL}

/* 穹乃额曼：剥落壁画。
   正确的层次是：赭石地子 → 覆盖其上的暗青壁画层 → 剥落处露回赭石，
   剥落边缘受光。之前把暗青当成"露出的底"，明暗关系就反了。 */
vec3 matQon(vec2 q, float w, float t) {
  vec2 s = q * vec2(w, 1.0) + vec2(0.0, t * 0.004);   // 各向同性空间

  float n  = fbm(s * 2.4, 5);
  float n2 = fbm(s * 0.70 + 7.3, 4);
  float vul = n * 0.72 + n2 * 0.36;

  float layer = bandf(vul, 0.055);                    // 1 = 壁画层完好，0 = 已剥落
  float edge  = 1.0 - abs(layer * 2.0 - 1.0);         // 剥落边缘

  vec3 ground  = u_c1a * 0.46;                        // 赭石地子
  vec3 plaster = u_c1b * 0.95;                        // 覆盖的暗青壁画层
  vec3 col = mix(ground, plaster, layer);

  // 浮雕：光源在左上，边缘一侧受光、一侧落影。
  // 需要 GL_OES_standard_derivatives；若驱动不支持（u_deriv = 0）就退回无浮雕。
  vec3 col2 = col;
  if (u_deriv > 0.5) {
    vec2 toLight = normalize(vec2(-0.75, 0.65));
    float gx = dFdx(layer), gy = dFdy(layer);
    float relief = -(gx * toLight.x + gy * toLight.y);
    col2 += vec3(0.16, 0.135, 0.105) * clamp(relief * 42.0, 0.0, 1.0) * edge;
    col2 *= 1.0 - clamp(-relief * 30.0, 0.0, 1.0) * edge * 0.45;
  } else {
    col2 += vec3(0.13, 0.11, 0.085) * pow(edge, 2.4) * 0.9;
  }
  col = col2;

  // 墙面自身的斑驳
  float patina = fbm(s * 1.1 - 5.1, 4);
  col *= 0.86 + 0.28 * patina;

  // 极细的墙粒
  col *= 0.94 + 0.12 * fbm(s * 26.0, 3);
  return col;
}

/* 达斯坦：流动的叙事长句。
   之前用极端的横向各向异性 ridge，数学上就等于木纹方向 —— 越调越像木头。
   改成"抖动网格 + 旋转格内笔画"：横竖斜都有、粗细不一、断续，
   才读作写满的字，而不是年轮。 */
vec3 matDastan(vec2 q, float w, float t) {
  // 同样先映射到各向同性空间，笔画粗细才均匀
  vec2 p = vec2(q.x * w, q.y);
  vec2 s = p * vec2(1.05, 0.30);
  float warp = fbm(s * 1.4 + vec2(0.0, t * 0.025), 3);
  vec2 d = s + vec2(warp * 2.2, warp * 0.30);

  const float ROWS = 17.0;
  vec2 g = d * ROWS;
  vec2 id = floor(g);
  float h = hash21(id);
  vec2 f = fract(g) - 0.5;
  f.x += (h - 0.5) * 0.55;                       // 抖动：打散规则网格
  f.y += (fract(h * 7.31) - 0.5) * 0.40;

  // 笔画方向：以横向为主（走句），少数例外做变化
  float hh = fract(h * 13.7);
  float ang = (hh < 0.72) ? 0.0 : (hh - 0.72) / 0.28 * 3.14159;
  vec2 ff = vec2(f.x * cos(ang) - f.y * sin(ang), f.x * sin(ang) + f.y * cos(ang));
  float thick = 0.048 + fract(h * 3.17) * 0.052; // 笔画粗细不一
  float stroke = smoothstep(thick, thick * 0.30, abs(ff.y));

  float ink = stroke * step(0.58, h);            // 断续：多数格子是空的

  float flow = fbm(d * 2.6 + 13.7, 4);

  vec3 base = u_c2b * 0.40;
  vec3 col = mix(base, u_c2a * 0.70, flow * 0.55);
  col += vec3(0.115, 0.082, 0.034) * ink;        // 暗墨痕，压得住
  col *= 0.88 + 0.24 * fbm(p * vec2(3.0, 0.6) + 3.0, 3);
  return col;
}

/* 麦西热甫：鼓面击点。
   注意：贴图宽高比约 2.9:1，若在归一化坐标里定"正方形"网格，
   落到贴图上会被横向拉伸近 3 倍 —— 圆点变成横条，读作斑马纹。
   所有各向同性的图案都必须按宽高比换算。 */
vec3 matMashrap(vec2 q, float w, float t) {
  /* 关键：先把坐标映射到"各向同性空间"再算图案。
     q.x 乘上宽高比之后，x / y 的物理尺度才一致 ——
     否则 length() 算出来的"圆"在贴图上是一条横线（踩过这个坑）。 */
  vec2 p = vec2(q.x * w, q.y);

  const float ROWS = 6.5;                     // 纵向 6.5 个单元
  vec2 g = p * ROWS;
  vec2 id = floor(g);
  float h = hash21(id);
  vec2 f = fract(g) - 0.5;

  // 格内随机落点：位置一散，规则网格感就没了，才像密集跳跃而不是波点布
  f.x += (hash21(id + 3.1) - 0.5) * 0.62;
  f.y += (hash21(id + 7.7) - 0.5) * 0.55;

  float present = step(0.30, h);              // 只有一部分格子被敲到
  float rad = 0.17 + fract(h * 5.13) * 0.13;  // 大小不一
  float hit = present * smoothstep(rad, rad * 0.30, length(f));

  vec3 base = u_c3a * 0.46;
  vec3 col = mix(base, u_c3b * 1.10, hit * mix(0.40, 1.0, fract(h * 7.31)));
  col += vec3(0.26, 0.17, 0.11) * pow(hit, 2.6) * (0.3 + 0.7 * fract(h * 3.17));

  float grain = fbm(p * vec2(9.0, 26.0) + t * 0.09, 3);
  col *= 0.90 + 0.20 * grain;

  col = mix(col, u_c3a * 0.80, bandf(fbm(p * vec2(1.8, 5.0) + 9.0, 3), 0.16) * 0.28);
  return col;
}
`;

/* --------------------------------------------- 场景着色器（烘焙 + 整柱） --
   两个用途共用一份材质函数：
     u_bandMode >= 0  只渲染该段材质铺满缓冲 → 读回成纹理
     u_bandMode <  0  渲染整根结构柱（保留给实时管线） */
const SCENE_FRAG = `
#extension GL_OES_standard_derivatives : enable
precision highp float;

uniform vec2  u_buf;
uniform float u_cs;
uniform vec4  u_pillarCss;
uniform float u_time;
uniform float u_stage;
uniform float u_active;
uniform float u_open;
uniform float u_lit[3];
uniform float u_breath[3];
uniform vec4  u_segBound;

uniform vec3 u_c1a, u_c1b, u_c1c;
uniform vec3 u_c2a, u_c2b;
uniform vec3 u_c3a, u_c3b;
uniform vec3 u_g1, u_g2, u_g3;
uniform vec3 u_ink;
uniform vec3 u_bg;
uniform sampler2D u_dust;

uniform float u_bandMode;
uniform float u_bandSeed;
uniform float u_dim;
uniform float u_deriv;     // 是否可用 dFdx/dFdy（GL_OES_standard_derivatives）
uniform vec2  u_tile;

${MATERIAL_GLSL}

void main() {
  if (u_bandMode > -0.5) {
    vec2 t = gl_FragCoord.xy / u_tile;
    float w = u_tile.x / u_tile.y;
    vec3 m;
    if (u_bandMode < 0.5)      m = matQon(t, w, u_bandSeed);
    else if (u_bandMode < 1.5) m = matDastan(t, w, u_bandSeed);
    else                       m = matMashrap(t, w, u_bandSeed);
    gl_FragColor = vec4(m * u_dim, 1.0);
    return;
  }

  float s = u_buf.y;
  vec2 uvp = gl_FragCoord.xy / s;
  float aspect = u_buf.x / u_buf.y;
  vec2 p = uvp - vec2(aspect * 0.5, 0.5);
  p.y = -p.y;

  vec2 PS  = vec2(u_pillarCss.x, u_pillarCss.y) * u_cs / s;
  vec2 PSS = vec2(u_pillarCss.z, u_pillarCss.w) * u_cs / s;
  vec2 q = (p - PS) / PSS;
  float w = PSS.x / PSS.y;

  vec3 bg = u_bg + vec3(0.008, 0.0075, 0.0068) * fbm(p * 1.4 + 4.0, 3);
  vec3 haze = texture2D(u_dust, uvp * 0.5 + 0.14).rgb
            + texture2D(u_dust, uvp * 0.5 + vec2(0.37, 0.61)).rgb;
  bg += max(haze - vec3(0.02), vec3(0.0)) * 0.08;
  vec3 col = bg;

  if (q.x > -0.9 && q.x < 1.9 && q.y > -0.5 && q.y < 1.5) {
    q.x += (u_stage / 3.0 - 0.5) * 0.035;
    float qy = clamp(q.y - sin(u_time * 0.115) * 0.006, 0.0, 1.0);

    float b1 = u_segBound.y, b2 = u_segBound.z;
    float isTop = step(qy, b1);
    float isMid = step(b1, qy) * step(qy, b2);
    float idx = isTop * 0.0 + isMid * 1.0 + (1.0 - isTop - isMid) * 2.0;

    vec3 c;
    if (isTop > 0.5)      c = matQon(q, w, u_time);
    else if (isMid > 0.5) c = matDastan(q, w, u_time);
    else                  c = matMashrap(q, w, u_time);

    float period = u_breath[0];
    float act = 0.0;
    for (int i = 0; i < 3; i++) {
      if (float(i) == idx) { period = u_breath[i]; act = u_lit[i]; }
    }

    float breath = 0.80 + 0.20 * (0.5 + 0.5 * sin(u_time * 6.28318 / period - idx * 1.7));
    c *= breath;
    c *= 0.90 + 0.20 * fbm(vec2(q.x * w * 1.3, q.y * 2.1) + 17.0, 3);
    c *= 0.94 + 0.14 * fbm(vec2(q.x * 3.1, q.y * 0.38) + 2.0, 4);

    vec2 seamCoord = vec2(q.x * w * 2.6, q.y * 26.0);
    float sA = b1 + (fbm(seamCoord + 11.0, 4) - 0.5) * 0.022;
    float sB = b2 + (fbm(seamCoord + 41.0, 4) - 0.5) * 0.022;
    float ds = min(abs(qy - sA), abs(qy - sB));
    c = mix(c, u_ink, smoothstep(0.010, 0.0016, ds));
    c += vec3(0.10, 0.085, 0.07) * smoothstep(0.016, 0.009, ds) * smoothstep(0.0016, 0.004, ds);

    float edgeD = min(min(q.x, 1.0 - q.x) * PSS.x, min(qy, 1.0 - qy) * PSS.y);
    c *= 1.0 + 0.30 * smoothstep(2.2, 0.0, edgeD);

    float maxLit = max(u_lit[0], max(u_lit[1], u_lit[2]));
    c *= mix(1.0, 0.70, maxLit * (1.0 - act));

    vec3 glow = isTop > 0.5 ? u_g1 : (isMid > 0.5 ? u_g2 : u_g3);
    c += glow * act * (0.11 + 0.07 * breath);

    float sw = fract(u_time * 0.09 + u_active * 0.33);
    c += vec3(0.16, 0.13, 0.10) * exp(-pow((qy - (sw * 2.6 - 0.8)) * 7.0, 2.0)) * act * 0.9;
    c += (hash21(gl_FragCoord.xy) - 0.5) * (1.6 / 255.0);

    float nx = fbm(vec2(q.y * 7.0, 3.3), 3) - 0.5;
    float ny = fbm(vec2(q.x * w * 1.5, 9.1) + 21.0, 3) - 0.5;
    float eL = nx * 0.020;
    float eR = 1.0 + fbm(vec2(q.y * 6.2, 7.7) + 5.0, 3) * 0.020 - 0.010;
    float eBot = ny * 0.010;
    float eTop = 1.0 + ny * 0.010;
    float mask = smoothstep(eL - 0.004, eL + 0.004, q.x)
               * smoothstep(eR + 0.004, eR - 0.004, q.x)
               * smoothstep(eBot - 0.003, eBot + 0.003, qy)
               * smoothstep(eTop + 0.003, eTop - 0.003, qy);

    float ao = 1.0 - 0.55 * smoothstep(0.0, 0.16, max(max(-q.x, q.x - 1.0), 0.0));
    ao *= 1.0 - 0.5 * smoothstep(0.0, 0.010, max(max(-qy, qy - 1.0), 0.0));
    col = mix(col, c * ao, mask);

    if (u_open < 0.999) {
      float openT = u_open * 3.4 - idx * 0.62;
      float reveal = smoothstep(0.0, 0.62, openT);
      float line = smoothstep(0.0, 0.07, openT) * smoothstep(0.20, 0.05, openT);
      col = mix(bg, col, smoothstep(0.0, 0.05, qy - (1.0 - reveal)));
      col += vec3(0.30, 0.24, 0.16) * line * mask * 0.55;
    }
  }

  gl_FragColor = vec4(col, 1.0);
}
`;

/* ------------------------------------------------------------ 浮尘反馈场 -- */
const DUST_FRAG = `
precision highp float;

uniform sampler2D u_prev;
uniform vec2  u_res;
uniform float u_time;
uniform float u_vel;
uniform float u_frame;
uniform float u_amount;

${NOISE_GLSL}

void main() {
  vec2 res = u_res;
  vec2 uvp = gl_FragCoord.xy / res;
  // 残影只留几帧：留太久会把每个尘点拖成一条流星
  vec3 col = texture2D(u_prev, uvp).rgb * mix(0.86, 0.74, clamp(u_vel, 0.0, 1.0));

  float t = u_time;
  float yShift = t * 0.0025 - u_vel * 0.004;

  for (int i = 0; i < 28; i++) {
    if (float(i) >= u_amount) break;
    float fi = float(i);
    float sp = hash21(vec2(fi, 7.7));
    vec2 p = vec2(hash21(vec2(fi, 1.3)), fract(hash21(vec2(fi, 3.9)) + yShift * (0.45 + sp)));
    p.x += sin(t * (0.035 + sp * 0.07) + fi * 2.3) * (0.006 + sp * 0.012);
    p.y += sin(t * (0.025 + sp * 0.05) + fi * 5.1) * 0.003;

    vec2 d = (uvp - p) * vec2(res.x / res.y, 1.0);
    float anim = fract(u_frame * 0.012 + fi * 0.37);
    float amp = (0.0009 + sp * 0.0021) * mix(0.8, 1.25, anim);

    col += vec3(0.040, 0.036, 0.029) * exp(-dot(d, d) / (amp * amp));

    if (sp > 0.9) {
      vec2 d2 = (uvp - p * 0.97 - vec2(0.01, 0.0)) * vec2(res.x / res.y, 1.0);
      col += vec3(0.085, 0.085, 0.082) * exp(-dot(d2, d2) / (amp * amp * 0.30));
    }
  }

  float r = length((uvp - 0.5) * vec2(res.x / res.y, 1.0) * 1.6);
  col *= 1.0 - 0.30 * smoothstep(0.5, 1.25, r);
  gl_FragColor = vec4(col, 1.0);
}
`;

/* ==========================================================================
   章节页材质
   --------------------------------------------------------------------------
   首屏的"房间"是暗的、静的；章节页要有推进感，所以换成另一种东西：
   深色结壳，裂缝下透出热量。这不是纹样，是质地 ——
   西域大地的颜色，而且它天生适合承载"时间在流动"这件事。
   ========================================================================== */

/* ---- 地火：裂纹结壳，热量从缝里出来 ---- */
const EMBER_FRAG = `
precision highp float;

uniform float u_time;
uniform vec2  u_res;
uniform float u_heat;    // 0..1 整体热度（滚动推进时升起来）
uniform float u_scale;   // 纹理尺度
uniform vec2  u_center;  // 热量中心（跟随当前条目）

${NOISE_GLSL}

void main() {
  vec2 uv = gl_FragCoord.xy / u_res.y;
  float aspect = u_res.x / u_res.y;
  vec2 p = vec2((uv.x - aspect * 0.5), (uv.y - 0.5));

  /* 域扭曲：两层嵌套的 fbm，让纹理像被地下的力推着走 */
  vec2 w1 = vec2(fbm(p * 1.6 + 3.1, 4), fbm(p * 1.6 + 8.7, 4)) - 0.5;
  vec2 q = p * u_scale + w1 * 0.9 + vec2(u_time * 0.012, -u_time * 0.008);
  vec2 w2 = vec2(fbm(q * 2.3, 4), fbm(q * 2.3 + 17.0, 4)) - 0.5;
  float crust = fbm(q + w2 * 0.7, 5);

  /* 结壳的"板块"：阈值化之后是硬边，像冷却的岩面 */
  float plate = bandf(crust, 0.055);

  /* 裂缝：板缘就是缝。缝里是热的 */
  float seam = 1.0 - abs(plate * 2.0 - 1.0);
  float crack = pow(clamp(seam, 0.0, 1.0), 1.6);

  /* 分叉的细纹，让缝不是一条光溜溜的线 */
  float hair = ridge(q * 7.5, 3);
  crack = max(crack, pow(clamp(hair, 0.0, 1.0), 7.0) * 0.55);

  /* 热量分布：离当前条目的位置越近越热 */
  vec2 d = (uv - u_center) * vec2(aspect, 1.0);
  float near = exp(-dot(d, d) * 1.9);
  float heat = u_heat * (0.28 + 0.72 * near);

  /* 颜色：结壳是暗褐，缝里从暗红一路烧到暖黄 */
  vec3 rock = mix(vec3(0.030, 0.026, 0.024), vec3(0.075, 0.055, 0.042), plate);
  vec3 emberCol = mix(vec3(0.44, 0.13, 0.045),   // 暗红
                      vec3(0.95, 0.62, 0.22),    // 暖黄
                      pow(clamp(heat, 0.0, 1.0), 1.4));

  vec3 col = rock;
  col += emberCol * crack * heat * 1.35;
  col += emberCol * 0.10 * heat * (1.0 - plate) * 0.6;   // 板面上的余温

  /* 极细的灰，压在暗部避免色阶 */
  col += (hash21(gl_FragCoord.xy + fract(u_time)) - 0.5) * (2.6 / 255.0);

  gl_FragColor = vec4(col, 1.0);
}
`;

/* ---- 章节页的房间：壁面质感保留，但更冷、更静，不抢地火 ---- */
const CHAPTER_AIR_FRAG = `
precision highp float;

uniform sampler2D u_air;     // 尘埃场（半分辨率）
uniform sampler2D u_layer;   // 底层：地火等绘制结果
uniform vec2  u_buf;
uniform float u_time;
uniform float u_wallGain;
uniform float u_heat;
uniform float u_vigHeavy;   // 1 = 强暗角（房间/地火），0 = 轻暗角（纹样）

${NOISE_GLSL}

void main() {
  vec2 uvp = gl_FragCoord.xy / u_buf;
  float aspect = u_buf.x / u_buf.y;
  vec2 p = uvp - 0.5;
  p.x *= aspect;

  /* 底层画面 */
  vec3 col = texture2D(u_layer, uvp).rgb;

  /* 壁面：一层很轻的质感，让纯色区域有"墙"的颗粒 */
  float mortar = fbm(uvp * vec2(aspect, 1.0) * 62.0, 3);
  float patina = fbm(uvp * vec2(aspect, 1.0) * 5.2 + 11.3, 5);
  col += ((mortar - 0.5) * 0.005 + (patina - 0.5) * 0.020) * u_wallGain;

  /* 热度渗到空气里 */
  col += vec3(0.022, 0.011, 0.004) * u_heat * 0.5;

  /* 浮尘：只在纹样之上轻轻叠一点，不能把纹样冲掉 */
  vec3 d = texture2D(u_air, uvp * 0.5 + 0.31).rgb
         + texture2D(u_air, uvp * 0.5 + vec2(0.67, 0.21)).rgb;
  col += max(d, vec3(0.0)) * 0.55;

  /* 暗角：pattern 模式下要收得很轻，否则纹样全被吃掉 */
  float vigAmt = 0.62 + 0.38 * smoothstep(1.55, 0.25, length(p * vec2(1.0, 1.14)));
  col *= mix(vigAmt, 0.34 + 0.66 * smoothstep(1.55, 0.25, length(p * vec2(1.0, 1.14))), u_vigHeavy);
  col += (fract(sin(dot(gl_FragCoord.xy, vec2(12.9898, 78.233))) * 43758.5453) - 0.5) * (2.4 / 255.0);

  gl_FragColor = vec4(col, 1.0);
}
`;

/* ==========================================================================
   第四章「麦西热甫」的背景：程序化维吾尔几何纹样
   --------------------------------------------------------------------------
   为什么不用图片：麦西热甫是"开场即欢腾、群体、要下场跳"的一段，
   找一个静态场景图会把它拍死。纹样可以随互动实时变化 ——
   圈里的人越多，纹样越密、越亮，背景本身在跟着热闹起来。

   纹样取自维吾尔木雕与花砖常见的几何母题：
     · 八角星（八瓣花）网格 —— 最典型的一种
     · 交错的菱形带
     · 围绕八角的细密卷草（用极坐标噪声近似）
   全部在 isotropic 空间里算，避免纹理被拉伸成椭圆（踩过这个坑）。
   ========================================================================== */
const MASHRAQ_FRAG = `
precision highp float;

uniform float u_time;
uniform vec2  u_res;
uniform float u_heat;      // 0..1 热闹程度 —— 由互动里的"圈里多少人"决定
uniform float u_scale;     // 纹样疏密
uniform float u_zoom;      // 缩放（人越多越推近）

${NOISE_GLSL}

/* 八角星的半边轮廓：把角坐标折到第一象限，算一个星的边界 */
float star8(vec2 p, float r) {
  float a = atan(p.y, p.x);
  float seg = 3.14159265 / 4.0;               // 八等分
  float k = mod(a + seg * 0.5, seg) - seg * 0.5;
  k = abs(k);
  // 星角的半径随角度摆动，8 次
  float rr = r * (0.62 + 0.38 * cos(k * 8.0));
  return length(p) - rr;
}

void main() {
  vec2 uv = gl_FragCoord.xy / u_res.y;
  float aspect = u_res.x / u_res.y;
  vec2 p = vec2(uv.x - aspect * 0.5, uv.y - 0.5) * u_scale * u_zoom;

  /* --- 网格：八角星铺满 --- */
  vec2 cell = vec2(1.0, 1.0);
  vec2 id = floor(p / cell);
  vec2 f = fract(p / cell) - 0.5;

  /* 交错排布：奇数行错半格，是这类纹样的常见做法 */
  float odd = mod(id.y, 2.0);
  f.x += odd * 0.5;

  float d = star8(f, 0.46);

  /* 星与星之间的菱形带：用 |x|+|y| 的等值线做描边 */
  float dia = abs(f.x) + abs(f.y) - 0.5;

  /* --- 卷草：极坐标噪声，绕在八角周围 --- */
  float ang = atan(f.y, f.x);
  float rad = length(f);
  float swirl = fbm(vec2(ang * 1.6, rad * 3.4 - u_time * 0.05), 3);

  /* --- 描边转成线条 ---
     宽度按"占格子的比例"给。太细整幅平均亮度不到 2/255（等于没画），
     太粗又会把文字压住 —— 0.032 是两边的平衡点。 */
  float lw = 0.032 + 0.014 * u_heat;
  float starLine = 1.0 - smoothstep(0.0, lw, abs(d));
  float diaLine  = 1.0 - smoothstep(0.0, lw * 0.7, abs(dia));
  float swirlLine = smoothstep(0.60, 0.88, swirl) * smoothstep(0.52, 0.28, rad);

  float ink = starLine * 1.0 + diaLine * 0.55 + swirlLine * 0.32;

  /* --- 上色：深色底 + 暖金线条 + 一点点石绿 ---
     强度要收住：纹样是背景，不能压过正文。 */
  vec3 base = vec3(0.030, 0.027, 0.024);
  vec3 gold = mix(vec3(0.46, 0.32, 0.12), vec3(0.78, 0.60, 0.28),
                  clamp(u_heat * 1.2, 0.0, 1.0));
  vec3 jade = vec3(0.18, 0.36, 0.30);

  vec3 col = base;
  col += gold * ink * (0.34 + 0.34 * u_heat);
  col += jade * swirlLine * 0.22 * (0.5 + u_heat);

  /* --- 中心稍亮，四周压暗：把注意力收到圆心上。
         压太狠纹样就看不见了（踩过），所以下限提到 0.55。 --- */
  float vig = 0.55 + 0.45 * smoothstep(1.35, 0.20, length(vec2(p.x, p.y) * vec2(0.55, 1.0)));
  col *= vig;

  /* --- 极细的呼吸：热闹时纹样会"动"起来 --- */
  col *= 1.0 + 0.05 * u_heat * sin(u_time * 1.1 + id.x * 0.7 + id.y * 0.9);

  col += (hash21(gl_FragCoord.xy + fract(u_time)) - 0.5) * (2.4 / 255.0);

  gl_FragColor = vec4(col, 1.0);
}
`;

/* ------------------------------------------------- 壁面 + 壁画残片 + 光缝 --
   这是"背景不再单调"的主力。四层叠出来：

     1. 灰浆颗粒   —— 近距离的墙面质感，极低对比
     2. 壁画残迹   —— 斑驳颜料 + 剥落的白灰地仗 + 冰裂纹
                      只在画面外圈出现（中央 55% 刻意留白给结构柱）
     3. 顶部光缝   —— 一道斜向漏光，让尘埃可见，立刻有纵深
     4. 暗角       —— 四角压到接近全黑，把视线收进中央

   注意：壁画层是"残迹"不是"壁画"——没有可辨认的人物或故事画，
   只有颜料的斑驳、地仗的剥落和裂纹。远看是洞窟残墙，近看是材质。 */
const WALL_FRAG = `
precision highp float;

uniform sampler2D u_dust;
uniform vec2  u_buf;
uniform float u_time;
uniform float u_wallGain;   // 壁面质感总强度（0 关闭）
uniform float u_muralGain;  // 壁画残片强度（0 关闭）

${NOISE_GLSL}

void main() {
  vec2 uvp = gl_FragCoord.xy / u_buf;
  float aspect = u_buf.x / u_buf.y;
  vec2 p = uvp - 0.5;
  p.x *= aspect;

  /* ---- 1. 洞窟壁面：两层噪声，一层近一层远 ---- */
  float mortar = fbm(uvp * vec2(aspect, 1.0) * 62.0, 3);          // 灰浆颗粒
  float patina = fbm(uvp * vec2(aspect, 1.0) * 5.2 + 11.3, 5);    // 大面积色斑
  float relief = fbm(uvp * vec2(aspect, 1.0) * 13.0 - 4.7, 4);    // 抹灰的起伏

  float wall = 0.0;
  wall += (mortar - 0.5) * 0.0060;
  wall += (patina - 0.5) * 0.0320;
  wall += (relief - 0.5) * 0.0150;

  /* ---- 2. 壁画残迹：颜料斑 + 白灰地仗 + 冰裂纹 ----
     只出现在外圈。u_ramp 在中央附近为 0，越靠外越强。 */
  float rad = length(p * vec2(1.0, 1.28));
  float ramp = smoothstep(0.34, 0.92, rad) * smoothstep(1.75, 1.05, rad);

  // 颜料块：大的、边界模糊的斑，像褪了色的矿物颜料
  vec2 mp = uvp * vec2(aspect, 1.0) * 2.6 + 31.0;
  float mpWarp = fbm(mp * 0.7, 3);
  float pigment = bandf(fbm(mp + mpWarp * 1.6, 4), 0.16);
  float pigment2 = bandf(fbm(mp * 1.9 + 12.0, 4), 0.13);

  // 三种矿物颜料的色。比结构柱更暗更灰，因为它在远景，隔着空气看
  vec3 cInk  = vec3(0.150, 0.072, 0.048);   // 土红
  vec3 cBlue = vec3(0.050, 0.082, 0.098);   // 石青
  vec3 cGold = vec3(0.128, 0.094, 0.042);   // 土黄
  vec3 mural = mix(cInk, cBlue, pigment2);
  mural = mix(mural, cGold, bandf(fbm(mp * 3.1 - 20.0, 3), 0.11) * 0.6);
  mural *= 0.72 + 0.28 * pigment;

  // 剥落：露出的白灰地仗。这是"残"的关键，没有它就像贴纸
  float lost = bandf(fbm(mp * 1.15 + 7.7, 5), 0.10);
  mural = mix(mural, vec3(0.112, 0.100, 0.082), lost);

  // 冰裂纹：细密的网状裂纹，只在壁画区域可见
  float craq = ridge(mp * 8.5, 3);
  float crack = 1.0 - smoothstep(0.62, 0.92, craq);
  mural *= 1.0 - crack * 0.55;

  mural *= ramp;

  /* ---- 3. 顶部光缝：一道斜向漏光 ---- */
  vec2 sp = p;
  sp.x += sp.y * 0.55;                                  // 让光柱倾斜
  float shaft = exp(-pow(sp.x * 3.6, 2.0));             // 收窄，否则像一层雾
  float shaftNoise = 0.68 + 0.60 * fbm(uvp * vec2(aspect, 1.0) * 3.4 + u_time * 0.012, 4);
  shaft *= shaftNoise;
  shaft *= smoothstep(0.52, -0.16, p.y);                // 越往上越亮，说明光从上方漏下来
  shaft *= smoothstep(-0.72, -0.28, p.y);               // 最上沿收住，避免切边
  shaft *= 0.0165;

  /* ---- 组合 ---- */
  float room = 0.0095 + 0.0028 * sin(u_time * 0.21);
  vec3 col = vec3(room);

  col += wall * u_wallGain;
  col += mural * u_muralGain;

  // 光缝：暖白，尘埃在光里会被下面的加色再提亮一次
  col += vec3(1.0, 0.92, 0.78) * shaft;

  /* ---- 4. 浮尘：进光柱里的尘会亮一些 ---- */
  vec3 d = texture2D(u_dust, uvp * 0.5 + 0.24).rgb
         + texture2D(u_dust, uvp * 0.5 + vec2(0.61, 0.17)).rgb;
  d = max(d, vec3(0.0));
  col += d * (0.85 + shaft * 42.0);

  // 暗角：四角压到接近全黑
  col *= 0.30 + 0.70 * smoothstep(1.58, 0.22, length(p * vec2(1.0, 1.16)));

  // 抖动，避免大片暗面出现色阶
  col += (fract(sin(dot(gl_FragCoord.xy, vec2(12.9898, 78.233))) * 43758.5453) - 0.5) * (2.4 / 255.0);

  gl_FragColor = vec4(col, 1.0);
}
`;

__ns = __XM[0];
__ns.mount_VERT_SRC = function () { return VERT_SRC; };
__ns.mount_NOISE_GLSL = function () { return NOISE_GLSL; };
__ns.mount_MATERIAL_GLSL = function () { return MATERIAL_GLSL; };
__ns.mount_SCENE_FRAG = function () { return SCENE_FRAG; };
__ns.mount_DUST_FRAG = function () { return DUST_FRAG; };
__ns.mount_EMBER_FRAG = function () { return EMBER_FRAG; };
__ns.mount_CHAPTER_AIR_FRAG = function () { return CHAPTER_AIR_FRAG; };
__ns.mount_MASHRAQ_FRAG = function () { return MASHRAQ_FRAG; };
__ns.mount_WALL_FRAG = function () { return WALL_FRAG; };
}

/* ── js/lib/renderer.js ── */
function __M1__() {
var VERT_SRC = __XM[0]["VERT_SRC"];
var SCENE_FRAG = __XM[0]["SCENE_FRAG"];
var DUST_FRAG = __XM[0]["DUST_FRAG"];
var WALL_FRAG = __XM[0]["WALL_FRAG"];
var EMBER_FRAG = __XM[0]["EMBER_FRAG"];
var CHAPTER_AIR_FRAG = __XM[0]["CHAPTER_AIR_FRAG"];
var MASHRAQ_FRAG = __XM[0]["MASHRAQ_FRAG"];
var MATERIAL_GLSL = __XM[0]["MATERIAL_GLSL"];

/* ==========================================================================
   弦脉 · 渲染器
   --------------------------------------------------------------------------
   一条很短的管线，三个 pass，每个 pass 只干一件事：

     pass 1  浮尘反馈场   半分辨率 FBO 乒乓，做真拖尾（不是粒子数组）
     pass 2  房间合成     壁面质感 + 壁画残迹 + 顶部光缝 + 浮尘 + 暗角 → 上屏
     (bake)  材质烘焙     把某一段结构柱材质渲进离屏 FBO，读回成纹理

   —— 尺寸原则 ——
   整条管线只有一个尺寸来源：**画布自身的布局盒**。后备缓冲、离屏目标、
   视口全部由它按同一个比例推出，合成永远是 1:1。这样任何环境的缩放或
   像素预算都不会让几何错位 —— 这是踩过坑之后定下的规矩。

   —— 分工原则 ——
   结构柱不在这里画。它由 GPU 生成材质、烘焙成纹理、交给 DOM 承载，
   几何归布局引擎管。渲染器只负责"空气和墙"。
   ========================================================================== */



/** 三段结构柱的配色令牌。与 styles.css 的 :root 同值，tools/verify.mjs 会校验。 */
const COLORS = {
  seg1a: [58 / 255, 43 / 255, 40 / 255],    // 深赭石
  seg1b: [30 / 255, 48 / 255, 56 / 255],    // 暗青
  seg1c: [36 / 255, 31 / 255, 32 / 255],
  seg2a: [192 / 255, 138 / 255, 62 / 255],  // 暖金
  seg2b: [153 / 255, 66 / 255, 42 / 255],   // 土红
  seg3a: [74 / 255, 128 / 255, 113 / 255],  // 石绿
  seg3b: [163 / 255, 59 / 255, 40 / 255],   // 朱砂

  glow1: [0.46, 0.60, 0.68],
  glow2: [0.80, 0.60, 0.30],
  glow3: [0.34, 0.58, 0.50],
  ink: [10 / 255, 9 / 255, 8 / 255],
  bg: [0.025, 0.0235, 0.0215],
};

/** 三段体量比例（与 DOM 里的 --h 一致）：穹乃额曼最重 */
const SEG_H = [1.18, 0.86, 0.96];
const SEG_SUM = SEG_H[0] + SEG_H[1] + SEG_H[2];
const SEG_BOUNDS = [0, SEG_H[0] / SEG_SUM, (SEG_H[0] + SEG_H[1]) / SEG_SUM, 1];

/** 三段呼吸周期（秒）。越往下越快，与性格同步。 */
const BREATH = [13.0, 9.5, 6.5];

const SEG_COUNT = 3;

class Renderer {
  /**
   * @param {HTMLCanvasElement} canvas
   * @param {object} [opts]
   * @param {'room'|'chapter'} [opts.mode='room']  room = 房间（壁面+壁画），chapter = 章节页（地火+空气）
   * @param {number} [opts.wallGain=1]   壁面质感强度
   * @param {number} [opts.muralGain=1]  壁画残片强度
   * @param {number} [opts.maxPixels=2.6e6]  后备缓冲像素上限（集显保护）
   */
  constructor(canvas, opts = {}) {
    const gl = canvas.getContext('webgl', {
      alpha: false, antialias: false, depth: false, stencil: false,
      premultipliedAlpha: false, preserveDrawingBuffer: false,
      powerPreference: 'high-performance',
    }) || canvas.getContext('experimental-webgl');
    if (!gl) throw new Error('no-webgl');

    this.canvas = canvas;
    this.gl = gl;
    this.mode = opts.mode || 'room';
    this.wallGain = opts.wallGain === undefined ? 1 : opts.wallGain;
    this.muralGain = opts.muralGain === undefined ? 1 : opts.muralGain;
    this.maxPixels = opts.maxPixels || 2.6e6;
    this.heat = 0;
    this.emberScale = 1.55;      // 地火纹样的**粗细**（uv 缩放），不是亮度
    this.emberGain = 1;          // 地火的**亮度**倍率。页面可调小（见 chapter.js）
    this.patternScale = 5.2;
    this.patternZoom = 1;
    this.center = [0.5, 0.5];

    this.quad = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, this.quad);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);

    // 剥落边缘的浮雕用 dFdx/dFdy，需要显式开启导数扩展
    this.derivatives = !!gl.getExtension('OES_standard_derivatives');

    this.pScene = this._program(VERT_SRC, SCENE_FRAG, 'scene');
    this.pDust = this._program(VERT_SRC, DUST_FRAG, 'dust');
    this.pAir = this._program(VERT_SRC, WALL_FRAG, 'air');
    this.pEmber = this._program(VERT_SRC, EMBER_FRAG, 'ember');
    this.pChapterAir = this._program(VERT_SRC, CHAPTER_AIR_FRAG, 'chapterAir');
    this.pMashraq = this._program(VERT_SRC, MASHRAQ_FRAG, 'mashraq');

    this.uScene = this._locs(this.pScene,
      ['u_buf', 'u_cs', 'u_pillarCss', 'u_time', 'u_stage', 'u_active', 'u_open',
       'u_c1a', 'u_c1b', 'u_c1c', 'u_c2a', 'u_c2b', 'u_c3a', 'u_c3b',
       'u_g1', 'u_g2', 'u_g3', 'u_ink', 'u_bg', 'u_dust',
       'u_bandMode', 'u_bandSeed', 'u_dim', 'u_deriv', 'u_tile'],
      /* 这两条是**数组** uniform（uniform float u_lit[3]），
         必须按 [0] 查位置；当标量查会拿到 null，
         然后 uniform1fv(null, 三个值) 会报
         "Only array uniforms may have count > 1" —— 而且不抛异常，
         只是每帧刷一条警告，很容易被忽略（踩过）。 */
      ['u_lit', 'u_breath', 'u_segBound']);
    this.uDust = this._locs(this.pDust,
      ['u_res', 'u_time', 'u_vel', 'u_frame', 'u_amount'], ['u_prev']);
    this.uAir = this._locs(this.pAir,
      ['u_buf', 'u_time', 'u_wallGain', 'u_muralGain'], ['u_dust']);
    this.uEmber = this._locs(this.pEmber,
      ['u_time', 'u_res', 'u_heat', 'u_scale', 'u_center'], []);
    this.uCAir = this._locs(this.pChapterAir,
      ['u_buf', 'u_time', 'u_wallGain', 'u_heat', 'u_vigHeavy'], ['u_air', 'u_layer']);
    this.uMashraq = this._locs(this.pMashraq,
      ['u_time', 'u_res', 'u_heat', 'u_scale', 'u_zoom'], []);

    this.rt = null;
    this.ping = this._target(1, 1);
    this.pong = this._target(1, 1);
    this.size = [0, 0];
    this.css = [0, 0];
    this.cs = 1;
    this.started = performance.now();
    this.cleared = false;

    // 性能自适应：帧时连续偏慢就减尘埃，仍然慢就整体降级
    this.dustAmount = 28;
    this.frameTimes = [];
    this.degraded = false;
  }

  /* ------------------------------------------------------------ GL 基础 */

  _compile(type, src, name) {
    const gl = this.gl;
    const sh = gl.createShader(type);
    gl.shaderSource(sh, src);
    gl.compileShader(sh);
    if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
      throw new Error('shader[' + name + ']: ' + gl.getShaderInfoLog(sh));
    }
    return sh;
  }

  _program(vs, fs, name) {
    const gl = this.gl;
    const p = gl.createProgram();
    gl.attachShader(p, this._compile(gl.VERTEX_SHADER, vs, name + '.vs'));
    gl.attachShader(p, this._compile(gl.FRAGMENT_SHADER, fs, name + '.fs'));
    gl.bindAttribLocation(p, 0, 'a_pos');
    gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) {
      throw new Error('link[' + name + ']: ' + gl.getProgramInfoLog(p));
    }
    return p;
  }

  _locs(prog, scalar, samplers) {
    const gl = this.gl;
    const o = { u: {}, a: {} };
    scalar.forEach((n) => { o.u[n] = gl.getUniformLocation(prog, n); });
    /* 采样器统一按"平铺声明"查名字：uniform sampler2D u_layer;
       不要加 [0] —— 那是给数组用的。查不到会静默返回 null，
       而 uniform1i(null, 1) 是空操作，采样器会一直停在 0 号单元，
       表现是"画面黑掉但没有任何报错"。这个坑很隐蔽，记在这里。 */
    (samplers || []).forEach((n) => {
      o.a[n] = gl.getUniformLocation(prog, n) || gl.getUniformLocation(prog, n + '[0]');
    });
    return o;
  }

  _target(w, h) {
    const gl = this.gl;
    const tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    const fb = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    return { tex, fb, w, h };
  }

  _bindQuad(prog) {
    const gl = this.gl;
    gl.bindBuffer(gl.ARRAY_BUFFER, this.quad);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
  }

  /* -------------------------------------------------------------- 尺寸 */

  /**
   * 尺寸只有一个来源：画布的布局盒。
   * @param {number} cssW
   * @param {number} cssH
   * @param {number} [dpr] 设备像素比，默认取 window.devicePixelRatio
   */
  resize(cssW, cssH, dpr) {
    const gl = this.gl;
    cssW = Math.max(1, Math.round(cssW));
    cssH = Math.max(1, Math.round(cssH));
    if (dpr === undefined) dpr = window.devicePixelRatio || 1;

    let scale = Math.min(dpr, 1.5);
    if (cssW * cssH * scale * scale > this.maxPixels) {
      scale *= Math.sqrt(this.maxPixels / (cssW * cssH * scale * scale));
    }
    scale = Math.max(1, scale);

    const bw = Math.max(1, Math.round(cssW * scale));
    const bh = Math.max(1, Math.round(cssH * scale));
    if (this.canvas.width !== bw || this.canvas.height !== bh) {
      this.canvas.width = bw;
      this.canvas.height = bh;
    }

    if (this.size[0] !== bw || this.size[1] !== bh) {
      if (this.rt) { gl.deleteTexture(this.rt.tex); gl.deleteFramebuffer(this.rt.fb); }
      this.rt = this._target(bw, bh);
      this.size = [bw, bh];

      const dw = Math.max(1, Math.round(bw * 0.5));
      const dh = Math.max(1, Math.round(bh * 0.5));
      [this.ping, this.pong].forEach((t) => {
        gl.bindTexture(gl.TEXTURE_2D, t.tex);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, dw, dh, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
        t.w = dw; t.h = dh;
      });
      this.cleared = false;
    }

    this.css = [cssW, cssH];
    // 坐标映射比例：从实际后备缓冲推，不用期望的 dpr
    this.cs = this.canvas.width / cssW;
    if (!this.cleared) { this.clearDust(); this.cleared = true; }
  }

  /** 新建的纹理内容是未定义的，不清就会在开头把画面冲成一片亮雾 */
  clearDust() {
    const gl = this.gl;
    gl.disable(gl.BLEND);
    gl.clearColor(0, 0, 0, 1);
    [this.ping, this.pong].forEach((t) => {
      gl.bindFramebuffer(gl.FRAMEBUFFER, t.fb);
      gl.viewport(0, 0, t.w, t.h);
      gl.clear(gl.COLOR_BUFFER_BIT);
    });
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  }

  /* ------------------------------------------------------------ 材质烘焙 */

  /**
   * 把一段结构柱材质渲进离屏 FBO 并读回成 PNG data URL。
   *
   * 这是"几何归布局、材质归 GPU"这个分工的落点：着色器负责生成，
   * 布局引擎负责摆放，两边不互相干扰。
   *
   * @param {number} band 0 穹乃额曼 / 1 达斯坦 / 2 麦西热甫
   * @param {number} w 纹理宽（按该段真实宽高比给，避免拉伸）
   * @param {number} h 纹理高
   * @param {number} [dim=1] 整体明度：暗版作底，亮版做高光层
   * @returns {string} data URL
   */
  bake(band, w, h, dim) {
    const gl = this.gl;
    const rt = this._target(w, h);
    gl.bindFramebuffer(gl.FRAMEBUFFER, rt.fb);
    gl.viewport(0, 0, w, h);
    gl.disable(gl.BLEND);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, null);   // 否则与当前帧缓冲形成反馈回路
    gl.useProgram(this.pScene);
    this._bindQuad(this.pScene);

    const u = this.uScene.u;
    gl.uniform1i(u.u_dust, 0);
    gl.uniform2f(u.u_buf, w, h);
    gl.uniform1f(u.u_cs, 1);
    gl.uniform4f(u.u_pillarCss, 0, 0, 1, 1);
    gl.uniform1f(u.u_time, 0);
    gl.uniform1f(u.u_stage, 0);
    gl.uniform1f(u.u_active, 0);
    gl.uniform1f(u.u_open, 1);
    gl.uniform1f(u.u_bandMode, band);
    gl.uniform1f(u.u_bandSeed, band * 3.7);
    gl.uniform2f(u.u_tile, w, h);
    gl.uniform1f(u.u_dim, dim === undefined ? 1 : dim);
    gl.uniform1f(u.u_deriv, this.derivatives ? 1 : 0);
    gl.uniform3fv(u.u_c1a, COLORS.seg1a);
    gl.uniform3fv(u.u_c1b, COLORS.seg1b);
    gl.uniform3fv(u.u_c1c, COLORS.seg1c);
    gl.uniform3fv(u.u_c2a, COLORS.seg2a);
    gl.uniform3fv(u.u_c2b, COLORS.seg2b);
    gl.uniform3fv(u.u_c3a, COLORS.seg3a);
    gl.uniform3fv(u.u_c3b, COLORS.seg3b);
    /* 注意类型要对上：
         u_lit[3] / u_breath[3]  是 float 数组 → uniform1fv
         u_segBound              是 vec4      → uniform4fv
       早先用 uniform1fv 去设 u_segBound，GL 报
       "Only array uniforms may have count > 1"（1282）——
       不抛异常，只在控制台刷警告，而且会让后续渲染状态不干净。 */
    gl.uniform1fv(this.uScene.a.u_lit, new Float32Array([1, 1, 1]));
    gl.uniform1fv(this.uScene.a.u_breath, new Float32Array(BREATH));
    gl.uniform4fv(this.uScene.a.u_segBound, new Float32Array(SEG_BOUNDS));
    gl.drawArrays(gl.TRIANGLES, 0, 3);

    const px = new Uint8Array(w * h * 4);
    gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, px);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.deleteTexture(rt.tex);
    gl.deleteFramebuffer(rt.fb);

    // GL 原点在左下，PNG 需要自上而下
    const out = document.createElement('canvas');
    out.width = w; out.height = h;
    const ctx = out.getContext('2d');
    const img = ctx.createImageData(w, h);
    for (let y = 0; y < h; y++) {
      const src = (h - 1 - y) * w * 4;
      img.data.set(px.subarray(src, src + w * 4), y * w * 4);
    }
    ctx.putImageData(img, 0, 0);
    return out.toDataURL('image/png');
  }

  /* -------------------------------------------------------------- 渲染 */

  /**
   * @param {object} st
   * @param {number} st.time 秒
   * @param {number} [st.velocity] 0..1.4 滚动惯性
   * @param {number} [st.frame] 帧序号
   * @param {number} [st.heat] 0..1 地火热度（chapter 模式）
   * @param {number[]} [st.center] 热量中心，归一化 uv（chapter 模式）
   */
  render(st) {
    const gl = this.gl;
    const bw = this.size[0], bh = this.size[1];
    if (!bw) return;

    /* ---- pass 1：浮尘反馈场（两种模式共用） ---- */
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.pong.fb);
    gl.viewport(0, 0, this.pong.w, this.pong.h);
    gl.disable(gl.BLEND);
    gl.useProgram(this.pDust);
    this._bindQuad(this.pDust);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.ping.tex);
    gl.uniform1i(this.uDust.a.u_prev, 0);
    gl.uniform2f(this.uDust.u.u_res, this.pong.w, this.pong.h);
    gl.uniform1f(this.uDust.u.u_time, st.time);
    gl.uniform1f(this.uDust.u.u_vel, st.velocity || 0);
    gl.uniform1f(this.uDust.u.u_frame, st.frame || 0);
    gl.uniform1f(this.uDust.u.u_amount, this.dustAmount);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    const tmp = this.ping; this.ping = this.pong; this.pong = tmp;

    /* ---- pass 2：底层画面（房间 / 地火 / 麦西热甫纹样） ----
       mode 'pattern' 用程序化维吾尔几何纹样当底，不铺地火 ——
       麦西热甫是"热闹"的一段，纹样比火焰更贴它的性格。 */
    const chapter = this.mode === 'chapter' || this.mode === 'pattern';
    const pattern = this.mode === 'pattern';
    gl.bindFramebuffer(gl.FRAMEBUFFER, chapter ? this.rt.fb : null);
    gl.viewport(0, 0, bw, bh);
    gl.clearColor(0, 0, 0, 1);
    gl.clear(gl.COLOR_BUFFER_BIT);

    if (pattern) {
      gl.useProgram(this.pMashraq);
      this._bindQuad(this.pMashraq);
      const u = this.uMashraq.u;
      gl.uniform1f(u.u_time, st.time);
      gl.uniform2f(u.u_res, bw, bh);
      gl.uniform1f(u.u_heat, st.heat === undefined ? this.heat : st.heat);
      gl.uniform1f(u.u_scale, this.patternScale);
      gl.uniform1f(u.u_zoom, this.patternZoom);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    } else if (chapter) {
      gl.useProgram(this.pEmber);
      this._bindQuad(this.pEmber);
      const u = this.uEmber.u;
      gl.uniform1f(u.u_time, st.time);
      gl.uniform2f(u.u_res, bw, bh);
      /* emberGain 是**亮度**倍率，乘在 heat 上。
         别拿 emberScale 当亮度用 —— 那个是纹样粗细（uv 的 u_scale），
         调它只会让火纹变大变小，不会变暗（踩过：
         把 emberGain 乘到 emberScale 上，页面上火一点没暗）。 */
      gl.uniform1f(u.u_heat,
        (st.heat === undefined ? this.heat : st.heat) * this.emberGain);
      gl.uniform1f(u.u_scale, this.emberScale);
      gl.uniform2f(u.u_center, this.center[0], this.center[1]);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    }

    /* ---- pass 3：空气层 / 房间层，上屏 ---- */
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, bw, bh);
    gl.useProgram(chapter ? this.pChapterAir : this.pAir);
    this._bindQuad(chapter ? this.pChapterAir : this.pAir);

    if (chapter) {
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, this.ping.tex);
      gl.activeTexture(gl.TEXTURE1);
      gl.bindTexture(gl.TEXTURE_2D, this.rt.tex);
      gl.uniform1i(this.uCAir.a.u_air, 0);
      gl.uniform1i(this.uCAir.a.u_layer, 1);
      gl.uniform2f(this.uCAir.u.u_buf, bw, bh);
      gl.uniform1f(this.uCAir.u.u_time, st.time);
      gl.uniform1f(this.uCAir.u.u_wallGain, this.wallGain);
      gl.uniform1f(this.uCAir.u.u_heat, st.heat === undefined ? this.heat : st.heat);
      gl.uniform1f(this.uCAir.u.u_vigHeavy, pattern ? 0 : 1);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      gl.activeTexture(gl.TEXTURE0);
    } else {
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, this.ping.tex);
      gl.uniform1i(this.uAir.a.u_dust, 0);
      gl.uniform2f(this.uAir.u.u_buf, bw, bh);
      gl.uniform1f(this.uAir.u.u_time, st.time);
      gl.uniform1f(this.uAir.u.u_wallGain, this.wallGain);
      gl.uniform1f(this.uAir.u.u_muralGain, this.muralGain);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    }
  }

  /* ---------------------------------------------------------- 性能自适应 */

  /** 帧时连续偏慢就减尘埃，仍然慢就整体降级 */
  sample(dt) {
    if (this.degraded) return;
    this.frameTimes.push(dt);
    if (this.frameTimes.length < 90) return;
    const avg = this.frameTimes.reduce((a, b) => a + b, 0) / this.frameTimes.length;
    this.frameTimes.length = 0;
    if (avg > 26 && this.dustAmount > 14) this.dustAmount -= 7;
    else if (avg < 17 && this.dustAmount < 28) this.dustAmount += 4;
    if (this.dustAmount <= 14 && avg > 30) this.degraded = true;
  }
}

__ns = __XM[1];
__ns.mount_COLORS = function () { return COLORS; };
__ns.mount_SEG_H = function () { return SEG_H; };
__ns.mount_SEG_BOUNDS = function () { return SEG_BOUNDS; };
__ns.mount_BREATH = function () { return BREATH; };
__ns.mount_Renderer = function () { return Renderer; };
}

/* ── js/lib/guide-actor.js ── */
function __M2__() {
/* Six-pose 2.5D actor. Animation follows conversation state and pauses offscreen. */
function createGuideActor({ host, image, source, reduced = false, preview = false }) {
  const canvas = document.createElement('canvas');
  canvas.className = 'guide-actor';
  canvas.width = 420;
  canvas.height = 630;
  canvas.setAttribute('aria-hidden', 'true');
  host.insertBefore(canvas, image);
  canvas.hidden = true;
  const context = canvas.getContext('2d');
  const sheet = new Image();
  let loaded = false, raf = 0, mode = 'idle', frame = 0, previous = 0;
  let changed = 0, started = performance.now(), lastDraw = 0, visible = !preview;
  let gestureUntil = 0;
  const phase = preview ? Math.random() * 5000 : 0;
  const frameAt = now => {
    if (reduced) return 0;
    if (gestureUntil > now) return 3;
    if (mode === 'talking') return [4, 5, 4, 2][Math.floor((now - started) / 850) % 4];
    if (mode === 'hint') return [3, 2, 0][Math.floor((now - started) / 1800) % 3];
    const t = (now - started + phase) % 16000;
    if (t > 2500 && t < 2670) return 1;
    if (t > 6700 && t < 8200) return 2;
    if (t > 11700 && t < 13200) return 3;
    return 0;
  };
  function drawPose(index, opacity) {
    const cellW = sheet.naturalWidth / 3, cellH = sheet.naturalHeight / 2;
    const bounds = /qinglan/.test(source) ? [[0,0,449,627],[449,0,385,627],[834,0,420,627],[0,627,449,627],[449,627,385,627],[834,627,420,627]] : null;
    const rect = bounds?.[index] || [(index % 3) * cellW, Math.floor(index / 3) * cellH, cellW, cellH];
    const [sx,sy,w,h] = rect;
    const scale = Math.min((canvas.width - 22) / w, (canvas.height - 28) / h);
    const width = w * scale, height = h * scale;
    context.globalAlpha = opacity;
    context.drawImage(sheet, sx, sy, w, h,
      (canvas.width - width) / 2, canvas.height - height - 14, width, height);
  }
  function draw(now) {
    if (!loaded) return;
    const next = frameAt(now);
    if (next !== frame) { previous = frame; frame = next; changed = now; }
    canvas.dataset.frame = String(frame);
    canvas.dataset.mode = mode;
    context.clearRect(0, 0, canvas.width, canvas.height);
    context.save();
    if (!reduced) {
      const breathe = Math.sin(now / 1500) * 1.8;
      context.translate(canvas.width / 2, canvas.height - 15);
      context.scale(1 + breathe / 1000, 1 - breathe / 900);
      context.translate(-canvas.width / 2, -(canvas.height - 15));
    }
    const mix = reduced ? 1 : Math.min(1, (now - changed) / 180);
    if (mix < 1 && previous !== frame) drawPose(previous, 1 - mix);
    drawPose(frame, mix < 1 && previous !== frame ? mix : 1);
    context.restore();
    context.globalAlpha = 1;
  }
  function loop(now) {
    raf = 0;
    if (!loaded || document.hidden || !visible || reduced) return;
    if (now - lastDraw >= 1000 / 24) { draw(now); lastDraw = now; }
    raf = requestAnimationFrame(loop);
  }
  function resume() { if (!raf && loaded && visible && !document.hidden && !reduced) raf = requestAnimationFrame(loop); }
  function pause() { cancelAnimationFrame(raf); raf = 0; }
  const onVisibility = () => document.hidden ? pause() : resume();
  document.addEventListener('visibilitychange', onVisibility);
  const observer = 'IntersectionObserver' in window ? new IntersectionObserver(entries => {
    visible = entries[0].isIntersecting;
    if (visible) resume(); else pause();
  }) : null;
  observer?.observe(host);
  if (!observer) visible = true;
  sheet.onload = () => {
    loaded = true; image.hidden = true; canvas.hidden = false;
    host.classList.add('has-guide-actor');
    draw(performance.now()); resume();
  };
  // Retain the approved still as a graceful fallback if an atlas cannot load.
  sheet.onerror = () => { image.hidden = false; canvas.hidden = true; };
  sheet.src = source;
  return {
    setMode(value) { mode = value; started = performance.now(); if (loaded) draw(performance.now()); resume(); },
    wave() { if (reduced) return; gestureUntil = performance.now() + 1300; resume(); },
    state: () => ({ loaded, frame, mode, animated: !!raf, source }),
    destroy() { pause(); observer?.disconnect(); document.removeEventListener('visibilitychange', onVisibility); sheet.onload = null; sheet.onerror = null; canvas.remove(); image.hidden = false; host.classList.remove('has-guide-actor'); },
  };
}

__ns = __XM[2];
__ns.mount_createGuideActor = function () { return createGuideActor; };
}

/* ── js/lib/companion.js ── */
function __M3__() {
var createGuideActor = __XM[2]["createGuideActor"];

/* Virtual companions: local, curated chapter conversations. No remote chat service. */
const CHARACTERS = [
  { id: 'uyghur', name: '弦歌', culture: '维吾尔族主题', role: '听见旋律的变化', color: '#81b69c', intro: '从一声琴音开始，我陪你听完这一程。', file: 'xiange.png', atlas: 'xiange-motion-v2.png' },
  { id: 'miao', name: '银铃', culture: '苗族主题', role: '发现音乐里的故事', color: '#a4b7e1', intro: '每一段音乐都有故事，我们一起慢慢发现。', file: 'yinling.png', atlas: 'yinling-motion-v2.png' },
  { id: 'mongol', name: '青岚', culture: '蒙古族主题', role: '探索声音的联系', color: '#d6af70', intro: '跟着声音往前走，看看不同的音乐如何相遇。', file: 'qinglan.png', atlas: 'qinglan-motion-v2.png' },
];
const KEY = 'xiangmai.guide.v1';
const AUTO_KEY = 'xiangmai.guide.auto.v1';
const TOPICS = {
  qon: {
    title: '第二章 · 穹乃额曼',
    hello: '这一章先听“自由”，再听节拍怎样进入。想从哪里开始？',
    topics: [
      ['这一章先听什么？', '先留意散板序唱：节奏自由，人声与弦乐展开。接着听手鼓进入后，音乐怎样逐步走向有节拍的推进。'],
      ['为什么开篇没有手鼓？', '这一页介绍的开篇是散板序唱，没有固定节拍。萨它尔的旋律确立母调，进入太孜等节拍性段落后，手鼓才建立节奏框架。'],
      ['带我试试拉琴', '拖动琴弓，听声音跟着手势变化：你拖多快，它就多快；你停，它就停。底下的持续音托住你拉出的旋律。', '#bow-act'],
    ],
    hints: [
      ['#part-body > .act', '从这里开始，试着留意：自由的散板，怎样逐步走进有节拍的音乐。'],
      ['#bow-act', '轮到你来拉琴了。拖动琴弓，让“节奏自由”变成手里的感觉。'],
    ],
  },
  dastan: {
    title: '第三章 · 达斯坦', hello: '现在走进叙事。留意歌曲和器乐间奏怎样轮流把故事往前推。',
    topics: [
      ['达斯坦有什么不同？', '这一章的核心是叙事。歌曲与器乐间奏交替推进，整体速度逐渐上升，和前一章盘旋展开的听感不同。'],
      ['间奏只是休息吗？', '这页把歌曲理解为“说”，器乐间奏理解为“歇并推进”。间奏既给叙事换气，也继续推动情绪。'],
      ['谁在讲故事？', '主演者称为“达斯坦奇”，常自弹自唱，助演者击节或帮腔。可以到“主要乐器及角色”一节，看演唱与伴奏怎样分工。', '#part-body > .act:nth-child(3)'],
    ],
    hints: [['#part-body > .act', '这一章的线索是故事。试着分辨：什么时候在“说”，什么时候器乐接过了叙事。']],
  },
  mashrap: {
    title: '第四章 · 麦西热甫', hello: '从听故事走向下场参与。我们可以先试节奏，再加入舞圈。',
    topics: [
      ['这章怎样体验？', '先到节奏台自己敲一段，再到舞圈逐个加入人物。想感受落在拍上的时刻，可以打开“跟着鼓点跳”。'],
      ['带我敲一段', '在节奏轨道上敲，观察手鼓与铁环的记号怎样亮起来。页面里的合成节奏用于说明结构，不是某套木卡姆的原始记谱。', '#rlab-act'],
      ['一起进入舞圈', '点击舞圈会加入人物，鼓点与纹样随人数变化。自由加入模式随时可点；踩拍模式让你体会跟上鼓点的时刻。', '#mq-act'],
    ],
    hints: [['#rlab-act', '试着亲手敲一段。你会同时听到声音、看到节奏记号亮起来。'], ['#mq-act', '我们一起进圈吧！想试一试跟拍，可以打开圆圈下方的“跟着鼓点跳”。']],
  },
  lishi: {
    title: '第五章 · 历史与传承', hello: '这一章看看音乐怎样被记录、整理，又怎样继续在人与人之间传下去。',
    topics: [
      ['从哪里开始看？', '先沿时间轴看渊源，再看经典化与抢救记录，最后留意当代运用。它们讲的是同一条传承链的不同环节。', '#act-1'],
      ['录音能代替传承吗？', '记录保存了声音，传习延续了人的经验。可以把本章的抢救记录与传承案例放在一起看：资料与活态实践各自承担什么。'],
      ['带我看看当代案例', '到本章末尾看看当代运用，再比较：音乐进入新的场景时，哪些表达延续了，哪些呈现发生了变化。', '.cases-host'],
    ],
    hints: [['#act-1', '这条时间轴把渊源串起来了。你也可以问我，接下来哪一段值得留意。'], ['.cases-host', '来到当代案例了。试着把这些场景和前面读到的传统形式联系起来。']],
  },
  fulu: {
    title: '附录 · 形制比较', hello: '这里把结构变成可以操作的轮盘与旋律入口。我们换一种方式回看全站。',
    topics: [
      ['怎样使用轮盘？', '点击轮盘中的条目，观察读数怎样变化，把名称与前面章节的结构联系起来。', '#wheel-act'],
      ['带我听八音', '到八音旋律区操作声音，再进入对应民族的档案。这里是探索入口，各民族的音乐形态还需要分别了解。', '#melody-act'],
      ['这些声音来自哪里？', '页面提供了“参考来源”一节。示意声音与真实资料的区别，要以该节的具体说明为准。', '#sources-host'],
    ],
    hints: [['#wheel-act', '试着选一个轮盘条目，让前面读到的名称和结构连起来。'], ['#melody-act', '不同民族的声音入口都在这里。选一个感兴趣的，再去档案里深入看。']],
  },
  bain: {
    title: '八音 · 八族档案', hello: '每张档案卡都是一个新的入口。我们可以按声音、故事或乐器来探索。',
    topics: [
      ['这里有哪些内容？', '这里集中展示壮族、蒙古族、侗族、满族、苗族、彝族、傣族与藏族的相关档案。点击卡片可以阅读具体形式和资料来源。', '#hub'],
      ['怎样比较这些音乐？', '先看每页的音乐或叙事形式，再看演唱、乐器与传承场景。不同地区和传统各有特点，不必把它们归成同一种音乐。'],
      ['资料来源在哪里？', '各民族档案页分别列出资料来源；部分内容来自作者提供的文档，其他内容给出可打开的公开资料链接。'],
    ], hints: [['#hub', '从这里选一张档案卡。我们的同行者会陪你进入下一页。']],
  },
};

function mountCompanion({ active }) {
  if (document.getElementById('guide-dock')) return null;
  const script = [...document.scripts].find(s => /\/js\/dist\/[^/]+\.js(?:\?|$)/.test(s.src));
  if (!script) return null;
  const root = new URL('../../', script.src);
  const asset = file => new URL('assets/img/guides/' + file, root).href;
  const stylesheet = document.createElement('link');
  stylesheet.rel = 'stylesheet';
  stylesheet.href = new URL('styles/companion.css', root).href;
  document.head.appendChild(stylesheet);
  const read = (key, fallback) => { try { return localStorage.getItem(key) || fallback; } catch { return fallback; } };
  const save = (key, value) => { try { localStorage.setItem(key, value); } catch { /* Keep this visit usable without storage. */ } };
  let selected = CHARACTERS.find(c => c.id === read(KEY, '')) || null;
  let auto = read(AUTO_KEY, '1') !== '0';
  let shown = false;
  let timer = 0;
  let stateTimer = 0;
  let actor = null;
  let arrivalTimer = 0;
  let arrivalLines = [];
  let arrivalIndex = -1;
  let arrivalActive = false;
  let lastHint = -Infinity;
  let lastInteraction = -Infinity;
  const seen = new Set();
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const dock = document.createElement('aside');
  dock.id = 'guide-dock';
  dock.className = 'guide-dock';
  dock.hidden = !selected;
  dock.dataset.state = 'idle';
  dock.innerHTML = '<div class="guide-hint" hidden><button class="guide-hint__close" type="button" aria-label="关闭这条提示">×</button><span class="guide-hint__eyebrow">同行者的悄悄话</span><p aria-live="polite"></p><div class="guide-hint__steps" hidden><span></span><button type="button" class="guide-hint__next">下一句 →</button></div><button class="guide-hint__talk" type="button">继续聊聊 ↗</button></div>' +
    '<section class="guide-dialog" id="guide-dialog" aria-label="同行者对话" hidden>' +
    '<header><div><span class="guide-dialog__eyebrow">你的同行者</span><h2></h2></div><button class="guide-dialog__close" type="button" aria-label="收起对话">×</button></header>' +
    '<p class="guide-dialog__chapter"></p><p class="guide-dialog__reply" aria-live="polite"></p>' +
    '<div class="guide-dialog__topics"></div><button class="guide-dialog__go" type="button" hidden>带我去体验 ↗</button>' +
    '<footer><button class="guide-dialog__switch" type="button">更换同行者</button><label><input type="checkbox" class="guide-auto">沿途提示</label></footer>' +
    '</section><button class="guide-launcher" type="button" aria-controls="guide-dialog" aria-expanded="false"><img alt="" decoding="async"><span></span><i aria-hidden="true"></i></button>';
  document.body.appendChild(dock);
  const launcher = dock.querySelector('.guide-launcher');
  const dialog = dock.querySelector('.guide-dialog');
  const hint = dock.querySelector('.guide-hint');
  const reply = dock.querySelector('.guide-dialog__reply');
  const topics = dock.querySelector('.guide-dialog__topics');
  const go = dock.querySelector('.guide-dialog__go');
  const autoInput = dock.querySelector('.guide-auto');
  let destination = null;
  let selectionRegion = null;

  function page() {
    if (document.getElementById("inherit-act")) return {
      title: "传承之路 · " + (document.getElementById("g-title")?.textContent || "情境体验"),
      hello: "我们来到情境体验了。先读故事，再做自己的选择。",
      topics: [
        ["这一关怎么玩？", "阅读当前情境，选择你认为能帮助传承的做法，再观察故事的反馈。这是一段概念情境体验。", "#inherit-act"],
        ["这些影像是真实记录吗？", "站内对这两处关卡影像的说明是：AI 生成的概念影像，场景与人物虚构，不是实拍记录。"],
        ["体验后可以想一想什么？", "把自己的选择和故事反馈放在一起想：保存资料、学习实践与继续传习，分别怎样让一种传统延续？"],
      ], hints: [],
    };
    if (document.body.dataset.ethnic) {
      const title = document.title.split('｜')[0];
      const excerpt = document.querySelector('.h-p')?.textContent || '阅读这份档案，了解具体音乐形式与资料来源。';
      return { title, hello: '我们来到新的民族档案了。先看这页自己的形式与资料，再和其他传统比较。', topics: [
        ['这页讲的是什么？', excerpt],
        ['我该留意什么？', '可以先看本页列出的流传地区、形态与乐器，再读正文。不同地区的版本和传承场景，要按本页的具体说明来理解。', '#ethnic'],
        ['在哪里查看资料来源？', '继续向下阅读本页的资料来源。我们用这些具体资料理解传统，也把概念示意和真实记录区分开。', '.h-srcs'],
      ], hints: [['.h-block', '到这一页，先看它自己的地区与形式。每一种传统都有独特的传承场景。']] };
    }
    return TOPICS[active] || TOPICS.bain;
  }

  function chapterLines() {
    const lines = {
      qon: ['我们来到穹乃额曼。先不用急着记名称，听它怎样从自由的散板展开。', '这一章的线索是：从舒缓走向明朗，手鼓进入后，音乐开始有了节拍。', '往后还有拉琴体验。你可以直接问我“带我试试拉琴”，亲手感受节奏自由。'],
      dastan: ['第三章，我们一起走进达斯坦的故事。这里的音乐开始带着叙事往前走。', '留意歌曲与器乐间奏的交替：一段讲述之后，器乐接过情绪，继续推进。', '这一章可以慢慢看场景，也可以点我聊聊“间奏只是休息吗”。'],
      mashrap: ['来到麦西热甫，轮到我们下场参与了！人物会加入舞圈，鼓点也会逐渐热闹起来。', '先试节奏台：亲手敲一段，看声音与记号怎样一起变化。', '然后一起进入舞圈。打开“跟着鼓点跳”，试着在鼓点上加入。'],
      lishi: ['这一章换个角度，看看音乐怎样走到今天，又怎样继续传下去。', '沿时间轴读渊源，再看记录、整理与传习，把它们连成一条线。', '读到后面的当代案例时，我们再一起想想：换了场景，音乐的哪些部分还在？'],
      fulu: ['走到附录，我们可以用轮盘与旋律，重新看一遍前面的结构。', '先选一个轮盘条目，把名称和你刚才听过、玩过的内容连起来。', '八音还连着不同民族的档案。选一个感兴趣的，我们一起继续探索。'],
      bain: ['这里是八族档案，一张卡片就是一段新的音乐旅程。', '可以按乐器、声音或故事选一个入口；每一页都写了自己的形式和资料来源。', '不用一次读完。选你最感兴趣的一张，我会继续陪你。'],
    };
    if (document.body.dataset.ethnic) return ['我们来到'+page().title+'。这一页要先看它自己的地区与音乐形式。', '留意正文介绍的演唱、乐器与传承场景，和前面熟悉的内容有什么不同。', '资料来源在页末。想先抓住重点，可以点我问“这页讲的是什么”。'];
    if (document.getElementById('inherit-act')) return ['我们进入传承之路的情境体验了。先读眼前的故事，再做自己的选择。', '每一个选择都有反馈。看看你的做法怎样影响这个故事里的传承。', '这里的影像是虚构概念影像。体验结束后，可以再想想真实传承需要怎样的实践。'];
    return lines[active] || [page().hello, '想知道这一页的重点，可以随时点我。', '我们按自己的节奏慢慢探索。'];
  }
  function cancelArrival() {
    clearTimeout(arrivalTimer);
    arrivalActive = false;
    hint.querySelector('.guide-hint__steps').hidden = true;
  }
  function nextArrival() {
    clearTimeout(arrivalTimer);
    if (!arrivalActive || !selected || !auto || shown) { cancelArrival(); return; }
    arrivalIndex++;
    if (arrivalIndex >= arrivalLines.length) { dismissHint(); return; }
    showHint(arrivalLines[arrivalIndex], true);
    const steps = hint.querySelector('.guide-hint__steps');
    steps.hidden = false;
    steps.querySelector('span').textContent = (arrivalIndex + 1) + ' / ' + arrivalLines.length;
    steps.querySelector('button').textContent = arrivalIndex === arrivalLines.length - 1 ? '开始探索 ✓' : '下一句 →';
    const duration = Math.max(6500, Math.min(10000, arrivalLines[arrivalIndex].length * 120 + 2000));
    arrivalTimer = setTimeout(() => document.hidden ? cancelArrival() : nextArrival(), duration);
  }
  function startArrival(chosen = false) {
    if (!selected || !auto || shown || document.hidden) return;
    cancelArrival();
    arrivalLines = chapterLines();
    if (chosen) arrivalLines[0] = selected.intro + ' ' + arrivalLines[0];
    arrivalIndex = -1;
    arrivalActive = true;
    nextArrival();
  }

  function state(value, ms = 0) {
    clearTimeout(stateTimer);
    dock.dataset.state = value;
    actor?.setMode(value);
    if (ms) stateTimer = setTimeout(() => { dock.dataset.state = 'idle'; actor?.setMode('idle'); }, ms);
  }
  function dismissHint() {
    cancelArrival();
    clearTimeout(timer);
    hint.hidden = true;
    if (!shown) state('idle');
  }
  function say(text, target) {
    reply.textContent = text;
    destination = target ? document.querySelector(target) : null;
    go.hidden = !destination;
    state('talking', Math.max(3500, Math.min(11000, text.length * 85)));
  }
  function renderTopics() {
    topics.replaceChildren();
    for (const [label, text, target] of page().topics) {
      const button = document.createElement('button');
      button.type = 'button';
      button.textContent = label;
      button.addEventListener('click', () => {
        lastInteraction = performance.now();
        topics.querySelectorAll('button').forEach(b => b.setAttribute('aria-pressed', String(b === button)));
        say(text, target);
      });
      topics.appendChild(button);
    }
  }
  function openPanel(focus = true) {
    if (!selected) return;
    dismissHint();
    shown = true;
    dialog.hidden = false;
    launcher.setAttribute('aria-expanded', 'true');
    dock.querySelector('.guide-dialog__chapter').textContent = page().title;
    renderTopics();
    say(selected.intro + ' ' + page().hello);
    if (focus) topics.querySelector('button')?.focus();
  }
  function closePanel(focus = true) {
    shown = false;
    dialog.hidden = true;
    launcher.setAttribute('aria-expanded', 'false');
    state('idle');
    lastInteraction = performance.now();
    if (focus) launcher.focus();
  }
  function showHint(text, force = false) {
    if (!selected || !auto || shown || document.hidden) return false;
    if (!force && (performance.now() - lastHint < 25000 || performance.now() - lastInteraction < 12000)) return false;
    hint.querySelector('p').textContent = selected.name + '：' + text;
    hint.hidden = false;
    state(arrivalActive ? 'talking' : 'hint');
    lastHint = performance.now();
    clearTimeout(timer);
    if (!arrivalActive) timer = setTimeout(dismissHint, 12000);
    return true;
  }
  function updateCharacter() {
    dock.hidden = !selected;
    if (!selected) return;
    dock.style.setProperty('--guide-color', selected.color);
    actor?.destroy();
    const portrait = launcher.querySelector('img');
    portrait.src = asset(selected.file);
    actor = createGuideActor({ host: launcher, image: portrait, source: asset(selected.atlas), reduced });
    launcher.querySelector('span').textContent = selected.name + ' · 聊聊';
    launcher.setAttribute('aria-label', '与同行者' + selected.name + '聊聊本章');
    dock.querySelector('.guide-dialog h2').textContent = selected.name;
    autoInput.checked = auto;
    selectionRegion?.querySelectorAll('[data-guide]').forEach(button => {
      const isSelected = button.dataset.guide === selected.id;
      button.setAttribute('aria-pressed', String(isSelected));
      button.querySelector('.guide-card__action').textContent = isSelected ? '已选择 · 一起出发' : '选我同行 ↗';
    });
  }
  function choose(id) {
    selected = CHARACTERS.find(c => c.id === id) || CHARACTERS[0];
    save(KEY, selected.id);
    closePanel(false);
    updateCharacter();
    const status = selectionRegion?.querySelector('.guide-selection__status');
    if (status) status.textContent = '已选择' + selected.name + '。后面的章节，我会继续陪你；想聊聊时，点右下角的我。';
    startArrival(true);
  }
  function showSwitch() {
    closePanel(false);
    dismissHint();
    dialog.hidden = false;
    shown = true;
    launcher.setAttribute('aria-expanded', 'true');
    reply.textContent = '换一位同行者，一起继续探索。';
    topics.replaceChildren();
    go.hidden = true;
    for (const character of CHARACTERS) {
      const button = document.createElement('button');
      button.type = 'button';
      button.textContent = character.name + ' · ' + character.culture;
      button.addEventListener('click', () => { choose(character.id); openPanel(); });
      topics.appendChild(button);
    }
    topics.querySelector('button')?.focus();
  }
  launcher.addEventListener('pointerenter', () => actor?.wave());
  launcher.addEventListener('click', () => shown ? closePanel() : openPanel());
  dock.querySelector('.guide-hint__next').addEventListener('click', nextArrival);
  dock.querySelector('.guide-dialog__close').addEventListener('click', () => closePanel());
  dock.querySelector('.guide-hint__close').addEventListener('click', () => { dismissHint(); lastInteraction = performance.now(); });
  dock.querySelector('.guide-hint__talk').addEventListener('click', () => openPanel());
  dock.querySelector('.guide-dialog__switch').addEventListener('click', showSwitch);
  autoInput.addEventListener('change', () => { auto = autoInput.checked; save(AUTO_KEY, auto ? '1' : '0'); if (!auto) dismissHint(); });
  go.addEventListener('click', () => {
    closePanel(false);
    destination?.scrollIntoView({ behavior: reduced ? 'instant' : 'smooth', block: 'center' });
  });
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && shown) closePanel(); else if (e.key === 'Escape') dismissHint(); });
  window.addEventListener('storage', e => {
    if (e.key === KEY || e.key === AUTO_KEY || e.key === null) {
      selected = CHARACTERS.find(c => c.id === read(KEY, '')) || null;
      auto = read(AUTO_KEY, '1') !== '0';
      closePanel(false); dismissHint(); updateCharacter();
    }
  });
  updateCharacter();

  requestAnimationFrame(() => {
    if (active === 'qon') {
      selectionRegion = document.createElement('section');
      selectionRegion.id = 'guide-selection';
      selectionRegion.className = 'guide-selection';
      selectionRegion.setAttribute('aria-labelledby', 'guide-selection-title');
      selectionRegion.innerHTML = '<div class="guide-selection__heading"><p>沿着弦脉 · 结伴而行</p><h2 id="guide-selection-title">选一位同行者，听见更多故事</h2><p>从这一章开始，陪你听、陪你看，也陪你亲手试一试。</p></div>' +
        '<div class="guide-selection__cards">' + CHARACTERS.map(c => '<button type="button" class="guide-card" data-guide="' + c.id + '" aria-pressed="false" style="--guide-color:' + c.color + '">' +
          '<span class="guide-card__stage"><img src="' + asset(c.file) + '" alt="' + c.culture + '虚构向导' + c.name + '" decoding="async" width="1024" height="1536"></span>' +
          '<span class="guide-card__culture">' + c.culture + '</span><strong>' + c.name + '</strong><span class="guide-card__role">' + c.role + '</span><span class="guide-card__action">选我同行 ↗</span></button>').join('') + '</div>' +
        '<p class="guide-selection__status" aria-live="polite">选中人物后，点击右下角的同行者，就能聊聊当前章节。</p><p class="guide-selection__note">虚构文化向导 · AI 创作形象与服饰概念示意</p>';
      const hero = document.getElementById('part-hero');
      hero?.insertAdjacentElement('afterend', selectionRegion);
      selectionRegion.addEventListener('click', e => {
        const button = e.target.closest('[data-guide]');
        if (button) choose(button.dataset.guide);
      });
      const heroInner = hero?.querySelector('.chapter-hero__inner');
      if (heroInner) {
        const link = document.createElement('a');
        link.className = 'guide-entry';
        link.href = '#guide-selection';
        link.textContent = '遇见你的同行者 ↓';
        heroInner.appendChild(link);
      }
      updateCharacter();
      selectionRegion.querySelectorAll('.guide-card').forEach(button => {
        const character = CHARACTERS.find(c => c.id === button.dataset.guide);
        createGuideActor({ host: button.querySelector('.guide-card__stage'), image: button.querySelector('img'), source: asset(character.atlas), reduced, preview: true });
      });
    }
    arrivalTimer = setTimeout(() => startArrival(), 1600);
    if ('IntersectionObserver' in window) {
      const observer = new IntersectionObserver(entries => {
        for (const entry of entries) {
          if (!entry.isIntersecting || seen.has(entry.target) || scrollY < innerHeight * .5) continue;
          if (showHint(entry.target.dataset.guideHint)) seen.add(entry.target);
        }
      }, { threshold: .2 });
      for (const [selector, text] of page().hints) {
        const element = document.querySelector(selector);
        if (element) { element.dataset.guideHint = text; observer.observe(element); }
      }
    }
  });
  const api = { choose, open: openPanel, close: closePanel, actor: () => actor?.state(), state: () => ({ selected: selected?.id || null, auto, open: shown, chapter: page().title, mode: dock.dataset.state, arrival: arrivalActive, arrivalIndex }) };
  window.__XM_GUIDE__ = api;
  return api;
}

__ns = __XM[3];
__ns.mount_mountCompanion = function () { return mountCompanion; };
}

/* ── js/lib/sequencer.js ── */
function __M4__() {
/* ==========================================================================
   弦脉 · 手鼓音序器
   --------------------------------------------------------------------------
   —— 时间尺度是这套东西的关键，先说清楚 ——

   人耳感知"节拍"有门槛：相邻两声超过约 1.5–2 秒，就不再被听成节奏，
   而是一声一声孤立的响。所以散板也不能真的散到五六秒一记 ——
   那不叫"疏"，那叫"断"。

   这里定的规矩：
     · 一个乐句 = 12 拍，时长压到 5–6 秒（有效拍感 120–150 bpm）
     · 音间间隔不超过约 1 秒 —— 留白靠"轻音填空"，不靠真空
     · 一轮四个乐句约 21–24 秒，循环一次刚好听得出起承转合，又不嫌长

   —— 五种音色（全部加法合成，无采样）——
     dum    低音：正弦 118→46Hz，叠三角波给"皮"的质感
     tek    边击：带通噪声 + 极短皮面音
     snap   脆击：噪声高频 + 音高上扬的短音，麦西热甫的尖点
     mute   闷击：闭音，decay 极短，用来收紧句尾
     roll   指滚：噪声被 52Hz 调制，一口气碾过去

   —— 三段的性格差异 ——
     穹乃额曼  慢而不空。骨架极简，靠轻音把时间撑住；声场最远最暗
     达斯坦    中速规整。走句与加花，密度上升但留气口；中景
     麦西热甫  快而密。十六分与三连音交织，句句相扣；最近最亮

   每记带 ±1.8% 的音高抖动与 ±4ms 的时间偏移 —— 人手的不精确，
   这是"顺耳"和"机械"的分界线。
   ========================================================================== */

/* 一拍里的细分密度：1 = 疏（散板感），2 = 八分，3 = 三连音。

   pulse 是"脉冲轨"：当主节奏留下过长的空档时，自动补一记极轻的边击。
   它的作用不是加音符，而是给耳朵一个稳定的时间参照 ——
   有了它，骨架才敢真的稀疏。真实鼓乐合奏里本来就有这种持续脉动。

   pulseEvery  补点的最小间隔（步）
   pulseGain   补点力度（很轻，是"气息"不是"音符"）
   pulseGuard  离主音太近就不补（步）—— 否则补点会贴在主音前十几毫秒，
               糊成一个 flam，反而更脏 */
const PATTERNS = [
  { // ── 穹乃额曼：慢而不空。骨架极简，靠脉冲轨把时间撑住 ──
    bpm: 108,
    pulseEvery: 2, pulseGain: 0.085, pulseGuard: 0,
    phrases: [
      { div: 1, steps: [
        { b: 0, s: 'dum', g: 0.40, a: 1 },
        { b: 3, s: 'tek', g: 0.13 },          // 轻音填空，避免"断"
        { b: 6, s: 'mute', g: 0.15 },
        { b: 9, s: 'tek', g: 0.12 },
      ] },
      { div: 2, steps: [
        { b: 0, s: 'dum', g: 0.42, a: 1 },
        { b: 4, s: 'tek', g: 0.14 },
        { b: 8, s: 'dum', g: 0.28 },
        { b: 11, s: 'tek', g: 0.12 },         // 句尾挂一下，接回第一句
      ] },
      { div: 1, steps: [
        { b: 0, s: 'dum', g: 0.40, a: 1 },
        { b: 3, s: 'tek', g: 0.15 },
        { b: 6, s: 'dum', g: 0.26 },
        { b: 9, s: 'mute', g: 0.16 },
      ] },
      { div: 2, steps: [
        { b: 0, s: 'dum', g: 0.44, a: 1 },
        { b: 3, s: 'tek', g: 0.13 },
        { b: 6, s: 'tek', g: 0.15 },
        { b: 9, s: 'roll', g: 0.13 },         // 一口气滚过去，回到起点
      ] },
    ],
  },
  { // ── 达斯坦：规整 12 拍。有走句，有气口 ──
    bpm: 122,
    pulseEvery: 3, pulseGain: 0.070, pulseGuard: 1,
    phrases: [
      { div: 2, steps: [
        { b: 0, s: 'dum', g: 0.38, a: 1 },
        { b: 3, s: 'tek', g: 0.16 },
        { b: 6, s: 'dum', g: 0.26 },
        { b: 8, s: 'tek', g: 0.18 },
        { b: 10, s: 'tek', g: 0.14 },
      ] },
      { div: 2, steps: [
        { b: 0, s: 'dum', g: 0.36, a: 1 },
        { b: 2, s: 'tek', g: 0.15 },
        { b: 5, s: 'dum', g: 0.24 },
        { b: 7, s: 'tek', g: 0.17 },
        { b: 9, s: 'dum', g: 0.30, a: 1 },
        { b: 11, s: 'tek', g: 0.13 },
      ] },
      { div: 3, steps: [                       // 三连音：走句开始流动
        { b: 0, s: 'dum', g: 0.38, a: 1 },
        { b: 4, s: 'tek', g: 0.16 }, { b: 4, s: 'tek', g: 0.11 },
        { b: 8, s: 'dum', g: 0.27 },
        { b: 10, s: 'tek', g: 0.19 }, { b: 10, s: 'snap', g: 0.13 },
      ] },
      { div: 2, steps: [                       // 句尾 fill：滚奏推进
        { b: 0, s: 'dum', g: 0.34, a: 1 },
        { b: 6, s: 'dum', g: 0.28 },
        { b: 9, s: 'snap', g: 0.16 },
        { b: 10, s: 'roll', g: 0.20 },
        { b: 11, s: 'tek', g: 0.15 },
      ] },
    ],
  },
  { // ── 麦西热甫：欢腾。密集、跳跃、句句相扣 ──
    bpm: 152,
    pulseEvery: 4, pulseGain: 0.055, pulseGuard: 1,   // 本来就密，脉冲只做支撑
    phrases: [
      { div: 2, steps: [
        { b: 0, s: 'dum', g: 0.40, a: 1 },
        { b: 1, s: 'tek', g: 0.17 }, { b: 2, s: 'snap', g: 0.15 },
        { b: 3, s: 'dum', g: 0.28 },
        { b: 5, s: 'tek', g: 0.20 }, { b: 6, s: 'tek', g: 0.15 },
        { b: 8, s: 'dum', g: 0.32 },
        { b: 9, s: 'snap', g: 0.17 },
        { b: 11, s: 'tek', g: 0.22 },
      ] },
      { div: 3, steps: [                       // 三连音滚奏
        { b: 0, s: 'dum', g: 0.40, a: 1 },
        { b: 2, s: 'tek', g: 0.18 }, { b: 2, s: 'snap', g: 0.16 },
        { b: 4, s: 'tek', g: 0.20 },
        { b: 6, s: 'dum', g: 0.30 },
        { b: 7, s: 'tek', g: 0.22 }, { b: 7, s: 'tek', g: 0.14 },
        { b: 9, s: 'snap', g: 0.19 },
        { b: 10, s: 'roll', g: 0.18 },
        { b: 11, s: 'mute', g: 0.22 },
      ] },
      { div: 2, steps: [
        { b: 0, s: 'dum', g: 0.42, a: 1 },
        { b: 2, s: 'tek', g: 0.19 }, { b: 3, s: 'snap', g: 0.17 },
        { b: 4, s: 'tek', g: 0.21 },
        { b: 6, s: 'dum', g: 0.34 },
        { b: 8, s: 'tek', g: 0.20 }, { b: 9, s: 'snap', g: 0.16 },
        { b: 10, s: 'tek', g: 0.24 },
        { b: 11, s: 'mute', g: 0.18 },
      ] },
      { div: 3, steps: [                       // 收句：滚奏冲到顶
        { b: 0, s: 'dum', g: 0.44, a: 1 },
        { b: 3, s: 'tek', g: 0.18 },
        { b: 5, s: 'roll', g: 0.22 },
        { b: 8, s: 'dum', g: 0.36, a: 1 },
        { b: 9, s: 'snap', g: 0.20 },
        { b: 11, s: 'tek', g: 0.24 },
      ] },
    ],
  },
];

/* 某个拍位在这一句里是否有主节奏（给脉冲轨的避让判断用） */
function gridHas(beat, phrase) {
  for (let i = 0; i < phrase.steps.length; i++) {
    if (phrase.steps[i].b === beat) return true;
  }
  return false;
}

class DapSequencer {  /**
   * @param {object} [opts]
   * @param {number} [opts.volume=0.3]  总音量
   * @param {(info:object)=>void} [opts.onPhrase]  乐句切换回调（视觉可以跟着动）
   */
  constructor(opts = {}) {
    this.volume = opts.volume === undefined ? 0.34 : opts.volume;
    this.onPhrase = opts.onPhrase || null;

    this.ctx = null;
    this.master = null;
    this.gain = null;          // 声部汇总点
    this.gainNode = null;
    this.bandGain = null;      // 每段的整体音量差
    this.tone = null;
    this.dry = null;
    this.wet = null;
    this.comp = null;
    this.chain = null;
    this.noiseBuf = null;
    this.ready = false;
    this.enabled = false;

    this.band = 0;
    this.phrase = 0;
    this.step = 0;
    this.nextT = 0;
    this.timer = null;

    this.LOOKAHEAD = 0.18;
    this.TICK = 40;
  }

  /* ------------------------------------------------------------ 生命周期 */
  init() {
    if (this.ready) return true;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return false;
    const c = new AC();
    this.ctx = c;

    /* 信号链：
         voices → gain → hp → tone ┬→ dry ─┐
                                   └→ conv ─┴→ comp → master → out

       限幅是必须的：5 个声部叠加时瞬时峰值会超过 1.0，直接数字削波很刺耳。
       压缩器把峰值收住，整体反而更响、更稳。 */
    const gain = c.createGain();
    gain.gain.value = 1;

    const bandGain = c.createGain();
    bandGain.gain.value = 1;

    const hp = c.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 22;
    const tone = c.createBiquadFilter();
    tone.type = 'lowpass';
    tone.frequency.value = 9000;
    tone.Q.value = 0.4;

    const dry = c.createGain();
    dry.gain.value = 0.85;

    const wet = c.createGain();
    wet.gain.value = 0.35;

    const conv = c.createConvolver();
    conv.buffer = this._makeRoomIR(0.42, 0.55);

    const comp = c.createDynamicsCompressor();
    comp.threshold.value = -10;
    comp.knee.value = 6;
    comp.ratio.value = 4;
    comp.attack.value = 0.004;
    comp.release.value = 0.18;

    const master = c.createGain();
    master.gain.value = 0;                    // 由 enable() 淡入

    // voices → bandGain → gain → hp → tone → (dry | conv→wet) → comp → master → out
    bandGain.connect(gain);
    gain.connect(hp);
    hp.connect(tone);
    tone.connect(dry);
    tone.connect(conv);
    conv.connect(wet);
    dry.connect(comp);
    wet.connect(comp);
    comp.connect(master);
    master.connect(c.destination);

    this.gain = gain;
    this.bandGain = bandGain;
    this.tone = tone;
    this.dry = dry;
    this.wet = wet;
    this.comp = comp;
    this.master = master;
    this.chain = this.gain;                   // 声部接到这里

    this.noiseBuf = this._makeNoise();
    this.ready = true;
    this._applyBand();
    return true;
  }

  /* ---------------------------------------------------------------- 房间 --
     合成一段 0.4 秒的房间脉冲响应：指数衰减噪声 + 几个早期反射。
     目的是让声音有"在一个暗房间里"的距离感，而不是贴在脸上。
     一定要短 —— 打击乐的混响超过半秒就会糊成一团，反而不如干声清楚。
     比采样混响省得多。 */
  _makeRoomIR(decay, damp) {
    const c = this.ctx;
    const sr = c.sampleRate;
    const len = Math.max(1, Math.floor(sr * decay));
    const buf = c.createBuffer(2, len, sr);

    for (let ch = 0; ch < 2; ch++) {
      const d = buf.getChannelData(ch);
      let lp = 0;
      for (let i = 0; i < len; i++) {
        const t = i / len;
        const env = Math.pow(1 - t, 2.6);          // 尾巴衰减
        const white = Math.random() * 2 - 1;
        // 一阶低通：越往后越暗，像被墙吸掉高频
        lp = lp * (0.55 + t * 0.35) + white * (0.45 - t * 0.35);
        d[i] = lp * env * damp;
      }
      // 早期反射：几个离散的抽头，给房间一点尺寸感
      [0.011, 0.019, 0.031, 0.047].forEach((sec, k) => {
        const at = Math.floor(sec * sr) + (ch ? 37 : 0);
        if (at < len) d[at] += (k % 2 ? -1 : 1) * (0.32 / (k + 1));
      });
    }
    return buf;
  }

  /** 三段各自的房间与音色：远 → 近 → 更近 */
  _applyBand() {
    if (!this.ready) return;
    const t = this.ctx.currentTime;
    const P = [
      // 穹乃额曼：慢而稀（一个 dum 要等 6 秒），必须给足电平，
      // 否则整段会被听成"没在响"。远、暗靠混响与低通做，不靠压电平。
      { wet: 0.45, dry: 1.10, lp: 5000, gain: 2.10 },
      { wet: 0.30, dry: 1.00, lp: 8000, gain: 1.25 },   // 达斯坦：中景
      { wet: 0.18, dry: 1.05, lp: 12000, gain: 1.15 },  // 麦西热甫：贴脸、亮
    ][this.band];

    this.wet.gain.setTargetAtTime(P.wet, t, 0.4);
    this.dry.gain.setTargetAtTime(P.dry, t, 0.4);
    this.tone.frequency.setTargetAtTime(P.lp, t, 0.4);
    if (this.bandGain) this.bandGain.gain.setTargetAtTime(P.gain, t, 0.4);
  }

  /** 粉噪底：白噪过一次一阶低通，用来做各种击打音色 */
  _makeNoise() {
    const len = Math.floor(this.ctx.sampleRate * 0.5);
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = buf.getChannelData(0);
    let last = 0;
    for (let i = 0; i < len; i++) {
      const white = Math.random() * 2 - 1;
      last = (last + 0.02 * white) / 1.02;
      d[i] = last * 3.2;
    }
    return buf;
  }

  enable() {
    if (!this.init()) return false;
    if (this.ctx.state === 'suspended') this.ctx.resume();
    this.enabled = true;
    this.step = 0;
    this.nextT = this.ctx.currentTime + 0.08;
    this.master.gain.cancelScheduledValues(this.ctx.currentTime);
    this.master.gain.setTargetAtTime(this.volume, this.ctx.currentTime, 0.8);
    if (!this.timer) this.timer = setInterval(() => this._tick(), this.TICK);
    return true;
  }

  disable() {
    this.enabled = false;
    if (this.timer) { clearInterval(this.timer); this.timer = null; }
    if (this.ctx && this.master) {
      this.master.gain.cancelScheduledValues(this.ctx.currentTime);
      this.master.gain.setTargetAtTime(0.0001, this.ctx.currentTime, 0.35);
    }
  }

  /** 切换段落：乐句从头开始，避免切段时半句悬空；房间与音色跟着换 */
  setBand(i) {
    const n = Math.max(0, Math.min(2, i | 0));
    if (n === this.band) return;
    this.band = n;
    this.phrase = 0;
    this.step = 0;
    this._applyBand();
  }

  /* -------------------------------------------------------------- 音色库 */

  /** 低音：正弦 118→46Hz，叠三角波给"皮"的质感 */
  _dum(t, g, pitch) {
    const c = this.ctx;
    const o = c.createOscillator(), gn = c.createGain();
    o.type = 'sine';
    o.frequency.setValueAtTime(118 * pitch, t);
    o.frequency.exponentialRampToValueAtTime(46 * pitch, t + 0.13);
    gn.gain.setValueAtTime(0.0001, t);
    gn.gain.exponentialRampToValueAtTime(g, t + 0.005);
    gn.gain.exponentialRampToValueAtTime(0.0001, t + 0.36);
    o.connect(gn).connect(this.chain);
    o.start(t); o.stop(t + 0.42);

    const o2 = c.createOscillator(), g2 = c.createGain();
    o2.type = 'triangle';
    o2.frequency.setValueAtTime(210 * pitch, t);
    o2.frequency.exponentialRampToValueAtTime(96 * pitch, t + 0.06);
    g2.gain.setValueAtTime(0.0001, t);
    g2.gain.exponentialRampToValueAtTime(g * 0.32, t + 0.003);
    g2.gain.exponentialRampToValueAtTime(0.0001, t + 0.1);
    o2.connect(g2).connect(this.chain);
    o2.start(t); o2.stop(t + 0.14);
  }

  /** 边击：带通噪声 + 极短的皮面音 */
  _tek(t, g, pitch) {
    const c = this.ctx;
    this._noiseHit(t, g, 1750 * pitch, 1.15, 0.075);

    const o = c.createOscillator(), gn = c.createGain();
    o.type = 'triangle';
    o.frequency.setValueAtTime(390 * pitch, t);
    gn.gain.setValueAtTime(0.0001, t);
    gn.gain.exponentialRampToValueAtTime(g * 0.5, t + 0.002);
    gn.gain.exponentialRampToValueAtTime(0.0001, t + 0.05);
    o.connect(gn).connect(this.chain);
    o.start(t); o.stop(t + 0.07);
  }

  /** 脆击：高频噪声 + 音高上扬的短音。麦西热甫的尖点 */
  _snap(t, g, pitch) {
    const c = this.ctx;
    this._noiseHit(t, g * 0.75, 3100 * pitch, 1.6, 0.045);

    const o = c.createOscillator(), gn = c.createGain();
    o.type = 'sine';
    o.frequency.setValueAtTime(620 * pitch, t);
    o.frequency.exponentialRampToValueAtTime(1180 * pitch, t + 0.035);   // 上扬
    gn.gain.setValueAtTime(0.0001, t);
    gn.gain.exponentialRampToValueAtTime(g * 0.42, t + 0.002);
    gn.gain.exponentialRampToValueAtTime(0.0001, t + 0.05);
    o.connect(gn).connect(this.chain);
    o.start(t); o.stop(t + 0.07);
  }

  /** 闷击：闭音。decay 极短，用来收紧句尾 */
  _mute(t, g, pitch) {
    const c = this.ctx;
    this._noiseHit(t, g * 0.6, 900 * pitch, 2.2, 0.035);

    const o = c.createOscillator(), gn = c.createGain();
    o.type = 'sine';
    o.frequency.setValueAtTime(150 * pitch, t);
    o.frequency.exponentialRampToValueAtTime(88 * pitch, t + 0.03);
    gn.gain.setValueAtTime(0.0001, t);
    gn.gain.exponentialRampToValueAtTime(g * 0.7, t + 0.003);
    gn.gain.exponentialRampToValueAtTime(0.0001, t + 0.06);
    o.connect(gn).connect(this.chain);
    o.start(t); o.stop(t + 0.08);
  }

  /** 指滚：噪声被 52Hz 调制，一口气碾过去 */
  _roll(t, g, pitch) {
    const c = this.ctx;
    const dur = 0.30;

    const s = c.createBufferSource();
    s.buffer = this.noiseBuf;
    s.loop = true;

    const bp = c.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 1400 * pitch;
    bp.Q.value = 0.85;

    const vca = c.createGain();
    vca.gain.value = 0;

    // 调制器：把连续噪声切成"一下一下"，才像手指滚过鼓面
    const lfo = c.createOscillator();
    lfo.type = 'triangle';
    lfo.frequency.value = 52;
    const lfoGain = c.createGain();
    lfoGain.gain.value = 0.5;

    const env = c.createGain();
    env.gain.setValueAtTime(0.0001, t);
    env.gain.exponentialRampToValueAtTime(g, t + 0.02);
    env.gain.setValueAtTime(g, t + dur * 0.72);
    env.gain.exponentialRampToValueAtTime(0.0001, t + dur);

    lfo.connect(lfoGain).connect(vca.gain);
    s.connect(bp).connect(vca).connect(env).connect(this.chain);
    s.start(t); s.stop(t + dur + 0.02);
    lfo.start(t); lfo.stop(t + dur + 0.02);
  }

  _noiseHit(t, g, freq, q, dur) {
    const c = this.ctx;
    const s = c.createBufferSource();
    s.buffer = this.noiseBuf;
    const bp = c.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = freq;
    bp.Q.value = q;
    const gn = c.createGain();
    gn.gain.setValueAtTime(0.0001, t);
    gn.gain.exponentialRampToValueAtTime(g, t + 0.003);
    gn.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(bp).connect(gn).connect(this.chain);
    s.start(t); s.stop(t + dur + 0.02);
  }

  /* -------------------------------------------------------------- 调度 */

  _tick() {
    const pat = PATTERNS[this.band];
    const phrase = pat.phrases[this.phrase];
    const spb = 60 / pat.bpm / phrase.div;
    const total = 12 * phrase.div;

    while (this.nextT < this.ctx.currentTime + this.LOOKAHEAD) {
      const beat = this.step % total;
      let struck = false;

      for (let i = 0; i < phrase.steps.length; i++) {
        const ev = phrase.steps[i];
        if (ev.b !== beat) continue;

        // 人手的不精确：音高 ±1.8%，时间 ±4ms
        const pitch = 1 + (Math.random() - 0.5) * 0.036;
        const when = this.nextT + (Math.random() - 0.5) * 0.004;
        const gain = ev.g * (ev.a ? 1.1 : 1);
        this._hit(ev.s, when, gain, pitch);
        struck = true;
      }

      /* 脉冲轨：主节奏留下过长空档时，补一记极轻的边击。
         这是让"留白"被听成留白、而不是断掉的关键。
         离主音太近（pulseGuard 之内）就跳过，否则会糊成 flam。 */
      if (!struck && pat.pulseEvery > 0 && beat % pat.pulseEvery === 0) {
        const guard = pat.pulseGuard || 1;
        let tooClose = false;
        for (let k = 1; k <= guard; k++) {
          const before = ((beat - k) % total + total) % total;
          const after = (beat + k) % total;
          if (gridHas(before, phrase) || gridHas(after, phrase)) { tooClose = true; break; }
        }
        if (!tooClose) {
          this._hit('tek', this.nextT, pat.pulseGain, 1 + (Math.random() - 0.5) * 0.02);
        }
      }

      this.step++;
      if (this.step >= total) {
        this.step = 0;
        this.phrase = (this.phrase + 1) % pat.phrases.length;
        if (this.onPhrase) this.onPhrase({ band: this.band, phrase: this.phrase });
      }
      this.nextT += spb;
    }
  }

  _hit(kind, t, g, pitch) {
    switch (kind) {
      case 'dum':  this._dum(t, g, pitch); break;
      case 'tek':  this._tek(t, g, pitch); break;
      case 'snap': this._snap(t, g, pitch); break;
      case 'mute': this._mute(t, g, pitch); break;
      case 'roll': this._roll(t, g, pitch); break;
      default: break;
    }
  }

  /* --------------------------------------------------- 现在踩在哪一拍上
     给「跟着鼓点跳」那个开关用（指导老师：要沉浸式的交互）。
     判断一次点击准不准，就得知道"现在离最近的拍有多远" ——
     这只有音频时钟知道，页面自己算不出来。

     **为什么用 nextT 反推，而不是另记一个"当前拍"变量**：
     _tick() 是提前排的（LOOKAHEAD 秒之前就把鼓点排进音频时间轴），
     所以"刚排的那一拍"在未来，不是"现在"。
     nextT 是**下一个要排的时刻**；从它往回退，才能还原出此刻在第几拍。
     这样对出来的拍和耳朵听到的鼓是同一个时钟。 */
  phase() {
    if (!this.ctx || !this.ready) return null;
    const pat = PATTERNS[this.band];
    if (!pat) return null;
    const phrase = pat.phrases[this.phrase];
    if (!phrase) return null;
    const spb = 60 / pat.bpm / phrase.div;
    const ahead = this.nextT - this.ctx.currentTime;
    const beatFloat = this.step - ahead / spb;
    /* 归一化到 [0,1)：0 = 正落在拍上 */
    return ((beatFloat % 1) + 1) % 1;
  }

  /** 一拍多长（毫秒）。给"容差多少毫秒算踩上"用 */
  beatMs() {
    const pat = PATTERNS[this.band];
    if (!pat) return null;
    const phrase = pat.phrases[this.phrase];
    if (!phrase) return null;
    return 60000 / pat.bpm / phrase.div;
  }

  /* ------------------------------------------------------------ 敲一下
     给「用户自己打」用的（指导老师：只是简单的点击 → 沉浸式的体验）。
     原来只有内部 _hit 那一套，外面没法让手鼓**立刻**响一声 ——
     它只会按 BPM 自己循环。

     和 _hit 的区别：这个不排进调度，就是现在响。
     音量按 currentTime 直接给，不做淡入 —— 手打要的就是即时。 */
  hit(kind) {
    if (!this.ready || !this.ctx) return false;
    /* context 可能是 suspended（用户还没交互过）。
       能唤醒就唤醒 —— 敲鼓本身就是一次手势，浏览器允许。 */
    if (this.ctx.state === 'suspended') this.ctx.resume();
    /* 稍微往后放一点点：立刻响会落在当前音频块里，有些设备上会吞掉。
       12ms 听不出来，但稳。 */
    const t = this.ctx.currentTime + 0.012;
    const k = kind || 'dum';
    try {
      if (k === 'tek') this._tek(t, 0.62, 1);
      else if (k === 'snap') this._snap(t, 0.26, 1);
      else if (k === 'mute') this._mute(t, 0.5, 1);
      else this._dum(t, 0.9, 1);
    } catch (e) {
      /* 敲一下失败不该把页面搞崩 —— 没声也能继续看 */
      if (window.console) console.warn('[弦脉] 手鼓敲击失败：', e && e.message);
      return false;
    }
    return true;
  }

  /* ------------------------------------------------------------ 满圈一声
     互动里的"圈满了"需要的不只是更密的鼓，是**一下子砸下来**。
     所以另做一个：低频撞击 + 一记炸开的长镲 + 快速滚奏收尾。
     不复用 _hit，因为它不是节奏里的一拍，是一次事件。 */
  flourish() {
    // 这里**不检查 enabled** —— 互动里的"圈满了"是一声庆祝，
    // 它靠 theme 那边独立的手势解锁。之前加了 enabled 守卫，
    // 结果没手动开声音的人点满圈什么都没听见（踩过）。
    if (!this.ready) return false;
    const ctx = this.ctx;
    const t0 = ctx.currentTime + 0.02;

    // 1) 低频撞击：dum 加重、拖长
    this._dum(t0, 0.62, 0.94);
    this._dum(t0 + 0.005, 0.34, 0.86);

    // 2) 炸开的长镲：高通噪声 + 很长的尾巴
    const len = Math.floor(ctx.sampleRate * 1.6);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) {
      const x = i / len;
      // 起音极快、衰减很长，像一记重镲
      d[i] = (Math.random() * 2 - 1) * Math.pow(1 - x, 2.2) * (1 - Math.exp(-x * 260));
    }
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const hp = ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 3600;
    const g = ctx.createGain();
    g.gain.value = 0.30;
    src.connect(hp).connect(g).connect(this.bandGain);
    src.start(t0);

    // 3) 一串快速滚奏往上冲，收在最高点
    for (let i = 0; i < 14; i++) {
      const k = i / 13;
      this._hit('snap', t0 + 0.30 + k * k * 0.62, 0.10 + k * 0.16, 1 + k * 0.10);
    }
    return true;
  }
}

__ns = __XM[4];
__ns.mount_DapSequencer = function () { return DapSequencer; };
__ns.mount_PATTERNS = function () { return PATTERNS; };
}

/* ── js/lib/site.js ── */
function __M5__() {
/* ==========================================================================
   弦脉 · 站点外壳
   --------------------------------------------------------------------------
   导航与页脚用同一份数据生成，所有页面（含后续十二个分页面）自动获得完整
   导航 —— 加新页面只要改这里一处，不用去每个 HTML 里改链接。

   另外提供两个章节页反复用到的小件：
     revealOnScroll  滚动进入视口时显形
     imageSlot       图片槽（含缺图兜底与说明位）
   ========================================================================== */

/** 章节结构。id 用于高亮当前页。
    requires: 需要先完成某件事才能进（值为 localStorage 的键）。
    有 requires 的章节在未完成时**显示为锁着**，点它不跳转，
    而是把人送去完成那件事的地方。 */
const NAV = [
  // 入口页（整屏循环那条概念片）。放第一项，从任何内页都能跳回去重看。
  { id: 'welcome',   num: '影',    label: '概念片',      href: 'welcome/index.html' },
  { id: 'prologue',  num: '序',    label: '序',         href: 'index.html' },
  { id: 'qon',       num: '二',    label: '穹乃额曼',    href: 'qiongnaieman/index.html', sub: '大曲' },
  { id: 'dastan',    num: '三',    label: '达斯坦',      href: 'dastan/index.html',       sub: '叙事诗' },
  { id: 'mashrap',   num: '四',    label: '麦西热甫',    href: 'mashrap/index.html',      sub: '歌舞曲' },
  {
    id: 'lishi', num: '五', label: '历史与传承', href: 'lishi/index.html',
    // 和附录在同一道门后面：不跳完那场圆圈，这两页都不该进得去。
    // 之前只锁了附录，第五章漏了 —— 结果能直接点进去。
    requires: 'xiangmai.unlocked.mashrap',
    lockHref: 'mashrap/index.html#mq-act',
    lockHint: '先把第四章那场麦西热甫跳完',
  },
  {
    id: 'fulu', num: '附录', label: '形制比较', href: 'fulu/index.html',
    requires: 'xiangmai.unlocked.mashrap',
    lockHref: 'mashrap/index.html#mq-act',
    lockHint: '先把第四章那场麦西热甫跳完',
  },
  /* 八音 · 八族档案。挂在最后，和附录同一道门后面 ——
     它引用的就是附录那条旋律图上的八个音，门开了一起开。
     这一节有八页（heritage/<id>/index.html）加一个总页面（heritage/index.html）。 */
  {
    id: 'bain', num: '八音', label: '八族档案', href: 'heritage/index.html',
    requires: 'xiangmai.unlocked.mashrap',
    lockHref: 'mashrap/index.html#mq-act',
    lockHint: '先把第四章那场麦西热甫跳完',
  },
];
const $ = (s, r) => (r || document).querySelector(s);

/** 读取解锁状态。localStorage 读不到（隐私模式）就当没锁，别把人挡在外面。 */
function isLocked(entry) {
  if (!entry.requires) return false;
  try { return localStorage.getItem(entry.requires) !== '1'; } catch { return false; }
}

/**
 * 把顶部导航渲染进 .topbar（HTML 里只留一个占位结构）。
 * @param {object} opts
 * @param {string} opts.base  相对站点根的路径前缀，如 '../' 或 ''
 * @param {string} opts.active 当前页的 NAV id
 * @param {boolean} [opts.showSound] 是否显示声音开关
 */
function mountShell(opts) {
  const base = opts.base || '';
  const active = opts.active || '';
  const topbar = $('.topbar');
  if (!topbar) return;

  const links = NAV.map((n) => {
    const cur = n.id === active ? ' aria-current="page"' : '';
    const sub = n.sub ? '<i class="sitelinks__sub">' + n.sub + '</i>' : '';
    const locked = isLocked(n);
    // 锁着时保留原 href（语义仍在），但加标记；点击由下面的监听拦下
    const attrs = locked
      ? ' class="is-locked" data-locked="1" aria-disabled="true"' +
        ' title="' + (n.lockHint || '还没解锁') + '"' +
        ' data-lock-href="' + base + (n.lockHref || n.href) + '"'
      : '';
    return '<li><a href="' + base + n.href + '"' + cur + attrs + '>' +
      n.num + ' · ' + n.label + sub +
      (locked ? '<i class="sitelinks__lock" aria-hidden="true"></i>' : '') + '</a></li>';
  }).join('');

  const sound = opts.showSound === false ? '' :
    '<button class="sound" id="sound-toggle" type="button" aria-pressed="true" aria-label="声音开关">' +
    '<span class="sound__ring" aria-hidden="true"></span>' +
    '<span class="sound__text" id="sound-text">声音 开</span></button>';

  /* 窄屏用一个三条横杠的按钮把导航收起来 ——
     七个章节在手机上横排太挤（用户直接说"给人感觉很挤"）。
     按钮只在窄屏出现（CSS 控制），宽屏看不见、也不改变原有排布。
     无障碍：aria-expanded 跟着开合，Esc 关闭，点了链接自动收起。 */
  topbar.innerHTML =
    '<a class="brand" href="' + base + 'index.html" aria-label="弦脉 Stringline Heritage 首页">' +
      '<i class="brand__glyph" aria-hidden="true"></i>' +
      '<span class="brand__name">弦脉</span>' +
      '<span class="brand__latin">Stringline Heritage</span>' +
    '</a>' +
    '<div class="topbar__right">' +
      '<button class="navburger" id="nav-burger" type="button"' +
        ' aria-controls="site-nav" aria-expanded="false" aria-label="展开章节导航">' +
        '<i class="navburger__bar" aria-hidden="true"></i>' +
        '<i class="navburger__bar" aria-hidden="true"></i>' +
        '<i class="navburger__bar" aria-hidden="true"></i>' +
      '</button>' +
      '<nav aria-label="站点章节" id="site-nav"><ul class="sitelinks">' + links + '</ul></nav>' +
      sound +
    '</div>';

  /* 横杠按钮的开合 */
  const burger = $('#nav-burger', topbar);
  const wrap = topbar.querySelector('.topbar__right');
  const setOpen = (open) => {
    if (wrap) wrap.classList.toggle('is-open', open);
    if (burger) burger.setAttribute('aria-expanded', open ? 'true' : 'false');
    document.body.classList.toggle('nav-open', open);
  };
  if (burger) {
    burger.addEventListener('click', (e) => {
      e.stopPropagation();
      setOpen(!(wrap && wrap.classList.contains('is-open')));
    });
    // 点空白处收起
    document.addEventListener('click', (e) => {
      if (!wrap || !wrap.classList.contains('is-open')) return;
      if (topbar.contains(e.target)) return;
      setOpen(false);
    });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') setOpen(false);
    });
    // 点了导航项就收起，不然展开的菜单会挡着刚打开的页面
    topbar.addEventListener('click', (e) => {
      const a = e.target.closest ? e.target.closest('.sitelinks a') : null;
      if (a) setOpen(false);
    });
  }

  /* 锁着的导航项：点了不跳，而是把人送去该去的地方，并给一句提示。
     用捕获阶段拦，免得别处的处理器先跳走。 */
  topbar.addEventListener('click', (e) => {
    const a = e.target.closest ? e.target.closest('a[data-locked]') : null;
    if (!a) return;
    e.preventDefault();
    e.stopPropagation();
    const go = a.getAttribute('data-lock-href');
    const li = a.parentElement;
    // 先给个"锁着"的抖动反馈，再走
    if (li) {
      li.classList.remove('is-nudged');
      void li.offsetWidth;                 // 强制重排，让动画能重放
      li.classList.add('is-nudged');
    }
    if (go) setTimeout(() => { location.href = go; }, 260);
  }, true);
}

/**
 * 声音开关，**默认开**。
 *
 * 为什么不能只把标签写成"开"：
 *   浏览器的自动播放策略不允许没有用户手势就出声。
 *   所以"默认开"的正确做法是 —— 按钮一开始就显示"开"，
 *   然后**第一次交互（点击/滚动/按键）自动把声音打开**。
 *   只改标签不放声音，就是在骗用户。
 *
 * @param {object} opts
 * @param {string} [opts.on]  用户点"开"时怎么开：返回 false 表示开不了
 * @param {string} [opts.off] 用户点"关"时怎么关
 * @param {string} [opts.onFirstGesture]
 *        第一次手势时自动开。不传就不自动开（那种页面由别处开，
 *        比如有主题曲的页面用 autoPlayOnGesture）。
 */
function mountSoundButton(opts = {}) {
  const btn = $('#sound-toggle');
  const text = $('#sound-text');
  if (!btn) return null;

  const paint = (on, label) => {
    btn.setAttribute('aria-pressed', on ? 'true' : 'false');
    if (text) text.textContent = label || (on ? '声音 开' : '声音 关');
  };

  // 默认就显示"开" —— 配合下面的自动开，标签和实际是一致的
  paint(true);

  if (opts.onFirstGesture) {
    const arm = () => {
      ['pointerdown', 'keydown', 'wheel', 'scroll', 'touchstart'].forEach((e) =>
        window.removeEventListener(e, arm));
      opts.onFirstGesture();
    };
    ['pointerdown', 'keydown', 'wheel', 'scroll', 'touchstart'].forEach((e) =>
      window.addEventListener(e, arm, { passive: true, once: true }));
  }

  btn.addEventListener('click', () => {
    const on = btn.getAttribute('aria-pressed') !== 'true';
    if (on) {
      const r = opts.on ? opts.on() : true;
      if (r === false) { paint(false, '声音 不可用'); return; }
    } else if (opts.off) {
      opts.off();
    }
    paint(on);
  });

  return { paint, setLabel: (t) => { if (text) text.textContent = t; } };
}

/**
 * 页面底部的「上一章 / 下一章」。按 NAV 的链条自动生成 ——
 * 以后调整章节顺序或插新页，不用改任何 HTML。
 *
 * **做成真正的按钮，不是一排小字。**
 * 原来是一条 16px 高、11.5px 字的文字链（量过），
 * 指导老师看过之后提了意见：评委年纪大，这个太小。
 * 这不是审美问题 —— 44×44 CSS px 是可点区域的无障碍下限
 * （苹果 HIG 与谷歌 Material 都是这个数），给年长用户还要留余量。
 * 现在每个按钮 ≥56px 高，字 1.05rem，整块可点，带边框。
 *
 * 结构：
 *   <a class="cbtn">
 *     <span class="cbtn__hint">上一章</span>
 *     <span class="cbtn__main">二 · 穹乃额曼</span>
 *   </a>
 * hint（上一章 / 下一章）**单独一行写出来** ——
 * 原来只有一个小小的箭头，得先看懂箭头才知道点它去哪。
 */
function mountChapterNav(opts) {
  const base = opts.base || '';
  const host = $('.chapter-nav');
  if (!host) return;
  const i = NAV.findIndex((n) => n.id === opts.active);
  if (i < 0) return;

  const prev = NAV[i - 1];
  const next = NAV[i + 1];
  const label = (n) => n.num + ' · ' + n.label;

  const btn = (n, dir) => {
    const hint = dir === 'prev' ? '← 上一章' : '下一章 →';
    const cls = 'cbtn' + (dir === 'next' ? ' cbtn--next' : '');
    return '<a class="' + cls + '" href="' + base + n.href + '"' +
      ' aria-label="' + hint.replace(/[←→]/g, '').trim() + '：' + label(n) + '">' +
      '<span class="cbtn__hint">' + hint + '</span>' +
      '<span class="cbtn__main">' + label(n) + '</span>' +
      '</a>';
  };

  host.innerHTML =
    (prev ? btn(prev, 'prev') : '<span class="cbtn-gap"></span>') +
    (next ? btn(next, 'next') : '<span class="cbtn-gap"></span>');
}

/**
 * 滚动进入视口时加 is-in。用于幕的推进、时间轴刻度点亮。
 * @param {string} selector
 * @param {object} [opts]
 * @param {number} [opts.threshold=0.18]
 * @param {boolean} [opts.once=true]
 */
function revealOnScroll(selector, opts = {}) {
  const nodes = Array.from(document.querySelectorAll(selector));
  if (!nodes.length) return;
  const threshold = opts.threshold === undefined ? 0.18 : opts.threshold;
  const once = opts.once !== false;

  if (!('IntersectionObserver' in window)) {
    nodes.forEach((n) => n.classList.add('is-in'));
    return;
  }

  const io = new IntersectionObserver((entries) => {
    entries.forEach((e) => {
      if (e.isIntersecting) {
        e.target.classList.add('is-in');
        if (once) io.unobserve(e.target);
      } else if (!once) {
        e.target.classList.remove('is-in');
      }
    });
  }, { threshold, rootMargin: '0px 0px -8% 0px' });

  nodes.forEach((n) => io.observe(n));
}

/**
 * 图片槽：设置 src 后自动加载，成功则淡入，失败则保持占位样式。
 * HTML 里写成 <figure class="slot" data-src="..." data-label="...">，
 * 这里统一接管，避免每处都写一遍 onerror。
 */
function mountSlots() {
  Array.from(document.querySelectorAll('figure.slot')).forEach((fig) => {
    const src = fig.getAttribute('data-src');
    const img = fig.querySelector('img');
    if (!img) { fig.classList.add('is-empty'); return; }

    if (!src) { fig.classList.add('is-empty'); return; }

    fig.classList.remove('is-empty');
    img.addEventListener('load', () => img.classList.add('is-loaded'), { once: true });
    img.addEventListener('error', () => {
      // 文件还没放进来：退回占位，版面不变形
      fig.classList.add('is-empty');
      img.removeAttribute('src');
    }, { once: true });
    img.src = src;
  });
}

__ns = __XM[5];
__ns.mount_NAV = function () { return NAV; };
__ns.mount_mountShell = function () { return mountShell; };
__ns.mount_mountSoundButton = function () { return mountSoundButton; };
__ns.mount_mountChapterNav = function () { return mountChapterNav; };
__ns.mount_revealOnScroll = function () { return revealOnScroll; };
__ns.mount_mountSlots = function () { return mountSlots; };
}

/* ── js/lib/chapter.js ── */
function __M6__() {
var Renderer = __XM[1]["Renderer"];
var mountCompanion = __XM[3]["mountCompanion"];
var DapSequencer = __XM[4]["DapSequencer"];
var mountShell = __XM[5]["mountShell"];
var mountChapterNav = __XM[5]["mountChapterNav"];
var revealOnScroll = __XM[5]["revealOnScroll"];
var mountSlots = __XM[5]["mountSlots"];
var mountSoundButton = __XM[5]["mountSoundButton"];

/* ==========================================================================
   弦脉 · 章节页公共启动
   --------------------------------------------------------------------------
   每个章节页要做的事几乎一样：装导航、铺空气层（地火）、显形、图片槽、
   可选的声音、可见性暂停。抽成一处，页面只提供自己的配置。

   这样加一页的成本 = 一个 HTML + 一次 bootChapter() 调用 + 三行构建配置。
   ========================================================================== */






const REDUCED = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/**
 * @param {object} opts
 * @param {string} opts.base    相对站点根的路径前缀（章节页一律 '../'）
 * @param {string} opts.active  当前页在导航里的 id
 * @param {number} [opts.wallGain=0.9]
 * @param {boolean} [opts.sound=true]  是否挂声音开关（页面上要有 #sound-toggle）
 * @param {number} [opts.soundBand=0]  声音默认放第几段的鼓
 * @param {boolean} [opts.heat=true]   是否启用随滚动上升的地火热度
 * @param {number} [opts.emberGain]  地火纹样的强度倍率。不传=原样（1.0）。
 *        给 0.35 之类的小值可以把背景压下去 —— 有大段正文的页面需要
 *        （第五章"历史与传承"五行史实，压在火上读着累）。
 * @param {'chapter'|'pattern'} [opts.mode='chapter']  底层画面：地火 / 程序化纹样
 * @param {boolean} [opts.drums=true]  是否挂手鼓音序器。
 *        有自己配乐的页面要传 false —— 否则声音按钮会接在手鼓上，
 *        用户按"开"听到的是鼓点，不是这一页该有的音乐（踩过）。
 */
function bootChapter(opts = {}) {
  mountShell({ base: opts.base || '../', active: opts.active });
  mountChapterNav({ base: opts.base || '../', active: opts.active });
  mountSlots();

  let renderer = null;
  let seq = null;
  let cssW = 0, cssH = 0, dpr = 0;
  let visible = true;
  let lastT = performance.now();
  let frame = 0;
  let heatNow = 0;
  let center = [0.5, 0.5];

  /* ---- 空气层：地火 / 程序化纹样 + 壁面 + 浮尘 ---- */
  const canvas = document.getElementById('air');
  const mode = opts.mode || 'chapter';
  if (canvas) {
    try {
      renderer = new Renderer(canvas, {
        mode,
        wallGain: opts.wallGain === undefined ? 0.9 : opts.wallGain,
        muralGain: 0,
      });
      /* 地火的**亮度**倍率。
         序章那种"火在暗处翻"适合开场，但**五行史实压在火上是累的** ——
         第五章用它把火压下去（用户："背景也有些给人无聊透着压抑"）。

         注意：这调的是 renderer.emberGain（乘在 u_heat 上），
         **不是 emberScale** —— 后者是纹样粗细，调它只会让火纹变大变小，
         页面上一点没暗（踩过这个坑）。 */
      if (opts.emberGain !== undefined) renderer.emberGain = opts.emberGain;
      // 用真实的 mode 当标记，别写死 —— 写死过一次，
      // 结果自检看到的是 'chapter' 而不是 'pattern'，查了半天。
      document.body.dataset.render = mode;
    } catch (err) {
      document.body.dataset.render = 'basic';
      if (window.console) console.warn('[弦脉] 退回基础渲染：', err && err.message);
    }
  }

  const syncSize = () => {
    if (!canvas || !renderer) return;
    const r = canvas.getBoundingClientRect();
    const w = Math.max(1, Math.round(r.width));
    const h = Math.max(1, Math.round(r.height));
    const d = window.devicePixelRatio || 1;
    if (w === cssW && h === cssH && d === dpr) return;
    cssW = w; cssH = h; dpr = d;
    renderer.resize(w, h, d);
  };

  /** 热度：越往下读越热，这是章节页的推进体感 */
  const readHeat = () => {
    if (opts.heat === false) return 0.4;
    const max = Math.max(1, document.documentElement.scrollHeight - window.innerHeight);
    return Math.min(1, Math.max(0, window.scrollY / max));
  };

  /** 热源跟着当前幕走，让地火的亮处随阅读位置移动 */
  const readCenter = () => {
    const acts = Array.from(document.querySelectorAll('[data-act]'));
    if (!acts.length) return [0.5, 0.5];
    const mid = window.innerHeight * 0.55;
    let best = acts[0], bestD = Infinity;
    acts.forEach((a) => {
      const r = a.getBoundingClientRect();
      const d = Math.abs(r.top + r.height * 0.5 - mid);
      if (d < bestD) { bestD = d; best = a; }
    });
    const r = best.getBoundingClientRect();
    const cx = (r.left + r.width * 0.5) / Math.max(1, window.innerWidth);
    const cy = 1 - (r.top + r.height * 0.5) / Math.max(1, window.innerHeight);
    return [Math.min(0.86, Math.max(0.14, cx)), Math.min(0.86, Math.max(0.14, cy))];
  };

  const loop = (now) => {
    requestAnimationFrame(loop);
    frame++;
    const dt = now - lastT;
    lastT = now;

    heatNow += (readHeat() - heatNow) * 0.035;
    center = readCenter();
    if (!renderer || !visible) return;

    syncSize();
    renderer.render({
      time: (now - renderer.started) / 1000,
      velocity: 0,
      frame,
      heat: heatNow,
    });
    renderer.sample(dt);
  };

  /* ---- 声音（可选） ----
     drums:false 的页面（有自己的配乐）不建手鼓音序器，
     也不接管声音按钮 —— 那个按钮留给页面自己去接配乐。
     否则会出现"按开听到的是鼓点，不是这一页的音乐"。

     默认开：按钮一开始显示"开"，第一次交互自动把鼓点打开。 */
  if (opts.sound !== false && opts.drums !== false) {
    seq = new DapSequencer({ volume: 0.34 });
    window.__XM_SEQ__ = seq;                 // 自检用

    const enableDrums = () => {
      if (!seq.enable()) return false;
      seq.setBand(opts.soundBand || 0);
      return true;
    };
    mountSoundButton({
      on: enableDrums,
      off: () => seq.disable(),
      onFirstGesture: enableDrums,
    });
  }

  /* ---- 显形 ---- */
  revealOnScroll('.reveal', { threshold: 0.15 });
  revealOnScroll('.tl-item', { threshold: 0.25 });
  revealOnScroll('.plate', { threshold: 0.12 });

  if ('IntersectionObserver' in window) {
    const main = document.querySelector('main');
    if (main) {
      new IntersectionObserver((es) => {
        es.forEach((e) => { visible = e.isIntersecting; });
      }, { threshold: 0 }).observe(main);
    }
  }

  window.addEventListener('resize', () => { cssW = 0; syncSize(); }, { passive: true });
  document.addEventListener('visibilitychange', () => { lastT = performance.now(); });

  requestAnimationFrame(loop);
  requestAnimationFrame(() => document.body.classList.add('is-ready'));

  mountCompanion({ active: opts.active });
  return { renderer, seq, REDUCED, syncSize };
}

__ns = __XM[6];
__ns.mount_bootChapter = function () { return bootChapter; };
__ns.mount_REDUCED = function () { return REDUCED; };
}

/* ── js/lib/theme.js ── */
function __M7__() {
/* ==========================================================================
   弦脉 · 主题曲播放
   --------------------------------------------------------------------------
   用 Web Audio 播 mp3（不用 <audio> 标签），理由：
     · 能和已有的手鼓总线上共用一条链路，音量、淡入淡出一致
     · 能对着 context.currentTime 做精确的交叉淡入
     · 能无缝循环（AudioBufferSourceNode.loop）

   两个关键点（都踩过）：
     1) decodeAudioData 是异步的。第一次调用只启动加载，加载完自动接上播 ——
        不然"点完最后一下要立刻听到声音"会变成半秒空白。
     2) 一定要**自己 new 一个 AudioContext**，不能借用手鼓那个。
        两个独立的 context 在浏览器里会互相干扰（一个在跑，另一个不响）。

   ---------------------------------------------------------------------------
   **file:// 下走另一条路**（见文件末尾的 createThemeViaElement）
   ---------------------------------------------------------------------------
   双击 index.html 打开时，站点是 file:// 源，而：
     · fetch()   → 被 CORS 挡掉（Failed to fetch）
     · XHR       → 同
     · <audio>   → **能加载**（实测时长 29.92s 正常读出）
     · <audio> 接 createMediaElementSource → 被当作跨源，输出被静音（实测 rms=0）
   所以本地打开时用 <audio> 元素自己播 —— 放弃精确淡入，换回**有声音**。
   这条路上音量靠 element.volume，淡入用定时器推。
   ========================================================================== */

/** 一个简易主题曲播放器
 *  @param {string} url
 *  @param {object} [opts]
 *  @param {AudioContext} [opts.ctx] 复用已有的 AudioContext。
 *         不传就自己建一个 —— 但**同一个页面上最好只有一个**：
 *         两个独立的 context 会互相干扰（一个在跑、另一个不响），
 *         这是排查了很久才定位到的静音原因。 */
function createTheme(url, opts = {}) {
  /* file:// 源下 fetch 拿不到本地文件，Web Audio 那条路整个不通。
     换 <audio> 元素实现 —— 接口一模一样，调用方不用改。 */
  if (typeof location !== 'undefined' && location.protocol === 'file:') {
    return createThemeViaElement(url, opts);
  }
  let ctx = opts.ctx || null;
  let buffer = null;
  let curUrl = url;
  const cache = new Map();     // url → AudioBuffer，换曲不用重新解码
  let loading = null;
  let src = null;              // 当前正在播的 source
  let gain = null;             // 当前 source 的增益
  let want = false;
  let waiting = false;        // 想播但 AudioContext 还没被唤醒
  let ctxWatched = false;     // 是否已经挂上 statechange 监听
  let volume = 0.55;          // 主题曲比手鼓略高，它要站得住

  /** 换用别的 AudioContext —— 页面上应该只有一个。 */
  const useContext = (c) => {
    if (!c || c === ctx) return;
    ctx = c;
    gain = null;              // 旧增益挂在上一个 context 上，作废
  };

  const ensureCtx = () => {
    if (ctx) return ctx;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
    return ctx;
  };

  /** 延迟建增益节点：必须挂在这个 context 上，且 context 变了要重建 */
  const ensureGain = () => {
    if (gain && gain.context === ctx) return gain;
    gain = ctx.createGain();
    gain.gain.value = 0;
    gain.connect(ctx.destination);
    return gain;
  };

  /** 取一段音频（带缓存）。任一 URL 只解码一次。 */
  const loadUrl = (u) => {
    if (cache.has(u)) return Promise.resolve(cache.get(u));
    const c = ensureCtx();
    if (!c) return Promise.resolve(null);
    return fetch(u)
      .then((r) => {
        if (!r.ok) throw new Error('http ' + r.status);
        return r.arrayBuffer();
      })
      .then((buf) => new Promise((res, rej) => {
        // Safari 只认回调形式，所以两种都接
        const p = c.decodeAudioData(buf, res, rej);
        if (p && p.then) p.then(res, rej);
      }))
      .then((buf) => { cache.set(u, buf); return buf; })
      .catch((e) => {
        if (window.console) console.warn('[弦脉] 音频加载失败 ' + u + '：', e && e.message);
        return null;
      });
  };

  const load = () => {
    if (buffer) return Promise.resolve(buffer);
    if (loading) return loading;
    loading = loadUrl(curUrl).then((buf) => { buffer = buf; return buf; });
    return loading;
  };

  /** 唤醒 AudioContext。必须在**真实用户手势**的调用栈里调用，浏览器才认。
      没有这个的话，在"没有手鼓"的页面上没人唤醒 context，
      主题曲会一直卡在 suspended —— 表现是"手势做了也不出声"。 */
  const resume = () => {
    const c = ensureCtx();
    if (!c) return Promise.resolve(false);
    if (c.state === 'running') return Promise.resolve(true);
    const p = c.resume();
    if (p && p.then) return p.then(() => c.state === 'running').catch(() => false);
    return Promise.resolve(c.state === 'running');
  };

  /** 起一个循环播放的 source，带淡入。每次换曲都新建一个 gain ——
      各曲各的增益，交叉淡入时互不干扰。 */
  const playBuffer = (buf, fade, from) => {
    const c = ensureCtx();
    if (!c) return null;
    const g = c.createGain();
    g.gain.value = 0.0001;
    g.connect(c.destination);
    const s = c.createBufferSource();
    s.buffer = buf;
    s.loop = true;
    s.connect(g);
    const t = c.currentTime;
    g.gain.cancelScheduledValues(t);
    g.gain.setValueAtTime(from === undefined ? 0.0001 : Math.max(0.0001, from), t);
    g.gain.linearRampToValueAtTime(volume, t + fade);
    s.start(t);
    return { s, g };
  };

  /** 开始播放（带淡入）。第一次调用会先解码，好了自动响。
   *
   *  AudioContext 可能是 suspended（页面还没有用户手势）。
   *  这里**自己负责唤醒**：先 resume，等 state 变成 running 再起播。
   *  早期版本直接 return 等调用方来唤醒 —— 结果在没有手鼓的页面
   *  （附录）没人唤醒它，一直干等，表现就是"点了没声"。 */
  const start = (fadeSec) => {
    want = true;
    const c = ensureCtx();
    if (!c) return false;

    const fade = fadeSec === undefined ? 2.2 : fadeSec;
    const begin = () => {
      if (!want || !buffer) return;
      const cc = ensureCtx();
      if (cc.state === 'suspended') {
        waiting = true;
        // 先试着唤醒；唤醒成功后 statechange 会再叫我们一次
        const p = cc.resume();
        if (p && p.then) p.then(() => { if (cc.state !== 'suspended') begin(); }).catch(() => {});
        return;
      }
      waiting = false;
      if (src) {                                   // 已经在放，只把音量拉回去
        gain.gain.cancelScheduledValues(cc.currentTime);
        gain.gain.setTargetAtTime(volume, cc.currentTime, fade / 3);
        return;
      }
      const next = playBuffer(buffer, fade, 0.0001);
      if (next) { src = next.s; gain = next.g; }
    };

    // 上下文醒了就自动接上（浏览器在用户第一次手势后会把 state 推到 running）
    if (!ctxWatched) {
      ctxWatched = true;
      c.addEventListener('statechange', () => {
        if (want && !src && c.state === 'running') begin();
      });
    }

    if (buffer) { begin(); return true; }
    load().then(begin);
    return true;
  };

  /** 被 resume 之后调用：把之前因为 suspended 而没起得来的那次播出去 */
  const wake = (fadeSec) => {
    if (!want || !buffer) return false;
    const c = ensureCtx();
    if (!c || c.state === 'suspended') return false;
    if (src) return true;
    const next = playBuffer(buffer, fadeSec === undefined ? 2.2 : fadeSec, 0.0001);
    if (next) { src = next.s; gain = next.g; }
    waiting = false;
    return true;
  };

  const stop = (fadeSec) => {
    want = false;
    if (!ctx || !src || !gain) return;
    const fade = fadeSec === undefined ? 1.2 : fadeSec;
    const t = ctx.currentTime;
    gain.gain.cancelScheduledValues(t);
    gain.gain.setTargetAtTime(0, t, fade / 3);
    const s = src;
    src = null;
    try { s.stop(t + fade * 1.6); } catch { /* 已经停了 */ }
  };

  const setVolume = (v) => {
    volume = Math.max(0, Math.min(1, v));
    if (ctx && src && gain) gain.gain.setTargetAtTime(volume, ctx.currentTime, 0.3);
  };

  /** 起一个循环播放的 source，带淡入。每次换曲都新建一个 gain ——
      各曲各的增益，交叉淡入时互不干扰。 */
  

  /** 换一段音频并交叉淡入。正在播时换曲不会留空白。
      滚动驱动的场景切换会频繁调用，所以：目标没变就直接返回。 */
  const crossfadeTo = (newUrl, fadeSec) => {
    if (!newUrl || newUrl === curUrl) return Promise.resolve(false);
    const fade = fadeSec === undefined ? 1.6 : fadeSec;
    return loadUrl(newUrl).then((buf) => {
      if (!buf) return false;
      curUrl = newUrl;
      buffer = buf;
      const old = src, oldGain = gain;
      const c = ensureCtx();
      if (c && c.state === 'suspended') { const p = c.resume(); if (p && p.then) p.catch(() => {}); }
      const next = playBuffer(buf, fade, 0.0001);
      if (next) { src = next.s; gain = next.g; }
      if (old) {
        try {
          const t = c.currentTime;
          oldGain.gain.cancelScheduledValues(t);
          oldGain.gain.setValueAtTime(Math.max(0.0001, oldGain.gain.value), t);
          oldGain.gain.linearRampToValueAtTime(0.0001, t + fade);
          old.stop(t + fade + 0.1);
        } catch { try { old.stop(); } catch { /* 已停 */ } }
      }
      return true;
    });
  };

  /* 自检用：报告真实状态，而不是"我觉得应该响了" */
  const state = () => ({
    ready: !!buffer,
    playing: !!src,
    waiting,
    url: curUrl,
    cached: cache.size,
    ctxState: ctx ? ctx.state : 'none',
    gain: ctx && gain ? +gain.gain.value.toFixed(4) : -1,
    volume,
    duration: buffer ? +buffer.duration.toFixed(2) : 0,
  });

  return {
    start, stop, setVolume, state, useContext, wake, crossfadeTo, loadUrl, resume,
    preload: load,
    get playing() { return !!src; },
    get waiting() { return waiting; },
    get ready() { return !!buffer; },
    get url() { return curUrl; },
    get duration() { return buffer ? buffer.duration : 0; },
  };
}

/* ==========================================================================
   弦脉 · file:// 下的主题曲播放（<audio> 元素版）
   --------------------------------------------------------------------------
   为什么单独写一个：
     双击 index.html 打开时站点是 file:// 源。实测四条路只有一条通：
       fetch()  → Failed to fetch（CORS）
       XHR      → onerror
       <audio>  → **通**，时长正常读出
       <audio> + createMediaElementSource → 元素能播，但**输出被静音**
                 （file:// 下元素算跨源，rms 实测 0）
     所以本地打开时用 <audio> 自己播，**不接 Web Audio**。

   取舍（明说）：
     · 放弃：精确的交叉淡入、和手鼓共用一条总线、无缝循环（元素 loop 有极短间隙）
     · 换回：**有声音**
   对一个"离线运行"的作品来说，"双击能听见"比"淡入更精确"重要得多。

   接口与原版**完全一致** —— 调用方一行都不用改。
   ========================================================================== */
function createThemeViaElement(url, opts = {}) {
  let curUrl = url;
  let audio = null;
  let want = false;
  let volume = 0.55;
  let fadeTimer = 0;
  let pendingUrl = null;

  const cap = (v) => Math.max(0, Math.min(1, v));

  /** 取（或建）承载音频的元素。opts.ctx 在这一版里用不上，忽略。 */
  const ensure = () => {
    if (audio) return audio;
    audio = new Audio();
    audio.preload = 'auto';
    audio.loop = true;
    audio.volume = 0;
    audio.addEventListener('error', () => {
      if (window.console) {
        console.warn('[弦脉] file:// 下音频加载失败 ' + curUrl +
          '（本地打开时元素加载一般可用；若仍失败，用 node tools/serve.mjs 起本地服务器）');
      }
    });
    audio.addEventListener('ended', () => { if (want && audio) audio.play().catch(() => {}); });
    return audio;
  };

  /** 用定时器做音量渐变 —— element.volume 没有 setTargetAtTime。 */
  const fadeTo = (target, sec) => {
    if (!audio) return;
    if (fadeTimer) { clearInterval(fadeTimer); fadeTimer = 0; }
    const from = audio.volume;
    const dur = Math.max(0.05, sec || 0) * 1000;
    const t0 = Date.now();
    if (dur <= 60) { audio.volume = cap(target); return; }
    fadeTimer = setInterval(() => {
      if (!audio) { clearInterval(fadeTimer); fadeTimer = 0; return; }
      const p = Math.min(1, (Date.now() - t0) / dur);
      audio.volume = cap(from + (target - from) * p);
      if (p >= 1) { clearInterval(fadeTimer); fadeTimer = 0; }
    }, 40);
  };

  const start = (fadeSec) => {
    want = true;
    const a = ensure();
    /* 什么时候要显式 load()：
         · 还没有源（第一次起播）
         · 有源但 readyState 还是 0 —— 说明元素压根没去取数据
       第二种是真踩过的坑：preload() 会先把 src 设上但不触发加载，
       然后 start() 看到"已经有源"就跳过 load，元素永远停在 readyState 0，
       表现就是"点了没声、时长读成 0"（第五章）。 */
    if (!a.getAttribute('src') || a.readyState === 0) {
      a.src = curUrl;
      a.load();
    }
    const fade = fadeSec === undefined ? 2.2 : fadeSec;
    const p = a.play();
    if (p && p.catch) p.catch(() => {});     // 没手势时会被拒，交给调用方再试
    fadeTo(volume, fade);
    return true;
  };

  const stop = (fadeSec) => {
    want = false;
    if (!audio) return;
    fadeTo(0.0001, fadeSec === undefined ? 1.0 : fadeSec);
    const a = audio;
    setTimeout(() => { if (!want && a) { try { a.pause(); } catch { /* 已停 */ } } },
      Math.max(80, (fadeSec === undefined ? 1.0 : fadeSec) * 1000 + 60));
  };

  const setVolume = (v) => {
    volume = cap(v);
    if (audio && !audio.paused) fadeTo(volume, 0.4);
    return volume;
  };

  /** 换曲：元素直接换 src。先淡出再换，避免"咔"的一声。 */
  const crossfadeTo = (next, fadeSec) => {
    if (!next || next === curUrl) return Promise.resolve(false);
    const fade = fadeSec === undefined ? 1.2 : fadeSec;
    pendingUrl = next;
    fadeTo(0.0001, fade);
    return new Promise((res) => {
      setTimeout(() => {
        curUrl = next;
        pendingUrl = null;
        const a = ensure();
        a.src = curUrl;
        a.load();
        if (want) { const p = a.play(); if (p && p.catch) p.catch(() => {}); }
        fadeTo(want ? volume : 0.0001, fade);
        res(true);
      }, Math.max(80, fade * 1000 + 60));
    });
  };

  return {
    start, stop, setVolume, crossfadeTo,
    /* 这一版没有 AudioContext —— 报 'element'，别假装有。
       自检看到它就知道走的是本地那条路。 */
    state: () => ({
      ready: !!(audio && audio.readyState >= 1),
      playing: !!(audio && !audio.paused && want),
      waiting: false,
      url: curUrl,
      cached: 0,
      ctxState: 'element',
      gain: audio ? +audio.volume.toFixed(4) : -1,
      volume,
      duration: audio && isFinite(audio.duration) ? +audio.duration.toFixed(2) : 0,
      /* 这几个是给自检用的：证明播放头真的在走，而不是"我觉得应该响了"。
         （元素不挂在 DOM 上，所以查不到，只能从这里读。） */
      readyState: audio ? audio.readyState : -1,
      networkState: audio ? audio.networkState : -1,
      actualSrc: audio && audio.src ? audio.src.split(String.fromCharCode(47)).slice(-4).join(String.fromCharCode(47)) : null,
      errCode: audio && audio.error ? audio.error.code : null,
      currentTime: audio && isFinite(audio.currentTime) ? +audio.currentTime.toFixed(2) : 0,
      viaElement: true,
    }),
    useContext: () => {},                    // 这一版用不到，留着不报错
    wake: (fadeSec) => { if (want) start(fadeSec); },
    loadUrl: (u) => { curUrl = u || curUrl; const a = ensure(); a.src = curUrl; return Promise.resolve(null); },
    resume: () => Promise.resolve(),
    /* 预加载：建元素、设源，但**不主动 load**。
       真正的加载交给 start() —— 那里会判断 readyState 再决定要不要 load。
       这里若也 load，会和 start 抢，出现"刚加载又从头来"。 */
    preload: () => { ensure(); return Promise.resolve(null); },
    get playing() { return !!(audio && !audio.paused && want); },
    get waiting() { return false; },
    get ready() { return !!(audio && audio.readyState >= 1); },
    get url() { return curUrl; },
    get duration() { return audio && isFinite(audio.duration) ? audio.duration : 0; },
    get pending() { return pendingUrl; },
  };
}

/* ==========================================================================
   自动播放：挂在第一次用户交互上
   --------------------------------------------------------------------------
   浏览器不允许"无交互自动播放"。所以做法是：**监听第一次手势**
   （滚动、点按、按键），一有动作就把声音打开 —— 用户不需要去找按钮。

   这一章的鼓点、萨帕依、主题曲都是内容的一部分，不该让人先找开关。
   **默认开**：按钮一开始就显示"开"，第一次交互自动起。
   声音按钮仍然保留：关掉之后就不再自动开。
   ========================================================================== */
function autoPlayOnGesture(opts) {
  const { theme, seq, band } = opts;
  let armed = true;
  const btn = document.getElementById('sound-toggle');
  const text = document.getElementById('sound-text');

  const markOn = () => {
    if (btn) btn.setAttribute('aria-pressed', 'true');
    if (text) text.textContent = '声音 开';
  };
  const markOff = () => {
    if (btn) btn.setAttribute('aria-pressed', 'false');
    if (text) text.textContent = '声音 关';
  };

  /* 默认开：先把标签落成"开"，和下面第一次手势自动起保持一致。
     只写标签不放声音是骗人，所以这个"开"必须配自动起。 */
  markOn();

  const on = () => {
    if (!armed) return;
    armed = false;
    detach();
    if (seq && !seq.enabled) seq.enable();
    if (seq) {
      if (band !== undefined) seq.setBand(band);
      // 主题曲复用手鼓的 context —— 一个页面只留一个 AudioContext
      if (theme && seq.ctx) theme.useContext(seq.ctx);
    }
    /* 关键：**在这里唤醒 context 并起播**。
       有手鼓的页面由 seq.enable() 顺手唤醒；没有手鼓的页面
       （比如第三章，它只有配乐）必须自己来，否则一直 suspended。
       resume() 要在手势的调用栈里同步发起，浏览器才放行。

       **这里原来是 theme.wake()，那是错的。**
       wake() 只对"已经在播、被暂停"的 theme 有效；第一次进来
       theme 从没 start 过，wake 什么也不做 ——
       表现就是"这一页明明只有配乐，却一点声都没有"（用户报的第三章）。
       现在改成 resume 之后 start()，跟下面 startTheme 那条路一致。 */
    if (theme) {
      const fade = opts.fade === undefined ? 2.6 : opts.fade;
      const p = theme.resume();
      if (p && p.then) {
        p.then(() => {
          if (!theme) return;
          /* startTheme:false 的页面（第四章）**不能**在这里起播 ——
             它的主题曲要等圆圈点满才响。但 context 必须借这次手势
             跑起来，否则等点满时没手势可用，照样没声。 */
          if (opts.startTheme === false) theme.wake(fade);
          else if (!theme.playing) theme.start(fade);
        });
      }
    }
    markOn();
  };

  const evs = ['pointerdown', 'touchstart', 'keydown', 'wheel', 'scroll'];
  const detach = () => evs.forEach((e) => window.removeEventListener(e, on));
  evs.forEach((e) => window.addEventListener(e, on, { passive: true }));
  /* 自检用把手：外部能就此确认"手势监听到底绑上没有"。
     排查第五章"第一次手势不响"时加上的，留着有用 —— 很小，且只在 window 上挂一个对象。 */
  window.__XM_APG__ = {
    attached: evs.slice(), detached: false,
    get armed() { return armed; },
    theme: !!theme, seq: !!seq,
  };

  /* 自动开之后，声音按钮**必须由这一页的音乐接管**。
     之前只写了"关掉就不再自动开"，按钮仍挂在别处（比如手鼓）——
     结果按"声音 开"打开的是鼓点，不是这一页的音乐（踩过）。
     所以这里用捕获阶段接管：开/关都作用在 theme 上。 */
  if (btn && opts.ownButton !== false) {
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopImmediatePropagation();
      const isOn = btn.getAttribute('aria-pressed') === 'true';
      armed = false;
      detach();
      if (isOn) {
        if (theme) theme.stop(1.0);
        if (seq) seq.disable();
        markOff();
        return;
      }
      if (seq && !seq.enabled) seq.enable();
      if (seq && band !== undefined) seq.setBand(band);
      if (theme && seq && seq.ctx) theme.useContext(seq.ctx);
      if (theme) {
        const p = theme.resume();
        if (p && p.then) p.then(() => { if (theme) theme.start(1.4); });
      }
      markOn();
    }, true);
  }

  return { trigger: on, get armed() { return armed; } };
}

/* ==========================================================================
   解锁标记
   --------------------------------------------------------------------------
   互动完成后才允许进其他民族的页面。标记写在 localStorage，
   所以刷新、换页都还在。

   说明：这是**引导**，不是安全机制 —— 真想绕过的人清一下浏览器数据就行。
   目的是让人按设计的顺序走一遍，不是防谁。
   ========================================================================== */
const KEY = 'xiangmai.unlocked.mashrap';

const unlock = {
  get done() {
    try { return localStorage.getItem(KEY) === '1'; } catch { return false; }
  },
  set() {
    try { localStorage.setItem(KEY, '1'); } catch { /* 隐私模式写不了，忽略 */ }
    window.dispatchEvent(new CustomEvent('xiangmai:unlocked'));
  },
  clear() {
    try { localStorage.removeItem(KEY); } catch { /* 忽略 */ }
  },
};

__ns = __XM[7];
__ns.mount_createTheme = function () { return createTheme; };
__ns.mount_autoPlayOnGesture = function () { return autoPlayOnGesture; };
__ns.mount_unlock = function () { return unlock; };
}

/* ── js/lib/heritage-data.js ── */
function __M8__() {
/* ==========================================================================
   弦脉 · 各民族音乐非遗
   --------------------------------------------------------------------------
   旋律图上的八个入口。每一条对应一个分页面：../heritage/<id>/index.html

   字段说明：
     id        路由名，决定分页面目录
     name      中文名
     ug        拉丁 / 罗马转写（便于检索）
     group     民族
     kind      形态类型
     pitch     在旋律图上的音高位置（1 = 最低的下加一线，每 +1 上升半格）
     hue       音符配色色相（数字，空格分隔的 hsl 用）
     note      一句话说明
     level     名录等级
     region    流传地
     form      艺术形态
     instrument 乐器（**资料里没提就留空**，不猜）
     body      正文段落
     caveat    需要提醒读者的一条注意事项（可选）
     sources   来源列表：[材料名, 链接或说明]
     related   同族还有哪些项目（不属于这一条）

   2026 扩展：作者先后提供了两批资料（docs/extracted/ 下是抽出的纯文本）。
   第一批是各族文化的汇总，第二批是**逐项的专门资料**（带官方链接）。
   两批都整理在这里，并逐条标出处。

   **三条纪律**（和「参考来源」那一节一致）：
     ① 只写资料里有的。措辞贴着原文，不改写、不补充想象。
     ② 资料里没有的（比如某族没提乐器），**留空**，不拿相近内容顶上。
     ③ 资料里明确指出的**口径问题**要写进页面（caveat）——
        比如"苗族古歌是口头文学，和一般歌曲应加以区分"，
        读者按错的口径去理解，比读到空字段更糟。
   ========================================================================== */

const HERITAGE = [
  {
    id: 'zhuang-tianqin', name: '天琴艺术', ug: 'Tianqin',
    group: '壮族', kind: '器乐 · 弹唱', pitch: 3, hue: 36,
    collected: true,
    level: '国家级非物质文化遗产',
    region: '广西崇左一带（中越边境）',
    form: '弹、唱、舞一体',
    instrument: '天琴（壮语称「鼎叮」）',
    note: '天琴又称「鼎叮」，琴身不用钉子粘合，脚系铜铃，唱腔婉转，用于祈福和节庆。',
    body: [
      '流传于崇左边境，弹、唱、舞一体。',
      '天琴又称「鼎叮」，琴身不用钉子粘合，脚系铜铃，唱腔婉转，用于祈福和节庆。',
    ],
    sources: [['作者提供的《壮族.docx》', '']],
    /* 同族还有这些，但不属于"天琴艺术"这一条 —— 留着，别混进来 */
    related: ['壮锦织造技艺', '壮族铜鼓铸造技艺 / 铜鼓习俗', '靖西壮族绣球制作技艺'],
  },
  {
    id: 'mongol-morinhuur', name: '马头琴', ug: 'Morin Khuur',
    group: '蒙古族', kind: '器乐', pitch: 5, hue: 152,
    collected: true,
    level: '国家级非物质文化遗产',
    region: '蒙古族草原牧区',
    form: '弓弦乐器',
    instrument: '马头琴',
    note: '琴头雕刻精致马头，琴声低沉浑厚、辽阔悠扬，贯穿蒙古族节庆、祭祀、日常生活。',
    body: [
      '蒙古族标志性传统弓弦乐器，琴头雕刻精致马头，造型古朴大气。',
      '琴声低沉浑厚、辽阔悠扬，既能演绎《万马奔腾》的激昂壮阔，也能弹奏《鸿雁》的温柔绵长。',
      '马头琴贯穿蒙古族节庆、祭祀、日常生活，是草原文化的声音象征。',
    ],
    sources: [['作者提供的《蒙古族文化.docx》', '']],
    related: ['蒙古呼麦', '那达慕大会'],
  },
  {
    id: 'dong-dage', name: '侗族大歌', ug: 'Kam Grand Choir',
    group: '侗族', kind: '多声部民歌', pitch: 8, hue: 200,
    collected: true,
    level: '联合国教科文组织非物质文化遗产名录（2009 年入选）',
    region: '侗族村寨',
    form: '民间多声部民歌的总称，通常无伴奏、无指挥',
    /* 资料没提具体乐器 —— 留空，不猜。大歌本来就是无伴奏的。 */
    instrument: '',
    note: '侗族民间多声部民歌的总称，通常无伴奏、无指挥，传统声部组合常以「众低独高」概括。',
    body: [
      '侗族大歌是侗族民间多声部民歌的总称，通常无伴奏、无指挥。中国非物质文化遗产网将其归入表演艺术和口头传统相关类别。',
      '其传统声部组合常以「众低独高」概括：低声部构成厚实背景，高声部在上方领唱或凸显旋律，形成和谐而富层次的合唱音响。',
      '曲目可包括声音歌、叙事歌、童声歌、踩堂歌与拦路歌。',
      '歌师教歌、歌班唱歌是重要传承方式。大歌与村寨生活、礼俗、社会关系和知识记忆相连，不宜仅作为舞台合唱来理解。',
      '2009 年，侗族大歌入选联合国教科文组织非物质文化遗产名录。',
    ],
    caveat: '大歌与村寨生活、礼俗相连，**不宜仅作为舞台合唱来理解** —— 这是资料里明确提醒的。',
    sources: [
      ['国家民族事务委员会 · 中国非物质文化遗产网「侗族大歌」',
        'https://www.neac.gov.cn/seac/c103546/202305/1163432.shtml'],
    ],
    related: [],
  },
  {
    id: 'manchu-xinchengxi', name: '新城戏', ug: 'Xincheng Opera',
    group: '满族', kind: '戏曲', pitch: 6, hue: 320,
    collected: true,
    level: '国家级非物质文化遗产',
    region: '吉林松原',
    form: '戏曲剧种',
    instrument: '八角鼓',
    note: '诞生吉林松原，以八角鼓为基础，融合萨满音乐、满族民歌，是专属满族的戏曲剧种。',
    body: [
      '诞生吉林松原，以八角鼓为基础，融合萨满音乐、满族民歌，是专属满族的戏曲剧种。',
      '行当齐全，表演融入满族舞蹈，剧目多取材满族历史与民间故事，唱腔独特，是当代满族戏曲代表。',
    ],
    sources: [['作者提供的《满族.docx》', '']],
    related: ['新宾满族剪纸', '中式服装制作技艺（满族旗袍制作技艺）'],
  },
  {
    id: 'miao-guge', name: '苗族古歌', ug: 'Hxak Lul',
    group: '苗族', kind: '口头文学 · 古歌', pitch: 11, hue: 12,
    collected: true,
    level: '国家级非物质文化遗产',
    region: '苗族各聚居区（篇目与称谓随地区、支系不同）',
    form: '古老的口头文学形式',
    instrument: '',
    note: '苗族古老的口头文学形式，内容涉及开天辟地、战争迁徙、风俗习惯、神话传说等。',
    body: [
      '苗族古歌是苗族古老的口头文学形式，内容涉及开天辟地、战争迁徙、风俗习惯、生产劳动、神话传说、爱情故事、礼辞、丧葬、苗医苗药、天文和哲学等。',
      '它可通过口头演述与抄本两种方式传播。在不同地区和支系中，篇目、演述语境与称谓可能不同，因此采集或引用时宜注明地区与版本。',
      '古歌保存了关于族群历史、信仰、迁徙和生活知识的集体记忆，对历史、文学、宗教、艺术及民俗研究具有重要价值，也在维系文化认同方面发挥作用。',
    ],
    caveat: '古歌**属于口头文学传统，和一般意义上的歌曲资料应加以区分**；' +
      '也不要把不同地区的文本拼接为单一固定版本 —— 这两条都是资料里明确指出的。',
    sources: [
      ['中国非物质文化遗产网「苗族古歌」',
        'https://www.ihchina.cn/project_details/12179'],
      ['国家民族事务委员会 · 第一批国家级非遗名录少数民族部分',
        'https://www.neac.gov.cn/seac/c100845/201401/1096446.shtml'],
    ],
    related: ['苗族银饰锻制技艺', '苗绣（苗族刺绣）'],
  },
  {
    id: 'yi-shan-ge', name: '山歌小调', ug: 'Yi Folk Songs',
    group: '彝族', kind: '民歌', pitch: 9, hue: 42,
    collected: true,
    level: '国家级非物质文化遗产（盘县彝族山歌）',
    region: '贵州六盘水盘县盘北地区；云南弥渡牛街（地方补充）',
    form: '山歌 —— 独唱、对唱、群体对唱、齐唱或简单二声部合唱',
    instrument: '',
    note: '并非全国统一的单一曲种 —— 不同地区在曲调、语言、歌场和演唱功能上差异明显。',
    body: [
      '「彝族山歌小调」并非全国统一的单一曲种，不同地区在曲调、语言、歌场和演唱功能上差异明显。下面以盘县彝族山歌为主体案例，以云南弥渡牛街的山歌小调作地方补充。',
      '盘县彝族山歌主要流传于贵州六盘水盘县盘北地区。按内容可分为情歌、酒歌、劳动歌、叙事歌；演唱可为独唱、对唱、群体对唱、齐唱或简单二声部合唱。',
      '歌词多见七言四句，也有问答结构，曲调被当地称作「拉山腔」。',
      '该项目强调喉腔和头腔共振、真假声混合等演唱技巧，主要通过口传心授延续。对唱既是音乐实践，也常承载社交、伦理与情感表达。',
      '云南弥渡牛街的彝族社区在劳动、喜庆和恋爱交往中唱山歌小调。相关材料指出，当地山歌常由男女对唱，内容涉及劳动、生活、爱情、亲情和友情；曲调可呈现欢快、忧伤、深情等不同情绪。',
    ],
    caveat: '用「彝族山歌小调」作总称时，**应避免把贵州、云南、四川等地的音乐形态视为完全相同**；' +
      '创作或研究宜先确定具体地区 —— 这是资料里的提醒。',
    sources: [
      ['中国非物质文化遗产网「彝族民歌 彝族山歌」',
        'https://www.ihchina.cn/project_details/12670/'],
      ['云南非物质文化遗产保护网「弥渡牛街彝族民俗文化拾贝」',
        'https://www.ynich.cn/news/new/1551.html'],
    ],
    related: ['彝族剪纸', '彝族服饰制作技艺', '彝剧'],
  },
  {
    id: 'dai-zhangha', name: '章哈', ug: 'Zhangha',
    group: '傣族', kind: '说唱', pitch: 4, hue: 168,
    collected: true,
    level: '国家级非物质文化遗产',
    region: '云南西双版纳、德宏的傣族村寨',
    form: '口头说唱',
    instrument: '傣玎',
    note: '没有固定书面剧本，依靠章哈歌手口头代代传承，被称为傣族的「口头百科全书」。',
    body: [
      '傣族传统口头说唱艺术，没有固定书面剧本，依靠章哈歌手口头代代传承。',
      '内容包含创世神话、民间爱情故事、历史传说，常在泼水节、赕佛、村寨节庆活动中演唱。',
      '伴奏使用傣玎乐器，唱腔婉转舒缓，被称为傣族的「口头百科全书」。',
    ],
    sources: [['作者提供的《傣族文化.docx》', '']],
    related: ['傣族慢轮制陶技艺', '傣族织锦技艺', '傣族孔雀舞'],
  },
  {
    id: 'tibetan-gesar', name: '格萨尔', ug: 'Gesar',
    group: '藏族', kind: '英雄史诗 · 说唱', pitch: 13, hue: 218,
    collected: true,
    level: '2006 年列入国家级非物质文化遗产名录；' +
      '2009 年列入联合国教科文组织人类非物质文化遗产代表作名录',
    region: '多地藏族社区及其他民族中流传；西藏那曲是重要的传承地',
    form: '以艺人说唱、吟诵、文本抄本、绘画、藏戏等多种形态延续',
    instrument: '',
    note: '以格萨尔王故事为中心的英雄史诗传统，说唱艺人是其活态传承的关键。',
    body: [
      '《格萨尔》是以格萨尔王故事为中心的英雄史诗传统，讲述岭国格萨尔王征战四方、抑强扶弱、造福人民的故事。它在多地藏族社区及其他民族中流传。',
      '格萨尔并非单一固定文本，而是以艺人说唱、吟诵、文本抄本、绘画、藏戏等多种形态延续。说唱艺人是其活态传承的关键，表演会随地区、师承和场合而有所不同。',
      '相关资料将其视为认识藏族历史、文化、民俗的重要窗口，也常称为「东方的荷马史诗」。',
      '格萨（斯）尔于 2006 年列入国家级非物质文化遗产名录，2009 年列入联合国教科文组织人类非物质文化遗产代表作名录。',
      '保护工作包括史诗文本搜集、翻译出版、艺人传习、展演与数据库建设。',
      '站内另有已核实的一条传承人记录：西藏那曲的桑珠能唱 60 多部《格萨尔》，2009 年入选国家级非物质文化遗产代表性传承人。',
    ],
    caveat: '使用相关素材时，**应明确具体地区与版本，避免把不同传承支系当作同一唱本** —— ' +
      '这是资料里的提醒。',
    sources: [
      ['中国非物质文化遗产网「格萨尔保护实践总结」',
        'https://www.ihchina.cn/tenyear_protect_detail/19787.html'],
      ['中国非物质文化遗产网「格萨尔的活态保护和传承」',
        'https://www.ihchina.cn/project_details/10032/'],
      ['站内已核实来源 · 桑珠（西藏那曲），见附录「参考来源」一节', ''],
    ],
    related: [],
  },
];

/** 分页面路径 */
function heritageHref(id) {
  return '../heritage/' + id + '/index.html';
}

/** 按 id 取一条 */
function heritageById(id) {
  return HERITAGE.find((h) => h.id === id) || null;
}

/** 已经收录了资料的 —— 现在八族都是 */
function collectedHeritage() {
  return HERITAGE.filter((h) => h.collected);
}

/* --------------------------------------------------------------------------
   资料配图
   --------------------------------------------------------------------------
   来源：作者提供的民族资料 docx 里**自带的插图**
   （tools/docx-images.mjs 抽出，tools/wire-docx-images.mjs 接进来）。
   所以它没有版权问题 —— 是作者素材的一部分，不是从网上抓的。

   **图上拍的是什么，这里不做断言。** 文件名 image1/2/3 就是文档里的原顺序，
   它对应哪一段文字只有作者知道。所以页面上统一写成「资料配图」+ 来源，
   不编内容说明。

   只有明确对得上单一民族的文档才接。那份混了多族的《少数民族文化》
   （里面有唐卡、侗族大歌、苗族银饰……）**先不接** ——
   硬塞给某一个民族就是错的。
   -------------------------------------------------------------------------- */
const DOC_IMAGES = {
  'zhuang-tianqin': 4,
  'mongol-morinhuur': 3,
  'manchu-xinchengxi': 3,
  'miao-guge': 3,
  'yi-shan-ge': 3,
  'dai-zhangha': 4,
};

/** 取某一族有哪些资料配图 */
function heritageImages(id) {
  const n = DOC_IMAGES[id] || 0;
  const out = [];
  for (let i = 1; i <= n; i++) {
    out.push({
      src: '../../assets/img/heritage/' + id + '/doc-' + i + '.webp',
      caption: '资料配图',
    });
  }
  return out;
}

__ns = __XM[8];
__ns.mount_HERITAGE = function () { return HERITAGE; };
__ns.mount_heritageHref = function () { return heritageHref; };
__ns.mount_heritageById = function () { return heritageById; };
__ns.mount_collectedHeritage = function () { return collectedHeritage; };
__ns.mount_heritageImages = function () { return heritageImages; };
}

/* ── js/lib/heritage-page.js ── */
function __M9__() {
var heritageImages = __XM[8]["heritageImages"];

/* ==========================================================================
   弦脉 · 民族分页的渲染
   --------------------------------------------------------------------------
   八个入口（壮 / 蒙古 / 侗 / 满 / 苗 / 彝 / 傣 / 藏）共用这一份渲染逻辑，
   页面 HTML 完全一样，只靠 <body data-ethnic="..."> 区分。

   为什么八个页面不各写一份：
     · 八份 HTML 就有八个地方要改，早晚改漏一个（这个项目已经栽过一次：
       导航里一处漏改，底部链接直接打不开）
     · 内容都在 heritage-data.js 里，页面只负责"长什么样"

   **八个风格的落法**：用每族自己的色相 --eh 驱动整页的强调色 ——
   标题下划线、字段标签、正文里的小标记、页脚线条，全部跟着走。
   壮族偏金、傣族偏孔雀青、苗族偏朱、蒙古族偏草绿……同一套骨架，八种气质。
   两条纪律（同「参考来源」那一节）：
     ① 正文只写 heritage-data.js 里有的，这里不做任何补充。
     ② 未收录的那两族**明说未收录**，并且不用相近内容凑数。
   ========================================================================== */



const $ = (s, r) => (r || document).querySelector(s);

function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"]/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}

/** 把正文里的「」引号加一点强调，并把 **粗体** 转成 <b>。
    只动样式，不动文字。
    **粗体这条是补的**：原来只处理「」，于是 caveat 里写的 `**应避免…**`
    原样显示成了星号（彝族那页踩过，和 sources.js 是同一个坑）。 */
function rich(s) {
  return esc(s)
    .replace(/「([^」]+)」/g, '<em class="h-q">「$1」</em>')
    .replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>');
}

/**
 * @param {object} opts
 * @param {object} opts.item  heritage-data.js 里的一条
 * @param {HTMLElement} opts.host
 */
function buildHeritagePage(opts) {
  const item = opts.item;
  const host = opts.host;
  if (!item || !host) return null;

  /* 每族的色相驱动整页强调色。
     hsl 用空格分隔写法（--h 那套约定，见 styles/chapter.css）。 */
  const root = document.documentElement;
  root.style.setProperty('--eh', String(item.hue));
  document.body.dataset.ethnic = item.id;
  document.body.dataset.collected = item.collected ? '1' : '0';

  const fields = [
    ['等级', item.level],
    ['流传', item.region],
    ['形态', item.form],
    ['乐器', item.instrument],
  ].filter(([, v]) => v);

  const bodyHtml = (item.body || []).map((p) => '<p class="h-p">' + rich(p) + '</p>').join('');

  /* 资料配图。来源是作者提供的 docx 里自带的插图（见 heritage-data.js），
     图注统一「资料配图」—— 图上拍的是什么只有作者知道，编图注就是替资料说话。 */
  const imgs = heritageImages(item.id);
  const imagesHtml = imgs.map((im) =>
    '<figure class="h-fig">' +
      '<img src="' + esc(im.src) + '" alt="' + esc(item.group + ' ' + item.name + ' 资料配图') +
        '" loading="lazy" decoding="async">' +
      '<figcaption>' + esc(im.caption) + '</figcaption>' +
    '</figure>').join('');

  /* 资料里明确指出的口径问题。
     单独一块、放在正文之前 —— 读者按错的口径去理解，
     比读到空字段更糟（苗族古歌"不是一般意义上的歌曲"就是这种）。 */
  const caveatHtml = item.caveat
    ? '<aside class="h-caveat">' +
        '<span class="h-caveat__tag">读之前先知道</span>' +
        '<p class="h-caveat__b">' + rich(item.caveat) + '</p>' +
      '</aside>'
    : '';

  /* 来源列表。带链接的做成外链（新标签、noopener），
     没链接的（比如"作者提供的某 docx"）就只是文字。 */
  const sources = item.sources || (item.source ? [[item.source, '']] : []);
  const sourcesHtml = sources.length
    ? '<ul class="h-srcs">' + sources.map(([name, url]) =>
        '<li>' + (url
          ? '<a href="' + esc(url) + '" target="_blank" rel="noopener noreferrer">' +
              esc(name) + '<span class="h-out" aria-hidden="true">↗</span></a>'
          : '<span>' + esc(name) + '</span>') +
        '</li>').join('') + '</ul>'
    : '<p class="h-src">（这一条尚未标注来源）</p>';

  const relatedHtml = (item.related && item.related.length)
    ? '<section class="h-block">' +
        '<h3 class="h-sub">同族还有这些（不在这一条里）</h3>' +
        '<ul class="h-related">' +
          item.related.map((r) => '<li>' + esc(r) + '</li>').join('') +
        '</ul>' +
        '<p class="h-fine">列在这里只是为了说明「这一族不止这一项」，它们各自另有条目。</p>' +
      '</section>'
    : '';

  /* 未收录的族（现在八族都收录了，这段留着 —— 以后加新族时还用得上）：
     明说，并给出原因。不摆"敬请期待"那种空话 ——
     它和"我们还没查到"是两回事。 */
  const noticeHtml = item.collected ? '' :
    '<aside class="h-notice">' +
      '<p class="h-notice__t">这一页尚未收录</p>' +
      '<p class="h-notice__b">' + rich(sources.map(([n]) => n).join('；') || '暂无资料') + '</p>' +
      '<p class="h-notice__b">下面这些是站内已有的、能追溯到来源的内容；' +
      '剩余部分等查到可靠出处再补。' +
      '<b>不用相近内容凑数</b>——一个敢说自己缺什么的档案，比什么都敢写的可信。</p>' +
    '</aside>';

  host.innerHTML =
    '<header class="h-hero">' +
      '<p class="h-kicker">' + esc(item.group) + ' · ' + esc(item.kind) + '</p>' +
      '<h1 class="h-title">' + esc(item.name) + '</h1>' +
      '<p class="h-ug">' + esc(item.ug) + '</p>' +
      '<p class="h-lead">' + rich(item.note) + '</p>' +
      (item.collected
        ? '<p class="h-badge h-badge--on">已收录 · ' + sources.length + ' 项来源</p>'
        : '<p class="h-badge h-badge--off">未收录 · 见下方说明</p>') +
    '</header>' +

    noticeHtml +
    caveatHtml +

    '<section class="h-block">' +
      '<div class="h-grid">' +
        fields.map(([k, v]) =>
          '<div class="h-field">' +
            '<span class="h-field__k">' + esc(k) + '</span>' +
            '<span class="h-field__v">' + esc(v) + '</span>' +
          '</div>').join('') +
      '</div>' +
    '</section>' +

    '<section class="h-block h-block--body">' +
      '<h2 class="h-h2">它是什么</h2>' +
      bodyHtml +
    '</section>' +

    /* 资料配图。**放在正文之后** —— 它是佐证，不是开场。
       图注统一「资料配图」：图上拍的是什么只有作者知道，
       编一句图注就等于替资料说话（这一站的规矩是不编）。 */
    (imagesHtml
      ? '<section class="h-block">' +
          '<h2 class="h-h2">资料配图</h2>' +
          '<div class="h-figs">' + imagesHtml + '</div>' +
          '<p class="h-fine">以上图片取自作者提供的民族资料文档，随该文档一并收录。</p>' +
        '</section>'
      : '') +

    '<section class="h-block">' +
      '<h2 class="h-h2">来源</h2>' +
      sourcesHtml +
      '<p class="h-fine">本页文字取自上述材料，未作补充。' +
      '站内「参考来源」一节列了已核实与尚未核实的内容。</p>' +
    '</section>' +

    relatedHtml +

    '<nav class="h-back"><a href="../fulu/index.html#melody-act">← 回到旋律图</a></nav>';

  // 自检用
  window.__XM_HERITAGE__ = {
    id: item.id, collected: item.collected,
    state: () => ({
      id: item.id, hue: item.hue,
      bodyParas: (item.body || []).length,
      notice: !item.collected,
      fields: fields.length,
      related: (item.related || []).length,
      sources: sources.length,
      linkedSources: sources.filter(([, u]) => u).length,
      caveat: !!item.caveat,
    }),
  };

  return window.__XM_HERITAGE__;
}

__ns = __XM[9];
__ns.mount_buildHeritagePage = function () { return buildHeritagePage; };
}

/* ── js/pages/heritage.js ── */
function __M10__() {
var bootChapter = __XM[6]["bootChapter"];
var createTheme = __XM[7]["createTheme"];
var autoPlayOnGesture = __XM[7]["autoPlayOnGesture"];
var heritageById = __XM[8]["heritageById"];
var HERITAGE = __XM[8]["HERITAGE"];
var buildHeritagePage = __XM[9]["buildHeritagePage"];

/* ==========================================================================
   弦脉 · 民族分页的入口（八个页面共用）
   --------------------------------------------------------------------------
   页面 HTML 完全一样，靠 <body data-ethnic="壮族的 id"> 区分是哪一族。

   为什么共用一份：
     八份 HTML 就有八个地方要改，早晚改漏一个 ——
     这个项目已经栽过一次（导航里一处漏改，底部链接直接打不开）。
     内容都在 heritage-data.js，页面只负责"长什么样"。

   声音：这一页**只有配乐，没有手鼓**。
   和第三章、第五章同理 —— 有自己配乐的页面必须 drums:false，
   否则声音按钮会接在鼓上，按"开"听到的是序章那套鼓点（踩过）。
   ========================================================================== */





/* 哪一族：从 body 上读。读不到就退回第一族 —— 不留白屏。 */
const id = document.body.dataset.ethnic || HERITAGE[0].id;
const item = heritageById(id);

const ctx = bootChapter({
  active: 'fulu',            // 顶栏高亮挂在附录那一格（这八页是附录伸出来的）
  drums: false,
  /* 这几页正文不长，地火再压一档 —— 和第五章同一个理由：
     文字压在火上读着累。 */
  emberGain: 0.3,
});

if (item) {
  document.title = item.group + ' · ' + item.name + '｜八音 · 弦脉';
  buildHeritagePage({ item, host: document.getElementById('ethnic') });
} else {
  const host = document.getElementById('ethnic');
  if (host) {
    host.innerHTML = '<p class="h-notice__t">没有这一族</p>' +
      '<p class="h-notice__b">地址里的民族标识不认识。' +
      '<a href="../fulu/index.html#melody-act">回到旋律图</a>挑一个吧。</p>';
  }
}

/* 配乐：复用附录那首主题曲（站内只有三首 mp3，不复用就得再加文件）。
   **路径是三层 ../**：这一页在 heritage/<id>/ 下，比别的章节还深一层。
   写成两层会 404 —— 而且 createTheme 的 catch 会把它吞成一句 warning，
   页面看着正常、就是没声（这个坑在第五章踩过一次，八页自检又抓了一次）。 */
const theme = createTheme('../../assets/audio/mashrap/theme.mp3');
theme.setVolume(0.26);       // 比第五章更轻 —— 这一页是读文字，不是看场面
theme.preload();
autoPlayOnGesture({ theme, seq: null, fade: 2.4 });

// 自检用
window.__XM_THEME__ = theme;
window.__XM_CTX__ = ctx;
}

/* js/lib/materials.js */
try {
  __ns = __XM[0];
  __M0__();
  for (var k in __XM[0]) { if (k.indexOf("mount_") === 0) __XM[0][k.slice(6)] = __XM[0][k](); }
} catch (e) {
  (window.__XM_BOOT_ERR__ = window.__XM_BOOT_ERR__ || []).push("js/lib/materials.js" + " :: " + (e && e.stack || e));
}

/* js/lib/renderer.js */
try {
  __ns = __XM[1];
  __M1__();
  for (var k in __XM[1]) { if (k.indexOf("mount_") === 0) __XM[1][k.slice(6)] = __XM[1][k](); }
} catch (e) {
  (window.__XM_BOOT_ERR__ = window.__XM_BOOT_ERR__ || []).push("js/lib/renderer.js" + " :: " + (e && e.stack || e));
}

/* js/lib/guide-actor.js */
try {
  __ns = __XM[2];
  __M2__();
  for (var k in __XM[2]) { if (k.indexOf("mount_") === 0) __XM[2][k.slice(6)] = __XM[2][k](); }
} catch (e) {
  (window.__XM_BOOT_ERR__ = window.__XM_BOOT_ERR__ || []).push("js/lib/guide-actor.js" + " :: " + (e && e.stack || e));
}

/* js/lib/companion.js */
try {
  __ns = __XM[3];
  __M3__();
  for (var k in __XM[3]) { if (k.indexOf("mount_") === 0) __XM[3][k.slice(6)] = __XM[3][k](); }
} catch (e) {
  (window.__XM_BOOT_ERR__ = window.__XM_BOOT_ERR__ || []).push("js/lib/companion.js" + " :: " + (e && e.stack || e));
}

/* js/lib/sequencer.js */
try {
  __ns = __XM[4];
  __M4__();
  for (var k in __XM[4]) { if (k.indexOf("mount_") === 0) __XM[4][k.slice(6)] = __XM[4][k](); }
} catch (e) {
  (window.__XM_BOOT_ERR__ = window.__XM_BOOT_ERR__ || []).push("js/lib/sequencer.js" + " :: " + (e && e.stack || e));
}

/* js/lib/site.js */
try {
  __ns = __XM[5];
  __M5__();
  for (var k in __XM[5]) { if (k.indexOf("mount_") === 0) __XM[5][k.slice(6)] = __XM[5][k](); }
} catch (e) {
  (window.__XM_BOOT_ERR__ = window.__XM_BOOT_ERR__ || []).push("js/lib/site.js" + " :: " + (e && e.stack || e));
}

/* js/lib/chapter.js */
try {
  __ns = __XM[6];
  __M6__();
  for (var k in __XM[6]) { if (k.indexOf("mount_") === 0) __XM[6][k.slice(6)] = __XM[6][k](); }
} catch (e) {
  (window.__XM_BOOT_ERR__ = window.__XM_BOOT_ERR__ || []).push("js/lib/chapter.js" + " :: " + (e && e.stack || e));
}

/* js/lib/theme.js */
try {
  __ns = __XM[7];
  __M7__();
  for (var k in __XM[7]) { if (k.indexOf("mount_") === 0) __XM[7][k.slice(6)] = __XM[7][k](); }
} catch (e) {
  (window.__XM_BOOT_ERR__ = window.__XM_BOOT_ERR__ || []).push("js/lib/theme.js" + " :: " + (e && e.stack || e));
}

/* js/lib/heritage-data.js */
try {
  __ns = __XM[8];
  __M8__();
  for (var k in __XM[8]) { if (k.indexOf("mount_") === 0) __XM[8][k.slice(6)] = __XM[8][k](); }
} catch (e) {
  (window.__XM_BOOT_ERR__ = window.__XM_BOOT_ERR__ || []).push("js/lib/heritage-data.js" + " :: " + (e && e.stack || e));
}

/* js/lib/heritage-page.js */
try {
  __ns = __XM[9];
  __M9__();
  for (var k in __XM[9]) { if (k.indexOf("mount_") === 0) __XM[9][k.slice(6)] = __XM[9][k](); }
} catch (e) {
  (window.__XM_BOOT_ERR__ = window.__XM_BOOT_ERR__ || []).push("js/lib/heritage-page.js" + " :: " + (e && e.stack || e));
}

/* js/pages/heritage.js */
try {
  __ns = __XM[10];
  __M10__();
  for (var k in __XM[10]) { if (k.indexOf("mount_") === 0) __XM[10][k.slice(6)] = __XM[10][k](); }
} catch (e) {
  (window.__XM_BOOT_ERR__ = window.__XM_BOOT_ERR__ || []).push("js/pages/heritage.js" + " :: " + (e && e.stack || e));
}
})();
