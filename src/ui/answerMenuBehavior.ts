// Shared interactive behavior for the answer menu markup produced by
// answerMenu.ts: tab switching, hover/focus activation of menu items and
// clearing of the active flyout. Used by the content-script portal and the
// settings preview alike so both stay in sync.

export interface AttachAnswerMenuBehaviorOptions {
  // Fires only when the active menu item actually changes; null clears it.
  onActiveMenuItemChange?: (nextItem: HTMLElement | null) => void;
}

export interface AnswerMenuBehaviorController {
  setActiveMenuItem: (nextItem: HTMLElement | null) => void;
  setActiveMenuTab: (tabKey: string) => void;
  dispose: () => void;
}

export function attachAnswerMenuBehavior(
  shadowRoot: ShadowRoot,
  options: AttachAnswerMenuBehaviorOptions = {}
): AnswerMenuBehaviorController {
  const menuTabsContainer = shadowRoot.querySelector<HTMLElement>(".menu-tabs");
  const menuTabs = Array.from(shadowRoot.querySelectorAll<HTMLButtonElement>(".menu-tab[data-menu-tab]"));
  const menuPanels = Array.from(shadowRoot.querySelectorAll<HTMLElement>(".menu-panel[data-menu-panel]"));
  const menuItems = Array.from(shadowRoot.querySelectorAll<HTMLElement>(".menu-item"));
  const aiActionButtons = Array.from(shadowRoot.querySelectorAll<HTMLButtonElement>(".menu-ai-button"));
  const menuBox = shadowRoot.querySelector<HTMLElement>(".menu");

  let activeMenuItem: HTMLElement | null = null;
  const cleanups: Array<() => void> = [];

  const on = <K extends keyof HTMLElementEventMap>(
    target: HTMLElement,
    type: K,
    listener: (event: HTMLElementEventMap[K]) => void
  ) => {
    target.addEventListener(type, listener as EventListener);
    cleanups.push(() => target.removeEventListener(type, listener as EventListener));
  };

  function setActiveMenuItem(nextItem: HTMLElement | null) {
    if (activeMenuItem === nextItem) {
      return;
    }

    for (const item of menuItems) {
      item.dataset.active = item === nextItem ? "true" : "false";
    }

    activeMenuItem = nextItem;

    options.onActiveMenuItemChange?.(nextItem);
  }

  function setActiveMenuTab(tabKey: string) {
    const nextTab = menuTabs.find((tab) => tab.dataset.menuTab === tabKey) ?? menuTabs[0] ?? null;
    const activeTabKey = nextTab?.dataset.menuTab ?? "ai";
    const activeTabIndex = Math.max(0, nextTab ? menuTabs.indexOf(nextTab) : 0);

    menuTabsContainer?.setAttribute("data-active-tab", activeTabKey);
    menuTabsContainer?.style.setProperty("--active-tab-index", String(activeTabIndex));
    setActiveMenuItem(null);

    for (const tab of menuTabs) {
      const isActive = tab === nextTab;
      tab.dataset.active = isActive ? "true" : "false";
      tab.setAttribute("aria-selected", String(isActive));
      tab.tabIndex = isActive ? 0 : -1;
    }

    for (const panel of menuPanels) {
      panel.dataset.active = panel.dataset.menuPanel === activeTabKey ? "true" : "false";
    }
  }

  for (const tab of menuTabs) {
    on(tab, "mouseenter", () => {
      setActiveMenuItem(null);
    });

    on(tab, "focusin", () => {
      setActiveMenuItem(null);
    });

    on(tab, "click", (event) => {
      event.stopPropagation();
      setActiveMenuTab(tab.dataset.menuTab ?? menuTabs[0]?.dataset.menuTab ?? "ai");
    });

    on(tab, "keydown", (event) => {
      if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") {
        return;
      }

      event.preventDefault();
      event.stopPropagation();

      const currentIndex = Math.max(0, menuTabs.indexOf(tab));
      const direction = event.key === "ArrowRight" ? 1 : -1;
      const nextTab = menuTabs[(currentIndex + direction + menuTabs.length) % menuTabs.length];

      nextTab?.focus();
      setActiveMenuTab(nextTab?.dataset.menuTab ?? menuTabs[0]?.dataset.menuTab ?? "ai");
    });
  }

  setActiveMenuTab(menuTabs[0]?.dataset.menuTab ?? "ai");

  for (const item of menuItems) {
    item.dataset.active = "false";

    on(item, "mouseenter", () => {
      setActiveMenuItem(item);
    });

    on(item, "focusin", () => {
      setActiveMenuItem(item);
    });
  }

  for (const button of aiActionButtons) {
    on(button, "mouseenter", () => {
      setActiveMenuItem(null);
    });

    on(button, "focusin", () => {
      setActiveMenuItem(null);
    });
  }

  if (menuBox) {
    on(menuBox, "mouseleave", () => {
      setActiveMenuItem(null);
    });
  }

  return {
    setActiveMenuItem,
    setActiveMenuTab,
    dispose: () => {
      for (const cleanup of cleanups) {
        cleanup();
      }

      cleanups.length = 0;
    }
  };
}
