import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("SKILL 固化锚点探测、A/B 门禁、自检和恢复边界", async () => {
  const skill = await readFile(new URL("../SKILL.md", import.meta.url), "utf8");
  for (const phrase of ["probe-anchors", "nativeClickable: true", "A 档", "B 档", "二次确认", "inspect-modules", "Page.captureScreenshot", "state.cleanup()", "127.0.0.1"]) {
    assert.match(skill, new RegExp(phrase.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }
  assert.match(skill, /不读取或修改网络请求、fetch、IPC、剪贴板、聊天内容/);
  assert.match(skill, /不绕过 WorkBuddy 的计费、权限、安全提示/);
  assert.match(skill, /固定组件槽位/);
  assert.match(skill, /module-slots\.mjs/);
  assert.match(skill, /禁止模型自由定位/);
  for (const phrase of ["$nonelinear-image", "gpt-image-2", "quality=low", "初始请求只授权一次背景调用", "失败不自动重试", "公开 HTTPS URL", "不承诺远端删除", "home-scene-v1"]) {
    assert.match(skill, new RegExp(phrase.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }
  assert.match(skill, /不得改用 WorkBuddy 内置图片生成工具、`nl` CLI、`curl`/);
  assert.match(skill, /不得保存 API key、Authorization、大 base64/);
  assert.match(skill, /\$\{CODEBUDDY_SKILL_DIR\}/);
  assert.match(skill, /不得从正在运行的 WorkBuddy Skill 中直接执行/);
});
