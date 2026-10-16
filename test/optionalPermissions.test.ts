import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  isOriginHostPermissionGranted,
  requestOriginHostPermission,
  toOriginPermission,
} from "../src/lib/optionalPermissions";

function stubPermissions(permissions: {
  contains?: (permissions: { origins: string[] }) => Promise<boolean>;
  request?: (permissions: { origins: string[] }) => Promise<boolean>;
}) {
  vi.stubGlobal("chrome", {
    ...window.chrome,
    permissions,
  });
}

describe("toOriginPermission", () => {
  it("turns an https endpoint into its origin wildcard", () => {
    expect(toOriginPermission("https://alt.example.com:8443/path")).toBe(
      "https://alt.example.com:8443/*",
    );
  });

  it("turns an http endpoint into its origin wildcard", () => {
    expect(toOriginPermission("http://localhost:8090")).toBe("http://localhost:8090/*");
  });

  it("returns null for empty or invalid input", () => {
    expect(toOriginPermission(undefined)).toBeNull();
    expect(toOriginPermission("   ")).toBeNull();
    expect(toOriginPermission("not a url")).toBeNull();
    expect(toOriginPermission("chrome-extension://abc")).toBeNull();
  });
});

describe("isOriginHostPermissionGranted", () => {
  it("delegates to chrome.permissions.contains with the origin", async () => {
    const contains = vi.fn(async () => true);
    stubPermissions({ contains });

    await expect(isOriginHostPermissionGranted("https://alt.example.com/*")).resolves.toBe(true);
    expect(contains).toHaveBeenCalledWith({ origins: ["https://alt.example.com/*"] });
  });

  it("treats a missing permissions API as granted", async () => {
    stubPermissions({});
    await expect(isOriginHostPermissionGranted("https://alt.example.com/*")).resolves.toBe(true);
  });

  it("reports an error from contains as not granted", async () => {
    stubPermissions({
      contains: vi.fn(async () => {
        throw new Error("boom");
      }),
    });
    await expect(isOriginHostPermissionGranted("https://alt.example.com/*")).resolves.toBe(false);
  });
});

describe("requestOriginHostPermission", () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
  });

  it("does not prompt when the origin is already granted", async () => {
    const contains = vi.fn(async () => true);
    const request = vi.fn(async () => true);
    stubPermissions({ contains, request });

    await expect(requestOriginHostPermission("https://alt.example.com/*")).resolves.toBe(true);
    expect(request).not.toHaveBeenCalled();
  });

  it("requests the origin and returns the user decision", async () => {
    const contains = vi.fn(async () => false);
    const request = vi.fn(async () => true);
    stubPermissions({ contains, request });

    await expect(requestOriginHostPermission("https://alt.example.com/*")).resolves.toBe(true);
    expect(request).toHaveBeenCalledWith({ origins: ["https://alt.example.com/*"] });
  });

  it("returns false when the user denies the request", async () => {
    const contains = vi.fn(async () => false);
    const request = vi.fn(async () => false);
    stubPermissions({ contains, request });

    await expect(requestOriginHostPermission("https://alt.example.com/*")).resolves.toBe(false);
  });

  it("treats a missing request API as not granted", async () => {
    stubPermissions({ contains: vi.fn(async () => false) });

    await expect(requestOriginHostPermission("https://alt.example.com/*")).resolves.toBe(false);
  });
});
