import { useEffect, useRef, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, BadgeCheck, CheckCircle2, FileText, MessageSquareWarning, X } from "lucide-react";
import { requestVendorChanges, verifyVendor } from "../api/vendorApi";
import { errorMessage } from "./QueryState";
import { CHANGE_ITEMS, DOC_TYPES, VERIFICATION_STATUS, isImageUrl, missingItems } from "../utils/verification";

const HISTORY_LABEL = {
  submitted: "Registered and submitted for review",
  changes_requested: "Changes requested",
  resubmitted: "Vendor updated and resubmitted",
  approved: "Approved",
};

// Which change-request boxes to pre-tick from what's visibly missing.
function suggestedItems(profile) {
  const present = new Set((profile.documents || []).map((doc) => doc.type));
  const items = [];
  if (!present.has("cnic_front")) items.push("cnic_front");
  if (!present.has("cnic_back")) items.push("cnic_back");
  if (!profile.cnicNumber) items.push("cnic_number");
  if (!profile.serviceArea?.city) items.push("service_area");
  return items;
}

function Row({ label, children }) {
  return (
    <div className="data-row">
      <span className="data-row__label">{label}</span>
      <span className="data-row__value text-right">{children || <span className="text-red-700">Not provided</span>}</span>
    </div>
  );
}

function DocumentTile({ doc, label }) {
  return (
    <a href={doc.url} target="_blank" rel="noreferrer" className="group block overflow-hidden rounded-xl border border-black/10 bg-white transition hover:border-primary/40" title="Open full size in a new tab">
      {isImageUrl(doc.url) ? (
        <img src={doc.url} alt={label} className="aspect-[3/2] w-full object-cover transition group-hover:scale-[1.02]" />
      ) : (
        <span className="flex aspect-[3/2] items-center justify-center bg-canvas text-primary"><FileText size={28} aria-hidden="true" /></span>
      )}
      <span className="block truncate px-2.5 py-2 text-xs font-medium text-ink">{label}</span>
    </a>
  );
}

