/**
 * @file frontend/src/components/common/ErrorBoundary.jsx
 * @description React Error Boundary — catches uncaught rendering errors
 *   in the wrapped subtree, shows a friendly fallback UI, exposes stack
 *   info in development, and offers a "Try again" reset action
 * @author Dev B
 *
 * Error boundaries can only catch errors that happen during React's
 * render / lifecycle / constructor phases. They do NOT catch:
 *   - Errors in event handlers (use try/catch + Toast)
 *   - Asynchronous errors (Promise rejections — use the global
 *     `unhandledrejection` listener wired via `subscribeToWindowErrors`)
 *   - Errors in the boundary itself (the boundary is the last line of
 *     defense — wrap with a parent boundary if needed)
 *   - Errors during server-side rendering
 *
 * Reset strategy:
 *   - "Try again" resets the boundary's local error state and re-renders
 *     children. Useful for transient failures (a chart widget crashed
 *     on null data; reloading the chart's parent works fine).
 *   - "Reload page" is the nuclear option for when the React tree is
 *     unrecoverable. Triggers a full document reload.
 *
 * Integration:
 *   In production, swap the `onError` console.error for a real reporter
 *   (Sentry, Rollbar, custom audit log) without touching consumers.
 *   The `onError` prop is the seam.
 */

import { Component } from 'react';

/**
 * Is this build running in development mode? Vite injects `import.meta.env.DEV`
 * at build time. Falls back to NODE_ENV check for non-Vite tests.
 */
// Vite injects `import.meta.env`; `DEV` is true in `vite` dev and
// false in a production build. (Previously this also probed
// `process.env`, which doesn't exist in the browser bundle and tripped
// no-undef.)
const isDev =
  Boolean(import.meta?.env?.DEV) ||
  import.meta?.env?.MODE === 'development';

/**
 * ErrorBoundary — class component because React Error Boundaries are
 * still a class-only API (no hook equivalent as of React 19).
 *
 * @example
 *   <ErrorBoundary onError={(err, info) => report(err, info)}>
 *     <SuspectComponent />
 *   </ErrorBoundary>
 *
 * @example  with a custom fallback:
 *   <ErrorBoundary fallback={({ reset }) => <MyOwnFallback onRetry={reset} />}>
 *     <Page />
 *   </ErrorBoundary>
 */
class ErrorBoundary extends Component {
  /** Initial state — no error captured. */
  state = {
    hasError: false,
    error: null,
    errorInfo: null,
  };

  /**
   * Static derivation called during the render phase before any side
   * effects. Lets us derive the UI state from a thrown error without
   * blocking on async side-effects. Pair with `componentDidCatch` for
   * the post-error logging / reporting.
   *
   * @param {Error} error
   */
  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  /**
   * Called after a child throws. Use this for side effects (logging,
   * reporting). Receives a React-supplied `info` object containing the
   * component stack — invaluable for diagnosing which subtree blew up.
   */
  componentDidCatch(error, errorInfo) {
    this.setState({ errorInfo });

    const { onError, name } = this.props;

    // Always log to the console — dev gets a nice expandable stack,
    // production gets a structured single line that's easy to grep.
     
    console.error(
      `[ErrorBoundary${name ? `:${name}` : ''}] caught render-phase error:`,
      error,
      errorInfo?.componentStack
    );

    // Hand off to the consumer's reporter if any. We deliberately don't
    // await this — error boundaries should never make rendering async.
    if (typeof onError === 'function') {
      try {
        onError(error, errorInfo);
      } catch (reportErr) {
         
        console.error('[ErrorBoundary] reporter callback threw:', reportErr);
      }
    }
  }

  /**
   * Reset the boundary so it re-renders its children. Bumping `resetKey`
   * is what lets a parent decide when to retry (e.g. on route change).
   */
  reset = () => {
    this.setState({ hasError: false, error: null, errorInfo: null });
  };

