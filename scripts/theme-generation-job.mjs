#!/usr/bin/env node
import { createHash, randomBytes } from "node:crypto";
import { spawn } from "node:child_process";
import { lookup } from "node:dns/promises";
import { access, copyFile, mkdir, readFile, readdir, realpath, rename, rm, stat, writeFile } from "node:fs/promises";
import { isIP } from "node:net";
import { dirname, extname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { resolveStatePaths } from "../src/constants.mjs";
import { slugify } from "../src/theme-store.mjs";
import { assetPath, loadTheme, validateThemeManifest, verifiedAsset } from "../src/theme-schema.mjs";

export const JOB_VERSION = 1;
export const TEMPLATE_VERSION = "background-v1";
export const PARTICLE_TEMPLATE_VERSION = "particle-v1";
export const IMAGE_MODEL = "gpt-image-2";
export const IMAGE_QUALITY = "low";
export const BACKGROUND_CANDIDATE_COUNT = 3;
export const IMAGE_ROLES = Object.freeze(["background"]);
export const PARTICLE_CANDIDATE_COUNT = 3;
const ID = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const CONTENT_TYPES = new Map([["image/jpeg", ".jpg"], ["image/png", ".png"], ["image/webp", ".webp"]]);
const MAX_DOWNLOAD_BYTES = 20 * 1024 * 1024;
export const IMAGE_TIMEOUT_MS = 600_000;
export const IMAGE_PROCESS_TIMEOUT_MS = 660_000;

export function startForegroundHeartbeat({
  label = "图片生成",
  writer = (message) => process.stderr.write(message),
  setIntervalFn = setInterval,
  clearIntervalFn = clearInterval,
} = {}) {
  const safeLabel = String(label).replace(/[\r\n\t]+/g, " ").slice(0, 80);
  const startedAt = Date.now();
  writer(`[WorkBuddy Skin Lab] ${safeLabel}正在当前窗口运行；无需发送“继续”或“好了吗”。\n`);
  const timer = setIntervalFn(() => {
    const elapsed = Math.max(1, Math.round((Date.now() - startedAt) / 1000));
    writer(`[WorkBuddy Skin Lab] ${safeLabel}仍在等待图片返回（${elapsed} 秒）；请保持当前窗口打开。\n`);
  }, 15_000);
  timer?.unref?.();
  let stopped = false;
  return () => {
    if (stopped) return;
    stopped = true;
    clearIntervalFn(timer);
  };
}

function stateRoots(overrides = {}) {
  const state = resolveStatePaths();
  return {
    jobsRoot: resolve(overrides.jobsRoot ?? join(state.root, "generation-jobs")),
    storeRoot: resolve(overrides.storeRoot ?? state.themesRoot),
    discardedRoot: resolve(overrides.discardedRoot ?? join(state.root, "discarded")),
  };
}

function inside(root, candidate) {
  const rel = relative(root, candidate);
  return rel !== "" && rel !== ".." && !rel.startsWith(`..${sep}`) && !isAbsolute(rel);
}

function jobPath(jobsRoot, jobId) {
  if (!ID.test(jobId)) throw new Error("job id 无效");
  const candidate = resolve(jobsRoot, jobId);
  if (!inside(jobsRoot, candidate)) throw new Error("job 越过了 generation-jobs 目录");
  return candidate;
}

function jobFile(root, value, label) {
  if (typeof value !== "string" || !value || isAbsolute(value)) throw new Error(`${label} 不是有效的作业相对路径`);
  const candidate = resolve(root, value);
  if (!inside(root, candidate)) throw new Error(`${label} 越过了作业目录`);
  return candidate;
}

async function atomicJson(path, value) {
  const temporary = `${path}.tmp-${process.pid}-${randomBytes(3).toString("hex")}`;
  await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  await rename(temporary, path);
}

async function loadJob(roots, jobId) {
  const root = jobPath(roots.jobsRoot, jobId);
  const job = JSON.parse(await readFile(join(root, "job.json"), "utf8"));
  if (job.version !== JOB_VERSION || job.id !== jobId) throw new Error("job.json 无效");
  if (![TEMPLATE_VERSION, PARTICLE_TEMPLATE_VERSION].includes(job.template)) throw new Error(`旧作业模板 ${job.template || "unknown"} 已停用；请新建 ${TEMPLATE_VERSION} 或 ${PARTICLE_TEMPLATE_VERSION} 作业`);
  job.backgroundMode ??= job.reference ? "edit" : "generate";
  job.confirmations ??= { upload: false, background: false, final: false };
  job.confirmations.generation ??= Boolean(job.confirmations.background);
  job.confirmationTimes ??= { upload: null, background: null, final: null };
  job.confirmationTimes.generation ??= null;
  job.generation ??= {};
  job.generation.timeoutMs ??= IMAGE_TIMEOUT_MS;
  let reconciled = false;
  for (const call of job.calls ?? []) {
    if (call.status !== "running") continue;
    let alive = false;
    if (Number.isSafeInteger(call.ownerPid) && call.ownerPid > 0) {
      try { process.kill(call.ownerPid, 0); alive = true; } catch (error) { alive = error?.code === "EPERM"; }
    }
    if (alive) continue;
    call.status = "outcome_unknown";
    call.code = "foreground_process_interrupted";
    call.finishedAt = new Date().toISOString();
    reconciled = true;
  }
  if (reconciled) {
    job.updatedAt = new Date().toISOString();
    await atomicJson(join(root, "job.json"), job);
  }
  return { root, job };
}

async function saveJob(root, job) {
  job.updatedAt = new Date().toISOString();
  await atomicJson(join(root, "job.json"), job);
}

function parseBaseHost(value) {
  if (!value) return false;
  try {
    const url = new URL(value);
    return url.protocol === "https:" && url.hostname.toLowerCase() === "api.nonelinear.com" && (!url.port || url.port === "443") && !url.username && !url.password;
  } catch { return false; }
}

export function credentialConfigured(env = process.env) {
  if (env.NONELINEAR_API_KEY?.trim() || env.Nonelinear_API_KEY?.trim()) return true;
  if (parseBaseHost(env.OPENAI_BASE_URL) && env.OPENAI_API_KEY?.trim()) return true;
  return Boolean(parseBaseHost(env.ANTHROPIC_BASE_URL) && (env.ANTHROPIC_AUTH_TOKEN?.trim() || env.ANTHROPIC_API_KEY?.trim()));
}

function redactSecrets(value, env = process.env) {
  let result = String(value ?? "");
  for (const name of ["NONELINEAR_API_KEY", "Nonelinear_API_KEY", "OPENAI_API_KEY", "ANTHROPIC_AUTH_TOKEN", "ANTHROPIC_API_KEY"]) {
    const secret = env[name]?.trim();
    if (secret) result = result.split(secret).join("[REDACTED]");
  }
  return result;
}

function redactedRequestId(value) {
  return typeof value === "string" && value ? `sha256:${createHash("sha256").update(value).digest("hex").slice(0, 16)}` : null;
}

function privateIp(value) {
  if (!isIP(value)) return false;
  if (value === "::1" || value === "::") return true;
  if (value.includes(":")) return /^(?:fc|fd|fe8|fe9|fea|feb|ff)/i.test(value) || value.toLowerCase().startsWith("::ffff:");
  const [a, b] = value.split(".").map(Number);
  return a === 0 || a === 10 || a === 127 || (a === 100 && b >= 64 && b <= 127) || (a === 169 && b === 254)
    || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || a >= 224;
}

export function publicHttpsUrl(value) {
  if (typeof value !== "string" || value.length > 4096) throw new Error("图片 URL 无效");
  const url = new URL(value);
  const host = url.hostname.toLowerCase().replace(/^\[|\]$/g, "").replace(/\.$/, "");
  if (url.protocol !== "https:" || !host || url.username || url.password || host === "localhost" || host.endsWith(".localhost") || host.endsWith(".local") || privateIp(host)) {
    throw new Error("图片 URL 必须是公开 HTTPS 地址");
  }
  return url.href;
}

async function assertPublicDns(url, lookupImpl = lookup) {
  const host = new URL(url).hostname;
  if (isIP(host)) return;
  const addresses = await lookupImpl(host, { all: true, verbatim: true });
  if (!addresses.length || addresses.some(({ address }) => privateIp(address))) throw new Error("图片 URL 解析到了非公开地址");
}

function imageMagic(bytes, contentType) {
  if (contentType === "image/png") return bytes.subarray(0, 8).equals(Buffer.from("89504e470d0a1a0a", "hex"));
  if (contentType === "image/jpeg") return bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  if (contentType === "image/webp") return bytes.subarray(0, 4).toString() === "RIFF" && bytes.subarray(8, 12).toString() === "WEBP";
  return false;
}

export async function downloadImage(urlValue, destinationBase, { fetchImpl = globalThis.fetch, lookupImpl = lookup } = {}) {
  let url = publicHttpsUrl(urlValue);
  for (let redirects = 0; redirects <= 3; redirects += 1) {
    await assertPublicDns(url, lookupImpl);
    const response = await fetchImpl(url, { redirect: "manual", signal: AbortSignal.timeout(60_000) });
    if (response.status >= 300 && response.status < 400) {
      if (redirects === 3) throw new Error("图片下载重定向次数过多");
      const location = response.headers.get("location");
      if (!location) throw new Error("图片下载重定向缺少 Location");
      url = publicHttpsUrl(new URL(location, url).href);
      continue;
    }
    if (!response.ok) throw new Error(`图片下载失败：HTTP ${response.status}`);
    const contentType = response.headers.get("content-type")?.split(";", 1)[0]?.trim().toLowerCase();
    const extension = CONTENT_TYPES.get(contentType);
    if (!extension) throw new Error("图片下载 Content-Type 不受支持");
    const declared = Number(response.headers.get("content-length") || 0);
    if (declared > MAX_DOWNLOAD_BYTES) throw new Error("图片下载超过 20 MB");
    const reader = response.body?.getReader();
    if (!reader) throw new Error("图片下载响应不可读取");
    const chunks = [];
    let total = 0;
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > MAX_DOWNLOAD_BYTES) { await reader.cancel(); throw new Error("图片下载超过 20 MB"); }
      chunks.push(Buffer.from(value));
    }
    const data = Buffer.concat(chunks);
    if (!imageMagic(data, contentType)) throw new Error("图片内容与 Content-Type 不一致");
    const destination = `${destinationBase}${extension}`;
    await mkdir(dirname(destination), { recursive: true });
    await writeFile(destination, data);
    return { path: destination, size: total, contentType };
  }
  throw new Error("图片下载失败");
}

