import { useState } from "react";
import { Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { EyeOff, RotateCcw, Search, Sparkles, X } from "lucide-react";
import { getAdminListings, moderateListing } from "../../api/adminApi";
import QueryState, { errorMessage } from "../../components/QueryState";

const STATUS_FILTERS = [
  { value: "", label: "All" },
  { value: "active", label: "Active" },
  { value: "featured", label: "Featured" },
  { value: "hidden", label: "Hidden" },
];

const isFeatured = (l) => l.featuredUntil && new Date(l.featuredUntil) > new Date();

function ListingRow({ listing }) {
  const queryClient = useQueryClient();
  const [mode, setMode] = useState(null); // "hide" | "feature" | null
  const [reason, setReason] = useState("");
  const [days, setDays] = useState("7");
  const mutation = useMutation({
    mutationFn: (body) => moderateListing(listing._id, body),
    onSuccess: () => {
      setMode(null);
      setReason("");
      queryClient.invalidateQueries({ queryKey: ["admin-listings"] });
    },
  });
  const hidden = listing.moderation?.hidden;
  const featured = isFeatured(listing);

  return (
    <li className="list-item">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <Link to={`/listing/${listing._id}`} className="font-semibold text-ink hover:text-primary">{listing.title}</Link>
          <p className="meta-text mt-0.5 text-xs">
            {listing.vendorId?.businessName} · {listing.category} · Rs {listing.price} · {listing.views || 0} views · trust {listing.vendorId?.trustScore ?? "—"}
          </p>
          <div className="mt-1.5 flex flex-wrap gap-1.5 text-[11px] font-semibold">
            {hidden && <span className="rounded-full bg-red-100 px-2 py-0.5 text-red-700">Hidden: {listing.moderation.reason}</span>}
            {!hidden && !listing.isActive && <span className="rounded-full bg-gray-100 px-2 py-0.5 text-gray-600">Paused by vendor</span>}
            {featured && <span className="rounded-full bg-amber-100 px-2 py-0.5 text-amber-800">Featured until {new Date(listing.featuredUntil).toLocaleDateString()}</span>}
            {!listing.vendorId?.isVerified && <span className="rounded-full bg-gray-100 px-2 py-0.5 text-gray-600">Vendor not verified</span>}
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {hidden ? (
            <button type="button" disabled={mutation.isPending} onClick={() => mutation.mutate({ action: "unhide" })} className="button button--outline button--sm"><RotateCcw size={14} aria-hidden="true" className="mr-1" />Restore</button>
          ) : (
            <>
              {featured ? (
                <button type="button" disabled={mutation.isPending} onClick={() => mutation.mutate({ action: "unfeature" })} className="button button--outline button--sm"><X size={14} aria-hidden="true" className="mr-1" />Unfeature</button>
              ) : (
                listing.isActive && <button type="button" onClick={() => setMode(mode === "feature" ? null : "feature")} className="button button--outline button--sm"><Sparkles size={14} aria-hidden="true" className="mr-1" />Feature</button>
              )}
              <button type="button" onClick={() => setMode(mode === "hide" ? null : "hide")} className="button button--danger button--sm"><EyeOff size={14} aria-hidden="true" className="mr-1" />Hide</button>
            </>
          )}
        </div>
      </div>

      {mode === "feature" && (
        <form className="mt-3 flex flex-wrap items-center gap-2 border-t border-black/5 pt-3" onSubmit={(e) => { e.preventDefault(); mutation.mutate({ action: "feature", days: Number(days) }); }}>
          <label htmlFor={`days-${listing._id}`} className="text-sm">Feature for</label>
          <select id={`days-${listing._id}`} className="form-control w-auto py-1.5" value={days} onChange={(e) => setDays(e.target.value)}>
            {["7", "14", "30", "90"].map((d) => <option key={d} value={d}>{d} days</option>)}
          </select>
          <button type="submit" disabled={mutation.isPending} className="button button--dark button--sm">Confirm</button>
          <span className="meta-text text-xs">Featured listings show first in search and on the homepage, with a badge.</span>
        </form>
      )}
      {mode === "hide" && (
        <form className="mt-3 flex flex-wrap items-end gap-2 border-t border-black/5 pt-3" onSubmit={(e) => { e.preventDefault(); mutation.mutate({ action: "hide", reason }); }}>
          <div className="field min-w-64 flex-1">
            <label htmlFor={`reason-${listing._id}`} className="form-label">Reason (sent to the vendor)</label>
            <input id={`reason-${listing._id}`} required className="form-control" placeholder="e.g. Photos don't match the service described" value={reason} onChange={(e) => setReason(e.target.value)} />
          </div>
          <button type="submit" disabled={mutation.isPending || !reason.trim()} className="button button--danger button--sm disabled:opacity-50">Hide listing</button>
        </form>
      )}
      {mutation.isError && <p className="mt-2 text-sm text-red-700" role="alert">{errorMessage(mutation.error)}</p>}
    </li>
  );
}

// Admin: moderate what customers see and sell featured placements.
function AdminListingsPage() {
  const [status, setStatus] = useState("");
  const [term, setTerm] = useState("");
  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);
  const query = useQuery({ queryKey: ["admin-listings", status, q, page], queryFn: () => getAdminListings({ status, q, page }), placeholderData: (prev) => prev });
  const data = query.data;

  return (
    <div className="workspace-page">
      <div className="workspace-header">
        <div>
          <p className="eyebrow">Admin console</p>
          <h1 className="workspace-title">Listings</h1>
          <p className="workspace-subtitle">Hide listings that break the rules, and feature services to promote them.</p>
        </div>
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <form className="relative min-w-60 flex-1" role="search" onSubmit={(e) => { e.preventDefault(); setQ(term.trim()); setPage(1); }}>
          <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted" aria-hidden="true" />
          <label htmlFor="listing-search" className="sr-only">Search listings by title</label>
          <input id="listing-search" className="form-control pl-9" placeholder="Search by title" value={term} onChange={(e) => setTerm(e.target.value)} />
        </form>
        <div className="flex flex-wrap gap-2" role="group" aria-label="Filter by status">
          {STATUS_FILTERS.map((f) => (
            <button key={f.value} type="button" aria-pressed={status === f.value} onClick={() => { setStatus(f.value); setPage(1); }} className={`chip button--sm ${status === f.value ? "chip--on" : ""}`}>{f.label}</button>
          ))}
        </div>
      </div>

      <QueryState query={query} isEmpty={(data?.listings || []).length === 0} empty="No listings match.">
        {data && (
          <>
            <ul className="list-stack">{data.listings.map((l) => <ListingRow key={l._id} listing={l} />)}</ul>
            {data.total > data.limit && (
              <nav className="mt-4 flex items-center justify-center gap-3 text-sm" aria-label="Pages">
                <button type="button" className="pager-button" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>Prev</button>
                <span>Page {page} of {Math.ceil(data.total / data.limit)}</span>
                <button type="button" className="pager-button" disabled={page * data.limit >= data.total} onClick={() => setPage((p) => p + 1)}>Next</button>
              </nav>
            )}
          </>
        )}
      </QueryState>
    </div>
  );
}

export default AdminListingsPage;
