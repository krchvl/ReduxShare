import { Fragment, type ReactNode } from "react";
import { useI18n } from "../i18n/react";
import { Button } from "./Button";

interface AuthGateOverlayProps {
  children: ReactNode;
  requiresAuth: boolean;
  onOpenLogin: () => void;
  contentClassName?: string;
}

export function AuthGateOverlay({
  children,
  requiresAuth,
  onOpenLogin,
  contentClassName,
}: AuthGateOverlayProps) {
  const { t } = useI18n();

  if (!requiresAuth) {
    if (contentClassName) {
      return <div className={contentClassName}>{children}</div>;
    }

    return <Fragment>{children}</Fragment>;
  }

  return (
    <div className="auth-gated">
      <div
        className={`auth-gated__content${contentClassName ? ` ${contentClassName}` : ""}`}
        aria-hidden="true"
        inert
      >
        {children}
      </div>
      <div className="auth-gated__overlay">
        <div className="auth-gated__card">
          <p className="auth-gated__message">{t("auth.gate.message")}</p>
          <Button className="auth-gated__action" variant="primary" onClick={onOpenLogin}>
            {t("auth.gate.action")}
          </Button>
        </div>
      </div>
    </div>
  );
}
