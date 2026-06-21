import { Component } from "react";
import type { ErrorInfo, ReactNode } from "react";
import Icon from "@mdi/react";
import { mdiAlertCircle, mdiRefresh, mdiHome } from "@mdi/js";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
}

class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null,
    };
  }

  static getDerivedStateFromError(error: Error): State {
    // Update state so the next render will show the fallback UI
    return {
      hasError: true,
      error,
      errorInfo: null,
    };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    // Log error details to console for developers
    console.error("🚨 ErrorBoundary caught an error:", error);
    console.error("🚨 Error Info:", errorInfo);
    console.error("🚨 Error Stack:", error.stack);
    console.error("🚨 Component Stack:", errorInfo.componentStack);

    // Update state with error info
    this.setState({
      error,
      errorInfo,
    });

    // You can also log the error to an error reporting service here
    // Example: logErrorToService(error, errorInfo);
  }

  handleRefresh = () => {
    // Reload the page
    window.location.reload();
  };

  handleGoHome = () => {
    // Navigate to home page
    window.location.href = "/";
  };

  render() {
    if (this.state.hasError) {
      // Custom fallback UI
      if (this.props.fallback) {
        return this.props.fallback;
      }

      // Default error UI
      return (
        <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 dark:from-gray-900 dark:to-gray-800 flex items-center justify-center p-4">
          <Card className="w-full max-w-2xl border-2 border-red-200 dark:border-red-800 shadow-xl">
            <CardHeader className="text-center pb-4">
              <div className="flex justify-center mb-4">
                <div className="rounded-full bg-red-100 dark:bg-red-900/30 p-4">
                  <Icon path={mdiAlertCircle} size={2} className="text-red-600 dark:text-red-400" />
                </div>
              </div>
              <CardTitle className="text-2xl font-bold text-red-600 dark:text-red-400">
                Oops! Something went wrong
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="text-center space-y-2">
                <p className="text-gray-700 dark:text-gray-300 text-lg">
                  We're sorry, but something unexpected happened. Our team has
                  been notified and is working on fixing this issue.
                </p>
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  Error details have been logged to the console for our
                  developers to investigate.
                </p>
              </div>

              {/* Error Details (collapsible for developers) */}
              {this.state.error && (
                <details className="mt-4 p-4 bg-gray-50 dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700">
                  <summary className="cursor-pointer text-sm font-semibold text-gray-700 dark:text-gray-300 hover:text-gray-900 dark:hover:text-gray-100">
                    Technical Details (Click to expand)
                  </summary>
                  <div className="mt-3 space-y-2 text-xs font-mono">
                    <div>
                      <strong className="text-red-600 dark:text-red-400">
                        Error:
                      </strong>
                      <pre className="mt-1 p-2 bg-gray-100 dark:bg-gray-900 rounded overflow-auto text-red-700 dark:text-red-300">
                        {this.state.error.toString()}
                      </pre>
                    </div>
                    {this.state.error.stack && (
                      <div>
                        <strong className="text-red-600 dark:text-red-400">
                          Stack Trace:
                        </strong>
                        <pre className="mt-1 p-2 bg-gray-100 dark:bg-gray-900 rounded overflow-auto text-gray-700 dark:text-gray-300 max-h-48">
                          {this.state.error.stack}
                        </pre>
                      </div>
                    )}
                    {this.state.errorInfo && (
                      <div>
                        <strong className="text-red-600 dark:text-red-400">
                          Component Stack:
                        </strong>
                        <pre className="mt-1 p-2 bg-gray-100 dark:bg-gray-900 rounded overflow-auto text-gray-700 dark:text-gray-300 max-h-48">
                          {this.state.errorInfo.componentStack}
                        </pre>
                      </div>
                    )}
                  </div>
                </details>
              )}

              {/* Action Buttons */}
              <div className="flex flex-col sm:flex-row gap-3 justify-center pt-4">
                <Button
                  onClick={this.handleRefresh}
                  className="bg-pink-500 hover:bg-pink-600 text-white"
                  size="lg"
                >
                  <Icon path={mdiRefresh} size={0.67} className="mr-2" />
                  Refresh Page
                </Button>
                <Button
                  onClick={this.handleGoHome}
                  variant="outline"
                  size="lg"
                  className="border-pink-500 text-pink-500 hover:bg-pink-50 dark:hover:bg-pink-900/20"
                >
                  <Icon path={mdiHome} size={0.67} className="mr-2" />
                  Go to Home
                </Button>
              </div>

              <div className="text-center text-xs text-gray-500 dark:text-gray-400 pt-2">
                If this problem persists, please contact support.
              </div>
            </CardContent>
          </Card>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
