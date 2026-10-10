import { Heart } from "lucide-react";
import { useSaved } from "../hooks/useSaved";

// Heart toggle for saving a service or provider. Renders nothing for
// visitors who aren't customers. Safe to place inside a <Link>.
function SaveButton({ kind, id, label, className = "" }) {
  const { enabled, isSaved, toggle } = useSaved();
  if (!enabled) return null;
  const saved = isSaved(kind, id);
  return (
    <button
      type="button"
      onClick={(event) => {
        event.preventDefault();
        event.stopPropagation();
        toggle(kind, id);
      }}
      aria-pressed={saved}
      aria-label={saved ? `Remove ${label} from saved` : `Save ${label}`}
      className={`inline-flex h-9 w-9 items-center justify-center rounded-full bg-white/95 shadow-sm ring-1 ring-black/5 transition hover:scale-105 ${className}`}
    >
      <Heart size={17} aria-hidden="true" className={saved ? "fill-red-500 text-red-500" : "text-ink/70"} />
    </button>
  );
}

export default SaveButton;
