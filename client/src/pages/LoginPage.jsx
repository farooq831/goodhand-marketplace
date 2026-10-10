import { useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import GoogleLoginButton from "../components/GoogleLoginButton";

function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  // Set by ProtectedRoute / "Log in to book" so sign-in returns you where you were.
  const from = location.state?.from?.startsWith("/") ? location.state.from : "/dashboard";
  const [form, setForm] = useState({ email: "", password: "" });
  const [error, setError] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError(null);
    setIsSubmitting(true);
    try {
      await login(form);
      navigate(from, { replace: true });
    } catch (err) {
      setError(err.response?.data?.message || "Login failed");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="auth-layout">
      <aside className="auth-aside"><div><span className="eyebrow text-accent">Welcome back</span><h2 className="mt-6 font-display text-6xl leading-none">Good work<br /><span className="text-accent">starts here.</span></h2></div><p className="max-w-xs text-sm leading-6 text-snow/60">A considered marketplace for trusted local specialists and the people who need them.</p></aside>
      <div className="auth-form">
      <p className="eyebrow">Your workspace</p>
      <h1 className="mt-3 font-display text-4xl text-ink">Log in</h1>
      <p className="mt-2 mb-7 text-sm text-muted">Pick up where you left off.</p>
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <div className="field">
          <label htmlFor="login-email" className="form-label">Email</label>
          <input
            id="login-email"
            type="email"
            placeholder="you@example.com"
            required
            className="form-control"
            value={form.email}
            onChange={(e) => setForm({ ...form, email: e.target.value })}
          />
        </div>
        <div className="field">
          <div className="flex items-center justify-between">
            <label htmlFor="login-password" className="form-label">Password</label>
            <Link to="/forgot-password" className="text-link text-xs">Forgot password?</Link>
          </div>
          <input
            id="login-password"
            type="password"
            placeholder="••••••••"
            required
            className="form-control"
            value={form.password}
            onChange={(e) => setForm({ ...form, password: e.target.value })}
          />
        </div>
        {error && <p className="text-sm text-red-700">{error}</p>}
        <button
          type="submit"
          disabled={isSubmitting}
          className="button button--dark mt-1 w-full disabled:opacity-50"
        >
          {isSubmitting ? "Logging in..." : "Log in"}
        </button>
      </form>
      <div className="my-5 flex items-center gap-3 text-xs uppercase tracking-widest text-muted">
        <span className="h-px flex-1 bg-black/10" />or<span className="h-px flex-1 bg-black/10" />
      </div>
      <GoogleLoginButton redirectTo={from} />
      <p className="mt-6 text-sm text-muted">
        No account?{" "}
        <Link to="/register" className="text-link">
          Register
        </Link>
      </p>
      </div>
    </div>
  );
}

export default LoginPage;
