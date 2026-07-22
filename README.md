# WorkBuddy Skin Lab

给 WorkBuddy 桌面端换背景、装饰交互界面，并且随时恢复原生外观。

> 非 WorkBuddy / 腾讯官方项目。本项目不修改 `WorkBuddy.exe`、`app.asar`、安装目录
> 或代码签名，只通过绑定到 `127.0.0.1` 的 Chrome DevTools Protocol（CDP）临时
> 注入 CSS 和页面组件。

> 隐私提示：不要提交 API Key、`.env`、WorkBuddy 截图、`.workbuddy`、`.agent-workspace`、
> `generation-jobs` 或 `%LOCALAPPDATA%\WorkBuddySkinLab` 下的个人主题。仓库 `.gitignore` 已默认排除本地运行数据；
> 公开自定义素材前仍需自行确认版权和画面隐私。

## 功能

- 自定义背景：PNG、JPEG、WebP、GIF、SVG；
- 界面装饰：主题色、毛玻璃、透明度和圆角；
- 侧栏保护：背景从侧栏右侧开始呈现，并通过雾化带柔和连接主内容区；
- 交互保护：首页选项、输入区、菜单和弹窗使用独立磨砂卡片，不直接叠在图片上；
- 页面控制面板：右上角 `🎨` 可切换已保存主题、即时换背景并调整显示效果；
- 多主题管理：新主题不会覆盖旧主题，可在控制面板中随时切换；
- 可逆操作：一键暂停皮肤，完整恢复原生界面；
- Windows 发布包：环境检查、开始使用、恢复原生三个双击入口。

## 普通用户：三步开始

如果你要使用“输入提示词 → AI 生成背景和五个固定模块 → 直接在 WorkBuddy 预览”的完整流程，
请直接阅读：[WorkBuddy AI 主题生成：完整小白教程](docs/BEGINNER_WORKBUDDY_THEME.md)。
最终用户不需要 Codex：在 WorkBuddy 的“技能 → 添加技能 → 上传技能”中导入
`WorkBuddy-Skin-Lab-1.2.0-Skill.zip` 与 `NoneLinear-Image-0.1.0-Skill.zip`，之后所有需求、
计费确认、预览修改和恢复都在 WorkBuddy 对话中完成。首次启用本机 CDP 仍需从外部双击一次
`开始使用.bat`，因为正在运行的 WorkBuddy Skill 无法在关闭宿主后继续同一轮对话。

### 1. 准备环境

