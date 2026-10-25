import type { ErrorInfo, ReactNode } from "react";
import { Component } from "react";
import { useI18n } from "../i18n/react";

interface ErrorBoundaryState {
  hasError: boolean;
  error?: Error;
  errorInfo?: ErrorInfo;
}

interface ErrorBoundaryProps {
  children: ReactNode;
  fallback?: ReactNode;
}

function ErrorBoundaryFallback({ error, errorInfo }: { error?: Error; errorInfo?: ErrorInfo }) {
  const { t } = useI18n();

  return (
    <div className="error-boundary">
      <h2>{t("errors.boundaryTitle")}</h2>
      <p>{t("errors.boundaryText")}</p>
      {process.env.NODE_ENV === "development" && error && (
        <details>
          <summary>{t("errors.boundaryDetails")}</summary>
          <p>{error.toString()}</p>
          <p>{errorInfo?.componentStack}</p>
        </details>
      )}
      <button onClick={() => window.location.reload()}>{t("errors.boundaryReload")}</button>
    </div>
  );
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("ReduxShare Error Boundary caught an error:", error, errorInfo);

    if (process.env.NODE_ENV === "production") {
      // TODO: report the error to a monitoring service
    }
  }

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      return <ErrorBoundaryFallback error={this.state.error} errorInfo={this.state.errorInfo} />;
    }

    return this.props.children;
  }
}
