import MusicNote from "@mui/icons-material/MusicNote";
import PlayArrowIcon from "@mui/icons-material/PlayArrow";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import CircularProgress from "@mui/material/CircularProgress";
import Typography from "@mui/material/Typography";
import React, { useCallback, useEffect, useRef, useState } from "react";

import PlayModal from "../../PlayModal";

const HOLD_TO_REVEAL_MS = 1200;

function evaluateCubicBezier(progress, x1, y1, x2, y2) {
  const clampedProgress = Math.min(Math.max(progress, 0), 1);

  if (clampedProgress === 0 || clampedProgress === 1) {
    return clampedProgress;
  }

  const sampleCurve = (a1, a2, t) => {
    const mt = 1 - t;
    return (3 * a1 * mt * mt * t) + (3 * a2 * mt * t * t) + (t * t * t);
  };

  let lower = 0;
  let upper = 1;
  let t = clampedProgress;

  for (let index = 0; index < 12; index += 1) {
    const x = sampleCurve(x1, x2, t);

    if (Math.abs(x - clampedProgress) < 0.0005) {
      break;
    }

    if (x < clampedProgress) {
      lower = t;
    } else {
      upper = t;
    }

    t = (lower + upper) / 2;
  }

  return sampleCurve(y1, y2, t);
}

function getPlaySongKey(currentSong) {
  if (!currentSong) {return "";}

  return [
    currentSong?.public_key,
    currentSong?.provider_links?.spotify?.provider_url,
    currentSong?.provider_links?.deezer?.provider_url,
    currentSong?.spotify_url,
    currentSong?.deezer_url,
    currentSong?.title,
    currentSong?.artist,
  ]
    .filter(Boolean)
    .join("|");
}

