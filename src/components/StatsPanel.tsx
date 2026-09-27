import { useCallback, useEffect, useState } from "react";
import type { UserProfile } from "../types";
import { useI18n } from "../i18n/react";
import {
  requestOwnUserProfile,
  requestUserLeaderboard,
  type UserLeaderboard,
} from "../lib/userProfiles";
import { Button } from "./Button";

type StatsLoadStatus = "loading" | "ready" | "error";

interface StatsPanelProps {
  userProfile?: UserProfile | null;
}

export function StatsPanel({ userProfile }: StatsPanelProps) {
  const { t, resolvedLanguage } = useI18n();
  const [profile, setProfile] = useState<UserProfile | null>(userProfile ?? null);
  const [leaderboard, setLeaderboard] = useState<UserLeaderboard | null>(null);
  const [status, setStatus] = useState<StatsLoadStatus>("loading");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const load = useCallback(() => {
    let cancelled = false;

    void Promise.all([requestOwnUserProfile(), requestUserLeaderboard()])
      .then(([profileResponse, leaderboardResponse]) => {
        if (cancelled) {
          return;
        }

        if (
          !profileResponse.ok ||
          !profileResponse.userProfile ||
          !leaderboardResponse.ok ||
          !leaderboardResponse.leaderboard
        ) {
          setErrorMessage(profileResponse.error ?? leaderboardResponse.error ?? null);
          setStatus("error");
          return;
        }

        setProfile(profileResponse.userProfile);
        setLeaderboard(leaderboardResponse.leaderboard);
        setStatus("ready");
      })
      .catch((error: unknown) => {
        if (cancelled) {
          return;
        }

        setErrorMessage(error instanceof Error ? error.message : String(error));
        setStatus("error");
      });

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => load(), [load]);

  const retry = () => {
    setErrorMessage(null);
    setStatus("loading");
    load();
  };

  const numberFormat = new Intl.NumberFormat(resolvedLanguage);
  const percentFormat = new Intl.NumberFormat(resolvedLanguage, {
    style: "percent",
    maximumFractionDigits: 0,
  });

  const formatAccuracy = (correct: number, incorrect: number) => {
    const verifiedCount = correct + incorrect;
    return verifiedCount > 0 ? percentFormat.format(correct / verifiedCount) : "—";
  };

  const verifiedCount = (profile?.attemptCorrectCount ?? 0) + (profile?.attemptIncorrectCount ?? 0);
  const accuracy =
    verifiedCount > 0
      ? percentFormat.format((profile?.attemptCorrectCount ?? 0) / verifiedCount)
      : "—";

  return (
    <div className="stats-panel">
      <div className="stats-tiles" data-loading={status === "loading" || undefined}>
        <div className="stats-tile">
          <span className="stats-tile__value">
            {profile ? numberFormat.format(profile.solvedTestsCount) : "…"}
          </span>
          <span className="stats-tile__label">{t("stats.tiles.solved")}</span>
        </div>
        <div className="stats-tile">
          <span className="stats-tile__value">{profile ? accuracy : "…"}</span>
          <span className="stats-tile__label">{t("stats.tiles.accuracy")}</span>
          <span className="stats-tile__hint">{t("stats.tiles.accuracyHint")}</span>
        </div>
        <div className="stats-tile">
          <span className="stats-tile__value">
            {profile ? numberFormat.format(profile.importedQuestionsCount) : "…"}
          </span>
          <span className="stats-tile__label">{t("stats.tiles.imported")}</span>
        </div>
      </div>
      {status === "loading" && <p className="stats-status">{t("stats.loading")}</p>}
      {status === "error" && (
        <div className="stats-error" role="alert">
          <p>{errorMessage ?? t("stats.error")}</p>
          <Button variant="outline" onClick={retry}>
            {t("stats.retry")}
          </Button>
        </div>
      )}
      {leaderboard && (
        <section className="stats-leaderboard">
          <div className="stats-leaderboard__head">
            <h2>{t("stats.leaderboard.title")}</h2>
            {leaderboard.myRank !== null && (
              <span className="stats-leaderboard__rank">
                {t("stats.leaderboard.yourRank", { rank: String(leaderboard.myRank) })}
              </span>
            )}
          </div>
          {leaderboard.entries.length === 0 ? (
            <p className="stats-leaderboard__empty">{t("stats.leaderboard.empty")}</p>
          ) : (
            <>
              <div className="stats-leaderboard__meta">
                <span>
                  {t("stats.leaderboard.answersLabel")}:{" "}
                  {numberFormat.format(leaderboard.totalAnswerRows)}
                </span>
                <span>
                  {t("stats.leaderboard.contributorsLabel")}:{" "}
                  {numberFormat.format(leaderboard.totalContributors)}
                </span>
              </div>
              <div className="stats-leaderboard__grid">
                <div className="stats-leaderboard__row stats-leaderboard__row--head">
                  <span>#</span>
                  <span>{t("stats.leaderboard.colUser")}</span>
                  <span>{t("stats.leaderboard.colQuestions")}</span>
                  <span>{t("stats.tiles.accuracy")}</span>
                </div>
                {leaderboard.entries.map((entry, index) => {
                  const rank = index + 1;
                  const isMe = entry.id === profile?.id;
                  const rowClass = [
                    "stats-leaderboard__row",
                    rank <= 3 ? "stats-leaderboard__row--top" : "",
                    isMe ? "stats-leaderboard__row--me" : "",
                  ]
                    .filter(Boolean)
                    .join(" ");

                  return (
                    <div key={entry.id} className={rowClass}>
                      <span className="stats-leaderboard__place">{rank}</span>
                      <span className="stats-leaderboard__user">
                        {entry.username}
                        {isMe && (
                          <span className="stats-leaderboard__you">
                            {t("stats.leaderboard.you")}
                          </span>
                        )}
                      </span>
                      <span className="stats-leaderboard__count">
                        {numberFormat.format(entry.importedQuestionsCount)}
                      </span>
                      <span className="stats-leaderboard__accuracy">
                        {formatAccuracy(entry.attemptCorrectCount, entry.attemptIncorrectCount)}
                      </span>
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </section>
      )}
    </div>
  );
}
