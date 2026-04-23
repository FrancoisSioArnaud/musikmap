import MusicNoteIcon from "@mui/icons-material/MusicNote";
import SendIcon from "@mui/icons-material/Send";
import Alert from "@mui/material/Alert";
import Avatar from "@mui/material/Avatar";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import CircularProgress from "@mui/material/CircularProgress";
import Divider from "@mui/material/Divider";
import Drawer from "@mui/material/Drawer";
import List from "@mui/material/List";
import ListItemButton from "@mui/material/ListItemButton";
import ListItemText from "@mui/material/ListItemText";
import Stack from "@mui/material/Stack";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import React, { useCallback, useContext, useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";

import { DepositSong } from "../Common/Deposit/index";
import SearchPanel from "../Common/Search/SearchPanel";
import { getCookie } from "../Security/TokensUtils";
import { UserContext } from "../UserContext";
import { formatRelativeTime } from "../Utils/time";

function MessageRow({ item, active, onClick }) {
  const preview = item?.last_message?.text || (item?.last_message?.message_type === "song" ? "🎵 Chanson" : "");
  return (
    <ListItemButton selected={active} onClick={onClick}>
      <Avatar src={item?.other_user?.profile_picture_url || undefined} sx={{ mr: 1.5 }} />
      <ListItemText
        primary={item?.other_user?.display_name || "Utilisateur"}
        secondary={preview || (item?.is_pending_sent ? "En attente de réponse" : "")}
      />
      <Typography variant="caption">{formatRelativeTime(item?.updated_at)}</Typography>
    </ListItemButton>
  );
}

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

export default function MessagesPage() {
  const { user } = useContext(UserContext) || {};
  const location = useLocation();
  const navigate = useNavigate();

  const params = useMemo(() => new URLSearchParams(location.search), [location.search]);
  const queryThreadId = Number(params.get("thread") || 0);
  const queryTargetUserId = Number(params.get("targetUserId") || 0);

  const [summary, setSummary] = useState({ received_requests: [], conversations: [] });
  const [selectedThreadId, setSelectedThreadId] = useState(queryThreadId || null);
  const [thread, setThread] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadingThread, setLoadingThread] = useState(false);
  const [error, setError] = useState("");
  const [composeText, setComposeText] = useState("");
  const [songDrawerOpen, setSongDrawerOpen] = useState(false);
  const [startDrawerOpen, setStartDrawerOpen] = useState(Boolean(queryTargetUserId && !queryThreadId));

  const withCsrf = useCallback(() => ({ "Content-Type": "application/json", "X-CSRFToken": getCookie("csrftoken") }), []);

  const loadSummary = useCallback(async () => {
    const res = await fetch("/messages/summary", { credentials: "same-origin" });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {throw new Error(data?.detail || "Erreur chargement messages");}
    setSummary(data);
    if (!selectedThreadId && data?.conversations?.[0]?.id) {
      setSelectedThreadId(data.conversations[0].id);
    }
  }, [selectedThreadId]);

  const loadThread = useCallback(async (threadId) => {
    if (!threadId) {setThread(null);return;}
    setLoadingThread(true);
    const res = await fetch(`/messages/thread/${threadId}`, { credentials: "same-origin" });
    const data = await res.json().catch(() => ({}));
    setLoadingThread(false);
    if (!res.ok) {throw new Error(data?.detail || "Erreur chargement discussion");}
    setThread(data);
  }, []);

  useEffect(() => {
    let mounted = true;
    setLoading(true);
    loadSummary().catch((e) => mounted && setError(e.message)).finally(() => mounted && setLoading(false));
    return () => { mounted = false; };
  }, [loadSummary]);

  useEffect(() => {
    if (!selectedThreadId) {return;}
    loadThread(selectedThreadId).catch((e) => setError(e.message));
  }, [selectedThreadId, loadThread]);

  useEffect(() => {
    const id = window.setInterval(() => {
      if (document.visibilityState !== "visible") {return;}
      loadSummary().catch(() => {});
    }, 12000);
    return () => window.clearInterval(id);
  }, [loadSummary]);

  useEffect(() => {
    if (!selectedThreadId) {return;}
    const id = window.setInterval(() => {
      if (document.visibilityState !== "visible") {return;}
      loadThread(selectedThreadId).catch(() => {});
    }, 5000);
    return () => window.clearInterval(id);
  }, [selectedThreadId, loadThread]);

  const sendReply = async ({ text = "", song = null }) => {
    if (!thread?.id) {return;}
    const res = await fetch(`/messages/thread/${thread.id}/reply`, {
      method: "POST",
      credentials: "same-origin",
      headers: withCsrf(),
      body: JSON.stringify({ text, song }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {throw new Error(data?.detail || "Envoi impossible");}
    setComposeText("");
    await loadSummary();
    await loadThread(thread.id);
  };

  const refuse = async () => {
    const res = await fetch(`/messages/thread/${thread.id}/refuse`, {
      method: "POST",
      credentials: "same-origin",
      headers: withCsrf(),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data?.detail || "Refus impossible");
    }
    await loadSummary();
    await loadThread(thread.id);
  };

  const startRequest = async (songOption) => {
    const res = await fetch("/messages/thread/start", {
      method: "POST",
      credentials: "same-origin",
      headers: withCsrf(),
      body: JSON.stringify({ target_user_id: queryTargetUserId, song: songOption, text: composeText }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(data?.detail || "Impossible de créer la demande");
    }
    setStartDrawerOpen(false);
    setComposeText("");
    await loadSummary();
    if (data?.thread_id) {
      setSelectedThreadId(data.thread_id);
      navigate(`/messages?thread=${data.thread_id}`, { replace: true });
    }
  };

  if (!user?.id) {
    return <Box sx={{ p: 2 }}><Alert severity="info">Connecte-toi pour accéder à tes messages.</Alert></Box>;
  }

  return (
    <Box sx={{ p: 2, pb: 8 }}>
      <Typography variant="h4" sx={{ mb: 2 }}>Messages</Typography>
      {error ? <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert> : null}
      {loading ? <CircularProgress /> : (
        <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", md: "320px 1fr" }, gap: 2 }}>
          <Box>
            <Typography variant="h6">Demandes reçues</Typography>
            <List dense>
              {(summary?.received_requests || []).map((item) => (
                <MessageRow key={`req-${item.id}`} item={item} active={item.id === selectedThreadId} onClick={() => setSelectedThreadId(item.id)} />
              ))}
            </List>
            <Divider sx={{ my: 1 }} />
            <Typography variant="h6">Conversations</Typography>
            <List dense>
              {(summary?.conversations || []).map((item) => (
                <MessageRow key={`conv-${item.id}`} item={item} active={item.id === selectedThreadId} onClick={() => setSelectedThreadId(item.id)} />
              ))}
            </List>
          </Box>

          <Box sx={{ border: "1px solid", borderColor: "divider", borderRadius: 1, p: 2, minHeight: 380 }}>
            {!selectedThreadId ? (
              <Typography variant="body1">Sélectionne une discussion.</Typography>
            ) : loadingThread ? (
              <CircularProgress size={20} />
            ) : thread ? (
              <Stack spacing={2}>
                <Box>
                  <Typography variant="h6">{thread?.other_user?.display_name}</Typography>
                  {thread?.is_pending_received ? <Typography variant="body2">Réponds pour accepter la discussion.</Typography> : null}
                  {thread?.is_pending_sent ? <Typography variant="body2">En attente de réponse.</Typography> : null}
                </Box>
                <Divider />
                <Stack spacing={1}>
                  {(thread?.messages || []).map((message) => (
                    <Box key={message.id} sx={{ alignSelf: message?.sender?.id === user.id ? "flex-end" : "flex-start", maxWidth: "100%" }}>
                      {message.message_type === "song" ? <SongMessage song={message.song} /> : null}
                      {message.text ? <Typography sx={{ whiteSpace: "pre-wrap", mt: message.message_type === "song" ? 0.5 : 0 }}>{message.text}</Typography> : null}
                      <Typography variant="caption">{formatRelativeTime(message.created_at)}</Typography>
                    </Box>
                  ))}
                </Stack>

                <Divider />
                <Stack direction={{ xs: "column", sm: "row" }} spacing={1}>
                  <TextField
                    fullWidth
                    multiline
                    minRows={2}
                    maxRows={6}
                    value={composeText}
                    inputProps={{ maxLength: 300 }}
                    onChange={(event) => setComposeText(event.target.value)}
                    placeholder={thread?.is_pending_sent ? "En attente de réponse" : "Écrire un message"}
                    disabled={thread?.is_pending_sent}
                  />
                  <Button variant="outlined" startIcon={<MusicNoteIcon />} disabled={thread?.is_pending_sent} onClick={() => setSongDrawerOpen(true)}>
                    Chanson
                  </Button>
                  <Button variant="contained" startIcon={<SendIcon />} disabled={!composeText.trim() || thread?.is_pending_sent} onClick={() => sendReply({ text: composeText })}>
                    Envoyer
                  </Button>
                </Stack>
                {thread?.is_pending_received ? <Button color="error" variant="outlined" onClick={refuse}>Refuser</Button> : null}
              </Stack>
            ) : null}
          </Box>
        </Box>
      )}

      <Drawer anchor="bottom" open={songDrawerOpen} onClose={() => setSongDrawerOpen(false)}>
        <Box sx={{ p: 2, height: "70vh" }}>
          <Typography variant="h6" sx={{ mb: 1 }}>Choisir une chanson</Typography>
          <SearchPanel
            actionLabel="Envoyer"
            onSelectSong={async (option) => {
              try {
                await sendReply({ text: "", song: option });
                setSongDrawerOpen(false);
              } catch (e) {
                setError(e.message);
              }
            }}
          />
        </Box>
      </Drawer>

      <Drawer anchor="bottom" open={startDrawerOpen} onClose={() => setStartDrawerOpen(false)}>
        <Box sx={{ p: 2, height: "75vh" }}>
          <Typography variant="h6">Envoyer une chanson en privé</Typography>
          <Typography variant="body2" sx={{ mb: 1 }}>La chanson est obligatoire pour démarrer la discussion.</Typography>
          <TextField
            fullWidth
            multiline
            minRows={2}
            maxRows={4}
            value={composeText}
            inputProps={{ maxLength: 300 }}
            onChange={(event) => setComposeText(event.target.value)}
            placeholder="Message d’accompagnement (optionnel)"
            sx={{ mb: 1 }}
          />
          <SearchPanel actionLabel="Envoyer" onSelectSong={startRequest} />
        </Box>
      </Drawer>
    </Box>
  );
}
