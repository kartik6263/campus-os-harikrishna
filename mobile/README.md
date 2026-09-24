# Campus OS — Mobile (React Native)

The student/parent phone app, built on a React Native port of the Campus OS
design system. Expo SDK 57, expo-router, TypeScript.

## Run it

```bash
npm install
npx expo start
```

Then scan the QR code with **Expo Go** on your phone, or press `a` for an
Android emulator, `i` for an iOS simulator, `w` for the browser.

```bash
npm run typecheck    # tsc --noEmit
npx expo export      # verify the bundle builds
```

## Layout

```
app/                      expo-router routes (file = route)
  _layout.tsx             fonts, providers, root stack
  index.tsx               splash (restores the session, then routes)
  onboarding.tsx          three-slide intro
  login.tsx               email + password sign-in
  (tabs)/
    _layout.tsx           bottom tab bar
    index.tsx             dashboard
    attendance.tsx        per-subject attendance + 75% rule
    timetable.tsx         day-by-day schedule
    fee.tsx               dues, breakdown, instalments, payment sheet
    more.tsx              profile, services, preferences
  results.tsx             semester marksheets, SGPA/CGPA
  notifications.tsx       alert inbox
  qr-scan.tsx             QR attendance capture
  bus-track.tsx           live route progress
  digital-id.tsx          offline ID card
  offline.tsx             connection state and sync
  components.tsx          live gallery of every component (More → Design system)

src/
  theme/tokens.ts         colour, spacing, radius, type ramp, shadow
  components/             the design system (see below)
  lib/language.tsx        EN/हिन्दी provider — useLang().t(en, hi)
  lib/api.ts              fetch wrapper, tokens, refresh-on-401
  lib/auth.tsx            session provider
  lib/queries.ts          typed API hooks
```

## Design system

`import { Button, Card, StatusPill } from '@/components'` — everything comes
from one barrel.

| Group      | Components                                                                 |
| ---------- | -------------------------------------------------------------------------- |
| Typography | `Text` (variant · weight · tone · mono)                                     |
| Actions    | `Button`, `ButtonRow`, `TileButton`                                         |
| Forms      | `Input`, `Select`, `Checkbox`, `Toggle`, `OtpInput`                         |
| Status     | `StatusPill`, `InlineAlert`, `toast` + `ToastHost`, `ProgressBar`, `ProgressRing` |
| Layout     | `Screen`, `Card`, `SectionHeader`, `Divider`, `Field`, `FieldGrid`, `RecordBand`, `AppBar` |
| Navigation | `Tabs`, `Segmented`, `Breadcrumb`, `Stepper`, `Timeline`, `ListRow`         |
| Overlay    | `Sheet`                                                                     |
| States     | `Skeleton`, `SkeletonRow`, `EmptyState`, `PermissionDenied`, `Spinner`, `LoadingBlock` |
| Marks      | `Avatar`, `VerifiedSeal`                                                    |

### How it differs from the web system

Deliberate divergences, not omissions:

- **`Sheet` replaces `Modal` + `Drawer`.** Both collapse to one bottom sheet on
  a phone.
- **`ListRow` replaces `DataTable`.** A sortable, paginated, multi-select grid
  does not survive a 360pt viewport; records become tappable rows.
- **`Select` renders chips, not a dropdown.** Avoids a modal picker for the
  short option lists this app uses.
- **Controls are taller.** Button heights go 36/44/52 against the web's
  28/36/44, to clear the 44pt touch minimum.
- **`Tooltip` and `NotificationItem` are not ported.** Hover has no meaning
  here; notification rows are built from `Card` + `ListRow` on the
  notifications screen.

Everything else — colours, the type ramp, status vocabulary, the deterministic
`Avatar` hue, the `VerifiedSeal` geometry — matches the web build exactly.

To see the whole set running, open **More → Design system → Component index**
(route `/components`). It is the counterpart to the web build's
`ComponentIndex.tsx` and renders every exported component, so nothing in the
system ships unexercised.

## Placeholders to replace

Three things are simulated so the app runs without native permissions or a
backend. Each is marked with a comment at its call site:

1. **QR scanning** (`app/qr-scan.tsx`) — the camera is not wired, but the
   token is verified server-side for real: it must match an open session, you
   must be enrolled, and a second scan is rejected. For the camera:
   `npx expo install expo-camera`, swap `<Viewfinder/>` for `<CameraView>`
   with `onBarcodeScanned`, and add the permission strings to `app.json`.
   The submit path is unchanged.
2. **Bus location** (`app/bus-track.tsx`) — `currentStop` comes from the API;
   a real GPS feed would update that column.
3. **The QR block on the ID card** (`app/digital-id.tsx`) — a fixed decorative
   pattern, not an encoder. Use `react-native-qrcode-svg` once the
   verification endpoint exists.

Payment (`app/(tabs)/fee.tsx`) writes a real ledger entry through the API, but
no money moves and there is no gateway redirect. Sync (`app/offline.tsx`) now
refetches the live queries rather than running a timer.

## Data

Every screen reads the API through `src/lib/queries.ts` (TanStack Query).
The old `src/lib/data.ts` mock module has been deleted — nothing imports
mocks any more.

- `src/lib/api.ts` — fetch wrapper, token storage, one shared refresh on 401
- `src/lib/auth.tsx` — `useAuth()`, session restore, sign in/out
- `src/lib/queries.ts` — typed hooks and the response shapes

Tokens live in `expo-secure-store` (React Native has no cookie jar), falling
back to `localStorage` on `expo start --web`.

**The backend must be running** — see `../backend/README.md`. On a phone,
`localhost` is the phone, so the client derives your machine's LAN address
from the Metro connection. Override with `EXPO_PUBLIC_API_URL`.

Sign in with `priya.sharma.2021@demo.resolion.edu` / `campus123`.
