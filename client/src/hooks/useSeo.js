import { useEffect } from "react";

const SITE = "Goodhand";
const DEFAULT_DESCRIPTION = "Find, book and pay verified local service providers in Pakistan — tutors, home repair, cleaning, photography and events — with escrow-protected payments.";

function setMeta(attr, key, content) {
  let el = document.head.querySelector(`meta[${attr}="${key}"]`);
  if (!el) {
    el = document.createElement("meta");
    el.setAttribute(attr, key);
    el.dataset.seo = "true";
    document.head.appendChild(el);
  }
  el.setAttribute("content", content);
}

function setCanonical(href) {
  let link = document.head.querySelector('link[rel="canonical"]');
  if (!link) {
    link = document.createElement("link");
    link.rel = "canonical";
    document.head.appendChild(link);
  }
  link.href = href;
}

// Per-page <title>, description, canonical URL, Open Graph / Twitter tags
// and optional JSON-LD structured data. Google renders JavaScript, so this
// is picked up for search results; link previews on social apps don't run
// JS (see the audit report's SSR recommendation).
export function useSeo({ title, description = DEFAULT_DESCRIPTION, image, path, jsonLd, noindex = false } = {}) {
  const ld = jsonLd ? JSON.stringify(jsonLd) : "";
  useEffect(() => {
    const fullTitle = title ? `${title} | ${SITE}` : `${SITE} — Trusted local services`;
    const url = `${window.location.origin}${path ?? window.location.pathname}`;
    document.title = fullTitle;
    setMeta("name", "description", description);
    setMeta("name", "robots", noindex ? "noindex, nofollow" : "index, follow");
    setMeta("property", "og:site_name", SITE);
    setMeta("property", "og:type", "website");
    setMeta("property", "og:title", fullTitle);
    setMeta("property", "og:description", description);
    setMeta("property", "og:url", url);
    if (image) setMeta("property", "og:image", image);
    setMeta("name", "twitter:card", image ? "summary_large_image" : "summary");
    setMeta("name", "twitter:title", fullTitle);
    setMeta("name", "twitter:description", description);
    setCanonical(url);

    let script;
    if (ld) {
      script = document.createElement("script");
      script.type = "application/ld+json";
      script.dataset.seo = "true";
      // JSON.stringify output can't break out of the script element as long
      // as "<" is escaped.
      script.textContent = ld.replace(/</g, "\\u003c");
      document.head.appendChild(script);
    }
    return () => script?.remove();
  }, [title, description, image, path, ld, noindex]);
}

export default useSeo;
