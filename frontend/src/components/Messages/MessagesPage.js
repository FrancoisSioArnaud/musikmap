import Alert from "@mui/material/Alert";
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
import { useLocation, useNavigate } from "react-router-dom";

import UserInline from "../Common/UserInline";
import { UserContext } from "../UserContext";
import {
  closeDrawerWithHistory,
  getDrawerParamValue,
  openDrawerWithHistory,
} from "../Utils/drawerHistory";
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
        gap: 1,
        display: "flex",
        alignItems: "center",
        p: "12px 16px",
        justifyContent: "flex-start",
        width: "100%",
        maxWidth: "100%",
        minWidth: 0,
        overflow: "hidden",
      }}
    >
      <Box
        sx={{
          flex: "1 1 auto",
          minWidth: 0,
          maxWidth: "100%",
          overflow: "hidden",
        }}
      >
        <UserInline
          user={item?.other_user}
          subtitle={preview}
          avatarSize={32}
          className="message_row_user"
          interactive={false}
        />
      </Box>

      <Box
        sx={{
          display: "flex",
          alignItems: "center",
          gap: 1,
          flex: "0 0 auto",
          minWidth: 0,
          whiteSpace: "nowrap",
        }}
      >
        <Typography variant="caption" sx={{ flex: "0 0 auto", pt: 0.5, whiteSpace: "nowrap" }}>
          {formatRelativeTime(item?.updated_at)}
        </Typography>

        {item?.has_unread ? (
          <Box
            aria-label="Conversation non lue"
            sx={{
              width: 8,
              height: 8,
              borderRadius: "50%",
              bgcolor: "primary.main",
              flex: "0 0 auto",
            }}
          />
        ) : null}
      </Box>
    </ListItemButton>
  );
}

