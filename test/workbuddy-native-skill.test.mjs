import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("Release Skill 只执行背景工作流", async () => {
  const [skill, tutorial, setup, packager, packageJson] = await Promise.all([
    readFile(new URL("../SKILL.md", import.meta.url), "utf8"),
    readFile(new URL("../docs/BEGINNER_WORKBUDDY_THEME.md", import.meta.url), "utf8"),
    readFile(new URL("../references/NONELINEAR_SETUP.md", import.meta.url), "utf8"),
    readFile(new URL("../scripts/package-workbuddy-skills.ps1", import.meta.url), "utf8"),
    readFile(new URL("../package.json", import.meta.url), "utf8"),
  ]);
  assert.match(skill, /allowed-tools: Read, Write, Bash/);
  assert.match(skill, /同一 WorkBuddy 任务中已启用的 `\$nonelinear-image`/);
  assert.match(skill, /run-backgrounds/);
  assert.doesNotMatch(skill, /一个前台 `run-derived`|五张模块|三套文案/);
  assert.match(tutorial, /在 WorkBuddy 新建任务/);
  assert.match(tutorial, /WorkBuddy-Skin-Lab-1\.3\.1-Skill\.zip/);
  assert.doesNotMatch(tutorial, /在 Codex 中|启动 Codex|重新运行 `codex`/i);
  assert.match(setup, /WorkBuddy-Skin-Lab-1\.3\.1-Skill\.zip/);
  assert.match(setup, /NoneLinear-Image-0\.1\.0-Skill\.zip/);
  assert.match(packager, /Compress-Archive/);
  assert.match(packager, /CODEBUDDY_SKILL_DIR/);
  assert.equal(JSON.parse(packageJson).version, "1.3.1");
});
