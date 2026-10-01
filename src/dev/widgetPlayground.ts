import { APP_STORAGE_KEY } from "../shared/storageKeys";
import { essayExamplesByQuestionId } from "../state";
import {
  DEMO_QUESTION_FIXTURES,
  buildStoredState,
  getEssayExamplesForQuestion,
  installChromeMock,
  matchAnswerData,
  multichoiceAnswerData,
  multichoiceExternalAnswerData,
  seedEssayExamples,
  shortanswerAnswerData,
  type QuizAttemptDemoApi,
} from "../onboarding/demoBackend";

(window as unknown as { __REDUXSHARE_TEST_MODE__?: boolean }).__REDUXSHARE_TEST_MODE__ = true;

const VIEW_PAGE_FIXTURE = `
  <section class="dev-view-page">
    <div class="page-header-headings"><h1>Итоговый тест по математике</h1></div>
    <div class="dev-course-nav"><a href="/course/view.php?id=66">Курс физики</a></div>
    <div class="tertiary-navigation">
      <div class="d-flex">
        <div class="navitem">
          <div class="singlebutton quizstartbuttondiv">
            <form method="post" action="/mod/quiz/startattempt.php">
              <input type="hidden" name="cmid" value="789" />
              <button type="submit" class="btn btn-primary">Начать попытку</button>
            </form>
          </div>
        </div>
      </div>
    </div>
  </section>
`;

function injectViewPageFixture() {
  const host = document.createElement("section");
  host.id = "reduxshare-dev-view-page";
  host.innerHTML = VIEW_PAGE_FIXTURE;
  document.body.append(host);

  const moodleConfigScript = document.createElement("script");
  moodleConfigScript.textContent = 'M.cfg = {"courseId":66,"contextInstanceId":789};';
  document.body.append(moodleConfigScript);
}

function injectFixtures() {
  const host = document.getElementById("reduxshare-dev-questions");

  if (host) {
    host.innerHTML = DEMO_QUESTION_FIXTURES.join("");
  }
}

async function boot() {
  installChromeMock();
  injectFixtures();
  injectViewPageFixture();
  seedEssayExamples();

  await chrome.storage.local.set({ [APP_STORAGE_KEY]: buildStoredState() });

  const api = (globalThis as unknown as { __reduxshareQuizAttemptTestApi?: QuizAttemptDemoApi })
    .__reduxshareQuizAttemptTestApi;

  if (!api) {
    throw new Error("ReduxShare quizAttempt test API was not installed.");
  }

  api.setStoredState(buildStoredState());
  api.setSourceAnswerData("1385", "reduxshare", multichoiceAnswerData());
  api.setSourceAnswerData("1385", "external", multichoiceExternalAnswerData());
  api.setSourceAnswerData("3699", "reduxshare", matchAnswerData());
  api.setSourceAnswerData("2011", "reduxshare", shortanswerAnswerData());
  api.mountAnswerWidgets("#9cb9f6");

  essayExamplesByQuestionId.set("2101", getEssayExamplesForQuestion("2101"));

  const { initializeQuizPreviewFeatures } = await import("../content/quizPreview");
  await initializeQuizPreviewFeatures();
}

void boot();
