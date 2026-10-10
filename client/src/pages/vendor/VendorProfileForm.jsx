import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, BadgeCheck, Clock, FileText, Trash2 } from "lucide-react";
import { getMyVendorProfile, createVendorProfile, updateVendorProfile } from "../../api/vendorApi";
import ImageUploadField from "../../components/ImageUploadField";
import { SERVICE_CATEGORIES as CATEGORIES } from "../../utils/categories";
import { PageLoading, errorMessage } from "../../components/QueryState";
import { CHANGE_ITEMS, DOC_TYPES, isImageUrl, openChangeRequest } from "../../utils/verification";

// Which change-request items point at which part of this form, so the
// flagged sections can be highlighted for the vendor.
const ITEM_SECTION = {
  cnic_front: "doc:cnic_front",
  cnic_back: "doc:cnic_back",
  business_proof: "doc:business_proof",
  cnic_number: "cnicNumber",
  business_name: "businessName",
  description: "description",
  service_area: "city",
  category: "category",
};

const EMPTY_FORM = { businessName: "", category: CATEGORIES[0], description: "", city: "", lat: "", lng: "", cnicNumber: "", documents: [], portfolio: [] };

function StatusBanner({ profile, request }) {
  if (!profile) {
    return (
      <div className="status-banner status-banner--info mb-6">
        <Clock size={20} aria-hidden="true" />
        <p className="flex-1 text-sm">Fill in your details and upload your CNIC. An admin reviews every vendor before their services go live.</p>
      </div>
    );
  }
  if (profile.verificationStatus === "approved") {
    return (
      <div className="status-banner status-banner--ok mb-6" role="status">
        <BadgeCheck size={20} aria-hidden="true" />
        <p className="flex-1 text-sm font-medium">Your profile is verified and visible to customers.</p>
      </div>
    );
  }
  if (request) {
    return (
      <div className="mb-6 rounded-2xl border border-red-200 bg-red-50 p-4 text-red-900" role="alert">
        <p className="flex items-center gap-2 font-semibold"><AlertTriangle size={20} aria-hidden="true" />Our team asked you to update a few things</p>
        {request.items?.length > 0 && (
          <ul className="mt-2 list-disc space-y-1 pl-7 text-sm">{request.items.map((key) => <li key={key}>{CHANGE_ITEMS[key] || key}</li>)}</ul>
        )}
        {request.note && <p className="mt-3 rounded-lg bg-white/60 px-3 py-2 text-sm"><span className="font-medium">Note:</span> {request.note}</p>}
        <p className="mt-3 text-xs opacity-80">Requested {new Date(request.at).toLocaleString()}. Fix the highlighted sections below, then press “Save & resubmit”.</p>
      </div>
    );
  }
  return (
    <div className="status-banner status-banner--pending mb-6" role="status">
      <Clock size={20} aria-hidden="true" />
      <p className="flex-1 text-sm"><span className="font-semibold">Pending verification.</span> An admin is reviewing your details — we'll email you when it's done.</p>
    </div>
  );
}

