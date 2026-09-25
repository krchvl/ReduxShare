import { afterEach, describe, expect, it, vi } from "vitest";
import {
  getPocketBaseLabel,
  measurePocketBasePing,
  pingStatusForLatency,
} from "../src/lib/pocketbase";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("getPocketBaseLabel", () => {
  it("falls back to the default server name", () => {
    expect(getPocketBaseLabel()).toBe("Основной [DE #1]");
  });
});

describe("pingStatusForLatency", () => {
  it("maps latency to traffic-light statuses", () => {
    expect(pingStatusForLatency(null)).toBe("offline");
    expect(pingStatusForLatency(42)).toBe("good");
    expect(pingStatusForLatency(300)).toBe("good");
    expect(pingStatusForLatency(301)).toBe("warn");
    expect(pingStatusForLatency(800)).toBe("warn");
    expect(pingStatusForLatency(801)).toBe("bad");
  });
});

describe("measurePocketBasePing", () => {
  it("returns round-trip time for healthy servers", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response('{"code":200}', { status: 200 })),
    );

    const latency = await measurePocketBasePing("https://pb.example.com");

    expect(typeof latency).toBe("number");
    expect(latency).toBeGreaterThanOrEqual(0);
  });

  it("returns null on failure or unhealthy status", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("down");
      }),
    );
    await expect(measurePocketBasePing("https://pb.example.com")).resolves.toBeNull();

    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("oops", { status: 500 })),
    );
    await expect(measurePocketBasePing("https://pb.example.com")).resolves.toBeNull();
  });
});
