import {
  createDocumentWrite,
  deleteDocumentWrite,
  incrementDocumentWrite,
  updateDocumentWrite,
  type FirestoreClient,
  type FirestoreWrite,
} from "./firestore";
import { isFirebasePreconditionError } from "./http";

interface VoteDecision {
  writes: FirestoreWrite[];
  upDelta: number;
  downDelta: number;
  myVote: 1 | -1 | 0;
}

function buildVoteDecision(options: {
  projectId: string;
  votePath: string;
  documentPath: string;
  voteFields: (value: 1 | -1) => Record<string, unknown>;
  value: 1 | -1;
  existingValue: 1 | -1 | null;
}): VoteDecision {
  if (options.existingValue === null) {
    return {
      writes: [
        createDocumentWrite(options.projectId, options.votePath, options.voteFields(options.value)),
      ],
      upDelta: options.value === 1 ? 1 : 0,
      downDelta: options.value === -1 ? 1 : 0,
      myVote: options.value,
    };
  }

  if (options.existingValue === options.value) {
    return {
      writes: [deleteDocumentWrite(options.projectId, options.votePath)],
      upDelta: options.value === 1 ? -1 : 0,
      downDelta: options.value === -1 ? -1 : 0,
      myVote: 0,
    };
  }

  return {
    writes: [updateDocumentWrite(options.projectId, options.votePath, { value: options.value })],
    upDelta: options.value === 1 ? 1 : -1,
    downDelta: options.value === 1 ? -1 : 1,
    myVote: options.value,
  };
}

async function commitVoteDecision(
  client: FirestoreClient,
  projectId: string,
  documentPath: string,
  decision: VoteDecision,
): Promise<void> {
  const writes = [...decision.writes];

  if (decision.upDelta !== 0 || decision.downDelta !== 0) {
    writes.push(
      incrementDocumentWrite(projectId, documentPath, {
        votes_up: decision.upDelta,
        votes_down: decision.downDelta,
      }),
    );
  }

  if (writes.length > 0) {
    await client.commit(writes);
  }
}

export async function performVoteToggle(options: {
  client: FirestoreClient;
  projectId: string;
  votePath: string;
  documentPath: string;
  voteFields: (value: 1 | -1) => Record<string, unknown>;
  value: 1 | -1;
}): Promise<{ votesUp: number; votesDown: number; myVote: 1 | -1 | 0 }> {
  const { client, projectId, votePath, documentPath, value } = options;
  const existingVote = await client.getDocument(votePath);
  const existingValue = existingVote ? (existingVote.fields.value === -1 ? -1 : 1) : null;
  let decision = buildVoteDecision({ ...options, existingValue });

  try {
    await commitVoteDecision(client, projectId, documentPath, decision);
  } catch (error) {
    if (!isFirebasePreconditionError(error)) {
      throw error;
    }

    const winner = await client.getDocument(votePath);

    if (!winner) {
      throw error;
    }

    const winnerValue = winner.fields.value === -1 ? -1 : 1;

    decision =
      winnerValue === value
        ? { writes: [], upDelta: 0, downDelta: 0, myVote: value }
        : buildVoteDecision({ ...options, existingValue: winnerValue });
    await commitVoteDecision(client, projectId, documentPath, decision);
  }

  const finalDocument = await client.getDocument(documentPath);
  const rawUp =
    typeof finalDocument?.fields.votes_up === "number" ? finalDocument.fields.votes_up : 0;
  const rawDown =
    typeof finalDocument?.fields.votes_down === "number" ? finalDocument.fields.votes_down : 0;
  const votesUp = Math.max(rawUp, 0);
  const votesDown = Math.max(rawDown, 0);

  if (votesUp !== rawUp || votesDown !== rawDown) {
    await client.commit([
      updateDocumentWrite(projectId, documentPath, { votes_up: votesUp, votes_down: votesDown }),
    ]);
  }

  return { votesUp, votesDown, myVote: decision.myVote };
}
