import { useQuery } from "@tanstack/react-query";
import { Award, Eye, Inbox, TrendingUp, Wallet } from "lucide-react";
import { getMyVendorStats } from "../api/vendorApi";

const pct = (n) => (n == null ? "—" : `${n}%`);

// Vendor dashboard: how the business is doing and what drives ranking.
function VendorStatsPanel() {
  const { data: s, isLoading, isError } = useQuery({ queryKey: ["my-vendor-stats"], queryFn: getMyVendorStats });
  if (isError) return null; // e.g. no profile yet — the status banner covers that
  if (isLoading) return <div className="skeleton mb-6 h-36" />;

  const tiles = [
    { icon: Eye, label: "Listing views", value: s.views.toLocaleString(), hint: s.conversionRate == null ? "No views yet" : `${s.conversionRate}% became requests` },
    { icon: Inbox, label: "Requests", value: s.requests, hint: s.pending ? `${s.pending} waiting for you` : "All answered" },
    { icon: TrendingUp, label: "Acceptance / completion", value: `${pct(s.acceptanceRate)} / ${pct(s.completionRate)}`, hint: "Accepted vs declined · finished vs cancelled" },
    { icon: Wallet, label: "Earned this month", value: `Rs ${s.earnedThisMonth.toLocaleString()}`, hint: "Released after the 24h window" },
  ];

  return (
    <section className="mb-6" aria-labelledby="perf-title">
      <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
        <h2 id="perf-title" className="section-title">Performance</h2>
        <p className="inline-flex items-center gap-1.5 rounded-full bg-primary/10 px-3 py-1 text-sm font-semibold text-primary" title="Based on ratings, completion and response rates, verification, experience and disputes">
          <Award size={15} aria-hidden="true" />Trust score {s.trustScore}/100
        </p>
      </div>
      <dl className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {tiles.map(({ icon: Icon, label, value, hint }) => (
          <div key={label} className="kpi-card">
            <dt className="meta-text flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide"><Icon size={14} aria-hidden="true" />{label}</dt>
            <dd className="mt-1 font-display text-2xl text-ink">{value}</dd>
            <dd className="meta-text mt-0.5 text-xs">{hint}</dd>
          </div>
        ))}
      </dl>
      {s.trustScore < 70 && (
        <p className="meta-text mt-3 text-xs">Raise your trust score — and your place in search — by answering requests quickly, finishing what you accept, and asking happy customers for a review.</p>
      )}
    </section>
  );
}

export default VendorStatsPanel;
