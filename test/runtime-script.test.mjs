import assert from "node:assert/strict";
import test from "node:test";

import { buildCleanupScript, buildModuleInspectionScript, buildRuntimeScript, buildStatusScript } from "../src/runtime-script.mjs";
import { buildSkinCss } from "../src/skin-css.mjs";

const theme = {
  schemaVersion: 1,
  id: "test-theme",
  name: "测试主题",
  background: "background.svg",
  backgroundDataUrl: "data:image/svg+xml;base64,PHN2Zy8+",
  backgrounds: [
    { id: "background-1", label: "方案1", asset: "background-1.svg", dataUrl: "data:image/svg+xml;base64,PHN2Zy8+" },
    { id: "background-2", label: "方案2", asset: "background-2.svg", dataUrl: "data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=" },
  ],
  colors: { accent: "#112233", secondary: "#445566", surface: "#101010", text: "#FEFEFE" },
  ui: { opacity: 0.8, blur: 16, radius: 12, appearance: "auto" },
  art: { focusX: 0.72, focusY: 0.45, safeArea: "left", taskMode: "ambient" },
  homeHeader: { title: "测试工作台", subtitle: "专注完成今天" },
  copySets: [
    { id: "focus", label: "专注", homeHeader: { title: "测试工作台", subtitle: "专注完成今天" }, modules: { "side-note": { title: "今日陪伴", subtitle: "慢一点也很好" } } },
    { id: "relaxed", label: "轻松", homeHeader: { title: "轻松工作台", subtitle: "慢慢完成今天" }, modules: { "side-note": { title: "轻松陪伴", subtitle: "慢一点也很好" } } },
  ],
  modules: [
    { id: "side-note", slot: "sidebar-note", order: 0, anchor: "sidebar", kind: "decorate", asset: "assets/side-note.svg", assetDataUrl: "data:image/svg+xml;base64,PHN2Zy8+", box: { x: 0, y: 0, w: 1, h: 1 }, mount: "prepend", minAnchor: { width: 220, height: 360 }, textLimits: { title: 32, subtitle: 72 }, requiredText: ["title"], text: { title: "今日陪伴", subtitle: "慢一点也很好" }, state: "default", action: null },
    { id: "help-float", slot: "composer-float", order: 0, anchor: "home-composer", kind: "floating", asset: "assets/help-float.svg", assetDataUrl: "data:image/svg+xml;base64,PHN2Zy8+", box: { x: 0.86, y: 0.01, w: 0.1, h: 0.22 }, mount: "overlay", minAnchor: { width: 520, height: 120 }, textLimits: { label: 24 }, requiredText: [], text: { label: "打开弹窗" }, state: "hover", action: { forwardTo: "dialog" } },
  ],
};

