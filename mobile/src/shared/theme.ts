/**
 * Design tokens for the Fawn mobile app.
 *
 * These tokens mirror `frontend/tailwind.config.ts` and
 * `frontend/src/app/globals.css` so the Android UI and Web UI share the same
 * visual language (color hex, radii, shadows, type scale).
 *
 * Rule: every page must consume tokens from this file instead of hard-coding
 * colors / radii / shadows / font sizes.
 */

import { Platform, TextStyle, ViewStyle } from 'react-native';

// ---------------------------------------------------------------------------
// Colors — hex values pulled from frontend/src/app/globals.css `:root` and
// `frontend/tailwind.config.ts`. Names match the Web tokens.
// ---------------------------------------------------------------------------

export const colors = {
  // Brand
  'fawn-amber': '#416656', // --color-brand
  'fawn-amber-light': '#ECFDF5', // --color-brand-light
  'brand-strong': '#294E3F', // --color-brand-strong

  // Sage / success
  'sage-green': '#3F7A14', // --color-success
  'sage-green-soft': '#6FBA2C', // --color-success-soft
  'sage-green-light': '#DDF7EA', // --color-mint

  // Text
  'soft-charcoal': '#0D1C2E', // --color-text-primary
  'dark-gray': '#5F665F', // --color-text-secondary
  'mid-gray': '#8A918A', // --color-text-placeholder

  // Surface / borders
  'warm-cream': '#FBF8EF', // --color-canvas
  'warm-gray': '#F5F8F3',
  'oat-border': '#E6EEFF', // --color-border
  'card': '#FFFFFF', // --color-card

  // Bubbles
  'bubble-agent': '#FFFFFF',
  'bubble-user': '#416656',

  // Safety / status
  'safety-red': '#BA1A1A', // --color-safety
  'safety-red-light': '#FFDAD6', // --color-safety-bg
  'warning-amber': '#B45309', // --color-focus
  'warning-amber-light': '#FFFBEB', // --color-butter
  'focus-ring': '#B45309',

  // Info / accent
  'info-blue': '#567B9C',
  'info-blue-light': '#D3E5F1', // --color-sky-soft
  'chart-reference': '#C8D2C8',
  'nursery-mint': '#DDF7EA',
  'nursery-butter': '#FFFBEB',
  'nursery-powder': '#D5E3FC',

  // Role colors (must match Web hex exactly)
  'role-mom': '#B9785C',
  'role-dad': '#567B9C',
  'role-grandma': '#B07CC6',
  'role-grandpa': '#6BAF8D',
} as const;

export type ColorToken = keyof typeof colors;

// ---------------------------------------------------------------------------
// Border radii — mirror --radius-* CSS vars. The Web `input` radius is
// `9999px` (fully rounded pill); RN treats any large number the same way.
// ---------------------------------------------------------------------------

export const radii = {
  card: 28,
  bubble: 20,
  input: 9999,
  chip: 9999,
  sm: 8,
  md: 12,
  lg: 16,
} as const;

// ---------------------------------------------------------------------------
// Spacing scale — RN equivalent of Tailwind's 4px grid. Kept small and
// purposeful; pages should pick from here instead of literal numbers.
// ---------------------------------------------------------------------------

export const spacing = {
  '0': 0,
  '1': 4,
  '2': 8,
  '3': 12,
  '4': 16,
  '5': 20,
  '6': 24,
  '8': 32,
  '10': 40,
  '12': 48,
} as const;

// ---------------------------------------------------------------------------
// Shadows — RN equivalents of the Web `shadow-*` utilities. Android uses
// `elevation`; iOS uses the four shadow properties. We include both so the
// same token renders correctly on each platform.
// ---------------------------------------------------------------------------

type Shadow = Pick<
  ViewStyle,
  'shadowColor' | 'shadowOffset' | 'shadowOpacity' | 'shadowRadius' | 'elevation'
>;

