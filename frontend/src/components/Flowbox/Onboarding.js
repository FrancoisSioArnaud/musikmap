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
import EnableLocation from "../Flowbox/EnableLocation";

export default function Onboarding() {
  const { boxSlug } = useParams();
  const navigate = useNavigate();

  const [box, setBox] = useState(null);
  const [loading, setLoading] = useState(true);
  const [pageError, setPageError] = useState("");        // Erreurs globales (affichage type "Impossible de récupérer la boîte")
  const [sheetOpen, setSheetOpen] = useState(false);     // Modale EnableLocation
  const [geoLoading, setGeoLoading] = useState(false);   // Spinner bouton "Autoriser"

  // ---- Gestion centralisée des erreurs
  const handleError = useCallback((msg) => {
    setGeoLoading(false);
    setSheetOpen(false);
    setLoading(false);
    setPageError(msg || "Une erreur inattendue s’est produite.");
  }, []);

  // ---- Fetch des infos de la boîte
  useEffect(() => {
    (async () => {
      try {
        setLoading(true);
        setPageError("");
        const url = `/box-management/get-box/?name=${encodeURIComponent(boxSlug)}`;
        const res = await fetch(url, { credentials: "include", headers: { Accept: "application/json" } });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        if (!data || !data.name) throw new Error("Payload inattendu");
        setBox(data);
      } catch (e) {
        handleError("Impossible de récupérer la boîte.");
      } finally {
        setLoading(false);
      }
    })();
  }, [boxSlug, handleError]);

  // ---- Demande géoloc (avec fallback iOS watchPosition court)
  const requestLocationOnce = useCallback(() => {
    return new Promise((resolve, reject) => {
      if (!("geolocation" in navigator)) {
        reject(new Error("La géolocalisation n’est pas supportée sur cet appareil."));
        return;
      }
      const opts = { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 };
      navigator.geolocation.getCurrentPosition(
        (pos) => resolve(pos),
        (err) => {
          // Fallback iOS : déclenche le prompt via un watchPosition court
          try {
            const wid = navigator.geolocation.watchPosition(
              (pos2) => { try { navigator.geolocation.clearWatch(wid); } catch {} resolve(pos2); },
              (err2) => { try { navigator.geolocation.clearWatch(wid); } catch {} reject(err2); },
              { enableHighAccuracy: true, maximumAge: 15000, timeout: 10000 }
            );
            setTimeout(() => { try { navigator.geolocation.clearWatch(wid); } catch {} }, 15000);
          } catch {
            reject(err || new Error("Impossible d’obtenir la position."));
          }
        },
        opts
      );
    });
  }, []);

  // ---- UI : ouvrir la modale
  const openSheet = useCallback(() => {
    setPageError("");  // on efface une éventuelle erreur précédente
    setSheetOpen(true);
  }, []);

  // ---- Click "Autoriser" dans la modale
  const handleAuthorize = useCallback(async () => {
    setGeoLoading(true);
    try {
      await requestLocationOnce();       // On ne vérifie pas le serveur ici
      setGeoLoading(false);
      // Navigation immédiate vers Discover
      navigate(`/flowbox/${encodeURIComponent(boxSlug)}/discover`);
    } catch {
      // Refus / timeout / erreur → message centralisé
      handleError("Tu ne peux pas ouvrir la boîte sans activer ta localisation");
    }
  }, [requestLocationOnce, navigate, boxSlug, handleError]);

  // === Écrans de chargement / erreur ===
  if (loading && !pageError) {
    return (
      <Box sx={{ minHeight: "100vh", display: "grid", placeItems: "center" }}>
        <CircularProgress />
        <Typography sx={{ mt: 2 }}>Chargement de la boîte…</Typography>
      </Box>
    );
  }

  if (pageError) {
    return (
      <Box sx={{ minHeight: "100vh", display: "grid", placeItems: "center", p: 2 }}>
        <Alert severity="error" sx={{ mb: 2 }}>{pageError}</Alert>
        <Button variant="contained" onClick={() => window.location.reload()}>Réessayer</Button>
      </Box>
    );
  }

  // === HERO (identique à l’existant, épuré)
  return (
    <>
      <Paper
        elevation={3}
        sx={{
          position: "fixed", inset: 0,
          backgroundImage: "url('../static/images/onboardingBgTan.png')",
          backgroundSize: "cover", backgroundPosition: "center", backgroundRepeat: "no-repeat",
        }}
      >
        <Box sx={{ mt: "auto" }}>
          <Box sx={{ display: "grid", position: "fixed", bottom: 20, left: 20, right: 20, gap: 0.5 }}>
            <Typography variant="subtitle1">{box?.deposit_count || 0} partages</Typography>
            <Typography variant="subtitle1">Dernier partage {box?.last_deposit_date || 0}</Typography>
            <Typography component="h1" variant="h1" sx={{ mb: 2 }}>{box?.name}</Typography>
            <Box sx={{ mt: 2 }}>
              <Button
                variant="contained"
                size="large"
                fullWidth
                startIcon={<PlayArrowIcon />}
                onClick={openSheet}
              >
                Ouvrir la boîte
              </Button>
            </Box>
          </Box>
        </Box>
      </Paper>

      {/* Modale "Autoriser la localisation" */}
      <EnableLocation
        open={sheetOpen}
        boxTitle={box?.name || "Boîte"}
        loading={geoLoading}
        error={""}                           // les erreurs bloquantes passent par handleError() pour affichage global
        onAuthorize={handleAuthorize}
        onClose={() => setSheetOpen(false)}
      />
    </>
  );
}
