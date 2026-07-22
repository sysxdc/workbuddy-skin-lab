import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
  IMAGE_MODEL,
  IMAGE_PROCESS_TIMEOUT_MS,
  IMAGE_QUALITY,
  IMAGE_TIMEOUT_MS,
  credentialConfigured,
  fixedManifest,
  publicHttpsUrl,
  run,
  startForegroundHeartbeat,
  validateGenerationSpec,
} from "../scripts/theme-generation-job.mjs";
import { run as runControlledImage } from "../scripts/run-nonelinear-image.mjs";

const validSpec = {
  template: "home-scene-v1",
  name: "暮色纸灯",
  colors: { accent: "#d98b5f", secondary: "#e9c46a", surface: "#1d1a20", text: "#fff7ed" },
  art: { focusX: 0.68, focusY: 0.48, safeArea: "left" },
  copy: {
    homeHeader: { title: "暮色纸灯", subtitle: "在静谧灯影里继续今天" },
    hero: { eyebrow: "TWILIGHT STUDIO", title: "在柔光里完成今天", subtitle: "保持节奏，让原生工作流继续服务。" },
    scenes: {
      daily: { meaning: "office", title: "日常办公" },
      code: { meaning: "development", title: "代码开发" },
      design: { meaning: "creative", title: "设计创意" },
    },
    composerLabel: "纸灯陪伴装饰",
  },
};

test("前台生图心跳立即输出并可完整停止", () => {
  const messages = [];
  let tick = null;
  let cleared = false;
  const stop = startForegroundHeartbeat({
    label: "五张派生素材",
    writer: (message) => messages.push(message),
    setIntervalFn: (callback, milliseconds) => { assert.equal(milliseconds, 15_000); tick = callback; return 7; },
    clearIntervalFn: (timer) => { assert.equal(timer, 7); cleared = true; },
  });
  assert.match(messages[0], /五张派生素材.*当前窗口/);
  tick();
  assert.match(messages[1], /仍在等待/);
  stop();
  assert.equal(cleared, true);
});

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
  assert.equal(manifest.background, "background-1.jpg");
  assert.deepEqual(manifest.backgrounds.map(({ id, label, asset }) => [id, label, asset]), [
    ["background-1", "方案1", "background-1.jpg"],
    ["background-2", "方案2", "background-2.jpg"],
    ["background-3", "方案3", "background-3.jpg"],
  ]);
  assert.deepEqual(manifest.copySets.map(({ id, label }) => [id, label]), [
    ["focus", "专注"],
    ["relaxed", "轻松"],
    ["energy", "活力"],
  ]);
  assert.equal(manifest.modules.length, 5);
  assert.equal("badge" in manifest.modules[0].text, false);
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

