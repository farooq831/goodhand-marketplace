// Records one silent clip per scene by driving the real app in Chrome.
// Usage: node record.mjs            (all scenes)
//        node record.mjs s05 s06    (only scenes whose id starts with these)
import puppeteer from "puppeteer-core";
import fs from "node:fs";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const ffmpegPath = require("ffmpeg-static");

const APP = "http://localhost:5173";
const API = "http://localhost:5000/api";
const DIR = "C:/Users/muham/gh-video";
const SLIDES = `file:///${DIR}/slides.html`;
const W = 1280, H = 720;
const state = JSON.parse(fs.readFileSync(`${DIR}/state.json`, "utf8"));
const only = process.argv.slice(2);
fs.mkdirSync(`${DIR}/clips`, { recursive: true });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const day = (n) => { const d = new Date(); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10); };
function wavSeconds(file) {
  const b = fs.readFileSync(file);
  let off = 12;
  while (off < b.length) { const id = b.toString("ascii", off, off + 4); const size = b.readUInt32LE(off + 4); if (id === "data") return size / b.readUInt32LE(28); off += 8 + size; }
  throw new Error("no data chunk in " + file);
}
async function freeSlot(listingId, from) {
  for (let n = from; n < from + 60; n++) {
    const date = day(n);
    const av = await (await fetch(`${API}/listings/${listingId}/availability?date=${date}`)).json();
    const slot = (av.slots || []).find((s) => s.available !== false);
    if (av.isAvailableDay && slot) return { date, startTime: slot.startTime };
  }
  throw new Error("no free slot");
}

// A visible cursor that survives navigation (position kept in sessionStorage).
const CURSOR = `(() => {
  if (location.protocol === "file:") return;
  const mk = () => {
    if (document.getElementById("__cur")) return;
    const c = document.createElement("div");
    c.id = "__cur";
    c.innerHTML = '<svg width="26" height="26" viewBox="0 0 24 24"><path d="M4 2l16 9-7 2-3 7z" fill="#18332F" stroke="#fff" stroke-width="1.6" stroke-linejoin="round"/></svg><span></span>';
    c.style.cssText = "position:fixed;left:0;top:0;z-index:2147483647;pointer-events:none;transition:transform .02s linear;";
    const ring = c.querySelector("span");
    ring.style.cssText = "position:absolute;left:-14px;top:-14px;width:30px;height:30px;border-radius:50%;background:rgba(232,163,61,.55);transform:scale(0);transition:transform .25s,opacity .4s;opacity:0;";
    const p = JSON.parse(sessionStorage.getItem("__cur") || "[640,360]");
    c.style.transform = "translate(" + p[0] + "px," + p[1] + "px)";
    document.documentElement.appendChild(c);
    addEventListener("mousemove", (e) => { c.style.transform = "translate(" + e.clientX + "px," + e.clientY + "px)"; sessionStorage.setItem("__cur", JSON.stringify([e.clientX, e.clientY])); }, true);
    addEventListener("mousedown", () => { ring.style.opacity = "1"; ring.style.transform = "scale(1.4)"; setTimeout(() => { ring.style.opacity = "0"; ring.style.transform = "scale(0)"; }, 350); }, true);
  };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", mk); else mk();
})();`;

const browser = await puppeteer.launch({
  executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe",
  headless: true,
  args: [`--window-size=${W},${H}`, "--hide-scrollbars", "--allow-file-access-from-files", "--force-color-profile=srgb"],
});

async function newPage(theme = "light") {
  const ctx = await browser.createBrowserContext();
  const page = await ctx.newPage();
  await page.setViewport({ width: W, height: H, deviceScaleFactor: 1 });
  await page.evaluateOnNewDocument((t) => { try { if (location.origin.startsWith("http://localhost")) localStorage.setItem("theme", t); } catch {} }, theme);
  await page.evaluateOnNewDocument(CURSOR);
  return page;
}
const go = (page, url) => page.goto(url, { waitUntil: "load", timeout: 30000 }).then(() => sleep(700)).catch(() => {});

