# 固定模块与安全边界

主题只允许使用 `src/module-slots.mjs` 注册的固定槽位：`sidebar-note`、`home-hero`、`home-card`、`scene-icon`、`composer-float`。`anchor`、`kind`、`box`、`order`、`hostPath` 和最小尺寸均由注册表给出，不接受 AI 自由字符串。

生成或更新 modules 前，必须在当前存活的 CDP renderer 上运行 `probe-anchors`。只使用 `present: true` 的白名单锚点；B 档目标还必须为 `nativeClickable: true`。

首页原生标题只允许使用真实探测到的 `home-header-title` 与 `home-header-subtitle`。主题字段为
`homeHeader.title`（1–24 字符）和 `homeHeader.subtitle`（1–36 字符）；只设置 `textContent`，不替换 DOM，原文必须登记 cleanup。

## A/B 两档

- A 档：默认纯装饰，可修改图片、纯文字、颜色、圆角和按钮外观；没有 action 和新事件。
- B 档：用户明确描述点击目标并二次确认后，floating 控件只能向同次探测中已存在、未禁用的白名单原生元素调用 `.click()`。不能增加其它业务逻辑。

## 素材和 DOM

- 每个模块素材保存为主题目录 `assets/<moduleId>.<ext>`，必须通过 `assetPath()`、`verifiedAsset()` 和 `loadTheme()`。
- 不允许任意 CSS/JavaScript、自由选择器、网络、fetch、IPC、剪贴板或聊天内容操作。
- 所有新 DOM、监听器、观察器、原生节点标记和临时样式必须在创建时登记 cleanup。
- 原生 menu/dialog/listbox 及其几何外层拥有最高交互优先级和完全不透明底色；若祖先 overflow 会裁剪弹窗，只临时解锁这条受限祖先链；相交装饰临时隐藏，关闭后恢复。
- `pause` 后 `[data-wb-module]`、dock、浮层标记、监听器、观察器、祖先 overflow 和其他临时样式必须全部恢复或消失。
