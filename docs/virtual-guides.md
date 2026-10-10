# 虚拟同行者素材与行为

三个角色均为虚构：弦歌（维吾尔族主题）、银铃（苗族主题）、青岚（蒙古族主题）。服饰为概念设计，不是民族服饰考据复原。

素材使用内置 image_gen 工具，从用户确认的三人概念图分别提取，保留脸型、服饰、配色、姿态；透明 PNG 已检查 alpha 通道。选定人物从第二章陪伴到后续章节、民族档案与情境游戏。

对话为根据站内资料编写的预设话题；未连接语言模型，不收集或上传用户输入。人物选择与“沿途提示”偏好保存在本机浏览器。存储不可用时，本页仍可使用；跨页记忆依赖浏览器允许本地存储。

历史第二版使用具有立体光影的 2.5D 人物图集，每人六个姿态：静立、眨眼、偏头、招手、两种说话手势。Canvas 在姿态间短暂淡化过渡，并叠加轻微呼吸；这是一种预渲染姿态动画，不是可旋转的实时 3D 模型。离屏或浏览器后台暂停动画，系统启用“减弱动效”时显示静态姿态。原人物图保留作加载失败时的备用。

切换章节后，人物分三句介绍当前内容；可等待自动切换，也可点击下一句或关闭。打开聊天面板会停止介绍，关闭“沿途提示”会一并关闭自动章节介绍。对话框使用浅色纸面底板和深色文字，强调与深色背景的层次。主动提示不抢焦点。

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


## 第二版动作素材与提示词

- assets/img/guides/xiange-motion-v2.png
- assets/img/guides/yinling-motion-v2.png
- assets/img/guides/qinglan-motion-v2.png

三张图集分别以已确认的对应角色透明原图作为编辑输入。生成提示词相同，人物身份与服饰由各自参考图决定；实际输出均为 1254 × 1254 透明 PNG。

Use case: stylized-concept. EDIT the provided approved fictional website guide into an animation-ready 2.5D pose atlas. Preserve recognizable identity, attractive face, ethnic-inspired costume, colors, hair and all accessories of this exact character. Upgrade rendering to premium stylized 3D animated feature / 2.5D game character look: sculpted dimensional face, soft subsurface light, convincing cloth volume, tasteful bevel-like embroidered detail, physically plausible highlights, strong readable silhouette. Not photoreal, not flat anime, not a generic plastic doll. Produce ONE transparent-alpha sprite atlas with EXACTLY SIX complete full-body drawings of THE SAME character, evenly arranged in a strict 3-column by 2-row grid. Square canvas 1536x1536 preferred; each cell exactly one third canvas width by one half canvas height. Entire figure inside every cell including hair, head ornament, hands, skirts and shoes. Identical camera, character scale, foot baseline, head position and lighting in all six cells; generous separation, no cell borders, no numbers, no text, no environment, no ground, no backdrops, genuine alpha transparency. Cell order row-major: 0 neutral relaxed resting pose with warm small smile and closed mouth; 1 gentle breath and subtle shoulder shift, hands relaxed, eyes softly closing in blink; 2 slight curious head tilt, eyes open, one hand lightly resting near chest; 3 friendly greeting with one hand raised and palm waving at shoulder height, bright smile; 4 actively explaining with one open palm outward and visibly open speaking mouth; 5 second speaking pose with a subtle nod and the open palm slightly lifted, mouth changed to a small rounded speaking expression. Arms must genuinely change between poses; no repeated static duplicate drawings. Keep face and outfit coherent across all frames. Gestures restrained and graceful. These six frames will cycle for multiple idle routines, greeting, and speaking gestures. Preserve the reference character's culture-specific costume vocabulary. Production PNG, transparent cutout edges.

新增浏览器验证：三个人物图集加载、说话姿态变化、待机四种姿态、三句介绍顺序、换章节自动介绍、手动聊天中断介绍、关闭提示偏好、390px 与 320px 窄屏、减弱动效的静态姿态。

## 当前第三版：连续分层动画

参考 dsh-pet 的动作起势、循环与收尾思路，独立实现网页 Canvas 分层关节驱动，未使用大肥鱼角色素材或运行代码。参考项目：https://github.com/PC2005-cloud/dsh-pet

