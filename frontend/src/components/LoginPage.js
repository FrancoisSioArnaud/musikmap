import * as React from "react";
import { useState, useContext } from "react";
import { UserContext } from "./UserContext";
import Avatar from "@mui/material/Avatar";
import Button from "@mui/material/Button";
import CssBaseline from "@mui/material/CssBaseline";
import TextField from "@mui/material/TextField";
import Link from "@mui/material/Link";
import Grid from "@mui/material/Grid";
import Box from "@mui/material/Box";
import LockOutlinedIcon from "@mui/icons-material/LockOutlined";
import Typography from "@mui/material/Typography";
import Container from "@mui/material/Container";
import { checkUserStatus } from "./UsersUtils";
import { useNavigate } from "react-router-dom";
import CircularProgress from "@mui/material/CircularProgress";
import { getCookie } from "./Security/TokensUtils";
import { navigateToCurrentBox } from "./MusicBox/BoxUtils";

const styles = {
  button: {
    borderRadius: "20px",
    backgroundImage: "linear-gradient(to right, #fa9500, #fa4000)",
    color: "white",
    border: "none",
    textTransform: "none",
    "&:hover": {
      border: "none",
    },
  },
};

export default function LoginPage() {
  // States & Variables
  const [authenticationSuccess, setAuthenticationSuccess] = useState(false);
  const [errorMessages, setErrorMessages] = useState("");
  const { user, setUser, isAuthenticated, setIsAuthenticated, currentBoxName } =
    useContext(UserContext);
  const navigate = useNavigate();

  /**
   * Sends form data to the server and processes the response for user login.
   * @param {FormData} form - The form data to be sent.
   * @returns {Promise<void>} - A Promise that resolves when the request is completed.
   */
  const sendAndProcessData = async (form) => {
    const csrftoken = getCookie("csrftoken");
    // The browser automatically sets the appropriate Content-Type header with the correct boundary value.
    const requestOptions = {
      method: "POST",
      headers: { "X-CSRFToken": csrftoken },
      body: form,
    };
    try {
      const response = await fetch("/users/login_user", requestOptions);
      const data = await response.json();
      if (response.ok) {
        setAuthenticationSuccess(true);
        setErrorMessages("");
        setTimeout(() => {
          checkUserStatus(setUser, setIsAuthenticated);
          navigateToCurrentBox(navigate);
        }, 2000);
      } else {
        if (response.status === 401) {
          setErrorMessages("Informations d'identification non valides");
        } else {
          setErrorMessages("Vous êtes déjà connecté");
        }
      }
    } catch (error) {
      console.error(error);
    }
  };

  /**
   * Handles the form submission event.
   * @param {Event} event - The form submission event.
   * @returns {void}
   */
  const handleSubmit = (event) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    sendAndProcessData(data);
  };

  /**
   * Handles multi-platform login by redirecting the user to the appropriate OAuth login page.
   * @param {string} platform - The platform for which the user wants to perform the login.
   * @returns {void}
   */
  const handleMultiplatformLogin = (platform) => {
    window.location.href = "/oauth/login/" + platform;
  };

  return (
    <Container component="main" maxWidth="xs">
      <CssBaseline />
      <Box
        sx={{
          marginTop: 8,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          textAlign: "center",
        }}
      >
        <Avatar sx={{ m: 1, bgcolor: "#fa9500" }}>
          <LockOutlinedIcon />
        </Avatar>
        <Typography component="h1" variant="h5">
          Se connecter
        </Typography>
        {authenticationSuccess ? (
          <>
            <Typography variant="body2" color="text.primary" align="center">
              Vous vous êtes connecté avec succès!
            </Typography>
            <CircularProgress
              sx={{
                color: "#fa9500",
              }}
            />
          </>
        ) : (
          <>
            <Box
              component="form"
              onSubmit={handleSubmit}
              noValidate
              sx={{ mt: 1 }}
            >
              <TextField
                margin="normal"
                required
                fullWidth
                id="username"
                label="Nom d'utilisateur"
                name="username"
                autoComplete="username"
                autoFocus
              />
              <TextField
                margin="normal"
                required
                fullWidth
                name="password"
                label="Mot de passe"
                type="password"
                id="password"
                autoComplete="current-password"
              />
              <Button
                type="submit"
                fullWidth
                variant="contained"
                style={styles.button}
                sx={{ mt: 3, mb: 2 }}
              >
                Se connecter
              </Button>
              <Typography variant="body2" color="error" align="center">
                {errorMessages}
              </Typography>
              <Grid container>
                <Grid item>
                  <Link href="/register" variant="body2">
                    {"Vous n'avez pas de compte ? S'inscrire"}
                  </Link>
                </Grid>
              </Grid>
              <Typography mt="10px" variant="h6">
                Ou utiliser une autre plateforme
              </Typography>
            </Box>
            <Box sx={{ display: "flex", flexDirection: "row", gap: "10px" }}>
              <Button
                variant="contained"
                style={styles.button}
                onClick={() => handleMultiplatformLogin("spotify")}
              >
                Spotify
              </Button>
              <Button
                variant="contained"
                style={styles.button}
                onClick={() => handleMultiplatformLogin("deezer")}
              >
                Deezer
              </Button>
            </Box>
          </>
        )}
      </Box>
    </Container>
  );
}