export default function DepositSong({
  className = "",
  variant = "list",
  song,
  accentColor,
  isRevealed,
  floatingEmojiItems = [],
  onFloatingReactionClick,
  onRevealRequest,
  onSongResolved,
  revealCost,
}) {
  const [playOpen, setPlayOpen] = useState(false);
  const [playSong, setPlaySong] = useState(null);
  const [holdProgress, setHoldProgress] = useState(0);
  const [isHoldingReveal, setIsHoldingReveal] = useState(false);
  const [isRevealLoading, setIsRevealLoading] = useState(false);
  const revealHoldFrameRef = useRef(null);
  const revealHoldStartRef = useRef(null);
  const revealHoldTriggeredRef = useRef(false);

  const closePlay = useCallback(() => {
    setPlayOpen(false);
    setPlaySong(null);
  }, []);

  const openPlayFor = useCallback((nextSong) => {
    const songToPlay = nextSong || null;
    const nextKey = getPlaySongKey(songToPlay);
    const currentKey = getPlaySongKey(playSong);

    if (playOpen && nextKey && nextKey === currentKey) {
      closePlay();
      return;
    }

    setPlaySong(songToPlay);
    setPlayOpen(Boolean(songToPlay));
  }, [closePlay, playOpen, playSong]);

  const stopRevealHoldAnimation = useCallback(() => {
    if (revealHoldFrameRef.current) {
      window.cancelAnimationFrame(revealHoldFrameRef.current);
      revealHoldFrameRef.current = null;
    }
  }, []);

  const resetRevealHold = useCallback(() => {
    stopRevealHoldAnimation();
    revealHoldStartRef.current = null;
    revealHoldTriggeredRef.current = false;
    setIsHoldingReveal(false);
    setHoldProgress(0);
  }, [stopRevealHoldAnimation]);

  const beginRevealHold = useCallback((event) => {
    if (isRevealed || isRevealLoading || isHoldingReveal) {
      return;
    }

    event?.preventDefault?.();
    event?.stopPropagation?.();

    revealHoldTriggeredRef.current = false;
    revealHoldStartRef.current = performance.now();
    setHoldProgress(0);
    setIsHoldingReveal(true);

    const tick = (now) => {
      if (!revealHoldStartRef.current) {
        return;
      }

      const linearProgress = Math.min((now - revealHoldStartRef.current) / HOLD_TO_REVEAL_MS, 1);
      const progress = evaluateCubicBezier(linearProgress, 0, 0.94, 1, 0.49);
      setHoldProgress(progress);

      if (linearProgress >= 1) {
        revealHoldTriggeredRef.current = true;
        stopRevealHoldAnimation();
        revealHoldStartRef.current = null;
        setIsHoldingReveal(false);
        setHoldProgress(1);
        setIsRevealLoading(true);
        Promise.resolve(onRevealRequest?.())
          .catch(() => false)
          .finally(() => {
            setIsRevealLoading(false);
            setHoldProgress(0);
          });
        return;
      }

      revealHoldFrameRef.current = window.requestAnimationFrame(tick);
    };

    stopRevealHoldAnimation();
    revealHoldFrameRef.current = window.requestAnimationFrame(tick);
  }, [isHoldingReveal, isRevealLoading, isRevealed, onRevealRequest, stopRevealHoldAnimation]);

  const endRevealHold = useCallback((event) => {
    event?.preventDefault?.();
    event?.stopPropagation?.();

    if (revealHoldTriggeredRef.current || isRevealLoading) {
      return;
    }

    resetRevealHold();
  }, [isRevealLoading, resetRevealHold]);

  useEffect(() => () => {
    stopRevealHoldAnimation();
  }, [stopRevealHoldAnimation]);

  useEffect(() => {
    if (isRevealed) {
      resetRevealHold();
      setIsRevealLoading(false);
    }
  }, [isRevealed, resetRevealHold]);

  const renderFloatingReactions = () => {
    if (!floatingEmojiItems.length) {return null;}

    return (
      <Box className={`emojis${isRevealed ? " is_revealed" : ""}`}>
        {floatingEmojiItems.map((item) => (
          <Box
            key={item.key}
            className={`emoji_shell edge_${item.edge || "right"}`}
            sx={{
              left: `${item.left}%`,
              top: `${item.top}%`,
              "--emoji-target-left": `${item.targetLeft}%`,
              "--emoji-target-top": `${item.targetTop}%`,
              "--emoji-settle-duration": item.settleDuration,
              "--emoji-settle-delay": item.settleDelay,
              zIndex: item.zIndex,
              opacity: item.opacity,
            }}
            onClick={onFloatingReactionClick}
            onKeyDown={(event) => {
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                onFloatingReactionClick?.(event);
              }
            }}
            role="button"
            tabIndex={0}
          >
            <Typography
              className="emoji"
              component="span"
              sx={{
                fontSize: item.fontSize,
                "--float-duration": item.floatDuration,
                "--float-delay": item.floatDelay,
                "--x1": item.x1,
                "--y1": item.y1,
                "--x2": item.x2,
                "--y2": item.y2,
                "--x3": item.x3,
                "--y3": item.y3,
                "--x4": item.x4,
                "--y4": item.y4,
                "--rot-max": item.rotMax,
                "--scale-min": item.scaleMin,
                "--scale-max": item.scaleMax,
              }}
            >
              {item.emoji}
            </Typography>
          </Box>
        ))}
      </Box>
    );
  };

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
      className={`${className ? `${className} ` : ""}deposit_song${accentColor ? " has_accent_color" : ""}${isRevealed ? "" : " is_hidden"}${isHoldingReveal ? " is_reveal_holding" : ""}${isRevealLoading ? " is_reveal_loading" : ""}`}
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
          <PlayModal open={playOpen} song={playSong} onClose={closePlay} onSongResolved={onSongResolved}>
            <Button
              variant="depositInteract"
              className={variant === "main" ? "play playMain" : "play playSecondary"}
              size="large"
              onClick={() => openPlayFor(song)}
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
