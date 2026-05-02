import CloseIcon from "@mui/icons-material/CloseRounded";
import Alert from "@mui/material/Alert";
import Avatar from "@mui/material/Avatar";
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
import SongCompact from "../Common/Song/SongCompact";
import UserInline from "../Common/UserInline";
import { getCookie } from "../Security/TokensUtils";
import { UserContext } from "../UserContext";
import { formatRelativeTime } from "../Utils/time";

function SongMessage({ song }) {
  if (!song) {return null;}
  return (
    <Box sx={{ width: "100%", maxWidth: 420 }}>
      <SongCompact
        song={song}
        playButton="icon"
        coverSize={48}
        className="song"
      />
    </Box>
  );
}

export default function Conversation({
  username,
  viewer,
  isInDrawer = false,
  onClose,
  onThreadUpdated,
}) {
  const navigate = useNavigate();
  const { user } = useContext(UserContext) || {};
  const currentViewer = viewer || user;
  const [thread, setThread] = useState(null);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const [resolvedThreadId, setResolvedThreadId] = useState(null);
  const messagesContainerRef = useRef(null);
  const shouldStickToBottomRef = useRef(true);
  const previousMessageCountRef = useRef(0);

  const withCsrf = useCallback(() => ({ "Content-Type": "application/json", "X-CSRFToken": getCookie("csrftoken") }), []);

  const loadThread = useCallback(async ({ silent = false } = {}) => {
    if (!username) { setThread(null); return null; }
    if (!silent) {setLoading(true);}
    const res = await fetch(`/messages/threads/${encodeURIComponent(username)}`, { credentials: "same-origin" });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(data?.detail || "Erreur chargement discussion");
    }
    setThread(data);
    if (!silent) {setLoading(false);}
    return data;
  }, []);


  useEffect(() => { let mounted = true; setError(""); loadThread({ silent: false }).catch((err) => { if (mounted) { setError(err?.message || "Erreur de conversation."); setLoading(false); } }); return () => { mounted = false; }; }, [loadThread]);

  useEffect(() => {
    const id = window.setInterval(() => {
      if (document.visibilityState !== "visible") {return;}
      loadThread({ silent: true }).catch(() => {});
    }, 5000);
    return () => window.clearInterval(id);
  }, [loadThread]);

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
          const nextThread = await loadThread({ silent: false });
          onThreadUpdated?.(nextThread || data);
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
      const nextThread = await loadThread({ silent: true });
      onThreadUpdated?.(nextThread);
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
    const nextThread = await loadThread({ silent: false });
    onThreadUpdated?.(nextThread);
  };

  const headerUser = thread?.other_user || (username ? { username } : null);

  if (!currentViewer?.id) {
    return <Alert severity="info">Connecte-toi pour accéder à tes messages.</Alert>;
  }

  return (
    <Box sx={{ minHeight: 380, height: "100%", display: "flex", flexDirection: "column" }}>
      {isInDrawer ? (
        <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 1, mb: 1.5 }}>
          <Box sx={{ minWidth: 0, flex: 1 }}>
            {headerUser ? <UserInline user={headerUser} avatarSize={32} /> : null}
          </Box>
          <IconButton onClick={onClose} aria-label="Fermer" sx={{ flex: "0 0 auto" }}>
            <CloseIcon />
          </IconButton>
        </Box>
      ) : null}
      {error ? <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert> : null}
      {loading ? <CircularProgress size={20} /> : null}

      
      {!loading && thread ? (
        <Stack spacing={2} sx={{ minHeight: 0, height: "100%" }}>

          <Stack spacing={4} ref={messagesContainerRef} sx={{ overflowY: "auto", flex: 1, minHeight: 120}}>
            {(thread?.messages || []).map((message) => {
              const isOwnMessage = message?.sender_id === currentViewer.id;
              return (
                <Box
                  key={message.id}
                  sx={{
                    display: "flex",
                    alignItems: "flex-end",
                    justifyContent: isOwnMessage ? "flex-end" : "flex-start",
                    gap: "6px",
                    maxWidth: "100%",
                  }}
                >
                  {!isOwnMessage ? (
                    <Avatar
                      src={thread?.other_user?.profile_picture_url || undefined}
                      alt={thread?.other_user?.display_name || thread?.other_user?.username || "Utilisateur"}
                      sx={{ width: 28, height: 28, flex: "0 0 auto", marginBottom: "27px" }}
                    />
                  ) : null}
                  <Box sx={{ 
                        maxWidth: "min(420px, 70%)",
                        display: "flex",
                        gap:"6px",
                        flexDirection: "column",
                        alignItems: isOwnMessage ? "flex-end" : "flex-start",
                          }}>
                    {message.message_type === "song" ? <SongMessage song={message.song} /> : null}
                    {message.text ? <Typography variant="body1" sx={{ backgroundColor: isOwnMessage ? "var(--mm-color-primary-light)" : "var(--mm-color-secondary-light)", p: "12px 16px", borderRadius: "var(--mm-radius-xs)", whiteSpace: "pre-wrap", mt: message.message_type === "song" ? 0.5 : 0 }}>{message.text}</Typography> : null}
                    <Typography variant="body2" sx={{ opacity : "var(--mm-opacity-light-text)", p: "0 6px", mt:"-2px" }}>{formatRelativeTime(message.created_at)}</Typography>
                  </Box>
                </Box>
              );
            })}
          </Stack>

          <Divider />

          <MessageComposer
            scope={thread?.id ? "thread_reply" : "thread_start"}
            target={thread?.id ? { threadId: thread?.id, username: thread?.other_user?.username } : { targetUserId: thread?.other_user?.id, username: thread?.other_user?.username }}
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
