import { DEMO_QUESTION_FIXTURES } from "./demoBackend";

const DEMO_QUIZ_NAME = "ReduxShare demo quiz";
const DEMO_COURSE_NAME = "Demo course";
const DEMO_SECTION_NAME = "Section 1";
const DEMO_SITE_NAME = "Demo Moodle";

const QUIZ_ICON_SVG = `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMinYMid meet" aria-hidden="true"><path fill-rule="evenodd" clip-rule="evenodd" d="M5.49902 4C4.11831 4 2.99902 5.11929 2.99902 6.5V17.5C2.99902 18.8807 4.11831 20 5.49902 20H18.5007C19.8814 20 21.0007 18.8807 21.0007 17.5V6.5C21.0007 5.11929 19.8814 4 18.5007 4H5.49902ZM3.99902 6.5C3.99902 5.67157 4.6706 5 5.49902 5H18.5007C19.3292 5 20.0007 5.67157 20.0007 6.5V17.5C20.0007 18.3284 19.3292 19 18.5007 19H5.49902C4.6706 19 3.99902 18.3284 3.99902 17.5V6.5ZM15.25 7.39645C15.4452 7.20118 15.7618 7.20118 15.9571 7.39645L16.249 7.6884L16.541 7.39645C16.7362 7.20118 17.0528 7.20118 17.2481 7.39645C17.4433 7.59171 17.4433 7.90829 17.2481 8.10355L16.9561 8.39551L17.2481 8.68746C17.4433 8.88272 17.4433 9.19931 17.2481 9.39457C17.0528 9.58983 16.7362 9.58983 16.541 9.39457L16.249 9.10262L15.9571 9.39457C15.7618 9.58983 15.4452 9.58983 15.25 9.39457C15.0547 9.19931 15.0547 8.88272 15.25 8.68746L15.5419 8.39551L15.25 8.10355C15.0547 7.90829 15.0547 7.59171 15.25 7.39645ZM17.5159 11.7035C17.7111 11.5082 17.7111 11.1916 17.5158 10.9964C17.3205 10.8011 17.0039 10.8012 16.8087 10.9965L15.934 11.8714L15.6905 11.6278C15.4953 11.4326 15.1787 11.4325 14.9834 11.6277C14.7881 11.823 14.7881 12.1395 14.9833 12.3348L15.5804 12.9321C15.6741 13.0259 15.8013 13.0786 15.934 13.0786C16.0666 13.0786 16.1938 13.0259 16.2876 12.9321L17.5159 11.7035ZM17.5159 15.2408C17.7111 15.0455 17.7111 14.729 17.5158 14.5337C17.3205 14.3385 17.0039 14.3385 16.8087 14.5338L15.934 15.4087L15.6905 15.1652C15.4953 14.9699 15.1787 14.9699 14.9834 15.1651C14.7881 15.3603 14.7881 15.6769 14.9833 15.8722L15.5804 16.4695C15.6741 16.5633 15.8013 16.616 15.934 16.616C16.0666 16.616 16.1938 16.5633 16.2876 16.4695L17.5159 15.2408ZM6.50098 8.51733C6.50098 8.24119 6.72483 8.01733 7.00098 8.01733L12.001 8.01733C12.2771 8.01733 12.501 8.24119 12.501 8.51733C12.501 8.79348 12.2771 9.01733 12.001 9.01733L7.00098 9.01733C6.72483 9.01733 6.50098 8.79348 6.50098 8.51733ZM7.00098 15.0017C6.72483 15.0017 6.50098 15.2256 6.50098 15.5017C6.50098 15.7779 6.72483 16.0017 7.00098 16.0017L12.001 16.0017C12.2771 16.0017 12.501 15.7779 12.501 15.5017C12.501 15.2256 12.2771 15.0017 12.001 15.0017L7.00098 15.0017ZM6.50098 12.0312C6.50098 11.7551 6.72483 11.5312 7.00098 11.5312L12.001 11.5313C12.2771 11.5313 12.501 11.7551 12.501 12.0313C12.501 12.3074 12.2771 12.5313 12.001 12.5313L7.00098 12.5312C6.72483 12.5312 6.50098 12.3074 6.50098 12.0312Z" fill="#f80076"/></svg>`;

