import { useI18n } from "../i18n/react";
import type { UpdateState } from "../types";

interface HeaderProps {
  updateState: UpdateState;
}

export function Header({ updateState }: HeaderProps) {
  const { t } = useI18n();
  const updateBadge = updateState.status === "available" ? (
    updateState.releaseUrl ? (
      <a className="update-badge" href={updateState.releaseUrl} target="_blank" rel="noreferrer">
        {t("updates.badge.new")}
      </a>
    ) : (
      <span className="update-badge">{t("updates.badge.new")}</span>
    )
  ) : null;

  return (
    <header className="app-header" aria-label="ReduxShare">
      <div className="app-title">ReduxShare</div>
      <div className="beta-badge">{updateState.currentVersion}</div>
      {updateBadge}
    </header>
  );
}
