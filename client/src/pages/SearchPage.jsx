import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Check, LocateFixed, Search, SlidersHorizontal, X } from "lucide-react";
import { searchListings } from "../api/listingApi";
import ListingCard from "../components/ListingCard";
import QueryState from "../components/QueryState";
import { SERVICE_CATEGORIES } from "../utils/categories";

// Filters live in the URL rather than component state so that the landing
// page's search box and category tiles (which navigate here with ?q= and
// ?category=) actually land, and so a filtered result set is shareable and
// survives the back button.
const URL_FILTERS = ["q", "category", "minPrice", "maxPrice", "minRating", "date", "sort", "page"];
// The subset counted on the mobile "Filters (n)" button — search text and
// sort have their own always-visible controls.
const PANEL_FILTERS = ["category", "minPrice", "maxPrice", "minRating", "date"];

// Commits on blur/Enter rather than per keystroke, so typing "1500" fires
// one search instead of four.
function PriceInput({ id, label, value, onCommit }) {
  const [draft, setDraft] = useState(value);
  useEffect(() => setDraft(value), [value]);
  const commit = () => draft !== value && onCommit(draft);
  return (
    <div className="field flex-1">
      <label htmlFor={id} className="text-xs text-muted">{label}</label>
      <input
        id={id}
        type="number"
        min="0"
        inputMode="numeric"
        placeholder="Rs"
        className="form-control"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => e.key === "Enter" && commit()}
      />
    </div>
  );
}

function ResultsSkeleton() {
  return (
    <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-3" aria-busy="true">
      {[1, 2, 3, 4, 5, 6].map((n) => <div key={n} className="skeleton aspect-[4/5]" />)}
    </div>
  );
}

function SearchPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  // Coordinates stay out of the URL on purpose — a link someone shares
  // shouldn't carry where they were standing.
  const [coords, setCoords] = useState(null);
  const [radiusKm, setRadiusKm] = useState("25");
  const [locationError, setLocationError] = useState(null);
  const [drawerOpen, setDrawerOpen] = useState(false);

  const filters = Object.fromEntries(URL_FILTERS.map((key) => [key, searchParams.get(key) || ""]));
  const sort = filters.sort || "newest";
  const page = Math.max(1, Number(filters.page) || 1);

  // The text box commits on submit rather than binding straight to the URL,
  // which would refetch on every keystroke. Kept in sync when the URL
  // changes from elsewhere (a category tile, the back button).
  const [term, setTerm] = useState(filters.q);
  useEffect(() => setTerm(filters.q), [filters.q]);

  const query = useQuery({
    queryKey: ["listings", searchParams.toString(), coords, radiusKm],
    queryFn: () =>
      searchListings({
        ...Object.fromEntries(Object.entries({ ...filters, sort, page }).filter(([, v]) => v !== "")),
        ...(coords ? { lat: coords.lat, lng: coords.lng, radiusKm } : {}),
      }),
    placeholderData: (previous) => previous,
  });

  useEffect(() => {
    if (!drawerOpen) return undefined;
    const onKey = (event) => event.key === "Escape" && setDrawerOpen(false);
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [drawerOpen]);

  function updateFilter(key, value) {
    setSearchParams((current) => {
      const next = new URLSearchParams(current);
      if (value === "") next.delete(key);
      else next.set(key, value);
      // Any filter change invalidates the current page number.
      if (key !== "page") next.delete("page");
      return next;
    });
  }

  function clearFilters() {
    setSearchParams(new URLSearchParams());
    setCoords(null);
    setLocationError(null);
  }

  function useMyLocation() {
    setLocationError(null);
    if (coords) return setCoords(null);
    if (!navigator.geolocation) return setLocationError("Location is not available in this browser.");
    navigator.geolocation.getCurrentPosition(
      (pos) => setCoords({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      () => setLocationError("Location permission was not granted."),
    );
  }

  const activeCount = PANEL_FILTERS.filter((key) => filters[key]).length + (coords ? 1 : 0);
  const hasFilters = URL_FILTERS.some((key) => searchParams.get(key)) || !!coords;
  const todayStr = new Date().toISOString().slice(0, 10);
  const total = query.data?.total;
  const listings = query.data?.listings || [];

  return (
    <div className="mx-auto max-w-7xl px-5 py-10 lg:px-10">
      <div className="mb-6">
        <p className="eyebrow">The local directory</p>
        <h1 className="mt-2 font-display text-4xl text-ink sm:text-5xl">{filters.q ? `“${filters.q}”` : "Find good help."}</h1>
        <p className="mt-2 text-sm text-muted">Verified specialists, protected payments.</p>
      </div>

      <form
        onSubmit={(event) => {
          event.preventDefault();
          updateFilter("q", term.trim());
        }}
        className="surface mb-6 flex gap-2 p-2"
        role="search"
      >
        <label htmlFor="search-q" className="sr-only">Search services</label>
        <div className="relative flex-1">
          <Search size={18} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted" aria-hidden="true" />
          <input
            id="search-q"
            type="search"
            value={term}
            onChange={(event) => setTerm(event.target.value)}
            placeholder="Search by service, description, or business name"
            className="form-control border-0 pl-10 focus:ring-0"
          />
        </div>
        <button type="submit" className="button button--dark">Search</button>
      </form>

      <div className="lg:grid lg:grid-cols-[260px_1fr] lg:gap-8">
        {drawerOpen && <button type="button" className="fixed inset-0 z-40 bg-ink/40 lg:hidden" aria-label="Close filters" tabIndex={-1} onClick={() => setDrawerOpen(false)} />}
        <aside
          id="search-filters"
          className={`filter-panel ${drawerOpen ? "filter-panel--drawer" : "max-lg:hidden"}`}
          aria-label="Filters"
          {...(drawerOpen ? { role: "dialog", "aria-modal": "true" } : {})}
        >
          <div className="flex items-center justify-between">
            <h2 className="section-title text-base">Filters</h2>
            <div className="flex items-center gap-1">
              {hasFilters && <button type="button" onClick={clearFilters} className="button button--quiet button--sm">Clear all</button>}
              {drawerOpen && <button type="button" onClick={() => setDrawerOpen(false)} className="icon-button lg:hidden" aria-label="Close filters"><X size={18} /></button>}
            </div>
          </div>

          <fieldset className="filter-group">
            <legend className="filter-legend">Category</legend>
            <div className="flex flex-wrap gap-2">
              {["", ...SERVICE_CATEGORIES].map((c) => (
                <button key={c || "all"} type="button" onClick={() => updateFilter("category", c)} aria-pressed={filters.category === c} className={`chip button--sm ${filters.category === c ? "chip--on" : ""}`}>
                  {c || "All"}
                </button>
              ))}
            </div>
          </fieldset>

          <fieldset className="filter-group">
            <legend className="filter-legend">Price range</legend>
            <div className="flex gap-2">
              <PriceInput id="filter-min-price" label="Min" value={filters.minPrice} onCommit={(v) => updateFilter("minPrice", v)} />
              <PriceInput id="filter-max-price" label="Max" value={filters.maxPrice} onCommit={(v) => updateFilter("maxPrice", v)} />
            </div>
          </fieldset>

          <fieldset className="filter-group">
            <legend className="filter-legend">Minimum rating</legend>
            <div className="flex flex-wrap gap-2">
              {["", "4", "3", "2"].map((r) => (
                <button key={r || "any"} type="button" onClick={() => updateFilter("minRating", r)} aria-pressed={filters.minRating === r} className={`chip button--sm ${filters.minRating === r ? "chip--on" : ""}`}>
                  {r ? `${r}★ & up` : "Any"}
                </button>
              ))}
            </div>
          </fieldset>

          <fieldset className="filter-group">
            <legend className="filter-legend">Availability</legend>
            <label htmlFor="filter-date" className="sr-only">Available on date</label>
            <input id="filter-date" type="date" min={todayStr} className="form-control" value={filters.date} onChange={(e) => updateFilter("date", e.target.value)} />
          </fieldset>

          <fieldset className="filter-group">
            <legend className="filter-legend">Distance</legend>
            <button type="button" onClick={useMyLocation} aria-pressed={!!coords} className={`chip inline-flex items-center gap-1.5 ${coords ? "chip--on" : ""}`}>
              {coords ? <Check size={14} aria-hidden="true" /> : <LocateFixed size={14} aria-hidden="true" />}
              {coords ? "Near me" : "Use my location"}
            </button>
            {coords && (
              <div className="mt-3">
                <label htmlFor="filter-radius" className="text-xs text-muted">Within</label>
                <select id="filter-radius" className="form-control mt-1" value={radiusKm} onChange={(e) => setRadiusKm(e.target.value)}>
                  {["5", "10", "25", "50"].map((km) => <option key={km} value={km}>{km} km</option>)}
                </select>
              </div>
            )}
            {locationError && <p className="mt-2 text-xs text-red-700">{locationError}</p>}
          </fieldset>

          {drawerOpen && (
            <button type="button" onClick={() => setDrawerOpen(false)} className="button button--dark mt-2 w-full lg:hidden">
              {total != null ? `Show ${total} ${total === 1 ? "result" : "results"}` : "Show results"}
            </button>
          )}
        </aside>

        <section aria-label="Results" className="min-w-0">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-muted" role="status">
              {total != null ? `${total} ${total === 1 ? "service" : "services"}` : "Searching…"}
            </p>
            <div className="flex items-center gap-2">
              <button type="button" onClick={() => setDrawerOpen(true)} aria-controls="search-filters" aria-expanded={drawerOpen} className="button button--outline button--sm lg:hidden">
                <SlidersHorizontal size={14} aria-hidden="true" className="mr-1.5" />Filters{activeCount > 0 && ` (${activeCount})`}
              </button>
              <label htmlFor="filter-sort" className="sr-only">Sort by</label>
              <select id="filter-sort" className="form-control w-auto py-1.5" value={sort} onChange={(e) => updateFilter("sort", e.target.value)}>
                <option value="newest">Newest</option>
                <option value="price_asc">Price: low to high</option>
                <option value="price_desc">Price: high to low</option>
                <option value="rating">Top rated</option>
              </select>
            </div>
          </div>

          <QueryState
            query={query}
            skeleton={<ResultsSkeleton />}
            isEmpty={listings.length === 0}
            empty="No services match those filters."
            emptyAction={hasFilters && <button type="button" onClick={clearFilters} className="button button--outline button--sm">Clear filters</button>}
          >
            <div className={`grid grid-cols-1 gap-5 transition-opacity sm:grid-cols-2 xl:grid-cols-3 ${query.isFetching ? "opacity-60" : ""}`}>
              {listings.map((listing) => <ListingCard key={listing._id} listing={listing} />)}
            </div>

            {query.data && query.data.total > query.data.limit && (
              <nav className="mt-8 flex items-center justify-center gap-3 text-sm" aria-label="Pagination">
                <button type="button" disabled={page <= 1} onClick={() => updateFilter("page", String(page - 1))} className="pager-button">Prev</button>
                <span className="font-medium text-ink">Page {page} of {Math.ceil(query.data.total / query.data.limit)}</span>
                <button type="button" disabled={page * query.data.limit >= query.data.total} onClick={() => updateFilter("page", String(page + 1))} className="pager-button">Next</button>
              </nav>
            )}
          </QueryState>
        </section>
      </div>
    </div>
  );
}

export default SearchPage;
