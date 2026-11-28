import { useI18n } from "../i18n/react";

interface SplashProps {
  label?: string;
  variant?: "full" | "overlay";
}

export function Splash({ label, variant = "full" }: SplashProps) {
  const { t } = useI18n();

  return (
    <div className={`splash splash--${variant}`} role="status" aria-live="polite">
      <div className="splash__mark" aria-hidden="true">
        <span className="splash__ring" />
        <img className="splash__logo" src="icons/reduxshare-icon-128.png" alt="" />
      </div>
      <div className="splash__label">{label ?? t("splash.loading")}</div>
      <div className="splash__meter" aria-hidden="true">
        <span />
      </div>
    </div>
  );
}
