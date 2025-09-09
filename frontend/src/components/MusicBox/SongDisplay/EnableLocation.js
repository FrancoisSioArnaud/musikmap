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
        },
      }}
      className="modal modal_loc"
    >
      <Box>
        <Stack>
          <Box className="intro">
            <Box className="icon squaredesign" >
            </Box>
            <Typography className="squaredesign" variant="subtitle1" component="span">
              {boxTitle}
            </Typography>
          </Box>

          <Typography variant="h3" component="h1">
            Localisation
          </Typography>

          <Typography variant="body1">
            Pour éviter les tricheurs, les boîtes ne peuvent être ouvertes qu’en étant sur place.
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

