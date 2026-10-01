import { DEMO_QUESTION_FIXTURES } from "./demoBackend";

const DEMO_QUIZ_NAME = "Демо-тест ReduxShare";
const DEMO_COURSE_NAME = "Курс физики";

const QUIZ_INFO_SECTION = `
  <section class="moodle-quiz-info" aria-label="Информация о тесте">
    <table>
      <tbody>
        <tr><th scope="row">Попытки разрешены:</th><td>1</td></tr>
        <tr><th scope="row">Метод оценивания:</th><td>Высшая оценка</td></tr>
        <tr><th scope="row">Ограничение по времени:</th><td>30 минут</td></tr>
      </tbody>
    </table>
  </section>
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
`;

const QUESTION_NAV_BLOCK = `
  <aside class="moodle-quiz-nav" aria-label="Навигация по вопросам">
    <div class="moodle-quiz-nav__timer">
      Оставшееся время
      <strong>29:59</strong>
    </div>
    <div class="moodle-quiz-nav__body">
      <h3 class="moodle-quiz-nav__title">Навигация по вопросам</h3>
      <div class="moodle-quiz-nav__buttons">
        <button type="button" class="qnbutton qnbutton--active">1</button>
        <button type="button" class="qnbutton">2</button>
        <button type="button" class="qnbutton">3</button>
        <button type="button" class="qnbutton">4</button>
      </div>
      <button type="button" class="btn btn-primary">Завершить попытку…</button>
    </div>
  </aside>
`;

function buildPageMarkup(): string {
  return `
    <nav class="moodle-navbar" aria-label="Главная навигация">
      <span class="moodle-navbar__brand">
        <span class="moodle-navbar__logo" aria-hidden="true">m</span>
        Демо-Сайт Moodle
      </span>
      <span class="moodle-navbar__course">${DEMO_COURSE_NAME}</span>
      <span class="moodle-navbar__spacer"></span>
      <span class="moodle-navbar__user">
        Демо-пользователь
        <span class="moodle-navbar__avatar" aria-hidden="true">ДП</span>
      </span>
    </nav>
    <nav class="moodle-breadcrumb" aria-label="Хлебные крошки">
      <a href="#">Главная</a>
      <span class="moodle-breadcrumb__sep">/</span>
      <a href="#">Мои курсы</a>
      <span class="moodle-breadcrumb__sep">/</span>
      <a href="#">${DEMO_COURSE_NAME}</a>
      <span class="moodle-breadcrumb__sep">/</span>
      <span class="moodle-breadcrumb__current">${DEMO_QUIZ_NAME}</span>
    </nav>
    <div class="moodle-page">
      <div class="moodle-main">
        <div class="page-header-headings"><h1>${DEMO_QUIZ_NAME}</h1></div>
        <p class="moodle-quiz-meta">Попытка 1 · Тест открыт · ${DEMO_COURSE_NAME}</p>
        ${QUIZ_INFO_SECTION}
        <form class="moodle-quiz-form" method="post" action="#">
          <div id="reduxshare-demo-questions">${DEMO_QUESTION_FIXTURES.join("")}</div>
        </form>
      </div>
      ${QUESTION_NAV_BLOCK}
    </div>
    <footer class="moodle-footer">
      Демонстрационная страница Moodle для онбординг-тура ReduxShare
    </footer>
  `;
}

export function getDemoQuizName(): string {
  return DEMO_QUIZ_NAME;
}

export function injectDemoPage(): void {
  const host = document.getElementById("reduxshare-demo-page");

  if (!host) {
    return;
  }

  host.innerHTML = buildPageMarkup();

  const moodleConfigScript = document.createElement("script");
  moodleConfigScript.textContent = `M.cfg = {"courseId":66,"contextInstanceId":789,"sesskey":"demo"};`;
  document.body.append(moodleConfigScript);
}
