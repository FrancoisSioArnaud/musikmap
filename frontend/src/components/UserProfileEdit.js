// frontend/src/components/UserProfileEdit.js
import React, { useContext, useState } from "react";
import { UserContext } from "./UserContext";
import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import Avatar from "@mui/material/Avatar";
import Button from "@mui/material/Button";
import TextField from "@mui/material/TextField";
import { getCookie } from "./Security/TokensUtils";
import { checkUserStatus } from "./UsersUtils";
import { useNavigate } from "react-router-dom";

export default function UserProfileEdit() {
  const { user, setUser, setIsAuthenticated } = useContext(UserContext);
  const [username, setUsername] = useState(user?.username || "");
  const [saving, setSaving] = useState(false);
  const navigate = useNavigate();

  const onAvatarChange = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const form = new FormData();
    form.append("profile_picture", file);
    const csrftoken = getCookie("csrftoken");
    setSaving(true);
    try {
      const res = await fetch("/users/change-profile-pic", {
        method: "POST",
        headers: { "X-CSRFToken": csrftoken },
        body: form,
      });
      await res.json();
      if (res.ok) await checkUserStatus(setUser, setIsAuthenticated);
    } finally {
      setSaving(false);
    }
  };

  const onSaveUsername = async () => {
    const csrftoken = getCookie("csrftoken");
    setSaving(true);
    try {
      const res = await fetch("/users/change-username", {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-CSRFToken": csrftoken },
        body: JSON.stringify({ username }),
      });
      const data = await res.json();
      if (res.ok) {
        await checkUserStatus(setUser, setIsAuthenticated);
        navigate("/profile");
      } else {
        console.log(data);
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <Box sx={{ p: 2, display: "grid", gap: 2 }}>
      <Typography variant="h6">Modifier le profil</Typography>

      <Box sx={{ display: "flex", alignItems: "center", gap: 2 }}>
        <Avatar src={user.profile_picture_url} alt={user.username} sx={{ width: 72, height: 72 }} />
        <label htmlFor="avatar-edit-input">
          <input id="avatar-edit-input" type="file" accept="image/*" hidden onChange={onAvatarChange} />
          <Button variant="outlined" component="span" disabled={saving}>Changer la photo</Button>
        </label>
      </Box>

      <TextField
        label="Nom d’utilisateur"
        value={username}
        onChange={(e) => setUsername(e.target.value)}
        fullWidth
      />
      <Box sx={{ display: "flex", gap: 1 }}>
        <Button variant="contained" onClick={onSaveUsername} disabled={saving}>Enregistrer</Button>
        <Button variant="outlined" onClick={() => navigate("/profile")}>Annuler</Button>
      </Box>
    </Box>
  );
}
