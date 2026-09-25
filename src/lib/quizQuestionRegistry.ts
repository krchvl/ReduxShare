import type { ExternalQuestionRequest } from "./externalProvider";

export interface QuizQuestionStub {
  questionId: string;
  questionType: string | null;
  questionHash: string | null;
  questionText?: string | null;
  updatedAt: string;
}

const REGISTRY_STORAGE_PREFIX = "reduxshare_quiz_questions";
const REGISTRY_MAX_QUESTIONS_PER_QUIZ = 500;

function getRegistryStorageKey(domain: string, courseId: number, quizId: number) {
  return `${REGISTRY_STORAGE_PREFIX}:${domain}:${courseId}:${quizId}`;
}

export async function recordQuizQuestions(
  domain: string,
  courseId: number | null,
  quizId: number | null,
  questions: Array<ExternalQuestionRequest & { questionText?: string | null }>,
) {
  if (courseId === null || quizId === null) {
    return;
  }

  const now = new Date().toISOString();
  const incoming = new Map<string, QuizQuestionStub>();

  for (const question of questions) {
    const questionId = question.questionId?.trim();

    if (!questionId) {
      continue;
    }

    incoming.set(questionId, {
      questionId,
      questionType: question.questionType?.trim() || null,
      questionHash: question.questionHash?.trim() || null,
      questionText: question.questionText?.trim() || null,
      updatedAt: now,
    });
  }

  if (incoming.size === 0) {
    return;
  }

  const storageKey = getRegistryStorageKey(domain, courseId, quizId);

  try {
    const stored = await chrome.storage.local.get(storageKey);
    const existingStubs = Array.isArray(stored[storageKey])
      ? (stored[storageKey] as QuizQuestionStub[])
      : [];
    const mergedById = new Map<string, QuizQuestionStub>();

    for (const stub of existingStubs) {
      mergedById.set(stub.questionId, stub);
    }

    for (const [questionId, stub] of incoming) {
      const existing = mergedById.get(questionId);

      mergedById.set(questionId, {
        ...stub,

        questionText: stub.questionText || existing?.questionText || null,
        questionType: stub.questionType ?? existing?.questionType ?? null,
        questionHash: stub.questionHash ?? existing?.questionHash ?? null,
      });
    }

    const stubs = Array.from(mergedById.values())
      .sort((left, right) => (right.updatedAt ?? "").localeCompare(left.updatedAt ?? ""))
      .slice(0, REGISTRY_MAX_QUESTIONS_PER_QUIZ);

    await chrome.storage.local.set({ [storageKey]: stubs });
  } catch {
    // The registry is an optimization: a storage failure must never break the
    // answer flow that triggered the recording.
  }
}

export async function getQuizQuestionStubs(
  domain: string,
  courseId: number | null,
  quizId: number | null,
) {
  if (courseId === null || quizId === null) {
    return [];
  }

  try {
    const stored = await chrome.storage.local.get(getRegistryStorageKey(domain, courseId, quizId));
    const stubs = stored[getRegistryStorageKey(domain, courseId, quizId)];

    return Array.isArray(stubs) ? (stubs as QuizQuestionStub[]) : [];
  } catch {
    return [];
  }
}
