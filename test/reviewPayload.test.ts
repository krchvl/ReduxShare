import { describe, expect, it } from "vitest";
import type { ReviewAnswerPayload, ReviewQuestionPayload } from "../src/content/quizAttempt/model";
import { loadQuestionFixture } from "./helpers/fixtures";
import { getQuizAttemptTestApi } from "./helpers/quizAttemptApi";

type ReviewSaveRequestPayload = {
  domain: string;
  courseId: number | null;
  quizId: number | null;
  attemptKey: string;
  pageUrl: string;
  questions: ReviewQuestionPayload[];
};

function getSavedQuestion(questions: ReviewQuestionPayload[]) {
  expect(questions).toHaveLength(1);
  return questions[0];
}

function getAnswersBySlot(question: ReviewQuestionPayload) {
  return [...question.answers].sort((left, right) => {
    return (left.slotIndex ?? Number.MAX_SAFE_INTEGER) - (right.slotIndex ?? Number.MAX_SAFE_INTEGER);
  });
}

function expectBooleanAnswers(answers: ReviewAnswerPayload[], labels: string[], correctness: number, isCorrect: boolean) {
  expect(answers.map((answer) => answer.label)).toEqual(labels);
  expect(answers.map((answer) => answer.correctness)).toEqual(labels.map(() => correctness));
  expect(answers.map((answer) => answer.isCorrect)).toEqual(labels.map(() => isCorrect));
  expect(answers.map((answer) => answer.wasSelected)).toEqual(labels.map(() => true));
}

