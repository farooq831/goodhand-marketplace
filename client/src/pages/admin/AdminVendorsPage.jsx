import { useCallback, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, ChevronRight, FileText, RefreshCw } from "lucide-react";
import { getPendingVendors } from "../../api/vendorApi";
import QueryState from "../../components/QueryState";
import VendorReviewDrawer from "../../components/VendorReviewDrawer";
import { VERIFICATION_STATUS, missingItems } from "../../utils/verification";

const TABS = [
  { id: "pending", label: "Needs review" },
  { id: "changes_requested", label: "Waiting on vendor" },
];

function AdminVendorsPage() {
  const [tab, setTab] = useState("pending");
  const [selected, setSelected] = useState(null);
  const query = useQuery({ queryKey: ["pending-vendors"], queryFn: getPendingVendors });
  const vendors = query.data || [];
  const shown = vendors.filter((v) => (v.verificationStatus || "pending") === tab);
  const close = useCallback(() => setSelected(null), []);

  return (
    <div className="workspace-page">
      <div className="workspace-header">
        <div>
          <p className="eyebrow">Admin console</p>
          <h1 className="workspace-title">Vendor verification</h1>
          <p className="workspace-subtitle">Check each vendor's details and documents, then approve them or ask for corrections.</p>
        </div>
      </div>

      <div className="mb-5 flex gap-6 border-b border-black/5" role="tablist" aria-label="Verification queue">
        {TABS.map(({ id, label }) => {
          const count = vendors.filter((v) => (v.verificationStatus || "pending") === id).length;
          return (
            <button key={id} type="button" role="tab" aria-selected={tab === id} onClick={() => setTab(id)} className={`tab ${tab === id ? "tab--active" : ""}`}>
              {label} {count > 0 && <span className="ml-1 rounded-full bg-black/5 px-2 py-0.5 text-xs">{count}</span>}
            </button>
          );
        })}
      </div>

      <QueryState
        query={query}
        isEmpty={shown.length === 0}
        empty={tab === "pending" ? "No vendors waiting for review." : "No vendors are fixing their details right now."}
      >
        <ul className="list-stack">
          {shown.map((vendor) => {
            const missing = missingItems(vendor);
            const last = vendor.reviewHistory?.at(-1);
            const status = VERIFICATION_STATUS[vendor.verificationStatus] || VERIFICATION_STATUS.pending;
            return (
              <li key={vendor._id}>
                <button type="button" onClick={() => setSelected(vendor)} className="list-item flex w-full flex-wrap items-center justify-between gap-4 text-left">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-semibold text-ink">{vendor.businessName}</p>
                      <span className={`rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${status.tone}`}>{status.label}</span>
                      {last?.action === "resubmitted" && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-blue-100 px-2.5 py-0.5 text-[11px] font-semibold text-blue-700"><RefreshCw size={11} aria-hidden="true" />Resubmitted</span>
                      )}
                    </div>
                    <p className="meta-text mt-1">{vendor.category} · {vendor.userId?.name} ({vendor.userId?.email})</p>
                    <p className="mt-1.5 flex flex-wrap items-center gap-3 text-xs">
                      <span className="inline-flex items-center gap-1 text-muted"><FileText size={13} aria-hidden="true" />{vendor.documents?.length || 0} documents</span>
                      {missing.length > 0 ? (
                        <span className="inline-flex items-center gap-1 font-medium text-red-700"><AlertTriangle size={13} aria-hidden="true" />Missing: {missing.join(", ")}</span>
                      ) : (
                        <span className="font-medium text-primary">All required details provided</span>
                      )}
                    </p>
                  </div>
                  <span className="button button--outline button--sm">Review<ChevronRight size={14} aria-hidden="true" className="ml-1" /></span>
                </button>
              </li>
            );
          })}
        </ul>
      </QueryState>

      {selected && <VendorReviewDrawer vendor={selected} onClose={close} />}
    </div>
  );
}

export default AdminVendorsPage;
