import React, { useMemo } from "react";
import Box from "@mui/material/Box";
import Card from "@mui/material/Card";
import CardContent from "@mui/material/CardContent";
import Typography from "@mui/material/Typography";
import Button from "@mui/material/Button";
import List from "@mui/material/List";
import ListItem from "@mui/material/ListItem";
import ListItemText from "@mui/material/ListItemText";
import CheckIcon from '@mui/icons-material/Check';

/**
 * successes: Array<{ name, desc, points }>
 * Total est toujours présent (d’après specs).
 */
export default function AchievementModal({ open, successes = [], onClose, primaryCtaLabel = "Revenir à la boîte" }) {
  if (!open) return null;

  const totalPoints = useMemo(() => {
    const item = successes.find((s) => (s?.name || "").toLowerCase() === "total");
    return item?.points ?? 0;
  }, [successes]);

  const listItems = useMemo(
    () => successes.filter((s) => (s?.name || "").toLowerCase() !== "total"),
    [successes]
  );

  return (
    <Overlay onClose={onClose}>
      <Card sx={{ width: "100%", maxWidth: 520, borderRadius: 2 }}>
        <CardContent sx={{ pb: 2 }}>
          <Box sx={{ display: "grid", gap: 1 }}>
            <CheckIcon color="success" />
            <Typography variant="h1">
              Pépite Déposé
            </Typography>

              <Typography variant="h3">
                {totalPoints}
              </Typography>

            <List dense sx={{ mt: 1 }}>
              {listItems.length === 0 ? (
                <ListItem>
                  <ListItemText primary="Aucun succès détaillé" />
                </ListItem>
              ) : (
                listItems.map((ach, idx) => (
                  <ListItem key={idx}>
                    <Typography variant="h3">+{ach.name}</Typography>
                    <Typography variant="subtitle1">+{ach.desc}</Typography>
                    <Typography variant="body2">+{ach.points}</Typography>
                  </ListItem>
                ))
              )}
            </List>

            <Box sx={{ mt: 1 }}>
              <Button fullWidth variant="contained" onClick={onClose}>
                {primaryCtaLabel}
              </Button>
            </Box>
          </Box>
        </CardContent>
      </Card>
    </Overlay>
  );
}

function Overlay({ children, onClose }) {
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
        {children}
      </Box>
    </Box>
  );
}
