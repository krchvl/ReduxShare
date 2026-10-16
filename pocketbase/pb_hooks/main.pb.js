/// <reference path="../pb_data/types.d.ts" />

// TODO: fill before deploy; each group.name must exist in gpt-load, group.model must be a valid model id of that group, and GPTLOAD_ACCESS_KEY must be replaced with the actual gpt-load proxy key
routerAdd(
  "POST",
  "/api/rpx-ai/v1/chat/completions",
  (e) => {
    const GPTLOAD_BASE_URL = "http://127.0.0.1:3011";
    const GPTLOAD_ACCESS_KEY = "SET_ME_PROXY_KEY";
    const GPTLOAD_TIMEOUT_SECONDS = 90;
    const USAGE_COLLECTION = "reduxshare_ai_usage";

    // Server-side limits to prevent resource abuse
    const MAX_MESSAGES = 20;
    const MAX_RESPONSE_TOKENS = 2048;

    const PLANS = {
      free: {
        groups: [
          { name: "groq", model: "openai/gpt-oss-20b", label: "GPT-OSS 20B", weight: 3 },
          { name: "groq", model: "openai/gpt-oss-120b", label: "GPT-OSS 120B", weight: 2 },
          { name: "groq", model: "qwen/qwen3.8-27b", label: "Qwen3.8 27B", weight: 2 },
          {
            name: "nararouter",
            model: "nemotron-3-ultra-free",
            label: "Nemotron 3 Ultra",
            weight: 2,
          },
          {
            name: "nararouter",
            model: "nemotron-3.5-lightning-free",
            label: "Nemotron 3.5 Lightning",
            weight: 2,
          },
          {
            name: "nararouter",
            model: "ling-3.0-flash-sante-free",
            label: "Ling 3.0 Flash",
            weight: 1,
          },
          {
            name: "nararouter",
            model: "nemotron-3-super-free",
            label: "Nemotron 3 Super",
            weight: 1,
          },
          { name: "fxqidian", model: "minimax-m2.7", label: "MiniMax M2.7", weight: 1 },
          {
            name: "sharellm",
            model: "deepseek-v4-flash",
            label: "DeepSeek V4 Flash",
            weight: 1,
          },
          {
            name: "sharellm",
            model: "deepseek-v4-flash-0731",
            label: "DeepSeek V4 Flash 0731",
            weight: 1,
          },
          { name: "sharellm", model: "glm-5.3-flash", label: "GLM 5.3 Flash", weight: 1 },
          { name: "sharellm", model: "gemini-3.7-flash", label: "Gemini 3.7 Flash", weight: 1 },
          { name: "sharellm", model: "gpt-6-astra", label: "GPT-6 Astra", weight: 1 },
          {
            name: "sharellm",
            model: "deepseek-v4.1-flash",
            label: "DeepSeek V4.1 Flash",
            weight: 1,
          },
          {
            name: "sharellm",
            model: "deepseek-v4-pro-0813",
            label: "DeepSeek V4 Pro 0813",
            weight: 1,
          },
          { name: "sharellm", model: "agnes-3.0-flash", label: "Agnes 3.0 Flash", weight: 1 },
          { name: "sharellm", model: "agnes-2.5-flash", label: "Agnes 2.5 Flash", weight: 1 },
        ],
        limits: { minute: 5, day: 30 },
      },
      low: {
        groups: [{ name: "groq", model: "openai/gpt-oss-20b", label: "GPT-OSS 20B", weight: 1 }],
        limits: { minute: 10, day: 50 },
      },
      medium: {
        groups: [{ name: "groq", model: "openai/gpt-oss-20b", label: "GPT-OSS 20B", weight: 1 }],
        limits: { minute: 20, day: 75 },
      },
      high: {
        groups: [{ name: "groq", model: "openai/gpt-oss-20b", label: "GPT-OSS 20B", weight: 1 }],
        limits: { minute: 30, day: 150 },
      },
    };

    function getUserPlan(e) {
      const raw = e.auth ? e.auth.getString("plan") : "";
      return PLANS[raw] ? raw : "free";
    }

    function sanitizeChatRequest(body) {
      if (!body || typeof body !== "object") {
        return body;
      }

      const sanitized = { ...body };

      if (typeof sanitized.max_tokens === "number") {
        sanitized.max_tokens = Math.min(
          MAX_RESPONSE_TOKENS,
          Math.max(1, Math.floor(sanitized.max_tokens)),
        );
      }

      if (Array.isArray(sanitized.messages)) {
        sanitized.messages = sanitized.messages.slice(0, MAX_MESSAGES);
      }

      return sanitized;
    }

    function toPocketDateString(date) {
      return date.toISOString().replace("T", " ");
    }

    const MOSCOW_OFFSET_MS = 3 * 60 * 60 * 1000;

    function periodStart(date, period) {
      if (period === "day") {
        const shifted = new Date(date.getTime() + MOSCOW_OFFSET_MS);
        const utcMidnight = Date.UTC(
          shifted.getUTCFullYear(),
          shifted.getUTCMonth(),
          shifted.getUTCDate(),
          0,
          0,
          0,
          0,
        );
        return toPocketDateString(new Date(utcMidnight - MOSCOW_OFFSET_MS));
      }

      const utc = Date.UTC(
        date.getUTCFullYear(),
        date.getUTCMonth(),
        date.getUTCDate(),
        date.getUTCHours(),
        date.getUTCMinutes(),
        0,
        0,
      );
      return toPocketDateString(new Date(utc));
    }

    function bumpUsage(app, userId, period, start) {
      let record;
      try {
        record = app.findFirstRecordByFilter(
          USAGE_COLLECTION,
          "user = {:user} && period = {:period} && period_start = {:start}",
          { user: userId, period: period, start: start },
        );
      } catch {
        record = null;
      }

      if (!record) {
        record = new Record(app.findCollectionByNameOrId(USAGE_COLLECTION));
        record.set("user", userId);
        record.set("period", period);
        record.set("period_start", start);
        record.set("count", 1);
      } else {
        record.set("count", record.getInt("count", 0) + 1);
      }

      app.save(record);
      return record.getInt("count", 0);
    }

    function consumeQuota(app, userId, limits) {
      const now = new Date();
      const minuteStart = periodStart(now, "minute");
      const dayStart = periodStart(now, "day");
      let minuteCount = 0;
      let dayCount = 0;

      app.runInTransaction((txApp) => {
        minuteCount = bumpUsage(txApp, userId, "minute", minuteStart);
        if (minuteCount > limits.minute) {
          throw new ApiError(429, "Official AI rate limit exceeded, retry within a minute.");
        }

        dayCount = bumpUsage(txApp, userId, "day", dayStart);
        if (dayCount > limits.day) {
          throw new ApiError(429, "Official AI daily quota exceeded.");
        }
      });

      return { minuteCount: minuteCount, dayCount: dayCount, dayStart: dayStart };
    }

    function refundDayQuota(app, userId, dayStart) {
      app.runInTransaction((txApp) => {
        let record;
        try {
          record = txApp.findFirstRecordByFilter(
            USAGE_COLLECTION,
            "user = {:user} && period = {:period} && period_start = {:start}",
            { user: userId, period: "day", start: dayStart },
          );
        } catch {
          record = null;
        }

        if (!record) {
          return;
        }

        record.set("count", Math.max(0, record.getInt("count", 0) - 1));
        txApp.save(record);
      });
    }

    function pickWeightedRandomGroup(groups, excludedModels) {
      const pool = groups.filter((group) => !excludedModels.includes(group.model));
      const candidates = pool.length > 0 ? pool : groups;
      const totalWeight = candidates.reduce(
        (sum, group) => sum + Math.max(1, group.weight || 1),
        0,
      );
      let roll = Math.random() * totalWeight;

      for (const group of candidates) {
        roll -= Math.max(1, group.weight || 1);
        if (roll < 0) {
          return group;
        }
      }

      return candidates[candidates.length - 1];
    }

    function pickGroupByModel(groups, model) {
      if (!model || typeof model !== "string") {
        return null;
      }

      const normalized = model.trim();
      return groups.find((group) => group.model.toLowerCase() === normalized.toLowerCase()) || null;
    }

    function pickAttemptGroups(groups) {
      const first = pickWeightedRandomGroup(groups, []);
      if (groups.length < 2) {
        return [first];
      }

      return [first, pickWeightedRandomGroup(groups, [first.model])];
    }

    function forwardToGateway(group, requestBody) {
      return $http.send({
        url: GPTLOAD_BASE_URL + "/proxy/" + group.name + "/v1/chat/completions",
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: "Bearer " + GPTLOAD_ACCESS_KEY,
        },
        body: JSON.stringify(requestBody),
        timeout: GPTLOAD_TIMEOUT_SECONDS,
      });
    }

    function respondWithUpstream(e, response) {
      if (
        response.json !== null &&
        response.json !== undefined &&
        typeof response.json === "object"
      ) {
        return e.json(response.statusCode, response.json);
      }

      return e.json(response.statusCode, {
        error: { message: response.raw || "Upstream returned an empty response." },
      });
    }

    const body = e.requestInfo().body;
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      throw new BadRequestError("Request body must be a JSON object.");
    }

    const plan = getUserPlan(e);
    const planGroups = PLANS[plan].groups;
    const hasModelFilter = Array.isArray(body.models);
    const requestedModels = hasModelFilter
      ? body.models
          .filter((value) => typeof value === "string" && value.trim() !== "")
          .map((value) => value.trim().toLowerCase())
      : [];
    const effectiveGroups = hasModelFilter
      ? planGroups.filter((group) => requestedModels.includes(group.model.toLowerCase()))
      : planGroups;

    if (effectiveGroups.length === 0) {
      return e.json(400, {
        error: {
          message:
            requestedModels.length === 0
              ? "Official AI model selection is empty: pick at least one model in the extension settings."
              : "Official AI model selection matches no model of your plan: pick an available model in the extension settings.",
        },
      });
    }

    const sanitizedBody = sanitizeChatRequest(body);
    const quota = consumeQuota($app, e.auth.id, PLANS[plan].limits);

    function failWithoutAnswer(status, message) {
      refundDayQuota($app, e.auth.id, quota.dayStart);
      return e.json(status, { error: { message: message } });
    }

    const explicitGroup = pickGroupByModel(effectiveGroups, body.model);
    const attempts = explicitGroup ? [explicitGroup] : pickAttemptGroups(effectiveGroups);
    let lastResponse = null;
    let transportError = null;

    for (const group of attempts) {
      const request = Object.assign({}, sanitizedBody, { model: group.model });

      let response;
      try {
        response = forwardToGateway(group, request);
      } catch {
        transportError = "transport failure";
        continue;
      }

      if (!response || typeof response.statusCode !== "number" || response.statusCode < 100) {
        transportError = "transport failure";
        continue;
      }

      lastResponse = response;
      const status = response.statusCode;

      if (status >= 500 || status === 429 || status === 401 || status === 403) {
        continue;
      }

      if (status >= 300) {
        refundDayQuota($app, e.auth.id, quota.dayStart);
      }

      return respondWithUpstream(e, response);
    }

    if (lastResponse) {
      if (lastResponse.statusCode === 429) {
        return failWithoutAnswer(
          503,
          "All upstream AI providers are currently rate-limited, try again later.",
        );
      }

      if (lastResponse.statusCode === 401 || lastResponse.statusCode === 403) {
        return failWithoutAnswer(
          502,
          "All upstream AI providers rejected the gateway credentials.",
        );
      }

      refundDayQuota($app, e.auth.id, quota.dayStart);
      return respondWithUpstream(e, lastResponse);
    }

    refundDayQuota($app, e.auth.id, quota.dayStart);
    throw new ApiError(
      502,
      "Official AI gateway is unreachable" + (transportError ? ": " + transportError : "."),
    );
  },
  $apis.requireAuth(),
);

