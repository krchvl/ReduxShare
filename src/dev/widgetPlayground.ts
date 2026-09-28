// Dev-only playground: живёт только под `npm run dev` на /dev.html.
// Ставит мок chrome API до импорта content-скрипта, подкладывает Moodle-фикстуры
// и мок-ответы с голосами, затем монтирует R-виджеты через test API quizAttempt
// и панель предпросмотра через initializeQuizPreviewFeatures (вью-фикстура ниже).
import multichoiceAttemptHtml from "../../test/fixtures/multichoice/attempt.html?raw";
import matchAttemptHtml from "../../test/fixtures/match/attempt.html?raw";
import shortanswerAttemptHtml from "../../test/fixtures/shortanswer/attempt.html?raw";
import essayAttemptHtml from "../../test/fixtures/essay/attempt.html?raw";
import { APP_STORAGE_KEY } from "../shared/storageKeys";
import {
  FETCH_ESSAY_EXAMPLES_MESSAGE,
  FETCH_QUIZ_PREVIEW_MESSAGE,
  GENERATE_AI_ANSWER_MESSAGE,
  SAVE_ESSAY_EXAMPLE_MESSAGE,
  SAVE_USER_ANSWER_MESSAGE,
  VOTE_ANSWER_MESSAGE,
  VOTE_ESSAY_EXAMPLE_MESSAGE,
} from "../shared/messages";
import type {
  AnswerData,
  EssayExampleEntry,
  QuizPreviewQuestion,
  StoredStateLike,
  SubmissionItem,
} from "../model";
import { essayExamplesByQuestionId } from "../state";

interface QuizAttemptPlaygroundApi {
  setStoredState: (state: StoredStateLike | undefined) => void;
  setSourceAnswerData: (
    questionId: string | null,
    source: "reduxshare" | "external",
    data: AnswerData,
  ) => void;
  mountAnswerWidgets: (accentColor: string) => void;
}

interface VoteTally {
  up: number;
  down: number;
  mine: 1 | -1 | 0;
}

(window as unknown as { __REDUXSHARE_TEST_MODE__?: boolean }).__REDUXSHARE_TEST_MODE__ = true;

const voteTallies = new Map<string, VoteTally>();

function seedVoteTally(taskId: string, up: number, down: number, mine: 1 | -1 | 0) {
  voteTallies.set(taskId, { up, down, mine });
}

// Голоса по общему реестру: ключом служит и id варианта, и id примера эссе.
function applyVoteTally(key: string, value: 1 | -1) {
  const tally = voteTallies.get(key) ?? { up: 0, down: 0, mine: 0 as 1 | -1 | 0 };
  let { up, down, mine } = tally;

  if (mine === 0) {
    if (value === 1) {
      up += 1;
    } else {
      down += 1;
    }
    mine = value;
  } else if (mine === value) {
    if (value === 1) {
      up -= 1;
    } else {
      down -= 1;
    }
    mine = 0;
  } else if (value === 1) {
    up += 1;
    down -= 1;
    mine = value;
  } else {
    down += 1;
    up -= 1;
    mine = value;
  }

  voteTallies.set(key, { up, down, mine });

  return { ok: true, votesUp: Math.max(up, 0), votesDown: Math.max(down, 0), myVote: mine };
}

function handleMockVote(payload: { taskId?: unknown; value?: unknown }) {
  const taskId = typeof payload?.taskId === "string" ? payload.taskId : null;
  const value = payload?.value === -1 ? -1 : 1;

  if (!taskId) {
    return { ok: false, error: "taskId missing" };
  }

  return applyVoteTally(taskId, value);
}

// Ин-мемори база примеров эссе для плейграунда.
const essayExamplesStore: EssayExampleEntry[] = [];
let essayExampleIdSeq = 1;

function seedEssayExample(questionId: string, overrides: Partial<EssayExampleEntry> = {}) {
  const id = `essay-${essayExampleIdSeq}`;
  essayExampleIdSeq += 1;
  essayExamplesStore.push({
    exampleId: id,
    questionId,
    questionHash: "hash-essay",
    body: "",
    authorName: "dev",
    createdAt: "2026-09-20T10:00:00.000Z",
    updatedAt: "2026-09-25T10:00:00.000Z",
    votesUp: 0,
    votesDown: 0,
    myVote: 0,
    ...overrides,
  });
  return id;
}

function sortEssayExamplesForPlayground(items: EssayExampleEntry[]) {
  return [...items].sort((a, b) => {
    const netDiff = b.votesUp - b.votesDown - (a.votesUp - a.votesDown);
    return netDiff !== 0 ? netDiff : b.updatedAt.localeCompare(a.updatedAt);
  });
}

