#!/usr/bin/env node
import { createHash, randomBytes } from "node:crypto";
import { spawn } from "node:child_process";
import { lookup } from "node:dns/promises";
import { access, copyFile, mkdir, readFile, readdir, realpath, rename, rm, stat, writeFile } from "node:fs/promises";
import { isIP } from "node:net";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { resolveStatePaths } from "../src/constants.mjs";
import { verifyHomeTheme, waitForHomeAnchors } from "../src/injector.mjs";
import { slugify } from "../src/theme-store.mjs";
import { assetPath, loadTheme, validateThemeManifest, verifiedAsset } from "../src/theme-schema.mjs";

export const JOB_VERSION = 1;
export const TEMPLATE_VERSION = "home-scene-v1";
export const IMAGE_MODEL = "gpt-image-2";
export const IMAGE_QUALITY = "low";
export const IMAGE_ROLES = Object.freeze(["background", "home-welcome", "scene-daily", "scene-code", "scene-design", "composer-companion"]);
const DERIVED_ROLES = IMAGE_ROLES.slice(1);
const ID = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const CONTENT_TYPES = new Map([["image/jpeg", ".jpg"], ["image/png", ".png"], ["image/webp", ".webp"]]);
const MAX_DOWNLOAD_BYTES = 20 * 1024 * 1024;

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

async function runProcess(executable, args, { maxOutput = 2 * 1024 * 1024, env = process.env } = {}) {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(executable, args, { shell: false, windowsHide: true, env });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => { stdout += chunk; if (stdout.length > maxOutput) child.kill(); });
    child.stderr.on("data", (chunk) => { stderr += chunk; if (stderr.length > 16_384) stderr = stderr.slice(-16_384); });
    child.on("error", reject);
    child.on("close", (code) => resolvePromise({ code, stdout, stderr }));
  });
}

function roleSpec(role) {
  if (!IMAGE_ROLES.includes(role)) throw new Error("未知图片角色");
  return { size: role === "background" ? "2048x1152" : "1024x1024", kind: role === "background" ? "background" : role === "home-welcome" ? "hero" : role === "composer-companion" ? "composer" : "icon" };
}

export function validateGenerationSpec(input) {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new Error("generation spec 必须是对象");
  if (input.template !== TEMPLATE_VERSION) throw new Error(`template 必须是 ${TEMPLATE_VERSION}`);
  if (typeof input.name !== "string" || !input.name.trim() || input.name.length > 60) throw new Error("name 必须是 1 到 60 个字符");
  const hero = input.copy?.hero;
  const scenes = input.copy?.scenes;
  const homeHeader = input.copy?.homeHeader ?? { title: input.name, subtitle: hero?.title };
  for (const [key, limit] of Object.entries({ title: 24, subtitle: 36 })) {
    if (typeof homeHeader?.[key] !== "string" || !homeHeader[key].trim() || homeHeader[key].trim().length > limit) throw new Error(`copy.homeHeader.${key} 无效`);
  }
  const lengths = { eyebrow: 32, title: 48, subtitle: 80, badge: 16 };
  for (const [key, limit] of Object.entries(lengths)) if (typeof hero?.[key] !== "string" || !hero[key].trim() || hero[key].trim().length > limit) throw new Error(`copy.hero.${key} 无效`);
  const sceneRules = { daily: "office", code: "development", design: "creative" };
  for (const [key, meaning] of Object.entries(sceneRules)) {
    if (scenes?.[key]?.meaning !== meaning || typeof scenes[key].title !== "string" || !scenes[key].title.trim() || scenes[key].title.trim().length > 16) throw new Error(`copy.scenes.${key} 必须保留 ${meaning} 语义且标题不超过 16 字符`);
  }
  if (typeof input.copy?.composerLabel !== "string" || !input.copy.composerLabel.trim() || input.copy.composerLabel.trim().length > 24) throw new Error("copy.composerLabel 无效");
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
    copy: {
      homeHeader: { title: homeHeader.title.trim(), subtitle: homeHeader.subtitle.trim() },
      hero: Object.fromEntries(Object.entries(hero).map(([key, value]) => [key, value.trim()])),
      scenes: Object.fromEntries(Object.entries(sceneRules).map(([key, meaning]) => [key, { meaning, title: scenes[key].title.trim() }])),
      composerLabel: input.copy.composerLabel.trim(),
    },
  };
}

