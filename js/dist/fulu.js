/* 由 tools/build.mjs 生成，请勿直接编辑。改源码后运行 node tools/build.mjs
   本页模块（依依赖序）：
     js/lib/materials.js  → VERT_SRC, NOISE_GLSL, MATERIAL_GLSL, SCENE_FRAG, DUST_FRAG, EMBER_FRAG, CHAPTER_AIR_FRAG, MASHRAQ_FRAG, WALL_FRAG
     js/lib/renderer.js  → COLORS, SEG_H, SEG_BOUNDS, BREATH, Renderer
     js/lib/sequencer.js  → DapSequencer, PATTERNS
     js/lib/site.js  → NAV, mountShell, mountSoundButton, mountChapterNav, revealOnScroll, mountSlots
     js/lib/chapter.js  → bootChapter, REDUCED
     js/lib/muqam-data.js  → MUQAM, ringPos, ORIGIN, AMANNISA, STRUCTURE, NUMBERS, RESCUE, TODAY, PRACTICE, HEADLINE_STATS
     js/lib/wheel.js  → buildWheel, bindWheelScroll
     js/lib/heritage-data.js  → HERITAGE, heritageHref
     js/lib/melody.js  → buildMelody, bindMelodyScroll
     js/lib/theme.js  → createTheme, autoPlayOnGesture, unlock
     js/lib/inherit-game.js  → buildInheritGame
     js/pages/fulu.js
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
__XM[11] = {};

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

/* ── js/lib/site.js ── */
function __M3__() {
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

__ns = __XM[3];
__ns.mount_NAV = function () { return NAV; };
__ns.mount_mountShell = function () { return mountShell; };
__ns.mount_mountSoundButton = function () { return mountSoundButton; };
__ns.mount_mountChapterNav = function () { return mountChapterNav; };
__ns.mount_revealOnScroll = function () { return revealOnScroll; };
__ns.mount_mountSlots = function () { return mountSlots; };
}

/* ── js/lib/chapter.js ── */
function __M4__() {
var Renderer = __XM[1]["Renderer"];
var DapSequencer = __XM[2]["DapSequencer"];
var mountShell = __XM[3]["mountShell"];
var mountChapterNav = __XM[3]["mountChapterNav"];
var revealOnScroll = __XM[3]["revealOnScroll"];
var mountSlots = __XM[3]["mountSlots"];
var mountSoundButton = __XM[3]["mountSoundButton"];

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

  return { renderer, seq, REDUCED, syncSize };
}

__ns = __XM[4];
__ns.mount_bootChapter = function () { return bootChapter; };
__ns.mount_REDUCED = function () { return REDUCED; };
}

