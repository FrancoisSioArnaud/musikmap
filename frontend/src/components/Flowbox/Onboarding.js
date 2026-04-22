import React, { useContext, useEffect, useState, useCallback } from "react";
import { useNavigate, useParams, useLocation } from "react-router-dom";
import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import Button from "@mui/material/Button";
import Paper from "@mui/material/Paper";
import Alert from "@mui/material/Alert";
import Dialog from "@mui/material/Dialog";
import DialogTitle from "@mui/material/DialogTitle";
import DialogContent from "@mui/material/DialogContent";
import DialogActions from "@mui/material/DialogActions";
import CircularProgress from "@mui/material/CircularProgress";
import LockIcon from "@mui/icons-material/Lock";
import EnableLocation from "./EnableLocation";
import { UserContext } from "../UserContext";
import { FlowboxSessionContext } from "./runtime/FlowboxSessionContext";

function isPermissionDeniedError(error) {
  return error?.code === 1 || /denied/i.test(String(error?.message || ""));
}

async function getLocationPermissionState() {
  if (!navigator?.permissions?.query) return "prompt";
  try {
    const result = await navigator.permissions.query({ name: "geolocation" });
    return result?.state || "prompt";
  } catch {
    return "prompt";
  }
}

function requestLocationOnce() {
  return new Promise((resolve, reject) => {
    if (!("geolocation" in navigator)) {
      reject(new Error("La géolocalisation n’est pas supportée sur cet appareil."));
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (position) => resolve(position),
      (error) => reject(error),
      {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 60000,
      }
    );
  });
}

export default function Onboarding() {
  const navigate = useNavigate();
  const location = useLocation();
  const { boxSlug } = useParams();
  const { setUser } = useContext(UserContext) || {};
  const {
    getBoxRuntime,
    getActiveSessionForSlug,
    sessionLoadStateBySlug,
    saveVerifiedSession,
    markFlowboxVisited,
  } = useContext(FlowboxSessionContext);

  const runtime = getBoxRuntime(boxSlug);
  const activeSession = getActiveSessionForSlug(boxSlug);
  const sessionLoadState = sessionLoadStateBySlug?.[boxSlug] || "idle";

  const [pageError, setPageError] = useState("");
  const [sheetOpen, setSheetOpen] = useState(false);
  const [geoLoading, setGeoLoading] = useState(false);
  const [locationError, setLocationError] = useState("");
  const [settingsDialogOpen, setSettingsDialogOpen] = useState(false);

  const boxName = runtime?.box?.name || "Boîte";

  useEffect(() => {
    const err = location.state?.error;
    if (err) setPageError(String(err));
  }, [location.state]);

  useEffect(() => {
    if (activeSession && sessionLoadState !== "loading") {
      navigate(`/flowbox/${encodeURIComponent(boxSlug)}/discover`, { replace: true });
    }
  }, [activeSession, boxSlug, navigate, sessionLoadState]);

  const verifyAndOpenBox = useCallback(async () => {
    setGeoLoading(true);
    setLocationError("");
    setPageError("");

    try {
      const position = await requestLocationOnce();
      const response = await fetch(`/box-management/verify-location`, {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify({
          boxSlug,
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
        }),
      });

      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        if (response.status === 403) {
          setLocationError(data?.detail || "Rapproche-toi de la boîte pour l’ouvrir.");
          setSheetOpen(true);
          return;
        }
        throw new Error(data?.detail || "Impossible d’ouvrir la boîte.");
      }

      saveVerifiedSession(data, { triggerEnterHint: true });
      markFlowboxVisited(boxSlug);
      setSheetOpen(false);
      if (data?.current_user && setUser) {
        setUser(data.current_user);
      }
      navigate(`/flowbox/${encodeURIComponent(boxSlug)}/search`, { replace: true });
    } catch (error) {
      if (isPermissionDeniedError(error)) {
        setSheetOpen(false);
        setSettingsDialogOpen(true);
        return;
      }
      setPageError(error?.message || "Impossible d’ouvrir la boîte.");
    } finally {
      setGeoLoading(false);
    }
  }, [boxSlug, markFlowboxVisited, navigate, saveVerifiedSession, setUser]);

  const handleStart = useCallback(async () => {
    setPageError("");
    setLocationError("");
    const permissionState = await getLocationPermissionState();

    if (permissionState === "granted") {
      verifyAndOpenBox();
      return;
    }

    setSheetOpen(true);
  }, [verifyAndOpenBox]);

  const coverImage = runtime?.box?.lastDepositSongImageUrl || null;

  if (!runtime?.box) {
    return (
      <Box sx={{ minHeight: "60vh", display: "grid", placeItems: "center" }}>
        <CircularProgress />
      </Box>
    );
  }

  return (
    <>
      <Paper elevation={3} className="onBoarding">
        <Box className="page_container">
          {coverImage ? (
            <Box className="last_song">
              <Box
                component="img"
                src="https://naolib.fr/medias/photo/homepage_1770126469211-png"
                className="bg"
                alt="fond"
              />
              <Box className="pochette">
                <Box className="cover">
                  <Box component="img" src={coverImage} alt="pochette" className="last_song_img" />
                  <LockIcon className="icon" />
                </Box>
                <Box className="vinyl" />
              </Box>
              {runtime?.box?.lastDepositDate ? (
                <Typography variant="subtitle1" component="p">
                  Chanson déposée ici {runtime.box.lastDepositDate}
                </Typography>
              ) : null}
            </Box>
          ) : null}

          <Box className="info_box">
            <Typography className="box_name" component="h5" variant="h5">
              {boxName}
            </Typography>
          </Box>

          <Box className="container">
            <Typography variant="h4" component="h1" className="intro_small">
              Dépose une chanson puis découvre celle déposée par le passant précédent
            </Typography>

            {pageError ? (
              <Alert severity="error" sx={{ width: "100%", mb: 2 }}>
                {pageError}
              </Alert>
            ) : null}

            <Button variant="contained" size="large" fullWidth onClick={handleStart} disabled={geoLoading}>
              Commencer
            </Button>
          </Box>
        </Box>
      </Paper>

      <EnableLocation
        open={sheetOpen}
        boxTitle={boxName}
        loading={geoLoading}
        error={locationError}
        onAuthorize={verifyAndOpenBox}
        onClose={() => setSheetOpen(false)}
      />

      <Dialog open={settingsDialogOpen} onClose={() => setSettingsDialogOpen(false)} fullWidth maxWidth="xs">
        <DialogTitle>Active la localisation</DialogTitle>
        <DialogContent>
          <Typography variant="body1">
            Pour ouvrir cette boîte, la localisation doit être autorisée pour ce site dans les réglages de ton téléphone ou de ton navigateur.
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button variant="light" onClick={() => setSettingsDialogOpen(false)}>
            Fermer
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
}
