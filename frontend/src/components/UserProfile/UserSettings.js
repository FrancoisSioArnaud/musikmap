// frontend/src/components/UserSettings.js
import React, { useState, useContext, useEffect } from "react";
import { useNavigate } from "react-router-dom"; // <-- NEW
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
} from "../MusicBox/DeezerUtils";
import {
  checkSpotifyAuthentication,
  authenticateSpotifyUser,
  disconnectSpotifyUser,
} from "../MusicBox/SpotifyUtils";

export default function UserSettings() {
  const { user, setUser, setIsAuthenticated } = useContext(UserContext);
  const navigate = useNavigate(); // <-- NEW

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

  // ---- Déconnexion avec redirection
  const handleLogout = () => {
    logoutUser(setUser, setIsAuthenticated);
    navigate("/"); // <-- redirige vers la home
  };

  return (
    <Container maxWidth="md" sx={{ py: 3 }}>
      <Stack spacing={3}>
        {/* ... (toutes les sections identiques : infos perso, mot de passe, streaming) ... */}

        {/* ================== DÉCONNEXION ================== */}
        <Card variant="outlined">
          <CardContent>
            <Stack
              direction={{ xs: "column", sm: "row" }}
              spacing={1}
              alignItems="center"
              justifyContent="space-between"
            >
              <Typography variant="body1">Terminer la session sur cet appareil.</Typography>
              <Button
                variant="contained"
                color="error"
                onClick={handleLogout} // <-- utilise handleLogout
              >
                Déconnexion
              </Button>
            </Stack>
          </CardContent>
        </Card>
      </Stack>
    </Container>
  );
}
