// src/theme.js
import { createTheme } from "@mui/material/styles";

const theme = createTheme({
  palette: {
    mode: "light",
    // Couleurs principales
    primary: { main: "#7BD528", contrastText: "#000000" },
    background: { default: "#FFFFFF", paper: "#FFFFFF" },
    text: { primary: "#000103", secondary: "#0D2A0E" },
    error: { main: "#FB0000" },
    success: { main: "#0FCC0A" }, // (= validation)
    divider: "rgba(255,255,255,0.12)",
  },

  spacing: [0, 4, 8, 12, 16, 26, 32, 48, 56, 64], 
  
  typography: {
    fontFamily: 'Manrope, open-sans, system-ui, -apple-system, Segoe UI, Roboto, sans-serif',

    // h1 : 40px black (attention : en dark, #000 est invisible ; laisse la couleur au composant si fond clair)
    h1: {
      fontSize: "40px",
      fontWeight: 900,
      color: "#000000",
    },

    // h3 : 32 bold
    h3: {
      fontSize: "32px",
      fontWeight: 700,
      color: "#000000",
    },
    
    // h4 : 16 semi-bold
    h4: {
      fontSize: "26px",
      fontWeight: 600,
      color: "#000000",
    },
    
    // h5 : 16 semi-bold
    h5: {
      fontSize: "16px",
      fontWeight: 600,
      color: "#000000",
    },

    // Thicktext : 16 bold → map sur subtitle1
    subtitle1: {
      fontSize: "16px",
      fontWeight: 700,
      color: "#000000",
    },

    // p : 16 regular
    body1: {
      fontSize: "16px",
      fontWeight: 400,
      color: "#000000",
    },

    // small text : 12 light
    body2: {
      fontSize: "12px",
      fontWeight: 300,
      color: "#000000",
    },
  },

  components: {
    // Global : fond noir + texte blanc
    MuiCssBaseline: {
      styleOverrides: {
        "html, body, #root": {
          minHeight: "100%",
          backgroundColor: "#FFFFFF",
          color: "#000103", // ← tous les textes par défaut en noir TAN
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
          backgroundColor: "#FFFFFF", // black 30%
          borderBottom: "1px solid rgba(255,255,255,0.12)", // white 12%
          boxShadow: "none",
          height: "56px",
        },
      },
    },

    // Avatar
    MuiAvatar: {
      styleOverrides: {
        root: {
          border: "2px solid rgba(0,0,0,0.04)",
          height:6,
          width:6,
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
          height: 48,
          fontSize: "20px",
          textTransform: "none",
        },

        // Bouton plein (primary)
        contained: {
          borderRadius: 16,
          height: 56,
          backgroundColor: "#7BD528",
          color: "#FFFFFF",
          fontWeight: 700,
          "&:active": {
            filter: "brightness(0.9)",
          },
          "&:hover": {
            filter: "brightness(0.9)",
          },
        },

        // Bouton outlined (primary)
        outlinedPrimary: {
          borderRadius: 16,
          height: 56,
          backgroundColor: "#FFFFFF",
          color: "#7BD528",
          fontWeight: 700,
          border: "solid inset 2px #7BD528",
          borderWidth: 2,

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
            borderRadius: 16,
            height: 56,
            backgroundColor: "#7BD528",
            color: "#FFFFFF",
            fontWeight: 700,
          },
        },
        {
          props: { variant: "menu" },
          style: {
            borderRadius: 16,
            height: 56,
            border: "solid #7BD528 2px",
            backgroundColor: "white",
            fontSize: "16px",
            fontWeight: 600,
            color: "#000000",
          },
        },
      ],
    },
  },
});

export default theme;
