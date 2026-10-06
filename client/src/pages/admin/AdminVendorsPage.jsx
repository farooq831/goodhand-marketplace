import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { getPendingVendors, verifyVendor } from "../../api/vendorApi";
import { LoadError, SkeletonList } from "../../components/QueryState";

function AdminVendorsPage() {
  const queryClient = useQueryClient();
  const { data: vendors, isLoading, isError, error, refetch } = useQuery({
    queryKey: ["pending-vendors"],
    queryFn: getPendingVendors,
  });

  const verifyMutation = useMutation({
    mutationFn: verifyVendor,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["pending-vendors"] }),
  });

  return (
    <div className="workspace-page">
      <div className="workspace-header">
        <div>
          <p className="eyebrow">Admin console</p>
          <h1 className="workspace-title">Vendor verification</h1>
          <p className="workspace-subtitle">Review and approve vendors waiting to go live.</p>
        </div>
      </div>
      {isLoading && <SkeletonList />}
      {isError && <LoadError error={error} onRetry={refetch} />}
      {vendors?.length === 0 && <div className="empty-state">Nothing pending.</div>}
      <ul className="list-stack">
        {vendors?.map((v) => (
          <li key={v._id} className="list-item flex flex-wrap items-center justify-between gap-4">
            <div>
              <p className="font-semibold text-ink">{v.businessName}</p>
              <p className="meta-text mt-1">
                {v.category} · {v.userId?.name} ({v.userId?.email})
              </p>
            </div>
            <button
              type="button"
              onClick={() => verifyMutation.mutate(v._id)}
              disabled={verifyMutation.isPending}
              className="button button--dark button--sm disabled:opacity-50"
            >
              Approve
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

export default AdminVendorsPage;
