import { afterEach, describe, expect, it, vi } from "vitest";
import {
  buildQuizExplanationPrompt,
  fetchAiModelOptions,
  fetchOfficialAiUsage,
  generateAiAnswer,
  hasUsableAiSettings,
  testAiConnection,
} from "../src/lib/aiProvider";
import type { GenerateAiAnswerPayload } from "../src/lib/ai";
import type { AiSettings, AuthSession } from "../src/types";
import { setActivePocketBaseUrl } from "../src/lib/pocketbase";

function baseSettings(overrides: Partial<AiSettings> = {}): AiSettings {
  return {
    provider: "google",
    model: "gemini-2.5-flash",
    apiKey: "test-api-key",
    connectionVerified: true,
    verifiedAt: null,
    customEndpoint: "",
    customModelName: "",
    ...overrides,
  };
}

function mockJsonResponse(body: unknown, init?: ResponseInit) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: {
      "Content-Type": "application/json",
    },
    ...init,
  });
}

describe("AI provider integration", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("loads Google model options through the Gemini models endpoint and filters non-chat models", async () => {
    const fetchMock = vi.fn(async () =>
      mockJsonResponse({
        models: [
          {
            name: "models/gemini-2.5-pro",
            displayName: "Gemini 2.5 Pro",
            supportedGenerationMethods: ["generateContent"],
          },
          {
            name: "models/text-embedding-004",
            supportedGenerationMethods: ["embedContent"],
          },
        ],
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const models = await fetchAiModelOptions(
      baseSettings({
        provider: "google",
      }),
    );

    expect(fetchMock).toHaveBeenCalledWith(
      "https://generativelanguage.googleapis.com/v1beta/models?pageSize=100",
      expect.objectContaining({
        method: "GET",
        headers: expect.objectContaining({
          Accept: "application/json",
          "x-goog-api-key": "test-api-key",
        }),
      }),
    );
    expect(models).toEqual([
      {
        value: "gemini-2.5-pro",
        label: "Gemini 2.5 Pro",
      },
    ]);
  });

  it("loads OpenRouter models without forcing an Authorization header when the API key is empty", async () => {
    const fetchMock = vi.fn(async () =>
      mockJsonResponse({
        data: [
          { id: "openai/gpt-5.5", name: "GPT-5.5" },
          { id: "text-embedding-3-large", name: "Embeddings" },
        ],
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const models = await fetchAiModelOptions(
      baseSettings({
        provider: "openrouter",
        apiKey: "",
      }),
    );

    expect(fetchMock).toHaveBeenCalledWith(
      "https://openrouter.ai/api/v1/models",
      expect.objectContaining({
        method: "GET",
        headers: {
          Accept: "application/json",
        },
      }),
    );
    expect(models).toEqual([
      {
        value: "openai/gpt-5.5",
        label: "GPT-5.5",
      },
    ]);
  });

  it("loads Anthropic models with the required version and api-key headers", async () => {
    const fetchMock = vi.fn(async () =>
      mockJsonResponse({
        data: [
          {
            id: "claude-sonnet-4-20250514",
            display_name: "Claude Sonnet 4",
          },
        ],
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const models = await fetchAiModelOptions(
      baseSettings({
        provider: "anthropic",
        model: "claude-sonnet-4-20250514",
      }),
    );

    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.anthropic.com/v1/models",
      expect.objectContaining({
        method: "GET",
        headers: expect.objectContaining({
          Accept: "application/json",
          "x-api-key": "test-api-key",
          "anthropic-version": "2023-06-01",
          "anthropic-dangerous-direct-browser-access": "true",
        }),
      }),
    );
    expect(models).toEqual([
      {
        value: "claude-sonnet-4-20250514",
        label: "Claude Sonnet 4",
      },
    ]);
  });

  it("tests OpenAI-compatible provider connections through chat completions", async () => {
    const fetchMock = vi.fn(async () =>
      mockJsonResponse({
        choices: [
          {
            message: {
              content: "OK",
            },
          },
        ],
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const result = await testAiConnection(
      baseSettings({
        provider: "openai",
        model: "gpt-5.5",
      }),
    );

    expect(result.text).toBe("OK");
    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.openai.com/v1/chat/completions",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          "Content-Type": "application/json",
          Authorization: "Bearer test-api-key",
        }),
        body: expect.stringContaining('"model":"gpt-5.5"'),
      }),
    );
    expect(fetchMock.mock.calls[0]?.[1]?.body).toContain("Reply with exactly: OK");
  });

  it("tests custom provider connections through the custom endpoint and custom model name", async () => {
    const fetchMock = vi.fn(async () =>
      mockJsonResponse({
        choices: [
          {
            message: {
              content: "OK",
            },
          },
        ],
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const result = await testAiConnection(
      baseSettings({
        provider: "custom",
        model: "ignored-default-model",
        customEndpoint: "https://example.com/v1/chat/completions",
        customModelName: "custom-model",
      }),
    );

    expect(result.text).toBe("OK");
    expect(fetchMock).toHaveBeenCalledWith(
      "https://example.com/v1/chat/completions",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          "Content-Type": "application/json",
          Authorization: "Bearer test-api-key",
        }),
        body: expect.stringContaining('"model":"custom-model"'),
      }),
    );
  });

  it("tests Anthropic connections through the messages endpoint", async () => {
    const fetchMock = vi.fn(async () =>
      mockJsonResponse({
        content: [
          {
            type: "text",
            text: "OK",
          },
        ],
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const result = await testAiConnection(
      baseSettings({
        provider: "anthropic",
        model: "claude-sonnet-4-20250514",
      }),
    );

    expect(result.text).toBe("OK");
    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.anthropic.com/v1/messages",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          "Content-Type": "application/json",
          "x-api-key": "test-api-key",
          "anthropic-version": "2023-06-01",
          "anthropic-dangerous-direct-browser-access": "true",
        }),
        body: expect.stringContaining('"model":"claude-sonnet-4-20250514"'),
      }),
    );
  });

  it.each([
    {
      provider: "openai",
      endpoint: "https://api.openai.com/v1/models",
      body: { data: [{ id: "gpt-5.5" }, { id: "whisper-1" }] },
      expected: [{ value: "gpt-5.5", label: "gpt-5.5" }],
    },
    {
      provider: "groq",
      endpoint: "https://api.groq.com/openai/v1/models",
      body: { data: [{ id: "llama-3.1-8b-instant" }, { id: "whisper-large-v3-turbo" }] },
      expected: [{ value: "llama-3.1-8b-instant", label: "llama-3.1-8b-instant" }],
    },
    {
      provider: "mistral",
      endpoint: "https://api.mistral.ai/v1/models",
      body: { data: [{ id: "mistral-large-latest" }] },
      expected: [{ value: "mistral-large-latest", label: "mistral-large-latest" }],
    },
    {
      provider: "xai",
      endpoint: "https://api.x.ai/v1/models",
      body: { data: [{ id: "grok-4.3" }] },
      expected: [{ value: "grok-4.3", label: "grok-4.3" }],
    },
    {
      provider: "deepseek",
      endpoint: "https://api.deepseek.com/models",
      body: { data: [{ id: "deepseek-v4-flash" }] },
      expected: [{ value: "deepseek-v4-flash", label: "deepseek-v4-flash" }],
    },
  ] as const)(
    "loads $provider models through its list endpoint with a bearer key",
    async ({ provider, endpoint, body, expected }) => {
      const fetchMock = vi.fn(async () => mockJsonResponse(body));
      vi.stubGlobal("fetch", fetchMock);

      const models = await fetchAiModelOptions(baseSettings({ provider }));

      expect(fetchMock).toHaveBeenCalledWith(
        endpoint,
        expect.objectContaining({
          method: "GET",
          headers: expect.objectContaining({ Authorization: "Bearer test-api-key" }),
        }),
      );
      expect(models).toEqual(expected);
    },
  );

  it("follows Google model list pagination", async () => {
    const fetchMock = vi.fn(async (url: string) => {
      if (String(url).includes("pageToken=next-page")) {
        return mockJsonResponse({
          models: [
            {
              name: "models/gemini-2.5-flash",
              displayName: "Gemini 2.5 Flash",
              supportedGenerationMethods: ["generateContent"],
            },
          ],
        });
      }

      return mockJsonResponse({
        models: [
          {
            name: "models/gemini-2.5-pro",
            displayName: "Gemini 2.5 Pro",
            supportedGenerationMethods: ["generateContent"],
          },
        ],
        nextPageToken: "next-page",
      });
    });
    vi.stubGlobal("fetch", fetchMock);

    const models = await fetchAiModelOptions(baseSettings({ provider: "google" }));

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(models).toEqual([
      { value: "gemini-2.5-pro", label: "Gemini 2.5 Pro" },
      { value: "gemini-2.5-flash", label: "Gemini 2.5 Flash" },
    ]);
  });

  it("times out hanging model list requests", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        (_url: string, init?: RequestInit) =>
          new Promise<Response>((_resolve, reject) => {
            init?.signal?.addEventListener("abort", () => {
              reject(new DOMException("The operation was aborted.", "AbortError"));
            });
          }),
      ),
    );

    await expect(fetchAiModelOptions(baseSettings({ provider: "openai" }), 20)).rejects.toThrow(
      "OpenAI model list request timed out.",
    );
  });
});

