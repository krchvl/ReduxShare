import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import vm from "node:vm";
import { describe, expect, it } from "vitest";

const HOOK_PATH = resolve(process.cwd(), "pocketbase/pb_hooks/main.pb.js");
const CHAT_PATH = "/api/rpx-ai/v1/chat/completions";
const USAGE_PATH = "/api/rpx-ai/usage";
const USAGE_COLLECTION = "reduxshare_ai_usage";

interface GatePayload {
  error?: { message?: string };
  choices?: Array<{ message?: { content?: string } }>;
  plan?: string;
  models?: Array<{ model: string; label: string }>;
  minuteUsed?: number;
  minuteLimit?: number;
  dayUsed?: number;
  dayLimit?: number;
}

interface GateResponse {
  status: number;
  payload: GatePayload;
}

interface GateEvent {
  auth: { id: string; getString: (key: string) => string };
  requestInfo: () => { body: unknown };
  json: (status: number, payload: GatePayload) => GateResponse;
}

type GateHandler = (event: GateEvent) => GateResponse;

class GateApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

class GateBadRequestError extends Error {}

interface UsageRecord {
  data: Record<string, string | number>;
  set: (key: string, value: string | number) => void;
  getInt: (key: string, fallback?: number) => number;
}

interface UsageApp {
  rows: Map<string, UsageRecord>;
  findCollectionByNameOrId: (name: string) => { name: string };
  findFirstRecordByFilter: (
    collection: string,
    filter: string,
    params: Record<string, string>,
  ) => UsageRecord;
  save: (record: UsageRecord) => void;
  runInTransaction: (callback: (app: UsageApp) => void) => void;
  db: () => { newQuery: (sql: string) => { bind: (params: unknown) => { execute: () => void } } };
}

interface UpstreamResponse {
  statusCode: number;
  json: unknown;
  raw?: string;
}

interface GateSandbox {
  routerAdd: (method: string, path: string, handler: GateHandler) => void;
  cronAdd: () => void;
  onRecordCreateRequest: () => void;
  onRecordUpdateRequest: () => void;
  $apis: { requireAuth: () => (event: GateEvent) => GateEvent };
  $app: UsageApp;
  $http: { send: (options: unknown) => UpstreamResponse };
  Record: new (collection: { name: string }) => UsageRecord;
  ApiError: typeof GateApiError;
  BadRequestError: new (message: string) => Error;
  console: Pick<Console, "warn" | "error">;
}

class FakeUsageRecord implements UsageRecord {
  data: Record<string, string | number> = {};

  constructor(readonly collection: { name: string }) {}

  set(key: string, value: string | number) {
    this.data[key] = value;
  }

  getInt(key: string, fallback = 0) {
    const value = this.data[key];
    return typeof value === "number" ? value : fallback;
  }
}

function usageRowKey(user: unknown, period: unknown, start: unknown) {
  return `${String(user)}|${String(period)}|${String(start)}`;
}

function cloneUsageRecord(record: UsageRecord): UsageRecord {
  const copy = new FakeUsageRecord({ name: USAGE_COLLECTION });
  copy.data = { ...record.data };
  return copy;
}

function createGate() {
  const routes = new Map<string, GateHandler>();
  const sandbox: GateSandbox = {
    routerAdd: (_method: string, path: string, handler: GateHandler) => {
      routes.set(path, handler);
    },
    cronAdd: () => {},
    onRecordCreateRequest: () => {},
    onRecordUpdateRequest: () => {},
    $apis: { requireAuth: () => (event: GateEvent) => event },
    console: { warn: () => {}, error: () => {} },
    Record: FakeUsageRecord,
    ApiError: GateApiError,
    BadRequestError: GateBadRequestError,
    $app: createUsageApp(),
    $http: { send: () => upstreamOk() },
  };

  const context = vm.createContext(sandbox);
  vm.runInContext(readFileSync(HOOK_PATH, "utf8"), context);

  return {
    sandbox,
    chatHandler: routes.get(CHAT_PATH)!,
    usageHandler: routes.get(USAGE_PATH)!,
  };
}

const gate = createGate();

function createUsageApp(): UsageApp {
  const rows = new Map<string, UsageRecord>();

  const app: UsageApp = {
    rows,
    findCollectionByNameOrId: (name) => ({ name }),
    findFirstRecordByFilter: (_collection, _filter, params) => {
      const record = rows.get(usageRowKey(params.user, params.period, params.start));
      if (!record) {
        throw new Error("sql: no rows in result set");
      }
      return record;
    },
    save: (record) => {
      rows.set(usageRowKey(record.data.user, record.data.period, record.data.period_start), record);
    },
    runInTransaction: (callback) => {
      const snapshot = new Map([...rows].map(([key, record]) => [key, cloneUsageRecord(record)]));
      try {
        callback(app);
      } catch (error) {
        rows.clear();
        for (const [key, record] of snapshot) {
          rows.set(key, record);
        }
        throw error;
      }
    },
    db: () => ({ newQuery: () => ({ bind: () => ({ execute: () => undefined }) }) }),
  };

  return app;
}

