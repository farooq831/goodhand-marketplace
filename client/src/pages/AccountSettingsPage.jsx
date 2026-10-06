import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { useAuth } from "../context/AuthContext";
import ImageUploadField from "../components/ImageUploadField";
import apiClient from "../api/client";

// PATCH /api/users/me has accepted name/phone/avatarUrl since phase 1, but
// only the avatar had any UI (buried in the dashboard aside). This is the
// page that actually reaches the other two.
function AccountSettingsPage() {
  const { user, updateUser } = useAuth();
  const [form, setForm] = useState({ name: user.name || "", phone: user.phone || "" });
  const [message, setMessage] = useState(null);

  const mutation = useMutation({
    mutationFn: async (updates) => {
      const { data } = await apiClient.patch("/users/me", updates);
      return data.user;
    },
    onSuccess: (updated) => {
      // Push the change back into AuthContext so the header greeting and
      // avatar update without a reload.
      updateUser({ name: updated.name, phone: updated.phone, avatarUrl: updated.avatarUrl });
      setMessage({ tone: "ok", text: "Saved." });
    },
    onError: (err) => setMessage({ tone: "error", text: err.response?.data?.message || "Failed to save" }),
  });

  function handleSubmit(event) {
    event.preventDefault();
    setMessage(null);
    mutation.mutate({ name: form.name.trim(), phone: form.phone.trim() || null });
  }

  return (
    <div className="mx-auto max-w-2xl px-5 py-10">
      <div className="workspace-header">
        <div>
          <p className="eyebrow">Your workspace</p>
          <h1 className="workspace-title">Account settings</h1>
          <p className="workspace-subtitle">Update how you appear to the people you work with.</p>
        </div>
      </div>

      <div className="panel mb-5">
        <h2 className="section-title text-base">Profile photo</h2>
        <div className="mt-4 flex items-center gap-4">
          {user.avatarUrl ? (
            <img src={user.avatarUrl} alt="Your profile photo" className="h-16 w-16 rounded-full object-cover ring-2 ring-primary/15" />
          ) : (
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-primary/10 font-display text-2xl text-primary" aria-hidden="true">
              {user.name?.slice(0, 1)}
            </div>
          )}
          <div className="min-w-0 flex-1">
            <ImageUploadField
              kind="avatar"
              onUploaded={async (url) => {
                setMessage(null);
                try {
                  await apiClient.patch("/users/me", { avatarUrl: url });
                  updateUser({ avatarUrl: url });
                  setMessage({ tone: "ok", text: "Photo updated." });
                } catch (err) {
                  setMessage({ tone: "error", text: err.response?.data?.message || "Failed to save photo" });
                }
              }}
            />
          </div>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="panel flex flex-col gap-5">
        <div className="field">
          <label htmlFor="account-name" className="form-label">Name</label>
          <input
            id="account-name"
            type="text"
            required
            maxLength={120}
            className="form-control"
            value={form.name}
            onChange={(event) => setForm({ ...form, name: event.target.value })}
          />
        </div>
        <div className="field">
          <label htmlFor="account-phone" className="form-label">Phone</label>
          <input
            id="account-phone"
            type="tel"
            className="form-control"
            placeholder="Optional — shared only with people you book with"
            value={form.phone}
            onChange={(event) => setForm({ ...form, phone: event.target.value })}
          />
        </div>

        <div>
          <h2 className="section-title text-base">Sign-in details</h2>
          <p className="mt-1 text-sm text-muted">
            Your email address and account type can&apos;t be changed here — changing an email needs
            re-verification, and roles are set by an administrator.
          </p>
          <div className="mt-3">
            <div className="data-row">
              <span className="data-row__label">Email</span>
              <span className="data-row__value">{user.email}</span>
            </div>
            <div className="data-row">
              <span className="data-row__label">Account type</span>
              <span className="data-row__value capitalize">{user.role}</span>
            </div>
          </div>
        </div>

        {message && (
          <p role="status" className={`text-sm ${message.tone === "error" ? "text-red-700" : "text-primary"}`}>
            {message.text}
          </p>
        )}
        <button type="submit" disabled={mutation.isPending} className="button button--dark self-start disabled:opacity-50">
          {mutation.isPending ? "Saving..." : "Save changes"}
        </button>
      </form>
    </div>
  );
}

export default AccountSettingsPage;
