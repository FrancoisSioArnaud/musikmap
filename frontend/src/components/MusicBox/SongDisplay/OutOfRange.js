// Présentationnel : Dialog "Hors de portée"
import React from "react";
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Box,
  Button,
  Typography,
  Stack,
} from "@mui/material";

export default function OutOfRange({
  open,
  boxTitle = "Boîte",
  error = "",
  onRetry,
  onClose,
}) {
  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="xs">
      <DialogTitle sx={{ textAlign: "center" }}>
        <Typography variant="h6" component="h2" sx={{ fontWeight: 700 }}>
          Rapproche-toi de la boîte pour voir son contenu
        </Typography>
      </DialogTitle>

      <DialogContent>
        <Stack spacing={2} alignItems="center" sx={{ textAlign: "center", pt: 1 }}>
          <Button variant="outlined" disabled>
            {boxTitle}
          </Button>

          {error ? (
            <Typography variant="body2" color="error">
              {error}
            </Typography>
          ) : null}
        </Stack>
      </DialogContent>

      <DialogActions sx={{ px: 3, pb: 2 }}>
        <Box sx={{ display: "flex", gap: 1, width: "100%", justifyContent: "center" }}>
          <Button
            variant="outlined"
            href=""
            onClick={(e) => e.preventDefault()}
          >
            Voir la box sur la carte
          </Button>
          <Button variant="contained" onClick={onRetry}>
            Réessayer
          </Button>
        </Box>
      </DialogActions>
    </Dialog>
  );
}
