// Bottom Sheet "Autoriser la localisation" (full width, fixed bottom)
import React from "react";
import {
  Box,
  Button,
  Typography,
  CircularProgress,
  Stack,
  Drawer,
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
    <Drawer
      anchor="bottom"
      open={open}
      onClose={onClose}
      ModalProps={{
        keepMounted: true,
      }}
      PaperProps={{
        sx: {
          width: "100vw",
          borderTopLeftRadius: 16,
          borderTopRightRadius: 16,
          pb: "env(safe-area-inset-bottom)",
        },
      }}
    >
      <Box sx={{ p: 2 }}>
        <Stack spacing={2} alignItems="center" sx={{ textAlign: "center" }}>
          <Button variant="outlined" disabled>
            {boxTitle}
          </Button>

          <Typography variant="h5" component="h2" sx={{ fontWeight: 700 }}>
            Autoriser la localisation
          </Typography>

          <Typography variant="body1">
            Confirme que tu es bien à côté du spot en partageant ta localisation.
            Elle est utilisée uniquement pour ouvrir la boîte.
          </Typography>

          {error ? (
            <Typography variant="body2" color="error">
              {error}
            </Typography>
          ) : null}

          <Button
            variant="contained"
            color="primary"
            onClick={onAuthorize}
            disabled={loading}
            fullWidth
            sx={{ mt: 1 }}
          >
            {loading ? (
              <Box sx={{ display: "flex", alignItems: "center", gap: 1, justifyContent: "center" }}>
                <CircularProgress size={18} />
                Vérification...
              </Box>
            ) : (
              "Autoriser"
            )}
          </Button>
        </Stack>
      </Box>
    </Drawer>
  );
}
