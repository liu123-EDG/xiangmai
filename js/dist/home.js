/* 由 tools/build.mjs 生成，请勿直接编辑。改源码后运行 node tools/build.mjs
   本页模块（依依赖序）：
     js/lib/materials.js  → VERT_SRC, NOISE_GLSL, MATERIAL_GLSL, SCENE_FRAG, DUST_FRAG, EMBER_FRAG, CHAPTER_AIR_FRAG, MASHRAQ_FRAG, WALL_FRAG
     js/lib/renderer.js  → COLORS, SEG_H, SEG_BOUNDS, BREATH, Renderer
     js/lib/sequencer.js  → DapSequencer, PATTERNS
     js/lib/scroll.js  → BandScroller, onScrollThrottled
     js/lib/site.js  → NAV, mountShell, mountSoundButton, mountChapterNav, revealOnScroll, mountSlots
     js/lib/hero-video.js  → isDesktop, shouldSkipVideo, buildHeroVideo
     js/lib/drum.js  → buildDrum
     js/pages/network.js  → initNetwork, LINEAGE
     js/pages/home.js
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
    this.emberScale = 1.55;
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
      gl.uniform1f(u.u_heat, st.heat === undefined ? this.heat : st.heat);
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

/* ── js/lib/sequencer.js ── */
function __M2__() {
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

__ns = __XM[2];
__ns.mount_DapSequencer = function () { return DapSequencer; };
__ns.mount_PATTERNS = function () { return PATTERNS; };
}

/* ── js/lib/scroll.js ── */
function __M3__() {
/* ==========================================================================
   弦脉 · 滚动分段
   --------------------------------------------------------------------------
   把"滚到哪儿 = 第几段"这件事抽出来，因为后续每一章都要用同一套逻辑：
   结构柱是天然的进度条，滚动本身就是操作，不需要任何控件。

   只负责算，不碰 DOM —— 由页面决定怎么渲染这个状态。
   ========================================================================== */

/**
 * @typedef {object} BandState
 * @property {number} progress   0..1 本章推进进度
 * @property {number} band       0..n 已点亮段数（0 = 还没开始）
 * @property {number} active    当前段索引（连续，用于着色器相位）
 * @property {number[]} lit      每段的点亮值 0..1，已做缓动
 */

class BandScroller {
  /**
   * @param {HTMLElement} section 定义"一段有多长"的容器
   * @param {object} opts
   * @param {number[]} opts.thresholds 各段点亮的进度阈值
   * @param {number[]} [opts.anchors]  各状态对应的滚动锚点（供跳转用）
   * @param {number} [opts.count=3]    段数
   * @param {number} [opts.litUp=0.075]   点亮缓动速率
   * @param {number} [opts.litDown=0.024] 退暗缓动速率
   */
  constructor(section, opts = {}) {
    this.section = section;
    this.count = opts.count || 3;
    this.thresholds = opts.thresholds || [0.10, 0.40, 0.86];
    this.anchors = opts.anchors || [0.02, 0.16, 0.52, 0.97];
    this.litUp = opts.litUp === undefined ? 0.075 : opts.litUp;
    this.litDown = opts.litDown === undefined ? 0.024 : opts.litDown;

    this.band = -1;
    this.progress = 0;
    this.lit = new Float32Array(this.count);
    this._velocity = 0;
    this._lastY = window.scrollY || 0;
  }

  /** 读一次滚动位置，返回目标状态（lit 需要按帧推进，见 step） */
  read() {
    const top = this.section.offsetTop;
    const denom = Math.max(1, this.section.offsetHeight - window.innerHeight);
    const progress = Math.min(1, Math.max(0, (window.scrollY - top) / denom));

    let band = 0;
    for (let i = 0; i < this.thresholds.length; i++) {
      if (progress >= this.thresholds[i]) band = i + 1;
    }

    const raw = Math.min(1.4, Math.abs(window.scrollY - this._lastY) / 26);
    this._lastY = window.scrollY;
    this._velocity += (raw - this._velocity) * 0.10;

    this.progress = progress;
    return { progress, band, velocity: this._velocity };
  }

  /** 按帧推进点亮缓动；返回是否有段状态发生变化 */
  step(band) {
    const changed = band !== this.band;
    this.band = band;
    const litCount = Math.min(band, this.count);
    for (let i = 0; i < this.count; i++) {
      const want = i < litCount ? 1 : 0;
      const rate = want > this.lit[i] ? this.litUp : this.litDown;
      this.lit[i] += (want - this.lit[i]) * rate;
    }
    return changed;
  }

  /** 跳到某个状态（0 = 起始，1..count = 各段） */
  jumpTo(state, smooth = true) {
    const top = this.section.offsetTop;
    const denom = Math.max(1, this.section.offsetHeight - window.innerHeight);
    const a = this.anchors[Math.max(0, Math.min(this.anchors.length - 1, state))];
    window.scrollTo({ top: top + denom * a + 2, behavior: smooth ? 'smooth' : 'auto' });
  }

  get velocity() { return this._velocity; }

  /** 页面切到后台再回来时重置惯性，避免累积出一个巨大的差值 */
  resetVelocity() {
    this._lastY = window.scrollY;
    this._velocity = 0;
  }
}

/**
 * 给一个滚动容器绑定"只需算一次"的轻量节流，避免每帧都读 offsetHeight。
 * 返回取消函数。
 */
function onScrollThrottled(fn) {
  let ticking = false;
  const handler = () => {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(() => { ticking = false; fn(); });
  };
  window.addEventListener('scroll', handler, { passive: true });
  return () => window.removeEventListener('scroll', handler);
}

__ns = __XM[3];
__ns.mount_BandScroller = function () { return BandScroller; };
__ns.mount_onScrollThrottled = function () { return onScrollThrottled; };
}

/* ── js/lib/site.js ── */
function __M4__() {
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

  host.innerHTML =
    (prev ? '<a href="' + base + prev.href + '">← ' + label(prev) + '</a>' : '<span></span>') +
    (next ? '<a class="next" href="' + base + next.href + '">' + label(next) + ' →</a>' : '<span></span>');
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

__ns = __XM[4];
__ns.mount_NAV = function () { return NAV; };
__ns.mount_mountShell = function () { return mountShell; };
__ns.mount_mountSoundButton = function () { return mountSoundButton; };
__ns.mount_mountChapterNav = function () { return mountChapterNav; };
__ns.mount_revealOnScroll = function () { return revealOnScroll; };
__ns.mount_mountSlots = function () { return mountSlots; };
}

