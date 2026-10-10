import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { getSaved, saveItem, unsaveItem } from "../api/savedApi";
import { useAuth } from "../context/AuthContext";

const FIELD = { listings: "listingIds", vendors: "vendorIds" };

// Saved services/providers for the signed-in customer, with optimistic
// toggling so the heart responds instantly and rolls back on failure.
export function useSaved() {
  const { user } = useAuth();
  const enabled = user?.role === "customer";
  const queryClient = useQueryClient();
  const query = useQuery({ queryKey: ["saved"], queryFn: getSaved, enabled, staleTime: 60000 });

  const mutation = useMutation({
    mutationFn: ({ kind, id, saved }) => (saved ? unsaveItem(kind, id) : saveItem(kind, id)),
    onMutate: async ({ kind, id, saved }) => {
      await queryClient.cancelQueries({ queryKey: ["saved"] });
      const previous = queryClient.getQueryData(["saved"]);
      queryClient.setQueryData(["saved"], (data) => {
        if (!data) return data;
        const ids = new Set(data[FIELD[kind]]);
        if (saved) ids.delete(id);
        else ids.add(id);
        return { ...data, [FIELD[kind]]: [...ids] };
      });
      return { previous };
    },
    onError: (_err, _vars, context) => queryClient.setQueryData(["saved"], context?.previous),
    onSettled: () => queryClient.invalidateQueries({ queryKey: ["saved"] }),
  });

  const isSaved = (kind, id) => !!query.data?.[FIELD[kind]]?.includes(String(id));
  const toggle = (kind, id) => mutation.mutate({ kind, id: String(id), saved: isSaved(kind, id) });
  return { enabled, isSaved, toggle, query };
}
