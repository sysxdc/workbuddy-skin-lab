# WorkBuddy 5.3.8 背景模式验收

## 必查项目

1. `node src/cli.mjs validate` 通过。
2. `node scripts/theme-generation-job.mjs resume` 返回模板 `background-v1`。
3. generate/edit 只授权三次背景调用；direct 为零次调用。
4. `accept` 生成的 `theme.json` 不包含 `homeHeader`、`copySets`，且 `modules` 为空数组。
5. 应用后背景可见，`document.querySelectorAll('[data-wb-module]').length` 为 0。
6. `🎨` 面板只显示“主题与背景、显示效果、恢复与重置”。
7. 首页标题、选项、对话框和任务页内容均保持 WorkBuddy 原生结构与文字。
8. `pause` 后背景、dock、注入样式和主题属性完全清除；再次 `apply` 可恢复背景。

## 发布包检查

- Skill 内的模板必须是 `background-v1`。
- Skill 中不得要求 `run-derived`、五张模块图或三套文案。
- 内置 `aurora-lab/theme.json` 不得包含装饰模块。
- ZIP 中不得包含旧版装饰 SVG。
