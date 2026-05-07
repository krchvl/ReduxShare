import { getCurrentExtensionVersion } from '../lib/updates';
import { useI18n } from "../i18n/react";
import type { UpdateState } from "../types";

interface HeaderProps {
  updateState: UpdateState;
}

export function Header({ updateState }: HeaderProps) {
  const { t } = useI18n();

  return (
    <header className="app-header" aria-label="ReduxShare">
      <div className="app-title">ReduxShare</div>
      <div className="beta-badge">{getCurrentExtensionVersion()}</div>
      {updateState.status === "available" && (
        <div className="update-badge">{t("updates.badge.new")}</div>
      )}
    </header>
  );
}
