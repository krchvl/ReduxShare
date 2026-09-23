// Moodle page-type predicates shared by the panel, the review saver and the bootstrap.
export function isQuizAttemptUrl(url: Location) {
  return url.protocol === "https:" && url.pathname.endsWith("/mod/quiz/attempt.php");
}

export function isQuizSummaryUrl(url: Location) {
  return url.protocol === "https:" && url.pathname.endsWith("/mod/quiz/summary.php");
}

export function isQuizViewUrl(url: Location) {
  return url.protocol === "https:" && url.pathname.endsWith("/mod/quiz/view.php");
}
