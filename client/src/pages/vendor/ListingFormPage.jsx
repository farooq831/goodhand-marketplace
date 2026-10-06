import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useQuery, useMutation } from "@tanstack/react-query";
import { getListing, createListing, updateListing } from "../../api/listingApi";
import ImageUploadField from "../../components/ImageUploadField";
import { SERVICE_CATEGORIES as CATEGORIES } from "../../utils/categories";

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

const emptyForm = {
  title: "",
  description: "",
  category: CATEGORIES[0],
  price: "",
  durationMinutes: "",
  daysOfWeek: [1, 2, 3, 4, 5],
  startTime: "09:00",
  endTime: "17:00",
  photos: [],
};

function ListingFormPage() {
  const { id } = useParams();
  const isEdit = !!id;
  const navigate = useNavigate();
  const [form, setForm] = useState(emptyForm);
  const [error, setError] = useState(null);

  const { data: existing } = useQuery({
    queryKey: ["listing", id],
    queryFn: () => getListing(id),
    enabled: isEdit,
  });

  useEffect(() => {
    if (existing) {
      setForm({
        title: existing.title,
        description: existing.description || "",
        category: existing.category,
        price: existing.price,
        durationMinutes: existing.durationMinutes,
        daysOfWeek: existing.availabilityRules.daysOfWeek,
        startTime: existing.availabilityRules.startTime,
        endTime: existing.availabilityRules.endTime,
        photos: existing.photos || [],
      });
    }
  }, [existing]);

  const mutation = useMutation({
    mutationFn: (payload) => (isEdit ? updateListing(id, payload) : createListing(payload)),
    onSuccess: () => navigate("/dashboard/vendor/listings"),
    onError: (err) => setError(err.response?.data?.message || "Failed to save listing"),
  });

  function toggleDay(day) {
    setForm((f) => ({
      ...f,
      daysOfWeek: f.daysOfWeek.includes(day)
        ? f.daysOfWeek.filter((d) => d !== day)
        : [...f.daysOfWeek, day].sort((a, b) => a - b),
    }));
  }

  function handleSubmit(e) {
    e.preventDefault();
    setError(null);
    mutation.mutate({
      title: form.title,
      description: form.description,
      category: form.category,
      price: Number(form.price),
      durationMinutes: Number(form.durationMinutes),
      availabilityRules: {
        daysOfWeek: form.daysOfWeek,
        startTime: form.startTime,
        endTime: form.endTime,
      },
      photos: form.photos,
    });
  }

  return (
    <div className="mx-auto max-w-2xl px-5 py-10">
      <div className="workspace-header">
        <div>
          <p className="eyebrow">Vendor workspace</p>
          <h1 className="workspace-title">{isEdit ? "Edit listing" : "New listing"}</h1>
          <p className="workspace-subtitle">Describe the service, set your price, and choose when you're available.</p>
        </div>
      </div>
      <form onSubmit={handleSubmit} className="panel flex flex-col gap-5">
        <div className="field">
          <label htmlFor="lf-title" className="form-label">Title</label>
          <input
            id="lf-title"
            type="text"
            placeholder="e.g. Weekend maths tutoring"
            required
            className="form-control"
            value={form.title}
            onChange={(e) => setForm({ ...form, title: e.target.value })}
          />
        </div>
        <div className="field">
          <label htmlFor="lf-desc" className="form-label">Description</label>
          <textarea
            id="lf-desc"
            placeholder="What's included, your experience, what to expect..."
            rows={3}
            className="form-control"
            value={form.description}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
          />
        </div>
        <div className="field">
          <label className="form-label">Listing photos</label>
          <ImageUploadField kind="listing" multiple onUploaded={(urls) => setForm((current) => ({ ...current, photos: [...current.photos, ...urls] }))} />
          {form.photos.length > 0 && <div className="mt-1 grid grid-cols-3 gap-2 sm:grid-cols-4">{form.photos.map((url) => <img key={url} src={url} alt="Listing preview" className="aspect-square rounded-xl object-cover ring-1 ring-black/5" />)}</div>}
        </div>
        <div className="field">
          <label htmlFor="lf-category" className="form-label">Category</label>
          <select
            id="lf-category"
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
        <div className="flex gap-4">
          <div className="field flex-1">
            <label htmlFor="lf-price" className="form-label">Price (Rs)</label>
            <input
              id="lf-price"
              type="number"
              placeholder="0"
              required
              min="0"
              className="form-control"
              value={form.price}
              onChange={(e) => setForm({ ...form, price: e.target.value })}
            />
          </div>
          <div className="field flex-1">
            <label htmlFor="lf-duration" className="form-label">Duration (min)</label>
            <input
              id="lf-duration"
              type="number"
              placeholder="60"
              required
              min="1"
              className="form-control"
              value={form.durationMinutes}
              onChange={(e) => setForm({ ...form, durationMinutes: e.target.value })}
            />
          </div>
        </div>

        <div className="field">
          <label className="form-label">Available days</label>
          <div className="flex flex-wrap gap-2">
            {DAYS.map((label, day) => (
              <button
                key={day}
                type="button"
                aria-pressed={form.daysOfWeek.includes(day)}
                onClick={() => toggleDay(day)}
                className={`chip button--sm ${form.daysOfWeek.includes(day) ? "chip--on" : ""}`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        <div className="flex gap-4">
          <div className="field flex-1">
            <label htmlFor="lf-start" className="form-label">Start</label>
            <input
              id="lf-start"
              type="time"
              className="form-control"
              value={form.startTime}
              onChange={(e) => setForm({ ...form, startTime: e.target.value })}
            />
          </div>
          <div className="field flex-1">
            <label htmlFor="lf-end" className="form-label">End</label>
            <input
              id="lf-end"
              type="time"
              className="form-control"
              value={form.endTime}
              onChange={(e) => setForm({ ...form, endTime: e.target.value })}
            />
          </div>
        </div>

        {error && <p className="text-sm text-red-700">{error}</p>}
        <button
          type="submit"
          disabled={mutation.isPending}
          className="button button--dark self-start disabled:opacity-50"
        >
          {mutation.isPending ? "Saving..." : "Save listing"}
        </button>
      </form>
    </div>
  );
}

export default ListingFormPage;
