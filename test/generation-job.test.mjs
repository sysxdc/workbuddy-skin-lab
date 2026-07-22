import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
  IMAGE_MODEL,
  IMAGE_QUALITY,
  credentialConfigured,
  fixedManifest,
  publicHttpsUrl,
  run,
  validateGenerationSpec,
} from "../scripts/theme-generation-job.mjs";

const validSpec = {
  template: "home-scene-v1",
  name: "暮色纸灯",
  colors: { accent: "#d98b5f", secondary: "#e9c46a", surface: "#1d1a20", text: "#fff7ed" },
  art: { focusX: 0.68, focusY: 0.48, safeArea: "left" },
  copy: {
    homeHeader: { title: "暮色纸灯", subtitle: "在静谧灯影里继续今天" },
    hero: { eyebrow: "TWILIGHT STUDIO", title: "在柔光里完成今天", subtitle: "保持节奏，让原生工作流继续服务。", badge: "专注中" },
    scenes: {
      daily: { meaning: "office", title: "日常办公" },
      code: { meaning: "development", title: "代码开发" },
      design: { meaning: "creative", title: "设计创意" },
    },
    composerLabel: "纸灯陪伴装饰",
  },
};

test("凭据只接受批准的优先级和严格 NoneLinear HTTPS 主机", () => {
  assert.equal(credentialConfigured({ NONELINEAR_API_KEY: "nl-direct" }), true);
  assert.equal(credentialConfigured({ Nonelinear_API_KEY: "nl-compatible" }), true);
  assert.equal(credentialConfigured({ OPENAI_API_KEY: "secret", OPENAI_BASE_URL: "https://api.nonelinear.com/v1" }), true);
  assert.equal(credentialConfigured({ OPENAI_API_KEY: "secret", OPENAI_BASE_URL: "https://api.nonelinear.com.evil.example" }), false);
  assert.equal(credentialConfigured({ ANTHROPIC_API_KEY: "secret", ANTHROPIC_BASE_URL: "http://api.nonelinear.com" }), false);
});

test("固定模板不序列化内部挂载字段、action 或自由布局", () => {
  const manifest = fixedManifest(validateGenerationSpec(validSpec), "twilight-lamp");
  assert.deepEqual(manifest.homeHeader, validSpec.copy.homeHeader);
  assert.equal(manifest.modules.length, 5);
  assert.deepEqual(manifest.modules.map(({ id, slot, order }) => [id, slot, order]), [
    ["home-welcome", "home-hero", 0],
    ["scene-daily", "scene-icon", 0],
    ["scene-code", "scene-icon", 1],
    ["scene-design", "scene-icon", 2],
    ["composer-companion", "composer-float", 0],
  ]);
  for (const module of manifest.modules) {
    for (const forbidden of ["mount", "hostPath", "minAnchor", "textLimits", "requiredText", "action"]) assert.equal(forbidden in module, false);
  }
  assert.throws(() => validateGenerationSpec({ ...validSpec, copy: { ...validSpec.copy, scenes: { ...validSpec.copy.scenes, code: { meaning: "chat", title: "聊天" } } } }), /development/);
  assert.throws(() => validateGenerationSpec({ ...validSpec, copy: { ...validSpec.copy, homeHeader: { title: "", subtitle: "说明" } } }), /copy\.homeHeader\.title/);
});

test("公开图片 URL 拒绝 localhost、私网、凭据和非 HTTPS", () => {
  assert.equal(publicHttpsUrl("https://cdn.example.com/image.png"), "https://cdn.example.com/image.png");
  for (const url of ["http://cdn.example.com/a.png", "https://localhost/a.png", "https://127.0.0.1/a.png", "https://10.0.0.1/a.png", "https://user:pass@cdn.example.com/a.png"]) {
    assert.throws(() => publicHttpsUrl(url), /公开 HTTPS/);
  }
});

