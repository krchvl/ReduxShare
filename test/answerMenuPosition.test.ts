import { describe, expect, it } from "vitest";
import { getQuizAttemptTestApi } from "./helpers/quizAttemptApi";
import { exactAnswerData, sourceAnswerData } from "./helpers/sourceData";

function setViewport(width: number, height: number) {
  Object.defineProperty(document.documentElement, "clientWidth", {
    configurable: true,
    value: width
  });
  Object.defineProperty(window, "innerHeight", {
    configurable: true,
    value: height
  });
}

function createRect(left: number, top: number, width: number, height: number): DOMRect {
  return {
    x: left,
    y: top,
    left,
    top,
    width,
    height,
    right: left + width,
    bottom: top + height,
    toJSON() {
      return {
        x: left,
        y: top,
        left,
        top,
        width,
        height,
        right: left + width,
        bottom: top + height
      };
    }
  } as DOMRect;
}

function renderPortal(markup: string) {
  const portal = document.createElement("div");
  const root = portal.attachShadow({ mode: "open" });
  root.innerHTML = markup;
  document.body.append(portal);
  return { portal, root };
}

function installDynamicRects(
  portal: HTMLElement,
  root: ShadowRoot,
  options: {
    initialLeft: number;
    top?: number;
    menuWidth?: number;
    menuHeight?: number;
    flyoutWidth?: number;
    flyoutHeight?: number;
  }
) {
  const top = options.top ?? 180;
  const menuWidth = options.menuWidth ?? 348;
  const menuHeight = options.menuHeight ?? 126;
  const flyoutWidth = options.flyoutWidth ?? 190;
  const flyoutHeight = options.flyoutHeight ?? 48;
  const menu = root.querySelector<HTMLElement>(".menu");
  const flyout = root.querySelector<HTMLElement>('.menu-item[data-active="true"] .flyout');

  expect(menu).toBeTruthy();
  expect(flyout).toBeTruthy();

  portal.style.left = `${options.initialLeft}px`;
  portal.style.top = `${top}px`;

  Object.defineProperty(menu!, "offsetWidth", { configurable: true, get: () => menuWidth });
  Object.defineProperty(menu!, "offsetHeight", { configurable: true, get: () => menuHeight });
  Object.defineProperty(flyout!, "offsetWidth", { configurable: true, get: () => flyoutWidth });
  Object.defineProperty(flyout!, "offsetHeight", { configurable: true, get: () => flyoutHeight });

  menu!.getBoundingClientRect = () => {
    const left = Number.parseFloat(portal.style.left || "0");
    return createRect(left, top, menuWidth, menuHeight);
  };

  flyout!.getBoundingClientRect = () => {
    const menuLeft = Number.parseFloat(portal.style.left || "0");
    const flyoutLeft = portal.dataset.flyoutSide === "left"
      ? menuLeft - (flyoutWidth - 4)
      : menuLeft + menuWidth - 4;
    return createRect(flyoutLeft, top - 1, flyoutWidth, flyoutHeight);
  };
}

function getVisibleBounds(portal: HTMLElement, root: ShadowRoot) {
  const menu = root.querySelector<HTMLElement>(".menu");
  const flyout = root.querySelector<HTMLElement>('.menu-item[data-active="true"] .flyout');

  expect(menu).toBeTruthy();
  expect(flyout).toBeTruthy();

  const menuRect = menu!.getBoundingClientRect();
  const flyoutRect = flyout!.getBoundingClientRect();

  return {
    left: Math.min(menuRect.left, flyoutRect.left),
    right: Math.max(menuRect.right, flyoutRect.right),
    portalLeft: Number.parseFloat(portal.style.left || "0")
  };
}

