import ArrowUpwardIcon from "@mui/icons-material/ArrowUpward";
import LibraryMusicIcon from "@mui/icons-material/LibraryMusic";
import MoreVertIcon from "@mui/icons-material/MoreVert";
import Avatar from "@mui/material/Avatar";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Dialog from "@mui/material/Dialog";
import IconButton from "@mui/material/IconButton";
import Menu from "@mui/material/Menu";
import MenuItem from "@mui/material/MenuItem";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";

import { getCookie } from "../../../Security/TokensUtils";
import { formatRelativeTime } from "../../../Utils/time";
import ConfirmActionDialog from "../../ConfirmActionDialog";
import SearchPanel from "../../Search/SearchPanel";

const EMPTY_CONTEXT = { items: [], count: 0, viewer_state: {} };

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
  const [searchOpen, setSearchOpen] = useState(false);
  const [selectedSongOption, setSelectedSongOption] = useState(null);

  useEffect(() => {
    setContext(comments || EMPTY_CONTEXT);
  }, [comments]);

  const items = Array.isArray(context?.items) ? context.items : [];
  const count = Number.isFinite(Number(context?.count)) ? Number(context.count) : items.length;
  const viewerState = context?.viewer_state || {};
  const isFullUser = Boolean(viewer?.id && !viewer?.is_guest);
  const canPost = Boolean(isFullUser && viewerState?.can_post);
  const notice = viewerState?.notice || "";

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

  const closeMenu = () => {
    setMenuAnchorEl(null);
    setActiveComment(null);
  };

  const submitReply = async () => {
    if (submitting) {return;}

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

  return (
    <Box sx={boxSx}>
      <Box sx={{ borderLeft: "2px solid rgba(255,255,255,0.12)", pl: 2 }}>
        {loadingReplies ? <Typography variant="body2">Chargement des réponses…</Typography> : null}

        {!loadingReplies && count === 0 ? (
          <Typography variant="body2" sx={{ py: 1.5 }}>
            Aucune réponse pour l’instant.
          </Typography>
        ) : null}

        {!loadingReplies
          ? items.map((comment) => {
            const commentUser = comment?.user || {};
            const hasSongReply = Boolean(comment?.reply_deposit);
            const canNavigate = Boolean(commentUser?.username && !commentUser?.is_guest);

            return (
              <Box key={comment.id} sx={{ mb: 1.5 }}>
                <Box sx={{ display: "flex", alignItems: "flex-start", gap: 1 }}>
                  <Avatar
                    src={commentUser?.profile_picture_url || ""}
                    alt={commentUser?.display_name || commentUser?.username || "user"}
                    sx={{ width: 28, height: 28 }}
                  />
                  <Box sx={{ flex: 1, minWidth: 0 }}>
                    <Typography variant="subtitle2" component="div">
                      <Box
                        component="span"
                        sx={{
                          cursor: canNavigate ? "pointer" : "default",
                          textDecoration: canNavigate ? "underline" : "none",
                        }}
                        onClick={() => {
                          if (!canNavigate) {return;}
                          navigate(`/profile/${commentUser.username}`);
                        }}
                      >
                        {commentUser?.display_name || commentUser?.username || "anonyme"}
                      </Box>
                      <Typography component="span" variant="caption" sx={{ ml: 1, opacity: 0.7 }}>
                        {comment?.created_at ? formatRelativeTime(comment.created_at) : ""}
                      </Typography>
                    </Typography>

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

        {notice ? <Typography variant="body2" sx={{ mb: 1 }}>{notice}</Typography> : null}
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
              <Button size="small" onClick={() => setSearchOpen(true)}>Remplacer</Button>
              <Button size="small" color="inherit" onClick={() => setSelectedSongOption(null)}>Retirer</Button>
            </Box>
          </Box>
        ) : null}

        <Box sx={{ display: "flex", gap: 1, alignItems: "flex-end" }}>
          <IconButton onClick={() => setSearchOpen(true)} aria-label="Ajouter une chanson">
            <LibraryMusicIcon />
          </IconButton>
          <TextField
            fullWidth
            multiline
            minRows={1}
            maxRows={5}
            value={draft}
            onChange={(event) => {
              const nextValue = event.target.value || "";
              if (nextValue.length <= 100) {
                setDraft(nextValue);
              }
            }}
            label="Répondre"
            helperText=" "
          />
          <IconButton
            onClick={submitReply}
            disabled={!canPost || submitting || (!draft.trim() && !selectedSongOption)}
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

      <Dialog open={searchOpen} onClose={() => setSearchOpen(false)} fullWidth maxWidth="md">
        <Box sx={{ p: 2, height: "70vh" }}>
          <SearchPanel
            onSelectSong={(option) => {
              setSelectedSongOption(option || null);
              setSearchOpen(false);
            }}
            actionLabel="Choisir"
          />
        </Box>
      </Dialog>
    </Box>
  );
}
