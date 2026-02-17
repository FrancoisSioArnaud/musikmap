import React, { useEffect, useState, useCallback } from "react";
import { useParams, useNavigate, useLocation } from "react-router-dom";
import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import CircularProgress from "@mui/material/CircularProgress";
import Button from "@mui/material/Button";
import Alert from "@mui/material/Alert";
import Paper from "@mui/material/Paper";
import PlayArrowIcon from "@mui/icons-material/PlayArrow";
import EnableLocation from "../Flowbox/EnableLocation";

export default function Onboarding() {
  const { boxSlug } = useParams();
  const navigate = useNavigate();
  const location = useLocation();

  const [box, setBox] = useState(null);
  const [loading, setLoading] = useState(true);
  const [pageError, setPageError] = useState("");
  const [sheetOpen, setSheetOpen] = useState(false);
  const [geoLoading, setGeoLoading] = useState(false);

  const handleError = useCallback((msg) => {
    setGeoLoading(false);
    setSheetOpen(false);
    setLoading(false);
    setPageError(msg || "Une erreur inattendue s’est produite.");
  }, []);

  // ✅ Affiche l’erreur passée en navigation (LiveSearch -> Onboarding)
  useEffect(() => {
    const err = location.state?.error;
    if (err) setPageError(String(err));
    // ne pas dépendre de location.state pour éviter re-trigger inutiles
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.key]);

  useEffect(() => {
    (async () => {
      try {
        setLoading(true);
        // ne pas effacer pageError si on vient d’une redirection d’erreur
        const url = `/box-management/get-box/?name=${encodeURIComponent(boxSlug)}`;
        const res = await fetch(url, {
          credentials: "include",
          headers: { Accept: "application/json" },
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        if (!data || !data.name) throw new Error("Payload inattendu");
        setBox(data);
      } catch {
        handleError(pageError || "Impossible de récupérer la boîte.");
      } finally {
        setLoading(false);
      }
    })();
  }, [boxSlug, handleError]); // volontairement pas pageError ici

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
          try {
            const wid = navigator.geolocation.watchPosition(
              (pos2) => {
                try { navigator.geolocation.clearWatch(wid); } catch {}
                resolve(pos2);
              },
              (err2) => {
                try { navigator.geolocation.clearWatch(wid); } catch {}
                reject(err2);
              },
              { enableHighAccuracy: true, maximumAge: 15000, timeout: 10000 }
            );
            setTimeout(() => {
              try { navigator.geolocation.clearWatch(wid); } catch {}
            }, 15000);
          } catch {
            reject(err || new Error("Impossible d’obtenir la position."));
          }
        },
        opts
      );
    });
  }, []);

  const openSheet = useCallback(() => {
    setSheetOpen(true);
  }, []);

  const handleAuthorize = useCallback(async () => {
    setGeoLoading(true);
    try {
      await requestLocationOnce();
      setGeoLoading(false);
      navigate(`/flowbox/${encodeURIComponent(boxSlug)}/search`);
    } catch {
      handleError("Tu ne peux pas ouvrir la boîte sans activer ta localisation");
    }
  }, [requestLocationOnce, navigate, boxSlug, handleError]);

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
        <Alert severity="error" sx={{ mb: 2 }}>
          {pageError}
        </Alert>
        <Button variant="contained" onClick={() => window.location.reload()}>
          Réessayer
        </Button>
      </Box>
    );
  }

  return (
    <>
      <Paper
        elevation={3}
        sx={{
          position: "fixed",
          inset: 0,
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
              bottom: 20,
              left: 20,
              right: 20,
              gap: 0.5,
            }}
          >
            <Typography className="box_name" component="h1" variant="h1">
              {box?.name}
            </Typography>
              
            <Typography variant="subtitle1">{box?.deposit_count || 0} partages</Typography>
            <Typography variant="subtitle1">
              Dernier partage {box?.last_deposit_date || 0}
            </Typography>
              
            <Box className="steps_container">
              <Box className="step">
                <Typography component="span" variant="body1">
                  1
                </Typography>
                <Typography component="p" variant="body1">
                  Dépose une chanson
                </Typography>
              </Box>
              <Box className="step">     
                <Typography component="span" variant="body1">
                    2
                  </Typography>      
                <Typography component="p" variant="body1">
                  Découvre la chanson précédente
                </Typography>
              </Box>
            </Box>
            <Box
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

      <EnableLocation
        open={sheetOpen}
        boxTitle={box?.name || "Boîte"}
        loading={geoLoading}
        error={""}
        onAuthorize={handleAuthorize}
        onClose={() => setSheetOpen(false)}
      />
    </>
  );
}
