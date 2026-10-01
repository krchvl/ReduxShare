import { describe, expect, it } from "vitest";
import { getDemoQuizName, injectDemoPage } from "../src/onboarding/pageShell";
import { TOUR_STEPS } from "../src/onboarding/tourSteps";

describe("onboarding tour steps", () => {
  it("resolves every target selector on the assembled demo page", () => {
    document.body.innerHTML = '<main id="reduxshare-demo-page"></main>';
    injectDemoPage();

    const widgetStub = document.createElement("span");
    widgetStub.setAttribute("data-reduxshare-answer-widget", "true");
    document.querySelector("#question-125-1 .answer")?.append(widgetStub);

    const menuPortalStub = document.createElement("div");
    menuPortalStub.setAttribute("data-reduxshare-answer-menu-portal", "true");
    document.body.append(menuPortalStub);

    const statusPanelStub = document.createElement("div");
    statusPanelStub.id = "reduxshare-attempt-status-panel";
    document.body.append(statusPanelStub);

    const previewModalStub = document.createElement("div");
    previewModalStub.id = "reduxshare-quiz-preview-modal";
    document.body.append(previewModalStub);

    for (const step of TOUR_STEPS) {
      if (!step.targetSelector) {
        continue;
      }

      expect(document.querySelector(step.targetSelector), `step "${step.id}"`).toBeTruthy();
    }
  });

  it("contains the demo fixtures the tour relies on", () => {
    document.body.innerHTML = '<main id="reduxshare-demo-page"></main>';
    injectDemoPage();

    expect(document.querySelector(".que.multichoice")).toBeTruthy();
    expect(document.querySelector(".que.match")).toBeTruthy();
    expect(document.querySelector(".que.shortanswer")).toBeTruthy();
    expect(document.querySelector(".que.essay")).toBeTruthy();

    expect(document.querySelector(".quizstartbuttondiv")).toBeTruthy();
    expect(document.querySelector(".page-header-headings h1")?.textContent).toContain(
      getDemoQuizName(),
    );
    expect(document.getElementById("quiz-time-left")).toBeTruthy();
    expect(document.querySelector("#mod_quiz_navblock .qnbutton")).toBeTruthy();
  });
});
