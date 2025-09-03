// frontend/src/theme/brandTheme.js
import { createTheme, responsiveFontSizes } from "@mui/material/styles";

// === Couleurs "brand" (adaptées pour un thème sombre constant) ===
const brandColors = {
  primary: { main: "#2E6EF7", light: "#5A8BFF", dark: "#1E49B4", contrastText: "#FFFFFF" },
  secondary: { main: "#F75C2E", light: "#FF8C67", dark: "#B43F1E", contrastText: "#FFFFFF" },
  success: { main: "#22C55E" },
  warning: { main: "#F59E0B" },
  error:   { main: "#EF4444" },
  info:    { main: "#06B6D4" },
  neutral: { main: "#98A2B3" },
};

// === Shape global ===
const shape = { borderRadius: 6 };

// === Ombres sobres pour le dark mode ===
const shadows = [...Array(25)].map(() => "none");
shadows[1] = "0 1px 2px rgba(0,0,0,0.35)";
shadows[2] = "0 2px 8px rgba(0,0,0,0.40)";
shadows[3] = "0 6px 20px rgba(0,0,0,0.45)";

let theme = createTheme({
  palette: {
    mode: "dark", // ⚫️ Dark mode constant
    primary: brandColors.primary,
    secondary: brandColors.secondary,
    success: brandColors.success,
    warning: brandColors.warning,
    error: brandColors.error,
    info: brandColors.info,
    grey: {
      25: "#0A0F1A",
      50: "#0B1220",
      100: "#0F172A",
      200: "#111827",
      300: "#1F2937",
      400: "#334155",
      500: "#475569",
      600: "#64748B",
      700: "#94A3B8",
      800: "#CBD5E1",
      900: "#E5E7EB",
    },
    background: {
      default: "black",
      paper: "black",
    },
    text: {
      primary: "#FFFFFF",
      secondary: "#CBD5E1",
    },
    divider: "rgba(255,255,255,0.08)",
  },

  // === Typographie — Exo 2 + valeurs exactes demandées ===
  typography: {
    fontFamily: `"Exo 2", system-ui, -apple-system, Segoe UI, Roboto, Ubuntu, Cantarell, 'Helvetica Neue', Arial, "Apple Color Emoji", "Segoe UI Emoji"`,
  
    h1: {
      fontWeight: 900,       // black
      fontSize: "2.5rem",    // 40px
      lineHeight: 1.2,
      letterSpacing: 0,
    },
    h3: {
      fontWeight: 700,       // bold
      fontSize: "2rem",      // 32px
      lineHeight: 1.2,
      letterSpacing: 0,
    },
    h6: {
      fontWeight: 600,       // semi-bold
      fontSize: "1rem",      // 16px
      lineHeight: 1.2,
      letterSpacing: 0,
    },
    body1: {
      fontWeight: 400,       // regular
      fontSize: "1rem",      // 16px
      lineHeight: 1.2,
      letterSpacing: 0,
    },
    body2: {
      fontWeight: 300,       // light
      fontSize: "0.75rem",   // 12px
      lineHeight: 1.2,
      letterSpacing: 0,
    },
    button: {
      fontWeight: 700,       // bold
      fontSize: "1.25rem",   // 20px
      lineHeight: 1.2,
      letterSpacing: 0,
      textTransform: "none",
    },
  },


  shape,
  shadows,

  zIndex: {
    appBar: 1200,
    drawer: 1100,
    modal: 1300,
    snackbar: 1400,
    tooltip: 1500,
  },

  components: {
    MuiCssBaseline: {
      styleOverrides: {
        body: {
          backgroundColor: "#0B1220",
          color: "#FFFFFF",
          WebkitFontSmoothing: "antialiased",
          MozOsxFontSmoothing: "grayscale",
          fontFamily: `"Exo 2", system-ui, -apple-system, Segoe UI, Roboto, Ubuntu, Cantarell, 'Helvetica Neue', Arial`,
        },
        "*::-webkit-scrollbar": { width: 10, height: 10 },
        "*::-webkit-scrollbar-thumb": { borderRadius: 8, backgroundColor: "rgba(255,255,255,0.18)" },
      },
    },

    MuiAppBar: {
      defaultProps: { elevation: 0, color: "default" },
      styleOverrides: {
        root: {
          backgroundColor: "#111827",
          color: "#FFFFFF",
          borderBottom: "1px solid rgba(255,255,255,0.08)",
          height: 58,
          justifyContent: "center",
        },
      },
    },

    MuiButton: {
      defaultProps: { disableElevation: true },
      styleOverrides: {
        root: { borderRadius: shape.borderRadius },
        sizeLarge: { height: 48, paddingInline: 20 },
        sizeMedium: { height: 40, paddingInline: 18 },
        sizeSmall: { height: 32, paddingInline: 14 },
      },
      variants: [
        {
          props: { variant: "soft", color: "primary" },
          style: {
            backgroundColor: "rgba(46,110,247,0.16)",
            color: "#DCE6FF",
            "&:hover": { backgroundColor: "rgba(46,110,247,0.24)" },
          },
        },
        {
          props: { variant: "soft", color: "secondary" },
          style: {
            backgroundColor: "rgba(247,92,46,0.16)",
            color: "#FFE1D6",
            "&:hover": { backgroundColor: "rgba(247,92,46,0.24)" },
          },
        },
      ],
    },

    MuiCard: {
      defaultProps: { elevation: 0 },
      styleOverrides: {
        root: {
          borderRadius: shape.borderRadius,
          boxShadow: shadows[2],
          border: "1px solid rgba(255,255,255,0.08)",
          backgroundColor: "#111827",
        },
      },
    },

    MuiDrawer: {
      styleOverrides: { paper: { borderRadius: "16px 16px 0 0", backgroundColor: "#0F172A" } },
    },

    MuiOutlinedInput: {
      styleOverrides: {
        root: { borderRadius: shape.borderRadius },
        input: { paddingTop: 12, paddingBottom: 12 },
        notchedOutline: { borderColor: "rgba(255,255,255,0.20)" },
      },
    },

    MuiChip: {
      styleOverrides: { root: { borderRadius: 9999, background: "rgba(255,255,255,0.08)" } },
    },

    // Avatar : contour extérieur blanc via outline (shadow non souhaité)
    MuiAvatar: {
      styleOverrides: {
        root: {
          width: 40,
          height: 40,
          outline: "2px solid #ffffff",
          outlineOffset: "2px", // pousse la bordure vers l'extérieur
          backgroundColor: "#0F172A",
        },
      },
    },
  },
});

theme = responsiveFontSizes(theme);

export default theme;
