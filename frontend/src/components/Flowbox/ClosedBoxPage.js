import LockIcon from "@mui/icons-material/LockRounded";
import PersonIcon from "@mui/icons-material/PersonRounded";
import QrCodeScannerIcon from "@mui/icons-material/QrCodeScannerRounded";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Typography from "@mui/material/Typography";
import React, { useContext } from "react";
import { Link, useParams } from "react-router-dom";

import { FlowboxSessionContext } from "./runtime/FlowboxSessionContext";

export default function ClosedBoxPage() {
  const { boxSlug } = useParams();
  const { getBoxRuntime } = useContext(FlowboxSessionContext);
  const runtime = getBoxRuntime(boxSlug);
  const boxName = runtime?.box?.name || "cette boîte";

  return (
    <Box sx={{ minHeight: "calc(100vh - 56px)", display: "grid", placeItems: "center", p: 4 }}>
      <Box sx={{ width: "100%", maxWidth: 520, textAlign: "center", display: "grid", gap: 3 }}>
        <Box sx={{ display: "grid", gap: 1, justifyItems: "center" }}>
          <LockIcon fontSize="large" />
          <Typography component="h1" variant="h3">
            La boîte est refermée
          </Typography>
          <Typography component="p" variant="body1">
            Ton temps d’exploration est terminé. Pour rouvrir cette boîte, scanne à nouveau son QR code sur place.
          </Typography>
        </Box>

        <Button variant="contained" component={Link} to="/" startIcon={<QrCodeScannerIcon />}>
          Scanner une boîte
        </Button>

        <Button variant="light" component={Link} to="/profile" startIcon={<PersonIcon />}>
          Voir mon profil
        </Button>
      </Box>
    </Box>
  );
}