function processResult(stdout, label) {
  let result;
  try { result = JSON.parse(stdout.trim()); } catch { throw new Error(`${label} 未返回有效 JSON`); }
  if (!result || typeof result !== "object") throw new Error(`${label} 返回值无效`);
  return result;
}

async function runProcess(executable, args, { maxOutput = 2 * 1024 * 1024, env = process.env, timeoutMs = 0 } = {}) {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(executable, args, { shell: false, windowsHide: true, env });
    let stdout = "";
    let stderr = "";
    let timedOut = false;
    const timer = timeoutMs > 0 ? setTimeout(() => { timedOut = true; child.kill(); }, timeoutMs) : null;
    child.stdout.on("data", (chunk) => { stdout += chunk; if (stdout.length > maxOutput) child.kill(); });
    child.stderr.on("data", (chunk) => { stderr += chunk; if (stderr.length > 16_384) stderr = stderr.slice(-16_384); });
    child.on("error", (error) => { if (timer) clearTimeout(timer); reject(error); });
    child.on("close", (code) => { if (timer) clearTimeout(timer); resolvePromise({ code, stdout, stderr, timedOut }); });
  });
}

function roleSpec(role) {
  if (role === "background") return { size: "2048x1152", kind: "background" };
  if (role === "particle") return { size: "512x512", kind: "particle" };
  throw new Error("未知图片角色");
}

export function validateGenerationSpec(input) {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new Error("generation spec 必须是对象");
  if (input.template !== TEMPLATE_VERSION) throw new Error(`template 必须是 ${TEMPLATE_VERSION}`);
  if (typeof input.name !== "string" || !input.name.trim() || input.name.length > 60) throw new Error("name 必须是 1 到 60 个字符");
  const colors = input.colors;
  for (const key of ["accent", "secondary", "surface", "text"]) if (typeof colors?.[key] !== "string" || !/^#[0-9a-f]{6}$/i.test(colors[key])) throw new Error(`colors.${key} 无效`);
  const focusX = input.art?.focusX;
  const focusY = input.art?.focusY;
  if (![focusX, focusY].every((value) => Number.isFinite(value) && value >= 0 && value <= 1)) throw new Error("art focus 必须在 0 到 1");
  if (!["auto", "left", "right", "center", "none"].includes(input.art?.safeArea)) throw new Error("art.safeArea 无效");
  return {
    template: TEMPLATE_VERSION,
    name: input.name.trim(), colors,
    art: { focusX, focusY, safeArea: input.art.safeArea },
  };
}

export function fixedManifest(spec, id, backgroundCount = 3) {
  const manifest = {
    schemaVersion: 1, id, name: spec.name, background: "background-1.jpg",
    backgrounds: Array.from({ length: backgroundCount }, (_, index) => ({ id: `background-${index + 1}`, label: backgroundCount === 1 ? "默认背景" : `方案${index + 1}`, asset: `background-${index + 1}.jpg` })),
    colors: spec.colors,
    ui: { opacity: 0.82, blur: 20, radius: 16, appearance: "auto" },
    art: { focusX: spec.art.focusX, focusY: spec.art.focusY, safeArea: spec.art.safeArea, taskMode: "ambient" },
    modules: [],
  };
  validateThemeManifest(manifest);
  return manifest;
}

export function validateParticleSpec(input) {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new Error("particle spec 必须是对象");
  if (input.template !== PARTICLE_TEMPLATE_VERSION) throw new Error(`template 必须是 ${PARTICLE_TEMPLATE_VERSION}`);
  const motion = input.motion && typeof input.motion === "object" && !Array.isArray(input.motion) ? input.motion : {};
  const bounded = (key, fallback, min, max) => Number.isFinite(motion[key] ?? fallback) && (motion[key] ?? fallback) >= min && (motion[key] ?? fallback) <= max ? motion[key] ?? fallback : null;
  const type = motion.type ?? "float";
  if (!["fall", "rise", "float", "sweep"].includes(type)) throw new Error("motion.type 无效");
  const result = {
    type, duration: bounded("duration", 12, 4, 30), sway: bounded("sway", 96, 0, 220),
    rotation: bounded("rotation", 180, 0, 720), pulse: bounded("pulse", 0.12, 0, 0.45),
    opacity: bounded("opacity", 0.72, 0.25, 1), twinkle: Boolean(motion.twinkle),
  };
  if (Object.values(result).some((value) => value === null)) throw new Error("motion 参数超出安全范围");
  return { template: PARTICLE_TEMPLATE_VERSION, name: typeof input.name === "string" && input.name.trim() ? input.name.trim().slice(0, 60) : null, motion: result };
}

async function initializeParticle(options, roots) {
  if (!options["source-theme"] || !options["prompt-file"]) throw new Error("particle-init 需要 --source-theme 和 --prompt-file");
  const sourcePath = resolve(options["source-theme"]);
  const source = await loadTheme(sourcePath);
  const prompt = (await readFile(resolve(options["prompt-file"]), "utf8")).trim();
  if (!prompt) throw new Error("粒子提示词不能为空");
  const id = `job-${Date.now().toString(36)}-${randomBytes(4).toString("hex")}`;
  const root = jobPath(roots.jobsRoot, id);
  await mkdir(root, { recursive: false });
  const job = {
    version: JOB_VERSION, id, template: PARTICLE_TEMPLATE_VERSION, name: options.name?.trim().slice(0, 60) || `${source.manifest.name} 粒子`, prompt,
    sourceTheme: { id: source.manifest.id, path: source.root }, status: "initialized", createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
    generation: { model: IMAGE_MODEL, quality: IMAGE_QUALITY, responseFormat: "url", timeoutMs: IMAGE_TIMEOUT_MS, roles: { particle: roleSpec("particle") } },
    confirmations: { generation: false, final: false }, confirmationTimes: { generation: null, final: null },
    callsAuthorized: { particle: 0 }, calls: [], outputs: {}, generationSpec: null, theme: null, needsBuild: true,
  };
  await atomicJson(join(root, "job.json"), job);
  return { status: "completed", jobId: id, template: job.template, sourceThemeId: source.manifest.id, next: "confirm-generation" };
}

async function initialize(options, roots) {
  const name = options.name?.trim();
  if (!name || name.length > 60) throw new Error("init 需要 --name（1 到 60 字符）");
  if (!options["prompt-file"]) throw new Error("init 需要 --prompt-file");
  const prompt = (await readFile(resolve(options["prompt-file"]), "utf8")).trim();
  if (!prompt) throw new Error("提示词不能为空");
  const id = `job-${Date.now().toString(36)}-${randomBytes(4).toString("hex")}`;
  const root = jobPath(roots.jobsRoot, id);
  await mkdir(root, { recursive: false });
  let reference = null;
  if (options.reference) {
    if (/^https:/i.test(options.reference)) reference = { kind: "url", url: publicHttpsUrl(options.reference) };
    else reference = { kind: "local", path: resolve(options.reference), url: null };
  }
  const requestedMode = options["reference-mode"];
  if (requestedMode && !["edit", "direct"].includes(requestedMode)) throw new Error("reference-mode 必须是 edit 或 direct");
  if (requestedMode && !reference) throw new Error("reference-mode 只能与 --reference 一起使用");
  const backgroundMode = reference ? (requestedMode || "edit") : "generate";
  const callsAuthorized = Object.fromEntries(IMAGE_ROLES.map((role) => [role, 0]));
  const job = {
    version: JOB_VERSION, id, template: TEMPLATE_VERSION, name, prompt, status: "initialized",
    createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), reference, backgroundMode,
    generation: { model: IMAGE_MODEL, quality: IMAGE_QUALITY, responseFormat: "url", timeoutMs: IMAGE_TIMEOUT_MS, roles: Object.fromEntries(IMAGE_ROLES.map((role) => [role, roleSpec(role)])) },
    confirmations: { upload: false, generation: false, background: false, final: false }, confirmationTimes: { upload: null, generation: null, background: null, final: null },
    callsAuthorized, calls: [], outputs: {}, generationSpec: null, theme: null, needsBuild: true,
  };
  await atomicJson(join(root, "job.json"), job);
  return { status: "completed", jobId: id, path: root, backgroundMode, next: reference?.kind === "local" ? "confirm-upload" : "confirm-generation" };
}

