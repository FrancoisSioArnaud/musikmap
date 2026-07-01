import LockIcon from "@mui/icons-material/LockRounded";
import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import CircularProgress from "@mui/material/CircularProgress";
import Dialog from "@mui/material/Dialog";
import DialogActions from "@mui/material/DialogActions";
import DialogContent from "@mui/material/DialogContent";
import DialogTitle from "@mui/material/DialogTitle";
import Paper from "@mui/material/Paper";
import Typography from "@mui/material/Typography";
import React, { useContext, useEffect, useState, useCallback } from "react";
import { useNavigate, useParams, useLocation } from "react-router-dom";

import { UserContext } from "../UserContext";

import EnableLocation from "./EnableLocation";
import { FlowboxSessionContext } from "./runtime/FlowboxSessionContext";

function getCookie(name) {
  const match = document.cookie.match(new RegExp(`(^|;\\s*)${name}=([^;]*)`));
  return match ? decodeURIComponent(match[2]) : "";
}

function isPermissionDeniedError(error) {
  return error?.code === 1 || /denied/i.test(String(error?.message || ""));
}


function getGeolocationDialogConfig(error) {
  if (!error || typeof error.code !== "number") {return null;}

  if (error.code === 2) {
    return {
      type: "position-unavailable",
      title: "Position introuvable",
      message: "Ton navigateur n’arrive pas à récupérer ta position pour le moment. Vérifie que la localisation est activée sur ton téléphone, que ton navigateur y a accès, puis réessaie. Si tu es à l’intérieur, rapproche-toi d’une fenêtre.",
      retryLabel: "Réessayer",
    };
  }

  if (error.code === 3) {
    return {
      type: "timeout",
      title: "Localisation trop lente",
      message: "La récupération de ta position prend trop de temps. Vérifie que la localisation est activée, garde cette page ouverte quelques secondes, puis réessaie.",
      retryLabel: "Réessayer",
    };
  }

  return null;
}

function getDeviceOs() {
  const userAgent = navigator?.userAgent || "";
  const platform = navigator?.platform || "";
  const maxTouchPoints = navigator?.maxTouchPoints || 0;

  const isIOS = /iPhone|iPad|iPod/i.test(userAgent)
    || /iPhone|iPad|iPod/i.test(platform)
    || (platform === "MacIntel" && maxTouchPoints > 1);
  if (isIOS) {return "ios";}
  if (/Android/i.test(userAgent)) {return "android";}
  return "unknown";
}

function getPermissionDialogContent(os) {
  const title = "Localisation refusée";
  if (os === "ios") {
    return {
      title,
      content: "Tu as refusé de partager ta localisation.\nOn ne peut pas vérifier que tu es près de la boîte tant que la localisation n’est pas activée.\nOuvre ton application Réglages, puis va dans Confidentialité et sécurité > Service de localisation et active-la.\nSi besoin, autorise aussi la localisation pour les sites dans Safari.\nEnsuite, reviens ici et recommence.",
    };
  }

  if (os === "android") {
    return {
      title,
      content: "Tu as refusé de partager ta localisation.\nOn ne peut pas vérifier que tu es près de la boîte tant que la localisation n’est pas activée.\nOuvre ton application Réglages, puis va dans Localisation et active-la.\nSi besoin, autorise aussi la localisation pour Chrome ou ton navigateur dans les autorisations des applications.\nEnsuite, reviens ici et recommence.",
    };
  }

  return {
    title,
    content: "Tu as refusé de partager ta localisation.\nOn ne peut pas vérifier que tu es près de la boîte tant que la localisation n’est pas activée.\nOuvre ton application Réglages, active la localisation, puis autorise-la aussi pour ton navigateur si nécessaire.\nEnsuite, reviens ici et recommence.",
  };
}