test("一次确认后用三个 n=1 调用并行生成三张背景", async (t) => {
  const root = await mkdtemp(join(process.cwd(), ".test-generation-job-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const jobs = join(root, "jobs");
  const themes = join(root, "themes");
  const prompt = join(root, "prompt.txt");
  const fakeSkill = join(root, "fake-skill.mjs");
  await writeFile(prompt, "soft twilight background without text", "utf8");
  await writeFile(fakeSkill, `
    export async function run(args, dependencies) {
    const value = (key) => args[args.indexOf(key) + 1];
    const url = new URL("https://cdn.example.com/generated.png");
    url.searchParams.set("model", value("--model"));
    url.searchParams.set("quality", value("--quality"));
    url.searchParams.set("format", value("--response-format"));
    url.searchParams.set("timeout", dependencies.timeoutMs);
    const count = args.includes("--n") ? Number(value("--n")) : 1;
    if (args.includes("--n")) url.searchParams.set("n", value("--n"));
    return {status:"completed",images:Array.from({length:count},(_,index)=>({url:url.href+"&image="+(index+1)})),request_id:"req-redacted"};
    }
  `, "utf8");
  const initialized = await run(["init", "--name", "测试主题", "--prompt-file", prompt, "--jobs-root", jobs, "--store-root", themes]);
  const status = await run(["status", "--job", initialized.jobId, "--jobs-root", jobs, "--store-root", themes]);
  assert.equal(status.callsAuthorized.background, 0);
  assert.equal(status.nextAction, "confirm-generation");
  await run(["confirm", "--job", initialized.jobId, "--gate", "generation", "--jobs-root", jobs, "--store-root", themes]);
  const authorized = await run(["status", "--job", initialized.jobId, "--jobs-root", jobs, "--store-root", themes]);
  assert.equal(authorized.callsAuthorized.background, 3);
  for (const role of ["home-welcome", "scene-daily", "scene-code", "scene-design", "composer-companion"]) assert.equal(authorized.callsAuthorized[role], 1);
  const generated = await run(["run-backgrounds", "--job", initialized.jobId, "--prompt-file", prompt, "--skill-script", fakeSkill, "--jobs-root", jobs, "--store-root", themes]);
  assert.equal(generated.status, "completed");
  assert.equal(generated.urls.length, 3);
  assert.match(generated.defaultUrl, /model=gpt-image-2/);
  assert.match(generated.defaultUrl, /quality=low/);
  assert.match(generated.defaultUrl, /format=url/);
  assert.match(generated.defaultUrl, /timeout=600000/);
  assert.doesNotMatch(generated.defaultUrl, /[?&]n=/);
  assert.equal(IMAGE_MODEL, "gpt-image-2");
  assert.equal(IMAGE_QUALITY, "low");
  const noDuplicate = await run(["run-backgrounds", "--job", initialized.jobId, "--prompt-file", prompt, "--skill-script", fakeSkill, "--jobs-root", jobs, "--store-root", themes]);
  assert.equal(noDuplicate.completed, 0);
  const generatedJobPath = join(jobs, initialized.jobId, "job.json");
  const afterConfirm = JSON.parse(await readFile(generatedJobPath, "utf8"));
  assert.equal(afterConfirm.outputs.background.candidates.length, 3);
  assert.equal(JSON.stringify(afterConfirm).includes("Authorization"), false);
  afterConfirm.outputs.background.url = null;
  for (const candidate of afterConfirm.outputs.background.candidates) candidate.url = null;
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
  await run(["authorize", "--job", initialized.jobId, "--call", "background", "--count", "3", "--jobs-root", jobs, "--store-root", themes]);
  const revision = JSON.parse(await readFile(join(jobs, initialized.jobId, "job.json"), "utf8"));
  assert.equal(revision.outputs.background, null);
  assert.equal(revision.callsAuthorized["scene-code"], 1);
});

test("背景批次部分失败时保留成功候选且不自动补图", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "wb-generation-short-background-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const jobs = join(root, "jobs");
  const themes = join(root, "themes");
  const prompt = join(root, "prompt.txt");
  const fakeSkill = join(root, "fake-skill.mjs");
  await writeFile(prompt, "three background candidates without text", "utf8");
  await writeFile(fakeSkill, "export async function run() {}", "utf8");
  const initialized = await run(["init", "--name", "不足三图", "--prompt-file", prompt, "--jobs-root", jobs, "--store-root", themes]);
  await run(["confirm", "--job", initialized.jobId, "--gate", "generation", "--jobs-root", jobs, "--store-root", themes]);
  const result = await run(["run-backgrounds", "--job", initialized.jobId, "--prompt-file", prompt, "--skill-script", fakeSkill, "--jobs-root", jobs, "--store-root", themes], {
    executeImageProcess: async ({ candidateIndex }) => candidateIndex === 2
      ? ({ code: 1, timedOut: false, stdout: JSON.stringify({ status: "failed", code: "api_error", error: "provider failure" }) })
      : ({ code: 0, timedOut: false, stdout: JSON.stringify({ status: "completed", images: [{ url: `https://cdn.example.com/${candidateIndex + 1}.jpg` }] }) }),
  });
  assert.deepEqual([result.status, result.completed, result.failed, result.candidateCount], ["failed", 2, 1, 2]);
  const status = await run(["status", "--job", initialized.jobId, "--jobs-root", jobs, "--store-root", themes]);
  assert.equal(status.calls.filter(({ role }) => role === "background").length, 3);
  assert.equal(status.outputs.background.candidateCount, 2);
  assert.equal(status.nextAction, "authorize-background");
  assert.equal(status.suggestedCount, 1);
  await assert.rejects(run(["ingest", "--job", initialized.jobId, "--role", "background", "--jobs-root", jobs, "--store-root", themes]), /完整返回三张/);
  await run(["authorize", "--job", initialized.jobId, "--call", "background", "--count", "1", "--jobs-root", jobs, "--store-root", themes]);
  const recovered = await run(["status", "--job", initialized.jobId, "--jobs-root", jobs, "--store-root", themes]);
  assert.equal(recovered.outputs.background.candidateCount, 2);
  assert.equal(recovered.nextAction, "run-background");
});

test("rc.1 单图失败作业可沿原 jobId 授权三次替代调用恢复", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "wb-generation-rc1-recovery-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const jobs = join(root, "jobs");
  const themes = join(root, "themes");
  const prompt = join(root, "prompt.txt");
  const fakeSkill = join(root, "fake-skill.mjs");
  await writeFile(prompt, "recover old single output job", "utf8");
  await writeFile(fakeSkill, "export async function run() {}", "utf8");
  const initialized = await run(["init", "--name", "旧作业恢复", "--prompt-file", prompt, "--jobs-root", jobs, "--store-root", themes]);
  const jobPath = join(jobs, initialized.jobId, "job.json");
  const job = JSON.parse(await readFile(jobPath, "utf8"));
  job.confirmations.generation = true;
  job.confirmations.background = true;
  job.callsAuthorized.background = 1;
  for (const role of ["home-welcome", "scene-daily", "scene-code", "scene-design", "composer-companion"]) job.callsAuthorized[role] = 1;
  job.calls.push({ role: "background", status: "failed", code: "incomplete_image_output", startedAt: new Date().toISOString(), finishedAt: new Date().toISOString() });
  await writeFile(jobPath, JSON.stringify(job), "utf8");
  const before = await run(["resume", "--job", initialized.jobId, "--jobs-root", jobs, "--store-root", themes]);
  assert.deepEqual([before.nextAction, before.suggestedCount], ["authorize-background", 3]);
  await run(["authorize", "--job", initialized.jobId, "--call", "background", "--count", "3", "--jobs-root", jobs, "--store-root", themes]);
  const result = await run(["run-backgrounds", "--job", initialized.jobId, "--prompt-file", prompt, "--skill-script", fakeSkill, "--jobs-root", jobs, "--store-root", themes], {
    executeImageProcess: async ({ candidateIndex }) => ({ code: 0, timedOut: false, stdout: JSON.stringify({ status: "completed", images: [{ url: `https://cdn.example.com/recovered-${candidateIndex + 1}.jpg` }] }) }),
  });
  assert.deepEqual([result.status, result.completed, result.candidateCount], ["completed", 3, 3]);
  assert.equal((await run(["resume", "--job", initialized.jobId, "--jobs-root", jobs, "--store-root", themes])).nextAction, "ingest-background");
});

