import React, { useContext, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import Avatar from "@mui/material/Avatar";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Card from "@mui/material/Card";
import CardContent from "@mui/material/CardContent";
import Checkbox from "@mui/material/Checkbox";
import CircularProgress from "@mui/material/CircularProgress";
import FormControlLabel from "@mui/material/FormControlLabel";
import Grid from "@mui/material/Grid";
import Tab from "@mui/material/Tab";
import Tabs from "@mui/material/Tabs";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import Alert from "@mui/material/Alert";
import LockOutlinedIcon from "@mui/icons-material/LockOutlined";
import MusicNoteIcon from "@mui/icons-material/MusicNote";
import { UserContext } from "../UserContext";
import { checkUserStatus } from "../UsersUtils";
import { getCookie } from "../Security/TokensUtils";
import {
  AUTH_BENEFITS,
  buildSpotifyLoginUrl,
  clearAuthReturnContext,
  getAuthContextCopy,
  getAuthReturnContext,
  getAuthSuccessTarget,
  saveAuthReturnContext,
} from "./authFlow";

const pageContainerSx = {
  display: "grid",
  gap: 2,
};

function BenefitsStrip() {
  return (
    <Box className="auth_benefits_strip" sx={{ display: "flex", gap: 1, overflowX: "auto", pb: 0.5 }}>
      {AUTH_BENEFITS.map((item) => (
        <Typography
          key={item}
          variant="body2"
          className="auth_benefit"
          sx={{
            whiteSpace: "nowrap",
            px: 1.5,
            py: 0.75,
            borderRadius: 999,
            bgcolor: "action.hover",
            flex: "0 0 auto",
          }}
        >
          {item}
        </Typography>
      ))}
    </Box>
  );
}

export default function AuthPanel({
  mode = "page",
  initialTab = "register",
  authContext = "default",
  mergeGuest = false,
  prefillUsername = "",
  onClose,
  onAuthenticated,
  authAction = null,
  providerError = "",
}) {
  const { user, setUser, setIsAuthenticated } = useContext(UserContext);
  const navigate = useNavigate();
  const location = useLocation();
  const [tab, setTab] = useState(initialTab === "login" ? "login" : "register");
  const [loginError, setLoginError] = useState("");
  const [registerErrors, setRegisterErrors] = useState({});
  const [loading, setLoading] = useState(false);
  const [successMessage, setSuccessMessage] = useState("");

  const copy = useMemo(() => getAuthContextCopy(authContext), [authContext]);
  const isGuest = Boolean(user?.is_guest);
  const canClose = typeof onClose === "function";

  const finalizeSuccess = async () => {
    await checkUserStatus(setUser, setIsAuthenticated);
    if (mode === "modal" && onAuthenticated) {
      clearAuthReturnContext();
      onAuthenticated();
      return;
    }
    const stored = getAuthReturnContext();
    const target = getAuthSuccessTarget({ fallback: "/profile", locationState: location.state });
    if (!stored?.action) {
      clearAuthReturnContext();
    }
    navigate(target, { replace: true });
  };

  const handleLoginSubmit = async (event) => {
    event.preventDefault();
    setLoading(true);
    setLoginError("");
    const form = new FormData(event.currentTarget);
    if (!form.get("merge_guest") && isGuest) {
      form.append("merge_guest", mergeGuest ? "1" : "0");
    }

    try {
      const response = await fetch("/users/login_user", {
        method: "POST",
        headers: { "X-CSRFToken": getCookie("csrftoken") },
        credentials: "same-origin",
        body: form,
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        setLoginError(response.status === 401 ? "Informations d'identification non valides" : "Impossible de te connecter.");
        return;
      }
      if (data?.merge_error) {
        setSuccessMessage("Connexion réussie, mais la récupération de cet appareil n’a pas pu être effectuée.");
      } else {
        setSuccessMessage("Connexion réussie.");
      }
      await finalizeSuccess();
    } catch (error) {
      setLoginError("Impossible de te connecter.");
    } finally {
      setLoading(false);
    }
  };

  const handleRegisterSubmit = async (event) => {
    event.preventDefault();
    setLoading(true);
    setRegisterErrors({});
    const form = new FormData(event.currentTarget);
    const profilePicture = form.get("profile_picture");
    if (!profilePicture || !profilePicture.name) {
      form.delete("profile_picture");
    }

    try {
      const response = await fetch("/users/register_user", {
        method: "POST",
        headers: { "X-CSRFToken": getCookie("csrftoken") },
        credentials: "same-origin",
        body: form,
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        setRegisterErrors(data?.errors || { global: ["Impossible de créer ton compte."] });
        return;
      }
      setSuccessMessage("Compte créé avec succès.");
      await finalizeSuccess();
    } catch (error) {
      setRegisterErrors({ global: ["Impossible de créer ton compte."] });
    } finally {
      setLoading(false);
    }
  };

  const handleSpotifyLogin = () => {
    const stored = getAuthReturnContext();
    if (!stored?.returnTo) {
      const target = getAuthSuccessTarget({ fallback: "/profile", locationState: location.state });
      saveAuthReturnContext({
        returnTo: target,
        authContext,
        action: authAction || null,
      });
    }
    window.location.assign(buildSpotifyLoginUrl());
  };

  const cardVariant = mode === "page" ? "outlined" : undefined;

  return (
    <Card className={`auth_panel auth_panel--${mode}`} variant={cardVariant} sx={pageContainerSx}>
      <CardContent sx={{ display: "grid", gap: 2.5 }}>
        <Box sx={{ display: "grid", gap: 1, textAlign: mode === "page" ? "left" : "center" }}>
          <Box sx={{ display: "flex", justifyContent: mode === "page" ? "flex-start" : "center" }}>
            <Avatar sx={{ bgcolor: "var(--mm-color-primary)" }}>
              <LockOutlinedIcon />
            </Avatar>
          </Box>
          <Typography variant="h4">{copy.title}</Typography>
          <Typography variant="body1">{copy.description}</Typography>
          <BenefitsStrip />
        </Box>

        <Box sx={{ display: "grid", gap: 1.5 }}>
          <Typography variant="subtitle1">Connecte toi avec ta plateforme de streaming favorite</Typography>
          <Button variant="outlined" startIcon={<MusicNoteIcon />} onClick={handleSpotifyLogin}>
            Continuer avec Spotify
          </Button>
        </Box>

        <Tabs value={tab} onChange={(_event, nextValue) => setTab(nextValue)}>
          <Tab label="Login" value="login" />
          <Tab label="Register" value="register" />
        </Tabs>

        {providerError ? <Alert severity="error">{providerError}</Alert> : null}
        {successMessage ? <Alert severity="success">{successMessage}</Alert> : null}

        {tab === "login" ? (
          <Box component="form" onSubmit={handleLoginSubmit} noValidate sx={{ display: "grid", gap: 2, paddingTop: "26px" }}>
            <TextField required fullWidth name="username" label="Nom d'utilisateur" autoComplete="username" autoFocus />
            <TextField required fullWidth name="password" label="Mot de passe" type="password" autoComplete="current-password" />
            {isGuest ? (
              <FormControlLabel
                control={<Checkbox name="merge_guest" defaultChecked={mergeGuest || isGuest} />}
                label="Ajouter les partages faits avec cet appareil à mon profil"
              />
            ) : null}
            {loginError ? <Alert severity="error">{loginError}</Alert> : null}
            <Button type="submit" variant="contained" disabled={loading}>
              {loading ? <CircularProgress size={20} /> : "Se connecter"}
            </Button>
          </Box>
        ) : (
          <Box component="form" onSubmit={handleRegisterSubmit} noValidate sx={{ display: "grid", gap: 2, paddingTop: "26px" }}>
            <TextField required fullWidth name="username" label="Nom d'utilisateur" autoComplete="username" autoFocus defaultValue={prefillUsername} />
            <TextField required fullWidth name="email" label="Adresse email" autoComplete="email" />
            <Grid container spacing={2}>
              <Grid item xs={12} sm={6}>
                <TextField required fullWidth name="password1" label="Mot de passe" type="password" autoComplete="new-password" />
              </Grid>
              <Grid item xs={12} sm={6}>
                <TextField required fullWidth name="password2" label="Confirmation du mot de passe" type="password" autoComplete="new-password" />
              </Grid>
            </Grid>
            <Box>
              <Typography variant="subtitle2" sx={{ mb: 1 }}>Image de profil</Typography>
              <input type="file" name="profile_picture" accept=".jpg,.jpeg,.png" />
            </Box>
            {Object.keys(registerErrors).length ? (
              <Box sx={{ display: "grid", gap: 1 }}>
                {Object.entries(registerErrors).map(([key, values]) => (
                  <Alert key={key} severity="error">
                    {Array.isArray(values) ? values[0] : String(values)}
                  </Alert>
                ))}
              </Box>
            ) : null}
            <Button type="submit" variant="contained" disabled={loading}>
              {loading ? <CircularProgress size={20} /> : "Créer mon compte"}
            </Button>
          </Box>
        )}

        {canClose ? (
          <Box sx={{ display: "flex", justifyContent: "center" }}>
            <Button variant="text" onClick={onClose}>Annuler</Button>
          </Box>
        ) : null}
      </CardContent>
    </Card>
  );
}
