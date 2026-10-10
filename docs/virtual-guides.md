# 虚拟同行者素材与行为

三个角色均为虚构：弦歌（维吾尔族主题）、银铃（苗族主题）、青岚（蒙古族主题）。服饰为概念设计，不是民族服饰考据复原。

素材使用内置 image_gen 工具，从用户确认的三人概念图分别提取，保留脸型、服饰、配色、姿态；透明 PNG 已检查 alpha 通道。选定人物从第二章陪伴到后续章节、民族档案与情境游戏。

对话为根据站内资料编写的预设话题；未连接语言模型，不收集或上传用户输入。人物选择与“沿途提示”偏好保存在本机浏览器。存储不可用时，本页仍可使用；跨页记忆依赖浏览器允许本地存储。

待机、说话、提示通过 CSS 状态轻动效呈现，使用同一张人物原画，尚未绘制独立表情帧。系统启用“减弱动效”时关闭动画。主动提示不抢焦点，可单条关闭，也可关闭全部沿途提示。

## 素材路径

- assets/img/guides/xiange.png
- assets/img/guides/yinling.png
- assets/img/guides/qinglan.png

## 生产提示词（原文）

### uyghur

Edit target: the provided approved character lineup. Extract ONLY the LEFT Uyghur-inspired woman in ivory ikat patterned dress and green vest, embroidered cap, long dark braids. Preserve her/his exact approved face, hairstyle, clothing, accessories, colors, hand gesture, artistic rendering and entire head-to-toe pose. Remove the other two people and remove ALL background. Produce ONE isolated full-body character on genuinely transparent alpha background, not a painted checkerboard and not a dark studio backdrop. Keep fine hair, head ornament and clean garment edges. Portrait canvas centered character, entire body with all hands and shoes inside the canvas with comfortable margins. No floor, shadow plate, halo, caption or words. This is a production cutout asset for a website companion. Do not redesign the character. Return a crisp high quality transparent PNG.

### miao

Edit target: the provided approved character lineup. Extract ONLY the CENTER Miao-inspired woman in indigo embroidered pleated costume with silver headdress and ornaments, holding notebook. Preserve her/his exact approved face, hairstyle, clothing, accessories, colors, hand gesture, artistic rendering and entire head-to-toe pose. Remove the other two people and remove ALL background. Produce ONE isolated full-body character on genuinely transparent alpha background, not a painted checkerboard and not a dark studio backdrop. Keep fine hair, head ornament and clean garment edges. Portrait canvas centered character, entire body with all hands and shoes inside the canvas with comfortable margins. No floor, shadow plate, halo, caption or words. This is a production cutout asset for a website companion. Do not redesign the character. Return a crisp high quality transparent PNG.

### mongol

Edit target: the provided approved character lineup. Extract ONLY the RIGHT Mongolian-inspired man in teal deel robe, ochre sash, boots. Preserve her/his exact approved face, hairstyle, clothing, accessories, colors, hand gesture, artistic rendering and entire head-to-toe pose. Remove the other two people and remove ALL background. Produce ONE isolated full-body character on genuinely transparent alpha background, not a painted checkerboard and not a dark studio backdrop. Keep fine hair, head ornament and clean garment edges. Portrait canvas centered character, entire body with all hands and shoes inside the canvas with comfortable margins. No floor, shadow plate, halo, caption or words. This is a production cutout asset for a website companion. Do not redesign the character. Return a crisp high quality transparent PNG.

## 验证

`node tools/companion-test.mjs`：人物真实点击选择、按章节对话、体验跳转、跨页记忆、主动提示、关闭偏好、更换人物、手机布局、减弱动效、file://、禁用存储时的降级。

