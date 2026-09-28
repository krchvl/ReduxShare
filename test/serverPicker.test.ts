import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MainScreen } from "../src/components/MainScreen";
import { I18nProvider } from "../src/i18n/react";
import { DEFAULT_SETTINGS, DEFAULT_UPDATE_STATE, type Settings } from "../src/types";

const testSettings: Settings = {
  ...DEFAULT_SETTINGS,
  servers: [
    {
      id: "primary",
      url: "https://primary.example.com",
      label: "Основной [DE #1]",
      builtIn: true,
    },
    { id: "srv-mirror", url: "https://mirror.example.com", label: "mirror.example.com" },
  ],
  activeServerId: "primary",
};

let root: Root | null = null;
let container: HTMLDivElement | null = null;
let onSettingsChange: ReturnType<typeof vi.fn>;
let onLogout: ReturnType<typeof vi.fn>;

function renderMainScreen(settings: Settings = testSettings) {
  onSettingsChange = vi.fn();
  onLogout = vi.fn();
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);

  act(() => {
    root?.render(
      createElement(
        I18nProvider,
        { language: "ru" },
        createElement(MainScreen, {
          settings,
          updateState: DEFAULT_UPDATE_STATE,
          isCheckingUpdates: false,
          onSettingsChange,
          onCheckUpdates: () => {},
          onResetSettings: () => {},
          onLogout,
        }),
      ),
    );
  });
}

function openExtraTab() {
  const extraTab = Array.from(container!.querySelectorAll<HTMLButtonElement>(".settings-tab")).find(
    (tab) => tab.textContent === "Дополнительно",
  );

  expect(extraTab).toBeDefined();

  act(() => {
    extraTab!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });
}

function getServerTrigger() {
  const trigger = document.querySelector<HTMLButtonElement>(
    ".server-picker__select .cselect__trigger",
  );
  expect(trigger).not.toBeNull();
  return trigger!;
}

async function openServerListbox() {
  act(() => {
    getServerTrigger().dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });

  // onOpen перезапускает измерение пинга — даём промисам осесть внутри act
  await act(async () => {
    await Promise.resolve();
  });

  const listbox = document.querySelector('[role="listbox"]');
  expect(listbox).not.toBeNull();
  return Array.from(document.querySelectorAll<HTMLElement>('[role="option"]'));
}

function typeIntoInput(input: HTMLInputElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value")!.set!;

  act(() => {
    setter.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

function submitAddForm() {
  const form = document.querySelector<HTMLFormElement>(".cselect__add-form");
  expect(form).not.toBeNull();

  act(() => {
    form!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
  });
}

async function flushMicrotasks() {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

beforeEach(() => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => ({ ok: true })),
  );
});

afterEach(() => {
  if (root) {
    act(() => {
      root?.unmount();
    });
    root = null;
  }
  document.body.innerHTML = "";
  container = null;
});

describe("ServerPicker with multiple servers", () => {
  it("shows the active server label with its ping inside the trigger", async () => {
    renderMainScreen();
    openExtraTab();
    await flushMicrotasks();

    const trigger = getServerTrigger();

    expect(trigger.textContent).toContain("Основной [DE #1]");
    expect(trigger.querySelector(".cselect__trigger-meta .ping-badge")?.textContent).toContain(
      "мс",
    );
  });

  it("lists all servers with descriptions and remove buttons only for user-added ones", async () => {
    renderMainScreen();
    openExtraTab();
    await flushMicrotasks();

    const options = await openServerListbox();

    expect(options).toHaveLength(2);
    expect(options[0]?.textContent).toContain("https://primary.example.com");
    expect(options[0]?.querySelector(".cselect__remove-option")).toBeNull();
    expect(options[1]?.textContent).toContain("https://mirror.example.com");
    expect(options[1]?.querySelector(".cselect__remove-option")).not.toBeNull();
  });

  it("switching a server reports the new active server and signs the user out", async () => {
    renderMainScreen();
    openExtraTab();
    await flushMicrotasks();

    const options = await openServerListbox();

    act(() => {
      options[1]!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    expect(onLogout).toHaveBeenCalledTimes(1);
    expect(onSettingsChange).toHaveBeenCalledTimes(1);

    const nextState = onSettingsChange.mock.calls[0][0] as Settings;

    expect(nextState.activeServerId).toBe("srv-mirror");
    expect(nextState.servers).toHaveLength(2);
  });

  it("removes a user-added server without touching the built-in one", async () => {
    renderMainScreen();
    openExtraTab();
    await flushMicrotasks();

    const options = await openServerListbox();
    const removeButton = options[1]!.querySelector<HTMLButtonElement>(".cselect__remove-option");

    expect(removeButton).not.toBeNull();

    act(() => {
      removeButton!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    expect(onLogout).not.toHaveBeenCalled();
    expect(onSettingsChange).toHaveBeenCalledTimes(1);

    const nextState = onSettingsChange.mock.calls[0][0] as Settings;

    expect(nextState.servers).toHaveLength(1);
    expect(nextState.servers[0]?.id).toBe("primary");
    expect(nextState.activeServerId).toBe("primary");
  });

  it("adds a server through the footer form and activates it", async () => {
    renderMainScreen();
    openExtraTab();
    await flushMicrotasks();

    await openServerListbox();

    act(() => {
      document
        .querySelector<HTMLButtonElement>(".cselect__add-row")!
        .dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    const input = document.querySelector<HTMLInputElement>(".cselect__add-input");

    expect(input).not.toBeNull();
    typeIntoInput(input!, "https://new.example.com/");

    submitAddForm();
    await flushMicrotasks();

    expect(onLogout).toHaveBeenCalledTimes(1);
    expect(onSettingsChange).toHaveBeenCalledTimes(1);

    const nextState = onSettingsChange.mock.calls[0][0] as Settings;

    expect(nextState.servers).toHaveLength(3);
    expect(nextState.servers[2]?.url).toBe("https://new.example.com");
    expect(nextState.activeServerId).toBe(nextState.servers[2]?.id);
  });

  it("rejects duplicate servers with an error and keeps the list untouched", async () => {
    renderMainScreen();
    openExtraTab();
    await flushMicrotasks();

    await openServerListbox();

    act(() => {
      document
        .querySelector<HTMLButtonElement>(".cselect__add-row")!
        .dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    typeIntoInput(
      document.querySelector<HTMLInputElement>(".cselect__add-input")!,
      "https://primary.example.com/",
    );

    submitAddForm();
    await flushMicrotasks();

    expect(onSettingsChange).not.toHaveBeenCalled();
    expect(document.querySelector(".cselect__error")?.textContent).toBe(
      "Такой сервер уже есть в списке",
    );
  });
});
