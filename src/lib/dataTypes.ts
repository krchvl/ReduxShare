import type { AuthSession, UserProfile } from "../types";

export interface QuizTaskQuestionRequest {
  questionId: string | null;
  questionType: string | null;
  questionHash: string | null;
}

export interface FetchReduxShareTasksPayload {
  domain: string;
  courseId: number | null;
  quizId: number | null;
  questions: QuizTaskQuestionRequest[];
}

export interface ReduxShareTaskResult {
  questionId: string | null;
  questionType: string | null;
  questionHash: string | null;
  ok: boolean;
  data?: unknown;
  answerCount?: number;
  error?: string;
}

export interface TaskRecord {
  id: string;
  moodle_domain: string;
  course_id: number;
  quiz_id: number;
  question_id: string;
  question_hash: string;
  question_type: string;

  question_text?: string | null;

  answer_options?: string | null;
  slot_key: string;
  slot_index: number | null;
  answer_key: string;
  answer_label: string;
  correct_count: number | null;
  selected_correct_count: number | null;
  selected_incorrect_count: number | null;
  selected_unknown_count: number | null;
  votes_up?: number | null;
  votes_down?: number | null;
  created: string;
  updated: string;
  expand?: {
    first_contributor?: { username?: unknown } | null;
    last_contributor?: { username?: unknown } | null;
  } | null;
}

export interface TaskVoteRecord {
  id: string;
  task: string;
  user: string;
  value: number;
}

export interface ReviewImportRecord {
  id: string;
  moodle_domain?: string;
  course_id: number | null;
  quiz_id: number | null;
  page_url: string;
  imported_question_count: number | null;
  imported_question_hashes: Record<string, string> | null;
  created?: string;
  updated?: string;
}

export interface FetchReduxShareTasksResult {
  authSession: AuthSession;
  results: ReduxShareTaskResult[];
}

export interface ReviewAnswerPayload {
  label: string;
  answerKey: string;
  slotKey: string;
  slotIndex: number | null;
  correctness: number;
  isCorrect: boolean;
  wasSelected: boolean;
}

export type SelectionVerdict = "correct" | "incorrect" | "unknown";

export interface PreCountedSelection {
  answerKey: string;
  slotKey: string;
  verdict: SelectionVerdict;
}

export interface ReviewQuestionPayload {
  questionId: string | null;
  questionType: string | null;
  questionHash: string | null;
  questionText?: string | null;
  answerOptions?: string[];
  answers: ReviewAnswerPayload[];
  preCountedAnswers?: PreCountedSelection[];
}

export interface SaveReduxShareReviewPayload {
  domain: string;
  courseId: number | null;
  quizId: number | null;
  attemptKey: string;
  pageUrl: string;
  questions: ReviewQuestionPayload[];
}

export interface SaveReduxShareReviewResult {
  authSession: AuthSession;
  imported: boolean;
  savedCount: number;
}

export interface UserAnswerSelectionAnswer {
  label: string;
  answerKey: string;
  slotKey: string;
  slotIndex: number | null;
  verdict: SelectionVerdict;
}

export interface UserAnswerSelectionQuestion {
  questionId: string | null;
  questionType: string | null;
  questionHash: string | null;
  questionText?: string | null;
  answerOptions?: string[];
  answers: UserAnswerSelectionAnswer[];
}

export interface SaveUserAnswerPayload {
  domain: string;
  courseId: number | null;
  quizId: number | null;
  attemptKey: string;
  pageUrl: string;
  question: UserAnswerSelectionQuestion;
}

export interface SaveUserAnswerResult {
  authSession: AuthSession;
  savedCount: number;
}

export interface VoteTaskAnswerPayload {
  taskId: string;
  value: 1 | -1;
}

export interface VoteTaskAnswerResult {
  authSession: AuthSession;
  votesUp: number;
  votesDown: number;
  myVote: 1 | -1 | 0;
}

export interface QuizPreviewTaskResult {
  questionId: string | null;
  questionType: string | null;
  questionHash: string | null;
  questionText: string | null;
  answerOptions: string[];
  ok: boolean;
  data?: unknown;
  answerCount?: number;
}

export type ReviewQuestionOutcome = "correct" | "wrong" | "unknown" | "none";

export interface NormalizedReviewAnswer {
  label: string;
  key: string;
  slotKey: string;
  slotIndex: number | null;
  correctness: number;
  isCorrect: boolean;
  wasSelected: boolean;
}

