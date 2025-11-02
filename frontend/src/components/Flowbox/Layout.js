// frontend/src/components/Flowbox/Layout.jsx
import React from "react";
import { Outlet, NavLink, useParams, ScrollRestoration } from "react-router-dom";
import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";

export default function FlowboxLayout() {
  const { boxSlug } = useParams();

  // TODO: fetch des infos de la box via boxSlug (useEffect + state)
  // TODO: guards (si box introuvable → redirection, etc.)

  return (
    <Box sx={{ }}>
      <Typography variant="h5" sx={{  }}>
        Flowbox — {boxSlug}
      </Typography>



      <Outlet />
      <ScrollRestoration />
    </Box>
  );
}
