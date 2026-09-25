import type { ErrorInfo, ReactNode } from "react";
import { Component } from "react";

interface ErrorBoundaryState {
  hasError: boolean;
  error?: Error;
  errorInfo?: ErrorInfo;
}

interface ErrorBoundaryProps {
  children: ReactNode;
  fallback?: ReactNode;
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
      // TODO: Отправить ошибку в сервис мониторинга
    }
  }

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      return (
        <div className="error-boundary">
          <h2>Something went wrong</h2>
          <p>The application encountered an unexpected error. Please try refreshing the popup.</p>
          {process.env.NODE_ENV === "development" && this.state.error && (
            <details>
              <summary>Error details (development only)</summary>
              <p>{this.state.error.toString()}</p>
              <p>{this.state.errorInfo?.componentStack}</p>
            </details>
          )}
          <button onClick={() => window.location.reload()}>Reload Popup</button>
        </div>
      );
    }

    return this.props.children;
  }
}
