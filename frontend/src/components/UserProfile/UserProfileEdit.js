import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import CircularProgress from "@mui/material/CircularProgress";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import React, { useContext, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";

import { startAuthPageFlow } from "../Auth/AuthFlow";
import { getCookie } from "../Security/TokensUtils";
import { UserContext } from "../UserContext";
import { checkUserStatus } from "../UsersUtils";

import AvatarUploadField from "./AvatarUploadField";


function getApiErrorMessage(payload, fallbackMessage) {
  if (payload?.field_errors && typeof payload.field_errors === "object") {
    const firstField = Object.values(payload.field_errors)[0];
    if (Array.isArray(firstField) && firstField[0]) {return String(firstField[0]);}
    if (firstField) {return String(firstField);}
  }
  if (payload?.detail) {return payload.detail;}
  return fallbackMessage;
}

export default function UserProfileEdit() {
  const { user, setUser, setIsAuthenticated } = useContext(UserContext);
  const [username, setUsername] = useState(user?.username || "");
  const [saving, setSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const navigate = useNavigate();
  const location = useLocation();
  const ownProfilePath = user?.username ? `/profile/${user.username}` : "/profile";

  if (user?.is_guest) {
    return (
      <Box sx={{ p: 2, display: "grid", gap: 3 }}>
        <Typography variant="h4">Crée ton compte</Typography>
        <Typography variant="body1">
          Les profils invités ne peuvent pas être modifiés ici. Crée ton compte pour choisir ton nom visible et ta photo.
        </Typography>
        <Box sx={{ display: "flex", gap: 1 }}>
          <Button variant="contained" onClick={() => startAuthPageFlow({ navigate, location, tab: "register", authContext: "account", mergeGuest: true, prefillUsername: user?.username || "" })}>Créer mon compte</Button>
          <Button variant="outlined" onClick={() => navigate(ownProfilePath)}>Retour</Button>
        </Box>
      </Box>
    );
  }

  const onAvatarCroppedFileChange = async (file, previewUrl) => {
    setSaving(true);
    setErrorMessage("");
    const csrftoken = getCookie("csrftoken");
    const form = new FormData();
    form.append("profile_picture", file);

    setUser((prev) => ({ ...(prev || {}), profile_picture_url: previewUrl }));

    try {
      const res = await fetch("/users/change-profile-pic", {
        method: "POST",
        headers: { "X-CSRFToken": csrftoken, Accept: "application/json" },
        credentials: "same-origin",
        body: form,
      });
      const ct = res.headers.get("content-type") || "";
      const payload = ct.includes("application/json") ? await res.json() : { html: await res.text() };
      if (!res.ok) {
        setErrorMessage(getApiErrorMessage(payload, `Erreur serveur ${res.status}`));
        return;
      }
      if (payload?.profile_picture_url) {
        setUser((prev) => ({ ...(prev || {}), profile_picture_url: payload.profile_picture_url }));
      } else {
        await checkUserStatus(setUser, setIsAuthenticated);
      }
    } catch (err) {
      console.error(err);
      setErrorMessage("Échec de l’envoi de l’image.");
    } finally {
      setSaving(false);
    }
  };

  const onSaveUsername = async () => {
    setSaving(true);
    setErrorMessage("");
    const csrftoken = getCookie("csrftoken");

    try {
      const res = await fetch("/users/change-username", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
          "X-CSRFToken": csrftoken,
        },
        credentials: "same-origin",
        body: JSON.stringify({ username }),
      });

      const ct = res.headers.get("content-type") || "";
      const payload = ct.includes("application/json") ? await res.json() : { html: await res.text() };

      if (!res.ok) {
        setErrorMessage(getApiErrorMessage(payload, `Erreur serveur ${res.status}`));
        return;
      }

      await checkUserStatus(setUser, setIsAuthenticated);
      const nextProfilePath = username.trim() ? `/profile/${username.trim()}` : ownProfilePath;
      navigate(nextProfilePath);
    } catch (err) {
      console.error(err);
      setErrorMessage("Impossible de sauvegarder. Vérifie ta connexion.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Box sx={{ p: "20px", display: "grid", gap: "26px" }}>
      <Typography variant="h1">Modifier le profil</Typography>
      {errorMessage ? <Alert severity="error">{errorMessage}</Alert> : null}

      <AvatarUploadField
        currentImageUrl={user?.profile_picture_url}
        buttonLabel="Changer ma photo"
        disabled={saving}
        inputId="avatar-edit-input"
        onCroppedFileChange={onAvatarCroppedFileChange}
      />

      <Box sx={{display:"grid", gap:"12px"}}>
        <TextField
          label="Nom d’utilisateur"
          value={username}
          onChange={(e) => {
            setUsername(e.target.value);
            if (errorMessage) {setErrorMessage("");}
          }}
          fullWidth
        />

        <Typography variant="body2" sx={{ opacity:"var(--mm-opacity-light-text)", padding: "0px 6px" }}>
              Ton nom doit faire entre 3 et 30 caractères, sans espaces, et avec uniquement des lettres, des chiffres ou les caractères @ . + - _ 
        </Typography>
      </Box>
      <Box className="bottom_fixed" sx={{ display: "flex", gap: "12px", justifyContent: "end" }}>
        <Button sx={{ width: "100%" }} variant="outlined" onClick={() => navigate(ownProfilePath)}>Annuler</Button>
        <Button
          sx={{ width: "100%" }}
          variant="contained"
          onClick={onSaveUsername}
          disabled={saving}
          startIcon={saving ? <CircularProgress size={16} color="inherit" /> : null}
        >
          {saving ? "Enregistrement…" : "Enregistrer"}
        </Button>
      </Box>
    </Box>
  );
}
