import { Link } from "react-router-dom";
import { AlertTriangle, Inbox, RotateCw } from "lucide-react";

export function errorMessage(error, fallback = "Something went wrong.") {
  return error?.response?.data?.message || error?.message || fallback;
}

export function LoadError({ error, onRetry, fallback = "We couldn't load this." }) {
  return (
    <div className="status-banner status-banner--error" role="alert">
      <AlertTriangle size={20} aria-hidden="true" />
      <p className="flex-1 text-sm">{errorMessage(error, fallback)}</p>
      {onRetry && (
        <button type="button" onClick={() => onRetry()} className="button button--outline button--sm">
          <RotateCw size={14} aria-hidden="true" className="mr-1.5" />Try again
        </button>
      )}
    </div>
  );
}

/** Full-page placeholder for detail pages while their primary query loads. */
export function PageLoading() {
  return (
    <div className="mx-auto max-w-5xl px-5 py-10" aria-busy="true" aria-label="Loading">
      <div className="skeleton h-10 w-1/3" />
      <div className="skeleton mt-4 h-5 w-1/2" />
      <div className="skeleton mt-8 h-48" />
      <div className="skeleton mt-4 h-32" />
    </div>
  );
}

/** Full-page "doesn't exist / no access" state with a way out. */
export function PageNotFound({ title = "Not found", message, to = "/dashboard", action = "Back to workspace" }) {
  return (
    <div className="mx-auto max-w-xl px-5 py-20">
      <div className="empty-state">
        <p className="font-semibold text-ink">{title}</p>
        {message && <p className="mt-1">{message}</p>}
        <Link to={to} className="button button--dark mt-5">{action}</Link>
      </div>
    </div>
  );
}

export function SkeletonList({ rows = 3, height = "h-24" }) {
  return (
    <div className="list-stack" aria-busy="true" aria-label="Loading">
      {Array.from({ length: rows }, (_, index) => <div key={index} className={`skeleton ${height}`} />)}
    </div>
  );
}

// One consistent treatment for the three non-happy states of a TanStack
// query: skeleton while loading, an error with a retry, and an empty state.
// Children are only *rendered* once there's data, but as JSX they are still
// *evaluated* by the caller on every render — so guard any `query.data.x`
// inside them (`query.data && ...`) or it throws while loading.
function QueryState({ query, isEmpty = false, empty = "Nothing here yet.", emptyAction = null, rows = 3, skeleton = null, children }) {
  if (query.isLoading) return skeleton || <SkeletonList rows={rows} />;

  if (query.isError) return <LoadError error={query.error} onRetry={query.refetch} />;

  if (isEmpty) {
    return (
      <div className="empty-state flex flex-col items-center gap-3">
        <Inbox size={28} aria-hidden="true" className="text-primary/60" />
        <div>{empty}</div>
        {emptyAction}
      </div>
    );
  }

  return children;
}

export default QueryState;
