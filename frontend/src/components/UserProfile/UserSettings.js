// frontend/src/components/UserSettings.js
import React, { useState, useContext, useEffect } from "react";
import { UserContext } from "../UserContext";
import TextField from "@mui/material/TextField";
import Grid from "@mui/material/Grid";
import Typography from "@mui/material/Typography";
import Button from "@mui/material/Button";
import Box from "@mui/material/Box";
import { getCookie } from "../Security/TokensUtils";
import { checkUserStatus, setPreferredPlatform, logoutUser } from "../UsersUtils";
import {
  checkDeezerAuthentication,
  authenticateDeezerUser,
  disconnectDeezerUser,
} from "../MusicBox/DeezerUtils";
import {
  checkSpotifyAuthentication,
  authenticateSpotifyUser,
  disconnectSpotifyUser,
} from "../MusicBox/SpotifyUtils";

const styles = {
  root: { flexGrow: 1, padding: "16px" },
  textField: { marginBottom: "16px" },
  buttonGroup: { marginBottom: "16px" },
  buttonConnect: { backgroundColor: "transparent", color: "gray" },
  buttonPlatform: {
    backgroundColor: "transparent",
    color: "gray",
    textTransform: "none",
    fontStyle: "italic",
  },
  image: { width: "100px", height: "50px", marginRight: "8px" },
  streamingTitle: { marginTop: "24px" },
  basicButton: {
    borderRadius: "20px",
    backgroundImage: "linear-gradient(to right, #fa9500, #fa4000)",
    color: "white",
    border: "none",
    textTransform: "none",
    "&:hover": { border: "none" },
  },
  disconnectButton: {
    margin: "10px 10px",
    borderRadius: "20px",
    backgroundImage: "linear-gradient(to right, #fa9500, #fa4000)",
    color: "white",
    border: "none",
    textTransform: "none",
    "&:hover": { border: "none" },
  },
};