describe("AI explain mode", () => {
  const explainPayload: GenerateAiAnswerPayload = {
    questionId: "1385",
    questionType: "multichoice",
    questionText: "What is 2+2?",
    answerLabels: ["3", "4", "5"],
    controls: [],
    images: [],
    pageUrl: "https://example.test/mod/quiz/attempt.php",
    mode: "explain",
    answerToExplain: "4",
  };

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("builds an explanation prompt with the answer to explain and no JSON contract", () => {
    const prompt = buildQuizExplanationPrompt(explainPayload);

    expect(prompt).toContain("plain text only");
    expect(prompt).toContain("The final answer to explain:");
    expect(prompt).toContain("4");
    expect(prompt).toContain("What is 2+2?");
    expect(prompt).not.toContain("Return JSON with this schema");
  });

  it("explains via plain-text generation and skips structured answer parsing", async () => {
    const fetchMock = vi.fn(async () =>
      mockJsonResponse({
        candidates: [
          {
            content: {
              parts: [{ text: "Because 2 + 2 = 4.\nСумма двух двоек равна четырём." }],
            },
          },
        ],
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const result = await generateAiAnswer(baseSettings(), explainPayload);

    const [, requestInit] = fetchMock.mock.calls[0]!;
    const requestBody = JSON.parse((requestInit as RequestInit).body as string) as {
      contents: Array<{ parts: Array<{ text: string }> }>;
      generationConfig: { responseMimeType: string; temperature: number };
    };

    expect(requestBody.generationConfig.responseMimeType).toBe("text/plain");
    expect(requestBody.contents[0]!.parts[0]!.text).toContain("The final answer to explain:");
    expect(result.answer).toBe("Because 2 + 2 = 4.\nСумма двух двоек равна четырём.");
    expect(result.actions).toEqual([]);
    expect(result.confidence).toBe(0);
  });
});

function officialSession(token: string): AuthSession {
  return {
    accessToken: token,
    refreshToken: token,
    expiresAt: Math.floor(Date.now() / 1000) + 3600,
    user: { id: "user_1", email: "user@example.com" },
  };
}

function fakeJwt(payload: Record<string, unknown>): string {
  const encode = (value: object) =>
    btoa(JSON.stringify(value)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  return `${encode({ alg: "HS256", typ: "JWT" })}.${encode(payload)}.sig`;
}

describe("Official AI access", () => {
  afterEach(() => {
    setActivePocketBaseUrl(null);
  });

  it("routes test connection through the PocketBase gate with the session token", async () => {
    setActivePocketBaseUrl("https://pb.example.com");
    const fetchMock = vi.fn(async () =>
      mockJsonResponse({ choices: [{ message: { content: "OK" } }] }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const outcome = await testAiConnection(baseSettings({ accessMode: "official" }), {
      authSession: officialSession("token-1"),
    });

    expect(outcome.text).toBe("OK");
    expect(outcome.authSession?.accessToken).toBe("token-1");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith(
      "https://pb.example.com/api/rpx-ai/v1/chat/completions",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          Authorization: "Bearer token-1",
        }),
      }),
    );
    const requestBody = JSON.parse((fetchMock.mock.calls[0]![1] as RequestInit).body as string) as {
      model: string;
      messages: Array<{ role: string }>;
    };
    expect(requestBody.model).toBe("auto");
    expect(requestBody.messages[0]!.role).toBe("user");
  });

  it("translates gate 429 responses into the quota error", async () => {
    setActivePocketBaseUrl("https://pb.example.com");
    const fetchMock = vi.fn(async () =>
      mockJsonResponse(
        { error: { message: "Official AI daily quota exceeded." } },
        { status: 429 },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      testAiConnection(baseSettings({ accessMode: "official" }), {
        authSession: officialSession("token-1"),
      }),
    ).rejects.toMatchObject({ i18nKey: "errors.aiQuotaExceeded" });

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("refreshes the session and retries once after a gate 401", async () => {
    setActivePocketBaseUrl("https://pb.example.com");
    const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
      if (String(init?.url ?? _url).includes("/api/rpx-ai/")) {
        if (fetchMock.mock.calls.length === 1) {
          return mockJsonResponse(
            { message: "The request requires valid auth token." },
            { status: 401 },
          );
        }
        return mockJsonResponse({ choices: [{ message: { content: "OK" } }] });
      }
      return mockJsonResponse({
        token: fakeJwt({ id: "user_1", type: "auth", exp: Math.floor(Date.now() / 1000) + 3600 }),
        record: {
          id: "user_1",
          email: "user@example.com",
          collectionId: "pbc_users",
          collectionName: "users",
        },
      });
    });
    vi.stubGlobal("fetch", fetchMock);

    const outcome = await testAiConnection(baseSettings({ accessMode: "official" }), {
      authSession: officialSession("stale-token"),
    });

    expect(outcome.text).toBe("OK");
    expect(outcome.authSession?.accessToken).not.toBe("stale-token");
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("fetches official usage counters through the gate", async () => {
    setActivePocketBaseUrl("https://pb.example.com");
    const fetchMock = vi.fn(async () =>
      mockJsonResponse({ minuteUsed: 1, minuteLimit: 5, dayUsed: 7, dayLimit: 30 }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const { usage, authSession } = await fetchOfficialAiUsage(officialSession("token-1"));

    expect(fetchMock).toHaveBeenCalledWith(
      "https://pb.example.com/api/rpx-ai/usage",
      expect.objectContaining({
        method: "GET",
        headers: expect.objectContaining({
          Authorization: "Bearer token-1",
        }),
      }),
    );
    expect(usage).toEqual({ minuteUsed: 1, minuteLimit: 5, dayUsed: 7, dayLimit: 30 });
    expect(authSession.accessToken).toBe("token-1");
  });

  it("treats official mode as usable without an API key", () => {
    expect(hasUsableAiSettings({ accessMode: "official" })).toBe(true);
    expect(hasUsableAiSettings({ accessMode: "custom", apiKey: "" })).toBe(false);
  });
});
