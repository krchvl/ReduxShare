import { ANSWER_WIDGET_ATTR } from "../model";

export function splitSequentialAnswerLabels(labels: string[], expectedCount: number) {
  if (labels.length !== 1 || expectedCount <= 1) {
    return labels;
  }

  const [label] = labels;
  const delimiters = [/\r?\n+/, /\s*\|\s*/, /\s*;\s*/, /\s+→\s+/, /\s+->\s+/];

  for (const delimiter of delimiters) {
    const parts = label.split(delimiter).map((part) => part.trim()).filter(Boolean);

    if (parts.length === expectedCount) {
      return parts;
    }
  }

  return labels;
}

export function normalizeFingerprintText(value: string) {
  return value
    .replace(/\u00a0/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

export function stableHashText(value: string) {
  let hash = 0x811c9dc5;

  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }

  return (hash >>> 0).toString(16).padStart(8, "0");
}

export function getUniqueTexts(values: string[]) {
  const seen = new Set<string>();
  const uniqueValues: string[] = [];

  for (const value of values) {
    const trimmedValue = value.replace(/\s+/g, " ").trim();
    const key = normalizeFingerprintText(trimmedValue);

    if (!key || seen.has(key)) {
      continue;
    }

    seen.add(key);
    uniqueValues.push(trimmedValue);
  }

  return uniqueValues;
}

export function getMoodleAnswerLabelText(container: Element) {
  const cached = (container as any)._reduxshareLabelCache;
  if (cached !== undefined) {
    return cached;
  }

  const clonedContainer = container.cloneNode(true);

  if (!(clonedContainer instanceof Element)) {
    return container.textContent ?? "";
  }

  clonedContainer.querySelectorAll(
    ".answernumber, .sr-only, .accesshide, .visually-hidden, [data-reduxshare-answer-widget]"
  ).forEach((node) => {
    node.remove();
  });

  const text = clonedContainer.textContent ?? "";
  (container as any)._reduxshareLabelCache = text;
  return text;
}

export function getQuestionText(questionNode: Element) {
  const qTextNode = questionNode.querySelector(".qtext");

  if (qTextNode) {
    if (questionNode.classList.contains("ordering")) {
      const clonedQtext = qTextNode.cloneNode(true);

      if (clonedQtext instanceof Element) {
        clonedQtext.querySelectorAll(
          [
            ".ablock",
            ".answer",
            ".sortablelist",
            "input",
            "select",
            "textarea",
            "button",
            `[${ANSWER_WIDGET_ATTR}="true"]`
          ].join(",")
        ).forEach((node) => {
          node.remove();
        });

        return getMoodleAnswerLabelText(clonedQtext).replace(/\s+/g, " ").trim();
      }
    }

    return getMoodleAnswerLabelText(qTextNode).replace(/\s+/g, " ").trim();
  }

  if (questionNode.classList.contains("multianswer")) {
    const formulationNode = questionNode.querySelector(".formulation");
    const clonedFormulation = formulationNode?.cloneNode(true);

    if (clonedFormulation instanceof Element) {
      clonedFormulation.querySelectorAll(
        [
          "input",
          "select",
          "textarea",
          "button",
          ".feedbacktrigger",
          ".validationerror",
          `[${ANSWER_WIDGET_ATTR}="true"]`
        ].join(",")
      ).forEach((node) => node.remove());
      clonedFormulation.querySelectorAll("br").forEach((node) => node.replaceWith(" "));
      clonedFormulation.querySelectorAll("p, div").forEach((node) => node.append(document.createTextNode(" ")));

      return getMoodleAnswerLabelText(clonedFormulation).replace(/\s+/g, " ").trim();
    }
  }

  return getMoodleAnswerLabelText(questionNode).replace(/\s+/g, " ").trim();
}

export function getSelectOptionLabel(option: HTMLOptionElement) {
  return (option.textContent ?? option.label).replace(/\s+/g, " ").trim();
}

export function getImageIdentityLabel(image: HTMLImageElement) {
  const rawSrc = image.currentSrc || image.getAttribute("src") || "";

  if (rawSrc.trim()) {
    try {
      const url = new URL(rawSrc, window.location.href);
      const pathParts = url.pathname.split("/").filter(Boolean);
      const componentIndex = pathParts.indexOf("qtype_match");

      if (componentIndex >= 0 && pathParts[componentIndex + 1] === "subquestion" && pathParts.length >= 2) {
        const stableParts = [
          "qtype_match",
          "subquestion",
          ...pathParts.slice(Math.max(componentIndex + 2, pathParts.length - 2))
        ];

        return `image:${stableParts.join("/")}`;
      }

      return `image:${url.pathname}`;
    } catch {
      return `image:${rawSrc.trim()}`;
    }
  }

  const alt = image.getAttribute("alt")?.trim();

  if (alt) {
    return alt;
  }

  return "";
}

export function getElementImageIdentityLabels(container: Element) {
  return Array.from(container.querySelectorAll<HTMLImageElement>("img"))
    .map(getImageIdentityLabel)
    .filter(Boolean);
}

export function getMoodleAnswerLabelTextOrImageIdentity(container: Element) {
  const textLabel = getMoodleAnswerLabelText(container).replace(/\s+/g, " ").trim();

  if (textLabel) {
    return textLabel;
  }

  return getElementImageIdentityLabels(container)[0] ?? "";
}

export function isPlaceholderSelectOption(option: HTMLOptionElement) {
  const optionLabel = getSelectOptionLabel(option).toLowerCase();

  if (!option.value) {
    return true;
  }

  return option.value === "0" && /^(choose|choose\.{3}|select|select\.{3}|выберите|выберите\.{3}|-+)$/.test(optionLabel);
}

export function normalizeAnswerLabel(label: string) {
  return label
    .replace(/\u00a0/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

export function stripMoodleAnswerPrefix(label: string) {
  return label.replace(/^(?:[a-zа-яё]|\d{1,3})\s*[\.)]\s+/iu, "");
}

export function getAnswerLabelMatchKeys(label: string) {
  const normalizedLabel = normalizeAnswerLabel(label);
  const normalizedWithoutPrefix = normalizeAnswerLabel(stripMoodleAnswerPrefix(normalizedLabel));
  const imagePathMatch = /^image:(.+)$/i.exec(normalizedLabel);
  const imagePathParts = imagePathMatch?.[1]?.split(/[/?#]/).filter(Boolean) ?? [];
  const imageBasename = imagePathParts[imagePathParts.length - 1] ?? "";

  return new Set([normalizedLabel, normalizedWithoutPrefix, imageBasename ? `image:${imageBasename}` : ""].filter(Boolean));
}

export function getClassNumber(element: Element, prefix: string) {
  for (const className of Array.from(element.classList)) {
    const match = new RegExp(`^${prefix}(\\d+)$`).exec(className);

    if (match) {
      return Number.parseInt(match[1], 10);
    }
  }

  return null;
}

export function labelsMatch(left: string, right: string) {
  if (!left || !right) {
    return false;
  }

  const leftKeys = getAnswerLabelMatchKeys(left);
  const rightKeys = getAnswerLabelMatchKeys(right);
  return [...leftKeys].some((key) => rightKeys.has(key));
}

export function javaStringHashCode(value: string) {
  let hash = 0;

  for (let index = 0; index < value.length; index += 1) {
    hash = (Math.imul(31, hash) + value.charCodeAt(index)) | 0;
  }

  return hash;
}

export function cleanHashSource(value: string) {
  return value.replace(/^ +| +$|\\n|\n/g, "");
}

export function getImageFileName(imageSrc: string) {
  const separator = imageSrc.lastIndexOf("/");
  return separator >= 0 ? imageSrc.slice(separator + 1) : imageSrc;
}

/**
 * Mirrors the external provider's image anchor: a Java-style hash of the
 * file name plus alt text, e.g. anchor ["", "-1510145339"] matches
 * icon22.png with an empty alt. The JSON shape ({fn, alt}, no spaces)
 * must stay byte-identical to the provider's computation.
 */
export function hashQuestionImage(imageSrc: string, imageAlt: string) {
  return javaStringHashCode(
    JSON.stringify({ fn: cleanHashSource(getImageFileName(imageSrc)), alt: imageAlt })
  ).toString();
}

export function levenshteinDistance(left: string, right: string) {
  const leftChars = Array.from(left);
  const rightChars = Array.from(right);

  if (leftChars.length === 0) {
    return rightChars.length;
  }

  if (rightChars.length === 0) {
    return leftChars.length;
  }

  let previousRow = [0, ...rightChars.map((_, index) => index + 1)];

  for (let i = 0; i < leftChars.length; i += 1) {
    let diagonal = i;
    const currentRow: number[] = [i + 1];

    for (let j = 0; j < rightChars.length; j += 1) {
      const substitutionCost = leftChars[i] === rightChars[j] ? 0 : 1;
      const next = Math.min(previousRow[j + 1] + 1, currentRow[j] + 1, diagonal + substitutionCost);
      diagonal = previousRow[j + 1];
      currentRow.push(next);
    }

    previousRow = currentRow;
  }

  return previousRow[rightChars.length];
}

export interface ClosestLabelMatch {
  match: string;
  index: number;
  distance: number;
}

/**
 * Typo-tolerant fallback mirroring the external provider rule: the closest
 * candidate wins only when it is strictly closer than every other candidate
 * and at most half-different. Pure numbers must match exactly ("1991" vs
 * "1992" is a different answer, not a typo).
 */
export function findClosestLabel(target: string, candidates: readonly string[]): ClosestLabelMatch | null {
  const normalizedTarget = normalizeAnswerLabel(target);

  if (!normalizedTarget) {
    return null;
  }

  const targetIsNumeric = /^\d+$/.test(normalizedTarget);
  let best: ClosestLabelMatch | null = null;
  let tied = false;

  candidates.forEach((candidate, index) => {
    const normalizedCandidate = normalizeAnswerLabel(candidate);

    if (!normalizedCandidate) {
      return;
    }

    if (targetIsNumeric || /^\d+$/.test(normalizedCandidate)) {
      if (normalizedTarget !== normalizedCandidate) {
        return;
      }
    }

    const distance = levenshteinDistance(normalizedTarget, normalizedCandidate);

    if (distance * 2 > Math.max(normalizedTarget.length, normalizedCandidate.length)) {
      return;
    }

    if (best === null || distance < best.distance) {
      best = { match: candidate, index, distance };
      tied = false;
    } else if (distance === best.distance) {
      tied = true;
    }
  });

  return tied ? null : best;
}

export function itemLabelMatches<T extends { label: string }>(item: T, label: string) {
  return labelsMatch(item.label, label);
}