// --- choreography helpers ---------------------------------------------------
async function find(page, sel, timeout = 6000) {
  try { return await page.waitForSelector(sel, { visible: true, timeout }); } catch { return null; }
}
async function moveTo(page, el, { steps = 28, click = false } = {}) {
  if (!el) return false;
  await el.evaluate((e) => e.scrollIntoView({ behavior: "smooth", block: "center" }));
  await sleep(650);
  const box = await el.boundingBox();
  if (!box) return false;
  await page.mouse.move(box.x + box.width / 2, box.y + Math.min(box.height / 2, 20), { steps });
  await sleep(220);
  if (click) { await page.mouse.down(); await sleep(70); await page.mouse.up(); }
  return true;
}
const clickSel = async (page, sel, opts) => moveTo(page, await find(page, sel), { ...opts, click: true });
const hoverSel = async (page, sel, opts) => moveTo(page, await find(page, sel), opts);
async function typeInto(page, sel, text) {
  if (!(await clickSel(page, sel))) return;
  await page.keyboard.type(text, { delay: 22 });
}
async function scrollBy(page, dy, ms = 1400) {
  await page.evaluate((d) => window.scrollBy({ top: d, behavior: "smooth" }), dy);
  await sleep(ms);
}
const scrollTop = (page, ms = 1000) => page.evaluate(() => window.scrollTo({ top: 0, behavior: "smooth" })).then(() => sleep(ms));
async function setDate(page, sel, value) {
  await page.$eval(sel, (el, v) => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set.call(el, v);
    el.dispatchEvent(new Event("input", { bubbles: true }));
    el.dispatchEvent(new Event("change", { bubbles: true }));
  }, value).catch(() => {});
}
async function uiLogin(page, email, password) {
  if (!page.url().includes("/login")) await go(page, `${APP}/login`);
  await typeInto(page, "#login-email", email);
  await typeInto(page, "#login-password", password);
  await sleep(250);
  await moveTo(page, await find(page, "form button[type=submit]"), { click: true });
  // SPA navigation: wait for the route to change, not a page load.
  await page.waitForFunction(() => !location.pathname.startsWith("/login"), { timeout: 8000 }).catch(() => {});
  await sleep(500);
}

// Timestamped frame capture: every CDP screencast frame is kept with its
// wall-clock time, so idle stretches keep their real length in the clip.
async function startCapture(page, id) {
  const dir = `${DIR}/clips/${id}`;
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true });
  const cdp = await page.createCDPSession();
  const frames = [];
  cdp.on("Page.screencastFrame", ({ data, sessionId }) => {
    frames.push({ data, t: Date.now() / 1000 });
    cdp.send("Page.screencastFrameAck", { sessionId }).catch(() => {});
  });
  const t0 = Date.now() / 1000;
  await cdp.send("Page.startScreencast", { format: "jpeg", quality: 82, maxWidth: W, maxHeight: H, everyNthFrame: 2 });
  return {
    async stop() {
      const tEnd = Date.now() / 1000;
      await cdp.send("Page.stopScreencast").catch(() => {});
      await cdp.detach().catch(() => {});
      if (!frames.length) throw new Error("no frames for " + id);
      let list = "";
      frames.forEach((f, i) => {
        const name = `f${String(i).padStart(5, "0")}.jpg`;
        fs.writeFileSync(`${dir}/${name}`, Buffer.from(f.data, "base64"));
        const start = i === 0 ? t0 : f.t;
        const next = i + 1 < frames.length ? frames[i + 1].t : tEnd;
        list += `file '${name}'\nduration ${Math.max(0.001, next - start).toFixed(4)}\n`;
      });
      list += `file 'f${String(frames.length - 1).padStart(5, "0")}.jpg'\n`;
      fs.writeFileSync(`${dir}/frames.txt`, list);
      return { frames: frames.length, seconds: tEnd - t0 };
    },
  };
}

// --- pages per role ------------------------------------------------------------
const slides = await newPage();
const guest = await newPage();
const cust = guest; // the guest logs in as the customer during the listing scene
let vendor, admin;

// Slides load off-camera (empty background), then the section is revealed so
// its entrance animation starts exactly when recording does.
const slide = (id) => ({
  page: () => slides,
  prep: async (p) => { await go(p, `${SLIDES}#none`); await p.evaluate(() => document.fonts.ready); await sleep(300); },
  run: async (p) => { await p.evaluate((h) => { location.hash = h; }, id); },
});

