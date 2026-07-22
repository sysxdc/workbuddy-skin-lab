function moduleCss(themes) {
  const rules = [];
  for (const theme of themes) {
    for (const module of theme.modules || []) {
      const { x, y, w, h } = module.box;
      if (![x, y, w, h].every(Number.isFinite) || x < 0 || y < 0 || w <= 0 || h <= 0 || x + w > 1 || y + h > 1) {
        throw new Error(`模块 ${module.id} 的 box 未通过结构化校验`);
      }
      rules.push(`html[data-workbuddy-skin-lab="${theme.id}"] [data-wb-module="${module.id}"] { --wb-module-x:${x}; --wb-module-y:${y}; --wb-module-w:${w}; --wb-module-h:${h}; }`);
    }
  }
  return rules.length ? `\n${rules.join("\n")}\n` : "";
}

export function buildSkinCss(themes = []) {
  return `
html[data-workbuddy-skin-lab] {
  --wb-accent: #7c5cfc;
  --wb-secondary: #41d9c5;
  --wb-surface: #101525;
  --wb-text: #f4f7ff;
  --wb-panel-opacity: 82%;
  --wb-blur: 18px;
  --wb-effective-blur: min(var(--wb-blur), 4px);
  --wb-radius: 16px;
  --wb-sidebar-width: 264px;
  --wb-transition-width: clamp(140px, 14vw, 280px);
  --wb-focus-x: 50%;
  --wb-focus-y: 50%;
  --wb-panel-base: #fff;
  --wb-protected-surface: var(--wb-surface);
  --wb-protected-card: color-mix(in srgb, var(--wb-surface) 88%, var(--wb-panel-base));
  --wb-overlay-opaque: color-mix(in srgb, var(--wb-surface) 96%, #0b0b0f);
  --wb-protected-text: var(--wb-text);
}
html[data-workbuddy-skin-lab][data-wb-appearance="dark"] { --wb-panel-base: #000; }
html[data-workbuddy-skin-lab][data-wb-appearance="light"] { --wb-panel-base: #fff; }
html[data-workbuddy-skin-lab] body[data-application-name="workbuddy"] {
  --cb-bg-primary: color-mix(in srgb, var(--wb-protected-surface) 94%, transparent) !important;
  --cb-bg-secondary: color-mix(in srgb, var(--wb-protected-surface) 90%, transparent) !important;
  --cb-panel-bg-primary: var(--wb-protected-card) !important;
  --cb-text-primary: var(--wb-protected-text) !important;
  --cb-text-secondary: color-mix(in srgb, var(--wb-protected-text) 68%, transparent) !important;
  --cb-text-link: var(--wb-accent) !important;
  --cb-vscode-editor-background: color-mix(in srgb, var(--wb-surface) 94%, transparent) !important;
  --cb-vscode-sideBar-background: color-mix(in srgb, var(--wb-surface) 92%, transparent) !important;
  --cb-vscode-foreground: var(--wb-text) !important;
  --cb-vscode-editor-foreground: var(--wb-text) !important;
  --cb-vscode-input-background: color-mix(in srgb, var(--wb-surface) 96%, var(--wb-panel-base)) !important;
  --cb-vscode-dropdown-background: color-mix(in srgb, var(--wb-surface) 94%, var(--wb-panel-base)) !important;
  --cb-vscode-list-hoverBackground: color-mix(in srgb, var(--wb-accent) 20%, transparent) !important;
  --cb-vscode-button-background: var(--wb-accent) !important;
  --cb-vscode-button-foreground: white !important;
  --cb-button-dark-background: var(--wb-accent) !important;
  --cb-button-dark-foreground: white !important;
  --cb-stroke-secondary: color-mix(in srgb, var(--wb-accent) 42%, transparent) !important;
}
html[data-workbuddy-skin-lab] #root {
  --wb-art-safe-gradient: linear-gradient(90deg, transparent, transparent);
  color: var(--wb-protected-text) !important;
  background-image:
    linear-gradient(90deg,
      color-mix(in srgb, var(--wb-protected-surface) 98%, transparent) 0,
      color-mix(in srgb, var(--wb-protected-surface) 98%, transparent) var(--wb-sidebar-width),
      color-mix(in srgb, var(--wb-protected-surface) 48%, transparent) calc(var(--wb-sidebar-width) + 56px),
      transparent calc(var(--wb-sidebar-width) + var(--wb-transition-width))),
    var(--wb-art-safe-gradient),
    linear-gradient(180deg, transparent 58%, color-mix(in srgb, var(--wb-protected-surface) 14%, transparent) 76%, color-mix(in srgb, var(--wb-protected-surface) 66%, transparent) 100%),
    var(--wb-background) !important;
  background-position: center, center, center, var(--wb-focus-x) var(--wb-focus-y) !important;
  background-size: 100% 100%, 100% 100%, 100% 100%, cover !important;
  background-repeat: no-repeat !important;
}
html[data-workbuddy-skin-lab][data-wb-safe-area="left"] #root,
html[data-workbuddy-skin-lab][data-wb-safe-area="auto"] #root {
  --wb-art-safe-gradient: linear-gradient(90deg, color-mix(in srgb, var(--wb-protected-surface) 18%, transparent) 0 26%, transparent 46%);
}
html[data-workbuddy-skin-lab][data-wb-safe-area="right"] #root {
  --wb-art-safe-gradient: linear-gradient(270deg, color-mix(in srgb, var(--wb-protected-surface) 42%, transparent) 0 34%, transparent 58%);
}
html[data-workbuddy-skin-lab][data-wb-safe-area="center"] #root {
  --wb-art-safe-gradient: radial-gradient(ellipse at center, color-mix(in srgb, var(--wb-protected-surface) 50%, transparent) 0 24%, transparent 62%);
}
html[data-workbuddy-skin-lab] .teams-container,
html[data-workbuddy-skin-lab] .teams-container.is-mac,
html[data-workbuddy-skin-lab] [data-view-id],
html[data-workbuddy-skin-lab] .conversation-list,
html[data-workbuddy-skin-lab] .main-content,
html[data-workbuddy-skin-lab] .main-content--welcome,
html[data-workbuddy-skin-lab] .sidebar-next { background: transparent !important; }
html[data-workbuddy-skin-lab] [data-view-id="sidebar"],
html[data-workbuddy-skin-lab] [data-view-id="detail-panel"] {
  background: color-mix(in srgb, var(--wb-protected-surface) 94%, transparent) !important;
  color: var(--wb-protected-text) !important;
  border-color: color-mix(in srgb, var(--wb-accent) 38%, transparent) !important;
  backdrop-filter: blur(var(--wb-effective-blur)) saturate(1.08);
}
html[data-workbuddy-skin-lab] [data-view-id="sidebar"] { position: relative; overflow: visible; }
html[data-workbuddy-skin-lab] [data-view-id="sidebar"]::after {
  content: "";
  position: absolute;
  z-index: -1;
  pointer-events: none;
  inset: 0 calc(-1 * var(--wb-transition-width)) 0 100%;
  background: color-mix(in srgb, var(--wb-protected-surface) 58%, transparent);
  backdrop-filter: blur(var(--wb-effective-blur));
  -webkit-mask-image: linear-gradient(90deg, #000, transparent);
  mask-image: linear-gradient(90deg, #000, transparent);
}
html[data-workbuddy-skin-lab][data-wb-page-mode="home"] [data-view-id="main-content"] { background: transparent !important; }
html[data-workbuddy-skin-lab][data-wb-page-mode="task"][data-wb-task-mode="auto"] [data-view-id="main-content"],
html[data-workbuddy-skin-lab][data-wb-page-mode="task"][data-wb-task-mode="ambient"] [data-view-id="main-content"] {
  background: transparent !important;
}
html[data-workbuddy-skin-lab][data-wb-page-mode="task"][data-wb-task-mode="banner"] [data-view-id="main-content"] {
  background: linear-gradient(180deg, transparent 0 20%, color-mix(in srgb, var(--wb-protected-surface) 88%, transparent) 44% 100%) !important;
}
html[data-workbuddy-skin-lab][data-wb-page-mode="task"][data-wb-task-mode="off"] [data-view-id="main-content"] {
  background: color-mix(in srgb, var(--wb-protected-surface) 98%, transparent) !important;
}
html[data-workbuddy-skin-lab] .workbuddy-topbar {
  color: var(--wb-protected-text) !important;
  background: color-mix(in srgb, var(--wb-surface) 90%, transparent) !important;
  border-bottom: 1px solid color-mix(in srgb, var(--wb-accent) 18%, transparent) !important;
  box-shadow: 0 6px 22px rgb(23 33 58 / 10%);
  backdrop-filter: blur(4px) saturate(1.03);
}
html[data-workbuddy-skin-lab] .workbuddy-topbar :is(button, span, div, svg) {
  color: inherit !important;
}
html[data-workbuddy-skin-lab] :is(.chat-input-container, .chat-composer, .prompt-input, .input-box),
html[data-workbuddy-skin-lab] :is([role="dialog"], [role="menu"], [role="listbox"]) {
  color: var(--wb-protected-text) !important;
  background: var(--wb-protected-card) !important;
  border-color: color-mix(in srgb, var(--wb-accent) 28%, transparent) !important;
  backdrop-filter: blur(4px) saturate(1.03);
  box-shadow: 0 10px 30px rgb(23 33 58 / 12%);
}
html[data-workbuddy-skin-lab] [data-wb-native-overlay-guard="true"] {
  z-index: 2147483000 !important;
  isolation: isolate;
  color: var(--wb-protected-text) !important;
  background: var(--wb-overlay-opaque) !important;
  opacity: 1 !important;
  pointer-events: auto !important;
  backdrop-filter: none !important;
  box-shadow: 0 18px 48px rgb(0 0 0 / 32%) !important;
}
html[data-workbuddy-skin-lab] .wb-cb-chat section:has([data-slate-editor="true"][contenteditable="true"]):not(:has(section [data-slate-editor="true"][contenteditable="true"])) {
  color: var(--wb-protected-text) !important;
  background: var(--wb-protected-card) !important;
  border: 1px solid color-mix(in srgb, var(--wb-accent) 20%, transparent) !important;
  border-radius: calc(var(--wb-radius) + 6px) !important;
  box-shadow: 0 10px 30px rgb(23 33 58 / 14%);
  overflow: hidden;
}
html[data-workbuddy-skin-lab] .wb-cb-chat section:has([data-slate-editor="true"][contenteditable="true"]):not(:has(section [data-slate-editor="true"][contenteditable="true"])) > div,
html[data-workbuddy-skin-lab] .wb-cb-chat section:has([data-slate-editor="true"][contenteditable="true"]):not(:has(section [data-slate-editor="true"][contenteditable="true"])) > div > div {
  background: transparent !important;
}
html[data-workbuddy-skin-lab] .wb-cb-chat section:has([data-slate-editor="true"][contenteditable="true"]):not(:has(section [data-slate-editor="true"][contenteditable="true"])) div:has(> div > [data-slate-editor="true"][contenteditable="true"]) {
  color: var(--wb-protected-text) !important;
  background: transparent !important;
  border-color: transparent !important;
  box-shadow: none !important;
  backdrop-filter: none !important;
}
html[data-workbuddy-skin-lab] .wb-cb-chat [data-slate-editor="true"][contenteditable="true"] {
  color: var(--wb-protected-text) !important;
  background: transparent !important;
  border-color: transparent !important;
  box-shadow: none !important;
  backdrop-filter: none !important;
}
html[data-workbuddy-skin-lab] .wb-home-page .wb-scene-tabs {
  width: max-content;
  padding: 3px;
  border: 1px solid color-mix(in srgb, var(--wb-accent) 16%, transparent);
  border-radius: 999px;
  background: color-mix(in srgb, var(--wb-surface) 72%, transparent) !important;
  box-shadow: 0 6px 18px rgb(23 33 58 / 8%);
  backdrop-filter: blur(3px) saturate(1.02);
}
html[data-workbuddy-skin-lab] .wb-home-page .wb-scene-tabs__pill {
  color: color-mix(in srgb, var(--wb-protected-text) 82%, transparent) !important;
  background: transparent !important;
  border: 0 !important;
  box-shadow: none !important;
  backdrop-filter: none !important;
}
html[data-workbuddy-skin-lab] .wb-home-page .wb-scene-tabs__pill--active {
  color: #fff !important;
  background: var(--wb-accent) !important;
}
html[data-workbuddy-skin-lab] .wb-home-page .quick-actions__item {
  color: var(--wb-protected-text) !important;
  background: color-mix(in srgb, var(--wb-surface) 78%, transparent) !important;
  border: 1px solid color-mix(in srgb, var(--wb-accent) 18%, transparent) !important;
  box-shadow: 0 5px 14px rgb(23 33 58 / 7%);
  backdrop-filter: blur(3px) saturate(1.02);
}
html[data-workbuddy-skin-lab] .wb-home-page .quick-actions__item:hover {
  background: color-mix(in srgb, var(--wb-accent) 18%, var(--wb-surface)) !important;
  border-color: color-mix(in srgb, var(--wb-accent) 42%, transparent) !important;
}
html[data-workbuddy-skin-lab] .wb-home-page :is(.wb-scene-tabs__pill, .quick-actions__item) * {
  color: inherit !important;
}
html[data-workbuddy-skin-lab] .wb-home-page .wb-home-composer {
  color: var(--wb-protected-text) !important;
  background: transparent !important;
  border-color: transparent !important;
  box-shadow: none !important;
  backdrop-filter: none !important;
  overflow: visible !important;
}
html[data-workbuddy-skin-lab] .wb-home-page .wb-home-composer__input-slot {
  padding: 0 !important;
  background: transparent !important;
  border: 0 !important;
  box-shadow: none !important;
}
html[data-workbuddy-skin-lab] .wb-home-page .wb-home-composer__input-slot > section {
  background: color-mix(in srgb, var(--wb-surface) 90%, var(--wb-panel-base)) !important;
  backdrop-filter: blur(4px) saturate(1.03);
}
html[data-workbuddy-skin-lab][data-wb-page-mode="task"] [data-view-id="main-content"] {
  position: relative;
  isolation: isolate;
  color: var(--wb-protected-text) !important;
}
html[data-workbuddy-skin-lab][data-wb-page-mode="task"][data-wb-readability="on"][data-wb-readability-anchor="ready"] [data-view-id="main-content"]::before {
  content: "";
  position: absolute;
  z-index: 0;
  inset: 12px auto 18px 50%;
  width: min(960px, calc(100% - 48px));
  transform: translateX(-50%);
  border: 1px solid color-mix(in srgb, var(--wb-accent) 12%, transparent);
  border-radius: calc(var(--wb-radius) + 6px);
  background: color-mix(in srgb, var(--wb-surface) 74%, transparent);
  box-shadow: 0 10px 30px rgb(23 33 58 / 10%);
  backdrop-filter: blur(3px) saturate(1.02);
  pointer-events: none;
}
html[data-workbuddy-skin-lab][data-wb-page-mode="task"] [data-view-id="main-content"] > * {
  position: relative;
  z-index: 1;
}
html[data-workbuddy-skin-lab] .conversation-list-tab-button,
html[data-workbuddy-skin-lab] .conversation-list-search-button,
html[data-workbuddy-skin-lab] .conversation-list-task-filter-trigger,
html[data-workbuddy-skin-lab] .conversation-list .wb-button,
html[data-workbuddy-skin-lab] .user-menu-trigger,
html[data-workbuddy-skin-lab] .msg-center-bell-btn,
html[data-workbuddy-skin-lab] .user-menu-trigger-miniprogram {
  color: color-mix(in srgb, var(--wb-protected-text) 86%, transparent) !important;
}
html[data-workbuddy-skin-lab] .conversation-list-tab-button.active {
  color: white !important;
  background: color-mix(in srgb, var(--wb-accent) 88%, transparent) !important;
  border-color: color-mix(in srgb, var(--wb-accent) 72%, white) !important;
}
html[data-workbuddy-skin-lab] .conversation-list-tab-button:not(.active):hover {
  background: color-mix(in srgb, var(--wb-accent) 18%, transparent) !important;
}
html[data-workbuddy-skin-lab] .conversation-agent-card {
  color: var(--wb-protected-text) !important;
  background: color-mix(in srgb, var(--wb-surface) 82%, var(--wb-panel-base)) !important;
}
html[data-workbuddy-skin-lab] .conversation-agent-card :is(span, div, p, button) {
  color: inherit !important;
}
html[data-workbuddy-skin-lab] #root .conversation-list .conversation-agent-card :is(span, div, p, button),
html[data-workbuddy-skin-lab] #root .conversation-list :is(.conversation-section-label-text, .logo-workbuddy-title, .conversation-list-tab-button-sub) {
  color: color-mix(in srgb, var(--wb-protected-text) 78%, transparent) !important;
}
html[data-workbuddy-skin-lab] .conversation-list .collapsible-section-header {
  color: var(--wb-protected-text) !important;
  background: color-mix(in srgb, var(--wb-surface) 84%, var(--wb-panel-base)) !important;
  border-color: color-mix(in srgb, var(--wb-accent) 28%, transparent) !important;
}
html[data-workbuddy-skin-lab] .conversation-list .collapsible-section-header * {
  color: inherit !important;
}
html[data-workbuddy-skin-lab] button,
html[data-workbuddy-skin-lab] input,
html[data-workbuddy-skin-lab] textarea,
html[data-workbuddy-skin-lab] [role="dialog"] { border-radius: var(--wb-radius) !important; }
#wb-skin-lab-dock {
  position:fixed; z-index:2147483640; left:calc(100vw - 54px); top:54px; width:38px; font:13px/1.4 system-ui,sans-serif; color:var(--wb-text);
  -webkit-app-region: no-drag !important; pointer-events: auto !important;
}
#wb-skin-lab-dock * { -webkit-app-region: no-drag !important; pointer-events: auto !important; }
#wb-skin-lab-toggle { width:38px; height:38px; touch-action:none; user-select:none; border:1px solid color-mix(in srgb,var(--wb-accent) 50%,transparent); border-radius:13px; background:color-mix(in srgb,var(--wb-surface) 84%,transparent); color:var(--wb-text); backdrop-filter:blur(6px); cursor:grab; box-shadow:0 8px 24px rgb(0 0 0 / .18); }
#wb-skin-lab-toggle:active { cursor:grabbing; }
#wb-skin-lab-panel { display:none; position:absolute; top:46px; width:min(320px,calc(100vw - 48px)); max-height:calc(100vh - 64px); overflow:auto; padding:12px; background:color-mix(in srgb,var(--wb-surface) 92%,transparent); border:1px solid color-mix(in srgb,var(--wb-accent) 40%,transparent); border-radius:16px; backdrop-filter:blur(8px); box-shadow:0 18px 40px rgb(0 0 0 / .28); }
#wb-skin-lab-dock[data-panel-side="left"] #wb-skin-lab-panel { right:0; }
#wb-skin-lab-dock[data-panel-side="right"] #wb-skin-lab-panel { left:0; }
#wb-skin-lab-dock[data-panel-vertical="up"] #wb-skin-lab-panel { top:auto; bottom:46px; }
#wb-skin-lab-panel.open { display:grid; gap:9px; }
#wb-skin-lab-panel details { border:1px solid color-mix(in srgb,var(--wb-accent) 24%,transparent); border-radius:10px; overflow:hidden; }
#wb-skin-lab-panel summary { padding:9px 10px; cursor:pointer; font-weight:700; background:color-mix(in srgb,var(--wb-surface) 82%,transparent); }
#wb-skin-lab-panel .wb-panel-group { display:grid; gap:8px; padding:9px; }
#wb-skin-lab-panel label { display:grid; gap:4px; color:color-mix(in srgb,var(--wb-text) 78%,transparent); }
#wb-skin-lab-panel select, #wb-skin-lab-panel button, #wb-skin-lab-panel input { box-sizing:border-box; width:100%; min-height:32px; border:1px solid color-mix(in srgb,var(--wb-accent) 35%,transparent); border-radius:8px; background:color-mix(in srgb,var(--wb-surface) 84%,transparent); color:var(--wb-text); }
#wb-skin-lab-panel select, #wb-skin-lab-panel button { cursor:pointer; }
#wb-skin-lab-panel .wb-row { display:grid; grid-template-columns:1fr 1fr; gap:8px; }
#wb-skin-lab-panel [data-background-options] { display:grid; grid-template-columns:repeat(3,minmax(0,1fr)); gap:6px; }
#wb-skin-lab-panel [data-background-options] button { min-width:0; padding:3px; }
#wb-skin-lab-panel [data-background-options] button[data-active="true"] { outline:2px solid var(--wb-accent); }
#wb-skin-lab-panel [data-background-options] img { display:block; width:100%; aspect-ratio:16/9; border-radius:6px; object-fit:cover; }
#wb-skin-lab-panel [data-background-options] span { display:block; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
[data-wb-module] { position:relative; z-index:2; box-sizing:border-box; margin:0; padding:0; border:0; border-radius:0; color:var(--wb-protected-text); background-color:transparent; background-image:var(--wb-module-image); background-position:center; background-repeat:no-repeat; background-size:contain; box-shadow:none; font:13px/1.35 system-ui,sans-serif; pointer-events:none; overflow:hidden; transition:opacity .12s ease; }
[data-wb-module][data-wb-visible="false"] { display:none !important; }
[data-wb-module][data-wb-obscured="true"] { visibility:hidden !important; opacity:0 !important; pointer-events:none !important; }
[data-wb-module-kind="decorate"] { z-index:2; }
[data-wb-module-kind="icon-swap"] { z-index:3; }
[data-wb-module-kind="floating"][data-wb-action="forward-click"] { pointer-events:auto; cursor:pointer; -webkit-app-region:no-drag !important; }
[data-wb-module-slot="sidebar-note"] { display:flex; width:calc(100% - 16px); min-height:56px; margin:8px; flex:0 0 auto; align-items:center; padding:7px 10px 7px 44px; border:1px solid color-mix(in srgb,var(--wb-accent) 20%,transparent); border-radius:10px; background-color:color-mix(in srgb,var(--wb-surface) 58%,transparent); background-position:12px center; background-size:24px 24px; box-shadow:0 4px 14px rgb(23 33 58 / 7%); backdrop-filter:blur(4px); }
[data-wb-module-slot="home-hero"] { display:flex; width:min(820px,calc(100% - 32px)); min-height:96px; margin:0 auto 14px; flex:0 0 auto; align-items:center; padding:14px clamp(100px,14vw,170px) 14px 20px; border:1px solid color-mix(in srgb,var(--wb-accent) 20%,transparent); border-radius:calc(var(--wb-radius) + 4px); background-color:color-mix(in srgb,var(--wb-surface) 58%,transparent); background-position:right 16px bottom; background-size:auto 88%; box-shadow:0 8px 24px rgb(23 33 58 / 10%); backdrop-filter:blur(4px); }
[data-wb-module-slot="home-card"], [data-wb-module-slot="scene-icon"], [data-wb-module-slot="composer-float"] { position:absolute; }
[data-wb-module-slot="home-card"] { display:flex; align-items:center; padding:0 20px 0 7px; border:1px solid color-mix(in srgb,var(--wb-accent) 16%,transparent); border-radius:inherit; background-color:color-mix(in srgb,var(--wb-surface) 92%,var(--wb-panel-base)); background-position:right 6px center; background-size:13px 13px; }
[data-wb-module-slot="home-card"] .wb-module-subtitle { display:none; }
[data-wb-module-slot="scene-icon"] { display:flex; align-items:center; justify-content:center; padding:0 6px 0 24px; border:1px solid color-mix(in srgb,var(--wb-accent) 14%,transparent); border-radius:inherit; color:var(--wb-protected-text); background-color:var(--wb-panel-base); background-position:8px center; background-size:12px 12px; box-shadow:0 2px 8px rgb(0 0 0 / .08); }
.wb-scene-tabs__pill--active > [data-wb-module-slot="scene-icon"] { background-color:var(--wb-accent); }
[data-wb-module][data-wb-module-slot="scene-icon"] .wb-module-title { color:inherit; font-size:13px; font-weight:650; line-height:1.2; }
[data-wb-module-slot="composer-float"] { border:1px solid color-mix(in srgb,var(--wb-accent) 24%,transparent); border-radius:999px; background-color:color-mix(in srgb,var(--wb-surface) 72%,transparent); background-size:68%; box-shadow:0 6px 18px rgb(23 33 58 / 14%); backdrop-filter:blur(4px); overflow:visible; }
[data-wb-module] .wb-module-copy { display:grid; min-width:0; gap:2px; text-align:left; }
[data-wb-module] .wb-module-eyebrow { color:var(--wb-accent); font-size:clamp(9px,.8vw,12px); font-weight:750; letter-spacing:.12em; text-transform:uppercase; }
[data-wb-module] .wb-module-title { color:var(--wb-protected-text); font-size:clamp(13px,1.5vw,24px); font-weight:760; line-height:1.18; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
[data-wb-module-slot="sidebar-note"] .wb-module-title { font-size:clamp(12px,1vw,16px); }
[data-wb-module-slot="home-card"] .wb-module-title { font-size:12px; }
[data-wb-module] .wb-module-subtitle { color:color-mix(in srgb,var(--wb-protected-text) 68%,transparent); font-size:clamp(10px,.9vw,14px); overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
[data-wb-module] .wb-module-badge { position:absolute; right:18px; top:50%; translate:0 -50%; padding:7px 12px; border-radius:999px; color:var(--wb-protected-text); background:color-mix(in srgb,var(--wb-panel-base) 78%,transparent); font-weight:650; }
#wb-skin-lab-panel [data-module-row] { display:grid; grid-template-columns:1fr auto auto; gap:6px; align-items:center; }
#wb-skin-lab-panel [data-module-row] button { width:auto; min-width:52px; }
#wb-skin-lab-panel [data-module-image-row] { display:grid; grid-template-columns:1fr auto auto; gap:6px; align-items:center; }
#wb-skin-lab-panel [data-module-image-row] button { width:auto; min-width:52px; }
#wb-skin-lab-panel [data-module-editor] { display:grid; gap:6px; padding:8px; border:1px solid color-mix(in srgb,var(--wb-accent) 18%,transparent); border-radius:10px; }
#wb-skin-lab-panel [data-module-fields] { display:grid; grid-template-columns:1fr; gap:6px; }
${moduleCss(themes)}`;
}
