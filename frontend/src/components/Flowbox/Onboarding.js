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

  useEffect(() => {
    const err = location.state?.error;
    if (err) setPageError(String(err));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.key]);

  useEffect(() => {
    let isCancelled = false;

    (async () => {
      try {
        setLoading(true);

        const url = `/box-management/get-box/?name=${encodeURIComponent(boxSlug)}`;
        const res = await fetch(url, {
          credentials: "include",
          headers: { Accept: "application/json" },
        });

        if (!res.ok) throw new Error(`HTTP ${res.status}`);

        const data = await res.json();
        if (!data || !data.name) throw new Error("Payload inattendu");

        if (isCancelled) return;

        setBox(data);
        setPageError("");
      } catch {
        if (isCancelled) return;
        handleError("Impossible de récupérer la boîte.");
      } finally {
        if (!isCancelled) {
          setLoading(false);
        }
      }
    })();

    return () => {
      isCancelled = true;
    };
  }, [boxSlug, handleError]);

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
                try {
                  navigator.geolocation.clearWatch(wid);
                } catch {}
                resolve(pos2);
              },
              (err2) => {
                try {
                  navigator.geolocation.clearWatch(wid);
                } catch {}
                reject(err2);
              },
              { enableHighAccuracy: true, maximumAge: 15000, timeout: 10000 }
            );
            setTimeout(() => {
              try {
                navigator.geolocation.clearWatch(wid);
              } catch {}
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
      <Box
        sx={{
          minHeight: "100vh",
          px: 2,
          display: "grid",
          placeItems: "center",
        }}
      >
        <Paper sx={{ p: 2, width: "100%", maxWidth: 520 }}>
          <Alert severity="error">{pageError}</Alert>
          <Button
            sx={{ mt: 2 }}
            variant="contained"
            onClick={() => window.location.reload()}
          >
            Réessayer
          </Button>
        </Paper>
      </Box>
    );
  }

  return (
    <Box
      sx={{
        minHeight: "100vh",
        px: 2,
        py: 3,
        display: "grid",
        placeItems: "center",
      }}
    >
      <Paper sx={{ p: 3, width: "100%", maxWidth: 560 }}>
        <Typography variant="h4" gutterBottom>
          {box?.name || "Boîte"}
        </Typography>

        <Typography sx={{ mb: 2 }}>
          Active ta localisation pour accéder à la recherche de sons.
        </Typography>

        {!!box?.deposit_count && (
          <Typography sx={{ mb: 1 }}>
            Dépôts : {box.deposit_count}
          </Typography>
        )}

        {!!box?.last_deposit_date && (
          <Typography sx={{ mb: 2 }}>
            Dernier dépôt : {box.last_deposit_date}
          </Typography>
        )}

        <Button
          variant="contained"
          startIcon={<PlayArrowIcon />}
          onClick={openSheet}
        >
          Autoriser la localisation
        </Button>
      </Paper>

      <EnableLocation
        open={sheetOpen}
        loading={geoLoading}
        onClose={() => {
          if (!geoLoading) setSheetOpen(false);
        }}
        onAuthorize={handleAuthorize}
      />
    </Box>
  );
}
