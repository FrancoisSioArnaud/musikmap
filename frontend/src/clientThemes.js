// frontend/src/clientThemes.js

export const CURRENT_CLIENT_STORAGE_KEY = "mm_current_client";

export const CLIENT_THEMES = {
  default: {
    slug: "default",
    fonts: {
      body: 'Manrope, open-sans, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif',
      heading: 'Manrope, open-sans, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif',
    },
    colors: {
      black: "#000000",
      white: "#FFFFFF",

      bgGrey: "#f2f2f2",
      bgBlue: "#e3f2ff",

      neutralExtraLightGrey: "#f8f9f8",
      neutralLightGrey: "#e6f0ea",
      neutralSemiLightGrey: "#dae4de",
      neutralGrey: "#c6d5cc",
      neutralDarkGrey: "#595959",
      neutralExtraDarkGrey: "#3f3f3f",

      primaryDarkGreen: "#002300",
      primaryMediumGreen: "#02640b",
      primaryGreen: "#78d700",

      secondaryYellow: "#e8c500",
      secondaryPurple: "#8c8cff",
      secondaryPink: "#ffb9ff",
      secondaryOrange: "#ff8c12",
      secondaryCyan: "#73beff",
      secondaryBlue: "#12a0f3",

      pastelGreen: "#f0ffe6",
      pastelYellow: "#fffacd",
      pastelPurple: "#ebebff",
      pastelOrange: "#fff5eb",
      pastelPink: "#fff0ff",
      pastelBlue: "#ebf5ff",

      serviceRed: "#a4280d",
      serviceOrange: "#d38003",
      serviceYellow: "#d7c200",

      spotify: "#1ED760",
      deezer: "#9C42F3",
      orange: "#FD5D01",

      // tokens UI plus pratiques
      appBg: "#FFFFFF",
      surface: "#FFFFFF",
      textPrimary: "#000103",
      textSecondary: "#0D2A0E",
      divider: "rgba(255,255,255,0.12)",
      error: "#FB0000",
      success: "#0FCC0A",
      primaryMain: "#7BD528",
      primaryContrastText: "#000000",
      appBarBg: "#FFFFFF",
      appBarBorder: "1px solid rgba(255,255,255,0.12)",
      avatarBorder: "2px solid rgba(0,0,0,0.04)",
    },
    radius: {
      sm: "8px",
      md: "16px",
      lg: "24px",
      xl: "32px",
      button: "16px",
      round: "999px",
    },
  },

  semitan: {
    slug: "semitan",
    fonts: {
      body: 'Manrope, open-sans, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif',
      heading: 'Manrope, open-sans, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif',
    },
    colors: {
      black: "#000000",
      white: "#FFFFFF",

      bgGrey: "#f2f2f2",
      bgBlue: "#e3f2ff",

      neutralExtraLightGrey: "#f8f9f8",
      neutralLightGrey: "#e6f0ea",
      neutralSemiLightGrey: "#dae4de",
      neutralGrey: "#c6d5cc",
      neutralDarkGrey: "#595959",
      neutralExtraDarkGrey: "#3f3f3f",

      primaryDarkGreen: "#002300",
      primaryMediumGreen: "#02640b",
      primaryGreen: "#78d700",

      secondaryYellow: "#e8c500",
      secondaryPurple: "#8c8cff",
      secondaryPink: "#ffb9ff",
      secondaryOrange: "#ff8c12",
      secondaryCyan: "#73beff",
      secondaryBlue: "#12a0f3",

      pastelGreen: "#f0ffe6",
      pastelYellow: "#fffacd",
      pastelPurple: "#ebebff",
      pastelOrange: "#fff5eb",
      pastelPink: "#fff0ff",
      pastelBlue: "#ebf5ff",

      serviceRed: "#a4280d",
      serviceOrange: "#d38003",
      serviceYellow: "#d7c200",

      spotify: "#1ED760",
      deezer: "#9C42F3",
      orange: "#FD5D01",

      // tokens UI plus pratiques
      appBg: "#FFFFFF",
      surface: "#FFFFFF",
      textPrimary: "#000103",
      textSecondary: "#0D2A0E",
      divider: "rgba(255,255,255,0.12)",
      error: "#FB0000",
      success: "#0FCC0A",
      primaryMain: "#7BD528",
      primaryContrastText: "#000000",
      appBarBg: "#FFFFFF",
      appBarBorder: "1px solid rgba(255,255,255,0.12)",
      avatarBorder: "2px solid rgba(0,0,0,0.04)",
    },
    radius: {
      sm: "8px",
      md: "16px",
      lg: "24px",
      xl: "32px",
      button: "16px",
      round: "999px",
    },
  },
};

export function getClientTheme(clientSlug) {
  if (!clientSlug) return CLIENT_THEMES.default;
  return CLIENT_THEMES[clientSlug] || CLIENT_THEMES.default;
}

export function getStoredCurrentClient() {
  try {
    return localStorage.getItem(CURRENT_CLIENT_STORAGE_KEY) || "default";
  } catch (error) {
    return "default";
  }
}