/* ── js/lib/hero-video.js ── */
function __M5__() {
/* ==========================================================================
   弦脉 · 首屏概念片
   --------------------------------------------------------------------------
   即梦那种做法：进站第一眼就是一整屏画面，没有别的。
   滚动时它淡出，把画面让给三段结构柱（那才是真正的"入口"）。

   三段素材循环：
     0.00 – 5.09   壁画推进
     5.09 – 10.18  颜色抽干
    10.18 – 15.90  黑场 · 一道光线
    15.90 → 0      接回开头

   为什么要"接回"而不是让 <video loop>：
   三段是三个文件，前两段放完就停了。所以用一个共享时钟驱动，
   循环点靠**交叉淡入**遮住 —— 观众看到的是一段连续的画面，
   不是一个三段循环的幻灯片。

   性能：三段全屏视频 + WebGL 会拖垮手机，
   所以只在桌面端启用（判据是屏幕宽度和指针类型，不是 UA）。
   ========================================================================== */

const CLIP = 5.09;              // 每段时长（实测，见 tools/mp4info.mjs）
const T2 = CLIP;                // 5.09
const T3 = CLIP * 2;            // 10.18
const LOOP_LEN = 17.60;         // 整圈长度（三段放完 + 片尾定格与淡出）

/** 桌面端？—— 用来选素材尺寸（960p 还是 640p），不再用来决定"放不放"。 */
function isDesktop() {
  if (typeof window.matchMedia !== 'function') return true;
  const wide = window.matchMedia('(min-width: 900px)').matches;
  const fine = window.matchMedia('(hover: hover) and (pointer: fine)').matches;
  const cores = navigator.hardwareConcurrency || 4;
  return wide && fine && cores >= 4;
}

/** 该不该**放弃**放视频（低端设备 / 省流模式）。
    注意这跟 isDesktop 是两件事：
      · 早先我拿 isDesktop 当"放不放"的开关，结果手机上一片黑 ——
        用户直接问"手机端看不到第一页的视频"。
        素材压小之后手机完全放得动（640×360 三段共 1.2MB），
        所以现在**手机也放**，只有确实带不动或用户开了省流才降级。 */
function shouldSkipVideo() {
  if (typeof window.matchMedia === 'function') {
    // 省流模式：用户明确表示不想吃流量，尊重它
    if (window.matchMedia('(prefers-reduced-data: reduce)').matches) return true;
  }
  const cores = navigator.hardwareConcurrency || 4;
  const mem = navigator.deviceMemory || 4;      // 只有 Chromium 有，缺省当 4G
  return cores < 4 || mem < 2;
}

/**
 * @param {object} opts
 * @param {HTMLElement} opts.host    .hero-video 容器
 * @param {number} [opts.fadeStart]  滚动到哪个进度开始淡出（0..1）
 * @param {number} [opts.fadeEnd]    到哪个进度完全消失
 * @param {boolean} [opts.reduced]
 */
function buildHeroVideo(opts) {
  const { host } = opts;
  if (!host) return null;

  const base = opts.base === undefined ? '' : opts.base;
  /* 两套素材：
       桌面  960×540 / 2.2Mbps   三段共 2.3MB
       手机  640×360 / 1.1Mbps   三段共 1.2MB
     手机屏幕就那么宽，540p 是浪费；小版省一半流量、解码也轻。
     都是 webm/vp9 —— 它是 MediaRecorder 出的，容器一定合法
     （我手写 mp4 那次浏览器直接不认，错误码 4）。 */
  const slim = window.matchMedia('(min-width: 900px)').matches;
  const suffix = slim ? '-slim.webm' : '-slim-m.webm';
  const files = ['01-mural' + suffix, '02-drain' + suffix, '03-black' + suffix];
  const vids = [...host.querySelectorAll('video')];
  if (vids.length < 3) return null;

  const fadeStart = opts.fadeStart === undefined ? 0.03 : opts.fadeStart;
  const fadeEnd = opts.fadeEnd === undefined ? 0.20 : opts.fadeEnd;

  let started = false;
  let t0 = 0;
  let curClip = -1;
  let visible = true;
  let raf = 0;
  let timer = 0;

  /** 挂上素材。
      三段**一次全挂**，不做按需加载 —— 早先想省带宽，只挂第一段、
      别的等切到了再挂，结果 showClip 在未挂载时静默失败
      （表现为"该换第二段了却什么都没发生"）。
      现在一套总共 1.2–2.3MB，全挂上启动只多一两 MB，稳得多。 */
  function mountAll() {
    vids.forEach((v, i) => {
      if (v.dataset.mounted) return;
      v.dataset.mounted = '1';
      v.src = base + 'assets/video/reveal/' + files[i];
      v.load();
    });
  }

  /** 播一段，失败要**看得见**并且**会重试**。
      早先写成 `p.catch(() => {})` —— 静默吞掉，
      结果就是"层可见、视频就绪，但一直是 paused，黑着第一帧"，
      而且控制台一个字都没有（踩过，查了很久）。 */
  function tryPlay(v, tag) {
    if (!v) return;
    const p = v.play();
    if (p && p.catch) {
      p.catch((e) => {
        if (window.console) {
          console.warn('[弦脉] 概念片播放被拒（' + (tag || '') + '）：' + (e && e.name),
            'readyState=' + v.readyState, 'paused=' + v.paused);
        }
        /* 多半是数据还没到（readyState 不够）或手势时机不对。
           等 canplay 再试一次 —— 已经下了一部分的话很快就会到。 */
        if (!v.dataset.retry) {
          v.dataset.retry = '1';
          v.addEventListener('canplay', () => {
            const q = v.play();
            if (q && q.catch) q.catch(() => {});
          }, { once: true });
          // 兜底：600ms 后不管怎样再试一次
          setTimeout(() => { if (v.paused) { const q = v.play(); if (q && q.catch) q.catch(() => {}); } }, 600);
        }
      });
    }
  }

  function showClip(i) {
    if (i === curClip) return;
    curClip = i;
    vids.forEach((v, k) => v.classList.toggle('on', k === i));
    const v = vids[i];
    // 从当前时钟位置接进去，保证画面和时间轴对齐
    const local = (performance.now() - t0) / 1000 - (i === 0 ? 0 : i === 1 ? T2 : T3);
    try { v.currentTime = Math.max(0, local % CLIP); } catch {}
    tryPlay(v, 'showClip' + i);
  }

  function tick() {
    if (!started) return;
    const t = (performance.now() - t0) / 1000;

    /* 看门狗：该播却没播，就再推一把。
       首段要下 9MB，play() 在缓冲到位前必定失败；
       如果只靠 canplay 那一次补播，遇到网络慢、或者用户恰好在这期间
       往下滚了一下，就会停在第一帧不动 —— 看起来就是"闪一下就没了"。
       每 250ms 检查一次，成本可以忽略。 */
    if (visible) {
      const want = vids[curClip < 0 ? 0 : curClip];
      if (want && want.paused && want.readyState >= 2 && !want.dataset.retryBusy) {
        want.dataset.retryBusy = '1';
        tryPlay(want, 'watchdog');
        setTimeout(() => { delete want.dataset.retryBusy; }, 800);
      }
    }

    if (t >= LOOP_LEN) {
      // 回到开头：重启时钟，把第一段重新亮起来
      t0 = performance.now();
      curClip = -1;
      vids.forEach((v) => { v.classList.remove('on'); try { v.pause(); } catch {} });
      showClip(0);
      return;
    }
    if (t >= T3) {
      showClip(2);
      /* 第三段本身只有 5.09 秒，但整圈是 17.6 秒 ——
         后面那几秒留给文字浮现和停留。
         所以第三段播完就**停在最后一帧**，让黑场继续，
         别让视频回到第一帧（那样文字就没画面托着了）。

         判据用 ended，不用 duration —— MediaRecorder 出来的 webm
         **不写时长元数据**，v.duration 是 NaN，用它这条判断永远不成立。
         ended 是浏览器播到头时给的，跟容器有没有元数据无关。 */
      const v = vids[2];
      if (!v.paused && (v.ended || (v.duration && v.currentTime >= v.duration - 0.06))) {
        try { v.pause(); } catch {}
      }
    }
    else if (t >= T2) showClip(1);
    else showClip(0);
  }

  /* 起始：先把第一段亮出来（还没播放，先有一帧画面） */
  mountAll();
  vids[0].classList.add('on');
  curClip = 0;

  /** 用户一有动作就播（浏览器不允许自动播放带声的，静音其实可以，
      但为了不吃掉首帧、也为了省流量，还是等第一次交互）。 */
  const start = () => {
    if (started) return;
    started = true;
    t0 = performance.now();
    mountAll();
    tryPlay(vids[0], 'start');
    /* 用 setInterval 而不是 requestAnimationFrame 链：
       视频时钟不该跟着帧率走（掉帧会走慢），
       而且 rAF 在后台标签页或某些无头环境里会被节流甚至停掉 ——
       那样循环就不转了。250ms 对切镜头足够细。 */
    if (!timer) timer = setInterval(tick, 250);
    /* 兜底：数据到位后如果还没播起来，再补一次。
       移动网络下首段要几秒，这段时间里 play() 会一直失败。 */
    vids[0].addEventListener('canplay', () => {
      if (vids[0].paused && vids[0].classList.contains('on')) tryPlay(vids[0], 'canplay');
    });
  };

  if (opts.reduced) {
    // 减弱动效：只留第一段的静帧，不做循环
    started = false;
  } else {
    ['pointerdown', 'keydown', 'wheel', 'touchstart', 'scroll'].forEach((e) =>
      window.addEventListener(e, start, { passive: true, once: true }));
  }

  /* 页面切后台就停，回来再继续。
     注意：这里**不能**简单地"重启整圈" —— 某些环境（无头浏览器、
     快速切标签）会反复触发 visibilitychange，一重启时钟就永远走不完一圈，
     表现是循环卡在第一段（踩过）。
     正确做法：暂停时记住时钟位置，回来时从那儿接着走。 */
  let pausedAt = 0;
  document.addEventListener('visibilitychange', () => {
    if (!started) return;
    if (document.hidden) {
      pausedAt = performance.now();
      vids.forEach((v) => { try { v.pause(); } catch {} });
    } else if (pausedAt) {
      // 把暂停的这段时间从时钟里扣掉，画面从原处继续
      t0 += performance.now() - pausedAt;
      pausedAt = 0;
      const v = vids[curClip < 0 ? 0 : curClip];
      if (v) tryPlay(v, 'visibility');
    }
  });

  return {
    /** 每帧调一次，传当前滚动进度 0..1 */
    setProgress(p) {
      const a = p <= fadeStart ? 1
        : p >= fadeEnd ? 0
        : 1 - (p - fadeStart) / (fadeEnd - fadeStart);
      host.style.opacity = a.toFixed(3);
      /* 让位之后连可见性一起去掉：只留 opacity:0 的话，
         它仍是一层参与合成的图层，会干扰按像素对账的自检，
         也没必要继续占着合成资源。 */
      host.classList.toggle('gone', a < 0.02);
      // 完全淡出后就不再解码了，省电
      const show = a > 0.02;
      if (show !== visible) {
        visible = show;
        if (!show) vids.forEach((v) => { try { v.pause(); } catch {} });
        else if (started) {
          tryPlay(vids[curClip < 0 ? 0 : curClip], 'setProgress');
        }
      }
      return a;
    },
    start,
    destroy() {
      if (raf) cancelAnimationFrame(raf);
      if (timer) { clearInterval(timer); timer = 0; }
    },
    /* 自检用：时钟状态。没有这个就只能靠猜（踩过）。 */
    state() { return { started, timer: !!timer, visible, curClip,
      t: +((performance.now() - t0) / 1000).toFixed(2),
      mounted: vids.map((v) => !!v.dataset.mounted),
      ready: vids.map((v) => v.readyState),
      on: vids.map((v) => v.classList.contains('on')) }; },
    /* 当前时钟位置（整圈秒数）。
       别的图层（文字、浮尘）**必须**用它来对齐 ——
       各自拿 performance.now() 起算会漂移，
       表现是"文字在该出现的时候已经没了"（踩过，很难查）。 */
    now() { return started ? (performance.now() - t0) / 1000 : 0; },
    /* 自检用：把时钟拨到某一秒。
       为什么不靠真等：无头浏览器会把后台页面的定时器节流到近乎停摆
       （实测 17 秒只走 1 秒），等真实时间等于等不到。
       直接拨时钟，测的是循环逻辑本身。 */
    seek(sec) { t0 = performance.now() - sec * 1000; tick(); return this.state(); },
    get videos() { return vids; },
    get clip() { return curClip; },
  };
}

__ns = __XM[5];
__ns.mount_isDesktop = function () { return isDesktop; };
__ns.mount_shouldSkipVideo = function () { return shouldSkipVideo; };
__ns.mount_buildHeroVideo = function () { return buildHeroVideo; };
}

