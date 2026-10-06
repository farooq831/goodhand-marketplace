import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { getMyVendorProfile, createVendorProfile, updateVendorProfile } from "../../api/vendorApi";
import ImageUploadField from "../../components/ImageUploadField";
import { SERVICE_CATEGORIES as CATEGORIES } from "../../utils/categories";
import { PageLoading } from "../../components/QueryState";

function VendorProfileForm() {
  const queryClient = useQueryClient();
  const { data: profile, isLoading } = useQuery({
    queryKey: ["my-vendor-profile"],
    queryFn: getMyVendorProfile,
  });

  const [form, setForm] = useState({
    businessName: "",
    category: CATEGORIES[0],
    description: "",
    city: "",
    lat: "",
    lng: "",
    verificationDocs: [],
  });
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
        verificationDocs: profile.verificationDocs || [],
      });
    }
  }, [profile]);

  const mutation = useMutation({
    mutationFn: (data) => (profile ? updateVendorProfile(profile._id, data) : createVendorProfile(data)),
    onSuccess: () => {
      setMessage("Saved.");
      queryClient.invalidateQueries({ queryKey: ["my-vendor-profile"] });
    },
    onError: (err) => setMessage(err.response?.data?.message || "Failed to save"),
  });

  function handleSubmit(e) {
    e.preventDefault();
    setMessage(null);
    mutation.mutate(form);
  }

  function useMyLocation() {
    if (!navigator.geolocation) return setMessage("Location is not available in this browser.");
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => setForm((current) => ({ ...current, lat: coords.latitude, lng: coords.longitude })),
      () => setMessage("Location permission was not granted."),
    );
  }

  if (isLoading) return <PageLoading />;

  return (
    <div className="mx-auto max-w-2xl px-5 py-10">
      <div className="workspace-header">
        <div>
          <p className="eyebrow">Vendor workspace</p>
          <h1 className="workspace-title">Vendor profile</h1>
          {profile && (
            <p className="mt-2 text-sm">
              Status:{" "}
              {profile.isVerified ? (
                <span className="font-semibold text-primary">Verified</span>
              ) : (
                <span className="font-semibold text-amber-600">Pending admin verification</span>
              )}
            </p>
          )}
        </div>
      </div>
      <form onSubmit={handleSubmit} className="panel flex flex-col gap-5">
        <div className="field">
          <label htmlFor="vp-name" className="form-label">Business name</label>
          <input
            id="vp-name"
            type="text"
            placeholder="e.g. Bright Spark Tutoring"
            required
            className="form-control"
            value={form.businessName}
            onChange={(e) => setForm({ ...form, businessName: e.target.value })}
          />
        </div>
        <div className="field">
          <label className="form-label">Service location</label>
          <div className="flex gap-2">
            <input type="number" step="any" placeholder="Latitude" className="form-control" value={form.lat} onChange={(e) => setForm({ ...form, lat: e.target.value })} />
            <input type="number" step="any" placeholder="Longitude" className="form-control" value={form.lng} onChange={(e) => setForm({ ...form, lng: e.target.value })} />
          </div>
          <button type="button" onClick={useMyLocation} className="self-start text-link text-sm">Use my current location</button>
        </div>
        <div className="field">
          <label className="form-label">Verification documents</label>
          <ImageUploadField kind="verification" multiple onUploaded={(urls) => setForm((current) => ({ ...current, verificationDocs: [...current.verificationDocs, ...urls] }))} />
          {form.verificationDocs.length > 0 && (
            <div className="mt-1 flex flex-wrap gap-2">
              {form.verificationDocs.map((url, i) => <span key={url} className="file-pill">Document {i + 1}</span>)}
            </div>
          )}
        </div>
        <div className="field">
          <label htmlFor="vp-category" className="form-label">Category</label>
          <select
            id="vp-category"
            className="form-control"
            value={form.category}
            onChange={(e) => setForm({ ...form, category: e.target.value })}
          >
            {CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor="vp-city" className="form-label">City</label>
          <input
            id="vp-city"
            type="text"
            placeholder="City"
            className="form-control"
            value={form.city}
            onChange={(e) => setForm({ ...form, city: e.target.value })}
          />
        </div>
        <div className="field">
          <label htmlFor="vp-desc" className="form-label">Description</label>
          <textarea
            id="vp-desc"
            placeholder="Tell customers about your work..."
            rows={4}
            className="form-control"
            value={form.description}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
          />
        </div>
        {message && <p className="text-sm text-muted">{message}</p>}
        <button
          type="submit"
          disabled={mutation.isPending}
          className="button button--dark self-start disabled:opacity-50"
        >
          {profile ? "Save changes" : "Create profile"}
        </button>
      </form>
    </div>
  );
}

export default VendorProfileForm;
