import type { EssayExampleItem, EssayExampleRecord } from "../dataTypes";

export const ESSAY_EXAMPLE_MAX_LENGTH = 20000;
export const ESSAY_EXAMPLE_QUESTION_TEXT_MAX_LENGTH = 2000;

export function isDownvotedEssayExample(item: Pick<EssayExampleItem, "votesUp" | "votesDown">) {
  return (item.votesDown ?? 0) > (item.votesUp ?? 0);
}

function netVotes(item: Pick<EssayExampleItem, "votesUp" | "votesDown">) {
  return (item.votesUp ?? 0) - (item.votesDown ?? 0);
}

export function compareEssayExamples(a: EssayExampleItem, b: EssayExampleItem): number {
  const aDubious = isDownvotedEssayExample(a) ? 1 : 0;
  const bDubious = isDownvotedEssayExample(b) ? 1 : 0;

  if (aDubious !== bDubious) {
    return aDubious - bDubious;
  }

  const netDiff = netVotes(b) - netVotes(a);

  if (netDiff !== 0) {
    return netDiff;
  }

  return (b.updatedAt ?? "").localeCompare(a.updatedAt ?? "");
}

function getRowAuthorName(record: EssayExampleRecord) {
  const username = record.expand?.user?.username;

  return typeof username === "string" && username ? username : null;
}

export function toEssayExampleItem(
  record: EssayExampleRecord,
  myVote: 1 | -1 | 0,
): EssayExampleItem {
  return {
    exampleId: record.id,
    questionId: record.question_id,
    questionHash: record.question_hash,
    body: record.body,
    authorName: getRowAuthorName(record),
    createdAt: record.created,
    updatedAt: record.updated,
    votesUp: Math.max(record.votes_up ?? 0, 0),
    votesDown: Math.max(record.votes_down ?? 0, 0),
    myVote,
  };
}
