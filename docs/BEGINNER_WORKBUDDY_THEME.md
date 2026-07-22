# WorkBuddy AI 主题生成：完整小白教程

这份教程适合第一次使用的人。完成后，你只需要在 WorkBuddy 对话里描述想要的风格，WorkBuddy 会调用两个已安装的 Skill，生成固定布局主题并直接在当前界面预览；不需要 Codex，不满意可以改，任何时候都能一键恢复原生界面。

> 这个工具不会修改 `WorkBuddy.exe`、`app.asar`、安装目录或代码签名。它只通过绑定在 `127.0.0.1` 的本机调试通道临时装饰 WorkBuddy 页面。

除首次双击 `开始使用.bat` 让 WorkBuddy 以本机 CDP 模式启动外，安装 Skill 后的主题描述、生图、上传确认、背景确认、五张素材生成、预览、修改、接受和恢复都在 WorkBuddy 内完成。首次启动必须在外部完成，是因为正在运行的 WorkBuddy 无法关闭自己后继续同一轮 Skill 对话。

## 开始前先了解三件事

1. 生成一套完整主题通常需要 **6 次图片调用**：先生成 1 张背景；你确认背景后，再生成 5 张模块素材。重做背景或图标会增加调用次数。
2. 工具不会自动重试，也不会在你只询问用法时偷偷生图。每次增加调用都要得到你的明确同意。
3. 如果使用本地参考图，它会在你确认后上传到 NoneLinear，并得到公开 HTTPS 地址。工具只能清除本地临时记录，不承诺远端服务器自动删除。

## 隐私与密钥安全

- API Key 只放在当前 PowerShell 会话或 Windows 用户环境变量中，永远不要粘贴到 WorkBuddy 对话、截图、主题提示词或 `theme.json`。
- 分享项目或上传 GitHub 前，不要加入 `.workbuddy`、`.agent-workspace`、`release`、`__pycache__`、`.env`、截图和 `generation-jobs`。项目的 `.gitignore` 已默认排除这些目录。
- `%LOCALAPPDATA%\WorkBuddySkinLab\themes` 中可能包含你的自定义图片；只有确认拥有分发权且画面不含个人信息时，才手动复制到项目 `themes` 目录。
- WorkBuddy 截图可能暴露任务名称、文件路径、账户名或对话摘要。公开发布前应裁剪或打码；本项目默认不提交截图。
- 示例中的 `nl-xxx` 只是占位符，不能替换为真实 Key 后再提交。

## 一、准备软件和项目

你需要：

- Windows 10 或 Windows 11；
- 已安装 WorkBuddy 桌面版；
- Node.js 22 或更高版本；
- 已解压的项目目录。下文统一写作 `<项目目录>`，例如 `C:\Tools\WorkBuddy-Skin-Lab`；
- 两个 WorkBuddy 本地技能包；
- 可用的 NoneLinear API key。

### 在 WorkBuddy 导入两个 Skill

打开 WorkBuddy 左侧的“更多 → 专家·技能·连接器 → 技能”，点击“添加技能 → 上传技能”，依次选择：

```text
<项目目录>\release\WorkBuddy-Skin-Lab-1.2.0-Skill.zip
<项目目录>\release\NoneLinear-Image-0.1.0-Skill.zip
```

如果你拿到的是 `WorkBuddy-Skin-Lab-1.2.0-Windows.zip` 发布包，解压后也可以在其中的 `skill-packages` 文件夹找到这两个文件。

导入后进入“已安装”，启用：

- `workbuddy-skin-lab`
- `nonelinear-image`

建议本任务只启用这两个 Skill，减少误调用。然后在 WorkBuddy 新任务中发送下面一句做无费用检查：

```text
请只检查当前是否能使用 $nonelinear-image，不要生成图片，也不要调用 API。
```

如果提示找不到 Skill，回到“已安装”确认它们已经启用；仍然找不到时，完全退出并重新打开 WorkBuddy。

打开项目目录，先双击：

```text
环境检查.bat
```

也可以双击英文入口：

```text
check-environment.cmd
```

看到下面的结果即可继续：

```text
[OK] Environment and themes are ready.
```

如果提示 Node.js 版本过低，请安装 Node.js 22 或更高版本后重新检查。如果提示找不到 WorkBuddy，参见本文末尾“常见问题”。

## 二、配置 NoneLinear API key

### 推荐方式：Windows 用户级配置

1. 完全退出 WorkBuddy。
2. 打开 PowerShell。
3. 输入下面的命令，把 `nl-xxx` 换成自己的 key：

```powershell
[Environment]::SetEnvironmentVariable(
  "NONELINEAR_API_KEY",
  "nl-xxx",
  "User"
)
```

