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
import LockIcon from '@mui/icons-material/Lock';

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
      <Box className="modal modal_loc" sx={{padding: "20px", display: "grid", gap: "20px"}}>
        <Box className="locked_box">  
          <LockIcon />
          <Typography variant="subtitle1" component="span">
            {boxTitle}
          </Typography>
        </Box>
        <Box sx={{display:"grid", gap:"8px"}}>
          <Typography variant="h3" component="h1">
            Ouvre la boîte grâce à ta localisation
          </Typography>
    
          <Typography variant="body1">
            Pour éviter la triche, la boîte s’ouvre seulement si tu es sur place. 
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




