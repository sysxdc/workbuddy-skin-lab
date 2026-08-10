# WorkBuddy Skin Lab v1.5.2

修复 AI 粒子素材被误当成“自定义符号”的路径混淆。

## 修复内容

- 将面板明确区分为“手输符号（文字）”与“AI 透明 PNG 素材”。
- 手输符号只接受 1–2 个 Unicode 字符，不能再被误用于 AI 图片素材。
- Skill 明确要求所有 AI 视觉粒子必须走 `particle-v1`：生成三张透明 PNG、创建派生主题、再应用该主题。
- 新派生主题会默认启用 AI PNG 粒子，用户只需点缩略图切换候选与微调轨迹。
- 没有 AI 粒子素材的主题会显示明确引导，不再静默回退。

## 升级方式

删除 WorkBuddy 中旧版 `workbuddy-skin-lab` Skill，安装 `WorkBuddy-Skin-Lab-1.5.2-Skill.zip`。Windows 工具包也同步升级为 `WorkBuddy-Skin-Lab-1.5.2-Windows.zip`。
