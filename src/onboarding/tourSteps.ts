import type { TranslationKey } from "../i18n";

export type TourPlacement = "bottom" | "top" | "left" | "right";

export type TourStepId =
  | "welcome"
  | "rWidget"
  | "menu"
  | "stats"
  | "ai"
  | "essay"
  | "autoSelect"
  | "statusPanel"
  | "preview"
  | "import"
  | "popup"
  | "finish";

export interface TourStep {
  id: TourStepId;
  targetSelector?: string;
  scrollSelector?: string;
  placement?: TourPlacement;
  titleKey: TranslationKey;
  textKey: TranslationKey;
}

export const MENU_PORTAL_SELECTOR = '[data-reduxshare-answer-menu-portal="true"]';

export const TOUR_STEPS: TourStep[] = [
  {
    id: "welcome",
    titleKey: "tour.welcome.title",
    textKey: "tour.welcome.text",
  },
  {
    id: "rWidget",
    targetSelector: '#question-125-1 [data-reduxshare-answer-widget="true"]',
    placement: "bottom",
    titleKey: "tour.rWidget.title",
    textKey: "tour.rWidget.text",
  },
  {
    id: "menu",
    targetSelector: MENU_PORTAL_SELECTOR,
    scrollSelector: "#question-125-1",
    placement: "right",
    titleKey: "tour.menu.title",
    textKey: "tour.menu.text",
  },
  {
    id: "stats",
    targetSelector: MENU_PORTAL_SELECTOR,
    scrollSelector: "#question-201-1",
    placement: "right",
    titleKey: "tour.stats.title",
    textKey: "tour.stats.text",
  },
  {
    id: "ai",
    targetSelector: MENU_PORTAL_SELECTOR,
    scrollSelector: "#question-125-1",
    placement: "top",
    titleKey: "tour.ai.title",
    textKey: "tour.ai.text",
  },
  {
    id: "essay",
    targetSelector: MENU_PORTAL_SELECTOR,
    scrollSelector: "#question-210-1",
    placement: "right",
    titleKey: "tour.essay.title",
    textKey: "tour.essay.text",
  },
  {
    id: "autoSelect",
    targetSelector: "#question-125-1",
    placement: "bottom",
    titleKey: "tour.autoSelect.title",
    textKey: "tour.autoSelect.text",
  },
  {
    id: "statusPanel",
    targetSelector: "#reduxshare-attempt-status-panel",
    placement: "left",
    titleKey: "tour.statusPanel.title",
    textKey: "tour.statusPanel.text",
  },
  {
    id: "preview",
    targetSelector: "#reduxshare-quiz-preview-modal",
    placement: "left",
    titleKey: "tour.preview.title",
    textKey: "tour.preview.text",
  },
  {
    id: "import",
    titleKey: "tour.import.title",
    textKey: "tour.import.text",
  },
  {
    id: "popup",
    titleKey: "tour.popup.title",
    textKey: "tour.popup.text",
  },
  {
    id: "finish",
    titleKey: "tour.finish.title",
    textKey: "tour.finish.text",
  },
];
