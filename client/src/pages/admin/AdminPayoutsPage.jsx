import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, CheckCircle2, Copy } from "lucide-react";
import { getPayoutHistory, getPendingPayouts, markPayoutPaid } from "../../api/adminApi";
import QueryState, { errorMessage } from "../../components/QueryState";

const rs = (n) => `Rs ${Number(n || 0).toLocaleString()}`;
const WALLET = { jazzcash: "JazzCash", easypaisa: "Easypaisa" };

function MethodDetails({ method }) {
  const [copied, setCopied] = useState(false);
  if (!method?.type) {
    return (
      <p className="flex items-center gap-1.5 text-sm text-red-700"><AlertTriangle size={15} aria-hidden="true" />No payout details yet — ask the vendor to add them on their Earnings page.</p>
    );
  }
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(method.accountNumber);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard blocked — the number is still visible to copy by hand */
    }
  };
  return (
    <div className="text-sm">
      <p className="font-medium text-ink">{method.type === "bank" ? method.bankName : WALLET[method.type]}</p>
      <p className="flex items-center gap-2">
        <span className="font-mono">{method.accountNumber}</span>
        <button type="button" onClick={copy} className="text-link inline-flex items-center gap-1 text-xs"><Copy size={12} aria-hidden="true" />{copied ? "Copied" : "Copy"}</button>
      </p>
      <p className="meta-text">Title: {method.accountTitle}</p>
    </div>
  );
}

function VendorPayoutCard({ group }) {
  const queryClient = useQueryClient();
  const [reference, setReference] = useState("");
  const [open, setOpen] = useState(false);
  const mutation = useMutation({
    mutationFn: () => markPayoutPaid({ vendorId: group.vendor._id, paymentIds: group.payments.map((p) => p._id), reference }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-payouts"] });
      queryClient.invalidateQueries({ queryKey: ["admin-payout-history"] });
    },
  });

  return (
    <li className="panel">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="font-semibold text-ink">{group.vendor.businessName}</p>
          <p className="meta-text text-xs">{group.vendor.userId?.name} · {group.vendor.userId?.email}{group.vendor.userId?.phone ? ` · ${group.vendor.userId.phone}` : ""}</p>
          <div className="mt-3"><MethodDetails method={group.vendor.payoutMethod} /></div>
        </div>
        <div className="text-right">
          <p className="meta-text text-xs uppercase tracking-wide">Owed</p>
          <p className="font-display text-3xl text-ink">{rs(group.total)}</p>
          <p className="meta-text text-xs">{group.payments.length} booking{group.payments.length === 1 ? "" : "s"}</p>
        </div>
      </div>

      <details className="mt-3 text-sm">
        <summary className="cursor-pointer text-muted">Show bookings</summary>
        <ul className="mt-2 divide-y divide-black/5">
          {group.payments.map((p) => (
            <li key={p._id} className="flex flex-wrap justify-between gap-2 py-1.5">
              <span>{p.title} <span className="meta-text">· {p.customer} · released {new Date(p.releasedAt).toLocaleDateString()}</span></span>
              <span className="tabular-nums">{rs(p.amount)} − {rs(p.commission)} = <span className="font-semibold">{rs(p.net)}</span></span>
            </li>
          ))}
        </ul>
      </details>

      <div className="mt-4 border-t border-black/5 pt-4">
        {!open ? (
          <button type="button" onClick={() => setOpen(true)} className="button button--dark button--sm">Mark {rs(group.total)} as paid</button>
        ) : (
          <form
            className="flex flex-wrap items-end gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              mutation.mutate();
            }}
          >
            <div className="field min-w-56 flex-1">
              <label htmlFor={`ref-${group.vendor._id}`} className="form-label">Transaction reference</label>
              <input id={`ref-${group.vendor._id}`} required className="form-control" placeholder="e.g. IBFT 2026100712345 or JazzCash TID" value={reference} onChange={(e) => setReference(e.target.value)} />
            </div>
            <button type="button" onClick={() => setOpen(false)} className="button button--outline button--sm">Cancel</button>
            <button type="submit" disabled={mutation.isPending || !reference.trim()} className="button button--dark button--sm disabled:opacity-50">
              {mutation.isPending ? "Saving…" : "Confirm paid"}
            </button>
            <p className="meta-text w-full text-xs">Send the money first by bank transfer or wallet, then record it here. The vendor is notified with this reference.</p>
          </form>
        )}
        {mutation.isError && <p className="mt-2 text-sm text-red-700" role="alert">{errorMessage(mutation.error)}</p>}
      </div>
    </li>
  );
}

function AdminPayoutsPage() {
  const [tab, setTab] = useState("pending");
  const pending = useQuery({ queryKey: ["admin-payouts"], queryFn: getPendingPayouts });
  const history = useQuery({ queryKey: ["admin-payout-history"], queryFn: getPayoutHistory, enabled: tab === "history" });
  const groups = pending.data || [];
  const totalOwed = groups.reduce((sum, g) => sum + g.total, 0);

  return (
    <div className="workspace-page">
      <div className="workspace-header">
        <div>
          <p className="eyebrow">Admin console</p>
          <h1 className="workspace-title">Vendor payouts</h1>
          <p className="workspace-subtitle">Money released from escrow that still needs to be sent to vendors.</p>
        </div>
        {totalOwed > 0 && <div className="kpi-card text-right"><p className="meta-text text-xs uppercase tracking-wide">Total owed</p><p className="font-display text-2xl text-ink">{rs(totalOwed)}</p></div>}
      </div>

      <div className="mb-5 flex gap-6 border-b border-black/5" role="tablist">
        <button type="button" role="tab" aria-selected={tab === "pending"} onClick={() => setTab("pending")} className={`tab ${tab === "pending" ? "tab--active" : ""}`}>To pay {groups.length > 0 && <span className="ml-1 rounded-full bg-black/5 px-2 py-0.5 text-xs">{groups.length}</span>}</button>
        <button type="button" role="tab" aria-selected={tab === "history"} onClick={() => setTab("history")} className={`tab ${tab === "history" ? "tab--active" : ""}`}>Paid</button>
      </div>

      {tab === "pending" && (
        <QueryState query={pending} isEmpty={groups.length === 0} empty="Nothing owed right now — every released payment has been paid out.">
          <ul className="list-stack">{groups.map((group) => <VendorPayoutCard key={group.vendor._id} group={group} />)}</ul>
        </QueryState>
      )}

      {tab === "history" && (
        <QueryState query={history} isEmpty={(history.data || []).length === 0} empty="No payouts recorded yet.">
          <div className="overflow-x-auto rounded-2xl border border-black/5 bg-white shadow-soft">
            <table className="data-table min-w-[40rem]">
              <thead><tr><th scope="col">Paid on</th><th scope="col">Vendor</th><th scope="col">Booking</th><th scope="col">Amount</th><th scope="col">Reference</th></tr></thead>
              <tbody>
                {(history.data || []).map((p) => (
                  <tr key={p._id}>
                    <td>{new Date(p.paidAt).toLocaleDateString()}</td>
                    <td>{p.vendorName}<p className="meta-text text-xs">{p.method}</p></td>
                    <td>{p.title}</td>
                    <td className="tabular-nums font-semibold">{rs(p.net)}</td>
                    <td><span className="inline-flex items-center gap-1 font-mono text-xs"><CheckCircle2 size={13} className="text-primary" aria-hidden="true" />{p.reference}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </QueryState>
      )}
    </div>
  );
}

export default AdminPayoutsPage;
