import React, { useMemo, useState } from "react";
import Box from "@mui/material/Box";
import Stack from "@mui/material/Stack";
import Avatar from "@mui/material/Avatar";
import Typography from "@mui/material/Typography";
import IconButton from "@mui/material/IconButton";
import Menu from "@mui/material/Menu";
import MenuItem from "@mui/material/MenuItem";
import TextField from "@mui/material/TextField";
import Button from "@mui/material/Button";
import Dialog from "@mui/material/Dialog";
import DialogTitle from "@mui/material/DialogTitle";
import DialogContent from "@mui/material/DialogContent";
import DialogActions from "@mui/material/DialogActions";
import RadioGroup from "@mui/material/RadioGroup";
import FormControlLabel from "@mui/material/FormControlLabel";
import Radio from "@mui/material/Radio";
import MoreVertIcon from "@mui/icons-material/MoreVert";
import { getCookie } from "../Security/TokensUtils";

const REPORT_REASONS = [
  { value: "harassment", label: "Insulte / harcèlement" },
  { value: "personal_info", label: "Information personnelle" },
  { value: "spam", label: "Spam" },
  { value: "other", label: "Autre" },
];

export default function DepositComments({
  depPublicKey,
  comments,
  viewer,
  onCommentsChange,
}) {
  const [draft, setDraft] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [menuAnchorEl, setMenuAnchorEl] = useState(null);
  const [activeComment, setActiveComment] = useState(null);
  const [reportOpen, setReportOpen] = useState(false);
  const [reportReason, setReportReason] = useState("harassment");
  const [reporting, setReporting] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const items = Array.isArray(comments?.items) ? comments.items : [];
  const viewerState = comments?.viewer_state || {};
  const isFullUser = Boolean(viewer?.id && !viewer?.is_guest);
  const canPost = Boolean(isFullUser && viewerState?.can_post);
  const notice = viewerState?.notice || "";

  const remaining = useMemo(() => {
    const currentLength = draft.trim().length;
    return 100 - currentLength;
  }, [draft]);

  const closeMenu = (clearActive = true) => {
    setMenuAnchorEl(null);
    if (clearActive) {
      setActiveComment(null);
    }
  };

  const openMenuFor = (event, comment) => {
    setMenuAnchorEl(event.currentTarget);
    setActiveComment(comment || null);
  };

  const handleSubmit = async () => {
    if (!canPost || submitting) return;

    const nextText = draft.trim();
    if (!nextText) {
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
        }),
      });

      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(payload?.detail || "Impossible d’enregistrer le commentaire.");
      }

      setDraft("");
      onCommentsChange?.(payload?.comments || { items: [], viewer_state: {} });
    } catch (err) {
      setError(err?.message || "Impossible d’enregistrer le commentaire.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async () => {
    if (!activeComment?.id || deleting) return;
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
        throw new Error(payload?.detail || "Impossible de supprimer le commentaire.");
      }
      onCommentsChange?.(payload?.comments || { items: [], viewer_state: {} });
      closeMenu();
    } catch (err) {
      setError(err?.message || "Impossible de supprimer le commentaire.");
    } finally {
      setDeleting(false);
    }
  };

  const openReportDialog = () => {
    setReportOpen(true);
    closeMenu(false);
  };

  const handleReport = async () => {
    if (!activeComment?.id || reporting) return;
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
        body: JSON.stringify({ reason: reportReason }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(payload?.detail || "Impossible de signaler le commentaire.");
      }
      setReportOpen(false);
      setActiveComment(null);
    } catch (err) {
      setError(err?.message || "Impossible de signaler le commentaire.");
    } finally {
      setReporting(false);
    }
  };

  return (
    <Box className="deposit_comments">
      {items.length > 0 && (
        <Stack spacing={1.5}>
          {items.map((comment) => {
            const commentUser = comment?.user || {};
            const isMine = Boolean(comment?.is_mine);

            return (
              <Box key={comment.id} className="deposit_comment">
                <Stack direction="row" spacing={1.5} alignItems="flex-start">
                  <Avatar
                    src={commentUser?.profile_picture_url || ""}
                    alt={commentUser?.display_name || commentUser?.username || "user"}
                  />

                  <Box className="texts" sx={{ flex: 1, minWidth: 0 }}>
                    <Typography variant="subtitle2">
                      {commentUser?.display_name || commentUser?.username || "anonyme"}
                    </Typography>
                    <Typography variant="body2">{comment?.text || ""}</Typography>
                  </Box>

                  <IconButton onClick={(event) => openMenuFor(event, comment)}>
                    <MoreVertIcon />
                  </IconButton>
                </Stack>

                <Menu
                  anchorEl={menuAnchorEl}
                  open={Boolean(menuAnchorEl && activeComment?.id === comment.id)}
                  onClose={closeMenu}
                >
                  {isMine ? (
                    <MenuItem onClick={handleDelete}>Supprimer mon commentaire</MenuItem>
                  ) : (
                    <MenuItem onClick={openReportDialog}>Signaler le commentaire</MenuItem>
                  )}
                </Menu>
              </Box>
            );
          })}
        </Stack>
      )}

      {notice ? (
        <Typography variant="body2">{notice}</Typography>
      ) : null}

      {error ? (
        <Typography variant="body2">{error}</Typography>
      ) : null}

      {canPost ? (
        <Box className="deposit_comment_form">
          <TextField
            fullWidth
            multiline
            minRows={2}
            maxRows={4}
            value={draft}
            onChange={(event) => {
              const nextValue = event.target.value || "";
              if (nextValue.length <= 100) {
                setDraft(nextValue);
              }
            }}
            label="Commenter"
            helperText={`${remaining} caractère${remaining > 1 ? "s" : ""} restant`}
          />
          <Button onClick={handleSubmit} disabled={submitting || !draft.trim()}>
            Publier
          </Button>
        </Box>
      ) : null}

      <Dialog open={reportOpen} onClose={() => { setReportOpen(false); setActiveComment(null); }}>
        <DialogTitle>Signaler le commentaire</DialogTitle>
        <DialogContent>
          <RadioGroup value={reportReason} onChange={(event) => setReportReason(event.target.value)}>
            {REPORT_REASONS.map((reason) => (
              <FormControlLabel
                key={reason.value}
                value={reason.value}
                control={<Radio />}
                label={reason.label}
              />
            ))}
          </RadioGroup>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => { setReportOpen(false); setActiveComment(null); }}>Annuler</Button>
          <Button onClick={handleReport} disabled={reporting}>Signaler</Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
