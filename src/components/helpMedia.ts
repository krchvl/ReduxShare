import accentMedia from "../assets/help/accent.webp";
import attemptStatusPanelMedia from "../assets/help/attemptStatusPanel.webp";
import autoselectMedia from "../assets/help/autoselect.webp";
import autoselectAvgMedia from "../assets/help/autoselectAvg.webp";
import extensionMedia from "../assets/help/extension.webp";
import humanMedia from "../assets/help/human.webp";
import languageMedia from "../assets/help/language.webp";
import serverMedia from "../assets/help/server.webp";
import themeMedia from "../assets/help/theme.webp";

export const HELP_HINT_IDS = [
  "theme",
  "accent",
  "language",
  "extension",
  "autoselect",
  "autoselectAvg",
  "human",
  "attemptStatusPanel",
  "server",
] as const;

export type SettingHelpId = (typeof HELP_HINT_IDS)[number];

export const HELP_MEDIA: Record<SettingHelpId, string> = {
  theme: themeMedia,
  accent: accentMedia,
  language: languageMedia,
  extension: extensionMedia,
  autoselect: autoselectMedia,
  autoselectAvg: autoselectAvgMedia,
  human: humanMedia,
  attemptStatusPanel: attemptStatusPanelMedia,
  server: serverMedia,
};