export interface NormalizedPreCountedSelection {
  key: string;
  slotKey: string;
  verdict: SelectionVerdict;
}

export interface NormalizedReviewQuestion {
  questionId: string;
  questionType: string | null;
  questionHash: string;
  questionText: string | null;
  answerOptions: string[];
  answers: NormalizedReviewAnswer[];
  preCountedAnswers: NormalizedPreCountedSelection[];
}

export interface PocketBaseUserRecord {
  id: string;
  email: string;
  username: string;
  moodle_domain: string;
  solved_tests_count: number | null;
  solved_tasks_count: number | null;
  imported_questions_count: number | null;
  attempt_correct_count: number | null;
  attempt_incorrect_count: number | null;
}

export interface UserProfileSeed {
  email?: string | null;
  username?: string | null;
}

export interface UserProgressDelta {
  moodleDomain: string | null;
  solvedTestsDelta: number;
  solvedTasksDelta: number;
  email?: string | null;
  username?: string | null;
}

export interface AuthenticatedProfileResult {
  authSession: AuthSession;
  userProfile: UserProfile;
}

export interface OwnProfileResponse {
  ok: boolean;
  error?: string;
  userProfile?: UserProfile;
}

export interface TouchProfileResponse {
  ok: boolean;
  error?: string;
  authSession?: AuthSession;
  userProfile?: UserProfile;
}

export interface LeaderboardEntry {
  id: string;
  username: string;
  importedQuestionsCount: number;
  attemptCorrectCount: number;
  attemptIncorrectCount: number;
}

export interface UserLeaderboard {
  entries: LeaderboardEntry[];
  myRank: number | null;
  totalContributors: number;
  totalAnswerRows: number;
}

export interface FetchUserLeaderboardResult {
  authSession: AuthSession;
  leaderboard: UserLeaderboard;
}

export interface LeaderboardResponse {
  ok: boolean;
  error?: string;
  leaderboard?: UserLeaderboard;
}

export interface AttemptHistoryEntry {
  id: string;
  domain: string;
  courseId: number | null;
  quizId: number | null;
  pageUrl: string;
  importedQuestionsCount: number;
  updatedAt: string | null;
}

export interface UserAttemptHistory {
  entries: AttemptHistoryEntry[];
  total: number;
}

export interface FetchUserAttemptHistoryResult {
  authSession: AuthSession;
  history: UserAttemptHistory;
}

export interface AttemptHistoryResponse {
  ok: boolean;
  error?: string;
  history?: UserAttemptHistory;
}

export interface EssayExampleRequest {
  questionId: string | null;
  questionHash: string | null;
}

export interface EssayExampleItem {
  exampleId: string;
  questionId: string;
  questionHash: string;
  body: string;
  authorName: string | null;
  createdAt: string;
  updatedAt: string;
  votesUp: number;
  votesDown: number;
  myVote: 1 | -1 | 0;
}

export interface EssayExampleRecord {
  id: string;
  moodle_domain: string;
  course_id: number;
  quiz_id: number;
  question_id: string;
  question_hash: string;
  question_type: string;
  question_text?: string | null;
  body: string;
  votes_up?: number | null;
  votes_down?: number | null;
  created: string;
  updated: string;
  expand?: {
    user?: { username?: unknown } | null;
  } | null;
}

export interface EssayVoteRecord {
  id: string;
  example: string;
  user: string;
  value: number;
}

export interface SaveEssayExamplePayload {
  domain: string;
  courseId: number | null;
  quizId: number | null;
  questionId: string | null;
  questionHash: string | null;
  questionText?: string | null;
  body: string;
}

export interface SaveEssayExampleResult {
  authSession: AuthSession;
  example: EssayExampleItem;
}

export interface FetchEssayExamplesPayload {
  domain: string;
  courseId: number | null;
  quizId: number | null;
  questions: EssayExampleRequest[];
}

export interface FetchEssayExamplesResultItem {
  questionId: string | null;
  questionHash: string | null;
  ok: boolean;
  examples: EssayExampleItem[];
}

export interface FetchEssayExamplesResult {
  authSession: AuthSession;
  results: FetchEssayExamplesResultItem[];
}

export interface VoteEssayExamplePayload {
  exampleId: string;
  value: 1 | -1;
}

export interface VoteEssayExampleResult {
  authSession: AuthSession;
  votesUp: number;
  votesDown: number;
  myVote: 1 | -1 | 0;
}