  /**
   * If `resetKey` (or any value in `resetKeys`) changes, we automatically
   * reset the boundary. Useful for "navigate to a new route → clear the
   * error from the previous route" without manual intervention from the
   * consumer.
   */
  componentDidUpdate(prevProps) {
    if (!this.state.hasError) return;

    const { resetKeys = [], resetKey } = this.props;
    const prevKeys = prevProps.resetKeys || [];
    const prevKey = prevProps.resetKey;

    const keysChanged =
      resetKey !== prevKey ||
      resetKeys.length !== prevKeys.length ||
      resetKeys.some((k, i) => k !== prevKeys[i]);

    if (keysChanged) {
      this.reset();
    }
  }

  /** Full page reload as the fallback's nuclear option. */
  reload = () => {
    if (typeof window !== 'undefined') window.location.reload();
  };

  render() {
    const { hasError, error, errorInfo } = this.state;
    const { children, fallback, title, hideReload = false } = this.props;

    if (!hasError) return children;

    // Consumer-supplied fallback wins. We pass everything they might need.
    if (typeof fallback === 'function') {
      return fallback({
        error,
        errorInfo,
        reset: this.reset,
        reload: this.reload,
      });
    }

    return <DefaultFallback
      error={error}
      errorInfo={errorInfo}
      title={title}
      hideReload={hideReload}
      onReset={this.reset}
      onReload={this.reload}
    />;
  }
}

/**
 * DefaultFallback — the panel users see when something crashes. Plain
 * function component since it has no state of its own.
 */
const DefaultFallback = ({
  error,
  errorInfo,
  title,
  hideReload,
  onReset,
  onReload,
}) => {
  const heading = title || 'Something went wrong';
  const message = error?.message || 'An unexpected error occurred.';

  return (
    <div
      role="alert"
      className="flex flex-col items-center justify-center min-h-[60vh] p-6 text-center bg-white text-gray-900"
    >
      <div className="max-w-lg w-full rounded-lg border border-rose-200 bg-rose-50 p-6">
        {/* Icon */}
        <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-rose-200/70">
          <svg
            className="h-6 w-6 text-rose-700"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
            aria-hidden="true"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
            />
          </svg>
        </div>

        <h2 className="text-lg font-semibold text-gray-900">
          {heading}
        </h2>
        <p className="mt-1 text-sm text-gray-700">
          {message}
        </p>

        {/* Actions */}
        <div className="mt-5 flex flex-col-reverse sm:flex-row gap-2 justify-center">
          {!hideReload && (
            <button
              type="button"
              onClick={onReload}
              className="px-4 py-2 text-sm font-medium rounded-md bg-white border border-gray-300 text-gray-700 hover:bg-gray-50"
            >
              Reload page
            </button>
          )}
          <button
            type="button"
            onClick={onReset}
            autoFocus
            className="px-4 py-2 text-sm font-medium rounded-md bg-indigo-600 text-white hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
          >
            Try again
          </button>
        </div>

        {/* Dev-only stack panel — collapsible so it doesn't dominate the screen. */}
        {isDev && (error || errorInfo) && (
          <details className="mt-5 text-left">
            <summary className="cursor-pointer text-xs font-semibold uppercase tracking-wide text-gray-600">
              Error details (development only)
            </summary>
            {error?.stack && (
              <pre className="mt-2 text-[11px] leading-tight overflow-auto max-h-60 rounded bg-gray-900 text-gray-100 p-3">
                {error.stack}
              </pre>
            )}
            {errorInfo?.componentStack && (
              <>
                <p className="mt-2 text-[11px] uppercase tracking-wide text-gray-500">
                  Component stack
                </p>
                <pre className="mt-1 text-[11px] leading-tight overflow-auto max-h-40 rounded bg-gray-900 text-gray-100 p-3">
                  {errorInfo.componentStack}
                </pre>
              </>
            )}
          </details>
        )}
      </div>
    </div>
  );
};

export default ErrorBoundary;
export { DefaultFallback };
