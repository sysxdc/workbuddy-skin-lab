import { mkdir, readFile, writeFile } from "node:fs/promises";
import { extname, join } from "node:path";

import { CdpSession, fetchRendererTargets, waitForRendererTargets } from "./cdp-client.mjs";
import { buildProbeAnchorsScript } from "./anchors.mjs";
import { buildCleanupScript, buildModuleInspectionScript, buildRuntimeScript, buildStatusScript } from "./runtime-script.mjs";
import { buildSkinCss } from "./skin-css.mjs";

const MIME = {
  ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".webp": "image/webp",
  ".gif": "image/gif", ".svg": "image/svg+xml",
};

export async function captureScreenshot(session) {
  try {
    return await session.send("Page.captureScreenshot", { format: "png", fromSurface: true, captureBeyondViewport: false }, 15_000);
  } catch (error) {
    if (!/captureScreenshot.*超时/i.test(error.message || "")) throw error;
  }
  return new Promise((resolvePromise, reject) => {
    let settled = false;
    let timer = null;
    let removeHandler = () => {};
    const finish = (callback, value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      removeHandler();
      callback(value);
    };
    try {
      removeHandler = session.on("Page.screencastFrame", (params) => {
        session.send("Page.screencastFrameAck", { sessionId: params.sessionId }).catch(() => {});
        session.send("Page.stopScreencast").catch(() => {});
        finish(resolvePromise, { data: params.data, source: "screencast" });
      });
      timer = setTimeout(() => finish(reject, new Error("CDP 截图与 screencast 均超时")), 12_000);
      session.send("Page.startScreencast", { format: "png", quality: 100, everyNthFrame: 1 }, 5_000).catch((error) => finish(reject, error));
    } catch (error) {
      finish(reject, error);
    }
  });
}

async function dataUrl(path) {
  if (!path) return null;
  const mime = MIME[extname(path).toLowerCase()];
  if (!mime) throw new Error(`不支持图片格式：${extname(path)}`);
  return `data:${mime};base64,${(await readFile(path)).toString("base64")}`;
}

export async function themeEntry(loaded) {
  const sourceBackgrounds = loaded.backgroundAssets || [{ id: "background-1", label: "默认背景", asset: loaded.manifest.background, path: loaded.backgroundPath }];
  const backgrounds = await Promise.all(sourceBackgrounds.map(async (background) => ({
    id: background.id, label: background.label, asset: background.asset, dataUrl: await dataUrl(background.path),
  })));
  return {
    ...loaded.manifest,
    backgroundDataUrl: backgrounds[0].dataUrl,
    backgrounds,
    homeHeader: null,
    copySets: [],
    modules: [],
  };
}

async function evaluateTargets(targets, expression, Session = CdpSession) {
  const results = [];
  for (const target of targets) {
    const session = new Session(target.webSocketDebuggerUrl);
    try {
      await session.open();
      results.push(await session.evaluate(expression));
    } finally {
      session.close();
    }
  }
  return results;
}

const HOME_REQUIREMENTS = Object.freeze({
  "scene-tabs": Object.freeze({ width: 240, height: 32 }),
  "home-composer": Object.freeze({ width: 520, height: 120 }),
  "home-header-title": Object.freeze({ width: 120, height: 20 }),
  "home-header-subtitle": Object.freeze({ width: 120, height: 16 }),
});

const delay = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

function validWaitSeconds(value) {
  const seconds = value == null ? 60 : Number(value);
  if (!Number.isInteger(seconds) || seconds < 1 || seconds > 300) throw new Error("--wait 必须是 1 到 300 秒的整数");
  return seconds;
}

function homeTarget(probe) {
  return probe.targets.find(({ anchors }) => Object.entries(HOME_REQUIREMENTS).every(([id, minimum]) => {
    const anchor = anchors?.[id];
    return anchor?.present && anchor.rect?.width >= minimum.width && anchor.rect?.height >= minimum.height;
  }));
}

export async function waitForHomeAnchors({ port, waitSeconds = 60, deps = {} }) {
  const deadline = Date.now() + validWaitSeconds(waitSeconds) * 1000;
  let lastError = null;
  while (Date.now() <= deadline) {
    try {
      const probe = deps.probeAnchors
        ? await deps.probeAnchors({ port })
        : await probeAnchors({ port, deps });
      const target = homeTarget(probe);
      if (target) return { capturedAt: new Date().toISOString(), targetId: target.id, anchors: target.anchors };
      lastError = new Error("当前页面没有满足固定模板尺寸的 scene-tabs、home-composer 和首页标题锚点");
    } catch (error) {
      lastError = error;
    }
    await (deps.delay ?? delay)(500);
  }
  throw new Error(`等待 Home 锚点超时：${lastError?.message ?? "未知错误"}`);
}

