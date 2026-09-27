import { type StoredStateLike } from "../model";
import { AUTO_SELECT_TEMPO_PRESETS } from "../types";

export function canUseQuizFeatures(storedState: StoredStateLike | undefined) {
  return storedState?.settings?.extensionEnabled !== false;
}

export function isLoggedInToExtension(storedState: StoredStateLike | undefined) {
  const userId = storedState?.authSession?.user?.id;
  return typeof userId === "string" && userId.trim() !== "";
}

export function canUseAuthenticatedQuizFeatures(storedState: StoredStateLike | undefined) {
  return canUseQuizFeatures(storedState) && isLoggedInToExtension(storedState);
}

export function getContentLocale(language: "auto" | "ru" | "en" | undefined) {
  if (language === "en") {
    return "en-US";
  }

  if (language === "ru") {
    return "ru-RU";
  }

  if (typeof chrome !== "undefined" && chrome.i18n?.getUILanguage) {
    return chrome.i18n.getUILanguage();
  }

  return typeof navigator !== "undefined" ? navigator.language : "ru-RU";
}

// Шкала слайдера «Время авто-ответа» нелинейная: пресеты темпа сидят ровно
// на 0% / 50% / 100% (Быстро / Баланс / Реализм), между ними — линейная
// интерполяция. Нативный input работает в позициях 0–100, секунды получаются
// двусторонним отображением.
const TEMPO_SCALE_ANCHORS = [
  { position: 0, seconds: AUTO_SELECT_TEMPO_PRESETS.brisk },
  { position: 50, seconds: AUTO_SELECT_TEMPO_PRESETS.balanced },
  { position: 100, seconds: AUTO_SELECT_TEMPO_PRESETS.realistic },
] as const;

export const AUTO_SELECT_SLIDER_POSITION_MIN = 0;
export const AUTO_SELECT_SLIDER_POSITION_MAX = 100;

export function autoSelectTempoSecondsToPosition(seconds: number): number {
  const clamped = Math.min(
    AUTO_SELECT_TEMPO_PRESETS.realistic,
    Math.max(AUTO_SELECT_TEMPO_PRESETS.brisk, seconds),
  );

  for (let index = 0; index < TEMPO_SCALE_ANCHORS.length - 1; index += 1) {
    const from = TEMPO_SCALE_ANCHORS[index];
    const to = TEMPO_SCALE_ANCHORS[index + 1];

    if (clamped <= to.seconds) {
      const ratio = (clamped - from.seconds) / (to.seconds - from.seconds);
      return Math.round(from.position + ratio * (to.position - from.position));
    }
  }

  return AUTO_SELECT_SLIDER_POSITION_MAX;
}

export function autoSelectTempoPositionToSeconds(position: number): number {
  const clamped = Math.min(
    AUTO_SELECT_SLIDER_POSITION_MAX,
    Math.max(AUTO_SELECT_SLIDER_POSITION_MIN, position),
  );

  for (let index = 0; index < TEMPO_SCALE_ANCHORS.length - 1; index += 1) {
    const from = TEMPO_SCALE_ANCHORS[index];
    const to = TEMPO_SCALE_ANCHORS[index + 1];

    if (clamped <= to.position) {
      const ratio = (clamped - from.position) / (to.position - from.position);
      const raw = from.seconds + ratio * (to.seconds - from.seconds);
      // Шаг 0.5 с — как у прежнего слайдера.
      return Math.round(raw * 2) / 2;
    }
  }

  return AUTO_SELECT_TEMPO_PRESETS.realistic;
}
