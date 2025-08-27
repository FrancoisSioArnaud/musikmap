// frontend/src/components/UserSettings.js
import React, { useState, useContext, useEffect } from "react";
import { useNavigate } from "react-router-dom"; // 👈 import ajouté
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
  const navigate = useNavigate(); // 👈 hook ajouté

  const [isSpotifyAuthenticated, setIsSpotifyAuthenticated] = useState(false);
  const [isDeezerAuthenticated, setIsDeezerAuthenticated] = useState(false);

  const [showPasswordForm, setShowPasswordForm] = useState(false);
  const [errorMessages, setErrorMessages] = useState({});

  useEffect(() => {
    checkSpotifyAuthentication(setIsSpotifyAuthenticated);
    checkDeezerAuthentication(setIsDeezerAuthenticated);
  }, []);

  // … [tout le reste identique, inchangé] …

  return (
    <Container maxWidth="md" sx={{ py: 3 }}>
      <Stack spacing={3}>
        {/* ... toutes les cartes identiques ... */}

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
                onClick={() => {
                  logoutUser(setUser, setIsAuthenticated);
                  navigate("/"); // 👈 redirection vers la home
                }}
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
