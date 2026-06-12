import { ANSWER_WIDGET_ATTR } from "./model";

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
  const clonedContainer = container.cloneNode(true);

  if (!(clonedContainer instanceof Element)) {
    return container.textContent ?? "";
  }

  clonedContainer.querySelectorAll(
    ".answernumber, .sr-only, .accesshide, .visually-hidden, [data-reduxshare-answer-widget]"
  ).forEach((node) => {
    node.remove();
  });

  return clonedContainer.textContent ?? "";
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

export function itemLabelMatches<T extends { label: string }>(item: T, label: string) {
  return labelsMatch(item.label, label);
}
