# 两章虚拟乐师演示

第二章萨它尔与第四章达普，均使用弦歌的既有分层人物素材，运行时绘制乐器并计算肩肘两关节动作。未生成或替换新人物图片。

入口：两章开头均有“看弦歌演奏/敲鼓”，目标 #instrument-stage。
功能：开始演示、停止、我来试；中文音频配字幕，讲解长度控制阶段切换；萨它尔滑块与原有拉弓互动同步；达普鼓面/边圈按钮调用现有音色，原节奏台的敲击也同步到人物。

姿势与形制参考：喀什地区行政公署《中国维吾尔十二木卡姆乐器简介》
https://www.kashi.gov.cn/ksdqxzgs/c106706/202011/5acebe1c503b44cf9518e0bf1a2e23b7.shtml

这是简化动作示意，音色由现有程序合成，页面明确标注。
中文讲解：Windows System.Speech / Microsoft Huihui Desktop 合成 PCM WAV，六段，离线可播放。

离开舞台、后台、离开页面、停止及声音开关均停止演示与讲解；讲解时第四章背景主题曲降低音量，结束后恢复；减少动态设置保持静态持乐器图，可通过按钮试奏。

验证：tools/instrument-performer-test.mjs、原有 companion-test.mjs、satar-bow-test.mjs、rhythm-lab-test.mjs、verify.mjs 与 link-check.mjs。