function handleMockFetchEssayExamples(payload: { questions?: Array<{ questionId?: unknown }> }) {
  const questions = Array.isArray(payload?.questions) ? payload.questions : [];

  return {
    ok: true,
    results: questions.map((question) => {
      const questionId = typeof question?.questionId === "string" ? question.questionId : null;

      return {
        questionId,
        questionHash: null,
        ok: true,
        examples: sortEssayExamplesForPlayground(
          essayExamplesStore.filter((item) => item.questionId === questionId),
        ),
      };
    }),
  };
}

function handleMockSaveEssayExample(payload: {
  questionId?: unknown;
  questionHash?: unknown;
  questionText?: unknown;
  body?: unknown;
}) {
  const body = typeof payload?.body === "string" ? payload.body.trim() : "";

  if (!body) {
    return { ok: false, error: "Ответ пустой" };
  }

  const questionId = typeof payload?.questionId === "string" ? payload.questionId : "";
  const own = essayExamplesStore.find(
    (item) => item.exampleId === "essay-own" && item.questionId === questionId,
  );
  const updatedAt = new Date().toISOString();

  if (own) {
    own.body = body;
    own.updatedAt = updatedAt;

    return { ok: true, example: own };
  }

  const example: EssayExampleEntry = {
    exampleId: "essay-own",
    questionId,
    questionHash: typeof payload?.questionHash === "string" ? payload.questionHash : "",
    body,
    authorName: "you",
    createdAt: updatedAt,
    updatedAt,
    votesUp: 0,
    votesDown: 0,
    myVote: 0,
  };
  essayExamplesStore.push(example);

  return { ok: true, example };
}

function handleMockEssayVote(payload: { exampleId?: unknown; value?: unknown }) {
  const exampleId = typeof payload?.exampleId === "string" ? payload.exampleId : null;
  const value = payload?.value === -1 ? -1 : 1;

  if (!exampleId) {
    return { ok: false, error: "exampleId missing" };
  }

  return applyVoteTally(`essay:${exampleId}`, value);
}

function handleMockMessage(message: unknown): unknown {
  const record = (message ?? {}) as { type?: string; payload?: Record<string, unknown> };

  if (record.type === VOTE_ANSWER_MESSAGE) {
    return handleMockVote(record.payload as { taskId: string; value: 1 | -1 });
  }

  if (record.type === FETCH_ESSAY_EXAMPLES_MESSAGE) {
    return handleMockFetchEssayExamples(
      record.payload as { questions?: Array<{ questionId?: unknown }> },
    );
  }

  if (record.type === SAVE_ESSAY_EXAMPLE_MESSAGE) {
    return handleMockSaveEssayExample(
      record.payload as {
        questionId?: unknown;
        questionHash?: unknown;
        questionText?: unknown;
        body?: unknown;
      },
    );
  }

  if (record.type === SAVE_USER_ANSWER_MESSAGE) {
    const answers = (record.payload as { question?: { answers?: unknown[] } } | undefined)?.question
      ?.answers;

    return { ok: true, imported: false, savedCount: Array.isArray(answers) ? answers.length : 0 };
  }

  if (record.type === VOTE_ESSAY_EXAMPLE_MESSAGE) {
    return handleMockEssayVote(record.payload as { exampleId: string; value: 1 | -1 });
  }

  if (record.type === FETCH_QUIZ_PREVIEW_MESSAGE) {
    return { ok: true, authRequired: false, questions: buildQuizPreviewQuestions() };
  }

  if (record.type === GENERATE_AI_ANSWER_MESSAGE) {
    const mode = (record.payload as { mode?: string } | undefined)?.mode;

    if (mode === "explain") {
      return {
        ok: true,
        answer:
          "Вопрос спрашивает, что верно для процента. 63% — единственный вариант, который\nсоответствует данным диаграммы: остальные значения дают другие доли.",
        confidence: 0,
        actions: [],
      };
    }

    return {
      ok: true,
      answer: "63 percent of the time.",
      confidence: 92,
      actions: [{ label: "63 percent of the time." }],
    };
  }

  return { ok: true };
}

function installChromeMock() {
  const storageData = new Map<string, unknown>();
  const storageListeners = new Set<(changes: unknown, areaName: string) => void>();

  (window as unknown as { chrome: unknown }).chrome = {
    runtime: {
      id: "reduxshare-dev-playground",
      lastError: null,
      sendMessage: (message: unknown, callback?: (response: unknown) => void) => {
        callback?.(handleMockMessage(message));
      },
      getURL: (path: string) => path,
      onMessage: { addListener: () => undefined },
      onInstalled: { addListener: () => undefined },
      onStartup: { addListener: () => undefined },
    },
    storage: {
      local: {
        get: async (key: string) => ({ [key]: storageData.get(key) }),
        set: async (items: Record<string, unknown>) => {
          for (const [key, value] of Object.entries(items)) {
            storageData.set(key, value);
          }

          for (const listener of storageListeners) {
            listener(
              { [APP_STORAGE_KEY]: { newValue: storageData.get(APP_STORAGE_KEY) } },
              "local",
            );
          }
        },
        remove: async (key: string) => {
          storageData.delete(key);
        },
      },
      onChanged: {
        addListener: (listener: (changes: unknown, areaName: string) => void) => {
          storageListeners.add(listener);
        },
        removeListener: (listener: (changes: unknown, areaName: string) => void) => {
          storageListeners.delete(listener);
        },
      },
    },
    alarms: {
      get: () => undefined,
      create: () => undefined,
      clear: async () => true,
      onAlarm: { addListener: () => undefined },
    },
    i18n: { getUILanguage: () => "ru" },
  };
}

