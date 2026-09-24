# Resolion control plane

Phase 1 of running Resolion Campus OS for many institutes: **one deployment per
institute**, created in one click, from one shared codebase.

```
                         ┌───────────────────────────┐
  you (owner) ──────────▶│  control plane (this)     │── Neon API ──▶ one database per institute
                         │  registry · provisioning  │── Render API ▶ one backend per institute
                         │  health monitoring        │
                         └─────────────┬─────────────┘
                                       │ GET /api/resolve?slug=abc
  abc.yourdomain.com ──▶ shared web app ──▶ abc's own backend ──▶ abc's own database
```

- **Isolation:** every institute has its own database and its own backend. Nothing
  is shared at runtime except the web app's static files.
- **One click:** *New institute* creates the database, creates the backend (same
  GitHub repo and branch as everyone), waits for it to be healthy, and records
  it. A new institute starts empty; its IT Cell creates its account on first visit.
- **Shared CI/CD:** every institute's Render service auto-deploys `main`. One
  `git push` updates all of them; each runs its own database migrations on start.
- **Monitoring:** every active institute's `/api/health` is checked every
  5 minutes; changes are logged against the institute.
- **Suspend / resume / delete** from the panel. Delete removes the backend and
  the database, and must be confirmed by typing the institute's address.

## Deploy it (once)

1. **Neon** — use your existing project. Note its **Project ID** (Settings) and
   the **Branch ID** of `main` (Branches → main). Create an API key: Account
   settings → API keys. Create a database `controlplane` for the registry and
   copy its direct connection string.
2. **Render** — Account settings → API keys → create one. Your **Owner/Workspace
   ID** is in Workspace settings (starts with `tea-` or `usr-`).
3. **Create the service** — Render → New → Blueprint on this repo picks up
   `resolion-control-plane` from `render.yaml`, or create a Web Service by hand
   with **Root directory** `control-plane`, build
   `npm install --include=dev && npm run build`, start `npm start`.
4. **Environment** — set:

   | Key | Value |
   | --- | --- |
   | `DATABASE_URL` | the `controlplane` database's connection string |
   | `CONTROL_PLANE_PASSWORD` | a long password only you know |
   | `CONTROL_PLANE_SECRET` | any long random string (Blueprint generates it) |
   | `PROVISIONER` | `cloud` |
   | `NEON_API_KEY`, `NEON_PROJECT_ID`, `NEON_BRANCH_ID` | from step 1 |
   | `RENDER_API_KEY`, `RENDER_OWNER_ID` | from step 2 |
   | `BASE_DOMAIN` | e.g. `campusos.com` once you have it; leave unset until then |
   | `RENDER_PLAN` | `starter` (default) — each institute's backend is a paid instance; `free` works for trials but sleeps |
   | `TENANT_SMTP_HOST` … `TENANT_MAIL_FROM` | optional: mail for every institute's password resets |

5. **Web app (Vercel)** — add `VITE_CONTROL_PLANE_URL` = the control plane's
   URL, and later `VITE_BASE_DOMAIN` = your domain; redeploy.
6. Open the control plane, sign in, and **adopt** your existing demo (optional):
   `POST /api/tenants/adopt` with `{ "slug": "demo", "name": "Resolion Demo University", "apiUrl": "https://campus-os-harikrishna-1.onrender.com" }`.

## Subdomains (when you have a domain)

1. In Vercel → your web project → Settings → Domains, add `*.yourdomain.com`
   (Vercel asks you to point the domain's nameservers to Vercel for wildcards).
2. Set `VITE_BASE_DOMAIN=yourdomain.com` on Vercel and `BASE_DOMAIN=yourdomain.com`
   on the control plane.
3. `abc.yourdomain.com` now opens institute `abc`. New institutes' backends are
   created allowing their own subdomain; for institutes created before the
   domain existed, add their subdomain to their backend's `CORS_ORIGINS`.

Until then every institute opens at `https://<web app>/?tenant=<address>`.

## Run it locally

```bash
cd control-plane && npm install
# .env: DATABASE_URL=postgresql://campus:campus@localhost:5433/controlplane
#       CONTROL_PLANE_PASSWORD=…  CONTROL_PLANE_SECRET=…  PROVISIONER=local
npm run dev        # → http://localhost:4500
```

`PROVISIONER=local` creates each institute's database on the local Postgres
and runs its backend (`..`) as a process on ports from 4101. Point the web app
at it with `VITE_CONTROL_PLANE_URL=http://localhost:4500` and open
`http://localhost:5173/?tenant=<address>`.

## Phase 2

When the number of institutes justifies it: a shared database pool with
per-institute schemas or row-level tenancy for small institutes, keeping the
dedicated database/backend path for large ones. The registry here is where
each institute's placement is recorded, so moving one is a data migration plus
an update to its `api_url`.