不要把真实 key 发到聊天、截图或主题提示词里。设置完成后必须重新启动 WorkBuddy，新进程才能读取它。共享 Windows 账户不建议使用持久配置。

只查看 Windows 用户级配置是否成功，不显示真实 key：

```powershell
$configuredKey = [Environment]::GetEnvironmentVariable(
  "NONELINEAR_API_KEY",
  "User"
)
if ([string]::IsNullOrWhiteSpace($configuredKey)) {
  "NONELINEAR_API_KEY: missing"
} else {
  "NONELINEAR_API_KEY: configured"
}
$configuredKey = $null
```

看到 `configured` 就可以继续。删除配置、使用临时变量或 Agent 注入时，阅读 [`references/NONELINEAR_SETUP.md`](../references/NONELINEAR_SETUP.md)。

## 三、第一次让 WorkBuddy 进入换肤模式

这一步首次执行时可能会重启 WorkBuddy，所以先保存 WorkBuddy 中正在进行的任务。

1. 打开你自己的 `<项目目录>`。
2. 双击：

```text
开始使用.bat
```

也可以双击英文入口：

```text
start-skin.cmd
```

脚本会执行以下操作：

- 如果 WorkBuddy 尚未开启本机调试模式，会正常关闭并重新启动 WorkBuddy；
- 调试端口只监听 `127.0.0.1:9223`；
- 第一次使用且没有用户主题时应用内置示例；从旧版升级时优先选择最近更新的有效用户主题，以后自动恢复最后一次成功应用的主题；
- WorkBuddy 右上角会出现 `🎨` 按钮。

如果 WorkBuddy 已经处于调试模式，再运行时不会重复重启。

### 生成时不用离开当前任务

背景和五张候选素材可以在当前 WorkBuddy 任务页完成，不需要为了每一步反复返回首页。工具此时只准备图片，不构建 modules，也不会把任务页截图当成主题成功。只有所有素材准备好后的最终验收，需要进入一次 Home。

如果一次回复结束、后台步骤中断，或者你隔一段时间才回来，只要说“继续当前主题”。Skill 会先读取持久化作业并报告
“已完成几张、正在等什么、下一步是什么”，不会重新上传、重新生图或要求你重复前面的确认。正常情况下，除明确确认点外，
你不需要连续发送“继续”“好了吗”。

## 四、在 WorkBuddy 中发出主题需求

在 WorkBuddy 新建本地任务，工作目录选择你的 `<项目目录>`。在输入框输入 `/`，选择或确认已启用 `workbuddy-skin-lab` 与 `nonelinear-image`，然后复制下面的模板。只需要修改“主题名”和“我想要的风格”。

```text
使用 workbuddy-skin-lab 和 nonelinear-image 两个已安装 Skill，
严格按 NoneLinear 半自动固定模板在当前 WorkBuddy 上生成主题。

主题名：暮色纸灯
我想要的风格：温暖的黄昏书房，纸灯、木质桌面、轻微奇幻感，
整体安静、耐看，不要太鲜艳，适合长时间办公。

没有参考图。
本次只授权环境检查、真实锚点探测和 1 次背景图片调用。
暂时不要生成后续 5 张模块素材。
```

AI接下来应该自动完成：

1. 检查 Node.js、主题和 NoneLinear 环境；
2. 检查 WorkBuddy 是否已经开启本机调试模式；
3. 检查 NoneLinear Skill 的真实路径与无费用语法；
4. 创建生成作业；
5. 只生成一张 2048×1152 的背景；
6. 下载、校验并把背景展示给你。

如果提示 `apiKey: missing`，说明当前 WorkBuddy 进程没有读取环境变量。完全退出 WorkBuddy，再双击 `开始使用.bat` 重新启动。

## 五、如果要使用本地参考图

首版只支持一张 PNG、JPEG 或 WebP，大小必须为 1 B–20 MB。

在最初的需求中写：

```text
参考图：D:\Pictures\我的参考图.png
```

AI必须先显示下面的说明：

> 该图片将上传到 NoneLinear 服务器并获得公开 HTTPS URL。

确认自己拥有上传和使用该图片的权利后，再单独回复：

```text
我已了解该图片会上传到 NoneLinear 并获得公开 HTTPS URL，
确认本作业上传这一张参考图。
```

在看到说明并回复确认之前，工具不会上传本地图片。如果不想上传，回复“取消参考图，改为只使用提示词”。

如果参考图本来就是公开 HTTPS 图片，可直接把公开地址放进需求中，不需要本地上传步骤。不要使用内网、localhost、带用户名密码或 HTTP 地址。

## 六、第一次确认：选择背景

