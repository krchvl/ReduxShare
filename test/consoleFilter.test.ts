import { beforeEach, describe, expect, it, vi } from "vitest";

type ConsoleSpies = {
  logSpy: ReturnType<typeof vi.spyOn>;
  warnSpy: ReturnType<typeof vi.spyOn>;
  errorSpy: ReturnType<typeof vi.spyOn>;
};

async function installFreshFilter(): Promise<ConsoleSpies> {
  vi.resetModules();

  const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
  const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
  const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
  const { installConsoleFilter } = await import("../src/shared/consoleFilter");

  installConsoleFilter();

  return { logSpy, warnSpy, errorSpy };
}

describe("console filter", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("drops ReduxShare and Moodle session logs", async () => {
    const { logSpy, warnSpy, errorSpy } = await installFreshFilter();

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
    const { logSpy } = await installFreshFilter();

    console.log("page message", { id: 7 });

    expect(logSpy).toHaveBeenCalledWith("page message", { id: 7 });
  });

  it("does not run object conversion hooks of logged values", async () => {
    const { logSpy } = await installFreshFilter();
    const converted: string[] = [];
    const value = {
      toString() {
        converted.push("toString");
        return "ReduxShare: from toString";
      },
    };

    console.log(value);

    expect(converted).toHaveLength(0);
    expect(logSpy).toHaveBeenCalledWith(value);
  });
});
