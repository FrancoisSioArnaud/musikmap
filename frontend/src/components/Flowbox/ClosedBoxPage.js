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
    <Box sx={{ minHeight: "calc(100vh - var(--mm-app-header-height, 56px))", display: "grid", placeItems: "center", p: 4 }}>
      <Box sx={{ width: "100%", maxWidth: 520, textAlign: "center", display: "grid", gap: 3 }}>
        <Box sx={{ display: "grid", gap: 1, justifyItems: "center" }}>
          <LockIcon fontSize="large" />
          <Typography component="h1" variant="h3">
            Ton temps dans la boîte est terminé
          </Typography>
          <Typography component="p" variant="body1">
            {`La boîte ${boxName} s’est refermée. Pour y entrer à nouveau, scanne une boîte près de toi.`}
          </Typography>
        </Box>

        <Button variant="contained" component={Link} to="/" startIcon={<QrCodeScannerIcon />}>
          Scanner une boîte
        </Button>

        <Button variant="light" component={Link} to="/profile" startIcon={<PersonIcon />}>
          Aller sur mon profil
        </Button>
      </Box>
    </Box>
  );
}
