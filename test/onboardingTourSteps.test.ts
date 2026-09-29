import { describe, expect, it } from "vitest";
import { injectDemoPage } from "../src/onboarding/pageShell";
import { TOUR_STEPS } from "../src/onboarding/tourSteps";

describe("onboarding tour steps", () => {
  it("resolves every target selector on the assembled demo page", () => {
    document.body.innerHTML = '<main id="reduxshare-demo-page"></main>';
    injectDemoPage();

    // Стабы атрибутов, которые выставляет content-скрипт при монтировании:
    // R-виджет внутри первого вопроса, портал R-меню и статус-панель.
    const widgetStub = document.createElement("span");
    widgetStub.setAttribute("data-reduxshare-answer-widget", "true");
    document.querySelector("#question-125-1 .answer")?.append(widgetStub);

    const menuPortalStub = document.createElement("div");
    menuPortalStub.setAttribute("data-reduxshare-answer-menu-portal", "true");
    document.body.append(menuPortalStub);

    const statusPanelStub = document.createElement("div");
    statusPanelStub.id = "reduxshare-attempt-status-panel";
    document.body.append(statusPanelStub);

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

    // Вопросы для шагов меню/статистики/ИИ и эссе.
    expect(document.querySelector(".que.multichoice")).toBeTruthy();
    expect(document.querySelector(".que.match")).toBeTruthy();
    expect(document.querySelector(".que.shortanswer")).toBeTruthy();
    expect(document.querySelector(".que.essay")).toBeTruthy();

    // Якорь кнопок предпросмотра и автопрогона + заголовок для превью-панели.
    expect(document.querySelector(".quizstartbuttondiv")).toBeTruthy();
    expect(document.querySelector(".page-header-headings h1")?.textContent).toContain(
      "Демо-тест ReduxShare",
    );
  });
});
