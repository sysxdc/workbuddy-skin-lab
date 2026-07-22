export const ANCHOR_SELECTORS = Object.freeze({
  sidebar: '[data-view-id="sidebar"]',
  topbar: ".workbuddy-topbar",
  "detail-panel": '[data-view-id="detail-panel"]',
  "main-content": '[data-view-id="main-content"]',
  "home-composer": ".wb-home-composer",
  "home-stage": ".main-content--welcome",
  "quick-actions": ".quick-actions",
  "scene-tabs": ".wb-scene-tabs",
  "conversation-list": ".conversation-list",
  "chat-composer": '.wb-cb-chat section:has([data-slate-editor="true"][contenteditable="true"]):not(:has(section [data-slate-editor="true"][contenteditable="true"]))',
  dialog: '[role="dialog"]',
  "home-header-title": ".wb-home-header__title",
  "home-header-subtitle": ".wb-home-header__subtitle",
});

export const ANCHOR_IDS = Object.freeze(Object.keys(ANCHOR_SELECTORS));

export function buildProbeAnchorsScript() {
  return `(() => {
    const selectors = ${JSON.stringify(ANCHOR_SELECTORS)};
    return Object.fromEntries(Object.entries(selectors).map(([anchor, selector]) => {
      const node = document.querySelector(selector);
      if (!node) return [anchor, { present: false, rect: null }];
      const rect = node.getBoundingClientRect();
      const nativeClickable = node.matches('button,a[href],input,select,textarea,[role="button"],[role="tab"],[role="menuitem"],[tabindex]')
        && !node.disabled && node.getAttribute("aria-disabled") !== "true";
      return [anchor, {
        present: true,
        nativeClickable,
        rect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height, top: rect.top, right: rect.right, bottom: rect.bottom, left: rect.left },
      }];
    }));
  })()`;
}
