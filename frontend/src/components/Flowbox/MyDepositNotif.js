import CheckCircleIcon from "@mui/icons-material/CheckCircleRounded";
import KeyboardArrowDownIcon from "@mui/icons-material/KeyboardArrowDownRounded";
import MusicNote from "@mui/icons-material/MusicNoteRounded";
import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import React from "react";

export default function MyDepositNotif({ deposit, points = 0, showPoints = true, onPointsClick }) {
  const song = deposit?.song || null;
  const accent = deposit?.accent_color || undefined;
  return (
    <Box className="my_deposit_notif">
      <Box sx={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 1 }}>
        <CheckCircleIcon fontSize="medium" />
        <Typography component="h2" variant="h5">Chanson déposée avec succès</Typography>
      </Box>
      {song ? <Box className={`my_deposit deposit deposit_song${accent ? " has_accent_color" : ""}`} style={accent ? { "--deposit-accent": accent } : undefined}><Box className="img_container">{song?.image_url ? <Box component="img" src={song.image_url} alt={song.title || ""} /> : <MusicNote />}</Box><Box className="song_infos"><Typography variant="subtitle1" component="h3">{song.title || "Chanson"}</Typography><Typography variant="body2">{song.artist || "Artiste inconnu"}</Typography></Box></Box> : null}
      {showPoints ? <Box className="points_badge" onClick={onPointsClick} role="button" sx={{ cursor: "pointer" }}><Typography variant="body2">+{points} points</Typography><KeyboardArrowDownIcon fontSize="small" /></Box> : null}
    </Box>
  );
}
