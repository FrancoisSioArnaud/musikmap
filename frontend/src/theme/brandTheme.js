// frontend/src/theme/brandTheme.js
import { createTheme, responsiveFontSizes } from "@mui/material/styles";

// === À PERSONNALISER SELON TA DA ===
// Mets ici tes vraies couleurs de maquette Figma.
// Astuce : garde aussi des teintes "light/dark/contrastText" pour l’accessibilité.
const brandColors = {
  primary: { main: "#2E6EF7", light: "#5A8BFF", dark: "#1E49B4", contrastText: "#FFFFFF" },
  secondary: { main: "#F75C2E", light: "#FF8C67", dark: "#B43F1E", contrastText: "#FFFFFF" },
  success: { main: "#22C55E" },
  warning: { main: "#F59E0B" },
  error:   { main: "#EF4444" },
  info:    { main: "#06B6D4" },
  // Une “neutral” utile pour gris UI
  neutral: { main: "#667085" },
};

// Rayon, ombres et spacing “brand”
const shape = { borderRadius: 14 };               // Cartes/boutons arrondis
const shadows = [...Array(25)].map(() => "none"); // On repart d’une base clean
// Ex. ombres douces :
shadows[1] = "0 1px 2px rgba(16,24,40,0.06), 0 1px 1px rgba(16,24,40,0.04)";
shadows[2] = "0 2px 8px rgba(16,24,40,0.08)";
shadows[3] = "0 6px 20px rgba(16,24,40,0.10)";

let theme = createTheme({
  palette: {
    mode: "light",
    primary: brandColors.primary,
    secondary: brandColors.secondary,
    success: brandColors.success,
    warning: brandColors.warning,
    error: brandColors.error,
    info: brandColors.info,
    // On mappe “neutral” sur grey MUI pour l’intégration sx (grey.500 etc.)
    grey: {
      25: "#FCFCFD",
      50: "#F9FAFB",
      100: "#F2F4F7",
      200: "#E4E7EC",
      300: "#D0D5DD",
      400: "#98A2B3",
      500: "#667085", // brand neutral
      600: "#475467",
      700: "#344054",
      800: "#1D2939",
      900: "#0B1220",
    },
    background: {
      default: "#FFFFFF",
      paper: "#FFFFFF",
    },
    text: {
      primary: "#0B1220",
      secondary: "#475467",
    },
  },

  typography: {
    // Utilise ta police : installe @fontsource-* puis importe-la (cf. étape 3)
    fontFamily: `"InterVariable", system-ui, -apple-system, Segoe UI, Roboto, Ubuntu, Cantarell, 'Helvetica Neue', Arial, "Apple Color Emoji", "Segoe UI Emoji"`,
    h1: { fontWeight: 700, fontSize: "clamp(2rem, 1.2rem + 2vw, 3rem)", lineHeight: 1.1 },
    h2: { fontWeight: 700, fontSize: "clamp(1.75rem, 1.15rem + 1.5vw, 2.375rem)", lineHeight: 1.15 },
    h3: { fontWeight: 700, fontSize: "1.75rem" },
    h4: { fontWeight: 700, fontSize: "1.375rem" },
    h5: { fontWeight: 600, fontSize: "1.125rem" },
    h6: { fontWeight: 600, fontSize: "1rem" },
    body1: { fontSize: "1rem", lineHeight: 1.6 },
    body2: { fontSize: "0.875rem", lineHeight: 1.55 },
    button: { textTransform: "none", fontWeight: 600, letterSpacing: 0.2 },
    caption: { color: "#667085" },
  },

  shape, shadows,

  // Hiérarchie zIndex pratique pour que le menu reste au-dessus de tes overlays
  zIndex: {
    appBar: 1200,
    drawer: 1100,
    modal: 1300,
    snackbar: 1400,
    tooltip: 1500,
  },

  components: {
    // Reset global + couleur de fond + scrollbars, etc.
    MuiCssBaseline: {
      styleOverrides: {
        body: {
          backgroundColor: "#FFFFFF",
          WebkitFontSmoothing: "antialiased",
          MozOsxFontSmoothing: "grayscale",
        },
        // Scrollbar (Chrome/Edge)
        "*::-webkit-scrollbar": { width: 10, height: 10 },
        "*::-webkit-scrollbar-thumb": { borderRadius: 8, backgroundColor: "rgba(0,0,0,0.18)" },
      },
    },

    // AppBar blanc par défaut, hauteur cohérente avec ton code (58px)
    MuiAppBar: {
      defaultProps: { elevation: 0, color: "default" },
      styleOverrides: {
        root: {
          backgroundColor: "#FFFFFF",
          color: "#0B1220",
          borderBottom: "1px solid #EEF2F6",
          height: 58,
          justifyContent: "center",
        },
      },
    },

    // Boutons : arrondis + hauteurs + variantes secondaires brandées
    MuiButton: {
      defaultProps: { disableElevation: true },
      styleOverrides: {
        root: { borderRadius: shape.borderRadius, fontWeight: 600 },
        sizeLarge: { height: 48, paddingInline: 20 },
        sizeMedium: { height: 40, paddingInline: 18 },
        sizeSmall: { height: 32, paddingInline: 14, fontWeight: 600 },
      },
      variants: [
        {
          props: { variant: "soft", color: "primary" },
          style: {
            backgroundColor: "rgba(46,110,247,0.10)",
            color: "#1E49B4",
            "&:hover": { backgroundColor: "rgba(46,110,247,0.16)" },
          },
        },
        {
          props: { variant: "soft", color: "secondary" },
          style: {
            backgroundColor: "rgba(247,92,46,0.10)",
            color: "#B43F1E",
            "&:hover": { backgroundColor: "rgba(247,92,46,0.16)" },
          },
        },
      ],
    },

    // Cards plus “soft”
    MuiCard: {
      defaultProps: { elevation: 0 },
      styleOverrides: {
        root: {
          borderRadius: shape.borderRadius,
          boxShadow: shadows[2],
          border: "1px solid #EEF2F6",
        },
      },
    },

    // Drawer / Modal pour être sous l’AppBar si besoin
    MuiDrawer: {
      styleOverrides: { paper: { borderRadius: "16px 16px 0 0" } },
    },

    // Inputs
    MuiTextField: {
      defaultProps: { variant: "outlined", size: "medium" },
    },
    MuiOutlinedInput: {
      styleOverrides: {
        root: { borderRadius: shape.borderRadius },
        input: { paddingTop: 12, paddingBottom: 12 },
      },
    },
    MuiChip: {
      styleOverrides: { root: { borderRadius: 9999 } },
    },
    MuiAvatar: {
      border: "2px solid rgba(255,255,255)",
      styleOverrides: { root: { width: 40, height: 40 } },
    },
  },
});

// Ajuste la typo responsive automatiquement
theme = responsiveFontSizes(theme);

export default theme;
