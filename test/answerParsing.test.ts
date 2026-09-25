import { describe, expect, it } from "vitest";

import {
  getBooleanSuggestionValue,
  parseAiMatchPairs,
  splitAiMatchPairText,
} from "../src/shared/answerParsing";

describe("splitAiMatchPairText", () => {
  it("splits on newlines, semicolons and pair commas, keeping pair separators intact", () => {
    expect(splitAiMatchPairText("a → b\nc; d")).toEqual(["a → b", "c", "d"]);
    expect(splitAiMatchPairText("cat=кот, dog=собака")).toEqual(["cat=кот", "dog=собака"]);

    expect(splitAiMatchPairText("1,000 = one thousand")).toEqual(["1", "000 = one thousand"]);
  });

  it("trims and drops empty segments, normalizing CR newlines", () => {
    expect(splitAiMatchPairText("  a -> b\r\n\r\n;  ")).toEqual(["a -> b"]);
  });
});

describe("parseAiMatchPairs", () => {
  it("parses arrow, equals and colon separators with all quote styles", () => {
    expect(parseAiMatchPairs("cat → кот; dog -> собака")).toEqual([
      { prompt: "cat", answer: "кот" },
      { prompt: "dog", answer: "собака" },
    ]);
    expect(parseAiMatchPairs('"Ohm" => "Ампер"')).toEqual([{ prompt: "Ohm", answer: "Ампер" }]);
    expect(parseAiMatchPairs("{voltage: напряжение}")).toEqual([
      { prompt: "voltage", answer: "напряжение" },
    ]);
  });

  it("drops segments without a pair separator and pairs with an empty side after = or :", () => {
    expect(parseAiMatchPairs("no separator here\ncat = \n: кот")).toEqual([]);
  });

  it("keeps the pre-existing => / -> quirk: an empty answer falls back to the tail after =", () => {
    expect(parseAiMatchPairs("cat => ")).toEqual([{ prompt: "cat", answer: ">" }]);
  });
});

describe("getBooleanSuggestionValue", () => {
  it("accepts trimmed case-insensitive true/false and rejects everything else", () => {
    expect(getBooleanSuggestionValue(" TRUE ")).toBe(true);
    expect(getBooleanSuggestionValue("False")).toBe(false);
    expect(getBooleanSuggestionValue("yes")).toBeNull();
    expect(getBooleanSuggestionValue("")).toBeNull();
  });
});
