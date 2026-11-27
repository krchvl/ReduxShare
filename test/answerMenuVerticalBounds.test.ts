import { describe, expect, it } from "vitest";
import { getQuizAttemptTestApi } from "./helpers/quizAttemptApi";
import { exactAnswerData, sourceAnswerData } from "./helpers/sourceData";

function setViewport(width: number, height: number) {
  Object.defineProperty(document.documentElement, "clientWidth", {
    configurable: true,
    value: width,
  });
  Object.defineProperty(window, "innerHeight", {
    configurable: true,
    value: height,
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
        bottom: top + height,
      };
    },
  } as DOMRect;
}

function renderPortal(markup: string) {
  const portal = document.createElement("div");
  const root = portal.attachShadow({ mode: "open" });
  root.innerHTML = markup;
  document.body.append(portal);
  return { portal, root };
}

function installLayout(
  portal: HTMLElement,
  root: ShadowRoot,
  options: { panelHeight: number; tabsHeight?: number; itemTop?: number },
) {
  const menu = root.querySelector<HTMLElement>(".menu");
  const tabs = root.querySelector<HTMLElement>(".menu-tabs");
  const panel = root.querySelector<HTMLElement>('.menu-panel[data-active="true"]');
  const item = root.querySelector<HTMLElement>('.menu-item[data-active="true"]');
  const flyout = item?.querySelector<HTMLElement>(".flyout");

  expect(menu).toBeTruthy();
  expect(tabs).toBeTruthy();
  expect(panel).toBeTruthy();
  expect(item).toBeTruthy();
  expect(flyout).toBeTruthy();

  const tabsHeight = options.tabsHeight ?? 58;

  Object.defineProperty(panel!, "scrollHeight", {
    configurable: true,
    get: () => options.panelHeight,
  });
  Object.defineProperty(tabs!, "offsetHeight", { configurable: true, get: () => tabsHeight });
  Object.defineProperty(item!, "offsetHeight", { configurable: true, get: () => 38 });
  Object.defineProperty(flyout!, "offsetWidth", { configurable: true, get: () => 190 });

  tabs!.getBoundingClientRect = () =>
    createRect(Number.parseFloat(portal.style.left || "0"), 0, 348, tabsHeight);
  menu!.getBoundingClientRect = () => {
    const left = Number.parseFloat(portal.style.left || "0");
    const top = Number.parseFloat(portal.style.top || "0");
    return createRect(left, top, 348, tabsHeight + options.panelHeight);
  };
  item!.getBoundingClientRect = () => {
    const left = Number.parseFloat(portal.style.left || "0");
    const top = options.itemTop ?? Number.parseFloat(portal.style.top || "0") + tabsHeight;
    return createRect(left, top, 348, 38);
  };
  flyout!.getBoundingClientRect = () => {
    const left = Number.parseFloat(portal.style.left || "0");
    return createRect(left + 344, Number.parseFloat(portal.style.top || "0"), 190, 400);
  };

  return { menu: menu!, panel: panel!, item: item!, flyout: flyout! };
}

async function openLongMenuAnswers() {
  const api = await getQuizAttemptTestApi();
  const { portal, root } = renderPortal(
    api.getAnswerMenuMarkup(
      sourceAnswerData({
        reduxshare: exactAnswerData("true"),
      }),
      true,
      {
        status: "idle",
        answer: null,
        confidence: null,
        actions: [],
        error: null,
      },
      true,
    ),
  );

  root.querySelector<HTMLElement>(".menu-item")!.dataset.active = "true";

  return { api, portal, root };
}

function createTrigger(top: number) {
  const trigger = document.createElement("button");
  trigger.getBoundingClientRect = () => createRect(600, top, 24, 24);
  return trigger as HTMLButtonElement;
}