test("生成的注入脚本只保留背景控制和可清理状态", () => {
  const script = buildRuntimeScript({ css: buildSkinCss(), themes: [theme], activeId: theme.id });
  assert.match(script, /workbuddy-skin-lab:v1/);
  assert.match(script, /requestedId: activeId, activeId/);
  assert.doesNotMatch(script, /themes\.some\(\(theme\) => theme\.id === saved\.activeId\)/);
  assert.match(script, /指定自己的图片/);
  assert.doesNotMatch(script, /换宠物|createPet|wb-skin-lab-pet/);
  assert.match(script, /data-setting="theme"/);
  assert.match(script, /切换主题/);
  for (const group of ["主题与背景", "显示效果", "恢复与重置"]) assert.match(script, new RegExp(group));
  assert.doesNotMatch(script, /<summary>文案设置<\/summary>|<summary>模块装饰<\/summary>/);
  assert.doesNotMatch(script, /data-action="next-copy"/);
  assert.match(script, /data-background-options/);
  assert.match(script, /backgroundId/);
  assert.match(script, /data-action="save-theme"/);
  assert.match(script, /保存当前主题/);
  assert.match(script, /preferredActiveId/);
  assert.match(script, /下次启动将自动恢复/);
  assert.match(script, /option\.textContent = theme\.name/);
  assert.doesNotMatch(script, /nativeTextSnapshots/);
  assert.doesNotMatch(script, /data-setting="home-title"|data-setting="home-subtitle"/);
  assert.doesNotMatch(script, /今日陪伴|测试工作台|专注完成今天/);
  assert.doesNotMatch(script, /开关动效|data-action="motion"|wbMotion/);
  assert.match(script, /环境特效与顶部图文/);
  assert.match(script, /data-setting="weather"/);
  assert.match(script, /下雨|雷雨|下雪|冒爱心|下星星|自定义符号/);
  assert.match(script, /data-setting="weather-intensity"/);
  assert.match(script, /data-setting="effect-speed"/);
  assert.match(script, /data-setting="effect-color"/);
  assert.match(script, /data-setting="particle-symbol"/);
  assert.match(script, /particle\.textContent = symbols/);
  assert.match(script, /\.slice\(0, 2\)\.join/);
  assert.match(script, /data-setting="header-text"/);
  assert.match(script, /maxlength="60"/);
  assert.match(script, /data-setting="header-align"/);
  assert.match(script, /data-setting="header-size"/);
  assert.match(script, /data-action="header-image"/);
  assert.match(script, /data-action="header-image-clear"/);
  assert.match(script, /aria-hidden/);
  assert.match(script, /headerText\.textContent = text/);
  assert.doesNotMatch(script, /headerText\.innerHTML/);
  assert.match(script, /weatherLayer\.replaceChildren/);
  assert.match(script, /effectsHost\.remove/);
  assert.match(script, /headerOverlay\.remove/);
  assert.match(script, /effectsHost\.parentElement !== effectsParent/);
  assert.match(script, /effectsParent\.prepend\(effectsHost\)/);
  assert.match(script, /headerImage\.removeAttribute\("src"\)/);
  assert.match(script, /ResizeObserver/);
  assert.match(script, /--wb-sidebar-width/);
  assert.match(script, /--wb-header-top/);
  assert.match(script, /topbarRect\.bottom \+ 12/);
  assert.match(script, /sidebarResizeObserver\?\.disconnect/);
  assert.match(script, /MutationObserver/);
  assert.match(script, /pageHostObserver/);
  assert.match(script, /pageHostObserver\?\.disconnect/);
  assert.match(script, /setInterval\(syncPageMode, 500\)/);
  assert.match(script, /clearInterval\(state\.pageTimer\)/);
  assert.match(script, /wbPageMode/);
  assert.match(script, /data-setting="readability"/);
  assert.match(script, /wbReadability/);
  assert.match(script, /data-setting="safe-area"/);
  assert.match(script, /--wb-focus-x/);
  assert.match(script, /自动匹配图片/);
  assert.match(script, /extractPalette/);
  assert.match(script, /refreshStoredPalette/);
  assert.match(script, /custom\.background \? "auto"/);
  assert.match(script, /data-vscode-theme-kind/);
  assert.match(script, /restoreNativeAppearance/);
  assert.match(script, /__WORKBUDDY_SKIN_LAB__/);
  assert.doesNotMatch(script, /moduleStorageKey|:module:|ensureActiveModuleNodes|compatibilityKey/);
  assert.doesNotMatch(script, /module\.minAnchor\.width|wb-module-title|text\.textContent = values\[key\]/);
  assert.match(script, /state\.cleanups\.push/);
  assert.match(script, /for \(const cleanup of state\.cleanups\)/);
  assert.doesNotMatch(script, /data-action=\"module-reset\"|data-action=\"module-image\"/);
  assert.match(script, /syncNativeOverlays/);
  assert.doesNotMatch(script, /forward-click|nativeClickable\(target\)/);
  assert.doesNotMatch(script, /ipcRenderer|navigator\.clipboard|XMLHttpRequest/);
  assert.doesNotMatch(script, /undefined\s*\)/);
  assert.match(script, /subtree:\s*true/);
  assert.match(script, /data-wb-native-overlay-guard/);
  assert.match(script, /guardedOverlays/);
  assert.doesNotMatch(script, /wbObscured/);
  assert.match(script, /pointerdown/);
  assert.match(script, /pointermove/);
  assert.match(script, /dockPosition/);
  assert.match(script, /--wb-panel-max-height/);
  assert.match(script, /availableHeight/);
  assert.match(script, /setPointerCapture/);
  assert.match(script, /listen\(window, "resize"/);
  assert.doesNotThrow(() => new Function(script));
});

test("原生弹窗保护覆盖几何外层并使用完全不透明表面", () => {
  const script = buildRuntimeScript({ css: buildSkinCss([theme]), themes: [theme], activeId: theme.id });
  assert.match(script, /position === "fixed" \|\| style\.position === "absolute"/);
  assert.match(script, /data-wb-native-overlay-guard/);
  assert.match(script, /overlayHostStyles/);
  assert.match(script, /setProperty\("overflow", "visible", "important"\)/);
  assert.match(script, /state\.overlayHostStyles\.has\(parent\) \|\| style\.overflow !== "visible"/);
  assert.match(script, /restoreOverlayHost/);
  assert.match(buildModuleInspectionScript(), /clippedAncestors/);
  const css = buildSkinCss([theme]);
  assert.match(css, /--wb-overlay-opaque:/);
  assert.match(css, /background:\s*var\(--wb-overlay-opaque\)\s*!important/);
});

test("活动主题必须存在", () => {
  assert.throws(() => buildRuntimeScript({ css: "", themes: [theme], activeId: "missing" }), /活动主题不存在/);
});

test("清理和状态脚本只操作命名空间内对象", () => {
  assert.match(buildCleanupScript(), /cleanup/);
  assert.match(buildStatusScript(), /themeId/);
  assert.match(buildStatusScript(), /pageMode/);
  assert.match(buildStatusScript(), /readability/);
  assert.match(buildStatusScript(), /requestedThemeId/);
  assert.match(buildStatusScript(), /backgroundOnly/);
  assert.match(buildStatusScript(), /ambientEffects/);
  assert.doesNotMatch(buildStatusScript(), /mountedModules|visibleModules|homeCompatibility/);
});

test("CSS 使用 WorkBuddy 稳定锚点", () => {
  const css = buildSkinCss([theme]);
  assert.match(css, /data-application-name="workbuddy"/);
  assert.match(css, /data-view-id="sidebar"/);
  assert.match(css, /--wb-sidebar-width/);
  assert.match(css, /--wb-effective-blur:\s*min\(var\(--wb-blur\), 4px\)/);
  assert.match(css, /--wb-transition-width:\s*clamp\(140px, 14vw, 280px\)/);
  assert.match(css, /mask-image/);
  assert.doesNotMatch(css, /background-attachment:\s*fixed/);
  assert.match(css, /data-wb-page-mode="task"/);
  assert.match(css, /data-wb-safe-area="right"/);
  assert.match(css, /--wb-focus-x/);
  assert.match(css, /data-wb-appearance="dark"/);
  assert.match(css, /--wb-protected-surface:\s*var\(--wb-surface\)/);
  assert.match(css, /\.wb-cb-chat section:has\(\[data-slate-editor="true"\]\[contenteditable="true"\]\)/);
  assert.match(css, /data-wb-task-mode="ambient"[\s\S]*background:\s*transparent/);
  assert.match(css, /\.workbuddy-topbar/);
  assert.match(css, /\.wb-home-composer/);
  assert.match(css, /\.wb-home-page \.wb-scene-tabs/);
  assert.match(css, /\.wb-home-page \.quick-actions__item/);
  assert.match(css, /\.wb-home-composer__input-slot/);
  assert.match(css, /data-wb-readability="on"/);
  assert.match(css, /data-wb-readability-anchor="ready"/);
  assert.match(css, /data-view-id="main-content"/);
  assert.match(css, /pointer-events:\s*none/);
  assert.match(css, /#wb-skin-lab-effects/);
  assert.match(css, /#wb-skin-lab-effects\s*\{[\s\S]*?z-index:\s*-1/);
  assert.doesNotMatch(css, /#root\s*>\s*:not\(#wb-skin-lab-effects\)/);
  assert.match(css, /data-weather="rain"/);
  assert.match(css, /data-weather="thunder"/);
  assert.match(css, /data-weather="snow"/);
  assert.match(css, /data-weather="hearts"/);
  assert.match(css, /data-weather="stars"/);
  assert.match(css, /data-weather="custom"/);
  assert.match(css, /wb-rain-fall/);
  assert.match(css, /wb-snow-fall/);
  assert.match(css, /wb-particle-rise/);
  assert.match(css, /wb-star-fall/);
  assert.match(css, /wb-thunder-flash/);
  assert.match(css, /prefers-reduced-motion:\s*reduce/);
  assert.match(css, /#wb-skin-lab-header-overlay/);
  assert.match(css, /z-index:\s*2147482000/);
  assert.match(css, /data-header-visible="true"/);
  assert.match(css, /data-header-align="left"/);
  assert.match(css, /data-header-align="right"/);
  assert.match(css, /data-header-size="small"/);
  assert.match(css, /data-header-size="large"/);
  assert.match(css, /top:\s*var\(--wb-header-top\)/);
  assert.doesNotMatch(css, /_chatMessageContainer_/);
  assert.match(css, /:not\(:has\(section \[data-slate-editor/);
  assert.match(css, /linear-gradient\(180deg, transparent 58%/);
  assert.match(css, /var\(--wb-protected-surface\) 14%, transparent\) 76%/);
  assert.match(css, /main-content--welcome/);
  assert.match(css, /\[role="dialog"\]/);
  assert.match(css, /conversation-list-tab-button\.active/);
  assert.doesNotMatch(css, /wb-skin-native-pet-hidden|wb-skin-lab-pet/);
  assert.doesNotMatch(css, /data-wb-motion/);
  assert.match(css, /-webkit-app-region: no-drag/);
  assert.match(css, /max-height:\s*var\(--wb-panel-max-height/);
  assert.doesNotMatch(css, /data-wb-module="side-note"/);
  assert.doesNotMatch(css, /--wb-module-x:0/);
  assert.doesNotMatch(css, /data-wb-module|wb-module-|data-wb-action="forward-click"/);
  assert.match(css, /data-wb-native-overlay-guard/);
  assert.match(css, /2147483000/);
  assert.doesNotMatch(css, /data-wb-obscured/);
});

test("模块自检脚本只读取固定锚点、模块样式和边界", () => {
  const script = buildModuleInspectionScript();
  assert.match(script, /getComputedStyle/);
  assert.match(script, /getBoundingClientRect/);
  assert.match(script, /interactiveOverlaps/);
  assert.match(script, /textEditors/);
  assert.match(script, /textOverflow/);
  assert.match(script, /homeHeader/);
  assert.match(script, /nativeOverlays/);
  assert.match(script, /pageMode/);
  assert.match(script, /themeId/);
  assert.doesNotMatch(script, /appendChild|addEventListener|fetch\(|ipcRenderer|clipboard/);
  assert.doesNotThrow(() => new Function(script));
});
