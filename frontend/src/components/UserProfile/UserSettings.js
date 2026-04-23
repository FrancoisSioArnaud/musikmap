import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Card from "@mui/material/Card";
import CardContent from "@mui/material/CardContent";
import CardHeader from "@mui/material/CardHeader";
import Container from "@mui/material/Container";
import Divider from "@mui/material/Divider";
import FormControlLabel from "@mui/material/FormControlLabel";
import Grid from "@mui/material/Grid";
import Stack from "@mui/material/Stack";
import Switch from "@mui/material/Switch";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import React, { useState, useContext, useEffect } from "react";
import { useLocation, useNavigate } from "react-router-dom";

import { startAuthPageFlow } from "../Auth/AuthFlow";
import ConfirmActionDialog from "../Common/ConfirmActionDialog";
import { getCookie } from "../Security/TokensUtils";
import { UserContext } from "../UserContext";
import { checkUserStatus, logoutUser } from "../UsersUtils";
import {
  checkSpotifyAuthentication,
  authenticateSpotifyUser,
  disconnectSpotifyUser,
} from "../Utils/streaming/SpotifyUtils";

function normalizeFieldErrors(payload, fallbackMessage) {
  if (payload?.field_errors && typeof payload.field_errors === "object") {
    return payload.field_errors;
  }
  if (payload?.detail) {
    return { global: [payload.detail] };
  }
  return { global: [fallbackMessage] };
}

