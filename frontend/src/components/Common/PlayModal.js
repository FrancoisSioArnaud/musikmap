import React from "react";
import Box from "@mui/material/Box";
import ButtonBase from "@mui/material/ButtonBase";
import ClickAwayListener from "@mui/material/ClickAwayListener";
import ContentCopyOutlinedIcon from "@mui/icons-material/ContentCopyOutlined";

const logoByPlatform = {
  spotify: "/static/images/spotify_logo_icon.svg",
  deezer: "/static/images/deezer_logo_icon.svg",
  youtube: "/static/images/youtube_logo_icon.svg",
};

export default function PlayModal({ open, song, onClose, children }) {
  const safeText = () => `${song?.title ?? ""} ${song?.artist ?? ""}`.trim();

  const openOrAlert = (url) => {
    if (url) {
      window.open(url, "_blank", "noopener,noreferrer");
      return;
    }

    window.alert(
      "Oops ! Une erreur s'est produite, utilise le bouton « Copier le nom de la chanson » pour cette fois."
    );
  };

  const openYouTubeSearch = () => {
    const q = safeText();

    if (!q) {
      window.alert(
        "Oops ! Une erreur s'est produite, utilise le bouton « Copier le nom de la chanson » pour cette fois."
      );
      return;
    }

    const url = `https://www.youtube.com/results?search_query=${encodeURIComponent(q)}`;
    window.open(url, "_blank", "noopener,noreferrer");
  };

  const copySongText = async () => {
    const text = `${song?.title ?? ""} - ${song?.artist ?? ""}`.trim();

    try {
      await navigator.clipboard.writeText(text);
      window.alert("Copié dans le presse-papiers !");
    } catch {
      const ta = document.createElement("textarea");
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      document.body.removeChild(ta);
      window.alert("Copié dans le presse-papiers !");
    }
  };

  const actions = [
    {
      key: "spotify",
      label: "Ouvrir sur Spotify",
      onClick: () => openOrAlert(song?.spotify_url),
      renderIcon: () => (
        <Box
          component="img"
          src={logoByPlatform.spotify}
          alt="Spotify"
          sx={{ width: 28, height: 28, display: "block" }}
        />
      ),
    },
    {
      key: "deezer",
      label: "Ouvrir sur Deezer",
      onClick: () => openOrAlert(song?.deezer_url),
      renderIcon: () => (
        <Box
          component="img"
          src={logoByPlatform.deezer}
          alt="Deezer"
          sx={{ width: 28, height: 28, display: "block" }}
        />
      ),
    },
    {
      key: "youtube",
      label: "Ouvrir la recherche YouTube",
      onClick: openYouTubeSearch,
      renderIcon: () => (
        <Box
          component="img"
          src={logoByPlatform.youtube}
          alt="YouTube"
          sx={{ width: 28, height: 28, display: "block" }}
        />
      ),
    },
    {
      key: "copy",
      label: "Copier le nom de la chanson",
      onClick: copySongText,
      renderIcon: () => (
        <ContentCopyOutlinedIcon
          sx={{ fontSize: 28, color: "var(--mm-color-text)" }}
        />
      ),
    },
  ];

  return (
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
              left: 0,
              bottom: "calc(100% - 24px)",
              zIndex: 3,
              display: "flex",
              alignItems: "center",
              gap: 1,
              flexWrap: "wrap",
              width: "max-content",
              maxWidth: "min(220px, calc(100vw - 32px))",
              overflow: "visible",
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
                  onClose?.();
                }}
                sx={{
                  minWidth: 0,
                  backgroundColor: "transparent",
                  backgroundColor: "var(--mm-color-surface)",
                  height: "42px",
                  width: "42px",
                  borderRadius: "var(--mm-radius-md)",
                  boxShadow: "var(--m-shadow-high)",
                }}
              >
                {action.renderIcon()}
              </ButtonBase>
            ))}
          </Box>
        ) : null}

        {children}
      </Box>
    </ClickAwayListener>
  );
}