export default function UserSettings() {
  const { user, setUser, setIsAuthenticated } = useContext(UserContext);

  const [isSpotifyAuthenticated, setIsSpotifyAuthenticated] = useState(false);
  const [isDeezerAuthenticated, setIsDeezerAuthenticated] = useState(false);
  const [showPasswordForm, setShowPasswordForm] = useState(false);
  const [errorMessages, setErrorMessages] = useState({});

  useEffect(() => {
    checkSpotifyAuthentication(setIsSpotifyAuthenticated);
    checkDeezerAuthentication(setIsDeezerAuthenticated);
  }, []);

  // ---- Streaming auth handlers
  const handleButtonClickConnectSpotify = () =>
    authenticateSpotifyUser(isSpotifyAuthenticated, setIsSpotifyAuthenticated);

  const handleButtonClickDisconnectSpotify = () => {
    disconnectSpotifyUser(isSpotifyAuthenticated, setIsSpotifyAuthenticated);
    window.location.reload();
  };

  const handleButtonClickConnectDeezer = () =>
    authenticateDeezerUser(isDeezerAuthenticated, setIsDeezerAuthenticated);

  const handleButtonClickDisconnectDeezer = () => {
    disconnectDeezerUser(isDeezerAuthenticated, setIsDeezerAuthenticated);
    window.location.reload();
  };

  function handlePreferredPlatform(platform) {
    setPreferredPlatform(platform)
      .then(() => checkUserStatus(setUser, setIsAuthenticated))
      .catch(() => console.log("cannot change preferred platform"));
  }

  // ---- Password change
  const handlePasswordChange = () => setShowPasswordForm(true);
  const handlePasswordCancel = () => setShowPasswordForm(false);

  const sendAndProcessPasswordChange = async (form) => {
    const csrftoken = getCookie("csrftoken");
    const requestOptions = { method: "POST", headers: { "X-CSRFToken": csrftoken }, body: form };
    try {
      const response = await fetch("/users/change-password", requestOptions);
      const data = await response.json();
      if (response.ok) {
        setErrorMessages({});
        setShowPasswordForm(false);
      } else {
        if (data.errors) setErrorMessages(data.errors);
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
    <div style={styles.root}>
      {/* --- Infos personnelles --- */}
      <Grid container spacing={2} sx={{ mt: 1 }}>
        <Grid item xs={12}>
          <Typography variant="h6" gutterBottom>
            Tes informations personnelles
          </Typography>
        </Grid>

        <Grid item xs={12} sm={6}>
          <TextField
            style={styles.textField}
            label="Email"
            variant="outlined"
            fullWidth
            value={user.email}
            InputProps={{ readOnly: true }}
          />
        </Grid>

        {!user.is_social_auth ? (
          <Grid item xs={12} sm={6}>
            <TextField
              style={styles.textField}
              label="Mot de passe"
              variant="outlined"
              fullWidth
              type="password"
              value="*******"
              InputProps={{ readOnly: true }}
            />
          </Grid>
        ) : null}
      </Grid>

      {/* --- Mot de passe --- */}
      {!user.is_social_auth ? (
        showPasswordForm ? (
          <Box component="form" noValidate onSubmit={handleSubmit} sx={{ mt: 1 }}>
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
            <Button type="submit" variant="contained" sx={{ mt: 3 }} style={styles.basicButton}>
              Modifier
            </Button>
            <Button variant="contained" sx={{ ml: 2, mt: 3 }} onClick={handlePasswordCancel} style={styles.basicButton}>
              Annuler
            </Button>
            {Object.keys(errorMessages).map((k) => (
              <Typography key={k} variant="body2" color="error" align="center">
                {errorMessages[k]}
              </Typography>
            ))}
          </Box>
        ) : (
          <Button variant="contained" onClick={handlePasswordChange} style={styles.basicButton} sx={{ mt: 1 }}>
            Modifier le mot de passe
          </Button>
        )
      ) : (
        <Typography variant="body2" align="center" sx={{ mt: 1 }}>
          Vous êtes connecté avec une plateforme de streaming.
        </Typography>
      )}

      {/* --- Services de streaming --- */}
      <Grid container spacing={2} alignItems="center" style={styles.buttonGroup} sx={{ mt: 3 }}>
        <Grid item xs={12}>
          <Typography variant="h6" style={styles.streamingTitle}>
            Tes services de streaming
          </Typography>
          <Typography variant="subtitle1" gutterBottom>
            Ta plateforme principale est celle utilisée pour la recherche
          </Typography>
        </Grid>

        {/* Spotify */}
        <Grid container spacing={2} alignItems="center" style={styles.buttonGroup}>
          <Grid item>
            <img src="../static/images/spotify_logo.svg" alt="Spotify" style={styles.image} />
          </Grid>
          <Grid item>
            {isSpotifyAuthenticated ? (
              <Button variant="contained" style={styles.buttonConnect} onClick={handleButtonClickDisconnectSpotify}>
                Se déconnecter
              </Button>
            ) : (
              <Button variant="contained" style={styles.buttonConnect} onClick={handleButtonClickConnectSpotify}>
                Se connecter
              </Button>
            )}
          </Grid>
          <Grid item>
            {user.preferred_platform === "spotify" ? (
              <Typography variant="subtitle1">Plateforme principale</Typography>
            ) : (
              <Button
                variant="contained"
                style={styles.buttonPlatform}
                onClick={() => handlePreferredPlatform("spotify")}
              >
                Choisir comme plateforme principale
              </Button>
            )}
          </Grid>
        </Grid>

        {/* Deezer */}
        <Grid container spacing={2} alignItems="center" style={styles.buttonGroup}>
          <Grid item>
            <img src="../static/images/deezer_logo.svg" alt="Deezer" style={styles.image} />
          </Grid>
          <Grid item>
            {isDeezerAuthenticated ? (
              <Button variant="contained" style={styles.buttonConnect} onClick={handleButtonClickDisconnectDeezer}>
                Se déconnecter
              </Button>
            ) : (
              <Button variant="contained" style={styles.buttonConnect} onClick={handleButtonClickConnectDeezer}>
                Se connecter
              </Button>
            )}
          </Grid>
          <Grid item>
            {user.preferred_platform === "deezer" ? (
              <Typography variant="subtitle1">Plateforme principale</Typography>
            ) : (
              <Button
                variant="contained"
                style={styles.buttonPlatform}
                onClick={() => handlePreferredPlatform("deezer")}
              >
                Choisir comme plateforme principale
              </Button>
            )}
          </Grid>
        </Grid>
      </Grid>

      {/* --- Déconnexion --- */}
      <Button
        variant="contained"
        onClick={() => logoutUser(setUser, setIsAuthenticated)}
        style={styles.disconnectButton}
      >
        Déconnexion
      </Button>
    </div>
  );
}
