import { vi } from "vitest";

type ChromeStorageArea = {
  get: ReturnType<typeof vi.fn>;
  set: ReturnType<typeof vi.fn>;
  remove: ReturnType<typeof vi.fn>;
};

const storageState = new Map<string, unknown>();

function createStorageArea(): ChromeStorageArea {
  return {
    get: vi.fn(async (keys?: string | string[] | Record<string, unknown>) => {
      if (typeof keys === "string") {
        return { [keys]: storageState.get(keys) };
      }

      if (Array.isArray(keys)) {
        return Object.fromEntries(keys.map((key) => [key, storageState.get(key)]));
      }

      if (keys && typeof keys === "object") {
        return Object.fromEntries(
          Object.entries(keys).map(([key, fallback]) => [key, storageState.has(key) ? storageState.get(key) : fallback])
        );
      }

      return Object.fromEntries(storageState.entries());
    }),
    set: vi.fn(async (items: Record<string, unknown>) => {
      for (const [key, value] of Object.entries(items)) {
        storageState.set(key, value);
      }
    }),
    remove: vi.fn(async (keys: string | string[]) => {
      for (const key of Array.isArray(keys) ? keys : [keys]) {
        storageState.delete(key);
      }
    })
  };
}

const runtimeSendMessage = vi.fn();
const localStorageArea = createStorageArea();

vi.stubGlobal("__REDUXSHARE_TEST_MODE__", true);
vi.stubGlobal("chrome", {
  i18n: {
    getUILanguage: vi.fn(() => "ru")
  },
  runtime: {
    lastError: null,
    sendMessage: runtimeSendMessage
  },
  storage: {
    local: localStorageArea,
    onChanged: {
      addListener: vi.fn()
    }
  }
});

beforeEach(() => {
  document.body.innerHTML = "";
  storageState.clear();
  runtimeSendMessage.mockReset();
  localStorageArea.get.mockClear();
  localStorageArea.set.mockClear();
  localStorageArea.remove.mockClear();
});

