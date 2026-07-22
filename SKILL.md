---
name: workbuddy-skin-lab
description: 在 Windows WorkBuddy 内根据提示词或一张参考图生成、直接采用、预览、应用、恢复并永久保存固定模板主题。支持任务页固化、首次进入 Home 自动兼容检查、自定义文字和可移动控制面板。只通过 127.0.0.1 CDP 工作；用户提到 WorkBuddy 换肤、主题、背景或首页装饰时应使用本 Skill。
allowed-tools: Read, Write, Bash
---

# WorkBuddy Skin Lab

这是 WorkBuddy 桌面端内部运行，不依赖 Codex 的主入口和流程索引。以 `${CODEBUDDY_SKILL_DIR}` 为根目录调用脚本，不扫描用户目录猜路径。图片生成只使用同一 WorkBuddy 任务中已启用的 `$nonelinear-image`。

## 按需阅读

- 第一次使用：[`docs/BEGINNER_WORKBUDDY_THEME.md`](docs/BEGINNER_WORKBUDDY_THEME.md)
- 作业命令和规格：[`references/GENERATION_WORKFLOW.md`](references/GENERATION_WORKFLOW.md)
- API Key：[`references/NONELINEAR_SETUP.md`](references/NONELINEAR_SETUP.md)
- 模块安全边界：[`references/MODULE_BOUNDARIES.md`](references/MODULE_BOUNDARIES.md)
- 高级验收：[`docs/PRACTICE.md`](docs/PRACTICE.md)

## 每次对话

1. 运行 `doctor`、`validate`、`status` 和 `node scripts/theme-generation-job.mjs resume`。
2. 有未完成作业时只沿 `jobId` 和 `nextAction` 继续，不重新 `init`，不手改 job JSON。
3. 除上传、背景、额外计费和最终接受确认外，在同一轮连续运行到下一个 `requiresUser: true`，不要把内部进度交给用户追问。
4. 生图只在当前前台命令中运行。工具返回“仍在运行”或进程句柄时，继续等待同一个进程，不能启动后台进程、重复提交或让用户反复发送“继续”“好了吗”。

## 背景选择

开始前让用户明确选择一种：

- `generate`：没有参考图，生成一张背景。
- `edit`：根据一张参考图生成新背景；本地图片先解释上传并取得确认。
- `direct`：直接采用参考图，居中裁切为 2048×1152；不产生背景生图调用。本地图片仍需上传确认，供后续五张素材保持统一风格。

每次生图前先说：“预计需要1–10分钟，请保持当前窗口打开，不要重复提交；正常情况下我会一直等待结果。只有任务真的中断时，发送‘继续’才会恢复原作业，不会自动再次计费。”图片只能通过同一任务已启用的 `$nonelinear-image`，固定 `gpt-image-2`、`quality=low`、`response_format=url`。失败不自动重试。

背景使用一次前台 `run-image` 并等待它返回。背景确认并一次授权五张派生素材后：

1. 把五个固定角色的提示词写到同一作业目录的 `prompts/<role>.txt`。
2. 只启动一次前台命令 `run-derived --prompt-dir <目录>`；它并行生成五张图片，并在五张全部成功、失败或结果未知后才退出。
3. 为宿主命令设置至少 660 秒等待上限。等待期间不结束本轮对话、不轮询新进程、不向用户索要状态提问。
4. 命令返回后立即继续下载、标准化和 `resume`，直到真正需要用户确认。

若宿主意外中断，下一次 `resume` 会根据作业中的 `batchId`、开始时间和调用状态恢复；死亡的前台进程记为 `outcome_unknown`，等待用户决定是否新增授权。

## 展示与确认

背景标准化后运行：

```powershell
node scripts/theme-generation-job.mjs preview --job <jobId> --role background
```

把返回的 `markdown` 直接展示给用户，并同时给出 `url` 或本地 `path`。没有完成 preview 时不得确认背景。用户确认背景时，同时说明将继续产生五次派生素材调用。

新生成的 `home-welcome` 默认只包含 eyebrow、title、subtitle，不生成徽标文字。图片内禁止文字、UI 框架、WorkBuddy 标志和水印。

## 保存与应用

六张素材就绪后，无需进入 Home：

1. 取得最终确认。
2. `accept --job <jobId> --spec <generation-spec.json>` 在任务页构建并永久保存主题。
3. 显式 `apply --theme <themeId>` 设置活动主题。
4. 如当前是任务页，只应用任务页背景、配色和 🎨面板；不得要求用户返回 Home。

主题初始状态为 `accepted-pending-home`。用户以后自然进入 Home 时，运行时才用白名单选择器探测真实锚点；尺寸合格后创建五个模块。探测失败时保持背景并显示“Home组件待兼容”，禁止猜选择器。

`verify-home` 仍可用于高级验收，但不是保存主题的前置条件。🎨可拖动并记住位置。

需要主动验收 Home 时，先运行 `probe-anchors`，再运行 `inspect-modules` / `verify-home`；具体门禁见 `references/MODULE_BOUNDARIES.md` 与 `docs/PRACTICE.md`。

## 安全边界

- 不读取或修改网络请求、fetch、IPC、剪贴板或聊天内容；不绕过 WorkBuddy 的计费、权限或安全提示。
- 不修改 WorkBuddy.exe、app.asar、安装文件或代码签名；CDP 仅绑定 `127.0.0.1`。
- 不生成自由 CSS、JavaScript、选择器或业务逻辑。
- 素材必须经过 `assetPath()`、`verifiedAsset()`、`loadTheme()`，不得持久化大 base64。
- 所有 DOM、监听器、观察器和临时样式必须进入现有 cleanup；`pause` 后完全恢复。
- 首次开启 CDP 需要用户保存任务并从外部双击“开始使用”，不能让正在运行的 Skill 关闭宿主。

## 常用命令

```powershell
node src/cli.mjs doctor
node src/cli.mjs validate
node src/cli.mjs status --port 9223
node scripts/theme-generation-job.mjs resume
node src/cli.mjs apply --theme <themeId> --port 9223
node src/cli.mjs pause --port 9223
```
