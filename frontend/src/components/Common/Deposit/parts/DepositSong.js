import MusicNote from "@mui/icons-material/MusicNote";
import PlayArrowIcon from "@mui/icons-material/PlayArrow";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import CircularProgress from "@mui/material/CircularProgress";
import Typography from "@mui/material/Typography";
import React from "react";

import PlayModal from "../../PlayModal";

export default function DepositSong({
  variant = "list",
  song,
  accentColor,
  isRevealed,
  isHoldingReveal,
  isRevealLoading,
  holdProgress,
  renderFloatingReactions,
  playOpen,
  playSong,
  closePlay,
  handleSongResolved,
  openPlayFor,
  beginRevealHold,
  endRevealHold,
  revealCost,
}) {
  const renderCoverMedia = (blurred = false) => (
    <Box className="cover_media">
      <Box className="img_container">
        {song?.image_url ? (
          <Box
            component="img"
            className={`cover_image${blurred ? " is_blurred" : ""}`}
            src={song.image_url}
            alt={isRevealed ? `${song.title} - ${song.artist}` : "Cover"}
          />
        ) : null}
      </Box>
      {renderFloatingReactions?.()}
    </Box>
  );

  return (
    <Box
      className={`deposit_song${accentColor ? " has_accent_color" : ""}${isRevealed ? "" : " is_hidden"}${isHoldingReveal ? " is_reveal_holding" : ""}${isRevealLoading ? " is_reveal_loading" : ""}`}
      style={{
        ...(accentColor ? { "--deposit-accent": accentColor } : {}),
        ...(isRevealed ? {} : { "--deposit-reveal-progress": holdProgress }),
      }}
    >
      {!isRevealed ? <Box className="deposit_reveal_fill" aria-hidden="true" /> : null}
      {renderCoverMedia(!isRevealed)}

      <Box className="interact">
        {isRevealed ? (
          <Box className="texts">
            <Typography component="span" className="titre" variant={variant === "main" ? "h4" : "h5"}>
              {song?.title}
            </Typography>
            <Typography component="span" className="artist" variant="body1">
              {song?.artist}
            </Typography>
          </Box>
        ) : null}

        {isRevealed ? (
          <PlayModal open={playOpen} song={playSong} onClose={closePlay} onSongResolved={handleSongResolved}>
            <Button
              variant="depositInteract"
              className={variant === "main" ? "play playMain" : "play playSecondary"}
              size="large"
              onClick={() => openPlayFor?.(song)}
              startIcon={<PlayArrowIcon />}
            >
              Écouter
            </Button>
          </PlayModal>
        ) : (
          <Button
            variant="depositInteract"
            className="decouvrir"
            disabled={isRevealLoading}
            onPointerDown={beginRevealHold}
            onPointerUp={endRevealHold}
            onPointerCancel={endRevealHold}
            onPointerLeave={endRevealHold}
            onContextMenu={(event) => event.preventDefault()}
            sx={{ touchAction: "none" }}
            startIcon={isRevealLoading ? <CircularProgress size={18} thickness={5} color="inherit" /> : null}
          >
            {isRevealLoading ? "Révélation..." : "Maintiens pour révéler la chanson"}
            <Box className="points_container" sx={{ ml: "12px" }}>
              <Typography variant="body1" component="span" sx={{ color: "text.primary" }}>
                {revealCost}
              </Typography>
              <MusicNote />
            </Box>
          </Button>
        )}
      </Box>
    </Box>
  );
}