export default function MessagesPage() {
  const { user } = useContext(UserContext) || {};
  const theme = useTheme();
  const navigate = useNavigate();
  const location = useLocation();
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
  const threadDrawerParamValue = getDrawerParamValue(location, "thread");

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

  useEffect(() => {
    if (!isMobile) {
      setMobileDrawerOpen(false);
      return;
    }

    const shouldOpenDrawer = Boolean(threadDrawerParamValue);
    setMobileDrawerOpen((prev) => (prev === shouldOpenDrawer ? prev : shouldOpenDrawer));

    if (threadDrawerParamValue) {
      setSelectedThreadId((prev) => (String(prev) === String(threadDrawerParamValue) ? prev : threadDrawerParamValue));
    }
  }, [isMobile, threadDrawerParamValue]);

  useEffect(() => {
    if (!selectedThreadId) {return;}

    const selectedId = String(selectedThreadId);
    const isInvitation = (summary?.received_requests || []).some((item) => String(item?.id) === selectedId);
    const isConversation = (summary?.conversations || []).some((item) => String(item?.id) === selectedId);

    if (isInvitation && activeTab !== "invitations") {
      setActiveTab("invitations");
      return;
    }

    if (isConversation && activeTab !== "conversations") {
      setActiveTab("conversations");
    }
  }, [activeTab, selectedThreadId, summary]);

  const handleCloseMobileDrawer = useCallback((options = {}) => {
    if (!closeDrawerWithHistory({
      navigate,
      location,
      param: "thread",
      value: selectedThreadId,
      replace: Boolean(options?.replace),
    })) {
      setMobileDrawerOpen(false);
    }
  }, [location, navigate, selectedThreadId]);

  const displayedItems = useMemo(() => {
    if (activeTab === "invitations") {
      return summary?.received_requests || [];
    }
    return summary?.conversations || [];
  }, [activeTab, summary]);

  const handleSelectItem = useCallback((item) => {
    setSelectedThreadId(item.id);

    if (!isMobile) {return;}

    const nextValue = String(item.id);
    const currentValue = threadDrawerParamValue ? String(threadDrawerParamValue) : "";

    if (currentValue && currentValue !== nextValue) {
      const nextSearchParams = new URLSearchParams(location?.search || "");
      nextSearchParams.set("thread", nextValue);
      navigate(
        {
          pathname: location?.pathname || "/messages",
          search: `?${nextSearchParams.toString()}`,
        },
        {
          replace: true,
          state: {
            ...(location?.state || {}),
            __drawer_thread: nextValue,
          },
          preventScrollReset: true,
        }
      );
      return;
    }

    if (!openDrawerWithHistory({
      navigate,
      location,
      param: "thread",
      value: item.id,
    })) {
      setMobileDrawerOpen(true);
    }
  }, [isMobile, location, navigate, threadDrawerParamValue]);

  if (!user?.id) {
    return <Box sx={{ p: 2 }}><Alert severity="info">Connecte-toi pour accéder à tes messages.</Alert></Box>;
  }

  return (
    <Box sx={{ p: 2, pb: 8 }}>
      <Typography variant="h4" sx={{ mb: 2 }}>Messages</Typography>
      {error ? <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert> : null}
      {loading ? <CircularProgress /> : (
        <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", md: "320px 1fr" }, gap: 2, minWidth: 0, width: "100%", maxWidth: "100%" }}>
          <Box sx={{ minWidth: 0, width: "100%", maxWidth: "100%", overflow: "hidden" }}>
            <Tabs value={activeTab} onChange={(_, next) => setActiveTab(next)}>
              <Tab
                value="conversations"
                label={
                  <Box sx={{ display: "flex", alignItems: "center", gap: "6px" }}>
                    <span>Conversations</span>
                    {(summary?.unread_conversations_count || 0) > 0 ? (
                      <Box
                        sx={{
                          minWidth: 18,
                          height: 18,
                          px: 0.75,
                          borderRadius: "999px",
                          bgcolor: "primary.main",
                          color: "primary.contrastText",
                          display: "inline-flex",
                          alignItems: "center",
                          justifyContent: "center",
                          typography: "caption",
                          fontWeight: 700,
                          lineHeight: 1,
                        }}
                      >
                        {summary.unread_conversations_count}
                      </Box>
                    ) : null}
                  </Box>
                }
              />
            
              <Tab
                value="invitations"
                label={
                  <Box sx={{ display: "flex", alignItems: "center", gap: "6px" }}>
                    <span>Invitations</span>
                    {(summary?.pending_invitations_count || 0) > 0 ? (
                      <Box
                        sx={{
                          minWidth: 18,
                          height: 18,
                          px: 0.75,
                          borderRadius: "999px",
                          bgcolor: "secondary.main",
                          color: "secondary.contrastText",
                          display: "inline-flex",
                          alignItems: "center",
                          justifyContent: "center",
                          typography: "caption",
                          fontWeight: 700,
                          lineHeight: 1,
                        }}
                      >
                        {summary.pending_invitations_count}
                      </Box>
                    ) : null}
                  </Box>
                }
              />
            </Tabs>

            <List dense sx={{ width: "100%", maxWidth: "100%", minWidth: 0, overflow: "hidden" }}>
              {displayedItems.map((item) => (
                <MessageRow
                  key={`${activeTab}-${item.id}`}
                  item={item}
                  active={!isMobile && String(item.id) === String(selectedThreadId)}
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
        onClose={() => handleCloseMobileDrawer()}
        PaperProps={{ sx: { width: "100vw", maxWidth: "100vw" } }}
      >
        <Box sx={{ p: 2, height: "100%" }}>
          {selectedThreadId ? (
            <Conversation
              mode="thread"
              threadId={selectedThreadId}
              viewer={user}
              isInDrawer
              onClose={() => handleCloseMobileDrawer()}
              onThreadUpdated={refreshSummaryAfterThreadMutation}
            />
          ) : null}
        </Box>
      </Drawer>
    </Box>
  );
}