/* ── js/lib/muqam-data.js ── */
function __M5__() {
/* ==========================================================================
   弦脉 · 十二木卡姆
   --------------------------------------------------------------------------
   十二套木卡姆，每套都是一个完整的套曲循环。这里的字段按"能不能被验证"
   分层：

     name / ug   名称与维吾尔语拉丁转写 —— 公开资料
     region      流传地域 —— 公开资料
     char        音乐性格，用于视觉与交互上区分彼此
     note        一句话说明，保守叙述，不编造具体史实

   需要补充更详细内容（曲目、传承人、音频）时，往对应条目里加字段即可，
   页面会自动带上。**不确定的内容不要写进来** —— 这个项目里宁缺勿造。
   ========================================================================== */

const MUQAM = [
  { id: 'rak',     name: '拉克',     ug: 'Rak',        region: '喀什 · 莎车',   char: '庄重', hue: 12,  note: '十二套之首，气质最庄重，常被视作整套木卡姆的门面。' },
  { id: 'chebiyat', name: '且比亚特', ug: 'Chebiyat',  region: '喀什 · 莎车',   char: '明朗', hue: 28,  note: '情绪明朗开阔，穹乃额曼部分旋律线条舒展。' },
  { id: 'muxawrak', name: '木夏吾莱克', ug: 'Muxawrak', region: '喀什 · 和田',  char: '热烈', hue: 42,  note: '节奏推进感强，达斯坦段落叙事性突出。' },
  { id: 'chahargah', name: '恰尔尕',   ug: 'Chahargah', region: '喀什 · 莎车',  char: '苍劲', hue: 8,   note: '音域跨度大，散板序唱部分尤为苍劲。' },
  { id: 'panjigah', name: '潘吉尕',    ug: 'Panjigah',  region: '喀什 · 莎车',  char: '深邃', hue: 200, note: '调式色彩偏暗，听感深邃，考验演唱者的气息控制。' },
  { id: 'uzhal',   name: '乌孜哈勒',   ug: 'Uzhal',     region: '喀什 · 莎车',  char: '婉转', hue: 168, note: '旋律婉转，腔弯细腻，是口传细节最吃功夫的一套。' },
  { id: 'aqam',    name: '艾介姆',     ug: 'Ajam',      region: '喀什 · 莎车',  char: '舒展', hue: 36,  note: '气息舒展，麦西热甫段落歌舞性强烈。' },
  { id: 'osechak', name: '乌夏克',     ug: 'Oshaq',     region: '喀什 · 莎车',  char: '明亮', hue: 48,  note: '明亮上扬，常被选作舞台演出的段落。' },
  { id: 'bayat',   name: '巴雅特',     ug: 'Bayat',     region: '喀什 · 莎车',  char: '沉郁', hue: 218, note: '沉郁内敛，古典诗歌唱词占比高。' },
  { id: 'nawa',    name: '纳瓦',       ug: 'Nawa',      region: '喀什 · 莎车',  char: '柔美', hue: 152, note: '柔美流畅，器乐间奏部分常被单独演奏。' },
  { id: 'sigar',   name: '斯尕',       ug: 'Sigar',     region: '喀什 · 莎车',  char: '紧凑', hue: 20,  note: '结构紧凑，节拍转换频繁。' },
  { id: 'iraq',    name: '伊拉克',     ug: 'Iraq',      region: '喀什 · 莎车',  char: '高亢', hue: 320, note: '高亢激越，常作为整套木卡姆的收束。' },
];

/** 环上第 i 个节点的位置（从正上方起顺时针） */
function ringPos(i, cx, cy, r) {
  const a = (i / MUQAM.length) * Math.PI * 2 - Math.PI / 2;
  return { x: cx + Math.cos(a) * r, y: cy + Math.sin(a) * r, a };
}

/* ==========================================================================
   第二章「穹乃额曼」的内容
   --------------------------------------------------------------------------
   全部来自项目方提供的历史与当代资料。呈现在页面上时保持原意，
   只做断句与排版上的压缩。
   ========================================================================== */

const ORIGIN = [
  {
    era: '汉唐',
    title: '西域大曲',
    lines: [
      '源头可追溯至汉唐时期流传于西域的《龟兹乐》《疏勒乐》《高昌乐》。',
      '有观点认为，张骞通西域时带回中原的「摩诃兜勒」是木卡姆的原始形态——其曲式已包含歌曲、解曲、舞曲，与木卡姆的套曲结构一脉相承。',
    ],
    tag: '龟兹乐被视为木卡姆形成发展的第一个中心地',
  },
  {
    era: '10世纪',
    title: '博亚万',
    lines: [
      '木卡姆的雏形萌发于维吾尔族先民的「博亚万」——旷野之歌。',
      '此后经过几个世纪的演变，逐渐从民间散曲走向成套。',
    ],
    tag: '旷野之歌',
  },
  {
    era: '16世纪',
    title: '叶尔羌汗国',
    lines: [
      '木卡姆迎来决定性转折。宫廷乐师将散落民间的木卡姆收集整理，剔除陈旧晦涩的内容，首次形成规范化的古典套曲体系。',
      '最初整理为 16 部，后精简为 12 套——「十二木卡姆」由此得名。',
    ],
    tag: '从 16 部到 12 套',
    emphasis: true,
  },
];

const AMANNISA = {
  name: '阿曼尼莎汗',
  role: '叶尔羌河畔樵夫的女儿',
  lines: [
    '她本是叶尔羌河畔樵夫的女儿，因超凡的音乐与诗歌才华被国王拉失德娶入宫廷。',
    '在她的倡导下，宫廷乐师喀迪尔汗（柯迪尔）将散落民间的木卡姆收集整理，剔除陈旧晦涩的内容，首次形成了规范化的古典套曲体系。',
    '最初整理为 16 部，后精简为 12 套。',
  ],
  kicker: '这次转折与一位传奇女性密不可分',
};

const STRUCTURE = [
  {
    idx: '一',
    name: '穹乃额曼',
    sub: '大曲',
    body: '是开篇，由散板序唱进入节拍性段落，情绪由舒缓深沉逐渐趋向明朗热烈。唱词多采用古典诗歌，是整套木卡姆中最具古典气质的部分。',
    role: '开篇',
    mood: '舒缓 → 明朗',
  },
  {
    idx: '二',
    name: '达斯坦',
    sub: '叙事诗',
    body: '承接大曲，带有鲜明的叙事特征。歌词与民间故事、爱情传说、人生感怀相联系，演唱段落之间穿插器乐曲。',
    role: '承接',
    mood: '叙事 · 铺陈',
  },
  {
    idx: '三',
    name: '麦西热甫',
    sub: '歌舞曲',
    body: '是终章，节奏鲜明，气氛逐步高涨，展现群体欢聚时的生命活力。',
    role: '终章',
    mood: '高涨 · 欢腾',
  },
];

const NUMBERS = [
  { v: '170', unit: '多首', label: '歌曲' },
  { v: '70',  unit: '多首', label: '器乐曲' },
  { v: '20',  unit: '多小时', label: '完整演唱一遍' },
];

const RESCUE = {
  kicker: '从濒危到重生',
  intro: '到 20 世纪 40 年代，能完整演唱十二木卡姆的艺人已屈指可数。当时全新疆只有老艺人吐尔迪·阿洪一人能凭记忆完整演唱全套，且年事已高。他不识字，所有曲目全靠口传心授。',
  /** 两个人的对照：语言不通、背景迥异，合作充满波折 */
  friction: [
    {
      a: '万桐书记谱需要「听一句记一句」',
      b: '吐尔迪·阿洪唱歌习惯一气呵成',
    },
    {
      a: '万桐书用钢丝录音机录音',
      b: '吐尔迪·阿洪不相信「铁疙瘩能把歌声装进去」',
    },
    {
      a: '万桐书追求记谱的准确性',
      b: '吐尔迪·阿洪每次都即兴发挥，唱得不完全一样',
    },
  ],
  outcome: '经过近六年的艰辛工作，1960 年，记录了 340 余首古典叙诵歌曲、民间叙事组歌、舞曲、即兴乐曲的《十二木卡姆》正式出版。',
  verdict: '这次抢救，让十二木卡姆从消亡边缘被拉了回来。',
  years: '近六年 · 1950—1960',
};

const TODAY = {
  kicker: '当代传承形态',
  lead: '今天的十二木卡姆传承呈现出清晰的「双轨」特征。',
  tracks: [
    {
      tag: '轨道一',
      name: '扎根乡土的活态传承',
      lines: [
        '在莎车县木卡姆文化传承中心，像玉苏普·托合提这样的非遗代表性传承人有近 50 人，年龄最大的 70 多岁，最小的仅 20 岁。',
        '当地通过每月发放生活补贴、每日举办文艺演出等举措，让传承人能够以此为业。',
      ],
      stats: [
        { v: '近50', label: '代表性传承人' },
        { v: '70→20', label: '年龄跨度（岁）' },
      ],
    },
    {
      tag: '轨道二',
      name: '进入教育体系的专业化培养',
      lines: [
        '新疆艺术学院自 1996 年起设立木卡姆专业学历教育，已培养出 250 余名专业人才分赴各院团工作，部分已成为一级演员。',
        '各地每年举办传承人培训班，二十年来累计培训超过 2000 人次。',
      ],
      stats: [
        { v: '1996', label: '设立专业学历教育' },
        { v: '250+', label: '专业人才' },
        { v: '2000+', label: '累计培训人次' },
      ],
    },
  ],
};

const PRACTICE = {
  kicker: '当代运用实例',
  lead: '十二木卡姆不再仅仅是被「保护」的对象，它正在被主动地「使用」——作为舞台艺术的核心内容、作为流行音乐的创作素材、作为连接不同代际观众的情感媒介。',
  cases: [
    {
      org: '艾热',
      title: '把木卡姆「说」进说唱',
      body: '新疆喀什说唱歌手艾热在创作中持续融入木卡姆元素。他选用维吾尔族代表性弦乐器艾捷克作为说唱编曲底色，用较为激昂高亢的演唱方式诠释十二木卡姆艺术，与说唱音乐无缝嫁接。《千里万里》被网友评价为「可以上春晚的水准」，并被世界杯官方账号选用作为推广视频 BGM。',
      tags: ['说唱', '艾捷克', '跨语种传播'],
    },
    {
      org: '刀郎',
      title: '用流行乐「翻译」木卡姆的结构',
      body: '刀郎为电影《万桐书》创作的主题曲《命运的赛勒克》提供了反向思路：以木卡姆音乐特征为基础，在流行律动中加入复合节拍，融合热瓦普、弹布尔等传统乐器，通过实录民族乐器保留木卡姆的「四分中立音」律制听感，并运用木卡姆式吟唱与 rap 呼应。这首歌的创作目的是向万桐书等抢救木卡姆的学者致敬。',
      tags: ['电影主题曲', '复合节拍', '四分中立音'],
    },
    {
      org: '2024 央视春晚',
      title: '大型舞台呈现',
      body: '喀什分会场的歌舞乐综合表演《我的爱献给祖国母亲》，选用十二木卡姆中《且比亚特木卡姆》乐曲重新填词编曲，动用 500 多人团队（300 多位舞蹈演员、90 多位乐手、80 多位演唱者）在喀什古城完成户外大型实景表演。乐手中既有白发苍苍的民间传承人，也有稚气纯真的小学生。',
      tags: ['实景演出', '500+ 人', '代际同台'],
      stats: [
        { v: '300+', label: '舞蹈演员' },
        { v: '90+', label: '乐手' },
        { v: '80+', label: '演唱者' },
      ],
    },
    {
      org: '创新剧目',
      title: '持续涌现',
      body: '原创芭蕾舞剧《寻找木卡姆》以芭蕾语汇重新诠释木卡姆；融合 AI 数字人等技术的歌剧《木卡姆恋歌——万桐书》以现代审美演绎传承故事。木卡姆传统乐器还与古琴、箜篌进行跨界合奏，碰撞出跨越民族的艺术火花。',
      tags: ['芭蕾', 'AI 数字人', '跨界合奏'],
    },
  ],
  closing: '从「抢救」到「活用」的转变，是它传承至今最具生命力的形态。',
};

/** 页面顶部的关键数字，用于开场 */
const HEADLINE_STATS = [
  { v: '16', unit: '世纪', label: '叶尔羌汗国完成经典化' },
  { v: '12', unit: '套', label: '每套三大部分' },
  { v: '20', unit: '小时', label: '完整演唱一遍' },
];

__ns = __XM[5];
__ns.mount_MUQAM = function () { return MUQAM; };
__ns.mount_ringPos = function () { return ringPos; };
__ns.mount_ORIGIN = function () { return ORIGIN; };
__ns.mount_AMANNISA = function () { return AMANNISA; };
__ns.mount_STRUCTURE = function () { return STRUCTURE; };
__ns.mount_NUMBERS = function () { return NUMBERS; };
__ns.mount_RESCUE = function () { return RESCUE; };
__ns.mount_TODAY = function () { return TODAY; };
__ns.mount_PRACTICE = function () { return PRACTICE; };
__ns.mount_HEADLINE_STATS = function () { return HEADLINE_STATS; };
}