- Windows 10/11；
- 已安装 WorkBuddy 桌面端；
- [Node.js](https://nodejs.org/) 22 或更高版本。

下载并解压发布包后，先双击兼容性更好的纯英文入口：

```text
check-environment.cmd
```

当检查结果中的 `appFound` 和 `nodeSupported` 都为 `true`，即可继续。

### 2. 应用皮肤

保存 WorkBuddy 中正在进行的任务，然后双击：

```text
start-skin.cmd
```

首次应用时，脚本会正常关闭 WorkBuddy，再以仅监听本机回环地址的 CDP 模式重启。
成功后，WorkBuddy 右上角会出现 `🎨`。之后再次双击时会读取
`%LOCALAPPDATA%\WorkBuddySkinLab\settings.json`，自动恢复最后一次成功应用的主题；从旧版首次升级且还没有设置文件时，
会先选择最近更新、校验有效的用户主题，只有没有用户主题时才使用内置示例。

### 3. 更换背景

点击 `🎨` 打开控制面板：

| 操作 | 效果 |
|---|---|
| 切换主题 | 在所有已校验的内置主题和用户主题之间立即切换；不会删除旧背景或素材 |
| 首页主标题/副标题 | 将原生“WorkBuddy / 你的职场超能力”替换为当前主题纯文字，按主题独立保存 |
| 换背景 | 上传自己的背景图 |
| 界面外观 | 自动匹配图片，或强制浅色/深色；同步 WorkBuddy 原生主题标记 |
| 背景安全区 | 选择左侧、右侧、中央或不额外遮罩；设置按主题保存 |
| 任务页背景 | 柔和保留、仅顶部展示或在任务页关闭背景 |
| 回答阅读层 | 显示时为回答区增加磨砂底板；关闭时让回答直接叠在背景上 |
| 重置本主题 | 删除当前主题的临时上传项 |
| 恢复原生界面 | 移除背景和控制面板 |

控制面板切换会保存当前页面的活动主题；显式 `apply --theme <id>` 还会把选择写入磁盘，供下次启动恢复。页面控制面板临时上传的背景保存在 WorkBuddy 渲染页的 `localStorage` 中。AI 生成并接受的主题则永久保存在
`%LOCALAPPDATA%\WorkBuddySkinLab\themes\<themeId>\`，包括 `theme.json`、背景和五个独立模块素材；
成功 `apply --theme <id>` 后还会把该 ID 写入磁盘设置，重新执行“开始使用”会自动恢复。

更换背景时会用 48px 采样图分析平均亮度和主色，并生成匹配的面板底色、正文色与强调色。
“自动匹配图片”使用这组结果；如果图片明暗分区很强，可以手动选择浅色或深色。手动
模式会同时更新皮肤色板和 WorkBuddy 的 `vscode-light/cb-light` 或对应深色标记，避免
输入框、侧栏和正文分别使用不同色系。恢复原生界面时会还原注入前的主题属性。

### 背景与侧栏的显示方式

皮肤会读取 WorkBuddy 左侧栏的实际宽度（通常约 264px），让该区域保持与当前外观
一致的玻璃底板。背景图在侧栏下方会被完全遮住，侧栏右缘再通过约 140–280px 的
轻度虚化带连接到主内容区，因此不会出现生硬的竖直分割线，也不会让
大半张背景失去细节。主要界面的实时模糊上限为 4px。

首页会完整展示背景；进入对话后会自动切换为“任务页”。默认显示“回答阅读层”，适合
纹理复杂的图片；如果希望回答直接叠在背景上，可在 `🎨` 面板关闭它。任务页背景还可
改成“仅顶部展示”或“任务页关闭”。背景不再使用 `background-attachment: fixed`，
滚动和流式回答时的重绘开销更低；主要界面的实时毛玻璃模糊会被限制在 4px 以内。

首页输入框只使用一个连续底板，不再给内部编辑区重复着色。场景标签使用共享轨道和
明确的激活态，快捷选项使用较轻的独立按钮；菜单和弹窗继续使用高可读性卡片。这样
背景人物和景色仍可展示，同时输入区不会出现内外两层互相冲突的色块。

打开输入框左下角 `+` 时，运行时会识别原生 menu/dialog/listbox，临时解除其有限祖先容器的
`overflow` 裁剪，给弹窗提供完全不透明的保护底色，并隐藏相交装饰。弹窗关闭或暂停皮肤时，
这些临时样式会逐项恢复，不改变原生点击、键盘和焦点行为。
保护状态会一直保持到原生菜单真正关闭，定时自检不会在“解除裁剪”和“恢复裁剪”之间反复切换。

制作背景时建议把人物放在右半区，特别是画面右侧 30%–45%；左侧不要安排必须完整
显示的主体，因为侧栏和过渡雾会有意遮住该区域。

## 恢复原生界面

双击：

```text
restore-native.cmd
```

该操作不修改或删除 WorkBuddy 文件，只移除当前渲染页里的注入内容。

## 开发者：命令行使用

在项目根目录打开 PowerShell：

```powershell
# 环境诊断
node .\src\cli.mjs doctor

# 查看主题
node .\src\cli.mjs list

# 校验所有主题
node .\src\cli.mjs validate

# 应用内置主题
.\scripts\apply.ps1 -Theme aurora-lab

# 查询当前注入状态
node .\src\cli.mjs status

# 恢复原生界面
.\scripts\pause.ps1
```

指定 WorkBuddy 路径或 CDP 端口：

```powershell
.\scripts\apply.ps1 `
  -WorkBuddyExe 'D:\WorkBuddy\WorkBuddy.exe' `
  -Theme aurora-lab `
  -Port 9223
```

路径探测顺序包括：

1. `-WorkBuddyExe` 参数；
2. `WORKBUDDY_EXE` 环境变量；
3. `D:\WorkBuddy\WorkBuddy.exe`；
4. Windows 常见安装目录；
5. Windows 卸载注册表中的安装位置。

## 创建自己的用户主题

准备一张背景图片：

```powershell
node .\src\cli.mjs create `
  --background 'D:\Pictures\my-background.jpg' `
  --name '我的主题'
```

命令会输出主题 ID，例如：

```text
custom-theme-a1b2c3d4
```

应用该主题：

```powershell
.\scripts\apply.ps1 -Theme custom-theme-a1b2c3d4
```

用户主题保存在：

```text
%LOCALAPPDATA%\WorkBuddySkinLab\themes
```

这个目录中的内容属于当前电脑，不会自动进入项目发布包。

## 创建可版本管理、可分发的主题

复制 `themes/aurora-lab`，例如：

```text
themes/
└─ my-night/
   ├─ theme.json
   └─ background.webp
```

修改 `theme.json`：

```json
{
  "schemaVersion": 1,
  "id": "my-night",
  "name": "我的夜色",
  "background": "background.webp",
  "colors": {
    "accent": "#7C5CFC",
    "secondary": "#41D9C5",
    "surface": "#101525",
    "text": "#F4F7FF"
  },
  "ui": {
    "opacity": 0.82,
    "blur": 18,
    "radius": 16,
    "appearance": "auto"
  },
  "art": {
    "focusX": 0.72,
    "focusY": 0.45,
    "safeArea": "left",
    "taskMode": "ambient"
  }
}
```

### 主题字段

| 字段 | 作用 | 有效值 |
|---|---|---|
| `schemaVersion` | 主题格式版本 | 当前固定为 `1` |
| `id` | 主题唯一 ID | 小写字母、数字、连字符 |
| `name` | 显示名称 | 1–60 个字符 |
| `background` | 背景文件相对路径 | PNG/JPEG/WebP/GIF/SVG，最大 20 MB |
| `colors.accent` | 按钮、边框、选中状态 | 六位十六进制颜色 |
| `colors.secondary` | 辅助装饰色 | 六位十六进制颜色 |
| `colors.surface` | 面板底色 | 六位十六进制颜色 |
| `colors.text` | 主要文字色 | 六位十六进制颜色 |
| `ui.opacity` | 玻璃面板不透明度 | 0.35–1 |
| `ui.blur` | 毛玻璃模糊半径 | 0–40 px |
| `ui.radius` | 控件圆角 | 0–32 px |
| `ui.appearance` | 深浅外观；自动模式按主题或上传图片判断 | `auto` / `light` / `dark` |
| `art.focusX` | 背景主体水平焦点；0 为最左，1 为最右 | 0–1，默认 0.5 |
| `art.focusY` | 背景主体垂直焦点；0 为顶部，1 为底部 | 0–1，默认 0.5 |
| `art.safeArea` | 额外保护的阅读区域 | `auto` / `left` / `right` / `center` / `none` |
| `art.taskMode` | 对话任务页的背景强度 | `auto` / `ambient` / `banner` / `off` |
| `homeHeader.title` | 首页原生主标题 | 可选；1–24 个字符纯文本 |
| `homeHeader.subtitle` | 首页原生副标题 | 与 title 同时提供；1–36 个字符纯文本 |
| `modules` | 锚点模块数组；省略时为 `[]` | 结构化字段，不接受 CSS/JS 字符串 |
| `modules[].id` | 主题内唯一模块 ID，也是素材文件名 | 小写字母、数字、连字符 |
| `modules[].slot` | 固定组件模板 | `sidebar-note` / `home-hero` / `home-card` / `scene-icon` / `composer-float` |
| `modules[].order` | 重复槽位中的固定位置 | home-card 为 0–2，scene-icon 为 0–3；其它为 0 |
| `modules[].anchor` | 模板锁定的白名单锚点 | 必须与 slot 定义一致 |
| `modules[].kind` | 模板锁定的模块类型 | 由 slot 决定，不能自由修改 |
| `modules[].asset` | 独立模块素材 | 必须为 `assets/<moduleId>.<ext>`，1 B–20 MB |
| `modules[].box` | 模板固定的 `{x,y,w,h}` | 必须等于 slot 注册值，生成内容不能自由定位 |
| `modules[].text` | 模板允许的纯文字 | 不接受 HTML；字段与长度由 slot 限制 |
| `modules[].state` | 显示状态，默认 `default` | `default` / `hover` / `active` |
| `modules[].action` | 经二次确认的 B 档点击转发 | 仅 floating；`{ "forwardTo": "<另一个锚点>" }` |

修改后必须校验：

```powershell
node .\src\cli.mjs validate
```

主题素材必须位于自己的主题目录内。路径越界、软链接越界、空文件和超过 20 MB 的
图片会被拒绝。

## 装饰更多 WorkBuddy UI

项目核心样式仍集中在 [`src/skin-css.mjs`](src/skin-css.mjs)，不接受生成内容直接改写。
自然语言生成的装饰使用 `theme.json` 的结构化 `modules`，运行前必须先探测当前页面：

```powershell
node .\src\cli.mjs probe-anchors --port 9223
```

探测结果是唯一选择依据。白名单及选择器只在 [`src/anchors.mjs`](src/anchors.mjs)
显式维护：`sidebar`、`topbar`、`detail-panel`、`home-composer`、`home-stage`、`quick-actions`、
`scene-tabs`、`conversation-list`、`chat-composer`、`dialog`、`home-header-title`、
`home-header-subtitle`。当前页面不存在的锚点不能
用于生成；禁止传入自由选择器或按旧版本记忆猜测。

模块不是任意图片覆盖层。模板由 [`src/module-slots.mjs`](src/module-slots.mjs) 固定维护：

| slot | 固定用途 | 可自定义文字 | 可添加数量 |
|---|---|---|---|
| `sidebar-note` | 左上角陪伴/提示模块 | `title`、`subtitle` | 1 |
| `home-hero` | 首页欢迎横幅 | `eyebrow`、`title`、`subtitle`、`badge` | 1 |
| `home-card` | 覆盖并装饰现有首页快捷按钮 | `title`、`subtitle`（紧凑模式只显示标题） | 3，按原生按钮 order 排列 |
| `scene-icon` | 覆盖并装饰上方原生场景标签 | `title` | 4，按原生标签 order 排列 |
| `composer-float` | 输入区旁悬浮装饰 | `label` 仅用于可访问名称 | 1 |

所有文字都通过 `textContent` 插入，不能带 HTML。首页原生主副标题使用 `homeHeader`，模块文字使用
`modules[].text`；两者都可以在右上角 `🎨` 面板中即时修改，覆盖数据按主题隔离。
DOM 层级、字体规则、间距、圆角、响应式位置和安全 box 由模板固定，因此生成模型只能提供文字与图片，不能破坏布局。
每个槽位还定义最小锚点尺寸；窗口过窄或区域高度不足时对应模块会自动隐藏，尺寸恢复后
自动出现，避免压缩文字或遮挡原生控件。

模板采用“原生融合”挂载：`sidebar-note` 与 `home-hero` 进入对应原生容器的正常布局；
`home-card` / `scene-icon` 精确覆盖现有原生子按钮且自身不接收指针事件，所以不会新增一排
占位卡片，点击仍由下方原生按钮处理；`composer-float` 只占固定安全角落。模块不会挂到
`body` 上形成全屏固定浮层。

当前 `aurora-lab` 示例不再启用 `sidebar-note` 和 `home-card`：侧栏保持原生高度，底部个人信息可见；
首页也不会重复显示第二排快捷功能。示例只对上方三个 `scene-tabs` 标签换图和换文字。

内置 `aurora-lab` 是可运行示例，节选如下：

```json
{
  "homeHeader": {
    "title": "猫咪工作台",
    "subtitle": "和猫咪一起，轻松完成今天"
  },
  "modules": [
    {
      "id": "home-welcome",
      "slot": "home-hero",
      "order": 0,
      "anchor": "scene-tabs",
      "kind": "decorate",
      "asset": "assets/home-welcome.svg",
      "box": { "x": 0, "y": 0, "w": 1, "h": 1 },
      "text": {
        "eyebrow": "CAT LOUNGE · WORKBUDDY",
        "title": "和猫咪一起，轻松完成今天",
        "subtitle": "选择一个方向，原生工作流会继续为你服务。",
        "badge": "专注中"
      }
    },
    {
      "id": "scene-daily",
      "slot": "scene-icon",
      "order": 0,
      "anchor": "scene-tabs",
      "kind": "icon-swap",
      "asset": "assets/scene-daily.svg",
      "box": { "x": 0, "y": 0, "w": 1, "h": 1 },
      "text": { "title": "日常办公" }
    },
    {
      "id": "composer-companion",
      "slot": "composer-float",
      "order": 0,
      "anchor": "home-composer",
      "kind": "floating",
      "asset": "assets/composer-companion.svg",
      "box": { "x": 0.86, "y": 0.01, "w": 0.1, "h": 0.22 },
      "text": { "label": "猫爪陪伴装饰" }
    }
  ]
}
```

目录布局：

```text
themes/aurora-lab/
├─ theme.json
├─ background.svg
└─ assets/
   ├─ home-welcome.svg
   ├─ scene-daily.svg
   ├─ scene-code.svg
   ├─ scene-design.svg
   └─ composer-companion.svg
```

模块素材逐个通过与背景相同的相对路径、扩展名、realpath、文件类型和 1 B–20 MB 校验。
建议一次生成不超过 5 个模块、合计不超过 20 MB；硬上限为 100 MB，超出软预算时
`validate` 会提示分批。默认素材不写入 localStorage；页面内临时换图使用
`workbuddy-skin-lab:v1:module:<themeId>:<moduleId>` 独立 key，可在 `🎨` 面板逐模块重置。

按钮功能只有两档：

- A 档（默认）：纯装饰，不绑定事件，模块不接收指针操作。
- B 档：仅限 floating，并且必须在风险说明后二次确认；click 只能转发给同次探测中
  `present: true`、`nativeClickable: true` 的另一个白名单原生锚点。不能新增网络、IPC、
  剪贴板、聊天内容、计费、权限或其他业务逻辑。

`pause` 会执行同一个 `state.cleanup()`，移除模块节点、模块事件、dock 和样式；再次
`apply` 可重复恢复。完整验收见 [`docs/PRACTICE.md`](docs/PRACTICE.md)。

### 用提示词半自动生成整套固定模板

新增流程会把当前范例作为唯一布局模板：一张背景、一个欢迎横幅装饰、三个保留“办公 / 开发 / 创意”
语义的场景图标，以及一个输入区装饰。AI只能生成图片、配色与有限长度的纯文字，不能改变槽位、box、
选择器、action 或 WorkBuddy 原生功能。这样可以在不同窗口尺寸下继续复用项目的响应式隐藏、点击穿透和
统一清理机制。

所有图片请求由 WorkBuddy 中已安装并启用的 `$nonelinear-image` 0.1.0 执行，固定使用 `gpt-image-2`、`quality=low`、
`response_format=url`。本项目不使用 WorkBuddy 内置图片生成工具、`nl`、`curl` 或临时 API 请求。配置 API key、
Python/Pillow 和安装依赖 Skill 的步骤见 [`references/NONELINEAR_SETUP.md`](references/NONELINEAR_SETUP.md)；
逐阶段命令、授权门禁及 `generation-spec.json` 示例见
[`references/GENERATION_WORKFLOW.md`](references/GENERATION_WORKFLOW.md)。

固定规格：

| 素材 | API 请求 | 最终文件 |
|---|---|---|
| 背景 | 2048×1152 | 2048×1152 JPEG，建议≤12 MB |
| 欢迎横幅装饰 | 1024×1024 | 透明 PNG，≤4 MB |
| 三个场景图标 | 各 1024×1024 | 各 512×512 透明 PNG，建议≤1 MB |
| 输入区装饰 | 1024×1024 | 512×512 透明 PNG，≤2 MB |

图片提示词必须禁止生成文字、UI 框架、WorkBuddy 标志和水印。透明素材先生成纯色键背景，再由本地
标准化器去背；所有可见文字仍由结构化 `textContent` 渲染。五个模块继续服从 20 MB 软预算和
100 MB 硬上限，并逐个经过 `assetPath()`、`verifiedAsset()` 与 `loadTheme()`。

半自动流程有两次用户确认：初始请求只授权一次背景调用；背景满意后，用户再一次确认五次派生素材调用。
失败不会自动重试。改文字不产生生图请求，重做背景或单个图标都必须重新明确授权对应次数。本地参考图
上传前还会单独提示：“该图片将上传到 NoneLinear 服务器并获得公开 HTTPS URL。”首版只支持一张
1 B–20 MB 的 PNG、JPEG 或 WebP；工具不会承诺服务器端自动删除。

背景和五张候选素材可以全程在 WorkBuddy 任务页准备，不需要反复返回 Home。全部素材成为 `media-ready`
后，用户只在最终阶段进入一次 Home，并将输入区左下角 `+` 菜单打开约3秒后关闭；`verify-home` 现场探测真实锚点后才
构建 modules，并核对请求/实际主题 ID、首页原生主副标题、5个可见模块、文字、A档点击穿透、原生弹窗保护以及
`pause → 无残留 → 再次 apply`。任务页截图或空模块不能被接受。原生菜单打开时拥有最高交互层级，
相交装饰临时隐藏，关闭后自动恢复。

多轮对话或 WorkBuddy 任务中断后，Skill 首先执行 `theme-generation-job.mjs resume`。它会在专用作业目录中
找到最近未完成作业，返回已完成素材数量、每个角色的生成/标准化状态以及唯一 `nextAction`。无需用户反复发送
“继续”；除上传、计费授权、背景确认、Home 验收和最终接受外，Skill 应在同一轮连续执行到下一个确认点。

作业记录位于 `%LOCALAPPDATA%\WorkBuddySkinLab\generation-jobs\<jobId>`，只保存提示词、固定规格、
调用状态和脱敏 request ID。不会保存 API key、Authorization、大 base64、自由 CSS/JavaScript/
选择器/action 或完整 API 响应。NoneLinear 脚本若出现空输出或路径映射异常，会停在
`outcome_unknown`，不会自动重试或篡改授权。取消时先恢复原生界面，再把预览主题移到可恢复目录。

## 工作原理

```text
PowerShell 定位 WorkBuddy.exe
        ↓
以 --remote-debugging-address=127.0.0.1 启动
        ↓
Node.js 读取 http://127.0.0.1:9223/json/list
        ↓
只选择 URL 含 renderer/index.html 的页面
        ↓
通过 CDP Runtime.evaluate 注入 CSS 和控制面板
        ↓
暂停时执行 cleanup，恢复原生 DOM 和样式
```

CDP 方案不会修改安装包。完整退出 WorkBuddy 后页面注入会消失，但主题文件和最后活动主题 ID 仍保留；
再次运行“开始使用”或不带 `-Theme` 的 `apply.ps1` 会自动应用最后主题。

## 打包给别人使用

执行：

```powershell
npm run package:windows
```

脚本会自动执行：

1. 主题清单校验；
2. JavaScript 语法检查；
3. 自动测试；
4. 发布目录组装；
5. ZIP 压缩。

输出文件：

```text
release\WorkBuddy-Skin-Lab-1.0.0-Windows.zip
```

发布包包含：

- `check-environment.cmd`；
- `start-skin.cmd`；
- `restore-native.cmd`；
- 源代码、文档和自动测试；
- `themes` 内具有分发权的主题素材。

发布包不会包含：

- WorkBuddy 软件本体；
- `.git`；
- `%LOCALAPPDATA%\WorkBuddySkinLab` 中的私人主题；
- 仅通过 `🎨` 面板上传的私人图片。

要发布自己的主题，应先将主题复制到项目的 `themes` 目录，确认素材许可证允许分发，
运行 `validate`，再重新打包。

## 常见问题

### 找不到 WorkBuddy

明确指定路径：

```powershell
.\scripts\apply.ps1 -WorkBuddyExe 'D:\WorkBuddy\WorkBuddy.exe'
```

也可以设置当前 PowerShell 会话的环境变量：

```powershell
$env:WORKBUDDY_EXE = 'D:\WorkBuddy\WorkBuddy.exe'
```

### `🎨` 可见但无法点击

通常是旧的 WorkBuddy 渲染进程或 CDP 已失联。保存当前任务后重新执行：

```powershell
.\scripts\apply.ps1 -Theme aurora-lab
```

控制面板已明确设置 `-webkit-app-region: no-drag` 和 `pointer-events: auto`，避免按钮
被 Electron 标题栏拖拽区域吞掉。

### 皮肤在重启后消失

这是临时 CDP 注入的正常行为，再次双击“开始使用”即可。

### 端口被占用

更换端口，并确保后续命令使用同一个值：

```powershell
.\scripts\apply.ps1 -Port 9333
node .\src\cli.mjs status --port 9333
.\scripts\pause.ps1 -Port 9333
```

### 出现 `WebSocket is not defined`

Node.js 版本过旧。运行 `node --version`，升级到 Node.js 22 或更高版本。

### 背景被灰色面板遮住

WorkBuddy 的 DOM 可能已经更新。检查 `.teams-container` 和 `[data-view-id]` 是否仍然
存在，再调整 [`src/skin-css.mjs`](src/skin-css.mjs) 中的透明与玻璃覆盖规则。

### 清除页面内上传的图片

在 `🎨` 面板中点击“重置本主题”。如果需要完全清空，可删除 WorkBuddy 渲染页
`localStorage` 中的 `workbuddy-skin-lab:v1` 以及以
`workbuddy-skin-lab:v1:module:` 开头的逐模块覆盖项。

## 开发与验证

```powershell
# 语法检查
npm run check

# 自动测试
npm test

# 主题校验
node .\src\cli.mjs validate
```

推荐按照 [`docs/PRACTICE.md`](docs/PRACTICE.md) 完成“校验 → 应用 → 检查 → 暂停 →
再次应用”的完整练习。

## 项目结构

```text
workbuddy-skin-lab/
├─ src/                 CLI、CDP 客户端、注入器和主题校验
├─ scripts/             Windows 应用、暂停、探测和打包脚本
├─ themes/              可版本管理、可随发布包分发的主题
├─ test/                Node.js 自动测试
├─ docs/                实践与扩展文档
├─ check-environment.cmd 普通用户环境诊断入口
├─ start-skin.cmd        普通用户一键应用入口
└─ restore-native.cmd    普通用户一键恢复入口
```

## 安全与素材边界

- CDP 只绑定 `127.0.0.1`，不要改成 `0.0.0.0`；
- 皮肤启用期间，不要运行来源不明且能访问本机端口的程序；
- 不要修改或重新打包 WorkBuddy 官方安装文件；
- 发布前确认背景、角色和商标素材拥有合法分发权；
- 示例“极光实验室”背景为本项目原创 SVG。

## 参考项目

- [cdredfox/workbuddy-skin-studio](https://github.com/cdredfox/workbuddy-skin-studio)
- [HeiGeAi/heige-codex-skin-studio](https://github.com/HeiGeAi/heige-codex-skin-studio)
- [Fei-Away/Codex-Dream-Skin](https://github.com/Fei-Away/Codex-Dream-Skin)

具体致谢和许可边界见 [`NOTICE.md`](NOTICE.md)。

## License

[MIT](LICENSE)