function buildStoredState(): StoredStateLike {
  return {
    settings: {
      extensionEnabled: true,
      stealthMode: false,
      copyUnlock: false,
      autoSelect: false,
      language: "ru",
      accentColor: "#9cb9f6",
      colorScheme: "dark",
      ai: {
        provider: "google",
        model: "gemini-2.5-flash",
        apiKey: "dev-key",
        connectionVerified: true,
        verifiedAt: null,
        customEndpoint: "",
        customModelName: "",
      },
    },
    authSession: {
      accessToken: "dev-token",
      refreshToken: "dev-token",
      expiresAt: null,
      user: { id: "dev-user", email: "dev@localhost" },
    },
  } as StoredStateLike;
}

function multichoiceAnswerData(): AnswerData {
  seedVoteTally("mc-47", 2, 3, 1);
  seedVoteTally("mc-23", 4, 1, 0);

  return {
    anchors: [],
    suggestions: [
      {
        correctness: 2,
        confidence: 0.87,
        label: "63 percent of the time.",
      },
    ],
    submissions: [
      {
        correctness: 2,
        count: 12,
        label: "63 percent of the time.",
        contributor: "maria",
        addedAt: "2026-09-20T10:00:00.000Z",
        updatedAt: "2026-09-25T10:00:00.000Z",
      },
      {
        correctness: 1,
        count: 4,
        label: "47 percent of the time.",
        taskId: "mc-47",
        votesUp: 2,
        votesDown: 3,
        myVote: 1,
      },
      {
        correctness: 1,
        count: 2,
        label: "23 percent of the time.",
        taskId: "mc-23",
        votesUp: 4,
        votesDown: 1,
        myVote: 0,
      },
    ],
    slots: [],
  };
}

function multichoiceExternalAnswerData(): AnswerData {
  return {
    anchors: [],
    suggestions: [
      { correctness: 2, confidence: 1, label: "between 10 and 20 percent of the time." },
    ],
    submissions: [],
    slots: [],
  };
}

function matchAnswerData(): AnswerData {
  seedVoteTally("m-voltage", 6, 0, 0);
  seedVoteTally("m-mass", 3, 3, 0);
  seedVoteTally("m-force", 1, 0, -1);

  const slots: Array<{
    index: number;
    hasExplicitIndex: boolean;
    anchors: string[];
    suggestions: never[];
    submissions: SubmissionItem[];
  }> = [
    {
      index: 1,
      hasExplicitIndex: true,
      anchors: ["Напряжение"],
      suggestions: [],
      submissions: [
        {
          correctness: 1,
          count: 7,
          label: "Вольт",
          taskId: "m-voltage",
          votesUp: 6,
          votesDown: 0,
          myVote: 0,
        },
      ],
    },
    {
      index: 2,
      hasExplicitIndex: true,
      anchors: ["Масса"],
      suggestions: [],
      submissions: [
        {
          correctness: 1,
          count: 5,
          label: "Килограмм",
          taskId: "m-mass",
          votesUp: 3,
          votesDown: 3,
          myVote: 0,
        },
      ],
    },
    {
      index: 3,
      hasExplicitIndex: true,
      anchors: ["сила"],
      suggestions: [],
      submissions: [
        {
          correctness: 1,
          count: 4,
          label: "ньютон",
          taskId: "m-force",
          votesUp: 1,
          votesDown: 0,
          myVote: -1,
        },
      ],
    },
  ];

  return {
    anchors: slots.flatMap((slot) => slot.anchors),
    suggestions: [],
    submissions: slots.flatMap((slot) => slot.submissions),
    slots,
  };
}

function shortanswerAnswerData(): AnswerData {
  seedVoteTally("sa-lenin", 0, 2, 0);

  return {
    anchors: [],
    suggestions: [
      {
        correctness: 2,
        confidence: 0.95,
        label: "Сталин",
      },
    ],
    submissions: [
      {
        correctness: 2,
        count: 9,
        label: "Сталин",
      },
      {
        correctness: 1,
        count: 2,
        label: "Ленин",
        taskId: "sa-lenin",
        votesUp: 0,
        votesDown: 2,
        myVote: 0,
      },
    ],
    slots: [],
  };
}

