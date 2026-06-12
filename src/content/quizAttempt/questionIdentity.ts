export function getQuestionPostData(questionNode: Element) {
  const postDataInput = questionNode.querySelector(".questionflagpostdata");

  if (!(postDataInput instanceof HTMLInputElement)) {
    return null;
  }

  return postDataInput.value || postDataInput.getAttribute("value")?.replace(/&amp;/g, "&") || null;
}

function getQuestionIdFromEditLink(questionNode: Element) {
  const editLink = questionNode.querySelector<HTMLAnchorElement>(
    '.editquestion a[href*="question.php"], a[href*="/question/bank/editquestion/question.php"]'
  );

  if (!editLink) {
    return null;
  }

  try {
    return new URL(editLink.href, window.location.href).searchParams.get("id");
  } catch {
    return null;
  }
}

export function getQuestionId(questionNode: Element) {
  const dataQuestionId =
    questionNode.getAttribute("data-questionid") ??
    questionNode.getAttribute("data-qid") ??
    questionNode.querySelector("[data-questionid]")?.getAttribute("data-questionid") ??
    questionNode.querySelector("[data-qid]")?.getAttribute("data-qid");

  if (dataQuestionId && /^\d+$/.test(dataQuestionId.trim())) {
    return dataQuestionId.trim();
  }

  const postData = getQuestionPostData(questionNode);

  if (postData) {
    const postDataQuestionId = new URLSearchParams(postData).get("qid");

    if (postDataQuestionId) {
      return postDataQuestionId;
    }
  }

  return getQuestionIdFromEditLink(questionNode);
}
