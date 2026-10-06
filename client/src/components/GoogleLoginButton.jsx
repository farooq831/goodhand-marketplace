import { useEffect, useRef, useState } from "react";
import { useAuth } from "../context/AuthContext";
import { useNavigate } from "react-router-dom";

function GoogleLoginButton({ redirectTo = "/dashboard" }) {
  const { googleLogin } = useAuth();
  const navigate = useNavigate();
  const containerRef = useRef(null);
  const googleLoginRef = useRef(googleLogin);
  const [error, setError] = useState(null);
  const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID;

  useEffect(() => {
    googleLoginRef.current = googleLogin;
  }, [googleLogin]);

  useEffect(() => {
    if (!clientId || !containerRef.current) return;
    function renderButton() {
      if (!window.google || !containerRef.current) return;
      window.google.accounts.id.initialize({
        client_id: clientId,
        callback: async ({ credential }) => {
          try { await googleLoginRef.current(credential); navigate(redirectTo, { replace: true }); } catch (err) { setError(err.response?.data?.message || "Google login failed"); }
        },
      });
      window.google.accounts.id.renderButton(containerRef.current, { theme: "outline", size: "large", width: 320 });
    }
    if (window.google) renderButton();
    else {
      const script = document.createElement("script");
      script.src = "https://accounts.google.com/gsi/client";
      script.async = true;
      script.onload = renderButton;
      document.head.appendChild(script);
    }
  }, [clientId, navigate, redirectTo]);

  if (!clientId) return <p className="text-xs text-muted">Google login is not configured.</p>;
  return <div><div ref={containerRef} />{error && <p className="mt-2 text-sm text-red-700">{error}</p>}</div>;
}

export default GoogleLoginButton;
