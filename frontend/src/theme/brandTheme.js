// frontend/src/theme/brandTheme.js
// -----------------------------------------------------------------------------
// Thème MUI v5 "brand" pour Musikmap/Boîte-à-Groove
// DA demandée : fond noir, textes blancs, police Exo 2 (Google Fonts)
// Ce fichier est très commenté pour servir de "tour du propriétaire".
// -----------------------------------------------------------------------------
//
// Rappels d'usage :
// - La majorité des composants MUI lisent les tokens définis ici (palette, typo,
//   shape, shadows, components…).
// - Privilégie `sx={{ }}` qui comprend les clés du thème, plutôt que `style={{ }}`.
// - Si tu crées des patterns récurrents (ex. bouton "soft"), fais-en une
//   `variant` dans `components.MuiButton.variants` (cf. plus bas).
//
// Intégration : enveloppe l'app avec <ThemeProvider theme={theme}><CssBaseline/></ThemeProvider>
// depuis `App.js`. Assure-toi d'avoir importé la police (cf. en-tête).
// -----------------------------------------------------------------------------

import { createTheme, responsiveFontSizes, alpha } from "@mui/material/styles";

// -----------------------------------------------------------------------------
// 1) Couleurs de marque
//    Ici, on définit les couleurs principales. On reste sur une base simple,
//    mais n'hésite pas à remplacer `primary`/`secondary` par tes hex exacts Figma.
//    Remarque : `contrastText` est important pour l’accessibilité sur fond plein.
// -----------------------------------------------------------------------------
const brandColors = {
  primary: { main: "#2E6EF7", light: "#5A8BFF", dark: "#1E49B4", contrastText: "#FFFFFF" },
  secondary: { main: "#F75C2E", light: "#FF8C67", dark: "#B43F1E", contrastText: "#FFFFFF" },
  success: { main: "#22C55E", contrastText: "#0B1220" },
  warning: { main: "#F59E0B", contrastText: "#0B1220" },
  error:   { main: "#EF4444", contrastText: "#FFFFFF" },
  info:    { main: "#06B6D4", contrastText: "#0B1220" },
  // Une teinte "neutral" utile côté texte secondaire, icônes, bordures discrètes.
  neutral: { main: "#9DA3AF" },
};

// -----------------------------------------------------------------------------
// 2) Shape & Shadows globaux
//    - borderRadius : arrondi cohérent sur boutons/cartes/inputs.
//    - shadows : sur fond noir, des ombres trop foncées sont invisibles. On crée
//      des ombres "douces" légèrement claires (glow) pour la lisibilité.
// -----------------------------------------------------------------------------
const shape = { borderRadius: 6 };
const shadows = [...Array(25)].map(() => "none");
shadows[1] = "0 1px 2px rgba(255,255,255,0.06), 0 1px 1px rgba(0,0,0,0.24)";
shadows[2] = "0 2px 8px rgba(255,255,255,0.08)";
shadows[3] = "0 6px 20px rgba(255,255,255,0.10)";

