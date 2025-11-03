import React, { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import CircularProgress from "@mui/material/CircularProgress";
import Button from "@mui/material/Button";
import Alert from "@mui/material/Alert";
import Paper from "@mui/material/Paper";
import Skeleton from "@mui/material/Skeleton";
import PlayArrowIcon from "@mui/icons-material/PlayArrow";

export default function Onboarding() {
  const { boxSlug } = useParams();
  const [box, setBox] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    setLoading(true);
    setError(null);

    const url = `/box-management/get-box/?name=${encodeURIComponent(boxSlug)}`;
    console.log("[Onboarding] Fetch:", url);

    fetch(url, { credentials: "include" })
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
      })
      .then((data) => {
        if (!data || !data.name) throw new Error("Payload inattendu");
        setBox(data);
      })
      .catch((err) => {
        console.error("[Onboarding] Erreur:", err);
        setError("Impossible de récupérer la boîte.");
      })
      .finally(() => {
        setLoading(false);
      });
  }, [boxSlug]);

  // === États d’attente et d’erreur ===
  if (loading) {
    return (
      <Box
        sx={{
          minHeight: "100vh",
          display: "grid",
          placeItems: "center",
        }}
      >
        <CircularProgress />
        <Typography sx={{ mt: 2 }}>Chargement de la boîte…</Typography>
      </Box>
    );
  }

  if (error) {
    return (
      <Box
        sx={{
          minHeight: "100vh",
          display: "grid",
          placeItems: "center",
          p: 2,
        }}
      >
        <Alert severity="error" sx={{ mb: 2 }}>
          {error}
        </Alert>
        <Button variant="contained" onClick={() => window.location.reload()}>
          Réessayer
        </Button>
      </Box>
    );
  }

  // === HERO identique à MusicBox ===
  return (
    <Paper
      elevation={3}
      sx={{
        position: "fixed",
        left: 0,
        right: 0,
        top: 0,
        bottom: 0,
        backgroundImage: "url('../static/images/onboardingBgTan.png')",
        backgroundSize: "cover",
        backgroundPosition: "center",
        backgroundRepeat: "no-repeat",
      }}
    >
      <Box sx={{ mt: "auto" }}>
        <Box
          sx={{
            display: "grid",
            position: "fixed",
            bottom: "20px",
            left: "20px",
            right: "20px",
          }}
        >
          {loading ? (
            <Skeleton variant="text" width={180} height={24} />
          ) : (
            <Typography variant="subtitle1">
              {box?.deposit_count || 0} Dépôts
            </Typography>
          )}

          {loading ? (
            <Skeleton variant="text" width={260} height={40} />
          ) : (
            <Typography component="h1" variant="h1" sx={{ mb: 2 }}>
              {box?.name}
            </Typography>
          )}

          <Box sx={{ mt: 2 }}>
            <Button
              variant="contained"
              size="large"
              fullWidth
              disabled={loading}
              startIcon={<PlayArrowIcon />}
              onClick={() =>
                console.log(
                  "TODO: Naviguer vers /flowbox/" + boxSlug + "/main"
                )
              }
            >
              Ouvrir la boîte
            </Button>
          </Box>
        </Box>
      </Box>
    </Paper>
  );
}
