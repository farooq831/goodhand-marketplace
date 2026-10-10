import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, ShieldCheck } from "lucide-react";
import { getAuditLog, getSecurityReport } from "../../api/adminApi";
import QueryState from "../../components/QueryState";

const ACTION_LABEL = {
  "auth.login": "Signed in",
  "auth.login_failed": "Failed sign-in",
  "auth.registered": "Registered",
  "auth.new_device": "Signed in from a new device",
  "auth.password_reset": "Reset password",
  "auth.email_verified": "Verified email",
  "admin.vendor_approved": "Approved vendor",
  "admin.vendor_changes_requested": "Requested vendor changes",
  "admin.dispute_resolved": "Resolved dispute",
  "admin.user_suspended": "Suspended user",
  "admin.user_reactivated": "Reactivated user",
  "admin.payout_marked_paid": "Marked payout paid",
  "admin.listing_hide": "Hid listing",
  "admin.listing_unhide": "Restored listing",
  "admin.listing_feature": "Featured listing",
  "admin.listing_unfeature": "Unfeatured listing",
};

const FILTERS = [
  { value: "", label: "Everything" },
  { value: "admin.", label: "Admin actions" },
  { value: "auth.login_failed", label: "Failed sign-ins" },
  { value: "auth.new_device", label: "New devices" },
  { value: "auth.", label: "All account events" },
];

function SuspiciousTable({ title, rows, keyField, listField, listLabel }) {
  return (
    <section className="panel overflow-hidden p-0">
      <h2 className="section-title p-5 pb-3 text-base">{title}</h2>
      {rows.length === 0 ? (
        <p className="meta-text flex items-center gap-2 px-5 pb-5"><ShieldCheck size={16} className="text-primary" aria-hidden="true" />No failed sign-ins in the last 24 hours.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="data-table min-w-[28rem]">
            <thead><tr><th scope="col">{keyField === "email" ? "Account" : "IP address"}</th><th scope="col">Failures</th><th scope="col">{listLabel}</th><th scope="col">Last</th></tr></thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row[keyField] || "unknown"}>
                  <td className="font-mono text-xs">
                    {row.flagged && <AlertTriangle size={14} className="mr-1 inline text-red-700" aria-label="Suspicious" />}
                    {row[keyField] || "(blank)"}
                  </td>
                  <td className={`tabular-nums font-semibold ${row.flagged ? "text-red-700" : ""}`}>{row.count}</td>
                  <td className="text-xs text-muted">{row[listField].join(", ")}{row.distinct > row[listField].length ? ` +${row.distinct - row[listField].length} more` : ""}</td>
                  <td className="text-xs">{new Date(row.last).toLocaleTimeString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

// Admin: watch for password guessing / credential stuffing, and review the
// trail of every admin decision and account security event.
function AdminSecurityPage() {
  const [filter, setFilter] = useState("");
  const [page, setPage] = useState(1);
  const report = useQuery({ queryKey: ["admin-security"], queryFn: getSecurityReport, refetchInterval: 60000 });
  const log = useQuery({ queryKey: ["admin-audit", filter, page], queryFn: () => getAuditLog({ action: filter, page }), placeholderData: (prev) => prev });
  const flagged = (report.data?.byEmail || []).filter((r) => r.flagged).length + (report.data?.byIp || []).filter((r) => r.flagged).length;

  return (
    <div className="workspace-page">
      <div className="workspace-header">
        <div>
          <p className="eyebrow">Admin console</p>
          <h1 className="workspace-title">Security & audit</h1>
          <p className="workspace-subtitle">Failed sign-ins in the last 24 hours, and a permanent record of every admin decision and account event.</p>
        </div>
      </div>

      <QueryState query={report} skeleton={<div className="skeleton h-40" />}>
        {report.data && (
          <>
            {flagged > 0 ? (
              <div className="status-banner status-banner--error mb-5" role="alert">
                <AlertTriangle size={20} aria-hidden="true" />
                <p className="flex-1 text-sm"><span className="font-semibold">{flagged} suspicious pattern{flagged > 1 ? "s" : ""}.</span> 5+ failures against one account suggests password guessing; one network trying 5+ accounts suggests credential stuffing. Repeated failures are already rate-limited automatically.</p>
              </div>
            ) : (
              <div className="status-banner status-banner--ok mb-5" role="status">
                <ShieldCheck size={20} aria-hidden="true" />
                <p className="flex-1 text-sm">No suspicious sign-in patterns in the last 24 hours. {report.data.newDevices} sign-in{report.data.newDevices === 1 ? "" : "s"} from new devices.</p>
              </div>
            )}
            <div className="grid gap-5 xl:grid-cols-2">
              <SuspiciousTable title="Failed sign-ins by account" rows={report.data.byEmail} keyField="email" listField="ips" listLabel="From IPs" />
              <SuspiciousTable title="Failed sign-ins by network" rows={report.data.byIp} keyField="ip" listField="emails" listLabel="Accounts tried" />
            </div>
          </>
        )}
      </QueryState>

      <section className="mt-8">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <h2 className="section-title">Audit trail</h2>
          <label className="flex items-center gap-2 text-sm">
            <span className="text-muted">Show</span>
            <select className="form-control w-auto py-1.5" value={filter} onChange={(e) => { setFilter(e.target.value); setPage(1); }}>
              {FILTERS.map((f) => <option key={f.value} value={f.value}>{f.label}</option>)}
            </select>
          </label>
        </div>
        <QueryState query={log} isEmpty={(log.data?.entries || []).length === 0} empty="Nothing recorded yet for this filter.">
          {log.data && (
            <>
              <div className="overflow-x-auto rounded-2xl border border-black/5 bg-white shadow-soft">
                <table className="data-table min-w-[44rem]">
                  <thead><tr><th scope="col">When</th><th scope="col">Event</th><th scope="col">Who</th><th scope="col">Details</th><th scope="col">From</th></tr></thead>
                  <tbody>
                    {log.data.entries.map((e) => (
                      <tr key={e._id}>
                        <td className="whitespace-nowrap text-xs">{new Date(e.createdAt).toLocaleString()}</td>
                        <td className={e.action === "auth.login_failed" ? "font-medium text-red-700" : "font-medium"}>{ACTION_LABEL[e.action] || e.action}</td>
                        <td className="text-xs">{e.actorId?.name ? `${e.actorId.name} (${e.actorId.role})` : e.actorEmail || "—"}</td>
                        <td className="max-w-xs truncate text-xs text-muted" title={JSON.stringify(e.details)}>
                          {e.details?.title ? `${e.details.title}${e.details.days ? ` · ${e.details.days} days` : ""}${e.details.reason ? ` — ${e.details.reason}` : ""}` : e.details?.reason || e.details?.businessName || e.details?.email || e.details?.reference || e.details?.device || e.details?.note || (e.targetType ? `${e.targetType} ${String(e.targetId).slice(-6)}` : "")}
                        </td>
                        <td className="font-mono text-xs text-muted" title={e.userAgent}>{e.ip}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {log.data.total > log.data.limit && (
                <nav className="mt-4 flex items-center justify-center gap-3 text-sm" aria-label="Audit log pages">
                  <button type="button" className="pager-button" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>Prev</button>
                  <span>Page {page} of {Math.ceil(log.data.total / log.data.limit)}</span>
                  <button type="button" className="pager-button" disabled={page * log.data.limit >= log.data.total} onClick={() => setPage((p) => p + 1)}>Next</button>
                </nav>
              )}
            </>
          )}
        </QueryState>
      </section>
    </div>
  );
}

export default AdminSecurityPage;