export default function UserSettings() {
  const { user, setUser, setIsAuthenticated } = useContext(UserContext);
  const navigate = useNavigate();
  const location = useLocation();

  const [isSpotifyAuthenticated, setIsSpotifyAuthenticated] = useState(false);
  const [showPasswordForm, setShowPasswordForm] = useState(false);
  const [passwordErrors, setPasswordErrors] = useState({});
  const [providerErrors, setProviderErrors] = useState({});
  const [logoutDialogOpen, setLogoutDialogOpen] = useState(false);
  const [disconnectSpotifyDialogOpen, setDisconnectSpotifyDialogOpen] = useState(false);
  const [allowPrivateMessages, setAllowPrivateMessages] = useState(
    Boolean(user?.allow_private_message_requests ?? true)
  );
  const ownProfilePath = user?.username ? `/profile/${user.username}` : "/profile";

  useEffect(() => {
    checkSpotifyAuthentication(setIsSpotifyAuthenticated);
  }, []);

  useEffect(() => {
    setAllowPrivateMessages(Boolean(user?.allow_private_message_requests ?? true));
  }, [user?.allow_private_message_requests]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const nextProviderErrors = {};

    if (params.get("spotify") === "error") {
      nextProviderErrors.spotify =
        "Connexion Spotify impossible. Vérifie l’URL de redirection configurée côté Spotify et le domaine courant.";
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
          <CardHeader titleTypographyProps={{ variant: "h6" }} title="Créer mon compte" />
          <Divider />
          <CardContent>
            <Stack spacing={2}>
              <Typography variant="body1">
                Ton profil invité te permet déjà de cumuler tes points, déposer, réagir et retrouver tes chansons sur cet appareil.
              </Typography>
              <Typography variant="body2" color="text.secondary">
                Crée ton compte pour choisir un nom visible par les autres, personnaliser ton apparence et accéder aux autres fonctionnalités du compte.
              </Typography>
              <Box sx={{ display: "flex", gap: 1 }}>
                <Button variant="contained" onClick={() => startAuthPageFlow({ navigate, location, tab: "register", authContext: "account", mergeGuest: true, prefillUsername: user?.username || "" })}>
                  Créer mon compte
                </Button>
                <Button variant="outlined" onClick={() => navigate(ownProfilePath)}>
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

  const handlePasswordChange = () => setShowPasswordForm(true);
  const handlePasswordCancel = () => setShowPasswordForm(false);

  const sendAndProcessPasswordChange = async (form) => {
    const csrftoken = getCookie("csrftoken");
    const requestOptions = { method: "POST", headers: { "X-CSRFToken": csrftoken }, body: form };
    try {
      const response = await fetch("/users/change-password", requestOptions);
      const data = await response.json().catch(() => ({}));
      if (response.ok) {
        setPasswordErrors({});
        setShowPasswordForm(false);
      } else {
        setPasswordErrors(normalizeFieldErrors(data, "Impossible de modifier le mot de passe."));
      }
    } catch (e) {
      console.error(e);
      setPasswordErrors({ global: ["Impossible de modifier le mot de passe."] });
    }
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    const data = new FormData(e.currentTarget);
    sendAndProcessPasswordChange(data);
  };

  const handlePrivateMessagesToggle = async (event) => {
    const next = Boolean(event.target.checked);
    setAllowPrivateMessages(next);
    try {
      const response = await fetch("/messages/settings", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json", "X-CSRFToken": getCookie("csrftoken") },
        body: JSON.stringify({ allow_private_message_requests: next }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(data?.detail || "Impossible de mettre à jour ce réglage.");
      }
      setUser((prev) => ({ ...prev, allow_private_message_requests: next }));
    } catch (e) {
      setAllowPrivateMessages((prev) => !prev);
    }
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
            title="Messagerie privée"
            subheader="Autoriser les autres utilisateurs à t’envoyer une demande privée."
          />
          <Divider />
          <CardContent>
            <FormControlLabel
              control={<Switch checked={allowPrivateMessages} onChange={handlePrivateMessagesToggle} />}
              label={allowPrivateMessages ? "Demandes privées autorisées" : "Demandes privées désactivées"}
            />
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
                          {Array.isArray(passwordErrors[k]) ? passwordErrors[k][0] : String(passwordErrors[k])}
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
            title="Spotify"
            subheader="Connecte Spotify pour obtenir des résultats personnalisés et retrouver tes dernières écoutes dans la recherche."
          />
          <Divider />
          <CardContent>
            <Stack spacing={2}>
              {providerErrors.spotify ? <Alert severity="error">{providerErrors.spotify}</Alert> : null}
              <Grid container spacing={2} alignItems="center" wrap="wrap">
                <Grid item>
                  <Box component="img" src="../static/images/spotify_logo.svg" alt="Spotify" sx={{ width: 96, height: "auto" }} />
                </Grid>
                <Grid item xs>
                  <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap">
                    {isSpotifyAuthenticated ? (
                      <Button variant="outlined" onClick={() => setDisconnectSpotifyDialogOpen(true)}>Se déconnecter</Button>
                    ) : (
                      <Button variant="contained" onClick={handleButtonClickConnectSpotify}>Se connecter</Button>
                    )}
                    <Typography variant="body2" color="text.secondary">
                      {isSpotifyAuthenticated ? "Connecté" : "Non connecté"}
                    </Typography>
                  </Stack>
                </Grid>
              </Grid>
            </Stack>
          </CardContent>
        </Card>

        <Card variant="outlined">
          <CardHeader titleTypographyProps={{ variant: "h6" }} title="Session" />
          <Divider />
          <CardContent>
            <Button variant="outlined" color="error" onClick={() => setLogoutDialogOpen(true)}>
              Se déconnecter
            </Button>
          </CardContent>
        </Card>
      </Stack>
      <ConfirmActionDialog
        open={disconnectSpotifyDialogOpen}
        onClose={() => setDisconnectSpotifyDialogOpen(false)}
        onConfirm={async () => {
          setDisconnectSpotifyDialogOpen(false);
          await handleButtonClickDisconnectSpotify();
        }}
        title="Déconnecter Spotify ?"
        description="Tu ne verras plus tes résultats personnalisés ni tes dernières écoutes Spotify dans la recherche."
        confirmLabel="Déconnecter"
      />

      <ConfirmActionDialog
        open={logoutDialogOpen}
        onClose={() => setLogoutDialogOpen(false)}
        onConfirm={async () => {
          setLogoutDialogOpen(false);
          await logoutUser(setUser, setIsAuthenticated, navigate);
        }}
        title="Se déconnecter ?"
        description="Tu vas être déconnecté de ton compte sur cet appareil."
        confirmLabel="Se déconnecter"
        confirmColor="error"
      />
    </Container>
  );
}
