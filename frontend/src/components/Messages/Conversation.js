import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import CircularProgress from "@mui/material/CircularProgress";
import Divider from "@mui/material/Divider";
import IconButton from "@mui/material/IconButton";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import React, { useCallback, useContext, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";

import MessageComposer from "../Common/Composer/MessageComposer";
import DepositSong from "../Common/Deposit/parts/DepositSong";
import { getCookie } from "../Security/TokensUtils";
import { UserContext } from "../UserContext";
import { formatRelativeTime } from "../Utils/time";

function SongMessage({ song }) {
  const [open, setOpen] = useState(false);
  if (!song) {return null;}
  return (
    <Box sx={{ maxWidth: 420 }}>
      <DepositSong
        song={song}
        isRevealed
        playOpen={open}
        playSong={song}
        closePlay={() => setOpen(false)}
        openPlayFor={() => setOpen(true)}
        handleSongResolved={() => {}}
        renderFloatingReactions={() => null}
      />
    </Box>
  );
}

export default function Conversation({
  threadId,
  username,
  mode = "thread",
  viewer,
  isInDrawer = false,
  onThreadResolved,
  onClose,
  onThreadUpdated,
}) {
  const navigate = useNavigate();
  const { user } = useContext(UserContext) || {};
  const currentViewer = viewer || user;
  const [thread, setThread] = useState(null);
  const [statusPayload, setStatusPayload] = useState(null);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const [resolvedThreadId, setResolvedThreadId] = useState(threadId || null);
  const messagesContainerRef = useRef(null);
  const shouldStickToBottomRef = useRef(true);
  const previousMessageCountRef = useRef(0);

  const withCsrf = useCallback(() => ({ "Content-Type": "application/json", "X-CSRFToken": getCookie("csrftoken") }), []);

  const loadThread = useCallback(async (nextThreadId, { silent = false } = {}) => {
    if (!nextThreadId) {
      setThread(null);
      return;
    }
    if (!silent) {setLoading(true);}
    const res = await fetch(`/messages/thread/${nextThreadId}`, { credentials: "same-origin" });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(data?.detail || "Erreur chargement discussion");
    }
    setThread(data);
    onThreadUpdated?.(data);
    if (!silent) {setLoading(false);}
  }, [onThreadUpdated]);

  const resolveFromUsername = useCallback(async () => {
    if (!username) {return;}
    setLoading(true);
    const statusRes = await fetch(`/messages/status/${encodeURIComponent(username)}`, { credentials: "same-origin" });
    const statusData = await statusRes.json().catch(() => ({}));
    if (!statusRes.ok) {
      throw new Error(statusData?.detail || "Utilisateur introuvable.");
    }
    setStatusPayload(statusData);

    if (statusData?.thread_id) {
      setResolvedThreadId(statusData.thread_id);
      onThreadResolved?.(statusData.thread_id, statusData);
      await loadThread(statusData.thread_id, { silent: false });
      return;
    }

    setThread(null);
    onThreadResolved?.(null, statusData);
    setLoading(false);
  }, [loadThread, onThreadResolved, username]);

  useEffect(() => {
    let mounted = true;
    setError("");

    const bootstrap = async () => {
      try {
        if (mode === "username") {
          await resolveFromUsername();
        } else {
          setResolvedThreadId(threadId || null);
          await loadThread(threadId, { silent: false });
        }
      } catch (err) {
        if (mounted) {
          setError(err?.message || "Erreur de conversation.");
          setLoading(false);
        }
      }
    };

    bootstrap();
    return () => { mounted = false; };
  }, [loadThread, mode, resolveFromUsername, threadId]);

  useEffect(() => {
    const id = window.setInterval(() => {
      if (document.visibilityState !== "visible") {return;}
      if (mode === "username" && !resolvedThreadId) {
        resolveFromUsername().catch(() => {});
        return;
      }
      if (resolvedThreadId) {
        loadThread(resolvedThreadId, { silent: true }).catch(() => {});
      }
    }, 5000);
    return () => window.clearInterval(id);
  }, [loadThread, mode, resolveFromUsername, resolvedThreadId]);

  const canAutoScroll = useCallback(() => {
    const container = messagesContainerRef.current;
    if (!container) {return true;}
    const distanceFromBottom = container.scrollHeight - container.scrollTop - container.clientHeight;
    return distanceFromBottom < 96;
  }, []);

  const scrollToBottom = useCallback((behavior = "smooth") => {
    const container = messagesContainerRef.current;
    if (!container) {return;}
    container.scrollTo({ top: container.scrollHeight, behavior });
  }, []);

  useEffect(() => {
    const container = messagesContainerRef.current;
    if (!container) {return undefined;}
    const onScroll = () => {
      shouldStickToBottomRef.current = canAutoScroll();
    };
    container.addEventListener("scroll", onScroll);
    return () => container.removeEventListener("scroll", onScroll);
  }, [canAutoScroll]);

  useEffect(() => {
    const count = thread?.messages?.length || 0;
    const hasNewMessages = count > previousMessageCountRef.current;

    if (previousMessageCountRef.current === 0 && count > 0) {
      scrollToBottom("auto");
    } else if (hasNewMessages && shouldStickToBottomRef.current) {
      scrollToBottom("smooth");
    }

    previousMessageCountRef.current = count;
  }, [scrollToBottom, thread?.messages]);

  const sendRequest = async (payload) => {
    setSending(true);
    setError("");

    try {
      if (payload.scope === "thread_start") {
        const response = await fetch("/messages/thread/start", {
          method: "POST",
          credentials: "same-origin",
          headers: withCsrf(),
          body: JSON.stringify(payload.requestBody),
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) {
          throw new Error(data?.detail || "Impossible de créer la demande");
        }
        if (data?.thread_id) {
          setResolvedThreadId(data.thread_id);
          await loadThread(data.thread_id, { silent: false });
          onThreadResolved?.(data.thread_id, data);
        }
        return;
      }

      const response = await fetch(`/messages/thread/${resolvedThreadId}/reply`, {
        method: "POST",
        credentials: "same-origin",
        headers: withCsrf(),
        body: JSON.stringify(payload.requestBody),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(data?.detail || "Envoi impossible");
      }
      await loadThread(resolvedThreadId, { silent: true });
    } catch (err) {
      setError(err?.message || "Envoi impossible");
      throw err;
    } finally {
      setSending(false);
    }
  };

  const refuse = async () => {
    if (!resolvedThreadId) {return;}
    setError("");
    const response = await fetch(`/messages/thread/${resolvedThreadId}/refuse`, {
      method: "POST",
      credentials: "same-origin",
      headers: withCsrf(),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      setError(data?.detail || "Refus impossible");
      return;
    }
    await loadThread(resolvedThreadId, { silent: false });
  };

  const statusState = statusPayload?.state || "";
  const renderStatusOnly = mode === "username" && !resolvedThreadId;

  if (!currentViewer?.id) {
    return <Alert severity="info">Connecte-toi pour accéder à tes messages.</Alert>;
  }

  return (
    <Box sx={{ border: "1px solid", borderColor: "divider", borderRadius: 1, p: 2, minHeight: 380, height: "100%", display: "flex", flexDirection: "column" }}>
      {isInDrawer ? (
        <Box sx={{ display: "flex", justifyContent: "flex-end", mb: 1 }}>
          <IconButton onClick={onClose} aria-label="Fermer"><CloseIcon /></IconButton>
        </Box>
      ) : null}
      {error ? <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert> : null}
      {loading ? <CircularProgress size={20} /> : null}

      {!loading && renderStatusOnly ? (
        <>
          {statusState === "self" ? <Alert severity="info">Tu ne peux pas t’écrire à toi-même.</Alert> : null}
          {statusState === "pending_sent" ? <Alert severity="info">En attente de réponse.</Alert> : null}
          {statusState === "pending_received" ? <Alert severity="info">Réponds pour accepter la discussion.</Alert> : null}
          {!statusPayload?.allow_private_message_requests ? <Alert severity="warning">Ce profil n’accepte pas les demandes privées.</Alert> : null}
          {!statusState || (statusState === "can_start" && !statusPayload?.allow_private_message_requests)
            ? <Alert severity="error">Conversation indisponible.</Alert>
            : null}
          {statusState === "can_start" && statusPayload?.allow_private_message_requests ? (
            <MessageComposer
              scope="thread_start"
              target={{ targetUserId: statusPayload?.target_user?.id, username: statusPayload?.target_user?.username }}
              viewer={currentViewer}
              loading={sending}
              songRequired
              textLabel="Message"
              textPlaceholder="Message d’accompagnement (optionnel)"
              searchDrawerTitle="Attacher une chanson"
              songActionLabel="Choisir"
              drawerAnchor="right"
              onSubmit={sendRequest}
            />
          ) : null}
        </>
      ) : null}

      {!loading && thread ? (
        <Stack spacing={2} sx={{ minHeight: 0, height: "100%" }}>
          <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 1 }}>
            <Box>
              <Typography variant="h6" onClick={() => navigate(`/profile/${thread?.other_user?.username}`)} sx={{ cursor: "pointer" }}>
                {thread?.other_user?.display_name}
              </Typography>
              {thread?.is_pending_received ? <Typography variant="body2">Réponds pour accepter la discussion.</Typography> : null}
              {thread?.is_pending_sent ? <Typography variant="body2">En attente de réponse.</Typography> : null}
            </Box>
          </Box>
          <Divider />

          <Stack spacing={1} ref={messagesContainerRef} sx={{ overflowY: "auto", flex: 1, minHeight: 120 }}>
            {(thread?.messages || []).map((message) => (
              <Box key={message.id} sx={{ alignSelf: message?.sender?.id === currentViewer.id ? "flex-end" : "flex-start", maxWidth: "100%" }}>
                {message.message_type === "song" ? <SongMessage song={message.song} /> : null}
                {message.text ? <Typography sx={{ whiteSpace: "pre-wrap", mt: message.message_type === "song" ? 0.5 : 0 }}>{message.text}</Typography> : null}
                <Typography variant="caption">{formatRelativeTime(message.created_at)}</Typography>
              </Box>
            ))}
          </Stack>

          <Divider />

          <MessageComposer
            scope="thread_reply"
            target={{ threadId: thread?.id, username: thread?.other_user?.username }}
            viewer={currentViewer}
            loading={sending}
            notice={thread?.is_pending_sent ? "En attente de réponse." : ""}
            disabled={thread?.is_pending_sent}
            textLabel="Écrire"
            textPlaceholder={thread?.is_pending_sent ? "En attente de réponse" : "Écrire un message"}
            searchDrawerTitle="Attacher une chanson"
            songActionLabel="Choisir"
            drawerAnchor="right"
            onSubmit={sendRequest}
          />
          {thread?.is_pending_received ? <Button color="error" variant="outlined" onClick={refuse}>Refuser</Button> : null}
        </Stack>
      ) : null}
    </Box>
  );
}
