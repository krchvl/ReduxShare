/// <reference path="../pb_data/types.d.ts" />

// TODO: fill before deploy; each group.model must exist in a matching gpt-load group bound to the AccessKey
const GPTLOAD_BASE_URL = "http://127.0.0.1:3001";
const GPTLOAD_ACCESS_KEY = "SET_ME";
const GPTLOAD_TIMEOUT_SECONDS = 90;
const USAGE_COLLECTION = "reduxshare_ai_usage";
const LIMITS = { minute: 5, day: 30 };
const GROUPS = [
  { model: "SET_ME_PROVIDER_1_MODEL", weight: 1 },
  { model: "SET_ME_PROVIDER_2_MODEL", weight: 1 },
];

function toPocketDateString(date) {
  return date.toISOString().replace("T", " ");
}

function periodStart(date, period) {
  const utc = Date.UTC(
    date.getUTCFullYear(),
    date.getUTCMonth(),
    date.getUTCDate(),
    period === "day" ? 0 : date.getUTCHours(),
    period === "day" ? 0 : date.getUTCMinutes(),
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

function consumeQuota(app, userId) {
  const now = new Date();
  const minuteStart = periodStart(now, "minute");
  const dayStart = periodStart(now, "day");
  let minuteCount = 0;
  let dayCount = 0;

  app.runInTransaction((txApp) => {
    minuteCount = bumpUsage(txApp, userId, "minute", minuteStart);
    if (minuteCount > LIMITS.minute) {
      throw new ApiError(429, "Official AI rate limit exceeded, retry within a minute.");
    }

    dayCount = bumpUsage(txApp, userId, "day", dayStart);
    if (dayCount > LIMITS.day) {
      throw new ApiError(429, "Official AI daily quota exceeded.");
    }
  });

  return { minuteCount: minuteCount, dayCount: dayCount };
}

function pickWeightedRandomGroup(excludedModels) {
  const pool = GROUPS.filter((group) => !excludedModels.includes(group.model));
  const candidates = pool.length > 0 ? pool : GROUPS;
  const totalWeight = candidates.reduce((sum, group) => sum + Math.max(1, group.weight || 1), 0);
  let roll = Math.random() * totalWeight;

  for (const group of candidates) {
    roll -= Math.max(1, group.weight || 1);
    if (roll < 0) {
      return group;
    }
  }

  return candidates[candidates.length - 1];
}

function findGroupByModel(model) {
  if (!model || typeof model !== "string") {
    return null;
  }

  const normalized = model.trim().toLowerCase();
  return GROUPS.find((group) => group.model.toLowerCase() === normalized) || null;
}

function pickAttemptGroups() {
  const first = pickWeightedRandomGroup([]);
  if (GROUPS.length < 2) {
    return [first];
  }

  return [first, pickWeightedRandomGroup([first.model])];
}

function forwardToGateway(requestBody) {
  return $http.send({
    url: GPTLOAD_BASE_URL + "/v1/chat/completions",
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
  if (response.json !== null && response.json !== undefined && typeof response.json === "object") {
    return e.json(response.statusCode, response.json);
  }

  return e.json(response.statusCode, {
    error: { message: response.raw || "Upstream returned an empty response." },
  });
}

routerAdd(
  "POST",
  "/api/rpx-ai/v1/chat/completions",
  (e) => {
    const body = e.requestInfo().body;
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      throw new BadRequestError("Request body must be a JSON object.");
    }

    consumeQuota(e.app, e.auth.id);

    const explicitGroup = findGroupByModel(body.model);
    const attempts = explicitGroup ? [explicitGroup] : pickAttemptGroups();
    let lastResponse = null;
    let transportError = null;

    for (const group of attempts) {
      const request = Object.assign({}, body, { model: group.model });

      let response;
      try {
        response = forwardToGateway(request);
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
    const now = new Date();
    return e.json(200, {
      minuteUsed: countUsage(e.app, e.auth.id, "minute", periodStart(now, "minute")),
      minuteLimit: LIMITS.minute,
      dayUsed: countUsage(e.app, e.auth.id, "day", periodStart(now, "day")),
      dayLimit: LIMITS.day,
    });
  },
  $apis.requireAuth(),
);

cronAdd("rpx_ai_usage_cleanup", "0 3 * * *", () => {
  const cutoff = periodStart(new Date(Date.now() - 2 * 24 * 60 * 60 * 1000), "day");
  $app
    .db()
    .newQuery(
      "DELETE FROM reduxshare_ai_usage WHERE (period = 'minute' AND period_start < {:now}) OR (period = 'day' AND period_start < {:cutoff})",
    )
    .bind({ now: toPocketDateString(new Date()), cutoff: cutoff })
    .execute();
});
