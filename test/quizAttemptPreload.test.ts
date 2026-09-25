import { describe, expect, it, vi } from "vitest";
import {
  buildExternalAnswerUrl,
  buildVariantsUrl,
  fetchExternalAnswer
} from "../src/lib/externalProvider";
import { getQuizQuestionStubs } from "../src/lib/quizQuestionRegistry";
import { preloadQuizQuestions } from "../src/lib/quizAttemptPreload";

function stubFetch(impl: (url: string, init?: RequestInit) => Promise<Response>) {
  // NB: no unstub in afterEach — setup.ts provides a global chrome mock that
  // unstubAllGlobals would destroy, and every fetch-using test stubs its own
  // implementation below. Test files run in isolated environments.
  vi.stubGlobal("fetch", vi.fn(impl));
}

describe("buildExternalAnswerUrl", () => {
  it("targets the same solution endpoint as the variants flow", () => {
    const question = { questionId: "1349", questionType: "match", questionHash: "hash" };
    const answerUrl = new URL(buildExternalAnswerUrl("school.moodledemo.net", 66, 789, question, "ru"));
    const variantsUrl = new URL(
      buildVariantsUrl(
        { domain: "school.moodledemo.net", courseId: 66, quizId: 789, questions: [] },
        question
      )
    );

    // The preload bruteforce must hit the live solution endpoint, not a stale host.
    expect(`${answerUrl.origin}${answerUrl.pathname}`).toBe(
      `${variantsUrl.origin}${variantsUrl.pathname}`
    );
    expect(answerUrl.searchParams.get("questionId")).toBe("1349");
    expect(answerUrl.searchParams.get("questionType")).toBe("match");
  });
});

describe("fetchExternalAnswer", () => {
  it("treats a non-empty payload as a hit", async () => {
    stubFetch(async () => new Response(JSON.stringify([{ anchor: ["", "1"] }]), { status: 200 }));

    const result = await fetchExternalAnswer(
      { questionId: "1349", questionType: "match", questionHash: null },
      "school.moodledemo.net",
      66,
      789,
      "en"
    );

    expect(result.ok).toBe(true);
    expect(result.data).toEqual([{ anchor: ["", "1"] }]);
  });

  it("treats empty arrays as a miss so probing continues", async () => {
    stubFetch(async () => new Response("[]", { status: 200 }));

    const result = await fetchExternalAnswer(
      { questionId: "1349", questionType: "multichoice", questionHash: null },
      "school.moodledemo.net",
      66,
      789,
      "en"
    );

    expect(result.ok).toBe(true);
    expect(result.data).toEqual([]);
  });
});

describe("preloadQuizQuestions", () => {
  it("records only questions with a confirmed hit so misses are retried", async () => {
    const requested: Array<{ questionId: string | null; questionType: string | null }> = [];
    stubFetch(async (url: string) => {
      const parsed = new URL(url);
      const questionId = parsed.searchParams.get("questionId");
      const questionType = parsed.searchParams.get("questionType");
      requested.push({ questionId, questionType });
      const rows = questionId === "q2" && questionType === "match" ? [{ anchor: ["", "h"] }] : [];
      return new Response(JSON.stringify(rows), { status: 200 });
    });

    const payload = {
      domain: "preload-retry.example",
      courseId: 11,
      quizId: 22,
      questions: [
        { questionId: "q1", questionType: null, questionHash: null },
        { questionId: "q2", questionType: null, questionHash: null }
      ]
    };

    const first = await preloadQuizQuestions(payload, "en");
    expect(first).toMatchObject({ ok: true, found: 1, total: 2 });

    const stubs = await getQuizQuestionStubs("preload-retry.example", 11, 22);
    expect(stubs.map((stub) => stub.questionId)).toEqual(["q2"]);

    const probesBefore = requested.length;
    const second = await preloadQuizQuestions(payload, "en");
    expect(second).toMatchObject({ ok: true, found: 0, total: 2 });
    // The miss is probed again instead of being treated as cached knowledge.
    expect(requested.length).toBeGreaterThan(probesBefore);
    expect(requested.slice(probesBefore).every((entry) => entry.questionId === "q1")).toBe(true);
  });
});
