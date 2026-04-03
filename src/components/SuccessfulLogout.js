import * as React from "react";
import { useNavigate } from "react-router-dom";
import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import Button from "@mui/material/Button";

export default function SuccessfulLogout() {
  // States & Variables
  const navigate = useNavigate();

  return (
    <Box
      sx={{
        backgroundImage: "linear-gradient(to right, #fa9500, #fa4000)",
        height: "100vh",
        display: "flex",
        justifyContent: "center",
        alignItems: "center",
        flexDirection: "column",
      }}
    >
      <Typography
        variant="h1"
      >
        La déconnexion a été effectuée avec succès.
      </Typography>
      <Typography
        variant="subtitle1"
      >
        Pour découvrir d'autres chansons, scanne une boîte !
      </Typography>
      <Button
        variant="contained"
        onClick={() => {
          navigate("/");
        }}
      >
        Revenir à la page principale
      </Button>
    </Box>
  );
}

