// Présentationnel : Dialog "Autoriser la localisation"
import React from "react";
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Box,
  Button,
  Typography,
  CircularProgress,
  Stack,
} from "@mui/material";

export default function EnableLocation({
  open,
  boxTitle = "Boîte",
  loading = false,
  error = "",
  onAuthorize,
  onClose,
}) {
  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="xs">
      <DialogTitle sx={{ textAlign: "center" }}>
        <Typography variant="h5" component="h2" sx={{ fontWeight: 700 }}>
          Autoriser la localisation
        </Typography>
      </DialogTitle>

      <DialogContent>
        <Stack spacing={2} alignItems="center" sx={{ textAlign: "center", pt: 1 }}>
          <Button variant="outlined" disabled>
            {boxTitle}
          </Button>

          <Typography variant="body1">
            Confirme que tu es bien à côté du spot en partageant ta localisation.
            Elle est utilisée uniquement pour ouvrir la boîte.
          </Typography>

          {error ? (
            <Typography variant="body2" color="error">
              {error}
            </Typography>
          ) : null}
        </Stack>
      </DialogContent>

      <DialogActions sx={{ px: 3, pb: 2 }}>
        <Box sx={{ width: "100%" }}>
          <Button
            variant="contained"
            color="primary"
            onClick={onAuthorize}
            disabled={loading}
            fullWidth
          >
            {loading ? (
              <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                <CircularProgress size={18} />
                Vérification...
              </Box>
            ) : (
              "Autoriser"
            )}
          </Button>
        </Box>
      </DialogActions>
    </Dialog>
  );
}
