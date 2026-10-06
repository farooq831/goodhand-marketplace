import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { getUsers, setUserStatus } from "../../api/adminApi";
import { LoadError, SkeletonList } from "../../components/QueryState";

function AdminUsersPage() {
  const queryClient = useQueryClient();
  const { data: users = [], isLoading, isError, error, refetch } = useQuery({ queryKey: ["admin-users"], queryFn: getUsers });
  const mutation = useMutation({ mutationFn: ({ id, status }) => setUserStatus(id, status), onSuccess: () => queryClient.invalidateQueries({ queryKey: ["admin-users"] }) });
  return (
    <div className="workspace-page">
      <div className="workspace-header">
        <div>
          <p className="eyebrow">Admin console</p>
          <h1 className="workspace-title">Account status</h1>
          <p className="workspace-subtitle">Suspend or reactivate marketplace accounts.</p>
        </div>
      </div>
      {isLoading && <SkeletonList />}
      {isError && <LoadError error={error} onRetry={refetch} />}
      <ul className="list-stack">
        {users.map((user) => <li key={user._id} className="list-item flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="font-semibold text-ink">{user.name}</p>
            <p className="meta-text mt-1">{user.email} · <span className="capitalize">{user.role}</span></p>
          </div>
          <div className="flex items-center gap-3">
            <span className={`chip ${user.status === "active" ? "chip--on" : ""} pointer-events-none capitalize`}>{user.status}</span>
            <button type="button" disabled={mutation.isPending} onClick={() => mutation.mutate({ id: user._id, status: user.status === "active" ? "suspended" : "active" })} className={`button button--sm disabled:opacity-50 ${user.status === "active" ? "button--danger" : "button--dark"}`}>{user.status === "active" ? "Suspend" : "Reactivate"}</button>
          </div>
        </li>)}
      </ul>
    </div>
  );
}

export default AdminUsersPage;