// -----------------------------------------------------------------------------
// 3) Création du thème
//    - `mode: "dark"` : signale à MUI que nous sommes en mode sombre.
//    - `palette.background` : fond "noir" demandé (default/paper).
//    - `palette.text` : textes blancs + gris clairs pour le secondaire.
//    - Échelle `grey` : utile dans `sx` (ex. color: "grey.400").
// -----------------------------------------------------------------------------
let theme = createTheme({
  palette: {
    mode: "dark",

    primary: brandColors.primary,
    secondary: brandColors.secondary,
    success: brandColors.success,
    warning: brandColors.warning,
    error: brandColors.error,
    info: brandColors.info,

    // Échelle de gris "claire" (pensée pour fond sombre).
    grey: {
      25:  "#FAFAFA",
      50:  "#F5F5F6",
      100: "#EAEAEC",
      200: "#DADCE1",
      300: "#C5C8CE",
      400: "#AEB3BB",
      500: "#9DA3AF", // ~neutral
      600: "#868C98",
      700: "#6C727F",
      800: "#555B66",
      900: "#3A3F47",
    },

    // Fond global demandé : noir. Tu peux utiliser un "paper" légèrement
    // différencié (#0A0A0A) si tu veux une hiérarchie de plans plus visible.
    background: {
      default: "#000000",
      paper:   "#000000",
    },

    // Textes demandés : blancs et déclinaisons pour second/disabled.
    text: {
      primary:   "#FFFFFF",
      secondary: "#D0D5DD", // gris clair pour du secondaire lisible
      disabled:  "rgba(255,255,255,0.38)",
    },

    // Optionnel : divider en alpha blanc pour traits/bordures neutres
    divider: "rgba(255,255,255,0.12)",
  },

  // ---------------------------------------------------------------------------
  // 4) Typographie
  //    - Police : Exo 2 (installée via @fontsource/exo-2 et importée une seule fois).
  //    - Utilisation de clamp() pour des titres responsives.
  //    - Pas de textTransform sur les boutons (lisibilité).
  // ---------------------------------------------------------------------------
  typography: {
    fontFamily: `"Exo 2", system-ui, -apple-system, Segoe UI, Roboto, Ubuntu, Cantarell, 'Helvetica Neue', Arial, "Apple Color Emoji", "Segoe UI Emoji"`,
  
    h1: {
      fontWeight: 900,           // "black"
      fontSize: "40px",
      lineHeight: "48px",
      letterSpacing: 0,
    },
  
    h3: {
      fontWeight: 700,           // "bold"
      fontSize: "32px",
      lineHeight: "38.4px",
      letterSpacing: 0,
    },
  
    h6: {
      fontWeight: 600,           // "semi-bold"
      fontSize: "16px",
      lineHeight: "19.2px",
      letterSpacing: 0,
    },
  
    body1: {
      fontWeight: 400,           // "regular"
      fontSize: "16px",
      lineHeight: "19.2px",
      letterSpacing: 0,
    },
  
    body2: {
      fontWeight: 300,           // "light"
      fontSize: "12px",
      lineHeight: "14.4px",
      letterSpacing: 0,
    },
  
    button: {
      textTransform: "none",
      fontWeight: 700,           // "bold"
      fontSize: "20px",
      lineHeight: "24px",
      letterSpacing: 0,
    },
  },

  
  // Shape/Shadows globaux
  shape,
  shadows,

  // ---------------------------------------------------------------------------
  // 5) zIndex
  //    - Garde l’AppBar au-dessus des drawers/overlays (besoin mentionné).
  // ---------------------------------------------------------------------------
  zIndex: {
    appBar: 1200,
    drawer: 1100,
    modal: 1300,
    snackbar: 1400,
    tooltip: 1500,
  },

  // ---------------------------------------------------------------------------
  // 6) Overrides & Variants par composant
  //    - C’est ici que tu "skinnes" une fois pour toutes.
  // ---------------------------------------------------------------------------
  components: {
    // -------------------------------------------------------------------------
    // Reset global + scrollbars + fond de page (noir demandé)
    // -------------------------------------------------------------------------
    MuiCssBaseline: {
      styleOverrides: {
        body: {
          backgroundColor: "#000000",
          color: "#FFFFFF",
          WebkitFontSmoothing: "antialiased",
          MozOsxFontSmoothing: "grayscale",
        },
        // Scrollbar (Chrome/Edge) : sobre, discret pour fond sombre
        "*::-webkit-scrollbar": { width: 10, height: 10 },
        "*::-webkit-scrollbar-thumb": {
          borderRadius: 8,
          backgroundColor: "rgba(255,255,255,0.18)",
        },
      },
    },

    // -------------------------------------------------------------------------
    // AppBar : fond noir, texte blanc, légère bordure basse
    // -------------------------------------------------------------------------
    MuiAppBar: {
      defaultProps: { elevation: 0, color: "default" },
      styleOverrides: {
        root: {
          backgroundColor: "#000000",
          color: "#FFFFFF",
          borderBottom: "1px solid rgba(255,255,255,0.08)",
          height: 58,                // cohérent avec ton code
          justifyContent: "center",
        },
      },
    },

    // -------------------------------------------------------------------------
    // Boutons : arrondis, hauteurs standardisées, variantes "soft" sur fond noir
    // -------------------------------------------------------------------------
    MuiButton: {
      defaultProps: { disableElevation: true },
      styleOverrides: {
        root: { borderRadius: shape.borderRadius, fontWeight: 600 },
        sizeLarge:  { height: 48, paddingInline: 20 },
        sizeMedium: { height: 40, paddingInline: 18 },
        sizeSmall:  { height: 32, paddingInline: 14, fontWeight: 600 },
      },
      variants: [
        // Variante "soft" primaire : fond légèrement teinté, texte contrasté
        {
          props: { variant: "soft", color: "primary" },
          style: (ownerState) => ({
            backgroundColor: alpha(brandColors.primary.main, 0.16),
            color: brandColors.primary.light,
            "&:hover": { backgroundColor: alpha(brandColors.primary.main, 0.24) },
            // Si disabled, on conserve un contraste lisible
            "&.Mui-disabled": {
              backgroundColor: "rgba(255,255,255,0.08)",
              color: "rgba(255,255,255,0.38)",
            },
          }),
        },
        // Variante "soft" secondaire
        {
          props: { variant: "soft", color: "secondary" },
          style: {
            backgroundColor: alpha(brandColors.secondary.main, 0.16),
            color: brandColors.secondary.light,
            "&:hover": { backgroundColor: alpha(brandColors.secondary.main, 0.24) },
            "&.Mui-disabled": {
              backgroundColor: "rgba(255,255,255,0.08)",
              color: "rgba(255,255,255,0.38)",
            },
          },
        },
      ],
    },

    // -------------------------------------------------------------------------
    // Cards : arrondi + contour discret + shadow clair doux
    // -------------------------------------------------------------------------
    MuiCard: {
      defaultProps: { elevation: 0 },
      styleOverrides: {
        root: {
          borderRadius: shape.borderRadius,
          boxShadow: shadows[2],
          border: "1px solid rgba(255,255,255,0.08)",
          backgroundColor: "#000000",
        },
      },
    },

    // -------------------------------------------------------------------------
    // Drawer : header arrondi côté haut (si bottom sheet), fond noir
    // -------------------------------------------------------------------------
    MuiDrawer: {
      styleOverrides: {
        paper: {
          borderRadius: "16px 16px 0 0",
          backgroundColor: "#000000",
        },
      },
    },

    // -------------------------------------------------------------------------
    // TextField / OutlinedInput : arrondis + outline adapté au fond sombre
    // -------------------------------------------------------------------------
    MuiTextField: {
      defaultProps: { variant: "outlined", size: "medium" },
    },
    MuiOutlinedInput: {
      styleOverrides: {
        root: { borderRadius: shape.borderRadius, backgroundColor: "transparent" },
        input: { paddingTop: 12, paddingBottom: 12, color: "#FFFFFF" },
        notchedOutline: {
          borderColor: "rgba(255,255,255,0.24)",
        },
        "&:hover .MuiOutlinedInput-notchedOutline": {
          borderColor: "rgba(255,255,255,0.38)",
        },
        "&.Mui-focused .MuiOutlinedInput-notchedOutline": {
          borderColor: brandColors.primary.main,
        },
      },
    },

    // -------------------------------------------------------------------------
    // Chip : pastilles bien arrondies (pill)
    // -------------------------------------------------------------------------
    MuiChip: {
      styleOverrides: { root: { borderRadius: 9999 } },
    },

    // -------------------------------------------------------------------------
    // Avatar : taille par défaut un peu plus grande (cohérence UI)
    // -------------------------------------------------------------------------
    MuiAvatar: {
      styleOverrides: { root: { width: 40, height: 40 } },
    },
  },
});

// -----------------------------------------------------------------------------
// 7) Typo responsive automatique
// -----------------------------------------------------------------------------
theme = responsiveFontSizes(theme);

export default theme;