test("作业初始只授权背景一次，失败不重试，派生素材需背景确认", async (t) => {
  const root = await mkdtemp(join(process.cwd(), ".test-generation-job-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const jobs = join(root, "jobs");
  const themes = join(root, "themes");
  const prompt = join(root, "prompt.txt");
  const fakeSkill = join(root, "fake-skill.mjs");
  await writeFile(prompt, "soft twilight background without text", "utf8");
  await writeFile(fakeSkill, `
    const args = process.argv.slice(2);
    const value = (key) => args[args.indexOf(key) + 1];
    const url = new URL("https://cdn.example.com/generated.png");
    url.searchParams.set("model", value("--model"));
    url.searchParams.set("quality", value("--quality"));
    url.searchParams.set("format", value("--response-format"));
    process.stdout.write(JSON.stringify({status:"completed",images:[{url:url.href}],request_id:"req-redacted"}));
  `, "utf8");
  const initialized = await run(["init", "--name", "测试主题", "--prompt-file", prompt, "--jobs-root", jobs, "--store-root", themes]);
  const status = await run(["status", "--job", initialized.jobId, "--jobs-root", jobs, "--store-root", themes]);
  assert.equal(status.callsAuthorized.background, 1);
  for (const role of ["home-welcome", "scene-daily", "scene-code", "scene-design", "composer-companion"]) assert.equal(status.callsAuthorized[role], 0);
  const generated = await run(["run-image", "--job", initialized.jobId, "--role", "background", "--prompt-file", prompt, "--skill-script", fakeSkill, "--jobs-root", jobs, "--store-root", themes]);
  assert.equal(generated.status, "completed");
  assert.match(generated.url, /model=gpt-image-2/);
  assert.match(generated.url, /quality=low/);
  assert.match(generated.url, /format=url/);
  assert.equal(IMAGE_MODEL, "gpt-image-2");
  assert.equal(IMAGE_QUALITY, "low");
  await assert.rejects(run(["run-image", "--job", initialized.jobId, "--role", "background", "--prompt-file", prompt, "--skill-script", fakeSkill, "--jobs-root", jobs, "--store-root", themes]), /没有新的计费调用授权/);
  await assert.rejects(run(["run-image", "--job", initialized.jobId, "--role", "scene-code", "--prompt-file", prompt, "--skill-script", fakeSkill, "--jobs-root", jobs, "--store-root", themes]), /没有新的计费调用授权|背景并授权/);
  await run(["confirm", "--job", initialized.jobId, "--gate", "background", "--jobs-root", jobs, "--store-root", themes]);
  const afterConfirm = JSON.parse(await readFile(join(jobs, initialized.jobId, "job.json"), "utf8"));
  assert.equal(afterConfirm.callsAuthorized["scene-code"], 1);
  assert.equal(JSON.stringify(afterConfirm).includes("Authorization"), false);
  await assert.rejects(run(["confirm", "--job", initialized.jobId, "--gate", "background", "--jobs-root", jobs, "--store-root", themes]), /已经确认/);
  afterConfirm.outputs.background.url = null;
  await writeFile(join(jobs, initialized.jobId, "job.json"), JSON.stringify(afterConfirm), "utf8");
  await run(["run-image", "--job", initialized.jobId, "--role", "scene-code", "--prompt-file", prompt, "--skill-script", fakeSkill, "--jobs-root", jobs, "--store-root", themes]);
  const beforeDerivedRetry = JSON.parse(await readFile(join(jobs, initialized.jobId, "job.json"), "utf8"));
  beforeDerivedRetry.confirmations.final = true;
  beforeDerivedRetry.verification = { passed: true };
  beforeDerivedRetry.homeProof = { targetId: "old" };
  beforeDerivedRetry.needsBuild = false;
  await writeFile(join(jobs, initialized.jobId, "job.json"), JSON.stringify(beforeDerivedRetry), "utf8");
  await run(["authorize", "--job", initialized.jobId, "--call", "scene-code", "--jobs-root", jobs, "--store-root", themes]);
  const afterDerivedRetry = JSON.parse(await readFile(join(jobs, initialized.jobId, "job.json"), "utf8"));
  assert.equal(afterDerivedRetry.confirmations.final, false);
  assert.equal(afterDerivedRetry.verification, null);
  assert.equal(afterDerivedRetry.homeProof, null);
  assert.equal(afterDerivedRetry.needsBuild, true);
  assert.equal(afterDerivedRetry.outputs["scene-code"], null);
  await run(["authorize", "--job", initialized.jobId, "--call", "background", "--jobs-root", jobs, "--store-root", themes]);
  const revision = JSON.parse(await readFile(join(jobs, initialized.jobId, "job.json"), "utf8"));
  assert.equal(revision.confirmations.background, false);
  assert.equal(revision.outputs.background, null);
  assert.equal(revision.callsAuthorized["scene-code"], 1);
});

test("NoneLinear 空输出记为 outcome_unknown，不留下 running 孤儿也不自动重试", async (t) => {
  const root = await mkdtemp(join(process.cwd(), ".test-generation-empty-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const jobs = join(root, "jobs");
  const themes = join(root, "themes");
  const prompt = join(root, "prompt.txt");
  const emptySkill = join(root, "empty-skill.mjs");
  await writeFile(prompt, "one paid background", "utf8");
  await writeFile(emptySkill, "process.exitCode = 0;", "utf8");
  const initialized = await run(["init", "--name", "空输出测试", "--prompt-file", prompt, "--jobs-root", jobs, "--store-root", themes]);
  const result = await run(["run-image", "--job", initialized.jobId, "--role", "background", "--prompt-file", prompt, "--skill-script", emptySkill, "--jobs-root", jobs, "--store-root", themes]);
  assert.deepEqual([result.status, result.code, result.outcome], ["failed", "skill_transport_error", "unknown"]);
  const status = await run(["status", "--job", initialized.jobId, "--jobs-root", jobs, "--store-root", themes]);
  assert.equal(status.calls[0].status, "outcome_unknown");
  await assert.rejects(run(["run-image", "--job", initialized.jobId, "--role", "background", "--prompt-file", prompt, "--skill-script", emptySkill, "--jobs-root", jobs, "--store-root", themes]), /没有新的计费调用授权/);
});

test("resume 自动找到最近作业并给出唯一下一步或已保存主题", async (t) => {
  const root = await mkdtemp(join(process.cwd(), ".test-generation-resume-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const jobs = join(root, "jobs");
  const themes = join(root, "themes");
  const prompt = join(root, "prompt.txt");
  await writeFile(prompt, "resume workflow", "utf8");
  await run(["init", "--name", "普通作业", "--prompt-file", prompt, "--jobs-root", jobs, "--store-root", themes]);
  const latest = await run(["init", "--name", "参考图作业", "--prompt-file", prompt, "--reference", join(root, "reference.png"), "--jobs-root", jobs, "--store-root", themes]);
  const resumed = await run(["resume", "--jobs-root", jobs, "--store-root", themes]);
  assert.equal(resumed.jobId, latest.jobId);
  assert.equal(resumed.nextAction, "confirm-upload");
  assert.equal(resumed.progress.ready, 0);
  assert.equal(resumed.progress.total, 6);
  assert.equal(resumed.requiresUser, true);
  const latestPath = join(jobs, latest.jobId, "job.json");
  const accepted = JSON.parse(await readFile(latestPath, "utf8"));
  accepted.status = "accepted";
  accepted.updatedAt = "2999-01-01T00:00:00.000Z";
  accepted.needsBuild = false;
  accepted.theme = { id: "saved-theme", path: join(themes, "saved-theme") };
  accepted.validation = { background: { asset: "background.jpg" }, modules: ["home-welcome", "scene-daily", "scene-code", "scene-design", "composer-companion"].map((id) => ({ id })) };
  await writeFile(latestPath, JSON.stringify(accepted), "utf8");
  const completed = await run(["resume", "--jobs-root", jobs, "--store-root", themes]);
  assert.equal(completed.nextAction, "apply-theme");
  assert.equal(completed.progress.ready, 6);
  assert.equal(completed.requiresUser, false);
});

test("build 只展开固定模板并继续经过主题加载校验，discard 可恢复且清临时记录", async () => {
  const root = await mkdtemp(join(tmpdir(), "wb-generation-build-"));
  const jobs = join(root, "jobs");
  const themes = join(root, "themes");
  const discarded = join(root, "discarded");
  const prompt = join(root, "prompt.txt");
  const specPath = join(root, "generation-spec.json");
  await writeFile(prompt, "fixed template", "utf8");
  await writeFile(specPath, JSON.stringify(validSpec), "utf8");
  const initialized = await run(["init", "--name", "构建测试", "--prompt-file", prompt, "--jobs-root", jobs, "--store-root", themes, "--discarded-root", discarded]);
  const jobRoot = join(jobs, initialized.jobId);
  const normalizedRoot = join(jobRoot, "normalized");
  await mkdir(normalizedRoot, { recursive: true });
  const jobPath = join(jobRoot, "job.json");
  const job = JSON.parse(await readFile(jobPath, "utf8"));
  for (const role of ["background", "home-welcome", "scene-daily", "scene-code", "scene-design", "composer-companion"]) {
    const name = role === "background" ? "background.jpg" : `${role}.png`;
    await writeFile(join(normalizedRoot, name), role === "background" ? Buffer.from([0xff, 0xd8, 0xff, 0xd9]) : Buffer.from("\x89PNG\r\n\x1a\nfixture"));
    job.outputs[role] = { url: `https://cdn.example.com/${role}.png`, downloaded: `downloads/${role}.png`, normalized: `normalized/${name}` };
  }
  await writeFile(jobPath, JSON.stringify(job), "utf8");
  await assert.rejects(run(["build", "--job", initialized.jobId, "--spec", specPath, "--jobs-root", jobs, "--store-root", themes, "--discarded-root", discarded]), /并入 verify-home/);
  const proof = { capturedAt: new Date().toISOString(), targetId: "home-target", anchors: { "scene-tabs": { present: true, rect: { width: 296, height: 36 } }, "home-composer": { present: true, rect: { width: 752, height: 224 } } } };
  const verificationRoot = join(jobRoot, "verification");
  await mkdir(verificationRoot, { recursive: true });
  const screenshots = { applied: join(verificationRoot, "applied.png"), overlay: join(verificationRoot, "overlay.png"), reapplied: join(verificationRoot, "reapplied.png") };
  for (const path of Object.values(screenshots)) await writeFile(path, Buffer.from("png"));
  const verification = {
    passed: true, verifiedAt: new Date().toISOString(), targetId: proof.targetId, themeId: null, pageMode: "home",
    anchors: proof.anchors, modules: ["composer-companion", "home-welcome", "scene-code", "scene-daily", "scene-design"],
    overlayChecked: true, pauseClean: true, reapplyPassed: true,
    screenshots,
  };
  const built = await run(["verify-home", "--job", initialized.jobId, "--spec", specPath, "--wait", "1", "--jobs-root", jobs, "--store-root", themes, "--discarded-root", discarded], {
    waitForHomeAnchors: async () => proof,
    verifyHomeTheme: async ({ loadedTheme }) => ({ ...verification, themeId: loadedTheme.manifest.id }),
  });
  assert.equal(built.jobStatus, "verified");
  const verifiedStatus = await run(["status", "--job", initialized.jobId, "--jobs-root", jobs, "--store-root", themes, "--discarded-root", discarded]);
  const themePath = verifiedStatus.theme.path;
  const manifest = JSON.parse(await readFile(join(themePath, "theme.json"), "utf8"));
  assert.equal(manifest.modules.length, 5);
  assert.equal(JSON.stringify(manifest).includes("hostPath"), false);
  await run(["confirm", "--job", initialized.jobId, "--gate", "final", "--jobs-root", jobs, "--store-root", themes, "--discarded-root", discarded]);
  const accepted = await run(["accept", "--job", initialized.jobId, "--jobs-root", jobs, "--store-root", themes, "--discarded-root", discarded]);
  assert.equal(accepted.themeId, manifest.id);
  const reopened = await run(["reopen-verification", "--job", initialized.jobId, "--jobs-root", jobs, "--store-root", themes, "--discarded-root", discarded]);
  assert.equal(reopened.jobStatus, "awaiting-home-verification");
  const discardedResult = await run(["discard", "--job", initialized.jobId, "--jobs-root", jobs, "--store-root", themes, "--discarded-root", discarded]);
  assert.equal(discardedResult.recoverable, true);
  const finalJob = JSON.parse(await readFile(jobPath, "utf8"));
  for (const output of Object.values(finalJob.outputs)) assert.deepEqual([output.url, output.downloaded, output.normalized], [null, null, null]);
});

test("accept 拒绝任务页或未完成机器验收的作业", async () => {
  const root = await mkdtemp(join(tmpdir(), "wb-generation-accept-"));
  const jobs = join(root, "jobs");
  const themes = join(root, "themes");
  const prompt = join(root, "prompt.txt");
  await writeFile(prompt, "accept gate", "utf8");
  const initialized = await run(["init", "--name", "验收门禁", "--prompt-file", prompt, "--jobs-root", jobs, "--store-root", themes]);
  await assert.rejects(run(["confirm", "--job", initialized.jobId, "--gate", "final", "--jobs-root", jobs, "--store-root", themes]), /verify-home|预览主题/);
  await assert.rejects(run(["accept", "--job", initialized.jobId, "--jobs-root", jobs, "--store-root", themes]), /verify-home/);
});