export const shadows: Record<'card' | 'float' | 'modal' | 'topbar' | 'tabbar', Shadow> = {
  // shadow-card: 0 18px 45px rgba(13, 28, 46, 0.06)
  card: {
    shadowColor: '#0D1C2E',
    shadowOffset: { width: 0, height: 18 },
    shadowOpacity: 0.06,
    shadowRadius: 45,
    elevation: 4,
  },
  // shadow-float: 0 20px 50px rgba(13, 28, 46, 0.10)
  float: {
    shadowColor: '#0D1C2E',
    shadowOffset: { width: 0, height: 20 },
    shadowOpacity: 0.1,
    shadowRadius: 50,
    elevation: 8,
  },
  // shadow-modal: 0 28px 70px rgba(13, 28, 46, 0.16)
  modal: {
    shadowColor: '#0D1C2E',
    shadowOffset: { width: 0, height: 28 },
    shadowOpacity: 0.16,
    shadowRadius: 70,
    elevation: 16,
  },
  // shadow-topbar: 0 10px 40px rgba(167, 185, 159, 0.12)
  topbar: {
    shadowColor: '#A7B99F',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.12,
    shadowRadius: 40,
    elevation: 6,
  },
  // shadow-tabbar: 0 -15px 50px rgba(13, 28, 46, 0.06)
  tabbar: {
    shadowColor: '#0D1C2E',
    shadowOffset: { width: 0, height: -15 },
    shadowOpacity: 0.06,
    shadowRadius: 50,
    elevation: 12,
  },
};

// ---------------------------------------------------------------------------
// Typography — Nunito is the canonical brand face on Web. On Android we load
// it via `expo-google-fonts/nunito` (see `useAppFonts` below). Until the font
// has loaded we fall back to the platform default so first paint is not
// blocked.
// ---------------------------------------------------------------------------

export const fontFamily = {
  sans: Platform.select({
    ios: 'Nunito',
    android: 'Nunito_400Regular',
    default: 'System',
  }) as string,
  sansSemibold: Platform.select({
    ios: 'Nunito-SemiBold',
    android: 'Nunito_600SemiBold',
    default: 'System',
  }) as string,
  sansBold: Platform.select({
    ios: 'Nunito-Bold',
    android: 'Nunito_700Bold',
    default: 'System',
  }) as string,
  sansExtraBold: Platform.select({
    ios: 'Nunito-ExtraBold',
    android: 'Nunito_800ExtraBold',
    default: 'System',
  }) as string,
  mono: Platform.select({
    ios: 'Menlo',
    android: 'monospace',
    default: 'monospace',
  }) as string,
};

/**
 * Type scale tuned for the mobile layout. Mirrors the prominent sizes used in
 * the Web components (e.g. 22px page title in TopBar, 11px tab label).
 */
export const typography = {
  // Display / page titles
  title: {
    fontFamily: fontFamily.sansSemibold,
    fontSize: 22,
    lineHeight: 28,
    color: colors['soft-charcoal'],
  } as TextStyle,
  heading: {
    fontFamily: fontFamily.sansSemibold,
    fontSize: 18,
    lineHeight: 24,
    color: colors['soft-charcoal'],
  } as TextStyle,
  body: {
    fontFamily: fontFamily.sans,
    fontSize: 15,
    lineHeight: 22,
    color: colors['soft-charcoal'],
  } as TextStyle,
  bodySmall: {
    fontFamily: fontFamily.sans,
    fontSize: 13,
    lineHeight: 18,
    color: colors['dark-gray'],
  } as TextStyle,
  caption: {
    fontFamily: fontFamily.sans,
    fontSize: 11,
    lineHeight: 14,
    color: colors['mid-gray'],
  } as TextStyle,
  tabLabel: {
    fontFamily: fontFamily.sansSemibold,
    fontSize: 11,
    lineHeight: 14,
  } as TextStyle,
  button: {
    fontFamily: fontFamily.sansSemibold,
    fontSize: 15,
    lineHeight: 20,
  } as TextStyle,
} as const;

// ---------------------------------------------------------------------------
// Layout constants — match CSS variables that drive bar heights on Web so
// page padding stays in sync across platforms.
// ---------------------------------------------------------------------------

export const layout = {
  topbarHeight: 80,
  tabbarHeight: 92,
  maxMobileWidth: 428,
} as const;

export const theme = {
  colors,
  radii,
  spacing,
  shadows,
  fontFamily,
  typography,
  layout,
};

export type Theme = typeof theme;