describe("Moodle review payload builder", () => {
  it("saves checkbox multichoice open review as exact per-option true/false", async () => {
    const api = await getQuizAttemptTestApi();

    loadQuestionFixture("multichoice", "review-open");

    const question = getSavedQuestion(api.collectReviewQuestionsForSave() as ReviewQuestionPayload[]);
    const answers = getAnswersBySlot(question);

    expect(question.questionId).toBe("1385");
    expect(question.questionType).toBe("multichoice");
    expect(question.questionHash).toBeTruthy();
    expect(answers.map((answer) => answer.slotIndex)).toEqual([1, 2, 3, 4]);
    expect(answers.map((answer) => answer.slotKey)).toEqual([
      "63 percent of the time.",
      "23 percent of the time.",
      "between 10 and 20 percent of the time.",
      "47 percent of the time."
    ]);
    expectBooleanAnswers(answers, ["false", "false", "false", "true"], 2, true);
  });

  it("saves checkbox multichoice hidden review as fallback statistics only", async () => {
    const api = await getQuizAttemptTestApi();

    loadQuestionFixture("multichoice", "review-hidden");

    const question = getSavedQuestion(api.collectReviewQuestionsForSave() as ReviewQuestionPayload[]);
    const answers = getAnswersBySlot(question);

    expect(question.questionId).toBe("1385");
    expect(question.questionType).toBe("multichoice");
    expect(answers.map((answer) => answer.slotIndex)).toEqual([1, 2, 3, 4]);
    expect(answers.map((answer) => answer.slotKey)).toEqual([
      "63 percent of the time.",
      "23 percent of the time.",
      "between 10 and 20 percent of the time.",
      "47 percent of the time."
    ]);
    expectBooleanAnswers(answers, ["false", "false", "false", "true"], 1, false);
  });

  it("keeps multichoice attempt and review hashes aligned for ReduxShare lookup", async () => {
    const api = await getQuizAttemptTestApi();

    loadQuestionFixture("multichoice", "attempt");
    const [attemptSummary] = api.collectQuestionSummaries();

    loadQuestionFixture("multichoice", "review-hidden");
    const [hiddenReviewSummary] = api.collectQuestionSummaries();

    loadQuestionFixture("multichoice", "review-open");
    const [openReviewSummary] = api.collectQuestionSummaries();

    expect(attemptSummary).toMatchObject({
      questionId: "1385",
      questionType: "multichoice",
      questionText: "Research from Harvard shows the mind wanders, on average....."
    });
    expect(hiddenReviewSummary.questionHash).toBe(attemptSummary.questionHash);
    expect(openReviewSummary.questionHash).toBe(attemptSummary.questionHash);
  });

  it("stores incorrect checkbox multichoice selections as red statistics alongside the exact boolean answer", async () => {
    const api = await getQuizAttemptTestApi();

    loadQuestionFixture("multichoice", "review-open");

    const wrongSelected = document.getElementById("q125:1_choice0") as HTMLInputElement;
    const missedCorrect = document.getElementById("q125:1_choice3") as HTMLInputElement;
    wrongSelected.checked = true;
    missedCorrect.checked = false;

    const question = getSavedQuestion(api.collectReviewQuestionsForSave() as ReviewQuestionPayload[]);
    const answers = getAnswersBySlot(question);

    expect(answers).toEqual(
      expect.arrayContaining([
      expect.objectContaining({
        slotKey: "63 percent of the time.",
        label: "false",
        correctness: 2,
        isCorrect: true,
        wasSelected: false
      }),
      expect.objectContaining({
        slotKey: "63 percent of the time.",
        label: "true",
        correctness: 0,
        isCorrect: false,
        wasSelected: true
      }),
      expect.objectContaining({
        slotKey: "47 percent of the time.",
        label: "true",
        correctness: 2,
        isCorrect: true,
        wasSelected: false
      }),
      expect.objectContaining({
        slotKey: "47 percent of the time.",
        label: "false",
        correctness: 0,
        isCorrect: false,
        wasSelected: true
      })
      ])
    );
  });

  it("saves truefalse open review with exact correct answer and incorrect selected answer", async () => {
    const api = await getQuizAttemptTestApi();

    loadQuestionFixture("truefalse", "review-open");

    const question = getSavedQuestion(api.collectReviewQuestionsForSave() as ReviewQuestionPayload[]);

    expect(question.questionId).toBe("3700");
    expect(question.questionType).toBe("truefalse");
    expect(question.answers).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          slotKey: "question",
          label: "False",
          correctness: 2,
          isCorrect: true,
          wasSelected: false
        }),
        expect.objectContaining({
          slotKey: "question",
          label: "True",
          correctness: 0,
          isCorrect: false,
          wasSelected: true
        })
      ])
    );
  });

  it("saves gapselect open review with exact per-slot answers and incorrect selected statistics", async () => {
    const api = await getQuizAttemptTestApi();

    loadQuestionFixture("gapselect", "review-open");

    const question = getSavedQuestion(api.collectReviewQuestionsForSave() as ReviewQuestionPayload[]);
    const answers = getAnswersBySlot(question);

    expect(question.questionId).toBe("3699");
    expect(question.questionType).toBe("gapselect");
    expect(answers).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          slotKey: "slot:1",
          slotIndex: 1,
          label: "фвфывфв",
          correctness: 2,
          isCorrect: true,
          wasSelected: false
        }),
        expect.objectContaining({
          slotKey: "slot:1",
          slotIndex: 1,
          label: "фвфывфы",
          correctness: 0,
          isCorrect: false,
          wasSelected: true
        }),
        expect.objectContaining({
          slotKey: "slot:2",
          slotIndex: 2,
          label: "фвфывфы",
          correctness: 2,
          isCorrect: true,
          wasSelected: false
        }),
        expect.objectContaining({
          slotKey: "slot:2",
          slotIndex: 2,
          label: "фвфывфв",
          correctness: 0,
          isCorrect: false,
          wasSelected: true
        })
      ])
    );
  });

  it("saves gapselect hidden review as unknown per-slot statistics only", async () => {
    const api = await getQuizAttemptTestApi();

    loadQuestionFixture("gapselect", "review-hidden");

    const question = getSavedQuestion(api.collectReviewQuestionsForSave() as ReviewQuestionPayload[]);
    const answers = getAnswersBySlot(question);

    expect(question.questionId).toBe("3699");
    expect(question.questionType).toBe("gapselect");
    expect(answers).toMatchObject([
      {
        slotKey: "slot:1",
        slotIndex: 1,
        label: "фвфывфы",
        correctness: 1,
        isCorrect: false,
        wasSelected: true
      },
      {
        slotKey: "slot:2",
        slotIndex: 2,
        label: "фвфывфв",
        correctness: 1,
        isCorrect: false,
        wasSelected: true
      }
    ]);
  });

  it("prefers Russian right-answer text for shortanswer open review", async () => {
    const api = await getQuizAttemptTestApi();

    loadQuestionFixture("shortanswer", "review-open");

    const question = getSavedQuestion(api.collectReviewQuestionsForSave() as ReviewQuestionPayload[]);

    expect(question.questionId).toBe("2011");
    expect(question.questionType).toBe("shortanswer");
    expect(question.answers).toMatchObject([
      {
        label: "Joseph Stalin",
        correctness: 2,
        isCorrect: true,
        wasSelected: true
      }
    ]);
  });

  it("falls back to saved shortanswer input when review hides correct answers", async () => {
    const api = await getQuizAttemptTestApi();

    loadQuestionFixture("shortanswer", "review-hidden");

    const question = getSavedQuestion(api.collectReviewQuestionsForSave() as ReviewQuestionPayload[]);

    expect(question.questionId).toBe("2011");
    expect(question.questionType).toBe("shortanswer");
    expect(question.answers).toMatchObject([
      {
        label: "Joseph Stalin",
        correctness: 1,
        isCorrect: false,
        wasSelected: true
      }
    ]);
  });

  it("saves calculated rightanswer as exact even when the review state is not answered", async () => {
    const api = await getQuizAttemptTestApi();

    loadQuestionFixture("calculated", "review-open");

    const question = getSavedQuestion(api.collectReviewQuestionsForSave() as ReviewQuestionPayload[]);

    expect(question.questionId).toBe("3699");
    expect(question.questionType).toBe("calculated");
    expect(question.questionHash).toBeTruthy();
    expect(question.answers).toMatchObject([
      {
        label: "20.10",
        correctness: 2,
        isCorrect: true,
        wasSelected: false
      }
    ]);
  });

  it("keeps calculated attempt and review hashes aligned for ReduxShare lookup", async () => {
    const api = await getQuizAttemptTestApi();

    loadQuestionFixture("calculated", "attempt");
    const [attemptSummary] = api.collectQuestionSummaries();

    loadQuestionFixture("calculated", "review-open");
    const [reviewSummary] = api.collectQuestionSummaries();

    expect(attemptSummary).toMatchObject({
      questionId: "3699",
      questionType: "calculated",
      questionText: "Найдите площадь прямоугольника со сторонами 3 и 6.7."
    });
    expect(reviewSummary.questionHash).toBe(attemptSummary.questionHash);
  });

  it("builds a calculated Supabase save payload with courseId from M.cfg and quizId from review URL", async () => {
    const api = await getQuizAttemptTestApi();

    window.history.pushState({}, "", "/mod/quiz/review.php?attempt=94&cmid=1150");
    loadQuestionFixture("calculated", "review-open");

    const script = document.createElement("script");
    script.textContent = 'M.cfg = {"courseId":2};';
    document.body.append(script);

    const payload = api.buildReviewSaveRequestPayload(undefined) as ReviewSaveRequestPayload | null;

    expect(payload).toMatchObject({
      domain: "localhost",
      courseId: 2,
      quizId: 1150,
      attemptKey: "attempt:94|cmid:1150",
      pageUrl: "http://localhost:3000/mod/quiz/review.php?attempt=94&cmid=1150"
    });
    expect(payload?.questions).toHaveLength(1);
    expect(payload?.questions[0]).toMatchObject({
      questionId: "3699",
      questionType: "calculated",
      answers: [
        {
          label: "20.10",
          correctness: 2,
          isCorrect: true,
          wasSelected: false
        }
      ]
    });
  });

  it("saves match open review by prompt label, not shuffled row order", async () => {
    const api = await getQuizAttemptTestApi();

    loadQuestionFixture("match", "review-open");

    const question = getSavedQuestion(api.collectReviewQuestionsForSave() as ReviewQuestionPayload[]);
    const bySlotAndLabel = [...question.answers].sort((left, right) => {
      return `${left.slotKey}:${left.label}`.localeCompare(`${right.slotKey}:${right.label}`);
    });

    expect(question.questionId).toBe("3699");
    expect(question.questionType).toBe("match");
    expect(bySlotAndLabel).toMatchObject([
      {
        slotKey: "Масса",
        label: "Килограмм",
        correctness: 2,
        isCorrect: true,
        wasSelected: true
      },
      {
        slotKey: "Напряжение",
        label: "Вольт",
        correctness: 2,
        isCorrect: true,
        wasSelected: false
      },
      {
        slotKey: "Напряжение",
        label: "Килограмм",
        correctness: 0,
        isCorrect: false,
        wasSelected: true
      },
      {
        slotKey: "сила",
        label: "Вольт",
        correctness: 0,
        isCorrect: false,
        wasSelected: true
      },
      {
        slotKey: "сила",
        label: "ньютон",
        correctness: 2,
        isCorrect: true,
        wasSelected: false
      }
    ]);
  });

  it("saves match hidden review as prompt-scoped fallback statistics only", async () => {
    const api = await getQuizAttemptTestApi();

    loadQuestionFixture("match", "review-hidden");

    const question = getSavedQuestion(api.collectReviewQuestionsForSave() as ReviewQuestionPayload[]);
    const bySlot = [...question.answers].sort((left, right) => left.slotKey.localeCompare(right.slotKey));

    expect(question.questionType).toBe("match");
    expect(bySlot).toMatchObject([
      {
        slotKey: "Масса",
        label: "ньютон",
        correctness: 1,
        isCorrect: false,
        wasSelected: true
      },
      {
        slotKey: "Напряжение",
        label: "Вольт",
        correctness: 1,
        isCorrect: false,
        wasSelected: true
      },
      {
        slotKey: "сила",
        label: "Килограмм",
        correctness: 1,
        isCorrect: false,
        wasSelected: true
      }
    ]);
  });

  it("keeps match attempt and shuffled review hashes aligned", async () => {
    const api = await getQuizAttemptTestApi();

    loadQuestionFixture("match", "attempt");
    const [attemptSummary] = api.collectQuestionSummaries();

    loadQuestionFixture("match", "review-open");
    const [reviewSummary] = api.collectQuestionSummaries();

    expect(attemptSummary).toMatchObject({
      questionId: "3699",
      questionType: "match",
      questionText: "Сопоставьте физическую величину с её единицей измерения."
    });
    expect(attemptSummary.answerLabels).toEqual(expect.arrayContaining(["Напряжение", "Масса", "сила", "Килограмм", "Вольт", "ньютон"]));
    expect(reviewSummary.questionHash).toBe(attemptSummary.questionHash);
  });

  it("saves randomsamatch open review by prompt label", async () => {
    const api = await getQuizAttemptTestApi();

    loadQuestionFixture("randomsamatch", "review-open");

    const question = getSavedQuestion(api.collectReviewQuestionsForSave() as ReviewQuestionPayload[]);
    const bySlotKey = [...question.answers].sort((left, right) => left.slotKey.localeCompare(right.slotKey));

    expect(question.questionId).toBe("3700");
    expect(question.questionType).toBe("randomsamatch");
    expect(bySlotKey).toMatchObject([
      {
        slotKey: "Как называется внутренняя жидкая среда клетки?",
        label: "цитоплазма",
        correctness: 2,
        isCorrect: true,
        wasSelected: false
      },
      {
        slotKey: "Какой органоид хранит наследственную информацию?",
        label: "ядро",
        correctness: 2,
        isCorrect: true,
        wasSelected: false
      }
    ]);
  });

  it("saves randomsamatch hidden review as prompt-scoped fallback statistics only", async () => {
    const api = await getQuizAttemptTestApi();

    loadQuestionFixture("randomsamatch", "review-hidden");

    const question = getSavedQuestion(api.collectReviewQuestionsForSave() as ReviewQuestionPayload[]);
    const bySlotKey = [...question.answers].sort((left, right) => left.slotKey.localeCompare(right.slotKey));

    expect(question.questionType).toBe("randomsamatch");
    expect(bySlotKey).toMatchObject([
      {
        slotKey: "Как называется внутренняя жидкая среда клетки?",
        label: "цитоплазма",
        correctness: 1,
        isCorrect: false,
        wasSelected: true
      },
      {
        slotKey: "Какой органоид хранит наследственную информацию?",
        label: "ядро",
        correctness: 1,
        isCorrect: false,
        wasSelected: true
      }
    ]);
  });

  it("keeps randomsamatch attempt and shuffled review hashes aligned", async () => {
    const api = await getQuizAttemptTestApi();

    loadQuestionFixture("randomsamatch", "attempt");
    const [attemptSummary] = api.collectQuestionSummaries();

    loadQuestionFixture("randomsamatch", "review-hidden");
    const [hiddenReviewSummary] = api.collectQuestionSummaries();

    loadQuestionFixture("randomsamatch", "review-open");
    const [openReviewSummary] = api.collectQuestionSummaries();

    expect(attemptSummary).toMatchObject({
      questionId: "3700",
      questionType: "randomsamatch",
      questionText: "Random short-answer matching"
    });
    expect(attemptSummary.answerLabels).toEqual(
      expect.arrayContaining([
        "Как называется внутренняя жидкая среда клетки?",
        "Какой органоид хранит наследственную информацию?",
        "ядро",
        "цитоплазма"
      ])
    );
    expect(hiddenReviewSummary.questionHash).toBe(attemptSummary.questionHash);
    expect(openReviewSummary.questionHash).toBe(attemptSummary.questionHash);
  });

  it("saves multianswer open review from per-subquestion feedback as exact slots", async () => {
    const api = await getQuizAttemptTestApi();

    loadQuestionFixture("multianswer", "review-open");

    const question = getSavedQuestion(api.collectReviewQuestionsForSave() as ReviewQuestionPayload[]);
    const answers = getAnswersBySlot(question);

    expect(question.questionId).toBe("3700");
    expect(question.questionType).toBe("multianswer");
    expect(answers).toMatchObject([
      {
        slotIndex: 1,
        slotKey: "slot:1",
        label: "цитоплазма",
        correctness: 2,
        isCorrect: true,
        wasSelected: true
      },
      {
        slotIndex: 2,
        slotKey: "slot:2",
        label: "ядро",
        correctness: 2,
        isCorrect: true,
        wasSelected: true
      },
      {
        slotIndex: 3,
        slotKey: "slot:3",
        label: "40",
        correctness: 2,
        isCorrect: true,
        wasSelected: true
      }
    ]);
  });

  it("saves multianswer hidden review as slot-scoped fallback statistics only", async () => {
    const api = await getQuizAttemptTestApi();

    loadQuestionFixture("multianswer", "review-hidden");

    const question = getSavedQuestion(api.collectReviewQuestionsForSave() as ReviewQuestionPayload[]);
    const answers = getAnswersBySlot(question);

    expect(question.questionType).toBe("multianswer");
    expect(answers).toMatchObject([
      {
        slotIndex: 1,
        slotKey: "slot:1",
        label: "ada",
        correctness: 1,
        isCorrect: false,
        wasSelected: true
      },
      {
        slotIndex: 2,
        slotKey: "slot:2",
        label: "митохондрия",
        correctness: 1,
        isCorrect: false,
        wasSelected: true
      },
      {
        slotIndex: 3,
        slotKey: "slot:3",
        label: "12",
        correctness: 1,
        isCorrect: false,
        wasSelected: true
      }
    ]);
  });

  it("keeps multianswer attempt and review hashes aligned", async () => {
    const api = await getQuizAttemptTestApi();

    loadQuestionFixture("multianswer", "attempt");
    const [attemptSummary] = api.collectQuestionSummaries();

    loadQuestionFixture("multianswer", "review-open");
    const [reviewSummary] = api.collectQuestionSummaries();

    expect(attemptSummary).toMatchObject({
      questionId: "3700",
      questionType: "multianswer",
      questionText:
        "Заполните пропуски. Клеточная мембрана отделяет содержимое клетки от внешней среды. Основная жидкая внутренняя среда клетки называется . Органоид, отвечающий за хранение наследственной информации, называется . Если длина клетки на схеме равна 8 см, а ширина 5 см, то площадь условного прямоугольника равна см²."
    });
    expect(attemptSummary.answerLabels).toEqual(expect.arrayContaining(["ядро", "митохондрия", "рибосома", "мембрана"]));
    expect(reviewSummary.questionHash).toBe(attemptSummary.questionHash);
  });

  it("saves ordering open review as exact positions when Moodle marks the answer correct", async () => {
    const api = await getQuizAttemptTestApi();

    loadQuestionFixture("ordering", "review-open");

    const question = getSavedQuestion(api.collectReviewQuestionsForSave() as ReviewQuestionPayload[]);
    const answers = getAnswersBySlot(question);

    expect(question.questionId).toBe("3698");
    expect(question.questionType).toBe("ordering");
    expect(question.questionHash).toBeTruthy();
    expect(answers).toMatchObject([
      {
        slotKey: "position:1",
        slotIndex: 1,
        label: "asdas",
        correctness: 2,
        isCorrect: true,
        wasSelected: true
      },
      {
        slotKey: "position:2",
        slotIndex: 2,
        label: "asdsa",
        correctness: 2,
        isCorrect: true,
        wasSelected: true
      },
      {
        slotKey: "position:3",
        slotIndex: 3,
        label: "adaa",
        correctness: 2,
        isCorrect: true,
        wasSelected: true
      }
    ]);
  });

  it("saves ordering hidden review as unknown statistics when correct answers are not revealed", async () => {
    const api = await getQuizAttemptTestApi();

    loadQuestionFixture("ordering", "review-hidden");

    const question = getSavedQuestion(api.collectReviewQuestionsForSave() as ReviewQuestionPayload[]);
    const answers = getAnswersBySlot(question);

    expect(question.questionId).toBe("3698");
    expect(question.questionType).toBe("ordering");
    expect(answers).toMatchObject([
      {
        slotKey: "position:1",
        slotIndex: 1,
        label: "asdsa",
        correctness: 1,
        isCorrect: false,
        wasSelected: true
      },
      {
        slotKey: "position:2",
        slotIndex: 2,
        label: "asdas",
        correctness: 1,
        isCorrect: false,
        wasSelected: true
      },
      {
        slotKey: "position:3",
        slotIndex: 3,
        label: "adaa",
        correctness: 1,
        isCorrect: false,
        wasSelected: true
      }
    ]);
  });

  it("keeps ordering attempt and review hashes aligned", async () => {
    const api = await getQuizAttemptTestApi();

    loadQuestionFixture("ordering", "attempt");
    const [attemptSummary] = api.collectQuestionSummaries();

    loadQuestionFixture("ordering", "review-hidden");
    const [hiddenReviewSummary] = api.collectQuestionSummaries();

    loadQuestionFixture("ordering", "review-open");
    const [openReviewSummary] = api.collectQuestionSummaries();

    expect(attemptSummary).toMatchObject({
      questionId: "3698",
      questionType: "ordering",
      questionText: "dsadasd {{1}} adad {{2}} aaa {{3}}"
    });
    expect(attemptSummary.answerLabels).toEqual(["asdas", "asdsa", "adaa"]);
    expect(hiddenReviewSummary.questionHash).toBe(attemptSummary.questionHash);
    expect(openReviewSummary.questionHash).toBe(attemptSummary.questionHash);
  });
});
