import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  handleRuntimeInstalled,
  shouldOpenOnboardingTour,
} from "../src/background/onboardingInstall";

const tabsCreate = vi.fn();

describe("onboarding install hook", () => {
  beforeEach(() => {
    tabsCreate.mockReset();
    (chrome as unknown as Record<string, unknown>).tabs = { create: tabsCreate };
  });

  it("opens the onboarding tour only for reason=install", () => {
    expect(shouldOpenOnboardingTour("install")).toBe(true);
    expect(shouldOpenOnboardingTour("update")).toBe(false);
    expect(shouldOpenOnboardingTour("browser_update")).toBe(false);
    expect(shouldOpenOnboardingTour(undefined)).toBe(false);
  });

  it("creates a tab with the onboarding page url", () => {
    handleRuntimeInstalled({ reason: "install" });

    expect(tabsCreate).toHaveBeenCalledTimes(1);
    expect(tabsCreate.mock.calls[0]?.[0]).toMatchObject({
      url: "chrome-extension://test/onboarding.html",
    });
  });

  it("does not open the tour on updates or unknown reasons", () => {
    handleRuntimeInstalled({ reason: "update" });
    handleRuntimeInstalled(undefined);
    handleRuntimeInstalled({});

    expect(tabsCreate).not.toHaveBeenCalled();
  });
});
