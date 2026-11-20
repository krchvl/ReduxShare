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

export {
  saveEssayExample,
  fetchEssayExamples,
  voteEssayExample,
} from "./providers/pocketbase/essayExamples";
