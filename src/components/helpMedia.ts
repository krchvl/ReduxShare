import attemptStatusPanelMedia from "../assets/help/attemptStatusPanel.webp";
import autoselectAvgMedia from "../assets/help/autoselectAvg.webp";
import humanMedia from "../assets/help/human.webp";
import serverMedia from "../assets/help/server.webp";

export const HELP_HINT_IDS = ["autoselectAvg", "human", "attemptStatusPanel", "server"] as const;

export type SettingHelpId = (typeof HELP_HINT_IDS)[number];

export const HELP_MEDIA: Record<SettingHelpId, string> = {
  autoselectAvg: autoselectAvgMedia,
  human: humanMedia,
  attemptStatusPanel: attemptStatusPanelMedia,
  server: serverMedia,
};
