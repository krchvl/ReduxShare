import type {
  EssayExampleRecord,
  PocketBaseUserRecord,
  ReviewImportRecord,
  TaskRecord,
} from "../../dataTypes";
import type { FirestoreDocumentData } from "./firestore";

function asString(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}

function asNullableString(value: unknown): string | null {
  return typeof value === "string" && value ? value : null;
}

function asNumber(value: unknown, fallback = 0): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function asNullableNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function asStringMap(value: unknown): Record<string, string> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }

  const result: Record<string, string> = {};

  for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
    if (typeof entry === "string") {
      result[key] = entry;
    }
  }

  return result;
}

function getTimestamps(document: FirestoreDocumentData) {
  return {
    created: asString(document.fields.created) || document.createTime || "",
    updated: asString(document.fields.updated) || document.updateTime || "",
  };
}

export function mapTaskDocument(document: FirestoreDocumentData): TaskRecord {
  const fields = document.fields;
  const timestamps = getTimestamps(document);

  return {
    id: document.id,
    moodle_domain: asString(fields.moodle_domain),
    course_id: asNumber(fields.course_id),
    quiz_id: asNumber(fields.quiz_id),
    question_id: asString(fields.question_id),
    question_hash: asString(fields.question_hash),
    question_type: asString(fields.question_type),
    question_text: asNullableString(fields.question_text),
    answer_options: asNullableString(fields.answer_options),
    slot_key: asString(fields.slot_key),
    slot_index: asNullableNumber(fields.slot_index),
    answer_key: asString(fields.answer_key),
    answer_label: asString(fields.answer_label),
    correct_count: asNullableNumber(fields.correct_count),
    selected_correct_count: asNullableNumber(fields.selected_correct_count),
    selected_incorrect_count: asNullableNumber(fields.selected_incorrect_count),
    selected_unknown_count: asNullableNumber(fields.selected_unknown_count),
    votes_up: asNullableNumber(fields.votes_up),
    votes_down: asNullableNumber(fields.votes_down),
    created: timestamps.created,
    updated: timestamps.updated,
    expand: {
      first_contributor: {
        username: asNullableString(fields.first_contributor_username),
      },
      last_contributor: {
        username: asNullableString(fields.last_contributor_username),
      },
    },
  };
}

export function mapReviewImportDocument(document: FirestoreDocumentData): ReviewImportRecord {
  const fields = document.fields;
  const timestamps = getTimestamps(document);

  return {
    id: document.id,
    moodle_domain: asString(fields.moodle_domain),
    course_id: asNullableNumber(fields.course_id),
    quiz_id: asNullableNumber(fields.quiz_id),
    page_url: asString(fields.page_url),
    imported_question_count: asNullableNumber(fields.imported_question_count),
    imported_question_hashes: asStringMap(fields.imported_question_hashes),
    created: timestamps.created,
    updated: timestamps.updated,
  };
}

export function mapUserDocument(document: FirestoreDocumentData): PocketBaseUserRecord {
  const fields = document.fields;

  return {
    id: document.id,
    email: asString(fields.email),
    username: asString(fields.username),
    moodle_domain: asString(fields.moodle_domain),
    solved_tests_count: asNullableNumber(fields.solved_tests_count),
    solved_tasks_count: asNullableNumber(fields.solved_tasks_count),
    imported_questions_count: asNullableNumber(fields.imported_questions_count),
    attempt_correct_count: asNullableNumber(fields.attempt_correct_count),
    attempt_incorrect_count: asNullableNumber(fields.attempt_incorrect_count),
  };
}

export function mapEssayExampleDocument(document: FirestoreDocumentData): EssayExampleRecord {
  const fields = document.fields;
  const timestamps = getTimestamps(document);

  return {
    id: document.id,
    moodle_domain: asString(fields.moodle_domain),
    course_id: asNumber(fields.course_id),
    quiz_id: asNumber(fields.quiz_id),
    question_id: asString(fields.question_id),
    question_hash: asString(fields.question_hash),
    question_type: asString(fields.question_type),
    question_text: asNullableString(fields.question_text),
    body: asString(fields.body),
    votes_up: asNullableNumber(fields.votes_up),
    votes_down: asNullableNumber(fields.votes_down),
    created: timestamps.created,
    updated: timestamps.updated,
    expand: {
      user: {
        username: asNullableString(fields.author_name),
      },
    },
  };
}
