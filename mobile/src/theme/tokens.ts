// Campus OS design tokens — ported 1:1 from the web design system (`src/index.css` @theme).
// Any colour, radius or type step used in the app must come from here.

export const color = {
  page: '#EDEFF3',
  surface: '#FFFFFF',
  ink: '#16264A',
  slate: '#5A6577',
  rule: '#D3D8E0',

  marigold: '#E0952A',
  marigoldHover: '#C47E1E',
  marigoldActive: '#B07019',
  marigoldLight: '#FEF3C7',

  approved: '#0E7A5F',
  approvedBg: '#D1FAE5',
  rejected: '#A8242C',
  rejectedBg: '#FEE2E2',
  pending: '#8A6D1F',
  pendingBg: '#FEF9EC',

  info: '#1D4ED8',
  infoBg: '#EFF6FF',
  muted: '#94A3B8',
  mutedBg: '#F1F5F9',
  hover: '#F8F9FB',
  tableHead: '#F5F6F8',
  pressed: '#E0E4EA',
} as const;

// Spacing scale (4pt grid), matching the web build's Tailwind usage.
export const space = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  '2xl': 24,
  '3xl': 32,
  '4xl': 40,
} as const;

// The web system is deliberately low-radius — records, not cards.
export const radius = {
  sheet: 2,
  control: 4,
  card: 8,
  pill: 999,
} as const;

export const font = {
  sans: 'IBMPlexSans',
  sansMedium: 'IBMPlexSans-Medium',
  sansSemiBold: 'IBMPlexSans-SemiBold',
  sansBold: 'IBMPlexSans-Bold',
  mono: 'IBMPlexMono',
} as const;

// Type ramp — mirrors .text-display … .text-micro in index.css.
export const type = {
  display: { fontSize: 32, lineHeight: 38, letterSpacing: -0.64 },
  h1: { fontSize: 26, lineHeight: 33, letterSpacing: -0.39 },
  h2: { fontSize: 21, lineHeight: 27, letterSpacing: -0.21 },
  h3: { fontSize: 17, lineHeight: 24, letterSpacing: -0.09 },
  body: { fontSize: 15, lineHeight: 24 },
  small: { fontSize: 13, lineHeight: 20 },
  micro: { fontSize: 11, lineHeight: 15, letterSpacing: 0.11 },
} as const;

export const shadow = {
  card: {
    shadowColor: '#16264A',
    shadowOpacity: 0.06,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  raised: {
    shadowColor: '#16264A',
    shadowOpacity: 0.14,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 6 },
    elevation: 8,
  },
} as const;

export const scrim = 'rgba(22, 38, 74, 0.4)';
