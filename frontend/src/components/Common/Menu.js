import ChatBubble from "@mui/icons-material/ChatBubbleRounded";
import MusicNote from "@mui/icons-material/MusicNoteRounded";
import PersonIcon from "@mui/icons-material/PersonRounded";
import AppBar from "@mui/material/AppBar";
import Avatar from "@mui/material/Avatar";
import Badge from "@mui/material/Badge";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import IconButton from "@mui/material/IconButton";
import Toolbar from "@mui/material/Toolbar";
import Typography from "@mui/material/Typography";
import * as React from "react";
import { useContext, useEffect, useMemo, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";

import { startAuthPageFlow } from "../Auth/AuthFlow";
import { FlowboxSessionContext } from "../Flowbox/runtime/FlowboxSessionContext";
import { UserContext } from "../UserContext";

const WARNING_THRESHOLD_MS = 3 * 60 * 1000;
const ERROR_THRESHOLD_MS = 60 * 1000;
const EXTEND_DURATION_MS = 3000;

function formatCompactRemaining(remainingMs) {
  const remainingSeconds = Math.max(0, Math.ceil(remainingMs / 1000));
  if (remainingSeconds >= 60) {
    return `${Math.ceil(remainingSeconds / 60)} min`;
  }
  return `${remainingSeconds}s`;
}

function formatLongRemaining(remainingMs) {
  const remainingSeconds = Math.max(0, Math.ceil(remainingMs / 1000));
  if (remainingSeconds >= 60) {
    const remainingMinutes = Math.ceil(remainingSeconds / 60);
    return `${remainingMinutes} minute${remainingMinutes > 1 ? "s" : ""}`;
  }
  return `${remainingSeconds} seconde${remainingSeconds > 1 ? "s" : ""}`;
}

function getSessionTone(remainingMs) {
  if (remainingMs < ERROR_THRESHOLD_MS) {
    return { color: "warning.main", bg: "warning.main" };
  }
  return { color: "primary.main", bg: "primary.main" };
}

export default function MenuAppBar() {
  const { user } = useContext(UserContext);
  const navigate = useNavigate();
  const location = useLocation();
  const {
    currentFlowboxSlug,
    lastVisitedFlowboxSlug,
    getBoxRuntime,
    getActiveSessionForSlug,
    uiHintsBySlug,
    consumeEnterHint,
    markThreeMinWarningShown,
  } = useContext(FlowboxSessionContext);

  const [now, setNow] = useState(Date.now());
  const [manualExpandedUntil, setManualExpandedUntil] = useState(0);
  const [messagesBadgeTotal, setMessagesBadgeTotal] = useState(0);

  useEffect(() => {
    const interval = window.setInterval(() => {
      setNow(Date.now());
    }, 1000);
    return () => window.clearInterval(interval);
  }, []);

  const headerSlug = useMemo(() => {
    if (currentFlowboxSlug) {
      return getActiveSessionForSlug(currentFlowboxSlug) ? currentFlowboxSlug : null;
    }
    if (lastVisitedFlowboxSlug) {
      return getActiveSessionForSlug(lastVisitedFlowboxSlug) ? lastVisitedFlowboxSlug : null;
    }
    return null;
  }, [currentFlowboxSlug, getActiveSessionForSlug, lastVisitedFlowboxSlug]);

  const runtime = headerSlug ? getBoxRuntime(headerSlug) : null;
  const activeSession = headerSlug ? getActiveSessionForSlug(headerSlug) : null;
  const boxName = runtime?.box?.name || "Boîte";

  const remainingMs = useMemo(() => {
    if (!activeSession?.expiresAt) {return 0;}
    return Math.max(0, new Date(activeSession.expiresAt).getTime() - now);
  }, [activeSession?.expiresAt, now]);

  const totalMs = useMemo(() => {
    if (!activeSession?.expiresAt || !activeSession?.startedAt) {return 1;}
    const start = new Date(activeSession.startedAt).getTime();
    const end = new Date(activeSession.expiresAt).getTime();
    return Math.max(1, end - start);
  }, [activeSession?.expiresAt, activeSession?.startedAt]);

  const tone = getSessionTone(remainingMs);
  const progressPercent = Math.max(0, Math.min(100, (remainingMs / totalMs) * 100));
  const isLastMinute = Boolean(activeSession) && remainingMs <= ERROR_THRESHOLD_MS;
  const isExpanded = Boolean(activeSession) && (isLastMinute || manualExpandedUntil > now);

  useEffect(() => {
    if (!headerSlug || !activeSession) {return;}
    if (uiHintsBySlug?.[headerSlug]?.enterHintPending) {
      setManualExpandedUntil(Date.now() + EXTEND_DURATION_MS);
      consumeEnterHint(headerSlug);
    }
  }, [activeSession, consumeEnterHint, headerSlug, uiHintsBySlug]);

  useEffect(() => {
    if (!headerSlug || !activeSession || isLastMinute) {return;}
    if (remainingMs <= WARNING_THRESHOLD_MS && !uiHintsBySlug?.[headerSlug]?.threeMinWarningShown) {
      setManualExpandedUntil(Date.now() + EXTEND_DURATION_MS);
      markThreeMinWarningShown(headerSlug);
    }
  }, [activeSession, headerSlug, isLastMinute, markThreeMinWarningShown, remainingMs, uiHintsBySlug]);

  const isGuest = Boolean(user?.id && user?.is_guest);
  const isFullUser = Boolean(user?.id && !user?.is_guest);
  const ownProfilePath = user?.username ? `/profile/${user.username}` : "/profile";

  useEffect(() => {
    if (!isFullUser) {
      setMessagesBadgeTotal(0);
      return undefined;
    }

    let alive = true;

    const loadSummary = async () => {
      if (document.visibilityState !== "visible") {return;}
      try {
        const res = await fetch("/messages/summary", {
          credentials: "same-origin",
          headers: { Accept: "application/json" },
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok || !alive) {return;}
        const unread = Number(data?.unread_conversations_count) || 0;
        const pending = Number(data?.pending_invitations_count) || 0;
        setMessagesBadgeTotal(unread + pending);
      } catch {
        // Silence volontaire : ne pas casser le header sur erreur réseau.
      }
    };

    loadSummary();
    const id = window.setInterval(loadSummary, 12000);
    return () => {
      alive = false;
      window.clearInterval(id);
    };
  }, [isFullUser]);

  const handleAccountClick = (event) => {
    event.stopPropagation();
    if (isGuest) {
      startAuthPageFlow({
        navigate,
        location,
        tab: "register",
        authContext: "account",
        mergeGuest: true,
        prefillUsername: user?.username || "",
      });
    }
  };

  const handleHeaderClick = () => {
    if (!activeSession || !headerSlug) {return;}
    setManualExpandedUntil(Date.now() + EXTEND_DURATION_MS);
    const target = `/flowbox/${headerSlug}/discover`;
    if (location.pathname !== target) {
      navigate(target);
    }
  };

  const helperText = useMemo(() => {
    if (!activeSession) {return "";}
    if (remainingMs <= ERROR_THRESHOLD_MS) {
      return "La boîte se referme bientôt. Termine ton dépôt ou révèle les chansons qui t’intéressent.";
    }
    return `Tu peux explorer cette boîte encore ${formatLongRemaining(remainingMs)}.`;
  }, [activeSession, remainingMs]);

  return (
    <AppBar
      position="fixed"
      sx={{
        height: "auto",
        minHeight: 0,
        overflow: "hidden",
      }}
    >
      <Box onClick={handleHeaderClick} sx={{ cursor: activeSession ? "pointer" : "default" }}>
        <Toolbar sx={{ minHeight: "56px !important" }}>
          <Box sx={{ flexGrow: 1, minWidth: 0, display: "flex", alignItems: "center", gap: 1, pl: 1, pr: 0 }}>
            {activeSession ? (
              <>
                <Typography
                  variant="h5"
                  component="div"
                  sx={{ color: tone.color, whiteSpace: "nowrap", flexShrink: 0 }}
                >
                  {formatCompactRemaining(remainingMs)}
                </Typography>
                <Typography
                  variant="h5"
                  component="div"
                  sx={{ minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
                  title={boxName}
                >
                  {boxName}
                </Typography>
              </>
            ) : (
              <Typography variant="h5" component="div">
                Boîte à Chanson
              </Typography>
            )}
          </Box>

          {isFullUser ? (
            <>
              <Box
                className="points_container"
                onClick={(event) => event.stopPropagation()}
                sx={{ flexShrink: 0 }}
              >
                <Typography variant="body1" component="span" sx={{ color: "text.primary" }}>
                  {user?.points ?? 0}
                </Typography>
                <MusicNote />
              </Box>

              <IconButton
                size="large"
                aria-label="messages"
                color="primary"
                component={Link}
                to="/messages"
                onClick={(event) => event.stopPropagation()}
              >
                <Badge color="primary" badgeContent={messagesBadgeTotal} invisible={!messagesBadgeTotal}>
                  <ChatBubble />
                </Badge>
              </IconButton>

              <IconButton
                size="large"
                aria-label="account of current user"
                aria-controls="menu-appbar"
                color="inherit"
                component={Link}
                to={ownProfilePath}
                onClick={(event) => event.stopPropagation()}
              >
                <Avatar alt={user?.display_name || user?.username || "Invité"} src={user?.profile_picture_url || undefined} />
              </IconButton>
            </>
          ) : isGuest ? (
            <>
              <Box
                className="points_container"
                onClick={(event) => event.stopPropagation()}
                sx={{ flexShrink: 0 }}
              >
                <Typography variant="body1" component="span" sx={{ color: "text.primary" }}>
                  {user?.points ?? 0}
                </Typography>
                <MusicNote />
              </Box>

              <Button
                variant="menu"
                endIcon={<PersonIcon />}
                onClick={handleAccountClick}
                sx={{
                  borderRadius: "20px",
                  backgroundColor: "background.paper",
                  color: "primary",
                  border: "none",
                  textTransform: "none",
                  flexShrink: 0,
                  "&:hover": {
                    border: "none",
                  },
                }}
              >
                Mon compte
              </Button>
            </>
          ) : (
            <Button
              variant="menu"
              endIcon={<PersonIcon />}
              component={Link}
              to="/auth?tab=login"
              onClick={(event) => event.stopPropagation()}
              sx={{
                borderRadius: "20px",
                backgroundColor: "background.paper",
                color: "primary",
                border: "none",
                textTransform: "none",
                flexShrink: 0,
                "&:hover": {
                  border: "none",
                },
              }}
            >
              Mon compte
            </Button>
          )}
        </Toolbar>

        {activeSession ? (
          <>
            <Box
              sx={{
                display: "grid",
                gridTemplateRows: isExpanded ? "1fr" : "0fr",
                px: 3,
                pr: 12,
                pb: isExpanded ? 1 : 0,
                opacity: isExpanded ? 1 : 0,
                transform: isExpanded ? "translateY(0)" : "translateY(-4px)",
                overflow: "hidden",
                pointerEvents: isExpanded ? "auto" : "none",
                transition:
                  "grid-template-rows 220ms ease, opacity 180ms ease, transform 220ms ease, padding-bottom 220ms ease",
              }}
            >
              <Box sx={{ minHeight: 0, overflow: "hidden" }}>
                <Typography variant="body2" sx={{ color: "text.primary", pb:"6px" }}>
                  {helperText}
                </Typography>
              </Box>
            </Box>
            <Box sx={{ width: "100%", height: 4, backgroundColor: "divider", position: "absolute", bottom: 0, left: 0 }}>
              <Box
                sx={{
                  width: `${progressPercent}%`,
                  height: "100%",
                  backgroundColor: tone.bg,
                  transition: "width 950ms linear, background-color 200ms ease",
                }}
              />
            </Box>
          </>
        ) : null}
      </Box>
    </AppBar>
  );
}
