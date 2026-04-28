import LibraryMusicIcon from "@mui/icons-material/LibraryMusic";
import SendIcon from "@mui/icons-material/Send";
import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Drawer from "@mui/material/Drawer";
import IconButton from "@mui/material/IconButton";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import React, { useMemo, useState } from "react";

import DepositSong from "../Deposit/parts/DepositSong";
import SearchPanel from "../Search/SearchPanel";

export function buildSongPreviewFromOption(option) {
  if (!option) {return null;}
  const artists = Array.isArray(option?.artists) ? option.artists.filter(Boolean) : [];
  return {
    title: option?.title || "",
    artist: artists.join(", "),
    image_url: option?.image_url || option?.image_url_small || "",
    provider_links: option?.provider_links || {},
  };
}

export function validateComposerPayload({ text, songOption, allowText, allowSong, songRequired }) {
  const trimmedText = String(text || "").trim();
  const hasText = Boolean(trimmedText);
  const hasSong = Boolean(songOption);

  if (!allowText && hasText) {
    return { valid: false, reason: "text_not_allowed", text: trimmedText };
  }
  if (!allowSong && hasSong) {
    return { valid: false, reason: "song_not_allowed", text: trimmedText };
  }
  if (songRequired && !hasSong) {
    return { valid: false, reason: "song_required", text: trimmedText };
  }
  if (!hasText && !hasSong) {
    return { valid: false, reason: "empty", text: trimmedText };
  }

  return { valid: true, text: trimmedText };
}

export function buildComposerPayload({ scope, target, text, songOption }) {
  const trimmedText = String(text || "").trim();
  const hasText = Boolean(trimmedText);
  const hasSong = Boolean(songOption);
  const previewSong = buildSongPreviewFromOption(songOption);

  let requestBody = {};
  if (scope === "comment") {
    requestBody = {
      dep_public_key: target?.depPublicKey,
      text: trimmedText,
      song_option: songOption || null,
    };
  } else if (scope === "thread_reply") {
    requestBody = {
      text: trimmedText,
      song: songOption || null,
    };
  } else {
    requestBody = {
      target_user_id: target?.targetUserId,
      text: trimmedText,
      song: songOption || null,
    };
  }

  return {
    scope,
    submitKind: hasText && hasSong ? "text+song" : hasSong ? "song" : "text",
    target,
    draft: {
      text,
      songOption,
    },
    previewSong,
    requestBody,
  };
}

