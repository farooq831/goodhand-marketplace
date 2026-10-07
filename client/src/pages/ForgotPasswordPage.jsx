import { useState } from "react";
import { Link } from "react-router-dom";
import { MailCheck } from "lucide-react";
import { forgotPasswordRequest } from "../api/authApi";
import { errorMessage } from "../components/QueryState";

function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [error, setError] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(event) {
    event.preventDefault();
    setError(null);
    setIsSubmitting(true);
    try {
      await forgotPasswordRequest(email);
      setSent(true);
    } catch (err) {
      setError(errorMessage(err, "Something went wrong. Please try again."));
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="mx-auto flex min-h-[70vh] max-w-md flex-col justify-center px-6 py-16">
      <p className="eyebrow">Account help</p>
      <h1 className="mt-3 font-display text-4xl text-ink">Forgot your password?</h1>
      {sent ? (
        <div className="status-banner status-banner--ok mt-7" role="status">
          <MailCheck size={20} aria-hidden="true" />
          <p className="flex-1 text-sm">
            If an account exists for <span className="font-semibold">{email}</span>, we've sent a link to reset your password. It's valid for 1 hour — check your spam folder too.
          </p>
        </div>
      ) : (
        <>
          <p className="mt-2 mb-7 text-sm text-muted">Enter your email and we'll send you a link to choose a new one.</p>
          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <div className="field">
              <label htmlFor="forgot-email" className="form-label">Email</label>
              <input id="forgot-email" type="email" required placeholder="you@example.com" className="form-control" value={email} onChange={(e) => setEmail(e.target.value)} />
            </div>
            {error && <p className="text-sm text-red-700" role="alert">{error}</p>}
            <button type="submit" disabled={isSubmitting} className="button button--dark w-full disabled:opacity-50">
              {isSubmitting ? "Sending…" : "Send reset link"}
            </button>
          </form>
        </>
      )}
      <p className="mt-6 text-sm text-muted">
        Remembered it? <Link to="/login" className="text-link">Back to log in</Link>
      </p>
    </div>
  );
}

export default ForgotPasswordPage;
