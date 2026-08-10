# 我把 WorkBuddy 做成了一个可以长期陪伴的工作台

> WorkBuddy Skin Lab v1.5.3 · 背景、粒子与 AI 透明 PNG 素材

每天打开 WorkBuddy，面对的往往不是一个冷冰冰的窗口，而是一天里停留时间很长的工作台。

所以我做了 **WorkBuddy Skin Lab**：不去重绘原来的功能，不往界面塞容易失效的装饰组件，只把背景和环境粒子放在一个稳定、可恢复的背景层里。你可以换成自己喜欢的画面，也可以让雪花、樱花、星星或 AI 生成的小素材，在不打扰工作的前提下轻轻动起来。

> 本文使用的演示图不包含聊天记录、账号信息和本机路径。为了保护使用者隐私，本文不引用私人演示视频。

## 先给你看三件我最在意的事

### 1. 好看，但不抢工作内容

背景会避开侧边栏与主要输入区；粒子固定在背景层，不接收点击，不会挡住按钮、输入框和弹窗。你可以让氛围存在，但不必为氛围牺牲可读性。

![极光实验室主题示意](https://raw.githubusercontent.com/sysxdc/workbuddy-skin-lab/main/docs/assets/theme-showcase/aurora-lab.png)

### 2. 不再依赖容易变动的界面结构

以前一些更“花哨”的标题、卡片、宠物和文字模块，会跟着 WorkBuddy 的内部界面变化而错位。现在我把边界收紧：只保留背景和粒子层。这样 WorkBuddy 更新时，至少不会再让你认真保存过的图片和文字忽然消失。

### 3. AI 粒子可以留下来，不是一次性效果

v1.5.3 开始，AI 生成的透明 PNG 粒子会建立为**新的本机派生主题**。三张候选素材、你选中的那张、运动轨迹和面板微调都会一起保存。点击“保存当前主题（下次启动）”后，重启 WorkBuddy 仍然能继续用。

这一次，AI 生成的图不会再被错误塞进“手输符号（文字）”。想用 AI 粒子时，请在 `🎨 → 环境粒子特效` 中选择 **AI 透明 PNG 素材**。

## 你可以怎么玩

内置粒子有：下雨、雷雨、下雪、冒爱心、下星星和手输符号。

AI 透明 PNG 粒子则适合做得更有个人感：樱花花瓣、萤火虫、纸飞机、咖啡蒸汽、像素星尘……AI 只负责生成静态透明 PNG；真正的动效由本地安全配方完成，不能执行任意代码。

你可以在面板里微调：

- 轨迹：飘落、上浮、漂浮、横向掠过；
- 速度与摆动；
- 旋转与缩放起伏；
- 透明度与闪烁；
- 粒子强度和颜色。

雪花会左右飘落，爱心会摇摆上浮，星星会闪烁下落；每颗粒子的起点、延迟和路径都会打散，不会再排成整齐的斜线。

## 两条使用路线，选适合你的那条

| 你想做什么 | 需要什么 |
|---|---|
| 只想换背景、加内置粒子 | Windows 工具包即可 |
| 想让 AI 生成背景或透明 PNG 粒子 | 再安装 WorkBuddy Skin Lab Skill 与 NoneLinear Image Skill |

不想碰 AI 也完全没关系。直接上传自己的背景图，就能享受安全区、阅读层和内置粒子。

## 普通用户：三步开始

### 第一步：下载并完整解压

打开 [v1.5.3 Release](https://github.com/sysxdc/workbuddy-skin-lab/releases/tag/v1.5.3)，下载：

```text
WorkBuddy-Skin-Lab-1.5.3-Windows.zip
```

不要在压缩包里直接运行。完整解压后，确认文件夹中有：

- `环境检查.bat`
- `开始使用.bat`
- `恢复原生.bat`

![解压后的工具目录示例](https://raw.githubusercontent.com/sysxdc/workbuddy-skin-lab/main/docs/assets/wechat-02-extracted-folder.png)

### 第二步：检查环境

双击 `环境检查.bat`。它会检查 Node.js、WorkBuddy 路径和主题文件。看到 `[OK]` 后再继续。

### 第三步：开始使用

先保存 WorkBuddy 中正在编辑的任务，再双击 `开始使用.bat`。WorkBuddy 可能会短暂重启；重新打开后，点击右上角 `🎨`，从换背景和轻量粒子开始就好。

不喜欢时，双击 `恢复原生.bat`，即可回到原来的界面。工具不会修改 WorkBuddy 的安装文件。

## 想试试 AI 粒子？复制这段提示词

先从 v1.5.3 Release 安装：

```text
WorkBuddy-Skin-Lab-1.5.3-Skill.zip
NoneLinear-Image-0.1.0-Skill.zip
```

然后在 WorkBuddy 新任务中同时启用两个 Skill，复制：

```text
@nonelinear-image @workbuddy-skin-lab
为我当前的 WorkBuddy 主题生成 AI 透明 PNG 粒子：淡粉色樱花花瓣，主体居中，透明背景，无文字、无 Logo、无水印；轨迹是随风缓慢飘落，轻微左右摆动，偶尔旋转，不闪烁。生成 3 张候选，选中后保存为可在下次启动继续使用的主题。
```

确认三次图片生成调用后，选一张最喜欢的候选图。最后在 `🎨 → 环境粒子特效` 中选择 **AI 透明 PNG 素材**，再点击 **保存当前主题（下次启动）**。之后重启也能继续使用。

## 我想把这个工具交给愿意慢慢玩的人

WorkBuddy Skin Lab 是一个社区工具，不属于 WorkBuddy 或腾讯官方。它只在本机临时叠加背景和粒子，不上传你的主题，也不需要把个人图片放到 GitHub。

如果你也想把每天打开的工作台，变成更有一点陪伴感的地方：

1. 关注公众号 **大模型评测及优化Nonelinear**；
2. 私信回复：**皮肤**；
3. 获取工具包和最新小白教程。

![公众号：大模型评测及优化Nonelinear](https://raw.githubusercontent.com/sysxdc/workbuddy-skin-lab/main/docs/assets/wechat-public-account-nonlinear.png)

你可以先从一张喜欢的背景开始。等你愿意，再给它加一场雨、一点星光，或者一片只属于自己的 AI 樱花。
