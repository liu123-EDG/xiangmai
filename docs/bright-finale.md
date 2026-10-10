# 弦脉 · 明亮尾声

位置：heritage/index.html#bright-finale，八音总览的最后。

主旨：介绍、传播、传承、保护中国民族音乐文化。四幕分别为了解、分享、学习与保护。使用原生滚动、sticky 场景和独立图片图层；向上滚动可还原。减少动态时直接呈现完整尾声，本地 file:// 可打开。

图像生成模式：内置 image_gen（builtin），原创生成，未使用参考图。透明图层保留真实 alpha。人物为文化主题插画，不作为服饰考据或全部民族的展示。

保存文件：
- D:/dsh/xiangmai/assets/img/finale/sky-v1.png
- D:/dsh/xiangmai/assets/img/finale/clouds-v1.png
- D:/dsh/xiangmai/assets/img/finale/notes-v1.png
- D:/dsh/xiangmai/assets/img/finale/people-v1.png

生成提示词（实际使用）：

## 天空

Create a premium original panoramic illustration asset for an optimistic Chinese ethnic music cultural website finale. Wide landscape 1536x1024. ONLY a luminous azure blue sky fading softly to pale warm ivory at horizon, delicate white cumulus clouds around the far left and right edges, subtle hand-painted gouache grain, graceful sunlight, airy and refined contemporary editorial illustration. The middle 60 percent is quiet pale sky empty for dark blue website text. Very bottom includes a slim soft green grassy hill sweeping horizontally, less than 12 percent of height. No people, no musical notes, no objects, no text, no lettering, no watermark. Beautiful welcoming sunny peaceful mood. Flat composition suitable as independent full-screen background behind separately animated foreground art.

## 白云

Standalone transparent alpha illustration asset for a sunny cultural website, matching refined gouache painted blue sky artwork. Panoramic 1536x1024. Two airy softly shaded brilliant white cumulus cloud banks, one along the left edge and one along right edge with a few tiny wisps in the upper corners. Vast clear transparent gap through the central 60 percent. Clouds occupy outer 20 percent on each side, thin wind-swept horizontal shapes, warm cream sunlit highlights, subtle pale blue shadows, delicate painterly brush texture, graceful contemporary editorial art. No sky/background, no ground, no people, no text, no borders, no watermark. All empty space must be true transparency. Separate cloud layer for parallax animation.

## 音符

Transparent alpha isolated decorative asset for a joyful Chinese ethnic music website. Wide panoramic 1536x1024. A light sweeping arc of twelve hand-painted musical notes and gentle flowing ribbon-like strokes, assorted eighth notes and paired notes, painted in warm gold coral teal and indigo, refined gouache texture, sunlit soft 2.5D volume. Arrange notes in a loose airy shallow arch across top and outer sides, with the central lower half entirely empty transparent for text and people to be composited separately. Elegant dancing upward movement, notes small with ample gaps, tasteful editorial storybook illustration, no humans, no instruments, no scene, no sky, no solid backdrop, no text, no watermark. True transparent background.

## 手拉手人物

A standalone transparent-background foreground illustration for a hopeful website about Chinese ethnic music. Wide panoramic composition, 1536x1024. Nine full-body people standing in ONE continuous gently curved horizontal row, holding hands with their immediate neighbors, all clearly physically linked, joyful relaxed smiles, welcoming respectful community. Clothing inspired respectfully by varied Chinese ethnic festive traditions: Uyghur embroidered doppa and long patterned dress, Zhuang indigo embroidery, Mongolian blue deel, Dong indigo pleated dress and modest silver accessories, Manchu long elegant robe, Miao silver ornament and colorful embroidered skirt, Yi red yellow black geometric embroidery, Dai light fitted blouse and ankle-length silk skirt, Tibetan layered robe and woven sash. Men and women, varied adult ages, warm natural facial features, natural proportions with slight storybook stylization, accurately formed joined hands, no caricatures. Each is individually beautiful, colors turquoise blue coral ochre indigo white, refined painted gouache with soft shaded 2.5D volume and visible delicate brush texture, sunlight from upper left. Whole bodies and shoes fully visible, same horizontal foot baseline, crowd occupies width 94 percent, height 65 percent, minimal transparent margins, no floor, no sky, no scenery, no instruments, no text, no labels, no watermark. Transparent alpha background, not white backdrop. Hands connect from far left to far right with no missing people or double limbs. Museum quality editorial art.

验证：node tools/bright-finale-test.mjs；node tools/hub-test.mjs；node tools/verify.mjs；node tools/link-check.mjs。浏览器检查四幕、倒序滚动、透明图片加载、1440/1366/390/320 布局、减少动态与本地文件模式。

入口修正：页面初始化会动态改变前方内容高度，直接 fragment 打开曾落在章节导航区。现于初始化与载入完成后重新对齐锚点；检测到用户操作后不抢夺滚动。新增显眼入口，脚本和样式带版本号避免旧缓存。浏览器验证直接 fragment 和实际点击入口。
