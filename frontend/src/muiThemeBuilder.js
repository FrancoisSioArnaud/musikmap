// frontend/src/muiThemeBuilder.js

import { createTheme } from "@mui/material/styles";

export function buildMuiTheme(clientTheme) {
  const inputRadius =
    parseInt(clientTheme.radius.input, 10) ||
    parseInt(clientTheme.radius.button, 10) ||
    16;

  return createTheme({
    palette: {
      mode: "light",
      primary: {
        main: clientTheme.colors.primary,
        contrastText: clientTheme.colors.primaryContrastText,
      },
      background: {
        default: clientTheme.colors.appBg,
        paper: clientTheme.colors.surface,
      },
      text: {
        primary: clientTheme.colors.text,
        secondary: clientTheme.colors.primaryDark,
      },
      error: { main: clientTheme.colors.error },
      success: { main: clientTheme.colors.success },
      divider: clientTheme.colors.divider,
    },

    spacing: [0, 4, 8, 12, 16, 26, 32, 48, 56, 64],

    typography: {
      fontFamily: clientTheme.fonts.body1,

      h1: {
        fontSize: "40px",
        fontWeight: 900,
        color: clientTheme.colors.text,
        fontFamily: clientTheme.fonts.h1,
      },

      h3: {
        fontSize: "32px",
        fontWeight: 700,
        color: clientTheme.colors.text,
        fontFamily: clientTheme.fonts.h3,
      },

      h4: {
        fontSize: "26px",
        fontWeight: 600,
        color: clientTheme.colors.text,
        fontFamily: clientTheme.fonts.h4,
      },

      h5: {
        fontSize: "16px",
        fontWeight: 600,
        color: clientTheme.colors.text,
        fontFamily: clientTheme.fonts.h5,
      },

      subtitle1: {
        fontSize: "16px",
        fontWeight: 700,
        lineHeight: "normal",
        color: clientTheme.colors.text,
        fontFamily: clientTheme.fonts.subtitle1,
      },

      body1: {
        fontSize: "16px",
        fontWeight: 400,
        color: clientTheme.colors.text,
        fontFamily: clientTheme.fonts.body1,
      },

      body2: {
        fontSize: "12px",
        fontWeight: 300,
        color: clientTheme.colors.text,
        fontFamily: clientTheme.fonts.body2,
      },
    },

    components: {
      MuiCssBaseline: {
        styleOverrides: {
          "html, body, #root": {
            minHeight: "100%",
            backgroundColor: clientTheme.colors.appBg,
            color: clientTheme.colors.text,
          },
          body: {},
          a: {},
        },
      },

      MuiAppBar: {
        styleOverrides: {
          root: {
            backgroundColor: clientTheme.colors.appBarBg,
            borderBottom: clientTheme.colors.appBarBorder,
            boxShadow: "none",
            height: "56px",
          },
        },
      },

      MuiAvatar: {
        styleOverrides: {
          root: {
            border: clientTheme.colors.avatarBorder,
            height: 32,
            width: 32,
          },
        },
      },

      MuiButton: {
        defaultProps: {
          disableElevation: true,
        },
        styleOverrides: {
          root: {
            height: 48,
            fontSize: "20px",
            textTransform: "none",
            "&:hover": {
              backgroundColor: "inherit",
              boxShadow: "none",
              border: "inherit",
            },
          },

          contained: {
            p: "6px 26px",
            borderRadius: parseInt(clientTheme.radius.button, 10) || 16,
            height: 48,
            backgroundColor: clientTheme.colors.primary,
            color: clientTheme.colors.primaryContrastText,
            fontWeight: 700,
            "&:hover": {
              backgroundColor: "inherit",
              boxShadow: "none",
              border: "inherit",
            },
          },

          outlinedPrimary: {
            p: "6px 26px",
            borderRadius: parseInt(clientTheme.radius.button, 10) || 16,
            height: 48,
            backgroundColor: clientTheme.colors.white,
            color: clientTheme.colors.primary,
            fontWeight: 700,
            border: `solid inset 2px ${clientTheme.colors.primary}`,
            borderWidth: 2,
            "&:hover": {
              backgroundColor: "inherit",
              boxShadow: "none",
              border: "inherit",
            },
          },
        },

        variants: [
          {
            props: { variant: "depositInteract" },
            style: {
              p: "12px 26px",
              borderRadius: parseInt(clientTheme.radius.button, 10) || 16,
              height: 48,
              backgroundColor: clientTheme.colors.primary,
              color: clientTheme.colors.primaryContrastText,
              fontWeight: 700,
              "&:hover": {
                backgroundColor: "inherit",
                boxShadow: "none",
                border: "inherit",
              },
            },
          },
          {
            props: { variant: "menu" },
            style: {
              borderRadius: parseInt(clientTheme.radius.button, 10) || 16,
              height: 48,
              border: `solid ${clientTheme.colors.primary} 2px`,
              backgroundColor: clientTheme.colors.white,
              fontSize: "16px",
              fontWeight: 600,
              color: clientTheme.colors.text,
              "&:hover": {
                backgroundColor: "inherit",
                boxShadow: "none",
                border: "inherit",
              },
            },
          },
        ],
      },

      MuiTextField: {
        defaultProps: {
          variant: "outlined",
        },
      },

      MuiInputLabel: {
        styleOverrides: {
          root: {
            color: clientTheme.colors.inputLabel,
            "&.Mui-focused": {
              color: clientTheme.colors.primary,
            },
            "&.Mui-error": {
              color: clientTheme.colors.inputBorderError,
            },
            "&.Mui-disabled": {
              color: clientTheme.colors.inputPlaceholder,
            },
          },
        },
      },

      MuiOutlinedInput: {
        styleOverrides: {
          root: {
            borderRadius: inputRadius,
            backgroundColor: clientTheme.colors.white,
            color: clientTheme.colors.text,
            transition:
              "border-color 160ms ease, box-shadow 160ms ease, background-color 160ms ease",

            "& .MuiOutlinedInput-notchedOutline": {
              borderColor: clientTheme.colors.divider,
              borderWidth: 1,
            },

            "&:hover .MuiOutlinedInput-notchedOutline": {
              borderColor: clientTheme.colors.secondarylight,
            },

            "&.Mui-focused .MuiOutlinedInput-notchedOutline": {
              borderColor: clientTheme.colors.primary,
              borderWidth: 1,
            },

            "&.Mui-error .MuiOutlinedInput-notchedOutline": {
              borderColor: clientTheme.colors.error,
            },

            /*"&.Mui-disabled": {
              backgroundColor: clientTheme.colors.inputDisabledBg,
            },

            "&.Mui-disabled .MuiOutlinedInput-notchedOutline": {
              borderColor: clientTheme.colors.inputDisabledBorder,
            },*/

            "& input::placeholder": {
              color: clientTheme.colors.text,
              opacity: 1,
            },

            "& textarea::placeholder": {
              color: clientTheme.colors.text,
              opacity: 1,
            },
          },

          input: {
            padding: "14px 16px",
          },

          multiline: {
            padding: "14px 16px",
          },
        },
      },
    },
  });
}
