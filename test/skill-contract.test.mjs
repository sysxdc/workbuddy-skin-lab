import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("主 Skill 保持简短索引，安全门禁由固定参考文档完整承载", async () => {
  const [skill, boundaries, practice, workflow] = await Promise.all([
    readFile(new URL("../SKILL.md", import.meta.url), "utf8"),
    readFile(new URL("../references/MODULE_BOUNDARIES.md", import.meta.url), "utf8"),
    readFile(new URL("../docs/PRACTICE.md", import.meta.url), "utf8"),
    readFile(new URL("../references/GENERATION_WORKFLOW.md", import.meta.url), "utf8"),
  ]);
  const contract = `${skill}\n${boundaries}\n${practice}\n${workflow}`;
  for (const phrase of ["probe-anchors", "nativeClickable: true", "A 档", "B 档", "二次确认", "Page.captureScreenshot", "cleanup", "127.0.0.1"]) {
    assert.match(contract, new RegExp(phrase.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }
  assert.match(contract, /不允许任意 CSS\/JavaScript、自由选择器、网络、fetch、IPC、剪贴板或聊天内容操作/);
  assert.match(contract, /不绕过 WorkBuddy 的计费、权限或安全提示/);
  assert.match(contract, /固定槽位/);
  assert.match(contract, /module-slots\.mjs/);
  assert.match(contract, /不接受 AI 自由字符串|禁止模型自由定位/);
  for (const phrase of ["$nonelinear-image", "gpt-image-2", "quality=low", "三次单图背景调用", "不自动重试", "公开 HTTPS URL", "不承诺远端删除", "home-scene-v1", "copySets", "专注", "轻松", "活力"]) {
    assert.match(contract, new RegExp(phrase.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }
  assert.match(contract, /不得改用 WorkBuddy 内置图片生成工具、`nl` CLI、`curl`/);
  assert.match(contract, /不得保存 API key、Authorization、大 base64/);
  assert.match(skill, /\$\{CODEBUDDY_SKILL_DIR\}/);
  assert.match(skill, /WorkBuddy 桌面端内部运行.*不依赖 Codex/);
  for (const phrase of ["run-backgrounds", "run-derived", "前台命令", "并行", "660秒", "每15秒", "wait/read", "保存当前主题（下次启动）", "outcome_unknown", "n=1", "默认方案1"]) assert.match(contract, new RegExp(phrase.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
});