export function fixedManifest(spec, id) {
  const module = (moduleId, slot, order, anchor, kind, asset, box, text) => ({ id: moduleId, slot, order, anchor, kind, asset, box, text });
  const manifest = {
    schemaVersion: 1, id, name: spec.name, background: "background.jpg", colors: spec.colors, homeHeader: spec.copy.homeHeader,
    ui: { opacity: 0.82, blur: 20, radius: 16, appearance: "auto" },
    art: { focusX: spec.art.focusX, focusY: spec.art.focusY, safeArea: spec.art.safeArea, taskMode: "ambient" },
    modules: [
      module("home-welcome", "home-hero", 0, "scene-tabs", "decorate", "assets/home-welcome.png", { x: 0, y: 0, w: 1, h: 1 }, spec.copy.hero),
      module("scene-daily", "scene-icon", 0, "scene-tabs", "icon-swap", "assets/scene-daily.png", { x: 0, y: 0, w: 1, h: 1 }, { title: spec.copy.scenes.daily.title }),
      module("scene-code", "scene-icon", 1, "scene-tabs", "icon-swap", "assets/scene-code.png", { x: 0, y: 0, w: 1, h: 1 }, { title: spec.copy.scenes.code.title }),
      module("scene-design", "scene-icon", 2, "scene-tabs", "icon-swap", "assets/scene-design.png", { x: 0, y: 0, w: 1, h: 1 }, { title: spec.copy.scenes.design.title }),
      module("composer-companion", "composer-float", 0, "home-composer", "floating", "assets/composer-companion.png", { x: 0.86, y: 0.01, w: 0.1, h: 0.22 }, { label: spec.copy.composerLabel }),
    ],
  };
  validateThemeManifest(manifest);
  return manifest;
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
  const callsAuthorized = Object.fromEntries(IMAGE_ROLES.map((role) => [role, role === "background" ? 1 : 0]));
  const job = {
    version: JOB_VERSION, id, template: TEMPLATE_VERSION, name, prompt, status: "initialized",
    createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), reference,
    generation: { model: IMAGE_MODEL, quality: IMAGE_QUALITY, responseFormat: "url", roles: Object.fromEntries(IMAGE_ROLES.map((role) => [role, roleSpec(role)])) },
    confirmations: { upload: false, background: false, final: false }, confirmationTimes: { upload: null, background: null, final: null },
    callsAuthorized, calls: [], outputs: {}, generationSpec: null, theme: null, needsBuild: true, homeProof: null, verification: null,
  };
  await atomicJson(join(root, "job.json"), job);
  return { status: "completed", jobId: id, path: root, next: reference?.kind === "local" ? "confirm-upload" : "run-background" };
}

async function preflight(options) {
  const skillScript = options["skill-script"] ? resolve(options["skill-script"]) : null;
  const python = options.python || "python";
  const normalizer = resolve(options.normalizer || join(dirname(fileURLToPath(import.meta.url)), "normalize-generated-image.py"));
  const [skillExists, normalizerExists] = await Promise.all([
    skillScript ? stat(skillScript).then((info) => info.isFile(), () => false) : false,
    stat(normalizer).then((info) => info.isFile(), () => false),
  ]);
  let skillSyntax = false;
  let resolvedSkillScript = null;
  if (skillExists) {
    resolvedSkillScript = await realpath(skillScript);
    const checked = await runProcess(options.node || process.execPath, ["--check", resolvedSkillScript], { maxOutput: 4096 }).catch(() => ({ code: -1 }));
    skillSyntax = checked.code === 0;
  }
  const pythonCheck = await runProcess(python, ["-c", "import PIL; print('configured')"], { maxOutput: 1024 }).catch(() => ({ code: -1 }));
  return { status: skillExists && skillSyntax && normalizerExists && pythonCheck.code === 0 && credentialConfigured() ? "completed" : "failed", nonelinearSkill: skillExists ? "configured" : "missing", nonelinearSkillSyntax: skillSyntax ? "configured" : "invalid", nonelinearSkillPath: resolvedSkillScript, apiKey: credentialConfigured() ? "configured" : "missing", pythonPillow: pythonCheck.code === 0 ? "configured" : "missing", normalizer: normalizerExists ? "configured" : "missing" };
}

