import { describe, expect, it } from "vitest";
import { findMoodleAttemptIdFromPage, findMoodleUserIdFromPage } from "../src/moodleContext";

describe("findMoodleAttemptIdFromPage", () => {
  it("reads numeric attempt ids from the page URL", () => {
    expect(
      findMoodleAttemptIdFromPage(
        "https://moodle.example/mod/quiz/attempt.php?attempt=95&cmid=789",
      ),
    ).toBe("95");
  });

  it("returns null for missing or non-numeric attempt params", () => {
    expect(
      findMoodleAttemptIdFromPage("https://moodle.example/mod/quiz/attempt.php?cmid=789"),
    ).toBeNull();
    expect(
      findMoodleAttemptIdFromPage("https://moodle.example/mod/quiz/attempt.php?attempt=abc"),
    ).toBeNull();
    expect(findMoodleAttemptIdFromPage("not a url")).toBeNull();
  });
});

describe("findMoodleUserIdFromPage", () => {
  it("reads the user id from the profile link", () => {
    document.body.innerHTML = `<a href="https://moodle.example/user/profile.php?id=20">Name</a>`;
    expect(findMoodleUserIdFromPage()).toBe("20");
  });

  it("falls back to data-userid attributes", () => {
    document.body.innerHTML = `<div data-userid="21">x</div>`;
    expect(findMoodleUserIdFromPage()).toBe("21");
    document.body.innerHTML = `<div data-user-id="22">x</div>`;
    expect(findMoodleUserIdFromPage()).toBe("22");
  });

  it("falls back to user view links and rejects placeholders", () => {
    document.body.innerHTML = `<a href="https://moodle.example/user/view.php?id=23&course=2">Name</a>`;
    expect(findMoodleUserIdFromPage()).toBe("23");
    document.body.innerHTML = `<div data-userid="0">guest</div>`;
    expect(findMoodleUserIdFromPage()).toBeNull();
    document.body.innerHTML = `<p>no identity here</p>`;
    expect(findMoodleUserIdFromPage()).toBeNull();
  });
});
