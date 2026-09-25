export function splitAiMatchPairText(text: string) {
  return text
    .replace(/\r/g, "\n")
    .split(/\n|;|,(?=\s*[^,;:\n]+(?:→|->|=>|=|:))/g)
    .map((segment) => segment.trim())
    .filter(Boolean);
}

export function parseAiMatchPairs(text: string) {
  return splitAiMatchPairText(text)
    .map((segment) => {
      const match = /^(.+?)\s*(?:→|->|=>|=|:)\s*(.+)$/.exec(segment);
      if (!match) {
        return null;
      }

      return {
        prompt: match[1].replace(/^["'{\s]+|["'}]\s*$/g, "").trim(),
        answer: match[2].replace(/^["'\s]+|["'}]\s*$/g, "").trim(),
      };
    })
    .filter((pair): pair is { prompt: string; answer: string } =>
      Boolean(pair?.prompt && pair.answer),
    );
}

export function getBooleanSuggestionValue(label: string) {
  const normalizedLabel = label.trim().toLowerCase();

  if (normalizedLabel === "true") {
    return true;
  }

  if (normalizedLabel === "false") {
    return false;
  }

  return null;
}
