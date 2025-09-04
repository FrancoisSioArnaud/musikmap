// src/theme.js
import { createTheme } from "@mui/material/styles";

const theme = createTheme({
  palette: {
    mode: "dark",
    // Couleurs principales : on met un "main" cohérent (milieu du gradient)
    primary: { main: "#000000", contrastText: "#FFFFFF" },
    background: { default: "#000000", paper: "#000000" },
    text: { primary: "#FFFFFF", secondary: "rgba(255,255,255,0.7)" },
    error: { main: "#FB0000" },
    success: { main: "#0FCC0A" }, // (= validation)
    divider: "rgba(255,255,255,0.12)",
  },

  shape: { borderRadius: 0 },

  typography: {
    fontFamily: '"Exo 2", system-ui, -apple-system, Segoe UI, Roboto, sans-serif',
    textAlign: "Left",


    // h1 : 40px (spec "h1: 40px black"). ATTENTION : couleur noire sur fond noir.
    // On garde la taille/hauteur ici. Pour la couleur noire (#000), applique-la
    // dans les composants posés sur surface claire (sinon invisible en dark).
    h1: {
      fontSize: "40px",
      lineHeight: "48px",
      fontWeight: 400,
      // color: "#000000", // <- à activer SEULEMENT pour des surfaces claires
    },

    // h3 : 32 bold
    h3: {
      fontSize: "32px",
      lineHeight: "38.4px",
      fontWeight: 700,
    },

    // h5 : 16 semi-bold
    h5: {
      fontSize: "16px",
      lineHeight: "19.2px",
      fontWeight: 600,
    },



    // p : 16 regular
    body1: {
      fontSize: "16px",
      lineHeight: "19.2px",
      fontWeight: 400,
    },

    // small text : 12 light
    body2: {
      fontSize: "12px",
      lineHeight: "14.4px",
      fontWeight: 300,
    },
  },

  components: {
    // Forcer fond / texte globaux propres au dark "noir/blanc"
    MuiCssBaseline: {
      styleOverrides: {
        "html, body, #root": {
          backgroundColor: "#000000",
          color: "#FFFFFF",
          minHeight: "100%",
        },
      },
    },

    // AppBar (menuAppBar)
    MuiAppBar: {
      styleOverrides: {
        root: {
          backgroundColor: "rgba(0,0,0,0.30)", // black 30%
          borderBottom: "1px solid rgba(255,255,255,0.12)", // white 12%
          backdropFilter: "blur(4px)",
          WebkitBackdropFilter: "blur(4px)",
          boxShadow: "none",
          height: "56px",
        },
      },
    },

    // Avatar
    MuiAvatar: {
      styleOverrides: {
        root: {
          border: "2px solid #FFFFFF",
        },
      },
    },

    // Boutons
    MuiButton: {
      defaultProps: {
        disableElevation: true, // on gère l’ombre manuellement
      },
      styleOverrides: {
        root: {
          borderRadius : 6,
          height: 48,
          borderRadius: 6,
          fontSize: "20px",
          fontWeight: 700,
          textTransform: "none",
        },

        containedPrimary: {
          backgroundColor: "#FFFFFF",
          color: "#000000",
          borderBottom: "4px solid #E2E2E2",
          "&:active": {
            filter: "brightness(0.9)",
          },
        },
        outlinedPrimary: {
          backgroundColor: "#000000",
          color: "#FFFFFF",
          border : "2px solid rgba(255,255,255,0.3)",
          "&:active": {
            filter: "brightness(0.9)",
          },
        },
      },
    },
  },
});

export default theme;
