//frontend/src/components/Flowbox/EnableLocation.js

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
import KeyIcon from '@mui/icons-material/Key';

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
      
    >
      <Box className="modal modal_loc" sx={{padding: "16px", display: "grid", gap: "12px"}}>
        
          <Typography className="intro_small squaredesign" variant="subtitle1" component="span">
            {boxTitle}
          </Typography>
        <Box sx={{display:"grid", gap:"4px"}}>
          <Typography variant="h3" component="h1">
            Localisation
          </Typography>
    
          <Typography variant="body1">
            Tu dois être sur place pour ouvrir la boîte. Cela évite la triche. Autorise l’accès à ta localisation. Nous vérifions que tu es près de la boîte.
          </Typography>
        </Box>
        {error ? (
          <Typography variant="body1" color="error">
            {error}
          </Typography>
        ) : null}
  
        <Button
          variant="contained"
          color="primary"
          onClick={onAuthorize}
          disabled={loading}
          fullWidth
          startIcon={<KeyIcon />}
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
    </Drawer>
  );
}