function seedEssayExamples() {
  const topId = seedEssayExample("2101", {
    body:
      "Октябрьская революция произошла из-за кризиса Временного правительства: " +
      "оно не решило вопросы о земле и мире, а большевики предложили простые лозунги, " +
      "поддержанные солдатами и рабочими.",
    authorName: "maria",
    votesUp: 4,
    votesDown: 1,
  });
  seedVoteTally(`essay:${topId}`, 4, 1, 0);

  const dubiousId = seedEssayExample("2101", {
    body: "Революция случилась просто потому, что так было угодно народу.",
    authorName: "guest",
    votesUp: 0,
    votesDown: 3,
  });
  seedVoteTally(`essay:${dubiousId}`, 0, 3, 0);
}

function emptyAnswerData(): AnswerData {
  return { anchors: [], suggestions: [], submissions: [], slots: [] };
}

function buildQuizPreviewQuestions(): QuizPreviewQuestion[] {
  return [
    {
      questionId: "1385",
      questionType: "multichoice",
      questionHash: "hash-1385",
      questionText: "Какой процент времени проект занимает в действительности?",
      answerOptions: [
        "63 percent of the time.",
        "47 percent of the time.",
        "23 percent of the time.",
      ],
      reduxshare: multichoiceAnswerData(),
      external: multichoiceExternalAnswerData(),
    },
    {
      questionId: "3699",
      questionType: "match",
      questionHash: "hash-3699",
      questionText: "Сопоставьте физические величины и их единицы измерения.",
      answerOptions: ["Вольт", "Килограмм", "ньютон"],
      reduxshare: matchAnswerData(),
      external: emptyAnswerData(),
    },
    {
      questionId: "2011",
      questionType: "shortanswer",
      questionHash: null,
      questionText: null,
      answerOptions: [],
      reduxshare: shortanswerAnswerData(),
      external: emptyAnswerData(),
    },
  ];
}

const VIEW_PAGE_FIXTURE = `
  <section class="dev-view-page">
    <div class="page-header-headings"><h1>Итоговый тест по математике</h1></div>
    <div class="dev-course-nav"><a href="/course/view.php?id=66">Курс физики</a></div>
    <div class="tertiary-navigation">
      <div class="d-flex">
        <div class="navitem">
          <div class="singlebutton quizstartbuttondiv">
            <form method="post" action="/mod/quiz/startattempt.php">
              <input type="hidden" name="cmid" value="789" />
              <button type="submit" class="btn btn-primary">Начать попытку</button>
            </form>
          </div>
        </div>
      </div>
    </div>
  </section>
`;

function injectViewPageFixture() {
  const host = document.createElement("section");
  host.id = "reduxshare-dev-view-page";
  host.innerHTML = VIEW_PAGE_FIXTURE;
  document.body.append(host);

  const moodleConfigScript = document.createElement("script");
  moodleConfigScript.textContent = 'M.cfg = {"courseId":66,"contextInstanceId":789};';
  document.body.append(moodleConfigScript);
}

function injectFixtures() {
  const host = document.getElementById("reduxshare-dev-questions");

  if (host) {
    host.innerHTML = [
      multichoiceAttemptHtml,
      matchAttemptHtml,
      shortanswerAttemptHtml,
      essayAttemptHtml,
    ].join("");
  }
}

async function boot() {
  installChromeMock();
  injectFixtures();
  injectViewPageFixture();
  seedEssayExamples();

  await chrome.storage.local.set({ [APP_STORAGE_KEY]: buildStoredState() });

  await import("../content/quizAttempt");

  const api = (
    globalThis as unknown as { __reduxshareQuizAttemptTestApi?: QuizAttemptPlaygroundApi }
  ).__reduxshareQuizAttemptTestApi;

  if (!api) {
    throw new Error("ReduxShare quizAttempt test API was not installed.");
  }

  api.setStoredState(buildStoredState());
  api.setSourceAnswerData("1385", "reduxshare", multichoiceAnswerData());
  api.setSourceAnswerData("1385", "external", multichoiceExternalAnswerData());
  api.setSourceAnswerData("3699", "reduxshare", matchAnswerData());
  api.setSourceAnswerData("2011", "reduxshare", shortanswerAnswerData());
  api.mountAnswerWidgets("#9cb9f6");

  // loadQuizAnswers в плейграунде не вызывается — сеем примеры в карту напрямую.
  essayExamplesByQuestionId.set(
    "2101",
    sortEssayExamplesForPlayground(essayExamplesStore.filter((item) => item.questionId === "2101")),
  );

  const { initializeQuizPreviewFeatures } = await import("../content/quizPreview");
  await initializeQuizPreviewFeatures();
}

void boot();
