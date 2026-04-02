import React, { useState, useContext, useMemo, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";

import Box from "@mui/material/Box";
import Card from "@mui/material/Card";
import Typography from "@mui/material/Typography";
import Button from "@mui/material/Button";
import Avatar from "@mui/material/Avatar";
import Snackbar from "@mui/material/Snackbar";
import SnackbarContent from "@mui/material/SnackbarContent";
import Slide from "@mui/material/Slide";
import LibraryMusicIcon from "@mui/icons-material/LibraryMusic";
import PlayArrowIcon from "@mui/icons-material/PlayArrow";
import ArrowForwardIosIcon from "@mui/icons-material/ArrowForwardIos";
import MusicNote from "@mui/icons-material/MusicNote";
import AddReactionOutlinedIcon from "@mui/icons-material/AddReactionOutlined";
import ModeCommentOutlinedIcon from "@mui/icons-material/ModeCommentOutlined";

import PlayModal from "../Common/PlayModal";
import { getCookie } from "../Security/TokensUtils";
import { UserContext } from "../UserContext";
import AddReactionModal from "../Reactions/AddReactionModal";
import ReactionSummary from "../Reactions/ReactionSummary";
import CommentsDrawer from "../Comments/CommentsDrawer";
import { getValid, setWithTTL } from "../Utils/mmStorage";
import { formatRelativeTime } from "../Utils/time";

function SlideDownTransition(props) {
  return <Slide {...props} direction="down" />;
}

const KEY_BOX_CONTENT = "mm_box_content";
const TTL_MINUTES = 20;

function upsertViewerReactionInList(reactions, nextEmoji, viewer) {
  const list = Array.isArray(reactions) ? [...reactions] : [];
  const viewerId = viewer?.id || null;

  if (!viewerId) return list;

  const withoutMine = list.filter((r) => (r?.user?.id || null) !== viewerId);

  if (!nextEmoji) {
    return withoutMine;
  }

  const myReaction = {
    emoji: nextEmoji,
    user: {
      id: viewerId,
      name: viewer?.display_name || viewer?.username || "Invité",
      display_name: viewer?.display_name || viewer?.username || "Invité",
      username: viewer?.is_guest ? null : viewer?.username || null,
      profile_picture_url: viewer?.profile_picture_url || null,
      is_guest: Boolean(viewer?.is_guest),
    },
  };

  return [myReaction, ...withoutMine];
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

    return {
      ...item,
      left: (cell.col/* + 0.5*/) * cellWidth + jitterX,
      top: (cell.row/* + 0.5*/) * cellHeight + jitterY,
      fontSize: `${randomBetween(1.1, 1.75).toFixed(2)}rem`,
      zIndex: Math.floor(randomBetween(1, 5)),
      opacity: randomBetween(0.92, 1).toFixed(2),
      floatDuration: `${randomBetween(4.8, 8.2).toFixed(2)}s`,
      floatDelay: `${randomBetween(-0, -1.8).toFixed(2)}s`,
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
  user,
  setDispDeposits,
  cost = 40,
  variant = "list",
  showDate = true,
  showUser = true,
  fitContainer = true,
  allowReact = true,
  showPlay = true,
}) {
  const navigate = useNavigate();
  const { setUser } = useContext(UserContext) || {};

  const [localDep, setLocalDep] = useState(dep || {});
  useEffect(() => {
    setLocalDep(dep || {});
  }, [dep]);

  const s = localDep?.song || {};
  const u = localDep?.user || {};
  const comments = localDep?.comments || { items: [], viewer_state: {} };

  const isRevealed = useMemo(
    () => Boolean(s?.title && s?.artist),
    [s?.title, s?.artist]
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

  const updateDepositCollections = useCallback((transform) => {
    setDispDeposits?.((prev) => {
      const arr = Array.isArray(prev) ? [...prev] : [];
      return arr.map((item) => {
        if (!item || item.public_key !== localDep?.public_key) return item;
        return transform(item);
      });
    });
  }, [localDep?.public_key, setDispDeposits]);

  const updateLocalStorageSnapshot = (revealedSong) => {
    try {
      const snap = getValid(KEY_BOX_CONTENT);
      if (!snap) return;

      let changed = false;
      const next = { ...snap };
      const isoNow = new Date().toISOString();

      if (Array.isArray(snap.olderDeposits)) {
        next.olderDeposits = snap.olderDeposits.map((d) => {
          if (!d || d.public_key !== localDep.public_key) return d;

          changed = true;
          return {
            ...d,
            discovered_at: isoNow,
            song: {
              ...(d.song || {}),
              title: revealedSong.title,
              artist: revealedSong.artist,
              spotify_url: revealedSong.spotify_url,
              deezer_url: revealedSong.deezer_url,
              image_url: revealedSong.image_url || d.song?.image_url,
            },
          };
        });
      }

      if (!changed) return;

      next.timestamp = Date.now();
      setWithTTL(KEY_BOX_CONTENT, next, TTL_MINUTES);
    } catch (error) {}
  };

  const openPlayFor = (song) => {
    setPlaySong(song || null);
    setPlayOpen(true);
  };

  const closePlay = () => {
    setPlayOpen(false);
    setPlaySong(null);
  };

  const revealDeposit = async () => {
    try {
      if (!user?.id) {
        window.alert(
          "Dépose d’abord une chanson pour commencer à cumuler des points et révéler des morceaux."
        );
        return;
      }

      const csrftoken = getCookie("csrftoken");
      const res = await fetch("/box-management/revealSong", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-CSRFToken": csrftoken,
        },
        body: JSON.stringify({ dep_public_key: localDep.public_key }),
        credentials: "same-origin",
      });

      const payload = await res.json().catch(() => ({}));

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

      setLocalDep((prev) => ({
        ...(prev || {}),
        discovered_at: isoNow,
        song: {
          ...(prev?.song || {}),
          title: revealed.title,
          artist: revealed.artist,
          spotify_url: revealed.spotify_url,
          deezer_url: revealed.deezer_url,
          image_url: revealed.image_url || prev?.song?.image_url,
        },
      }));

      updateDepositCollections((item) => ({
        ...item,
        discovered_at: isoNow,
        song: {
          ...(item?.song || {}),
          title: revealed.title,
          artist: revealed.artist,
          spotify_url: revealed.spotify_url,
          deezer_url: revealed.deezer_url,
          image_url: revealed.image_url || item?.song?.image_url,
        },
      }));

      updateLocalStorageSnapshot(revealed);

      if (typeof payload?.points_balance === "number" && setUser) {
        setUser((prev) => ({ ...(prev || {}), points: payload.points_balance }));
      }

      setSnackOpen((prev) => !prev);
    } catch {
      alert("Oops une erreur s’est produite, réessaie dans quelques instants.");
    }
  };

  const handleReactionApplied = (result) => {
    const nextReactions = upsertViewerReactionInList(
      localDep?.reactions || [],
      result?.my_reaction?.emoji || null,
      user
    );

    const nextComments = Array.isArray(result?.comments?.items)
      ? result.comments
      : comments;

    setLocalDep((prev) => ({
      ...(prev || {}),
      my_reaction: result?.my_reaction || null,
      reactions_summary: Array.isArray(result?.reactions_summary)
        ? result.reactions_summary
        : [],
      reactions: nextReactions,
      comments: nextComments,
    }));

    updateDepositCollections((item) => ({
      ...item,
      my_reaction: result?.my_reaction || null,
      reactions_summary: Array.isArray(result?.reactions_summary)
        ? result.reactions_summary
        : [],
      reactions: nextReactions,
      comments: nextComments,
    }));
  };

  const handleCommentsChange = (nextComments) => {
    const safeComments = nextComments || { items: [], viewer_state: {} };
    setLocalDep((prev) => ({ ...(prev || {}), comments: safeComments }));
    updateDepositCollections((item) => ({ ...(item || {}), comments: safeComments }));
  };

  const renderDepositUser = (userObj) => {
    const canNavigate = Boolean(userObj?.username && !userObj?.is_guest);

    return (
      <Box
        onClick={() => {
          if (canNavigate) navigate("/profile/" + userObj.username);
        }}
        className={canNavigate ? "hasUsername deposit_user" : "deposit_user"}
      >
        <Typography variant="body1" component="span">
          Partagée par
        </Typography>
        <Box className="avatarbox">
          <Avatar
            src={userObj?.profile_picture_url || undefined}
            alt={userObj?.display_name || "anonyme"}
            className="avatar"
          />
        </Box>
        <Typography component="span" className="username" variant="subtitle1">
          {userObj?.display_name || "anonyme"}
          {canNavigate ? (
            <ArrowForwardIosIcon className="icon" sx={{ height: "0.8em", width: "0.8em" }} />
          ) : null}
        </Typography>
      </Box>
    );
  };

  const depositInfosBlock = showUser ? (
    <Box className="deposit_infos">{renderDepositUser(u)}</Box>
  ) : null;

  const depositInteractBlock = (
    <Box className="deposit_interact">
      {allowReact ? (
        <Box className="deposit_action_group reactions_group">
          <Button
            variant="depositInteract"
            className="deposit_action_button addreaction_button addreaction_icon_button"
            onClick={(event) => {
              event.stopPropagation();
              if (!isRevealed) {
                window.alert("Écoute la chanson avant de réagir");
                return;
              }
              if (!user?.id) {
                window.alert("Dépose d’abord une chanson pour pouvoir réagir.");
                return;
              }
              setAddReactionOpen(true);
            }}
          >
            <AddReactionOutlinedIcon />
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
      ) : null}

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
  );

  const renderFloatingReactions = () => {
    if (!floatingEmojiItems.length) return null;

    return (
      <Box className="emojis">
        {floatingEmojiItems.map((item) => (
          <Typography
            key={item.key}
            className="emoji"
            component="span"
            role="button"
            tabIndex={0}
            sx={{
              left: `${item.left}%`,
              top: `${item.top}%`,
              fontSize: item.fontSize,
              zIndex: item.zIndex,
              opacity: item.opacity,
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
          >
            {item.emoji}
          </Typography>
        ))}
      </Box>
    );
  };

  const renderCoverMedia = (blurred = false) => (
    <Box className="cover_media">
      <Box className="img_container">
        {s?.image_url ? (
          <Box
            component="img"
            src={s.image_url}
            alt={isRevealed ? `${s.title} - ${s.artist}` : "Cover"}
            sx={{ filter: blurred ? "blur(6px)" : "none" }}
          />
        ) : null}
      </Box>
      {renderFloatingReactions()}
    </Box>
  );

  if (variant === "main") {
    return (
      <>
        <Box className="deposit_container">
          {showDate ? (
            <Typography className="deposit_date" variant="subtitle1" component="span">
              {"Chanson partagée " + (naturalDate || "")}
            </Typography>
          ) : null}
          <Card className="deposit deposit_main">
            {depositInfosBlock}

            <Box className="deposit_song">
              {renderCoverMedia(false)}

              <Box className="interact">
                <Box className="texts">
                  <Typography component="span" className="titre" variant="h4">
                    {s.title}
                  </Typography>
                  <Typography component="span" className="artist" variant="body1">
                    {s.artist}
                  </Typography>
                </Box>

                <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap" }}>
                  <Button
                    variant="depositInteract"
                    className="play playMain"
                    size="large"
                    onClick={() => openPlayFor(s)}
                    startIcon={<PlayArrowIcon />}
                  >
                    Écouter la chanson
                  </Button>
                </Box>
              </Box>
            </Box>

            {depositInteractBlock}
          </Card>
        </Box>

        <AddReactionModal
          open={addReactionOpen}
          onClose={() => setAddReactionOpen(false)}
          depPublicKey={localDep?.public_key}
          currentEmoji={myReactionEmoji}
          onApplied={handleReactionApplied}
          setUser={setUser}
          viewer={user}
        />

        <ReactionSummary
          open={reactionSummaryOpen}
          onClose={() => setReactionSummaryOpen(false)}
          depPublicKey={localDep?.public_key}
          reactions={reactionsDetail}
          viewer={user}
          onApplied={handleReactionApplied}
        />

        <CommentsDrawer
          open={commentsOpen}
          onClose={() => setCommentsOpen(false)}
          depPublicKey={localDep?.public_key}
          comments={comments}
          viewer={user}
          onCommentsChange={handleCommentsChange}
        />

        <PlayModal open={playOpen} song={playSong} onClose={closePlay} />
      </>
    );
  }

  return (
    <>
      <Box className="deposit_container">
        {showDate ? (
          <Typography className="deposit_date" variant="subtitle1" component="span">
            {naturalDate || ""}
          </Typography>
        ) : null}
        <Card className="deposit deposit_list">
          {depositInfosBlock}

          <Box className="deposit_song">
            {renderCoverMedia(!isRevealed)}

            <Box className="interact">
              {isRevealed ? (
                <>
                  <Box className="texts">
                    <Typography component="span" className="titre" variant="h5">
                      {s.title}
                    </Typography>
                    <Typography component="span" className="artist" variant="body1">
                      {s.artist}
                    </Typography>
                  </Box>

                  {showPlay ? (
                    <Button
                      variant="depositInteract"
                      className="play playSecondary"
                      size="large"
                      onClick={() => openPlayFor(s)}
                      startIcon={<PlayArrowIcon />}
                    >
                      Écouter
                    </Button>
                  ) : null}
                </>
              ) : (
                <>
                  <Box className="texts">
                    <Typography component="span" className="titre" variant="body1">
                      Utilise tes points pour révéler cette chanson
                    </Typography>
                  </Box>
                  <Button variant="depositInteract" onClick={revealDeposit} className="decouvrir">
                    Découvrir
                    <Box className="points_container" sx={{ ml: "12px" }}>
                      <Typography variant="body1" component="span" sx={{ color: "text.primary" }}>
                        {cost}
                      </Typography>
                      <MusicNote />
                    </Box>
                  </Button>
                </>
              )}
            </Box>
          </Box>

          {depositInteractBlock}
        </Card>
      </Box>

      <PlayModal open={playOpen} song={playSong} onClose={closePlay} />

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
                navigate("/profile");
              }}
            >
              Voir
            </Button>
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
        viewer={user}
      />

      <ReactionSummary
        open={reactionSummaryOpen}
        onClose={() => setReactionSummaryOpen(false)}
        depPublicKey={localDep?.public_key}
        reactions={reactionsDetail}
        viewer={user}
        onApplied={handleReactionApplied}
      />

      <CommentsDrawer
        open={commentsOpen}
        onClose={() => setCommentsOpen(false)}
        depPublicKey={localDep?.public_key}
        comments={comments}
        viewer={user}
        onCommentsChange={handleCommentsChange}
      />
    </>
  );
}