export default function MessageComposer({
  scope,
  target,
  viewer: _viewer,
  disabled = false,
  loading = false,
  canSubmit = true,
  notice = "",
  blockReason = "",
  maxTextLength = 300,
  textLabel = "Message",
  textPlaceholder = "Écrire un message",
  submitLabel = "Envoyer",
  attachSongLabel = "Ajouter une chanson",
  songActionLabel = "Choisir",
  songRequired = false,
  drawerAnchor = "right",
  searchDrawerTitle = "Attacher une chanson",
  initialText = "",
  initialSongOption = null,
  allowText = true,
  allowSong = true,
  autoClearOnSuccess = true,
  onSubmit,
  onSuccess,
  onError,
  onBlockedInteraction,
  onOpenSongDrawer,
  onCloseSongDrawer,
}) {
  const [text, setText] = useState(initialText || "");
  const [songOption, setSongOption] = useState(initialSongOption || null);
  const [songDrawerOpen, setSongDrawerOpen] = useState(false);
  const [localError, setLocalError] = useState("");

  const isBlocked = Boolean(disabled || !canSubmit || blockReason);
  const previewSong = useMemo(() => buildSongPreviewFromOption(songOption), [songOption]);

  const emitBlockedInteraction = () => {
    if (isBlocked) {
      onBlockedInteraction?.();
    }
  };

  const handleOpenSongDrawer = () => {
    if (isBlocked || !allowSong) {
      emitBlockedInteraction();
      return;
    }
    setSongDrawerOpen(true);
    onOpenSongDrawer?.();
  };

  const handleCloseSongDrawer = () => {
    setSongDrawerOpen(false);
    onCloseSongDrawer?.();
  };

  const handleSubmit = async () => {
    if (loading) {return;}
    if (isBlocked) {
      emitBlockedInteraction();
      return;
    }

    const validation = validateComposerPayload({
      text,
      songOption,
      allowText,
      allowSong,
      songRequired,
    });

    if (!validation.valid) {
      const nextError = validation.reason === "song_required"
        ? "Une chanson est requise."
        : "Le message est vide.";
      setLocalError(nextError);
      onError?.(new Error(nextError));
      return;
    }

    const payload = buildComposerPayload({ scope, target, text: validation.text, songOption });

    setLocalError("");
    try {
      await onSubmit?.(payload);
      onSuccess?.(payload);
      if (autoClearOnSuccess) {
        setText("");
        setSongOption(null);
      }
    } catch (error) {
      onError?.(error);
    }
  };

  return (
    <Box>
      {notice ? <Typography variant="body2" sx={{ mb: 1 }}>{notice}</Typography> : null}
      {localError ? <Alert severity="error" sx={{ mb: 1 }}>{localError}</Alert> : null}

      {previewSong ? (
        <Box sx={{ mb: 1 }}>
          <DepositSong variant="list" song={previewSong} isRevealed />
          <Box sx={{ display: "flex", justifyContent: "flex-end", gap: 1, mt: 0.5 }}>
            <Button size="small" onClick={handleOpenSongDrawer}>Remplacer</Button>
            <Button size="small" color="inherit" onClick={() => setSongOption(null)}>Retirer</Button>
          </Box>
        </Box>
      ) : null}

      <Box sx={{ display: "flex", gap: 1, alignItems: "center" }}>
        {allowSong ? (
          <IconButton onClick={handleOpenSongDrawer} aria-label={attachSongLabel} disabled={loading || isBlocked}>
            <LibraryMusicIcon sx={{ color : "var(--mm-color-primary)" }} />
          </IconButton>
        ) : null}
        {allowText ? (
          <TextField
            fullWidth
            multiline
            minRows={1}
            maxRows={5}
            label={textLabel}
            placeholder={textPlaceholder}
            value={text}
            inputProps={{
              maxLength: maxTextLength,
              readOnly: isBlocked,
            }}
            onClick={emitBlockedInteraction}
            onFocus={emitBlockedInteraction}
            onChange={(event) => {
              if (isBlocked) {return;}
              setText(event.target.value || "");
            }}
          />
        ) : null}
        <IconButton onClick={handleSubmit} aria-label={submitLabel} disabled={loading || isBlocked}>
          <SendIcon sx={{ color : "var(--mm-color-primary)" }} />
        </IconButton>
      </Box>

      <Drawer
        anchor={drawerAnchor}
        open={songDrawerOpen}
        onClose={handleCloseSongDrawer}
        PaperProps={{
          sx: {
            width: "100vw",
            maxWidth: "100vw",
            height: "100vh",
            overflow: "hidden",
          },
        }}
      >
        <Box sx={{ display: "flex", flexDirection: "column", height: "100%" }}>
          <Box sx={{ p: 5, pb: 2 }}>
            <Typography component="h2" variant="h3" sx={{ mb: 3 }}>
              {searchDrawerTitle}
            </Typography>
          </Box>
          {songDrawerOpen ? (
            <SearchPanel
              onSelectSong={(option) => {
                setSongOption(option || null);
                handleCloseSongDrawer();
              }}
              actionLabel={songActionLabel}
              rootSx={{ flex: 1, minHeight: 0 }}
              searchBarWrapperSx={{ px: 5, pb: 2 }}
              contentSx={{ overflowX: "hidden", overflowY: "scroll", flex: 1, pb: "96px" }}
            />
          ) : null}
          <Button variant="contained" onClick={handleCloseSongDrawer} className="bottom_fixed">
            Fermer
          </Button>
        </Box>
      </Drawer>
    </Box>
  );
}