/* ── js/lib/wheel.js ── */
function __M6__() {
var MUQAM = __XM[5]["MUQAM"];
var ringPos = __XM[5]["ringPos"];

/* ==========================================================================
   弦脉 · 十二木卡姆轮盘
   --------------------------------------------------------------------------
   用十二点几何表示十二套木卡姆，而不是一个音符符号。

   理由不是审美偏好：十二木卡姆本身就是"十二个套曲循环"这件事，
   用十二等分的环形结构表示，是准确；而音符是外来记谱体系的符号，
   放在一个口传心授的传统上是文化逻辑错位。

   几何取自维吾尔木雕与花窗里常见的十二角星。十二个节点就是十二个入口。

   可访问性：每个节点是真正的 <a>，能 Tab、能回车、有 aria-label。
   ========================================================================== */



const SVGNS = 'http://www.w3.org/2000/svg';
const VB = 720;            // viewBox 边长
const CX = 360, CY = 360;
const R_NODE = 232;        // 节点半径
const R_RING = 196;        // 装饰环

const el = (tag, attrs) => {
  const n = document.createElementNS(SVGNS, tag);
  for (const k in attrs) n.setAttribute(k, attrs[k]);
  return n;
};

/**
 * 在容器里生成十二木卡姆轮盘。
 * @param {HTMLElement} host
 * @param {object} [opts]
 * @param {string} [opts.hrefBase='../muqam/'] 各分页面的路径前缀
 * @param {(id:string)=>void} [opts.onPick]    点击回调（不传则直接跳转）
 */
function buildWheel(host, opts = {}) {
  if (!host) return null;
  const hrefBase = opts.hrefBase || '../muqam/';

  const svg = el('svg', {
    class: 'wheel',
    viewBox: `0 0 ${VB} ${VB}`,
    preserveAspectRatio: 'xMidYMid meet',
    role: 'list',
    'aria-label': '十二木卡姆，每一点对应一套，可进入对应页面',
  });

  /* ---- 底纹：三层同心环 + 十二角星 ---- */
  const deco = el('g', { class: 'wheel__deco', 'aria-hidden': 'true' });

  deco.appendChild(el('circle', { cx: CX, cy: CY, r: R_RING, class: 'wheel__ring' }));
  deco.appendChild(el('circle', { cx: CX, cy: CY, r: R_RING - 13, class: 'wheel__ring wheel__ring--thin' }));
  deco.appendChild(el('circle', { cx: CX, cy: CY, r: 58, class: 'wheel__ring wheel__ring--thin' }));

  // 十二角星：两组六角，交错叠成
  for (const rot of [0, 30]) {
    const pts = [];
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2 - Math.PI / 2 + (rot * Math.PI) / 180;
      pts.push((CX + Math.cos(a) * R_RING).toFixed(1) + ',' + (CY + Math.sin(a) * R_RING).toFixed(1));
    }
    deco.appendChild(el('polygon', { points: pts.join(' '), class: 'wheel__star' }));
  }

  // 十二根辐条
  for (let i = 0; i < MUQAM.length; i++) {
    const p1 = ringPos(i, CX, CY, 58);
    const p2 = ringPos(i, CX, CY, R_RING - 13);
    deco.appendChild(el('line', {
      x1: p1.x.toFixed(1), y1: p1.y.toFixed(1),
      x2: p2.x.toFixed(1), y2: p2.y.toFixed(1),
      class: 'wheel__spoke',
    }));
  }

  const rotating = el('g', { class: 'wheel__rotor' });
  rotating.appendChild(deco);
  svg.appendChild(rotating);

  /* ---- 中心：标题 ---- */
  const core = el('g', { class: 'wheel__core' });
  const t1 = el('text', { x: CX, y: CY - 6, class: 'wheel__core-num' });
  t1.textContent = '12';
  const t2 = el('text', { x: CX, y: CY + 24, class: 'wheel__core-label' });
  t2.textContent = '套木卡姆';
  core.appendChild(t1);
  core.appendChild(t2);
  svg.appendChild(core);

  /* ---- 十二个节点 ---- */
  const nodes = el('g', { class: 'wheel__nodes' });
  const items = [];

  MUQAM.forEach((m, i) => {
    const p = ringPos(i, CX, CY, R_NODE);
    const g = el('a', {
      class: 'wnode',
      href: hrefBase + m.id + '/index.html',
      role: 'listitem',
      'data-id': m.id,
      'aria-label': '第' + (i + 1) + '套 · ' + m.name + '（' + m.ug + '）· ' + m.region + ' · ' + m.char,
    });

    // 每个节点用自己的色相，来自它所属的那一段性格
    g.style.setProperty('--h', String(m.hue));

    g.appendChild(el('circle', { cx: p.x.toFixed(1), cy: p.y.toFixed(1), r: 22, class: 'wnode__halo' }));
    g.appendChild(el('circle', { cx: p.x.toFixed(1), cy: p.y.toFixed(1), r: 6, class: 'wnode__dot' }));

    // 编号：贴在圆心一侧
    const numA = ringPos(i, CX, CY, R_NODE - 34);
    const tnum = el('text', {
      x: numA.x.toFixed(1), y: numA.y.toFixed(1), class: 'wnode__num',
    });
    tnum.textContent = String(i + 1).padStart(2, '0');
    g.appendChild(tnum);

    // 名称：贴在圆外一侧，沿半径向外排
    const outA = ringPos(i, CX, CY, R_NODE + 34);
    const tname = el('text', {
      x: outA.x.toFixed(1), y: outA.y.toFixed(1), class: 'wnode__name',
      'text-anchor': Math.abs(outA.x - CX) < 30 ? 'middle' : (outA.x > CX ? 'start' : 'end'),
    });
    tname.textContent = m.name;
    g.appendChild(tname);

    const tug = el('text', {
      x: outA.x.toFixed(1), y: (outA.y + 19).toFixed(1), class: 'wnode__ug',
      'text-anchor': Math.abs(outA.x - CX) < 30 ? 'middle' : (outA.x > CX ? 'start' : 'end'),
    });
    tug.textContent = m.ug;
    g.appendChild(tug);

    g.addEventListener('click', (e) => {
      if (!opts.onPick) return;      // 没给回调就让它正常跳转
      e.preventDefault();
      opts.onPick(m.id);
    });
    // 悬停/聚焦时把信息推给外部（右下角的读数）
    const report = () => { if (opts.onHover) opts.onHover(m, i); };
    g.addEventListener('mouseenter', report);
    g.addEventListener('focus', report);

    nodes.appendChild(g);
    items.push({ data: m, el: g, x: p.x, y: p.y });
  });

  svg.appendChild(nodes);
  host.appendChild(svg);

  return { svg, items, rotating };
}

/* ==========================================================================
   配合滚动的入场：轮盘随滚动进度慢慢转、慢慢亮
   ========================================================================== */
