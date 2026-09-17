# 弦脉 · Stringline Heritage

丝路口传音乐的数字档案。以新疆十二木卡姆为主线，连接各民族音乐类非物质文化遗产。

## 站点结构

| 页面 | 路径 | 内容 |
|---|---|---|
| 序 | `index.html` | 首屏。三段式结构柱，交互引导 |
| 二 · 穹乃额曼 | `qiongnaieman/index.html` | 大曲（内容待补） |
| 三 · 达斯坦 | `dastan/index.html` | 叙事诗（内容待补） |
| 四 · 麦西热甫 | `mashrap/index.html` | 歌舞曲（内容待补） |
| 五 · 历史与传承 | `lishi/index.html` | 渊源、经典化、抢救、当代运用 |
| 附录 · 形制比较 | `fulu/index.html` | 十二木卡姆轮盘 + 八个民族的旋律入口 |

## 本地预览

**方式一：直接双击 `index.html`**

站点被打包成普通脚本，`file://` 下可以正常运行。

**方式二：起服务器（手机也能看）**

```bash
node tools/serve.mjs 8080
```

然后同 WiFi 下的手机访问 `http://<本机IP>:8080/`。
`node tools/links.mjs` 会直接打印所有页面地址。

## 开发

源码是 ES module，分在 `js/lib/`（可复用）和 `js/pages/`（每页一个入口）。

**改了 `js/lib/**` 或 `js/pages/**` 之后必须重新打包**：

```bash
node tools/build.mjs
```

页面加载的是 `js/dist/*.js`（打包产物），不跑这一步页面还是旧行为。
`tools/verify.mjs` 会检测产物是否过期。

## 自检

| 命令 | 查什么 |
|---|---|
| `node tools/verify.mjs` | 语法、着色器、配色一致性、打包是否过期 |
| `node tools/link-check.mjs` | 全站死链 |
| `node tools/site-test.mjs` | 六页逐个开：脚本、导航、部件、窄窗口导航 |
| `node tools/browser-test.mjs` | 首屏：几何、逐段点亮、师承网络、`file://` |
| `node tools/chapter-test.mjs` | 章节页：轮盘、旋律、交互 |
| `node tools/mobile-test.mjs` | 手机尺寸：帧率、缓冲、命中区、溢出 |
| `node tools/gap-audit.mjs` | 鼓点空档（防"听起来断断续续"回归） |
| `node tools/audio-test.mjs` | 音频电平、削波、音色差异 |
| `node tools/material-probe.mjs` | 材质统计（防木纹、防条纹） |

## 设计约束

- 首页三段结构柱是唯一主视觉
- 不使用平铺的敦煌壁画色块
- 配色令牌集中在 `styles.css` 的 `:root`，着色器颜色由 `verify.mjs` 与 CSS 对账
- 无障碍：交互元素可键盘到达；`prefers-reduced-motion` 下关闭动效
- 内容准则：**只写公开可查的信息，不确定的留空**。数据集中在
  `js/lib/muqam-data.js` 与 `js/lib/heritage-data.js`，加字段页面会自动带上

## 目录

```
index.html            序
qiongnaieman/         第二章
dastan/               第三章
mashrap/              第四章
lishi/                第五章
fulu/                 附录
styles.css            站点样式与设计令牌
styles/chapter.css    章节页样式
js/lib/               共享模块（渲染器、音序器、数据、组件）
js/pages/             每页一个入口
js/dist/              打包产物（构建生成，勿手改）
assets/               图片与滤镜
tools/                构建、预览、自检脚本
```

## 部署

站点已部署到 GitHub Pages：

**https://liu123-edg.github.io/xiangmai/**

仓库：https://github.com/liu123-EDG/xiangmai

改完之后更新线上：

```bash
node tools/build.mjs
git add -A && git commit -m "说明这次改了什么"
git push
```

推送后 GitHub 自动重新构建，约 1 分钟生效。

### 为什么不用服务器

全站是静态的——没有数据库、没有登录、没有后端接口。互动（敲鼓、拼套曲、
跟唱填音）都在浏览器里跑，声音也是现场合成的。所以静态托管就够，
一分钱不花。

只有出现下面任意一条时才需要后端：

- 要存用户上传的录音/图片
- 要做全网排行榜（需要跨用户共享数据）
- 要用户注册登录
- 要放大量真实录音（建议对象存储，不是服务器）

