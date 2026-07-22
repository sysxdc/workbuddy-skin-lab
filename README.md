# WorkBuddy Skin Lab

为 WorkBuddy 桌面端快速更换背景、主题色和界面装饰，也可以随时恢复原生外观。

> 本项目是社区工具，不属于 WorkBuddy 或腾讯官方项目。它只在本机临时应用皮肤，不修改 WorkBuddy 安装文件。

## 快速开始

### 环境

- Windows 10/11
- 已安装 WorkBuddy 桌面端
- Node.js 22 或更高版本

### 安装

1. 从 [Releases](https://github.com/sysxdc/workbuddy-skin-lab/releases) 下载 Windows 发布包并解压。
2. 双击 `check-environment.cmd`，确认环境检查通过。
3. 保存 WorkBuddy 中正在进行的任务。
4. 双击 `start-skin.cmd`。
5. 在 WorkBuddy 右上角打开 `🎨` 面板，选择或调整主题。

首次启动可能会自动重启 WorkBuddy，这是正常现象。

## 常用操作

在 `🎨` 面板中可以：

- 切换已安装主题；
- 上传自己的背景图片；
- 调整浅色/深色外观、透明度、模糊和圆角；
- 设置首页标题、副标题和界面文案；
- 在多张背景候选之间切换；
- 保存当前主题作为下次启动默认主题；
- 重置当前主题的临时图片；
- 恢复原生界面。

也可以直接双击 `restore-native.cmd` 恢复原生外观。该操作不会删除主题文件。

## AI 生成主题

如果要使用“输入描述并生成整套主题”的功能：

1. 在 WorkBuddy 中安装本项目发布包内的 Skill。
2. 按 Skill 提示安装并配置 `$nonelinear-image`。
3. 在 WorkBuddy 对话中描述想要的主题风格。
4. 按提示确认图片调用和最终主题。

生成的主题会保存在本机，不会自动提交到本项目。

## 简单配置

### WorkBuddy 路径

通常会自动查找 WorkBuddy。若安装在特殊目录，可在启动时按提示指定路径，或设置 `WORKBUDDY_EXE` 环境变量。

### CDP 端口

默认使用本机端口 `9223`。如果端口被占用，请在启动、查看状态和恢复原生时使用同一个备用端口。

### 用户主题

用户上传或生成的主题默认保存在：

`%LOCALAPPDATA%\\WorkBuddySkinLab\\themes`

这些主题属于当前电脑，不会自动进入项目发布包。

## 发布包

Windows 发布包包含：

- 环境检查入口；
- 一键启动入口；
- 一键恢复原生入口；
- 内置示例主题。

发布包不包含 WorkBuddy 软件本体，也不包含个人主题、API Key 或本机运行数据。

## 隐私与安全

- 不要把 API Key、`.env`、截图或个人主题提交到 GitHub；
- 不要将本机调试端口暴露到公网；
- 只使用拥有合法分发权的背景和装饰素材；
- 生成图片前，请注意图片可能会上传到图片服务商。

## 许可证

[MIT](LICENSE)
