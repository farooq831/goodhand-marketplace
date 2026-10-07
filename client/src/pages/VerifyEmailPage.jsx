import { useEffect, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { AlertTriangle, CheckCircle2 } from "lucide-react";
import { verifyEmailRequest } from "../api/authApi";
import { errorMessage } from "../components/QueryState";
import { useAuth } from "../context/AuthContext";

function VerifyEmailPage() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get("token");
  const { user, updateUser } = useAuth();
  const [state, setState] = useState({ status: token ? "working" : "error", message: token ? "" : "This verification link is incomplete." });
  const started = useRef(false);

  useEffect(() => {
    // StrictMode runs effects twice in dev; the token is single-use.
    if (!token || started.current) return;
    started.current = true;
    verifyEmailRequest(token)
      .then(() => {
        setState({ status: "ok" });
        updateUser({ emailVerified: true });
      })
      .catch((err) => setState({ status: "error", message: errorMessage(err, "This link is invalid or has expired.") }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  return (
    <div className="mx-auto flex min-h-[60vh] max-w-md flex-col justify-center px-6 py-16">
      <p className="eyebrow">Email confirmation</p>
      {state.status === "working" && <h1 className="mt-3 font-display text-3xl text-ink">Confirming your email…</h1>}
      {state.status === "ok" && (
        <>
          <h1 className="mt-3 font-display text-4xl text-ink">You're verified</h1>
          <div className="status-banner status-banner--ok mt-6" role="status">
            <CheckCircle2 size={20} aria-hidden="true" />
            <p className="flex-1 text-sm">Thanks — your email address is confirmed.</p>
          </div>
          <Link to={user ? "/dashboard" : "/login"} className="button button--dark mt-5 w-full">{user ? "Go to your workspace" : "Log in"}</Link>
        </>
      )}
      {state.status === "error" && (
        <>
          <h1 className="mt-3 font-display text-4xl text-ink">Link didn't work</h1>
          <div className="status-banner status-banner--error mt-6" role="alert">
            <AlertTriangle size={20} aria-hidden="true" />
            <p className="flex-1 text-sm">{state.message}</p>
          </div>
          <p className="meta-text mt-4 text-sm">{user ? "Use “Resend email” in the banner at the top of the page to get a fresh link." : "Log in, then use “Resend email” in the banner at the top to get a fresh link."}</p>
        </>
      )}
    </div>
  );
}

export default VerifyEmailPage;
