import React, { useContext, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Divider from "@mui/material/Divider";
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
import CloseIcon from "@mui/icons-material/Close";
import { UserContext } from "../UserContext";
import { checkUserStatus } from "../UsersUtils";
import { getCookie } from "../Security/TokensUtils";
import { authenticateProviderUser } from "../Utils/streaming/providerClient";
import {
  AUTH_BENEFITS,
  clearAuthReturnContext,
  getAuthContextCopy,
  getAuthReturnContext,
  getAuthSuccessTarget,
  saveAuthReturnContext,
} from "./AuthFlow";

function normalizeFieldErrors(payload, fallbackMessage) {
  if (payload?.field_errors && typeof payload.field_errors === "object") {
    return payload.field_errors;
  }
  if (payload?.detail) {
    return { global: [payload.detail] };
  }
  return { global: [fallbackMessage] };
}

function BenefitsStrip() {
  return (
    <Box className="auth_benefits_strip no_scroll_bar" sx={{ display: "flex", gap: "16px", overflowX: "auto", p: "16px", backgroundColor: "var(--mm-color-secondary-light)" }}>
      {AUTH_BENEFITS.map((item) => (
        <Typography
          key={item}
          variant="body1"
          className="auth_benefit"
          sx={{
            minWidth: "80%",
            px: 2,
            py: 1.5,
            borderRadius: "var(--mm-radius-md)",
            backgroundColor: "var(--mm-color-surface)",
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

  const finalizeSuccess = async ({ resultType = null, redirectTo = null } = {}) => {
    await checkUserStatus(setUser, setIsAuthenticated);
    if (redirectTo) {
      navigate(redirectTo, { replace: true });
      return;
    }
    if (resultType) {
      navigate(`/auth/return?result=${encodeURIComponent(resultType)}`, { replace: true });
      return;
    }
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
        setLoginError(data?.detail || (response.status === 401 ? "Informations d'identification non valides" : "Impossible de te connecter."));
        return;
      }
      if (data?.merge_error) {
        setSuccessMessage("Connexion réussie, mais la récupération de cet appareil n’a pas pu être effectuée.");
      } else {
        setSuccessMessage("Connexion réussie.");
      }
      await finalizeSuccess({ redirectTo: data?.auth_redirect_to || null, resultType: data?.auth_result || null });
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
        setRegisterErrors(normalizeFieldErrors(data, "Impossible de créer ton compte."));
        return;
      }
      setSuccessMessage("Compte créé avec succès.");
      await finalizeSuccess({ resultType: "account_created" });
    } catch (error) {
      setRegisterErrors({ global: ["Impossible de créer ton compte."] });
    } finally {
      setLoading(false);
    }
  };

  const handleSpotifyLogin = async () => {
    const stored = getAuthReturnContext();
    if (!stored?.returnTo) {
      const target = getAuthSuccessTarget({ fallback: "/profile", locationState: location.state });
      saveAuthReturnContext({
        returnTo: target,
        authContext,
        action: authAction || null,
      });
    }
    try {
      await authenticateProviderUser("spotify");
    } catch (_error) {}
  };

  return (
    <Box className={`auth_panel auth_panel--${mode}`} sx={{ display: "grid", gap: "16px" }}>
      <Box sx={{ backgroundColor: "var(--mm-color-secondary-light)", pt: "42px", marginBottom: "16px", display: "grid", gap: "16px", textAlign: mode === "page" ? "left" : "center", position: "relative" }}>
        {canClose ? (
          <IconButton aria-label="Fermer" onClick={onClose} sx={{ position: "absolute", top: -8, right: -8 }}>
            <CloseIcon />
          </IconButton>
        ) : null}

        <Box className="header" sx={{ p: "0 16px", textAlign: "center", gap: "12px", display: "grid" }}>
          <Typography variant="h3">{copy.title}</Typography>
          <Typography variant="body1" sx={{ opacity: "var(--mm-opacity-light-text)" }}>{copy.description}</Typography>
        </Box>
        <BenefitsStrip />
      </Box>

      <Box sx={{ display: "grid", gap: "8px", p: "0 16px" }}>
        <Typography variant="subtitle1">Connecte toi avec ta plateforme de streaming favorite</Typography>
        <Button
          variant="outlined"
          sx={{ justifySelf: "start" }}
          startIcon={<Box component="img" src="/static/images/spotify_logo_icon.svg" alt="Spotify" sx={{ width: 20, height: 20, display: "block" }} />}
          onClick={handleSpotifyLogin}
        >
          Me connecter avec Spotify
        </Button>
      </Box>

      <Divider sx={{ my: 2 }}>
        <Typography variant="h4" sx={{ lineHeight: 1 }}>ou</Typography>
      </Divider>

      <Tabs value={tab} onChange={(_event, nextValue) => setTab(nextValue)} variant="fullWidth">
        <Tab label="Me connecter" value="login" />
        <Tab label="Nouveau compte" value="register" />
      </Tabs>

      {providerError ? <Alert severity="error">{providerError}</Alert> : null}
      {successMessage ? <Alert severity="success">{successMessage}</Alert> : null}

      {tab === "login" ? (
        <Box component="form" onSubmit={handleLoginSubmit} noValidate sx={{ display: "grid", gap: 2, p: "16px" }}>
          <TextField required fullWidth name="username" label="Nom d'utilisateur" autoComplete="username" autoFocus />
          <TextField required fullWidth name="password" label="Mot de passe" type="password" autoComplete="current-password" />
          {isGuest ? (
            <FormControlLabel control={<Checkbox name="merge_guest" defaultChecked={mergeGuest || isGuest} />} label="Ajouter les partages faits avec cet appareil à mon profil" />
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
