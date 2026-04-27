import ArrowUpwardIcon from "@mui/icons-material/ArrowUpward";
import LibraryMusicIcon from "@mui/icons-material/LibraryMusic";
import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Dialog from "@mui/material/Dialog";
import DialogActions from "@mui/material/DialogActions";
import DialogContent from "@mui/material/DialogContent";
import DialogTitle from "@mui/material/DialogTitle";
import Drawer from "@mui/material/Drawer";
import IconButton from "@mui/material/IconButton";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";

import { getCookie } from "../../../Security/TokensUtils";
import {
  closeDrawerWithHistory,
  matchesDrawerSearch,
  openDrawerWithHistory,
} from "../../../Utils/drawerHistory";
import SearchPanel from "../../Search/SearchPanel";

import Comment from "./Comment";

const EMPTY_CONTEXT = { items: [], count: 0, viewer_state: {} };
const COMMENT_SONG_DRAWER_PARAM = "commentDrawer";

function buildSongFromOption(option) {
  const artists = Array.isArray(option?.artists) ? option.artists.filter(Boolean) : [];
  return {
    title: option?.title || "",
    artist: artists.join(", "),
    image_url: option?.image_url || option?.image_url_small || "",
    provider_links: option?.provider_links || {},
  };
}

export default function DepositComments({
  open,
  depPublicKey,
  comments,
  viewer,
  onCommentsChange,
  isParentRevealed,
  DepositComponent,
}) {
  const navigate = useNavigate();
  const location = useLocation();
  const [context, setContext] = useState(comments || EMPTY_CONTEXT);
  const [draft, setDraft] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [loadingReplies, setLoadingReplies] = useState(false);
  const [hasLoaded, setHasLoaded] = useState(false);
  const [songDrawerOpen, setSongDrawerOpen] = useState(false);
  const [selectedSongOption, setSelectedSongOption] = useState(null);
  const [isConsecutiveReplyDialogOpen, setIsConsecutiveReplyDialogOpen] = useState(false);

  useEffect(() => {
    setContext(comments || EMPTY_CONTEXT);
  }, [comments]);

  const items = Array.isArray(context?.items) ? context.items : [];
  const count = Number.isFinite(Number(context?.count)) ? Number(context.count) : items.length;
  const viewerState = context?.viewer_state || {};
  const isFullUser = Boolean(viewer?.id && !viewer?.is_guest);
  const canPost = Boolean(isFullUser && viewerState?.can_post);
  const notice = typeof viewerState?.notice === "string" ? viewerState.notice : "";
  const isConsecutiveReplyBlocked = Boolean(
    isFullUser && !canPost && notice.toLowerCase().includes("deux réponses"),
  );
  const inlineNotice = isConsecutiveReplyBlocked ? "" : notice;
  const commentSongDrawerValue = useMemo(
    () => `song-reply-${depPublicKey || "unknown"}`,
    [depPublicKey],
  );

  const selectedSongPreviewDep = useMemo(() => {
    if (!selectedSongOption) {return null;}
    return {
      public_key: `draft-${depPublicKey || "comment"}`,
      deposited_at: new Date().toISOString(),
      deposit_type: "comment",
      song: buildSongFromOption(selectedSongOption),
      user: viewer || {},
      comments: EMPTY_CONTEXT,
      reactions: [],
      my_reaction: null,
    };
  }, [depPublicKey, selectedSongOption, viewer]);

  useEffect(() => {
    if (!open || hasLoaded || loadingReplies || !depPublicKey || !isParentRevealed) {return;}

    const loadReplies = async () => {
      setLoadingReplies(true);
      setError("");
      try {
        const response = await fetch(`/box-management/comments/deposit/${depPublicKey}/`, {
          method: "GET",
          credentials: "same-origin",
        });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) {
          throw new Error(payload?.detail || "Impossible de charger les réponses.");
        }
        const nextComments = payload?.comments || EMPTY_CONTEXT;
        setContext(nextComments);
        onCommentsChange?.(nextComments);
        setHasLoaded(true);
      } catch (err) {
        setError(err?.message || "Impossible de charger les réponses.");
      } finally {
        setLoadingReplies(false);
      }
    };

    loadReplies();
  }, [depPublicKey, hasLoaded, isParentRevealed, loadingReplies, onCommentsChange, open]);

  useEffect(() => {
    const shouldOpenDrawer = matchesDrawerSearch(
      location,
      COMMENT_SONG_DRAWER_PARAM,
      commentSongDrawerValue,
    );

    if (shouldOpenDrawer) {
      setSongDrawerOpen((prev) => (prev ? prev : true));
      return;
    }

    setSongDrawerOpen(false);
  }, [commentSongDrawerValue, location]);

  const closeSongDrawer = useCallback((options = {}) => {
    if (
      closeDrawerWithHistory({
        navigate,
        location,
        param: COMMENT_SONG_DRAWER_PARAM,
        value: commentSongDrawerValue,
        replace: Boolean(options?.replace),
      })
    ) {
      return;
    }

    setSongDrawerOpen(false);
  }, [commentSongDrawerValue, location, navigate]);

  const openSongDrawer = useCallback(() => {
    if (isConsecutiveReplyBlocked) {
      setIsConsecutiveReplyDialogOpen(true);
      return;
    }

    openDrawerWithHistory({
      navigate,
      location,
      param: COMMENT_SONG_DRAWER_PARAM,
      value: commentSongDrawerValue,
    });
  }, [commentSongDrawerValue, isConsecutiveReplyBlocked, location, navigate]);

  const submitReply = async () => {
    if (submitting) {return;}
    if (isConsecutiveReplyBlocked) {
      setIsConsecutiveReplyDialogOpen(true);
      return;
    }

    const nextText = (draft || "").trim();
    if (!nextText && !selectedSongOption) {
      setError("Le commentaire est vide.");
      return;
    }

    setSubmitting(true);
    setError("");

    try {
      const response = await fetch("/box-management/comments/", {
        method: "POST",
        credentials: "same-origin",
        headers: {
          "Content-Type": "application/json",
          "X-CSRFToken": getCookie("csrftoken"),
        },
        body: JSON.stringify({
          dep_public_key: depPublicKey,
          text: nextText,
          song_option: selectedSongOption,
        }),
      });

      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(payload?.detail || "Impossible d’envoyer la réponse.");
      }

      const nextComments = payload?.comments || EMPTY_CONTEXT;
      setContext(nextComments);
      onCommentsChange?.(nextComments);
      setDraft("");
      setSelectedSongOption(null);
      setHasLoaded(true);
    } catch (err) {
      setError(err?.message || "Impossible d’envoyer la réponse.");
    } finally {
      setSubmitting(false);
    }
  };

  if (!open) {return null;}

  const closeConsecutiveReplyDialog = () => {
    document.activeElement?.blur?.();
    setIsConsecutiveReplyDialogOpen(false);
  };

  const handleBlockedComposerInteraction = () => {
    if (!isConsecutiveReplyBlocked || isConsecutiveReplyDialogOpen) {return;}
    setIsConsecutiveReplyDialogOpen(true);
  };

  return (
    <Box sx={{ width:"100%" }}>
      <Box className="comments_list">
        {loadingReplies ? <Typography variant="body2">Chargement des réponses…</Typography> : null}

        {!loadingReplies && count === 0 ? (
          <Alert severity="info" sx={{ my: 1.5 }}>
            Aucune réponse pour l’instant.
          </Alert>
        ) : null}

        {!loadingReplies
          ? items.map((comment) => (
            <Comment
              key={comment.id}
              comment={comment}
              viewer={viewer}
              DepositComponent={DepositComponent}
              onCommentsChange={(nextComments) => {
                setContext(nextComments || EMPTY_CONTEXT);
                onCommentsChange?.(nextComments || EMPTY_CONTEXT);
              }}
            />
          ))
          : null}

        {inlineNotice ? <Typography variant="body2" sx={{ mb: 1 }}>{inlineNotice}</Typography> : null}
        {error ? <Typography variant="body2" color="error" sx={{ mb: 1 }}>{error}</Typography> : null}

        <Box className="composer_container">
          {selectedSongPreviewDep && DepositComponent ? (
            <Box sx={{ mb: 1 }}>
              <DepositComponent
                dep={selectedSongPreviewDep}
                user={viewer}
                variant="list"
                context="comment"
                showDate={false}
                showUser={false}
                showCommentAction={false}
              />
              <Box sx={{ display: "flex", justifyContent: "flex-end", gap: 1, mt: 0.5 }}>
                <Button size="small" onClick={openSongDrawer}>Remplacer</Button>
                <Button size="small" color="inherit" onClick={() => setSelectedSongOption(null)}>Retirer</Button>
              </Box>
            </Box>
          ) : null}
  
          <Box className="comment_composer">
            <IconButton onClick={openSongDrawer} aria-label="Ajouter une chanson">
              <LibraryMusicIcon />
            </IconButton>
            <TextField
              fullWidth
              multiline
              minRows={1}
              maxRows={5}
              value={draft}
              onClick={handleBlockedComposerInteraction}
              onFocus={handleBlockedComposerInteraction}
              onChange={(event) => {
                if (isConsecutiveReplyBlocked) {return;}
                const nextValue = event.target.value || "";
                if (nextValue.length <= 100) {
                  setDraft(nextValue);
                }
              }}
              label="Répondre"
              inputProps={{ readOnly: isConsecutiveReplyBlocked }}
            />
            <IconButton
              onClick={submitReply}
              disabled={(!canPost && !isConsecutiveReplyBlocked) || submitting || (!draft.trim() && !selectedSongOption)}
              aria-label="Publier la réponse"
            >
              <ArrowUpwardIcon />
            </IconButton>
          </Box>
  
          {!isFullUser ? (
            <Typography variant="caption" sx={{ opacity: 0.8 }}>
              Connecte-toi pour répondre.
            </Typography>
          ) : null}
        </Box>
      </Box>

      <Drawer
        anchor="right"
        open={songDrawerOpen}
        onClose={() => closeSongDrawer()}
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
              Attacher une chanson
            </Typography>
          </Box>

          {songDrawerOpen ? (
            <SearchPanel
              onSelectSong={(option) => {
                setSelectedSongOption(option || null);
                closeSongDrawer({ replace: true });
              }}
              actionLabel="Choisir"
              rootSx={{ flex: 1, minHeight: 0 }}
              searchBarWrapperSx={{ px: 5, pb: 2 }}
              contentSx={{ overflowX: "hidden", overflowY: "scroll", flex: 1, pb: "96px" }}
            />
          ) : null}

          <Button variant="contained" onClick={() => closeSongDrawer()} className="bottom_fixed">
            Fermer
          </Button>
        </Box>
      </Drawer>

      <Dialog
        open={isConsecutiveReplyDialogOpen}
        onClose={closeConsecutiveReplyDialog}
        disableRestoreFocus
        fullWidth
        maxWidth="xs"
      >
        <DialogTitle>Réponse indisponible</DialogTitle>
        <DialogContent>Tu ne peux pas envoyer deux réponses d’affilé</DialogContent>
        <DialogActions>
          <Button onClick={closeConsecutiveReplyDialog}>J’ai compris</Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
