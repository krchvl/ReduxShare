import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Splash } from "../src/components/Splash";
import { I18nProvider } from "../src/i18n/react";

const appMocks = vi.hoisted(() => ({
  loadStoredState: vi.fn(),
  patchStoredState: vi.fn(),
  requestUpdateCheck: vi.fn(),
}));

vi.mock("../src/lib/storage", () => ({
  loadStoredState: appMocks.loadStoredState,
  saveStoredState: appMocks.patchStoredState,
  patchStoredState: appMocks.patchStoredState,
}));

vi.mock("../src/lib/updates", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  requestUpdateCheck: appMocks.requestUpdateCheck,
}));

let root: Root | null = null;
let container: HTMLElement | null = null;

function mount(element: React.ReactElement) {
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);

  act(() => {
    root?.render(element);
  });

  return container;
}

afterEach(() => {
  if (root) {
    act(() => {
      root?.unmount();
    });
    root = null;
  }
  document.body.innerHTML = "";
  container = null;
  appMocks.loadStoredState.mockReset();
  appMocks.patchStoredState.mockReset();
  appMocks.requestUpdateCheck.mockReset();
});

describe("Splash", () => {
  it("announces the loading state with a translated label", () => {
    const element = mount(createElement(I18nProvider, { language: "ru" }, createElement(Splash)));

    const splash = element.querySelector(".splash");
    expect(splash).toBeInstanceOf(HTMLDivElement);
    expect(splash?.getAttribute("role")).toBe("status");
    expect(splash?.getAttribute("aria-live")).toBe("polite");
    expect(splash?.querySelector(".splash__label")?.textContent).toBe("Загружаем ReduxShare…");
    expect(splash?.querySelector(".splash__glyph")?.textContent).toBe("R");
  });

  it("accepts a custom label and an overlay variant", () => {
    const element = mount(
      createElement(
        I18nProvider,
        { language: "en" },
        createElement(Splash, { variant: "overlay", label: "Applying the theme…" }),
      ),
    );

    const splash = element.querySelector(".splash");
    expect(splash?.classList.contains("splash--overlay")).toBe(true);
    expect(splash?.querySelector(".splash__label")?.textContent).toBe("Applying the theme…");
  });
});

describe("App splash", () => {
  it("shows the splash instead of a blank screen while the state hydrates", async () => {
    let resolveHydration: (value: unknown) => void = () => {};
    appMocks.loadStoredState.mockReturnValue(
      new Promise((resolve) => {
        resolveHydration = resolve;
      }),
    );
    appMocks.patchStoredState.mockResolvedValue(undefined);
    appMocks.requestUpdateCheck.mockResolvedValue({ ok: true });

    const { App } = await import("../src/App");
    const element = mount(createElement(App));

    expect(element.querySelector(".splash")).toBeInstanceOf(HTMLDivElement);
    expect(element.querySelector(".auth-form")).toBeNull();

    await act(async () => {
      resolveHydration({ settings: {}, authSession: null, userProfile: null });
      await new Promise((resolve) => setTimeout(resolve, 50));
    });

    expect(element.querySelector(".splash")).toBeNull();
  });
});
