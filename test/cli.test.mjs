import assert from "node:assert/strict";
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { chooseActiveThemeId, runCli } from "../src/cli.mjs";
import { applySkin, captureScreenshot, inspectModules, readSavedThemePreference, verifyHomeTheme, waitForHomeAnchors } from "../src/injector.mjs";

test("probe-anchors CLI 转发已校验端口", async () => {
  const result = await runCli(["probe-anchors", "--port", "9333"], {
    probeAnchors: async (options) => ({ port: options.port }),
  });
  assert.deepEqual(result, { port: 9333 });
});

test("CDP 标准截图超时后降级为 screencast 单帧", async () => {
  let handler;
  const calls = [];
  const session = {
    on(method, callback) { assert.equal(method, "Page.screencastFrame"); handler = callback; return () => { handler = null; }; },
    async send(method) {
      calls.push(method);
      if (method === "Page.captureScreenshot") throw new Error("CDP Page.captureScreenshot 超时");
      if (method === "Page.startScreencast") queueMicrotask(() => handler({ data: Buffer.from("png").toString("base64"), sessionId: 7 }));
      return {};
    },
  };
  const result = await captureScreenshot(session);
  assert.equal(Buffer.from(result.data, "base64").toString(), "png");
  assert.equal(result.source, "screencast");
  assert.deepEqual(calls.slice(0, 3), ["Page.captureScreenshot", "Page.startScreencast", "Page.screencastFrameAck"]);
});

test("inspect-modules CLI 要求输出目录", async () => {
  await assert.rejects(() => runCli(["inspect-modules"], {}), /--output-dir/);
});

test("inspectModules 保存 CDP 截图并返回固定自检结果", async () => {
  const outputDir = await mkdtemp(join(tmpdir(), "wb-inspect-"));
  class Session {
    constructor(url, options) { assert.equal(options.timeoutMs, 30_000); }
    async open() {}
    async evaluate(expression) { assert.match(expression, /getComputedStyle/); return { modules: [] }; }
    async send(method) { assert.equal(method, "Page.captureScreenshot"); return { data: Buffer.from("png").toString("base64") }; }
    close() {}
  }
  const result = await inspectModules({
    port: 9223,
    outputDir,
    deps: {
      fetchRendererTargets: async () => [{ id: "renderer/one", webSocketDebuggerUrl: "ws://127.0.0.1:9223/devtools/page/1" }],
      Session,
    },
  });
  assert.equal(result.inspected, 1);
  assert.equal((await readFile(result.targets[0].screenshotPath, "utf8")), "png");
  assert.deepEqual(result.targets[0].inspection, { modules: [] });
});

test("applySkin 拒绝运行时实际主题与请求主题不一致", async () => {
  const loaded = {
    manifest: { id: "new-theme", modules: [], colors: {}, ui: {}, art: {} },
    backgroundPath: null,
    moduleAssets: [],
  };
  class Session {
    async open() {}
    async evaluate() { return { installed: true, activeId: "old-theme" }; }
    close() {}
  }
  await assert.rejects(() => applySkin({
    loadedThemes: [loaded], activeId: "new-theme", port: 9223,
    deps: {
      waitForRendererTargets: async () => [{ id: "one", webSocketDebuggerUrl: "ws://127.0.0.1:9223/devtools/page/1" }],
      Session,
    },
  }), /请求 new-theme，实际 old-theme/);
});

test("apply 未指定主题时恢复磁盘活动主题，成功后再持久化", async () => {
  let saved = null;
  const result = await runCli(["apply"], {
    readPendingThemeId: async () => null,
    readActiveThemeId: async () => "aurora-lab",
    readSavedThemePreference: async () => null,
    writeActiveThemeId: async (id) => { saved = id; },
    applySkin: async ({ activeId }) => ({ applied: 1, requestedThemeId: activeId, actualThemeIds: [activeId] }),
  });
  assert.equal(result.requestedThemeId, "aurora-lab");
  assert.equal(result.persistedThemeId, "aurora-lab");
  assert.equal(saved, "aurora-lab");
  let wroteAfterFailure = false;
  await assert.rejects(() => runCli(["apply", "--theme", "aurora-lab"], {
    readPendingThemeId: async () => null,
    writeActiveThemeId: async () => { wroteAfterFailure = true; },
    applySkin: async () => { throw new Error("renderer rejected"); },
  }), /renderer rejected/);
  assert.equal(wroteAfterFailure, false);
});

test("🎨 保存的主题优先于旧磁盘记录并在下次 apply 时固化", async () => {
  let saved = null;
  const result = await runCli(["apply"], {
    readPendingThemeId: async () => null,
    readSavedThemePreference: async () => "aurora-lab",
    readActiveThemeId: async () => "missing-old-theme",
    writeActiveThemeId: async (id) => { saved = id; },
    applySkin: async ({ activeId }) => ({ applied: 1, requestedThemeId: activeId, actualThemeIds: [activeId] }),
  });
  assert.equal(result.requestedThemeId, "aurora-lab");
  assert.equal(result.preferenceSource, "panel");
  assert.equal(saved, "aurora-lab");
});

