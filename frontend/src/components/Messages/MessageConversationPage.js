import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import React, { useContext } from "react";
import { useParams } from "react-router-dom";

import { UserContext } from "../UserContext";

import Conversation from "./Conversation";

export default function MessageConversationPage() {
  const { username = "" } = useParams();
  const { user } = useContext(UserContext) || {};

  if (!user?.id) {
    return (
      <Box sx={{ p: 2 }}>
        <Alert severity="info">Connecte-toi pour accéder à tes messages.</Alert>
      </Box>
    );
  }

  if (!username.trim()) {
    return (
      <Box sx={{ p: 2 }}>
        <Alert severity="error">Utilisateur introuvable.</Alert>
      </Box>
    );
  }

  return (
    <Box sx={{ p: 2, pb: 8 }}>
      <Typography variant="h4" sx={{ mb: 2 }}>Messages</Typography>
      <Conversation mode="username" username={username} viewer={user} />
    </Box>
  );
}
