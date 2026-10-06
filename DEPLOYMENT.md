# Deployment — going live for free

Three free services: **MongoDB Atlas** (database) → **Render** (API) → **Vercel** (website). It takes about 30 minutes. Do the steps in this order, because each one needs a URL from the one before.

You need a GitHub account with this project pushed to a repository. Make sure `.env` files are **not** committed; `.gitignore` already excludes them.

## 1. Database — MongoDB Atlas

1. Create a free account at https://www.mongodb.com/cloud/atlas and create an **M0 (free)** cluster.
2. **Database Access** → add a user with a strong password.
3. **Network Access** → add `0.0.0.0/0`. Render's free tier has no fixed IP, so this is required; the database password is what protects it.
4. **Connect → Drivers** → copy the connection string and set the database name in it:
   `mongodb+srv://USER:PASSWORD@cluster0.xxxxx.mongodb.net/goodhand?retryWrites=true&w=majority`

## 2. API — Render

1. https://render.com → **New → Web Service** → connect your GitHub repo.
2. Settings:
   - **Root Directory:** `server`
   - **Build Command:** `npm install`
   - **Start Command:** `npm start`
   - **Instance type:** Free
3. **Environment variables** (each value is explained after the table):

   | Key | Value |
   |---|---|
   | `NODE_ENV` | `production` |
   | `MONGODB_URI` | the Atlas string from step 1 |
   | `JWT_ACCESS_SECRET` | a long random string |
   | `JWT_REFRESH_SECRET` | a *different* long random string |
   | `CLIENT_URL` | leave blank for now (step 4) |
   | `PLATFORM_COMMISSION_PERCENT` | `10` |
   | `PAYMENT_RELEASE_GRACE_HOURS` | `24` |
   | `AUTO_COMPLETE_DAYS` | `3` |

   - **Random secrets:** generate each one with `node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"`.
   - **Optional keys:** add the Stripe, Cloudinary, SMTP and Google keys from `server/.env.example` only if you have those accounts. Each feature is switched off when its key is empty, and checkout then runs in demo mode.
4. Deploy. When it's done, copy the URL, for example `https://goodhand-api.onrender.com`.
5. Check it works: open `https://goodhand-api.onrender.com/api/listings` — you should see JSON.

## 3. Website — Vercel

1. https://vercel.com → **Add New → Project** → import the same repo.
2. Settings:
   - **Root Directory:** `client`
   - **Framework preset:** Vite (build `npm run build`, output `dist`)
3. **Environment variables:**

   | Key | Value |
   |---|---|
   | `VITE_API_URL` | `https://goodhand-api.onrender.com/api` (your Render URL + `/api`) |
   | `VITE_GOOGLE_CLIENT_ID` | optional |
   | `VITE_STRIPE_PUBLISHABLE_KEY` | optional — leave empty for demo checkout |

4. Deploy. Copy the site URL, for example `https://goodhand.vercel.app`. **This is your live link.**

`client/vercel.json` makes refreshes and shared links to inner pages (such as `/listing/…`) work. Without it they would show Vercel's 404 page.

## 4. Connect the two

1. Back in Render, set `CLIENT_URL` to the exact Vercel URL: no trailing slash, `https` included.
2. Save; Render redeploys. CORS and login only accept requests from this exact address.

## 5. Load the demo accounts into the live database

From your computer, in the project folder, run:

```bash
MONGODB_URI="<your Atlas string>" npm run seed:demo
```

In Windows PowerShell, set the variable first and then run the seed:

```powershell
$env:MONGODB_URI="<your Atlas string>"; npm run seed:demo
```

This creates the admin, the 10 demo vendors and listings, a demo customer and a vendor awaiting approval. The accounts are listed in the README.

## 6. Smoke test on the live site

Test with three different accounts in separate browser profiles or incognito windows:

1. **Customer:** search → open a listing → book a slot → pay into escrow.
2. **Vendor** (`demo.tutor.math@example.com`): accept the request → the customer sees it update.
3. **Customer:** refresh the page and check you are **still logged in**. This proves the cross-site cookie works.
4. **Admin:** approve the pending vendor; open the dispute queue and analytics.

## Things to know about the free tier

- **Render free instances sleep after 15 minutes idle.** The first request after that takes about 30–50 seconds. Open the site a minute before a demo.
- **Scheduled jobs don't run while the instance is asleep.** Auto-release and auto-complete only run while the instance is awake. For a demo that's fine. For real use, upgrade the instance or ping it with a free uptime monitor every 10 minutes.
- **Uploads** (photos, avatars, work files) need Cloudinary keys. Without them, vendors can't deliver work through the UI.
- **Google sign-in** needs the Vercel URL added under *Authorized JavaScript origins* in Google Cloud Console.
- **Real card payments** need Stripe keys plus a webhook pointing to `https://<render-url>/api/payments/webhook`. Before switching Stripe to live mode, test manual capture, cancellation and the release job in test mode.
