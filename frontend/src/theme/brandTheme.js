// frontend/src/theme/brandTheme.js
import { createTheme, responsiveFontSizes } from "@mui/material/styles";

// === Couleurs marque (adaptées au dark mode) ===
const brandColors = {
  primary:   { main: "#5A8BFF", light: "#7AA2FF", dark: "#2E6EF7", contrastText: "#FFFFFF" },
  secondary: { main: "#FF8C67", light: "#FFA684", dark: "#F75C2E", contrastText: "#0B1220" },
  success:   { main: "#22C55E" },
  warning:   { main: "#F59E0B" },
  error:     { main: "#EF4444" },
  info:      { main: "#06B6D4" },
  neutral:   { main: "#98A2B3" },
};

// Rayon global
const shape = { borderRadius: 6 };

// Ombres sobres (optionnelles en dark)
const shadows = [...Array(25)].map(() => "none");
shadows[1] = "0 1px 2px rgba(0,0,0,0.35), 0 1px 1px rgba(0,0,0,0.25)";
shadows[2] = "0 2px 8px rgba(0,0,0,0.40)";
shadows[3] = "0 6px 20px rgba(0,0,0,0.45)";

let theme = createTheme({
  palette: {
    mode: "dark", // ✅ dark mode constant
    primary: brandColors.primary,
    secondary: brandColors.secondary,
    success: brandColors.success,
    warning: brandColors.warning,
    error: brandColors.error,
    info: brandColors.info,
    grey: {
      25:  "#0B1220",
      50:  "#111827",
      100: "#0F172A",
      200: "#111827",
      300: "#1F2937",
      400: "#334155",
      500: "#64748B",
      600: "#94A3B8",
      700: "#CBD5E1",
      800: "#E2E8F0",
      900: "#F8FAFC",
    },
    background: {
      default: "#0B1220",
      paper:   "#121826",
    },
    text: {
      primary:   "#FFFFFF",
      secondary: "rgba(255,255,255,0.72)",
      disabled:  "rgba(255,255,255,0.38)",
    },
    divider: "rgba(255,255,255,0.12)",
  },

  // ✅ Typographie demandée
  typography: {
    fontFamily: `"InterVariable", system-ui, -apple-system, Segoe UI, Roboto, Ubuntu, Cantarell, 'Helvetica Neue', Arial, "Apple Color Emoji", "Segoe UI Emoji"`,
    h1: {
      fontWeight: 900,       // black
      fontSize: "40px",
      lineHeight: "48px",
      letterSpacing: 0,
    },
    h3: {
      fontWeight: 700,       // bold
      fontSize: "32px",
      lineHeight: "38.4px",
      letterSpacing: 0,
    },
    h6: {
      fontWeight: 600,       // semi-bold
      fontSize: "16px",
      lineHeight: "19.2px",
      letterSpacing: 0,
    },
    body1: {
      fontWeight: 400,       // regular
      fontSize: "16px",
      lineHeight: "19.2px",
      letterSpacing: 0,
    },
    body2: {
      fontWeight: 300,       // light
      fontSize: "12px",
      lineHeight: "14.4px",
      letterSpacing: 0,
    },
    button: {
      fontWeight: 700,       // bold
      fontSize: "20px",
      lineHeight: "24px",
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
        },
        "*::-webkit-scrollbar": { width: 10, height: 10 },
        "*::-webkit-scrollbar-thumb": {
          borderRadius: 8,
          backgroundColor: "rgba(255,255,255,0.18)",
        },
      },
    },

    MuiAppBar: {
      defaultProps: { elevation: 0, color: "transparent" },
      styleOverrides: {
        root: {
          backgroundColor: "rgba(13,18,32,0.72)",
          backdropFilter: "saturate(120%) blur(8px)",
          borderBottom: "1px solid rgba(255,255,255,0.06)",
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
            backgroundColor: "rgba(90,139,255,0.16)",
            color: "#DCE6FF",
            "&:hover": { backgroundColor: "rgba(90,139,255,0.22)" },
          },
        },
        {
          props: { variant: "soft", color: "secondary" },
          style: {
            backgroundColor: "rgba(255,140,103,0.16)",
            color: "#FFE1D5",
            "&:hover": { backgroundColor: "rgba(255,140,103,0.22)" },
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
          backgroundColor: "#121826",
          border: "1px solid rgba(255,255,255,0.06)",
        },
      },
    },

    MuiDrawer: {
      styleOverrides: { paper: { borderRadius: "16px 16px 0 0", backgroundColor: "#0F1523" } },
    },

    MuiOutlinedInput: {
      styleOverrides: {
        root: { borderRadius: shape.borderRadius, backgroundColor: "rgba(255,255,255,0.03)" },
        input: { paddingTop: 12, paddingBottom: 12 },
        notchedOutline: { borderColor: "rgba(255,255,255,0.18)" },
      },
    },

    MuiChip: {
      styleOverrides: {
        root: {
          borderRadius: 9999,
          backgroundColor: "rgba(255,255,255,0.06)",
        },
      },
    },

    // Avatar avec bordure blanche à l'extérieur (outline)
    MuiAvatar: {
      styleOverrides: {
        root: {
          width: 40,
          height: 40,
          outline: "2px solid #FFFFFF",
          outlineOffset: "2px",
          backgroundColor: "#1A2235",
        },
      },
    },
  },
});

theme = responsiveFontSizes(theme);

export default theme;
