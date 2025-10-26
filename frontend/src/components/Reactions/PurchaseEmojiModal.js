import React, { useState } from "react";
import Box from "@mui/material/Box";
import Card from "@mui/material/Card";
import CardContent from "@mui/material/CardContent";
import Typography from "@mui/material/Typography";
import Button from "@mui/material/Button";
import CircularProgress from "@mui/material/CircularProgress";
import AlbumIcon from "@mui/icons-material/Album";
import { getCookie } from "../Security/TokensUtils";

export default function PurchaseEmojiModal({ open, emoji, onCancel, onUnlocked }) {
  const [loading, setLoading] = useState(false);

  if (!open || !emoji) return null;

  const unlock = async () => {
    setLoading(true);
    const csrftoken = getCookie("csrftoken");
    const res = await fetch("/box-management/emojis/purchase", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-CSRFToken": csrftoken },
      credentials: "same-origin",
      body: JSON.stringify({ emoji_id: emoji.id }),
    });
    const data = await res.json().catch(() => ({}));
    setLoading(false);

    if (!res.ok) {
      if (data?.error === "insufficient_funds") {
        alert("Tu n’as pas assez de points pour débloquer cet emoji.");
      } else {
        alert("Oops, impossible de débloquer cet emoji pour le moment.");
      }
      return;
    }

    onUnlocked?.({ emoji, points_balance: data?.points_balance });
  };

  return (
    <Box onClick={onCancel} sx={{ position: "fixed", inset: 0, bgcolor: "rgba(0,0,0,0.35)", display: "flex", alignItems: "center", justifyContent: "center", p: 4, zIndex: 1400 }}>
      <Box onClick={(e) => e.stopPropagation()} sx={{ width: "100%", maxWidth: 480 }}>
        <Card sx={{ borderRadius: "16px" }}>
          <CardContent sx={{display: "grid", gap: "12px"}}>
            <Typography component="h1" variant="h1" sx={{ mb: 1 }}>
              Débloquer l’emoji {emoji?.char || ""}
            </Typography>



            <Typography variant="body1" sx={{ mb: 2 }}>
              Débloque cet emoji et utilise-le pour réagir à des chansons.
            </Typography>

            <Box sx={{ display: "flex", gap: "16px", flexDirection: "column-reverse" }}>
              <Button variant="outlined" fullWidth disabled={loading} onClick={onCancel}>Annuler</Button>
              <Button variant="contained" fullWidth disabled={loading} onClick={unlock} sx={{display: "flex", flexDirection: "row",justifyContent: "space-between"}}>
                {loading ? <CircularProgress size={18} /> : "Débloquer"}
                {/* Cost */}
                <Box className="points_container" sx={{ display: "inline-flex", alignItems: "center", gap: 0.75}}>
                  <Typography variant="body1" component="span" sx={{ color: "text.primary" }}>
                    {emoji?.cost ?? 0}
                  </Typography>
                  <AlbumIcon />
                </Box>
              </Button>
            </Box>
          </CardContent>
        </Card>
      </Box>
    </Box>
  );
}
