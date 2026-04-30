
import AddReactionOutlinedIcon from "@mui/icons-material/AddReactionOutlined";
import ArrowDropDownIcon from "@mui/icons-material/ArrowDropDown";
import LibraryMusicIcon from "@mui/icons-material/LibraryMusic";
import ModeCommentOutlinedIcon from "@mui/icons-material/ModeCommentOutlined";
import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Card from "@mui/material/Card";
import Dialog from "@mui/material/Dialog";
import DialogActions from "@mui/material/DialogActions";
import DialogContent from "@mui/material/DialogContent";
import DialogTitle from "@mui/material/DialogTitle";
import Slide from "@mui/material/Slide";
import Snackbar from "@mui/material/Snackbar";
import SnackbarContent from "@mui/material/SnackbarContent";
import Typography from "@mui/material/Typography";
import React, { useCallback, useContext, useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";

import {
  buildRelativeLocation,
  clearAuthReturnContext,
  consumeAuthAction,
  saveAuthReturnContext,
} from "../../Auth/AuthFlow";
import AuthModal from "../../Auth/AuthModal";
import { getCookie } from "../../Security/TokensUtils";
import { UserContext } from "../../UserContext";
import {
  closeDrawerWithHistory,
  matchesDrawerSearch,
  openDrawerWithHistory,
} from "../../Utils/drawerHistory";
import { getValid, setWithTTL } from "../../Utils/mmStorage";
import { formatRelativeTime } from "../../Utils/time";

import DepositComments from "./comments/DepositComments";
import DepositLink from "./parts/DepositLink";
import DepositSong from "./parts/DepositSong";
import DepositUser from "./parts/DepositUser";
import DepositReactions from "./reactions/DepositReactions";
import ReactionSummary from "./reactions/ReactionSummary";



function SlideDownTransition(props) {
  return <Slide {...props} direction="down" />;
}

const KEY_BOX_CONTENT = "mm_box_content";
const TTL_MINUTES = 20;
const MIN_REVEAL_LOADING_MS = 750;

function sleep(ms) {
  return new Promise((resolve) => {
    window.setTimeout(resolve, ms);
  });
}

function blurActiveElement() {
  if (typeof document === "undefined") {return;}
  if (document.activeElement instanceof HTMLElement) {
    document.activeElement.blur();
  }
}

function blurEventTarget(event) {
  event?.currentTarget?.blur?.();
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

  if (!count) {return [];}

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
  cost,
  variant = "list",
  showDate = true,
  showUser = true,
  fitContainer: _fitContainer = true,
  context = "box",
  dateLabel = null,
  userPrefix = "Partagée par",
  footerSlot = null,
  boxName = "",
  showCommentAction = true,
}) {
  const navigate = useNavigate();
  const location = useLocation();
  const { setUser, economy } = useContext(UserContext) || {};

  const revealCost = (() => {
    const parsed = Number(cost);
    if (Number.isFinite(parsed) && parsed > 0) {return parsed;}
    const ecoCost = Number(economy?.reveal_cost);
    if (Number.isFinite(ecoCost) && ecoCost > 0) {return ecoCost;}
    return 100;
  })();

  const [localDep, setLocalDep] = useState(dep || {});
  useEffect(() => {
    setLocalDep(dep || {});
  }, [dep]);

  const song = localDep?.song || {};
  const user = localDep?.user || {};
  const comments = localDep?.comments || { items: [], count: 0, viewer_state: {} };
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

  const [addReactionOpen, setAddReactionOpen] = useState(false);
  const [reactionSummaryOpen, setReactionSummaryOpen] = useState(false);
  const [commentsOpen, setCommentsOpen] = useState(false);
  const reactionsDrawerParamValue = localDep?.public_key || "";
  const [snackOpen, setSnackOpen] = useState(false);
  const [shareSnack, setShareSnack] = useState({ open: false, message: "" });
  const [isSharing, setIsSharing] = useState(false);
  const [authModalConfig, setAuthModalConfig] = useState(null);
  const [reactionRevealPromptOpen, setReactionRevealPromptOpen] = useState(false);
  const [actionErrorDialog, setActionErrorDialog] = useState({ open: false, title: "Erreur", message: "" });

  const openActionErrorDialog = useCallback((title, message, event = null) => {
    blurEventTarget(event);
    blurActiveElement();
    setActionErrorDialog({ open: true, title, message });
  }, []);

  const myReactionEmoji = localDep?.my_reaction?.emoji || null;
  const reactionsDetail = Array.isArray(localDep?.reactions)
    ? localDep.reactions
    : [];
  const floatingEmojiItems = useMemo(
    () => getFloatingEmojiItems(reactionsDetail),
    [reactionsDetail]
  );
  const reactionCount = reactionsDetail.length;
  const commentsCount = Number.isFinite(Number(comments?.count))
    ? Number(comments?.count)
    : Array.isArray(comments?.items)
      ? comments.items.length
      : 0;
  const canShare = Boolean(viewer?.id && isRevealed);
  const resolvedShareBoxName = useMemo(() => {
    const propName = String(boxName || "").trim();
    if (propName) {return propName;}

    const localBoxName = String(localDep?.box?.name || localDep?.box_name || "").trim();
    if (localBoxName) {return localBoxName;}

    try {
      const raw = localStorage.getItem("mm_current_box");
      if (!raw) {return "";}

      const storedBox = JSON.parse(raw);
      const storedBoxName = String(storedBox?.box_name || "").trim();
      if (!storedBoxName) {return "";}

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
        if (!item || item.public_key !== localDep?.public_key) {return item;}
        return transform(item);
      });
    });
  }, [localDep?.public_key, setDispDeposits]);

  const updateStorageSnapshot = useCallback((transform) => {
    try {
      const snap = getValid(KEY_BOX_CONTENT);
      if (!snap) {return;}

      let changed = false;
      const applyToDeposit = (item) => {
        if (!item || item.public_key !== localDep?.public_key) {return item;}
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

      if (!changed) {return;}

      next.timestamp = Date.now();
      setWithTTL(KEY_BOX_CONTENT, next, TTL_MINUTES);
    } catch (error) {}
  }, [localDep?.public_key]);

  const handleSongResolved = useCallback((resolvedSong) => {
    if (!resolvedSong) {return;}
    setLocalDep((prev) => ({ ...(prev || {}), song: { ...(prev?.song || {}), ...resolvedSong } }));
    updateDepositCollections((item) => ({ ...(item || {}), song: { ...(item?.song || {}), ...resolvedSong } }));
    updateStorageSnapshot((item) => ({ ...(item || {}), song: { ...(item?.song || {}), ...resolvedSong } }));
  }, [updateDepositCollections, updateStorageSnapshot]);

  const revealDeposit = useCallback(async () => {
    let didReveal = false;

    try {
      if (!viewer?.id) {
        openActionErrorDialog(
          "Connecte-toi pour révéler",
          "Dépose d’abord une chanson pour commencer à cumuler des points et révéler des morceaux."
        );
        return;
      }

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
        if (payload?.code === "INSUFFICIENT_POINTS") {
          openActionErrorDialog("Pas assez de points", payload?.detail || "Tu n’as pas assez de points pour effectuer cette action.");
        } else if (payload?.detail) {
          openActionErrorDialog("Impossible de révéler la chanson", payload.detail);
        } else {
          openActionErrorDialog("Erreur", "Oops, une erreur s’est produite. Réessaie dans quelques instants.");
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
      openActionErrorDialog("Erreur", "Oops, une erreur s’est produite. Réessaie dans quelques instants.");
    } finally {
      return didReveal;
    }
  }, [context, localDep.public_key, openActionErrorDialog, setUser, updateDepositCollections, updateStorageSnapshot, viewer?.id]);

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
    const safeComments = nextComments || { items: [], count: 0, viewer_state: {} };
    setLocalDep((prev) => ({ ...(prev || {}), comments: safeComments }));
    updateDepositCollections((item) => ({ ...(item || {}), comments: safeComments }));
  };

  useEffect(() => {
    if (!reactionsDrawerParamValue) {
      setReactionSummaryOpen(false);
      return;
    }

    const shouldOpenReactions = matchesDrawerSearch(location, "reactions", reactionsDrawerParamValue);
    setReactionSummaryOpen((prev) => (prev === shouldOpenReactions ? prev : shouldOpenReactions));
  }, [location, reactionsDrawerParamValue]);

  const toggleCommentsInline = useCallback((event) => {
    event?.stopPropagation?.();
    if (!isRevealed) {
      openActionErrorDialog("Réponses indisponibles", "Révèle la chanson pour voir les réponses", event);
      return;
    }
    setCommentsOpen((prev) => !prev);
  }, [isRevealed, openActionErrorDialog]);

  const openReactionSummaryDrawer = useCallback((event) => {
    event?.stopPropagation?.();
    if (!reactionsDrawerParamValue) {return;}
    blurEventTarget(event);
    blurActiveElement();

    openDrawerWithHistory({
      navigate,
      location,
      param: "reactions",
      value: reactionsDrawerParamValue,
    });
  }, [location, navigate, reactionsDrawerParamValue]);

  const closeReactionSummaryDrawer = useCallback((options = {}) => {
    if (
      !closeDrawerWithHistory({
        navigate,
        location,
        param: "reactions",
        value: reactionsDrawerParamValue,
        replace: Boolean(options?.replace),
      })
    ) {
      setReactionSummaryOpen(false);
    }
  }, [location, navigate, reactionsDrawerParamValue]);

  useEffect(() => {
    if (!viewer?.id || viewer?.is_guest || !localDep?.public_key) {return;}

    const currentPath = buildRelativeLocation(location);
    const commentAction = consumeAuthAction({
      currentPath,
      actionType: "comments",
      matcher: (payload) => payload?.depPublicKey === localDep.public_key,
    });

    if (commentAction) {
      if (isRevealed) {
        blurActiveElement();
        setCommentsOpen(true);
      } else {
        openActionErrorDialog("Réponses indisponibles", "Révèle la chanson pour voir les réponses");
      }
      return;
    }

    const reactionAction = consumeAuthAction({
      currentPath,
      actionType: "reactions",
      matcher: (payload) => payload?.depPublicKey === localDep.public_key,
    });

    if (reactionAction) {
      blurActiveElement();
      setAddReactionOpen(true);
    }
  }, [viewer?.id, viewer?.is_guest, localDep?.public_key, location, isRevealed, openActionErrorDialog]);

  const showShareFeedback = useCallback((message) => {
    setShareSnack({ open: true, message });
  }, []);

  const handleShareDeposit = useCallback(async (event) => {
    event?.stopPropagation?.();

    if (isSharing) {
      return;
    }

    if (!viewer?.id) {
      blurEventTarget(event);
      blurActiveElement();
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
      return;
    }

    setIsSharing(true);

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
        openActionErrorDialog("Impossible de créer le lien", "Impossible de créer le lien de partage.");
        return;
      }

      const shareUrl = payload?.url;
      if (!shareUrl) {
        openActionErrorDialog("Impossible de créer le lien", "Impossible de créer le lien de partage.");
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
      openActionErrorDialog("Impossible de créer le lien", "Impossible de créer le lien de partage.");
    } finally {
      setIsSharing(false);
    }
  }, [
    isSharing,
    viewer?.id,
    isRevealed,
    localDep?.public_key,
    openActionErrorDialog,
    resolvedShareBoxName,
    showShareFeedback,
    song?.artist,
    song?.title,
  ]);

  const depositInfosBlock = showUser ? (
    <Box className="deposit_infos">
      <DepositUser
        user={user}
        userPrefix={userPrefix}
      />
    </Box>
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
                blurEventTarget(event);
                blurActiveElement();
                setReactionRevealPromptOpen(true);
                return;
              }
              if (!viewer?.id) {
                blurEventTarget(event);
                blurActiveElement();
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
              blurEventTarget(event);
              blurActiveElement();
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
              onClick={openReactionSummaryDrawer}
            >
              {`x${reactionCount}`}
            </Button>
          ) : null}
        </Box>
  
        {showCommentAction ? (
          <Button
            variant="depositInteract"
            className="deposit_action_button comments_button"
            onClick={toggleCommentsInline}
            startIcon={<ModeCommentOutlinedIcon />}
            endIcon={
              <ArrowDropDownIcon
                sx={{
                  transform: commentsOpen ? "rotate(180deg)" : "rotate(0deg)",
                  transition: "transform 120ms ease",
                }}
              />
            }
          >
            {commentsCount > 0 ? `x${commentsCount}` : ""}
          </Button>
        ) : null}
      </Box>
      <Box className="right">
        <DepositLink canShare={canShare} isSharing={isSharing} onShare={handleShareDeposit} />
      </Box>
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
        <Card className="deposit_card">
          {depositInfosBlock}

          <DepositSong
            variant={variant}
            song={song}
            accentColor={accentColor}
            isRevealed={isRevealed}
            floatingEmojiItems={floatingEmojiItems}
            onFloatingReactionClick={openReactionSummaryDrawer}
            onRevealRequest={revealDeposit}
            onSongResolved={handleSongResolved}
            revealCost={revealCost}
          />

          {footerSlot}
          {depositInteractBlock}
        </Card>
        {showCommentAction ? (
          <DepositComments
            open={commentsOpen}
            depPublicKey={localDep?.public_key}
            comments={comments}
            viewer={viewer}
            onCommentsChange={handleCommentsChange}
            isParentRevealed={isRevealed}
            DepositComponent={Deposit}
          />
        ) : null}
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
            blurActiveElement();
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

      <DepositReactions
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
        onClose={closeReactionSummaryDrawer}
        depPublicKey={localDep?.public_key}
        reactions={reactionsDetail}
        viewer={viewer}
        onApplied={handleReactionApplied}
      />

      <Dialog
        open={actionErrorDialog.open}
        onClose={() => setActionErrorDialog({ open: false, title: "Erreur", message: "" })}
      >
        <DialogTitle>{actionErrorDialog.title}</DialogTitle>
        <DialogContent>
          <Alert severity="error">{actionErrorDialog.message}</Alert>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setActionErrorDialog({ open: false, title: "Erreur", message: "" })}>Fermer</Button>
        </DialogActions>
      </Dialog>

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
