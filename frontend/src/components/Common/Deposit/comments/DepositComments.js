import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import React, { useEffect, useState } from "react";

import { getCookie } from "../../../Security/TokensUtils";
import MessageComposer from "../../Composer/MessageComposer";

import Comment from "./Comment";

const EMPTY_CONTEXT = { items: [], count: 0, viewer_state: {} };

export default function DepositComments({
  open,
  depPublicKey,
  comments,
  viewer,
  onCommentsChange,
  isParentRevealed,
  DepositComponent,
}) {
  const [context, setContext] = useState(comments || EMPTY_CONTEXT);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [loadingReplies, setLoadingReplies] = useState(false);
  const [hasLoaded, setHasLoaded] = useState(false);

  useEffect(() => {
    setContext(comments || EMPTY_CONTEXT);
  }, [comments]);

  const items = Array.isArray(context?.items) ? context.items : [];
  const count = Number.isFinite(Number(context?.count)) ? Number(context.count) : items.length;
  const viewerState = context?.viewer_state || {};
  const isFullUser = Boolean(viewer?.id && !viewer?.is_guest);
  const canPost = Boolean(isFullUser && viewerState?.can_post);
  const notice = typeof viewerState?.notice === "string" ? viewerState.notice : "";

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

  if (!open) {return null;}

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

        {notice ? <Typography variant="body2" sx={{ mb: 1 }}>{notice}</Typography> : null}
        {error ? <Typography variant="body2" color="error" sx={{ mb: 1 }}>{error}</Typography> : null}

        <Box className="composer_container">
          <MessageComposer
            scope="comment"
            target={{ depPublicKey }}
            viewer={viewer}
            loading={submitting}
            canSubmit={canPost}
            maxTextLength={100}
            songRequired={false}
            drawerAnchor="right"
            searchDrawerTitle="Attacher une chanson"
            attachSongLabel="Attacher une chanson"
            songActionLabel="Choisir"
            textLabel="Répondre"
            textPlaceholder=""
            onSubmit={async (payload) => {
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
                  body: JSON.stringify(payload.requestBody),
                });

                const responsePayload = await response.json().catch(() => ({}));
                if (!response.ok) {
                  throw new Error(responsePayload?.detail || "Impossible d’envoyer la réponse.");
                }

                const nextComments = responsePayload?.comments || EMPTY_CONTEXT;
                setContext(nextComments);
                onCommentsChange?.(nextComments);
                setHasLoaded(true);
              } catch (err) {
                setError(err?.message || "Impossible d’envoyer la réponse.");
                throw err;
              } finally {
                setSubmitting(false);
              }
            }}
          />

          {!isFullUser ? (
            <Typography variant="caption" sx={{ opacity: 0.8 }}>
              Connecte-toi pour répondre.
            </Typography>
          ) : null}
        </Box>
      </Box>

    </Box>
  );
}