test("读取 🎨 保存主题只接受固定 localStorage key 中的安全 ID", async () => {
  let storedValue = "saved-theme";
  class Session {
    async open() {}
    async evaluate(expression) {
      assert.match(expression, /workbuddy-skin-lab:v1/);
      assert.match(expression, /preferredActiveId/);
      return storedValue;
    }
    close() {}
  }
  assert.equal(await readSavedThemePreference({
    port: 9223,
    deps: {
      waitForRendererTargets: async () => [{ id: "one", webSocketDebuggerUrl: "ws://127.0.0.1:9223/devtools/page/1" }],
      Session,
    },
  }), "saved-theme");
  storedValue = "../not-a-theme";
  assert.equal(await readSavedThemePreference({
    port: 9223,
    deps: {
      waitForRendererTargets: async () => [{ id: "one", webSocketDebuggerUrl: "ws://127.0.0.1:9223/devtools/page/1" }],
      Session,
    },
  }), null);
});

test("主题选择顺序为显式请求、🎨 保存、磁盘记录、最近用户主题", () => {
  const valid = [
    { manifest: { id: "aurora-lab" }, root: "D:\\project\\themes\\aurora-lab", modifiedAtMs: 9999 },
    { manifest: { id: "older-user" }, root: "C:\\state\\themes\\older-user", modifiedAtMs: 10 },
    { manifest: { id: "latest-user" }, root: "C:\\state\\themes\\latest-user", modifiedAtMs: 20 },
  ];
  assert.equal(chooseActiveThemeId(valid, { remembered: null, userThemesRoot: "C:\\state\\themes" }), "latest-user");
  assert.equal(chooseActiveThemeId(valid, { remembered: "older-user", userThemesRoot: "C:\\state\\themes" }), "older-user");
  assert.equal(chooseActiveThemeId(valid, { preferred: "latest-user", remembered: "older-user", userThemesRoot: "C:\\state\\themes" }), "latest-user");
  assert.equal(chooseActiveThemeId(valid, { pending: "latest-user", preferred: "older-user", remembered: "older-user", userThemesRoot: "C:\\state\\themes" }), "latest-user");
  assert.equal(chooseActiveThemeId(valid, { requested: "aurora-lab", preferred: "latest-user", remembered: "older-user", userThemesRoot: "C:\\state\\themes" }), "aurora-lab");
});

test("待启用主题优先于旧面板偏好，并在成功应用后固化", async () => {
  let saved = null;
  const result = await runCli(["apply"], {
    readPendingThemeId: async () => "aurora-lab",
    readSavedThemePreference: async () => "custom-theme-7aaebc35",
    readActiveThemeId: async () => "custom-theme-7aaebc35",
    writeActiveThemeId: async (id) => { saved = id; },
    applySkin: async ({ activeId }) => ({ applied: 1, requestedThemeId: activeId, actualThemeIds: [activeId] }),
  });
  assert.equal(result.requestedThemeId, "aurora-lab");
  assert.equal(result.preferenceSource, "pending");
  assert.equal(saved, "aurora-lab");
});

test("waitForHomeAnchors 只接受本次真实存在且尺寸达标的 Home 锚点", async () => {
  let calls = 0;
  const proof = await waitForHomeAnchors({
    port: 9223, waitSeconds: 1,
    deps: {
      delay: async () => {},
      probeAnchors: async () => ({
        targets: [{ id: "home", anchors: calls++ === 0
          ? { "scene-tabs": { present: false }, "home-composer": { present: false } }
          : {
              "scene-tabs": { present: true, rect: { width: 296, height: 36 } },
              "home-composer": { present: true, rect: { width: 752, height: 224 } },
              "home-header-title": { present: true, rect: { width: 752, height: 48 } },
              "home-header-subtitle": { present: true, rect: { width: 752, height: 28 } },
            } }],
      }),
    },
  });
  assert.equal(proof.targetId, "home");
  assert.equal(calls, 2);
});

