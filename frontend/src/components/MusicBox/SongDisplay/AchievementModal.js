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
          <Box sx={{ display: "grid", gap: 2, minHeight: "100%" }}>
            <Typography variant="h5" sx={{ fontWeight: 700, textAlign: "center" }}>
              Bravo !
            </Typography>
      
            <Box sx={{ textAlign: "center", mt: 1 }}>
              <Typography variant="overline" sx={{ opacity: 0.7 }}>
                Points gagnés
              </Typography>
              <Typography variant="h3" sx={{ fontWeight: 800, lineHeight: 1 }}>
                {totalPoints}
              </Typography>
            </Box>
      
            <Box sx={{ display: "grid", gap: 1 }}>
              {items.length === 0 ? (
                <Typography variant="body2" sx={{ opacity: 0.8, textAlign: "center" }}>
                  Aucun succès détaillé
                </Typography>
              ) : (
                items.map((ach, idx) => (
                  <Box
                    key={idx}
                    sx={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      py: 1,
                      borderBottom: "1px solid",
                      borderColor: "divider",
                    }}
                  >
                    <Box sx={{ pr: 2, minWidth: 0 }}>
                      <Typography variant="subtitle2" noWrap title={ach.name}>
                        {ach.name}
                      </Typography>
                      {ach.desc ? (
                        <Typography variant="caption" sx={{ opacity: 0.8 }} noWrap title={ach.desc}>
                          {ach.desc}
                        </Typography>
                      ) : null}
                    </Box>
                    <Typography variant="body2">+{ach.points}</Typography>
                  </Box>
                ))
              )}
            </Box>
      
            <Box sx={{ mt: "auto" }}>
              <Button fullWidth variant="contained" onClick={onPrimaryCta}>
                Revenir à la boîte
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
