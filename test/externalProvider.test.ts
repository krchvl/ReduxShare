import { afterEach, describe, expect, it, vi } from "vitest";
import {
  EXTERNAL_TYPE_PROBE_LIMIT,
  EXTERNAL_TYPE_PROBE_ORDER,
  buildVariantsUrl,
  fetchQuestionVariants,
  hasExternalAnswerRows,
  isAbortError,
  normalizeExternalVariantsData,
  probeExternalQuestionType,
  type ExternalVariantsPayload,
} from "../src/lib/externalProvider";

function basePayload(overrides: Partial<ExternalVariantsPayload> = {}): ExternalVariantsPayload {
  return {
    domain: "school.moodledemo.net",
    courseId: 66,
    quizId: 789,
    questions: [],
    ...overrides,
  };
}

function stubFetch(impl: (url: string, init?: RequestInit) => Promise<Response>) {
  vi.stubGlobal("fetch", vi.fn(impl));
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("buildVariantsUrl", () => {
  it("sends real attempt and moodle user ids when the content script provides them", () => {
    const url = new URL(
      buildVariantsUrl(basePayload({ attemptId: "95", moodleUserId: "20" }), {
        questionId: "1349",
        questionType: "match",
        questionHash: "hash",
      }),
    );

    expect(url.searchParams.get("host")).toBe("school.moodledemo.net");
    expect(url.searchParams.get("courseId")).toBe("66");
    expect(url.searchParams.get("quizId")).toBe("789");
    expect(url.searchParams.get("attemptId")).toBe("95");
    expect(url.searchParams.get("moodleId")).toBe("20");
    expect(url.searchParams.get("questionId")).toBe("1349");
    expect(url.searchParams.get("questionType")).toBe("match");
    expect(url.searchParams.get("client")).toBe("2.6.0");
  });

  it("falls back to historical placeholders when page meta is missing", () => {
    const url = new URL(
      buildVariantsUrl(basePayload(), {
        questionId: "1349",
        questionType: null,
        questionHash: null,
      }),
    );

    expect(url.searchParams.get("attemptId")).toBe("1");
    expect(url.searchParams.get("moodleId")).toBe("1");
    expect(url.searchParams.get("questionType")).toBe("");
  });
});

describe("normalizeExternalVariantsData", () => {
  it("passes through null, arrays, and row objects unchanged", () => {
    expect(normalizeExternalVariantsData(null)).toEqual({ data: null, invalid: false });
    expect(normalizeExternalVariantsData([{ anchor: [] }])).toEqual({
      data: [{ anchor: [] }],
      invalid: false,
    });
    expect(normalizeExternalVariantsData({ anchor: [] })).toEqual({
      data: { anchor: [] },
      invalid: false,
    });
  });

  it("flags primitives such as HTML error pages as invalid", () => {
    expect(normalizeExternalVariantsData("<html>blocked</html>")).toEqual({
      data: null,
      invalid: true,
    });
    expect(normalizeExternalVariantsData(42)).toEqual({ data: null, invalid: true });
  });
});

describe("hasExternalAnswerRows", () => {
  it("treats ok results with rows as data and everything else as empty", () => {
    expect(hasExternalAnswerRows({ ok: true, data: [{ anchor: [] }] })).toBe(true);
    expect(hasExternalAnswerRows({ ok: true, data: { anchor: [] } })).toBe(true);
    expect(hasExternalAnswerRows({ ok: true, data: [] })).toBe(false);
    expect(hasExternalAnswerRows({ ok: true, data: null })).toBe(false);
    expect(hasExternalAnswerRows({ ok: false, error: "boom" })).toBe(false);
  });
});

describe("EXTERNAL_TYPE_PROBE_ORDER", () => {
  it("has no duplicates, covers the common qtypes and respects the budget", () => {
    expect(new Set(EXTERNAL_TYPE_PROBE_ORDER).size).toBe(EXTERNAL_TYPE_PROBE_ORDER.length);
    expect(EXTERNAL_TYPE_PROBE_ORDER).toContain("multichoice");
    expect(EXTERNAL_TYPE_PROBE_ORDER).toContain("match");
    expect(EXTERNAL_TYPE_PROBE_ORDER).toContain("ddmarker");
    expect(EXTERNAL_TYPE_PROBE_ORDER.length).toBeLessThanOrEqual(EXTERNAL_TYPE_PROBE_LIMIT * 2);
  });
});

describe("isAbortError", () => {
  it("detects abort errors across realms", () => {
    expect(isAbortError(new DOMException("aborted", "AbortError"))).toBe(true);
    expect(isAbortError(Object.assign(new Error("x"), { name: "AbortError" }))).toBe(true);
    expect(isAbortError(new Error("boom"))).toBe(false);
    expect(isAbortError(null)).toBe(false);
  });
});

describe("fetchQuestionVariants", () => {
  it("returns parsed rows on success", async () => {
    const rows = [{ anchor: ["", "1"], suggestions: [], submissions: [] }];
    stubFetch(async () => new Response(JSON.stringify(rows), { status: 200 }));

    const result = await fetchQuestionVariants(
      basePayload(),
      { questionId: "1349", questionType: "match", questionHash: "hash" },
      "en",
    );

    expect(result).toMatchObject({ ok: true, status: 200, questionId: "1349" });
    expect(result.data).toEqual(rows);
  });

  it("reports missing question ids without fetching", async () => {
    const spy = vi.fn(async () => new Response("[]", { status: 200 }));
    stubFetch(spy);

    const result = await fetchQuestionVariants(
      basePayload(),
      { questionId: null, questionType: "match", questionHash: null },
      "ru",
    );

    expect(result.ok).toBe(false);
    expect(spy).not.toHaveBeenCalled();
  });

  it("marks non-JSON bodies as failed instead of passing them downstream", async () => {
    stubFetch(async () => new Response("<html>Access denied</html>", { status: 200 }));

    const result = await fetchQuestionVariants(
      basePayload(),
      { questionId: "1349", questionType: "match", questionHash: null },
      "ru",
    );

    expect(result.ok).toBe(false);
    expect(result.data).toBeNull();
    expect(result.error).toBeTruthy();
  });

  it("aborts hanging requests after the timeout", async () => {
    stubFetch(
      (_url, init) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () => {
            reject(new DOMException("The operation was aborted.", "AbortError"));
          });
        }),
    );

    const result = await fetchQuestionVariants(
      basePayload(),
      { questionId: "1349", questionType: "match", questionHash: null },
      "ru",
      20,
    );

    expect(result.ok).toBe(false);
    expect(result.error).toContain("external");
  });
});

