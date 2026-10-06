import { Component } from "react";
import { AlertTriangle } from "lucide-react";

// Last line of defence: a render error in one page shows a recoverable
// message inside the app shell instead of unmounting the whole tree to a
// blank screen. Keyed by pathname in App so navigating away resets it.
class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    console.error("Page crashed:", error, info.componentStack);
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="mx-auto max-w-xl px-5 py-20">
        <div className="empty-state flex flex-col items-center gap-3">
          <AlertTriangle size={28} className="text-red-700" aria-hidden="true" />
          <p className="font-semibold text-ink">Something went wrong on this page.</p>
          <p>Try reloading. If it keeps happening, head back home and try again.</p>
          <div className="mt-2 flex gap-2">
            <button type="button" onClick={() => window.location.reload()} className="button button--dark">Reload</button>
            <a href="/" className="button button--outline">Go home</a>
          </div>
        </div>
      </div>
    );
  }
}

export default ErrorBoundary;
