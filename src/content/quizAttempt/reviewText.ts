export function splitReviewAnswerText(answerText: string) {
  return answerText
    .split(/\r?\n+|\s*\|\s*|\s*;\s*|\s*,\s*/g)
    .map((part) => part.replace(/\s+/g, " ").trim())
    .filter(Boolean);
}

export function splitReviewMatchPairText(answerText: string) {
  return answerText
    .split(/\r?\n+|\s*\|\s*|\s*;\s*|\s*,\s*/g)
    .map((part) => part.replace(/\s+/g, " ").trim())
    .filter(Boolean);
}

export function parseReviewMatchPairs(answerText: string) {
  return splitReviewMatchPairText(answerText)
    .map((part) => {
      const pieces = part.split(/\s*(?:→|->|=>|=)\s*/).map((piece) => piece.trim()).filter(Boolean);

      return pieces.length >= 2
        ? {
            prompt: pieces[0],
            answer: pieces.slice(1).join(" ")
          }
        : null;
    })
    .filter((pair): pair is { prompt: string; answer: string } => pair !== null);
}

export function getRightAnswerBodyText(rawText: string) {
  const normalizedText = rawText.replace(/\s+/g, " ").trim();
  const prefixedAnswerMatch =
    /^(?:the\s+correct\s+answers?\s+(?:is|are)|correct\s+answers?|правильн(?:ый|ые)\s+ответ(?:ы)?|верн(?:ый|ые)\s+ответ(?:ы)?)\s*[:：]\s*(.+)$/i.exec(
      normalizedText
    );

  if (prefixedAnswerMatch) {
    return prefixedAnswerMatch[1].trim();
  }

  const colonIndex = normalizedText.indexOf(":");

  return colonIndex >= 0 ? normalizedText.slice(colonIndex + 1).trim() : normalizedText;
}

export function cleanReviewDisplayedTextAnswer(value: string) {
  const cleaned = getRightAnswerBodyText(value)
    .replace(/^(?:answer|response|your answer|ответ|ваш ответ)\s*[:：]\s*/i, "")
    .replace(/\s+/g, " ")
    .trim();

  return /^(?:answer|response|your answer|ответ|ваш ответ|not answered|не отвечено|нет ответа)$/i.test(cleaned)
    ? ""
    : cleaned;
}
