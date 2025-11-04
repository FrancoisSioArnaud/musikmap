import React, { useEffect, useState, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import CircularProgress from "@mui/material/CircularProgress";
import Button from "@mui/material/Button";
import Alert from "@mui/material/Alert";
import Paper from "@mui/material/Paper";
import Skeleton from "@mui/material/Skeleton";
import PlayArrowIcon from "@mui/icons-material/PlayArrow";

// 👇 ajout
import EnableLocation from "../Flowbox/EnableLocation";

export default function Onboarding() {
  const navigate = useNavigate();
  const { boxSlug } = useParams();

  const [box, setBox] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // --- état modale EnableLocation
  const [enableOpen, setEnableOpen] = useState(false);
  const [geoLoading, setGeoLoading] = useState(false);
  const [geoError, setGeoError] = useState("");

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

  // --- clic sur "Ouvrir la boîte" → ouvrir la modale, pas d’appel réseau
  const handleOpenModal = useCallback(() => {
    setGeoError("");
    setEnableOpen(true);
  }, []);

  // --- iOS-friendly : demande d’autorisation via getCurrentPosition
  //     puis fallback court en watchPosition pour forcer le prompt si besoin
  const handleAuthorize = useCallback(() => {
    setGeoError("");
    if (!("geolocation" in navigator)) {
      setGeoError("La géolocalisation n’est pas supportée sur cet appareil.");
      return;
    }

    setGeoLoading(true);

    const opts = { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 };

    const onSuccess = () => {
      // On a obtenu une position → on considère l’autorisation accordée.
      // Pas de vérif serveur ici. On navigue vers Discover.
      setGeoLoading(false);
      navigate(`/flowbox/${encodeURIComponent(boxSlug)}/discover`);
      // NB: pas besoin de fermer explicitement la Drawer (navigation l’unmonte).
    };

    const onError = (err) => {
      // Fallback iOS: court watchPosition pour déclencher le prompt
      try {
        const wid = navigator.geolocation.watchPosition(
          () => {
            try { navigator.geolocation.clearWatch(wid); } catch {}
            onSuccess();
          },
          (err2) => {
            try { navigator.geolocation.clearWatch(wid); } catch {}
            setGeoLoading(false);
            setGeoError(err2?.message || "Impossible d’obtenir la position.");
          },
          { enableHighAccuracy: true, maximumAge: 15000, timeout: 10000 }
        );
        // Sécurité: stop le watch après 15s si rien ne vient
        setTimeout(() => {
          try { navigator.geolocation.clearWatch(wid); } catch {}
        }, 15000);
      } catch (e2) {
        setGeoLoading(false);
        setGeoError(err?.message || "Impossible d’obtenir la position.");
      }
    };

    try {
      navigator.geolocation.getCurrentPosition(
        () => onSuccess(),
        (err) => onError(err),
        opts
      );
    } catch (e) {
      setGeoLoading(false);
      setGeoError(e?.message || "Erreur de géolocalisation.");
    }
  }, [boxSlug, navigate]);

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
    <>
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
            <Typography variant="subtitle1">
              {box?.deposit_count || 0} partages
            </Typography>
            <Typography variant="subtitle1">
              Dernier partage {box?.last_deposit_date || 0}
            </Typography>

            <Typography component="h1" variant="h1" sx={{ mb: 2 }}>
              {box?.name}
            </Typography>

            <Box sx={{ mt: 2 }}>
              <Button
                variant="contained"
                size="large"
                fullWidth
                startIcon={<PlayArrowIcon />}
                onClick={handleOpenModal}
                disabled={loading}
                aria-describedby="open-box-desc"
              >
                Ouvrir la boîte
              </Button>
            </Box>
          </Box>
        </Box>
      </Paper>

      {/* Modale autorisation géoloc */}
      <EnableLocation
        open={enableOpen}
        boxTitle={box?.name || "Boîte"}
        loading={geoLoading}
        error={geoError}
        onAuthorize={handleAuthorize}
        onClose={() => setEnableOpen(false)}
      />
    </>
  );
}