// --- scenes ----------------------------------------------------------------------
const scenes = {
  "s01-title": slide("title"),
  "s02-problem": slide("problem"),
  "s03-home": {
    page: () => guest,
    prep: async (p) => go(p, APP + "/"),
    run: async (p) => {
      await sleep(1200);
      await hoverSel(p, "input");
      await sleep(800);
      await scrollBy(p, 560, 1700);
      await hoverSel(p, "::-p-text(Tutoring)", { steps: 20 });
      await hoverSel(p, "::-p-text(Photography)", { steps: 20 });
      await scrollBy(p, 520, 1700);
      await scrollBy(p, 620, 1800);
    },
  },
  "s04-search": {
    page: () => guest,
    prep: async (p) => go(p, `${APP}/search`),
    run: async (p) => {
      await sleep(1200);
      await hoverSel(p, "#filter-sort");
      await sleep(2800);
      await hoverSel(p, "#search-filters");
      await sleep(800);
      await hoverSel(p, "#filter-min-price");
      await sleep(900);
      await hoverSel(p, "#filter-date");
      await sleep(900);
      await hoverSel(p, "#filter-radius");
      await sleep(900);
      await typeInto(p, "#search-q", "tutor");
      await p.keyboard.press("Enter");
      await sleep(2200);
      const heart = await find(p, "button[aria-label*='Save' i], button[aria-label*='favourite' i]", 2000);
      if (heart) await moveTo(p, heart);
      await sleep(1500);
      await scrollBy(p, 400, 1800);
    },
  },
  "s05-listing": {
    page: () => cust,
    prep: async (p) => { await go(p, APP + "/login"); await sleep(500); },
    run: async (p) => {
      await uiLogin(p, "demo.customer@example.com", "Demo1234");
      await go(p, `${APP}/listing/${state.math}`);
      await sleep(800);
      await scrollBy(p, 480, 1800);
      await scrollBy(p, 480, 1800);
      await scrollTop(p, 1000);
      const slot = await freeSlot(state.math, 10);
      scenes["s06-checkout"].slot = slot;
      await hoverSel(p, "#booking-date");
      await setDate(p, "#booking-date", slot.date);
      await sleep(1500);
      await clickSel(p, "button.chip");
      await sleep(900);
      await hoverSel(p, "button::-p-text(Request booking)");
    },
  },
  "s06-checkout": {
    page: () => cust,
    prep: async (p) => {
      const s = scenes["s06-checkout"].slot || (await freeSlot(state.math, 10));
      await go(p, `${APP}/checkout/${state.math}?date=${s.date}&startTime=${s.startTime}`);
      // start from empty fields so the typing is visible
      for (const id of ["#co-line", "#co-area", "#co-city", "#co-phone", "#co-notes"]) await p.$eval(id, (el) => { Object.getOwnPropertyDescriptor(el.constructor.prototype, "value").set.call(el, ""); el.dispatchEvent(new Event("input", { bubbles: true })); }).catch(() => {});
    },
    run: async (p) => {
      await sleep(600);
      await typeInto(p, "#co-line", "House 12, Street 4");
      await typeInto(p, "#co-area", "DHA Phase 5");
      await typeInto(p, "#co-city", "Lahore");
      await typeInto(p, "#co-phone", "0300 1234567");
      await typeInto(p, "#co-notes", "Grade 8 algebra, chapter 4.");
      await clickSel(p, "button::-p-text(Continue to payment)");
      await sleep(1500);
      await hoverSel(p, "button::-p-text(into escrow)");
      await sleep(3800);
      await clickSel(p, "button::-p-text(into escrow)");
      await sleep(2500);
    },
  },
  "s07-booking": {
    page: () => cust,
    prep: async (p) => go(p, `${APP}/booking/${state.active}`),
    run: async (p) => {
      await sleep(1800);
      await scrollBy(p, 380, 2400);
      await hoverSel(p, "a::-p-text(Open in Maps)");
      await sleep(1600);
      await scrollBy(p, 500, 2600);
      await scrollBy(p, 500, 2600);
      await hoverSel(p, "textarea, input[placeholder*='message' i]");
    },
  },
  "s08-customer": {
    page: () => cust,
    prep: async (p) => { await go(p, `${APP}/dashboard`); await sleep(2000); },
    run: async (p) => {
      await sleep(1200);
      await clickSel(p, "aside a[href='/dashboard/customer/bookings'], a[href='/dashboard/customer/bookings']");
      await sleep(3000);
      await scrollBy(p, 300, 1500);
      await clickSel(p, "a[href='/dashboard/customer/saved']");
      await sleep(3200);
    },
  },
  "s09-vendor-dash": {
    page: () => (vendor ??= null),
    setup: async () => { vendor = await newPage(); return vendor; },
    prep: async (p) => { await go(p, APP + "/login"); await sleep(500); },
    run: async (p) => {
      await uiLogin(p, "demo.tutor.math@example.com", "Demo1234");
      await go(p, `${APP}/dashboard`);
      await sleep(1500);
      await scrollBy(p, 350, 2400);
      await scrollBy(p, 350, 2400);
      await scrollBy(p, 400, 2400);
    },
  },
  "s10-vendor-accept": {
    page: () => vendor,
    prep: async (p) => go(p, `${APP}/dashboard/vendor/bookings`),
    run: async (p) => {
      await sleep(1500);
      await hoverSel(p, "button::-p-text(Accept request)");
      await sleep(2200);
      await clickSel(p, "button::-p-text(Accept request)");
      await sleep(2600);
      await go(p, `${APP}/dashboard/vendor/calendar`);
      await sleep(1500);
      await hoverSel(p, "#to-from");
      await sleep(1200);
      await scrollBy(p, 400, 2000);
    },
  },
  "s11-vendor-earnings": {
    page: () => vendor,
    prep: async (p) => go(p, `${APP}/dashboard/vendor/earnings`),
    run: async (p) => {
      await sleep(2500);
      await scrollBy(p, 380, 2600);
      await scrollBy(p, 380, 2600);
      await hoverSel(p, "::-p-text(JazzCash)");
      await sleep(1500);
      await scrollBy(p, 400, 2000);
    },
  },
  "s12-vendor-verify": {
    page: () => vendor,
    prep: async (p) => go(p, `${APP}/dashboard/vendor/profile`),
    run: async (p) => {
      await sleep(1800);
      await scrollBy(p, 420, 2400);
      await scrollBy(p, 420, 2400);
      await scrollBy(p, 420, 2400);
      await hoverSel(p, "::-p-text(CNIC)");
    },
  },
  "s13-admin-verify": {
    setup: async () => { admin = await newPage(); return admin; },
    page: () => admin,
    prep: async (p) => { await go(p, APP + "/login"); await sleep(500); },
    run: async (p) => {
      await uiLogin(p, "admin@example.com", "Admin1234");
      await go(p, `${APP}/dashboard/admin/vendors`);
      await sleep(1200);
      await clickSel(p, "span::-p-text(Review)");
      await sleep(1800);
      await p.evaluate(() => { const d = document.querySelector("[role=dialog] .overflow-y-auto, [role=dialog]"); d?.scrollBy({ top: 400, behavior: "smooth" }); });
      await sleep(2000);
      await p.evaluate(() => { const d = document.querySelector("[role=dialog] .overflow-y-auto, [role=dialog]"); d?.scrollBy({ top: 600, behavior: "smooth" }); });
      await sleep(1500);
      await hoverSel(p, "[role=dialog] button::-p-text(Approve)", { steps: 20 });
      await sleep(1200);
      await hoverSel(p, "[role=dialog] button::-p-text(changes)", { steps: 20 });
    },
  },
  "s14-admin-dispute": {
    page: () => admin,
    prep: async (p) => { await p.keyboard.press("Escape"); await go(p, `${APP}/dashboard/admin/disputes`); },
    run: async (p) => {
      await sleep(1500);
      await clickSel(p, "table button, li button.list-item");
      await sleep(2200);
      await p.evaluate(() => { const d = document.querySelector("[role=dialog] .overflow-y-auto, [role=dialog]"); d?.scrollBy({ top: 450, behavior: "smooth" }); });
      await sleep(2500);
      await p.evaluate(() => { const d = document.querySelector("[role=dialog] .overflow-y-auto, [role=dialog]"); d?.scrollBy({ top: 700, behavior: "smooth" }); });
      await sleep(1800);
      await hoverSel(p, "[role=dialog] textarea", { steps: 20 });
      await sleep(900);
      await hoverSel(p, "[role=dialog] button::-p-text(Release)", { steps: 20 });
    },
  },
  "s15-admin-ops": {
    page: () => admin,
    prep: async (p) => { await p.keyboard.press("Escape"); await go(p, `${APP}/dashboard/admin/payouts`); },
    run: async (p) => {
      await sleep(2200);
      await scrollBy(p, 300, 1400);
      await clickSel(p, "a[href='/dashboard/admin/listings']");
      await sleep(3200);
      await clickSel(p, "a[href='/dashboard/admin/security']");
      await sleep(2500);
      await scrollBy(p, 400, 2000);
    },
  },
  "s16-devices": {
    page: () => slides,
    prep: async (p) => {
      await go(p, `file:///${DIR}/devices.html`);
      const frames = () => p.frames();
      const f2 = await (await p.$("#f2")).contentFrame();
      const f3 = await (await p.$("#f3")).contentFrame();
      await f2.goto(`${APP}/listing/${state.math}`, { waitUntil: "networkidle0" }).catch(() => {});
      await f2.evaluate(() => { localStorage.setItem("theme", "dark"); document.documentElement.dataset.theme = "dark"; });
      await f3.goto(`${APP}/search`, { waitUntil: "networkidle0" }).catch(() => {});
      await f3.evaluate(() => { document.documentElement.dataset.theme = "light"; });
      const f1 = await (await p.$("#f1")).contentFrame();
      await f1.evaluate(() => { document.documentElement.dataset.theme = "light"; });
      await p.evaluate(() => document.querySelectorAll(".phone").forEach((el) => { el.style.animation = "none"; el.offsetHeight; el.style.animation = ""; }));
      void frames;
    },
    run: async (p) => {
      await sleep(2500);
      for (const id of ["#f1", "#f2", "#f3"]) {
        const f = await (await p.$(id)).contentFrame();
        f.evaluate(() => window.scrollBy({ top: 700, behavior: "smooth" })).catch(() => {});
        await sleep(900);
      }
      await sleep(2000);
    },
  },
  "s17-benefits": slide("benefits"),
  "s18-end": slide("end"),
};

