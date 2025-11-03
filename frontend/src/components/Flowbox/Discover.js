import React from "react";
import { useParams } from "react-router-dom";
import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";

export default function Discover() {
  const { boxSlug } = useParams();

  return (
    <Box
    >
      <Typography variant="h4" component="h1" gutterBottom>
        Découvrir la boîte : {boxSlug}
      </Typography>
      <Typography variant="body1">
        Ici, tu affiches le contenu ou la suite du flow (Discover).
      </Typography>
    </Box>
  );
}