/* ── js/lib/drum.js ── */
function __M6__() {
/* ==========================================================================
   弦脉 · 手鼓
   --------------------------------------------------------------------------
   序章那三段结构柱原来就是三块硬切的彩色矩形（560×218 / 560×161 / 560×179），
   用户说"三个大格子视觉上很难看，弄个鼓自己在那里敲也行"。
   所以换成一只俯视的手鼓，自己在敲。

   **一只鼓，三种打法** —— 这正是"三段构成"那个意思，
   不用三块色卡去说：
     穹乃额曼  108 bpm  慢而沉，主打低音
     达斯坦    122 bpm  有叙述感，节奏走起来
     麦西热甫  152 bpm  密而快

   敲击速度跟着当前段变，鼓心的颜色也跟着换。

   同步说明：**鼓用的是自己的时钟**，速度取自音序器真实的 BPM。
   没有去挂音序器内部的音节回调 —— 那要动音频代码，风险大。
   速度和节奏型都对得上，相位可能差几十毫秒，作为背景层看不出来。
   ========================================================================== */

const NS = 'http://www.w3.org/2000/svg';

const el = (tag, attrs) => {
  const n = document.createElementNS(NS, tag);
  if (attrs) for (const k in attrs) n.setAttribute(k, attrs[k]);
  return n;
};

/* 三段的打法。bpm / div 取自 sequencer.js 的 PATTERNS —— 不另编。 */
const SECTIONS = [
  { bpm: 108, div: 2, voice: 0.40, tone: '#7d97a6', label: '苍劲' },  // 穹乃额曼
  { bpm: 122, div: 2, voice: 0.30, tone: '#c08a3e', label: '叙事' },  // 达斯坦
  { bpm: 152, div: 2, voice: 0.34, tone: '#4a8071', label: '欢腾' },  // 麦西热甫
];

/**
 * @param {object} opts
 * @param {HTMLElement} opts.host    放鼓的容器
 * @param {number} [opts.size]       直径（px），默认按容器算
 * @param {boolean} [opts.reduced]   减弱动效
 */
function buildDrum(opts = {}) {
  const host = opts.host;
  if (!host) return null;

  const reduced = !!opts.reduced;
  const size = opts.size || 440;
  const C = size / 2;
  const R_RIM = C - 10;          // 鼓沿
  const R_SKIN = R_RIM - 16;     // 鼓面
  const R_C = 56;                // 中心敲击区（太大就吃掉整个鼓面，踩过）

  const svg = el('svg', {
    class: 'drum',
    viewBox: '0 0 ' + size + ' ' + size,
    role: 'img',
    'aria-label': '手鼓：三段各自的节奏',
  });
  svg.style.width = size + 'px';
  svg.style.height = size + 'px';

  /* ---- 鼓面 ----
     三层同心圈 **分别代表三段**，而不是装饰性的同心圆：
       外圈 穹乃额曼 · 中圈 达斯坦 · 内圈 麦西热甫
     当前那一段亮起来，另外两圈按到最暗 —— 一眼看出"现在在打哪一段"。
     这是这只鼓存在的理由：一只鼓，三种打法。 */
  const defs = el('defs');
  const grad = el('radialGradient', { id: 'drumSkin', cx: '50%', cy: '44%', r: '64%' });
  grad.appendChild(el('stop', { offset: '0%', 'stop-color': 'rgba(86,68,46,0.55)' }));
  grad.appendChild(el('stop', { offset: '62%', 'stop-color': 'rgba(38,30,22,0.72)' }));
  grad.appendChild(el('stop', { offset: '100%', 'stop-color': 'rgba(14,12,9,0.92)' }));
  defs.appendChild(grad);
  svg.appendChild(defs);

  // 鼓面（羊皮）
  svg.appendChild(el('circle', {
    cx: C, cy: C, r: R_SKIN, fill: 'url(#drumSkin)',
    stroke: 'rgba(222,214,200,0.12)', 'stroke-width': 1,
  }));

  /* 内阴影：鼓面不是平的，靠中心亮、靠边压暗才有弧度。
     用一圈从透明到黑的径向渐变叠上去。 */
  const inner = el('circle', {
    cx: C, cy: C, r: R_SKIN,
    fill: 'none',
    stroke: 'rgba(0,0,0,0.55)',
    'stroke-width': 34,
    opacity: 0.5,
    filter: 'blur(9px)',
  });
  svg.appendChild(inner);

  /* 鼓绳：一圈斜纹，让它一眼是"鼓"而不是靶子。
     用 dashed stroke 做斜纹，比真画几十条线便宜。 */
  const lash = el('circle', {
    cx: C, cy: C, r: R_RIM - 5, fill: 'none',
    stroke: 'rgba(196,172,132,0.30)', 'stroke-width': 2.4,
    'stroke-dasharray': '3 9', 'stroke-linecap': 'round',
  });
  svg.appendChild(lash);

  // 鼓沿
  svg.appendChild(el('circle', {
    cx: C, cy: C, r: R_RIM, fill: 'none',
    stroke: 'rgba(222,214,200,0.26)', 'stroke-width': 1,
  }));

  /* ---- 三段圈：当前那段亮 ----
     半径要**拉开**（不能只差二十几），否则三圈挤在鼓面中间，
     看着糊成一团、分不出哪圈是哪段。 */
  const RINGS = [R_RIM - 38, R_RIM - 74, R_RIM - 110];
  const rings = RINGS.map((r, i) => {
    const c = el('circle', {
      cx: C, cy: C, r,
      fill: 'none',
      stroke: SECTIONS[i].tone,
      'stroke-width': 1.4,
      opacity: i === 0 ? 0.9 : 0.16,
      /* 加类名：自检要按名字找这三圈。
         只按 stroke-width 找会把涟漪和脉冲圈一起算进来（踩过：
         探针报"三段圈数量 = 5"）。 */
      class: 'drum-ring',
    });
    svg.appendChild(c);
    return c;
  });

  /* ---- 涟漪：敲一下从中心荡一圈，很快散掉 ---- */
  const ripples = [];
  for (let i = 0; i < 2; i++) {
    const c = el('circle', {
      cx: C, cy: C, r: R_C, fill: 'none',
      stroke: SECTIONS[0].tone, 'stroke-width': 1.4, opacity: 0,
    });
    ripples.push({ node: c, t: -1 });
    svg.appendChild(c);
  }

  /* ---- 中心敲击区 ---- */
  const pulseRing = el('circle', {
    cx: C, cy: C, r: R_C + 16, fill: 'none',
    stroke: SECTIONS[0].tone, 'stroke-width': 1.2, opacity: 0.45,
  });
  const core = el('circle', {
    cx: C, cy: C, r: R_C, fill: SECTIONS[0].tone, opacity: 0.9,
  });
  svg.appendChild(pulseRing);
  svg.appendChild(core);

  /* ---- 鼓钉：一圈小点，给"这是一面手鼓"的暗示 ---- */
  for (let i = 0; i < 24; i++) {
    const a = i * 15 * Math.PI / 180;
    const r = R_RIM - 12;
    svg.appendChild(el('circle', {
      cx: C + r * Math.cos(a), cy: C + r * Math.sin(a), r: 1.6,
      fill: 'rgba(222,214,200,0.16)',
    }));
  }

  host.appendChild(svg);

  /* ------------------------------------------------------------ 状态与时钟 */
  let section = 0;
  let nextBeat = 0;          // 下一次敲击的时刻（performance.now() 基准）
  let lastNow = 0;
  let rippleSeed = 0;
  let running = false;
  let raf = 0;

  function setSection(i) {
    const n = Math.max(0, Math.min(2, i | 0));
    if (n === section) return;
    section = n;
    const s = SECTIONS[n];
    core.setAttribute('fill', s.tone);
    pulseRing.setAttribute('stroke', s.tone);
    rings.forEach((r, k) => r.setAttribute('opacity', k === n ? 0.9 : 0.14));
  }
  // 初始就把第 0 段的圈点亮
  rings.forEach((r, k) => r.setAttribute('opacity', k === 0 ? 0.9 : 0.14));

  /** 敲一下：鼓心弹一下 + 荡出一圈涟漪 */
  function strike(now) {
    const s = SECTIONS[section];
    // 中心：缩一下再回去（用 CSS 类触发动画比重画 SVG 便宜）
    core.classList.remove('is-hit');
    void core.getBoundingClientRect();
    core.classList.add('is-hit');

    const r = ripples[rippleSeed % ripples.length];
    rippleSeed++;
    r.t = now;
    r.node.setAttribute('stroke', s.tone);
  }

  function frame(now) {
    raf = requestAnimationFrame(frame);
    const dt = Math.min(0.05, (now - lastNow) / 1000 || 0);
    lastNow = now;

    if (running && now >= nextBeat) {
      strike(now);
      const s = SECTIONS[section];
      nextBeat = now + (60000 / s.bpm / s.div);   // 与音序器同一算法
    }

    // 推涟漪
    /* 寿命要**短于敲击间隔**，否则几条同时挂在屏幕上，
       叠成一圈圈同心圆 —— 看着像靶子，不像在敲（踩过）。
       152 bpm 时间隔约 0.39 秒，所以寿命取 0.85 秒 + 两条轮流，
       最多同时一条多一点，能看清"一圈荡出去、下一圈才开始"。 */
    for (const r of ripples) {
      if (r.t < 0) continue;
      const age = (now - r.t) / 1000;
      const dur = 0.85;
      if (age > dur) { r.node.setAttribute('opacity', 0); r.t = -1; continue; }
      const p = age / dur;
      r.node.setAttribute('r', String(R_C + p * (R_SKIN - R_C - 20)));
      /* 涟漪要**立刻能看见**：正弦曲线起手太慢（p=0.2 时才 0.16），
         看着像"切段了但没在敲"。改成起手就亮，再衰减。 */
      r.node.setAttribute('opacity', String(Math.min(1, p * 6) * (1 - p) * 0.42));
    }
  }

  /* 段号由页面**直接调用** setSection 传进来（见 home.js 的 renderBandState）。
     原来这里自己观察 body[data-stage]：MutationObserver 是微任务，
     比页面状态慢一拍，表现是"文字已经到叙事了、鼓还停在苍劲"（踩过）。
     直接调用没有这个延迟，也少一个监听器要维护。 */

  if (reduced) {
    // 减弱动效：画一个静止的鼓，不敲
    running = false;
  } else {
    running = true;
    lastNow = performance.now();
    nextBeat = lastNow + 300;
    raf = requestAnimationFrame(frame);
  }

  return {
    section: () => section,
    setSection,
    start: () => { running = true; nextBeat = performance.now() + 100; },
    stop: () => { running = false; },
    /* 自检用 */
    state: () => ({ section, running, ripples: ripples.filter((r) => r.t >= 0).length }),
    el: svg,
  };
}

__ns = __XM[6];
__ns.mount_buildDrum = function () { return buildDrum; };
}