describe("probeExternalQuestionType", () => {
  it("returns the first qtype with rows when the stored type is stale", async () => {
    const requestedTypes: Array<string | null> = [];
    stubFetch(async (url: string) => {
      const parsed = new URL(url);
      const questionType = parsed.searchParams.get("questionType");
      requestedTypes.push(questionType);
      const rows = questionType === "match" ? [{ anchor: ["", "1"] }] : [];
      return new Response(JSON.stringify(rows), { status: 200 });
    });

    const hit = await probeExternalQuestionType(
      basePayload(),
      { questionId: "1349", questionType: "multichoice", questionHash: null },
      "en",
    );

    expect(hit?.questionType).toBe("match");
    expect(hit?.result.data).toEqual([{ anchor: ["", "1"] }]);

    expect(requestedTypes).not.toContain("multichoice");
  });

  it("returns null when no qtype yields rows", async () => {
    stubFetch(async () => new Response("[]", { status: 200 }));

    const hit = await probeExternalQuestionType(
      basePayload(),
      { questionId: "1349", questionType: null, questionHash: null },
      "ru",
    );

    expect(hit).toBeNull();
  });

  it("skips questions without an id without fetching", async () => {
    const spy = vi.fn(async () => new Response("[]", { status: 200 }));
    stubFetch(spy);

    const hit = await probeExternalQuestionType(
      basePayload(),
      { questionId: null, questionType: "match", questionHash: null },
      "ru",
    );

    expect(hit).toBeNull();
    expect(spy).not.toHaveBeenCalled();
  });
});
