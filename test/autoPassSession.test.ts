import { describe, expect, it } from "vitest";
import {
  createAutoPassSession,
  doesAutoPassSessionMatchPage,
  isAutoPassSessionStale,
  normalizeAutoPassSession,
} from "../src/lib/autoPassSession";

function hoursAgoIso(hours: number) {
  return new Date(Date.now() - hours * 60 * 60 * 1000).toISOString();
}

describe("auto pass session", () => {
  it("creates a running session with defaults", () => {
    const session = createAutoPassSession({ domain: "moodle.test", cmid: 978 });

    expect(session.status).toBe("running");
    expect(session.version).toBe(1);
    expect(session.domain).toBe("moodle.test");
    expect(session.cmid).toBe(978);
    expect(session.attemptId).toBeNull();
    expect(session.pausedQuestionNo).toBeNull();
    expect(session.startedAt).toBe(session.updatedAt);
  });

  it("normalizes a valid session", () => {
    const session = normalizeAutoPassSession({
      version: 1,
      status: "paused",
      domain: "moodle.test",
      cmid: 978,
      attemptId: 91,
      page: 2,
      pausedQuestionNo: "3",
      pausedQuestionText: "Capital of Japan?",
      startedAt: hoursAgoIso(1),
      updatedAt: hoursAgoIso(1),
    });

    expect(session).toEqual(
      expect.objectContaining({
        status: "paused",
        domain: "moodle.test",
        cmid: 978,
        attemptId: 91,
        page: 2,
        pausedQuestionNo: "3",
        pausedQuestionText: "Capital of Japan?",
      }),
    );
  });

  it("rejects malformed sessions", () => {
    expect(normalizeAutoPassSession(null)).toBeNull();
    expect(normalizeAutoPassSession("nope")).toBeNull();
    expect(
      normalizeAutoPassSession({ version: 2, status: "running", domain: "x", cmid: 1 }),
    ).toBeNull();
    expect(
      normalizeAutoPassSession({ version: 1, status: "flying", domain: "x", cmid: 1 }),
    ).toBeNull();
    expect(
      normalizeAutoPassSession({ version: 1, status: "running", domain: "x", cmid: -1 }),
    ).toBeNull();
    expect(normalizeAutoPassSession({ version: 1, status: "running", cmid: 1 })).toBeNull();
  });

  it("rejects sessions older than the ttl", () => {
    const stale = normalizeAutoPassSession({
      version: 1,
      status: "running",
      domain: "moodle.test",
      cmid: 978,
      updatedAt: hoursAgoIso(13),
      startedAt: hoursAgoIso(13),
    });

    expect(stale).toBeNull();

    const fresh = normalizeAutoPassSession({
      version: 1,
      status: "running",
      domain: "moodle.test",
      cmid: 978,
      updatedAt: hoursAgoIso(2),
      startedAt: hoursAgoIso(2),
    });

    expect(fresh).not.toBeNull();
    expect(isAutoPassSessionStale(fresh!)).toBe(false);
  });

  it("matches sessions by domain and cmid", () => {
    const session = createAutoPassSession({ domain: "moodle.test", cmid: 978 });

    expect(doesAutoPassSessionMatchPage(session, "moodle.test", 978)).toBe(true);
    expect(doesAutoPassSessionMatchPage(session, "moodle.test", 979)).toBe(false);
    expect(doesAutoPassSessionMatchPage(session, "other.test", 978)).toBe(false);
    expect(doesAutoPassSessionMatchPage(session, "moodle.test", null)).toBe(false);
  });
});
