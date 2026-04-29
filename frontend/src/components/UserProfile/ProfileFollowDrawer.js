import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import CircularProgress from "@mui/material/CircularProgress";
import Drawer from "@mui/material/Drawer";
import Typography from "@mui/material/Typography";
import React from "react";

import UserInline from "../Common/UserInline";
import FollowButton from "./FollowButton";

export default function ProfileFollowDrawer({ open, mode, items, loading, error, onClose, onToggleFollow, currentUserId }) {
  const title = mode === "following" ? "Abonnements" : "Abonnés";
  const emptyText = mode === "following" ? "Aucun abonnement pour l’instant" : "Aucun abonné pour l’instant";

  return (
    <Drawer anchor="right" open={open} onClose={onClose} PaperProps={{ sx: { width: "100vw", maxWidth: "100vw", height: "100vh" } }}>
      <Box sx={{ p: 2, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <Typography variant="h6">{title}</Typography>
        <Button onClick={onClose}>Fermer</Button>
      </Box>
      <Box sx={{ p: 2 }}>
        {error ? <Alert severity="error">{error}</Alert> : null}
        {loading ? (
          <Box sx={{ display: "flex", justifyContent: "center", py: 4 }}><CircularProgress /></Box>
        ) : null}
        {!loading && !error && items.length === 0 ? <Typography>{emptyText}</Typography> : null}
        {!loading && !error ? items.map((item) => (
          <Box key={item.id} sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", py: 1 }}>
            <Box sx={{ flex: 1, minWidth: 0 }}><UserInline user={item} /></Box>
            {currentUserId && item.id === currentUserId ? (
              <Typography variant="body2">Toi</Typography>
            ) : (
              <FollowButton isFollowed={Boolean(item.is_followed_by_me)} loading={Boolean(item._loading)} onClick={() => onToggleFollow?.(item)} />
            )}
          </Box>
        )) : null}
      </Box>
    </Drawer>
  );
}
