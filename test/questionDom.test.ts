import { describe, expect, it } from "vitest";
import {
  findClosestLabel,
  hashQuestionImage,
  javaStringHashCode,
  labelsMatch,
  levenshteinDistance,
  normalizeFingerprintText
} from "../src/dom/questionDom";

describe("javaStringHashCode", () => {
  it("matches Java String.hashCode vectors", () => {
    expect(javaStringHashCode("test")).toBe(3556498);
    expect(javaStringHashCode("LinkedIn")).toBe(1259335998);
    expect(javaStringHashCode("")).toBe(0);
  });

  it("hashes fingerprinted Cyrillic prompts into signed int32 values", () => {
    expect(javaStringHashCode(normalizeFingerprintText("Напряжение"))).toBe(-1192169056);
    expect(javaStringHashCode(normalizeFingerprintText("Масса"))).toBe(1034114076);
  });
});

describe("hashQuestionImage", () => {
  it("hashes prompt images exactly like the external provider", () => {
    // Verified against a live syncshare response: anchor ["", hash] pairs.
    expect(hashQuestionImage("https://school.moodledemo.net/pluginfile.php/2354/qtype_match/subquestion/126/4/95/icon3.png", "")).toBe(
      "-1859093350"
    );
    expect(hashQuestionImage("https://school.moodledemo.net/pluginfile.php/2354/qtype_match/subquestion/126/4/97/icon66.png", "")).toBe(
      "1860956741"
    );
    expect(hashQuestionImage("https://school.moodledemo.net/pluginfile.php/2354/qtype_match/subquestion/126/4/96/icon5.png", "")).toBe(
      "1414805592"
    );
    expect(hashQuestionImage("https://school.moodledemo.net/pluginfile.php/2354/qtype_match/subquestion/126/4/99/icon1.png", "")).toBe(
      "-838024996"
    );
    expect(hashQuestionImage("https://school.moodledemo.net/pluginfile.php/2354/qtype_match/subquestion/126/4/98/icon22.png", "")).toBe(
      "-1510145339"
    );
  });
});

describe("levenshteinDistance", () => {
  it("computes edit distances", () => {
    expect(levenshteinDistance("", "")).toBe(0);
    expect(levenshteinDistance("abc", "")).toBe(3);
    expect(levenshteinDistance("kitten", "sitting")).toBe(3);
    expect(levenshteinDistance("Напряжение", "Напряжении")).toBe(1);
  });
});

describe("labelsMatch", () => {
  it("matches labels ignoring Moodle numbering, nbsp and case", () => {
    expect(labelsMatch("Вольт", "Вольт")).toBe(true);
    expect(labelsMatch("1. Вольт", "вольт")).toBe(true);
    expect(labelsMatch("б)\u00a0Напряжение", "Напряжение")).toBe(true);
    expect(labelsMatch("Вольт", "Килограмм")).toBe(false);
    expect(labelsMatch("", "Вольт")).toBe(false);
    expect(labelsMatch("Вольт", "")).toBe(false);
  });

  it("matches image identity labels by basename", () => {
    expect(labelsMatch("image:pluginfile.php/a/b/icon3.png", "image:icon3.png")).toBe(true);
    expect(labelsMatch("image:icon3.png", "image:icon5.png")).toBe(false);
  });

  it("refuses partial matches like the 1991/1992 rules", () => {
    expect(labelsMatch("1991", "1991")).toBe(true);
    expect(labelsMatch("1991", "1992")).toBe(false);
  });
});

describe("findClosestLabel", () => {
  it("matches exact and near-miss labels", () => {
    expect(findClosestLabel("Вольт", ["Килограмм", "Вольт", "ньютон"])?.match).toBe("Вольт");
    expect(findClosestLabel("Напряжении", ["Напряжение", "Масса"])?.match).toBe("Напряжение");
    expect(findClosestLabel("Вольтт", ["Килограмм", "Вольт", "ньютон"])?.match).toBe("Вольт");
  });

  it("refuses ties and distant labels", () => {
    expect(findClosestLabel("abe", ["abc", "abd"])).toBeNull();
    expect(findClosestLabel("Напряжение", ["unmatched force", "unmatched mass"])).toBeNull();
    expect(findClosestLabel("", ["a"])).toBeNull();
    expect(findClosestLabel("a", [])).toBeNull();
  });

  it("requires numeric strings to match exactly", () => {
    expect(findClosestLabel("1991", ["1991"])?.match).toBe("1991");
    expect(findClosestLabel("1991", ["1992"])).toBeNull();
  });
});