function VendorProfileForm() {
  const queryClient = useQueryClient();
  const { data: profile, isLoading } = useQuery({ queryKey: ["my-vendor-profile"], queryFn: getMyVendorProfile });

  const [form, setForm] = useState(EMPTY_FORM);
  const [resubmitNote, setResubmitNote] = useState("");
  const [message, setMessage] = useState(null);

  useEffect(() => {
    if (profile) {
      setForm({
        businessName: profile.businessName || "",
        category: profile.category || CATEGORIES[0],
        description: profile.description || "",
        city: profile.serviceArea?.city || "",
        lat: profile.serviceArea?.location?.coordinates?.[1] ?? "",
        lng: profile.serviceArea?.location?.coordinates?.[0] ?? "",
        cnicNumber: profile.cnicNumber || "",
        documents: profile.documents || [],
        portfolio: profile.portfolio || [],
      });
    }
  }, [profile]);

  const request = openChangeRequest(profile);
  const flagged = new Set((request?.items || []).map((key) => ITEM_SECTION[key]));
  const ring = (section) => (flagged.has(section) ? "rounded-xl ring-2 ring-red-300 ring-offset-4 ring-offset-white" : "");

  const mutation = useMutation({
    mutationFn: (data) => (profile ? updateVendorProfile(profile._id, data) : createVendorProfile(data)),
    onSuccess: () => {
      setMessage({ tone: "ok", text: request ? "Saved and sent back for review. We'll email you once it's checked." : profile ? "Saved." : "Submitted for verification." });
      setResubmitNote("");
      queryClient.invalidateQueries({ queryKey: ["my-vendor-profile"] });
    },
    onError: (err) => setMessage({ tone: "error", text: errorMessage(err, "Failed to save") }),
  });

  function handleSubmit(e) {
    e.preventDefault();
    setMessage(null);
    mutation.mutate({ ...form, ...(request ? { resubmitNote } : {}) });
  }

  function useMyLocation() {
    if (!navigator.geolocation) return setMessage({ tone: "error", text: "Location is not available in this browser." });
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => setForm((current) => ({ ...current, lat: coords.latitude, lng: coords.longitude })),
      () => setMessage({ tone: "error", text: "Location permission was not granted." }),
    );
  }

  // One slot per type; single-file types replace, "other" appends.
  function addDocuments(type, urls, multiple) {
    const added = (Array.isArray(urls) ? urls : [urls]).map((url) => ({ type, url, uploadedAt: new Date().toISOString() }));
    setForm((current) => ({
      ...current,
      documents: multiple ? [...current.documents, ...added] : [...current.documents.filter((doc) => doc.type !== type), ...added.slice(0, 1)],
    }));
  }
  const removeDocument = (url) => setForm((current) => ({ ...current, documents: current.documents.filter((doc) => doc.url !== url) }));

  if (isLoading) return <PageLoading />;

  const submitLabel = !profile ? "Submit for verification" : request ? "Save & resubmit for review" : "Save changes";

  return (
    <div className="mx-auto max-w-2xl px-5 py-10">
      <div className="workspace-header">
        <div>
          <p className="eyebrow">Vendor workspace</p>
          <h1 className="workspace-title">Vendor profile</h1>
        </div>
      </div>

      <StatusBanner profile={profile} request={request} />

      <form onSubmit={handleSubmit} className="panel flex flex-col gap-6">
        <section className="flex flex-col gap-5">
          <h2 className="section-title text-base">Business details</h2>
          <div className={`field ${ring("businessName")}`}>
            <label htmlFor="vp-name" className="form-label">Business name</label>
            <input id="vp-name" type="text" placeholder="e.g. Bright Spark Tutoring" required className="form-control" value={form.businessName} onChange={(e) => setForm({ ...form, businessName: e.target.value })} />
          </div>
          <div className={`field ${ring("category")}`}>
            <label htmlFor="vp-category" className="form-label">Category</label>
            <select id="vp-category" className="form-control" value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}>
              {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <div className={`field ${ring("city")}`}>
            <label htmlFor="vp-city" className="form-label">City</label>
            <input id="vp-city" type="text" placeholder="e.g. Lahore" className="form-control" value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} />
          </div>
          <div className={`field ${ring("city")}`}>
            <span className="form-label">Service location (optional)</span>
            <div className="flex gap-2">
              <input type="number" step="any" placeholder="Latitude" aria-label="Latitude" className="form-control" value={form.lat} onChange={(e) => setForm({ ...form, lat: e.target.value })} />
              <input type="number" step="any" placeholder="Longitude" aria-label="Longitude" className="form-control" value={form.lng} onChange={(e) => setForm({ ...form, lng: e.target.value })} />
            </div>
            <button type="button" onClick={useMyLocation} className="self-start text-link text-sm">Use my current location</button>
          </div>
          <div className={`field ${ring("description")}`}>
            <label htmlFor="vp-desc" className="form-label">Description</label>
            <textarea id="vp-desc" placeholder="Tell customers about your experience and services..." rows={4} className="form-control" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
          </div>
        </section>

        <section className="flex flex-col gap-3 border-t border-black/5 pt-6">
          <div>
            <h2 className="section-title text-base">Portfolio</h2>
            <p className="meta-text mt-1 text-xs">Photos of past work, shown on your public profile. Up to 12 — the strongest trust signal for new customers.</p>
          </div>
          {form.portfolio.length > 0 && (
            <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              {form.portfolio.map((item, index) => (
                <li key={item.url} className="overflow-hidden rounded-xl border border-black/10 bg-white">
                  <div className="relative">
                    <img src={item.url} alt="" className="aspect-square w-full object-cover" />
                    <button type="button" onClick={() => setForm((f) => ({ ...f, portfolio: f.portfolio.filter((_, i) => i !== index) }))} className="absolute right-1 top-1 rounded-full bg-white/90 p-1 text-red-700 shadow" aria-label="Remove photo"><Trash2 size={14} /></button>
                  </div>
                  <input aria-label="Caption" maxLength={120} placeholder="Caption (optional)" className="w-full border-0 border-t border-black/5 px-2 py-1.5 text-xs focus:outline-none" value={item.caption} onChange={(e) => setForm((f) => ({ ...f, portfolio: f.portfolio.map((p, i) => (i === index ? { ...p, caption: e.target.value } : p)) }))} />
                </li>
              ))}
            </ul>
          )}
          {form.portfolio.length < 12 && (
            <ImageUploadField kind="listing" multiple onUploaded={(urls) => setForm((f) => ({ ...f, portfolio: [...f.portfolio, ...urls.map((url) => ({ url, caption: "" }))].slice(0, 12) }))} />
          )}
        </section>

        <section className="flex flex-col gap-5 border-t border-black/5 pt-6">
          <div>
            <h2 className="section-title text-base">Identity verification</h2>
            <p className="meta-text mt-1 text-xs">Only Goodhand admins can see these — never customers.</p>
          </div>
          <div className={`field ${ring("cnicNumber")}`}>
            <label htmlFor="vp-cnic" className="form-label">CNIC number <span className="text-red-700">*</span></label>
            <input id="vp-cnic" type="text" inputMode="numeric" placeholder="35202-1234567-1" className="form-control font-mono" value={form.cnicNumber} onChange={(e) => setForm({ ...form, cnicNumber: e.target.value })} />
          </div>

          {DOC_TYPES.map(({ type, label, hint, required, multiple }) => {
            const docs = form.documents.filter((doc) => doc.type === type);
            return (
              <div key={type} className={`field ${ring(`doc:${type}`)}`}>
                <span className="form-label">{label} {required && <span className="text-red-700">*</span>}</span>
                <span className="meta-text -mt-1 text-xs">{hint}</span>
                {docs.length > 0 && (
                  <div className="flex flex-wrap gap-3">
                    {docs.map((doc) => (
                      <div key={doc.url} className="relative w-36 overflow-hidden rounded-xl border border-black/10 bg-white">
                        <a href={doc.url} target="_blank" rel="noreferrer" title="Open full size">
                          {isImageUrl(doc.url) ? <img src={doc.url} alt={label} className="aspect-[3/2] w-full object-cover" /> : <span className="flex aspect-[3/2] items-center justify-center bg-canvas text-primary"><FileText size={24} aria-hidden="true" /></span>}
                        </a>
                        <button type="button" onClick={() => removeDocument(doc.url)} className="absolute right-1 top-1 rounded-full bg-white/90 p-1 text-red-700 shadow hover:bg-white" aria-label={`Remove ${label}`}>
                          <Trash2 size={14} />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
                {(multiple || docs.length === 0 || flagged.has(`doc:${type}`)) && (
                  <ImageUploadField kind="verification" multiple={!!multiple} accept="image/*,.pdf" onUploaded={(urls) => addDocuments(type, urls, multiple)} />
                )}
                {!multiple && docs.length > 0 && !flagged.has(`doc:${type}`) && (
                  <details className="text-xs text-muted"><summary className="cursor-pointer">Replace this file</summary><div className="mt-2"><ImageUploadField kind="verification" accept="image/*,.pdf" onUploaded={(url) => addDocuments(type, url, false)} /></div></details>
                )}
              </div>
            );
          })}
        </section>

        {request && (
          <div className="field border-t border-black/5 pt-6">
            <label htmlFor="vp-resubmit-note" className="form-label">Message to the reviewer (optional)</label>
            <textarea id="vp-resubmit-note" rows={2} className="form-control" placeholder="e.g. I've uploaded a clearer photo of my CNIC." value={resubmitNote} onChange={(e) => setResubmitNote(e.target.value)} />
          </div>
        )}

        {message && <p role="status" className={`text-sm ${message.tone === "error" ? "text-red-700" : "text-primary"}`}>{message.text}</p>}
        <button type="submit" disabled={mutation.isPending} className="button button--dark self-start disabled:opacity-50">
          {mutation.isPending ? "Saving…" : submitLabel}
        </button>
      </form>
    </div>
  );
}

export default VendorProfileForm;
