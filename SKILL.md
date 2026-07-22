---
name: workbuddy-skin-lab
description: 在 Windows WorkBuddy 内根据提示词或一张参考图生成、应用、保存和切换固定模板主题。支持三张候选背景、三套文案、五个固定装饰模块和一键恢复原生；只通过 127.0.0.1 CDP 工作。
allowed-tools: Read, Write, Bash
---

# WorkBuddy Skin Lab

这是在 WorkBuddy 桌面端内部运行的主入口，不依赖 Codex。图片只调用同一 WorkBuddy 任务中已启用的 `$nonelinear-image`；脚本路径必须从 `${CODEBUDDY_SKILL_DIR}` 取得，不扫描用户目录猜测。

## 先读哪一份

- 第一次使用：[`docs/BEGINNER_WORKBUDDY_THEME.md`](docs/BEGINNER_WORKBUDDY_THEME.md)
- 完整作业协议：[`references/GENERATION_WORKFLOW.md`](references/GENERATION_WORKFLOW.md)
- API Key：[`references/NONELINEAR_SETUP.md`](references/NONELINEAR_SETUP.md)
- 模块边界：[`references/MODULE_BOUNDARIES.md`](references/MODULE_BOUNDARIES.md)
- 高级验收：[`docs/PRACTICE.md`](docs/PRACTICE.md)

## 固定流程

1. 先运行 `doctor`、`validate`、`status` 和 `theme-generation-job.mjs resume`。有旧作业就沿唯一 `jobId / nextAction` 继续，禁止重新 `init` 或手改 job JSON。
2. 确认背景模式：`generate`（提示词生成三张）、`edit`（参考图生成三张）、`direct`（直接使用一张参考图）。本地图片上传前必须取得固定隐私确认。
3. 开始前一次说明完整调用量并取得确认：generate/edit 为“1次三图背景请求 + 5次模块请求”；direct 为“0次背景请求 + 5次模块请求”。
4. 所有图片固定 `gpt-image-2`、`quality=low`、`response_format=url`。背景 2048×1152；其余请求 1024×1024。提示词必须禁止文字、UI框架、WorkBuddy标志和水印。
5. 背景三张必须一次完整返回；少图、下载或标准化失败立即停止，不补图、不重试。默认选择方案1，不等待背景确认；运行 `preview` 展示三张或地址后继续。
6. 五张模块以方案1为风格参考，用一个前台 `run-derived` 命令并行生成。命令返回句柄时，在同一轮以不超过60秒的分段持续 wait/read，直到终态；不能回复“等待通知”后结束，也不能让用户反复发送“继续”。
7. AI生成专注、轻松、活力三套结构化文案。第一套同步到旧字段；不得修改固定 slot、order、anchor、kind、box、选择器、action 或原生功能语义。
8. 素材就绪后取得最终确认，在当前任务页 `accept --spec`、显式 `apply --theme`。保存不要求进入 Home；以后自然进入 Home 时才真实探测并挂载兼容模块。

每次调用前提醒：“预计需要1–10分钟，请保持当前窗口打开，不要重复提交；我会在本轮持续等待。只有任务真正中断时，发送‘继续’才会恢复原作业，不会自动再次计费。”

## 运行纪律

- 除上传、完整调用量、额外重试和最终接受以外，`requiresUser` 不是 `true` 时必须在同一轮继续。
- 超时、空输出、传输中断记为 `outcome_unknown`；等待用户新增授权，绝不自动重试。
- `preview` 是展示，不是门禁。三张背景默认方案1；用户以后在 `🎨 → 主题与背景` 切换不会调用生图。
- `🎨` 可拖动并记住位置；用户必须点击“保存当前主题（下次启动）”才更新启动偏好。
- `verify-home` 是高级可选验收，不是固化前置条件。

## 安全边界

- 不读写网络请求、fetch、IPC、剪贴板或聊天内容；不绕过 WorkBuddy 的计费、权限或安全提示。
- 不修改 WorkBuddy.exe、app.asar、安装文件或代码签名；CDP 仅绑定 `127.0.0.1`。
- 不生成自由 CSS、JavaScript、选择器或业务逻辑。
- 所有素材必须经过 `assetPath()`、`verifiedAsset()`、`loadTheme()`；不得持久化大 base64。
- 所有 DOM、监听器、观察器、属性和临时样式必须进入现有 cleanup；`pause` 后完全恢复。
- 首次开启 CDP 时提醒保存任务并从外部运行“开始使用”；正在运行的 Skill 不关闭宿主。

## 常用入口

```powershell
node src/cli.mjs doctor
node src/cli.mjs validate
node src/cli.mjs status --port 9223
node scripts/theme-generation-job.mjs resume
node src/cli.mjs apply --theme <themeId> --port 9223
node src/cli.mjs pause --port 9223
```
