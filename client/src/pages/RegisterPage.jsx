import { useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import GoogleLoginButton from "../components/GoogleLoginButton";

function RegisterPage() {
  const { register } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  // "Become a vendor" links here with ?role=vendor; anything else defaults to customer.
  const initialRole = searchParams.get("role") === "vendor" ? "vendor" : "customer";
  const [form, setForm] = useState({ name: "", email: "", password: "", role: initialRole });
  const [error, setError] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError(null);
    setIsSubmitting(true);
    try {
      await register(form);
      navigate("/dashboard");
    } catch (err) {
      setError(err.response?.data?.message || "Registration failed");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="auth-layout">
      <aside className="auth-aside"><div><span className="eyebrow text-accent">A better local life</span><h2 className="mt-6 font-display text-6xl leading-none">Make room<br /><span className="text-accent">for good.</span></h2></div><p className="max-w-xs text-sm leading-6 text-white/60">Join a community built around craft, care, and the small businesses that make a place feel like home.</p></aside>
      <div className="auth-form">
      <p className="eyebrow">Begin here</p>
      <h1 className="mt-3 font-display text-4xl text-ink">Create an account</h1>
      <p className="mt-2 mb-7 text-sm text-muted">It takes less than a minute.</p>
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <div className="field">
          <label htmlFor="reg-name" className="form-label">Full name</label>
          <input
            id="reg-name"
            type="text"
            placeholder="Jane Doe"
            required
            className="form-control"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
          />
        </div>
        <div className="field">
          <label htmlFor="reg-email" className="form-label">Email</label>
          <input
            id="reg-email"
            type="email"
            placeholder="you@example.com"
            required
            className="form-control"
            value={form.email}
            onChange={(e) => setForm({ ...form, email: e.target.value })}
          />
        </div>
        <div className="field">
          <label htmlFor="reg-password" className="form-label">Password</label>
          <input
            id="reg-password"
            type="password"
            placeholder="Min 8 characters"
            required
            minLength={8}
            className="form-control"
            value={form.password}
            onChange={(e) => setForm({ ...form, password: e.target.value })}
          />
        </div>
        <div className="field">
          <label htmlFor="reg-role" className="form-label">I want to</label>
          <select
            id="reg-role"
            className="form-control"
            value={form.role}
            onChange={(e) => setForm({ ...form, role: e.target.value })}
          >
            <option value="customer">Find and book services</option>
            <option value="vendor">Offer my services</option>
          </select>
        </div>
        {error && <p className="text-sm text-red-700">{error}</p>}
        <button
          type="submit"
          disabled={isSubmitting}
          className="button button--dark mt-1 w-full disabled:opacity-50"
        >
          {isSubmitting ? "Creating account..." : "Create account"}
        </button>
      </form>
      <div className="my-5 flex items-center gap-3 text-xs uppercase tracking-widest text-muted">
        <span className="h-px flex-1 bg-black/10" />or<span className="h-px flex-1 bg-black/10" />
      </div>
      <GoogleLoginButton />
      <p className="mt-6 text-sm text-muted">
        Already have an account?{" "}
        <Link to="/login" className="text-link">
          Log in
        </Link>
      </p>
      </div>
    </div>
  );
}

export default RegisterPage;
