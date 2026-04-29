import Alert from "@mui/material/Alert";
import Badge from "@mui/material/Badge";
import Box from "@mui/material/Box";
import CircularProgress from "@mui/material/CircularProgress";
import Drawer from "@mui/material/Drawer";
import List from "@mui/material/List";
import ListItemButton from "@mui/material/ListItemButton";
import { useTheme } from "@mui/material/styles";
import Tab from "@mui/material/Tab";
import Tabs from "@mui/material/Tabs";
import Typography from "@mui/material/Typography";
import useMediaQuery from "@mui/material/useMediaQuery";
import React, { useCallback, useContext, useEffect, useMemo, useState } from "react";

import UserInline from "../Common/UserInline";
import { UserContext } from "../UserContext";
import { formatRelativeTime } from "../Utils/time";

import Conversation from "./Conversation";

function MessageRow({ item, active, onClick }) {
  let preview = item?.last_message?.text || "";
  if (!preview && item?.last_message?.message_type === "song") {
    preview = "A partagé une chanson";
  }
  if (!preview && item?.is_pending_sent) {
    preview = "En attente de réponse";
  }

  return (
    <ListItemButton
      selected={active}
      onClick={onClick}
      sx={{
        opacity: item?.has_unread ? 1 : 0.8,
        alignItems: "flex-start",
        gap: 1,
      }}
    >
      <Box sx={{ flex: 1, minWidth: 0 }}>
        <UserInline
          user={item?.other_user}
          subtitle={preview}
          avatarSize={32}
          className="message_row_user"
          interactive={false}
        />
      </Box>
      <Typography variant="caption" sx={{ flex: "0 0 auto", pt: 0.5, whiteSpace: "nowrap" }}>
        {formatRelativeTime(item?.updated_at)}
      </Typography>
    </ListItemButton>
  );
}

export default function MessagesPage() {
  const { user } = useContext(UserContext) || {};
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down("md"));
  const [summary, setSummary] = useState({
    received_requests: [],
    conversations: [],
    unread_conversations_count: 0,
    pending_invitations_count: 0,
  });
  const [selectedThreadId, setSelectedThreadId] = useState(null);
  const [activeTab, setActiveTab] = useState("conversations");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [mobileDrawerOpen, setMobileDrawerOpen] = useState(false);

  const loadSummary = useCallback(async () => {
    const res = await fetch("/messages/summary", { credentials: "same-origin" });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {throw new Error(data?.detail || "Erreur chargement messages");}
    setSummary(data);
    const firstId = data?.conversations?.[0]?.id || data?.received_requests?.[0]?.id || null;
    if (firstId) {
      setSelectedThreadId((prev) => prev || firstId);
    }
  }, []);

  const refreshSummaryAfterThreadMutation = useCallback(() => {
    loadSummary().catch(() => {});
  }, [loadSummary]);

  useEffect(() => {
    let mounted = true;
    setLoading(true);
    loadSummary().catch((e) => mounted && setError(e.message)).finally(() => mounted && setLoading(false));
    return () => { mounted = false; };
  }, [loadSummary]);

  useEffect(() => {
    const id = window.setInterval(() => {
      if (document.visibilityState !== "visible") {return;}
      loadSummary().catch(() => {});
    }, 12000);
    return () => window.clearInterval(id);
  }, [loadSummary]);

  const displayedItems = useMemo(() => {
    if (activeTab === "invitations") {
      return summary?.received_requests || [];
    }
    return summary?.conversations || [];
  }, [activeTab, summary]);

  const handleSelectItem = (item) => {
    setSelectedThreadId(item.id);
    if (isMobile) {
      setMobileDrawerOpen(true);
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
            <Tabs value={activeTab} onChange={(_, next) => setActiveTab(next)}>
              <Tab
                value="conversations"
                label={<Badge color="primary" badgeContent={summary?.unread_conversations_count || 0}>Conversations</Badge>}
              />
              <Tab
                value="invitations"
                label={<Badge color="secondary" badgeContent={summary?.pending_invitations_count || 0}>Invitations</Badge>}
              />
            </Tabs>

            <List dense>
              {displayedItems.map((item) => (
                <MessageRow
                  key={`${activeTab}-${item.id}`}
                  item={item}
                  active={item.id === selectedThreadId}
                  onClick={() => handleSelectItem(item)}
                />
              ))}
            </List>

            {displayedItems.length === 0 ? (
              activeTab === "conversations"
                ? <Alert severity="info">Aucune conversation pour l’instant.</Alert>
                : <Alert severity="info">Aucune invitation en attente.</Alert>
            ) : null}
          </Box>

          {!isMobile ? (
            <Box sx={{ minHeight: 380 }}>
              {selectedThreadId ? (
                <Conversation
                  mode="thread"
                  threadId={selectedThreadId}
                  viewer={user}
                  onThreadUpdated={refreshSummaryAfterThreadMutation}
                />
              ) : (
                <Box sx={{ border: "1px solid", borderColor: "divider", borderRadius: 1, p: 2, minHeight: 380 }}>
                  <Typography>Sélectionne une discussion.</Typography>
                </Box>
              )}
            </Box>
          ) : null}
        </Box>
      )}

      <Drawer
        anchor="right"
        open={mobileDrawerOpen}
        onClose={() => setMobileDrawerOpen(false)}
        PaperProps={{ sx: { width: "100vw", maxWidth: "100vw" } }}
      >
        <Box sx={{ p: 2, height: "100%" }}>
          {selectedThreadId ? (
            <Conversation
              mode="thread"
              threadId={selectedThreadId}
              viewer={user}
              isInDrawer
              onClose={() => setMobileDrawerOpen(false)}
              onThreadUpdated={refreshSummaryAfterThreadMutation}
            />
          ) : null}
        </Box>
      </Drawer>
    </Box>
  );
}