async function preflight(options) {
  const skillScript = options["skill-script"] ? resolve(options["skill-script"]) : null;
  const python = options.python || "python";
  const normalizer = resolve(options.normalizer || join(dirname(fileURLToPath(import.meta.url)), "normalize-generated-image.py"));
  const adapter = resolve(options.adapter || join(dirname(fileURLToPath(import.meta.url)), "run-nonelinear-image.mjs"));
  const [skillExists, normalizerExists] = await Promise.all([
    skillScript ? stat(skillScript).then((info) => info.isFile(), () => false) : false,
    stat(normalizer).then((info) => info.isFile(), () => false),
  ]);
  const adapterExists = await stat(adapter).then((info) => info.isFile(), () => false);
  let skillSyntax = false;
  let resolvedSkillScript = null;
  if (skillExists) {
    resolvedSkillScript = await realpath(skillScript);
    const checked = await runProcess(options.node || process.execPath, ["--check", resolvedSkillScript], { maxOutput: 4096 }).catch(() => ({ code: -1 }));
    skillSyntax = checked.code === 0;
  }
  const adapterCheck = adapterExists
    ? await runProcess(options.node || process.execPath, ["--check", adapter], { maxOutput: 4096 }).catch(() => ({ code: -1 }))
    : { code: -1 };
  const pythonCheck = await runProcess(python, ["-c", "import PIL; print('configured')"], { maxOutput: 1024 }).catch(() => ({ code: -1 }));
  return { status: skillExists && skillSyntax && adapterCheck.code === 0 && normalizerExists && pythonCheck.code === 0 && credentialConfigured() ? "completed" : "failed", nonelinearSkill: skillExists ? "configured" : "missing", nonelinearSkillSyntax: skillSyntax ? "configured" : "invalid", nonelinearSkillPath: resolvedSkillScript, controlledAdapter: adapterCheck.code === 0 ? "configured" : "missing", imageTimeoutMs: IMAGE_TIMEOUT_MS, apiKey: credentialConfigured() ? "configured" : "missing", pythonPillow: pythonCheck.code === 0 ? "configured" : "missing", normalizer: normalizerExists ? "configured" : "missing" };
}

async function confirmGate(options, roots) {
  const { root, job } = await loadJob(roots, options.job);
  const gate = options.gate;
  if (gate === "upload") job.confirmations.upload = true;
  else if (gate === "generation") {
    if (job.confirmations.generation) throw new Error("本作业的完整调用量已经确认");
    job.confirmations.generation = true;
    job.callsAuthorized.background = job.backgroundMode === "direct" ? 0 : BACKGROUND_CANDIDATE_COUNT;
    job.confirmations.background = true;
  }
  else if (gate === "background") {
    if (job.confirmations.background) throw new Error("背景已经确认；只有重新生成背景后才能再次授权派生素材");
    if (!job.outputs.background?.normalized) throw new Error("确认背景前必须先准备并标准化背景");
    if (!job.outputs.background?.previewedAt) throw new Error("确认背景前必须先运行 preview 展示当前背景");
    job.confirmations.background = true;
  } else if (gate === "final") {
    if (!job.confirmations.background || !job.outputs?.background?.normalized) throw new Error("最终确认前必须完成并确认背景");
    job.confirmations.final = true;
  } else throw new Error("gate 必须是 upload、generation、background 或 final");
  job.confirmationTimes ??= { upload: null, generation: null, background: null, final: null };
  job.confirmationTimes[gate] = new Date().toISOString();
  await saveJob(root, job);
  return { status: "completed", gate };
}

async function authorizeRetry(options, roots) {
  const { root, job } = await loadJob(roots, options.job);
  const role = options.call;
  roleSpec(role);
  if (role === "background" && job.backgroundMode === "direct") throw new Error("direct 模式不产生背景生图调用，不能授权背景重试");
  const attempts = job.calls.filter((call) => call.role === role).length;
  if (attempts < job.callsAuthorized[role]) throw new Error(`${role} 仍有尚未使用的调用授权`);
  if (!job.confirmations.generation) throw new Error("尚未确认完整调用量，不能授权重试");
  const count = options.count == null ? 1 : Number(options.count);
  if (!Number.isInteger(count) || count < 1 || count > BACKGROUND_CANDIDATE_COUNT) throw new Error("count 必须是 1 到 3 的整数");
  const existingBackgrounds = job.outputs.background?.candidates?.length ?? 0;
  const completeExistingSet = Boolean(job.outputs.background?.normalized) || existingBackgrounds >= BACKGROUND_CANDIDATE_COUNT;
  if (role === "background" && completeExistingSet && count !== BACKGROUND_CANDIDATE_COUNT) throw new Error("完整重做背景必须明确授权 3 次调用");
  if (role === "background" && !completeExistingSet && count > BACKGROUND_CANDIDATE_COUNT - existingBackgrounds) throw new Error(`只缺 ${BACKGROUND_CANDIDATE_COUNT - existingBackgrounds} 张背景，不能超额授权`);
  job.callsAuthorized[role] += count;
  job.confirmations.final = false;
  if (job.confirmationTimes) job.confirmationTimes.final = null;
  job.needsBuild = true;
  if (role === "background") {
    if (completeExistingSet) {
      job.outputs.background = null;
      job.status = "background-revision";
    } else {
      job.status = "background-incomplete";
    }
  } else {
    job.outputs[role] = null;
    job.status = `${role}-revision`;
  }
  await saveJob(root, job);
  return { status: "completed", role, added: count, authorized: job.callsAuthorized[role] };
}

async function uploadReference(options, roots) {
  const { root, job } = await loadJob(roots, options.job);
  if (job.reference?.kind !== "local") throw new Error("当前 job 没有本地参考图");
  if (!job.confirmations.upload) throw new Error("本作业尚未确认上传本地参考图");
  if (!options.script) throw new Error("upload-reference 需要 --script");
  const result = await runProcess(options.python || "python", [resolve(options.script), job.reference.path, "--confirmed"], { maxOutput: 32_768 });
  const parsed = processResult(result.stdout, "upload-reference");
  if (parsed.status !== "completed" || result.code !== 0) return { status: "failed", code: parsed.code || "upload_error", error: redactSecrets(parsed.error || "参考图上传失败").slice(0, 500) };
  job.reference.url = publicHttpsUrl(parsed.url);
  await saveJob(root, job);
  return { status: "completed", url: job.reference.url, mime: parsed.mime, size: parsed.size };
}

async function imageRunner(options) {
  const skillScript = await realpath(resolve(options["skill-script"])).catch(() => { throw new Error("$nonelinear-image 脚本真实路径不可用；本次未发起调用"); });
  const adapter = await realpath(resolve(options.adapter || join(dirname(fileURLToPath(import.meta.url)), "run-nonelinear-image.mjs"))).catch(() => { throw new Error("NoneLinear 受控调用器不可用；本次未发起调用"); });
  return { skillScript, adapter, node: options.node || process.execPath };
}

async function imageInvocation(job, role, prompt, runner) {
  const spec = roleSpec(role);
  const referenceUrl = role === "background" ? job.reference?.url : null;
  if (job.reference?.kind === "local" && role === "background" && !referenceUrl) throw new Error("本地参考图尚未上传");
  if (referenceUrl) await assertPublicDns(publicHttpsUrl(referenceUrl));
  const particleGuard = role === "particle" ? "\nCreate one isolated decorative particle centered on a transparent background. Keep all corners transparent. No scene, border, text, letters, typography, UI frames, logos, or watermarks." : "";
  const safePrompt = `${prompt}${particleGuard}\nNo text, letters, typography, UI frames, WorkBuddy logos, or watermarks.`;
  const imageArgs = ["--model", IMAGE_MODEL, "--prompt", safePrompt, "--size", spec.size, "--quality", IMAGE_QUALITY, "--response-format", "url"];
  if (referenceUrl) imageArgs.push("--operation", "edit", "--image", publicHttpsUrl(referenceUrl));
  return { args: [runner.adapter, "--skill-script", runner.skillScript, "--", ...imageArgs], spec };
}