三个角色使用分别生成的透明分层图集，头部、躯干、上臂、前臂与下半身独立绘制；表情局部覆盖，肩部与肘部围绕固定连接点连续运动。保留原静态素材作加载失败时的备用。动作是插画分层驱动，不是生成的视频，也不是实时三维模型。

待机轮换呼吸、眨眼、偏头、整理袖口和招手；说话状态的手势与嘴部同步变化，切换状态平滑收尾。点人物或进入章节介绍时招手。上限 30 次绘制/秒，离屏、后台暂停并冻结动作时钟；减弱动效下显示静态人物。

### 当前素材路径

- assets/img/guides/xiange-rig-v3.png
- assets/img/guides/yinling-rig-v3.png
- assets/img/guides/qinglan-rig-v3.png

制作使用内置 image_gen，分别以对应人物的第二版图集作为编辑目标；三张输出均为 1254 × 1254 RGBA，已检查真实透明通道。下列提示词对每个人物分别使用。

### 第三版提示词（原文）

Use case: identity-preserve. Asset type: layered 2.5D puppet rig for a website companion, NOT an animation pose sheet.
Input is the approved six-pose atlas of ONE fictional ethnic-themed character. Preserve THIS character's beautiful face, ethnicity-inspired clothing, hairstyle, ornamentation, color palette and dimensional illustrated rendering.
Create a genuinely transparent PNG, strict FOUR columns by TWO rows, eight isolated COMPONENTS, one per equal cell, no labels, no text, no background, no shadows outside components. Square canvas. Every component centered with empty margins inside its own cell, no crossing boundaries. Camera exactly straight on, consistent frontal projection and lighting. Do not draw complete bodies in the cells.
Cell 0: the complete HEAD only including headdress, hair, braids and short neck; eyes open, mouth closed, friendly smile. No torso.
Cell 1: the upper TORSO only from shoulders to waist, richly complete costume and collar, no arms, no head. Fill all formerly hidden clothing areas so moving the arms will not leave holes.
Cell 2: character's RIGHT UPPER ARM (viewer left), shoulder cap through elbow, sleeve fabric, pointing straight down; round overlapping shoulder and elbow ends for smooth rigging.
Cell 3: matching RIGHT FOREARM and HAND (viewer left), elbow through fingertips, straight down, open relaxed fingers pointing down, sleeve/cuff intact, overlapping elbow top.
Cell 4: character's LEFT UPPER ARM (viewer right), shoulder cap through elbow, same downward alignment.
Cell 5: matching LEFT FOREARM and HAND (viewer right), elbow through fingertips, straight down, open relaxed fingers pointing down.
Cell 6: complete LOWER BODY from waist through skirt/robe, legs and shoes, straight frontal pose, no torso or arms; preserve elaborate skirt, boots and ethnic detail.
Cell 7: EXACTLY the SAME head as cell 0, same scale, position, headdress and hair, but eyes CLOSED and mouth visibly slightly OPEN for facial expression patching. No torso.
The head's ornament must not touch the cell edge. Preserve natural human anatomy. Arms separated into upper and lower segments, not duplicated whole arms. No held books or unrelated props. This sheet will be cut into parts and assembled into one continuous moving character. Maintain clean genuine alpha cutout edges and detailed premium 2.5D illustrated game look.

### 验证与预览

- node tools/guide-motion-test.mjs：动作与中断期间逐帧角度变化、招手回到待机、表情值范围、减弱动效和图集采样边界。
- node tools/companion-test.mjs：实际浏览器中的连续手势、嘴部变化、章节介绍、跨页记忆、手机、后台暂停恢复、file:// 与存储降级。
- shots/guide-continuous-v3.webm：实际网页绘制的三人连续动作录制。
## 嘴部定位修正

嘴部改用同一张原脸上的嘴进行连续局部形变，整块区域不透明覆盖；开合不再通过另一张表情脸的半透明嘴片叠加。三个角色分别扩大并校正嘴部采样范围，覆盖完整嘴角；已放大查看实际说话画面，确认无双嘴和脸部轮廓串入。
