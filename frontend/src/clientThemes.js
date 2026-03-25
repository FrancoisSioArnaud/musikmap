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

      primary: "#78d700",
      primaryLight: "#e6f0ea",
      primaryDark: "linear-gradient(80deg,#002300 35%,#034003)",
     
      secondary: "#73beff",
      secondaryLight: "#e3f2ff",
      
      bgGradient:
        "linear-gradient(48.71deg, rgb(255,255,255) 100%, rgb(253,252,253) 100%)",

      serviceRed: "#a4280d",
      serviceOrange: "#d38003",
      serviceYellow: "#d7c200",
      spotify: "#1ED760",
      deezer: "#9C42F3",

      // tokens UI pratiques
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
    border:{
      default: "0.1rem solid #e6f0ea",
    }
  },

  semitan: {
    slug: "semitan",
    fonts: {
    
    },
    colors: {
      
    },
    radius: {
      
    },
  },
};

function mergeClientTheme(baseTheme, clientTheme) {
  return {
    ...baseTheme,
    ...clientTheme,
    fonts: {
      ...baseTheme.fonts,
      ...(clientTheme?.fonts || {}),
    },
    colors: {
      ...baseTheme.colors,
      ...(clientTheme?.colors || {}),
    },
    radius: {
      ...baseTheme.radius,
      ...(clientTheme?.radius || {}),
    },
  };
}

export function getClientTheme(clientSlug) {
  const baseTheme = CLIENT_THEMES.default;
  if (!clientSlug || clientSlug === "default") return baseTheme;

  const clientTheme = CLIENT_THEMES[clientSlug];
  if (!clientTheme) return baseTheme;

  return mergeClientTheme(baseTheme, clientTheme);
}

export function getStoredCurrentClient() {
  try {
    return localStorage.getItem(CURRENT_CLIENT_STORAGE_KEY) || "default";
  } catch (error) {
    return "default";
  }
}
