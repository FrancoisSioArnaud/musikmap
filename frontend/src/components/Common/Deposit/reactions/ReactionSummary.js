import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Drawer from "@mui/material/Drawer";
import Typography from "@mui/material/Typography";
import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";

import { getCookie } from "../../../Security/TokensUtils";
import UserInline from "../../UserInline";

function normalizeReactionUser(rawUser = {}) {
  const isGuest = Boolean(rawUser?.is_guest);
  const username = (rawUser?.username || "").trim();
  const displayName = (rawUser?.display_name || rawUser?.displayName || rawUser?.name || username || "anonyme").trim();

  return {
    id: rawUser?.id || null,
    username: username || "",
    displayName: displayName || "anonyme",
    profile_picture_url: rawUser?.profile_picture_url || null,
    isGuest,
    isAnonymous:
      (!username && !rawUser?.id) || String(displayName).toLowerCase() === "anonyme",
  };
}

export default function ReactionSummary({
  open,
  onClose,
  depPublicKey,
  reactions = [],
  viewer = null,
  onApplied,
}) {
  const navigate = useNavigate();
  const viewerId = viewer?.id || null;
  const [inlineAlert, setInlineAlert] = useState({ severity: "error", message: "" });
  const [deletingReaction, setDeletingReaction] = useState(false);

  useEffect(() => {
    if (!open) {
      setInlineAlert({ severity: "error", message: "" });
      setDeletingReaction(false);
    }
  }, [open]);

  const orderedReactions = useMemo(() => {
    const list = Array.isArray(reactions) ? [...reactions] : [];

    return list.sort((a, b) => {
      const aMine = viewerId && (a?.user?.id || null) === viewerId ? 1 : 0;
      const bMine = viewerId && (b?.user?.id || null) === viewerId ? 1 : 0;
      return bMine - aMine;
    });
  }, [reactions, viewerId]);

  const handleDeleteOwnReaction = async () => {
    if (deletingReaction) {
      return;
    }

    if (!depPublicKey) {
      setInlineAlert({ severity: "error", message: "Impossible de supprimer la réaction : dépôt introuvable." });
      return;
    }

    setInlineAlert({ severity: "error", message: "" });
    setDeletingReaction(true);
    const csrftoken = getCookie("csrftoken");

    try {
      const res = await fetch("/box-management/reactions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-CSRFToken": csrftoken,
        },
        credentials: "same-origin",
        body: JSON.stringify({
          dep_public_key: depPublicKey,
          emoji_id: null,
        }),
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        if (data?.code === "EMOJI_NOT_UNLOCKED") {
          setInlineAlert({ severity: "warning", message: data?.detail || "Tu n’as pas débloqué cet emoji." });
        } else {
          setInlineAlert({ severity: "error", message: data?.detail || "Oops, impossible d’appliquer ta réaction." });
        }
        return;
      }

      onApplied?.(data);
    } catch (error) {
      setInlineAlert({ severity: "error", message: "Oops, impossible d’appliquer ta réaction." });
    } finally {
      setDeletingReaction(false);
    }
  };

  const renderReactionRow = (reaction, index) => {
    const normalized = normalizeReactionUser(reaction?.user || {});
    const isMine = Boolean(viewerId && normalized.id === viewerId);
    return (
      <Box
        key={`${reaction?.emoji || "emoji"}-${normalized.id || normalized.username || index}`}
        className={normalized?.username ? "hasUsername reaction" : "reaction"}
        sx={{
          py: 1.25,
          alignItems: "center",
          display: "flex",
          flexDirection: "row",
          gap: 2,
        }}
      >
        <Typography variant="h4" component="span" className="emoji">
          {reaction?.emoji}
        </Typography>

        <Box className="texts" sx={{ minWidth: 0, flex: 1 }}>
          <UserInline
            user={{
              username: normalized?.username,
              display_name: normalized?.displayName,
              profile_picture_url: normalized?.profile_picture_url,
              is_guest: normalized?.isGuest,
            }}
            subtitle={isMine ? "tape ici pour supprimer ta réaction" : ""}
            onClick={isMine ? handleDeleteOwnReaction : undefined}
            onNavigateProfile={(username) => {
              onClose?.({ replace: true });
              navigate(`/profile/${username}`);
            }}
          />
        </Box>
      </Box>
    );
  };

  return (
    <Drawer
      anchor="bottom"
      open={open}
      onClose={() => onClose?.()}
      className="reaction_summary_modal"
      PaperProps={{
        sx: {
          borderTopLeftRadius: "var(--mm-radius-xl)",
          borderTopRightRadius: "var(--mm-radius-xl)",
          maxHeight: "80vh",
          overflow: "hidden",
          padding: "26px 20px 0px 20px ",
        },
      }}
    >
      <Box
        className="reaction_summary_panel"
        sx={{
          width: "100%",
          maxWidth: 720,
          mx: "auto",
          display: "flex",
          flexDirection: "column",
          gap: "16px",
          minHeight: 0,
          flex: 1,
        }}
      >
        <Box className="intro_small">
          <Typography variant="h3" component="h3">
            Réactions
          </Typography>
        </Box>

        {inlineAlert.message ? <Alert severity={inlineAlert.severity}>{inlineAlert.message}</Alert> : null}

        <Box className="reactions_list">
          {!orderedReactions.length ? (
            <Typography variant="body1" sx={{ py: 2 }}>
              Aucune réaction
            </Typography>
          ) : (
            orderedReactions.map((reaction, index) => renderReactionRow(reaction, index))
          )}
        </Box>
      </Box>
    </Drawer>
  );
}
