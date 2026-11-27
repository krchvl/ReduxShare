import { describe, expect, it, vi } from "vitest";

async function installFilterWithSpies() {
  const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
  const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
  const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
  const { installConsoleFilter } = await import("../src/shared/consoleFilter");

  installConsoleFilter();

  return { logSpy, warnSpy, errorSpy };
}

describe("console filter", () => {
  it("drops ReduxShare and Moodle session logs", async () => {
    const { logSpy, warnSpy, errorSpy } = await installFilterWithSpies();

    console.log("ReduxShare: fetching answers");
    console.warn("ReduxShare auto-pass: paused");
    console.error("ReduxShare: boom");
    console.log("Starting Moodle session");
    console.log("Moodle session keep-alive failed");

    expect(logSpy).not.toHaveBeenCalled();
    expect(warnSpy).not.toHaveBeenCalled();
    expect(errorSpy).not.toHaveBeenCalled();
  });

  it("keeps unrelated page logs and arguments intact", async () => {
    const { logSpy } = await installFilterWithSpies();

    console.log("page message", { id: 7 });

    expect(logSpy).toHaveBeenCalledWith("page message", { id: 7 });
  });
});
