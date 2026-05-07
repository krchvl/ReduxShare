import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it } from "vitest";
import { Header } from "../src/components/Header";
import { I18nProvider } from "../src/i18n/react";
import { DEFAULT_UPDATE_STATE, type LanguageSetting, type UpdateState } from "../src/types";

let root: Root | null = null;

function renderHeader(updateState: UpdateState, language: LanguageSetting = "ru") {
  const container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);

  act(() => {
    root?.render(
      createElement(
        I18nProvider,
        { language },
        createElement(Header, { updateState })
      )
    );
  });

  return container;
}

describe("Header update badge", () => {
  afterEach(() => {
    if (root) {
      act(() => {
        root?.unmount();
      });
      root = null;
    }
  });

  it("does not show the update badge when no update is available", () => {
    const container = renderHeader(DEFAULT_UPDATE_STATE);

    expect(container.querySelector(".update-badge")).toBeNull();
  });

  it("shows the Russian update badge when GitHub reports a newer version", () => {
    const updateState: UpdateState = {
      ...DEFAULT_UPDATE_STATE,
      status: "available",
      latestVersion: "0.2.0",
      releaseUrl: "https://github.com/krchvl/ReduxShare/releases/latest"
    };
    const container = renderHeader(updateState, "ru");

    expect(container.querySelector(".update-badge")?.textContent).toBe("Новое обновление");
  });

  it("shows the English update badge when the UI language is English", () => {
    const updateState: UpdateState = {
      ...DEFAULT_UPDATE_STATE,
      status: "available",
      latestVersion: "0.2.0",
      releaseUrl: "https://github.com/krchvl/ReduxShare/releases/latest"
    };
    const container = renderHeader(updateState, "en");

    expect(container.querySelector(".update-badge")?.textContent).toBe("New update");
  });
});
