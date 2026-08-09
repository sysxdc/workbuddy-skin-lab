# WorkBuddy 背景主题：五步小白教程

> WorkBuddy 5.3.8 起采用“仅背景模式”。不会替换首页文字、场景图标、卡片、宠物或其它组件，因此 WorkBuddy 更新界面后不再出现旧装饰错位。

## 1. 安装

从 GitHub Release 下载并导入：

```text
WorkBuddy-Skin-Lab-1.3.1-Skill.zip
NoneLinear-Image-0.1.0-Skill.zip
```

然后解压 Windows 包，运行 `环境检查.bat` 和 `开始使用.bat`。需要 Node.js 22+。

## 2. 配置图片服务

按照 [`NONELINEAR_SETUP.md`](../references/NONELINEAR_SETUP.md) 配置 API Key。不要把真实 Key 发到聊天、截图或 GitHub。

## 3. 创建背景

在 WorkBuddy 新建任务，同时启用 `workbuddy-skin-lab` 和 `nonelinear-image`，例如：

```text
做一个安静书房风格的 WorkBuddy 背景，主体放在右侧，左侧和中央保持简洁。
```

提示词生成或参考图编辑会进行三次单图背景调用，并行得到三张候选；直接使用本地图片不调用生图。

## 4. 确认并应用

Skill 会默认使用方案1，保存为 `background-v1` 主题并应用。主题只包含：

- 背景候选
- 主题名称和配色
- 焦点位置与背景安全区

主题不会包含 `homeHeader`、`copySets` 或装饰 `modules`。

## 5. 多次实践

点击 `🎨` 可以切换主题、背景候选、浅深色、背景安全区、任务页背景和回答阅读层。点击“保存当前主题（下次启动）”后，下次启动会自动恢复。

需要暂时关闭时运行 `恢复原生.bat`；重新运行 `开始使用.bat` 即可再次应用。

## 常见问题

### 为什么没有宠物、图标或自定义首页文字？

这些功能依赖 WorkBuddy 内部页面结构，软件更新后容易错位或丢失，已从 1.3.1 的 Skill 和运行时中删除。

### 为什么旧作业不能继续？

旧 `home-scene-v1` 作业包含五张组件图片和三套文案。请新建 `background-v1` 作业，避免重新套用旧模板。

### 图片不清晰

使用 16:9、推荐 2560×1440、最低 1920×1080 的 sRGB 图片。重要主体放在右侧，避免中央出现密集文字和高对比纹理。
