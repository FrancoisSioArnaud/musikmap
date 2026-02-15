import React from "react";
import Box from "@mui/material/Box";
import List from "@mui/material/List";
import ListItem from "@mui/material/ListItem";
import Typography from "@mui/material/Typography";
import Button from "@mui/material/Button";
import AlbumIcon from "@mui/icons-material/Album";

/**
 * Composant partagé — utilisé par Main et Discover.
 * successes: [{name, desc, points, emoji}, ...] (on masque "total"/"points_total")
 * onPrimaryCta: () => void  (callback du bouton "OK")
 */
export default function AchievementsPanel({ successes = [], onPrimaryCta }) {
  const totalPoints =
    successes.find((s) => (s?.name || "").toLowerCase() === "total")?.points ??
    successes.find((s) => (s?.name || "").toLowerCase() === "points_total")?.points ??
    0;

  const listItems = successes.filter((s) => {
    const n = (s?.name || "").toLowerCase();
    return n !== "total" && n !== "points_total";
  });

  return (
    <Box sx={{ display: "grid", gap: 0, pb: "76px" }}>
      <Box className="intro_small">
        <Typography variant="h1">
          Détail de tes points
        </Typography>

        <Box className="points_container point_container_big" style={{ margin: "12px auto", display:"inline-flex", gap:8, alignItems:"center" }}>
          <Typography component="span" variant="body1">+{totalPoints}</Typography>
          <AlbumIcon />
        </Box>
      </Box>

      <List className="success_container">
        {listItems.map((ach, idx) => (
          <ListItem key={idx} className="success" sx={{ pt: 0, pb: 0 }}>
            {typeof ach.emoji === "string" && ach.emoji.trim() !== "" && (
              <Box className="success_design" sx={{ display: "flex", alignItems: "center", gap: 1, mr: 2 }}>
                <Typography variant="body1" className="success_emoji" aria-label={`emoji ${ach.name}`}>
                  {ach.emoji}
                </Typography>
                <Box className="points_container point_container_big" sx={{ display:"inline-flex", gap:1, alignItems:"center" }}>
                  <Typography component="span" variant="body1">+{ach.points}</Typography>
                  <AlbumIcon />
                </Box>
              </Box>
            )}

            <Box className="success_infos" sx={{ minWidth: 0 }}>
              <Typography variant="h3" className="success_title">
                {ach.name}
              </Typography>
              {ach.desc ? (
                <Typography variant="body1" className="success_desc">
                  {ach.desc}
                </Typography>
              ) : null}
            </Box>
          </ListItem>
        ))}
      </List>
    </Box>
  );
}