const ICONS = {
  search:
    '<svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="M11.5 7a4.5 4.5 0 1 1-9 0 4.5 4.5 0 0 1 9 0Zm-1.02 4.19a5.5 5.5 0 1 1 .71-.71l3.39 3.4a.5.5 0 0 1-.7.7l-3.4-3.39Z" fill="currentColor"/></svg>',
  bell: '<svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="M8 1.5a4 4 0 0 0-4 4c0 1.7-.5 3-1.1 3.9-.3.5 0 1.1.6 1.1h9c.6 0 .9-.6.6-1.1-.6-.9-1.1-2.2-1.1-3.9a4 4 0 0 0-4-4Zm1.5 10a1.5 1.5 0 0 1-3 0" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/></svg>',
  bubble:
    '<svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="M2 3.5C2 2.7 2.7 2 3.5 2h9c.8 0 1.5.7 1.5 1.5v6c0 .8-.7 1.5-1.5 1.5H8.4L5 14.2V11H3.5C2.7 11 2 10.3 2 9.5v-6Z" stroke="currentColor" stroke-width="1.2" stroke-linejoin="round"/></svg>',
  caret:
    '<svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true"><path d="M2.5 4.5 6 8l3.5-3.5" stroke="currentColor" stroke-width="1.4" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  panel:
    '<svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true"><rect x="2.6" y="3.6" width="14.8" height="12.8" rx="1.8" stroke="currentColor" stroke-width="1.4"/><path d="M7.8 3.6v12.8" stroke="currentColor" stroke-width="1.4"/></svg>',
  person:
    '<svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true"><circle cx="10" cy="7" r="3.2" fill="currentColor"/><path d="M3.8 16.4a6.3 6.3 0 0 1 12.4 0" fill="currentColor"/></svg>',
  flag: '<svg width="12" height="12" viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="M3 1.8v12.4M3 2.2h9.2l-2.1 3 2.1 3H3" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  pen: '<svg width="12" height="12" viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="m11.3 1.9 2.8 2.8L5 13.8l-3.5.7.7-3.5 9.1-9.1Z" stroke="currentColor" stroke-width="1.3" stroke-linejoin="round"/></svg>',
};

const DEMO_QUESTIONS = [
  { anchor: "question-125-1" },
  { anchor: "question-126-12" },
  { anchor: "question-201-1" },
  { anchor: "question-210-1" },
];

function buildNavbar(): string {
  return `
    <nav class="moodle-navbar fixed-top" aria-label="Site navigation">
      <div class="moodle-navbar__inner">
        <a class="moodle-navbar__brand" href="#" aria-label="${DEMO_SITE_NAME}">
          <span class="moodle-navbar__logo" aria-hidden="true">m</span>
          <span class="moodle-navbar__sitename">${DEMO_SITE_NAME}</span>
        </a>
        <ul class="moodle-navbar__nav" role="menubar" aria-label="Main menu">
          <li role="none"><a role="menuitem" class="nav-link" href="#">Home</a></li>
          <li role="none"><a role="menuitem" class="nav-link" href="#">Dashboard</a></li>
          <li role="none"><a role="menuitem" class="nav-link" href="#">My courses</a></li>
        </ul>
        <div class="moodle-navbar__right">
          <button type="button" class="moodle-navbar__iconbtn" aria-label="Toggle search input">${ICONS.search}</button>
          <span class="moodle-navbar__divider" aria-hidden="true"></span>
          <span class="moodle-navbar__editmode">
            Edit mode
            <span class="moodle-switch" role="presentation"><span class="moodle-switch__track"><span class="moodle-switch__thumb"></span></span></span>
          </span>
          <span class="moodle-navbar__divider" aria-hidden="true"></span>
          <button type="button" class="moodle-navbar__iconbtn" aria-label="Notifications">${ICONS.bell}</button>
          <button type="button" class="moodle-navbar__iconbtn" aria-label="Messages">${ICONS.bubble}</button>
          <span class="moodle-navbar__divider" aria-hidden="true"></span>
          <span class="moodle-navbar__usermenu">
            <span class="moodle-navbar__avatar" aria-hidden="true">${ICONS.person}</span>
            ${ICONS.caret}
          </span>
        </div>
      </div>
    </nav>
  `;
}

function buildPageHeader(): string {
  return `
    <div class="moodle-main-inner">
      <header id="page-header" class="header-maxwidth">
        <div id="page-navbar">
          <nav aria-label="Breadcrumb">
            <ol class="breadcrumb">
              <li class="breadcrumb-item"><a href="#">${DEMO_COURSE_NAME}</a></li>
              <li class="breadcrumb-item"><a href="#">${DEMO_SECTION_NAME}</a></li>
              <li class="breadcrumb-item"><a href="#">${DEMO_QUIZ_NAME}</a></li>
              <li class="breadcrumb-item"><span>Preview</span></li>
            </ol>
          </nav>
        </div>
        <div class="d-flex align-items-center">
          <div class="page-context-header">
            <div class="page-header-image">
              <div class="activityiconcontainer modicon_quiz">${QUIZ_ICON_SVG}</div>
            </div>
            <div class="page-header-headings">
              <h1 class="h2">${DEMO_QUIZ_NAME}</h1>
            </div>
          </div>
        </div>
      </header>
      <div class="secondary-navigation">
        <nav class="moremenu" aria-label="Quiz">
          <ul class="nav more-nav nav-tabs" role="menubar">
            <li role="none"><a role="menuitem" class="nav-link active" href="#" aria-current="true">Quiz</a></li>
            <li role="none"><a role="menuitem" class="nav-link" href="#">Settings</a></li>
            <li role="none"><a role="menuitem" class="nav-link" href="#">Questions</a></li>
            <li role="none"><a role="menuitem" class="nav-link" href="#">Results</a></li>
          </ul>
        </nav>
      </div>
      <div id="page-content">
        <div id="region-main">
          <div role="main">
            <div class="tertiary-navigation">
              <a class="btn btn-secondary" href="#">Back</a>
            </div>
            <div id="quiz-timer-wrapper">
              <div id="quiz-timer" role="timer" aria-atomic="true">
                Time left
                <span id="quiz-time-left">0:24:56</span>
              </div>
              <button type="button" class="btn btn-secondary btn-small" id="toggle-timer">Hide</button>
            </div>
            <form id="responseform" class="moodle-quiz-form" method="post" action="#">
              <div id="reduxshare-demo-questions">${DEMO_QUESTION_FIXTURES.join("")}</div>
              <div class="submitbtns">
                <input type="submit" name="next" value="Finish attempt ..." class="btn btn-primary" />
              </div>
            </form>
          </div>
        </div>
      </div>
    </div>
  `;
}

