/**
 * Autommerce brand foundation.
 *
 * Keep raw identity values here; product features should import semantic
 * aliases instead of duplicating hex values. The dashboard is the first
 * surface adopting this system. Other tools migrate one at a time.
 */
export const AUTOMMERCE_COLORS = {
  primary: {
    orange: "#F76D01",
    red: "#C40000",
    purple: "#400095",
  },
  secondary: {
    violet: "#6B358D",
    lavender: "#C8A8D2",
    burgundy: "#79081D",
  },
  neutral: {
    ink: "#171717",
    paper: "#FFFFFF",
  },
} as const;

export const AUTOMMERCE_LOGOS = {
  light: "/autommerce-natural.png",
  dark: "/autommerce-white.png",
} as const;
