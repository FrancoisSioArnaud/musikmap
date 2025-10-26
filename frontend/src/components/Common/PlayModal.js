// frontend/src/components/Common/PlayModal.jsx
import React from "react";
import Box from "@mui/material/Box";
import Card from "@mui/material/Card";
import CardContent from "@mui/material/CardContent";
import Typography from "@mui/material/Typography";
import Button from "@mui/material/Button";
import OpenInNewIcon from "@mui/icons-material/OpenInNew";

export default function PlayModal({ open, song, onClose }) {
  if (!open || !song) return null;

  const safeText = () => `${song?.title ?? ""} ${song?.artist ?? ""}`.trim();

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
    const url = `https://www.youtube.com/results?search_query=${encodeURIComponent(q)}`;
    window.open(url, "_blank", "noopener,noreferrer");
  };

  const copySongText = async () => {
    const text = `${song?.title ?? ""} - ${song?.artist ?? ""}`.trim();
    try {
      await navigator.clipboard.writeText(text);
      alert("Copié dans le presse-papiers !");
    } catch {
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
          <CardContent sx={{ pb: 1 ,borderRadius:"26px",}}>
            {/* En-tête */}
            <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", mb: 2 }}>
               <Typography variant="h1">
                Écouter
              </Typography>
              <Button onClick={onClose} title="Fermer" sx={{fontSize: "32px"}}>×</Button>
            </Box>
            <Typography variant="body1" sx={{ mb:3 }} noWrap>
                {song?.title || "Titre"} — {song?.artist || "Artiste"}
            </Typography>

            {/* 3 colonnes égales */}
            <Box sx={{display:"grid", gap:"12px"}}>
              <Button fullWidth variant="contained" sx={{bgcolor:"#1ED760"}} onClick={() => openOrAlert(song?.spotify_url)} endIcon={<OpenInNewIcon />} >
                Spotify
              </Button>
              <Button fullWidth variant="contained" sx={{bgcolor:"#A238FF"}} onClick={() => openOrAlert(song?.deezer_url)} endIcon={<OpenInNewIcon />} >
                Deezer
              </Button>
              <Button fullWidth variant="contained" sx={{bgcolor:"#F70F19"}} onClick={openYouTubeSearch} endIcon={<OpenInNewIcon />} >
                YouTube
              </Button>
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
