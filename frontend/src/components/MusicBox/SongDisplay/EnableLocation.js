// frontend/src/components/MusicBox/SongDisplay/EnableLocation.js
import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Box, Button, Typography, CircularProgress } from "@mui/material";
import { checkLocation } from "../BoxUtils";

export default function EnableLocation({ setStage, boxInfo, className }) {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);

  async function handleButtonClick() {
    if (!boxInfo || !boxInfo.box) return;
    setLoading(true);
    try {
      await checkLocation(boxInfo, navigate);
      // Une fois la géoloc validée → on passe à l’étape 2
      setStage?.(2);
    } finally {
      setLoading(false);
    }
  }

  if (!boxInfo || !boxInfo.box) return null;

  return (
    <Box className={className}>
      <Box className="enable-location__wrapper">
        {/* Bouton affichant le nom du spot (désactivé) */}
        <Button
          variant="outlined"
          color="secondary"
          disabled
          sx={{ mb: 2 }}
        >
          {boxInfo.box.name}
        </Button>

        {/* Titre */}
        <Typography variant="h1" component="h1" gutterBottom>
          Autoriser la localisation
        </Typography>

        {/* Texte d’explication */}
        <Typography variant="body1" sx={{ mb: 3 }}>
          Confirme que tu es bien à côté du spot en partageant ta localisation.
          Ta localisation est uniquement utilisée pour ouvrir la boîte.
        </Typography>

        {/* Bouton principal */}
        <Button
          variant="contained"
          color="primary"
          onClick={handleButtonClick}
          disabled={loading}
          sx={{ width: "100%", mb: 2 }}
        >
          {loading ? "Vérification..." : "Autoriser"}
        </Button>

        {/* Loader */}
        {loading && (
          <Box display="flex" justifyContent="center" mt={1.5}>
            <CircularProgress size={22} />
          </Box>
        )}
      </Box>
    </Box>
  );
}
