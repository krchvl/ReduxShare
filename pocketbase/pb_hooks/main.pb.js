/// <reference path="../pb_data/types.d.ts" />

// TODO: fill before deploy; each group.name must exist in gpt-load and group.model must be a valid model id of that group
routerAdd(
  "POST",
  "/api/rpx-ai/v1/chat/completions",
  (e) => {
    const GPTLOAD_BASE_URL = "http://127.0.0.1:3011";
    const GPTLOAD_ACCESS_KEY = "SET_ME_PROXY_KEY";
    const GPTLOAD_TIMEOUT_SECONDS = 90;
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
          { name: "fxqidian", model: "deepseek-v4-flash", label: "FX Qidian Relay", weight: 1 },
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

      return { minuteCount: minuteCount, dayCount: dayCount };
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
    const groups = PLANS[plan].groups;

    consumeQuota($app, e.auth.id, PLANS[plan].limits);

    const explicitGroup = pickGroupByModel(groups, body.model);
    const attempts = explicitGroup ? [explicitGroup] : pickAttemptGroups(groups);
    let lastResponse = null;
    let transportError = null;

    for (const group of attempts) {
      const request = Object.assign({}, body, { model: group.model });

      let response;
      try {
        response = forwardToGateway(group, request);
      } catch {
        transportError = "transport failure";
        continue;
      }

      lastResponse = response;
      if (response.statusCode < 500 && response.statusCode !== 429) {
        return respondWithUpstream(e, response);
      }
    }

    if (lastResponse) {
      return respondWithUpstream(e, lastResponse);
    }

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
          { name: "fxqidian", model: "deepseek-v4-flash", label: "FX Qidian Relay", weight: 1 },
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
