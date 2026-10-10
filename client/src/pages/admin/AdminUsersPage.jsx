import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Search } from "lucide-react";
import { getUsers, setUserStatus } from "../../api/adminApi";
import QueryState, { errorMessage } from "../../components/QueryState";

const ROLES = [["", "All roles"], ["customer", "Customers"], ["vendor", "Vendors"]];
const STATUSES = [["", "Any status"], ["active", "Active"], ["suspended", "Suspended"]];

// Server-side search + pagination — the list used to load every account.
function AdminUsersPage() {
  const queryClient = useQueryClient();
  const [term, setTerm] = useState("");
  const [filters, setFilters] = useState({ q: "", role: "", status: "", page: 1 });
  const query = useQuery({ queryKey: ["admin-users", filters], queryFn: () => getUsers(filters), placeholderData: (prev) => prev });
  const mutation = useMutation({
    mutationFn: ({ id, status }) => setUserStatus(id, status),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["admin-users"] }),
  });
  const data = query.data;
  const set = (patch) => setFilters((f) => ({ ...f, ...patch, page: patch.page ?? 1 }));

  return (
    <div className="workspace-page">
      <div className="workspace-header">
        <div>
          <p className="eyebrow">Admin console</p>
          <h1 className="workspace-title">Account status</h1>
          <p className="workspace-subtitle">Find an account and suspend or reactivate it. Every change is recorded in the audit trail.</p>
        </div>
        {data && <p className="meta-text text-sm">{data.total.toLocaleString()} accounts</p>}
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <form className="relative min-w-60 flex-1" role="search" onSubmit={(e) => { e.preventDefault(); set({ q: term.trim() }); }}>
          <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted" aria-hidden="true" />
          <label htmlFor="user-search" className="sr-only">Search by email or name</label>
          <input id="user-search" className="form-control pl-9" placeholder="Search by email or name, then press Enter" value={term} onChange={(e) => setTerm(e.target.value)} />
        </form>
        <label className="sr-only" htmlFor="user-role">Role</label>
        <select id="user-role" className="form-control w-auto" value={filters.role} onChange={(e) => set({ role: e.target.value })}>
          {ROLES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>
        <label className="sr-only" htmlFor="user-status">Status</label>
        <select id="user-status" className="form-control w-auto" value={filters.status} onChange={(e) => set({ status: e.target.value })}>
          {STATUSES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>
      </div>

      {mutation.isError && <p className="status-banner status-banner--error mb-3 text-sm" role="alert">{errorMessage(mutation.error)}</p>}

      <QueryState query={query} isEmpty={(data?.users || []).length === 0} empty="No accounts match.">
        {data && (
          <>
            <ul className="list-stack">
              {data.users.map((user) => (
                <li key={user._id} className="list-item flex flex-wrap items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-semibold text-ink">{user.name}</p>
                    <p className="meta-text mt-1">{user.email} · <span className="capitalize">{user.role}</span> · joined {new Date(user.createdAt).toLocaleDateString()}</p>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className={`chip ${user.status === "active" ? "chip--on" : ""} pointer-events-none capitalize`}>{user.status}</span>
                    <button type="button" disabled={mutation.isPending} onClick={() => mutation.mutate({ id: user._id, status: user.status === "active" ? "suspended" : "active" })} className={`button button--sm disabled:opacity-50 ${user.status === "active" ? "button--danger" : "button--dark"}`}>
                      {user.status === "active" ? "Suspend" : "Reactivate"}
                    </button>
                  </div>
                </li>
              ))}
            </ul>
            {data.total > data.limit && (
              <nav className="mt-4 flex items-center justify-center gap-3 text-sm" aria-label="Pages">
                <button type="button" className="pager-button" disabled={filters.page <= 1} onClick={() => set({ page: filters.page - 1 })}>Prev</button>
                <span>Page {filters.page} of {Math.ceil(data.total / data.limit)}</span>
                <button type="button" className="pager-button" disabled={filters.page * data.limit >= data.total} onClick={() => set({ page: filters.page + 1 })}>Next</button>
              </nav>
            )}
          </>
        )}
      </QueryState>
    </div>
  );
}

export default AdminUsersPage;
