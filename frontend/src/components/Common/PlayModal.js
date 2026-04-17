import React, { useEffect, useMemo, useState } from "react";
import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import ButtonBase from "@mui/material/ButtonBase";
import CircularProgress from "@mui/material/CircularProgress";
import ClickAwayListener from "@mui/material/ClickAwayListener";
import Snackbar from "@mui/material/Snackbar";
import ContentCopyOutlinedIcon from "@mui/icons-material/ContentCopyOutlined";
import Typography from "@mui/material/Typography";

import { getCookie } from "../Security/TokensUtils";

const logoByPlatform = {
  spotify: "/static/images/spotify_logo_icon.svg",
  deezer: "/static/images/deezer_logo_icon.svg",
  youtube: "/static/images/youtube_logo_icon.svg",
};

export default function PlayModal({ open, song, onClose, onSongResolved, children }) {
  const [resolvingProvider, setResolvingProvider] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [copyFeedbackOpen, setCopyFeedbackOpen] = useState(false);

  useEffect(() => {
    if (!open) {
      setResolvingProvider("");
      setErrorMessage("");
    }
  }, [open]);

  const artistText = useMemo(() => {
    if (song?.artist) return song.artist;
    if (Array.isArray(song?.artists)) return song.artists.join(", ");
    return "";
  }, [song]);

  const safeText = () => `${song?.title ?? ""} ${artistText}`.trim();

  const getProviderUrl = (providerCode) => {
    const directUrl = song?.provider_links?.[providerCode]?.provider_url;
    if (directUrl) return directUrl;
    if (providerCode === "spotify") return song?.spotify_url || "";
    if (providerCode === "deezer") return song?.deezer_url || "";
    return "";
  };

  const openWindow = (url) => {
    if (!url) return false;
    window.open(url, "_blank", "noopener,noreferrer");
    return true;
  };

  const resolveAndOpenProvider = async (providerCode) => {
    setErrorMessage("");

    const existingUrl = getProviderUrl(providerCode);
    if (existingUrl) {
      openWindow(existingUrl);
      onClose?.();
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
        setErrorMessage(
          data?.detail || "Impossible d’ouvrir cette plateforme. Essaie une autre plateforme ou copie le nom de la chanson."
        );
        if (data?.song) {
          onSongResolved?.(data.song);
        }
        return;
      }

      if (data?.song) {
        onSongResolved?.(data.song);
      }
      openWindow(data.provider_url);
      onClose?.();
    } catch (error) {
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
    const url = `https://www.youtube.com/results?search_query=${encodeURIComponent(q)}`;
    openWindow(url);
    onClose?.();
  };

  const copySongText = async () => {
    const text = `${song?.title ?? ""} - ${artistText}`.trim();
    try {
      await navigator.clipboard.writeText(text);
      setCopyFeedbackOpen(true);
      onClose?.();
    } catch {
      const ta = document.createElement("textarea");
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      document.body.removeChild(ta);
      setCopyFeedbackOpen(true);
      onClose?.();
    }
  };

  const actions = [
    {
      key: "spotify",
      label: "Ouvrir sur Spotify",
      onClick: () => resolveAndOpenProvider("spotify"),
      renderIcon: () => (
        <Box component="img" src={logoByPlatform.spotify} alt="Spotify" sx={{ width: 28, height: 28, display: "block" }} />
      ),
    },
    {
      key: "deezer",
      label: "Ouvrir sur Deezer",
      onClick: () => resolveAndOpenProvider("deezer"),
      renderIcon: () => (
        <Box component="img" src={logoByPlatform.deezer} alt="Deezer" sx={{ width: 28, height: 28, display: "block" }} />
      ),
    },
    {
      key: "youtube",
      label: "Ouvrir la recherche YouTube",
      onClick: openYouTubeSearch,
      renderIcon: () => (
        <Box component="img" src={logoByPlatform.youtube} alt="YouTube" sx={{ width: 28, height: 28, display: "block" }} />
      ),
    },
    {
      key: "copy",
      label: "Copier le nom de la chanson",
      onClick: copySongText,
      renderIcon: () => <ContentCopyOutlinedIcon sx={{ fontSize: 28, color: "var(--mm-color-text)" }} />,
    },
  ];

  return (
    <>
      <ClickAwayListener onClickAway={() => open && onClose?.()}>
        <Box
          sx={{
            position: "relative",
            display: "inline-flex",
            flexDirection: "column",
            alignItems: "flex-start",
            width: "fit-content",
            maxWidth: "100%",
            overflow: "visible",
          }}
        >
          {open && song ? (
            <Box
              onClick={(event) => event.stopPropagation()}
              sx={{
                position: "absolute",
                left: "calc(50% - 61px)",
                bottom: errorMessage ? "calc(100% + 56px)" : "calc(100% + 12px)",
                zIndex: 1000,
                gap: "12px",
                width: "max-content",
                overflow: "visible",
                display: "grid",
                gridTemplateColumns: "1fr 1fr",
              }}
            >
              {actions.map((action) => (
                <ButtonBase
                  key={action.key}
                  aria-label={action.label}
                  title={action.label}
                  onClick={(event) => {
                    event.stopPropagation();
                    action.onClick();
                  }}
                  disabled={Boolean(resolvingProvider) && resolvingProvider !== action.key}
                  sx={{
                    minWidth: 0,
                    backgroundColor: "var(--mm-color-surface)",
                    height: "56px",
                    width: "56px",
                    borderRadius: "var(--mm-radius-md)",
                    boxShadow: "var(--mm-shadow-high)",
                  }}
                >
                  {resolvingProvider === action.key ? <CircularProgress size={22} /> : action.renderIcon()}
                </ButtonBase>
              ))}
            </Box>
          ) : null}

          {open && errorMessage ? (
            <Box
              sx={{
                position: "absolute",
                left: "50%",
                transform: "translateX(-50%)",
                bottom: "calc(100% + 12px)",
                zIndex: 1001,
                width: 220,
                px: 1.5,
                py: 1,
                backgroundColor: "var(--mm-color-surface)",
                borderRadius: "var(--mm-radius-md)",
                boxShadow: "var(--mm-shadow-high)",
              }}
            >
              <Typography variant="body2">{errorMessage}</Typography>
            </Box>
          ) : null}

          {children}
        </Box>
      </ClickAwayListener>

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