async function confirmGate(options, roots) {
  const { root, job } = await loadJob(roots, options.job);
  const gate = options.gate;
  if (gate === "upload") job.confirmations.upload = true;
  else if (gate === "background") {
    if (job.confirmations.background) throw new Error("背景已经确认；只有重新生成背景后才能再次授权派生素材");
    if (!job.outputs.background?.url) throw new Error("确认背景前必须先成功生成背景");
    job.confirmations.background = true;
    for (const role of DERIVED_ROLES) {
      const attempts = job.calls.filter((call) => call.role === role).length;
      job.callsAuthorized[role] = attempts + 1;
    }
  } else if (gate === "final") {
    if (!job.theme?.path || job.status !== "verified" || !validVerification(job)) throw new Error("最终确认前必须完成 verify-home 机器验收");
    job.confirmations.final = true;
  } else throw new Error("gate 必须是 upload、background 或 final");
  job.confirmationTimes ??= { upload: null, background: null, final: null };
  job.confirmationTimes[gate] = new Date().toISOString();
  await saveJob(root, job);
  return { status: "completed", gate };
}

async function authorizeRetry(options, roots) {
  const { root, job } = await loadJob(roots, options.job);
  const role = options.call;
  roleSpec(role);
  const attempts = job.calls.filter((call) => call.role === role).length;
  if (attempts < job.callsAuthorized[role]) throw new Error(`${role} 仍有尚未使用的调用授权`);
  if (role !== "background" && !job.confirmations.background) throw new Error("背景未确认，不能授权派生素材调用");
  job.callsAuthorized[role] += 1;
  job.confirmations.final = false;
  if (job.confirmationTimes) job.confirmationTimes.final = null;
  job.verification = null;
  job.homeProof = null;
  job.needsBuild = true;
  if (role === "background") {
    job.confirmations.background = false;
    if (job.confirmationTimes) {
      job.confirmationTimes.background = null;
      job.confirmationTimes.final = null;
    }
    job.outputs.background = null;
    for (const derivedRole of DERIVED_ROLES) {
      job.callsAuthorized[derivedRole] = job.calls.filter((call) => call.role === derivedRole).length;
      job.outputs[derivedRole] = null;
    }
    job.status = "background-revision";
  } else {
    job.outputs[role] = null;
    job.status = `${role}-revision`;
  }
  await saveJob(root, job);
  return { status: "completed", role, authorized: job.callsAuthorized[role] };
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

async function runImage(options, roots) {
  const { root, job } = await loadJob(roots, options.job);
  const role = options.role;
  const spec = roleSpec(role);
  const attempts = job.calls.filter((call) => call.role === role).length;
  if (attempts >= job.callsAuthorized[role]) throw new Error(`${role} 没有新的计费调用授权`);
  if (role !== "background" && !job.confirmations.background) throw new Error("派生素材必须在用户确认背景并授权 5 次调用后生成");
  if (!options["prompt-file"] || !options["skill-script"]) throw new Error("run-image 需要 --prompt-file 和 --skill-script");
  const skillScript = await realpath(resolve(options["skill-script"])).catch(() => { throw new Error("$nonelinear-image 脚本真实路径不可用；本次未发起调用"); });
  const prompt = (await readFile(resolve(options["prompt-file"]), "utf8")).trim();
  if (!prompt) throw new Error("图片提示词不能为空");
  const referenceUrl = role === "background" ? job.reference?.url : job.outputs.background?.url;
  if (job.reference?.kind === "local" && role === "background" && !referenceUrl) throw new Error("本地参考图尚未上传");
  if (referenceUrl) await assertPublicDns(publicHttpsUrl(referenceUrl));
  const args = [skillScript, "--model", IMAGE_MODEL, "--prompt", prompt, "--size", spec.size, "--quality", IMAGE_QUALITY, "--response-format", "url"];
  if (referenceUrl) args.push("--operation", "edit", "--image", publicHttpsUrl(referenceUrl));
  const call = { role, prompt, model: IMAGE_MODEL, quality: IMAGE_QUALITY, size: spec.size, responseFormat: "url", startedAt: new Date().toISOString(), status: "running" };
  job.calls.push(call);
  await saveJob(root, job);
  let result;
  try {
    result = await runProcess(options.node || process.execPath, args, { maxOutput: 2 * 1024 * 1024 });
  } catch (error) {
    call.finishedAt = new Date().toISOString();
    call.status = "outcome_unknown";
    call.code = "skill_transport_error";
    await saveJob(root, job);
    return { status: "failed", code: call.code, outcome: "unknown", error: redactSecrets(error.message || error).slice(0, 500) };
  }
  let parsed;
  try {
    parsed = processResult(result.stdout, "$nonelinear-image");
  } catch (error) {
    call.finishedAt = new Date().toISOString();
    call.status = "outcome_unknown";
    call.code = "skill_transport_error";
    await saveJob(root, job);
    return { status: "failed", code: call.code, outcome: "unknown", error: redactSecrets(error.message || error).slice(0, 500) };
  }
  call.finishedAt = new Date().toISOString();
  call.status = parsed.status === "completed" ? "completed" : "failed";
  call.requestId = redactedRequestId(parsed.request_id);
  if (parsed.status !== "completed" || result.code !== 0) {
    call.code = parsed.code || "unknown_error";
    await saveJob(root, job);
    return { status: "failed", code: call.code, error: redactSecrets(parsed.error || "NoneLinear 生图失败").slice(0, 500) };
  }
  const url = publicHttpsUrl(parsed.images?.[0]?.url);
  job.outputs[role] = { url, requestId: call.requestId, downloaded: null, normalized: null };
  await saveJob(root, job);
  return { status: "completed", role, url, requestId: call.requestId };
}

async function ingest(options, roots) {
  const { root, job } = await loadJob(roots, options.job);
  const role = options.role;
  const spec = roleSpec(role);
  const output = job.outputs[role];
  if (!output?.url) throw new Error(`${role} 没有可下载的生成结果`);
  const downloaded = await downloadImage(output.url, join(root, "downloads", role));
  const normalizedPath = join(root, "normalized", role === "background" ? "background.jpg" : `${role}.png`);
  const normalizer = resolve(options.normalizer || join(dirname(fileURLToPath(import.meta.url)), "normalize-generated-image.py"));
  const normalized = await runProcess(options.python || "python", [normalizer, downloaded.path, normalizedPath, "--kind", spec.kind], { maxOutput: 32_768 });
  const parsed = processResult(normalized.stdout, "normalize-generated-image");
  if (parsed.status !== "completed" || normalized.code !== 0) return { status: "failed", code: parsed.code || "normalize_error", error: redactSecrets(parsed.error || "图片标准化失败").slice(0, 500) };
  output.downloaded = relative(root, downloaded.path);
  output.normalized = relative(root, normalizedPath);
  job.needsBuild = true;
  job.verification = null;
  job.confirmations.final = false;
  if (job.confirmationTimes) job.confirmationTimes.final = null;
  if (IMAGE_ROLES.every((candidate) => job.outputs[candidate]?.normalized)) job.status = "media-ready";
  await saveJob(root, job);
  return { status: "completed", role, path: normalizedPath, width: parsed.width, height: parsed.height, size: parsed.size };
}

async function buildTheme(options, roots, homeProof = null) {
  const { root, job } = await loadJob(roots, options.job);
  if (!homeProof?.targetId || !homeProof.anchors?.["scene-tabs"]?.present || !homeProof.anchors?.["home-composer"]?.present) {
    throw new Error("build 只能由 verify-home 在本次真实 Home 锚点探测成功后执行");
  }
  const spec = validateGenerationSpec(JSON.parse(await readFile(resolve(options.spec), "utf8")));
  for (const role of IMAGE_ROLES) if (!job.outputs[role]?.normalized) throw new Error(`${role} 尚未标准化`);
  const suffix = createHash("sha256").update(job.id).digest("hex").slice(0, 8);
  const id = job.theme?.id ?? `${slugify(spec.name)}-${suffix}`;
  const manifest = fixedManifest(spec, id);
  const temporary = join(roots.storeRoot, `.tmp-${id}-${process.pid}-${randomBytes(3).toString("hex")}`);
  const destination = join(roots.storeRoot, id);
  await mkdir(join(temporary, "assets"), { recursive: true });
  try {
    await copyFile(jobFile(root, job.outputs.background.normalized, "background.normalized"), join(temporary, "background.jpg"));
    for (const role of DERIVED_ROLES) await copyFile(jobFile(root, job.outputs[role].normalized, `${role}.normalized`), join(temporary, "assets", `${role}.png`));
    await writeFile(join(temporary, "theme.json"), `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
    for (const item of [manifest.background, ...manifest.modules.map((module) => module.asset)]) {
      assetPath(item, { required: true, label: item });
      await verifiedAsset(temporary, item, item);
    }
    const loaded = await loadTheme(temporary);
    const backgroundInfo = await stat(join(temporary, manifest.background));
    job.validation = {
      checkedAt: new Date().toISOString(), background: { asset: manifest.background, size: backgroundInfo.size },
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
  job.homeProof = homeProof;
  job.verification = null;
  job.needsBuild = false;
  job.status = "awaiting-home-verification";
  await saveJob(root, job);
  return { status: "completed", themeId: id, path: destination };
}

function validVerification(job) {
  const verification = job.verification;
  if (!verification?.passed || verification.themeId !== job.theme?.id || verification.pageMode !== "home") return false;
  const expected = ["composer-companion", "home-welcome", "scene-code", "scene-daily", "scene-design"];
  const actual = [...(verification.modules || [])].sort();
  return JSON.stringify(actual) === JSON.stringify(expected)
    && verification.overlayChecked === true
    && verification.pauseClean === true
    && verification.reapplyPassed === true
    && Boolean(verification.screenshots?.applied && verification.screenshots?.overlay && verification.screenshots?.reapplied)
    && Boolean(job.homeProof?.targetId && job.homeProof?.anchors?.["scene-tabs"]?.present && job.homeProof?.anchors?.["home-composer"]?.present);
}

function progressFor(job) {
  const persistedRoles = new Set((job.validation?.modules ?? []).map(({ id }) => id));
  if (job.validation?.background && job.theme?.path) persistedRoles.add("background");
  const readyRoles = IMAGE_ROLES.filter((role) => Boolean(job.outputs?.[role]?.normalized) || persistedRoles.has(role));
  return { ready: readyRoles.length, total: IMAGE_ROLES.length, roles: Object.fromEntries(IMAGE_ROLES.map((role) => [role, {
    generated: Boolean(job.outputs?.[role]?.url),
    normalized: Boolean(job.outputs?.[role]?.normalized),
    persisted: persistedRoles.has(role),
    attempts: job.calls.filter((call) => call.role === role).length,
    authorized: job.callsAuthorized?.[role] ?? 0,
  }])) };
}

function nextFor(job) {
  if (job.status === "discarded") return { nextAction: "discarded", requiresUser: false };
  if (job.status === "accepted") return { nextAction: "apply-theme", requiresUser: false };
  if (job.theme?.path && job.needsBuild === false) {
    if (job.status === "verified" && !job.confirmations.final) return { nextAction: "confirm-final", requiresUser: true };
    if (job.status === "verified" && job.confirmations.final) return { nextAction: "accept", requiresUser: false };
    return { nextAction: "verify-home", requiresUser: true };
  }
  if (job.reference?.kind === "local" && !job.confirmations.upload) return { nextAction: "confirm-upload", requiresUser: true };
  if (job.reference?.kind === "local" && !job.reference.url) return { nextAction: "upload-reference", requiresUser: false };
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
  const background = nextRole("background");
  if (background) return background;
  if (!job.confirmations.background) return { nextAction: "confirm-background", requiresUser: true };
  for (const role of DERIVED_ROLES) {
    const next = nextRole(role);
    if (next) return next;
  }
  if (job.status === "verified" && !job.confirmations.final) return { nextAction: "confirm-final", requiresUser: true };
  if (job.status === "verified" && job.confirmations.final) return { nextAction: "accept", requiresUser: false };
  return { nextAction: "verify-home", requiresUser: true };
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

async function verifyHomeJob(options, roots, deps) {
  let loaded = await loadJob(roots, options.job);
  if (loaded.job.status === "accepted") throw new Error("已接受作业必须先执行 reopen-verification");
  const waitSeconds = options.wait == null ? 60 : Number(options.wait);
  const port = options.port == null ? 9223 : Number(options.port);
  const homeProof = await deps.waitForHomeAnchors({ port, waitSeconds });
  let specChanged = false;
  if (options.spec && loaded.job.generationSpec) {
    const requestedSpec = validateGenerationSpec(JSON.parse(await readFile(resolve(options.spec), "utf8")));
    specChanged = JSON.stringify(requestedSpec) !== JSON.stringify(loaded.job.generationSpec);
  }
  if (!loaded.job.theme?.path || loaded.job.needsBuild === true || specChanged) {
    if (!options.spec) throw new Error("首次 verify-home 需要 --spec");
    await buildTheme(options, roots, homeProof);
    loaded = await loadJob(roots, options.job);
  } else {
    const themePath = resolve(loaded.job.theme.path);
    if (!inside(roots.storeRoot, themePath)) throw new Error("预览主题不在用户主题目录中");
    await loadTheme(themePath);
    loaded.job.homeProof = homeProof;
    loaded.job.verification = null;
    loaded.job.status = "awaiting-home-verification";
    await saveJob(loaded.root, loaded.job);
  }
  const loadedTheme = await loadTheme(resolve(loaded.job.theme.path));
  const verification = await deps.verifyHomeTheme({ loadedTheme, port, outputDir: join(loaded.root, "verification"), waitSeconds, homeProof, requireOverlay: true });
  loaded = await loadJob(roots, options.job);
  loaded.job.homeProof = homeProof;
  loaded.job.verification = verification;
  loaded.job.status = "verified";
  await saveJob(loaded.root, loaded.job);
  return { status: "completed", jobId: loaded.job.id, jobStatus: loaded.job.status, verification };
}

async function reopenVerification(options, roots) {
  const { root, job } = await loadJob(roots, options.job);
  if (!job.theme?.path) throw new Error("当前作业没有可复验主题");
  const themePath = resolve(job.theme.path);
  if (!inside(roots.storeRoot, themePath)) throw new Error("复验主题不在用户主题目录中");
  const loaded = await loadTheme(themePath);
  if (loaded.manifest.id !== job.theme.id) throw new Error("复验主题 ID 与作业不一致");
  job.confirmations.final = false;
  if (job.confirmationTimes) job.confirmationTimes.final = null;
  job.homeProof = null;
  job.verification = null;
  job.needsBuild = false;
  job.status = "awaiting-home-verification";
  await saveJob(root, job);
  return { status: "completed", jobId: job.id, jobStatus: job.status, themeId: job.theme.id, path: themePath, assets: loaded.moduleAssets.map(({ id, size }) => ({ id, size })) };
}

async function acceptJob(options, roots) {
  const { root, job } = await loadJob(roots, options.job);
  if (!job.confirmations.final || !job.theme?.path || job.status !== "verified" || !validVerification(job)) throw new Error("accept 前必须完成 verify-home、最终确认和无残留复验");
  const themePath = resolve(job.theme.path);
  if (!inside(roots.storeRoot, themePath)) throw new Error("接受主题不在用户主题目录中");
  await loadTheme(themePath);
  for (const [label, screenshot] of Object.entries(job.verification.screenshots)) {
    const screenshotPath = resolve(screenshot);
    if (!inside(root, screenshotPath)) throw new Error(`验收截图 ${label} 不在作业目录中`);
    const info = await stat(screenshotPath);
    if (!info.isFile() || info.size < 1) throw new Error(`验收截图 ${label} 无效`);
  }
  for (const output of Object.values(job.outputs)) {
    if (!output) continue;
    output.url = null;
    output.downloaded = null;
    output.normalized = null;
  }
  if (job.reference) job.reference.url = null;
  await rm(join(root, "downloads"), { recursive: true, force: true });
  await rm(join(root, "normalized"), { recursive: true, force: true });
  job.status = "accepted";
  await saveJob(root, job);
  return { status: "completed", themeId: job.theme.id, path: job.theme.path };
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
  }
  if (job.reference) job.reference.url = null;
  await rm(join(root, "downloads"), { recursive: true, force: true });
  await rm(join(root, "normalized"), { recursive: true, force: true });
  job.status = "discarded";
  await saveJob(root, job);
  return { status: "completed", recoverable: Boolean(job.theme?.discardedPath), path: job.theme?.discardedPath ?? null };
}

function safeStatus(job) {
  return { status: "completed", jobId: job.id, jobStatus: job.status, template: job.template, generation: job.generation, confirmations: job.confirmations, confirmationTimes: job.confirmationTimes, callsAuthorized: job.callsAuthorized, calls: job.calls.map(({ role, model, quality, size, status, code, requestId }) => ({ role, model, quality, size, status, code, requestId })), outputs: Object.fromEntries(Object.entries(job.outputs).map(([role, output]) => [role, output ? { downloaded: output.downloaded, normalized: output.normalized, hasPendingUrl: Boolean(output.url) } : null])), needsBuild: job.needsBuild ?? Boolean(!job.theme?.path), validation: job.validation ?? null, homeProof: job.homeProof ?? null, verification: job.verification ?? null, theme: job.theme, ...nextFor(job), progress: progressFor(job) };
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
  const deps = { waitForHomeAnchors, verifyHomeTheme, ...overrides };
  if (command === "help") return { status: "completed", commands: ["init", "preflight", "confirm", "authorize", "upload-reference", "run-image", "ingest", "verify-home", "reopen-verification", "resume", "status", "accept", "discard"] };
  if (command === "init") { await mkdir(roots.jobsRoot, { recursive: true }); return initialize(options, roots); }
  if (command === "preflight") return preflight(options);
  if (command === "confirm") return confirmGate(options, roots);
  if (command === "authorize") return authorizeRetry(options, roots);
  if (command === "upload-reference") return uploadReference(options, roots);
  if (command === "run-image") return runImage(options, roots);
  if (command === "ingest") return ingest(options, roots);
  if (command === "build") throw new Error("build 已并入 verify-home，不能脱离真实 Home 锚点单独执行");
  if (command === "verify-home") return verifyHomeJob(options, roots, deps);
  if (command === "reopen-verification") return reopenVerification(options, roots);
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
