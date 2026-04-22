import Alert from "@mui/material/Alert";
import Avatar from "@mui/material/Avatar";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import React, { useContext, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";

import { startAuthPageFlow } from "../Auth/AuthFlow";
import { getCookie } from "../Security/TokensUtils";
import { UserContext } from "../UserContext";
import { checkUserStatus } from "../UsersUtils";

import AvatarCropperModal from "./AvatarCropperModal";


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
  const [cropOpen, setCropOpen] = useState(false);
  const [selectedFile, setSelectedFile] = useState(null);
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

  const onAvatarChange = (e) => {
    const file = e.target.files?.[0];
    if (!file) {return;}
    setErrorMessage("");
    setSelectedFile(file);
    setCropOpen(true);
  };

  const onConfirmCropped = async (blob) => {
    setCropOpen(false);
    setSaving(true);
    setErrorMessage("");
    const csrftoken = getCookie("csrftoken");
    const form = new FormData();
    const namedFile = new File([blob], "avatar.jpg", { type: "image/jpeg" });
    form.append("profile_picture", namedFile);

    const localUrl = URL.createObjectURL(blob);
    setUser((prev) => ({ ...(prev || {}), profile_picture_url: localUrl }));

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
      setSelectedFile(null);
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

      <Box sx={{ display: "flex", alignItems: "center", gap: "16px" }}>
        <Avatar src={user?.profile_picture_url} alt={user?.username} sx={{ width: 72, height: 72 }} />
        <label htmlFor="avatar-edit-input">
          <input id="avatar-edit-input" type="file" accept="image/*" hidden onChange={onAvatarChange} />
          <Button variant="outlined" component="span" disabled={saving}>Changer ma photo</Button>
        </label>
      </Box>

      <AvatarCropperModal
        open={cropOpen}
        file={selectedFile}
        onCancel={() => {
          setCropOpen(false);
          setSelectedFile(null);
        }}
        onConfirm={onConfirmCropped}
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
        <Button sx={{ width: "100%" }} variant="contained" onClick={onSaveUsername} disabled={saving}>Enregistrer</Button>
      </Box>
    </Box>
  );
}
