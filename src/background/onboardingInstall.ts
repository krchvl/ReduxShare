// Реакция на первую установку расширения: открываем вкладку с онбординг-туром
// (моковая страница Moodle с демо всех функций). Вынесено в отдельный модуль,
// чтобы предикат покрывался юнит-тестами без загрузки всего service worker.
const ONBOARDING_PAGE_PATH = "onboarding.html";

export function shouldOpenOnboardingTour(reason: string | undefined): boolean {
  return reason === "install";
}

export function getOnboardingTourUrl(): string {
  return chrome.runtime.getURL(ONBOARDING_PAGE_PATH);
}

export function openOnboardingTourTab(): void {
  void chrome.tabs.create({ url: getOnboardingTourUrl() });
}

export function handleRuntimeInstalled(details: { reason?: string } | undefined): void {
  if (!shouldOpenOnboardingTour(details?.reason)) {
    return;
  }

  openOnboardingTourTab();
}
