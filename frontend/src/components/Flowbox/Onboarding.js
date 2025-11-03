import React, { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import CircularProgress from "@mui/material/CircularProgress";
import Button from "@mui/material/Button";
import Alert from "@mui/material/Alert";

export default function Onboarding() {
  const { boxSlug } = useParams();
  const [box, setBox] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // --- Chargement de la box ---
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

  // --- Affichage selon l’état ---
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

  // --- Fond hero (image ou dégradé simple) ---
  const heroBg = box?.image_url
    ? `url("${box.image_url}")`
    : "linear-gradient(180deg, #111 0%, #000 100%)";

  // --- Contenu principal ---
  return (
    <Box sx={{ minHeight: "100vh", bgcolor: "background.default" }}>
      <Box
        sx={{
          position: "relative",
          height: 400,
          display: "flex",
          alignItems: "flex-end",
          backgroundImage: heroBg,
          backgroundSize: "cover",
          backgroundPosition: "center",
          color: "#fff",
          p: 3,
        }}
      >
        <Box
          sx={{
            position: "absolute",
            inset: 0,
            background:
              "linear-gradient(0deg, rgba(0,0,0,0.7) 0%, rgba(0,0,0,0.4) 45%, rgba(0,0,0,0.0) 100%)",
          }}
        />
        <Box sx={{ position: "relative" }}>
          <Typography variant="h4" sx={{ fontWeight: 700 }}>
            {box?.name}
          </Typography>
          {box?.description && (
            <Typography sx={{ mt: 1 }}>{box.description}</Typography>
          )}
          <Button
            variant="contained"
            color="primary"
            sx={{ mt: 3 }}
            onClick={() =>
              console.log("TODO: Naviguer vers /flowbox/" + boxSlug + "/main")
            }
          >
            Entrer dans la boîte
          </Button>
        </Box>
      </Box>
    </Box>
  );
}