export async function probeAnchors({ port, deps = {} }) {
  const targets = await (deps.fetchRendererTargets ?? fetchRendererTargets)(port);
  if (targets.length === 0) throw new Error("未发现存活的 WorkBuddy renderer/index.html CDP 目标");
  const results = await evaluateTargets(targets, buildProbeAnchorsScript(), deps.Session);
  return {
    probed: results.length,
    targets: targets.map((target, index) => ({ id: target.id, anchors: results[index] })),
  };
}

export async function applySkin({ loadedThemes, activeId, port, deps = {} }) {
  const entries = [];
  for (const theme of loadedThemes) entries.push(await themeEntry(theme));
  const expression = buildRuntimeScript({ css: buildSkinCss(entries), themes: entries, activeId });
  const targets = await (deps.waitForRendererTargets ?? waitForRendererTargets)(port);
  const results = await evaluateTargets(targets, expression, deps.Session);
  const mismatch = results.find((result) => !result?.installed || result.activeId !== activeId);
  if (mismatch) throw new Error(`主题应用后状态不一致：请求 ${activeId}，实际 ${mismatch?.activeId ?? "unknown"}`);
  return { applied: results.length, requestedThemeId: activeId, actualThemeIds: results.map((result) => result.activeId), targets: targets.map((target) => target.id), result: results };
}

export async function readSavedThemePreference({ port, deps = {} }) {
  const expression = `(() => {
    try {
      const value = JSON.parse(localStorage.getItem("workbuddy-skin-lab:v1") || "{}");
      return typeof value.preferredActiveId === "string" ? value.preferredActiveId : null;
    } catch { return null; }
  })()`;
  const targets = await (deps.waitForRendererTargets ?? waitForRendererTargets)(port);
  const values = await evaluateTargets(targets, expression, deps.Session);
  const valid = [...new Set(values.filter((value) => typeof value === "string" && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value)))];
  return valid.length === 1 ? valid[0] : null;
}

export async function removeSkin({ port, deps = {} }) {
  const targets = await (deps.fetchRendererTargets ?? fetchRendererTargets)(port);
  return { removed: (await evaluateTargets(targets, buildCleanupScript(), deps.Session)).length };
}

export async function skinStatus({ port, deps = {} }) {
  const targets = await (deps.fetchRendererTargets ?? fetchRendererTargets)(port);
  return evaluateTargets(targets, buildStatusScript(), deps.Session);
}

export async function readModuleInspections({ port, deps = {} }) {
  const targets = await (deps.fetchRendererTargets ?? fetchRendererTargets)(port);
  if (targets.length === 0) throw new Error("未发现存活的 WorkBuddy renderer/index.html CDP 目标");
  const values = await evaluateTargets(targets, buildModuleInspectionScript(), deps.Session);
  return targets.map((target, index) => ({ id: target.id, inspection: values[index] }));
}

export async function inspectModules({ port, outputDir, label = "inspection", deps = {} }) {
  const targets = await (deps.fetchRendererTargets ?? fetchRendererTargets)(port);
  if (targets.length === 0) throw new Error("未发现存活的 WorkBuddy renderer/index.html CDP 目标");
  await mkdir(outputDir, { recursive: true });
  const results = [];
  for (const target of targets) {
    const session = new (deps.Session ?? CdpSession)(target.webSocketDebuggerUrl, { timeoutMs: 30_000 });
    try {
      await session.open();
      const inspection = await session.evaluate(buildModuleInspectionScript());
      const screenshot = await captureScreenshot(session);
      const safeId = String(target.id).replace(/[^a-z0-9_-]+/gi, "-") || "renderer";
      const safeLabel = String(label).replace(/[^a-z0-9_-]+/gi, "-") || "inspection";
      const screenshotPath = join(outputDir, `workbuddy-modules-${safeId}-${safeLabel}.png`);
      await writeFile(screenshotPath, Buffer.from(screenshot.data, "base64"));
      results.push({ id: target.id, screenshotPath, inspection });
    } finally {
      session.close();
    }
  }
  return { inspected: results.length, targets: results };
}

function expectedModuleIds(loadedTheme) {
  return loadedTheme.manifest.modules.map(({ id }) => id).sort();
}

function validateBaseInspection(inspection, expectedThemeId, expectedIds, expectedHomeHeader) {
  if (inspection?.pageMode !== "home") throw new Error("验收截图不是 Home 页面");
  if (inspection.themeId !== expectedThemeId) throw new Error(`验收主题不一致：请求 ${expectedThemeId}，实际 ${inspection.themeId ?? "unknown"}`);
  const modules = inspection.modules ?? [];
  const ids = modules.map(({ id }) => id).sort();
  if (JSON.stringify(ids) !== JSON.stringify(expectedIds)) throw new Error(`Home 模块不完整：预期 ${expectedIds.length}，实际 ${ids.length}`);
  if (modules.some((module) => !module.visible)) throw new Error("Home 存在不可见模块");
  if (modules.some((module) => module.textOverflow)) throw new Error("Home 模块文字发生溢出");
  if (modules.some((module) => module.style?.pointerEvents !== "none")) throw new Error("A 档模块阻挡了原生点击");
  if (expectedHomeHeader && (inspection.homeHeader?.title !== expectedHomeHeader.title || inspection.homeHeader?.subtitle !== expectedHomeHeader.subtitle)) {
    throw new Error("Home 原生标题未按主题文案生效");
  }
}

