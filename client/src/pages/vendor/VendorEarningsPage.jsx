import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, Banknote, CheckCircle2, Clock, Hourglass, Undo2 } from "lucide-react";
import { getMyBookings } from "../../api/bookingApi";
import { getMyVendorProfile, getMyVendorStats, updateVendorProfile } from "../../api/vendorApi";
import { LoadError, SkeletonList, errorMessage } from "../../components/QueryState";

const rs = (n) => `Rs ${Number(n || 0).toLocaleString()}`;
const net = (p) => Math.round((p.amount - p.commissionAmount) * 100) / 100;
const WALLET = { jazzcash: "JazzCash", easypaisa: "Easypaisa" };

// One clear stage per payment: escrow → released (awaiting payout) → paid out.
function stageOf(payment) {
  if (payment.status === "refunded") return { key: "refunded", label: "Refunded to customer", icon: Undo2, tone: "text-muted" };
  if (payment.status === "released" && payment.payout?.status === "paid") return { key: "paid", label: "Paid out", icon: CheckCircle2, tone: "text-primary" };
  if (payment.status === "released") return { key: "awaiting", label: "Released — payout pending", icon: Hourglass, tone: "text-blue-700" };
  return { key: "held", label: payment.status === "disputed" ? "On hold — disputed" : "Held in escrow", icon: Clock, tone: "text-amber-700" };
}

function PayoutMethodForm({ profile }) {
  const queryClient = useQueryClient();
  const saved = profile?.payoutMethod;
  const [editing, setEditing] = useState(!saved?.type);
  const [form, setForm] = useState({ type: "jazzcash", accountTitle: "", accountNumber: "", bankName: "" });
  useEffect(() => {
    if (saved?.type) setForm({ type: saved.type, accountTitle: saved.accountTitle, accountNumber: saved.accountNumber, bankName: saved.bankName || "" });
    setEditing(!saved?.type);
  }, [saved?.type, saved?.accountNumber, saved?.accountTitle, saved?.bankName]);

  const mutation = useMutation({
    mutationFn: () => updateVendorProfile(profile._id, { payoutMethod: form }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["my-vendor-profile"] });
      setEditing(false);
    },
  });

  if (!profile) return null;
  const set = (field) => (e) => setForm({ ...form, [field]: e.target.value });

  return (
    <section className="panel" aria-labelledby="payout-method-title">
      <h2 id="payout-method-title" className="section-title flex items-center gap-2 text-base"><Banknote size={18} className="text-primary" aria-hidden="true" />Where we send your money</h2>
      {!editing && saved?.type ? (
        <div className="mt-3 flex flex-wrap items-center justify-between gap-3 text-sm">
          <div>
            <p className="font-medium text-ink">{saved.type === "bank" ? saved.bankName : WALLET[saved.type]}</p>
            <p className="font-mono">{saved.accountNumber}</p>
            <p className="meta-text">Title: {saved.accountTitle}</p>
          </div>
          <button type="button" onClick={() => setEditing(true)} className="button button--outline button--sm">Change</button>
        </div>
      ) : (
        <form
          className="mt-3 flex flex-col gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            mutation.mutate();
          }}
        >
          {!saved?.type && (
            <p className="status-banner status-banner--pending text-sm"><AlertTriangle size={18} aria-hidden="true" />Add your details so we can pay you for completed bookings.</p>
          )}
          <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Payout method">
            {[["jazzcash", "JazzCash"], ["easypaisa", "Easypaisa"], ["bank", "Bank account"]].map(([value, label]) => (
              <button key={value} type="button" role="radio" aria-checked={form.type === value} onClick={() => setForm({ ...form, type: value })} className={`chip button--sm ${form.type === value ? "chip--on" : ""}`}>{label}</button>
            ))}
          </div>
          {form.type === "bank" && (
            <div className="field">
              <label htmlFor="pm-bank" className="form-label">Bank name</label>
              <input id="pm-bank" required className="form-control" placeholder="e.g. Meezan Bank" value={form.bankName} onChange={set("bankName")} />
            </div>
          )}
          <div className="field">
            <label htmlFor="pm-number" className="form-label">{form.type === "bank" ? "IBAN" : "Mobile account number"}</label>
            <input id="pm-number" required className="form-control font-mono" placeholder={form.type === "bank" ? "PK36SCBL0000001123456702" : "03001234567"} value={form.accountNumber} onChange={set("accountNumber")} />
          </div>
          <div className="field">
            <label htmlFor="pm-title" className="form-label">Account title (name on the account)</label>
            <input id="pm-title" required className="form-control" value={form.accountTitle} onChange={set("accountTitle")} />
          </div>
          {mutation.isError && <p className="text-sm text-red-700" role="alert">{errorMessage(mutation.error)}</p>}
          <div className="flex gap-2">
            <button type="submit" disabled={mutation.isPending} className="button button--dark button--sm disabled:opacity-50">{mutation.isPending ? "Saving…" : "Save payout details"}</button>
            {saved?.type && <button type="button" onClick={() => setEditing(false)} className="button button--outline button--sm">Cancel</button>}
          </div>
          <p className="meta-text text-xs">Only Goodhand admins can see these details.</p>
        </form>
      )}
    </section>
  );
}

