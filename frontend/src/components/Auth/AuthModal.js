import Dialog from "@mui/material/Dialog";
import { useTheme } from "@mui/material/styles";
import useMediaQuery from "@mui/material/useMediaQuery";
import React from "react";

import AuthPanel from "./AuthPanel";

export default function AuthModal(props) {
  const theme = useTheme();
  const fullScreen = useMediaQuery(theme.breakpoints.down("sm"));

  return (
    <Dialog open={props.open} onClose={props.onClose} fullScreen={fullScreen} maxWidth="sm" fullWidth>
      <AuthPanel {...props} mode="modal" />
    </Dialog>
  );
}
