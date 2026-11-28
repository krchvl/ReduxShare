import { describe, expect, it } from "vitest";
import { createThemeSplashTrigger } from "../src/shared/themeSplash";

describe("theme splash trigger", () => {
  it("does not fire before hydration and keeps the baseline unset", () => {
    const trigger = createThemeSplashTrigger();

    expect(trigger("ocean", false)).toBe(false);
    expect(trigger("daylight", false)).toBe(false);

    expect(trigger("ocean", true)).toBe(false);
  });

  it("baselines the first hydrated theme without firing", () => {
    const trigger = createThemeSplashTrigger();

    expect(trigger("ocean", true)).toBe(false);
    expect(trigger("ocean", true)).toBe(false);
  });

  it("fires when the theme changes after hydration", () => {
    const trigger = createThemeSplashTrigger();

    expect(trigger("ocean", true)).toBe(false);
    expect(trigger("daylight", true)).toBe(true);
    expect(trigger("forest", true)).toBe(true);
  });

  it("fires again when switching back to the baselined theme", () => {
    const trigger = createThemeSplashTrigger();

    trigger("ocean", true);
    trigger("daylight", true);
    expect(trigger("ocean", true)).toBe(true);
  });

  it("ignores pre-hydration theme values as the baseline", () => {
    const trigger = createThemeSplashTrigger();

    expect(trigger("ocean", false)).toBe(false);
    expect(trigger("ocean", true)).toBe(false);
    expect(trigger("daylight", true)).toBe(true);
  });
});
