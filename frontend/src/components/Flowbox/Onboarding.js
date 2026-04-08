import React, { useEffect, useState, useCallback, useContext } from "react";
import { useParams, useNavigate, useLocation } from "react-router-dom";
import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import CircularProgress from "@mui/material/CircularProgress";
import Button from "@mui/material/Button";
import Alert from "@mui/material/Alert";
import Paper from "@mui/material/Paper";
import EnableLocation from "../Flowbox/EnableLocation";
import { UserContext } from "../UserContext";
import LockIcon from '@mui/icons-material/Lock';

export default function Onboarding() {
  const { boxSlug } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const { currentClient, setCurrentClient } = useContext(UserContext) || {};

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

        const nextClient = data?.client_slug || "default";

        try {
          localStorage.setItem(
            "mm_current_box",
            JSON.stringify({
              box_slug: boxSlug,
              search_incitation_text: (data?.search_incitation_text || "").trim(),
            })
          );
        } catch {}
        if (setCurrentClient && currentClient !== nextClient) {
          setCurrentClient(nextClient);
        }

        setBox(data);
      } catch {
        handleError(pageError || "Impossible de récupérer la boîte.");
      } finally {
        setLoading(false);
      }
    })();
  }, [boxSlug, handleError, pageError, currentClient, setCurrentClient]);

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
        className="onBoarding"
      >
        {box?.last_deposit_song_image_url ? (
          <Box
            component="img"
            src={box.last_deposit_song_image_url}
            alt=""
            className="last_song_img bg"
          />
        ) : null}

        <Box className="page_container">
  
          {box?.last_deposit_song_image_url ? (
            <Box className="last_song">
              <Box className="pochette">
                <Box className="cover">
                  <Box
                    component="img"
                    src={box.last_deposit_song_image_url}
                    alt="pochette"
                    className="last_song_img"
                  />
                  <LockIcon className="icon" />
                </Box>
                <Box className="vinyl" />
              </Box>
              <Typography variant="subtitle1">
                Chanson deposée ici {box?.last_deposit_date || 0}
              </Typography>
            </Box>
          ) : null}

          
          <Box className="info_box">
            <Typography className="box_name" component="h5" variant="h5">
              {box?.name}
            </Typography>
          </Box>

          <Box className="container">

            <Typography variant="h4" component="h1">
              Dépose une chanson pour découvrir celle déposée par le passant précédent
            </Typography>

            <Button
              variant="contained"
              size="large"
              fullWidth
              onClick={openSheet}
            >
              Commencer
            </Button>
      
          </Box>
        </Box>
      </Paper>

      <EnableLocation
        open={sheetOpen}
        boxTitle={box?.name || "Boîte"}
        loading={geoLoading}
        error=""
        onAuthorize={handleAuthorize}
        onClose={() => setSheetOpen(false)}
      />
    </>
  );
}