function bindWheelScroll(section, wheel, reduced) {
  if (!wheel || reduced) return () => {};
  let ticking = false;
  const update = () => {
    ticking = false;
    const r = section.getBoundingClientRect();
    const vh = window.innerHeight;
    // 0 = 刚进视口，1 = 完全离开上方
    const p = Math.min(1, Math.max(0, (vh - r.top) / (vh + r.height)));

    // 转动：整段滚动过程中转约 24 度，慢到"几乎察觉不到但在动"
    wheel.rotating.style.transform = 'rotate(' + (p * 24 - 12).toFixed(2) + 'deg)';
    wheel.rotating.style.transformOrigin = '50% 50%';

    // 亮度：进入视口中央时最亮
    const focus = 1 - Math.abs(p - 0.5) * 1.5;
    wheel.svg.style.setProperty('--wheel-focus', Math.max(0.25, focus).toFixed(3));
  };
  const onScroll = () => {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(update);
  };
  window.addEventListener('scroll', onScroll, { passive: true });
  window.addEventListener('resize', onScroll, { passive: true });
  update();
  return () => {
    window.removeEventListener('scroll', onScroll);
    window.removeEventListener('resize', onScroll);
  };
}

__ns = __XM[6];
__ns.mount_buildWheel = function () { return buildWheel; };
__ns.mount_bindWheelScroll = function () { return bindWheelScroll; };
}

/* ── js/lib/heritage-data.js ── */
function __M7__() {
/* ==========================================================================
   弦脉 · 各民族音乐非遗
   --------------------------------------------------------------------------
   旋律图上的八个入口。每一条对应一个分页面：../heritage/<id>/index.html

   字段说明：
     id     路由名，决定分页面目录
     name   中文名
     ug     拉丁 / 罗马转写（便于检索）
     group  民族
     kind   形态类型
     pitch  在旋律图上的音高位置（1 = 最低的下加一线，每 +1 上升半格）
     hue    音符配色色相
     note   一句话说明 —— **留空待补，不编**

   你搜到资料后，把内容填进 note，或加任意新字段（region / level / 曲目 /
   传承人 …），页面会自动带上。
   ========================================================================== */

const HERITAGE = [
  { id: 'zhuang-tianqin',    name: '天琴艺术',   ug: 'Tianqin',       group: '壮族',   kind: '器乐 · 弹唱',  pitch: 3,  hue: 36,  note: '' },
  { id: 'mongol-morinhuur',  name: '马头琴',     ug: 'Morin Khuur',   group: '蒙古族', kind: '器乐',        pitch: 5,  hue: 152, note: '' },
  { id: 'dong-dage',         name: '侗族大歌',   ug: 'Kam Grand Choir', group: '侗族', kind: '多声部合唱',  pitch: 8,  hue: 200, note: '' },
  { id: 'manchu-xinchengxi', name: '新城戏',     ug: 'Xincheng Opera', group: '满族',  kind: '戏曲',        pitch: 6,  hue: 320, note: '' },
  { id: 'miao-guge',         name: '苗族古歌',   ug: 'Hxak Lul',      group: '苗族',   kind: '史诗 · 叙事歌', pitch: 11, hue: 12,  note: '' },
  { id: 'yi-shan-ge',        name: '山歌小调',   ug: 'Yi Folk Songs', group: '彝族',   kind: '民歌',        pitch: 9,  hue: 42,  note: '' },
  { id: 'dai-zhangha',       name: '章哈',       ug: 'Zhangha',       group: '傣族',   kind: '说唱',        pitch: 4,  hue: 168, note: '' },
  { id: 'tibetan-gesar',     name: '格萨尔',     ug: 'Gesar',         group: '藏族',   kind: '史诗说唱',    pitch: 13, hue: 218, note: '' },
];

/** 分页面路径 */
function heritageHref(id) {
  return '../heritage/' + id + '/index.html';
}

__ns = __XM[7];
__ns.mount_HERITAGE = function () { return HERITAGE; };
__ns.mount_heritageHref = function () { return heritageHref; };
}

/* ── js/lib/melody.js ── */
function __M8__() {
var HERITAGE = __XM[7]["HERITAGE"];
var heritageHref = __XM[7]["heritageHref"];

/* ==========================================================================
   弦脉 · 旋律入口图
   --------------------------------------------------------------------------
   一串旋律的形状，八个民族的音乐非遗各占一个音。

   画法直接采用乐谱语言：五线谱、音符头、符干、高音谱号。
   音符的位置就是它的音高 —— 所以这张图既是导航，也是一条真正读得出来的旋律线。

   交互：
     · 每个音符是一个 <a>，能点、能 Tab、能新标签打开
     · 悬停/聚焦：音符亮起，下方读数显示那一项的说明
     · 随滚动：旋律线被"吹奏"出来，一个游标沿曲线前进
   ========================================================================== */



const SVGNS = 'http://www.w3.org/2000/svg';
const VB = { w: 1160, h: 380 };

/* 五线谱几何：线距 15，五条线 */
const STAFF = { x0: 74, x1: 1110, gap: 15, top: 120 };
STAFF.bottom = STAFF.top + STAFF.gap * 4;           // 下加一线位置（pitch = 1）

/* 音符横向起点 */
const NOTE_X0 = 232;
const NOTE_DX = 118;
const HEAD_RX = 11.5;
const HEAD_RY = 8.4;

const el = (tag, attrs) => {
  const n = document.createElementNS(SVGNS, tag);
  for (const k in attrs) n.setAttribute(k, attrs[k]);
  return n;
};

/** pitch → y。1 在下加一线，每加 1 上升半格（半个线距） */
const pitchY = (pitch) => STAFF.bottom - (pitch - 1) * (STAFF.gap / 2);

/**
 * Catmull-Rom → 三次贝塞尔，把节点连成平滑旋律线
 */
function smoothPath(pts) {
  if (pts.length < 2) return '';
  let d = 'M ' + pts[0].x.toFixed(1) + ' ' + pts[0].y.toFixed(1);
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] || pts[i];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = pts[i + 2] || p2;
    const c1x = p1.x + (p2.x - p0.x) / 6;
    const c1y = p1.y + (p2.y - p0.y) / 6;
    const c2x = p2.x - (p3.x - p1.x) / 6;
    const c2y = p2.y - (p3.y - p1.y) / 6;
    d += ' C ' + c1x.toFixed(1) + ' ' + c1y.toFixed(1) +
         ', ' + c2x.toFixed(1) + ' ' + c2y.toFixed(1) +
         ', ' + p2.x.toFixed(1) + ' ' + p2.y.toFixed(1);
  }
  return d;
}

/**
 * 生成旋律入口图。
 * @param {HTMLElement} host
 * @param {object} [opts]
 * @param {(m:object,i:number)=>void} [opts.onHover]
 * @param {(id:string)=>void} [opts.onPick]  不传则直接跳转
 */