function finishImageCall(job, call, execution, error = null) {
  call.finishedAt = new Date().toISOString();
  if (error) {
    call.status = "outcome_unknown";
    call.code = "skill_transport_error";
    return { status: "failed", role: call.role, code: call.code, outcome: "unknown", error: redactSecrets(error.message || error).slice(0, 500) };
  }
  if (!execution || typeof execution !== "object") {
    call.status = "outcome_unknown";
    call.code = "skill_transport_error";
    return { status: "failed", role: call.role, code: call.code, outcome: "unknown", error: "生图进程没有返回可解析结果" };
  }
  if (execution.timedOut) {
    call.status = "outcome_unknown";
    call.code = "skill_timeout_unknown";
    return { status: "failed", role: call.role, code: call.code, outcome: "unknown", error: "生图超过 11 分钟父进程保护上限；不会自动重试" };
  }
  let parsed;
  try { parsed = processResult(execution.stdout, "$nonelinear-image"); } catch (parseError) {
    call.status = "outcome_unknown";
    call.code = "skill_transport_error";
    return { status: "failed", role: call.role, code: call.code, outcome: "unknown", error: redactSecrets(parseError.message || parseError).slice(0, 500) };
  }
  call.requestId = redactedRequestId(parsed.request_id);
  if (parsed.status !== "completed" || execution.code !== 0) {
    call.status = "failed";
    call.code = parsed.code || "unknown_error";
    return { status: "failed", role: call.role, code: call.code, error: redactSecrets(parsed.error || "NoneLinear 生图失败").slice(0, 500) };
  }
  let urls;
  try { urls = (parsed.images || []).map((image) => publicHttpsUrl(image?.url)); } catch {
    call.status = "failed";
    call.code = "no_image_output";
    return { status: "failed", role: call.role, code: call.code, error: "NoneLinear 未返回可用图片" };
  }
  const expected = 1;
  if (urls.length !== expected) {
    call.status = "failed";
    call.code = "incomplete_image_output";
    return { status: "failed", role: call.role, code: call.code, error: `NoneLinear 应返回 ${expected} 张图片，实际 ${urls.length} 张；不会自动补图或重试` };
  }
  call.status = "completed";
  if (call.role === "background") {
    const candidateIndex = Number.isInteger(call.candidateIndex) ? call.candidateIndex : 0;
    const output = job.outputs.background || { candidates: [], url: null, requestId: null, downloaded: null, normalized: null, previewedAt: null, sourceMode: job.backgroundMode };
    const candidate = { id: `background-${candidateIndex + 1}`, label: `方案${candidateIndex + 1}`, url: urls[0], requestId: call.requestId, downloaded: null, normalized: null };
    output.candidates = [...(output.candidates || []).filter((item) => item?.id !== candidate.id), candidate].sort((left, right) => left.id.localeCompare(right.id));
    output.url = output.candidates[0]?.url || null;
    output.requestId = output.candidates[0]?.requestId || null;
    output.sourceMode = job.backgroundMode;
    job.outputs.background = output;
    return { status: "completed", role: call.role, candidateIndex, url: urls[0], requestId: call.requestId };
  }
  if (call.role === "particle") {
    const candidateIndex = Number.isInteger(call.candidateIndex) ? call.candidateIndex : 0;
    const output = job.outputs.particle || { candidates: [], url: null, requestId: null, downloaded: null, normalized: null, previewedAt: null, sourceMode: "generated" };
    const candidate = { id: `particle-${candidateIndex + 1}`, label: `粒子${candidateIndex + 1}`, url: urls[0], requestId: call.requestId, downloaded: null, normalized: null };
    output.candidates = [...(output.candidates || []).filter((item) => item?.id !== candidate.id), candidate].sort((left, right) => left.id.localeCompare(right.id));
    output.url = output.candidates[0]?.url || null;
    output.requestId = output.candidates[0]?.requestId || null;
    job.outputs.particle = output;
    return { status: "completed", role: call.role, candidateIndex, url: urls[0], requestId: call.requestId };
  }
  const url = urls[0];
  job.outputs[call.role] = { url, requestId: call.requestId, downloaded: null, normalized: null, previewedAt: null, sourceMode: "generated" };
  return { status: "completed", role: call.role, url, requestId: call.requestId };
}

async function runImage(options, roots, dependencies = {}) {
  const { root, job } = await loadJob(roots, options.job);
  const role = options.role;
  roleSpec(role);
  if (role === "background" && job.backgroundMode === "direct") throw new Error("direct 模式直接使用参考图，不允许发起背景生图调用");
  const attempts = job.calls.filter((call) => call.role === role).length;
  if (attempts >= job.callsAuthorized[role]) throw new Error(`${role} 没有新的计费调用授权`);
  if (!job.confirmations.generation) throw new Error("生图前必须一次确认完整调用量");
  if (!options["prompt-file"] || !options["skill-script"]) throw new Error("run-image 需要 --prompt-file 和 --skill-script");
  const prompt = (await readFile(resolve(options["prompt-file"]), "utf8")).trim();
  if (!prompt) throw new Error("图片提示词不能为空");
  const runner = await imageRunner(options);
  const invocation = await imageInvocation(job, role, prompt, runner);
  const candidateIndex = role === "background" ? [...Array(BACKGROUND_CANDIDATE_COUNT).keys()].find((index) => !(job.outputs.background?.candidates || []).some((item) => item?.id === `background-${index + 1}`)) : undefined;
  if (role === "background" && candidateIndex == null) throw new Error("三张背景候选已经齐全");
  const call = { role, prompt, model: IMAGE_MODEL, quality: IMAGE_QUALITY, size: invocation.spec.size, responseFormat: "url", startedAt: new Date().toISOString(), status: "running", ownerPid: process.pid, ...(candidateIndex == null ? {} : { candidateIndex }) };
  job.calls.push(call);
  await saveJob(root, job);
  let execution;
  let error = null;
  const stopHeartbeat = dependencies.startHeartbeat
    ? dependencies.startHeartbeat({ label: role === "background" ? "背景图片" : `${role} 素材` })
    : dependencies.executeImageProcess ? () => {} : startForegroundHeartbeat({ label: role === "background" ? "背景图片" : `${role} 素材` });
  try {
    execution = await (dependencies.executeImageProcess
      ? dependencies.executeImageProcess({ role, candidateIndex, args: invocation.args, timeoutMs: IMAGE_PROCESS_TIMEOUT_MS })
      : runProcess(runner.node, invocation.args, { maxOutput: 2 * 1024 * 1024, timeoutMs: IMAGE_PROCESS_TIMEOUT_MS }));
  } catch (caught) { error = caught; }
  finally { stopHeartbeat(); }
  const result = finishImageCall(job, call, execution, error);
  await saveJob(root, job);
  return result;
}

