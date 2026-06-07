import type { MoodleConfig, StoredStateLike } from "./model";

function extractBalancedObject(source: string, startIndex: number) {
  let depth = 0;
  let inString = false;
  let stringQuote = "";
  let escaped = false;

  for (let index = startIndex; index < source.length; index += 1) {
    const char = source[index];

    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (char === "\\") {
        escaped = true;
      } else if (char === stringQuote) {
        inString = false;
      }

      continue;
    }

    if (char === "\"" || char === "'") {
      inString = true;
      stringQuote = char;
      continue;
    }

    if (char === "{") {
      depth += 1;
    }

    if (char === "}") {
      depth -= 1;

      if (depth === 0) {
        return source.slice(startIndex, index + 1);
      }
    }
  }

  return null;
}

export function parseMoodleNumericId(value: string | null | undefined) {
  const normalizedValue = value?.trim() ?? "";

  if (!/^\d+$/.test(normalizedValue)) {
    return null;
  }

  const parsedValue = Number.parseInt(normalizedValue, 10);
  return Number.isFinite(parsedValue) ? parsedValue : null;
}

export function findMoodleConfig(): MoodleConfig | null {
  const scripts = Array.from(document.scripts);

  for (const script of scripts) {
    const scriptText = script.textContent ?? "";
    const cfgIndex = scriptText.indexOf("M.cfg");

    if (cfgIndex < 0 || (!scriptText.includes("courseId") && !scriptText.includes("contextInstanceId"))) {
      continue;
    }

    const objectStart = scriptText.indexOf("{", cfgIndex);

    if (objectStart < 0) {
      continue;
    }

    const objectSource = extractBalancedObject(scriptText, objectStart);

    if (!objectSource) {
      continue;
    }

    try {
      const parsedConfig = JSON.parse(objectSource) as Record<string, unknown>;
      const courseId =
        typeof parsedConfig.courseId === "number" ? parsedConfig.courseId : parseMoodleNumericId(String(parsedConfig.courseId ?? ""));
      const contextInstanceId =
        typeof parsedConfig.contextInstanceId === "number"
          ? parsedConfig.contextInstanceId
          : parseMoodleNumericId(String(parsedConfig.contextInstanceId ?? ""));

      return {
        courseId,
        contextInstanceId
      };
    } catch {
      continue;
    }
  }

  return null;
}

export function findMoodleModuleIdFromPage() {
  try {
    const url = new URL(window.location.href);
    const urlModuleId = parseMoodleNumericId(url.searchParams.get("cmid") ?? url.searchParams.get("id"));

    if (urlModuleId !== null) {
      return urlModuleId;
    }
  } catch {
    // Continue with DOM fallback.
  }

  for (const link of Array.from(document.querySelectorAll<HTMLAnchorElement>('a[href*="cmid="], a[href*="/mod/quiz/"]'))) {
    try {
      const linkUrl = new URL(link.href, window.location.href);
      const linkModuleId = parseMoodleNumericId(linkUrl.searchParams.get("cmid") ?? linkUrl.searchParams.get("id"));

      if (linkModuleId !== null) {
        return linkModuleId;
      }
    } catch {
      continue;
    }
  }

  return null;
}

export function getReviewSaveMoodleConfig(storedState: StoredStateLike | undefined): MoodleConfig {
  const moodleConfig = findMoodleConfig();
  const latestContext = storedState?.latestQuizAttemptContext;

  return {
    courseId: moodleConfig?.courseId ?? latestContext?.courseId ?? null,
    contextInstanceId: moodleConfig?.contextInstanceId ?? latestContext?.contextInstanceId ?? findMoodleModuleIdFromPage()
  };
}