const list = JSON.parse(fs.readFileSync(`${DIR}/scenes.json`, "utf8"));
const log = [];
try {
  for (const { id } of list) {
    const sc = scenes[id];
    const needed = !only.length || only.some((o) => id.startsWith(o));
    // Scenes we skip still set up their pages so later scenes find a logged-in session.
    if (sc.setup && !sc.page()) await sc.setup();
    const page = sc.page();
    if (!needed) {
      if (id === "s05-listing" && only.some((o) => o > "s05")) await uiLogin(page, "demo.customer@example.com", "Demo1234");
      if (id === "s09-vendor-dash" && only.some((o) => o > "s09")) await uiLogin(page, "demo.tutor.math@example.com", "Demo1234");
      if (id === "s13-admin-verify" && only.some((o) => o > "s13")) await uiLogin(page, "admin@example.com", "Admin1234");
      continue;
    }
    const dur = wavSeconds(`${DIR}/audio/${id}.wav`);
    if (sc.prep) await sc.prep(page);
    await page.bringToFront();
    const rec = await startCapture(page, id);
    const t0 = Date.now();
    try { await sc.run(page); } catch (e) { log.push(`${id}: action error ${e.message.split("\n")[0]}`); }
    const left = dur * 1000 + 600 - (Date.now() - t0);
    if (left > 0) await sleep(left);
    await rec.stop();
    log.push(`${id}: ${(dur).toFixed(1)}s audio, ${((Date.now() - t0) / 1000).toFixed(1)}s recorded`);
    console.log(log.at(-1));
  }
} finally {
  await browser.close().catch(() => {});
}
console.log(log.filter((l) => l.includes("error")).join("\n") || "no action errors");