async function getLocationPermissionState() {
  if (!navigator?.permissions?.query) {return "prompt";}
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
  const [settingsDialogOpen, setSettingsDialogOpen] = useState(false);
  const [outsideRangeDialogOpen, setOutsideRangeDialogOpen] = useState(false);
  const [geolocationErrorDialog, setGeolocationErrorDialog] = useState(null);

  const boxName = runtime?.box?.name || "Boîte";
  const requireLoc = runtime?.box?.requireLoc !== false;
  const deviceOs = getDeviceOs();
  const permissionDialog = getPermissionDialogContent(deviceOs);

  useEffect(() => {
    const err = location.state?.error;
    if (err) {setPageError(String(err));}
  }, [location.state]);

  useEffect(() => {
    if (activeSession && sessionLoadState !== "loading") {
      navigate(`/flowbox/${encodeURIComponent(boxSlug)}/discover`, { replace: true });
    }
  }, [activeSession, boxSlug, navigate, sessionLoadState]);

  const verifyAndOpenBox = useCallback(async () => {
    setGeoLoading(true);
    setPageError("");
    setSettingsDialogOpen(false);
    setOutsideRangeDialogOpen(false);
    setGeolocationErrorDialog(null);

    try {
      const position = await requestLocationOnce();
      const response = await fetch(`/box-management/verify-location`, {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
          "X-CSRFToken": getCookie("csrftoken"),
        },
        body: JSON.stringify({
          boxSlug,
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
        }),
      });

      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        const outsideRangeByCode = data?.code === "OUTSIDE_ALLOWED_BOX_RANGE";
        const outsideRangeByMessage = /rapproche|près de la boîte|outside.*range/i.test(
          String(data?.detail || "")
        );
        if (response.status === 403 && (outsideRangeByCode || outsideRangeByMessage)) {
          setSheetOpen(false);
          setOutsideRangeDialogOpen(true);
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
      navigate(`/flowbox/${encodeURIComponent(boxSlug)}/discover`, { replace: true });
    } catch (error) {
      if (isPermissionDeniedError(error)) {
        setSheetOpen(false);
        setSettingsDialogOpen(true);
        return;
      }

      const geolocationDialogConfig = getGeolocationDialogConfig(error);
      if (geolocationDialogConfig) {
        setSheetOpen(false);
        setPageError("");
        setGeolocationErrorDialog(geolocationDialogConfig);
        return;
      }

      setPageError("Impossible de récupérer ta position. Réessaie dans un instant.");
    } finally {
      setGeoLoading(false);
    }
  }, [boxSlug, markFlowboxVisited, navigate, saveVerifiedSession, setUser]);


  const openBoxWithoutLocation = useCallback(async () => {
    setGeoLoading(true);
    setPageError("");
    setSettingsDialogOpen(false);
    setOutsideRangeDialogOpen(false);
    setGeolocationErrorDialog(null);
    setSheetOpen(false);

    try {
      const response = await fetch(`/box-management/box-session/`, {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
          "X-CSRFToken": getCookie("csrftoken"),
        },
        body: JSON.stringify({ boxSlug }),
      });

      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(data?.detail || "Impossible d’ouvrir la boîte.");
      }

      saveVerifiedSession(data, { triggerEnterHint: true });
      markFlowboxVisited(boxSlug);
      if (data?.current_user && setUser) {
        setUser(data.current_user);
      }
      navigate(`/flowbox/${encodeURIComponent(boxSlug)}/discover`, { replace: true });
    } catch (error) {
      setPageError(error?.message || "Impossible d’ouvrir la boîte.");
    } finally {
      setGeoLoading(false);
    }
  }, [boxSlug, markFlowboxVisited, navigate, saveVerifiedSession, setUser]);

  const handleRetryGeolocation = useCallback(() => {
    if (geoLoading) {return;}
    setGeolocationErrorDialog(null);
    verifyAndOpenBox();
  }, [geoLoading, verifyAndOpenBox]);

  const handleStart = useCallback(async () => {
    setPageError("");
    setOutsideRangeDialogOpen(false);
    setGeolocationErrorDialog(null);
    if (!requireLoc) {
      openBoxWithoutLocation();
      return;
    }

    const permissionState = await getLocationPermissionState();

    if (permissionState === "granted") {
      verifyAndOpenBox();
      return;
    }

    if (permissionState === "denied") {
      setSheetOpen(false);
      setSettingsDialogOpen(true);
      return;
    }

    setSheetOpen(true);
  }, [openBoxWithoutLocation, requireLoc, verifyAndOpenBox]);

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
            <Typography variant="h3" component="h1" className="intro_small">
              Découvre les chansons laissées ici
            </Typography>

            {pageError ? (
              <Alert severity="error" sx={{ width: "100%", mb: 2 }}>
                {pageError}
              </Alert>
            ) : null}

            <Button variant="contained" size="large" fullWidth onClick={handleStart} disabled={geoLoading}>
              Ouvrir la boîte
            </Button>
          </Box>
        </Box>
      </Paper>

      {requireLoc ? (
        <EnableLocation
          open={sheetOpen}
          boxTitle={boxName}
          loading={geoLoading}
          onAuthorize={verifyAndOpenBox}
          onClose={() => setSheetOpen(false)}
        />
      ) : null}

      <Dialog open={settingsDialogOpen} onClose={() => setSettingsDialogOpen(false)} fullWidth maxWidth="xs">
        <DialogTitle>{permissionDialog.title}</DialogTitle>
        <DialogContent>
          <Typography variant="body1" sx={{ whiteSpace: "pre-line" }}>
            {permissionDialog.content}
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button variant="light" onClick={() => setSettingsDialogOpen(false)}>
            Fermer
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog
        open={Boolean(geolocationErrorDialog)}
        onClose={() => setGeolocationErrorDialog(null)}
        fullWidth
        maxWidth="xs"
      >
        <DialogTitle>{geolocationErrorDialog?.title}</DialogTitle>
        <DialogContent>
          <Typography variant="body1">
            {geolocationErrorDialog?.message}
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button variant="light" onClick={() => setGeolocationErrorDialog(null)} disabled={geoLoading}>
            Fermer
          </Button>
          <Button variant="contained" onClick={handleRetryGeolocation} disabled={geoLoading}>
            {geolocationErrorDialog?.retryLabel || "Réessayer"}
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog
        open={outsideRangeDialogOpen}
        onClose={() => setOutsideRangeDialogOpen(false)}
        fullWidth
        maxWidth="xs"
      >
        <DialogTitle>Tu n’es pas assez près de la boîte</DialogTitle>
        <DialogContent>
          <Typography variant="body1">
            Rapproche-toi du lieu où se trouve la boîte, puis réessaie.
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button variant="light" onClick={() => setOutsideRangeDialogOpen(false)}>
            J’ai compris
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
}
