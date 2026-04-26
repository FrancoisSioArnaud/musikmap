import ArrowUpwardIcon from "@mui/icons-material/ArrowUpward";
import Alert from "@mui/material/Alert";
import LibraryMusicIcon from "@mui/icons-material/LibraryMusic";
import MoreVertIcon from "@mui/icons-material/MoreVert";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Dialog from "@mui/material/Dialog";
import DialogActions from "@mui/material/DialogActions";
import DialogContent from "@mui/material/DialogContent";
import DialogTitle from "@mui/material/DialogTitle";
import Drawer from "@mui/material/Drawer";
import IconButton from "@mui/material/IconButton";
import Menu from "@mui/material/Menu";
import MenuItem from "@mui/material/MenuItem";
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
import { formatRelativeTime } from "../../../Utils/time";
import ConfirmActionDialog from "../../ConfirmActionDialog";
import SearchPanel from "../../Search/SearchPanel";
import UserInline from "../../UserInline";

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
  boxSx,
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
  const [menuAnchorEl, setMenuAnchorEl] = useState(null);
  const [activeComment, setActiveComment] = useState(null);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [reporting, setReporting] = useState(false);
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
  const notice = viewerState?.notice || "";
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

  const closeMenu = () => {
    setMenuAnchorEl(null);
    setActiveComment(null);
  };

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

  const handleDelete = async () => {
    if (!activeComment?.id || deleting) {return;}

    setDeleting(true);
    setError("");
    try {
      const response = await fetch(`/box-management/comments/${activeComment.id}/`, {
        method: "DELETE",
        credentials: "same-origin",
        headers: {
          "X-CSRFToken": getCookie("csrftoken"),
        },
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(payload?.detail || "Impossible de supprimer la réponse.");
      }

      const nextComments = payload?.comments || EMPTY_CONTEXT;
      setContext(nextComments);
      onCommentsChange?.(nextComments);
      setDeleteOpen(false);
      closeMenu();
    } catch (err) {
      setError(err?.message || "Impossible de supprimer la réponse.");
    } finally {
      setDeleting(false);
    }
  };

  const handleReport = async () => {
    if (!activeComment?.id || reporting) {return;}
    setReporting(true);
    setError("");
    try {
      const response = await fetch(`/box-management/comments/${activeComment.id}/report/`, {
        method: "POST",
        credentials: "same-origin",
        headers: {
          "Content-Type": "application/json",
          "X-CSRFToken": getCookie("csrftoken"),
        },
        body: JSON.stringify({ reason: "spam" }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(payload?.detail || "Impossible de signaler la réponse.");
      }
      closeMenu();
    } catch (err) {
      setError(err?.message || "Impossible de signaler la réponse.");
    } finally {
      setReporting(false);
    }
  };

  if (!open) {return null;}

  const handleBlockedComposerInteraction = () => {
    if (!isConsecutiveReplyBlocked) {return;}
    setIsConsecutiveReplyDialogOpen(true);
  };

  return (
    <Box sx={boxSx}>
      <Box sx={{ borderLeft: "2px solid rgba(255,255,255,0.12)", pl: 2 }}>
        {loadingReplies ? <Typography variant="body2">Chargement des réponses…</Typography> : null}

        {!loadingReplies && count === 0 ? (
          <Alert severity="info" sx={{ my: 1.5 }}>
            Aucune réponse pour l’instant.
          </Alert>
        ) : null}

        {!loadingReplies
          ? items.map((comment) => {
            const commentUser = comment?.user || {};
            const hasSongReply = Boolean(comment?.reply_deposit);
            return (
              <Box key={comment.id} sx={{ mb: 1.5 }}>
                <Box sx={{ display: "flex", alignItems: "flex-start", gap: 1 }}>
                  <Box sx={{ flex: 1, minWidth: 0 }}>
                    <Box sx={{ display: "flex", alignItems: "center", minWidth: 0, gap: 1 }}>
                      <Box sx={{ minWidth: 0, flex: 1 }}>
                        <UserInline user={commentUser} avatarSize={28} />
                      </Box>
                      <Typography component="span" variant="caption" sx={{ opacity: 0.7, whiteSpace: "nowrap", flex: "0 0 auto" }}>
                        {comment?.created_at ? formatRelativeTime(comment.created_at) : ""}
                      </Typography>
                    </Box>

                    {comment?.text ? (
                      <Typography variant="body2" sx={{ whiteSpace: "pre-wrap", mt: 0.5 }}>
                        {comment.text}
                      </Typography>
                    ) : null}

                    {hasSongReply && DepositComponent ? (
                      <Box sx={{ mt: 1 }}>
                        <DepositComponent
                          dep={comment.reply_deposit}
                          user={viewer}
                          variant="list"
                          context="comment"
                          showDate={false}
                          showUser={false}
                          showCommentAction={false}
                        />
                      </Box>
                    ) : null}
                  </Box>

                  <IconButton
                    size="small"
                    onClick={(event) => {
                      setMenuAnchorEl(event.currentTarget);
                      setActiveComment(comment || null);
                    }}
                  >
                    <MoreVertIcon fontSize="small" />
                  </IconButton>
                </Box>
              </Box>
            );
          })
          : null}

        {inlineNotice ? <Typography variant="body2" sx={{ mb: 1 }}>{inlineNotice}</Typography> : null}
        {error ? <Typography variant="body2" color="error" sx={{ mb: 1 }}>{error}</Typography> : null}

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

        <Box sx={{ display: "flex", gap: 1, alignItems: "flex-end" }}>
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

      <Menu anchorEl={menuAnchorEl} open={Boolean(menuAnchorEl)} onClose={closeMenu}>
        {activeComment?.is_mine ? (
          <MenuItem
            onClick={() => {
              setDeleteOpen(true);
              setMenuAnchorEl(null);
            }}
          >
            Supprimer ma réponse
          </MenuItem>
        ) : null}
        {!activeComment?.is_mine ? (
          <MenuItem onClick={handleReport} disabled={reporting}>
            {reporting ? "Signalement…" : "Signaler la réponse"}
          </MenuItem>
        ) : null}
      </Menu>

      <ConfirmActionDialog
        open={deleteOpen}
        onClose={() => {
          setDeleteOpen(false);
          closeMenu();
        }}
        onConfirm={handleDelete}
        title="Supprimer cette réponse ?"
        description="Cette action masquera la réponse."
        confirmLabel={deleting ? "Suppression…" : "Supprimer"}
        loading={deleting}
      />

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
        onClose={() => setIsConsecutiveReplyDialogOpen(false)}
        fullWidth
        maxWidth="xs"
      >
        <DialogTitle>Réponse indisponible</DialogTitle>
        <DialogContent>Tu ne peux pas envoyer deux réponses d’affilé</DialogContent>
        <DialogActions>
          <Button onClick={() => setIsConsecutiveReplyDialogOpen(false)}>J’ai compris</Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