// Admin: everything about a vendor application in one place, and the two
// decisions — approve, or send it back with exactly what to fix.
function VendorReviewDrawer({ vendor, onClose }) {
  const queryClient = useQueryClient();
  const closeRef = useRef(null);
  const formRef = useRef(null);
  const [mode, setMode] = useState("idle"); // idle | request | approve
  const [items, setItems] = useState(() => suggestedItems(vendor));
  const [note, setNote] = useState("");

  const done = () => {
    queryClient.invalidateQueries({ queryKey: ["pending-vendors"] });
    queryClient.invalidateQueries({ queryKey: ["admin-analytics"] });
    onClose();
  };
  const approve = useMutation({ mutationFn: () => verifyVendor(vendor._id, note.trim()), onSuccess: done });
  const request = useMutation({ mutationFn: () => requestVendorChanges(vendor._id, { items, note: note.trim() }), onSuccess: done });
  const active = mode === "approve" ? approve : request;

  // Bring the checklist/note into view when a decision is started.
  useEffect(() => {
    if (mode !== "idle") formRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [mode]);

  useEffect(() => {
    closeRef.current?.focus();
    const onKey = (event) => event.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    const { overflow } = document.body.style;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = overflow;
    };
  }, [onClose]);

  const owner = vendor.userId || {};
  const missing = missingItems(vendor);
  const status = VERIFICATION_STATUS[vendor.verificationStatus] || VERIFICATION_STATUS.pending;
  const docsOf = (type) => (vendor.documents || []).filter((doc) => doc.type === type);
  const coords = vendor.serviceArea?.location?.coordinates;
  const toggle = (key) => setItems((current) => (current.includes(key) ? current.filter((k) => k !== key) : [...current, key]));
  const canSendRequest = items.length > 0 || note.trim().length > 0;

  return (
    <div className="fixed inset-0 z-50 flex justify-end" role="dialog" aria-modal="true" aria-labelledby="vendor-review-title">
      <button type="button" className="absolute inset-0 bg-ink/40 backdrop-blur-sm" aria-label="Close vendor review" tabIndex={-1} onClick={onClose} />
      <div className="drawer-panel">
        <div className="flex items-start justify-between gap-4 border-b border-black/5 p-5">
          <div className="min-w-0">
            <p className="eyebrow">Vendor application</p>
            <h2 id="vendor-review-title" className="mt-1 truncate font-display text-2xl text-ink">{vendor.businessName}</h2>
            <span className={`mt-2 inline-flex rounded-full px-2.5 py-1 text-[11px] font-semibold ${status.tone}`}>{status.label}</span>
          </div>
          <button ref={closeRef} type="button" onClick={onClose} className="icon-button shrink-0" aria-label="Close"><X size={18} /></button>
        </div>

        <div className="flex-1 space-y-6 overflow-y-auto p-5">
          {missing.length > 0 && (
            <div className="status-banner status-banner--pending" role="status">
              <AlertTriangle size={20} aria-hidden="true" />
              <p className="flex-1 text-sm"><span className="font-semibold">Missing:</span> {missing.join(", ")}</p>
            </div>
          )}

          <section>
            <h3 className="section-title text-base">Owner</h3>
            <div className="mt-2">
              <Row label="Name">{owner.name}</Row>
              <Row label="Email">{owner.email && <a href={`mailto:${owner.email}`} className="text-link">{owner.email}</a>}</Row>
              <Row label="Phone">{owner.phone}</Row>
              <Row label="CNIC number">{vendor.cnicNumber && <span className="font-mono">{vendor.cnicNumber}</span>}</Row>
              <Row label="Registered">{owner.createdAt && new Date(owner.createdAt).toLocaleDateString()}</Row>
            </div>
          </section>

          <section>
            <h3 className="section-title text-base">Business</h3>
            <div className="mt-2">
              <Row label="Category">{vendor.category}</Row>
              <Row label="City">{vendor.serviceArea?.city}</Row>
              <Row label="Map location">{coords?.length === 2 && <a className="text-link" target="_blank" rel="noreferrer" href={`https://www.google.com/maps?q=${coords[1]},${coords[0]}`}>{coords[1].toFixed(4)}, {coords[0].toFixed(4)}</a>}</Row>
            </div>
            <p className="mt-3 whitespace-pre-wrap rounded-xl bg-white p-3 text-sm leading-6 text-ink/80">{vendor.description || <span className="text-red-700">No description provided.</span>}</p>
          </section>

          <section>
            <h3 className="section-title text-base">Documents</h3>
            <p className="meta-text mt-1 text-xs">Click a document to open it full size.</p>
            <div className="mt-3 grid grid-cols-2 gap-3">
              {DOC_TYPES.flatMap(({ type, label, required }) => {
                const docs = docsOf(type);
                if (docs.length) return docs.map((doc, index) => <DocumentTile key={doc.url} doc={doc} label={docs.length > 1 ? `${label} ${index + 1}` : label} />);
                if (!required) return [];
                return [(
                  <div key={type} className="flex aspect-[3/2] flex-col items-center justify-center gap-1 rounded-xl border-2 border-dashed border-red-200 bg-red-50/50 text-center text-xs text-red-700">
                    <AlertTriangle size={18} aria-hidden="true" />
                    <span className="font-medium">{label}</span>
                    <span>Not uploaded</span>
                  </div>
                )];
              })}
            </div>
          </section>

          <section>
            <h3 className="section-title text-base">Review history</h3>
            <ol className="mt-3 space-y-3">
              {[...(vendor.reviewHistory || [])].reverse().map((entry) => (
                <li key={entry._id || entry.at} className="rounded-xl bg-white p-3 text-sm">
                  <p className="font-medium text-ink">{HISTORY_LABEL[entry.action] || entry.action}</p>
                  <p className="meta-text text-xs">{entry.by?.name || "—"} · {new Date(entry.at).toLocaleString()}</p>
                  {entry.items?.length > 0 && <ul className="mt-2 list-disc pl-5 text-ink/80">{entry.items.map((key) => <li key={key}>{CHANGE_ITEMS[key] || key}</li>)}</ul>}
                  {entry.note && <p className="mt-2 whitespace-pre-wrap rounded-lg bg-canvas px-3 py-2 text-ink/80">{entry.note}</p>}
                </li>
              ))}
            </ol>
          </section>

          {/* The decision form lives in the scrolling body, not the footer, so the
              footer's buttons stay on screen however short the window is. */}
          {mode !== "idle" && (
            <section ref={formRef} className="space-y-3 rounded-2xl border border-primary/20 bg-white p-4">
            {mode === "request" && (
              <fieldset className="space-y-2">
                <legend className="form-label mb-1">What does the vendor need to fix?</legend>
                <div className="grid gap-1.5 sm:grid-cols-2">
                  {Object.entries(CHANGE_ITEMS).map(([key, label]) => (
                    <label key={key} className="flex cursor-pointer items-start gap-2 rounded-lg p-1.5 text-sm hover:bg-canvas">
                      <input type="checkbox" checked={items.includes(key)} onChange={() => toggle(key)} className="mt-0.5 accent-[#0F6E5F]" />
                      <span>{label}</span>
                    </label>
                  ))}
                </div>
              </fieldset>
            )}
            {mode !== "idle" && (
              <div className="field">
                <label htmlFor="review-note" className="form-label">{mode === "request" ? "Message to the vendor" : "Note (optional)"}</label>
                <textarea id="review-note" rows={2} value={note} onChange={(e) => setNote(e.target.value)} className="form-control" placeholder={mode === "request" ? "e.g. The CNIC photo is blurry — please retake it in good light." : "Internal note for the record"} />
              </div>
            )}
              </section>
          )}
        </div>

        <div className="shrink-0 space-y-3 border-t border-black/5 bg-white p-4 shadow-[0_-8px_24px_rgba(24,51,47,0.06)]">
          {active.isError && <p className="status-banner status-banner--error text-sm" role="alert">{errorMessage(active.error)}</p>}

          {mode === "idle" && (
            <div className="flex flex-wrap gap-2">
              <button type="button" onClick={() => setMode("approve")} className="button button--dark button--sm flex-1">
                <BadgeCheck size={16} aria-hidden="true" className="mr-1.5" />Approve
              </button>
              <button type="button" onClick={() => setMode("request")} className="button button--outline button--sm flex-1">
                <MessageSquareWarning size={16} aria-hidden="true" className="mr-1.5" />Request changes
              </button>
            </div>
          )}
          {mode === "approve" && (
            <div className="flex flex-wrap items-center gap-2">
              <p className="flex-1 text-sm text-ink">
                {missing.length ? <span className="text-red-700">Approve despite missing items? </span> : null}
                {vendor.businessName} will go live in search.
              </p>
              <button type="button" onClick={() => setMode("idle")} className="button button--outline button--sm">Back</button>
              <button type="button" disabled={approve.isPending} onClick={() => approve.mutate()} className="button button--dark button--sm disabled:opacity-50">
                <CheckCircle2 size={16} aria-hidden="true" className="mr-1.5" />{approve.isPending ? "Approving…" : "Confirm approval"}
              </button>
            </div>
          )}
          {mode === "request" && (
            <div className="flex flex-wrap items-center gap-2">
              <p className="meta-text flex-1 text-xs">The vendor gets an in-app notification and an email listing these items.</p>
              <button type="button" onClick={() => setMode("idle")} className="button button--outline button--sm">Back</button>
              <button type="button" disabled={!canSendRequest || request.isPending} onClick={() => request.mutate()} className="button button--dark button--sm disabled:opacity-40">
                {request.isPending ? "Sending…" : "Send request"}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default VendorReviewDrawer;
