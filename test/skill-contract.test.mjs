import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("主 Skill 只允许背景和受限粒子，并禁止旧组件模板", async () => {
  const [skill, boundaries, practice, workflow, jobScript] = await Promise.all([
    readFile(new URL("../SKILL.md", import.meta.url), "utf8"),
    readFile(new URL("../references/MODULE_BOUNDARIES.md", import.meta.url), "utf8"),
    readFile(new URL("../docs/PRACTICE.md", import.meta.url), "utf8"),
    readFile(new URL("../references/GENERATION_WORKFLOW.md", import.meta.url), "utf8"),
    readFile(new URL("../scripts/theme-generation-job.mjs", import.meta.url), "utf8"),
  ]);
  const contract = `${skill}\n${boundaries}\n${practice}\n${workflow}`;
  for (const phrase of ["$nonelinear-image", "background-v1", "particle-v1", "三次单图背景调用", "透明 PNG", "gpt-image-2", "quality=low", "n=1", "不自动重试", "公开 HTTPS URL", "不作承诺", "127.0.0.1", "outcome_unknown"]) {
    assert.match(contract, new RegExp(phrase.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }
  assert.match(contract, /禁止使用旧模板 `home-scene-v1`/);
  assert.match(contract, /不得出现 `copy`、`copySets`、`homeHeader` 或 `modules`/);
  assert.match(jobScript, /TEMPLATE_VERSION = "background-v1"/);
  assert.match(jobScript, /IMAGE_ROLES = Object\.freeze\(\["background"\]\)/);
  assert.match(jobScript, /PARTICLE_TEMPLATE_VERSION = "particle-v1"/);
  assert.match(jobScript, /run-particles/);
  assert.match(jobScript, /仅背景模式不再生成装饰模块/);
  assert.doesNotMatch(skill, /共8次|五次模块调用|三套结构化文案/);
  assert.match(skill, /\$\{CODEBUDDY_SKILL_DIR\}/);
  assert.match(skill, /WorkBuddy 桌面端内部运行.*不依赖 Codex/);
});