function usageCount(app: UsageApp, period: "minute" | "day") {
  let total = 0;
  for (const [key, record] of app.rows) {
    if (key.includes(`|${period}|`)) {
      total += record.getInt("count");
    }
  }
  return total;
}

function callChat(input: {
  app: UsageApp;
  responses: Array<UpstreamResponse | Error>;
  body?: unknown;
  plan?: string;
}) {
  let index = 0;
  const upstreamRequests: Array<{ url: string; body: Record<string, unknown> }> = [];
  gate.sandbox.$http = {
    send: (options: unknown) => {
      const request = options as { url: string; body: string };
      upstreamRequests.push({ url: request.url, body: JSON.parse(request.body) });
      const response = input.responses[Math.min(index, input.responses.length - 1)]!;
      index += 1;
      if (response instanceof Error) {
        throw response;
      }
      return response;
    },
  };
  gate.sandbox.$app = input.app;

  const event: GateEvent = {
    auth: { id: "user_1", getString: (key) => (key === "plan" ? (input.plan ?? "free") : "") },
    requestInfo: () => ({
      body: input.body === undefined ? { messages: [{ role: "user", content: "hi" }] } : input.body,
    }),
    json: (status, payload) => ({ status, payload }),
  };

  let response: GateResponse;
  try {
    response = gate.chatHandler(event);
  } catch (error) {
    if (!(error instanceof GateApiError)) {
      throw error;
    }
    response = { status: error.status, payload: { error: { message: error.message } } };
  }

  return { response, upstreamCalls: upstreamRequests.length, upstreamRequests };
}

function callUsage(app: UsageApp) {
  gate.sandbox.$app = app;
  return gate.usageHandler({
    auth: { id: "user_1", getString: () => "" },
    requestInfo: () => ({ body: null }),
    json: (status, payload) => ({ status, payload }),
  });
}

function upstreamOk(content = "OK"): UpstreamResponse {
  return { statusCode: 200, json: { choices: [{ message: { content } }] } };
}

function upstreamStatus(statusCode: number): UpstreamResponse {
  return { statusCode, json: { error: { message: `upstream ${statusCode}` } } };
}