test("verifyHomeTheme 拒绝任务页或空模块，且通过后强制 pause 与 reapply", async () => {
  const loadedTheme = {
    manifest: { id: "new-theme", homeHeader: { title: "暮色纸灯", subtitle: "在灯影里继续今天" }, modules: [{ id: "one" }] },
    backgroundPath: null,
    moduleAssets: [],
  };
  const base = { themeId: "new-theme", pageMode: "home", homeHeader: { title: "暮色纸灯", subtitle: "在灯影里继续今天" }, modules: [{ id: "one", visible: true, textOverflow: false, style: { pointerEvents: "none" } }], nativeOverlays: [] };
  let applyCount = 0;
  const deps = {
    applySkin: async () => { applyCount += 1; return { actualThemeIds: ["new-theme"] }; },
    inspectModules: async ({ label }) => ({ targets: [{ id: "home", screenshotPath: `${label}.png`, inspection: base }] }),
    removeSkin: async () => ({ removed: 1 }),
    skinStatus: async () => [{ installed: false, modules: 0, mountedModules: 0, nativeOverlays: 0 }],
  };
  const result = await verifyHomeTheme({ loadedTheme, port: 9223, outputDir: ".", homeProof: { targetId: "home", anchors: {} }, requireOverlay: false, deps });
  assert.equal(result.passed, true);
  assert.equal(applyCount, 2);

  await assert.rejects(() => verifyHomeTheme({
    loadedTheme, port: 9223, outputDir: ".", homeProof: { targetId: "home", anchors: {} }, requireOverlay: false,
    deps: { ...deps, inspectModules: async () => ({ targets: [{ id: "home", screenshotPath: "wrong-title.png", inspection: { ...base, homeHeader: { title: "WorkBuddy", subtitle: "你的职场超能力" } } }] }) },
  }), /原生标题未按主题文案生效/);

  await assert.rejects(() => verifyHomeTheme({
    loadedTheme, port: 9223, outputDir: ".", homeProof: { targetId: "home", anchors: {} }, requireOverlay: false,
    deps: { ...deps, inspectModules: async () => ({ targets: [{ id: "home", screenshotPath: "task.png", inspection: { ...base, pageMode: "task", modules: [] } }] }) },
  }), /不是 Home 页面/);
});

test("verifyHomeTheme 等待原生弹窗出现并关闭后才执行恢复验收", async () => {
  const loadedTheme = { manifest: { id: "theme", modules: [{ id: "one" }] }, backgroundPath: null, moduleAssets: [] };
  const base = { themeId: "theme", pageMode: "home", modules: [{ id: "one", visible: true, textOverflow: false, style: { pointerEvents: "none" } }], nativeOverlays: [] };
  const overlay = { ...base, modules: [{ ...base.modules[0], visible: false }], nativeOverlays: [{ role: "listbox", style: { pointerEvents: "auto", opacity: "1", backgroundColor: "rgb(10, 10, 10)" } }] };
  let readCount = 0;
  let inspectCount = 0;
  const result = await verifyHomeTheme({
    loadedTheme, port: 9223, outputDir: ".", waitSeconds: 1, homeProof: { targetId: "home", anchors: {} },
    deps: {
      delay: async () => {},
      applySkin: async () => ({ actualThemeIds: ["theme"] }),
      inspectModules: async ({ label }) => {
        inspectCount += 1;
        return { targets: [{ id: "home", screenshotPath: `${label}.png`, inspection: label === "native-overlay-open" ? overlay : base }] };
      },
      readModuleInspections: async () => [{ id: "home", inspection: readCount++ === 0 ? overlay : base }],
      removeSkin: async () => ({ removed: 1 }),
      skinStatus: async () => [{ installed: false, modules: 0, mountedModules: 0, nativeOverlays: 0 }],
    },
  });
  assert.equal(result.overlayChecked, true);
  assert.equal(readCount, 2);
  assert.equal(inspectCount, 3);
});

test("verifyHomeTheme 拒绝仍被祖先容器裁剪的原生弹窗", async () => {
  const loadedTheme = { manifest: { id: "theme", modules: [{ id: "one" }] }, backgroundPath: null, moduleAssets: [] };
  const base = { themeId: "theme", pageMode: "home", modules: [{ id: "one", visible: true, textOverflow: false, style: { pointerEvents: "none" } }], nativeOverlays: [] };
  const clippedOverlay = {
    ...base,
    modules: [{ ...base.modules[0], visible: false }],
    nativeOverlays: [{
      role: "listbox",
      clippedAncestors: 1,
      style: { pointerEvents: "auto", opacity: "1", backgroundColor: "rgb(10, 10, 10)" },
    }],
  };

  await assert.rejects(() => verifyHomeTheme({
    loadedTheme, port: 9223, outputDir: ".", waitSeconds: 1, homeProof: { targetId: "home", anchors: {} },
    deps: {
      delay: async () => {},
      applySkin: async () => ({ actualThemeIds: ["theme"] }),
      inspectModules: async ({ label }) => ({
        targets: [{ id: "home", screenshotPath: `${label}.png`, inspection: label === "native-overlay-open" ? clippedOverlay : base }],
      }),
      readModuleInspections: async () => [{ id: "home", inspection: clippedOverlay }],
      removeSkin: async () => ({ removed: 1 }),
      skinStatus: async () => [{ installed: false, modules: 0, mountedModules: 0, nativeOverlays: 0 }],
    },
  }), /原生弹窗的点击或不透明保护未生效/);
});