routerAdd(
  "GET",
  "/api/rpx-ai/usage",
  (e) => {
    const USAGE_COLLECTION = "reduxshare_ai_usage";
    const PLANS = {
      free: {
        groups: [
          { name: "groq", model: "openai/gpt-oss-20b", label: "GPT-OSS 20B", weight: 3 },
          { name: "groq", model: "openai/gpt-oss-120b", label: "GPT-OSS 120B", weight: 2 },
          { name: "groq", model: "qwen/qwen3.8-27b", label: "Qwen3.8 27B", weight: 2 },
          {
            name: "nararouter",
            model: "nemotron-3-ultra-free",
            label: "Nemotron 3 Ultra",
            weight: 2,
          },
          {
            name: "nararouter",
            model: "nemotron-3.5-lightning-free",
            label: "Nemotron 3.5 Lightning",
            weight: 2,
          },
          {
            name: "nararouter",
            model: "ling-3.0-flash-sante-free",
            label: "Ling 3.0 Flash",
            weight: 1,
          },
          {
            name: "nararouter",
            model: "nemotron-3-super-free",
            label: "Nemotron 3 Super",
            weight: 1,
          },
          { name: "fxqidian", model: "minimax-m2.7", label: "MiniMax M2.7", weight: 1 },
          {
            name: "sharellm",
            model: "deepseek-v4-flash",
            label: "DeepSeek V4 Flash",
            weight: 1,
          },
          {
            name: "sharellm",
            model: "deepseek-v4-flash-0731",
            label: "DeepSeek V4 Flash 0731",
            weight: 1,
          },
          { name: "sharellm", model: "glm-5.3-flash", label: "GLM 5.3 Flash", weight: 1 },
          { name: "sharellm", model: "gemini-3.7-flash", label: "Gemini 3.7 Flash", weight: 1 },
          { name: "sharellm", model: "gpt-6-astra", label: "GPT-6 Astra", weight: 1 },
          {
            name: "sharellm",
            model: "deepseek-v4.1-flash",
            label: "DeepSeek V4.1 Flash",
            weight: 1,
          },
          {
            name: "sharellm",
            model: "deepseek-v4-pro-0813",
            label: "DeepSeek V4 Pro 0813",
            weight: 1,
          },
          { name: "sharellm", model: "agnes-3.0-flash", label: "Agnes 3.0 Flash", weight: 1 },
          { name: "sharellm", model: "agnes-2.5-flash", label: "Agnes 2.5 Flash", weight: 1 },
        ],
        limits: { minute: 5, day: 30 },
      },
      low: {
        groups: [{ name: "groq", model: "openai/gpt-oss-20b", label: "GPT-OSS 20B", weight: 1 }],
        limits: { minute: 10, day: 50 },
      },
      medium: {
        groups: [{ name: "groq", model: "openai/gpt-oss-20b", label: "GPT-OSS 20B", weight: 1 }],
        limits: { minute: 20, day: 75 },
      },
      high: {
        groups: [{ name: "groq", model: "openai/gpt-oss-20b", label: "GPT-OSS 20B", weight: 1 }],
        limits: { minute: 30, day: 150 },
      },
    };

    function getUserPlan(e) {
      const raw = e.auth ? e.auth.getString("plan") : "";
      return PLANS[raw] ? raw : "free";
    }

    function toPocketDateString(date) {
      return date.toISOString().replace("T", " ");
    }

    const MOSCOW_OFFSET_MS = 3 * 60 * 60 * 1000;

    function periodStart(date, period) {
      if (period === "day") {
        const shifted = new Date(date.getTime() + MOSCOW_OFFSET_MS);
        const utcMidnight = Date.UTC(
          shifted.getUTCFullYear(),
          shifted.getUTCMonth(),
          shifted.getUTCDate(),
          0,
          0,
          0,
          0,
        );
        return toPocketDateString(new Date(utcMidnight - MOSCOW_OFFSET_MS));
      }

      const utc = Date.UTC(
        date.getUTCFullYear(),
        date.getUTCMonth(),
        date.getUTCDate(),
        date.getUTCHours(),
        date.getUTCMinutes(),
        0,
        0,
      );
      return toPocketDateString(new Date(utc));
    }

    function countUsage(app, userId, period, start) {
      try {
        const record = app.findFirstRecordByFilter(
          USAGE_COLLECTION,
          "user = {:user} && period = {:period} && period_start = {:start}",
          { user: userId, period: period, start: start },
        );
        return record.getInt("count", 0);
      } catch {
        return 0;
      }
    }

    const plan = getUserPlan(e);
    const now = new Date();
    const seenModels = [];
    const models = [];

    for (const group of PLANS[plan].groups) {
      if (seenModels.indexOf(group.model) !== -1) {
        continue;
      }

      seenModels.push(group.model);
      models.push({ model: group.model, label: group.label || group.model });
    }

    return e.json(200, {
      plan: plan,
      models: models,
      minuteUsed: countUsage($app, e.auth.id, "minute", periodStart(now, "minute")),
      minuteLimit: PLANS[plan].limits.minute,
      dayUsed: countUsage($app, e.auth.id, "day", periodStart(now, "day")),
      dayLimit: PLANS[plan].limits.day,
    });
  },
  $apis.requireAuth(),
);

cronAdd("rpx_ai_usage_cleanup", "0 3 * * *", () => {
  const cutoff = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString().replace("T", " ");
  const now = new Date().toISOString().replace("T", " ");
  $app
    .db()
    .newQuery(
      "DELETE FROM reduxshare_ai_usage WHERE (period = 'minute' AND period_start < {:now}) OR (period = 'day' AND period_start < {:cutoff})",
    )
    .bind({ now: now, cutoff: cutoff })
    .execute();
});
