import { Link, useNavigate } from "react-router-dom";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ArrowRight, ArrowUpRight, BadgeCheck, CalendarCheck, MessageSquare, Search, ShieldCheck, Star } from "lucide-react";
import { searchListings } from "../api/listingApi";
import ListingCard from "../components/ListingCard";
import { useAuth } from "../context/AuthContext";
import { SERVICE_CATEGORIES } from "../utils/categories";
import { CATEGORY_ICONS } from "../utils/categoryIcons";
import { useSeo } from "../hooks/useSeo";

const TRUST_POINTS = [
  { icon: BadgeCheck, title: "Verified vendors", text: "Every provider is checked by our team before their services go live." },
  { icon: ShieldCheck, title: "Protected payments", text: "Your payment is held in escrow and only released when the work is done." },
  { icon: Star, title: "Real reviews", text: "Only customers with a completed booking can leave a review." },
];

const STEPS = [
  { icon: Search, title: "Find", text: "Search by service, compare prices, ratings, and availability." },
  { icon: CalendarCheck, title: "Book", text: "Pick an open slot from the provider's live calendar and pay securely." },
  { icon: MessageSquare, title: "Get it done", text: "Chat with your provider, approve the work, and leave a review." },
];

function Home() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [query, setQuery] = useState("");
  const featured = useQuery({ queryKey: ["featured-listings"], queryFn: () => searchListings({ limit: 6, sort: "recommended" }) });
  useSeo({
    path: "/",
    jsonLd: {
      "@context": "https://schema.org",
      "@type": "WebSite",
      name: "Goodhand",
      url: window.location.origin,
      potentialAction: { "@type": "SearchAction", target: `${window.location.origin}/search?q={search_term_string}`, "query-input": "required name=search_term_string" },
    },
  });

  return (
    <div>
      <section className="hero-band">
        <div className="hero-band__inner">
          <div className="max-w-3xl">
            <p className="eyebrow text-accent">Trusted local help, thoughtfully found</p>
            <h1 className="mt-5 font-display text-5xl leading-[0.98] tracking-tight text-snow sm:text-7xl">Good people.<br /><span className="text-accent">Good work.</span></h1>
            <p className="mt-6 max-w-xl text-base leading-7 text-snow/80 sm:text-lg">Find trusted local specialists for the work that matters, from a lesson at home to the perfect celebration.</p>
            <form onSubmit={(event) => { event.preventDefault(); navigate(`/search${query.trim() ? `?q=${encodeURIComponent(query.trim())}` : ""}`); }} className="mt-9 flex max-w-2xl flex-col gap-2 rounded-2xl bg-white p-2 shadow-2xl sm:flex-row" role="search">
              <label htmlFor="home-search" className="sr-only">What do you need help with?</label>
              <div className="relative flex-1">
                <Search size={18} className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-muted" aria-hidden="true" />
                <input id="home-search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Try “math tutor” or “wedding photography”" className="min-h-12 w-full min-w-0 rounded-xl border-0 pl-11 pr-4 text-ink outline-none" />
              </div>
              <button type="submit" className="button button--accent min-h-12">Find a specialist</button>
            </form>
            <p className="mt-5 flex items-center gap-2 text-sm text-snow/70"><ShieldCheck size={16} className="text-accent" aria-hidden="true" />Verified vendors. Protected payments.</p>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-5 py-16 lg:px-10">
        <div className="flex items-end justify-between gap-5">
          <div><p className="eyebrow">Explore by need</p><h2 className="mt-3 font-display text-3xl text-ink sm:text-4xl">Start somewhere useful.</h2></div>
          <Link to="/search" className="text-link hidden items-center gap-1 text-sm sm:inline-flex">View all services <ArrowRight size={16} aria-hidden="true" /></Link>
        </div>
        <div className="mt-8 grid grid-cols-2 gap-3 md:grid-cols-5">
          {SERVICE_CATEGORIES.map((category) => {
            const Icon = CATEGORY_ICONS[category] || Search;
            return (
              <Link key={category} to={`/search?category=${encodeURIComponent(category)}`} className="category-tile group">
                <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-white text-primary transition group-hover:bg-primary group-hover:text-white"><Icon size={22} aria-hidden="true" /></span>
                <span className="flex items-center justify-between">{category}<ArrowUpRight size={18} className="text-muted transition group-hover:text-primary" aria-hidden="true" /></span>
              </Link>
            );
          })}
        </div>
      </section>

      <section className="border-y border-black/5 bg-white">
        <div className="mx-auto max-w-7xl px-5 py-16 lg:px-10">
          <div className="flex items-end justify-between gap-5">
            <div><p className="eyebrow">Featured providers</p><h2 className="mt-3 font-display text-3xl text-ink sm:text-4xl">People worth knowing.</h2></div>
            <Link to="/search?sort=rating" className="text-link inline-flex items-center gap-1 text-sm">Browse <ArrowRight size={16} aria-hidden="true" /></Link>
          </div>
          {featured.isLoading && (
            <div className="mt-8 flex gap-5 overflow-hidden">{[1, 2, 3].map((n) => <div key={n} className="skeleton aspect-[4/5] w-[min(20rem,80vw)] shrink-0" />)}</div>
          )}
          {featured.data?.listings?.length === 0 && <div className="empty-state mt-8">New providers are joining soon — check back shortly.</div>}
          {/* Design.md §4: a horizontal scroll of featured cards. */}
          <div className="featured-scroll mt-8">
            {featured.data?.listings?.map((listing) => (
              <div key={listing._id} className="w-[min(20rem,80vw)] shrink-0 snap-start">
                <ListingCard listing={listing} />
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-5 py-16 lg:px-10">
        <p className="eyebrow">Why Goodhand</p>
        <h2 className="mt-3 font-display text-3xl text-ink sm:text-4xl">Built on trust, not word of mouth.</h2>
        <div className="mt-8 grid gap-4 md:grid-cols-3">
          {TRUST_POINTS.map(({ icon: Icon, title, text }) => (
            <div key={title} className="panel">
              <span className="nav-card__icon"><Icon size={20} aria-hidden="true" /></span>
              <h3 className="mt-4 font-semibold text-ink">{title}</h3>
              <p className="mt-1 text-sm leading-6 text-muted">{text}</p>
            </div>
          ))}
        </div>

        <div className="mt-16 grid gap-8 md:grid-cols-3">
          {STEPS.map(({ icon: Icon, title, text }, index) => (
            <div key={title} className="flex gap-4">
              <span className="font-display text-4xl text-accent">{index + 1}</span>
              <div>
                <h3 className="flex items-center gap-2 font-semibold text-ink"><Icon size={18} className="text-primary" aria-hidden="true" />{title}</h3>
                <p className="mt-1 text-sm leading-6 text-muted">{text}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {!user && (
        <section className="mx-auto max-w-7xl px-5 pb-16 lg:px-10">
          <div className="hero-panel flex flex-col items-start justify-between gap-6 md:flex-row md:items-center">
            <div>
              <h2 className="font-display text-3xl">Offer a service?</h2>
              <p className="mt-2 max-w-lg text-sm leading-6 text-snow/75">Manage bookings on a real calendar, get paid safely, and build a reputation that travels with you.</p>
            </div>
            <Link to="/register?role=vendor" className="button button--accent">Become a vendor</Link>
          </div>
        </section>
      )}
    </div>
  );
}

export default Home;
