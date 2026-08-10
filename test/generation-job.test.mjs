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
  PARTICLE_TEMPLATE_VERSION,
  TEMPLATE_VERSION,
  credentialConfigured,
  fixedManifest,
  publicHttpsUrl,
  run,
  startForegroundHeartbeat,
  validateGenerationSpec,
  validateParticleSpec,
} from "../scripts/theme-generation-job.mjs";
import { run as runControlledImage } from "../scripts/run-nonelinear-image.mjs";

const validSpec = {
  template: "background-v1",
  name: "暮色纸灯",
  colors: { accent: "#d98b5f", secondary: "#e9c46a", surface: "#1d1a20", text: "#fff7ed" },
  art: { focusX: 0.68, focusY: 0.48, safeArea: "left" },
};

async function jobFixture(t, name = "背景测试") {
  const root = await mkdtemp(join(tmpdir(), "wb-background-job-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const jobs = join(root, "jobs");
  const themes = join(root, "themes");
  const prompt = join(root, "prompt.txt");
  await writeFile(prompt, "calm 16:9 background without text or UI", "utf8");
  const initialized = await run(["init", "--name", name, "--prompt-file", prompt, "--jobs-root", jobs, "--store-root", themes]);
  return { root, jobs, themes, prompt, initialized, jobPath: join(jobs, initialized.jobId, "job.json") };
}

test("前台背景生图心跳立即输出并可完整停止", () => {
  const messages = [];
  let tick;
  let cleared = false;
  const stop = startForegroundHeartbeat({
    label: "3 张背景候选",
    writer: (message) => messages.push(message),
    setIntervalFn: (callback, milliseconds) => { assert.equal(milliseconds, 15_000); tick = callback; return 7; },
    clearIntervalFn: (timer) => { assert.equal(timer, 7); cleared = true; },
  });
  assert.match(messages[0], /3 张背景候选.*当前窗口/);
  tick();
  assert.match(messages[1], /仍在等待/);
  stop();
  assert.equal(cleared, true);
});

test("凭据和公开 URL 只接受安全来源", () => {
  assert.equal(credentialConfigured({ NONELINEAR_API_KEY: "nl-direct" }), true);
  assert.equal(credentialConfigured({ OPENAI_API_KEY: "secret", OPENAI_BASE_URL: "https://api.nonelinear.com/v1" }), true);
  assert.equal(credentialConfigured({ OPENAI_API_KEY: "secret", OPENAI_BASE_URL: "https://api.nonelinear.com.evil.example" }), false);
  assert.equal(publicHttpsUrl("https://cdn.example.com/image.png"), "https://cdn.example.com/image.png");
  for (const url of ["http://cdn.example.com/a.png", "https://localhost/a.png", "https://127.0.0.1/a.png", "https://user:pass@cdn.example.com/a.png"]) {
    assert.throws(() => publicHttpsUrl(url), /公开 HTTPS/);
  }
});

test("background-v1 清单只包含背景、配色和构图", () => {
  assert.equal(TEMPLATE_VERSION, "background-v1");
  const manifest = fixedManifest(validateGenerationSpec(validSpec), "twilight-lamp");
  assert.equal(manifest.background, "background-1.jpg");
  assert.deepEqual(manifest.backgrounds.map(({ id, label, asset }) => [id, label, asset]), [
    ["background-1", "方案1", "background-1.jpg"],
    ["background-2", "方案2", "background-2.jpg"],
    ["background-3", "方案3", "background-3.jpg"],
  ]);
  assert.deepEqual(manifest.modules, []);
  for (const forbidden of ["homeHeader", "copy", "copySets"]) assert.equal(forbidden in manifest, false);
  assert.throws(() => validateGenerationSpec({ ...validSpec, template: "home-scene-v1" }), /background-v1/);
  assert.throws(() => validateGenerationSpec({ ...validSpec, art: { ...validSpec.art, focusX: 2 } }), /focus/);
});

test("一次确认只授权三个 n=1 背景调用", async (t) => {
  const fixture = await jobFixture(t);
  const fakeSkill = join(fixture.root, "fake-skill.mjs");
  await writeFile(fakeSkill, "export async function run() {}", "utf8");
  await run(["confirm", "--job", fixture.initialized.jobId, "--gate", "generation", "--jobs-root", fixture.jobs, "--store-root", fixture.themes]);
  const authorized = await run(["status", "--job", fixture.initialized.jobId, "--jobs-root", fixture.jobs, "--store-root", fixture.themes]);
  assert.deepEqual(authorized.callsAuthorized, { background: 3 });
  const result = await run(["run-backgrounds", "--job", fixture.initialized.jobId, "--prompt-file", fixture.prompt, "--skill-script", fakeSkill, "--jobs-root", fixture.jobs, "--store-root", fixture.themes], {
    executeImageProcess: async ({ candidateIndex, args }) => {
      assert.equal(args.includes("--n"), false);
      return { code: 0, timedOut: false, stdout: JSON.stringify({ status: "completed", images: [{ url: `https://cdn.example.com/background-${candidateIndex + 1}.jpg` }] }) };
    },
  });
  assert.deepEqual([result.status, result.completed, result.urls.length], ["completed", 3, 3]);
  assert.deepEqual([IMAGE_MODEL, IMAGE_QUALITY, IMAGE_TIMEOUT_MS, IMAGE_PROCESS_TIMEOUT_MS], ["gpt-image-2", "low", 600_000, 660_000]);
  const status = await run(["resume", "--job", fixture.initialized.jobId, "--jobs-root", fixture.jobs, "--store-root", fixture.themes]);
  assert.equal(status.nextAction, "ingest-background");
  assert.equal(status.progress.total, 1);
});

test("particle-v1 固定授权三张透明候选并接受安全轨迹", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "wb-particle-job-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const jobs = join(root, "jobs");
  const themes = join(root, "themes");
  const source = join(root, "source-theme");
  const prompt = join(root, "particle-prompt.txt");
  const fakeSkill = join(root, "fake-skill.mjs");
  await mkdir(source, { recursive: true });
  await writeFile(join(source, "background.svg"), "<svg xmlns=\"http://www.w3.org/2000/svg\"></svg>", "utf8");
  await writeFile(join(source, "theme.json"), JSON.stringify({ schemaVersion: 1, id: "source-theme", name: "Source", background: "background.svg" }), "utf8");
  await writeFile(prompt, "pink cherry blossom petal", "utf8");
  await writeFile(fakeSkill, "export async function run() {}", "utf8");
  const initialized = await run(["particle-init", "--name", "樱花", "--source-theme", source, "--prompt-file", prompt, "--jobs-root", jobs, "--store-root", themes]);
  assert.equal(initialized.template, PARTICLE_TEMPLATE_VERSION);
  await run(["particle-confirm", "--job", initialized.jobId, "--gate", "generation", "--jobs-root", jobs, "--store-root", themes]);
  const authorized = await run(["status", "--job", initialized.jobId, "--jobs-root", jobs, "--store-root", themes]);
  assert.deepEqual(authorized.callsAuthorized, { particle: 3 });
  const generated = await run(["run-particles", "--job", initialized.jobId, "--prompt-file", prompt, "--skill-script", fakeSkill, "--jobs-root", jobs, "--store-root", themes], {
    executeImageProcess: async ({ candidateIndex, args }) => {
      assert.match(args.join(" "), /transparent background/);
      return { code: 0, timedOut: false, stdout: JSON.stringify({ status: "completed", images: [{ url: `https://cdn.example.com/particle-${candidateIndex + 1}.png` }] }) };
    },
  });
  assert.deepEqual([generated.status, generated.candidateCount], ["completed", 3]);
  const motion = validateParticleSpec({ template: "particle-v1", motion: { type: "fall", duration: 14, sway: 120, rotation: 240, pulse: 0.2, opacity: 0.8, twinkle: true } });
  assert.equal(motion.motion.type, "fall");
  assert.throws(() => validateParticleSpec({ template: "particle-v1", motion: { type: "spiral" } }), /motion\.type/);
});

test("particle-v1 接受后创建派生主题且不改写来源主题", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "wb-particle-accept-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const jobs = join(root, "jobs"); const themes = join(root, "themes"); const source = join(root, "source-theme");
  const prompt = join(root, "prompt.txt"); const spec = join(root, "particle-spec.json");
  await mkdir(source, { recursive: true });
  await writeFile(join(source, "background.svg"), "<svg xmlns=\"http://www.w3.org/2000/svg\"></svg>", "utf8");
  await writeFile(join(source, "theme.json"), JSON.stringify({ schemaVersion: 1, id: "source", name: "Source", background: "background.svg" }), "utf8");
  await writeFile(prompt, "single transparent petal", "utf8");
  await writeFile(spec, JSON.stringify({ template: "particle-v1", name: "Source petals", motion: { type: "fall", duration: 12, sway: 96, rotation: 180, pulse: 0.12, opacity: 0.72, twinkle: false } }), "utf8");
  const initialized = await run(["particle-init", "--source-theme", source, "--prompt-file", prompt, "--jobs-root", jobs, "--store-root", themes]);
  await run(["particle-confirm", "--job", initialized.jobId, "--gate", "generation", "--jobs-root", jobs, "--store-root", themes]);
  const normalized = join(jobs, initialized.jobId, "normalized"); await mkdir(normalized, { recursive: true });
  const candidates = [];
  for (let number = 1; number <= 3; number += 1) {
    const file = `particle-${number}.png`; await writeFile(join(normalized, file), Buffer.from([137, 80, 78, 71]));
    candidates.push({ id: `particle-${number}`, label: `粒子${number}`, normalized: `normalized/${file}`, url: `https://cdn.example.com/${file}` });
  }
  const jobPath = join(jobs, initialized.jobId, "job.json"); const job = JSON.parse(await readFile(jobPath, "utf8"));
  job.outputs.particle = { ...candidates[0], candidates, previewedAt: new Date().toISOString(), sourceMode: "generated" };
  await writeFile(jobPath, JSON.stringify(job), "utf8");
  await run(["particle-confirm", "--job", initialized.jobId, "--gate", "final", "--jobs-root", jobs, "--store-root", themes]);
  const accepted = await run(["accept", "--job", initialized.jobId, "--spec", spec, "--jobs-root", jobs, "--store-root", themes]);
  assert.equal(accepted.particleOnly, true);
  assert.equal(accepted.pendingThemeId, accepted.themeId);
  assert.notEqual(accepted.path, source);
  const manifest = JSON.parse(await readFile(join(accepted.path, "theme.json"), "utf8"));
  assert.equal(manifest.particles.assets.length, 3);
  assert.equal(manifest.particles.defaultMotion.type, "fall");
  assert.equal(JSON.parse(await readFile(join(root, "settings.json"), "utf8")).pendingThemeId, accepted.themeId);
  assert.equal(JSON.parse(await readFile(join(source, "theme.json"), "utf8")).particles, undefined);
});