/* ── js/pages/network.js ── */
function __M7__() {
/* ==========================================================================
   弦脉 · 师承网络
   --------------------------------------------------------------------------
   口传心授没有总谱，只有交接。这一层把"师承"做成可操作的图：
   点一位木卡姆其 → 展开他的传承支系 → 点第二个点 → 画出一条线。
   线的两端是"谁把哪一段，交给了谁"。

   作为模块导出 initNetwork()，由页面在启动时挂上；
   打开动作走 window 上的 xiangmai:network-open 事件，页面不用知道内部细节。
   ========================================================================== */
  /* ------------------------------------------------------------ 师承数据 */
  /* 示意的师承关系取自公开的非遗代表性传承人资料；
     次级分支为结构示意，用来呈现"口传是一条链，不是一个点"。 */

  const LINEAGE = [
    {
      id: 'ysf-tuhty',
      name: '于苏甫·托合提',
      note: '莎车 · 古典演唱',
      step: 0.85,
      kids: ['阿不都热合曼', '吐尔逊·托合提', '阿依古丽·买买提', '赛买提·艾山', '热依汗古丽'],
    },
    {
      id: 'ame-han',
      name: '阿曼尼莎汗',
      note: '叶尔羌 · 16世纪',
      step: 0.6,
      kids: ['木卡姆文本整理', '宫廷乐师谱系', '喀迪尔汗', '十二套曲目定名'],
    },
    {
      id: 'turdi-ahong',
      name: '吐尔迪阿洪',
      note: '英吉沙 · 1951年录音',
      step: 0.95,
      kids: ['全套十二木卡姆演唱', '口传版本互校', '达斯坦长诗演唱', '麦西热甫套曲'],
    },
    {
      id: 'abdurexit',
      name: '阿不都热西提·托合提',
      note: '伊宁 · 北疆形态',
      step: 0.7,
      kids: ['伊犁木卡姆变体', '萨塔尔演奏法', '青年班社', '双人合乐'],
    },
    {
      id: 'rouzi-aimaiti',
      name: '肉孜·艾买提',
      note: '喀什 · 达斯坦',
      step: 0.8,
      kids: ['达斯坦长诗', '气口与拖腔', '茶馆说唱', '民间赛歌'],
    },
    {
      id: 'tursun-mamat',
      name: '吐尔逊·买买提',
      note: '和田 · 麦西热甫',
      step: 0.75,
      kids: ['鼓点加花', '舞蹈程式', '节庆班社', '少年学徒'],
    },
    {
      id: 'aqam-isa',
      name: '阿卜力克木·阿卜杜拉',
      note: '哈密 · 哈密木卡姆',
      step: 0.65,
      kids: ['哈密套曲', '方言唱腔', '乡村班社', '女性歌者'],
    },
    {
      id: 'dawut-ablet',
      name: '达吾提·阿不都热合曼',
      note: '刀郎 · 刀郎木卡姆',
      step: 0.72,
      kids: ['刀郎套曲', '高亢唱法', '手鼓群奏', '荒漠麦西热甫'],
    },
    {
      id: 'mahmud-satar',
      name: '买买提·托合提',
      note: '莎车 · 萨塔尔',
      step: 0.7,
      kids: ['萨塔尔弓法', '乐器制作', '师徒对弹', '合乐伴奏'],
    },
    {
      id: 'zulpiya',
      name: '祖丽菲亚·艾买提',
      note: '乌鲁木齐 · 学院传授',
      step: 0.55,
      kids: ['课堂记谱', '音像归档', '青年乐团', '跨地交流'],
    },
    {
      id: 'mushrap-team',
      name: '麦西热甫班社',
      note: '民间 · 集体传承',
      step: 0.5,
      kids: ['节庆流程', '围观入圈', '即兴应对', '代际轮换'],
    },
    {
      id: 'archive',
      name: '万桐书 · 记谱档案',
      note: '1951—1956 · 文本化',
      step: 0.4,
      kids: ['钢丝录音', '乐谱转写', '版本比勘', '后世教材'],
    },
  ];

/* ------------------------------------------------------------ 常量 */
const VB = { w: 900, h: 560 };
const SVGNS = 'http://www.w3.org/2000/svg';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const round1 = (v) => Math.round(v * 10) / 10;

/** 挂上师承网络。没有对应 DOM 的页面调用它也不会出事。 */
function initNetwork() {
  const svg = document.getElementById('network-svg');
  const stepEl = document.getElementById('network-step');
  const closeBtn = document.getElementById('network-close');
  const panel = document.getElementById('network');
  if (!svg || !stepEl || !panel) return;

  /* ------------------------------------------------------------ 状态 */
  const nodes = new Map();     // id -> { data, el, cx, cy, kind, parentId }
  let sourceId = null;
  let built = false;
  let busy = false;
  const links = [];            // { a, b, el }

  /* ------------------------------------------------------------ 建图 */
  function el(tag, attrs) {
    const n = document.createElementNS(SVGNS, tag);
    for (const k in attrs) n.setAttribute(k, attrs[k]);
    return n;
  }

  function build() {
    if (built) return;
    built = true;
    svg.textContent = '';

    // 图层顺序：连线在下，节点在上
    const gLinks = el('g', { class: 'links' });
    const gNodes = el('g', { class: 'nodes' });
    svg.appendChild(gLinks);
    svg.appendChild(gNodes);

    // 主干：一条竖向的"传承时间线"，自 16 世纪到今天
    const gSpine = el('g', { class: 'spine' });
    svg.insertBefore(gSpine, gLinks);
    gSpine.appendChild(el('line', {
      x1: 150, y1: 46, x2: 150, y2: VB.h - 40,
      stroke: 'rgba(221,213,199,0.10)', 'stroke-width': 1,
    }));

    const n = LINEAGE.length;
    const pad = 46;
    const span = VB.h - pad * 2;

    LINEAGE.forEach((d, i) => {
      const cx = 150;
      const cy = pad + (span * i) / (n - 1);

      // 时间刻度：每 3 个一记，避免视觉噪音
      if (i % 3 === 0) {
        gSpine.appendChild(el('line', {
          x1: 142, y1: round1(cy), x2: 150, y2: round1(cy),
          stroke: 'rgba(221,213,199,0.22)', 'stroke-width': 1,
        }));
      }

      const root = makeNode(gNodes, {
        id: d.id, label: d.name, sub: d.note, kind: 'root', cx, cy,
      });
      root.data = d;

      // 支系：向右扇形展开
      const kids = d.kids || [];
      const m = kids.length;
      const spread = Math.min(96, 26 + m * 16);
      d._kids = kids.map((label, j) => {
        const t = m === 1 ? 0.5 : j / (m - 1);
        const kx = 470 + Math.sin(t * Math.PI) * 22 + (j % 2) * 14;
        const ky = clamp(cy + (t - 0.5) * spread, 18, VB.h - 18);
        const kid = makeNode(gNodes, {
          id: d.id + '::' + j, label, kind: 'satellite', cx: kx, cy: ky, parentId: d.id,
        });
        kid.data = { id: kid.id, name: label, note: d.name + ' 的支系', step: d.step - 0.08 };
        kid.el.classList.add('is-collapsed');
        return kid;
      });
    });
  }

  function makeNode(parent, o) {
    const r = o.kind === 'root' ? 5.5 : 3.2;
    const g = el('g', {
      class: 'node node--' + o.kind,
      'data-id': o.id,
      tabindex: '0',
      role: 'button',
      'aria-label': (o.kind === 'root' ? o.label + '，' + (o.sub || '') : o.label) + '，点击选择',
    });
    g.style.opacity = o.kind === 'root' ? '' : '0';

    g.appendChild(el('circle', { class: 'node__halo', cx: o.cx, cy: o.cy, r: r + 13 }));
    g.appendChild(el('circle', { class: 'node__ring', cx: o.cx, cy: o.cy, r: r + 7 }));
    g.appendChild(el('circle', { class: 'node__core', cx: o.cx, cy: o.cy, r }));

    const tx = o.cx - (r + 12);
    const t = el('text', {
      class: 'node__label' + (o.kind === 'root' ? ' node__label--root' : ''),
      x: round1(tx), y: round1(o.cy), 'text-anchor': 'end',
    });
    t.textContent = o.label;
    g.appendChild(t);

    if (o.kind === 'root' && o.sub) {
      const s = el('text', {
        class: 'node__sub', x: round1(tx), y: round1(o.cy + 14), 'text-anchor': 'end',
      });
      s.textContent = o.sub;
      g.appendChild(s);
    }

    // 卫星节点：标签放在点的下方，避免与扇形弧线打架
    if (o.kind === 'satellite') {
      const t2 = g.querySelector('text');
      t2.setAttribute('x', round1(o.cx));
      t2.setAttribute('y', round1(o.cy + 14));
      t2.setAttribute('text-anchor', 'middle');
    }

    g.addEventListener('click', (e) => { e.stopPropagation(); activate(o.id); });
    g.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); activate(o.id); }
    });

    parent.appendChild(g);
    const rec = { id: o.id, el: g, cx: o.cx, cy: o.cy, kind: o.kind, parentId: o.parentId, data: null };
    nodes.set(o.id, rec);
    return rec;
  }

  /* ------------------------------------------------------------ 交互 */
  function setStep(text) { stepEl.textContent = text; }

  function activate(id) {
    if (busy) return;
    const rec = nodes.get(id);
    if (!rec) return;

    // 未选源：卫星不可直接点，先选一位木卡姆其
    if (!sourceId) {
      if (rec.kind !== 'root') {
        setStep('先点左边的名字——从一位木卡姆其开始。');
        flash(rec.el);
        return;
      }
      sourceId = id;
      rec.el.classList.add('is-source');
      revealKids(rec);
      setStep('已选「' + (LINEAGE.find((d) => d.id === id) || {}).name + '」。再点他的一个支系，画出这条传承。');
      return;
    }

    // 已选源，点了另一个根：换源
    if (id === sourceId) {
      clearSource();
      setStep('已取消。重新点一位木卡姆其。');
      return;
    }
    if (rec.kind === 'root') {
      clearSource();
      sourceId = id;
      rec.el.classList.add('is-source');
      revealKids(rec);
      setStep('改选「' + (LINEAGE.find((d) => d.id === id) || {}).name + '」。再点他的一个支系。');
      return;
    }

    // 画线：源 → 支系
    drawLink(nodes.get(sourceId), rec);
  }

  function clearSource() {
    if (!sourceId) return;
    const prev = nodes.get(sourceId);
    if (prev) {
      prev.el.classList.remove('is-source');
      const d = LINEAGE.find((x) => x.id === sourceId);
      if (d && d._kids) d._kids.forEach((k) => k.el.classList.add('is-collapsed'));
    }
    sourceId = null;
  }

  async function revealKids(rec) {
    const d = LINEAGE.find((x) => x.id === rec.id);
    if (!d || !d._kids) return;
    busy = true;
    rec.el.classList.add('is-linked');
    for (const k of d._kids) {
      k.el.classList.remove('is-collapsed');
      k.el.style.transition = 'opacity .75s cubic-bezier(.22,.61,.36,1)';
      await sleep(70);
      k.el.style.opacity = '1';
    }
    busy = false;
  }

  function drawLink(a, b) {
    const key = a.id + '>' + b.id;
    if (links.some((l) => l.key === key)) {
      setStep('这条线已经画过了。再点别的支系，或者换一位木卡姆其。');
      return;
    }

    const mx = (a.cx + b.cx) / 2;
    const my = (a.cy + b.cy) / 2;
    const ctrlY = my + (b.cy - a.cy) * 0.06;
    const d = 'M ' + round1(a.cx) + ' ' + round1(a.cy) +
              ' Q ' + round1(mx) + ' ' + round1(ctrlY) +
              ' ' + round1(b.cx) + ' ' + round1(b.cy);
    const len = Math.hypot(b.cx - a.cx, b.cy - a.cy) * 1.08;

    const g = el('g', { class: 'link' });
    g.appendChild(el('path', { class: 'link__sleeve', d }));
    const p = el('path', { class: 'link__draw', d, style: '--len:' + round1(len) });
    g.appendChild(p);
    // 线的中点标注：这不是装饰，是关系说明
    const lbl = el('text', {
      class: 'link__label',
      x: round1(mx * 0.75 + b.cx * 0.25),
      y: round1(my + (b.cy - a.cy) * 0.03 - 7),
    });
    const rootName = (LINEAGE.find((x) => x.id === a.id) || {}).name || '';
    lbl.textContent = '传 · ' + rootName;
    g.appendChild(lbl);

    svg.querySelector('.links').appendChild(g);
    links.push({ key, a: a.id, b: b.id, el: g });

    b.el.classList.add('is-linked');
    a.el.classList.add('is-linked');

    setStep('已连线 ' + links.length + ' 条。换一位木卡姆其，继续接。');
    pulse(b.el);
  }

  function pulse(nodeEl) {
    nodeEl.animate(
      [{ opacity: 1 }, { opacity: 0.45 }, { opacity: 1 }],
      { duration: 620, easing: 'ease-out' }
    );
  }

  function flash(nodeEl) {
    nodeEl.animate(
      [{ transform: 'translateX(0)' }, { transform: 'translateX(3px)' }, { transform: 'translateX(0)' }],
      { duration: 320, easing: 'ease-out' }
    );
  }

  /* ------------------------------------------------------------ 开关 */
  function open() {
    panel.removeAttribute('hidden');
    build();
    panel.classList.add('is-open');
    // 首次打开：主干逐个浮出，像一列名字慢慢显影
    if (svg.dataset.entered !== '1') {
      svg.dataset.entered = '1';
      const roots = Array.from(svg.querySelectorAll('.node--root'));
      roots.forEach((r, i) => {
        r.style.transition = 'opacity 1.1s cubic-bezier(.22,.61,.36,1)';
        r.style.opacity = '0';
        setTimeout(() => { r.style.opacity = ''; }, 180 + i * 95);
      });
    }
    setStep(sourceId ? '接着上一条线，或者换一位木卡姆其。' : '先点一位木卡姆其。');
    closeBtn.focus({ preventScroll: true });
  }

  function close() {
    panel.classList.remove('is-open');
    window.dispatchEvent(new CustomEvent('xiangmai:network-close'));
  }

  closeBtn.addEventListener('click', close);
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && document.body.classList.contains('is-network')) close();
  });
  // 点击空白处 = 取消当前选择
  svg.addEventListener('click', () => {
    if (sourceId) { clearSource(); setStep('已取消。重新点一位木卡姆其。'); }
  });

  window.addEventListener('xiangmai:network-open', open);
}

