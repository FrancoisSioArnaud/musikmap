// frontend/src/components/Common/PlayModal.jsx
import React from "react";
import Box from "@mui/material/Box";
import Card from "@mui/material/Card";
import CardContent from "@mui/material/CardContent";
import Typography from "@mui/material/Typography";
import Button from "@mui/material/Button";

export default function PlayModal({ open, song, onClose }) {
  if (!open || !song) return null;

  const safeText = () =>
    `${song?.title ?? ""} ${song?.artist ?? ""}`.trim();

  const openOrAlert = (url) => {
    if (url) window.open(url, "_blank", "noopener,noreferrer");
    else
      alert(
        "Oops ! Une erreur s'est produite, utilise le bouton « Copier le nom de la chanson » pour cette fois."
      );
  };

  const openYouTubeSearch = () => {
    const q = safeText();
    if (!q) {
      alert(
        "Oops ! Une erreur s'est produite, utilise le bouton « Copier le nom de la chanson » pour cette fois."
      );
      return;
    }
    const url = `https://www.youtube.com/results?search_query=${encodeURIComponent(
      q
    )}`;
    window.open(url, "_blank", "noopener,noreferrer");
  };

  const copySongText = async () => {
    const text = `${song?.title ?? ""} - ${song?.artist ?? ""}`.trim();
    try {
      await navigator.clipboard.writeText(text);
      alert("Copié dans le presse-papiers !");
    } catch {
      // Fallback pour vieux navigateurs
      const ta = document.createElement("textarea");
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      document.body.removeChild(ta);
      alert("Copié dans le presse-papiers !");
    }
  };

  return (
    <Box
      onClick={onClose}
      sx={{
        position: "fixed",
        inset: 0,
        bgcolor: "rgba(0,0,0,0.35)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        p: 2,
        zIndex: 1300,
      }}
    >
      <Box onClick={(e) => e.stopPropagation()} sx={{ width: "100%", maxWidth: "90vw" }}>
        <Card sx={{ width: "100%", maxWidth: 500, borderRadius: 2 }}>
          <CardContent sx={{ pb: 1 }}>
            {/* En-tête */}
            <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", mb: 2 }}>
              <Typography variant="h6" sx={{ mr: 2 }} noWrap>
                {song?.title || "Titre"} — {song?.artist || "Artiste"}
              </Typography>
              <Button onClick={onClose} title="Fermer">×</Button>
            </Box>

            {/* Ligne des boutons de plateforme */}
            <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap" }}>
              <Button variant="contained" onClick={() => openOrAlert(song?.spotify_url)}>Spotify</Button>
              <Button variant="contained" onClick={() => openOrAlert(song?.deezer_url)}>Deezer</Button>
              <Button variant="contained" onClick={openYouTubeSearch}>YouTube</Button>
            </Box>

            {/* Bouton Copier en pleine largeur, sous les trois */}
            <Box sx={{ mt: 1 }}>
              <Button fullWidth variant="outlined" onClick={copySongText}>
                Copier le nom de la chanson
              </Button>
            </Box>
          </CardContent>
        </Card>
      </Box>
    </Box>
  );
}