function buildQuizNavBlock(): string {
  const buttons = DEMO_QUESTIONS.map((question, index) => {
    const activeClass = index === 0 ? " thispage" : "";
    return `<a class="qnbutton notyetanswered free btn${activeClass}" href="#${question.anchor}" title="Question ${index + 1} - Not yet answered"><span class="thispageholder"></span><span class="trafficlight"></span><span class="accesshide">Question </span>${index + 1}<span class="accesshide"> This page <span class="flagstate"></span></span></a>`;
  }).join("");

  return `
    <aside class="moodle-blocks-drawer" aria-label="Blocks">
      <section id="mod_quiz_navblock" class="block card" role="navigation" aria-label="Quiz navigation">
        <div class="card-body">
          <h3 class="card-title">Quiz navigation</h3>
          <div class="card-text content">
            <div class="qn_buttons clearfix multipages">${buttons}</div>
            <div class="othernav">
              <a class="endtestlink aalink" href="#">Finish attempt ...</a>
              <div class="singlebutton quizstartbuttondiv">
                <form method="post" action="#">
                  <input type="hidden" name="cmid" value="789" />
                  <button type="submit" class="btn btn-secondary">Start a new preview</button>
                </form>
              </div>
            </div>
          </div>
        </div>
      </section>
    </aside>
  `;
}

function buildPageMarkup(): string {
  return `
    ${buildNavbar()}
    <div id="page" class="drawers">
      <button type="button" class="moodle-drawer-toggler" aria-label="Open course index">${ICONS.panel}</button>
      ${buildPageHeader()}
      ${buildQuizNavBlock()}
    </div>
    <footer class="moodle-footer">
      ${DEMO_SITE_NAME} · demo page for the ReduxShare onboarding tour
    </footer>
  `;
}

function enhanceQuestionInfo(): void {
  for (const info of document.querySelectorAll("#reduxshare-demo-questions .que .info")) {
    if (info.querySelector(".grade")) {
      continue;
    }

    info.insertAdjacentHTML(
      "beforeend",
      `
      <div class="grade">Marked out of 1.00</div>
      <div class="questionflag editable"><a tabindex="0" role="button" aria-pressed="false" title="Flag this question for future reference">${ICONS.flag}Flag question</a></div>
      <div class="editquestion"><a href="#">${ICONS.pen}Edit question</a></div>
      <span class="badge bg-primary text-light">v1 (latest)</span>
    `,
    );
  }
}

const DEMO_TIMER_START_SECONDS = 24 * 60 + 56;
let demoTimerHandle: number | null = null;

function formatDemoTime(totalSeconds: number): string {
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const pad = (value: number) => String(value).padStart(2, "0");

  return `${hours}:${pad(minutes)}:${pad(seconds)}`;
}

function startDemoTimer(): void {
  let remaining = DEMO_TIMER_START_SECONDS;
  const label = document.getElementById("quiz-time-left");

  if (!label) {
    return;
  }

  label.textContent = formatDemoTime(remaining);

  if (demoTimerHandle !== null) {
    window.clearInterval(demoTimerHandle);
  }

  demoTimerHandle = window.setInterval(() => {
    remaining = Math.max(remaining - 1, 0);
    label.textContent = formatDemoTime(remaining);

    if (remaining === 0 && demoTimerHandle !== null) {
      window.clearInterval(demoTimerHandle);
      demoTimerHandle = null;
    }
  }, 1000);
}

function wireTimerToggle(): void {
  const button = document.getElementById("toggle-timer");
  const timer = document.getElementById("quiz-timer");

  if (!button || !timer) {
    return;
  }

  button.addEventListener("click", () => {
    const hidden = timer.hidden;
    timer.hidden = hidden;
    button.textContent = hidden ? "Hide" : "Show";
  });
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
  enhanceQuestionInfo();
  startDemoTimer();
  wireTimerToggle();

  const moodleConfigScript = document.createElement("script");
  moodleConfigScript.textContent = `M.cfg = {"courseId":66,"contextInstanceId":789,"sesskey":"demo"};`;
  document.body.append(moodleConfigScript);
}
