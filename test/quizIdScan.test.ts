import { describe, expect, it, vi } from "vitest";
import {
  normalizeQuizIdScanRange,
  QUIZ_ID_SCAN_DEFAULT_FROM,
  QUIZ_ID_SCAN_DEFAULT_TO,
  scanExternalQuestionIds,
} from "../src/lib/quizIdScan";
import { getQuizQuestionStubs } from "../src/lib/quizQuestionRegistry";

function stubFetch(impl: (url: string, init?: RequestInit) => Promise<Response>) {
  vi.stubGlobal("fetch", vi.fn(impl));
}

describe("normalizeQuizIdScanRange", () => {
  it("accepts integer bounds within the cap", () => {
    expect(normalizeQuizIdScanRange(1, 1000)).toEqual({ from: 1, to: 1000 });
    expect(normalizeQuizIdScanRange("5", "10")).toEqual({ from: 5, to: 10 });
  });

  it("rejects inverted, non-integer, and out-of-cap ranges", () => {
    expect(normalizeQuizIdScanRange(10, 5)).toBeNull();
    expect(normalizeQuizIdScanRange(0, 100)).toBeNull();
    expect(normalizeQuizIdScanRange(1.5, 10)).toBeNull();
    expect(normalizeQuizIdScanRange(1, 20001)).toBeNull();
    expect(normalizeQuizIdScanRange("abc", "10")).toBeNull();
  });

  it("keeps usable defaults", () => {
    expect(QUIZ_ID_SCAN_DEFAULT_FROM).toBe(1);
    expect(QUIZ_ID_SCAN_DEFAULT_TO).toBeGreaterThan(QUIZ_ID_SCAN_DEFAULT_FROM);
  });
});

describe("scanExternalQuestionIds", () => {
  it("discovers IDs with the same solution request the attempt page sends", async () => {
    document.body.innerHTML = '<div id="reduxshare-quiz-preview-modal"></div>';
    const requested: string[] = [];
    stubFetch(async (url: string) => {
      requested.push(url);
      const parsed = new URL(url);
      const questionId = parsed.searchParams.get("questionId");
      const questionType = parsed.searchParams.get("questionType");
      const rows = questionId === "7" && questionType === "match" ? [{ anchor: ["", "h"] }] : [];
      return new Response(JSON.stringify(rows), { status: 200 });
    });

    const progress: Array<{ checked: number; total: number; found: number }> = [];
    const hits = await scanExternalQuestionIds("scan.example", 3, 9, 5, 9, {
      onProgress: (value) => {
        progress.push(value);
      },
    });

    expect(hits).toEqual([
      { questionId: "7", questionType: "match", data: [{ anchor: ["", "h"] }] },
    ]);
    expect(progress.at(-1)).toMatchObject({ checked: 5, total: 5, found: 1 });

    expect(requested.length).toBeGreaterThan(0);
    expect(requested.every((url) => url.startsWith("https://syncshare."))).toBe(true);

    const stubs = await getQuizQuestionStubs("scan.example", 3, 9);
    expect(stubs.map((stub) => stub.questionId)).toEqual(["7"]);
  });

  it("returns empty when nothing matches and records nothing", async () => {
    stubFetch(async () => new Response("[]", { status: 200 }));

    const hits = await scanExternalQuestionIds("scan-empty.example", 3, 9, 1, 3);

    expect(hits).toEqual([]);
    expect(await getQuizQuestionStubs("scan-empty.example", 3, 9)).toEqual([]);
  });

  it("stops early when cancelled", async () => {
    let calls = 0;
    stubFetch(async () => {
      calls += 1;
      return new Response("[]", { status: 200 });
    });

    const hits = await scanExternalQuestionIds("scan-cancel.example", 3, 9, 1, 500, {
      isCancelled: () => calls > 5,
    });

    expect(hits).toEqual([]);

    expect(calls).toBeLessThan(500);
  });

  it("rejects an invalid range without fetching", async () => {
    const spy = vi.fn(async () => new Response("[]", { status: 200 }));
    stubFetch(spy);

    expect(await scanExternalQuestionIds("scan-range.example", 3, 9, 50, 10)).toEqual([]);
    expect(spy).not.toHaveBeenCalled();
  });

  it("probes only the selected question types", async () => {
    document.body.innerHTML = '<div id="reduxshare-quiz-preview-modal"></div>';
    const requestedTypes: Array<string | null> = [];
    stubFetch(async (url: string) => {
      const parsed = new URL(url);
      const questionId = parsed.searchParams.get("questionId");
      const questionType = parsed.searchParams.get("questionType");
      requestedTypes.push(questionType);
      const rows = questionId === "7" && questionType === "match" ? [{ anchor: ["", "h"] }] : [];
      return new Response(JSON.stringify(rows), { status: 200 });
    });

    const hits = await scanExternalQuestionIds("scan-types.example", 3, 9, 7, 7, {
      questionTypes: ["match", "multichoice"],
    });

    expect(hits).toHaveLength(1);
    expect(new Set(requestedTypes)).toEqual(new Set(["multichoice", "match"]));
  });

  it("misses IDs stored under a deselected type", async () => {
    document.body.innerHTML = '<div id="reduxshare-quiz-preview-modal"></div>';
    stubFetch(async (url: string) => {
      const parsed = new URL(url);
      const questionId = parsed.searchParams.get("questionId");
      const questionType = parsed.searchParams.get("questionType");
      const rows = questionId === "7" && questionType === "match" ? [{ anchor: ["", "h"] }] : [];
      return new Response(JSON.stringify(rows), { status: 200 });
    });

    const hits = await scanExternalQuestionIds("scan-deselected.example", 3, 9, 7, 7, {
      questionTypes: ["multichoice", "truefalse"],
    });

    expect(hits).toEqual([]);
  });

  it("falls back to the full order for unknown type codes", async () => {
    document.body.innerHTML = '<div id="reduxshare-quiz-preview-modal"></div>';
    const requestedTypes: Array<string | null> = [];
    stubFetch(async (url: string) => {
      const parsed = new URL(url);
      requestedTypes.push(parsed.searchParams.get("questionType"));
      return new Response("[]", { status: 200 });
    });

    await scanExternalQuestionIds("scan-unknown.example", 3, 9, 1, 1, {
      questionTypes: ["not-a-type"],
    });

    expect(requestedTypes.length).toBeGreaterThan(1);
  });
});
