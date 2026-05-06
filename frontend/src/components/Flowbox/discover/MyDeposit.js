import CheckCircleIcon from "@mui/icons-material/CheckCircleRounded";
import MusicNote from "@mui/icons-material/MusicNoteRounded";
import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import React, { useMemo } from "react";

const MY_DEPOSIT_TITLE_ID = "flowbox-my-deposit-title";

function isNamedTotal(success, name) {
  return (success?.name || "").toLowerCase() === name;
}

function toStrictlyPositivePoints(value) {
  const points = Number(value || 0);
  return Number.isFinite(points) && points > 0 ? points : 0;
}

function getTotalPoints(successes) {
  if (!Array.isArray(successes)) {return 0;}
  const total = successes.find((success) => isNamedTotal(success, "total"))
    || successes.find((success) => isNamedTotal(success, "points_total"));
  return toStrictlyPositivePoints(total?.points);
}

export default function MyDeposit({ deposit, successes = [], pointsBalance = null, onOpenAchievements }) {
  const song = deposit?.song || null;
  const accentColor = deposit?.accent_color || undefined;
  const totalPoints = useMemo(() => getTotalPoints(successes), [successes]);
  const canOpenAchievements = totalPoints > 0 && typeof onOpenAchievements === "function";

  if (!deposit) {return null;}

  const handlePointsKeyDown = (event) => {
    if (!canOpenAchievements) {return;}
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      onOpenAchievements();
    }
  };

  return (
    <Box
      component="section"
      className="my_deposit_notif"
      data-testid="my-deposit"
      aria-labelledby={MY_DEPOSIT_TITLE_ID}
    >
      <Box sx={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 1 }}>
        <CheckCircleIcon fontSize="medium" />
        <Typography id={MY_DEPOSIT_TITLE_ID} component="h2" variant="h5">
          Chanson déposée avec succès
        </Typography>
      </Box>

      {song ? (
        <Box
          className={`my_deposit deposit deposit_song${accentColor ? " has_accent_color" : ""}`}
          style={accentColor ? { "--deposit-accent": accentColor } : undefined}
        >
          <Box className="img_container">
            {song?.image_url ? (
              <Box
                component="img"
                src={song.image_url}
                alt={song?.title || "Cover"}
                sx={{
                  width: "100%",
                  height: "100%",
                  objectFit: "cover",
                  display: "block",
                }}
              />
            ) : null}
          </Box>

          <Box className="texts">
            <Typography variant="h5" component="span" title={song?.title || ""} className="titre">
              {song?.title || ""}
            </Typography>
            <Typography variant="body1" component="span" title={song?.artist || ""} className="artist">
              {song?.artist || ""}
            </Typography>
          </Box>

          {totalPoints > 0 ? (
            <Box
              className="points_container vertical"
              style={{ margin: "0 auto" }}
              onClick={canOpenAchievements ? onOpenAchievements : undefined}
              role={canOpenAchievements ? "button" : undefined}
              tabIndex={canOpenAchievements ? 0 : undefined}
              onKeyDown={handlePointsKeyDown}
              aria-label={canOpenAchievements ? `Voir les réussites, ${totalPoints} points gagnés` : undefined}
              data-points-balance={pointsBalance ?? undefined}
            >
              <MusicNote />
              <Typography component="span" variant="body1">
                +{totalPoints}
              </Typography>
            </Box>
          ) : null}
        </Box>
      ) : null}
    </Box>
  );
}
