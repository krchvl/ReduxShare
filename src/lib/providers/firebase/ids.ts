import { fnv1a64Hex } from "../../dataCore/hash";

const ID_SEPARATOR = "\u0000";

function hashIdentity(parts: Array<string | number>): string {
  return fnv1a64Hex(parts.map(String).join(ID_SEPARATOR));
}

export function taskDocumentId(entry: {
  moodleDomain: string;
  courseId: number;
  quizId: number;
  questionId: string;
  questionHash: string;
  slotKey: string;
  answerKey: string;
}): string {
  return hashIdentity([
    entry.moodleDomain,
    entry.courseId,
    entry.quizId,
    entry.questionId,
    entry.questionHash,
    entry.slotKey,
    entry.answerKey,
  ]);
}

export function reviewImportDocumentId(
  userId: string,
  moodleDomain: string,
  attemptKey: string,
): string {
  return `${userId}__${hashIdentity([moodleDomain, attemptKey])}`;
}

export function taskVoteDocumentId(taskId: string, userId: string): string {
  return `${taskId}__${userId}`;
}

export function essayExampleDocumentId(entry: {
  userId: string;
  moodleDomain: string;
  courseId: number;
  quizId: number;
  questionId: string;
  questionHash: string;
}): string {
  return `${entry.userId}__${hashIdentity([
    entry.moodleDomain,
    entry.courseId,
    entry.quizId,
    entry.questionId,
    entry.questionHash,
  ])}`;
}

export function essayVoteDocumentId(exampleId: string, userId: string): string {
  return `${exampleId}__${userId}`;
}

export function usernameDocumentId(username: string): string {
  return `u${hashIdentity([username.trim().toLowerCase()])}`;
}