function buildMelody(host, opts = {}) {
  if (!host) return null;

  const svg = el('svg', {
    class: 'melody',
    viewBox: `0 0 ${VB.w} ${VB.h}`,
    preserveAspectRatio: 'xMidYMid meet',
    role: 'list',
    'aria-label': '旋律入口：八个民族的音乐类非物质文化遗产，每个音符是一个入口',
  });

  /* ---- defs：旋律线的渐变（从起点到终点，暗示"被吹奏"的方向） ---- */
  const defs = el('defs');
  const grad = el('linearGradient', { id: 'melodyGrad', x1: '0', y1: '0', x2: '1', y2: '0' });
  [['0%', '#c08a3e'], ['38%', '#e0b070'], ['72%', '#8fb0a4'], ['100%', '#6f9c8d']].forEach(([off, col]) => {
    grad.appendChild(el('stop', { offset: off, 'stop-color': col }));
  });
  defs.appendChild(grad);
  svg.appendChild(defs);

  /* ---- 五线谱 ---- */
  const staff = el('g', { class: 'melody__staff', 'aria-hidden': 'true' });
  for (let i = 0; i < 5; i++) {
    const y = STAFF.top + i * STAFF.gap;
    staff.appendChild(el('line', {
      x1: STAFF.x0, y1: y, x2: STAFF.x1, y2: y, class: 'melody__line',
    }));
  }
  svg.appendChild(staff);

  /* ---- 高音谱号：手绘路径，避免依赖字体 ---- */
  const clef = el('path', {
    class: 'melody__clef',
    'aria-hidden': 'true',
    d: 'M 108 176 C 96 168 90 156 94 146 C 98 136 110 132 118 138 ' +
       'C 128 145 128 158 120 168 C 110 180 96 192 88 206 ' +
       'C 78 224 80 244 94 254 C 108 264 126 258 132 244 ' +
       'C 138 230 130 216 116 214 C 104 212 96 220 96 230',
  });
  svg.appendChild(clef);

  /* ---- 拍号 ---- */
  const ts = el('g', { class: 'melody__timesig', 'aria-hidden': 'true' });
  const t1 = el('text', { x: 152, y: STAFF.top + 21 });
  t1.textContent = '4';
  const t2 = el('text', { x: 152, y: STAFF.top + 51 });
  t2.textContent = '4';
  ts.appendChild(t1); ts.appendChild(t2);
  svg.appendChild(ts);

  /* ---- 节点坐标 ---- */
  const pts = HERITAGE.map((m, i) => ({
    x: NOTE_X0 + i * NOTE_DX,
    y: pitchY(m.pitch),
    m, i,
  }));

  /* ---- 旋律线 ---- */
  const dPath = smoothPath(pts);
  const pathSleeve = el('path', { class: 'melody__sleeve', d: dPath, 'aria-hidden': 'true' });
  const pathLine = el('path', { class: 'melody__curve', d: dPath, 'aria-hidden': 'true' });
  svg.appendChild(pathSleeve);
  svg.appendChild(pathLine);

  const totalLen = pathLine.getTotalLength ? pathLine.getTotalLength() : 1200;

  /* ---- 游标：随滚动沿曲线前进 ---- */
  const playhead = el('g', { class: 'melody__playhead', 'aria-hidden': 'true' });
  playhead.appendChild(el('circle', { r: 13, class: 'melody__pulse' }));
  playhead.appendChild(el('circle', { r: 4.2, class: 'melody__dot' }));
  svg.appendChild(playhead);

  /* ---- 八个音符 ---- */
  const nodes = el('g', { class: 'melody__notes' });
  const items = [];

  pts.forEach((p) => {
    const m = p.m;
    const g = el('a', {
      class: 'mnote',
      href: heritageHref(m.id),
      role: 'listitem',
      'data-id': m.id,
      'aria-label': m.name + '（' + m.group + ' · ' + m.kind + '）· ' + m.region + '，进入分页面',
    });
    g.style.setProperty('--h', String(m.hue));

    // 命中区：比音符本身大，方便点
    g.appendChild(el('rect', {
      x: p.x - NOTE_DX / 2 + 8, y: STAFF.top - 46,
      width: NOTE_DX - 16, height: STAFF.gap * 4 + 92,
      class: 'mnote__hit',
    }));

    // 符干 + 符尾（做成八分音符，看起来才是"旋律"而不是一排豆子）
    g.appendChild(el('line', {
      x1: p.x + HEAD_RX - 1.5, y1: p.y - 2,
      x2: p.x + HEAD_RX - 1.5, y2: p.y - 52,
      class: 'mnote__stem',
    }));
    g.appendChild(el('path', {
      d: 'M ' + (p.x + HEAD_RX - 1.5) + ' ' + (p.y - 52) +
         ' c 13 5, 21 13, 20 25 c 3 -15, -6 -25, -20 -30 z',
      class: 'mnote__flag',
    }));

    // 音符头：椭圆稍作旋转，像真的谱面
    g.appendChild(el('ellipse', {
      cx: p.x, cy: p.y, rx: HEAD_RX, ry: HEAD_RY,
      transform: 'rotate(-20 ' + p.x + ' ' + p.y + ')',
      class: 'mnote__head',
    }));

    // 内芯亮点：悬停时亮起，像被按下的音
    g.appendChild(el('circle', { cx: p.x, cy: p.y, r: 2.4, class: 'mnote__core' }));

    // 名称：谱表下方
    const tx = p.x;
    const nm = el('text', { x: tx, y: VB.h - 68, class: 'mnote__name' });
    nm.textContent = m.name;
    const gp = el('text', { x: tx, y: VB.h - 44, class: 'mnote__group' });
    gp.textContent = m.group;
    const kd = el('text', { x: tx, y: VB.h - 22, class: 'mnote__kind' });
    kd.textContent = m.kind;
    g.appendChild(nm); g.appendChild(gp); g.appendChild(kd);

    g.addEventListener('click', (e) => {
      if (!opts.onPick) return;
      e.preventDefault();
      opts.onPick(m.id);
    });
    const report = () => { if (opts.onHover) opts.onHover(m, p.i); };
    g.addEventListener('mouseenter', report);
    g.addEventListener('focus', report);

    nodes.appendChild(g);
    items.push({ data: m, el: g, x: p.x, y: p.y });
  });

  svg.appendChild(nodes);
  host.appendChild(svg);

  return { svg, items, pathLine, playhead, totalLen };
}

/**
 * 随滚动"吹奏"这条旋律：线被画出来，游标沿曲线前进。
 * @param {HTMLElement} section
 * @param {object} melody  buildMelody 的返回值
 * @param {boolean} reduced
 */
function bindMelodyScroll(section, melody, reduced) {
  if (!melody || reduced) {
    // 减弱动效：直接给完整曲线，不做逐段显示
    melody.pathLine.style.strokeDasharray = 'none';
    melody.playhead.style.opacity = '0';
    return () => {};
  }

  const { pathLine, playhead, totalLen } = melody;
  playhead.style.opacity = '0';
  let ticking = false;

  const update = () => {
    ticking = false;
    const r = section.getBoundingClientRect();
    const vh = window.innerHeight;
    // 0 = 刚进视口底部，1 = 完全离开上方
    const raw = (vh - r.top) / (vh + r.height);
    const p = Math.min(1, Math.max(0, raw));
    // 在进入视口中央之前就把旋律吹完，别等滚出去
    const play = Math.min(1, Math.max(0, (p - 0.12) / 0.56));

    pathLine.style.strokeDasharray = totalLen + ' ' + totalLen;
    pathLine.style.strokeDashoffset = (totalLen * (1 - play)).toFixed(1);

    if (playhead.getTotalLength) {
      const pt = pathLine.getPointAtLength(totalLen * play);
      playhead.setAttribute('transform', 'translate(' + pt.x.toFixed(1) + ' ' + pt.y.toFixed(1) + ')');
    }
    playhead.style.opacity = play > 0.01 && play < 0.995 ? '1' : (play >= 0.995 ? '0.35' : '0');
    melody.svg.style.setProperty('--melody-play', play.toFixed(3));
  };

  const onScroll = () => {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(update);
  };
  window.addEventListener('scroll', onScroll, { passive: true });
  window.addEventListener('resize', onScroll, { passive: true });
  update();
  return () => {
    window.removeEventListener('scroll', onScroll);
    window.removeEventListener('resize', onScroll);
  };
}

__ns = __XM[8];
__ns.mount_buildMelody = function () { return buildMelody; };
__ns.mount_bindMelodyScroll = function () { return bindMelodyScroll; };
}

