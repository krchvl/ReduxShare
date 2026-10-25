import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import vm from "node:vm";
import { describe, expect, it } from "vitest";

const HOOK_PATH = resolve(process.cwd(), "pocketbase/pb_hooks/main.pb.js");

interface VoteRecord {
  collection: string;
  data: Record<string, string | number>;
  getInt: (key: string, fallback?: number) => number;
  getString: (key: string) => string;
}

interface VoteEvent {
  record: VoteRecord;
  next: () => void;
}

type VoteHandler = (event: VoteEvent) => void;

interface VoteSandbox {
  routerAdd: () => void;
  cronAdd: () => void;
  onRecordCreateRequest: (handler: VoteHandler, collection: string) => void;
  onRecordUpdateRequest: (handler: VoteHandler, collection: string) => void;
  $app: { findRecordById: (collection: string, id: string) => VoteRecord };
  $apis: { requireAuth: () => () => void };
  $http: { send: () => unknown };
  Record: unknown;
  ApiError: unknown;
  BadRequestError: new (message: string) => Error;
  console: Pick<Console, "warn" | "error">;
}

function createVoteRecord(collection: string, data: Record<string, string | number>): VoteRecord {
  return {
    collection,
    data,
    getInt: (key, fallback = 0) => {
      const value = data[key];
      return typeof value === "number" ? value : fallback;
    },
    getString: (key) => String(data[key] ?? ""),
  };
}

function createVoteHooks(tasks: Record<string, Record<string, number>>) {
  const createHandlers = new Map<string, VoteHandler>();
  const updateHandlers = new Map<string, VoteHandler>();

  const sandbox: VoteSandbox = {
    routerAdd: () => {},
    cronAdd: () => {},
    onRecordCreateRequest: (handler, collection) => {
      createHandlers.set(collection, handler);
    },
    onRecordUpdateRequest: (handler, collection) => {
      updateHandlers.set(collection, handler);
    },
    $app: {
      findRecordById: (collection, id) => {
        const data = tasks[id];

        if (collection !== "reduxshare_tasks" || !data) {
          throw new Error("sql: no rows in result set");
        }

        return createVoteRecord(collection, { id, ...data });
      },
    },
    $apis: { requireAuth: () => () => undefined },
    $http: { send: () => ({ statusCode: 200, json: {} }) },
    Record: function PlaceholderRecord() {},
    ApiError: class PlaceholderApiError extends Error {},
    BadRequestError: class HookBadRequestError extends Error {},
    console: { warn: () => {}, error: () => {} },
  };

  vm.runInContext(readFileSync(HOOK_PATH, "utf8"), vm.createContext(sandbox));

  function run(
    kind: "create" | "update",
    collection: string,
    recordData: Record<string, string | number>,
  ) {
    const handler = (kind === "create" ? createHandlers : updateHandlers).get(collection);

    if (!handler) {
      throw new Error(`no ${kind} handler registered for ${collection}`);
    }

    let nextCalls = 0;
    const event: VoteEvent = {
      record: createVoteRecord(collection, recordData),
      next: () => {
        nextCalls += 1;
      },
    };

    return {
      result: () => handler(event),
      nextCalls: () => nextCalls,
    };
  }

  return { run };
}

describe("pb_hooks vote validation", () => {
  it("rejects task vote create with an injected value", () => {
    const { run } = createVoteHooks({ task1: {} });

    const vote = run("create", "reduxshare_task_votes", {
      task: "task1",
      user: "u1",
      value: 500,
    });

    expect(vote.result).toThrow("Vote value must be 1 or -1.");
    expect(vote.nextCalls()).toBe(0);
  });

  it("allows task vote create on an unverified answer", () => {
    const { run } = createVoteHooks({
      task1: {
        correct_count: 0,
        selected_correct_count: 0,
        selected_incorrect_count: 0,
      },
    });

    const vote = run("create", "reduxshare_task_votes", {
      task: "task1",
      user: "u1",
      value: 1,
    });

    expect(vote.result()).toBeUndefined();
    expect(vote.nextCalls()).toBe(1);
  });

  it("rejects task vote update on a verified answer", () => {
    const { run } = createVoteHooks({
      task1: { correct_count: 3, selected_correct_count: 0, selected_incorrect_count: 0 },
    });

    const vote = run("update", "reduxshare_task_votes", {
      task: "task1",
      user: "u1",
      value: -1,
    });

    expect(vote.result).toThrow("Votes are only allowed for unverified answers.");
    expect(vote.nextCalls()).toBe(0);
  });

  it("passes task votes through when the task is missing", () => {
    const { run } = createVoteHooks({});

    const vote = run("create", "reduxshare_task_votes", {
      task: "missing",
      user: "u1",
      value: 1,
    });

    expect(vote.result()).toBeUndefined();
    expect(vote.nextCalls()).toBe(1);
  });

  it("rejects essay vote create with a non ±1 value", () => {
    const { run } = createVoteHooks({});

    const vote = run("create", "reduxshare_essay_votes", {
      example: "ex1",
      user: "u1",
      value: 42,
    });

    expect(vote.result).toThrow("Vote value must be 1 or -1.");
    expect(vote.nextCalls()).toBe(0);
  });

  it("allows essay vote update with a valid value", () => {
    const { run } = createVoteHooks({});

    const vote = run("update", "reduxshare_essay_votes", {
      example: "ex1",
      user: "u1",
      value: -1,
    });

    expect(vote.result()).toBeUndefined();
    expect(vote.nextCalls()).toBe(1);
  });
});