describe("official AI gate hook", () => {
  it("charges the day and minute counters for an answered request", () => {
    const app = createUsageApp();

    const { response, upstreamCalls } = callChat({ app, responses: [upstreamOk("OK")] });

    expect(response.status).toBe(200);
    expect(response.payload.choices?.[0]?.message?.content).toBe("OK");
    expect(upstreamCalls).toBe(1);
    expect(usageCount(app, "day")).toBe(1);
    expect(usageCount(app, "minute")).toBe(1);
  });

  it("maps an all-upstream 429 to 503 and refunds the day counter", () => {
    const app = createUsageApp();

    const { response, upstreamCalls } = callChat({
      app,
      responses: [upstreamStatus(429), upstreamStatus(429)],
    });

    expect(response.status).toBe(503);
    expect(response.payload.error?.message).toMatch(/rate-limited/);
    expect(upstreamCalls).toBe(2);
    expect(usageCount(app, "day")).toBe(0);
    expect(usageCount(app, "minute")).toBe(1);
  });

  it("retries the other group after an upstream 429 and charges once on success", () => {
    const app = createUsageApp();

    const { response } = callChat({
      app,
      responses: [upstreamStatus(429), upstreamOk("second")],
    });

    expect(response.status).toBe(200);
    expect(response.payload.choices?.[0]?.message?.content).toBe("second");
    expect(usageCount(app, "day")).toBe(1);
  });

  it("never forwards an upstream 401/403 as an auth failure", () => {
    const app = createUsageApp();

    const { response, upstreamCalls } = callChat({
      app,
      responses: [upstreamStatus(401), upstreamStatus(403)],
    });

    expect(response.status).toBe(502);
    expect(response.payload.error?.message).toMatch(/rejected the gateway credentials/);
    expect(upstreamCalls).toBe(2);
    expect(usageCount(app, "day")).toBe(0);
  });

  it("retries the other group after an upstream 401 and answers from it", () => {
    const app = createUsageApp();

    const { response } = callChat({
      app,
      responses: [upstreamStatus(401), upstreamOk("second")],
    });

    expect(response.status).toBe(200);
    expect(usageCount(app, "day")).toBe(1);
  });

  it("refunds the day counter for a forwarded upstream 4xx error", () => {
    const app = createUsageApp();

    const { response } = callChat({ app, responses: [upstreamStatus(400)] });

    expect(response.status).toBe(400);
    expect(usageCount(app, "day")).toBe(0);
  });

  it("refunds the day counter when every upstream 5xx fails", () => {
    const app = createUsageApp();

    const { response, upstreamCalls } = callChat({
      app,
      responses: [upstreamStatus(500), upstreamStatus(502)],
    });

    expect(response.status).toBe(502);
    expect(upstreamCalls).toBe(2);
    expect(usageCount(app, "day")).toBe(0);
  });

  it("refunds the day counter when the gateway transport fails", () => {
    const app = createUsageApp();

    const { response } = callChat({ app, responses: [new Error("ECONNREFUSED")] });

    expect(response.status).toBe(502);
    expect(response.payload.error?.message).toMatch(/unreachable/);
    expect(usageCount(app, "day")).toBe(0);
  });

  it("keeps failed requests from burning the day quota while staying rate-limited", () => {
    const app = createUsageApp();

    callChat({ app, responses: [upstreamOk()] });
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const { response } = callChat({
        app,
        responses: [upstreamStatus(429), upstreamStatus(429)],
      });
      expect(response.status).toBe(503);
    }

    expect(callUsage(app).payload.dayUsed).toBe(1);
    expect(callUsage(app).payload.minuteUsed).toBe(4);
  });

  it("rolls back its own bump when the per-minute limit is exceeded", () => {
    const app = createUsageApp();

    for (let request = 0; request < 5; request += 1) {
      expect(callChat({ app, responses: [upstreamOk()] }).response.status).toBe(200);
    }

    const { response, upstreamCalls } = callChat({ app, responses: [upstreamOk()] });

    expect(response.status).toBe(429);
    expect(upstreamCalls).toBe(0);
    expect(usageCount(app, "day")).toBe(5);
    expect(usageCount(app, "minute")).toBe(5);
  });

  it("rejects a non-object request body before touching the quota", () => {
    const app = createUsageApp();

    expect(() => callChat({ app, responses: [upstreamOk()], body: null })).toThrow(
      GateBadRequestError,
    );
    expect(usageCount(app, "day")).toBe(0);
  });

  it("rejects an explicit empty model selection instead of using the full plan pool", () => {
    const app = createUsageApp();

    const { response, upstreamCalls } = callChat({
      app,
      responses: [upstreamOk()],
      body: { messages: [{ role: "user", content: "hi" }], models: [] },
    });

    expect(response.status).toBe(400);
    expect(response.payload.error?.message).toMatch(/^Official AI model selection/);
    expect(upstreamCalls).toBe(0);
    expect(usageCount(app, "day")).toBe(0);
    expect(usageCount(app, "minute")).toBe(0);
  });

  it("rejects a model filter that matches no model of the plan", () => {
    const app = createUsageApp();

    const { response, upstreamCalls } = callChat({
      app,
      responses: [upstreamOk()],
      body: { messages: [{ role: "user", content: "hi" }], models: ["googol-1"] },
    });

    expect(response.status).toBe(400);
    expect(response.payload.error?.message).toMatch(/^Official AI model selection/);
    expect(upstreamCalls).toBe(0);
    expect(usageCount(app, "day")).toBe(0);
  });

  it("routes a filtered request through the selected model's group only", () => {
    const app = createUsageApp();

    const { response, upstreamRequests } = callChat({
      app,
      responses: [upstreamOk()],
      body: { messages: [{ role: "user", content: "hi" }], models: ["MiniMax-M2.7"] },
    });

    expect(response.status).toBe(200);
    expect(upstreamRequests).toHaveLength(1);
    expect(upstreamRequests[0]!.url).toContain("/proxy/fxqidian/v1/chat/completions");
    expect(upstreamRequests[0]!.body.model).toBe("minimax-m2.7");
  });

  it("retries only within the groups of the selected models", () => {
    const app = createUsageApp();

    const { response, upstreamRequests } = callChat({
      app,
      responses: [upstreamStatus(429), upstreamOk("second")],
      body: {
        messages: [{ role: "user", content: "hi" }],
        models: ["minimax-m2.7", "glm-5.3-flash"],
      },
    });

    expect(response.status).toBe(200);
    expect(new Set(upstreamRequests.map((request) => request.body.model))).toEqual(
      new Set(["minimax-m2.7", "glm-5.3-flash"]),
    );
  });

  it("keeps the whole plan pool for requests without a model filter", () => {
    const app = createUsageApp();

    const { response, upstreamRequests } = callChat({ app, responses: [upstreamOk()] });

    expect(response.status).toBe(200);
    expect(upstreamRequests[0]!.url).toMatch(
      /\/proxy\/(groq|nararouter|fxqidian|sharellm)\/v1\/chat\/completions$/,
    );
  });

  it("refunds the day counter when the gateway transport fails", () => {
    const app = createUsageApp();

    const { response } = callChat({
      app,
      responses: [new Error("ECONNREFUSED")],
    });

    expect(response.status).toBe(502);
    expect(response.payload.error?.message).toMatch(/unreachable|transport/);
    expect(usageCount(app, "day")).toBe(0);
  });

  it("does not consume quota on an empty model filter request", () => {
    const app = createUsageApp();

    const { response } = callChat({
      app,
      responses: [upstreamOk()],
      body: { messages: [{ role: "user", content: "hi" }], models: [] },
    });

    expect(response.status).toBe(400);
    expect(usageCount(app, "day")).toBe(0);
    expect(usageCount(app, "minute")).toBe(0);
  });
});