function validateOverlayInspection(inspection) {
  const overlays = inspection?.nativeOverlays ?? [];
  if (overlays.length === 0) throw new Error("未检测到已打开的原生 + 弹窗");
  if (overlays.some((overlay) => overlay.style?.pointerEvents === "none" || overlay.style?.opacity !== "1" || overlay.style?.backgroundColor === "rgba(0, 0, 0, 0)" || overlay.clippedAncestors > 0)) {
    throw new Error("原生弹窗的点击或不透明保护未生效");
  }
}

export async function verifyHomeTheme({ loadedTheme, port, outputDir, waitSeconds = 60, homeProof, requireOverlay = true, deps = {} }) {
  if (!homeProof?.targetId || !homeProof.anchors) throw new Error("verify-home 缺少本次存活 CDP Home 锚点证明");
  const activeId = loadedTheme.manifest.id;
  const expectedIds = expectedModuleIds(loadedTheme);
  const apply = deps.applySkin ?? applySkin;
  const inspect = deps.inspectModules ?? inspectModules;
  const read = deps.readModuleInspections ?? readModuleInspections;
  const remove = deps.removeSkin ?? removeSkin;
  const status = deps.skinStatus ?? skinStatus;

  const applied = await apply({ loadedThemes: [loadedTheme], activeId, port });
  if (!applied.actualThemeIds?.every((id) => id === activeId)) throw new Error("apply 未确认实际活动主题");
  const first = await inspect({ port, outputDir, label: "home-applied" });
  const firstTarget = first.targets.find(({ id }) => id === homeProof.targetId);
  if (!firstTarget) throw new Error("Home 验收期间 CDP 目标发生变化");
  validateBaseInspection(firstTarget.inspection, activeId, expectedIds, loadedTheme.manifest.homeHeader);

  let overlay = null;
  if (requireOverlay) {
    const deadline = Date.now() + validWaitSeconds(waitSeconds) * 1000;
    while (Date.now() <= deadline) {
      const snapshots = await read({ port });
      const candidate = snapshots.find(({ id, inspection }) => id === homeProof.targetId && inspection.nativeOverlays?.length);
      if (candidate) { overlay = candidate; break; }
      await (deps.delay ?? delay)(500);
    }
    if (!overlay) throw new Error("等待原生 + 弹窗超时；请在 Home 输入框左下角打开 + 菜单后重试");
    validateOverlayInspection(overlay.inspection);
    const overlayCapture = await inspect({ port, outputDir, label: "native-overlay-open" });
    const captured = overlayCapture.targets.find(({ id }) => id === homeProof.targetId);
    validateOverlayInspection(captured?.inspection);
    overlay = captured;
    let overlayClosed = false;
    const closeDeadline = Date.now() + validWaitSeconds(waitSeconds) * 1000;
    while (Date.now() <= closeDeadline) {
      const snapshots = await read({ port });
      const current = snapshots.find(({ id }) => id === homeProof.targetId);
      if (current && !current.inspection.nativeOverlays?.length) { overlayClosed = true; break; }
      await (deps.delay ?? delay)(500);
    }
    if (!overlayClosed) throw new Error("原生 + 弹窗截图已完成，但菜单尚未关闭；请关闭菜单后重试");
  }

  await remove({ port });
  const paused = await status({ port });
  if (paused.some((item) => item.installed || item.modules || item.mountedModules || item.nativeOverlays)) throw new Error("pause 后仍有主题节点或浮层标记残留");

  const reapplied = await apply({ loadedThemes: [loadedTheme], activeId, port });
  if (!reapplied.actualThemeIds?.every((id) => id === activeId)) throw new Error("再次 apply 未确认实际活动主题");
  const final = await inspect({ port, outputDir, label: "home-reapplied" });
  const finalTarget = final.targets.find(({ id }) => id === homeProof.targetId);
  if (!finalTarget) throw new Error("再次 apply 后 CDP 目标发生变化");
  validateBaseInspection(finalTarget.inspection, activeId, expectedIds, loadedTheme.manifest.homeHeader);

  return {
    passed: true,
    verifiedAt: new Date().toISOString(),
    targetId: homeProof.targetId,
    themeId: activeId,
    pageMode: "home",
    anchors: homeProof.anchors,
    modules: expectedIds,
    overlayChecked: requireOverlay,
    pauseClean: true,
    reapplyPassed: true,
    screenshots: {
      applied: firstTarget.screenshotPath,
      overlay: overlay?.screenshotPath ?? null,
      reapplied: finalTarget.screenshotPath,
    },
  };
}
