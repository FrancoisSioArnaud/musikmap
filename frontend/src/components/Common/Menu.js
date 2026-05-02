import ChatBubble from "@mui/icons-material/ChatBubbleRounded";
import MusicNote from "@mui/icons-material/MusicNoteRounded";
import PersonIcon from "@mui/icons-material/PersonRounded";
import AppBar from "@mui/material/AppBar";
import Avatar from "@mui/material/Avatar";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import IconButton from "@mui/material/IconButton";
import Toolbar from "@mui/material/Toolbar";
import Typography from "@mui/material/Typography";
import * as React from "react";
import { useContext, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";

import { FlowboxSessionContext } from "../Flowbox/runtime/FlowboxSessionContext";
import { UserContext } from "../UserContext";

const COMPACT_HEADER_HEIGHT = 56;
const EXPANDED_HEADER_HEIGHT = 86;
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

  useEffect(() => {
    const interval = window.setInterval(() => {
      setNow(Date.now());
    }, 250);
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
    const nextHeight = isExpanded ? EXPANDED_HEADER_HEIGHT : COMPACT_HEADER_HEIGHT;
    document.documentElement.style.setProperty("--mm-app-header-height", `${nextHeight}px`);
    return () => {
      document.documentElement.style.setProperty("--mm-app-header-height", `${COMPACT_HEADER_HEIGHT}px`);
    };
  }, [isExpanded]);

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

  const hasIdentity = Boolean(user?.id);
  const ownProfilePath = user?.username ? `/profile/${user.username}` : "/profile";

  const handleHeaderClick = () => {
    if (!activeSession) {return;}
    setManualExpandedUntil(Date.now() + EXTEND_DURATION_MS);
  };

  const helperText = useMemo(() => {
    if (!activeSession) {return "";}
    if (remainingMs <= ERROR_THRESHOLD_MS) {
      return `Tu as accès à tout le contenu de la boîte pendant encore ${formatLongRemaining(remainingMs)}.`;
    }
    return `Tu as accès à tout le contenu de la boîte pendant ${formatLongRemaining(remainingMs)}.`;
  }, [activeSession, remainingMs]);

  return (
    <AppBar position="fixed" sx={{ minHeight: `var(--mm-app-header-height, ${COMPACT_HEADER_HEIGHT}px)` }}>
      <Box onClick={handleHeaderClick} sx={{ cursor: activeSession ? "pointer" : "default" }}>
        <Toolbar sx={{ minHeight: `${COMPACT_HEADER_HEIGHT}px !important` }}>
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

          {hasIdentity ? (
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
                <ChatBubble />
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
            {isExpanded ? (
              <Box sx={{ px: 3, pb: 1.5, pr: 12 }}>
                <Typography variant="body2" sx={{ color: "text.primary" }}>
                  {helperText}
                </Typography>
              </Box>
            ) : null}
            <Box sx={{ width: "100%", height: 4, backgroundColor: "divider" }}>
              <Box
                sx={{
                  width: `${progressPercent}%`,
                  height: "100%",
                  backgroundColor: tone.bg,
                  transition: "width 240ms linear, background-color 200ms ease",
                }}
              />
            </Box>
          </>
        ) : null}
      </Box>
    </AppBar>
  );
}
