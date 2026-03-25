// frontend/src/clientThemes.js

export const CURRENT_CLIENT_STORAGE_KEY = "mm_current_client";

export const CLIENT_THEMES = {
  default: {
    slug: "default",
    fonts: {
      h1: 'Exo2, Roboto, open-sans, system-ui, -apple-system, "Segoe UI", sans-serif',
      h3: 'Exo2, Roboto, open-sans, system-ui, -apple-system, "Segoe UI", sans-serif',
      h4: 'Exo2, Roboto, open-sans, system-ui, -apple-system, "Segoe UI", sans-serif',
      h5: 'Exo2, Roboto, open-sans, system-ui, -apple-system, "Segoe UI", sans-serif',
      subtitle1: 'Exo2, open-sans, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif',
      body1: 'Exo2, open-sans, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif',
      body2: 'Exo2, open-sans, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif',
    },
    colors: {
      black: "#000000",
      white: "#FFFFFF",
      text: "#000103",
      primaryContrastText: "#000103",

      primary: "#FF6B01",
      primaryLight: "#FF9900",
      primaryDark: "linear-gradient(80deg,#FF9900 35%,#FF3D00)",
     
      secondary: "#73beff",
      secondaryLight: "rgba(12,0,92,0.04)",
      
      bgGradient:
        "linear-gradient(48.71deg, rgb(255,255,255) 100%, rgb(253,252,253) 100%)",

      spotify: "#1ED760",
      deezer: "#9C42F3",

      // tokens UI pratiques
      appBg: "#FFFFFF",
      surface: "#FFFFFF",
      
      
      success: "#0FCC0A",
      error: "#FB0000",
      divider: "rgba(255,255,255,0.12)",
      
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
      h1: 'Manrope, open-sans, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif',
      h3: 'Manrope, open-sans, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif',
      h4: 'Manrope, open-sans, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif',
      h5: 'Manrope, open-sans, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif',
      subtitle1: 'Manrope, open-sans, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif',
      body1: 'Manrope, open-sans, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif',
      body2: 'Manrope, open-sans, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif',
    
    },
    colors: {
      primary: "#78d700",
      primaryLight: "#e6f0ea",
      primaryDark: "linear-gradient(80deg,#002300 35%,#034003)",
      
      secondary: "#73beff",
      secondaryLight: "#e3f2ff",
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
