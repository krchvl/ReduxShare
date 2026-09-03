import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchAiModelOptions, testAiConnection } from "../src/lib/aiProvider";
import type { AiSettings } from "../src/types";

function baseSettings(overrides: Partial<AiSettings> = {}): AiSettings {
  return {
    provider: "google",
    model: "gemini-2.5-flash",
    apiKey: "test-api-key",
    connectionVerified: true,
    verifiedAt: null,
    customEndpoint: "",
    customModelName: "",
    ...overrides
  };
}

function mockJsonResponse(body: unknown, init?: ResponseInit) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: {
      "Content-Type": "application/json"
    },
    ...init
  });
}

describe("AI provider integration", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("loads Google model options through the Gemini models endpoint and filters non-chat models", async () => {
    const fetchMock = vi.fn(async () => mockJsonResponse({
      models: [
        {
          name: "models/gemini-2.5-pro",
          displayName: "Gemini 2.5 Pro",
          supportedGenerationMethods: ["generateContent"]
        },
        {
          name: "models/text-embedding-004",
          supportedGenerationMethods: ["embedContent"]
        }
      ]
    }));
    vi.stubGlobal("fetch", fetchMock);

    const models = await fetchAiModelOptions(baseSettings({
      provider: "google"
    }));

    expect(fetchMock).toHaveBeenCalledWith(
      "https://generativelanguage.googleapis.com/v1beta/models?pageSize=100",
      expect.objectContaining({
        method: "GET",
        headers: expect.objectContaining({
          Accept: "application/json",
          "x-goog-api-key": "test-api-key"
        })
      })
    );
    expect(models).toEqual([
      {
        value: "gemini-2.5-pro",
        label: "Gemini 2.5 Pro"
      }
    ]);
  });

  it("loads OpenRouter models without forcing an Authorization header when the API key is empty", async () => {
    const fetchMock = vi.fn(async () => mockJsonResponse({
      data: [
        { id: "openai/gpt-5.5", name: "GPT-5.5" },
        { id: "text-embedding-3-large", name: "Embeddings" }
      ]
    }));
    vi.stubGlobal("fetch", fetchMock);

    const models = await fetchAiModelOptions(baseSettings({
      provider: "openrouter",
      apiKey: ""
    }));

    expect(fetchMock).toHaveBeenCalledWith(
      "https://openrouter.ai/api/v1/models",
      expect.objectContaining({
        method: "GET",
        headers: {
          Accept: "application/json"
        }
      })
    );
    expect(models).toEqual([
      {
        value: "openai/gpt-5.5",
        label: "GPT-5.5"
      }
    ]);
  });

  it("loads Anthropic models with the required version and api-key headers", async () => {
    const fetchMock = vi.fn(async () => mockJsonResponse({
      data: [
        {
          id: "claude-sonnet-4-20250514",
          display_name: "Claude Sonnet 4"
        }
      ]
    }));
    vi.stubGlobal("fetch", fetchMock);

    const models = await fetchAiModelOptions(baseSettings({
      provider: "anthropic",
      model: "claude-sonnet-4-20250514"
    }));

    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.anthropic.com/v1/models",
      expect.objectContaining({
        method: "GET",
        headers: expect.objectContaining({
          Accept: "application/json",
          "x-api-key": "test-api-key",
          "anthropic-version": "2023-06-01",
          "anthropic-dangerous-direct-browser-access": "true"
        })
      })
    );
    expect(models).toEqual([
      {
        value: "claude-sonnet-4-20250514",
        label: "Claude Sonnet 4"
      }
    ]);
  });

  it("tests OpenAI-compatible provider connections through chat completions", async () => {
    const fetchMock = vi.fn(async () => mockJsonResponse({
      choices: [
        {
          message: {
            content: "OK"
          }
        }
      ]
    }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await testAiConnection(baseSettings({
      provider: "openai",
      model: "gpt-5.5"
    }));

    expect(result).toBe("OK");
    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.openai.com/v1/chat/completions",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          "Content-Type": "application/json",
          Authorization: "Bearer test-api-key"
        }),
        body: expect.stringContaining("\"model\":\"gpt-5.5\"")
      })
    );
    expect(fetchMock.mock.calls[0]?.[1]?.body).toContain("Reply with exactly: OK");
  });

  it("tests custom provider connections through the custom endpoint and custom model name", async () => {
    const fetchMock = vi.fn(async () => mockJsonResponse({
      choices: [
        {
          message: {
            content: "OK"
          }
        }
      ]
    }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await testAiConnection(baseSettings({
      provider: "custom",
      model: "ignored-default-model",
      customEndpoint: "https://example.com/v1/chat/completions",
      customModelName: "custom-model"
    }));

    expect(result).toBe("OK");
    expect(fetchMock).toHaveBeenCalledWith(
      "https://example.com/v1/chat/completions",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          "Content-Type": "application/json",
          Authorization: "Bearer test-api-key"
        }),
        body: expect.stringContaining("\"model\":\"custom-model\"")
      })
    );
  });

  it("tests Anthropic connections through the messages endpoint", async () => {    const fetchMock = vi.fn(async () => mockJsonResponse({
      content: [
        {
          type: "text",
          text: "OK"
        }
      ]
    }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await testAiConnection(baseSettings({
      provider: "anthropic",
      model: "claude-sonnet-4-20250514"
    }));

    expect(result).toBe("OK");
    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.anthropic.com/v1/messages",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          "Content-Type": "application/json",
          "x-api-key": "test-api-key",
          "anthropic-version": "2023-06-01",
          "anthropic-dangerous-direct-browser-access": "true"
        }),
        body: expect.stringContaining("\"model\":\"claude-sonnet-4-20250514\"")
      })
    );
  });

  it.each([
    {
      provider: "openai",
      endpoint: "https://api.openai.com/v1/models",
      body: { data: [{ id: "gpt-5.5" }, { id: "whisper-1" }] },
      expected: [{ value: "gpt-5.5", label: "gpt-5.5" }]
    },
    {
      provider: "groq",
      endpoint: "https://api.groq.com/openai/v1/models",
      body: { data: [{ id: "llama-3.1-8b-instant" }, { id: "whisper-large-v3-turbo" }] },
      expected: [{ value: "llama-3.1-8b-instant", label: "llama-3.1-8b-instant" }]
    },
    {
      provider: "mistral",
      endpoint: "https://api.mistral.ai/v1/models",
      body: { data: [{ id: "mistral-large-latest" }] },
      expected: [{ value: "mistral-large-latest", label: "mistral-large-latest" }]
    },
    {
      provider: "xai",
      endpoint: "https://api.x.ai/v1/models",
      body: { data: [{ id: "grok-4.3" }] },
      expected: [{ value: "grok-4.3", label: "grok-4.3" }]
    },
    {
      provider: "deepseek",
      endpoint: "https://api.deepseek.com/models",
      body: { data: [{ id: "deepseek-v4-flash" }] },
      expected: [{ value: "deepseek-v4-flash", label: "deepseek-v4-flash" }]
    }
  ] as const)("loads $provider models through its list endpoint with a bearer key", async ({ provider, endpoint, body, expected }) => {
    const fetchMock = vi.fn(async () => mockJsonResponse(body));
    vi.stubGlobal("fetch", fetchMock);

    const models = await fetchAiModelOptions(baseSettings({ provider }));

    expect(fetchMock).toHaveBeenCalledWith(
      endpoint,
      expect.objectContaining({
        method: "GET",
        headers: expect.objectContaining({ Authorization: "Bearer test-api-key" })
      })
    );
    expect(models).toEqual(expected);
  });

  it("follows Google model list pagination", async () => {
    const fetchMock = vi.fn(async (url: string) => {
      if (String(url).includes("pageToken=next-page")) {
        return mockJsonResponse({
          models: [{ name: "models/gemini-2.5-flash", displayName: "Gemini 2.5 Flash", supportedGenerationMethods: ["generateContent"] }]
        });
      }

      return mockJsonResponse({
        models: [{ name: "models/gemini-2.5-pro", displayName: "Gemini 2.5 Pro", supportedGenerationMethods: ["generateContent"] }],
        nextPageToken: "next-page"
      });
    });
    vi.stubGlobal("fetch", fetchMock);

    const models = await fetchAiModelOptions(baseSettings({ provider: "google" }));

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(models).toEqual([
      { value: "gemini-2.5-pro", label: "Gemini 2.5 Pro" },
      { value: "gemini-2.5-flash", label: "Gemini 2.5 Flash" }
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
          })
      )
    );

    await expect(fetchAiModelOptions(baseSettings({ provider: "openai" }), 20)).rejects.toThrow(
      "OpenAI model list request timed out."
    );
  });
});
