// frontend/src/components/Reactions/ReactionSummary.js

import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";

import Box from "@mui/material/Box";
import Drawer from "@mui/material/Drawer";
import Typography from "@mui/material/Typography";
import Avatar from "@mui/material/Avatar";
import Divider from "@mui/material/Divider";
import IconButton from "@mui/material/IconButton";
import CircularProgress from "@mui/material/CircularProgress";
import ArrowForwardIosIcon from "@mui/icons-material/ArrowForwardIos";
import CloseIcon from "@mui/icons-material/Close";

import { getCookie } from "../Security/TokensUtils";

function normalizeReactionUser(rawUser = {}) {
  const username = rawUser?.username || rawUser?.name || "";
  const safeUsername = (username || "").trim();

  return {
    username: safeUsername,
    displayName: safeUsername || "anonyme",
    profile_picture_url:
      rawUser?.profile_picture_url || rawUser?.profile_pic_url || null,
    isAnonymous:
      !safeUsername || String(safeUsername).toLowerCase() === "anonyme",
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
  const [profilesByName, setProfilesByName] = useState({});
  const [loadingProfiles, setLoadingProfiles] = useState(false);
  const viewerUsername = (viewer?.username || "").trim();

  useEffect(() => {
    if (!open) return;

    const rawList = Array.isArray(reactions) ? reactions : [];
    const uniqueUsernames = [
      ...new Set(
        rawList
          .map((r) => (r?.user?.username || r?.user?.name || "").trim())
          .filter(
            (name) => name && String(name).toLowerCase() !== "anonyme"
          )
      ),
    ];

    if (!uniqueUsernames.length) {
      setProfilesByName({});
      return;
    }

    let cancelled = false;

    async function run() {
      setLoadingProfiles(true);
      try {
        const entries = await Promise.all(
          uniqueUsernames.map(async (username) => {
            try {
              const res = await fetch(
                `/users/get-user-info?username=${encodeURIComponent(username)}`,
                {
                  headers: { Accept: "application/json" },
                  credentials: "same-origin",
                }
              );

              if (!res.ok) {
                return [username, null];
              }

              const data = await res.json().catch(() => null);
              if (!data) return [username, null];

              return [
                username,
                {
                  username: data?.username || username,
                  profile_picture_url: data?.profile_picture_url || null,
                },
              ];
            } catch {
              return [username, null];
            }
          })
        );

        if (cancelled) return;

        const nextMap = {};
        entries.forEach(([username, value]) => {
          nextMap[username] = value;
        });
        setProfilesByName(nextMap);
      } finally {
        if (!cancelled) setLoadingProfiles(false);
      }
    }

    run();

    return () => {
      cancelled = true;
    };
  }, [open, reactions]);

  const orderedReactions = useMemo(() => {
    const list = Array.isArray(reactions) ? [...reactions] : [];

    return list.sort((a, b) => {
      const aName = (a?.user?.name || "").trim();
      const bName = (b?.user?.name || "").trim();
      const aMine = viewerUsername && aName === viewerUsername ? 1 : 0;
      const bMine = viewerUsername && bName === viewerUsername ? 1 : 0;
      return bMine - aMine;
    });
  }, [reactions, viewerUsername]);

  const handleDeleteOwnReaction = async () => {
    if (!depPublicKey) {
      alert("Impossible de supprimer la réaction : dépôt introuvable.");
      return;
    }

    const csrftoken = getCookie("csrftoken");

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
      if (data?.error === "forbidden") {
        alert("Tu n’as pas débloqué cet emoji.");
      } else {
        alert("Oops, impossible d’appliquer ta réaction.");
      }
      return;
    }

    onApplied?.(data);
  };

  const renderReactionRow = (reaction, index) => {
    const rawName = (reaction?.user?.username || reaction?.user?.name || "").trim();
    const isMine = Boolean(viewerUsername && rawName === viewerUsername);

    const normalized = normalizeReactionUser({
      ...(reaction?.user || {}),
      username: reaction?.user?.username || reaction?.user?.name || "",
      profile_picture_url:
        reaction?.user?.profile_picture_url ||
        profilesByName?.[rawName]?.profile_picture_url ||
        null,
    });

    const resolvedUsername =
      profilesByName?.[rawName]?.username || normalized.username || "";
    const canNavigate = !isMine && Boolean(resolvedUsername);

    const handleClick = () => {
      if (isMine) {
        handleDeleteOwnReaction();
        return;
      }

      if (!canNavigate) return;

      onClose?.();
      navigate("/profile/" + resolvedUsername);
    };

    return (
      <Box key={`${reaction?.emoji || "emoji"}-${rawName || index}`}>
        <Box
          onClick={handleClick}
          role={isMine || canNavigate ? "button" : undefined}
          tabIndex={isMine || canNavigate ? 0 : -1}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              handleClick();
            }
          }}
          className={
            normalized?.username ? "hasUsername deposit_user" : "deposit_user"
          }
          sx={{
            py: 1.25,
            cursor: isMine || canNavigate ? "pointer" : "default",
            alignItems: "center",
          }}
        >
          <Typography
            variant="h4"
            component="span"
            sx={{
              minWidth: "1.6em",
              display: "inline-flex",
              justifyContent: "center",
              mr: 0.5,
            }}
          >
            {reaction?.emoji}
          </Typography>

          <Box className=" avatarbox">
            <Avatar
              src={normalized?.profile_picture_url || undefined}
              alt={normalized?.displayName || "anonyme"}
              className="avatar"
            />
          </Box>

          <Box
            sx={{
              display: "flex",
              flexDirection: "column",
              minWidth: 0,
              flex: 1,
            }}
          >
            <Typography component="span" className="username " variant="subtitle1">
              {normalized?.displayName || "anonyme"}
              {!normalized?.isAnonymous && <ArrowForwardIosIcon className="icon" />}
            </Typography>

            {isMine && (
              <Typography variant="body2" sx={{ opacity: 0.72 }}>
                Cliquer pour supprimer la réaction
              </Typography>
            )}
          </Box>
        </Box>
      </Box>
    );
  };

  return (
    <Drawer
      anchor="bottom"
      open={open}
      onClose={onClose}
      PaperProps={{
        sx: {
          borderTopLeftRadius: 20,
          borderTopRightRadius: 20,
          px: 2,
          pt: 1,
          pb: 3,
          maxHeight: "80vh",
          overflow: "hidden",
        },
      }}
    >
      <Box
        sx={{
          width: "100%",
          maxWidth: 720,
          mx: "auto",
          display: "flex",
          flexDirection: "column",
          minHeight: 180,
        }}
      >
        <Box
          sx={{
            width: 42,
            height: 5,
            borderRadius: 999,
            bgcolor: "text.disabled",
            opacity: 0.5,
            mx: "auto",
            mb: 1,
          }}
        />

        <Box
          sx={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            mb: 1,
          }}
        >
          <Typography variant="h2">Réactions</Typography>
          <IconButton aria-label="Fermer" onClick={onClose}>
            <CloseIcon />
          </IconButton>
        </Box>

        <Box
          sx={{
            overflowY: "auto",
            pr: 0.5,
            pb: 1,
          }}
        >
          {loadingProfiles && orderedReactions.length > 0 && (
            <Box sx={{ display: "flex", justifyContent: "center", py: 1 }}>
              <CircularProgress size={22} />
            </Box>
          )}

          {!orderedReactions.length ? (
            <Typography variant="body1" sx={{ py: 2 }}>
              Aucune réaction
            </Typography>
          ) : (
            orderedReactions.map((reaction, index) => renderReactionRow(reaction, index))
          )}

          {!!orderedReactions.length && <Divider sx={{ mt: 1 }} />}
        </Box>
      </Box>
    </Drawer>
  );
}
