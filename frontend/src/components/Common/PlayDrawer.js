import ContentCopyRoundedIcon from "@mui/icons-material/ContentCopyRounded";
import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import CircularProgress from "@mui/material/CircularProgress";
import Drawer from "@mui/material/Drawer";
import Snackbar from "@mui/material/Snackbar";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import React, { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";

import { getCookie } from "../Security/TokensUtils";
import { closeDrawerWithHistory, matchesDrawerSearch, openDrawerWithHistory } from "../Utils/drawerHistory";

const logoByPlatform = {
  spotify: "/static/images/spotify_logo.svg",
  deezer: "/static/images/deezer_logo.svg",
  youtube: "/static/images/youtube_logo.svg",
};

function getSongKey(song) {
  if (!song) {return "";}
  return String(song.public_key || song.id || `${song.title || ""}-${song.artist || ""}`);
}

export default function PlayDrawer({ open, song, onClose, onSongResolved, children }) {
  const navigate = useNavigate();
  const location = useLocation();
  const [resolvingProvider, setResolvingProvider] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [copyFeedbackOpen, setCopyFeedbackOpen] = useState(false);

  const drawerValue = useMemo(() => getSongKey(song), [song]);
  const isOpenFromUrl = drawerValue ? matchesDrawerSearch(location, "play", drawerValue) : false;

  useEffect(() => {
    if (open && drawerValue && !isOpenFromUrl) {
      openDrawerWithHistory({ navigate, location, param: "play", value: drawerValue });
    }
  }, [drawerValue, isOpenFromUrl, location, navigate, open]);

  useEffect(() => {
    if (!open && isOpenFromUrl) {
      closeDrawerWithHistory({ navigate, location, param: "play", value: drawerValue, replace: true });
    }
  }, [drawerValue, isOpenFromUrl, location, navigate, open]);

  useEffect(() => {
    if (!open) {
      setResolvingProvider("");
      setErrorMessage("");
    }
  }, [open]);

  const artistText = useMemo(() => {
    if (song?.artist) {return song.artist;}
    if (Array.isArray(song?.artists)) {return song.artists.join(", ");}
    return "";
  }, [song]);

  const closeDrawer = (options = {}) => {
    const closedByHistory = closeDrawerWithHistory({
      navigate,
      location,
      param: "play",
      value: drawerValue,
      ...options,
    });

    if (!closedByHistory) {
      onClose?.();
    }
  };

  useEffect(() => {
    if (!open) {return;}
    if (drawerValue && !isOpenFromUrl) {
      onClose?.();
    }
  }, [drawerValue, isOpenFromUrl, onClose, open]);

  const safeText = () => `${song?.title ?? ""} ${artistText}`.trim();

  const getProviderUrl = (providerCode) => {
    const directUrl = song?.provider_links?.[providerCode]?.provider_url;
    if (directUrl) {return directUrl;}
    if (providerCode === "spotify") {return song?.spotify_url || "";}
    if (providerCode === "deezer") {return song?.deezer_url || "";}
    return "";
  };

  const openWindow = (url) => {
    if (!url) {return false;}
    window.open(url, "_blank", "noopener,noreferrer");
    return true;
  };

  const resolveAndOpenProvider = async (providerCode) => {
    setErrorMessage("");

    const existingUrl = getProviderUrl(providerCode);
    if (existingUrl) {
      openWindow(existingUrl);
      closeDrawer();
      return;
    }

    if (!song?.public_key) {
      setErrorMessage("Essaie une autre plateforme ou copie le nom de la chanson.");
      return;
    }

    try {
      setResolvingProvider(providerCode);
      const response = await fetch("/box-management/resolve-provider-link/", {
        method: "POST",
        credentials: "same-origin",
        headers: {
          "Content-Type": "application/json",
          "X-CSRFToken": getCookie("csrftoken"),
          Accept: "application/json",
        },
        body: JSON.stringify({
          song_public_key: song.public_key,
          provider_code: providerCode,
        }),
      });

      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data?.ok || !data?.provider_url) {
        setErrorMessage(data?.detail || "Impossible d’ouvrir cette plateforme. Essaie une autre plateforme ou copie le nom de la chanson.");
        if (data?.song) {
          onSongResolved?.(data.song);
        }
        return;
      }

      if (data?.song) {
        onSongResolved?.(data.song);
      }
      openWindow(data.provider_url);
      closeDrawer();
    } catch {
      setErrorMessage("Impossible d’ouvrir cette plateforme. Essaie une autre plateforme ou copie le nom de la chanson.");
    } finally {
      setResolvingProvider("");
    }
  };

  const openYouTubeSearch = () => {
    const q = safeText();
    if (!q) {
      setErrorMessage("Copie le nom de la chanson pour cette fois.");
      return;
    }
    openWindow(`https://www.youtube.com/results?search_query=${encodeURIComponent(q)}`);
    closeDrawer();
  };

  const copySongText = async () => {
    const text = `${song?.title ?? ""} - ${artistText}`.trim();
    try {
      await navigator.clipboard.writeText(text);
      setCopyFeedbackOpen(true);
      closeDrawer();
    } catch {
      const ta = document.createElement("textarea");
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      document.body.removeChild(ta);
      setCopyFeedbackOpen(true);
      closeDrawer();
    }
  };

  const actions = [
    { key: "spotify", label: "Spotify", onClick: () => resolveAndOpenProvider("spotify"), icon: logoByPlatform.spotify, iconOnly: true },
    { key: "deezer", label: "Deezer", onClick: () => resolveAndOpenProvider("deezer"), icon: logoByPlatform.deezer, iconOnly: true },
    { key: "youtube", label: "YouTube", onClick: openYouTubeSearch, icon: logoByPlatform.youtube, iconOnly: true },
    { key: "copy", label: "Copier le nom de la chanson", onClick: copySongText, iconOnly: false },
  ];

  return (
    <>
      <Box sx={{ display: "inline-flex", width: "fit-content", maxWidth: "100%" }}>{children}</Box>
      <Drawer
        anchor="bottom"
        open={open && Boolean(song)}
        onClose={() => closeDrawer()}
        PaperProps={{
          sx: {
            borderTopLeftRadius: "var(--mm-radius-xl)",
            borderTopRightRadius: "var(--mm-radius-xl)",
            maxHeight: "80vh",
            overflow: "hidden",
            p: "26px 20px 20px 20px",
          },
        }}
      >
        <Box sx={{ width: "100%", maxWidth: 720, mx: "auto", display: "flex", flexDirection: "column", gap: 2, minHeight: 0, flex: 1 }}>
          <Typography variant="h3" component="h3">Écouter dans</Typography>
          {errorMessage ? <Alert severity="error">{errorMessage}</Alert> : null}
          <Stack sx={{ overflowY: "auto", pb: 1, gap:"6px"}}>
            {actions.map((action) => (
              <Button
                key={action.key}
                variant="light"
                fullWidth
                onClick={action.onClick}
                disabled={Boolean(resolvingProvider) && resolvingProvider !== action.key}
                startIcon={action.iconOnly ? null : (resolvingProvider === action.key ? <CircularProgress size={18} /> : (action.icon ? <Box component="img" src={action.icon} alt={action.label} sx={{ width: "auto", height: 24, display: "block" }} /> : <ContentCopyRoundedIcon sx={{ fontSize: 24, color: "var(--mm-color-black)" }} />))}
                sx={{
                  justifyContent: "center",
                  minHeight: 52,
                  textTransform: "none",
                  color: action.key === "copy" ? "var(--mm-color-black)" : undefined,
                }}
              >
                {action.iconOnly ? (
                  resolvingProvider === action.key ? (
                    <CircularProgress size={22} />
                  ) : (
                    <Box component="img" src={action.icon} alt={action.label} sx={{ width: "auto", height: 28, display: "block" }} />
                  )
                ) : action.label}
              </Button>
            ))}
          </Stack>
        </Box>
      </Drawer>
      <Snackbar
        open={copyFeedbackOpen}
        autoHideDuration={2200}
        onClose={() => setCopyFeedbackOpen(false)}
        anchorOrigin={{ vertical: "top", horizontal: "center" }}
      >
        <Alert severity="success" onClose={() => setCopyFeedbackOpen(false)}>
          Copié dans le presse-papiers.
        </Alert>
      </Snackbar>
    </>
  );
}
