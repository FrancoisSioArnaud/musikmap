import React, { useContext, useState } from "react";
import { UserContext } from "../UserContext";
import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import Avatar from "@mui/material/Avatar";
import Button from "@mui/material/Button";
import TextField from "@mui/material/TextField";
import { getCookie } from "../Security/TokensUtils";
import { checkUserStatus } from "../UsersUtils";
import { useLocation, useNavigate } from "react-router-dom";
import AvatarCropperModal from "./AvatarCropperModal";
import { startAuthPageFlow } from "../Auth/AuthFlow";

export default function UserProfileEdit() {
  const { user, setUser, setIsAuthenticated } = useContext(UserContext);
  const [username, setUsername] = useState(user?.username || "");
  const [saving, setSaving] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();
  const [cropOpen, setCropOpen] = useState(false);
  const [selectedFile, setSelectedFile] = useState(null);

  if (user?.is_guest) {
    return (
      <Box sx={{ p: 2, display: "grid", gap: 3 }}>
        <Typography variant="h4">Crée ton compte</Typography>
        <Typography variant="body1">
          Les profils invités ne peuvent pas être modifiés ici. Crée ton compte pour choisir ton nom visible et ta photo.
        </Typography>
        <Box sx={{ display: "flex", gap: 1 }}>
          <Button variant="contained" onClick={() => startAuthPageFlow({ navigate, location, tab: "register", authContext: "account", mergeGuest: true, prefillUsername: user?.username || "" })}>Créer mon compte</Button>
          <Button variant="outlined" onClick={() => navigate("/profile")}>Retour</Button>
        </Box>
      </Box>
    );
  }

  const onAvatarChange = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setSelectedFile(file);
    setCropOpen(true);
  };

  const onConfirmCropped = async (blob) => {
    setCropOpen(false);
    setSaving(true);
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
        const msg = Array.isArray(payload?.errors) ? payload.errors.join(" ") : `Erreur serveur ${res.status}`;
        alert(msg);
        return;
      }
      if (payload?.profile_picture_url) {
        setUser((prev) => ({ ...(prev || {}), profile_picture_url: payload.profile_picture_url }));
      } else {
        await checkUserStatus(setUser, setIsAuthenticated);
      }
    } catch (err) {
      console.error(err);
      alert("Échec de l’envoi de l’image.");
    } finally {
      setSaving(false);
      setSelectedFile(null);
    }
  };

  const onSaveUsername = async () => {
    setSaving(true);
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
        const msg = Array.isArray(payload?.errors) ? payload.errors.join(" ") : `Erreur serveur ${res.status}`;
        alert(msg);
        return;
      }

      await checkUserStatus(setUser, setIsAuthenticated);
      navigate("/profile");
    } catch (err) {
      console.error(err);
      alert("Impossible de sauvegarder. Vérifie ta connexion.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Box sx={{ p: "20px", display: "grid", gap: "26px" }}>
      <Typography variant="h1">Modifier le profil</Typography>

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
          onChange={(e) => setUsername(e.target.value)}
          fullWidth
        />

        <Typography variant="body2" sx={{ opacity:"var(--mm-opacity-light-text)", padding: "0px 6px" }}>
              Ton nom doit faire entre 3 et 30 caractères, sans espaces, et avec uniquement des lettres, des chiffres ou les caractères @ . + - _ 
        </Typography>
      </Box>
      <Box className="bottom_fixed" sx={{ display: "flex", gap: "12px", justifyContent: "end" }}>
        <Button sx={{ width: "100%" }} variant="outlined" onClick={() => navigate("/profile")}>Annuler</Button>
        <Button sx={{ width: "100%" }} variant="contained" onClick={onSaveUsername} disabled={saving}>Enregistrer</Button>
      </Box>
    </Box>
  );
}