背景生成后，先看整体风格、人物或主体位置、亮暗程度和左侧是否留出了侧栏空间。

### 背景满意

复制回复：

```text
我确认使用这张背景，并明确授权继续执行 5 次派生素材调用：
欢迎横幅装饰、日常办公图标、代码开发图标、设计创意图标、输入区装饰。
请保持固定模板、原生按钮语义和点击穿透，不要生成图片文字、UI框架、
WorkBuddy 标志或水印。
```

这次确认会授权正好 5 次派生素材调用。

### 背景不满意

告诉 AI 具体哪里需要改变，例如：

```text
背景太暗，把灯光提高一些；主体再向右移动，左侧保持干净。
我明确授权按这次反馈重新生成 1 张背景。
```

每次重做背景都是一次新调用。新背景会让旧的派生素材和剩余派生授权失效；接受新背景后，需要重新确认 5 次派生素材。

## 七、AI生成固定的五个模块

确认背景后，AI会分析背景并自动生成：

| 模块 | 在 WorkBuddy 中的效果 |
|---|---|
| 欢迎横幅 | 首页上方的装饰和自定义欢迎文字 |
| 日常办公 | 第一个原生场景标签的图标和标题 |
| 代码开发 | 第二个原生场景标签的图标和标题 |
| 设计创意 | 第三个原生场景标签的图标和标题 |
| 输入区装饰 | 首页输入框安全角落的小装饰 |

AI还会生成两行不需要图片调用的纯文字，用来替换首页原生的“WorkBuddy / 你的职场超能力”。它们会写入主题的 `homeHeader`，不是叠加一个新浮层。

AI不能改变这些模块的槽位、位置、box、选择器或原生功能。三个场景按钮仍分别保持办公、开发和创意语义；装饰层不接收点击，点击会落到原生按钮上。

生成完成后，工具会：

1. 去除模块素材的纯色键背景；
2. 把图片缩放到固定尺寸；
3. 检查单图大小和模块总预算；
4. 通过项目原有的素材路径和真实文件校验；
5. 将作业标记为 `media-ready`，等待最终 Home 验收；
6. 此时不会在任务页构建 modules，也不会误报主题已经成功。

任意一张生成失败时都不会自动重试。AI会报告脱敏错误并等你决定。

## 八、只进入一次 Home 完成最终验收

候选素材完成后，Skill 会提示你：

1. 保持 WorkBuddy 窗口最大化；
2. 进入 WorkBuddy Home；
3. 等主题出现后，打开首页输入框左下角的 `+` 菜单，保持约3秒后关闭；
4. 等验收完成后回到原任务。

`verify-home` 会在你进入 Home 后真实探测 `scene-tabs`、`home-composer` 和首页标题节点，然后才构建 modules。它会确认实际主题 ID、首页两行主题文案、5个可见模块、文字溢出、A档点击穿透和原生弹窗保护，并自动完成 `pause → 无残留 → 再次 apply`。任务页截图、空模块或旧主题 ID 都不能通过。

打开 `+` 菜单时，与菜单相交的装饰会暂时隐藏。保护同时覆盖 menu/listbox/dialog 和尺寸受限的原生定位外层，
使用完全不透明底色并保持最高交互优先级；关闭菜单后所有标记和装饰自动恢复。

### 第二次确认：修改或接受最终主题

### 只改文字，不产生生图调用

```text
图片保持不变。把首页主标题改成“暮色纸灯”，副标题改成“在静谧灯影里继续今天”；
把欢迎标题改成“在柔光里完成今天”，
把第二个标签改成“专注开发”，重新校验并预览。
```

文字只能使用固定槽位允许的纯文本，不能插入 HTML。

### 只重做一个图标

```text
只重做“代码开发”图标，让它更简洁并保持当前配色。
我明确授权新增 1 次 scene-code 图片调用；其他图片不变。
```

### 接受主题

```text
我确认接受当前已通过 verify-home 的主题，请固化主题。
```

最终验收时 WorkBuddy 会短暂恢复原生，再重新应用主题，这是正常现象。

### 取消主题

```text
取消本次主题，先恢复 WorkBuddy 原生界面，
再把预览主题移动到可恢复目录，并清理本地临时 URL 和图片文件。
```

取消不会承诺删除已经上传到 NoneLinear 服务器的参考图。

## 九、以后如何再次使用主题

