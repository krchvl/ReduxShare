import type { AuthSession } from "../types";
import type {
  FetchEssayExamplesPayload,
  FetchEssayExamplesResult,
  SaveEssayExamplePayload,
  SaveEssayExampleResult,
  VoteEssayExamplePayload,
  VoteEssayExampleResult,
} from "./dataTypes";
import { getEssayExamplesProvider } from "./dataProvider";

export type {
  EssayExampleRequest,
  EssayExampleItem,
  SaveEssayExamplePayload,
  SaveEssayExampleResult,
  FetchEssayExamplesPayload,
  FetchEssayExamplesResultItem,
  FetchEssayExamplesResult,
  VoteEssayExamplePayload,
  VoteEssayExampleResult,
} from "./dataTypes";

export {
  ESSAY_EXAMPLE_MAX_LENGTH,
  ESSAY_EXAMPLE_QUESTION_TEXT_MAX_LENGTH,
  isDownvotedEssayExample,
} from "./dataCore/essayCore";

export async function saveEssayExample(
  authSession: AuthSession,
  payload: SaveEssayExamplePayload,
): Promise<SaveEssayExampleResult> {
  return getEssayExamplesProvider().saveEssayExample(authSession, payload);
}

export async function fetchEssayExamples(
  authSession: AuthSession,
  payload: FetchEssayExamplesPayload,
): Promise<FetchEssayExamplesResult> {
  return getEssayExamplesProvider().fetchEssayExamples(authSession, payload);
}

export async function voteEssayExample(
  authSession: AuthSession,
  payload: VoteEssayExamplePayload,
): Promise<VoteEssayExampleResult> {
  return getEssayExamplesProvider().voteEssayExample(authSession, payload);
}
