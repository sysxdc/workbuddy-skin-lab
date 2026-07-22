# WorkBuddy 换肤可重复实践清单

目标不是“成功一次”，而是掌握一套可恢复、可校验、能重复执行的流程。只有首次需要开启 CDP 调试模式并重启 WorkBuddy 时，才先保存当前任务。

## 第 0 轮：建立基线

```powershell
node --version
node .\src\cli.mjs doctor
node .\src\cli.mjs validate
npm test
```

通过标准：Node 为 22+；找到 WorkBuddy；`invalid` 为空；测试全部通过。

## 第 1 轮：任务页准备候选素材

1. 若 `status` 无法连接，保存当前任务后运行 `.\scripts\apply.ps1 -Theme aurora-lab`；已有 CDP 会话则不重启。
2. 背景与候选模块图片可以在任务页生成、预览和标准化；当前背景未经 `preview` 不得确认。
3. 背景和五张派生素材都必须作为前台命令运行；五张派生素材用一个 `run-derived` 并行等待。不得 detached/background 启动，也不得让用户反复询问进度。
4. NoneLinear 空输出、路径错误或前台进程意外死亡必须停在 `outcome_unknown`，不得自动重试或手改授权记录。
5. 若计划 B 档转发点击，目标还必须为 `nativeClickable: true`，并完成单独风险确认。

## 第 2 轮：任务页固化，首次自然进入 Home 再检查

1. 查看 `themes/aurora-lab/theme.json` 中的固定槽位：`home-welcome`、三个覆盖上方原生标签的 `scene-icon` 和 `composer-companion`。示例不启用侧栏提示或下排 `home-card`，避免挤压侧栏底部和重复快捷功能。
2. 确认素材分别位于 `assets/<moduleId>.svg`，没有与背景或其他模块共用文件。
3. 六张素材完成后，在当前任务页确认并执行 `accept --spec`，随后显式 apply。作业应为 `accepted-pending-home`，不要求用户切换页面。

```powershell
node .\src\cli.mjs validate
node .\src\cli.mjs apply --theme aurora-lab --port 9223
node .\src\cli.mjs status --port 9223
```

4. 以后正常进入 Home。Runtime 必须先得到本次真实锚点和尺寸，兼容后才创建固定 modules；不兼容时保留背景并显示“Home组件待兼容”。
5. 在 `🎨` 面板中可按 module ID 修改允许的文字、单独“换图”或“重置”；文字和图片覆盖项使用同一个模块独立 localStorage key。拖动 🎨后刷新页面，位置应恢复且不越出窗口。
6. 检查欢迎横幅进入原生首页布局而不是形成 body 固定浮层；`home-card` / `scene-icon` 应贴合对应原生按钮，且 `elementFromPoint` 命中原生按钮而不是装饰节点。
7. 打开输入框左下角 + 菜单；原生弹窗必须完整越过输入框边界、没有裁剪祖先，使用不透明保护并高于所有装饰；相交装饰暂时隐藏，菜单关闭后装饰与祖先原始 overflow 恢复。A 档模块不能接收点击。
8. 缩小窗口，确认低于槽位最小尺寸的横幅/卡片自动隐藏；恢复窗口后重新出现且文字没有溢出。

## 第 3 轮：恢复与重复

1. 记录 apply 后 `[data-wb-module]` 数量与截图；标准截图由 CDP 的 `Page.captureScreenshot` 获取，失败时才使用项目内置的单帧降级方案。
2. 运行 `.\scripts\pause.ps1`。
3. 确认背景、dock、所有 `[data-wb-module]`、模块 click 转发和注入样式完全消失，原生控件恢复原状。
4. 再次运行 `node .\src\cli.mjs apply --theme aurora-lab --port 9223`，确认模块位置、独立覆盖和状态可重复。
5. 在 `🎨` 面板依次切换两个已保存主题，确认旧背景和素材仍可恢复；再对用户主题显式 apply，完全退出并再次运行“开始使用”，确认 `settings.json` 记录的最后主题自动恢复。

## 每轮验收表

| 检查项 | 通过条件 |
|---|---|
| 环境 | `doctor` 找到应用与受支持 Node |
| 清单 | `validate.invalid` 为空，预算 warning 已处理或确认分批 |
| 锚点 | 模块首次挂载前由 Runtime 实时探测；缺失时不创建模块、不猜选择器 |
| 模块 | slot 有效；anchor/kind/box 等于固定注册值；文字键和长度合法；素材通过校验 |
| 交互 | A 档不接收事件；B 档只转发到已确认的 `nativeClickable` 原生锚点 |
| 文字 | 首页原生主副标题与模块文字均可在 `🎨` 修改；切换主题不串写；pause 恢复 WorkBuddy 原文 |
| 原生融合 | 新模块不挂到 body 形成固定大浮层；覆盖型槽位保持原生按钮尺寸、排列与命中 |
| 首页/对话 | 输入框、按钮、代码块和滚动仍可操作，文字对比度合格 |
| 弹窗 | 原生 + 菜单完整越过输入框边界、无裁剪祖先、可点击、完全不透明且高于装饰；关闭后 overflow、标记与装饰恢复 |
| 持久化 | 任务页即可接受；主题目录完整；旧主题可从 `🎨` 切回；重启后自动恢复最后成功应用的主题 |
| 主题身份 | 请求主题 ID、运行时实际 ID 与验收主题 ID 完全一致 |
| 可逆 | pause 后无模块节点、监听器、dock 或注入样式残留 |
| 可重复 | 再次 apply 后主题和逐模块覆盖恢复 |

## 记录模板

```text
日期：
WorkBuddy 版本：
主题 ID：
probe 页面与可用锚点：
模块 ID / slot / order / 固定 anchor / kind / box / state：
自定义文字：
素材尺寸、格式、大小：
A 档 / 已二次确认的 B 档：
validate / npm test：
截图与对比度检查：
交互安全区重叠检查：
pause 无残留：
再次 apply：
发现的问题与下一次只改的一件事：
```
