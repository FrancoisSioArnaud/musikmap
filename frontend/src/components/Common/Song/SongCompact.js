import MusicNoteIcon from "@mui/icons-material/MusicNote";
import PlayArrowIcon from "@mui/icons-material/PlayArrow";
import Box from "@mui/material/Box";
import IconButton from "@mui/material/IconButton";
import Typography from "@mui/material/Typography";
import React, { useMemo, useState } from "react";

import PlayModal from "../PlayModal";

function getArtistText(song) {
  if (song?.artist) {return song.artist;}
  if (Array.isArray(song?.artists)) {return song.artists.filter(Boolean).join(", ");}
  return "";
}

function getCoverUrl(song) {
  return song?.image_url_small || song?.image_url || "";
}

export default function SongCompact({
  song,
  playButton = "icon",
  coverSize = 48,
  className = "",
  onSongResolved,
}) {
  const [playOpen, setPlayOpen] = useState(false);

  const artistText = useMemo(() => getArtistText(song), [song]);
  const coverUrl = useMemo(() => getCoverUrl(song), [song]);

  if (!song) {return null;}

  return (
    <Box
      className={["song_compact", className].filter(Boolean).join(" ")}
      sx={{
        display: "flex",
        alignItems: "center",
        width: "100%",
        gap: "12px",
        minWidth: 0,
      }}
    >
      <Box
        sx={{
          width: coverSize,
          height: coverSize,
          borderRadius: "var(--mm-radius-sm)",
          overflow: "hidden",
          backgroundColor: "var(--mm-color-primary-light)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          flex: "0 0 auto",
        }}
      >
        {coverUrl ? (
          <Box
            component="img"
            src={coverUrl}
            alt={song?.title || "Pochette"}
            sx={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
          />
        ) : (
          <MusicNoteIcon sx={{ color: "var(--mm-color-primary)" }} />
        )}
      </Box>

      <Box sx={{ minWidth: 0, flex: 1, display: "flex", flexDirection: "column", gap: 0.25 }}>
        <Typography
          variant="body1"
          sx={{
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {song?.title || "Chanson sans titre"}
        </Typography>
        <Typography
          variant="body2"
          sx={{
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
            opacity : "var(--mm-opacity-light-text)",
          }}
        >
          {artistText || "Artiste inconnu"}
        </Typography>
      </Box>

      {playButton === "icon" ? (
        <PlayModal
          open={playOpen}
          song={song}
          onClose={() => setPlayOpen(false)}
          onSongResolved={onSongResolved}
        >
          <IconButton
            size="small"
            aria-label="Écouter"
            onClick={() => setPlayOpen((prev) => !prev)}
            sx={{ flex: "0 0 auto", backgroundColor: "var(--mm-color-primary)" }}
          >
            <PlayArrowIcon sx={{ color: "white" }} />
          </IconButton>
        </PlayModal>
      ) : null}
    </Box>
  );
}
