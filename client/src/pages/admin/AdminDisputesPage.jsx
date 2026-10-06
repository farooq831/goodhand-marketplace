import { useCallback, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ChevronRight, MessageSquare } from "lucide-react";
import { getDisputes } from "../../api/adminApi";
import BookingStatusBadge from "../../components/BookingStatusBadge";
import DisputeDetailDrawer from "../../components/DisputeDetailDrawer";
import QueryState from "../../components/QueryState";

// Design.md §4 "Admin — Dispute Queue": a table of open disputes; selecting
// a row opens the detail drawer with transcript, history, and resolution.
function AdminDisputesPage() {
  const [selected, setSelected] = useState(null);
  const query = useQuery({ queryKey: ["admin-disputes"], queryFn: getDisputes });
  const disputes = query.data || [];
  const close = useCallback(() => setSelected(null), []);

  return (
    <div className="workspace-page">
      <div className="workspace-header">
        <div>
          <p className="eyebrow">Admin console</p>
          <h1 className="workspace-title">Dispute queue</h1>
          <p className="workspace-subtitle">Review the chat and booking history, then release payment to the vendor or refund the customer.</p>
        </div>
        {disputes.length > 0 && <span className="rounded-full bg-red-50 px-3 py-1 text-sm font-semibold text-red-700">{disputes.length} open</span>}
      </div>

      <QueryState query={query} isEmpty={disputes.length === 0} empty="No open disputes. Everything is running smoothly." rows={3}>
        <div className="hidden overflow-hidden rounded-2xl border border-black/5 bg-white shadow-soft md:block">
          <table className="data-table">
            <thead>
              <tr>
                <th scope="col">Booking</th>
                <th scope="col">Customer</th>
                <th scope="col">Vendor</th>
                <th scope="col">Amount</th>
                <th scope="col">Raised on</th>
                <th scope="col">Status</th>
                <th scope="col"><span className="sr-only">Open</span></th>
              </tr>
            </thead>
            <tbody>
              {disputes.map((dispute) => (
                <tr key={dispute._id} onClick={() => setSelected(dispute)} className="cursor-pointer">
                  <td>
                    <p className="font-medium text-ink">{dispute.listingId?.title || "Booking"}</p>
                    <p className="font-mono text-xs text-muted">#{dispute._id.slice(-8)}</p>
                  </td>
                  <td>{dispute.customerId?.name}</td>
                  <td>{dispute.vendorId?.businessName}</td>
                  <td className="font-semibold">Rs {dispute.paymentId?.amount ?? dispute.price}</td>
                  <td>{new Date(dispute.disputeOpenedAt).toLocaleDateString()}</td>
                  <td><BookingStatusBadge status={dispute.status} /></td>
                  <td>
                    <button type="button" onClick={(event) => { event.stopPropagation(); setSelected(dispute); }} className="button button--outline button--sm">
                      Review<ChevronRight size={14} aria-hidden="true" className="ml-1" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <ul className="list-stack md:hidden">
          {disputes.map((dispute) => (
            <li key={dispute._id}>
              <button type="button" onClick={() => setSelected(dispute)} className="list-item w-full text-left">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate font-semibold text-ink">{dispute.listingId?.title || "Booking"}</p>
                    <p className="meta-text mt-1">{dispute.customerId?.name} · {dispute.vendorId?.businessName}</p>
                  </div>
                  <BookingStatusBadge status={dispute.status} />
                </div>
                <div className="mt-3 flex items-center justify-between text-sm">
                  <span className="font-semibold text-ink">Rs {dispute.paymentId?.amount ?? dispute.price}</span>
                  <span className="meta-text inline-flex items-center gap-1"><MessageSquare size={14} aria-hidden="true" />{dispute.messageCount} · {new Date(dispute.disputeOpenedAt).toLocaleDateString()}</span>
                </div>
              </button>
            </li>
          ))}
        </ul>
      </QueryState>

      {selected && <DisputeDetailDrawer dispute={selected} onClose={close} />}
    </div>
  );
}

export default AdminDisputesPage;
