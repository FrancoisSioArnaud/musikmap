import React, { useState } from "react";
import Box from "@mui/material/Box";
import Card from "@mui/material/Card";
import CardContent from "@mui/material/CardContent";
import CardMedia from "@mui/material/CardMedia";
import Typography from "@mui/material/Typography";
import Button from "@mui/material/Button";
import Avatar from "@mui/material/Avatar";
import List from "@mui/material/List";
import ListItem from "@mui/material/ListItem";
import ListItemText from "@mui/material/ListItemText";

/**
 * SongDisplay
 * NOTE: Ici, "setDispDeposits" est volontairement utilisé comme LISTE de dépôts,
 * car c'est la consigne. Pour te simplifier la vie on le renomme en interne "deposits".
 *
 * Chaque dépôt attendu a la forme :
 * {
 *   deposit_date: "2025-08-18T01:23:45+02:00",
 *   song: { title, artist, url, platform_id, img_url },
 *   user: { id, name, profile_pic_url } | null
 * }
 */
export default function SongDisplay({ setDispDeposits: deposits = [], setAchievements }) {
  // État local : ouverture de la modal + dépôt sélectionné
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState(null);

  // Ouvre la modal pour un dépôt
  const handleOpen = (deposit) => {
    setSelected(deposit);
    setOpen(true);
  };

  // Ferme la modal
  const handleClose = () => {
    setOpen(false);
    setSelected(null);
  };

  // URL Spotify : si "song.url" pointe déjà vers Spotify, on l'utilise ; sinon une recherche
  const getSpotifyUrl = (song) => {
    const base = "https://open.spotify.com/search/";
    if (song?.url && song.url.includes("open.spotify.com")) return song.url;
    const q = encodeURIComponent(`${song?.title ?? ""} ${song?.artist ?? ""}`.trim());
    return `${base}${q}`;
  };

  // URL Deezer : si "song.url" est un lien Deezer, on l'utilise ; sinon une recherche
  const getDeezerUrl = (song) => {
    const base = "https://www.deezer.com/search/";
    if (song?.url && song.url.includes("deezer.com")) return song.url;
    const q = encodeURIComponent(`${song?.title ?? ""} ${song?.artist ?? ""}`.trim());
    return `${base}${q}`;
  };

  // Copie "Titre - Artiste" dans le presse-papiers
  const copySongText = async (song) => {
    const text = `${song?.title ?? ""} - ${song?.artist ?? ""}`.trim();
    try {
      await navigator.clipboard.writeText(text);
      alert("Copié dans le presse-papiers !");
    } catch {
      // Fallback très simple
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
    <Box sx={{ width: "100%", maxWidth: 720, mx: "auto" }}>
      {/* Liste des dépôts */}
      <List sx={{ width: "100%" }}>
        {deposits.map((dep, idx) => {
          const img = dep?.song?.img_url || "";
          const title = dep?.song?.title || "Titre inconnu";
          const artist = dep?.song?.artist || "Artiste inconnu";
          const userName = dep?.user?.name || "Anonyme";
          const userAvatar = dep?.user?.profile_pic_url || null;

          return (
            <ListItem key={idx} disableGutters sx={{ mb: 1 }}>
              <Card sx={{ display: "flex", width: "100%" }}>
                {/* Pochette */}
                <CardMedia
                  component="img"
                  image={img || undefined}
                  alt={`${title} - ${artist}`}
                  sx={{
                    width: 96,
                    height: 96,
                    objectFit: "cover",
                    bgcolor: img ? "transparent" : "#f0f0f0",
                  }}
                />

                {/* Infos titre/artiste + user */}
                <Box sx={{ display: "flex", flexDirection: "column", flex: 1 }}>
                  <CardContent sx={{ pb: 1 }}>
                    <Typography component="div" variant="h6" noWrap>
                      {title}
                    </Typography>
                    <Typography variant="subtitle2" color="text.secondary" noWrap>
                      {artist}
                    </Typography>
                  </CardContent>

                  <Box sx={{ display: "flex", alignItems: "center", gap: 1, px: 2, pb: 2 }}>
                    <Avatar src={userAvatar || undefined} alt={userName} sx={{ width: 24, height: 24 }} />
                    <ListItemText
                      primaryTypographyProps={{ variant: "caption" }}
                      primary={userName}
                    />
                  </Box>
                </Box>

                {/* Bouton Options -> ouvre la modal */}
                <Box sx={{ display: "flex", alignItems: "center", pr: 2 }}>
                  <Button variant="outlined" onClick={() => handleOpen(dep)}>
                    Options
                  </Button>
                </Box>
              </Card>
            </ListItem>
          );
        })}
      </List>

      {/* Modal minimaliste (sans Dialog, avec Box) */}
      {open && selected && (
        // Overlay
        <Box
          onClick={handleClose}
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
          {/* Contenu modal */}
          <Card
            onClick={(e) => e.stopPropagation()}
            sx={{ width: "100%", maxWidth: 420, borderRadius: 2 }}
          >
            <CardContent sx={{ pb: 1 }}>
              <Typography variant="h6" gutterBottom noWrap>
                {selected?.song?.title || "Titre"} — {selected?.song?.artist || "Artiste"}
              </Typography>
              <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                Que veux-tu faire ?
              </Typography>

              {/* Boutons d’action */}
              <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap" }}>
                <Button
                  variant="contained"
                  onClick={() => window.open(getSpotifyUrl(selected?.song), "_blank")}
                >
                  Spotify
                </Button>
                <Button
                  variant="contained"
                  onClick={() => window.open(getDeezerUrl(selected?.song), "_blank")}
                >
                  Deezer
                </Button>
                <Button
                  variant="outlined"
                  onClick={() => copySongText(selected?.song)}
                >
                  Copy Link
                </Button>
              </Box>
            </CardContent>

            {/* Bouton fermer */}
            <Box sx={{ display: "flex", justifyContent: "flex-end", p: 2, pt: 0 }}>
              <Button onClick={handleClose}>Fermer</Button>
            </Box>
          </Card>
        </Box>
      )}
    </Box>
  );
}