async function runBackgrounds(options, roots, dependencies = {}) {
  const { root, job } = await loadJob(roots, options.job);
  if (job.backgroundMode === "direct") throw new Error("direct 模式不产生背景生图调用");
  if (!job.confirmations.generation) throw new Error("并行生成背景前必须一次确认完整调用量");
  if (!options["prompt-file"] || !options["skill-script"]) throw new Error("run-backgrounds 需要 --prompt-file 和 --skill-script");
  const prompt = (await readFile(resolve(options["prompt-file"]), "utf8")).trim();
  if (!prompt) throw new Error("背景提示词不能为空");
  const existing = new Set((job.outputs.background?.candidates || []).map((item) => item?.id));
  const missing = [...Array(BACKGROUND_CANDIDATE_COUNT).keys()].filter((index) => !existing.has(`background-${index + 1}`));
  const attempts = job.calls.filter((call) => call.role === "background").length;
  const available = Math.max(0, (job.callsAuthorized.background || 0) - attempts);
  const candidateIndexes = missing.slice(0, available);
  if (!candidateIndexes.length) {
    if (!missing.length) return { status: "completed", completed: 0, failed: 0, outcomeUnknown: 0, urls: (job.outputs.background?.candidates || []).map((item) => item.url) };
    throw new Error(`还缺 ${missing.length} 张背景候选，需要用户明确授权新的背景调用`);
  }
  const runner = await imageRunner(options);
  const batchId = `background-batch-${Date.now().toString(36)}-${randomBytes(3).toString("hex")}`;
  const prepared = await Promise.all(candidateIndexes.map(async (candidateIndex) => {
    const candidatePrompt = `${prompt}\nCreate composition variation ${candidateIndex + 1} of ${BACKGROUND_CANDIDATE_COUNT}; preserve the requested subject and visual style.`;
    const invocation = await imageInvocation(job, "background", candidatePrompt, runner);
    return {
      candidateIndex, invocation,
      call: { role: "background", candidateIndex, prompt: candidatePrompt, model: IMAGE_MODEL, quality: IMAGE_QUALITY, size: invocation.spec.size, responseFormat: "url", startedAt: new Date().toISOString(), status: "running", ownerPid: process.pid, batchId },
    };
  }));
  for (const item of prepared) job.calls.push(item.call);
  job.status = "background-generating";
  await saveJob(root, job);
  let saveQueue = Promise.resolve();
  const persist = () => { saveQueue = saveQueue.then(() => saveJob(root, job)); return saveQueue; };
  const stopHeartbeat = dependencies.startHeartbeat
    ? dependencies.startHeartbeat({ label: `${prepared.length} 张背景候选并行生成` })
    : dependencies.executeImageProcess ? () => {} : startForegroundHeartbeat({ label: `${prepared.length} 张背景候选并行生成` });
  let results;
  try {
    results = await Promise.all(prepared.map(async (item) => {
      let execution;
      let error = null;
      try {
        execution = await (dependencies.executeImageProcess
          ? dependencies.executeImageProcess({ role: "background", candidateIndex: item.candidateIndex, args: item.invocation.args, timeoutMs: IMAGE_PROCESS_TIMEOUT_MS })
          : runProcess(runner.node, item.invocation.args, { maxOutput: 2 * 1024 * 1024, timeoutMs: IMAGE_PROCESS_TIMEOUT_MS }));
      } catch (caught) { error = caught; }
      const result = finishImageCall(job, item.call, execution, error);
      await persist();
      return result;
    }));
  } finally { stopHeartbeat(); }
  await saveQueue;
  const completed = results.filter((result) => result.status === "completed").length;
  const outcomeUnknown = results.filter((result) => result.outcome === "unknown").length;
  const failed = results.length - completed - outcomeUnknown;
  const candidates = job.outputs.background?.candidates || [];
  job.status = candidates.length === BACKGROUND_CANDIDATE_COUNT ? "background-generated" : "background-incomplete";
  await saveJob(root, job);
  return { status: candidates.length === BACKGROUND_CANDIDATE_COUNT ? "completed" : "failed", batchId, completed, failed, outcomeUnknown, candidateCount: candidates.length, urls: candidates.map((item) => item.url), defaultUrl: candidates[0]?.url || null, roles: results };
}

async function confirmParticle(options, roots) {
  const { root, job } = await loadJob(roots, options.job);
  if (job.template !== PARTICLE_TEMPLATE_VERSION) throw new Error("当前不是 particle-v1 作业");
  if (options.gate === "generation") {
    if (job.confirmations.generation) throw new Error("本作业的完整调用量已经确认");
    job.confirmations.generation = true;
    job.confirmationTimes.generation = new Date().toISOString();
    job.callsAuthorized.particle = PARTICLE_CANDIDATE_COUNT;
  } else if (options.gate === "final") {
    if (!job.outputs.particle?.normalized) throw new Error("最终确认前必须完成粒子素材");
    job.confirmations.final = true;
    job.confirmationTimes.final = new Date().toISOString();
  } else throw new Error("particle 作业 gate 必须是 generation 或 final");
  await saveJob(root, job);
  return { status: "completed", gate: options.gate };
}

async function runParticles(options, roots, dependencies = {}) {
  const { root, job } = await loadJob(roots, options.job);
  if (job.template !== PARTICLE_TEMPLATE_VERSION) throw new Error("当前不是 particle-v1 作业");
  if (!job.confirmations.generation) throw new Error("并行生成粒子前必须一次确认完整调用量");
  if (!options["prompt-file"] || !options["skill-script"]) throw new Error("run-particles 需要 --prompt-file 和 --skill-script");
  const prompt = (await readFile(resolve(options["prompt-file"]), "utf8")).trim();
  if (!prompt) throw new Error("粒子提示词不能为空");
  const existing = new Set((job.outputs.particle?.candidates || []).map((item) => item?.id));
  const missing = [...Array(PARTICLE_CANDIDATE_COUNT).keys()].filter((index) => !existing.has(`particle-${index + 1}`));
  const attempts = job.calls.filter((call) => call.role === "particle").length;
  const available = Math.max(0, (job.callsAuthorized.particle || 0) - attempts);
  const candidateIndexes = missing.slice(0, available);
  if (!candidateIndexes.length) throw new Error(`还缺 ${missing.length} 张粒子候选，需要用户明确授权新的粒子调用`);
  const runner = await imageRunner(options);
  const batchId = `particle-batch-${Date.now().toString(36)}-${randomBytes(3).toString("hex")}`;
  const prepared = await Promise.all(candidateIndexes.map(async (candidateIndex) => {
    const candidatePrompt = `${prompt}\nCreate variation ${candidateIndex + 1} of ${PARTICLE_CANDIDATE_COUNT}; preserve the requested particle subject and visual style.`;
    const invocation = await imageInvocation(job, "particle", candidatePrompt, runner);
    return { candidateIndex, invocation, call: { role: "particle", candidateIndex, prompt: candidatePrompt, model: IMAGE_MODEL, quality: IMAGE_QUALITY, size: invocation.spec.size, responseFormat: "url", startedAt: new Date().toISOString(), status: "running", ownerPid: process.pid, batchId } };
  }));
  for (const item of prepared) job.calls.push(item.call);
  job.status = "particle-generating";
  await saveJob(root, job);
  let saveQueue = Promise.resolve();
  const persist = () => { saveQueue = saveQueue.then(() => saveJob(root, job)); return saveQueue; };
  const stopHeartbeat = dependencies.startHeartbeat ? dependencies.startHeartbeat({ label: `${prepared.length} 张粒子候选并行生成` }) : dependencies.executeImageProcess ? () => {} : startForegroundHeartbeat({ label: `${prepared.length} 张粒子候选并行生成` });
  let results;
  try {
    results = await Promise.all(prepared.map(async (item) => {
      let execution; let error = null;
      try { execution = await (dependencies.executeImageProcess ? dependencies.executeImageProcess({ role: "particle", candidateIndex: item.candidateIndex, args: item.invocation.args, timeoutMs: IMAGE_PROCESS_TIMEOUT_MS }) : runProcess(runner.node, item.invocation.args, { maxOutput: 2 * 1024 * 1024, timeoutMs: IMAGE_PROCESS_TIMEOUT_MS })); } catch (caught) { error = caught; }
      const result = finishImageCall(job, item.call, execution, error); await persist(); return result;
    }));
  } finally { stopHeartbeat(); }
  await saveQueue;
  const candidates = job.outputs.particle?.candidates || [];
  job.status = candidates.length === PARTICLE_CANDIDATE_COUNT ? "particle-generated" : "particle-incomplete";
  await saveJob(root, job);
  return { status: candidates.length === PARTICLE_CANDIDATE_COUNT ? "completed" : "failed", batchId, candidateCount: candidates.length, urls: candidates.map((item) => item.url), roles: results };
}

