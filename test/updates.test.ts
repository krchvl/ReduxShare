import { afterEach, describe, expect, it, vi } from "vitest";
import {
  fetchLatestUpdateInfo,
  GITHUB_LATEST_RELEASE_URL,
  GITHUB_VERSION_URL
} from "../src/lib/updates";

function mockVersionResponse(version: string, ok = true, status = 200) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => ({
      ok,
      status,
      text: async () => version
    }))
  );
}

describe("GitHub update provider", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("returns GitHub latest version info from .VERSION", async () => {
    mockVersionResponse("0.2.0\n");

    const latestUpdate = await fetchLatestUpdateInfo("0.1.0");

    expect(fetch).toHaveBeenCalledWith(
      GITHUB_VERSION_URL,
      expect.objectContaining({
        cache: "no-store",
        headers: {
          Accept: "text/plain"
        }
      })
    );
    expect(latestUpdate).toEqual({
      version: "0.2.0",
      releaseUrl: GITHUB_LATEST_RELEASE_URL,
      source: "github"
    });
  });

  it("does not return a release URL when the GitHub version is current", async () => {
    mockVersionResponse("0.1.0");

    await expect(fetchLatestUpdateInfo("0.1.0")).resolves.toEqual({
      version: "0.1.0",
      releaseUrl: null,
      source: "github"
    });
  });

  it("normalizes a v-prefixed GitHub .VERSION value", async () => {
    mockVersionResponse("v0.2.0\n");

    await expect(fetchLatestUpdateInfo("0.1.0")).resolves.toEqual({
      version: "0.2.0",
      releaseUrl: GITHUB_LATEST_RELEASE_URL,
      source: "github"
    });
  });

  it("rejects invalid GitHub .VERSION content", async () => {
    mockVersionResponse("latest");

    await expect(fetchLatestUpdateInfo("0.1.0")).rejects.toThrow("invalid version");
  });

  it("rejects failed GitHub .VERSION responses", async () => {
    mockVersionResponse("", false, 404);

    await expect(fetchLatestUpdateInfo("0.1.0")).rejects.toThrow("status 404");
  });
});
