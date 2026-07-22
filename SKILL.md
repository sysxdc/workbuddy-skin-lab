---
name: workbuddy-skin-lab
description: 在 Windows WorkBuddy 内生成、应用、恢复并持久保存固定模板主题；支持 NoneLinear 背景与五个固定模块素材、自定义文字、作业续跑和原生弹窗保护。只通过 127.0.0.1 CDP 工作。
allowed-tools: Read, Write, Bash
---

# WorkBuddy Skin Lab

这是主入口和流程索引。它在 WorkBuddy 桌面端内部运行，不依赖 Codex。安装后以 `${CODEBUDDY_SKILL_DIR}` 为绝对根目录；所有命令只能调用该目录内的脚本，不扫描用户目录猜 Skill 路径。

## 先读哪个文档

- 第一次使用：[`docs/BEGINNER_WORKBUDDY_THEME.md`](docs/BEGINNER_WORKBUDDY_THEME.md)
- 完整生图命令、规格和状态：[`references/GENERATION_WORKFLOW.md`](references/GENERATION_WORKFLOW.md)
- API Key：[`references/NONELINEAR_SETUP.md`](references/NONELINEAR_SETUP.md)
- 模块、交互与安全边界：[`references/MODULE_BOUNDARIES.md`](references/MODULE_BOUNDARIES.md)
- 最终验收：[`docs/PRACTICE.md`](docs/PRACTICE.md)

## 每次对话的固定入口

1. 先运行 `doctor`、`validate`、`status`。
2. 再运行 `node scripts/theme-generation-job.mjs resume`。未完成作业必须沿它返回的 `jobId` 和唯一 `nextAction` 继续；最近作业已经接受时会返回 `apply-theme`，禁止重新讲一遍流程或新建重复作业。
3. 除上传参考图、背景确认、额外计费重试、进入 Home 验收和最终接受外，其余已授权步骤应在同一轮连续执行。每条前台命令结束后立即再次运行 `resume`，直到 `requiresUser: true` 或完成；不要让用户反复发送“继续”“好了吗”。
4. 不启动无法追溯的 detached 后台进程。命令中断后重新运行 `resume`，不得手改 job JSON。

## 固定主题流程

1. 背景和五张候选素材可以在任务页生成；此时不构建 modules，也不宣称主题已完成。
2. 图片只能调用同一 WorkBuddy 任务中已启用的 `$nonelinear-image` 0.1.0。不得改用 WorkBuddy 内置图片生成工具、`nl` CLI、`curl` 或临时 API 请求。
3. 固定使用 `gpt-image-2`、`quality=low`、`response_format=url`。初始请求只授权一次背景调用；失败不自动重试。
4. 本地参考图上传前显示：“该图片将上传到 NoneLinear 服务器并获得公开 HTTPS URL。”必须二次确认，并说明不承诺远端删除。
5. 背景确认后才授权五张派生素材。固定模板为 `home-scene-v1`，槽位、锚点、box、顺序、选择器和原生语义不允许 AI 修改；同时生成 `homeHeader.title/subtitle` 两行纯文字，不增加图片调用。
6. 素材全部标准化后只进入一次 Home，运行 `verify-home`；它必须真实 `probe-anchors`，检查 `nativeClickable: true` 条件、5个模块、原生 + 弹窗、`Page.captureScreenshot`、`pause → state.cleanup() → 再次 apply`。
7. 只有 `verified` 才能最终确认和 `accept`。随后显式 `apply --theme <id>`，成功后活动主题写入 `%LOCALAPPDATA%\WorkBuddySkinLab\settings.json`；下次双击“开始使用”会自动恢复它，不再固定回到 `aurora-lab`。

## 模块和交互边界

- 固定组件槽位只来自 `src/module-slots.mjs`，必须先探测锚点，禁止模型自由定位。
- A 档是默认：纯装饰，不设置 action、不绑定事件。
- B 档只允许用户明确说明目标并二次确认后，将 floating 点击转发给本次探测中已经存在且 `nativeClickable: true` 的白名单原生元素。
- `probe-anchors`、`inspect-modules` 和 `Page.captureScreenshot` 只能使用当前存活的 127.0.0.1 CDP 目标。
- 素材必须经 `assetPath()`、`verifiedAsset()`、`loadTheme()`；不得把大 base64 当素材持久化。
- 原生首页标题只允许通过白名单 `home-header-title` / `home-header-subtitle` 设置 `textContent`；必须保存原值并在 pause 时恢复。
- 原生 `[role=menu|dialog|listbox]` 及其受限几何外层始终使用不透明保护并高于装饰；被输入区祖先裁剪时临时解除其 `overflow`，相交模块临时隐藏，关闭或 pause 后逐项恢复。
- 新主题必须写入独立主题目录，禁止覆盖旧主题；`🎨` 面板的“切换主题”列出全部已校验主题，显式 apply 继续负责磁盘持久化。

## 绝对禁止

- 不读取或修改网络请求、fetch、IPC、剪贴板、聊天内容。
- 不绕过 WorkBuddy 的计费、权限、安全提示。
- 不修改 WorkBuddy.exe、app.asar、安装文件或代码签名；CDP 只绑定 `127.0.0.1`。
- 不生成自由 CSS、JavaScript、选择器或业务逻辑。
- 不得保存 API key、Authorization、大 base64 或完整原始接口响应。
- 不得从正在运行的 WorkBuddy Skill 中直接执行会关闭宿主的 `scripts/apply.ps1`；首次开启 CDP 时让用户保存任务并从外部双击“开始使用”。

## 常用命令

```powershell
node src/cli.mjs doctor
node src/cli.mjs validate
node src/cli.mjs status --port 9223
node scripts/theme-generation-job.mjs resume
node src/cli.mjs apply --theme <themeId> --port 9223
node src/cli.mjs probe-anchors --port 9223
node src/cli.mjs inspect-modules --output-dir .agent-workspace/screenshots --port 9223
node src/cli.mjs pause --port 9223
```