/* ── js/lib/theme.js ── */
function __M9__() {
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
   ========================================================================== */

/** 一个简易主题曲播放器
 *  @param {string} url
 *  @param {object} [opts]
 *  @param {AudioContext} [opts.ctx] 复用已有的 AudioContext。
 *         不传就自己建一个 —— 但**同一个页面上最好只有一个**：
 *         两个独立的 context 会互相干扰（一个在跑、另一个不响），
 *         这是排查了很久才定位到的静音原因。 */
function createTheme(url, opts = {}) {
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
    /* 关键：**在这里唤醒 context**。
       有手鼓的页面由 seq.enable() 顺手唤醒；没有手鼓的页面
       （比如第三章，它只有配乐）就必须自己唤醒，否则一直 suspended。
       resume() 要在手势的调用栈里同步发起，浏览器才放行。 */
    if (theme) {
      const p = theme.resume();
      if (p && p.then) p.then(() => { if (theme) theme.wake(opts.fade === undefined ? 2.6 : opts.fade); });
    }
    /* startTheme:false 的页面（第四章）主题曲由别处触发，
       但这一次手势仍要让 context 就绪，否则到时候点了也没声。 */
    if (theme && opts.startTheme !== false && !theme.playing) {
      theme.start(opts.fade === undefined ? 2.6 : opts.fade);
    }
    markOn();
  };

  const evs = ['pointerdown', 'touchstart', 'keydown', 'wheel', 'scroll'];
  const detach = () => evs.forEach((e) => window.removeEventListener(e, on));
  evs.forEach((e) => window.addEventListener(e, on, { passive: true }));

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

__ns = __XM[9];
__ns.mount_createTheme = function () { return createTheme; };
__ns.mount_autoPlayOnGesture = function () { return autoPlayOnGesture; };
__ns.mount_unlock = function () { return unlock; };
}

/* ── js/lib/inherit-game.js ── */
function __M10__() {
/* ==========================================================================
   弦脉 · 传承之路
   --------------------------------------------------------------------------
   角色扮演：你是一名非遗传承人。两个场景，每个场景做一次选择。

   规则（用户定的）：
     · 两个选项要**很分明**，一眼看得出哪个对哪个错
     · 选错 → 播「失传」的视频 + 一句"这条路会失去什么" → 闪回，只能重选
     · 选对 → 播「活着」的视频 + 一个真实的传承案例 → 下一场景
     · 两个场景走完 → 结尾（结尾页稍后再做，这里先留位）

   视频还没做。没有视频时不报错、不空白，退化成场景自带的底色 ——
   机制照常能走完，素材到位后把 VIDEOS 里的路径填上就行。

   **案例人物我不编。** 名字、年份、做了什么，必须由用户核实后填。
   编一个错的放上去，是把错的东西教给别人 —— 比不做更糟。
   ========================================================================== */

const $ = (s, r) => (r || document).querySelector(s);

/* ------------------------------------------------------------------ 素材 */
/* 视频在 assets/video/inherit/ 下。
   桌面用 960×540（*-slim.webm），手机用 640×360（*-slim-m.webm）——
   和概念片同一套做法。素材没到位就退化成 CSS 底色，机制照常能走。 */
const VIDEO_DIR = '../assets/video/inherit/';
const MOBILE = !window.matchMedia('(min-width: 900px)').matches;
const SUF = MOBILE ? '-slim-m.webm' : '-slim.webm';
const V = {
  gobi:     'gobi' + SUF,        // 场景一 环境
  qonLive:  'qon-live' + SUF,    // 场景一 选对：文化活着
  qonLost:  'qon-lost' + SUF,    // 场景一 选错：文化失传
  qonCase:  'qon-case' + SUF,    // 场景一 成功案例
  steppe:   'steppe' + SUF,      // 场景二 环境
  tibLive:  'tib-live' + SUF,    // 场景二 选对
  tibLost:  'tib-lost' + SUF,    // 场景二 选错
  tibCase:  'tib-case' + SUF,    // 场景二 成功案例
};

/* ------------------------------------------------------------------ 剧本 */
const SCENES = [
  {
    id: 'gobi',
    kicker: '第一幕 · 戈壁',
    bg: 'gobi',
    intro: {
      title: '你来到了新疆的戈壁滩',
      text: '风把沙子推过地面。你面前是一整套十二木卡姆——' +
            '它要二十多个小时才能唱完，靠口传，一个师父带一拨徒弟。' +
            '你手上有一次机会，只能做一件事。你做什么？',
    },
    choices: [
      {
        ok: false,
        label: '把木卡姆的旋律录下来，带回城市，放进音乐厅里保存。',
        say: '你带走了旋律，但没有人再唱它。',
        tail: '十二木卡姆终究没能走出戈壁。',
        video: 'qonLost',
      },
      {
        ok: true,
        label: '留在戈壁，找到还在唱的人，跟着他学，把它唱给下一个愿意听的人。',
        say: '你留了下来。',
        tail: '只要还有人在唱，它就没有断。',
        video: 'qonLive',
        caseRef: 'qon',
      },
    ],
  },
  {
    id: 'steppe',
    kicker: '第二幕 · 草原',
    bg: 'steppe',
    intro: {
      title: '你来到了无垠的草原',
      text: '高原上的风一直没停。这里有一种说唱，艺人要连着讲好几天，' +
            '学的人得跟着师父一句一句背。' +
            '你还是只有一次机会。你做什么？',
    },
    choices: [
      {
        ok: false,
        label: '把格萨尔史诗翻译成文字，印成书，放进图书馆。',
        say: '你记下了故事，但没有人再讲它。',
        tail: '藏族文化终究没能走出草原。',
        video: 'tibLost',
      },
      {
        ok: true,
        label: '坐在草原上，听他说，跟着他学，让下一个孩子也能听见。',
        say: '你坐了下来。',
        tail: '风还在吹，故事还在往下讲。',
        video: 'tibLive',
        caseRef: 'tib',
      },
    ],
  },
];

/* 成功案例。**人名与事实由用户提供，不是我编的。** */
const CASES = {
  qon: {
    name: '玉苏普·托合提',
    year: '莎车县木卡姆文化传承中心 · 传承人',
    fact: '带出 20 多名徒弟，年龄最小的仅 20 岁。',
  },
  tib: {
    name: '桑珠',
    year: '西藏那曲 · 格萨尔说唱艺人 · 2009 年入选国家级非遗代表性传承人',
    fact: '能唱 60 多部《格萨尔》。',
  },
};

/* ------------------------------------------------------------------ 状态 */
const state = { scene: 0, phase: 'intro', tried: 0 };

/* ------------------------------------------------------------------ 构建 */
function buildInheritGame(opts = {}) {
  const host = $('#inherit');
  if (!host) return null;

  const bg = $('#g-bg', host);
  const kicker = $('#g-kicker', host);
  const title = $('#g-title', host);
  const text = $('#g-text', host);
  const choices = $('#g-choices', host);
  const caseEl = $('#g-case', host);
  const nextBtn = $('#g-next', host);
  const progress = $('#g-progress', host);

  const reduced = !!opts.reduced;

  /* 视频：一段一个元素，按需挂 src。
     取不到就什么都不显示，露出底色 —— 不报错、不留空白框。 */
  let videoEl = null;
  function makeVideo() {
    if (videoEl) return videoEl;
    videoEl = document.createElement('video');
    videoEl.muted = true;
    videoEl.playsInline = true;
    videoEl.preload = 'none';
    videoEl.setAttribute('aria-hidden', 'true');
    videoEl.className = 'g-video';
    bg.appendChild(videoEl);
    return videoEl;
  }

  /** 播一段视频；没有素材就静默退化成底色 */
  function playVideo(key, onDone) {
    const file = V[key];
    if (!file || reduced) { onDone(); return; }
    const v = makeVideo();
    let settled = false;
    const finish = () => { if (!settled) { settled = true; onDone(); } };
    v.onerror = finish;                       // 文件不在 → 直接往下走
    v.onended = finish;
    v.src = VIDEO_DIR + file;
    v.classList.add('is-on');
    v.play().then(() => {
      /* 播起来之后再挂一个兜底：万一 ended 不触发（webm 有时没时长元数据），
         也不至于卡在这一步。 */
      setTimeout(finish, 12000);
    }).catch(finish);
  }

  function clearVideo() {
    if (!videoEl) return;
    try { videoEl.pause(); } catch {}
    videoEl.classList.remove('is-on');
    videoEl.removeAttribute('src');
  }

  function setBg(kind) {
    host.dataset.bg = kind || '';
  }

  /* ---------------------------------------------------------- 渲染各阶段 */
  function renderIntro() {
    const s = SCENES[state.scene];
    state.phase = 'intro';
    clearVideo();
    setBg(s.bg);
    kicker.textContent = s.kicker;
    title.textContent = s.intro.title;
    text.textContent = s.intro.text;
    caseEl.hidden = true;
    nextBtn.hidden = true;
    progress.textContent = '第 ' + (state.scene + 1) + ' / ' + SCENES.length + ' 幕';

    choices.hidden = false;
    choices.innerHTML = '';
    s.choices.forEach((c, i) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'g-choice';
      b.dataset.ok = c.ok ? '1' : '0';
      b.innerHTML = '<span class="g-choice__key">' + (i === 0 ? 'A' : 'B') + '</span>' +
                    '<span class="g-choice__label">' + c.label + '</span>';
      b.addEventListener('click', () => choose(i));
      choices.appendChild(b);
    });
  }

  function choose(i) {
    const s = SCENES[state.scene];
    const c = s.choices[i];
    choices.hidden = true;
    hideOthers();
    if (c.ok) {
      state.phase = 'right';
      title.textContent = c.say;
      text.textContent = c.tail;
      setBg(s.bg);
      playVideo(c.video, () => {
        // 活着那段播完，接着给成功案例
        showCase(c.caseRef);
      });
    } else {
      state.phase = 'wrong';
      state.tried++;
      title.textContent = c.say;
      text.textContent = c.tail;
      setBg(s.bg + '-lost');
      /* **闪回按钮立刻出现**，不等视频播完。
         这里踩过一次：原来把 showRetry 挂在视频的 ended 回调里，
         结果视频一发 ended（或者没时长元数据不触发），
         玩家就卡在失败画面**没有出口** —— 而"选错必须能重选"
         是这个游戏的核心规则，不能依赖视频播放是否顺利。 */
      showRetry();
      playVideo(c.video, () => {});
    }
  }

  function hideOthers() {
    caseEl.hidden = true;
    nextBtn.hidden = true;
  }

  function showRetry() {
    nextBtn.hidden = false;
    nextBtn.textContent = '回到选择';
    nextBtn.onclick = () => renderIntro();
  }

  function showCase(ref) {
    const c = CASES[ref];
    state.phase = 'case';
    setBg(SCENES[state.scene].bg);
    playVideo(SCENES[state.scene].choices.find((x) => x.ok).video === 'qonLive'
      ? 'qonCase' : 'tibCase', () => {});
    if (c) {
      caseEl.hidden = false;
      caseEl.innerHTML =
        '<span class="g-case__name">' + c.name + '</span>' +
        '<span class="g-case__year">' + c.year + '</span>' +
        '<span class="g-case__fact">' + c.fact + '</span>';
    }
    nextBtn.hidden = false;
    const last = state.scene >= SCENES.length - 1;
    nextBtn.textContent = last ? '继续' : '前往下一幕';
    nextBtn.onclick = () => {
      if (last) showEnding();
      else { state.scene++; renderIntro(); }
    };
  }

  /* 结尾页稍后再做 —— 这里先停住，写清楚下一步是什么 */
  function showEnding() {
    state.phase = 'end';
    clearVideo();
    setBg('end');
    kicker.textContent = '终章';
    title.textContent = '你把它带出来了';
    text.textContent = '两处地方，两次选择，两样文化都还在。' +
      (state.tried ? '你走过一次弯路——那条路上没有人。' : '');
    hideOthers();
    /* 把选项**内容也清掉**，不只是隐藏。
       光靠 hidden 不够稳：.g-choices 上有 display: grid，
       它会盖掉 hidden 属性自带的 display:none，
       结果"隐藏"了的按钮照样显示（踩过，截图里和结尾页叠在一起）。
       CSS 那边已经补了 [hidden] 规则，这里再把内容清空，双保险。 */
    choices.hidden = true;
    choices.innerHTML = '';
    progress.textContent = '（结尾页待做）';
  }

  renderIntro();

  /* 自检用：可以问当前状态，也可以直接跳到某一幕 */
  return {
    state: () => JSON.parse(JSON.stringify(state)),
    scenes: () => SCENES.map((s) => s.id),
    goScene: (i) => { state.scene = Math.max(0, Math.min(SCENES.length - 1, i)); renderIntro(); },
    choose,
  };
}

