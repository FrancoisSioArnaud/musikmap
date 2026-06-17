import MoreVertIcon from "@mui/icons-material/MoreVertRounded";
import Box from "@mui/material/Box";
import IconButton from "@mui/material/IconButton";
import Menu from "@mui/material/Menu";
import MenuItem from "@mui/material/MenuItem";
import { Card, Typography } from "@mui/material";
import React, { useState } from "react";

import { getCookie } from "../../../Security/TokensUtils";
import { formatRelativeTime } from "../../../Utils/time";
import ConfirmActionDialog from "../../ConfirmActionDialog";
import SongCompact from "../../Song/SongCompact";
import UserInline from "../../UserInline";

const EMPTY_CONTEXT = { items: [], count: 0, viewer_state: {} };

export default function Comment({ comment, onCommentsChange }) {
  const [menuAnchorEl, setMenuAnchorEl] = useState(null);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [reporting, setReporting] = useState(false);
  const [actionError, setActionError] = useState("");

  const commentUser = comment?.user || {};
  const replySong = comment?.reply_deposit?.song || null;
  const hasSongReply = Boolean(replySong);

  const closeMenu = () => {
    setMenuAnchorEl(null);
  };

  const handleDelete = async () => {
    if (!comment?.id || deleting) {return;}

    setDeleting(true);
    setActionError("");
    try {
      const response = await fetch(`/box-management/comments/${comment.id}/`, {
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
      onCommentsChange?.(nextComments);
      setDeleteOpen(false);
      closeMenu();
    } catch (err) {
      setActionError(err?.message || "Impossible de supprimer la réponse.");
    } finally {
      setDeleting(false);
    }
  };

  const handleReport = async () => {
    if (!comment?.id || reporting) {return;}
    setReporting(true);
    setActionError("");
    try {
      const response = await fetch(`/box-management/comments/${comment.id}/report/`, {
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
      setActionError(err?.message || "Impossible de signaler la réponse.");
    } finally {
      setReporting(false);
    }
  };

  return (
    <div className="comment">
      <div className="comment_header">
        <div className="comment_header_user">
          <UserInline user={commentUser} avatarSize={32} />
        </div>
        <Typography variant="body2" className="comment_date">
          {comment?.created_at ? formatRelativeTime(comment.created_at) : ""}
        </Typography>
        <IconButton
          size="small"
          className="comment_menu_button"
          onClick={(event) => setMenuAnchorEl(event.currentTarget)}
        >
          <MoreVertIcon fontSize="small" />
        </IconButton>
      </div>

      <div className="comment_content">
        {hasSongReply ? (
          <SongCompact
            song={replySong}
            playButton="icon"
            coverSize={48}
            className="song"
          />
        ) : null}
          {comment?.text ? (
            <Card className="comment_message">
              <Typography variant="body1">
                {comment.text}
              </Typography>
            </Card>
          ) : null}
      </div>

      {actionError ? (
        <Box className="comment_action_error">
          <Typography variant="body2" color="error">{actionError}</Typography>
        </Box>
      ) : null}

      <Menu anchorEl={menuAnchorEl} open={Boolean(menuAnchorEl)} onClose={closeMenu}>
        {comment?.is_mine ? (
          <MenuItem
            onClick={() => {
              setDeleteOpen(true);
              setMenuAnchorEl(null);
            }}
          >
            Supprimer ma réponse
          </MenuItem>
        ) : null}
        {!comment?.is_mine ? (
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
    </div>
  );
}
