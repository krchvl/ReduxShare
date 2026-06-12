import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const FIXTURE_ROOT = resolve(process.cwd(), "test/fixtures");
export const FIXTURE_PLACEHOLDER_MARKER = "REDUXSHARE_FIXTURE_PLACEHOLDER";

export function getFixturePath(questionType: string, caseName: string) {
  return resolve(FIXTURE_ROOT, questionType, `${caseName}.html`);
}

export function hasQuestionFixture(questionType: string, caseName: string) {
  return existsSync(getFixturePath(questionType, caseName));
}

export function isQuestionFixtureReady(questionType: string, caseName: string) {
  const path = getFixturePath(questionType, caseName);

  if (!existsSync(path)) {
    return false;
  }

  return !readFileSync(path, "utf8").includes(FIXTURE_PLACEHOLDER_MARKER);
}

export function loadQuestionFixture(questionType: string, caseName: string) {
  const path = getFixturePath(questionType, caseName);
  const html = readFileSync(path, "utf8");

  if (html.includes(FIXTURE_PLACEHOLDER_MARKER)) {
    throw new Error(`Fixture ${questionType}/${caseName}.html is still a placeholder.`);
  }

  document.body.innerHTML = html;

  const questionNode = document.querySelector(".que");

  if (!questionNode) {
    throw new Error(`Fixture ${questionType}/${caseName}.html does not contain .que`);
  }

  return questionNode;
}