describe("R-menu viewport height bounds", () => {
  it("caps the panel height and pins the menu to the top margin when the answers are taller than the viewport", async () => {
    setViewport(1200, 600);

    const { api, portal, root } = await openLongMenuAnswers();
    const { panel } = installLayout(portal, root, { panelHeight: 900 });

    api.positionAnswerMenuPortal(portal, createTrigger(520));

    const panelStyle = window.getComputedStyle(panel);

    expect(panel.dataset.scrollable).toBe("true");
    expect(panel.style.maxHeight).toBe(`${600 - 32 - 58 - 2}px`);
    expect(panelStyle.overflowY).toBe("auto");
    expect(panelStyle.overscrollBehavior).toContain("contain");
    expect(Number.parseFloat(panel.style.maxHeight)).toBeLessThan(panel.scrollHeight);
    expect(Number.parseFloat(portal.style.top)).toBe(16);
  });

  it("caps the panel to the real remaining height when less than 96px is left", async () => {
    setViewport(1200, 100);

    const { api, portal, root } = await openLongMenuAnswers();
    const { panel } = installLayout(portal, root, { panelHeight: 900 });

    api.positionAnswerMenuPortal(portal, createTrigger(80));

    expect(panel.style.maxHeight).toBe(`${100 - 32 - 58 - 2}px`);
  });

  it("does not leave the menu overflowing the viewport bottom on the last question", async () => {
    setViewport(1200, 600);

    const { api, portal, root } = await openLongMenuAnswers();
    installLayout(portal, root, { panelHeight: 900 });

    api.positionAnswerMenuPortal(portal, createTrigger(520));

    const menuTop = Number.parseFloat(portal.style.top);
    const clampedHeight = 600 - 32;

    expect(menuTop).toBeGreaterThanOrEqual(16);
    expect(menuTop + clampedHeight).toBeLessThanOrEqual(600 - 16);
  });

  it("opens above the trigger and keeps a short menu fully visible", async () => {
    setViewport(1200, 600);

    const { api, portal, root } = await openLongMenuAnswers();
    const { panel } = installLayout(portal, root, { panelHeight: 100 });

    api.positionAnswerMenuPortal(portal, createTrigger(500));

    const menuTop = Number.parseFloat(portal.style.top);

    expect(panel.dataset.scrollable).toBe("false");
    expect(panel.style.maxHeight).toBe("");
    expect(menuTop).toBe(500 - (100 + 58 + 2) - 8);
    expect(menuTop + 160).toBeLessThanOrEqual(600 - 16);
  });

  it("opens below the trigger when there is enough room", async () => {
    setViewport(1600, 1000);

    const { api, portal, root } = await openLongMenuAnswers();
    installLayout(portal, root, { panelHeight: 120 });

    api.positionAnswerMenuPortal(portal, createTrigger(200));

    expect(portal.style.top).toBe("232px");
  });

  it("keeps the whole menu inside the viewport when the flyout grows taller than the remaining space", async () => {
    setViewport(1200, 600);

    const { api, portal, root } = await openLongMenuAnswers();
    const { flyout } = installLayout(portal, root, { panelHeight: 300 });

    portal.style.left = "300px";
    portal.style.top = "16px";

    api.updateAnswerMenuFlyoutSide(portal);

    expect(flyout.style.maxHeight).toBe(`${600 - 16 - (16 + 58)}px`);
    expect(flyout.style.position).toBe("");
  });

  it("detaches the flyout from the scrollable panel so it is not clipped", async () => {
    setViewport(1200, 600);

    const { api, portal, root } = await openLongMenuAnswers();
    const { flyout } = installLayout(portal, root, { panelHeight: 900, itemTop: 300 });

    api.positionAnswerMenuPortal(portal, createTrigger(520));

    const flyoutStyle = window.getComputedStyle(flyout);

    expect(portal.dataset.flyoutSide).toBe("left");
    expect(flyoutStyle.position).toBe("fixed");
    expect(flyoutStyle.overflowY).toBe("auto");
    expect(flyout.style.top).toBe(`${300 - 16 - 1}px`);
    expect(flyout.style.left).toBe(`${4 - 190}px`);
    expect(flyout.style.right).toBe("auto");
  });

  it("limits the flyout to the real remaining height even below 96px", async () => {
    setViewport(1200, 600);

    const { api, portal, root } = await openLongMenuAnswers();
    const { flyout } = installLayout(portal, root, { panelHeight: 900, itemTop: 580 });

    api.positionAnswerMenuPortal(portal, createTrigger(520));

    const menuTop = Number.parseFloat(portal.style.top);
    const flyoutTop = Number.parseFloat(flyout.style.top);
    const flyoutMaxHeight = Number.parseFloat(flyout.style.maxHeight);

    expect(flyoutMaxHeight).toBeLessThan(96);
    expect(menuTop + flyoutTop + flyoutMaxHeight).toBeLessThanOrEqual(600 - 16);
  });

  it("recalculates the flyout height on every reposition", async () => {
    setViewport(1200, 600);

    const { api, portal, root } = await openLongMenuAnswers();
    const layout = { panelHeight: 900, itemTop: 200 };
    const { flyout } = installLayout(portal, root, layout);

    api.positionAnswerMenuPortal(portal, createTrigger(520));
    const tallMaxHeight = Number.parseFloat(flyout.style.maxHeight);

    layout.itemTop = 540;
    api.positionAnswerMenuPortal(portal, createTrigger(520));

    const shortMaxHeight = Number.parseFloat(flyout.style.maxHeight);

    expect(shortMaxHeight).toBeLessThan(tallMaxHeight);
    expect(shortMaxHeight).toBeLessThan(96);
  });
});
