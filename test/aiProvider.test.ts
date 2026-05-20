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
      "https://generativelanguage.googleapis.com/v1beta/models",
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
          "anthropic-version": "2023-06-01"
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

  it("tests Anthropic connections through the messages endpoint", async () => {
    const fetchMock = vi.fn(async () => mockJsonResponse({
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
          "anthropic-version": "2023-06-01"
        }),
        body: expect.stringContaining("\"model\":\"claude-sonnet-4-20250514\"")
      })
    );
  });
});
