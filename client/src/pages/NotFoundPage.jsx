import { Link, useLocation } from "react-router-dom";

// Without a catch-all route an unknown URL rendered an empty AppShell —
// header and footer with nothing between them, which reads as a broken page
// rather than a wrong address.
function NotFoundPage() {
  const location = useLocation();

  return (
    <div className="workspace-page">
      <div className="hero-panel">
        <p className="eyebrow text-accent">404</p>
        <h1 className="mt-3 font-display text-4xl sm:text-5xl">We couldn&apos;t find that page.</h1>
        <p className="mt-4 max-w-xl text-sm leading-6 text-white/75">
          <code className="rounded bg-white/10 px-1.5 py-0.5 text-white/90">{location.pathname}</code>{" "}
          doesn&apos;t exist. It may have moved, or the link may be out of date.
        </p>
        <div className="mt-7 flex flex-wrap gap-3">
          <Link to="/" className="button button--accent">Back to home</Link>
          <Link to="/search" className="button button--outline">Browse services</Link>
        </div>
      </div>
    </div>
  );
}

export default NotFoundPage;
