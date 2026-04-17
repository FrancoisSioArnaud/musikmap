import React, { useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";

import Avatar from "@mui/material/Avatar";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Card from "@mui/material/Card";
import CircularProgress from "@mui/material/CircularProgress";
import Dialog from "@mui/material/Dialog";
import DialogActions from "@mui/material/DialogActions";
import DialogContent from "@mui/material/DialogContent";
import DialogTitle from "@mui/material/DialogTitle";
import Slide from "@mui/material/Slide";
import Snackbar from "@mui/material/Snackbar";
import SnackbarContent from "@mui/material/SnackbarContent";
import Typography from "@mui/material/Typography";

import AddReactionOutlinedIcon from "@mui/icons-material/AddReactionOutlined";
import ArrowForwardIosIcon from "@mui/icons-material/ArrowForwardIos";
import LibraryMusicIcon from "@mui/icons-material/LibraryMusic";
import ModeCommentOutlinedIcon from "@mui/icons-material/ModeCommentOutlined";
import MusicNote from "@mui/icons-material/MusicNote";
import PlayArrowIcon from "@mui/icons-material/PlayArrow";
import SendIcon from "@mui/icons-material/Send";

import AuthModal from "../Auth/AuthModal";
import {
  buildRelativeLocation,
  clearAuthReturnContext,
  consumeAuthAction,
  saveAuthReturnContext,
} from "../Auth/AuthFlow";
import CommentsDrawer from "../Comments/CommentsDrawer";
import AddReactionModal from "../Reactions/AddReactionModal";
import ReactionSummary from "../Reactions/ReactionSummary";
import { UserContext } from "../UserContext";
import { getValid, setWithTTL } from "../Utils/mmStorage";
import PlayModal from "./PlayModal";
import { getCookie } from "../Security/TokensUtils";
import { formatRelativeTime } from "../Utils/time";


function SlideDownTransition(props) {
  return <Slide {...props} direction="down" />;
}

const KEY_BOX_CONTENT = "mm_box_content";
const TTL_MINUTES = 20;
const HOLD_TO_REVEAL_MS = 1200;
const MIN_REVEAL_LOADING_MS = 750;

function sleep(ms) {
  return new Promise((resolve) => {
    window.setTimeout(resolve, ms);
  });
}

function shuffleArray(list) {
  const next = Array.isArray(list) ? [...list] : [];

  for (let index = next.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [next[index], next[swapIndex]] = [next[swapIndex], next[index]];
  }

  return next;
}

function randomBetween(min, max) {
  return min + Math.random() * (max - min);
}

function evaluateCubicBezier(progress, x1, y1, x2, y2) {
  const clampedProgress = Math.min(Math.max(progress, 0), 1);

  if (clampedProgress === 0 || clampedProgress === 1) {
    return clampedProgress;
  }

  const sampleCurve = (a1, a2, t) => {
    const mt = 1 - t;
    return (3 * a1 * mt * mt * t) + (3 * a2 * mt * t * t) + (t * t * t);
  };

  let lower = 0;
  let upper = 1;
  let t = clampedProgress;

  for (let index = 0; index < 12; index += 1) {
    const x = sampleCurve(x1, x2, t);

    if (Math.abs(x - clampedProgress) < 0.0005) {
      break;
    }

    if (x < clampedProgress) {
      lower = t;
    } else {
      upper = t;
    }

    t = (lower + upper) / 2;
  }

  return sampleCurve(y1, y2, t);
}

async function copyText(text) {
  if (navigator?.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return true;
  }

  const textArea = document.createElement("textarea");
  textArea.value = text;
  textArea.setAttribute("readonly", "readonly");
  textArea.style.position = "absolute";
  textArea.style.left = "-9999px";
  document.body.appendChild(textArea);
  textArea.select();
  const copied = document.execCommand("copy");
  document.body.removeChild(textArea);
  return copied;
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function getEmojiEdgeTarget(left, top) {
  const outsideOffset = 6;
  const distances = {
    left,
    right: 100 - left,
    top,
    bottom: 100 - top,
  };

  const nearestEdge = Object.entries(distances).sort((a, b) => a[1] - b[1])[0]?.[0] || "right";
  const target = {
    edge: nearestEdge,
    targetLeft: left,
    targetTop: top,
  };

  if (nearestEdge === "left") {
    target.targetLeft = -outsideOffset;
    target.targetTop = clamp(top, 8, 92);
  }

  if (nearestEdge === "right") {
    target.targetLeft = 100 + outsideOffset;
    target.targetTop = clamp(top, 8, 92);
  }

  if (nearestEdge === "top") {
    target.targetLeft = clamp(left, 8, 92);
    target.targetTop = -outsideOffset;
  }

  if (nearestEdge === "bottom") {
    target.targetLeft = clamp(left, 8, 92);
    target.targetTop = 100 + outsideOffset;
  }

  return target;
}

function getFloatingEmojiItems(reactions) {
  const reactionList = Array.isArray(reactions) ? reactions : [];
  const emojiItems = reactionList.flatMap((reaction, reactionIndex) => {
    const emoji = reaction?.emoji || "";

    return [0, 1, 2].map((emojiIndex) => ({
      key: `${reaction?.user?.id || "guest"}-${emoji || "emoji"}-${reactionIndex}-${emojiIndex}`,
      emoji,
    }));
  });

  const count = emojiItems.length;

  if (!count) return [];

  const cols = Math.max(3, Math.ceil(Math.sqrt(count * 1.1)));
  const rows = Math.max(2, Math.ceil(count / cols));
  const cellWidth = 100 / cols;
  const cellHeight = 100 / rows;
  const cells = [];

  for (let row = 0; row < rows; row += 1) {
    for (let col = 0; col < cols; col += 1) {
      cells.push({ row, col });
    }
  }

  const orderedCells = shuffleArray(cells).slice(0, count);

  return emojiItems.map((item, index) => {
    const cell = orderedCells[index] || { row: 0, col: 0 };
    const jitterX = (Math.random() - 0.5) * Math.min(16, cellWidth * 0.5);
    const jitterY = (Math.random() - 0.5) * Math.min(18, cellHeight * 0.5);
    const left = clamp(cell.col * cellWidth + jitterX + cellWidth * 0.5, 10, 90);
    const top = clamp(cell.row * cellHeight + jitterY + cellHeight * 0.5, 10, 90);
    const { edge, targetLeft, targetTop } = getEmojiEdgeTarget(left, top);

    return {
      ...item,
      left,
      top,
      targetLeft,
      targetTop,
      edge,
      fontSize: `${randomBetween(1.1, 1.75).toFixed(2)}rem`,
      zIndex: Math.floor(randomBetween(1, 5)),
      opacity: randomBetween(0.92, 1).toFixed(2),
      floatDuration: `${randomBetween(4.8, 8.2).toFixed(2)}s`,
      floatDelay: `${randomBetween(-0, -1.8).toFixed(2)}s`,
      settleDuration: `${randomBetween(280, 480).toFixed(0)}ms`,
      settleDelay: `${randomBetween(500, 920).toFixed(0)}ms`,
      x1: `${randomBetween(-8, 8).toFixed(1)}px`,
      y1: `${randomBetween(-8, 8).toFixed(1)}px`,
      x2: `${randomBetween(-8, 8).toFixed(1)}px`,
      y2: `${randomBetween(-8, 8).toFixed(1)}px`,
      x3: `${randomBetween(-8, 8).toFixed(1)}px`,
      y3: `${randomBetween(-8, 8).toFixed(1)}px`,
      x4: `${randomBetween(-8, 8).toFixed(1)}px`,
      y4: `${randomBetween(-8, 8).toFixed(1)}px`,
      rotMax: `${randomBetween(5, 10).toFixed(1)}deg`,
      scaleMin: randomBetween(0.93, 0.98).toFixed(3),
      scaleMax: randomBetween(1.03, 1.1).toFixed(3),
    };
  });
}

export default function Deposit({
  dep,
  user: viewer,
  setDispDeposits,
  cost = 100,
  variant = "list",
  showDate = true,
  showUser = true,
  fitContainer = true,
  context = "box",
  dateLabel = null,
  userPrefix = "Partagée par",
  footerSlot = null,
  boxName = "",
}) {
  const navigate = useNavigate();
  const location = useLocation();
  const { setUser } = useContext(UserContext) || {};

  const [localDep, setLocalDep] = useState(dep || {});
  useEffect(() => {
    setLocalDep(dep || {});
  }, [dep]);

  const song = localDep?.song || {};
  const user = localDep?.user || {};
  const comments = localDep?.comments || { items: [], viewer_state: {} };
  const accentColor = localDep?.accent_color || undefined;
  const rootClassName = `deposit deposit_${variant}`;


  const isRevealed = useMemo(
    () => Boolean(song?.title && song?.artist),
    [song?.title, song?.artist]
  );

  const depositedAt = localDep?.deposited_at || null;
  const naturalDate = useMemo(
    () => (depositedAt ? formatRelativeTime(depositedAt) : ""),
    [depositedAt]
  );

  const [playOpen, setPlayOpen] = useState(false);
  const [playSong, setPlaySong] = useState(null);
  const [addReactionOpen, setAddReactionOpen] = useState(false);
  const [reactionSummaryOpen, setReactionSummaryOpen] = useState(false);
  const [commentsOpen, setCommentsOpen] = useState(false);
  const [snackOpen, setSnackOpen] = useState(false);
  const [shareSnack, setShareSnack] = useState({ open: false, message: "" });
  const [authModalConfig, setAuthModalConfig] = useState(null);
  const [reactionRevealPromptOpen, setReactionRevealPromptOpen] = useState(false);
  const [holdProgress, setHoldProgress] = useState(0);
  const [isHoldingReveal, setIsHoldingReveal] = useState(false);
  const [isRevealLoading, setIsRevealLoading] = useState(false);

  const revealHoldFrameRef = useRef(null);
  const revealHoldStartRef = useRef(null);
  const revealHoldTriggeredRef = useRef(false);

  const myReactionEmoji = localDep?.my_reaction?.emoji || null;
  const reactionsDetail = Array.isArray(localDep?.reactions)
    ? localDep.reactions
    : [];
  const floatingEmojiItems = useMemo(
    () => getFloatingEmojiItems(reactionsDetail),
    [reactionsDetail]
  );
  const reactionCount = reactionsDetail.length;
  const commentsCount = Array.isArray(comments?.items) ? comments.items.length : 0;
  const canShare = Boolean(viewer?.id && isRevealed);
  const resolvedShareBoxName = useMemo(() => {
    const propName = String(boxName || "").trim();
    if (propName) return propName;

    const localBoxName = String(localDep?.box?.name || localDep?.box_name || "").trim();
    if (localBoxName) return localBoxName;

    try {
      const raw = localStorage.getItem("mm_current_box");
      if (!raw) return "";

      const storedBox = JSON.parse(raw);
      const storedBoxName = String(storedBox?.box_name || "").trim();
      if (!storedBoxName) return "";

      const routeMatch = location?.pathname?.match(/^\/flowbox\/([^/]+)/);
      const currentRouteBoxSlug = routeMatch?.[1] || "";
      if (currentRouteBoxSlug && storedBox?.box_slug !== currentRouteBoxSlug) {
        return "";
      }

      return storedBoxName;
    } catch {
      return "";
    }
  }, [boxName, localDep?.box?.name, localDep?.box_name, location?.pathname]);

  const updateDepositCollections = useCallback((transform) => {
    setDispDeposits?.((prev) => {
      const arr = Array.isArray(prev) ? [...prev] : [];
      return arr.map((item) => {
        if (!item || item.public_key !== localDep?.public_key) return item;
        return transform(item);
      });
    });
  }, [localDep?.public_key, setDispDeposits]);

  const updateStorageSnapshot = useCallback((transform) => {
    try {
      const snap = getValid(KEY_BOX_CONTENT);
      if (!snap) return;

      let changed = false;
      const applyToDeposit = (item) => {
        if (!item || item.public_key !== localDep?.public_key) return item;
        changed = true;
        return transform(item);
      };

      const next = { ...snap };

      if (next.main) {
        next.main = applyToDeposit(next.main);
      }

      if (next.myDeposit) {
        next.myDeposit = applyToDeposit(next.myDeposit);
      }

      if (next.activePinnedDeposit) {
        next.activePinnedDeposit = applyToDeposit(next.activePinnedDeposit);
      }

      if (Array.isArray(next.older)) {
        next.older = next.older.map(applyToDeposit);
      }

      if (Array.isArray(next.olderDeposits)) {
        next.olderDeposits = next.olderDeposits.map(applyToDeposit);
      }

      if (!changed) return;

      next.timestamp = Date.now();
      setWithTTL(KEY_BOX_CONTENT, next, TTL_MINUTES);
    } catch (error) {}
  }, [localDep?.public_key]);

  const getPlaySongKey = (currentSong) => {
    if (!currentSong) return "";

    return [
      currentSong?.public_key,
      currentSong?.provider_links?.spotify?.provider_url,
      currentSong?.provider_links?.deezer?.provider_url,
      currentSong?.spotify_url,
      currentSong?.deezer_url,
      currentSong?.title,
      currentSong?.artist,
    ]
      .filter(Boolean)
      .join("|");
  };

  const handleSongResolved = useCallback((resolvedSong) => {
    if (!resolvedSong) return;

    setPlaySong(resolvedSong);
    setLocalDep((prev) => ({ ...(prev || {}), song: { ...(prev?.song || {}), ...resolvedSong } }));
    updateDepositCollections((item) => ({ ...(item || {}), song: { ...(item?.song || {}), ...resolvedSong } }));
    updateStorageSnapshot((item) => ({ ...(item || {}), song: { ...(item?.song || {}), ...resolvedSong } }));
  }, [updateDepositCollections, updateStorageSnapshot]);

  const openPlayFor = (nextSong) => {
    const songToPlay = nextSong || null;
    const nextKey = getPlaySongKey(songToPlay);
    const currentKey = getPlaySongKey(playSong);

    if (playOpen && nextKey && nextKey === currentKey) {
      setPlayOpen(false);
      setPlaySong(null);
      return;
    }

    setPlaySong(songToPlay);
    setPlayOpen(Boolean(songToPlay));
  };

  const closePlay = () => {
    setPlayOpen(false);
    setPlaySong(null);
  };

  const stopRevealHoldAnimation = useCallback(() => {
    if (revealHoldFrameRef.current) {
      window.cancelAnimationFrame(revealHoldFrameRef.current);
      revealHoldFrameRef.current = null;
    }
  }, []);

  const resetRevealHold = useCallback(() => {
    stopRevealHoldAnimation();
    revealHoldStartRef.current = null;
    revealHoldTriggeredRef.current = false;
    setIsHoldingReveal(false);
    setHoldProgress(0);
  }, [stopRevealHoldAnimation]);

  useEffect(() => () => {
    stopRevealHoldAnimation();
  }, [stopRevealHoldAnimation]);

  useEffect(() => {
    if (isRevealed) {
      resetRevealHold();
      setIsRevealLoading(false);
    }
  }, [isRevealed, resetRevealHold]);

  const revealDeposit = useCallback(async () => {
    let didReveal = false;

    try {
      if (!viewer?.id) {
        window.alert(
          "Dépose d’abord une chanson pour commencer à cumuler des points et révéler des morceaux."
        );
        return;
      }

      setIsRevealLoading(true);
      const requestStartedAt = Date.now();
      const csrftoken = getCookie("csrftoken");
      const res = await fetch("/box-management/revealSong", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-CSRFToken": csrftoken,
        },
        body: JSON.stringify({
          dep_public_key: localDep.public_key,
          context: context || "box",
        }),
        credentials: "same-origin",
      });

      const payload = await res.json().catch(() => ({}));
      const remainingLoadingMs = Math.max(0, MIN_REVEAL_LOADING_MS - (Date.now() - requestStartedAt));

      if (remainingLoadingMs > 0) {
        await sleep(remainingLoadingMs);
      }

      if (!res.ok) {
        if (payload?.message) {
          alert(payload.message);
        } else if (payload?.error === "insufficient_funds") {
          alert("Tu n’as pas assez de points pour effectuer cette action.");
        } else {
          alert("Oops une erreur s’est produite, réessaie dans quelques instants.");
        }
        return;
      }

      const revealed = payload?.song || {};
      const isoNow = new Date().toISOString();
      didReveal = true;

      setLocalDep((prev) => ({
        ...(prev || {}),
        discovered_at: isoNow,
        song: {
          ...(prev?.song || {}),
          ...revealed,
          image_url: revealed.image_url || prev?.song?.image_url,
        },
      }));

      updateDepositCollections((item) => ({
        ...item,
        discovered_at: isoNow,
        song: {
          ...(item?.song || {}),
          ...revealed,
          image_url: revealed.image_url || item?.song?.image_url,
        },
      }));

      updateStorageSnapshot((item) => ({
        ...item,
        discovered_at: isoNow,
        song: {
          ...(item?.song || {}),
          ...revealed,
          image_url: revealed.image_url || item?.song?.image_url,
        },
      }));

      if (typeof payload?.points_balance === "number" && setUser) {
        setUser((prev) => ({ ...(prev || {}), points: payload.points_balance }));
      }

      if (context !== "profile") {
        setSnackOpen((prev) => !prev);
      }
    } catch {
      alert("Oops une erreur s’est produite, réessaie dans quelques instants.");
    } finally {
      setIsRevealLoading(false);

      if (!didReveal) {
        resetRevealHold();
      }
    }
  }, [context, localDep.public_key, resetRevealHold, setUser, updateDepositCollections, updateStorageSnapshot, viewer?.id]);

  const beginRevealHold = useCallback((event) => {
    if (isRevealed || isRevealLoading || isHoldingReveal) {
      return;
    }

    event?.preventDefault?.();
    event?.stopPropagation?.();

    revealHoldTriggeredRef.current = false;
    revealHoldStartRef.current = performance.now();
    setHoldProgress(0);
    setIsHoldingReveal(true);

    const tick = (now) => {
      if (!revealHoldStartRef.current) {
        return;
      }

      const linearProgress = Math.min((now - revealHoldStartRef.current) / HOLD_TO_REVEAL_MS, 1);
      const progress = evaluateCubicBezier(linearProgress, 0,.94,1,.49);
      setHoldProgress(progress);

      if (linearProgress >= 1) {
        revealHoldTriggeredRef.current = true;
        stopRevealHoldAnimation();
        revealHoldStartRef.current = null;
        setIsHoldingReveal(false);
        setHoldProgress(1);
        revealDeposit();
        return;
      }

      revealHoldFrameRef.current = window.requestAnimationFrame(tick);
    };

    stopRevealHoldAnimation();
    revealHoldFrameRef.current = window.requestAnimationFrame(tick);
  }, [isHoldingReveal, isRevealLoading, isRevealed, revealDeposit, stopRevealHoldAnimation]);

  const endRevealHold = useCallback((event) => {
    event?.preventDefault?.();
    event?.stopPropagation?.();

    if (revealHoldTriggeredRef.current || isRevealLoading) {
      return;
    }

    resetRevealHold();
  }, [isRevealLoading, resetRevealHold]);

  const handleReactionApplied = (result) => {
    const nextReactions = Array.isArray(result?.reactions)
      ? result.reactions
      : Array.isArray(localDep?.reactions)
        ? localDep.reactions
        : [];

    const nextComments = Array.isArray(result?.comments?.items)
      ? result.comments
      : comments;

    const nextDepPatch = {
      my_reaction: result?.my_reaction || null,
      reactions: nextReactions,
      comments: nextComments,
    };

    setLocalDep((prev) => ({
      ...(prev || {}),
      ...nextDepPatch,
    }));

    updateDepositCollections((item) => ({
      ...(item || {}),
      ...nextDepPatch,
    }));

    updateStorageSnapshot((item) => ({
      ...(item || {}),
      ...nextDepPatch,
    }));
  };

  const handleCommentsChange = (nextComments) => {
    const safeComments = nextComments || { items: [], viewer_state: {} };
    setLocalDep((prev) => ({ ...(prev || {}), comments: safeComments }));
    updateDepositCollections((item) => ({ ...(item || {}), comments: safeComments }));
  };

  useEffect(() => {
    if (!viewer?.id || viewer?.is_guest || !localDep?.public_key) return;

    const currentPath = buildRelativeLocation(location);
    const commentAction = consumeAuthAction({
      currentPath,
      actionType: "comments",
      matcher: (payload) => payload?.depPublicKey === localDep.public_key,
    });

    if (commentAction) {
      setCommentsOpen(true);
      return;
    }

    const reactionAction = consumeAuthAction({
      currentPath,
      actionType: "reactions",
      matcher: (payload) => payload?.depPublicKey === localDep.public_key,
    });

    if (reactionAction) {
      setAddReactionOpen(true);
    }
  }, [viewer?.id, viewer?.is_guest, localDep?.public_key, location]);

  const showShareFeedback = useCallback((message) => {
    setShareSnack({ open: true, message });
  }, []);

  const handleShareDeposit = useCallback(async (event) => {
    event?.stopPropagation?.();

    if (!viewer?.id) {
      saveAuthReturnContext({
        returnTo: buildRelativeLocation(location),
        authContext: "share_song",
      });
      setAuthModalConfig({
        authContext: "share_song",
        mergeGuest: Boolean(viewer?.is_guest),
        prefillUsername: viewer?.is_guest ? (viewer?.username || "") : "",
      });
      return;
    }

    if (!isRevealed) {
      window.alert("Révèle d’abord la chanson avant de la partager.");
      return;
    }

    try {
      const response = await fetch("/box-management/links/", {
        method: "POST",
        credentials: "same-origin",
        headers: {
          "Content-Type": "application/json",
          "X-CSRFToken": getCookie("csrftoken"),
        },
        body: JSON.stringify({ dep_public_key: localDep?.public_key }),
      });

      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        window.alert(payload?.detail || "Impossible de créer le lien de partage.");
        return;
      }

      const shareUrl = payload?.url;
      if (!shareUrl) {
        window.alert("Impossible de créer le lien de partage.");
        return;
      }

      const shareMessagePrefix = resolvedShareBoxName
        ? `Regarde ce que j'ai découvert dans la Boîte à Chanson de ${resolvedShareBoxName} :`
        : "Regarde ce que j'ai découvert dans une boîte à chanson :";

      const shareData = {
        title: song?.title || "Chanson partagée",
        text:
          song?.title && song?.artist
            ? `${shareMessagePrefix} ${song.title} — ${song.artist} ${shareUrl}`
            : `${shareMessagePrefix} ${shareUrl}`,
        url: shareUrl,
      };

      if (typeof navigator !== "undefined" && typeof navigator.share === "function") {
        try {
          await navigator.share(shareData);
          showShareFeedback("Lien prêt à être partagé.");
          return;
        } catch (error) {
          if (error?.name === "AbortError") {
            return;
          }
        }
      }

      await copyText(shareUrl);
      showShareFeedback("Lien copié.");
    } catch (error) {
      window.alert("Impossible de créer le lien de partage.");
    }
  }, [
    viewer?.id,
    isRevealed,
    localDep?.public_key,
    resolvedShareBoxName,
    showShareFeedback,
    song?.artist,
    song?.title,
  ]);

  const renderDepositUser = (currentUser) => {
    const canNavigate = Boolean(currentUser?.username && !currentUser?.is_guest);

    return (
      <Box
        onClick={() => {
          if (canNavigate) navigate("/profile/" + currentUser.username);
        }}
        className={canNavigate ? "hasUsername deposit_user" : "deposit_user"}
      >
        <Typography variant="body1" component="span">
          {userPrefix}
        </Typography>
        <Box className="avatarbox">
          <Avatar
            src={currentUser?.profile_picture_url || undefined}
            alt={currentUser?.display_name || "anonyme"}
            className="avatar"
          />
        </Box>
        <Typography component="span" className="username" variant="subtitle1">
          {currentUser?.display_name || "anonyme"}
          {canNavigate ? (
            <ArrowForwardIosIcon className="icon" sx={{ height: "0.8em", width: "0.8em" }} />
          ) : null}
        </Typography>
      </Box>
    );
  };

  const depositInfosBlock = showUser ? (
    <Box className="deposit_infos">{renderDepositUser(user)}</Box>
  ) : null;

  const depositInteractBlock = (
    <Box className="deposit_interact">
      <Box className="left">
        <Box className="deposit_action_group reactions_group">
          <Button
            variant="depositInteract"
            className="deposit_action_button addreaction_button addreaction_icon_button"
            onClick={(event) => {
              event.stopPropagation();
              if (!isRevealed) {
                setReactionRevealPromptOpen(true);
                return;
              }
              if (!viewer?.id) {
                saveAuthReturnContext({
                  returnTo: buildRelativeLocation(location),
                  authContext: "react",
                  action: {
                    type: "reactions",
                    payload: { depPublicKey: localDep?.public_key },
                  },
                });
                setAuthModalConfig({
                  authContext: "react",
                  mergeGuest: Boolean(viewer?.is_guest),
                  prefillUsername: viewer?.is_guest ? (viewer?.username || "") : "",
                  action: {
                    type: "reactions",
                    payload: { depPublicKey: localDep?.public_key },
                  },
                });
                return;
              }
              setAddReactionOpen(true);
            }}
          >
            {myReactionEmoji ? (
              <Typography
                component="span"
                className="current_reaction_emoji"
                sx={{ fontSize: "1.35rem", lineHeight: 1 }}
              >
                {myReactionEmoji}
              </Typography>
            ) : (
              <AddReactionOutlinedIcon />
            )}
          </Button>
  
          {reactionCount > 0 ? (
            <Button
              variant="depositInteract"
              className="deposit_action_button reactionsummary_button"
              onClick={(event) => {
                event.stopPropagation();
                setReactionSummaryOpen(true);
              }}
            >
              {`x${reactionCount}`}
            </Button>
          ) : null}
        </Box>
  
        <Button
          variant="depositInteract"
          className="deposit_action_button comments_button"
          onClick={(event) => {
            event.stopPropagation();
            setCommentsOpen(true);
          }}
          startIcon={<ModeCommentOutlinedIcon />}
        >
          {commentsCount > 0 ? `x${commentsCount}` : ""}
        </Button>
      </Box>
      <Box className="right">
        {canShare ? (
          <Button
            variant="depositInteract"
            className="deposit_action_button share_button"
            onClick={handleShareDeposit}
            aria-label="Partager"
            title="Partager"
          >
            <SendIcon />
          </Button>
        ) : null}
      </Box>
    </Box>
  );

  const renderFloatingReactions = () => {
    if (!floatingEmojiItems.length) return null;

    return (
      <Box className={`emojis${isRevealed ? " is_revealed" : ""}`}>
        {floatingEmojiItems.map((item) => (
          <Box
            key={item.key}
            className={`emoji_shell edge_${item.edge || "right"}`}
            sx={{
              left: `${item.left}%`,
              top: `${item.top}%`,
              "--emoji-target-left": `${item.targetLeft}%`,
              "--emoji-target-top": `${item.targetTop}%`,
              "--emoji-settle-duration": item.settleDuration,
              "--emoji-settle-delay": item.settleDelay,
              zIndex: item.zIndex,
              opacity: item.opacity,
            }}
            onClick={(event) => {
              event.stopPropagation();
              setReactionSummaryOpen(true);
            }}
            onKeyDown={(event) => {
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                event.stopPropagation();
                setReactionSummaryOpen(true);
              }
            }}
            role="button"
            tabIndex={0}
          >
            <Typography
              className="emoji"
              component="span"
              sx={{
                fontSize: item.fontSize,
                "--float-duration": item.floatDuration,
                "--float-delay": item.floatDelay,
                "--x1": item.x1,
                "--y1": item.y1,
                "--x2": item.x2,
                "--y2": item.y2,
                "--x3": item.x3,
                "--y3": item.y3,
                "--x4": item.x4,
                "--y4": item.y4,
                "--rot-max": item.rotMax,
                "--scale-min": item.scaleMin,
                "--scale-max": item.scaleMax,
              }}
            >
              {item.emoji}
            </Typography>
          </Box>
        ))}
      </Box>
    );
  };

  const renderCoverMedia = (blurred = false) => (
    <Box className="cover_media">
      <Box className="img_container">
        {song?.image_url ? (
          <Box
            component="img"
            className={`cover_image${blurred ? " is_blurred" : ""}`}
            src={song.image_url}
            alt={isRevealed ? `${song.title} - ${song.artist}` : "Cover"}
          />
        ) : null}
      </Box>
      {renderFloatingReactions()}
    </Box>
  );

  return (
    <>
      <Box className={rootClassName}>
        {showDate ? (
          <Typography className="deposit_date" variant="subtitle1" component="span">
            {dateLabel || naturalDate || ""}
          </Typography>
        ) : null}
        <Card className={deposit_card}>
          {depositInfosBlock}

          <Box
            className={`deposit_song${accentColor ? " has_accent_color" : ""}${isRevealed ? "" : " is_hidden"}${isHoldingReveal ? " is_reveal_holding" : ""}${isRevealLoading ? " is_reveal_loading" : ""}`}
            style={{
              ...(accentColor ? { "--deposit-accent": accentColor } : {}),
              ...(isRevealed ? {} : { "--deposit-reveal-progress": holdProgress }),
            }}
          >
            {!isRevealed ? <Box className="deposit_reveal_fill" aria-hidden="true" /> : null}
            {renderCoverMedia(!isRevealed)}

            <Box className="interact">
              {isRevealed ? (
                <Box className="texts">
                  <Typography component="span" className="titre" variant={variant === "main" ? "h4" : "h5"}>
                    {song.title}
                  </Typography>
                  <Typography component="span" className="artist" variant="body1">
                    {song.artist}
                  </Typography>
                </Box>
              ) : null}

              {isRevealed ? (
                <PlayModal open={playOpen} song={playSong} onClose={closePlay} onSongResolved={handleSongResolved}>
                  <Button
                    variant="depositInteract"
                    className={variant === "main" ? "play playMain" : "play playSecondary"}
                    size="large"
                    onClick={() => openPlayFor(song)}
                    startIcon={<PlayArrowIcon />}
                  >
                    Écouter
                  </Button>
                </PlayModal>
              ) : (
                <Button
                  variant="depositInteract"
                  className="decouvrir"
                  disabled={isRevealLoading}
                  onPointerDown={beginRevealHold}
                  onPointerUp={endRevealHold}
                  onPointerCancel={endRevealHold}
                  onPointerLeave={endRevealHold}
                  onContextMenu={(event) => event.preventDefault()}
                  sx={{ touchAction: "none" }}
                  startIcon={isRevealLoading ? <CircularProgress size={18} thickness={5} color="inherit" /> : null}
                >
                  {isRevealLoading ? "Révélation..." : "Maintiens pour révéler la chanson"}
                  <Box className="points_container" sx={{ ml: "12px" }}>
                    <Typography variant="body1" component="span" sx={{ color: "text.primary" }}>
                      {cost}
                    </Typography>
                    <MusicNote />
                  </Box>
                </Button>
              )}
            </Box>
          </Box>

          {footerSlot}
          {depositInteractBlock}
        </Card>
      </Box>

      <Snackbar
        open={snackOpen}
        onClose={() => setSnackOpen(false)}
        autoHideDuration={5000}
        anchorOrigin={{ vertical: "top", horizontal: "center" }}
        TransitionComponent={SlideDownTransition}
        sx={{ zIndex: (theme) => theme.zIndex.drawer + 1 }}
      >
        <SnackbarContent
          sx={{
            bgcolor: "background.paper",
            color: "text.primary",
            borderRadius: 2,
            boxShadow: 3,
            px: 2,
            py: 1,
            display: "flex",
            alignItems: "center",
            gap: 1.5,
            maxWidth: 600,
            width: "calc(100vw - 32px)",
          }}
          message={
            <Box sx={{ display: "flex", alignItems: "center", gap: 1.5 }}>
              <LibraryMusicIcon fontSize="medium" />
              <Typography variant="body2" sx={{ whiteSpace: "normal" }}>
                Retrouve cette chanson dans ton profil
              </Typography>
            </Box>
          }
          action={
            <Button
              size="small"
              onClick={() => {
                setSnackOpen(false);
                navigate(viewer?.username ? `/profile/${viewer.username}` : "/profile");
              }}
            >
              Voir
            </Button>
          }
        />
      </Snackbar>

      <AuthModal
        open={Boolean(authModalConfig)}
        onClose={() => { clearAuthReturnContext(); setAuthModalConfig(null); }}
        initialTab="register"
        authContext={authModalConfig?.authContext || "default"}
        mergeGuest={Boolean(authModalConfig?.mergeGuest)}
        prefillUsername={authModalConfig?.prefillUsername || ""}
        authAction={authModalConfig?.action || null}
        onAuthenticated={() => {
          const actionType = authModalConfig?.action?.type;
          setAuthModalConfig(null);
          if (actionType === "reactions") {
            setAddReactionOpen(true);
          }
        }}
      />

      <Snackbar
        open={shareSnack.open}
        onClose={() => setShareSnack({ open: false, message: "" })}
        autoHideDuration={3500}
        anchorOrigin={{ vertical: "top", horizontal: "center" }}
        TransitionComponent={SlideDownTransition}
        sx={{ zIndex: (theme) => theme.zIndex.drawer + 1 }}
      >
        <SnackbarContent
          sx={{
            bgcolor: "background.paper",
            color: "text.primary",
            borderRadius: 2,
            boxShadow: 3,
            px: 2,
            py: 1,
            maxWidth: 520,
            width: "calc(100vw - 32px)",
          }}
          message={
            <Typography variant="body2" sx={{ whiteSpace: "normal" }}>
              {shareSnack.message || "Lien copié."}
            </Typography>
          }
        />
      </Snackbar>

      <AddReactionModal
        open={addReactionOpen}
        onClose={() => setAddReactionOpen(false)}
        depPublicKey={localDep?.public_key}
        currentEmoji={myReactionEmoji}
        onApplied={handleReactionApplied}
        setUser={setUser}
        viewer={viewer}
      />

      <ReactionSummary
        open={reactionSummaryOpen}
        onClose={() => setReactionSummaryOpen(false)}
        depPublicKey={localDep?.public_key}
        reactions={reactionsDetail}
        viewer={viewer}
        onApplied={handleReactionApplied}
      />

      <CommentsDrawer
        open={commentsOpen}
        onClose={() => setCommentsOpen(false)}
        depPublicKey={localDep?.public_key}
        comments={comments}
        viewer={viewer}
        onCommentsChange={handleCommentsChange}
      />

      <Dialog
        open={reactionRevealPromptOpen}
        onClose={() => setReactionRevealPromptOpen(false)}
      >
        <DialogTitle>Réaction indisponible</DialogTitle>
        <DialogContent>
          <Typography variant="body1">Écoute la chanson avant de réagir.</Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setReactionRevealPromptOpen(false)}>Compris</Button>
        </DialogActions>
      </Dialog>
    </>
  );
}