async function ingest(options, roots, dependencies = {}) {
  const { root, job } = await loadJob(roots, options.job);
  const role = options.role;
  const spec = roleSpec(role);
  if (role === "particle" && job.template !== PARTICLE_TEMPLATE_VERSION) throw new Error("particle 素材只能属于 particle-v1 作业");
  if (!job.confirmations.generation) throw new Error("准备图片前必须一次确认完整调用量");
  let output = job.outputs[role];
  const normalizer = resolve(options.normalizer || join(dirname(fileURLToPath(import.meta.url)), "normalize-generated-image.py"));
  const normalizeOne = async (sourcePath, normalizedPath) => {
    const normalized = await runProcess(options.python || "python", [normalizer, sourcePath, normalizedPath, "--kind", spec.kind], { maxOutput: 32_768 });
    const parsed = processResult(normalized.stdout, "normalize-generated-image");
    if (parsed.status !== "completed" || normalized.code !== 0) throw new Error(redactSecrets(parsed.error || "图片标准化失败").slice(0, 500));
    return parsed;
  };
  if (role === "background" && job.backgroundMode === "direct") {
    if (!job.reference) throw new Error("direct 模式缺少参考图");
    output ??= { candidates: [], url: job.reference.url || null, requestId: null, downloaded: null, normalized: null, previewedAt: null, sourceMode: "direct" };
    let sourcePath;
    let downloaded = null;
    if (job.reference.kind === "local") {
      if (!job.confirmations.upload || !job.reference.url) throw new Error("本地参考图必须先确认上传并取得公开 URL");
      sourcePath = resolve(job.reference.path);
      if (![".png", ".jpg", ".jpeg", ".webp"].includes(extname(sourcePath).toLowerCase())) throw new Error("直接背景只接受 PNG、JPEG 或 WebP");
      const sourceInfo = await stat(sourcePath);
      if (!sourceInfo.isFile() || sourceInfo.size < 1 || sourceInfo.size > MAX_DOWNLOAD_BYTES) throw new Error("本地参考图必须是 1 B 到 20 MB 的普通文件");
      output.url = job.reference.url;
    } else {
      downloaded = await (dependencies.downloadImage || downloadImage)(job.reference.url, join(root, "downloads", role));
      sourcePath = downloaded.path;
      output.url = job.reference.url;
    }
    const normalizedPath = join(root, "normalized", "background-1.jpg");
    const parsed = await normalizeOne(sourcePath, normalizedPath);
    output.candidates = [{ id: "background-1", label: "默认背景", url: output.url, downloaded: downloaded ? relative(root, downloaded.path) : null, normalized: relative(root, normalizedPath) }];
    output.downloaded = output.candidates[0].downloaded;
    output.normalized = output.candidates[0].normalized;
    output.previewedAt = new Date().toISOString();
    job.outputs.background = output;
    job.needsBuild = true;
    job.confirmations.final = false;
    await saveJob(root, job);
    return { status: "completed", role, paths: [normalizedPath], width: parsed.width, height: parsed.height, sizes: [parsed.size] };
  }
  if (role === "background") {
    if (!Array.isArray(output?.candidates) || output.candidates.length !== BACKGROUND_CANDIDATE_COUNT) throw new Error("背景必须完整返回三张图片，不能自动补图");
    const downloads = await Promise.all(output.candidates.map((candidate, index) => (dependencies.downloadImage || downloadImage)(candidate.url, join(root, "downloads", `background-${index + 1}`))));
    const normalizedItems = [];
    for (let index = 0; index < downloads.length; index += 1) {
      const normalizedPath = join(root, "normalized", `background-${index + 1}.jpg`);
      const parsed = await normalizeOne(downloads[index].path, normalizedPath);
      normalizedItems.push({ path: normalizedPath, parsed });
      output.candidates[index].downloaded = relative(root, downloads[index].path);
      output.candidates[index].normalized = relative(root, normalizedPath);
    }
    output.url = output.candidates[0].url;
    output.downloaded = output.candidates[0].downloaded;
    output.normalized = output.candidates[0].normalized;
    output.previewedAt = new Date().toISOString();
    output.sourceMode ??= job.backgroundMode;
    job.outputs.background = output;
    job.needsBuild = true;
    await saveJob(root, job);
    return { status: "completed", role, paths: normalizedItems.map((item) => item.path), width: normalizedItems[0].parsed.width, height: normalizedItems[0].parsed.height, sizes: normalizedItems.map((item) => item.parsed.size), default: normalizedItems[0].path };
  }
  if (role === "particle") {
    if (!Array.isArray(output?.candidates) || output.candidates.length !== PARTICLE_CANDIDATE_COUNT) throw new Error("粒子必须完整返回三张图片，不能自动补图");
    const downloads = await Promise.all(output.candidates.map((candidate, index) => (dependencies.downloadImage || downloadImage)(candidate.url, join(root, "downloads", `particle-${index + 1}`))));
    const normalizedItems = [];
    for (let index = 0; index < downloads.length; index += 1) {
      const normalizedPath = join(root, "normalized", `particle-${index + 1}.png`);
      const parsed = await normalizeOne(downloads[index].path, normalizedPath);
      normalizedItems.push({ path: normalizedPath, parsed });
      output.candidates[index].downloaded = relative(root, downloads[index].path);
      output.candidates[index].normalized = relative(root, normalizedPath);
    }
    output.url = output.candidates[0].url;
    output.downloaded = output.candidates[0].downloaded;
    output.normalized = output.candidates[0].normalized;
    output.previewedAt = new Date().toISOString();
    job.outputs.particle = output;
    job.needsBuild = true;
    await saveJob(root, job);
    return { status: "completed", role, paths: normalizedItems.map((item) => item.path), width: normalizedItems[0].parsed.width, height: normalizedItems[0].parsed.height, sizes: normalizedItems.map((item) => item.parsed.size), default: normalizedItems[0].path };
  }
  if (!output?.url) throw new Error(`${role} 没有可下载的生成结果`);
  const downloaded = await (dependencies.downloadImage || downloadImage)(output.url, join(root, "downloads", role));
  const normalizedPath = join(root, "normalized", `${role}.png`);
  const parsed = await normalizeOne(downloaded.path, normalizedPath);
  output.downloaded = relative(root, downloaded.path);
  output.normalized = relative(root, normalizedPath);
  output.previewedAt = null;
  output.sourceMode ??= "generated";
  job.outputs[role] = output;
  job.needsBuild = true;
  job.confirmations.final = false;
  if (job.confirmationTimes) job.confirmationTimes.final = null;
  if (job.outputs.background?.normalized) job.status = "media-ready";
  await saveJob(root, job);
  return { status: "completed", role, path: normalizedPath, width: parsed.width, height: parsed.height, size: parsed.size };
}

async function previewOutput(options, roots) {
  const { root, job } = await loadJob(roots, options.job);
  const role = options.role;
  if (!["background", "particle"].includes(role)) throw new Error("preview 只支持 background 或 particle");
  const output = job.outputs[role];
  if (!output?.normalized) throw new Error(`${role === "particle" ? "粒子" : "背景"}尚未标准化，不能展示`);
  const candidates = output.candidates?.length ? output.candidates : [{ id: `${role}-1`, label: role === "particle" ? "粒子1" : "默认背景", url: output.url, normalized: output.normalized }];
  const previews = [];
  for (const candidate of candidates) {
    const path = jobFile(root, candidate.normalized, `${candidate.id}.normalized`);
    const info = await stat(path);
    if (!info.isFile() || info.size < 1) throw new Error(`${role === "particle" ? "粒子" : "背景"}预览文件无效`);
    const url = candidate.url ? publicHttpsUrl(candidate.url) : null;
    previews.push({ id: candidate.id, label: candidate.label, path, url, markdown: url ? `![${candidate.label}](${url})` : null });
  }
  output.previewedAt = new Date().toISOString();
  await saveJob(root, job);
  return {
    status: "completed", role, sourceMode: output.sourceMode || job.backgroundMode, previews, defaultId: previews[0].id,
    instruction: role === "particle" ? "已默认选择粒子1并继续；主题完成后可在 🎨 → 环境粒子特效中切换与微调，不会再次生图。" : "已默认选择方案1并继续；主题完成后可在 🎨 → 主题与背景中随时切换，不会再次生图。",
    previewedAt: output.previewedAt,
  };
}

