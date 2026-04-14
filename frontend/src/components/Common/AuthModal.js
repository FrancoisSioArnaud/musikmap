import React from "react";
import Box from "@mui/material/Box";
import useMediaQuery from "@mui/material/useMediaQuery";
import { useTheme } from "@mui/material/styles";
import AuthPanel from "./AuthPanel";

export default function AuthModal(props) {
  const theme = useTheme();
  const fullScreen = useMediaQuery(theme.breakpoints.down("sm"));

  return (
    <Box open={props.open} onClose={props.onClose} fullScreen={fullScreen} maxWidth="sm" fullWidth sx={{ p:"20px"}}>
      <AuthPanel {...props} mode="modal" />
    </Box>
  );
}
