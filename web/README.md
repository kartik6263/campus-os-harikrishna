# Campus OS — Web (React.js)

The full administrative suite: every portal, console and back-office module.
React 19, Vite 7, Tailwind v4, TypeScript.

This is the application recovered from the Figma Make export, with the
Figma platform plugins stripped out of `vite.config.ts` and a clean
`index.html` / `package.json` in place so it runs standalone.

## Run it

```bash
npm install
npm run dev          # http://localhost:5173
npm run build        # tsc --noEmit && vite build
npm run preview
```

## Layout

```
src/
  main.tsx              entry
  App.tsx               screen switch (state-based, no router)
  index.css             design tokens (@theme), type ramp, table + animation CSS
  components/
    ui.tsx              the design system — 27 components
    AppShell.tsx        sidebar + header chrome for the portals
  lib/                  mock data, one module per domain
  screens/              ~130 screens
    Landing, Login, CertVerification, ComponentIndex, MobileAppShowcase
    student/            15 screens — dashboard, attendance, fee, results, …
    parent/             7 screens
    faculty/            7 screens
    principal/          4 screens
    office/             4 screens
    backoffice/         11 screens
    acadops/            admission · campus · exam
    governance/         accreditation · affiliation · finance · hr ·
                        procurement · rti · stakeholders · assets
    intelligence/       5 AI/analytics screens
    it/                 5 admin-console groups
```

`src/screens/ComponentIndex.tsx` is the live gallery of the design system —
the fastest way to see every component. `MobileAppShowcase.tsx` is the mobile
spec that the `../mobile` app implements for real.

## Design system

`src/components/ui.tsx` exports: `Button`, `Spinner`, `Input`, `Select`,
`StatusPill`, `Tabs`, `Breadcrumb`, `Modal`, `Drawer`, `toast` +
`ToastContainer`, `InlineAlert`, `Skeleton`, `SkeletonRow`, `EmptyState`,
`PermissionDenied`, `Stepper`, `Timeline`, `VerifiedSeal`, `DataTable`,
`Tooltip`, `NotificationItem`, `Avatar`, `Checkbox`, `Toggle`, `OtpInput`,
`RecordBand`.

Tokens live in the `@theme` block at the top of `src/index.css`. The
React Native port of these tokens is at `../mobile/src/theme/tokens.ts` —
keep the two in step.

## Data

The student portal reads the API through `src/lib/queries.ts` (TanStack Query):
profile, attendance, timetable, fees and announcements are live. Screens with
no Phase 1 endpoint — certificates, hostel, library, grievance, syllabus,
placement — still read `src/lib/studentdata.ts` and say so at their import.
Every other portal (faculty, office, governance, exam, IT, intelligence) is
still entirely on mocks.

- `src/lib/api.ts` — fetch wrapper; refresh token in a httpOnly cookie,
  access token in memory
- `src/lib/auth.tsx` — `useAuth()`, session restore on reload
- `src/lib/queries.ts` — hooks, plus adapters that return the exact shapes the
  existing screens already render

**The backend must be running** on port 4000 — see `../backend/README.md`.
Sign in with `priya.sharma.2021@demo.resolion.edu` / `campus123`.
Set `VITE_API_URL` to point somewhere else.

## Notes

- Navigation is a `useState` screen switch in `App.tsx`, not React Router. Add
  a router if you need deep links or browser history.
- The production bundle is ~2.2 MB (473 KB gzipped) because every screen is
  imported eagerly. If that matters, `React.lazy` the portal screens in
  `App.tsx` — the build already warns about it.