async function buildParticleTheme(options, roots) {
  const { root, job } = await loadJob(roots, options.job);
  if (job.template !== PARTICLE_TEMPLATE_VERSION || !options.spec) throw new Error("particle 构建需要 particle-v1 作业和 --spec");
  const spec = validateParticleSpec(JSON.parse(await readFile(resolve(options.spec), "utf8")));
  if (!job.outputs.particle?.normalized || job.outputs.particle.candidates?.length !== PARTICLE_CANDIDATE_COUNT) throw new Error("particle 尚未标准化三张候选");
  const source = await loadTheme(job.sourceTheme.path);
  const suffix = createHash("sha256").update(job.id).digest("hex").slice(0, 8);
  const id = job.theme?.id ?? `${slugify(spec.name || source.manifest.name)}-particles-${suffix}`;
  const destination = join(roots.storeRoot, id);
  const temporary = join(roots.storeRoot, `.tmp-${id}-${process.pid}-${randomBytes(3).toString("hex")}`);
  const particleAssets = job.outputs.particle.candidates.map((candidate) => ({ id: candidate.id, label: candidate.label, asset: `particles/${candidate.id}.png` }));
  const { modules: _modules, homeHeader: _homeHeader, copySets: _copySets, particles: _particles, ...baseManifest } = source.manifest;
  const manifest = { ...baseManifest, id, name: spec.name || `${source.manifest.name} · 自定义粒子`, particles: { assets: particleAssets, defaultAssetId: particleAssets[0].id, defaultMotion: spec.motion }, modules: [] };
  validateThemeManifest(manifest);
  await mkdir(join(temporary, "particles"), { recursive: true });
  try {
    for (const background of source.backgroundAssets) {
      const destinationPath = join(temporary, background.asset);
      await mkdir(dirname(destinationPath), { recursive: true });
      await copyFile(background.path, destinationPath);
    }
    for (const candidate of job.outputs.particle.candidates) await copyFile(jobFile(root, candidate.normalized, `${candidate.id}.normalized`), join(temporary, `particles/${candidate.id}.png`));
    await writeFile(join(temporary, "theme.json"), `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
    const loaded = await loadTheme(temporary);
    job.validation = { checkedAt: new Date().toISOString(), background: { asset: manifest.background }, particles: loaded.particleAssets.map(({ id: particleId, asset, size }) => ({ id: particleId, asset, size })), warnings: loaded.warnings };
    await mkdir(roots.storeRoot, { recursive: true });
    try { await access(destination); const backup = join(root, "backups", `${id}-${Date.now()}`); await mkdir(dirname(backup), { recursive: true }); await rename(destination, backup); } catch (error) { if (error.code !== "ENOENT") throw error; }
    await rename(temporary, destination);
  } catch (error) { await rm(temporary, { recursive: true, force: true }); throw error; }
  job.theme = { id, path: destination };
  job.generationSpec = spec; job.needsBuild = false; job.status = "media-ready";
  await saveJob(root, job);
  return { status: "completed", themeId: id, path: destination };
}

async function buildTheme(options, roots) {
  const { root, job } = await loadJob(roots, options.job);
  if (!options.spec) throw new Error("构建主题需要 --spec");
  const spec = validateGenerationSpec(JSON.parse(await readFile(resolve(options.spec), "utf8")));
  if (!job.outputs.background?.normalized) throw new Error("background 尚未标准化");
  const suffix = createHash("sha256").update(job.id).digest("hex").slice(0, 8);
  const id = job.theme?.id ?? `${slugify(spec.name)}-${suffix}`;
  const backgroundCount = job.outputs.background.candidates?.length || 1;
  const manifest = fixedManifest(spec, id, backgroundCount);
  const temporary = join(roots.storeRoot, `.tmp-${id}-${process.pid}-${randomBytes(3).toString("hex")}`);
  const destination = join(roots.storeRoot, id);
  await mkdir(join(temporary, "assets"), { recursive: true });
  try {
    for (let index = 0; index < backgroundCount; index += 1) {
      const candidate = job.outputs.background.candidates?.[index] || { normalized: job.outputs.background.normalized };
      await copyFile(jobFile(root, candidate.normalized, `background-${index + 1}.normalized`), join(temporary, `background-${index + 1}.jpg`));
    }
    await writeFile(join(temporary, "theme.json"), `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
    for (const item of [manifest.background, ...manifest.modules.map((module) => module.asset)]) {
      assetPath(item, { required: true, label: item });
      await verifiedAsset(temporary, item, item);
    }
    const loaded = await loadTheme(temporary);
    const backgroundInfo = await stat(join(temporary, manifest.background));
    job.validation = {
      checkedAt: new Date().toISOString(), background: { asset: manifest.background, size: backgroundInfo.size }, backgrounds: loaded.backgroundAssets.map(({ id: backgroundId, asset, size }) => ({ id: backgroundId, asset, size })),
      modules: loaded.moduleAssets.map(({ id: moduleId, size }) => ({ id: moduleId, size })),
      moduleBytes: loaded.moduleAssets.reduce((total, item) => total + item.size, 0), warnings: loaded.warnings,
    };
    await mkdir(roots.storeRoot, { recursive: true });
    try { await access(destination); const backup = join(root, "backups", `${id}-${Date.now()}`); await mkdir(dirname(backup), { recursive: true }); await rename(destination, backup); } catch (error) { if (error.code !== "ENOENT") throw error; }
    await rename(temporary, destination);
  } catch (error) {
    await rm(temporary, { recursive: true, force: true });
    throw error;
  }
  job.theme = { id, path: destination };
  job.generationSpec = spec;
  job.needsBuild = false;
  job.status = "media-ready";
  await saveJob(root, job);
  return { status: "completed", themeId: id, path: destination };
}

function progressFor(job) {
  if (job.template === PARTICLE_TEMPLATE_VERSION) {
    const persisted = Boolean(job.validation?.particles?.length && job.theme?.path);
    const output = job.outputs?.particle;
    return { ready: (output?.normalized || persisted) ? 1 : 0, total: 1, roles: { particle: { generated: Boolean(output?.url), normalized: Boolean(output?.normalized), persisted, attempts: job.calls.filter((call) => call.role === "particle").length, authorized: job.callsAuthorized?.particle ?? 0 } } };
  }
  const persistedRoles = new Set((job.validation?.modules ?? []).map(({ id }) => id));
  if (job.validation?.background && job.theme?.path) persistedRoles.add("background");
  const readyRoles = IMAGE_ROLES.filter((role) => Boolean(job.outputs?.[role]?.normalized) || persistedRoles.has(role));
  return { ready: readyRoles.length, total: IMAGE_ROLES.length, roles: Object.fromEntries(IMAGE_ROLES.map((role) => [role, {
    generated: job.outputs?.[role]?.sourceMode !== "direct" && Boolean(job.outputs?.[role]?.url),
    sourceMode: job.outputs?.[role]?.sourceMode ?? null,
    normalized: Boolean(job.outputs?.[role]?.normalized),
    persisted: persistedRoles.has(role),
    attempts: job.calls.filter((call) => call.role === role).length,
    authorized: job.callsAuthorized?.[role] ?? 0,
  }])) };
}

function nextFor(job) {
  if (job.template === PARTICLE_TEMPLATE_VERSION) {
    if (job.status === "discarded") return { nextAction: "discarded", requiresUser: false };
    if (job.status === "accepted") return { nextAction: "apply-theme", requiresUser: false };
    if (job.calls.some((call) => call.status === "running")) return { nextAction: "wait-running", requiresUser: false, roles: ["particle"] };
    if (!job.confirmations.generation) return { nextAction: "confirm-generation", requiresUser: true, calls: PARTICLE_CANDIDATE_COUNT, particleCalls: PARTICLE_CANDIDATE_COUNT };
    const candidates = job.outputs?.particle?.candidates?.length ?? 0;
    if (!job.outputs?.particle?.normalized) {
      if (candidates >= PARTICLE_CANDIDATE_COUNT) return { nextAction: "ingest-particle", requiresUser: false };
      const available = Math.max(0, (job.callsAuthorized?.particle ?? 0) - job.calls.filter((call) => call.role === "particle").length);
      return available > 0 ? { nextAction: "run-particles", requiresUser: false, missing: PARTICLE_CANDIDATE_COUNT - candidates } : { nextAction: "authorize-particle", requiresUser: true, missing: PARTICLE_CANDIDATE_COUNT - candidates };
    }
    if (!job.confirmations.final) return { nextAction: "confirm-final", requiresUser: true };
    return { nextAction: "accept", requiresUser: false };
  }
  if (job.status === "discarded") return { nextAction: "discarded", requiresUser: false };
  if (["accepted", "accepted-pending-home", "accepted-home-compatible", "accepted-home-incompatible"].includes(job.status)) return { nextAction: "apply-theme", requiresUser: false };
  const running = (job.calls ?? []).filter((call) => call.status === "running");
  if (running.length) return { nextAction: "wait-running", requiresUser: false, batchId: running.find((call) => call.batchId)?.batchId ?? null, roles: running.map((call) => call.role) };
  if (job.reference?.kind === "local" && !job.confirmations.upload) return { nextAction: "confirm-upload", requiresUser: true };
  if (job.reference?.kind === "local" && !job.reference.url) return { nextAction: "upload-reference", requiresUser: false };
  if (!job.confirmations.generation) return { nextAction: "confirm-generation", requiresUser: true, calls: job.backgroundMode === "direct" ? 0 : BACKGROUND_CANDIDATE_COUNT, backgroundCalls: job.backgroundMode === "direct" ? 0 : BACKGROUND_CANDIDATE_COUNT, backgroundOutputs: job.backgroundMode === "direct" ? 1 : BACKGROUND_CANDIDATE_COUNT };
  const nextRole = (role) => {
    const output = job.outputs?.[role];
    if (output?.url && !output.normalized) return { nextAction: `ingest-${role}`, requiresUser: false };
    if (output?.normalized) return null;
    const attempts = job.calls.filter((call) => call.role === role).length;
    const authorized = job.callsAuthorized?.[role] ?? 0;
    return attempts < authorized
      ? { nextAction: `run-${role}`, requiresUser: false }
      : { nextAction: `authorize-${role}`, requiresUser: true };
  };
  if (job.backgroundMode === "direct" && !job.outputs?.background?.normalized) return { nextAction: "ingest-background", requiresUser: false };
  if (job.backgroundMode !== "direct" && !job.outputs?.background?.normalized) {
    const candidates = job.outputs?.background?.candidates?.length ?? 0;
    if (candidates >= BACKGROUND_CANDIDATE_COUNT) return { nextAction: "ingest-background", requiresUser: false };
    const attempts = job.calls.filter((call) => call.role === "background").length;
    const available = Math.max(0, (job.callsAuthorized?.background ?? 0) - attempts);
    if (available > 0) return { nextAction: available > 1 ? "run-backgrounds" : "run-background", requiresUser: false, missing: BACKGROUND_CANDIDATE_COUNT - candidates, authorizedRemaining: available };
    return { nextAction: "authorize-background", requiresUser: true, missing: BACKGROUND_CANDIDATE_COUNT - candidates, suggestedCount: BACKGROUND_CANDIDATE_COUNT - candidates };
  }
  if (!job.confirmations.final) return { nextAction: "confirm-final", requiresUser: true };
  return { nextAction: "accept", requiresUser: false };
}

async function resumeJob(options, roots) {
  let loaded = null;
  if (options.job) loaded = await loadJob(roots, options.job);
  else {
    let entries = [];
    try { entries = await readdir(roots.jobsRoot, { withFileTypes: true }); } catch (error) { if (error.code !== "ENOENT") throw error; }
    const candidates = [];
    for (const entry of entries) {
      if (!entry.isDirectory() || !ID.test(entry.name)) continue;
      try {
        const candidate = await loadJob(roots, entry.name);
        if (candidate.job.status !== "discarded") candidates.push(candidate);
      } catch { /* 单个损坏作业不能阻断其它可恢复作业。 */ }
    }
    candidates.sort((left, right) => String(right.job.updatedAt).localeCompare(String(left.job.updatedAt)) || right.job.id.localeCompare(left.job.id));
    loaded = candidates[0] ?? null;
  }
  if (!loaded) return { status: "completed", jobId: null, jobStatus: null, nextAction: "start-new-job", requiresUser: true, progress: { ready: 0, total: IMAGE_ROLES.length, roles: {} } };
  return { ...safeStatus(loaded.job), ...nextFor(loaded.job), progress: progressFor(loaded.job), resumedAt: new Date().toISOString() };
}

async function acceptJob(options, roots) {
  let { root, job } = await loadJob(roots, options.job);
  if (!job.confirmations.generation || !job.confirmations.final) throw new Error("accept 前必须确认完整调用量并完成最终确认");
  if (job.template === PARTICLE_TEMPLATE_VERSION) {
    if (!job.outputs?.particle?.normalized) throw new Error("accept 前必须完成粒子素材");
    if (!job.theme?.path || job.needsBuild) {
      await buildParticleTheme(options, roots);
      ({ root, job } = await loadJob(roots, options.job));
    }
    const themePath = resolve(job.theme.path);
    if (!inside(roots.storeRoot, themePath)) throw new Error("接受主题不在用户主题目录中");
    await loadTheme(themePath);
    for (const output of Object.values(job.outputs)) {
      if (!output) continue;
      output.url = null; output.downloaded = null; output.normalized = null;
      for (const candidate of output.candidates || []) { candidate.url = null; candidate.downloaded = null; candidate.normalized = null; }
    }
    await rm(join(root, "downloads"), { recursive: true, force: true });
    await rm(join(root, "normalized"), { recursive: true, force: true });
    job.status = "accepted";
    await saveJob(root, job);
    return { status: "completed", themeId: job.theme.id, path: job.theme.path, backgroundOnly: true, particleOnly: true, next: "apply-theme" };
  }
  if (!job.outputs?.background?.normalized) throw new Error("accept 前必须完成背景素材");
  if (!job.theme?.path || job.needsBuild) {
    await buildTheme(options, roots);
    ({ root, job } = await loadJob(roots, options.job));
  }
  const themePath = resolve(job.theme.path);
  if (!inside(roots.storeRoot, themePath)) throw new Error("接受主题不在用户主题目录中");
  await loadTheme(themePath);
  for (const output of Object.values(job.outputs)) {
    if (!output) continue;
    output.url = null;
    output.downloaded = null;
    output.normalized = null;
    for (const candidate of output.candidates || []) { candidate.url = null; candidate.downloaded = null; candidate.normalized = null; }
  }
  if (job.reference) job.reference.url = null;
  await rm(join(root, "downloads"), { recursive: true, force: true });
  await rm(join(root, "normalized"), { recursive: true, force: true });
  job.status = "accepted";
  await saveJob(root, job);
  return { status: "completed", themeId: job.theme.id, path: job.theme.path, backgroundOnly: true, next: "apply-theme" };
}

async function discardJob(options, roots) {
  const { root, job } = await loadJob(roots, options.job);
  if (job.theme?.path) {
    const themePath = resolve(job.theme.path);
    if (!inside(roots.storeRoot, themePath)) throw new Error("预览主题不在用户主题目录中");
    await mkdir(roots.discardedRoot, { recursive: true });
    const destination = join(roots.discardedRoot, `${job.id}-${Date.now()}`);
    await rename(themePath, destination);
    job.theme.discardedPath = destination;
    job.theme.path = null;
  }
  for (const output of Object.values(job.outputs)) {
    if (!output) continue;
    output.url = null;
    output.downloaded = null;
    output.normalized = null;
    for (const candidate of output.candidates || []) { candidate.url = null; candidate.downloaded = null; candidate.normalized = null; }
  }
  if (job.reference) job.reference.url = null;
  await rm(join(root, "downloads"), { recursive: true, force: true });
  await rm(join(root, "normalized"), { recursive: true, force: true });
  job.status = "discarded";
  await saveJob(root, job);
  return { status: "completed", recoverable: Boolean(job.theme?.discardedPath), path: job.theme?.discardedPath ?? null };
}

function safeStatus(job) {
  return { status: "completed", jobId: job.id, jobStatus: job.status, backgroundMode: job.backgroundMode, backgroundOnly: true, template: job.template, generation: job.generation, confirmations: job.confirmations, confirmationTimes: job.confirmationTimes, callsAuthorized: job.callsAuthorized, calls: job.calls.map(({ role, candidateIndex, model, quality, size, status, code, requestId, batchId, startedAt, finishedAt }) => ({ role, candidateIndex, model, quality, size, status, code, requestId, batchId, startedAt, finishedAt })), outputs: Object.fromEntries(Object.entries(job.outputs).map(([role, output]) => [role, output ? { downloaded: output.downloaded, normalized: output.normalized, previewedAt: output.previewedAt ?? null, sourceMode: output.sourceMode ?? null, hasPendingUrl: Boolean(output.url), candidateCount: output.candidates?.length ?? null } : null])), needsBuild: job.needsBuild ?? Boolean(!job.theme?.path), validation: job.validation ?? null, theme: job.theme, ...nextFor(job), progress: progressFor(job) };
}

function parseOptions(argv) {
  const result = {};
  for (let index = 1; index < argv.length; index += 2) {
    const key = argv[index];
    const value = argv[index + 1];
    if (!key?.startsWith("--") || value == null || value.startsWith("--")) throw new Error(`参数无效：${key ?? ""}`);
    result[key.slice(2)] = value;
  }
  return result;
}

export async function run(argv, overrides = {}) {
  const command = argv[0] || "help";
  const options = parseOptions(argv);
  const roots = stateRoots({ jobsRoot: options["jobs-root"], storeRoot: options["store-root"], discardedRoot: options["discarded-root"] });
  const deps = { ...overrides };
  if (command === "help") return { status: "completed", commands: ["init", "particle-init", "preflight", "confirm", "particle-confirm", "authorize", "upload-reference", "run-image", "run-backgrounds", "run-particles", "ingest", "preview", "resume", "status", "accept", "discard"] };
  if (command === "init") { await mkdir(roots.jobsRoot, { recursive: true }); return initialize(options, roots); }
  if (command === "particle-init") { await mkdir(roots.jobsRoot, { recursive: true }); return initializeParticle(options, roots); }
  if (command === "preflight") return preflight(options);
  if (command === "confirm") return confirmGate(options, roots);
  if (command === "particle-confirm") return confirmParticle(options, roots);
  if (command === "authorize") return authorizeRetry(options, roots);
  if (command === "upload-reference") return uploadReference(options, roots);
  if (command === "run-image") return runImage(options, roots, deps);
  if (command === "run-backgrounds") return runBackgrounds(options, roots, deps);
  if (command === "run-particles") return runParticles(options, roots, deps);
  if (command === "run-derived") throw new Error("仅背景模式不再生成装饰模块");
  if (command === "ingest") return ingest(options, roots, deps);
  if (command === "preview") return previewOutput(options, roots);
  if (command === "build") throw new Error("build 已并入 verify-home，不能脱离真实 Home 锚点单独执行");
  if (command === "verify-home" || command === "reopen-verification") throw new Error("仅背景模式不需要 Home 组件验收");
  if (command === "resume") return resumeJob(options, roots);
  if (command === "status") return safeStatus((await loadJob(roots, options.job)).job);
  if (command === "accept") return acceptJob(options, roots);
  if (command === "discard") return discardJob(options, roots);
  throw new Error(`未知命令：${command}`);
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  run(process.argv.slice(2)).then(
    (result) => { process.stdout.write(`${JSON.stringify(result, null, 2)}\n`); if (result.status === "failed") process.exitCode = 1; },
    (error) => { process.stdout.write(`${JSON.stringify({ status: "failed", code: "job_error", error: redactSecrets(error.message || error).slice(0, 500) })}\n`); process.exitCode = 1; },
  );
}
