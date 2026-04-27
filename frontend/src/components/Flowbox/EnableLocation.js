import KeyIcon from "@mui/icons-material/Key";
import LockIcon from "@mui/icons-material/Lock";
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
            Ouvre la boîte grâce à ta localisation
          </Typography>

          <Typography variant="body1">
            Pour éviter la triche, la boîte s’ouvre seulement si tu es sur place.
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
              "Autoriser"
            )}
          </Button>
        </Box>
      </Box>
    </Drawer>
  );
}