test("旧模块生成和 Home 组件验收命令已禁用", async (t) => {
  const fixture = await jobFixture(t);
  for (const command of ["run-derived", "verify-home", "reopen-verification"]) {
    await assert.rejects(run([command, "--job", fixture.initialized.jobId, "--jobs-root", fixture.jobs, "--store-root", fixture.themes]), /仅背景模式/);
  }
  await assert.rejects(run(["authorize", "--job", fixture.initialized.jobId, "--call", "scene-code", "--jobs-root", fixture.jobs, "--store-root", fixture.themes]), /未知图片角色/);
});

test("accept 固化的主题无法带入旧文字或装饰模板", async (t) => {
  const fixture = await jobFixture(t, "固化背景");
  const specPath = join(fixture.root, "generation-spec.json");
  await writeFile(specPath, JSON.stringify(validSpec), "utf8");
  await run(["confirm", "--job", fixture.initialized.jobId, "--gate", "generation", "--jobs-root", fixture.jobs, "--store-root", fixture.themes]);
  const normalizedRoot = join(fixture.jobs, fixture.initialized.jobId, "normalized");
  await mkdir(normalizedRoot, { recursive: true });
  const candidates = [];
  for (let number = 1; number <= 3; number += 1) {
    const file = `background-${number}.jpg`;
    await writeFile(join(normalizedRoot, file), Buffer.from([0xff, 0xd8, number, 0xd9]));
    candidates.push({ id: `background-${number}`, label: `方案${number}`, normalized: `normalized/${file}`, url: `https://cdn.example.com/${file}` });
  }
  const job = JSON.parse(await readFile(fixture.jobPath, "utf8"));
  job.outputs.background = { ...candidates[0], candidates, previewedAt: new Date().toISOString(), sourceMode: "generate" };
  await writeFile(fixture.jobPath, JSON.stringify(job), "utf8");
  await run(["confirm", "--job", fixture.initialized.jobId, "--gate", "final", "--jobs-root", fixture.jobs, "--store-root", fixture.themes]);
  const accepted = await run(["accept", "--job", fixture.initialized.jobId, "--spec", specPath, "--jobs-root", fixture.jobs, "--store-root", fixture.themes]);
  assert.equal(accepted.backgroundOnly, true);
  assert.equal(JSON.parse(await readFile(join(fixture.root, "settings.json"), "utf8")).pendingThemeId, accepted.themeId);
  const manifest = JSON.parse(await readFile(join(accepted.path, "theme.json"), "utf8"));
  assert.deepEqual(manifest.modules, []);
  for (const forbidden of ["homeHeader", "copySets"]) assert.equal(forbidden in manifest, false);
  const resumed = await run(["resume", "--job", fixture.initialized.jobId, "--jobs-root", fixture.jobs, "--store-root", fixture.themes]);
  assert.equal(resumed.nextAction, "apply-theme");
  assert.equal(resumed.progress.total, 1);
});

