import React, { useContext, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import Avatar from "@mui/material/Avatar";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Card from "@mui/material/Card";
import Divider from "@mui/material/Divider";
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
import IconButton from "@mui/material/IconButton";
import LockOutlinedIcon from "@mui/icons-material/LockOutlined";
import CloseIcon from "@mui/icons-material/Close";
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




function BenefitsStrip() {
  return (
    <Box className="auth_benefits_strip" sx={{ display: "flex", gap: "16px", overflowX: "auto", p:"0 16px", backgroundColor: "var(--mm-color-secondary-light)", p: "16px" }}>
      {AUTH_BENEFITS.map((item) => (
        <Typography
          key={item}
          variant="body1"
          className="auth_benefit"
          sx={{
            px: 1.5,
            py: 0.75,
            borderRadius: 999,
            bgcolor: "action.hover",
            width: "80%",
            padding: "12px 16px",
            borderRadius: "var(--mm-radius-md)",
            backgroundColor: "var(--mm-color-surface)"
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
    <Box className={`auth_panel auth_panel--${mode}`} sx={{ display: "grid", gap: "16px" }}>
      <Box sx={{ backgroundColor: "var(--mm-color-secondary-light)", pt:"42px", display: "grid", gap: "16px", textAlign: mode === "page" ? "left" : "center", position: "relative" }}>
        {canClose ? (
          <IconButton
            aria-label="Fermer"
            onClick={onClose}
            sx={{ position: "absolute", top: -8, right: -8 }}
          >
            <CloseIcon />
          </IconButton>
        ) : null}

        <Box className="header" sx={{ p:"0 16px", textAlign: "center", gap: "12px", display: "grid" }}>
          <Typography variant="h4">Connecte toi !</Typography>
          <Typography variant="body1" sx={{ opacity:"var(--mm-opacity-light-text" }}>{copy.description}</Typography>
        </Box>
        <BenefitsStrip />
      </Box>

      <Button
        variant="light"
        sx={{  }}
        startIcon={
          <Box
            component="img"
            src="/static/images/spotify_logo_icon.svg"
            alt="Spotify"
            sx={{ width: 20, height: 20, display: "block" }}
          />
        }
        onClick={handleSpotifyLogin}
      >
        Me connecter avec Spotify
      </Button>

      <Divider sx={{ my: 2 }}>
        <Typography
          variant="h4"
          sx={{
            lineHeight: 1,
          }}
        >
          ou
        </Typography>
      </Divider>
      
            
      <Tabs value={tab} onChange={(_event, nextValue) => setTab(nextValue)} variant="fullWidth">
        <Tab label="J'ai un compte" value="login" />
        <Tab label="Nouveau compte" value="register" />
      </Tabs>

      {providerError ? <Alert severity="error">{providerError}</Alert> : null}
      {successMessage ? <Alert severity="success">{successMessage}</Alert> : null}

      {tab === "login" ? (
        <Box component="form" onSubmit={handleLoginSubmit} noValidate sx={{ display: "grid", gap: 2, p:"16px" }}>
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
        <Box component="form" onSubmit={handleRegisterSubmit} noValidate sx={{ display: "grid", gap: 2, p: "16px" }}>
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
    </Box>
  );
}
