import KeyIcon from "@mui/icons-material/KeyRounded";
import LockIcon from "@mui/icons-material/LockRounded";
import {
  Box,
  Button,
  Typography,
  CircularProgress,
  Drawer,
} from "@mui/material";
import React from "react";

export default function EnableLocation({
  open,
  boxTitle = "Boîte",
  loading = false,
  onAuthorize,
  onClose,
}) {
  return (
    <Drawer
      anchor="bottom"
      open={open}
      onClose={loading ? undefined : onClose}
      ModalProps={{ keepMounted: true }}
      PaperProps={{ sx: { backgroundColor: "unset" } }}
    >
      <Box className="info_box">
        <LockIcon />
        <Typography variant="subtitle1" component="span">
          {boxTitle}
        </Typography>
      </Box>
      <Box
        className="modal modal_loc"
        sx={{ padding: "20px", display: "grid", gap: "20px", backgroundColor: "white" }}
      >
        <Box sx={{ display: "grid", gap: "16px", textAlign: "center" }}>
          <Typography variant="h3" component="h1">
            Vérifie que tu es près de la boîte
          </Typography>

          <Typography variant="body1">
            Cette boîte est liée à un lieu précis. On utilise ta position uniquement pour vérifier que tu es sur place.
          </Typography>

          <Button
            variant="contained"
            color="primary"
            onClick={onAuthorize}
            disabled={loading}
            fullWidth
            startIcon={!loading ? <KeyIcon /> : null}
          >
            {loading ? (
              <Box sx={{ display: "flex", alignItems: "center", gap: 1, justifyContent: "center" }}>
                <CircularProgress size={18} />
                Vérification...
              </Box>
            ) : (
              "Autoriser la localisation"
            )}
          </Button>
        </Box>
      </Box>
    </Drawer>
  );
}
