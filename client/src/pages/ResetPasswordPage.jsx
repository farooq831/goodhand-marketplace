import { useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { CheckCircle2 } from "lucide-react";
import { resetPasswordRequest } from "../api/authApi";
import { errorMessage } from "../components/QueryState";
import { useAuth } from "../context/AuthContext";

function ResetPasswordPage() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get("token");
  const { user, logout } = useAuth();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [done, setDone] = useState(false);
  const [error, setError] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(event) {
    event.preventDefault();
    setError(null);
    if (password.length < 8) return setError("Use at least 8 characters.");
    if (password !== confirm) return setError("The two passwords don't match.");
    setIsSubmitting(true);
    try {
      await resetPasswordRequest(token, password);
      // The server revoked every session; reflect that here too.
      if (user) await logout();
      setDone(true);
    } catch (err) {
      setError(errorMessage(err, "Couldn't reset your password."));
    } finally {
      setIsSubmitting(false);
    }
  }

  if (!token) {
    return (
      <div className="mx-auto max-w-md px-6 py-20">
        <div className="empty-state">
          <p className="font-semibold text-ink">This reset link is incomplete.</p>
          <Link to="/forgot-password" className="button button--dark mt-5">Request a new link</Link>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto flex min-h-[70vh] max-w-md flex-col justify-center px-6 py-16">
      <p className="eyebrow">Account help</p>
      <h1 className="mt-3 font-display text-4xl text-ink">Choose a new password</h1>
      {done ? (
        <>
          <div className="status-banner status-banner--ok mt-7" role="status">
            <CheckCircle2 size={20} aria-hidden="true" />
            <p className="flex-1 text-sm">Your password has been changed and you've been signed out everywhere else.</p>
          </div>
          <Link to="/login" className="button button--dark mt-5 w-full">Log in</Link>
        </>
      ) : (
        <form onSubmit={handleSubmit} className="mt-7 flex flex-col gap-4">
          <div className="field">
            <label htmlFor="reset-password" className="form-label">New password</label>
            <input id="reset-password" type="password" required minLength={8} autoComplete="new-password" className="form-control" value={password} onChange={(e) => setPassword(e.target.value)} />
            <span className="meta-text text-xs">At least 8 characters.</span>
          </div>
          <div className="field">
            <label htmlFor="reset-confirm" className="form-label">Confirm new password</label>
            <input id="reset-confirm" type="password" required autoComplete="new-password" className="form-control" value={confirm} onChange={(e) => setConfirm(e.target.value)} />
          </div>
          {error && (
            <p className="text-sm text-red-700" role="alert">
              {error} {/expired|invalid/i.test(error) && <Link to="/forgot-password" className="text-link">Request a new link</Link>}
            </p>
          )}
          <button type="submit" disabled={isSubmitting} className="button button--dark w-full disabled:opacity-50">
            {isSubmitting ? "Saving…" : "Set new password"}
          </button>
        </form>
      )}
    </div>
  );
}

export default ResetPasswordPage;
