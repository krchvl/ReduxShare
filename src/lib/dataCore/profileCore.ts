import type { UserProfile } from "../../types";
import type { PocketBaseUserRecord } from "../dataTypes";

export function mapUserRecord(record: PocketBaseUserRecord): UserProfile {
  return {
    id: record.id,
    email: record.email,
    username: record.username,
    moodleDomain: record.moodle_domain || null,
    solvedTestsCount: record.solved_tests_count ?? 0,
    solvedTasksCount: record.solved_tasks_count ?? 0,
    importedQuestionsCount: record.imported_questions_count ?? 0,
    attemptCorrectCount: record.attempt_correct_count ?? 0,
    attemptIncorrectCount: record.attempt_incorrect_count ?? 0,
  };
}
