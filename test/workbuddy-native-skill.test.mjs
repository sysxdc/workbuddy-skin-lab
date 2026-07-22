import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("最终用户流程只在 WorkBuddy 对话中调用两个原生 Skill", async () => {
  const [skill, tutorial, setup, packager, packageJson] = await Promise.all([
    readFile(new URL("../SKILL.md", import.meta.url), "utf8"),
    readFile(new URL("../docs/BEGINNER_WORKBUDDY_THEME.md", import.meta.url), "utf8"),
    readFile(new URL("../references/NONELINEAR_SETUP.md", import.meta.url), "utf8"),
    readFile(new URL("../scripts/package-workbuddy-skills.ps1", import.meta.url), "utf8"),
    readFile(new URL("../package.json", import.meta.url), "utf8"),
  ]);
  assert.match(skill, /allowed-tools: Read, Write, Bash/);
  assert.match(skill, /WorkBuddy 桌面端内部运行，不依赖 Codex/);
  assert.match(skill, /同一 WorkBuddy 任务中已启用的 `\$nonelinear-image`/);
  assert.match(skill, /只启动一次前台命令 `run-derived/);
  assert.match(skill, /不能启动后台进程、重复提交或让用户反复发送/);
  assert.match(tutorial, /更多 → 专家·技能·连接器 → 技能/);
  assert.match(tutorial, /在 WorkBuddy 中发出主题需求/);
  assert.doesNotMatch(tutorial, /在 Codex 中|启动 Codex|重新运行 `codex`/i);
  assert.match(setup, /WorkBuddy-Skin-Lab-1\.2\.1-rc\.1-Skill\.zip/);
  assert.match(setup, /NoneLinear-Image-0\.1\.0-Skill\.zip/);
  assert.match(packager, /Compress-Archive/);
  assert.match(packager, /CODEBUDDY_SKILL_DIR/);
  assert.equal(JSON.parse(packageJson).scripts["package:workbuddy"].includes("package-workbuddy-skills.ps1"), true);
});