__ns = __XM[10];
__ns.mount_buildInheritGame = function () { return buildInheritGame; };
}

/* ── js/pages/fulu.js ── */
function __M11__() {
var bootChapter = __XM[4]["bootChapter"];
var buildWheel = __XM[6]["buildWheel"];
var bindWheelScroll = __XM[6]["bindWheelScroll"];
var buildMelody = __XM[8]["buildMelody"];
var bindMelodyScroll = __XM[8]["bindMelodyScroll"];
var MUQAM = __XM[5]["MUQAM"];
var HERITAGE = __XM[7]["HERITAGE"];
var unlock = __XM[9]["unlock"];
var createTheme = __XM[9]["createTheme"];
var autoPlayOnGesture = __XM[9]["autoPlayOnGesture"];
var buildInheritGame = __XM[10]["buildInheritGame"];

/* 附录 · 形制比较 —— 十二套木卡姆轮盘 + 八个民族的旋律入口 */








/* 这一页不放鼓：它是一次"横向看"的比较，主题曲一个人铺底就够。
   所以 sound:false —— 免得鼓点和主题曲抢。 */
const ctx = bootChapter({ active: 'fulu', sound: false });
const { REDUCED } = ctx;
const $ = (s) => document.querySelector(s);

const theme = createTheme('../assets/audio/mashrap/theme.mp3');
theme.preload();
autoPlayOnGesture({ theme, seq: null, fade: 3.2 });

// 自检用
window.__XM_THEME__ = theme;

/* ------------------------------------------------------------------ 门
   其他民族的页面要先把麦西热甫那场圆圈玩完才开。
   没解锁时点任一入口，就把人送回第四章的互动，并说明原因。

   这是引导，不是安全机制 —— 目的是让人按设计的顺序走一遍。 */
const GATE = {
  href: '../mashrap/index.html#mq-act',
  msg: '先把第四章那场麦西热甫跳完（把圈子点满），这里才开。',
};

/** 给未解锁的元素加统一的"锁着"视觉 */
function applyLock(root) {
  if (!root) return;
  root.classList.add('is-locked');
  root.setAttribute('aria-disabled', 'true');
}

function gate(onBlocked) {
  if (unlock.done) return;
  // 进入页面时就把视觉改掉
  document.querySelectorAll('.wnode, .mnote').forEach(applyLock);
  // 点任何一个都被拦下
  document.addEventListener('click', (e) => {
    const a = e.target.closest && e.target.closest('.wnode, .mnote');
    if (!a) return;
    e.preventDefault();
    e.stopPropagation();
    if (onBlocked) onBlocked();
  }, true);
}

/* ---- 十二套木卡姆 ---- */
const wHost = $('#wheel-host');
const wReadout = $('#wheel-readout');
if (wHost) {
  const wheel = buildWheel(wHost, {
    hrefBase: '../muqam/',
    onPick: (id) => {
      // 分页面还没做：给反馈而不是跳 404。建好后删掉这段即可正常跳转。
      const m = MUQAM.find((x) => x.id === id);
      if (m && wReadout) {
        wReadout.innerHTML = '<b>' + m.name + ' · ' + m.ug + '</b>' +
          m.region + '　<em>' + m.char + '</em><br>' + m.note +
          '<br><span style="color:var(--bone-faint)">这一套的分页面还在制作中。</span>';
      }
    },
    onHover: (m) => {
      if (!wReadout) return;
      wReadout.innerHTML = '<b>' + m.name + ' · ' + m.ug + '</b>' +
        m.region + '　<em>' + m.char + '</em><br>' + m.note;
    },
  });
  bindWheelScroll($('#wheel-act'), wheel, REDUCED);
}

/* ---- 八个民族的旋律入口 ---- */
const mHost = $('#melody-host');
const mReadout = $('#melody-readout');
if (mHost) {
  // 字段缺了就跳过，不显示空行 —— note 留空待补时不至于出现空白
  const line = (m) => '<b>' + m.name + (m.ug ? ' · ' + m.ug : '') + '</b>' +
    (m.group || '') + (m.kind ? '　<em>' + m.kind + '</em>' : '') +
    (m.note ? '<br>' + m.note : '');

  const melody = buildMelody(mHost, {
    onPick: (id) => {
      const m = HERITAGE.find((x) => x.id === id);
      if (m && mReadout) {
        mReadout.innerHTML = line(m) +
          '<br><span style="color:var(--bone-faint)">这一个分页面还在制作中。</span>';
      }
    },
    onHover: (m) => { if (mReadout) mReadout.innerHTML = line(m); },
  });
  bindMelodyScroll($('#melody-act'), melody, REDUCED);
}

/* ---- 上锁与解锁提示 ----
   未解锁：给所有入口加"锁着"的视觉，点任何一处都把人送回第四章的互动。
   已解锁：不动，正常走。 */
const gateNote = document.getElementById('gate-note');
if (!unlock.done) {
  gate(() => {
    if (gateNote) {
      gateNote.innerHTML = '<b>还没开门</b>' + GATE.msg +
        '<br><a href="' + GATE.href + '">去第四章 · 麦西热甫 →</a>';
      gateNote.classList.add('is-on');
      gateNote.scrollIntoView({ behavior: REDUCED ? 'auto' : 'smooth', block: 'center' });
    } else {
      location.href = GATE.href;
    }
  });
  // 提示条里的链接要能点（gate 是捕获阶段拦的，得让它放行）
  if (gateNote) {
    gateNote.addEventListener('click', (e) => {
      if (e.target.tagName === 'A') e.stopPropagation();
    }, true);
  }
} else if (gateNote) {
  gateNote.remove();
}

/* ---- 传承之路（角色扮演） ----
   放在附录最后一屏：你是一名非遗传承人，两处地方各做一次选择。
   跟"上锁"无关 —— 它是这一页的正片结尾，不是入口，所以不参与 gate。

   素材是 8 段视频（戈壁/草原 × 环境/活着/失传/案例），
   桌面 960×540、手机 640×360，共 8.3 / 4.6 MB。
   素材若缺，游戏会退化成 CSS 底色，机制照常能走完。 */
const inherit = buildInheritGame({ reduced: REDUCED });
// 自检用
window.__XM_GAME__ = inherit;
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

/* js/lib/site.js */
try {
  __ns = __XM[3];
  __M3__();
  for (var k in __XM[3]) { if (k.indexOf("mount_") === 0) __XM[3][k.slice(6)] = __XM[3][k](); }
} catch (e) {
  (window.__XM_BOOT_ERR__ = window.__XM_BOOT_ERR__ || []).push("js/lib/site.js" + " :: " + (e && e.stack || e));
}

/* js/lib/chapter.js */
try {
  __ns = __XM[4];
  __M4__();
  for (var k in __XM[4]) { if (k.indexOf("mount_") === 0) __XM[4][k.slice(6)] = __XM[4][k](); }
} catch (e) {
  (window.__XM_BOOT_ERR__ = window.__XM_BOOT_ERR__ || []).push("js/lib/chapter.js" + " :: " + (e && e.stack || e));
}

/* js/lib/muqam-data.js */
try {
  __ns = __XM[5];
  __M5__();
  for (var k in __XM[5]) { if (k.indexOf("mount_") === 0) __XM[5][k.slice(6)] = __XM[5][k](); }
} catch (e) {
  (window.__XM_BOOT_ERR__ = window.__XM_BOOT_ERR__ || []).push("js/lib/muqam-data.js" + " :: " + (e && e.stack || e));
}

/* js/lib/wheel.js */
try {
  __ns = __XM[6];
  __M6__();
  for (var k in __XM[6]) { if (k.indexOf("mount_") === 0) __XM[6][k.slice(6)] = __XM[6][k](); }
} catch (e) {
  (window.__XM_BOOT_ERR__ = window.__XM_BOOT_ERR__ || []).push("js/lib/wheel.js" + " :: " + (e && e.stack || e));
}

/* js/lib/heritage-data.js */
try {
  __ns = __XM[7];
  __M7__();
  for (var k in __XM[7]) { if (k.indexOf("mount_") === 0) __XM[7][k.slice(6)] = __XM[7][k](); }
} catch (e) {
  (window.__XM_BOOT_ERR__ = window.__XM_BOOT_ERR__ || []).push("js/lib/heritage-data.js" + " :: " + (e && e.stack || e));
}

/* js/lib/melody.js */
try {
  __ns = __XM[8];
  __M8__();
  for (var k in __XM[8]) { if (k.indexOf("mount_") === 0) __XM[8][k.slice(6)] = __XM[8][k](); }
} catch (e) {
  (window.__XM_BOOT_ERR__ = window.__XM_BOOT_ERR__ || []).push("js/lib/melody.js" + " :: " + (e && e.stack || e));
}

/* js/lib/theme.js */
try {
  __ns = __XM[9];
  __M9__();
  for (var k in __XM[9]) { if (k.indexOf("mount_") === 0) __XM[9][k.slice(6)] = __XM[9][k](); }
} catch (e) {
  (window.__XM_BOOT_ERR__ = window.__XM_BOOT_ERR__ || []).push("js/lib/theme.js" + " :: " + (e && e.stack || e));
}

/* js/lib/inherit-game.js */
try {
  __ns = __XM[10];
  __M10__();
  for (var k in __XM[10]) { if (k.indexOf("mount_") === 0) __XM[10][k.slice(6)] = __XM[10][k](); }
} catch (e) {
  (window.__XM_BOOT_ERR__ = window.__XM_BOOT_ERR__ || []).push("js/lib/inherit-game.js" + " :: " + (e && e.stack || e));
}

/* js/pages/fulu.js */
try {
  __ns = __XM[11];
  __M11__();
  for (var k in __XM[11]) { if (k.indexOf("mount_") === 0) __XM[11][k.slice(6)] = __XM[11][k](); }
} catch (e) {
  (window.__XM_BOOT_ERR__ = window.__XM_BOOT_ERR__ || []).push("js/pages/fulu.js" + " :: " + (e && e.stack || e));
}
})();
