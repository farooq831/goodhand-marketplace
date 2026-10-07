import { useState } from "react";
import { MailWarning } from "lucide-react";
import { resendVerificationRequest } from "../api/authApi";
import { errorMessage } from "./QueryState";
import { useAuth } from "../context/AuthContext";

// Shown on every page until the signed-in user confirms their email.
// Booking and applying as a vendor are blocked server-side until then.
function EmailVerificationBanner() {
  const { user } = useAuth();
  const [state, setState] = useState("idle"); // idle | sending | sent | error
  const [message, setMessage] = useState("");

  if (!user || user.emailVerified !== false) return null;

  async function resend() {
    setState("sending");
    try {
      await resendVerificationRequest();
      setState("sent");
    } catch (err) {
      setState("error");
      setMessage(errorMessage(err, "Couldn't send the email."));
    }
  }

  return (
    <div className="border-b border-amber-200 bg-amber-50 text-amber-900" role="status">
      <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-3 px-5 py-2.5 text-sm lg:px-10">
        <MailWarning size={18} aria-hidden="true" className="shrink-0" />
        <p className="flex-1">
          {state === "sent"
            ? <>New link sent to <span className="font-semibold">{user.email}</span>. Check your inbox (and spam).</>
            : state === "error"
              ? message
              : <>Please confirm your email — we sent a link to <span className="font-semibold">{user.email}</span>. You need this to book or apply as a vendor.</>}
        </p>
        {state !== "sent" && (
          <button type="button" onClick={resend} disabled={state === "sending"} className="button button--outline button--sm disabled:opacity-50">
            {state === "sending" ? "Sending…" : "Resend email"}
          </button>
        )}
      </div>
    </div>
  );
}

export default EmailVerificationBanner;