test("direct 模式不授权背景生图", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "wb-background-direct-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const jobs = join(root, "jobs");
  const themes = join(root, "themes");
  const prompt = join(root, "prompt.txt");
  const reference = join(root, "reference.png");
  await writeFile(prompt, "direct background", "utf8");
  await writeFile(reference, Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=", "base64"));
  const initialized = await run(["init", "--name", "直接背景", "--prompt-file", prompt, "--reference", reference, "--reference-mode", "direct", "--jobs-root", jobs, "--store-root", themes]);
  await run(["confirm", "--job", initialized.jobId, "--gate", "generation", "--jobs-root", jobs, "--store-root", themes]);
  const status = await run(["status", "--job", initialized.jobId, "--jobs-root", jobs, "--store-root", themes]);
  assert.equal(status.callsAuthorized.background, 0);
  assert.equal(status.nextAction, "confirm-upload");
  await assert.rejects(run(["authorize", "--job", initialized.jobId, "--call", "background", "--jobs-root", jobs, "--store-root", themes]), /direct 模式/);
});

test("受控 NoneLinear 调用器固定使用 10 分钟超时", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "wb-controlled-image-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const fakeSkill = join(root, "fake-skill.mjs");
  await writeFile(fakeSkill, "export async function run(argv, deps) { return {status:'completed', timeoutMs:deps.timeoutMs, argv}; }", "utf8");
  const result = await runControlledImage(["--skill-script", fakeSkill, "--", "--prompt", "test"]);
  assert.equal(result.timeoutMs, 600_000);
  assert.deepEqual(result.argv, ["--prompt", "test"]);
});
