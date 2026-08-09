# WorkBuddy Skin Lab

为 WorkBuddy 桌面端更换背景，并提供背景安全区、任务页展示方式和回答阅读层等显示保护。当前版本为 **v1.3.1，仅背景模式**。

> 本项目是社区工具，不属于 WorkBuddy 或腾讯官方项目。它只通过本机调试连接临时应用背景，不修改 WorkBuddy 安装文件。

## 为什么改成仅背景模式

WorkBuddy 更新后，首页标题、选项、对话框、卡片和宠物等内部组件的结构可能变化。继续按旧选择器替换这些组件，容易出现错位、文字丢失或新版界面无法渲染。

从 v1.3.1 开始，本项目不再替换 WorkBuddy 的文字、图标、卡片、宠物或其它业务组件；旧主题中的这些字段也会被忽略。背景功能仍可反复使用，WorkBuddy 原生界面内容由软件自己渲染，后续更新时更稳定。

## 快速开始

完整图文步骤请看：

- [小白安装使用教程（Markdown）](docs/BEGINNER_INSTALL.md)
- [小白安装使用教程（浏览器版）](docs/BEGINNER_INSTALL.html)

### 运行条件

- Windows 10/11；
- 已安装 WorkBuddy 桌面端；
- Node.js 22 或更高版本。

已验证环境：WorkBuddy 5.3.8。普通换背景不需要 API Key、Python、Pillow 或 Codex。

### 安装与启动

1. 从 [v1.3.1 Release](https://github.com/sysxdc/workbuddy-skin-lab/releases/tag/v1.3.1) 下载 `WorkBuddy-Skin-Lab-1.3.1-Windows.zip`。
2. 将 ZIP 完整解压到普通文件夹，不要直接在压缩包内运行。
3. 双击 `环境检查.bat`，确认环境检查通过。
4. 保存 WorkBuddy 中正在进行的任务，然后双击 `开始使用.bat`。
5. WorkBuddy 重新打开后，点击右上角 `🎨` 调整背景。

首次启动可能会自动重启 WorkBuddy，这是正常现象。英文入口 `check-environment.cmd`、`start-skin.cmd` 和 `restore-native.cmd` 与中文入口作用相同。

### WorkBuddy 安装在 D 盘

工具会自动查找常见位置，包括 `D:\WorkBuddy\WorkBuddy.exe`。如果环境检查已经显示正确路径，无需额外设置。

若安装在其它自定义目录，可设置 `WORKBUDDY_EXE` 环境变量为完整的 `WorkBuddy.exe` 路径，再运行三个入口；不要移动或修改 WorkBuddy 的安装文件。

## `🎨` 面板能做什么

- 切换已安装主题和背景候选；
- 上传自己的 PNG、JPEG、WebP、GIF 或 SVG 背景；
- 选择自动、浅色或深色显示；
- 设置背景安全区，减少图片对侧边栏和主要操作区的干扰；
- 设置任务页背景为柔和保留、仅顶部展示或关闭；
- 打开或关闭回答阅读层；
- 保存当前主题，供下次启动恢复；
- 重置当前主题的本机覆盖，或恢复 WorkBuddy 原生界面。

本项目不会再提供宠物、开关动效、首页自定义文字、场景图标或装饰组件功能。

## 使用自己的背景

在 `🎨 → 主题与背景 → 指定自己的图片` 中选择图片。建议：

- 推荐 2560×1440，最低 1920×1080，16:9，sRGB；
- 优先使用 WebP 或 JPEG，建议小于 5 MB，硬限制 20 MB；
- 重要主体放在右侧，中央和左侧尽量简洁；
- 四周保留约 10% 安全边距，避免窗口裁切主体；
- 避免把文字、强高光或密集纹理放在回答区后方。

上传的普通图片会在本机缩放并转换；GIF/SVG 会原样保存且不能超过 3 MB。图片只保存在当前电脑的 WorkBuddy 本地存储中。

## 恢复原样

双击 `恢复原生.bat`，或在 `🎨 → 恢复与重置` 中选择“恢复原生界面”。这会移除当前注入的背景，但不会删除主题文件；以后再次运行 `开始使用.bat` 仍可重新应用。

## AI 生成背景（可选）

AI 生成功能不是普通安装的必需项。需要时：

1. 从 [v1.3.1 Release](https://github.com/sysxdc/workbuddy-skin-lab/releases/tag/v1.3.1) 下载并安装 `WorkBuddy-Skin-Lab-1.3.1-Skill.zip`；
2. 安装同一 Release 中的 `NoneLinear-Image-0.1.0-Skill.zip` 并配置图片服务；
3. 在 WorkBuddy 新任务中同时启用两个 Skill，描述想要的背景；
4. 新版 Skill 只会创建 `background-v1` 背景主题，不会套用旧版组件模板。

详细步骤见 [AI 背景主题教程](docs/BEGINNER_WORKBUDDY_THEME.md)。生成结果默认保存在本机，不会自动提交到 GitHub。

## 常见问题

### 双击批处理没有反应

先把 ZIP 完整解压，再右键入口选择“以管理员身份运行”仅用于排查权限问题。仍失败时，请在文件夹地址栏输入 `powershell`，然后运行：

```powershell
.\环境检查.bat
```

保留窗口中的 `[FAIL]` 或错误信息，便于定位原因。

### 右上角没有 `🎨`

保存任务并完全退出 WorkBuddy，再运行 `环境检查.bat` 和 `开始使用.bat`。确认 Node.js 版本合格、WorkBuddy 路径正确，并且本机端口 `9223` 未被其它程序占用。

### 旧主题的文字或宠物不见了

这是 v1.3.1 的预期兼容行为。旧组件依赖 WorkBuddy 内部结构，无法保证跨版本稳定，因此运行时会主动忽略。背景候选仍可继续使用；需要 AI 重新生成时，请新建 `background-v1` 作业。

## 本机数据与隐私

用户主题默认保存在：

```text
%LOCALAPPDATA%\WorkBuddySkinLab\themes
```

- 不要把 API Key、`.env`、私人截图或个人主题提交到 GitHub；
- 不要将本机调试端口暴露到公网；
- 只使用拥有合法分发权的背景素材；
- AI 生成图片前，请确认图片服务商的隐私规则。

## 发布包内容

Windows 发布包包含环境检查、一键启动、一键恢复和内置背景主题，不包含 WorkBuddy 软件本体、个人主题、API Key 或本机运行数据。

## 许可证

[MIT](LICENSE)