接受的主题会永久保存在 `%LOCALAPPDATA%\WorkBuddySkinLab\themes\<主题ID>\`。其中包含背景、五个 PNG 和
`theme.json`，不会因为关闭 WorkBuddy 而消失。最后一次成功应用的主题还会记录在 `settings.json`；下次直接双击
“开始使用”即可自动恢复，无需再次生图。

如需切换到另一个已保存主题，点击右上角 `🎨`，在“切换主题”中选择即可。新主题使用独立目录，旧主题、旧背景和五个素材不会被覆盖。

如果还希望下次启动自动恢复这个主题，可在 WorkBuddy 对话中让 Skill 显式应用它；也可以让 WorkBuddy 保持通过“开始使用”启动的调试模式，然后在项目目录打开 PowerShell：

```powershell
node .\src\cli.mjs list
```

找到主题 ID 后执行：

```powershell
node .\src\cli.mjs apply --theme <主题ID> --port 9223
```

普通用户可以直接在 WorkBuddy 对话中说：

```text
使用 workbuddy-skin-lab 列出我的主题，
把“暮色纸灯”应用到当前已经开启的 WorkBuddy，不要重启。
```

## 十、一键恢复 WorkBuddy 原生界面

在 WorkBuddy 对话中输入：

```text
使用 workbuddy-skin-lab 立即 pause 当前皮肤，
检查模块、样式、控制面板和监听器都没有残留，恢复原生界面。
```

如果 Skill 对话不可用，再使用外部应急入口，双击项目根目录中的：

```text
恢复原生.bat
```

或英文入口：

```text
restore-native.cmd
```

这会移除背景、模块、控制面板、样式和监听器，不会删除或修改 WorkBuddy 安装文件。

如果 WorkBuddy 已经完全退出，注入内容本身也会消失。重新正常启动 WorkBuddy 时看到的就是原生界面。

## 常见问题

### 1. 提示找不到 WorkBuddy.exe

在项目目录打开 PowerShell，用实际路径执行：

```powershell
.\scripts\apply.ps1 `
  -WorkBuddyExe "D:\你的安装目录\WorkBuddy.exe" `
  -Theme aurora-lab
```

也可以先设置：

```powershell
$env:WORKBUDDY_EXE = "D:\你的安装目录\WorkBuddy.exe"
```

### 2. 提示 Node.js 版本不支持

检查版本：

```powershell
node --version
```

必须是 `v22` 或更高版本。

### 3. WorkBuddy 没有出现右上角 🎨

先保存任务，完全关闭 WorkBuddy，再重新双击 `开始使用.bat`。不要自己把调试地址改成 `0.0.0.0`；项目只允许绑定 `127.0.0.1`。

### 4. 提示找不到锚点

候选图片可以继续保留，不需要重新生图。最大化 WorkBuddy，在最终验收时进入 Home，确认上方场景标签和首页输入框可见，再让 Skill 重新执行 `verify-home`。锚点不存在时只拒绝构建 modules。

### 5. 提示 API key missing

说明当前 WorkBuddy 进程没有继承环境变量。完全退出 WorkBuddy，再双击 `开始使用.bat`。如果使用临时变量，必须从设置变量的同一个 PowerShell 执行 `.\scripts\apply.ps1` 启动 WorkBuddy。

### 6. 提示 Python 或 Pillow missing

安装 Pillow：

```powershell
python -m pip install Pillow
```

如果电脑有多个 Python，在 WorkBuddy 对话中把安装 Pillow 的同一个 `python.exe` 路径告诉 Skill。

### 7. 提示找不到 `$nonelinear-image`

回到 WorkBuddy 的“技能 → 已安装”，确认 `nonelinear-image` 已启用，然后完全退出并重启 WorkBuddy。不要改用 WorkBuddy 内置图片生成工具、`nl` 或 `curl` 绕过流程。

### 8. 主题挤压原生布局或按钮不能点击

不要手工改 CSS、box 或选择器。回复：

```text
停止当前预览并恢复原生。重新运行锚点探测和 inspect-modules，
只使用 home-scene-v1 固定模板，检查原生按钮点击穿透。
```

如果仍有问题，先双击 `恢复原生.bat`。

如果 `+` 菜单只能显示在输入框内部、上半部分消失，或在“遮挡/恢复”之间反复闪动，这是祖先容器裁剪保护没有稳定保持，不是调透明度能解决。升级到 1.2.0 后重新应用主题；`verify-home` 会把仍存在裁剪祖先的弹窗直接判为失败。

## 最短操作清单

如果已经配置好环境，以后只需要：

1. 保存 WorkBuddy 当前任务；
2. 双击 `开始使用.bat`；
3. 在 WorkBuddy 当前任务中选中两个 Skill，粘贴第四节的主题需求模板；
4. 看背景，满意后明确授权 5 次派生素材；
5. 素材完成后只进入一次 Home，将 `+` 菜单打开约3秒后关闭并完成验收；
6. 回原任务接受主题或一键恢复原生。