describe("R-menu positioning", () => {
  it("switches the active flyout to the left when the main menu fits but the answer flyout would overflow right", async () => {
    setViewport(1200, 900);

    const api = await getQuizAttemptTestApi();
    const { portal, root } = renderPortal(
      api.getAnswerMenuMarkup(
        sourceAnswerData({
          reduxshare: exactAnswerData("false")
        }),
        true,
        {
          status: "idle",
          answer: null,
          confidence: null,
          actions: [],
          error: null
        },
        true
      )
    );

    const firstItem = root.querySelector<HTMLElement>(".menu-item");
    expect(firstItem).toBeTruthy();
    firstItem!.dataset.active = "true";

    installDynamicRects(portal, root, {
      initialLeft: 820
    });

    api.updateAnswerMenuFlyoutSide(portal);

    const bounds = getVisibleBounds(portal, root);

    expect(portal.dataset.flyoutSide).toBe("left");
    expect(bounds.left).toBeGreaterThanOrEqual(16);
    expect(bounds.right).toBeLessThanOrEqual(1200 - 16);
  });

  it("positions the whole menu portal so menu and flyout stay inside the viewport on initial open", async () => {
    setViewport(1200, 900);

    const api = await getQuizAttemptTestApi();
    const { portal, root } = renderPortal(
      api.getAnswerMenuMarkup(
        sourceAnswerData({
          reduxshare: exactAnswerData("true")
        }),
        true,
        {
          status: "idle",
          answer: null,
          confidence: null,
          actions: [],
          error: null
        },
        true
      )
    );

    const firstItem = root.querySelector<HTMLElement>(".menu-item");
    expect(firstItem).toBeTruthy();
    firstItem!.dataset.active = "true";

    installDynamicRects(portal, root, {
      initialLeft: 0
    });

    const trigger = document.createElement("button");
    trigger.getBoundingClientRect = () => createRect(860, 120, 24, 24);

    api.positionAnswerMenuPortal(portal, trigger);

    const bounds = getVisibleBounds(portal, root);

    expect(portal.dataset.flyoutSide).toBe("left");
    expect(bounds.portalLeft).toBeGreaterThanOrEqual(16);
    expect(bounds.left).toBeGreaterThanOrEqual(16);
    expect(bounds.right).toBeLessThanOrEqual(1200 - 16);
  });

  it("keeps the flyout on the right when there is enough room for the answer panel", async () => {
    setViewport(1600, 900);

    const api = await getQuizAttemptTestApi();
    const { portal, root } = renderPortal(
      api.getAnswerMenuMarkup(
        sourceAnswerData({
          reduxshare: exactAnswerData("true")
        }),
        true,
        {
          status: "idle",
          answer: null,
          confidence: null,
          actions: [],
          error: null
        },
        true
      )
    );

    const firstItem = root.querySelector<HTMLElement>(".menu-item");
    expect(firstItem).toBeTruthy();
    firstItem!.dataset.active = "true";

    installDynamicRects(portal, root, {
      initialLeft: 620
    });

    api.updateAnswerMenuFlyoutSide(portal);

    const bounds = getVisibleBounds(portal, root);

    expect(portal.dataset.flyoutSide).toBe("right");
    expect(bounds.right).toBeLessThanOrEqual(1600 - 16);
  });

  it("prefers the left flyout when both sides fit but the left side has more free space", async () => {
    setViewport(1400, 900);

    const api = await getQuizAttemptTestApi();
    const { portal, root } = renderPortal(
      api.getAnswerMenuMarkup(
        sourceAnswerData({
          reduxshare: exactAnswerData("true")
        }),
        true,
        {
          status: "idle",
          answer: null,
          confidence: null,
          actions: [],
          error: null
        },
        true
      )
    );

    const firstItem = root.querySelector<HTMLElement>(".menu-item");
    expect(firstItem).toBeTruthy();
    firstItem!.dataset.active = "true";

    installDynamicRects(portal, root, {
      initialLeft: 860
    });

    api.updateAnswerMenuFlyoutSide(portal);

    const bounds = getVisibleBounds(portal, root);

    expect(portal.dataset.flyoutSide).toBe("left");
    expect(bounds.left).toBeGreaterThanOrEqual(16);
    expect(bounds.right).toBeLessThanOrEqual(1400 - 16);
  });

  it("prefers the left flyout when the browser viewport still has room but the visible question panel does not", async () => {
    setViewport(1900, 900);

    const api = await getQuizAttemptTestApi();
    const question = document.createElement("div");
    question.className = "que multichoice";
    document.body.append(question);

    const formulation = document.createElement("div");
    formulation.className = "formulation";
    question.append(formulation);

    const triggerHost = document.createElement("span");
    formulation.append(triggerHost);
    const triggerRoot = triggerHost.attachShadow({ mode: "open" });
    const trigger = document.createElement("button");
    triggerRoot.append(trigger);

    question.getBoundingClientRect = () => createRect(260, 40, 1500, 520);
    formulation.getBoundingClientRect = () => createRect(300, 40, 1300, 520);
    trigger.getBoundingClientRect = () => createRect(1060, 180, 24, 24);

    const { portal, root } = renderPortal(
      api.getAnswerMenuMarkup(
        sourceAnswerData({
          reduxshare: exactAnswerData("true")
        }),
        true,
        {
          status: "idle",
          answer: null,
          confidence: null,
          actions: [],
          error: null
        },
        true
      )
    );

    const firstItem = root.querySelector<HTMLElement>(".menu-item");
    expect(firstItem).toBeTruthy();
    firstItem!.dataset.active = "true";

    installDynamicRects(portal, root, {
      initialLeft: 0
    });

    api.positionAnswerMenuPortal(portal, trigger as HTMLButtonElement);

    const bounds = getVisibleBounds(portal, root);

    expect(portal.dataset.flyoutSide).toBe("left");
    expect(bounds.left).toBeGreaterThanOrEqual(300 + 8);
    expect(bounds.right).toBeLessThanOrEqual(300 + 1300 - 8);
  });
});
