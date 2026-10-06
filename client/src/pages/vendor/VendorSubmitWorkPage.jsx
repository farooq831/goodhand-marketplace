import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useMutation, useQuery } from "@tanstack/react-query";
import { getBooking, updateBookingStatus } from "../../api/bookingApi";
import ImageUploadField from "../../components/ImageUploadField";
import { PageLoading, PageNotFound } from "../../components/QueryState";

function VendorSubmitWorkPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [files, setFiles] = useState([]);
  const [message, setMessage] = useState("");
  const bookingQuery = useQuery({ queryKey: ["booking", id], queryFn: () => getBooking(id) });
  const submitMutation = useMutation({
    mutationFn: () => updateBookingStatus(id, "submitted", { files, note: message }),
    onSuccess: () => navigate(`/booking/${id}`),
  });

  if (bookingQuery.isLoading) return <PageLoading />;
  if (bookingQuery.isError || !bookingQuery.data) return <PageNotFound title="Booking not found" message="It may not exist, or it isn't one of yours." to="/dashboard/vendor/bookings" action="Back to bookings" />;

  const booking = bookingQuery.data;
  if (booking.status !== "accepted") {
    return (
      <div className="mx-auto max-w-2xl px-5 py-16">
        <div className="empty-state">
          <p>This order is no longer waiting for work submission.</p>
          <Link to={`/booking/${id}`} className="mt-3 inline-block text-link">View booking</Link>
        </div>
      </div>
    );
  }

  // A booking back at "accepted" after a delivery means the customer sent
  // it back — the reason is why the vendor is on this page a second time,
  // so lead with it rather than making them dig through the timeline.
  const history = booking.statusHistory || [];
  const deliveryCount = history.filter((entry) => entry.status === "submitted").length;
  const latestRevision = deliveryCount
    ? [...history].reverse().find((entry) => entry.status === "accepted" && entry.note)
    : null;

  return (
    <div className="mx-auto max-w-2xl px-5 py-10">
      <div className="workspace-header">
        <div>
          <p className="eyebrow">Vendor workspace</p>
          <h1 className="workspace-title">{latestRevision ? "Resubmit work" : "Submit work"}</h1>
          <p className="workspace-subtitle">{booking.listingId?.title} for {booking.customerId?.name}</p>
        </div>
      </div>
      {latestRevision && (
        <div className="panel-muted mb-4">
          <h2 className="section-title text-base text-primary">
            Revision {deliveryCount} requested
          </h2>
          <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-ink/80">{latestRevision.note}</p>
          <p className="meta-text mt-2 text-xs">
            {latestRevision.changedBy?.name || "The customer"} · {new Date(latestRevision.changedAt).toLocaleString()}
          </p>
        </div>
      )}
      <div className="panel">
        <p className="text-sm leading-6 text-ink/70">Attach the finished work for the customer to review. You can upload images, PDFs, or Word documents.</p>
        <div className="mt-4">
          <ImageUploadField kind="work" multiple accept="image/*,.pdf,.doc,.docx" onUploaded={(urls) => setFiles((current) => [...current, ...urls])} />
        </div>
        <div className="field mt-4">
          <label htmlFor="submission-message" className="form-label">Message for customer</label>
          <textarea id="submission-message" value={message} onChange={(event) => setMessage(event.target.value)} maxLength={2000} rows={4} placeholder="Explain what you completed or share any important details..." className="form-control" />
        </div>
        {files.length > 0 && (
          <div className="mt-4 flex flex-wrap gap-2">
            {files.map((file) => <a key={file} href={file} target="_blank" rel="noreferrer" className="file-pill">View attached file</a>)}
          </div>
        )}
        <button type="button" onClick={() => submitMutation.mutate()} disabled={!files.length || submitMutation.isPending} className="button button--dark mt-5 disabled:opacity-50">
          {submitMutation.isPending ? "Submitting..." : "Submit work to customer"}
        </button>
        {submitMutation.isError && <p className="mt-3 text-sm text-red-700">{submitMutation.error?.response?.data?.message || "Unable to submit work"}</p>}
      </div>
    </div>
  );
}

export default VendorSubmitWorkPage;