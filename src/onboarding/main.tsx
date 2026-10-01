import { useState } from "react";
import { createRoot } from "react-dom/client";
import { APP_STORAGE_KEY } from "../shared/storageKeys";
import { essayExamplesByQuestionId } from "../state";
import { getTranslator } from "../i18n";
import { I18nProvider } from "../i18n/react";
import {
  DEMO_ACCENT_COLOR,
  buildStoredState,
  getEssayExamplesForQuestion,
  installChromeMock,
  matchAnswerData,
  multichoiceAnswerData,
  multichoiceExternalAnswerData,
  seedEssayExamples,
  shortanswerAnswerData,
} from "./demoBackend";
import { injectDemoPage } from "./pageShell";
import { TourApp, dispatchTourToast } from "./TourApp";
import "./moodle.css";
import "./tour.css";

interface RealChrome {
  runtime?: { getURL?: (path: string) => string };
  i18n?: { getUILanguage?: () => string };
}

const realChrome = (window as unknown as { chrome?: RealChrome }).chrome;

(window as unknown as { __REDUXSHARE_TEST_MODE__?: boolean }).__REDUXSHARE_TEST_MODE__ = true;

installChromeMock({
  getURL: (path) => realChrome?.runtime?.getURL?.(path) ?? path,
  uiLanguage: () =>
    realChrome?.i18n?.getUILanguage?.() ??
    ((navigator.language ?? "ru").startsWith("en") ? "en" : "ru"),
});

const translateTourString = getTranslator(buildStoredState().settings?.language);

function installNavigationGuards() {
  const blocked = () => dispatchTourToast(translateTourString("tour.toast.navigationBlocked"));

  document.addEventListener(
    "submit",
    (event) => {
      event.preventDefault();
      event.stopPropagation();
      blocked();
    },
    true,
  );

  document.addEventListener(
    "click",
    (event) => {
      const target = event.target;

      if (target instanceof Element && target.closest("#reduxshare-auto-pass-button")) {
        event.preventDefault();
        event.stopPropagation();
        blocked();
      }
    },
    true,
  );
}

async function boot() {
  seedEssayExamples();
  injectDemoPage();
  installNavigationGuards();

  await chrome.storage.local.set({ [APP_STORAGE_KEY]: buildStoredState() });

  await import("../content/quizAttempt");

  const api = globalThis.__reduxshareQuizAttemptTestApi;

  if (!api) {
    throw new Error("ReduxShare quizAttempt test API was not installed.");
  }

  api.setStoredState(buildStoredState());
  api.syncStealthMode(buildStoredState());
  api.setSourceAnswerData("1385", "reduxshare", multichoiceAnswerData());
  api.setSourceAnswerData("1385", "external", multichoiceExternalAnswerData());
  api.setSourceAnswerData("3699", "reduxshare", matchAnswerData());
  api.setSourceAnswerData("2011", "reduxshare", shortanswerAnswerData());
  api.mountAnswerWidgets(DEMO_ACCENT_COLOR);

  essayExamplesByQuestionId.set("2101", getEssayExamplesForQuestion("2101"));

  api.mountAttemptStatusPanelForTour();
  api.ensureAutoPassStartButton();

  const { initializeQuizPreviewFeatures } = await import("../content/quizPreview");
  await initializeQuizPreviewFeatures();

  const container = document.getElementById("root");

  if (!container) {
    throw new Error("ReduxShare onboarding root is missing.");
  }

  createRoot(container).render(
    <I18nProvider language={buildStoredState().settings?.language ?? "ru"}>
      <OnboardingRoot
        openAnswerMenu={(questionId, tab) => api.openAnswerMenuForQuestion(questionId, tab)}
      />
    </I18nProvider>,
  );
}

function OnboardingRoot({
  openAnswerMenu,
}: {
  openAnswerMenu: (questionId: string, tab?: "internal" | "external" | "ai") => boolean;
}) {
  const [visible, setVisible] = useState(true);

  if (!visible) {
    return null;
  }

  return (
    <TourApp
      openAnswerMenu={openAnswerMenu}
      onFinish={() => {
        setVisible(false);
        window.close();
      }}
    />
  );
}

void boot();
