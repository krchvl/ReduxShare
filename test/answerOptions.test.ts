import { describe, expect, it } from "vitest";
import { mergeAnswerOptionLabels, parseTaskAnswerOptions } from "../src/lib/quizTasks";

describe("parseTaskAnswerOptions", () => {
  it("parses the stored JSON array and rejects malformed payloads", () => {
    expect(parseTaskAnswerOptions(JSON.stringify(["a", "b"]))).toEqual(["a", "b"]);
    expect(parseTaskAnswerOptions("")).toEqual([]);
    expect(parseTaskAnswerOptions(null)).toEqual([]);
    expect(parseTaskAnswerOptions("not json")).toEqual([]);
    expect(parseTaskAnswerOptions(JSON.stringify({ nested: true }))).toEqual([]);
    expect(parseTaskAnswerOptions(JSON.stringify(["a", 42, "b"]))).toEqual(["a", "b"]);
  });
});

describe("mergeAnswerOptionLabels", () => {
  it("merges without case-insensitive duplicates, keeping the existing order first", () => {
    expect(mergeAnswerOptionLabels(["Alpha", "beta"], ["BETA", "gamma", "Alpha "])).toEqual([
      "Alpha",
      "beta",
      "gamma",
    ]);
  });

  it("normalizes whitespace, drops empties and caps the list length", () => {
    expect(mergeAnswerOptionLabels([], ["  spaced   out  ", "", "spaced out"])).toEqual([
      "spaced out",
    ]);
    expect(
      mergeAnswerOptionLabels(
        [],
        Array.from({ length: 250 }, (_, index) => `opt ${index}`),
      ),
    ).toHaveLength(200);
  });

  it("returns an empty list when both inputs are empty", () => {
    expect(mergeAnswerOptionLabels([], [])).toEqual([]);
  });
});
