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
import { closeDrawerWithHistory, getDrawerParamValue, openDrawerWithHistory } from "../Utils/drawerHistory";
import { formatRelativeTime } from "../Utils/time";
import Conversation from "./Conversation";

const normalize = (value) => (value || "").trim().toLowerCase();
function getItemsForTab(summary, tab) { return tab === "invitations" ? (summary?.received_requests || []) : (summary?.conversations || []); }

function MessageRow({ item, active, onClick }) { const preview = item?.last_message?.text_preview || ""; return <ListItemButton selected={active} onClick={onClick}><UserInline user={item?.other_user} subtitle={preview} avatarSize={32} interactive={false} /><Typography variant="caption">{formatRelativeTime(item?.last_message?.created_at || item?.updated_at)}</Typography></ListItemButton>; }

export default function MessagesPage() {
  const { user } = useContext(UserContext) || {};
  const theme = useTheme();
  const navigate = useNavigate();
  const location = useLocation();
  const isMobile = useMediaQuery(theme.breakpoints.down("md"));
  const [summary, setSummary] = useState({ received_requests: [], conversations: [], unread_conversations_count: 0, pending_invitations_count: 0 });
  const [activeTab, setActiveTab] = useState("conversations");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [mobileDrawerOpen, setMobileDrawerOpen] = useState(false);
  const selectedThreadUsername = getDrawerParamValue(location, "thread");

  const loadSummary = useCallback(async () => {
    const res = await fetch("/messages/summary", { credentials: "same-origin" });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) { throw new Error(data?.detail || "Erreur chargement messages"); }
    setSummary(data);
  }, []);

  useEffect(() => { let mounted = true; setLoading(true); loadSummary().catch((e) => mounted && setError(e.message)).finally(() => mounted && setLoading(false)); return () => { mounted = false; }; }, [loadSummary]);
  useEffect(() => { const id = window.setInterval(() => { if (document.visibilityState === "visible") { loadSummary().catch(() => {}); } }, 12000); return () => window.clearInterval(id); }, [loadSummary]);
  useEffect(() => { if (!isMobile) { setMobileDrawerOpen(false); return; } setMobileDrawerOpen(Boolean(selectedThreadUsername)); }, [isMobile, selectedThreadUsername]);

  useEffect(() => {
    if (!selectedThreadUsername) { return; }
    const inInvitations = (summary?.received_requests || []).some((i) => normalize(i?.other_user?.username) === normalize(selectedThreadUsername));
    setActiveTab(inInvitations ? "invitations" : "conversations");
  }, [selectedThreadUsername, summary]);

  const displayedItems = useMemo(() => getItemsForTab(summary, activeTab), [activeTab, summary]);
  const refreshSummaryAfterThreadMutation = useCallback(() => { loadSummary().catch(() => {}); }, [loadSummary]);
  const handleCloseMobileDrawer = useCallback(() => { if (!closeDrawerWithHistory({ navigate, location, param: "thread", value: selectedThreadUsername })) { setMobileDrawerOpen(false); } }, [location, navigate, selectedThreadUsername]);
  const handleSelectItem = useCallback((item) => { const username = item?.other_user?.username; if (!username) { return; } if (!isMobile) { navigate(`/messages?thread=${encodeURIComponent(username)}`); return; } if (!openDrawerWithHistory({ navigate, location, param: "thread", value: username })) { setMobileDrawerOpen(true); } }, [isMobile, location, navigate]);

  if (!user?.id) { return <Box sx={{ p: 2 }}><Alert severity="info">Connecte-toi pour accéder à tes messages.</Alert></Box>; }
  return <Box sx={{ p: 2, pb: 8 }}>{loading ? <CircularProgress /> : <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", md: "320px 1fr" }, gap: 2 }}><Box><Tabs value={activeTab} onChange={(_, n) => setActiveTab(n)}><Tab value="conversations" label="Conversations" /><Tab value="invitations" label="Invitations" /></Tabs><List>{displayedItems.map((item) => <MessageRow key={`${activeTab}-${item.id}`} item={item} active={normalize(item?.other_user?.username) === normalize(selectedThreadUsername)} onClick={() => handleSelectItem(item)} />)}</List>{error ? <Alert severity="error">{error}</Alert> : null}</Box>{!isMobile ? <Box>{selectedThreadUsername ? <Conversation username={selectedThreadUsername} viewer={user} onThreadUpdated={refreshSummaryAfterThreadMutation} /> : <Typography>Sélectionne une discussion.</Typography>}</Box> : null}</Box>}<Drawer anchor="right" open={mobileDrawerOpen} onClose={handleCloseMobileDrawer} PaperProps={{ sx: { width: "100vw", maxWidth: "100vw" } }}><Box sx={{ p: 2, height: "100%" }}>{selectedThreadUsername ? <Conversation username={selectedThreadUsername} viewer={user} isInDrawer onClose={handleCloseMobileDrawer} onThreadUpdated={refreshSummaryAfterThreadMutation} /> : null}</Box></Drawer></Box>;
}
