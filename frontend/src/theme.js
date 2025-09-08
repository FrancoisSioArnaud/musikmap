// src/theme.js
import { createTheme } from "@mui/material/styles";

const theme = createTheme({
  palette: {
    mode: "dark",
    // Couleurs principales
    primary: { main: "#FFFFFF", contrastText: "#000000" },
    background: { default: "#000000", paper: "#000000" },
    text: { primary: "#FFFFFF", secondary: "rgba(255,255,255,0.7)" },
    error: { main: "#FB0000" },
    success: { main: "#0FCC0A" }, // (= validation)
    divider: "rgba(255,255,255,0.12)",
  },

  // Bordures globales (tu as choisi 0 ici)
  shape: { borderRadius: 0 },

  typography: {
    fontFamily: '"Exo 2", system-ui, -apple-system, Segoe UI, Roboto, sans-serif',
    // textAlign n'est pas un champ supporté globalement par MUI typography,
    // on le gère plutôt localement via sx si besoin.
    // textAlign: "Left",

    // h1 : 40px black (attention : en dark, #000 est invisible ; laisse la couleur au composant si fond clair)
    h1: {
      fontSize: "40px",
      lineHeight: "48px",
      fontWeight: 900,
      color: "#FFFFFF",
      // color: "#000000", // à activer localement seulement sur surface claire
    },

    // h3 : 32 bold
    h3: {
      fontSize: "32px",
      lineHeight: "38.4px",
      fontWeight: 700,
      color: "#FFFFFF",
    },

    // h5 : 16 semi-bold
    h5: {
      fontSize: "16px",
      lineHeight: "19.2px",
      fontWeight: 600,
      color: "#FFFFFF",
    },

    // Thicktext : 16 bold → map sur subtitle1
    subtitle1: {
      fontSize: "16px",
      lineHeight: "19.2px",
      fontWeight: 700,
      color: "#FFFFFF",
    },

    // p : 16 regular
    body1: {
      fontSize: "16px",
      lineHeight: "19.2px",
      fontWeight: 400,
      color: "#FFFFFF",
    },

    // small text : 12 light
    body2: {
      fontSize: "12px",
      lineHeight: "14.4px",
      fontWeight: 300,
      color: "#FFFFFF",
    },
  },

  components: {
    // Global : fond noir + texte blanc
    MuiCssBaseline: {
      styleOverrides: {
        "html, body, #root": {
          minHeight: "100%",
          backgroundColor: "#000000",
          color: "#FFFFFF", // ← tous les textes par défaut en blanc
        },
        body: {
         
        },
        // Optionnel : liens en blanc par défaut (sinon ils héritent déjà du body)
        a: {
          
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
        disableElevation: true, // on gère l’ombre et autres effets à la main
      },
      styleOverrides: {
        root: {
          borderRadius: 0,
          height: 48,
          fontSize: "20px",
          textTransform: "none",
        },

        // Bouton plein (primary)
        contained: {
          borderRadius: 6,
          height: 56,
          backgroundColor: "#FFFFFF",
          color: "#000000",
          fontWeight: 700,
          borderBottom: "4px solid #E2E2E2",
          "&:active": {
            filter: "brightness(0.9)",
          },
          "&:hover": {
            filter: "brightness(0.9)",
          },
        },

        // Bouton outlined (primary)
        outlinedPrimary: {
          backgroundColor: "#000000",
          color: "#FFFFFF",
          border: "2px solid rgba(255,255,255,0.3)",
          "&:active": {
            filter: "brightness(0.9)",
          },
          "&:hover": {
            filter: "brightness(0.9)",
          },
        },
      },
      
      variants: [
        {
          props: { variant: "depositInteract" }, // <Button variant="gradient">
          style: {
            background: "linear-gradient(35deg, #FF9900, #FF3D00)",
            boxShadow: "0px 4px 0px 0px rgba(0, 0, 0, 0.3)",
            color: "#FFF",
            fontWeight: 700,
            borderRadius: 0,
            padding : "16px",
            display:"flex",
            flexDirection : "column",
            textTransform: "none",
            "&:hover": {
              filter: "brightness(0.9)",
            },
          },
        },
      ],
    },
  },
});

export default theme;
