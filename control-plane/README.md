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

## Phase 2 — the shared pool

Small institutes don't need a database and backend each. A **shared pool** is
one backend (this same repository, `POOL_MODE=true`) and one database, where
every institute gets its **own Postgres schema** (`t_<address>`) with the full
set of tables. Choose the placement per institute in *New institute*:
**Shared pool (lower cost)** or **Dedicated**.

```
  alpha.yourdomain.com ─┐                         ┌─ schema t_alpha
  beta.yourdomain.com ──┼─▶ pool backend ─────────┼─ schema t_beta      (one database)
  gamma.yourdomain.com ─┘   (X-Tenant: <address>) └─ schema t_gamma
  big.yourdomain.com ─────▶ its own backend ───────▶ its own database    (dedicated)
```

How it stays isolated and safe:

- **Every request names its institute** (`X-Tenant`, sent automatically by the
  web and mobile apps). The pool asks the control plane — cached for 30 seconds,
  refreshed instantly on suspend/resume/move — whether that institute exists,
  is active and is placed on *this* pool, then runs the entire request inside
  that institute's schema. The application code is unchanged: its database
  handle points at the current institute's schema for the length of the request.
- **Sign-ins are bound to the institute.** Access tokens carry the institute;
  a token from one is refused at every other ("This sign-in belongs to a
  different institute"). Refresh cookies are named per institute.
- **One deploy upgrades everyone.** The pool's `npm start` migrates every
  institute schema before serving.
- **Suspend, resume and delete** work as for dedicated institutes; deleting a
  pooled institute drops its schema.

**Move to dedicated** (panel → the institute → *Move to dedicated…*): creates
its own database and backend, copies every table from its pool schema in one
transaction (foreign keys checked at commit, row counts verified, auto-numbers
continued), switches the registry over, and renames the pool schema to
`moved__t_<address>__<date>` as a backup rather than deleting it. Users see a
short pause. If anything fails, the institute stays on the pool untouched.
Drop the backup schema by hand once you are satisfied.

### Set up a pool (once)

1. **Neon** — create a database, e.g. `pool1`, for the pool.
2. **Render** — create a Web Service from this repository (root directory
   empty — the backend), build `npm install --include=dev && npm run build`,
   start `npm start`, with:

   | Key | Value |
   | --- | --- |
   | `POOL_MODE` | `true` |
   | `POOL_ID` | `pool-1` |
   | `DATABASE_URL` | the `pool1` connection string |
   | `CONTROL_PLANE_URL` | the control plane's URL |
   | `POOL_SECRET` | a long random string (same value in step 3) |
   | `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET` | long random strings |
   | `NODE_ENV` | `production` |
   | `CORS_ORIGINS` | `https://*.yourdomain.com,https://campus-os-lime.vercel.app` |
   | `TURNSTILE_ORIGINS` | same as `CORS_ORIGINS` |
   | `APP_URL_TEMPLATE` | `https://{slug}.yourdomain.com` (or `https://campus-os-lime.vercel.app/?tenant={slug}` before a domain) |
   | `SMTP_*`, `MAIL_FROM` | optional, for password-reset emails |

3. **Control plane** — add `POOL_API_URL` (the pool's URL), `POOL_SECRET`
   (same as above), `POOL_ID=pool-1`, and `POOL_DATABASE_URL` (the `pool1`
   connection string — read only when moving an institute out). Redeploy; the
   *Shared pool* placement becomes available.

A pool holds many institutes; `POOL_TENANT_CONNECTIONS` (default 3) caps
database connections per active institute. When a pool fills up, a second one
is another pool service with its own `POOL_ID` and database.