__ns = __XM[7];
__ns.mount_initNetwork = function () { return initNetwork; };
__ns.mount_LINEAGE = function () { return LINEAGE; };
}

/* ── js/pages/home.js ── */
function __M8__() {
var Renderer = __XM[1]["Renderer"];
var SEG_BOUNDS = __XM[1]["SEG_BOUNDS"];
var BREATH = __XM[1]["BREATH"];
var DapSequencer = __XM[2]["DapSequencer"];
var BandScroller = __XM[3]["BandScroller"];
var mountShell = __XM[4]["mountShell"];
var mountSoundButton = __XM[4]["mountSoundButton"];
var buildHeroVideo = __XM[5]["buildHeroVideo"];
var shouldSkipVideo = __XM[5]["shouldSkipVideo"];
var buildDrum = __XM[6]["buildDrum"];
var initNetwork = __XM[7]["initNetwork"];

/* ==========================================================================
   弦脉 · 序（首屏）
   --------------------------------------------------------------------------
   首屏是入口，不是封面。它按顺序完成三件事：

     1) 建立"有内部结构的复杂系统"的认知 —— 一条竖向结构柱，三段硬切堆叠
     2) 让结构自己呼吸 —— 三段以不同频率明暗交替
     3) 在最底部交出入口 —— 一句话，点它进入师承网络

   几何交给布局引擎，材质交给 GPU，空气交给渲染器。这一层只做编排。
   ========================================================================== */









const REDUCED = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const $ = (s) => document.querySelector(s);
const $$ = (s) => Array.from(document.querySelectorAll(s));

/* 三段时间坐标：随结构推进逐条替换，像档案页码在翻 */
const FIGURES = [
  { num: '16世纪', cap: '叶尔羌宫廷 · 套曲系统整理' },
  { num: '1951—1956', cap: '英吉沙 · 全套十二木卡姆录音与记谱' },
  { num: '2005', cap: '列入联合国教科文组织人类口头和非物质遗产代表作' },
];

/* 三段的材质烘焙尺寸 —— 原来是给 .pillar 的三块矩形用的。
   现在视觉换成了手鼓（js/lib/drum.js），DOM 里没有 .seg 了，
   所以这段烘焙**只在还找得到 .seg 时才跑**（见下面 boot）。
   留着不删是因为 WebGL 房间本身仍然按三段出图，
   哪天想把矩形换回来，这里不用重写。 */
const BAKE_SIZES = [[1024, 428], [1024, 317], [1024, 352]];

const heroEl = $('#hero');
const canvas = $('#gl');
const railMarks = $$('.rail__mark');
const words = $$('.word');
const segs = $$('.seg');          // 换成手鼓之后是空数组
const drumHost = $('#drum-host');
const figureNum = $('#figure-num');
const figureCap = $('#figure-cap');
const networkEl = $('#network');
const stageEl = $('.stage-words');

/* 顶栏改为由 site.js 统一渲染 —— 首页原本是静态写死的，
   结果"附录"那一格的锁定状态不会跟着解锁走。
   交给 mountShell 之后，全站六格的状态由同一份数据决定。 */
mountShell({ base: '', active: 'prologue' });

let renderer = null;
let scroller = null;
let heroVideo = null;
let drum = null;
let audio = null;
let dataIndex = -1;
let cssW = 0, cssH = 0, dpr = 0;
let openStart = 0;
let frame = 0;
let visible = true;
let lastT = performance.now();

/* ------------------------------------------------------------- 尺寸同步 */

function syncSize() {
  const r = canvas.getBoundingClientRect();
  const w = Math.max(1, Math.round(r.width));
  const h = Math.max(1, Math.round(r.height));
  const d = window.devicePixelRatio || 1;
  if (w === cssW && h === cssH && d === dpr) return;
  cssW = w; cssH = h; dpr = d;
  if (renderer) renderer.resize(w, h, d);
}

/* ------------------------------------------------------------- 状态渲染 */

function renderBandState(band) {
  document.body.dataset.stage = String(band);
  const litCount = Math.min(band, 3);

  /* 手鼓**直接跟着段号走**，不用 MutationObserver 观察 data-stage。
     原来靠观察器：它是微任务，时序上比这里慢一拍，
     表现是"文字已经到叙事了，鼓还停在苍劲"（用户报的正是这个）。
     直接调用没有这个延迟。 */
  if (drum) drum.setSection(Math.max(0, litCount - 1));

  segs.forEach((el, i) => {
    el.classList.toggle('is-lit', i < litCount);
    el.classList.toggle('is-active', i < litCount && i === litCount - 1);
  });
  railMarks.forEach((m, i) => {
    m.classList.toggle('is-lit', i < litCount);
    m.classList.toggle('is-active', i === litCount - 1);
  });
  words.forEach((w, i) => {
    const lit = i < litCount;
    w.classList.toggle('is-shown', lit && i === litCount - 1);
    w.classList.toggle('is-past', lit && i !== litCount - 1);
  });

  setFigure(Math.max(0, Math.min(2, band - 1)));
  if (audio) audio.setBand(Math.max(0, Math.min(2, band - 1)));
}

function setFigure(i) {
  if (i === dataIndex || !figureNum) return;
  dataIndex = i;
  const f = FIGURES[i];
  figureNum.textContent = f.num;
  figureCap.textContent = f.cap;
  if (REDUCED) return;
  const box = figureNum.parentElement && figureNum.parentElement.parentElement;
  if (box && box.animate) {
    box.animate([{ opacity: 0.25 }, { opacity: 1 }],
      { duration: 1100, easing: 'cubic-bezier(.22,.61,.36,1)' });
  }
}

/** 乐句切换时让进度轴上的那一段轻轻跳一下 —— 情绪弧线是听得出来的，也要看得见 */
function pulseBand(band) {
  const mark = railMarks[band];
  if (!mark || REDUCED || !mark.animate) return;
  mark.animate(
    [{ transform: 'scaleY(1)' }, { transform: 'scaleY(1.22)' }, { transform: 'scaleY(1)' }],
    { duration: 340, easing: 'cubic-bezier(.22,.61,.36,1)' }
  );
}

/* --------------------------------------------------------------- 主循环 */

function loop(now) {
  requestAnimationFrame(loop);
  frame++;
  const dt = now - lastT;
  lastT = now;
  if (!scroller) return;

  const { band, velocity, progress } = scroller.read();
  const changed = scroller.step(band);
  if (changed) {
    renderBandState(band);
    if (syncActNav) syncActNav(band);
  }

  /* 概念片跟着滚动淡出。这里记一下"视频已经让位"，
     CSS 靠这个类把结构柱、引导语、时间坐标放出来。 */
  if (heroVideo) {
    const a = heroVideo.setProgress(progress);
    document.body.classList.toggle('video-gone', a < 0.5);
  }

  if (!renderer || !visible) return;

  syncSize();
  if (openStart === 0) openStart = now;

  renderer.render({
    time: (now - renderer.started) / 1000,
    velocity,
    frame,
  });
  renderer.sample(dt);
}

/* ----------------------------------------------------------------- 分幕导航
   首屏原本只靠滚动推进，用户看不出"还能往下走"。这里给一条显式路径：
   上一幕 / 四个刻度点 / 下一幕。最后一幕之后接第二章。
   两个页面之间原本只有一个埋在页面底部的链接，现在这里是最好找的入口。 */

const ACT_LABELS = [
  { name: '结构', hint: '三段式结构柱' },
  { name: '苍劲', hint: '穹乃额曼亮起' },
  { name: '叙事', hint: '达斯坦亮起' },
  { name: '欢腾 · 入口', hint: '麦西热甫与入口句' },
];

/** 逐幕走完之后的下一站。章节链条与 js/lib/site.js 的 NAV 保持一致。 */
const NEXT_PAGE = { href: 'qiongnaieman/index.html', label: '第二章 · 穹乃额曼' };

let syncActNav = null;

function bindActNav() {
  const prev = $('#act-prev');
  const next = $('#act-next');
  const prevLabel = $('#act-prev-label');
  const nextLabel = $('#act-next-label');
  const dots = $$('#act-dots button');
  if (!prev || !next) return;

  const sync = (band) => {
    const i = Math.max(0, Math.min(3, band));
    prev.disabled = i === 0;
    prevLabel.textContent = i === 0 ? '已是第一幕' : '上一幕 · ' + ACT_LABELS[i - 1].name;

    const last = i >= 3;
    nextLabel.textContent = last ? NEXT_PAGE.label : '下一幕 · ' + ACT_LABELS[i + 1].name;
    next.setAttribute('aria-label', last ? '进入' + NEXT_PAGE.label : '进入下一幕：' + ACT_LABELS[i + 1].hint);
    next.classList.toggle('is-final', last);

    dots.forEach((d, k) => d.setAttribute('aria-current', String(k === i)));
  };

  prev.addEventListener('click', () => jumpTo(Math.max(0, scroller.band - 1)));
  next.addEventListener('click', () => {
    if (scroller.band >= 3) { location.href = NEXT_PAGE.href; return; }
    jumpTo(scroller.band + 1);
  });
  dots.forEach((d) => {
    d.addEventListener('click', () => scroller.jumpTo(Number(d.dataset.actJump)));
  });

  sync(Math.max(0, scroller.band));
  return sync;
}

function jumpTo(stage) {
  scroller.jumpTo(Math.max(0, Math.min(3, stage)));
}

/* ----------------------------------------------------------------- 交互 */

function bindInteractions() {
  railMarks.forEach((m, i) => {
    m.addEventListener('click', () => scroller.jumpTo(i + 1));
  });

  /* 三个情绪词：**点哪一幕就滚到哪一幕**，能来回点。
     原来它们是 <span>，而且是"滚动到哪就显示哪个"，点不了（用户要求改）。
     点一下 = 跳到那一幕；再点别的就切回去。
     滚过去之后 renderBandState 会把样式和鼓一起更新，所以这里只管跳转。 */
  words.forEach((w) => {
    w.addEventListener('click', () => {
      const i = Number(w.dataset.word);              // 0 / 1 / 2
      if (isNaN(i)) return;
      scroller.jumpTo(i + 1);                        // 幕号 = 词的序号 + 1
    });
  });

  document.addEventListener('keydown', (e) => {
    if (document.body.classList.contains('is-network')) return;
    const k = e.key;
    if (k !== 'ArrowDown' && k !== 'ArrowUp' && k !== 'j' && k !== 'k') return;
    const dir = (k === 'ArrowDown' || k === 'j') ? 1 : -1;
    scroller.jumpTo(scroller.band + dir);
    e.preventDefault();
  });

  /* 声音开关默认开：按钮一开始显示"开"，第一次交互自动起鼓。
     只把标签写成"开"而不放声音是骗人 —— 浏览器不允许没手势就出声，
     所以"默认开"必须配一次自动开。 */
  mountSoundButton({
    on: () => {
      if (!audio.enable()) return false;
      audio.setBand(Math.max(0, Math.min(2, scroller.band - 1)));
      return true;
    },
    off: () => audio.disable(),
    onFirstGesture: () => {
      if (!audio.enable()) return;
      audio.setBand(Math.max(0, Math.min(2, scroller.band - 1)));
    },
  });

  $('#entry-btn').addEventListener('click', () => {
    document.body.classList.add('is-network');
    networkEl.setAttribute('aria-hidden', 'false');
    window.dispatchEvent(new CustomEvent('xiangmai:network-open'));
    if (audio.enabled) audio.setBand(2);
  });

  window.addEventListener('xiangmai:network-close', () => {
    document.body.classList.remove('is-network');
    networkEl.setAttribute('aria-hidden', 'true');
  });

  window.addEventListener('resize', () => { cssW = 0; syncSize(); }, { passive: true });

  document.addEventListener('visibilitychange', () => {
    scroller.resetVelocity();
    lastT = performance.now();
  });

  if ('IntersectionObserver' in window) {
    new IntersectionObserver((es) => {
      es.forEach((en) => { visible = en.isIntersecting; });
    }, { threshold: 0 }).observe(heroEl);
  }
}

/* ----------------------------------------------------------------- 启动 */

async function boot() {
  scroller = new BandScroller(heroEl, {
    thresholds: [0.10, 0.40, 0.86],
    anchors: [0.02, 0.16, 0.52, 0.97],
    count: 3,
  });

  audio = new DapSequencer({
    volume: 0.34,
    // 乐句换句时给进度轴一个小脉冲：听觉的呼吸，视觉上也能看到
    onPhrase: ({ band }) => { if (band === scroller.band - 1) pulseBand(band); },
  });

  // 给自检用：tools/audio-test.mjs 需要摸到音序器实例才能量电平
  window.__XM_SEQ__ = audio;

  let baked = 0;
  try {
    renderer = new Renderer(canvas, {
      // 房间的两层"厚度"：壁面质感 1.0，壁画残迹 1.25（残片要看得出来才不白做）
      wallGain: 1,
      muralGain: 1.25,
    });

    /* 每段烘两张：暗版作底、亮版作高光层。滚动点亮时只改高光层透明度，
       明暗过渡交给 CSS —— 这样既省算力，画质也不受过渡影响。

       **只在 .seg 还在时才跑**：视觉换成手鼓之后 DOM 里没有 .seg 了，
       这段循环会空转（segs 是空数组），baked 永远是 0 ——
       原来靠 baked === 3 判断渲染后端，那样会误判成 webgl。 */
    segs.forEach((el, i) => {
      try {
        const dimUrl = renderer.bake(i, BAKE_SIZES[i][0], BAKE_SIZES[i][1], 0.46);
        const litUrl = renderer.bake(i, BAKE_SIZES[i][0], BAKE_SIZES[i][1], 1.0);
        if (!dimUrl || dimUrl.length < 500 || !litUrl || litUrl.length < 500) return;

        el.style.setProperty('--tex-dim', 'url("' + dimUrl + '")');
        el.style.setProperty('--tex-lit', 'url("' + litUrl + '")');
        const hi = document.createElement('span');
        hi.className = 'seg__lit';
        hi.setAttribute('aria-hidden', 'true');
        el.appendChild(hi);
        el.classList.add('has-tex');
        baked++;
      } catch (e) { /* 单段失败就退回 assets/filters.svg 的滤镜纹理 */ }
    });

    syncSize();
    document.body.dataset.render =
      (segs.length === 0 || baked === 3) ? 'textured' : 'webgl';
    window.__XM_RENDERER__ = renderer;   // 自检用：查 uniform 位置、量画布
  } catch (err) {
    // 没有 WebGL：退回 DOM + SVG 滤镜，视觉语法保持一致
    document.body.dataset.render = 'basic';
    if (window.console) console.warn('[弦脉] 退回基础渲染：', err && err.message);
  }

  bindInteractions();
  initNetwork();   // 挂上师承网络：入口句点击时由 CustomEvent 唤起

  /* ---- 手鼓 ----
     替掉原来的三块矩形。段号它自己从 body[data-stage] 读，
     所以这里不用管同步 —— home.js 推进 stage，鼓跟着变。
     尺寸按容器算：小了不像鼓，大了顶到字。 */
  if (drumHost) {
    drum = buildDrum({
      host: drumHost,
      size: Math.round(Math.min(window.innerWidth, window.innerHeight) * 0.46),
      reduced: REDUCED,
    });
    window.__XM_DRUM__ = drum;   // 自检用
    /* 建好之后立刻按当前幕对齐一次 ——
       不然第一次滚动前鼓停在第一段，而页面可能已经停在第 2 幕了
       （刷新后浏览器会恢复滚动位置）。 */
    drum.setSection(Math.max(0, Math.min(2, scroller.band - 1)));
  }

  /* ---- 首屏概念片 ----
     只在桌面端开：三段全屏视频 + WebGL 会拖垮手机。
     "视频阶段 → 结构柱阶段" 靠卷动进度切换，不用额外做一套时序。 */
  const hvHost = $('#hero-video');
  /* 现在手机也放（素材压到 640×360、三段共 1.2MB），
     只有低端设备或省流模式才跳过。 */
  if (hvHost && !shouldSkipVideo() && !REDUCED) {
    heroVideo = buildHeroVideo({
      host: hvHost,
      /* 视频霸屏：前面 4~5 屏全是它，结构柱很晚才出现。
         整段 hero 3780px、视口 900px，可滚距离 2880px，
         所以 0.625 / 1.11 换算成滚动距离就是：
           让位起点 1800px（约 4 屏），完全消失 2880px（滚到底）。
         早先设 0.06 / 0.42 只有 226 / 1587px ——
         鼠标滚六七下视频就没了，和"第一眼就是一整屏画面"的意图不符。 */
      fadeStart: 0.625,   // ≈1800px
      fadeEnd: 1.0,       // ≈2880px（滚到底）
      reduced: REDUCED,
    });
    document.body.classList.add('has-hero-video');
    window.__XM_HERO__ = heroVideo;   // 自检用
  } else if (hvHost) {
    hvHost.remove();          // 手机端整个拿掉，连文件都不下
  }

  // 首帧先把初始状态落下去，再触发入场动画
  const { band } = scroller.read();
  scroller.step(band);
  renderBandState(band);
  syncActNav = bindActNav();

  requestAnimationFrame(loop);
  requestAnimationFrame(() => {
    document.body.classList.add('is-ready');
    openStart = performance.now();
  });

  if (stageEl) stageEl.setAttribute('data-band', String(band));
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
else boot();
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

/* js/lib/sequencer.js */
try {
  __ns = __XM[2];
  __M2__();
  for (var k in __XM[2]) { if (k.indexOf("mount_") === 0) __XM[2][k.slice(6)] = __XM[2][k](); }
} catch (e) {
  (window.__XM_BOOT_ERR__ = window.__XM_BOOT_ERR__ || []).push("js/lib/sequencer.js" + " :: " + (e && e.stack || e));
}

/* js/lib/scroll.js */
try {
  __ns = __XM[3];
  __M3__();
  for (var k in __XM[3]) { if (k.indexOf("mount_") === 0) __XM[3][k.slice(6)] = __XM[3][k](); }
} catch (e) {
  (window.__XM_BOOT_ERR__ = window.__XM_BOOT_ERR__ || []).push("js/lib/scroll.js" + " :: " + (e && e.stack || e));
}

/* js/lib/site.js */
try {
  __ns = __XM[4];
  __M4__();
  for (var k in __XM[4]) { if (k.indexOf("mount_") === 0) __XM[4][k.slice(6)] = __XM[4][k](); }
} catch (e) {
  (window.__XM_BOOT_ERR__ = window.__XM_BOOT_ERR__ || []).push("js/lib/site.js" + " :: " + (e && e.stack || e));
}

/* js/lib/hero-video.js */
try {
  __ns = __XM[5];
  __M5__();
  for (var k in __XM[5]) { if (k.indexOf("mount_") === 0) __XM[5][k.slice(6)] = __XM[5][k](); }
} catch (e) {
  (window.__XM_BOOT_ERR__ = window.__XM_BOOT_ERR__ || []).push("js/lib/hero-video.js" + " :: " + (e && e.stack || e));
}

/* js/lib/drum.js */
try {
  __ns = __XM[6];
  __M6__();
  for (var k in __XM[6]) { if (k.indexOf("mount_") === 0) __XM[6][k.slice(6)] = __XM[6][k](); }
} catch (e) {
  (window.__XM_BOOT_ERR__ = window.__XM_BOOT_ERR__ || []).push("js/lib/drum.js" + " :: " + (e && e.stack || e));
}

/* js/pages/network.js */
try {
  __ns = __XM[7];
  __M7__();
  for (var k in __XM[7]) { if (k.indexOf("mount_") === 0) __XM[7][k.slice(6)] = __XM[7][k](); }
} catch (e) {
  (window.__XM_BOOT_ERR__ = window.__XM_BOOT_ERR__ || []).push("js/pages/network.js" + " :: " + (e && e.stack || e));
}

/* js/pages/home.js */
try {
  __ns = __XM[8];
  __M8__();
  for (var k in __XM[8]) { if (k.indexOf("mount_") === 0) __XM[8][k.slice(6)] = __XM[8][k](); }
} catch (e) {
  (window.__XM_BOOT_ERR__ = window.__XM_BOOT_ERR__ || []).push("js/pages/home.js" + " :: " + (e && e.stack || e));
}
})();
