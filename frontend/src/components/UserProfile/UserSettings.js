import React, { useState, useContext, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { UserContext } from "../UserContext";

import Container from "@mui/material/Container";
import Box from "@mui/material/Box";
import Stack from "@mui/material/Stack";
import Grid from "@mui/material/Grid";
import Card from "@mui/material/Card";
import CardHeader from "@mui/material/CardHeader";
import CardContent from "@mui/material/CardContent";
import Divider from "@mui/material/Divider";
import Typography from "@mui/material/Typography";
import TextField from "@mui/material/TextField";
import Button from "@mui/material/Button";
import Alert from "@mui/material/Alert";

import { getCookie } from "../Security/TokensUtils";
import { checkUserStatus, setPreferredPlatform, logoutUser } from "../UsersUtils";
import {
  checkDeezerAuthentication,
  authenticateDeezerUser,
  disconnectDeezerUser,
} from "../Utils/streaming/DeezerUtils";
import {
  checkSpotifyAuthentication,
  authenticateSpotifyUser,
  disconnectSpotifyUser,
} from "../Utils/streaming/SpotifyUtils";

export default function UserSettings() {
  const { user, setUser, setIsAuthenticated } = useContext(UserContext);
  const navigate = useNavigate();

  const [isSpotifyAuthenticated, setIsSpotifyAuthenticated] = useState(false);
  const [isDeezerAuthenticated, setIsDeezerAuthenticated] = useState(false);
  const [showPasswordForm, setShowPasswordForm] = useState(false);
  const [passwordErrors, setPasswordErrors] = useState({});
  const [providerErrors, setProviderErrors] = useState({});

  useEffect(() => {
    checkSpotifyAuthentication(setIsSpotifyAuthenticated);
    checkDeezerAuthentication(setIsDeezerAuthenticated);
  }, []);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const nextProviderErrors = {};

    if (params.get("spotify") === "error") {
      nextProviderErrors.spotify =
        "Connexion Spotify impossible. Vérifie l’URL de redirection configurée côté Spotify et le domaine courant.";
    }
    if (params.get("deezer") === "error") {
      nextProviderErrors.deezer =
        "Connexion Deezer impossible. Vérifie l’URL de redirection configurée côté Deezer et le domaine courant.";
    }

    if (Object.keys(nextProviderErrors).length) {
      setProviderErrors(nextProviderErrors);
      window.history.replaceState({}, document.title, window.location.pathname);
    }
  }, []);

  if (user?.is_guest) {
    return (
      <Container maxWidth="sm" sx={{ py: 3 }}>
        <Card variant="outlined">
          <CardHeader titleTypographyProps={{ variant: "h6" }} title="Finaliser mon compte" />
          <Divider />
          <CardContent>
            <Stack spacing={2}>
              <Typography variant="body1">
                Ton profil invité te permet déjà de cumuler tes points, déposer, réagir et retrouver tes chansons sur cet appareil.
              </Typography>
              <Typography variant="body2" color="text.secondary">
                Finalise ton compte pour choisir un nom visible par les autres, personnaliser ton apparence et accéder aux autres fonctionnalités du compte.
              </Typography>
              <Box sx={{ display: "flex", gap: 1 }}>
                <Button variant="contained" onClick={() => navigate("/register")}>
                  Finaliser mon compte
                </Button>
                <Button variant="outlined" onClick={() => navigate("/profile")}>
                  Retour
                </Button>
              </Box>
            </Stack>
          </CardContent>
        </Card>
      </Container>
    );
  }

  const handleButtonClickConnectSpotify = async () => {
    setProviderErrors((prev) => ({ ...prev, spotify: null }));
    const ok = await authenticateSpotifyUser(isSpotifyAuthenticated, setIsSpotifyAuthenticated);
    if (!ok) {
      setProviderErrors((prev) => ({
        ...prev,
        spotify: "Impossible d’ouvrir la connexion Spotify.",
      }));
    }
  };

  const handleButtonClickDisconnectSpotify = async () => {
    const ok = await disconnectSpotifyUser(isSpotifyAuthenticated, setIsSpotifyAuthenticated);
    if (ok) {
      await checkUserStatus(setUser, setIsAuthenticated);
    }
  };

  const handleButtonClickConnectDeezer = async () => {
    setProviderErrors((prev) => ({ ...prev, deezer: null }));
    const ok = await authenticateDeezerUser(isDeezerAuthenticated, setIsDeezerAuthenticated);
    if (!ok) {
      setProviderErrors((prev) => ({
        ...prev,
        deezer: "Impossible d’ouvrir la connexion Deezer.",
      }));
    }
  };

  const handleButtonClickDisconnectDeezer = async () => {
    const ok = await disconnectDeezerUser(isDeezerAuthenticated, setIsDeezerAuthenticated);
    if (ok) {
      await checkUserStatus(setUser, setIsAuthenticated);
    }
  };

  function handlePreferredPlatform(platform) {
    setPreferredPlatform(platform)
      .then(() => checkUserStatus(setUser, setIsAuthenticated))
      .catch(() => console.log("cannot change preferred platform"));
  }

  const handlePasswordChange = () => setShowPasswordForm(true);
  const handlePasswordCancel = () => setShowPasswordForm(false);

  const sendAndProcessPasswordChange = async (form) => {
    const csrftoken = getCookie("csrftoken");
    const requestOptions = { method: "POST", headers: { "X-CSRFToken": csrftoken }, body: form };
    try {
      const response = await fetch("/users/change-password", requestOptions);
      const data = await response.json();
      if (response.ok) {
        setPasswordErrors({});
        setShowPasswordForm(false);
      } else {
        if (data.errors) setPasswordErrors(data.errors);
        else console.log(data);
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    const data = new FormData(e.currentTarget);
    sendAndProcessPasswordChange(data);
  };

  return (
    <Container maxWidth="md" sx={{ py: 3 }}>
      <Stack spacing={3}>
        <Card variant="outlined">
          <CardHeader titleTypographyProps={{ variant: "h6" }} title="Tes informations personnelles" />
          <Divider />
          <CardContent>
            <Grid container spacing={2}>
              <Grid item xs={12} sm={6}>
                <TextField label="Email" variant="outlined" fullWidth value={user?.email || ""} InputProps={{ readOnly: true }} />
              </Grid>

              {!user?.is_social_auth ? (
                <Grid item xs={12} sm={6}>
                  <TextField label="Mot de passe" variant="outlined" fullWidth type="password" value="*******" InputProps={{ readOnly: true }} />
                </Grid>
              ) : null}
            </Grid>
          </CardContent>
        </Card>

        <Card variant="outlined">
          <CardHeader
            titleTypographyProps={{ variant: "h6" }}
            title="Mot de passe"
            subheader={!user?.is_social_auth ? "Modifie ton mot de passe de connexion." : "Vous êtes connecté avec une plateforme de streaming."}
          />
          <Divider />
          <CardContent>
            {!user?.is_social_auth ? (
              showPasswordForm ? (
                <Box component="form" noValidate onSubmit={handleSubmit}>
                  <Grid container spacing={2}>
                    <Grid item xs={12}>
                      <TextField required fullWidth name="old_password" label="Ancien mot de passe" type="password" />
                    </Grid>
                    <Grid item xs={12} sm={6}>
                      <TextField required fullWidth name="new_password1" label="Nouveau mot de passe" type="password" />
                    </Grid>
                    <Grid item xs={12} sm={6}>
                      <TextField required fullWidth name="new_password2" label="Confirmation" type="password" />
                    </Grid>
                  </Grid>

                  {Object.keys(passwordErrors).length > 0 && (
                    <Box sx={{ mt: 2 }}>
                      {Object.keys(passwordErrors).map((k) => (
                        <Alert key={k} severity="error" sx={{ mb: 1 }}>
                          {passwordErrors[k]}
                        </Alert>
                      ))}
                    </Box>
                  )}

                  <Box sx={{ mt: 2, display: "flex", gap: 1 }}>
                    <Button type="submit" variant="contained">
                      Modifier
                    </Button>
                    <Button variant="outlined" onClick={handlePasswordCancel}>
                      Annuler
                    </Button>
                  </Box>
                </Box>
              ) : (
                <Button variant="contained" onClick={handlePasswordChange}>
                  Modifier le mot de passe
                </Button>
              )
            ) : (
              <Typography variant="body2" color="text.secondary">
                Vous êtes connecté avec une plateforme de streaming.
              </Typography>
            )}
          </CardContent>
        </Card>

        <Card variant="outlined">
          <CardHeader
            titleTypographyProps={{ variant: "h6" }}
            title="Tes services de streaming"
            subheader="Ta plateforme principale est celle utilisée pour la recherche."
          />
          <Divider />
          <CardContent>
            <Stack spacing={3}>
              {providerErrors.spotify ? <Alert severity="error">{providerErrors.spotify}</Alert> : null}
              {providerErrors.deezer ? <Alert severity="error">{providerErrors.deezer}</Alert> : null}

              <Box>
                <Grid container spacing={2} alignItems="center" wrap="wrap">
                  <Grid item>
                    <Box component="img" src="../static/images/spotify_logo.svg" alt="Spotify" sx={{ width: 96, height: "auto" }} />
                  </Grid>
                  <Grid item xs>
                    <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap">
                      {isSpotifyAuthenticated ? (
                        <Button variant="outlined" onClick={handleButtonClickDisconnectSpotify}>Se déconnecter</Button>
                      ) : (
                        <Button variant="contained" onClick={handleButtonClickConnectSpotify}>Se connecter</Button>
                      )}

                      {user?.preferred_platform === "spotify" ? (
                        <Typography variant="body2" sx={{ ml: 1 }}>Plateforme principale</Typography>
                      ) : (
                        <Button variant="text" onClick={() => handlePreferredPlatform("spotify")} sx={{ ml: 1 }}>
                          Choisir comme plateforme principale
                        </Button>
                      )}
                    </Stack>
                  </Grid>
                </Grid>
              </Box>

              <Box>
                <Grid container spacing={2} alignItems="center" wrap="wrap">
                  <Grid item>
                    <Box component="img" src="../static/images/deezer_logo.svg" alt="Deezer" sx={{ width: 96, height: "auto" }} />
                  </Grid>
                  <Grid item xs>
                    <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap">
                      {isDeezerAuthenticated ? (
                        <Button variant="outlined" onClick={handleButtonClickDisconnectDeezer}>Se déconnecter</Button>
                      ) : (
                        <Button variant="contained" onClick={handleButtonClickConnectDeezer}>Se connecter</Button>
                      )}

                      {user?.preferred_platform === "deezer" ? (
                        <Typography variant="body2" sx={{ ml: 1 }}>Plateforme principale</Typography>
                      ) : (
                        <Button variant="text" onClick={() => handlePreferredPlatform("deezer")} sx={{ ml: 1 }}>
                          Choisir comme plateforme principale
                        </Button>
                      )}
                    </Stack>
                  </Grid>
                </Grid>
              </Box>
            </Stack>
          </CardContent>
        </Card>

        <Card variant="outlined">
          <CardHeader titleTypographyProps={{ variant: "h6" }} title="Session" />
          <Divider />
          <CardContent>
            <Button variant="outlined" color="error" onClick={() => logoutUser(setUser, setIsAuthenticated, navigate)}>
              Se déconnecter
            </Button>
          </CardContent>
        </Card>
      </Stack>
    </Container>
  );
}