// Design.md §2: /dashboard/vendor/earnings. bookingService.getMyBookings
// populates paymentId (including payout), so this works from bookings.
function VendorEarningsPage() {
  const { data: bookings, isLoading, isError, error, refetch } = useQuery({ queryKey: ["my-bookings"], queryFn: () => getMyBookings() });
  const { data: profile } = useQuery({ queryKey: ["my-vendor-profile"], queryFn: getMyVendorProfile });

  const { data: stats } = useQuery({ queryKey: ["my-vendor-stats"], queryFn: getMyVendorStats });
  const withPayments = (bookings || []).filter((b) => b.paymentId);
  // Totals come from a server-side aggregation over every payment; the list
  // below only shows recent bookings, so summing it would undercount.
  const totals = { held: stats?.earnings?.held ?? 0, awaiting: stats?.earnings?.awaiting ?? 0, paid: stats?.earnings?.paidOut ?? 0 };

  return (
    <div className="workspace-page">
      <div className="workspace-header">
        <div>
          <p className="eyebrow">Vendor workspace</p>
          <h1 className="workspace-title">Earnings</h1>
          <p className="workspace-subtitle">Payments are released 24 hours after a booking completes, then paid out to your account.</p>
        </div>
      </div>

      <dl className="mb-6 grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div className="kpi-card"><dt className="meta-text text-xs uppercase tracking-wide">In escrow</dt><dd className="mt-1 font-display text-3xl text-ink">{rs(totals.held)}</dd><dd className="meta-text text-xs">Waiting for jobs to complete</dd></div>
        <div className="kpi-card"><dt className="meta-text text-xs uppercase tracking-wide">Awaiting payout</dt><dd className="mt-1 font-display text-3xl text-ink">{rs(totals.awaiting)}</dd><dd className="meta-text text-xs">Released — we'll send it soon</dd></div>
        <div className="kpi-card"><dt className="meta-text text-xs uppercase tracking-wide">Paid out</dt><dd className="mt-1 font-display text-3xl text-primary">{rs(totals.paid)}</dd><dd className="meta-text text-xs">Sent to your account</dd></div>
      </dl>

      <div className="grid gap-6 xl:grid-cols-[1fr_340px]">
        <section aria-label="Payments">
          {isLoading && <SkeletonList />}
          {isError && <LoadError error={error} onRetry={refetch} />}
          {!isLoading && !isError && withPayments.length === 0 && <div className="empty-state">No payments yet. They'll appear here once customers book you.</div>}
          <ul className="list-stack">
            {withPayments.map((b) => {
              const p = b.paymentId;
              const stage = stageOf(p);
              const Icon = stage.icon;
              return (
                <li key={b._id} className="list-item flex flex-wrap items-center justify-between gap-4">
                  <div className="min-w-0">
                    <p className="font-semibold text-ink">{b.listingId?.title}</p>
                    <p className="meta-text mt-1">{new Date(b.slot.date).toLocaleDateString()} · {b.customerId?.name}</p>
                    <p className="meta-text mt-0.5 text-xs">{rs(p.amount)} − {rs(p.commissionAmount)} commission = <span className="font-semibold text-primary">{rs(net(p))}</span></p>
                  </div>
                  <div className="text-right text-sm">
                    <p className={`inline-flex items-center gap-1.5 font-medium ${stage.tone}`}><Icon size={15} aria-hidden="true" />{stage.label}</p>
                    {stage.key === "paid" && (
                      <p className="meta-text text-xs">{new Date(p.payout.paidAt).toLocaleDateString()} · ref <span className="font-mono">{p.payout.reference}</span></p>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        </section>
        <PayoutMethodForm profile={profile} />
      </div>
    </div>
  );
}

export default VendorEarningsPage;