test("五张派生素材在一个可追溯的前台命令中并行等待完成", async (t) => {
  const root = await mkdtemp(join(process.cwd(), ".test-generation-derived-batch-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const jobs = join(root, "jobs");
  const themes = join(root, "themes");
  const prompt = join(root, "prompt.txt");
  const promptDir = join(root, "derived-prompts");
  const fakeSkill = join(root, "fake-skill.mjs");
  await mkdir(promptDir, { recursive: true });
  await writeFile(prompt, "foreground parallel workflow", "utf8");
  await writeFile(fakeSkill, "export async function run() {}", "utf8");
  const initialized = await run(["init", "--name", "前台并行", "--prompt-file", prompt, "--jobs-root", jobs, "--store-root", themes]);
  await run(["confirm", "--job", initialized.jobId, "--gate", "generation", "--jobs-root", jobs, "--store-root", themes]);
  const jobPath = join(jobs, initialized.jobId, "job.json");
  const job = JSON.parse(await readFile(jobPath, "utf8"));
  job.outputs.background = { url: null, normalized: "normalized/background.jpg", previewedAt: new Date().toISOString(), sourceMode: "generate" };
  await writeFile(jobPath, JSON.stringify(job), "utf8");
  const roles = ["home-welcome", "scene-daily", "scene-code", "scene-design", "composer-companion"];
  for (const role of roles) await writeFile(join(promptDir, `${role}.txt`), `${role} prompt`, "utf8");
  let active = 0;
  let maxActive = 0;
  const result = await run(["run-derived", "--job", initialized.jobId, "--prompt-dir", promptDir, "--skill-script", fakeSkill, "--jobs-root", jobs, "--store-root", themes], {
    executeImageProcess: async ({ role }) => {
      active += 1;
      maxActive = Math.max(maxActive, active);
      await new Promise((resolvePromise) => setTimeout(resolvePromise, 30));
      active -= 1;
      return { code: 0, timedOut: false, stdout: JSON.stringify({ status: "completed", images: [{ url: `https://cdn.example.com/${role}.png` }], request_id: `request-${role}` }) };
    },
  });
  assert.equal(result.status, "completed");
  assert.equal(result.completed, 5);
  assert.equal(maxActive, 5);
  const saved = JSON.parse(await readFile(jobPath, "utf8"));
  assert.deepEqual(saved.calls.filter(({ role }) => roles.includes(role)).map(({ role, status }) => [role, status]).sort(), roles.map((role) => [role, "completed"]).sort());
  assert.equal(roles.every((role) => saved.outputs[role]?.url), true);
});

test("派生并行批次部分失败时完整记账且不自动重试", async (t) => {
  const root = await mkdtemp(join(process.cwd(), ".test-generation-derived-failure-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const jobs = join(root, "jobs");
  const themes = join(root, "themes");
  const prompt = join(root, "prompt.txt");
  const promptDir = join(root, "derived-prompts");
  const fakeSkill = join(root, "fake-skill.mjs");
  await mkdir(promptDir, { recursive: true });
  await writeFile(prompt, "partial failure", "utf8");
  await writeFile(fakeSkill, "export async function run() {}", "utf8");
  const initialized = await run(["init", "--name", "部分失败", "--prompt-file", prompt, "--jobs-root", jobs, "--store-root", themes]);
  await run(["confirm", "--job", initialized.jobId, "--gate", "generation", "--jobs-root", jobs, "--store-root", themes]);
  const jobPath = join(jobs, initialized.jobId, "job.json");
  const job = JSON.parse(await readFile(jobPath, "utf8"));
  job.outputs.background = { url: null, normalized: "normalized/background.jpg", previewedAt: new Date().toISOString(), sourceMode: "generate" };
  await writeFile(jobPath, JSON.stringify(job), "utf8");
  for (const role of ["home-welcome", "scene-daily", "scene-code", "scene-design", "composer-companion"]) await writeFile(join(promptDir, `${role}.txt`), `${role} prompt`, "utf8");
  const result = await run(["run-derived", "--job", initialized.jobId, "--prompt-dir", promptDir, "--skill-script", fakeSkill, "--jobs-root", jobs, "--store-root", themes], {
    executeImageProcess: async ({ role }) => role === "scene-code"
      ? { code: 1, timedOut: false, stdout: JSON.stringify({ status: "failed", code: "provider_error", error: "mock failure" }) }
      : { code: 0, timedOut: false, stdout: JSON.stringify({ status: "completed", images: [{ url: `https://cdn.example.com/${role}.png` }] }) },
  });
  assert.deepEqual([result.status, result.completed, result.failed, result.outcomeUnknown], ["failed", 4, 1, 0]);
  const saved = JSON.parse(await readFile(jobPath, "utf8"));
  assert.equal(saved.calls.filter(({ role }) => role === "scene-code").length, 1);
  assert.equal(saved.calls.find(({ role }) => role === "scene-code").status, "failed");
  const resumed = await run(["resume", "--job", initialized.jobId, "--jobs-root", jobs, "--store-root", themes]);
  assert.equal(resumed.nextAction, "ingest-home-welcome");
  assert.equal(resumed.requiresUser, false);
  for (const role of ["home-welcome", "scene-daily", "scene-design", "composer-companion"]) saved.outputs[role].normalized = `normalized/${role}.png`;
  await writeFile(jobPath, JSON.stringify(saved), "utf8");
  assert.equal((await run(["resume", "--job", initialized.jobId, "--jobs-root", jobs, "--store-root", themes])).nextAction, "authorize-scene-code");
});

test("死亡的前台生图进程在 resume 时转为 outcome_unknown", async (t) => {
  const root = await mkdtemp(join(process.cwd(), ".test-generation-stale-call-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const jobs = join(root, "jobs");
  const themes = join(root, "themes");
  const prompt = join(root, "prompt.txt");
  await writeFile(prompt, "stale foreground call", "utf8");
  const initialized = await run(["init", "--name", "中断恢复", "--prompt-file", prompt, "--jobs-root", jobs, "--store-root", themes]);
  await run(["confirm", "--job", initialized.jobId, "--gate", "generation", "--jobs-root", jobs, "--store-root", themes]);
  const jobPath = join(jobs, initialized.jobId, "job.json");
  const job = JSON.parse(await readFile(jobPath, "utf8"));
  job.calls.push({ role: "background", status: "running", ownerPid: 2147483647, startedAt: new Date().toISOString() });
  await writeFile(jobPath, JSON.stringify(job), "utf8");
  const resumed = await run(["resume", "--job", initialized.jobId, "--jobs-root", jobs, "--store-root", themes]);
  assert.equal(resumed.calls[0].status, "outcome_unknown");
  assert.equal(resumed.nextAction, "run-backgrounds");
  assert.equal(resumed.authorizedRemaining, 2);
  assert.equal(JSON.parse(await readFile(jobPath, "utf8")).calls[0].code, "foreground_process_interrupted");
});

test("仍存活的前台批次只返回 wait-running 而不重复提交", async (t) => {
  const root = await mkdtemp(join(process.cwd(), ".test-generation-live-call-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const jobs = join(root, "jobs");
  const themes = join(root, "themes");
  const prompt = join(root, "prompt.txt");
  await writeFile(prompt, "live foreground call", "utf8");
  const initialized = await run(["init", "--name", "仍在等待", "--prompt-file", prompt, "--jobs-root", jobs, "--store-root", themes]);
  const jobPath = join(jobs, initialized.jobId, "job.json");
  const job = JSON.parse(await readFile(jobPath, "utf8"));
  job.calls.push({ role: "background", status: "running", ownerPid: process.pid, batchId: "batch-live", startedAt: new Date().toISOString() });
  await writeFile(jobPath, JSON.stringify(job), "utf8");
  const resumed = await run(["resume", "--job", initialized.jobId, "--jobs-root", jobs, "--store-root", themes]);
  assert.equal(resumed.nextAction, "wait-running");
  assert.equal(resumed.requiresUser, false);
  assert.equal(resumed.batchId, "batch-live");
  assert.deepEqual(resumed.roles, ["background"]);
});

test("NoneLinear 空输出记为 outcome_unknown，不留下 running 孤儿也不自动重试", async (t) => {
  const root = await mkdtemp(join(process.cwd(), ".test-generation-empty-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const jobs = join(root, "jobs");
  const themes = join(root, "themes");
  const prompt = join(root, "prompt.txt");
  const emptySkill = join(root, "empty-skill.mjs");
  await writeFile(prompt, "one paid background", "utf8");
  await writeFile(emptySkill, "export async function run() {}", "utf8");
  const initialized = await run(["init", "--name", "空输出测试", "--prompt-file", prompt, "--jobs-root", jobs, "--store-root", themes]);
  await run(["confirm", "--job", initialized.jobId, "--gate", "generation", "--jobs-root", jobs, "--store-root", themes]);
  const result = await run(["run-backgrounds", "--job", initialized.jobId, "--prompt-file", prompt, "--skill-script", emptySkill, "--jobs-root", jobs, "--store-root", themes]);
  assert.deepEqual([result.status, result.completed, result.outcomeUnknown], ["failed", 0, 3]);
  const status = await run(["status", "--job", initialized.jobId, "--jobs-root", jobs, "--store-root", themes]);
  assert.equal(status.calls.length, 3);
  assert.equal(status.calls.every((call) => call.status === "outcome_unknown"), true);
  await assert.rejects(run(["run-backgrounds", "--job", initialized.jobId, "--prompt-file", prompt, "--skill-script", emptySkill, "--jobs-root", jobs, "--store-root", themes]), /明确授权/);
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

test("受控 NoneLinear 调用器固定使用 10 分钟超时", async (t) => {
  assert.equal(IMAGE_TIMEOUT_MS, 600_000);
  assert.equal(IMAGE_PROCESS_TIMEOUT_MS, 660_000);
  const root = await mkdtemp(join(process.cwd(), ".test-controlled-image-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const fakeSkill = join(root, "fake-skill.mjs");
  await writeFile(fakeSkill, "export async function run(argv, deps) { return {status:'completed', timeoutMs:deps.timeoutMs, argv}; }", "utf8");
  const result = await runControlledImage(["--skill-script", fakeSkill, "--", "--prompt", "test"]);
  assert.equal(result.timeoutMs, 600_000);
  assert.deepEqual(result.argv, ["--prompt", "test"]);
});

test("direct 本地参考图不产生背景调用并直接使用一张背景", async (t) => {
  const root = await mkdtemp(join(process.cwd(), ".test-generation-direct-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const jobs = join(root, "jobs");
  const themes = join(root, "themes");
  const prompt = join(root, "prompt.txt");
  const reference = join(root, "reference.png");
  await writeFile(prompt, "direct background", "utf8");
  const originalReference = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=", "base64");
  await writeFile(reference, originalReference);
  const initialized = await run(["init", "--name", "直接背景", "--prompt-file", prompt, "--reference", reference, "--reference-mode", "direct", "--jobs-root", jobs, "--store-root", themes]);
  await run(["confirm", "--job", initialized.jobId, "--gate", "generation", "--jobs-root", jobs, "--store-root", themes]);
  let job = JSON.parse(await readFile(join(jobs, initialized.jobId, "job.json"), "utf8"));
  assert.equal(job.backgroundMode, "direct");
  assert.equal(job.callsAuthorized.background, 0);
  await assert.rejects(run(["authorize", "--job", initialized.jobId, "--call", "background", "--jobs-root", jobs, "--store-root", themes]), /direct 模式/);
  await assert.rejects(run(["run-image", "--job", initialized.jobId, "--role", "background", "--prompt-file", prompt, "--skill-script", reference, "--jobs-root", jobs, "--store-root", themes]), /direct 模式/);
  await run(["confirm", "--job", initialized.jobId, "--gate", "upload", "--jobs-root", jobs, "--store-root", themes]);
  job = JSON.parse(await readFile(join(jobs, initialized.jobId, "job.json"), "utf8"));
  job.reference.url = "https://cdn.example.com/reference.png";
  await writeFile(join(jobs, initialized.jobId, "job.json"), JSON.stringify(job), "utf8");
  const ingested = await run(["ingest", "--job", initialized.jobId, "--role", "background", "--jobs-root", jobs, "--store-root", themes]);
  assert.deepEqual([ingested.width, ingested.height], [2048, 1152]);
  assert.deepEqual(await readFile(reference), originalReference);
  const preview = await run(["preview", "--job", initialized.jobId, "--role", "background", "--jobs-root", jobs, "--store-root", themes]);
  assert.equal(preview.sourceMode, "direct");
  assert.equal(preview.previews.length, 1);
  assert.match(preview.previews[0].path, /background-1\.jpg$/);
});

test("direct 公开 HTTPS 参考图通过安全下载路径标准化", async (t) => {
  const root = await mkdtemp(join(process.cwd(), ".test-generation-direct-url-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const jobs = join(root, "jobs");
  const themes = join(root, "themes");
  const prompt = join(root, "prompt.txt");
  const downloaded = join(root, "downloaded.png");
  await writeFile(prompt, "direct public background", "utf8");
  await writeFile(downloaded, Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=", "base64"));
  const initialized = await run(["init", "--name", "公开直接背景", "--prompt-file", prompt, "--reference", "https://cdn.example.com/reference.png", "--reference-mode", "direct", "--jobs-root", jobs, "--store-root", themes]);
  await run(["confirm", "--job", initialized.jobId, "--gate", "generation", "--jobs-root", jobs, "--store-root", themes]);
  const ingested = await run(["ingest", "--job", initialized.jobId, "--role", "background", "--jobs-root", jobs, "--store-root", themes], {
    downloadImage: async (url) => ({ path: downloaded, size: 68, contentType: "image/png", url }),
  });
  assert.deepEqual([ingested.width, ingested.height], [2048, 1152]);
  const preview = await run(["preview", "--job", initialized.jobId, "--role", "background", "--jobs-root", jobs, "--store-root", themes]);
  assert.equal(preview.previews[0].url, "https://cdn.example.com/reference.png");
});

test("任务页可直接固化主题并标记 Home 兼容性待检查", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "wb-generation-task-accept-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const jobs = join(root, "jobs");
  const themes = join(root, "themes");
  const prompt = join(root, "prompt.txt");
  const specPath = join(root, "generation-spec.json");
  await writeFile(prompt, "persist from task page", "utf8");
  await writeFile(specPath, JSON.stringify(validSpec), "utf8");
  const initialized = await run(["init", "--name", "任务页固化", "--prompt-file", prompt, "--jobs-root", jobs, "--store-root", themes]);
  await run(["confirm", "--job", initialized.jobId, "--gate", "generation", "--jobs-root", jobs, "--store-root", themes]);
  const jobRoot = join(jobs, initialized.jobId);
  const normalizedRoot = join(jobRoot, "normalized");
  await mkdir(normalizedRoot, { recursive: true });
  const jobPath = join(jobRoot, "job.json");
  const job = JSON.parse(await readFile(jobPath, "utf8"));
  const candidates = [];
  for (let number = 1; number <= 3; number += 1) { const name = `background-${number}.jpg`; await writeFile(join(normalizedRoot, name), Buffer.from([0xff, 0xd8, number, 0xd9])); candidates.push({ id: `background-${number}`, label: `方案${number}`, normalized: `normalized/${name}`, url: `https://cdn.example.com/${name}` }); }
  job.outputs.background = { url: candidates[0].url, normalized: candidates[0].normalized, candidates, previewedAt: new Date().toISOString() };
  for (const role of ["home-welcome", "scene-daily", "scene-code", "scene-design", "composer-companion"]) { const name = `${role}.png`; await writeFile(join(normalizedRoot, name), Buffer.from("\x89PNG\r\n\x1a\nfixture")); job.outputs[role] = { url: `https://cdn.example.com/${role}.png`, downloaded: null, normalized: `normalized/${name}` }; }
  await writeFile(jobPath, JSON.stringify(job), "utf8");
  await run(["confirm", "--job", initialized.jobId, "--gate", "final", "--jobs-root", jobs, "--store-root", themes]);
  const accepted = await run(["accept", "--job", initialized.jobId, "--spec", specPath, "--jobs-root", jobs, "--store-root", themes]);
  assert.equal(accepted.homeCompatibility, "pending");
  assert.equal((await run(["resume", "--job", initialized.jobId, "--jobs-root", jobs, "--store-root", themes])).nextAction, "apply-theme");
  assert.equal((await run(["status", "--job", initialized.jobId, "--jobs-root", jobs, "--store-root", themes])).jobStatus, "accepted-pending-home");
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
  await run(["confirm", "--job", initialized.jobId, "--gate", "generation", "--jobs-root", jobs, "--store-root", themes, "--discarded-root", discarded]);
  const jobRoot = join(jobs, initialized.jobId);
  const normalizedRoot = join(jobRoot, "normalized");
  await mkdir(normalizedRoot, { recursive: true });
  const jobPath = join(jobRoot, "job.json");
  const job = JSON.parse(await readFile(jobPath, "utf8"));
  const buildCandidates = [];
  for (let number = 1; number <= 3; number += 1) { const name = `background-${number}.jpg`; await writeFile(join(normalizedRoot, name), Buffer.from([0xff, 0xd8, number, 0xd9])); buildCandidates.push({ id: `background-${number}`, label: `方案${number}`, normalized: `normalized/${name}`, url: `https://cdn.example.com/${name}` }); }
  job.outputs.background = { url: buildCandidates[0].url, normalized: buildCandidates[0].normalized, candidates: buildCandidates, previewedAt: new Date().toISOString() };
  for (const role of ["home-welcome", "scene-daily", "scene-code", "scene-design", "composer-companion"]) { const name = `${role}.png`; await writeFile(join(normalizedRoot, name), Buffer.from("\x89PNG\r\n\x1a\nfixture")); job.outputs[role] = { url: `https://cdn.example.com/${role}.png`, downloaded: `downloads/${role}.png`, normalized: `normalized/${name}` }; }
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
  assert.equal(accepted.homeCompatibility, "compatible");
  const reopened = await run(["reopen-verification", "--job", initialized.jobId, "--jobs-root", jobs, "--store-root", themes, "--discarded-root", discarded]);
  assert.equal(reopened.jobStatus, "awaiting-home-verification");
  const discardedResult = await run(["discard", "--job", initialized.jobId, "--jobs-root", jobs, "--store-root", themes, "--discarded-root", discarded]);
  assert.equal(discardedResult.recoverable, true);
  const finalJob = JSON.parse(await readFile(jobPath, "utf8"));
  for (const output of Object.values(finalJob.outputs)) assert.deepEqual([output.url, output.downloaded, output.normalized], [null, null, null]);
});

test("accept 不要求 Home，但拒绝未确认调用量或素材不完整的作业", async () => {
  const root = await mkdtemp(join(tmpdir(), "wb-generation-accept-"));
  const jobs = join(root, "jobs");
  const themes = join(root, "themes");
  const prompt = join(root, "prompt.txt");
  await writeFile(prompt, "accept gate", "utf8");
  const initialized = await run(["init", "--name", "验收门禁", "--prompt-file", prompt, "--jobs-root", jobs, "--store-root", themes]);
  await assert.rejects(run(["confirm", "--job", initialized.jobId, "--gate", "final", "--jobs-root", jobs, "--store-root", themes]), /全部素材/);
  await assert.rejects(run(["accept", "--job", initialized.jobId, "--jobs-root", jobs, "--store-root", themes]), /确认完整调用量/);
});
