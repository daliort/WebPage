# Deploy the appointments API on Render

This repo’s API lives in `server/` (Express). GitHub Pages only hosts static files, so the API runs on Render (or another Node host) and the static site calls it with CORS.

## One-time checklist

1. **Push** this repo (including `render.yaml`) to GitHub.

2. **Create the service**
   - [Render Dashboard](https://dashboard.render.com/) → **New** → **Blueprint**.
   - Connect the GitHub repo and select the branch you deploy from (for example `main` or `styleWeb`).
   - Render reads `render.yaml` and proposes the **webpage-appointments** web service.

3. **Set environment variables** (Blueprint will prompt for `sync: false` keys, or set under **Environment** after create):
   - **`CORS_ORIGIN`** — your GitHub Pages site origin only, no path and no trailing slash.  
     Example: `https://daliort.github.io`  
     If the site is at `https://daliort.github.io/WebPage/`, the origin is still `https://daliort.github.io` (the browser sends that as the `Origin` header).
   - **SMTP (optional but recommended)** — `SMTP_HOST`, `SMTP_PORT` (often `587`), `SMTP_SECURE` (`true` only if you use SSL on that port), `SMTP_USER`, `SMTP_PASS`, `MAIL_FROM`. Optional **`MAIL_TO`** for a copy of each request to you.

4. **Deploy** and wait for the first build to go green. Copy the service URL (e.g. `https://webpage-appointments.onrender.com`).

5. **Point the static site at the API**
   - In `services.html`, set the meta tag **`appointments-api-origin`** `content` to that URL (no trailing slash). Commit and push so GitHub Pages picks it up.
   - Locally, leave it **empty** and open the site via `http://localhost:3000` so the browser uses same-origin requests.

6. **Cold starts (free tier)** — the first request after idle can take ~30–60s. Open the Render URL once after deploy to “wake” the service before testing the form.

## Quick reference

| Where | `API_BASE` / requests |
|--------|------------------------|
| Local `npm start` in `server/` | Same host as the HTML → leave meta **empty** |
| GitHub Pages | Meta = `https://<your-service>.onrender.com` |

| Variable | Purpose |
|----------|---------|
| `CORS_ORIGIN` | Allowed browser `Origin` for `POST /api/appointments` from your Pages URL |
| `PORT` | Set automatically by Render; do not override |

## Data and email

- Appointment rows are still stored in `server/data/appointments.json` on the instance. On a free web service the filesystem can reset on redeploy; for production, plan a managed database later.
- If SMTP is missing, the API still returns success and saves the row; the JSON response may include a warning about email.
